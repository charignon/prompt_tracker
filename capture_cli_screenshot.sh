#!/bin/bash
# Script to capture CLI screenshot for blog post

# Paths
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
BLOG_IMAGES="$HOME/repos/blog/static/images"

echo "=== Prompt Tracker CLI Screenshot Capture ==="
echo ""
echo "This script will:"
echo "1. Open a new Terminal window"
echo "2. Run the prompt-tracker timeline command"
echo "3. Capture a screenshot"
echo ""
echo "Press Enter when ready..."
read

# Create AppleScript to open terminal and run command
osascript <<EOF
tell application "Terminal"
    activate
    set newWindow to do script "cd $SCRIPT_DIR && clear && echo '\$ ./prompt-tracker timeline 2025-10-02' && ./prompt-tracker timeline 2025-10-02 --no-open"

    -- Wait for command to complete
    delay 2

    -- Take screenshot of the terminal window
    do shell script "screencapture -l\$(osascript -e 'tell app \"Terminal\" to id of window 1') $BLOG_IMAGES/prompt-tracker-cli.png"

    -- Close the window
    delay 1
    close newWindow
end tell
EOF

echo ""
echo "✓ Screenshot saved to: $BLOG_IMAGES/prompt-tracker-cli.png"
