#!/bin/sh
# Запуск обох процесів в одному контейнері; якщо будь-який завершиться — контейнер перезапуститься
set -e
cd /app/intelligent
/opt/venv/bin/uvicorn api:app --host 127.0.0.1 --port 8000 --log-level warning &
FIS_PID=$!
cd /app/server
node src/index.js &
API_PID=$!
# Чекаємо на перший процес, що завершився, і зупиняємо інший
while kill -0 $FIS_PID 2>/dev/null && kill -0 $API_PID 2>/dev/null; do sleep 2; done
kill $FIS_PID $API_PID 2>/dev/null || true
exit 1
