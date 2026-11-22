import { copyFile, cp, mkdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'site-public');
await rm(target, { recursive: true, force: true });
await mkdir(join(target, 'assets'), { recursive: true });
await cp(join(root, 'assets'), join(target, 'assets'), { recursive: true });
await copyFile(join(root, 'vercel.json'), join(target, 'vercel.json'));
console.log('Prepared site-public with poster templates and Vercel response headers.');
