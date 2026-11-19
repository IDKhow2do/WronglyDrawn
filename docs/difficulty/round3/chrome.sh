# Headless Chrome for the round-3 checks: :9695, own English profile, muted. Usage: bash docs/difficulty/round3/chrome.sh
lsof -ti tcp:9695 >/dev/null 2>&1 && exit 0
mkdir -p /tmp/wd-round3 /tmp/wd-round3-chrome
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9695 \
  --user-data-dir=/tmp/wd-round3-chrome --mute-audio --lang=en-US --accept-lang=en-US --window-size=1280,720 about:blank > /tmp/wd-round3/chrome.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:9695/json/version >/dev/null && exit 0; sleep 0.5; done
