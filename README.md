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
- **FFmpeg is required** for preview and compression.
  - In Docker, FFmpeg is available in the images (FFMPEG_PATH=ffmpeg).
  - For local runs, install FFmpeg or set `FFMPEG_PATH` to your ffmpeg binary.

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
- `PRODUCER_VIDEOS_DIRS` or `VIDEOS_DIRS` (CSV inside container when using Docker) — one directory per logical producer thread.
- `PRODUCER_CONCURRENCY` or `P` (default: `2`) — number of logical producer threads (capped by number of directories provided).

### Consumer backend

- `GRPC_PORT` (default: `50051`).
- `HTTP_PORT` (default: `4000`).
- `CONSUMER_UPLOAD_DIR` (default: `uploads` inside `consumer/backend/`).
- `CONSUMER_WORKERS` or `C` (default: `1`) — processing workers for preview/compression.
- `CONSUMER_Q_MAX` or `Q` (default: `10`) — leaky-bucket capacity (admission uses in-flight + backlog).

### Consumer frontend (Vite)

- `VITE_API_BASE` (default: `http://localhost:4000`).
- `VITE_WS_URL` (default: `ws://localhost:4000`).

---

## 5. Running with Docker Compose (recommended)

These steps run all components in containers.

### 5.1 Prepare host folders

```bash
# From repo root
mkdir -p ./producer_videos
# Optional: for multiple producer threads (one dir per thread)
mkdir -p ./producer_videos/dir1
mkdir -p ./producer_videos/dir2
```

Place some test videos in `./producer_videos` (single-thread) or in the subfolders (multi-thread).

### 5.2 Create .env in project root

Example (single directory, sequential uploads):

```env
P=1
C=1
Q=3
VIDEOS_DIRS=/app/videos
```

Example (two concurrent producer threads using two folders):

```env
P=2
C=1
Q=3
VIDEOS_DIRS=/app/videos/dir1,/app/videos/dir2
```

Notes:
- Use container paths in `VIDEOS_DIRS`. The compose file maps `./producer_videos` (host) to `/app/videos` (container).
- `P` is capped by number of directories provided.

### 5.3 Build and start

```bash
docker compose --env-file .env up --build
```

Services:
- consumer-backend: gRPC (50051), HTTP/WS (4000)
- consumer-frontend: UI on 5173 (Nginx serving built SPA)
- producer: streams files from mounted `/app/videos` folders to consumer via gRPC

### 5.4 Verify

- UI: http://localhost:5173
- Backend health: http://localhost:4000/
- Metrics: http://localhost:4000/api/metrics
- Videos list: http://localhost:4000/api/videos

### 5.5 Common scenarios

- Increase concurrency/drops:
  - Set `P` higher and list multiple directories in `VIDEOS_DIRS` (e.g., two dirs for `P=2`).
  - Lower `Q` to trigger queue-full rejections sooner.
- Duplicate detection:
  - Upload the same file content again; metrics `duplicatesDetected` should increase.
- Preview/Compression:
  - Watch backend logs for ffmpeg preview and `<id>-compressed.mp4` creation.

---
