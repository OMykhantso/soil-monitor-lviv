# Єдиний образ для хостингу (Render): React-збірка + Node/Express API + Python/FastAPI (FIS, AI).
# Python-сервіс слухає лише 127.0.0.1:8000 — внутрішні маршрути назовні не відкриті.

FROM node:20-bookworm-slim AS client
WORKDIR /client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:20-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-venv \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /app

COPY intelligent/requirements.txt intelligent/requirements.txt
RUN python3 -m venv /opt/venv && /opt/venv/bin/pip install --no-cache-dir -r intelligent/requirements.txt
COPY intelligent/ intelligent/
RUN cd intelligent && /opt/venv/bin/python -m pytest -q

COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/src server/src
COPY db db
COPY --from=client /client/dist client/dist
COPY start.sh ./

ENV NODE_ENV=production \
    CLIENT_DIST=/app/client/dist \
    DB_DIR=/app/db \
    FIS_URL=http://127.0.0.1:8000 \
    PORT=10000
EXPOSE 10000
CMD ["sh", "/app/start.sh"]
