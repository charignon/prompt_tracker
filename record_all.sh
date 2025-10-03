#!/bin/bash
# Master script to record all demo materials for blog post

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo "╔════════════════════════════════════════════════════════════╗"
echo "║   Prompt Tracker Demo Recording - Blog Post Materials     ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Check if we have data to demo
echo "Step 1: Checking for prompt data..."
if ! ./prompt-tracker stats &>/dev/null; then
    echo "⚠️  No prompt data found. Running sync..."
    ./prompt-tracker sync
fi
echo "✓ Prompt data ready"
echo ""

# Record web demo
echo "Step 2: Recording web interface demo (video + screenshots)..."
echo "This will:"
echo "  - Start web server on port 8765"
echo "  - Record video of timeline interactions"
echo "  - Capture 2 screenshots"
echo ""
read -p "Press Enter to continue (or Ctrl+C to skip)..."

python3 record_demo.py

echo ""
echo "✓ Web demo complete"
echo ""

# Wait a moment
sleep 2

# Capture CLI screenshot
echo "Step 3: Capturing CLI screenshot..."
echo "This will open a Terminal window and capture the command output."
echo ""
read -p "Press Enter to continue (or Ctrl+C to skip)..."

./capture_cli_screenshot.sh

echo ""
echo "✓ CLI screenshot complete"
echo ""

# Summary
BLOG_DIR="$HOME/repos/blog/static"
echo "╔════════════════════════════════════════════════════════════╗"
echo "║                  Recording Complete!                       ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Files created in blog directory:"
echo ""

if [ -f "$BLOG_DIR/videos/prompt-tracker-demo.mp4" ]; then
    echo "  ✓ $BLOG_DIR/videos/prompt-tracker-demo.mp4"
elif [ -f "$BLOG_DIR/videos/prompt-tracker-demo.webm" ]; then
    echo "  ✓ $BLOG_DIR/videos/prompt-tracker-demo.webm"
    echo "    Note: Install ffmpeg to convert to MP4: brew install ffmpeg"
fi

if [ -f "$BLOG_DIR/images/prompt-tracker-cli.png" ]; then
    echo "  ✓ $BLOG_DIR/images/prompt-tracker-cli.png"
else
    echo "  ⚠️  $BLOG_DIR/images/prompt-tracker-cli.png (failed - run manually)"
fi

if [ -f "$BLOG_DIR/images/prompt-tracker-timeline.png" ]; then
    echo "  ✓ $BLOG_DIR/images/prompt-tracker-timeline.png"
else
    echo "  ⚠️  $BLOG_DIR/images/prompt-tracker-timeline.png (missing)"
fi

if [ -f "$BLOG_DIR/images/prompt-tracker-detail.png" ]; then
    echo "  ✓ $BLOG_DIR/images/prompt-tracker-detail.png"
else
    echo "  ⚠️  $BLOG_DIR/images/prompt-tracker-detail.png (missing)"
fi

echo ""
echo "Next steps:"
echo "  1. Review the generated files"
echo "  2. The blog post is at: ~/repos/blog/content/post/2025-10-02-prompt-tracker-visualize-claude-conversations.md"
echo "  3. Hugo server should show the article with media"
echo "  4. When ready: cd ~/repos/blog && make build deploy"
echo ""
