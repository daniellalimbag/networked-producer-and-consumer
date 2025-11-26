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

function uploadVideo(videoPath) {
  return new Promise((resolve, reject) => {
    const client = new mediaProto.MediaUpload(CONSUMER_ADDR, grpc.credentials.createInsecure());
    const call = client.Upload((err, response) => {
      if (err) {
        return reject(err);
      }
      if (response && response.success === false && response.message === 'queue full') {
        log(
          `Queue full at consumer for ${path.basename(
            videoPath,
          )} (Q_HINT=${Q_HINT}). Dropping this upload.`,
        );
        return resolve();
      }
      log(`Upload finished for ${path.basename(videoPath)}: ${response?.message ?? 'ok'}`);
      resolve();
    });

    const videoId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const filename = path.basename(videoPath);

    const readStream = fs.createReadStream(videoPath, { highWaterMark: 64 * 1024 });

    readStream.on('data', (chunk) => {
      call.write({
        video_id: videoId,
        filename,
        data: chunk,
        is_last: false,
      });
    });

    readStream.on('end', () => {
      call.write({
        video_id: videoId,
        filename,
        data: Buffer.alloc(0),
        is_last: true,
      });
      call.end();
    });

    readStream.on('error', (err) => {
      error(`Read error for ${videoPath}: ${err.message}`);
      call.end();
      reject(err);
    });
  });
}

(async () => {
  try {
    await uploadVideo(workerData.videoPath);
    if (parentPort) parentPort.close();
  } catch (err) {
    error(`Upload failed: ${err.message}`);
    process.exit(1);
  }
})();
