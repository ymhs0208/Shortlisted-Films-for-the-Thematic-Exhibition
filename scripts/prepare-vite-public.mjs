import { copyFile, cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'site-public');
const templateTarget = join(target, 'expo-templates');
await rm(target, { recursive: true, force: true });
await mkdir(join(target, 'assets'), { recursive: true });
await cp(join(root, 'assets'), join(target, 'assets'), { recursive: true });
await copyFile(join(root, 'vercel.json'), join(target, 'vercel.json'));
await mkdir(templateTarget, { recursive: true });
await cp(join(root, 'video-studio', 'templates'), templateTarget, { recursive: true });
const templateManifest = {
  intros: [
    { id: 'intro-1', filename: 'intro-1.mp4', durationSeconds: 10.133333 },
    { id: 'intro-2', filename: 'intro-2.mp4', durationSeconds: 10.033333 },
    { id: 'intro-3', filename: 'intro-3.mp4', durationSeconds: 10.033333 },
    { id: 'intro-4', filename: 'intro-4.mp4', durationSeconds: 13.504 },
    { id: 'intro-5', filename: 'intro-5.mp4', durationSeconds: 10.048 },
    { id: 'intro-6', filename: '企業智慧化開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-7', filename: '進修部開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-8', filename: '網路應用與資通安全開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-9', filename: '智慧流通應用與研究開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-10', filename: '智慧運算創新應用開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-11', filename: '嵌入式系統與行動計算開場.mp4', durationSeconds: 10.033333 },
    { id: 'intro-12', filename: '智慧運算創新應用開場_01.mp4', durationSeconds: 10.033333 },
  ],
  outros: [
    { id: 'outro-1', filename: 'outro-1.mp4', durationSeconds: 10.033333 },
    { id: 'outro-2', filename: 'outro-2.mp4', durationSeconds: 10.033333 },
    { id: 'outro-3', filename: 'outro-3.mp4', durationSeconds: 10.033333 },
    { id: 'outro-4', filename: 'outro-4.mp4', durationSeconds: 10.048 },
  ],
};
await writeFile(join(templateTarget, 'manifest.json'), JSON.stringify(templateManifest, null, 2));
console.log('Prepared poster assets, sixteen MP4 templates and Vercel response headers.');
