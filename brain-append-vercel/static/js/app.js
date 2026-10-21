var FRAMES=["/static/frames/f00.jpg", "/static/frames/f01.jpg", "/static/frames/f02.jpg", "/static/frames/f03.jpg", "/static/frames/f04.jpg", "/static/frames/f05.jpg", "/static/frames/f06.jpg", "/static/frames/f07.jpg", "/static/frames/f08.jpg", "/static/frames/f09.jpg", "/static/frames/f10.jpg", "/static/frames/f11.jpg", "/static/frames/f12.jpg", "/static/frames/f13.jpg", "/static/frames/f14.jpg", "/static/frames/f15.jpg", "/static/frames/f16.jpg", "/static/frames/f17.jpg", "/static/frames/f18.jpg", "/static/frames/f19.jpg", "/static/frames/f20.jpg", "/static/frames/f21.jpg", "/static/frames/f22.jpg", "/static/frames/f23.jpg", "/static/frames/f24.jpg", "/static/frames/f25.jpg", "/static/frames/f26.jpg", "/static/frames/f27.jpg", "/static/frames/f28.jpg", "/static/frames/f29.jpg", "/static/frames/f30.jpg", "/static/frames/f31.jpg", "/static/frames/f32.jpg", "/static/frames/f33.jpg", "/static/frames/f34.jpg", "/static/frames/f35.jpg", "/static/frames/f36.jpg"];
(function(){
var $=function(s){return document.querySelector(s)},$$=function(s){return Array.prototype.slice.call(document.querySelectorAll(s))};
var pad=function(n){return String(n).padStart(2,'0')},dkey=function(d){return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())};
var fmt=function(m){return m<60?m+' min':Math.floor(m/60)+'h '+pad(m%60)+'m'};
var esc=function(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
/* ---------- cover ---------- */
var nm='BRAIN.append',h=$('#name');
nm.split('').forEach(function(c,i){var s=document.createElement('span');s.className='l';s.style.setProperty('--i',i);s.setAttribute('aria-hidden','true');s.textContent=c;h.appendChild(s)});
function fit(){var s=parseFloat(getComputedStyle(h).fontSize)||100;h.style.fontSize=s+'px';var w=h.scrollWidth,t=$('#fit').clientWidth;if(w>0)h.style.fontSize=(s*t/w)+'px'}
fit();addEventListener('resize',fit);if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fit);
var words=['Check in','Study','Keep the streak','Freeze a day','Export your sessions','See the chart'],tk='';
for(var k=0;k<4;k++)words.forEach(function(w){tk+='<span>'+w+'</span><i></i>'});$('#track').innerHTML=tk;
/* creature: front pose at rest, turns toward the cursor (frames run front -> head turned left; right side is mirrored) */
var coverEl=$('#cover'),cv=$('#cv'),ctx=cv.getContext('2d'),fig=$('#fig'),imgs=[],N=FRAMES.length,shown=-1,dir=0,fr=0;
function draw(p,d){var i=Math.min(N-2,Math.floor(p)),f=p-i;if(i===shown&&Math.abs(f-fr)<.02&&d===dir)return;var a=imgs[i],b=imgs[i+1];if(!a||!b||!a.naturalWidth||!b.naturalWidth)return;shown=i;fr=f;dir=d;
  ctx.save();ctx.clearRect(0,0,cv.width,cv.height);if(d>0){ctx.translate(cv.width,0);ctx.scale(-1,1)}ctx.drawImage(a,0,0,cv.width,cv.height);ctx.globalAlpha=f;ctx.drawImage(b,0,0,cv.width,cv.height);ctx.restore()}
FRAMES.forEach(function(b,i){var im=new Image();im.onload=function(){if(i<2)draw(0,-1)};im.src=b;imgs.push(im)});
var tx=0,ty=0,cx=0,cy=0;
function aim(x,y){var r=fig.getBoundingClientRect(),ox=r.left+r.width/2,oy=r.top+r.height*.3;tx=Math.max(-1,Math.min(1,(x-ox)/(innerWidth*.34)));ty=Math.max(-1,Math.min(1,(y-oy)/(innerHeight*.5)))}
addEventListener('pointermove',function(e){aim(e.clientX,e.clientY)});
document.documentElement.addEventListener('pointerleave',function(){tx=0;ty=0});addEventListener('blur',function(){tx=0;ty=0});
(function tick(){if(!coverEl.hidden){var k=reduce?1:.09;cx+=(tx-cx)*k;cy+=(ty-cy)*k;var a=Math.abs(cx);
  draw(a*(N-1),cx>0?1:-1);cv.style.transform='rotateX('+(cy*-4)+'deg) translateY('+(cy*6)+'px)'}requestAnimationFrame(tick)})();
/* ---------- curtain between cover and room ---------- */
var curtain=$('#curtain'),ctext=$('#ctext'),tabEl=$('#tab'),busy=false;
/* covers the screen, runs mid() while it is covered, then lifts away. With a tab label the mascot pulls that tab. */
function curtainRun(text,tab,mid){if(busy)return Promise.resolve();busy=true;curtain.classList.remove('in','out');void curtain.offsetWidth;
  curtain.classList.toggle('mascot',!!tab);ctext.textContent=text;if(tab)tabEl.textContent=tab;curtain.classList.add('in');
  return new Promise(function(done){setTimeout(async function(){try{await mid()}catch(e){}curtain.classList.replace('in','out');
    setTimeout(function(){curtain.classList.remove('out','mascot');busy=false;done()},700)},tab?1150:720)})}
function swap(toRoom,view){curtainRun(toRoom?'Your room':'BRAIN.append®',null,function(){$('#cover').hidden=toRoom;$('#room').hidden=!toRoom;if(toRoom)show(view||cur);else{shown=-1;fit()}})}
$('#enter').onclick=function(){swap(true,'today')};$('#home').onclick=function(){swap(false)};
$$('[data-go]').forEach(function(b){b.onclick=function(){swap(true,b.dataset.go)}});
/* ---------- API client (all data lives in the server database) ---------- */
var TZ=new Date().getTimezoneOffset(),skew=0,D={sessions:[],active:null,stats:{total_minutes:0,session_count:0,streaks:{current:0,longest:0,shortest:0},freeze:{used_on:null,available:true}}};
var todayKey=function(){return dkey(new Date())};
var warned=false;
async function api(p,o){o=o||{};var r=await LocalAPI.call(o.method||'GET',p,o.body);
  if(o.method&&o.method!=='GET'&&!LocalAPI.persistent()&&!warned){warned=true;toast('Your browser is blocking storage. Sessions will be lost when you close this tab.')}return r}
function fail(e){toast(e&&e.message?e.message:'Something went wrong')}
async function refresh(){try{var r=await Promise.all([api('/stats?today='+todayKey()),api('/active'),api('/sessions')]);D.stats=r[0];D.active=r[1].active;skew=r[1].now_ms-Date.now();D.sessions=r[2].sessions}catch(e){fail(e)}renderAll()}
function toast(t){var e=$('#toast');e.textContent=t;e.className='on';clearTimeout(toast.t);toast.t=setTimeout(function(){e.className=''},2600)}
function arm(b,label,fn){if(b.dataset.armed){clearTimeout(b._t);b.dataset.armed='';fn();return}b.dataset.armed='1';var old=b.textContent;b.textContent=label;b.classList.add('arm');
  b._t=setTimeout(function(){b.dataset.armed='';b.textContent=old;b.classList.remove('arm')},3000)}
function count(el,v,f){if(reduce){el.textContent=f(v);return}var t0=performance.now();(function s(t){var p=Math.min(1,(t-t0)/800),e=1-Math.pow(1-p,3);el.textContent=f(Math.round(v*e));if(p<1)requestAnimationFrame(s)})(t0)}
/* ---------- views ---------- */
var cur='today',V=$('#views');
function show(v){if(v==='chart'){openWin();return}cur=v;$$('#tabs button').forEach(function(b){b.classList.toggle('on',b.dataset.v===v)});refresh()}
$$('#tabs button').forEach(function(b){b.onclick=function(){show(b.dataset.v)}});
function renderAll(){if($('#room').hidden)return;({today:today,sessions:sessions,subjects:subjects})[cur]()}
function longDate(){return new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
function today(){var a=D.active,st=D.stats.streaks,fz=D.stats.freeze,subs=Object.keys(D.sessions.reduce(function(o,s){o[s.subject]=1;return o},{}));
  V.innerHTML='<div class="view tdy"><h2>'+(a?'Studying.':'Check in.')+'</h2><p class="lede">Start a session when you sit down. Minutes are counted from the moment you check in.</p><div class="grid">'+
  '<div class="card dark c7"><span class="peek" aria-hidden="true"><span class="mas"></span></span><div class="date">'+longDate()+'</div><div class="clock" id="clk">00:00</div>'+
  (a?'<div style="margin-bottom:18px;font-size:1.2rem">Subject: <b>'+esc(a.subject)+'</b><br><span class="date">Checked in at '+new Date(a.start_ms).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})+'</span></div><button class="btn out" id="cio">Check out and save</button>'
   :'<input class="field" id="subj" list="sl" placeholder="What are you studying?" maxlength="60" aria-label="Subject"><datalist id="sl">'+subs.map(function(s){return'<option value="'+esc(s)+'">'}).join('')+'</datalist><button class="btn" id="cii">Check in</button>')+'</div>'+
  '<div class="card c5"><h3>Total study time</h3><div class="big" id="tot">0</div><div class="lab" style="margin-top:8px">'+D.stats.session_count+' session'+(D.stats.session_count===1?'':'s')+' logged</div></div>'+
  '<div class="card c12"><h3>Study streak</h3><div class="three"><div><div class="big" id="s1">0</div><div class="lab">Current streak (days)</div></div><div><div class="big" id="s2">0</div><div class="lab">Longest streak (days)</div></div><div><div class="big" id="s3">0</div><div class="lab">Shortest streak (days)</div></div></div>'+
  '<div style="margin-top:22px;display:flex;gap:14px;align-items:center;flex-wrap:wrap"><button class="btn line" id="frz"'+(fz.available?'':' disabled')+'>Use this week’s freeze day</button><span class="lab">'+(fz.available?'1 freeze day left this week. A frozen day keeps your streak alive without adding to it.':'Freeze day used on '+new Date(fz.used_on+'T12:00:00').toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'short'})+'. Next one unlocks on Monday.')+'</span></div></div></div></div>';
  count($('#tot'),D.stats.total_minutes,fmt);count($('#s1'),st.current,String);count($('#s2'),st.longest,String);count($('#s3'),st.shortest,String);
  if($('#cii'))$('#cii').onclick=checkIn;if($('#cio'))$('#cio').onclick=checkOut;if($('#subj'))$('#subj').onkeydown=function(e){if(e.key==='Enter')checkIn()};
  $('#frz').onclick=function(){arm(this,'Tap again to freeze today',async function(){try{await api('/freeze',{method:'POST',body:{date:todayKey()}});await refresh();toast('Freeze day used. Rest well.')}catch(e){fail(e);refresh()}})};clock()}
function clock(){var c=$('#clk');if(!c)return;var a=D.active,t=a?Math.max(0,Math.floor((Date.now()+skew-a.start_ms)/1000)):0;c.textContent=a?(t>=3600?pad(Math.floor(t/3600))+':':'')+pad(Math.floor(t%3600/60))+':'+pad(t%60):new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}
setInterval(clock,1000);
async function checkIn(){var v=$('#subj').value.trim();if(!v){$('#subj').focus();toast('Add a subject to check in');return}
  await curtainRun('Checked in. Let’s study.','Check in',async function(){try{await api('/checkin',{method:'POST',body:{subject:v,tz:TZ}})}catch(e){fail(e)}await refresh()})}
async function checkOut(){await curtainRun('Session saved.','Check out',async function(){try{var s=(await api('/checkout',{method:'POST',body:{}})).session;await refresh();toast('Saved '+fmt(s.minutes)+' of '+s.subject)}catch(e){fail(e);await refresh()}})}
function sessions(){var L=D.sessions;V.innerHTML='<div class="view"><h2>Sessions.</h2><p class="lede">Every session you have logged. Edit a detail or delete a mistake.</p><button class="btn line" id="csv"'+(L.length?'':' disabled')+'>Export as CSV</button><div style="margin-top:18px">'+
  (L.length?L.map(function(s,i){return'<div class="row" style="--i:'+i+'"><span class="d">'+new Date(s.date+'T12:00:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})+'</span><span class="t">'+s.start+'</span><span class="s">'+esc(s.subject)+'</span><span class="m">'+fmt(s.minutes)+'</span><span class="b" style="display:flex;gap:8px"><button class="ib" data-e="'+s.id+'">Edit</button><button class="ib" data-x="'+s.id+'">Delete</button></span></div>'}).join(''):'<div class="empty">No sessions yet. Check in on the Today page to log your first one.</div>')+'</div></div>';
  $('#csv').onclick=function(){var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\ufeff'+LocalAPI.csv()],{type:'text/csv'}));a.download='brain-append-sessions-'+todayKey()+'.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(a.href)},1500);toast('CSV exported')};$$('[data-e]').forEach(function(b){b.onclick=function(){edit(b.dataset.e)}});
  $$('[data-x]').forEach(function(b){b.onclick=function(){arm(b,'Delete?',async function(){try{await api('/sessions/'+b.dataset.x,{method:'DELETE'});await refresh();toast('Session deleted')}catch(e){fail(e);refresh()}})}})}
var editing=null,dlg=$('#dlg');
function edit(id){var s=D.sessions.filter(function(x){return String(x.id)===id})[0];if(!s)return;editing=s;$('#eS').value=s.subject;$('#eD').value=s.date;$('#eT').value=s.start;$('#eM').value=s.minutes;dlg.showModal()}
$('#eC').onclick=function(){dlg.close()};
$('#eOk').onclick=async function(){var sub=$('#eS').value.trim(),m=parseInt($('#eM').value,10);if(!sub||!(m>0)||!$('#eD').value||!$('#eT').value){toast('Fill in every field');return}
  try{await api('/sessions/'+editing.id,{method:'PUT',body:{subject:sub,date:$('#eD').value,start:$('#eT').value,minutes:m}});dlg.close();await refresh();toast('Session updated')}catch(e){fail(e)}};
async function subjects(){try{var k=(await api('/subjects')).subjects,mx=k.length?k[0].minutes:1;
  V.innerHTML='<div class="view"><h2>Subjects.</h2><p class="lede">Where your hours have gone, subject by subject.</p>'+(k.length?k.map(function(s,i){return'<div class="sub-row"><div><span>'+esc(s.subject)+'</span><span>'+fmt(s.minutes)+'</span></div><div class="bar" style="--i:'+i+';width:'+Math.max(3,s.minutes/mx*100)+'%"></div><div class="lab" style="margin:8px 0 0;font-size:.95rem;font-weight:600">'+s.percent+'% of your time, '+s.sessions+' session'+(s.sessions===1?'':'s')+'</div></div>'}).join(''):'<div class="empty">Nothing to show yet. Log a session and your subjects will appear here.</div>')+'</div>'}catch(e){fail(e)}}
/* ---------- chart window ---------- */
var range=7,win=$('#win');
function openWin(){win.hidden=false;drawChart();$('#wx').focus()}
function closeWin(){win.hidden=true}
$('#wx').onclick=closeWin;win.onclick=function(e){if(e.target===win)closeWin()};addEventListener('keydown',function(e){if(e.key==='Escape'&&!win.hidden)closeWin()});
$$('#seg button').forEach(function(b){b.onclick=function(){range=+b.dataset.n;drawChart()}});
async function drawChart(){var n=range,res;$$('#seg button').forEach(function(b){b.classList.toggle('on',+b.dataset.n===n)});
  try{res=await api('/chart?days='+n+'&today='+todayKey())}catch(e){fail(e);return}
  var ds=res.days.map(function(x){return new Date(x.date+'T12:00:00')}),v=res.days.map(function(x){return x.minutes}),mx=Math.max(60,Math.ceil(Math.max.apply(0,v)/30)*30),W=680,H=300,L=44,B=34,T=12,R=8,bw=(W-L-R)/n,g='';
  [0,.5,1].forEach(function(f){var y=T+(H-T-B)*(1-f);g+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" class="gl"/><text x="'+(L-8)+'" y="'+(y+4)+'" class="ax" text-anchor="end">'+Math.round(mx*f)+'</text>'});
  var step=n<=7?1:n<=14?2:5;
  v.forEach(function(x,i){var hh=(H-T-B)*x/mx,xx=L+i*bw+bw*.16;g+='<rect class="cbar'+(i===n-1?' t':'')+'" style="animation-delay:'+(reduce?0:i*28)+'ms" x="'+xx+'" y="'+(H-B-hh)+'" width="'+bw*.68+'" height="'+(x?Math.max(hh,3):0)+'" rx="5"><title>'+ds[i].toLocaleDateString('en-GB',{day:'numeric',month:'short'})+': '+fmt(x)+'</title></rect>';
    if((n-1-i)%step===0)g+='<text class="ax" x="'+(xx+bw*.34)+'" y="'+(H-12)+'" text-anchor="middle">'+(n<=7?ds[i].toLocaleDateString('en-GB',{weekday:'short'}):ds[i].getDate()+'/'+(ds[i].getMonth()+1))+'</text>'});
  $('#chsum').textContent='Minutes per day. Total in this range: '+fmt(res.total)+'.';$('#chart').innerHTML='<svg class="ch" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Bar chart of minutes studied per day">'+g+'</svg>'}
addEventListener('storage',function(e){if(e.key==='brain.append.v2'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName))refresh()});
refresh();
})();
