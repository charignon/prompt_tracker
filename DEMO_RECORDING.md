# Demo Recording for Blog Post

Automated scripts to capture video and screenshots for the blog post.

## Prerequisites

```bash
# Install Playwright (will be auto-installed by script if missing)
pip install playwright
playwright install chromium

# Optional: Install ffmpeg for video conversion
brew install ffmpeg
```

## Quick Start

Run everything with one command:

```bash
# 1. Record web interface demo (video + 2 screenshots)
./record_demo.py

# 2. Capture CLI screenshot
./capture_cli_screenshot.sh
```

## What Gets Created

The scripts will create these files in your blog:

- `~/repos/blog/static/videos/prompt-tracker-demo.mp4` - Demo video
- `~/repos/blog/static/images/prompt-tracker-timeline.png` - Timeline view
- `~/repos/blog/static/images/prompt-tracker-detail.png` - Detail panel with rating
- `~/repos/blog/static/images/prompt-tracker-cli.png` - CLI command output

## Script Details

### record_demo.py

Automated Playwright script that:
1. Starts the prompt-tracker web server on port 8765
2. Opens browser and navigates to the timeline
3. Records video while:
   - Demonstrating project filtering/selection (click to filter, click to show all)
   - Zooming into the timeline
   - Clicking on prompts to show details
   - Rating a prompt with stars
   - Panning around the visualization
   - Filtering by different projects
   - Hovering over bubbles to preview
4. Captures screenshots at key moments
5. Converts video to MP4 (if ffmpeg available)
6. Stops the server

**Duration**: 60 seconds of video

Timeline breakdown:
- **0-5s**: Initial timeline view
- **5-12s**: Zoom in/out demonstration
- **12-20s**: Panning left and right across timeline
- **20-28s**: Hover over multiple prompts to preview
- **28-38s**: Click prompt to open detail panel
- **38-45s**: Rate prompt with star animation (1→5 stars)
- **45-50s**: View another prompt
- **50-55s**: Project filtering toggle
- **55-60s**: Final cinematic sweep across timeline

### capture_cli_screenshot.sh

AppleScript-based automation that:
1. Opens a new Terminal window
2. Runs the `prompt-tracker timeline` command
3. Captures a screenshot of the terminal
4. Saves it to the blog images directory
5. Closes the terminal window

## Manual Alternative

If the scripts don't work, you can capture manually:

### CLI Screenshot
```bash
cd ~/repos/prompt_tracker
./prompt-tracker timeline 2025-10-02 --no-open
# Take screenshot (Cmd+Shift+4, then spacebar, click terminal)
# Save as: ~/repos/blog/static/images/prompt-tracker-cli.png
```

### Web Screenshots
```bash
./prompt-tracker serve --port 8765
# Open http://localhost:8765 in browser
# Take screenshots manually
```

### Video
Use QuickTime Screen Recording or OBS to record your screen while interacting with the web interface.

## Troubleshooting

**Playwright not found**: Run `pip install playwright && playwright install chromium`

**Server already running**: Kill existing server with `pkill -f "prompt-tracker serve"`

**Video format**: If ffmpeg isn't installed, the video will be saved as `.webm` instead of `.mp4`. Update the blog post shortcode to use `.webm` or install ffmpeg.

**CLI screenshot fails**: Run manually and use Cmd+Shift+4 → Spacebar → Click window

## Customization

Edit `record_demo.py` to change:
- Video length: Adjust `time.sleep()` durations
- Interactions: Modify the Playwright commands
- Resolution: Change viewport size in `new_context()`
- Port: Change server port (default 8765)

Edit `capture_cli_screenshot.sh` to change:
- Command being demonstrated
- Screenshot filename
- Terminal appearance
