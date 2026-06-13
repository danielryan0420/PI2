# ---- Build the React client ----
FROM node:20-slim AS client
WORKDIR /client
COPY client/package.json client/package-lock.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

# ---- Python runtime serving API + built client ----
FROM python:3.11-slim
WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Bring in the built frontend from the client stage
COPY --from=client /client/dist ./client/dist

# Hosts (Render/Railway/Fly) inject $PORT; default to 8082 locally.
ENV PORT=8082
EXPOSE 8082
CMD gunicorn -k eventlet -w 1 -b 0.0.0.0:${PORT:-8082} wsgi:app
