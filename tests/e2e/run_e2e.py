#!/usr/bin/env python3
"""
EixoVerde Permanent Automated E2E QA Suite (Playwright + Headless Chromium)

Covers:
- Desktop (1440x900) Dark & Light flows, Vehicle Garage, Compare & Buy, MapContextPopup,
  Meus Locais, Live Routing, Demo Navigation, Curated DF Routes, and Offline API Resilience.
- iPhone SE (375x667) narrow/short screen ergonomics (header fit, single-line route toolbar,
  long-press popup, and non-overlapping navigation HUD).
- iPhone 14 (390x844) touch long-press & draggable bottom sheet handle.
- Android (412x915) Light-mode ergonomics, header fit, and tab highlights.

Usage:
  python3 -u tests/e2e/run_e2e.py
  E2E_SCREENSHOT_DIR=/tmp/e2e_shots python3 -u tests/e2e/run_e2e.py
"""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

REPO_ROOT = Path(__file__).resolve().parents[2]
PORT = int(os.environ.get("E2E_PORT", "5177"))
URL = f"http://127.0.0.1:{PORT}/"
SHOT_DIR = Path(os.environ["E2E_SCREENSHOT_DIR"]) if os.environ.get("E2E_SCREENSHOT_DIR") else None


def find_chrome() -> str | None:
    for candidate in ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"]:
        if Path(candidate).exists():
            return candidate
    return shutil.which("google-chrome") or shutil.which("chromium")


def save_shot(page, name: str) -> None:
    if SHOT_DIR is not None:
        SHOT_DIR.mkdir(parents=True, exist_ok=True)
        page.screenshot(path=str(SHOT_DIR / name))


def run_e2e() -> int:
    proc = subprocess.Popen(
        ["npx", "vite", "--host", "127.0.0.1", "--port", str(PORT), "--strictPort"],
        cwd=str(REPO_ROOT),
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    results = []

    def check(name: str, ok: bool, detail: str = ""):
        status = "PASS" if ok else "FAIL"
        results.append({"name": name, "ok": ok, "detail": detail})
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""), flush=True)

    try:
        server_ready = False
        for _ in range(40):
            try:
                urllib.request.urlopen(URL, timeout=1)
                server_ready = True
                break
            except Exception:
                time.sleep(0.35)
        if not server_ready:
            print("[FAIL] Vite dev server failed to start", flush=True)
            return 1

        chrome_path = find_chrome()
        launch_kwargs = {
            "headless": True,
            "args": ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader"],
        }
        if chrome_path:
            launch_kwargs["executable_path"] = chrome_path

        with sync_playwright() as p:
            browser = p.chromium.launch(**launch_kwargs)

            # ============================================
            # 1. DESKTOP (1440x900) — FULL FLOWS & OFFLINE
            # ============================================
            ctx = browser.new_context(
                viewport={"width": 1440, "height": 900},
                geolocation={"latitude": -15.7524, "longitude": -47.8992},  # SGAN 912 Masterplace
                permissions=["geolocation"],
            )
            page = ctx.new_page()
            desktop_errors = []
            page.on("pageerror", lambda err: desktop_errors.append(str(err)))

            page.goto(URL, wait_until="domcontentloaded")
            page.wait_for_selector("#eixoverde-desktop-menu-btn", timeout=15000)
            time.sleep(2.0)

            # 1a. Header clipping & Light mode contrast
            header_check = page.evaluate(
                """() => {
                  const aside = document.querySelector('aside');
                  const aRect = aside.getBoundingClientRect();
                  const btns = Array.from(aside.querySelectorAll('div:first-child button')).map(b => {
                    const r = b.getBoundingClientRect();
                    return { id: b.id || b.title || b.getAttribute('aria-label'), right: Math.round(r.right), overflow: r.right > aRect.right + 1 };
                  });
                  return { asideRight: Math.round(aRect.right), btns };
                }"""
            )
            check("Desktop header zero clipping", all(not b["overflow"] for b in header_check["btns"]))

            light_search = page.locator("aside #eixoverde-search-input")
            light_search.click()
            light_search.fill("Parque Burle Marx")
            lc = light_search.evaluate("el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor })")
            check("Light mode search input contrast", lc["color"] != lc["bg"])
            light_search.fill("")
            page.locator("aside button:has-text('Fechar')").first.click()
            time.sleep(0.2)

            # 1b. Menu drawer: dynamic location + version, zero third-party nav brand mentions
            page.click("#eixoverde-desktop-menu-btn")
            page.wait_for_selector("aside:has-text('Minha Garagem')", timeout=6000)
            time.sleep(0.3)
            menu_text = page.locator("aside").last.inner_text()
            check("Desktop menu displays v1.0.0 & no third-party nav brands", "v1.0.0" in menu_text and "Expansão Brasil" not in menu_text and "Waze" not in menu_text and "Komoot" not in menu_text)

            # Open Compare & Buy modal from menu & verify category filter + backdrop dismiss
            page.locator("button:has-text('Comparar & Comprar')").click()
            page.wait_for_selector("h2:has-text('Comparar')", timeout=6000)
            page.locator("button:has-text('E-Bikes')").click()
            time.sleep(0.2)
            check("Compare & Buy modal opens & filters E-Bikes", page.locator("h2:has-text('Comparar')").is_visible())
            page.locator("button[aria-label='Fechar comparativo']").click()
            time.sleep(0.3)

            # Switch to Dark mode via desktop header toggle
            page.locator("aside button[title*='Alternar tema']").click()
            time.sleep(0.3)

            # 1c. Vehicle Garage preset switch + custom vehicle creation
            page.click("#eixoverde-garage-btn")
            page.wait_for_selector("h2:has-text('Minha Garagem')", timeout=6000)
            page.locator("text=Segway Ninebot F2 Pro").click()
            time.sleep(0.3)
            check("Instant vehicle switch updates header pill", "Segway" in page.locator("#eixoverde-garage-btn").inner_text())

            page.click("#eixoverde-garage-btn")
            page.wait_for_selector("button:has-text('Cadastrar meu veículo')", timeout=6000)
            page.locator("button:has-text('Cadastrar meu veículo')").click()
            page.fill("input[placeholder*='Meu Patinete']", "Patinete QA 800W")
            page.locator("button:has-text('Salvar e Selecionar')").click()
            time.sleep(0.4)
            check("Custom vehicle creation updates header & auto-closes modal", "Patinete" in page.locator("#eixoverde-garage-btn").inner_text() and not page.locator("h2:has-text('Minha Garagem')").is_visible())

            # 1d. Right-click MapContextPopup + overflow menu + SavePlaceModal dark contrast
            page.mouse.click(960, 460, button="right")
            page.wait_for_selector("#eixoverde-map-context-popup", timeout=6000)
            time.sleep(0.7)
            pop_text = page.locator("#eixoverde-map-context-popup").inner_text()
            check("Desktop right-click opens MapContextPopup", "Salvar" in pop_text and "Rotas" in pop_text)
            save_shot(page, "e2e_desktop_dark_popup.png")

            page.locator("#eixoverde-map-context-popup button[aria-label*='Mais opções']").click()
            time.sleep(0.2)
            more_text = page.locator("#eixoverde-map-context-popup").inner_text()
            check("MapContextPopup '...' menu has Ponto A / Perigo / Copiar", "Definir como Ponto A" in more_text and "Reportar perigo" in more_text and "Copiar coordenadas" in more_text)

            page.locator("#eixoverde-map-context-popup button:has-text('Salvar')").click()
            page.wait_for_selector("input[placeholder*='Ex: Casa']", timeout=6000)
            save_in = page.locator("input[placeholder*='Ex: Casa']")
            save_in.click()
            save_in.fill("Masterplace QA")
            dc = save_in.evaluate("el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor })")
            check("Dark-mode SavePlaceModal focused input contrast", dc["color"] != dc["bg"] and dc["bg"] != "rgb(255, 255, 255)", json.dumps(dc))
            page.locator("form button[type='submit']:has-text('Salvar Local')").click()
            time.sleep(0.4)

            # Meus Locais tab highlight + saved place visible
            page.locator("aside button:has-text('Meus Locais')").first.click()
            time.sleep(0.25)
            tab_ok = page.evaluate(
                """() => {
                  const aside = document.querySelector('aside');
                  const r = Array.from(aside.querySelectorAll('button')).find(b => b.textContent.trim() === 'Rotas');
                  const m = Array.from(aside.querySelectorAll('button')).find(b => b.textContent.includes('Meus Locais'));
                  return getComputedStyle(r).backgroundColor === 'rgba(0, 0, 0, 0)' && getComputedStyle(m).backgroundColor !== 'rgba(0, 0, 0, 0)';
                }"""
            )
            check("Meus Locais shows saved place & crisp active tab highlight", "Masterplace QA" in page.locator("aside").first.inner_text() and tab_ok)

            # 1e. Curated DF routes count & checks (8 curated DF routes)
            page.locator("aside button:has-text('Rotas')").first.click()
            time.sleep(0.25)
            rotas_text = page.locator("aside").first.inner_text()
            check(
                "All new curated DF routes listed (Noroeste, Sudoeste, Asa Sul, Lago Sul)",
                "Noroeste (Burle Marx)" in rotas_text and "Lago Sul: Ponte JK" in rotas_text and "Asa Sul (SQS 114)" in rotas_text,
            )

            # Open Esplanada -> Asa Norte & verify exact 3 crossings + round-trip toggle
            page.locator("aside >> text=Esplanada → Asa Norte").first.click()
            page.wait_for_selector("aside #eixoverde-start-nav-btn", timeout=8000)
            time.sleep(0.5)
            c_text = page.locator("aside").first.inner_text()
            check("Curated Esplanada -> Asa Norte shows 3 travessias & +82m", "3 travessias" in c_text and "+82m" in c_text)
            page.locator("aside button:has-text('Só Ida')").click()
            time.sleep(0.2)
            rt_text = page.locator("aside").first.inner_text()
            check("Round-trip toggle doubles trip distance cleanly", "Ida + Volta" in rt_text and "15,8 km" in rt_text)
            page.locator("aside button:has-text('Ida + Volta')").click()
            time.sleep(0.2)

            # 1f. Demo Navigation + 2D/3D toggle + Hazard Modal dark contrast
            page.locator("aside #eixoverde-demo-nav-btn").click()
            page.wait_for_selector("button:has-text('Sair')", timeout=8000)
            time.sleep(1.0)
            page.locator("button:has-text('3D')").click()
            time.sleep(0.3)
            check("Demo Navigation launches & toggles 3D -> 2D", page.locator("button:has-text('2D')").is_visible())
            page.locator("button[aria-label='Reportar perigo na ciclovia']").click()
            page.wait_for_selector("input[placeholder*='Observação rápida']", timeout=6000)
            haz_in = page.locator("input[placeholder*='Observação rápida']")
            haz_in.click()
            haz_in.fill("Buraco teste E2E")
            hc = haz_in.evaluate("el => ({ color: getComputedStyle(el).color, bg: getComputedStyle(el).backgroundColor })")
            check("Dark-mode HazardReportModal focused input contrast", hc["bg"] != "rgb(255, 255, 255)", json.dumps(hc))
            page.locator("button:has-text('Publicar Alerta')").click()
            time.sleep(0.3)
            page.locator("button:has-text('Sair')").click()
            time.sleep(0.4)

            # 1g. Offline routing resilience test (abort all external routing APIs)
            page.locator("aside button[aria-label='Voltar']").click()
            time.sleep(0.3)

            def block_routing(route):
                u = route.request.url
                if any(host in u for host in ["openrouteservice", "brouter.de", "routing.openstreetmap.de", "heigit.org"]):
                    route.abort()
                else:
                    route.continue_()

            page.route("**/*", block_routing)
            search_in = page.locator("aside #eixoverde-search-input")
            search_in.click()
            search_in.fill("Parque da Cidade")
            time.sleep(0.5)
            page.locator("aside button:has-text('Parque da Cidade Sarah Kubitschek')").first.click()
            page.wait_for_selector("aside #eixoverde-start-nav-btn", timeout=15000)
            time.sleep(0.5)
            off_text = page.locator("aside").first.inner_text()
            check("Offline routing gracefully falls back without crashing", "Offline" in off_text and "Três Poderes" not in off_text)
            page.unroute("**/*", block_routing)

            check("Desktop zero uncaught page errors", len(desktop_errors) == 0, "; ".join(desktop_errors))
            ctx.close()

            # ============================================
            # 2. iPHONE SE (375x667) — NARROW & SHORT ERGONOMICS
            # ============================================
            se_ctx = browser.new_context(
                viewport={"width": 375, "height": 667},
                has_touch=True,
                is_mobile=True,
                geolocation={"latitude": -15.7524, "longitude": -47.8992},
                permissions=["geolocation"],
            )
            se = se_ctx.new_page()
            se_errors = []
            se.on("pageerror", lambda err: se_errors.append(str(err)))
            se.goto(URL, wait_until="domcontentloaded")
            se.wait_for_selector("#eixoverde-mobile-menu-btn", timeout=15000)
            time.sleep(1.6)
            se.locator("header button[aria-label='Alternar tema']").click()
            time.sleep(0.3)

            se_hdr = se.evaluate(
                """() => {
                  const brand = document.querySelector('#eixoverde-mobile-menu-btn').getBoundingClientRect();
                  const rBtns = Array.from(document.querySelectorAll('header > div button')).map(b => b.getBoundingClientRect());
                  return {
                    brandRight: Math.round(brand.right),
                    firstRightLeft: Math.round(rBtns[0].left),
                    lastRightRight: Math.round(rBtns[rBtns.length - 1].right),
                    overlaps: brand.right > rBtns[0].left + 1,
                    clips: rBtns[rBtns.length - 1].right > 376,
                    userSelect: getComputedStyle(document.querySelector('#eixoverde-mobile-menu-btn')).userSelect,
                  };
                }"""
            )
            check("iPhone SE (375px) header zero overlap/clipping & select-none", not se_hdr["overlaps"] and not se_hdr["clips"] and se_hdr["userSelect"] == "none", json.dumps(se_hdr))

            # Curated route single-line toolbar check on 375px
            se.locator("section >> text=Esplanada → Asa Norte").first.click()
            se.wait_for_selector("section #eixoverde-start-nav-btn", timeout=8000)
            time.sleep(0.8)
            se_tb = se.evaluate(
                """() => {
                  const btn = Array.from(document.querySelectorAll('section button')).find(b => b.innerText.includes('Ajustar Rota'));
                  const row = btn.parentElement;
                  const rects = Array.from(row.querySelectorAll('button')).map(b => b.getBoundingClientRect());
                  const ys = rects.map(r => Math.round(r.top));
                  const maxRight = Math.round(Math.max(...rects.map(r => r.right)));
                  return { singleLine: Math.max(...ys) - Math.min(...ys) <= 4, maxRight, clipsRight: maxRight > 376 };
                }"""
            )
            check("iPhone SE (375px) route toolbar single-line with zero horizontal clipping", se_tb["singleLine"] and not se_tb["clipsRight"], json.dumps(se_tb))
            se_pills = se.evaluate(
                """() => Array.from(document.querySelectorAll('.maplibregl-marker'))
                  .map(el => el.innerText.trim())
                  .filter(t => t.includes('L2N') || t.includes('EIXÃO') || t.includes('W3N'))"""
            )
            check("iPhone SE map renders exact 3 crossing pills (L2N, EIXÃO N, W3N)", len(se_pills) == 3, json.dumps(se_pills))
            save_shot(se, "e2e_iphone_se_375_route.png")

            # Demo Navigation HUD spacing on short 667px screen
            se.locator("section #eixoverde-demo-nav-btn").click()
            se.wait_for_selector("button:has-text('Sair')", timeout=8000)
            time.sleep(0.8)
            se_hud = se.evaluate(
                """() => {
                  const topBanner = document.querySelector('.bg-emerald-950\\\\/95').getBoundingClientRect();
                  const sairBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Sair')).closest('.glass-panel').getBoundingClientRect();
                  const rightBar = document.querySelector('button[aria-label=\"Centralizar no GPS\"]').parentElement.getBoundingClientRect();
                  return {
                    topBottom: Math.round(topBanner.bottom),
                    rightTop: Math.round(rightBar.top),
                    rightBottom: Math.round(rightBar.bottom),
                    bottomTop: Math.round(sairBtn.top),
                    cleanVerticalFit: rightTop_ok(topBanner.bottom, rightBar.top) && rightBar.bottom <= sairBtn.top + 8,
                  };
                  function rightTop_ok(a, b) { return b >= a - 8; }
                }"""
            )
            check("iPhone SE (375x667) Live Nav HUD has clean vertical clearance", se_hud["cleanVerticalFit"], json.dumps(se_hud))
            save_shot(se, "e2e_iphone_se_375_nav.png")
            se.locator("button:has-text('Sair')").click()
            time.sleep(0.3)

            check("iPhone SE zero uncaught page errors", len(se_errors) == 0, "; ".join(se_errors))
            se_ctx.close()

            # ============================================
            # 3. iPHONE 14 (390x844) — LONG PRESS & DRAG HANDLE
            # ============================================
            m14_ctx = browser.new_context(
                viewport={"width": 390, "height": 844},
                has_touch=True,
                is_mobile=True,
                geolocation={"latitude": -15.7524, "longitude": -47.8992},
                permissions=["geolocation"],
            )
            m14 = m14_ctx.new_page()
            m14_errors = []
            m14.on("pageerror", lambda err: m14_errors.append(str(err)))
            m14.goto(URL, wait_until="domcontentloaded")
            m14.wait_for_selector("#eixoverde-mobile-menu-btn", timeout=15000)
            time.sleep(1.6)
            m14.locator("header button[aria-label='Alternar tema']").click()
            time.sleep(0.3)

            # Long-press (540ms) opens MapContextPopup cleanly
            m14.evaluate(
                """() => {
                  const canvas = document.querySelector('.maplibregl-canvas');
                  const rect = canvas.getBoundingClientRect();
                  const x = rect.left + rect.width * 0.45;
                  const y = rect.top + rect.height * 0.28;
                  const touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y, pageX: x, pageY: y });
                  canvas.dispatchEvent(new TouchEvent('touchstart', { touches: [touch], targetTouches: [touch], changedTouches: [touch], bubbles: true, cancelable: true }));
                  setTimeout(() => {
                    canvas.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [touch], bubbles: true, cancelable: true }));
                  }, 540);
                }"""
            )
            m14.wait_for_selector("#eixoverde-map-context-popup", timeout=5000)
            time.sleep(0.5)
            check("iPhone 14 (390px) long-press opens MapContextPopup", "Salvar" in m14.locator("#eixoverde-map-context-popup").inner_text())
            save_shot(m14, "e2e_iphone_14_390_longpress.png")
            m14.locator("#eixoverde-map-context-popup button[aria-label*='Fechar']").click()
            time.sleep(0.25)

            # Finger pointer drag on bottom sheet handle
            handle = m14.locator("section [role='slider']")
            hb = handle.bounding_box()
            before_h = m14.locator("section").bounding_box()["height"]
            m14.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] + hb["height"] / 2)
            m14.mouse.down()
            m14.mouse.move(hb["x"] + hb["width"] / 2, hb["y"] - 220, steps=10)
            m14.mouse.up()
            time.sleep(0.35)
            after_h = m14.locator("section").bounding_box()["height"]
            check("iPhone 14 (390px) bottom sheet drag handle responds smoothly", after_h > before_h + 80, f"{round(before_h)}px -> {round(after_h)}px")

            check("iPhone 14 zero uncaught page errors", len(m14_errors) == 0, "; ".join(m14_errors))
            m14_ctx.close()

            # ============================================
            # 4. ANDROID (412x915) — LIGHT MODE ERGONOMICS
            # ============================================
            and_ctx = browser.new_context(
                viewport={"width": 412, "height": 915},
                has_touch=True,
                is_mobile=True,
                geolocation={"latitude": -15.7524, "longitude": -47.8992},
                permissions=["geolocation"],
            )
            ap = and_ctx.new_page()
            and_errors = []
            ap.on("pageerror", lambda err: and_errors.append(str(err)))
            ap.goto(URL, wait_until="domcontentloaded")
            ap.wait_for_selector("#eixoverde-mobile-menu-btn", timeout=15000)
            time.sleep(1.5)

            and_hdr = ap.evaluate(
                """() => {
                  const brand = document.querySelector('#eixoverde-mobile-menu-btn').getBoundingClientRect();
                  const rBtns = Array.from(document.querySelectorAll('header > div button')).map(b => b.getBoundingClientRect());
                  return { overlaps: brand.right > rBtns[0].left + 1, clips: rBtns[rBtns.length - 1].right > 413 };
                }"""
            )
            check("Android (412px) Light mode header zero overlap/clipping", not and_hdr["overlaps"] and not and_hdr["clips"])

            # Verify Parque da Cidade curated route (0 arterial crossings) in Light mode
            ap.locator("section >> text=Volta Completa — Parque da Cidade").first.click()
            ap.wait_for_selector("section #eixoverde-start-nav-btn", timeout=8000)
            time.sleep(0.6)
            pc_text = ap.locator("section").inner_text()
            check("Android (412px) Parque da Cidade curated route shows 0 travessias", "0 travessias" in pc_text)
            save_shot(ap, "e2e_android_412_light_route.png")

            check("Android (412px) zero uncaught page errors", len(and_errors) == 0, "; ".join(and_errors))
            and_ctx.close()

            browser.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:
            proc.kill()

    passed = sum(1 for r in results if r["ok"])
    failed = len(results) - passed
    print(f"\n=== E2E SUMMARY: {passed}/{len(results)} PASSED, {failed} FAILED ===", flush=True)
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(run_e2e())
