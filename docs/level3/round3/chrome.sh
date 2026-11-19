# Headless Chrome for round 3: CDP :9392, own English profile, muted. Run it in the background; kill by port only.
# Usage: bash docs/level3/round3/chrome.sh [W H]   (window size; the device pixel ratio is set per script via CDP Emulation)
W=${1:-1280}; H=${2:-720}
exec "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9392 \
  --user-data-dir=/tmp/wd-r3/chrome --mute-audio --lang=en-US --accept-lang=en-US --window-size=$W,$H about:blank
