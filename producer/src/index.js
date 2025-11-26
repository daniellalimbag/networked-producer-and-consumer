import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEOS_DIR = process.env.PRODUCER_VIDEOS_DIR || path.join(__dirname, '..', 'videos');
const CONCURRENCY = Number(process.env.PRODUCER_CONCURRENCY || 2);
const Q_HINT = Number(process.env.Q_HINT || 10);

function getVideoFiles() {
  if (!fs.existsSync(VIDEOS_DIR)) {
    console.error(`Videos directory not found: ${VIDEOS_DIR}`);
    process.exit(1);
  }
  return fs
    .readdirSync(VIDEOS_DIR, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(VIDEOS_DIR, d.name));
}

function runWorker(videoPath) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { videoPath },
    });
    worker.on('message', (msg) => {
      if (msg.type === 'log') console.log(msg.text);
      if (msg.type === 'error') console.error(msg.text);
    });
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) {
        reject(new Error(`Worker stopped with exit code ${code}`));
      } else {
        resolve();
      }
    });
  });
}

async function main() {
  console.log(`Producer starting with concurrency=${CONCURRENCY} (p) and Q_HINT=${Q_HINT}`);
  const files = getVideoFiles();
  if (files.length === 0) {
    console.log('No video files found to upload.');
    return;
  }

  console.log(`Found ${files.length} video files in ${VIDEOS_DIR}`);

  const queue = [...files];
  const running = new Set();

  function scheduleNext() {
    if (queue.length === 0) return;
    if (running.size >= CONCURRENCY) return;

    const file = queue.shift();
    const p = runWorker(file)
      .catch((err) => {
        console.error('Worker failed for', file, err.message);
      })
      .finally(() => {
        running.delete(p);
        scheduleNext();
      });
    running.add(p);
    scheduleNext();
  }

  for (let i = 0; i < CONCURRENCY; i += 1) {
    scheduleNext();
  }

  await Promise.all(running);
  console.log('All uploads attempted.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
