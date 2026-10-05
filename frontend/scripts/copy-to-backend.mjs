import { cpSync, rmSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = join(__dirname, '..', 'dist');
const target = join(__dirname, '..', '..', 'backend', 'public');

if (!existsSync(dist)) {
  console.error('dist/ missing — run vite build first');
  process.exit(1);
}

rmSync(target, { recursive: true, force: true });
mkdirSync(target, { recursive: true });
cpSync(dist, target, { recursive: true });
console.log('Copied frontend/dist → backend/public');
