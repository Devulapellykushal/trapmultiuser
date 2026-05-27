import { spawnSync } from 'node:child_process';

if (process.env.VERCEL || process.env.CI) {
  process.exit(0);
}

const r = spawnSync('node', ['./node_modules/@playwright/test/cli.js', 'install'], {
  stdio: 'inherit'
});
process.exit(r.status ?? 0);
