#!/usr/bin/env python3
"""Capture the detail panel screenshot"""

import subprocess
import time
from pathlib import Path
import signal

def ensure_playwright():
    """Ensure Playwright is installed"""
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Installing Playwright...")
        subprocess.run([sys.executable, "-m", "pip", "install", "playwright"], check=True)
        subprocess.run([sys.executable, "-m", "playwright", "install", "chromium"], check=True)
        from playwright.sync_api import sync_playwright
    return sync_playwright

# Paths
script_dir = Path(__file__).parent
blog_dir = Path.home() / "repos" / "blog"
images_dir = blog_dir / "static" / "images"

images_dir.mkdir(parents=True, exist_ok=True)

# Start server
print("Starting server...")
tracker_script = script_dir / "prompt-tracker"
server_process = subprocess.Popen(
    [str(tracker_script), "serve", "--port", "8765"],
    stdout=subprocess.PIPE,
    stderr=subprocess.PIPE
)

time.sleep(3)

try:
    playwright = ensure_playwright()

    with playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        page.goto('http://localhost:8765')
        page.wait_for_load_state('networkidle')
        time.sleep(2)

        # Find and click a bubble
        bubbles = page.locator('circle.prompt-bubble, circle')
        print(f"Found {bubbles.count()} bubbles")

        if bubbles.count() > 0:
            print("Clicking on a bubble...")
            bubbles.first.click()
            time.sleep(2)

            # Take screenshot
            print("Capturing screenshot...")
            page.screenshot(path=images_dir / "prompt-tracker-detail.png")
            print(f"✓ Screenshot saved to: {images_dir / 'prompt-tracker-detail.png'}")
        else:
            print("No bubbles found!")

        browser.close()

finally:
    print("Stopping server...")
    server_process.send_signal(signal.SIGTERM)
    server_process.wait(timeout=5)
