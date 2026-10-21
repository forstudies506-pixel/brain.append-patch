/* BRAIN.append data layer for the static (Vercel) version.
   Same rules as the Flask backend, but the data lives in the visitor's browser (localStorage). */
(function (root) {
  'use strict';
  var KEY = 'brain.append.v2', DAY = /^\d{4}-\d{2}-\d{2}$/, TIME = /^([01]\d|2[0-3]):[0-5]\d$/, MAX_SESSIONS = 5000, DAY_MS = 86400000;

  function ApiError(msg) { var e = new Error(msg); e.name = 'ApiError'; return e; }
  function pad(n) { return String(n).padStart(2, '0'); }
  function iso(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function dayMs(s) {
    if (!DAY.test(s || '')) throw ApiError('Dates must look like YYYY-MM-DD');
    var p = s.split('-').map(Number), ms = Date.UTC(p[0], p[1] - 1, p[2]);
    if (iso(ms) !== s) throw ApiError('Dates must look like YYYY-MM-DD');
    return ms;
  }
  function subjectOf(v) {
    v = typeof v === 'string' ? v.trim() : '';
    if (!v || v.length > 60) throw ApiError('Subject is required (max 60 characters)');
    return v;
  }
  function minutesOf(v) {
    var n = (typeof v === 'number' || (typeof v === 'string' && /^\s*-?\d+\s*$/.test(v))) ? Number(v) : NaN;
    if (!Number.isInteger(n)) throw ApiError('Minutes must be a whole number');
    if (n < 1 || n > 1440) throw ApiError('Minutes must be between 1 and 1440');
    return n;
  }
  function weekStart(ms) { return ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY_MS; }   // weeks run Monday to Sunday

  /* A day counts if you studied. A freeze day keeps a streak alive without adding to it. Today never breaks a streak. */
  function computeStreaks(studied, frozen, today) {
    var days = Object.keys(studied).concat(Object.keys(frozen)).sort();
    if (!days.length) return { current: 0, longest: 0, shortest: 0 };
    var run = 0, runs = [], end = dayMs(today);
    for (var ms = dayMs(days[0]); ms <= end; ms += DAY_MS) {
      var k = iso(ms);
      if (studied[k]) run++;
      else if (frozen[k]) { /* rest day: streak continues */ }
      else if (k !== today) { if (run) runs.push(run); run = 0; }
    }
    var all = run ? runs.concat(run) : runs;
    return { current: run, longest: all.length ? Math.max.apply(null, all) : 0, shortest: all.length ? Math.min.apply(null, all) : 0 };
  }

  function create(opts) {
    opts = opts || {};
    var storage = opts.storage || null, now = opts.now || Date.now, memory = null, persistent = true;
    var tzOffset = function () { return typeof opts.tz === 'number' ? opts.tz : new Date(now()).getTimezoneOffset(); };   // JS getTimezoneOffset()
    var localToday = function () { return iso(now() - tzOffset() * 60000); };

    function blank() { return { sessions: [], nextId: 1, active: null, freezes: [] }; }
    function load() {
      if (storage) {
        try {
          var raw = storage.getItem(KEY);
          if (raw) { var s = JSON.parse(raw); if (s && Array.isArray(s.sessions) && Array.isArray(s.freezes)) return s; }
          else if (memory) return memory;
          return blank();
        } catch (e) { persistent = false; }
      }
      return memory || (memory = blank());
    }
    function save(s) {
      memory = s;
      if (!storage) { persistent = false; return; }
      try { storage.setItem(KEY, JSON.stringify(s)); persistent = true; } catch (e) { persistent = false; }
    }
    function sorted(s) {
      return s.sessions.slice().sort(function (a, b) {
        return (b.date + b.start).localeCompare(a.date + a.start) || b.id - a.id;
      });
    }
    function freezeInfo(s, day) {
      var ws = weekStart(dayMs(day)), used = null;
      s.freezes.forEach(function (f) { var m = dayMs(f); if (m >= ws && m <= ws + 6 * DAY_MS) used = f; });
      return { used_on: used, available: used === null, week_start: iso(ws) };
    }
    function query(qs) {
      var o = {}; (qs || '').split('&').forEach(function (p) { if (p) { var kv = p.split('='); o[decodeURIComponent(kv[0])] = decodeURIComponent(kv[1] || ''); } });
      return o;
    }

    var routes = {
      'GET /active': function (s) {
        return { active: s.active ? { subject: s.active.subject, start_ms: s.active.start_ms } : null, now_ms: now() };
      },
      'POST /checkin': function (s, q, b) {
        var subject = subjectOf((b || {}).subject), tz = parseInt((b || {}).tz, 10);
        if (s.active) throw ApiError('You are already checked in. Check out first.');
        s.active = { subject: subject, start_ms: now(), tz: isNaN(tz) ? 0 : Math.max(-840, Math.min(840, tz)) };
        save(s); return { active: { subject: subject, start_ms: s.active.start_ms } };
      },
      'POST /checkout': function (s) {
        var a = s.active;
        if (!a) throw ApiError('You are not checked in.');
        if (s.sessions.length >= MAX_SESSIONS) throw ApiError('Session limit reached. Delete some old sessions first.');
        var minutes = Math.min(1440, Math.max(1, Math.round((now() - a.start_ms) / 60000)));
        var local = a.start_ms - a.tz * 60000, d = new Date(local);
        var sess = { id: s.nextId++, subject: a.subject, date: iso(local), start: pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()), minutes: minutes };
        s.sessions.push(sess); s.active = null; save(s); return { session: sess };
      },
      'GET /sessions': function (s) { return { sessions: sorted(s) }; },
      'GET /stats': function (s, q) {
        var today = q.today || localToday(); dayMs(today);
        var studied = {}, frozen = {}, total = 0;
        s.sessions.forEach(function (x) { studied[x.date] = 1; total += x.minutes; });
        s.freezes.forEach(function (f) { frozen[f] = 1; });
        return { total_minutes: total, session_count: s.sessions.length, streaks: computeStreaks(studied, frozen, today), freeze: freezeInfo(s, today) };
      },
      'POST /freeze': function (s, q, b) {
        var day = (b || {}).date || localToday(), ms = dayMs(day);
        if (Math.abs(ms - dayMs(localToday())) > DAY_MS) throw ApiError('A freeze day can only be used for today.');
        if (!freezeInfo(s, day).available) throw ApiError("You already used this week's freeze day.");
        s.freezes.push(day); save(s); return { freeze: freezeInfo(s, day) };
      },
      'GET /chart': function (s, q) {
        var n = parseInt(q.days || '7', 10);
        if ([7, 14, 30].indexOf(n) < 0) throw ApiError('days must be 7, 14 or 30');
        var today = q.today || localToday(), end = dayMs(today), by = {}, days = [], total = 0;
        s.sessions.forEach(function (x) { by[x.date] = (by[x.date] || 0) + x.minutes; });
        for (var i = n - 1; i >= 0; i--) { var k = iso(end - i * DAY_MS), m = by[k] || 0; days.push({ date: k, minutes: m }); total += m; }
        return { days: days, total: total };
      },
      'GET /subjects': function (s) {
        var g = {}, total = 0;
        s.sessions.forEach(function (x) {
          var key = x.subject.toLowerCase(), e = g[key] || (g[key] = { subject: x.subject, minutes: 0, sessions: 0 });
          if (x.subject < e.subject) e.subject = x.subject;
          e.minutes += x.minutes; e.sessions++; total += x.minutes;
        });
        var list = Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.minutes - a.minutes; });
        list.forEach(function (e) { e.percent = Math.round(100 * e.minutes / (total || 1)); });
        return { subjects: list };
      }
    };

    function call(method, path, body) {
      return new Promise(function (resolve, reject) {
        try {
          var parts = path.split('?'), p = parts[0], m;
          var s = load();
          if ((m = /^\/sessions\/(\d+)$/.exec(p)) && (method === 'PUT' || method === 'DELETE')) {
            var id = Number(m[1]), i = s.sessions.findIndex(function (x) { return x.id === id; });
            if (i < 0) throw ApiError('Session not found');
            if (method === 'DELETE') { s.sessions.splice(i, 1); save(s); return resolve({ deleted: id }); }
            var b = body || {}, subject = subjectOf(b.subject); dayMs(b.date);
            if (!TIME.test(b.start || '')) throw ApiError('Start time must look like HH:MM');
            s.sessions[i] = { id: id, subject: subject, date: b.date, start: b.start, minutes: minutesOf(b.minutes) };
            save(s); return resolve({ session: s.sessions[i] });
          }
          var fn = routes[method + ' ' + p];
          if (!fn) throw ApiError('Not found');
          resolve(JSON.parse(JSON.stringify(fn(s, query(parts[1]), body))));
        } catch (e) { reject(e); }
      });
    }
    function csv() {
      var s = load(), q = function (v) { v = String(v); return /[",\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var safe = function (v) { v = String(v); return /^[=+\-@]/.test(v) ? "'" + v : v; };   // defuse spreadsheet formulas
      var rows = [['Date', 'Start time', 'Subject', 'Minutes']].concat(sorted(s).map(function (x) { return [x.date, x.start, safe(x.subject), x.minutes]; }));
      return rows.map(function (r) { return r.map(q).join(','); }).join('\r\n') + '\r\n';
    }
    return { call: call, csv: csv, persistent: function () { return persistent; } };
  }

  var store = null; try { store = root.localStorage || null; } catch (e) { store = null; }
  var api = create({ storage: store });
  api.create = create; api.computeStreaks = computeStreaks;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LocalAPI = api;
})(typeof window !== 'undefined' ? window : globalThis);
