# Round-3 Chrome keeper: something on this machine kills headless Chromes every few minutes; this restarts ours (CDP
# :9392) within 2 s. Stop it with: touch /tmp/wd-r3/stop  (then kill Chrome by port: lsof -ti tcp:9392 | xargs kill)
rm -f /tmp/wd-r3/stop
while [ ! -f /tmp/wd-r3/stop ]; do
  if ! lsof -ti tcp:9392 >/dev/null 2>&1; then
    echo "$(date '+%T') starting chrome" >> /tmp/wd-r3/keeper.log
    (nohup "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --remote-debugging-port=9392 \
      --user-data-dir=/tmp/wd-r3/chrome --mute-audio --lang=en-US --accept-lang=en-US --window-size=1280,720 about:blank \
      >> /tmp/wd-r3/chrome.log 2>&1 &)
    sleep 3
  fi
  sleep 2
done
