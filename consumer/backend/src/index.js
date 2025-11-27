import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import express from 'express';
import cors from 'cors';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'media.proto');
const UPLOAD_DIR = process.env.CONSUMER_UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
const PREVIEW_DIR = path.join(UPLOAD_DIR, 'previews');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
if (!fs.existsSync(PREVIEW_DIR)) fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const mediaProto = grpc.loadPackageDefinition(packageDefinition).media;

const videos = new Map(); // videoId -> { id, filename, path, previewPath, createdAt }

// simple in-memory queue controls for uploads
const Q_MAX = Number(process.env.CONSUMER_Q_MAX || 10);
let queueLength = 0;
let totalDropped = 0;

let metrics = {
  videosReceived: 0,
  videosFailed: 0,
  previewGenerated: 0,
  previewFailed: 0,
};

// processing job queue and workers (for c)
const CONSUMER_WORKERS = Number(process.env.CONSUMER_WORKERS || 1);
const processingQueue = [];
let activeWorkers = 0;

function broadcast(wsServer, type, payload) {
  wsServer.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(JSON.stringify({ type, payload }));
    }
  });
}

function enqueueProcessingJob(videoId) {
  processingQueue.push({ videoId });
  runWorkersIfNeeded();
}

function runWorkersIfNeeded() {
  while (activeWorkers < CONSUMER_WORKERS && processingQueue.length > 0) {
    const job = processingQueue.shift();
    activeWorkers += 1;

    // simple async worker
    Promise.resolve()
      .then(() => {
        generatePreviewIfNeeded(job.videoId);
      })
      .catch((err) => {
        console.error('Processing job error for video', job.videoId, err);
      })
      .finally(() => {
        activeWorkers -= 1;
        runWorkersIfNeeded();
      });
  }
}

function generatePreviewIfNeeded(videoId) {
  const video = videos.get(videoId);
  if (!video) return;

  // if previewPath already set and file exists, do nothing
  if (video.previewPath && fs.existsSync(video.previewPath)) {
    return;
  }

  const inputPath = video.path;
  const previewFileName = `${video.id}-preview.mp4`;
  const outputPath = path.join(PREVIEW_DIR, previewFileName);

  // if a preview file already exists on disk, just record it
  if (fs.existsSync(outputPath)) {
    video.previewPath = outputPath;
    videos.set(video.id, video);
    return;
  }

  const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';

  const args = [
    '-y',
    '-ss', '0',
    '-i', inputPath,
    '-t', '10',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-preset', 'veryfast',
    '-movflags', '+faststart',
    outputPath,
  ];

  const proc = spawn(ffmpegPath, args, { stdio: 'ignore' });

  proc.on('error', (err) => {
    console.error(`ffmpeg spawn error for ${video.id}:`, err.message);
  });

  proc.on('exit', (code) => {
    if (code === 0) {
      metrics.previewGenerated++;
      video.previewPath = outputPath;
      videos.set(video.id, video);
    } else {
      metrics.previewFailed++;
      console.error(`ffmpeg preview generation failed for ${video.id} with code ${code}`);
    }
  });
}

function createGrpcServer(wsServer) {
  const server = new grpc.Server();

  server.addService(mediaProto.MediaUpload.service, {
    Upload: (call, callback) => {
      if (queueLength >= Q_MAX) {
        totalDropped += 1;
        metrics.videosFailed++;
        // drain incoming data without processing to avoid backpressure on the TCP stream
        call.on('data', () => {});
        call.on('end', () => {});
        return callback(null, { success: false, message: 'queue full' });
      }

      queueLength += 1;
      let videoId = null;
      let filename = null;
      let writeStream = null;

      metrics.videosReceived++;

      call.on('data', (chunk) => {
        if (!videoId) videoId = chunk.video_id;
        if (!filename) filename = chunk.filename;

        if (!writeStream) {
          const filePath = path.join(UPLOAD_DIR, `${videoId}-${filename}`);
          writeStream = fs.createWriteStream(filePath);
          const videoMeta = {
            id: videoId,
            filename,
            path: filePath,
            previewPath: null,
            createdAt: new Date().toISOString(),
          };
          videos.set(videoId, videoMeta);
          broadcast(wsServer, 'video_uploaded', videoMeta);
          // stub: here is where FFmpeg would generate a 10s preview and update previewPath.
        }

        if (chunk.data && chunk.data.length > 0) {
          writeStream.write(chunk.data);
        }

        if (chunk.is_last) {
          if (writeStream) {
            writeStream.end();
          }
          if (videoId) {
            enqueueProcessingJob(videoId);
          }
        }
      });

      call.on('end', () => {
        if (queueLength > 0) queueLength -= 1;
        callback(null, { success: true, message: 'Upload received' });
      });

      call.on('error', (err) => {
        console.error('gRPC upload error', err);
        if (queueLength > 0) queueLength -= 1;
      });
    },
  });

  return server;
}

function createHttpAndWsServer() {
  const app = express();
  app.use(cors());

  app.get('/', (req, res) => {
    res.json({ status: 'ok', service: 'media-consumer-backend' });
  });

  app.get('/api/metrics', (req, res) => {
    res.json({
      queueLength,
      queueMax: Q_MAX,
      totalDropped,
      videosReceived: metrics.videosReceived,
      videosFailed: metrics.videosFailed,
      previewGenerated: metrics.previewGenerated,
      previewFailed: metrics.previewFailed,
    });
  });


  app.get('/api/videos', (req, res) => {
    const list = Array.from(videos.values()).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    res.json(list);
  });

  app.get('/api/videos/:id/full', (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });
    res.sendFile(path.resolve(video.path));
  });

  app.get('/api/videos/:id/preview', (req, res) => {
    const video = videos.get(req.params.id);
    if (!video) return res.status(404).json({ error: 'Not found' });
    const previewPath = video.previewPath && fs.existsSync(video.previewPath)
      ? video.previewPath
      : video.path;
    res.sendFile(path.resolve(previewPath));
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'hello', payload: 'connected' }));
  });

  return { app, server, wss };
}

function main() {
  const { server: httpServer, wss } = createHttpAndWsServer();

  const grpcServer = createGrpcServer(wss);
  const GRPC_PORT = process.env.GRPC_PORT || 50051;
  grpcServer.bindAsync(
    `0.0.0.0:${GRPC_PORT}`,
    grpc.ServerCredentials.createInsecure(),
    (err, port) => {
      if (err) {
        console.error('Failed to start gRPC server', err);
        process.exit(1);
      }
      console.log(`gRPC server listening on ${port}`);
      grpcServer.start();
    },
  );

  const HTTP_PORT = process.env.HTTP_PORT || 4000;
  httpServer.listen(HTTP_PORT, () => {
    console.log(`HTTP/WebSocket server listening on http://localhost:${HTTP_PORT}`);
  });
}

main();
