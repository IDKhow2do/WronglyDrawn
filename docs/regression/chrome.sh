# Headless Chrome for the regression runs: :9371, own English profile, muted. Usage: bash docs/regression/chrome.sh
lsof -ti tcp:9371 >/dev/null 2>&1 && exit 0
nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9371 \
  --user-data-dir=/tmp/wd-reg/chrome --mute-audio --lang=en-US --accept-lang=en-US --window-size=1280,720 about:blank > /tmp/wd-reg/chrome.log 2>&1 &
for i in $(seq 1 30); do curl -s http://127.0.0.1:9371/json/version >/dev/null && exit 0; sleep 0.5; done
