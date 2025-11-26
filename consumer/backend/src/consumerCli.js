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
    if (key === '--c') result.c = Number(value);
    if (key === '--q') result.q = Number(value);
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
  let { c, q } = parsed;

  if (!c || Number.isNaN(c) || c <= 0) {
    const input = await ask('Enter c (consumer threads / workers): ');
    c = Number(input);
    if (!c || Number.isNaN(c) || c <= 0) {
      console.error('Invalid value for c.');
      process.exit(1);
    }
  }

  if (!q || Number.isNaN(q) || q <= 0) {
    const input = await ask('Enter q (max queue length): ');
    q = Number(input);
    if (!q || Number.isNaN(q) || q <= 0) {
      console.error('Invalid value for q.');
      process.exit(1);
    }
  }

  return { c, q };
}

async function main() {
  const { c, q } = await getConfigFromUser();

  console.log(`Starting consumer backend with c=${c} workers and q=${q} max queue length`);

  const childEnv = {
    ...process.env,
    CONSUMER_WORKERS: String(c),
    CONSUMER_Q_MAX: String(q),
  };

  const child = spawn('node', [path.join(__dirname, 'index.js')], {
    stdio: 'inherit',
    env: childEnv,
  });

  child.on('exit', (code) => {
    console.log(`Consumer backend exited with code ${code}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
