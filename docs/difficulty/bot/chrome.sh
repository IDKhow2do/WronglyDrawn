# Start the bots' headless Chrome on :9363 (own profile, muted) if it is not running. Usage: bash chrome.sh
lsof -ti tcp:9363 >/dev/null 2>&1 && exit 0
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9363 \
  --user-data-dir=/tmp/wd-diff/chrome --mute-audio --window-size=1280,720 about:blank > /tmp/wd-diff-chrome.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:9363/json/version >/dev/null && exit 0; sleep 0.5; done
