# Node Producer–Consumer Local Starter

so we have: **Node.js producer**, **Node.js consumer backend**, and **React (Vite) consumer frontend** locally for the media upload producer–consumer exercise.

rn this setup is meant to run on a single machine but is structured so the producer and consumer can later be split into separate VMs or containers (i hope)

---

## 1. Architecture Overview

- **Shared gRPC contract** (`proto/media.proto`)
  - `service MediaUpload { rpc Upload(stream VideoChunk) returns (UploadStatus); }`
  - `VideoChunk { video_id, filename, bytes data, bool is_last }`
  - `UploadStatus { success, message }`

- **Producer** (`producer/`)
  - Node.js 18, `@grpc/grpc-js`, `@grpc/proto-loader`.
  - Reads video files from `producer/videos/`.
  - Uses worker threads to upload multiple videos concurrently.
  - Streams each file to the consumer via gRPC.

- **Consumer backend** (`consumer/backend/`)
  - Node.js 18, gRPC server + Express REST + WebSocket (`ws`).
  - Saves uploaded videos into `consumer/backend/uploads/` (git-ignored).
  - In-memory store of uploaded videos.
  - REST API used by the frontend:
    - `GET /api/videos` – list all videos.
    - `GET /api/videos/:id/preview` – preview video (currently same as full video, preview stub).
    - `GET /api/videos/:id/full` – full video.
  - WebSocket server:
    - Broadcasts `video_uploaded` when a new video is stored.
  - Simple health check:
    - `GET /` → `{ status: "ok", service: "media-consumer-backend" }`.

- **Consumer frontend** (`consumer/frontend/`)
  - React 18 + Vite.
  - Talks only to the consumer backend:
    - REST → listing and loading videos.
    - WebSocket → real-time updates when new videos arrive.
  - UI behavior:
    - Left pane: list of uploaded videos.
    - Hover on a video → auto-play preview (currently full file, stub for 10s preview).
    - Click on a video → full player with controls.

---

## 2. Prerequisites

- **Node.js 18.x** installed.
  - Check with: `node -v`
- A modern browser (Chrome, Edge, etc.).
- FFmpeg is **not required** for this stubbed starter (hooks can be added later).

Repo root (this README lives here):

```text
Networked-Producer-and-Consumer/
```

---

## 3. First-Time Setup (after cloning)

From the repo root.

### 3.1 Install dependencies

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

### 3.2 Prepare local video folder for producer

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

## 4. Running the System Locally

Use three terminals: one for the backend, one for the frontend, and one for the producer.

### 4.1 Start the consumer backend (gRPC + REST + WebSocket)

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

### 4.2 Start the consumer frontend (React + Vite)

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

### 4.3 Start the producer (gRPC client with worker threads)

In a third terminal, from repo root:

```bash
cd producer

# Optional env vars (defaults shown):
#   $env:CONSUMER_ADDR = "localhost:50051"    # gRPC endpoint of consumer backend
#   $env:PRODUCER_VIDEOS_DIR = "videos"       # relative to producer/
#   $env:PRODUCER_CONCURRENCY = "2"           # number of worker threads

npm start
```

Behavior:

- The producer scans `producer/videos/` for files.
- For each file, a worker-thread process streams the file via gRPC to the consumer backend.
- The consumer backend:
  - Writes the video to `consumer/backend/uploads/<videoId>-<filename>`.
  - Tracks metadata (id, filename, path, createdAt) in an in-memory map.
  - Broadcasts a `video_uploaded` message over WebSocket.

Frontend behavior:

- The UI automatically loads videos from `GET /api/videos` on startup.
- When the backend broadcasts `video_uploaded`, the frontend prepends the new video to the list.
- **Hover** over a video in the list:
  - The right-side preview player calls `GET /api/videos/:id/preview` and auto-plays it (mute loop).
- **Click** a video:
  - The selected player calls `GET /api/videos/:id/full` and shows it with controls.

---

## 5. Configuration Summary

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