import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_VIDEOS_DIR = process.env.PRODUCER_VIDEOS_DIR || path.join(__dirname, '..', 'videos');
const ENV_P = Number(process.env.PRODUCER_CONCURRENCY || 2);
const Q_HINT = Number(process.env.Q_HINT || 10);

function parseArgs(argv) {
  const args = { p: undefined, videosDirs: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--p' || a === '-p') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --p');
      args.p = Number(v);
      i++;
    } else if (a === '--videos-dirs') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --videos-dirs');
      args.videosDirs = v.split(',').map((s) => s.trim()).filter(Boolean);
      i++;
    } else if (a === '--consumer-addr') {
      const v = argv[i + 1];
      if (!v) throw new Error('Missing value for --consumer-addr');
      // make available to workers via env inheritance
      process.env.CONSUMER_ADDR = v;
      i++;
    }
  }
  return args;
}

function getVideoFiles(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Videos directory not found: ${dir}`);
    return [];
  }
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => path.join(dir, d.name));
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

async function runThreadForDir(dir) {
  const files = getVideoFiles(dir);
  console.log(`[thread] Directory: ${dir} — ${files.length} file(s) to upload`);
  for (const file of files) {
    try {
      await runWorker(file);
    } catch (err) {
      console.error(`Upload failed for ${file}`);
      console.error(`Error: ${err.message}`);
    }
  }
}

async function main() {
  const { p: argP, videosDirs: argDirs } = parseArgs(process.argv);

  // Determine threads (p) and directories assignment
  let p = Number.isFinite(argP) ? argP : ENV_P;
  if (!Number.isFinite(p) || p < 1) p = 1;

  let dirs = Array.isArray(argDirs) && argDirs.length > 0 ? argDirs : [DEFAULT_VIDEOS_DIR];

  // Enforce separate folder per thread: we will use at most one dir per thread
  if (dirs.length < p) {
    console.warn(`Requested p=${p} but only ${dirs.length} director${dirs.length === 1 ? 'y' : 'ies'} provided. Using p=${dirs.length}.`);
    p = dirs.length;
  }

  console.log(`Producer starting with p=${p} (threads), Q_HINT=${Q_HINT}`);
  console.log(`Directories: ${dirs.slice(0, p).join(', ')}`);

  // Launch one thread per directory (up to p)
  const threadPromises = dirs.slice(0, p).map((dir) => runThreadForDir(dir));
  await Promise.all(threadPromises);
  console.log('All uploads attempted across all threads.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
