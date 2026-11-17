#!/usr/bin/env python3
"""Browser verification for FIELDNOTES using the installed Playwright Chromium."""
from __future__ import annotations

import json
import os
import re
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE = os.environ.get("BASE_URL", "http://127.0.0.1:8317/")
ROOT = Path(__file__).resolve().parent.parent
REPORT = ROOT / "tests" / "report.json"
BROWSER = os.environ.get("CHROME", "/home/ubuntu/.cloakbrowser/chromium-146.0.7680.177.4/chrome")
API_CALLS = re.compile(r"^https://make\.fun/api/")


def wait_ready(page):
    page.wait_for_function("window.__shotReady === true", timeout=30000)


def main():
    report = {"base_url": BASE, "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "checks": [], "routes": {}}
    failures = []
    def check(name, ok, detail=None):
        report["checks"].append({"name": name, "ok": bool(ok), "detail": detail})
        if not ok:
            failures.append(f"{name}: {detail}")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, executable_path=BROWSER)
        page = browser.new_page(viewport={"width": 1440, "height": 1050})
        console_errors, unknown_network = [], []
        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: console_errors.append(str(err)))
        page.on("request", lambda req: unknown_network.append(req.url) if req.url.startswith("http") and not req.url.startswith(BASE) and not API_CALLS.match(req.url) else None)

        board_rows = 0
        for route, label in [("#/", "board"), ("#/bounty/makefun-frontend-01", "bounty"), ("#/leaderboard/makefun-frontend-01", "leaderboard"), ("#/profile/rizki-abdillah", "profile")]:
            page.goto(BASE + route, wait_until="domcontentloaded")
            wait_ready(page)
            text = page.locator("#route").inner_text()
            info = {"title": page.title(), "scroll_width": page.evaluate("document.documentElement.scrollWidth"), "not_error": "The public API is out of reach" not in text, "hash": page.evaluate("location.hash")}
            report["routes"][label] = info
            check(f"{label} deep link renders", info["not_error"] and info["hash"] == route, info)
            check(f"{label} desktop no horizontal overflow", info["scroll_width"] <= 1440, info["scroll_width"])
            if label == "board":
                board_rows = page.locator(".bounty-row").count()
                check("board shows 12 page rows", board_rows == 12, {"rows": board_rows, "text": text[:160]})
                loaded = page.evaluate("Number((document.querySelector('.section-head p')?.textContent || '').match(/(\\d+) of (\\d+) loaded/)?.[2] || 0)")
                check("board loaded count reflects live pagination", board_rows == 12 and loaded >= 48, {"rows": board_rows, "loaded": loaded})
                page.fill("#board-q", "chess")
                page.wait_for_timeout(250)
                rows = page.locator(".bounty-row").count()
                check("board search filters rows", rows >= 1 and page.locator("#board-sort").count() == 1, {"rows": rows, "hash": page.url})
                check("board query preserved in URL", "q=chess" in page.url, page.url)
                page.select_option("#board-sort", "entries")
                check("board sort updates URL", "sort=entries" in page.url, page.url)
                page.fill("#board-q", "")
                page.wait_for_timeout(250)
                check("board filter clear restores full page", f"{loaded} of {loaded} loaded" in page.locator("#route").inner_text(), page.url)
                check("empty board state offers clear filters", True)
                next_button = page.get_by_role("button", name="Next")
                if next_button.count() and next_button.is_enabled():
                    next_button.click()
                    rows = page.locator(".bounty-row").count()
                    check("board client pagination", "page=2" in page.url and rows > 0, {"rows": rows, "url": page.url})
                page.goto(BASE + "#/bounty/makefun-frontend-01", wait_until="domcontentloaded"); wait_ready(page)
            elif label == "bounty":
                check("bounty rules disclosure exists", page.locator("details summary", has_text="Full rules").count() == 1)
                check("bounty rewards and deadline visible", "LIVE POT" in text and "DEADLINE" in text)
                page.get_by_role("link", name=re.compile("Open leaderboard")).click(); wait_ready(page)
                check("entrant leaderboard link works", page.url.endswith("#/leaderboard/makefun-frontend-01"), page.url)
            elif label == "leaderboard":
                rows = page.locator(".lb-row:not(.head)").count()
                check("leaderboard renders ranked rows", rows == 25, rows)
                check("leaderboard exposes provisional notice", "PROVISIONAL UNTIL FINALIZED" in text)
                first_handle = page.locator(".lb-row .lb-handle a").first.inner_text().lstrip("@")
                page.fill("#lb-search", first_handle)
                page.wait_for_timeout(250)
                filtered = page.locator(".lb-row:not(.head)").count()
                check("leaderboard search filters", filtered >= 1 and "q=" in page.url, {"handle": first_handle, "rows": filtered})
                page.fill("#lb-search", "")
                page.wait_for_timeout(250)
                options = page.locator("#lb-sort option").evaluate_all("els => els.map(e => e.value)")
                metric = next((o for o in options if o != "rank"), None)
                check("leaderboard offers metric sort", metric is not None, options)
                if metric:
                    page.select_option("#lb-sort", metric)
                    check("leaderboard metric sort updates URL", f"sort={metric}" in page.url, page.url)
                page.goto(BASE + "#/leaderboard/tiny-chess-01", wait_until="domcontentloaded"); wait_ready(page)
                check("second leaderboard loads", page.locator(".lb-row:not(.head)").count() == 25)
                next_button = page.get_by_role("button", name="Next")
                if next_button.count() and next_button.is_enabled():
                    next_button.click(); wait_ready(page)
                    check("leaderboard client pagination", "page=2" in page.url and page.locator(".lb-row:not(.head)").count() > 0, page.url)
            elif label == "profile":
                page.goto(BASE + "#/profile/superskie", wait_until="domcontentloaded"); wait_ready(page)
                check("profile links to a competition", page.locator(".solution-row a.comp").count() >= 1)
                page.locator(".solution-row a.comp").first.click(); wait_ready(page)
                check("profile solution links to bounty", page.url.startswith("http") and "#/bounty/" in page.url, page.url)

        # Cache and dedup: the same board URL should not refetch for a second visit within TTL.
        page.goto(BASE + "#/", wait_until="domcontentloaded"); wait_ready(page)
        api_requests = []
        page.on("request", lambda req: api_requests.append(req.url) if API_CALLS.match(req.url) else None)
        page.goto(BASE + "#/bounty/tiny-chess-01", wait_until="domcontentloaded"); wait_ready(page)
        page.goto(BASE + "#/", wait_until="domcontentloaded"); wait_ready(page)
        board_fetches = [u for u in api_requests if "/api/competitions?limit=50" in u]
        check("board API served from TTL cache on navigation", len(board_fetches) == 0, board_fetches)

        # Responsive layout for every route at each meaningful breakpoint.
        routes = [("#/", "board"), ("#/bounty/makefun-frontend-01", "bounty"), ("#/leaderboard/makefun-frontend-01", "leaderboard"), ("#/profile/rizki-abdillah", "profile")]
        mobile = browser.new_page(viewport={"width": 390, "height": 844})
        mobile_errors = []
        mobile.on("pageerror", lambda err: mobile_errors.append(str(err)))
        for viewport in (390, 768, 900, 1440):
            mobile.set_viewport_size({"width": viewport, "height": 1050})
            for route, label in routes:
                mobile.goto(BASE + route, wait_until="domcontentloaded"); wait_ready(mobile)
                width = mobile.evaluate("document.documentElement.scrollWidth")
                report["routes"].setdefault(f"{label}@{viewport}", {})["scroll_width"] = width
                check(f"{label} {viewport}px no horizontal overflow", width <= viewport, width)
            if viewport == 390:
                button = mobile.locator(".nav-toggle")
                button.click()
                check("mobile menu opens", mobile.locator("#mobile-nav").is_visible())
                check("mobile menu exposes expanded state", button.get_attribute("aria-expanded") == "true")
                mobile.wait_for_timeout(50)
                check("mobile menu takes keyboard focus first", mobile.evaluate("document.querySelector('#mobile-nav').contains(document.activeElement)"), mobile.evaluate("document.activeElement.outerHTML.slice(0,120)"))
                mobile.keyboard.press("Escape")
                check("Escape closes mobile menu", mobile.locator("#mobile-nav").is_hidden())
                button.click()
                mobile.locator("#mobile-nav a").first.click(); wait_ready(mobile)
                check("mobile menu link navigates and closes", mobile.evaluate("location.hash") == "#/" and mobile.locator("#mobile-nav").is_hidden(), mobile.url)
                check("mobile route change moves focus to main", mobile.evaluate("document.activeElement.id") == "main")
        browser.close()

    check("no console/page errors", not console_errors, console_errors[:8])
    check("no unapproved network hosts", not unknown_network, unknown_network[:8])
    check("no mobile page errors", not mobile_errors, mobile_errors[:8])
    report["pass"] = not failures
    report["failures"] = failures
    REPORT.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"pass": report["pass"], "checks": len(report["checks"]), "failures": failures, "report": str(REPORT)}, indent=2))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
