#!/usr/bin/env python3
"""
Automated demo recording script for Prompt Tracker.
Uses Playwright to record video and capture screenshots for the blog post.
"""

import subprocess
import time
import sys
from pathlib import Path
import signal
import os

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


def main():
    # Paths
    script_dir = Path(__file__).parent
    blog_dir = Path.home() / "repos" / "blog"
    videos_dir = blog_dir / "static" / "videos"
    images_dir = blog_dir / "static" / "images"

    # Ensure directories exist
    videos_dir.mkdir(parents=True, exist_ok=True)
    images_dir.mkdir(parents=True, exist_ok=True)

    # Start the prompt-tracker web server
    print("Starting prompt-tracker web server...")
    tracker_script = script_dir / "prompt-tracker"

    server_process = subprocess.Popen(
        [str(tracker_script), "serve", "--port", "8765"],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True
    )

    # Wait for server to start
    print("Waiting for server to start...")
    time.sleep(3)

    try:
        # Initialize Playwright
        print("Initializing Playwright...")
        playwright = ensure_playwright()

        with playwright() as p:
            # Launch browser in headless mode
            browser = p.chromium.launch(headless=True)

            # Create context with video recording
            context = browser.new_context(
                viewport={'width': 1280, 'height': 800},
                record_video_dir=str(videos_dir),
                record_video_size={'width': 1280, 'height': 800}
            )

            page = context.new_page()

            print("Recording 1-minute demo of all features...")

            # Navigate to the timeline
            page.goto('http://localhost:8765')
            page.wait_for_load_state('networkidle')
            time.sleep(3)

            # 0-5s: Show initial timeline view
            print("0-5s: Initial timeline view...")
            page.screenshot(path=images_dir / "prompt-tracker-timeline.png")
            time.sleep(2)

            # 5-12s: Demonstrate zooming
            print("5-12s: Demonstrating zoom...")
            try:
                for _ in range(3):
                    page.evaluate("""
                        () => {
                            const svg = document.querySelector('svg');
                            if (svg) {
                                const event = new WheelEvent('wheel', { deltaY: -100 });
                                svg.dispatchEvent(event);
                            }
                        }
                    """)
                    time.sleep(0.8)

                # Zoom back out
                for _ in range(2):
                    page.evaluate("""
                        () => {
                            const svg = document.querySelector('svg');
                            if (svg) {
                                const event = new WheelEvent('wheel', { deltaY: 100 });
                                svg.dispatchEvent(event);
                            }
                        }
                    """)
                    time.sleep(0.8)
            except Exception as e:
                print(f"Zoom failed: {e}, continuing...")

            # 12-20s: Pan around the timeline
            print("12-20s: Panning around timeline...")
            try:
                page.evaluate("""
                    () => {
                        const svg = document.querySelector('svg');
                        if (svg) {
                            const rect = svg.getBoundingClientRect();
                            // Pan left
                            svg.dispatchEvent(new MouseEvent('mousedown', {
                                clientX: rect.left + rect.width / 2,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mousemove', {
                                clientX: rect.left + rect.width / 2 - 150,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mouseup'));
                        }
                    }
                """)
                time.sleep(2)

                # Pan right
                page.evaluate("""
                    () => {
                        const svg = document.querySelector('svg');
                        if (svg) {
                            const rect = svg.getBoundingClientRect();
                            svg.dispatchEvent(new MouseEvent('mousedown', {
                                clientX: rect.left + rect.width / 2,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mousemove', {
                                clientX: rect.left + rect.width / 2 + 150,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mouseup'));
                        }
                    }
                """)
                time.sleep(2)
            except Exception as e:
                print(f"Panning failed: {e}, continuing...")

            # 20-28s: Hover over multiple bubbles
            print("20-28s: Hovering over prompts to preview...")
            bubbles = page.locator('circle.prompt-bubble, circle')
            if bubbles.count() > 5:
                for i in range(min(5, bubbles.count())):
                    try:
                        bubbles.nth(i).hover()
                        time.sleep(0.6)
                    except:
                        pass

            # 28-38s: Click a prompt and show detail panel
            print("28-38s: Opening prompt detail panel...")
            if bubbles.count() > 0:
                try:
                    # Use force=True to bypass overlapping elements
                    bubbles.first.click(force=True, timeout=5000)
                    time.sleep(2)

                    # Screenshot with detail panel
                    print("Capturing screenshot 2: Detail panel...")
                    page.screenshot(path=images_dir / "prompt-tracker-detail.png")
                    time.sleep(1)

                    # 38-45s: Rate the prompt with animation
                    print("38-45s: Rating the prompt...")
                    star_buttons = page.locator('button.star-btn, button[class*="star"]')
                    if star_buttons.count() >= 5:
                        # Click through stars 1-5 to show the effect
                        for i in range(5):
                            star_buttons.nth(i).click(force=True, timeout=3000)
                            time.sleep(0.5)
                    time.sleep(1.5)
                except Exception as e:
                    print(f"Detail panel interaction failed: {e}, continuing...")
                    time.sleep(3)  # Add time even if it fails

            # 45-50s: Close detail and show another prompt
            print("45-50s: Viewing another prompt...")
            try:
                page.mouse.click(100, 100)
                time.sleep(1)

                if bubbles.count() > 3:
                    bubbles.nth(3).click(force=True, timeout=5000)
                    time.sleep(2)
                    page.mouse.click(100, 100)
                    time.sleep(1)
            except Exception as e:
                print(f"Second prompt failed: {e}, continuing...")
                time.sleep(2)  # Add time even if it fails

            # 50-55s: Demonstrate project filtering if available
            print("50-55s: Project filtering...")
            try:
                project_labels = page.locator('.project-label, text[class*="project"]')
                if project_labels.count() > 0:
                    project_labels.first.click()
                    time.sleep(2)
                    project_labels.first.click()
                    time.sleep(1)
            except Exception as e:
                print(f"Project filtering failed: {e}, continuing...")

            # 55-60s: Final sweep across timeline
            print("55-60s: Final timeline sweep...")
            try:
                page.evaluate("""
                    () => {
                        const svg = document.querySelector('svg');
                        if (svg) {
                            const rect = svg.getBoundingClientRect();
                            svg.dispatchEvent(new MouseEvent('mousedown', {
                                clientX: rect.left + 100,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mousemove', {
                                clientX: rect.left + rect.width - 100,
                                clientY: rect.top + rect.height / 2
                            }));
                            svg.dispatchEvent(new MouseEvent('mouseup'));
                        }
                    }
                """)
                time.sleep(2)
            except Exception as e:
                print(f"Final sweep failed: {e}, continuing...")

            time.sleep(1)

            # Close the page to finalize video
            print("Finalizing video...")
            context.close()

            # Wait for video to be saved
            time.sleep(2)

            # Find the video file (Playwright creates it with a random name)
            video_files = list(videos_dir.glob("*.webm"))
            if video_files:
                latest_video = max(video_files, key=lambda p: p.stat().st_mtime)
                final_video = videos_dir / "prompt-tracker-demo.webm"
                latest_video.rename(final_video)
                print(f"✓ Video saved: {final_video}")

                # Convert to MP4 if ffmpeg is available
                try:
                    mp4_path = videos_dir / "prompt-tracker-demo.mp4"
                    subprocess.run([
                        "ffmpeg", "-i", str(final_video),
                        "-c:v", "libx264", "-c:a", "aac",
                        "-y", str(mp4_path)
                    ], check=True, capture_output=True)
                    print(f"✓ Converted to MP4: {mp4_path}")
                    final_video.unlink()  # Remove webm
                except (subprocess.CalledProcessError, FileNotFoundError):
                    print("Note: ffmpeg not available, keeping .webm format")
                    print("Install ffmpeg to convert to MP4: brew install ffmpeg")

            browser.close()

        # Now capture CLI screenshot
        print("\nCapturing CLI screenshot...")
        # Create a script to run the CLI command
        cli_script = script_dir / "temp_cli_demo.sh"
        cli_script.write_text(f"""#!/bin/bash
cd {script_dir}
./prompt-tracker timeline 2025-10-02 --no-open
""")
        cli_script.chmod(0o755)

        # Take screenshot of terminal running the command
        print("Please run the following command in a terminal and take a screenshot:")
        print(f"  cd {script_dir} && ./prompt-tracker timeline 2025-10-02 --no-open")
        print(f"\nThen save it as: {images_dir}/prompt-tracker-cli.png")

        cli_script.unlink()

        print("\n" + "="*60)
        print("Demo recording complete!")
        print("="*60)
        print(f"\nFiles created:")
        print(f"  Video: {videos_dir}/prompt-tracker-demo.mp4 (or .webm)")
        print(f"  Screenshot 1: {images_dir}/prompt-tracker-timeline.png")
        print(f"  Screenshot 2: {images_dir}/prompt-tracker-detail.png")
        print(f"\nStill needed (manual):")
        print(f"  CLI screenshot: {images_dir}/prompt-tracker-cli.png")

    finally:
        # Stop the server
        print("\nStopping web server...")
        server_process.send_signal(signal.SIGTERM)
        server_process.wait(timeout=5)
        print("✓ Server stopped")


if __name__ == "__main__":
    main()
