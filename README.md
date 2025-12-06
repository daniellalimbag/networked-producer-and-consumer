# Networked Producer and Consumer (STIDSCM P3)

## Authors
- GOMEZ, Dominic Joel
- LIMBAG, Daniella Franxene
- REYES, Ma. Julianna Re-an
- SANTOS, Montgomery Joseph
---

## 1. Prerequisites

- **Node.js 18.x** installed.
  - Check with: `node -v`
- A modern browser (Chrome, Edge, etc.).
- FFmpeg is **not required** for this stubbed starter (hooks can be added later).

Repo root (this README lives here):

```text
Networked-Producer-and-Consumer/
```

---

## 2. First-Time Setup (after cloning)

From the repo root.

### 2.1 Install dependencies

```bash
# Producer
cd producer
npm install

# Consumer backend
cd ../consumer/backend
npm install

# Consumer frontend
cd ../frontend
npm install
```

You only need to do this once per clone (or whenever `package.json` changes).

### 2.2 Prepare local video folder for producer

From the repo root:

```bash
mkdir producer\videos
```

Then copy some small test videos (e.g. `.mp4`) into `producer/videos/`.

- Example:
  - `producer/videos/sample1.mp4`
  - `producer/videos/sample2.mp4`

You do **not** need to create `consumer/backend/uploads/` manually – the backend will create it.

---

## 3. Running the System Locally

Use three terminals: one for the backend, one for the frontend, and one for the producer.

### 3.1 Start the consumer backend (gRPC + REST + WebSocket)

From repo root:

```bash
cd consumer/backend

# Optional env vars (defaults shown for Windows PowerShell):
#   $env:GRPC_PORT = "50051"
#   $env:HTTP_PORT = "4000"
#   $env:CONSUMER_UPLOAD_DIR = "uploads"

npm start
```

You should see logs similar to:

- `gRPC server listening on 50051`
- `HTTP/WebSocket server listening on http://localhost:4000`

Health-check in the browser:

- Open `http://localhost:4000/` → should show JSON:

```json
{ "status": "ok", "service": "media-consumer-backend" }
```

### 3.2 Start the consumer frontend (React + Vite)

In a second terminal, from repo root:

```bash
cd consumer/frontend

# Optional env vars (defaults shown):
#   $env:VITE_API_BASE = "http://localhost:4000"
#   $env:VITE_WS_URL = "ws://localhost:4000"

npm run dev
```

Open in the browser:

```text
http://localhost:5173/
```

You should see the Media Consumer UI. Initially, there will be no videos listed.

### 3.3 Start the producer (gRPC client with worker threads)

In a third terminal, from repo root:

```bash
cd producer

# Optional env vars (defaults shown):
#   $env:CONSUMER_ADDR = "localhost:50051"    # gRPC endpoint of consumer backend
#   $env:PRODUCER_VIDEOS_DIR = "videos"       # relative to producer/
#   $env:PRODUCER_CONCURRENCY = "2"           # number of worker threads

npm start
```

---

## 4. Configuration Summary

All configuration is environment-variable driven with safe defaults.

### Producer

- `CONSUMER_ADDR` (default: `localhost:50051`)
  - gRPC address of the consumer backend.
- `PRODUCER_VIDEOS_DIR` (default: `videos` inside `producer/`).
- `PRODUCER_CONCURRENCY` (default: `2` workers).

### Consumer backend

- `GRPC_PORT` (default: `50051`).
- `HTTP_PORT` (default: `4000`).
- `CONSUMER_UPLOAD_DIR` (default: `uploads` inside `consumer/backend/`).

### Consumer frontend (Vite)

- `VITE_API_BASE` (default: `http://localhost:4000`).
- `VITE_WS_URL` (default: `ws://localhost:4000`).

---
