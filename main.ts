import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildDossier } from './vendor/makefun-frontend.ts';

const out = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
mkdirSync(out, { recursive: true });
cpSync(resolve(import.meta.dirname, 'app'), resolve(out, 'app'), { recursive: true, force: true });
if (existsSync(resolve(import.meta.dirname, 'screenshots'))) {
  cpSync(resolve(import.meta.dirname, 'screenshots'), resolve(out, 'screenshots'), { recursive: true, force: true });
}
writeFileSync(resolve(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
}));
console.log(`wrote ${resolve(out, 'dossier.json')}`);
