# BRAIN.append (Vercel version)

A study buddy website: check in, log your minutes, keep your streak, see where your time goes. Plain HTML, CSS and JavaScript, so it deploys on Vercel with no build step and no configuration. Each visitor's sessions are saved in their own browser (localStorage), so there is no server or database to set up.

## Put it on Vercel in 3 steps
1. **Push to GitHub.** Unzip, open the folder in a terminal, then:
   ```
   git init
   git add .
   git commit -m "BRAIN.append"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/brain-append.git
   git push -u origin main
   ```
   (Create the empty repository `brain-append` on github.com first. On the repository page you should see `index.html`, `static` and `vercel.json` at the top level.)
2. **Import it on Vercel.** vercel.com > Add New > Project > pick the repository.
3. **Deploy.** Set *Framework Preset* to **Other** and leave Build Command, Output Directory and Install Command empty. Click Deploy.

Prefer the command line? From this folder run `npx vercel --prod`.

## Features
1. Check in with a subject; the clock starts then. Check out saves the subject, date, start time and minutes.
2. Sessions page: view, edit and delete past sessions.
3. Study streak block: current, longest and shortest streak.
4. Total study time.
5. Persistent storage: data stays after closing the tab or restarting the browser, including a check-in that is still running.
6. One freeze day per week (Monday to Sunday). It keeps a streak alive without adding a day.
7. Export all sessions as CSV.
8. Chart window: minutes per day for 7, 14 or 30 days.
9. Subjects page: time and share per subject.

## Good to know
* Data lives in the visitor's browser on that device. Clearing site data, or switching browser or device, starts fresh. Visitors never see each other's data.
* Private or incognito windows may block storage. The app warns and keeps working until the tab closes.
* To sync across devices you would add a hosted database (for example Neon, Supabase or Upstash) and a few serverless functions. The data layer is one file, `static/js/local-api.js`, which is the only place that would change.
* The page loads the Bricolage Grotesque font from Google Fonts and falls back to a system font if it is blocked.

## Project layout
```
index.html                the page
vercel.json               security headers, caching, favicon route
static/css/style.css      styles
static/js/app.js          interface, mascot animation, transitions
static/js/local-api.js    data layer: sessions, streaks, freeze day, chart, subjects, CSV (same rules as the Flask version)
static/img, frames/       mascot, icons, 37 frames for the cursor-following animation
tests/                    28 automated tests
```

## Tests
```
node --test tests/*.test.js                  # 19 data-layer tests, nothing to install
pip install -r tests/e2e/requirements.txt
playwright install chromium
python -m pytest tests/e2e                   # 9 real-browser tests
```
The browser tests serve the site with the same security headers as `vercel.json`, then run the cover, the mascot following the cursor, the whole check in, edit, export, chart and delete flow, reloads, phone/tablet/desktop layouts, separate visitors, and blocked storage. GitHub runs everything on each push.
