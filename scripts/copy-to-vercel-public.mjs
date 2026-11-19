import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'frontend', 'dist');
const target = join(root, 'public');

if (!existsSync(dist)) {
  throw new Error('frontend/dist is missing; build the frontend before staging Vercel output');
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, target, { recursive: true });
console.log('Copied frontend/dist to public for Vercel');
