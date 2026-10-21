"""Real-browser tests of the deployed site. pip install -r tests/e2e/requirements.txt && playwright install chromium"""
import functools
import http.server
import json
import os
import threading

import pytest

pw = pytest.importorskip("playwright.sync_api")

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CURTAIN_IDLE = "()=>document.getElementById('curtain').className===''"
CANVAS_PIXELS = """()=>{const c=document.getElementById('cv'),d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>0)n++;return n>20000}"""


class VercelLikeHandler(http.server.SimpleHTTPRequestHandler):
    """Serves the folder like Vercel would, including the security headers from vercel.json."""
    headers_all = {h["key"]: h["value"] for r in json.load(open(os.path.join(ROOT, "vercel.json")))["headers"]
                   if r["source"] == "/(.*)" for h in r["headers"]}

    def end_headers(self):
        for k, v in self.headers_all.items():
            self.send_header(k, v)
        super().end_headers()

    def log_message(self, *a):
        pass


@pytest.fixture(scope="module")
def site():
    handler = functools.partial(VercelLikeHandler, directory=ROOT)
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    yield f"http://127.0.0.1:{srv.server_port}"
    srv.shutdown()


@pytest.fixture(scope="module")
def browser():
    with pw.sync_playwright() as p:
        try:
            b = p.chromium.launch()
        except Exception as e:
            pytest.skip(f"chromium not available: {e}")
        yield b
        b.close()


def open_site(browser, site, w=1440, h=860, init_script=None):
    ctx = browser.new_context(viewport={"width": w, "height": h}, accept_downloads=True)
    if init_script:
        ctx.add_init_script(init_script)
    page, errors = ctx.new_page(), []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.on("console", lambda m: m.type == "error" and "fonts.g" not in (m.location.get("url") or "") and errors.append(m.text))
    page.goto(site)
    page.wait_for_function(CANVAS_PIXELS)
    return ctx, page, errors


def enter_room(page):
    page.click("#enter")
    page.wait_for_selector("#subj, #cio")
    page.wait_for_function(CURTAIN_IDLE)


def test_cover_renders_creature_and_reacts_to_the_cursor(browser, site):
    ctx, page, errors = open_site(browser, site)
    shot = lambda: page.evaluate("document.getElementById('cv').toDataURL()")
    rest = shot()
    page.mouse.move(40, 300); page.wait_for_timeout(1500); left = shot()
    page.mouse.move(1400, 300); page.wait_for_timeout(1500); right = shot()
    page.mouse.move(1000, 400); page.wait_for_timeout(100)
    assert len({rest, left, right}) == 3, "different poses at rest, cursor left, cursor right"
    assert page.inner_text("#name") == "BRAIN.append" and page.is_visible("#enter")
    name, fig = page.locator("#name").bounding_box(), page.locator("#fig").bounding_box()
    assert name["x"] + name["width"] <= fig["x"] + 1, "the name must not overlap the creature"
    assert not errors, errors
    ctx.close()


def test_full_study_flow(browser, site):
    ctx, page, errors = open_site(browser, site)
    enter_room(page)
    assert "Check in." in page.inner_text("#views") and "0 min" in page.inner_text("#tot")
    page.click("#cii"); assert page.is_visible("#subj")                       # empty subject is refused
    page.fill("#subj", "Physics"); page.dblclick("#cii")                       # a double click checks in once
    page.wait_for_selector("#curtain.mascot")                                  # the mascot pulls the tab
    page.wait_for_selector("#cio"); page.wait_for_function(CURTAIN_IDLE)
    assert "Physics" in page.inner_text("#views")
    page.reload(); page.wait_for_function(CANVAS_PIXELS); enter_room(page)
    assert page.is_visible("#cio"), "a running check-in survives a reload"
    page.click("#cio"); page.wait_for_selector("#cii"); page.wait_for_function(CURTAIN_IDLE)
    assert "1 session logged" in page.inner_text("#views") and page.inner_text("#s1") == "1"
    page.click("#frz"); page.click("#frz"); page.wait_for_function("()=>document.getElementById('frz').disabled")
    page.click("#tabs button[data-v=sessions]"); page.wait_for_selector(".row")
    with page.expect_download() as dl:
        page.click("#csv")
    csv = open(dl.value.path(), encoding="utf-8-sig").read()
    assert csv.startswith("Date,Start time,Subject,Minutes") and "Physics" in csv
    page.click("[data-e]"); page.fill("#eM", "45"); page.fill("#eS", "Physics II"); page.click("#eOk")
    page.wait_for_function("()=>document.querySelector('.row .m')?.textContent==='45 min'")
    page.click("#tabs button[data-v=subjects]"); page.wait_for_selector(".sub-row")
    assert "Physics II" in page.inner_text("#views") and "100%" in page.inner_text("#views")
    page.click("#tabs button[data-v=chart]"); page.wait_for_selector("#chart svg")
    assert "45 min" in page.inner_text("#chsum")
    page.click('#seg button[data-n="30"]'); page.wait_for_function("()=>document.querySelectorAll('#chart rect').length===30")
    page.keyboard.press("Escape"); page.wait_for_function("()=>document.getElementById('win').hidden")
    page.reload(); page.wait_for_function(CANVAS_PIXELS); enter_room(page)           # data is still there after a reload
    assert "45 min" in page.inner_text("#tot")
    page.click("#tabs button[data-v=sessions]"); page.wait_for_selector(".row")
    page.click("[data-x]"); page.click("[data-x]"); page.wait_for_selector(".empty")
    assert not errors, errors
    ctx.close()


def test_mascots_are_on_screen(browser, site):
    ctx, page, errors = open_site(browser, site)
    enter_room(page); page.wait_for_timeout(2600)
    hang, header = page.locator(".hang").bounding_box(), page.locator(".rbar").bounding_box()
    assert hang["width"] > 30 and header["y"] <= hang["y"] <= header["y"] + header["height"]
    assert page.locator(".peek").bounding_box()["width"] > 30
    ctx.close()


def test_visitors_do_not_share_data(browser, site):
    c1, p1, _ = open_site(browser, site); enter_room(p1)
    p1.fill("#subj", "Private"); p1.click("#cii"); p1.wait_for_selector("#cio"); p1.wait_for_function(CURTAIN_IDLE)
    p1.click("#cio"); p1.wait_for_selector("#cii"); p1.wait_for_function(CURTAIN_IDLE)
    c2, p2, _ = open_site(browser, site); enter_room(p2)
    assert "0 sessions logged" in p2.inner_text("#views")
    c1.close(); c2.close()


@pytest.mark.parametrize("w,h", [(390, 844), (768, 1024), (1920, 1080)])
def test_layout_fits_every_screen(browser, site, w, h):
    ctx, page, errors = open_site(browser, site, w, h)
    fits = lambda: page.evaluate("document.documentElement.scrollWidth<=innerWidth+1")
    assert fits()
    enter_room(page)
    for view in ("today", "sessions", "subjects"):
        page.click(f"#tabs button[data-v={view}]"); page.wait_for_timeout(700); assert fits(), view
    page.click("#tabs button[data-v=chart]"); page.wait_for_selector("#chart svg")
    box = page.locator("#win > div").bounding_box()
    assert box["x"] >= 0 and box["x"] + box["width"] <= w
    assert not errors, errors
    ctx.close()


def test_still_works_when_the_browser_blocks_storage(browser, site):
    ctx, page, errors = open_site(browser, site, init_script="Storage.prototype.setItem=function(){throw new Error('blocked')}")
    enter_room(page)
    page.fill("#subj", "Private tab"); page.click("#cii"); page.wait_for_selector("#cio"); page.wait_for_function(CURTAIN_IDLE)
    assert "blocking storage" in page.inner_text("#toast")
    page.click("#cio"); page.wait_for_selector("#cii"); page.wait_for_function(CURTAIN_IDLE)
    assert "1 session logged" in page.inner_text("#views")
    ctx.close()


def test_site_files_and_load_time(browser, site):
    ctx, page, errors = open_site(browser, site)
    assert page.evaluate("performance.getEntriesByType('navigation')[0].domContentLoadedEventEnd") < 3000
    for path in ("/static/js/app.js", "/static/js/local-api.js", "/static/css/style.css", "/static/img/mascot.webp",
                 "/static/frames/f00.jpg", "/static/frames/f36.jpg", "/static/img/favicon.png"):
        assert page.request.get(site + path).status == 200, path
    ctx.close()
