import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workerData, parentPort } from 'node:worker_threads';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'media.proto');
const CONSUMER_ADDR = process.env.CONSUMER_ADDR || 'localhost:50051';
const Q_HINT = Number(process.env.Q_HINT || 10);
const MAX_RETRIES = 3;

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const mediaProto = grpc.loadPackageDefinition(packageDefinition).media;

function log(text) {
  if (parentPort) parentPort.postMessage({ type: 'log', text });
}

function error(text) {
  if (parentPort) parentPort.postMessage({ type: 'error', text });
}

function isTransientError(err) {
  return [
    grpc.status.UNAVAILABLE,
    grpc.status.DEADLINE_EXCEEDED,
  ].includes(err.code);
}

async function uploadWithRetries(videoPath, attempt = 1) {
  try {
    log(`Uploading ${path.basename(videoPath)} (Attempt ${attempt}/${MAX_RETRIES})`);
    await uploadVideo(videoPath);
    log(`Upload succeeded for ${path.basename(videoPath)} on attempt ${attempt}`);
  } catch (err) {
    if (isTransientError(err) && attempt < MAX_RETRIES) {
      log(`Transient gRPC error during upload: ${err.message}. Retrying...`);
      return uploadWithRetries(videoPath, attempt + 1);
    }
    error(`Upload failed permanently after ${attempt} attempt(s): ${err.message}`);
    throw err;
  }
}

function uploadVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const client = new mediaProto.MediaUpload(CONSUMER_ADDR, grpc.credentials.createInsecure());

    let bytesSent = 0;

    const call = client.Upload((err, response) => {
      if (err) {
        error(`gRPC Upload failed: ${err.message}`);
        return reject(err);
      }

      if (response?.success === false && response.message === 'queue full') {
        log(`Queue full at consumer for ${path.basename(videoPath)} (Q_HINT=${Q_HINT}) — Dropped.`);
        return resolve();
      }

      log(
        `Upload finished for ${path.basename(videoPath)}: ${response?.message ?? 'ok'} ` +
        `(${bytesSent} bytes sent)`
      );
      resolve();
    });

    const videoId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filename = path.basename(videoPath);

    try {
      const readStream = fs.createReadStream(videoPath, { highWaterMark: 64 * 1024 });

      readStream.on('data', (chunk) => {
        bytesSent += chunk.length;
        call.write({
          video_id: videoId,
          filename,
          data: chunk,
          is_last: false,
        });
      });

      readStream.on('end', () => {
        call.write({ video_id: videoId, filename, data: Buffer.alloc(0), is_last: true });
        call.end();
      });

      readStream.on('error', (err) => {
        error(`Read error for ${videoPath}: ${err.message} (Sent ${bytesSent} bytes)`);
        call.end();
        reject(err);
      });
    } catch (streamErr) {
      error(`Failed to start stream for ${videoPath}: ${streamErr.message}`);
      reject(streamErr);
    }
  });
}

(async () => {
  try {
    await uploadWithRetries(workerData.videoPath);
    if (parentPort) parentPort.close();
  } catch (err) {
    process.exit(1);
  }
})();
