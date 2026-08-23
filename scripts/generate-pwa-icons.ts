import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_DIR = path.join(ROOT, 'assets', 'pwa-icons');
const OUT_DIR = path.join(ROOT, 'public', 'icons');

const targets = [
  { src: 'icon.svg', size: 192, name: 'icon-192.png' },
  { src: 'icon.svg', size: 512, name: 'icon-512.png' },
  { src: 'icon.svg', size: 180, name: 'apple-touch-icon.png' },
  { src: 'icon.svg', size: 32, name: 'favicon-32.png' },
  { src: 'icon.svg', size: 16, name: 'favicon-16.png' },
  { src: 'icon-maskable.svg', size: 192, name: 'icon-maskable-192.png' },
  { src: 'icon-maskable.svg', size: 512, name: 'icon-maskable-512.png' },
];

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  for (const target of targets) {
    await sharp(path.join(SOURCE_DIR, target.src), { density: 384 })
      .resize(target.size, target.size)
      .png()
      .toFile(path.join(OUT_DIR, target.name));
    console.log('wrote', target.name);
  }
}

main();
