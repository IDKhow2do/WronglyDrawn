# Headless Chrome for the arena checks: :9401, own English profile, muted. Usage: bash docs/regression/arenas/chrome.sh
lsof -ti tcp:9401 >/dev/null 2>&1 && exit 0
mkdir -p /tmp/wd-arena
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9401 \
  --user-data-dir=/tmp/wd-arena/chrome --mute-audio --lang=en-US --accept-lang=en-US --window-size=1280,720 about:blank > /tmp/wd-arena/chrome.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:9401/json/version >/dev/null && exit 0; sleep 0.5; done
