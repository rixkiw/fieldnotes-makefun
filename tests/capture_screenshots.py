#!/usr/bin/env python3
"""Capture three genuine browser screenshots from the live API."""
from __future__ import annotations

import json
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:8317/"
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "screenshots"
OUT.mkdir(exist_ok=True)
MANIFEST = ROOT / "shots.json"
BROWSER = "/home/ubuntu/.cloakbrowser/chromium-146.0.7680.177.4/chrome"
SHOTS = [
    ("1-board.jpg", "#/", "Bounty board"),
    ("2-bounty.jpg", "#/bounty/makefun-frontend-01", "Bounty detail"),
    ("3-leaderboard.jpg", "#/leaderboard/makefun-frontend-01", "Leaderboard"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, executable_path=BROWSER)
    page = browser.new_page(viewport={"width": 1440, "height": 1050}, device_scale_factor=1)
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    for name, route, label in SHOTS:
        page.goto(BASE + route, wait_until="domcontentloaded")
        page.wait_for_function("window.__shotReady === true", timeout=30000)
        if page.locator(".notice.error").count():
            raise SystemExit(f"{name}: real API data failed to render")
        quality = 85
        target = OUT / name
        while True:
            page.screenshot(path=f"{target}.tmp", type="jpeg", quality=quality, timeout=60000)
            Path(f"{target}.tmp").replace(target)
            if (target.stat().st_size if target.exists() else 0) < 262144 or quality <= 40:
                break
            quality -= 10
        for tmp in OUT.glob("*.jpg.tmp"):
            tmp.unlink(missing_ok=True)
        print(name, target.stat().st_size if target.exists() else 0, f"quality={quality}", route, label)
    if errors:
        raise SystemExit(f"browser errors: {errors}")
    browser.close()

MANIFEST.write_text(json.dumps({
    "base_url": BASE,
    "viewport": {"width": 1440, "height": 1050, "device_scale_factor": 1},
    "captured_headless": True,
    "screenshots": [{"file": n, "route": r, "surface": l} for n, r, l in SHOTS],
}, indent=2) + "\n")
