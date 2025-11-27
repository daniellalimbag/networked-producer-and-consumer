import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workerData, parentPort } from 'node:worker_threads';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { logInfo, logError } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, '..', 'proto', 'media.proto');
const CONSUMER_ADDR = process.env.CONSUMER_ADDR || 'localhost:50051';
const Q_HINT = Number(process.env.Q_HINT || 10);
const MAX_RETRIES = 3;

const metrics = {
  uploadsAttempted: 0,
  uploadsSuccessful: 0,
  retriesCount: 0,
  errorsCount: 0
};

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
  keepCase: true,
  longs: String,
  enums: String,
  defaults: true,
  oneofs: true,
});

const mediaProto = grpc.loadPackageDefinition(packageDefinition).media;

function isTransientError(err) {
  return [
    grpc.status.UNAVAILABLE,
    grpc.status.DEADLINE_EXCEEDED,
  ].includes(err.code);
}

async function uploadWithRetries(videoPath, attempt = 1) {
  metrics.uploadsAttempted++;

  try {
    logInfo("UPLOAD", `Uploading ${path.basename(videoPath)} (Attempt ${attempt}/${MAX_RETRIES})`);
    await uploadVideo(videoPath);
    metrics.uploadsSuccessful++;
    logInfo("UPLOAD", `Upload succeeded for ${path.basename(videoPath)} on attempt ${attempt}`);
  } catch (err) {
    metrics.errorsCount++;

    if (isTransientError(err) && attempt < MAX_RETRIES) {
      metrics.retriesCount++;
      logInfo("RETRY", `Transient gRPC error: ${err.message}. Retrying...`);
      return uploadWithRetries(videoPath, attempt + 1);
    }

    logError("UPLOAD", `Upload failed permanently after ${attempt} attempt(s): ${err.message}`);
    throw err;
  }
}

function uploadVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const client = new mediaProto.MediaUpload(CONSUMER_ADDR, grpc.credentials.createInsecure());
    let bytesSent = 0;

    const call = client.Upload((err, response) => {
      if (err) {
        logError("RPC", `gRPC Upload failed: ${err.message}`);
        return reject(err);
      }

      if (response?.success === false && response.message === 'queue full') {
        logInfo("QUEUE", `Queue full for ${path.basename(videoPath)} (Q_HINT=${Q_HINT}) — Dropped`);
        return resolve();
      }

      logInfo("UPLOAD", `Finished upload ${path.basename(videoPath)} (${bytesSent} bytes sent)`);
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
        metrics.errorsCount++;
        logError("STREAM", `Read error ${filename}: ${err.message} (Sent ${bytesSent} bytes)`);
        call.end();
        reject(err);
      });
    } catch (streamErr) {
      metrics.errorsCount++;
      logError("STREAM", `Failed to start read stream: ${streamErr.message}`);
      reject(streamErr);
    }
  });
}

(async () => {
  try {
    await uploadWithRetries(workerData.videoPath);

    logInfo("SUMMARY", `Final status for ${path.basename(workerData.videoPath)} processed.`);
    logInfo("SUMMARY", `Metrics → Attempts: ${metrics.uploadsAttempted}, Success: ${metrics.uploadsSuccessful}, Retries: ${metrics.retriesCount}, Errors: ${metrics.errorsCount}`);

    if (parentPort) parentPort.close();
  } catch (err) {
    logError("FATAL", `Worker exiting due to error: ${err.message}`);
    process.exit(1);
  }
})();
