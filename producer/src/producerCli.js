import readline from 'node:readline';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (const arg of args) {
    const [key, value] = arg.split('=');
    if (!value) continue;
    if (key === '--p') result.p = Number(value);
    if (key === '--videosBase') result.videosBase = value;
  }
  return result;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer);
    });
  });
}

async function getConfigFromUser() {
  const parsed = parseArgs();
  let { p, videosBase } = parsed;

  if (!p || Number.isNaN(p) || p <= 0) {
    const input = await ask('Enter p (number of producer threads / instances): ');
    p = Number(input);
    if (!p || Number.isNaN(p) || p <= 0) {
      console.error('Invalid value for p.');
      process.exit(1);
    }
  }

  if (!videosBase) {
    const input = await ask('Enter base folder for videos (each thread reads from base/1, base/2, ...): ');
    videosBase = input.trim();
    if (!videosBase) {
      console.error('Invalid base folder.');
      process.exit(1);
    }
  }

  const resolvedBase = path.isAbsolute(videosBase)
    ? videosBase
    : path.resolve(process.cwd(), videosBase);

  return { p, videosBase: resolvedBase };
}

function startProducerInstance(index, videosBase) {
  const folder = path.join(videosBase, String(index));
  console.log(`Starting producer instance ${index} reading from ${folder}`);

  const childEnv = {
    ...process.env,
    PRODUCER_VIDEOS_DIR: folder,
  };

  const child = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('exit', (code) => {
    console.log(`Producer instance ${index} exited with code ${code}`);
  });
}

async function main() {
  const { p, videosBase } = await getConfigFromUser();

  console.log(`Launching ${p} producer instance(s) with base folder: ${videosBase}`);
  for (let i = 1; i <= p; i += 1) {
    startProducerInstance(i, videosBase);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
