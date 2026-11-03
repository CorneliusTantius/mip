#!/usr/bin/env bash
# Starts mip in the background and gives the terminal back. npm start builds first, then runs the server.
# Output goes to ~/.mip/run.log. The process group id is in ~/.mip/run.pid. Stop mip with: kill -- -<pid>
set -euo pipefail

cd "$(dirname "$(readlink -f "$0")")"

MIP_HOME="$HOME/.mip"
PORT="${MIP_PORT:-3000}"
URL="http://127.0.0.1:$PORT"
LOG_FILE="$MIP_HOME/run.log"
PID_FILE="$MIP_HOME/run.pid"

if curl -s -o /dev/null --max-time 2 "$URL/api/providers"; then
  echo "mip already answers on $URL"
  exit 0
fi

mkdir -p "$MIP_HOME"

# setsid gives npm its own session and process group, so closing this terminal or pressing Ctrl+C here does not reach it.
# nohup ignores hangups, and stdin comes from /dev/null so nothing waits for the terminal.
setsid nohup npm start >>"$LOG_FILE" 2>&1 </dev/null &
pid=$!
echo "$pid" > "$PID_FILE"

for _ in $(seq 1 60); do
  if curl -s -o /dev/null --max-time 2 "$URL/api/providers"; then
    echo "mip is running on $URL (pid $pid)"
    echo "log: $LOG_FILE"
    echo "stop: kill -- -$pid"
    exit 0
  fi
  if ! kill -0 "$pid" 2>/dev/null; then
    echo "mip stopped during start. Last lines of $LOG_FILE:" >&2
    tail -n 20 "$LOG_FILE" >&2
    exit 1
  fi
  sleep 1
done

echo "mip did not answer within 60 s. It may still be building. Check $LOG_FILE" >&2
exit 1
