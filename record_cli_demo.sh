#!/bin/bash
# Record CLI demo using asciinema

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BLOG_STATIC="$HOME/repos/blog/static"
OUTPUT_CAST="$BLOG_STATIC/casts/prompt-tracker-cli-demo.cast"
OUTPUT_GIF="$BLOG_STATIC/images/prompt-tracker-cli-demo.gif"

# Ensure directories exist
mkdir -p "$BLOG_STATIC/casts"
mkdir -p "$BLOG_STATIC/images"

echo "Recording CLI demo with asciinema..."
echo ""
echo "Commands to demonstrate:"
echo "  1. ./prompt-tracker stats"
echo "  2. ./prompt-tracker list --limit 5"
echo "  3. ./prompt-tracker timeline 2025-10-02 --no-open"
echo ""
echo "Recording will start in 3 seconds..."
sleep 3

cd "$SCRIPT_DIR"

# Record the session
asciinema rec "$OUTPUT_CAST" \
  --title "Prompt Tracker CLI Demo" \
  --cols 100 \
  --rows 30 \
  --command "bash -c '
echo \"\$ ./prompt-tracker stats\"
./prompt-tracker stats
sleep 2
echo \"\"
echo \"\$ ./prompt-tracker list --limit 5\"
./prompt-tracker list --limit 5
sleep 2
echo \"\"
echo \"\$ ./prompt-tracker timeline 2025-10-02 --no-open\"
./prompt-tracker timeline 2025-10-02 --no-open
sleep 2
'"

echo ""
echo "✓ Recording saved to: $OUTPUT_CAST"

# Convert to GIF if agg is available
if command -v agg &> /dev/null; then
    echo ""
    echo "Converting to GIF..."
    agg "$OUTPUT_CAST" "$OUTPUT_GIF" \
      --cols 100 \
      --rows 30 \
      --speed 1.5
    echo "✓ GIF saved to: $OUTPUT_GIF"
else
    echo ""
    echo "Note: Install 'agg' to convert to GIF: cargo install agg"
    echo "  Or use: https://asciinema.org/a/$(basename $OUTPUT_CAST .cast)"
fi

echo ""
echo "To embed in blog post:"
echo "  Option 1 (asciinema player):"
echo "    <script src=\"https://asciinema.org/a.js\" id=\"asciicast-$(basename $OUTPUT_CAST .cast)\" async></script>"
echo ""
echo "  Option 2 (self-hosted):"
echo "    Copy the .cast file and use asciinema-player"
echo ""
if [ -f "$OUTPUT_GIF" ]; then
    echo "  Option 3 (GIF):"
    echo "    ![CLI Demo](/images/prompt-tracker-cli-demo.gif)"
fi
