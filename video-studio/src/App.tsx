/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import brandIcon from '../../favicon.png';
import { Audio, Video } from '@remotion/media';
import { Player } from '@remotion/player';
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer';
import { AbsoluteFill, Freeze, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { getPosterTemplate, renderPosterCanvas } from '../../js/poster-renderer.js';
import shortlistedMusicUrl from '../assets/shortlisted-background.m4a?url';
import ascensionMusicUrl from '../assets/scott-buckley-ascension.mp3?url';
import victorLuxMusicUrl from '../assets/scott-buckley-victor-lux.mp3?url';
import riseAboveMusicUrl from '../assets/scott-buckley-rise-above.mp3?url';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Cloud,
  Download,
  Film,
  FolderOpen,
  ImagePlus,
  Layers,
  MoveDown,
  MoveUp,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';

type Card = {
  id: string;
  code?: string;
  image?: string;
  team: string;
  title: string;
  domain: string;
  isRenderedPoster?: boolean;
};

type Project = {
  id: string;
  name: string;
  updatedAt: number;
  stage: number;
  intro: string;
  outro: string;
  title: string;
  subtitle: string;
  activity: string;
  domains: string[];
  titleAnimations?: Record<string, string>;
  transition: string;
  transitionSequence?: string[];
  transitionRepeatEvery: number;
  musicTrackId?: MusicTrackId;
  cardDurationSeconds: number;
  cards: Card[];
  sourceDomainCode?: string;
};

type StoredClip = { id: string; name: string; blob: Blob };
type ClipAsset = {
  id: string;
  kind: 'intro' | 'outro';
  number: number;
  name: string;
  src: string;
  durationSeconds: number;
  durationInFrames: number;
  stored: boolean;
};
type PosterRecord = {
  code?: string;
  name?: string;
  className?: string;
  filename?: string;
  imageBlob?: Blob | null;
  imageDataUrl?: string;
  posterDataUrl?: string;
  image?: string;
  fit?: 'contain' | 'cover';
  isStarter?: boolean;
};

type PosterTemplateImage = HTMLImageElement & { exhibitionTemplateId?: string };

type TemplateManifest = {
  intros: Array<{ id: string; filename: string; durationSeconds: number }>;
  outros: Array<{ id: string; filename: string; durationSeconds: number }>;
};

const DB = 'expo-motion-studio';
const STORE = 'projects';
const CLIP_STORE = 'clips';
const POSTER_DB = 'thematic-exhibition-poster-studio';
const POSTER_STORE = 'state';
const POSTER_KEY = 'app';
const fps = 30;
const W = 1920;
const H = 1080;
type MusicTrackId = 'original' | 'ascension' | 'victor-lux' | 'rise-above';
type MusicTrack = { id: MusicTrackId; title: string; description: string; attribution?: string; src: string; sourceUrl?: string };
const musicTracks: MusicTrack[] = [
  { id: 'original', title: '原有配樂', description: '維持你原本提供的背景音樂。', src: shortlistedMusicUrl },
  { id: 'ascension', title: 'Ascension', description: '宏闊管弦樂帶著些微憂傷與希望，合成器推動旋律前行，適合呈現克服逆境的情緒。', attribution: "'Ascension' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au", src: ascensionMusicUrl, sourceUrl: 'https://www.scottbuckley.com.au/library/ascension/' },
  { id: 'victor-lux', title: 'Victor Lux', description: '莊嚴、鼓舞人心的管弦樂；銅管、合唱與高揚弦樂，最後以宏大的交響樂收束。', attribution: "'Victor Lux' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au", src: victorLuxMusicUrl, sourceUrl: 'https://www.scottbuckley.com.au/library/victor-lux/' },
  { id: 'rise-above', title: 'Rise Above', description: '振奮、鼓舞人心的管弦樂，帶來向上突破、鼓起動力的氛圍。', attribution: "'Rise Above' by Scott Buckley - released under CC-BY 4.0. www.scottbuckley.com.au", src: riseAboveMusicUrl, sourceUrl: 'https://www.scottbuckley.com.au/library/rise-above/' },
];
const defaultCardDurationSeconds = 3;
const minCardDurationSeconds = 1;
const maxCardDurationSeconds = 30;
const defaultTransitionRepeatEvery = 1;
const maxTransitionRepeatEvery = 30;
const domains = [
  ['A', '企業智慧化'],
  ['B', '數位內容與多媒體應用'],
  ['C', '網路應用與資通安全'],
  ['D', '嵌入式系統與行動計算'],
  ['E', '智慧運算創新應用'],
  ['F', '智慧流通應用與研究'],
  ['N', '進修部'],
] as const;
const transitionOptions = [
  { id: 'fade', value: '淡入淡出', description: '柔和淡入、淡出' },
  { id: 'slide', value: '滑動切換', description: '從右側滑入' },
  { id: 'zoom', value: '柔和縮放', description: '由小放大進場' },
  { id: 'direct', value: '直接切換', description: '俐落快速換頁' },
  { id: 'wipe', value: '遮罩推進', description: '由左向右揭示' },
  { id: 'blur', value: '模糊溶解', description: '清晰與柔焦交替' },
  { id: 'vertical', value: '垂直滑入', description: '由下往上帶入' },
  { id: 'flip', value: '立體翻轉', description: '以 3D 翻面轉場' },
] as const;
const getTransitionId = (value?: string) => transitionOptions.find(option => option.value === value)?.id || 'fade';
const introTitleAnimationOptions = [
  { id: 'rise', name: '淡入上浮', description: '輕柔浮現', symbol: '↑' },
  { id: 'tracking', name: '字距收束', description: '科技感聚合', symbol: '↔' },
  { id: 'slide', name: '橫向滑入', description: '俐落帶入', symbol: '→' },
  { id: 'wipe', name: '光幕揭示', description: '由左展開', symbol: '▰' },
  { id: 'zoom', name: '聚焦放大', description: '主視覺聚焦', symbol: '⊕' },
  { id: 'typewriter', name: '逐字顯現', description: '依序呈現', symbol: 'Aa' },
] as const;
type IntroTitleAnimationId = typeof introTitleAnimationOptions[number]['id'];
type BusyAction = 'poster-import' | 'json-import' | 'template-upload' | null;
const introTitleAnimationRecommendations: Record<string, { animationId: IntroTitleAnimationId; reason: string }> = {
  'intro-1': { animationId: 'rise', reason: '配合地球主視覺，讓領域標題輕柔浮現' },
  'intro-2': { animationId: 'tracking', reason: '配合星空與科技線條，讓字距聚合成形' },
  'intro-3': { animationId: 'slide', reason: '配合太空場景節奏，俐落帶入標題' },
  'intro-4': { animationId: 'wipe', reason: '配合淺色極簡畫面，清楚揭示文字' },
  'intro-5': { animationId: 'zoom', reason: '配合獎盃與煙火主視覺，聚焦領域名稱' },
};
const introTemplates = [1, 2, 3, 4, 5].map(number => ({
  id: `intro-${number}`,
  number,
  kind: 'intro' as const,
  title: `片頭方案${['一', '二', '三', '四', '五'][number - 1]}`,
}));
const outroTemplates = [1, 2, 3, 4].map(number => ({
  id: `outro-${number}`,
  number,
  kind: 'outro' as const,
  title: `片尾方案${['一', '二', '三', '四'][number - 1]}`,
}));
const allTemplateDefinitions = [...introTemplates, ...outroTemplates];

// The default thumbnails are frames captured from the bundled MP4s. A locally
// replaced clip instead gets a fresh thumbnail from its own video source.
const templateThumbnails = import.meta.glob<string>('../templates/thumbnails/*.jpg', { eager: true, query: '?url', import: 'default' });
const thumbnailPosition: Record<string, number> = {
  'intro-1': 0.2, 'intro-2': 0.2, 'intro-3': 0.2, 'intro-4': 0.8, 'intro-5': 0.2,
  'outro-1': 0.5, 'outro-2': 0.8, 'outro-3': 0.5, 'outro-4': 0.5,
};

type IntroFieldLayout = {
  startSeconds: number;
  endSeconds: number;
  left: number;
  top: number;
  width: number;
  height: number;
  background: string;
  color: string;
  fontSize: number;
  border: string;
  borderRadius: number;
  shadow: string;
  textShadow?: string;
  overline?: boolean;
  replacesEmbeddedTitle?: boolean;
  titleOffsetY?: number;
  animationFrames?: number;
};

// Positions and time windows are matched to the five supplied intro clips.
// Clips 2–5 have a baked-in "企業智慧化" title; their masks replace that line.
const introFieldLayouts: Record<string, IntroFieldLayout> = {
  'intro-1': { startSeconds: 0.7, endSeconds: 2.4, left: 21, top: 85.5, width: 58, height: 12.5, background: 'rgba(4, 13, 27, 0.72)', color: '#fff8e8', fontSize: 72, border: '1px solid rgba(214, 182, 110, 0.82)', borderRadius: 30, shadow: '0 8px 32px rgba(0,0,0,0.48)' },
  // The source title begins emerging near 6.57 s and is complete by about 6.9 s.
  // Start one frame earlier, then match its full appearance with a 9-frame entrance.
  'intro-2': { startSeconds: 6.55, endSeconds: 10.2, left: 23, top: 31, width: 54, height: 28, background: '#07172f', color: '#f7c932', fontSize: 90, border: '1px solid rgba(242, 206, 108, 0.68)', borderRadius: 20, shadow: '0 0 28px rgba(0,0,0,0.42)', replacesEmbeddedTitle: true, animationFrames: 9 },
  'intro-3': { startSeconds: 6.35, endSeconds: 9.3, left: 34, top: 52.5, width: 37, height: 16, background: '#07142c', color: '#ffd13a', fontSize: 86, border: '0 solid transparent', borderRadius: 18, shadow: 'none', textShadow: '0 0 20px rgba(255, 204, 54, 0.28), 0 2px 10px rgba(0, 0, 0, 0.45)', replacesEmbeddedTitle: true, titleOffsetY: 16, animationFrames: 9 },
  'intro-4': { startSeconds: 9.7, endSeconds: 12.55, left: 30, top: 49, width: 40, height: 13, background: '#fef1cf', color: '#073e75', fontSize: 86, border: '0 solid transparent', borderRadius: 999, shadow: 'none', textShadow: '0 2px 10px rgba(7, 62, 117, 0.18)', animationFrames: 9 },
  'intro-5': { startSeconds: 6.55, endSeconds: 10.2, left: 32, top: 75.5, width: 44, height: 15, background: '#1b1d28', color: '#fff9e8', fontSize: 64, border: '1px solid rgba(240, 215, 160, 0.62)', borderRadius: 14, shadow: '0 8px 30px rgba(0,0,0,0.4)', replacesEmbeddedTitle: true },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const domainForCode = (code: string) => domains.find(([prefix]) => prefix === String(code || '').trim().charAt(0).toUpperCase());
const domainName = (code: string) => domainForCode(code)?.[1] || '未分類';
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '專題展影片';
const getCardDurationSeconds = (value?: number) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0
    ? Math.min(maxCardDurationSeconds, Math.max(minCardDurationSeconds, seconds))
    : defaultCardDurationSeconds;
};
const getCardDurationInFrames = (value?: number) => Math.round(getCardDurationSeconds(value) * fps);
const getTransitionRepeatEvery = (value?: number) => {
  const count = Number(value);
  return Number.isFinite(count) && count > 0
    ? Math.min(maxTransitionRepeatEvery, Math.max(1, Math.round(count)))
    : defaultTransitionRepeatEvery;
};
const getMusicTrack = (project: Project) => musicTracks.find(track => track.id === project.musicTrackId) || musicTracks[0];
const getTransitionSequence = (project: Project) => {
  const count = getTransitionRepeatEvery(project.transitionRepeatEvery);
  const saved = Array.isArray(project.transitionSequence) ? project.transitionSequence : [];
  const fallbackId = getTransitionId(project.transition);
  return Array.from({ length: count }, (_, index) => {
    const savedId = saved[index];
    return transitionOptions.some(option => option.id === savedId) ? savedId : index === 0 ? fallbackId : 'direct';
  });
};
const getIntroTitleAnimationId = (project: Project, introId = project.intro): IntroTitleAnimationId => {
  const saved = project.titleAnimations?.[introId];
  if (introTitleAnimationOptions.some(option => option.id === saved)) return saved as IntroTitleAnimationId;
  return introTitleAnimationRecommendations[introId]?.animationId || 'rise';
};

function openStudioDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) return reject(new Error('此瀏覽器不支援 IndexedDB 本機儲存。'));
    const request = indexedDB.open(DB, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(CLIP_STORE)) db.createObjectStore(CLIP_STORE, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('無法開啟影片工作室資料庫。'));
  });
}

async function allProjects(): Promise<Project[]> {
  const db = await openStudioDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    request.onsuccess = () => resolve((request.result as Project[]).sort((a, b) => b.updatedAt - a.updatedAt));
    request.onerror = () => reject(request.error || new Error('無法讀取影片專案。'));
  });
}

async function putProject(project: Project): Promise<void> {
  const db = await openStudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(project);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('無法儲存影片專案。'));
    tx.onabort = () => reject(tx.error || new Error('影片專案儲存中斷。'));
  });
}

async function removeProject(id: string): Promise<void> {
  const db = await openStudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('無法刪除影片專案。'));
  });
}

async function allStoredClips(): Promise<StoredClip[]> {
  const db = await openStudioDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(CLIP_STORE, 'readonly').objectStore(CLIP_STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredClip[]);
    request.onerror = () => reject(request.error || new Error('無法讀取片頭／片尾素材。'));
  });
}

async function putStoredClip(clip: StoredClip): Promise<void> {
  const db = await openStudioDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(CLIP_STORE, 'readwrite');
    tx.objectStore(CLIP_STORE).put(clip);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('無法儲存模板影片。'));
  });
}

function makeProject(name: string, categoryCode?: string, cards: Card[] = []): Project {
  const label = categoryCode ? domainName(categoryCode) : domains[0][1];
  return {
    id: uid(),
    name,
    updatedAt: Date.now(),
    stage: 1,
    intro: 'intro-1',
    outro: 'outro-1',
    title: categoryCode ? `${categoryCode}｜${label}` : '2026 專題成果展',
    subtitle: '入圍專題作品',
    activity: '國立臺中科技大學｜專題成果展',
    domains: [label],
    transition: '淡入淡出',
    transitionRepeatEvery: defaultTransitionRepeatEvery,
    musicTrackId: 'original',
    cardDurationSeconds: defaultCardDurationSeconds,
    cards,
    sourceDomainCode: categoryCode,
  };
}

function blankCard(domain: string): Card {
  return { id: uid(), team: '', title: '', domain };
}

function readVideoDuration(src: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    const timer = window.setTimeout(() => finish(new Error('讀取影片片長逾時，請確認 MP4 檔案可由瀏覽器播放。')), 15000);
    const cleanup = () => {
      window.clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
    const finish = (error?: Error) => {
      const duration = video.duration;
      cleanup();
      if (error) reject(error);
      else if (!Number.isFinite(duration) || duration <= 0) reject(new Error('無法讀取 MP4 片長。'));
      else resolve(duration);
    };
    video.onloadedmetadata = () => finish();
    video.onerror = () => finish(new Error('這個 MP4 無法由瀏覽器解碼，請確認 H.264 格式。'));
    video.src = src;
    video.load();
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error('無法讀取作品圖片。'));
    reader.readAsDataURL(blob);
  });
}

function dataUrlFromRecord(record: PosterRecord): Promise<string | undefined> | string | undefined {
  if (typeof record.imageDataUrl === 'string' && record.imageDataUrl.startsWith('data:image/')) return record.imageDataUrl;
  if (typeof record.image === 'string' && record.image.startsWith('data:image/')) return record.image;
  if (record.imageBlob instanceof Blob) return blobToDataUrl(record.imageBlob);
  return undefined;
}

function loadImageDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('無法解碼原海報製作室的作品圖片。'));
    image.src = src;
  });
}

function loadVideoPosterTemplate(templateId: string): Promise<PosterTemplateImage> {
  const config = getPosterTemplate(templateId);
  const assetPath = config.src.replace(/^\.\//, '');
  const src = new URL(`../${assetPath}`, window.location.href).toString();
  return new Promise((resolve, reject) => {
    const image = new Image() as PosterTemplateImage;
    image.exhibitionTemplateId = config.id;
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`無法載入「${config.name}」海報模板。`));
    image.src = src;
  });
}

async function renderImportedPoster(record: PosterRecord, imageDataUrl: string, template: PosterTemplateImage): Promise<string> {
  const image = await loadImageDataUrl(imageDataUrl);
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  renderPosterCanvas(canvas, { ...record, image }, template, image);
  return canvas.toDataURL('image/png');
}

async function readPosterDatabase(): Promise<{ records: PosterRecord[]; templateId: string }> {
  if ('databases' in indexedDB && typeof indexedDB.databases === 'function') {
    const databases = await indexedDB.databases();
    if (!databases.some(database => database.name === POSTER_DB)) {
      throw new Error('此網站來源尚無海報資料庫。若資料在另一個網站或網域，請從原海報製作室匯出 JSON 再匯入。');
    }
  }
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(POSTER_DB);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('無法開啟原海報製作室的本機資料。'));
  });
  if (!db.objectStoreNames.contains(POSTER_STORE)) {
    db.close();
    throw new Error('這個來源的海報資料庫尚未初始化；請先開啟海報製作室，或使用 JSON 匯入。');
  }
  const saved = await new Promise<{ records?: PosterRecord[]; templateId?: string }>((resolve, reject) => {
    const request = db.transaction(POSTER_STORE, 'readonly').objectStore(POSTER_STORE).get(POSTER_KEY);
    request.onsuccess = () => resolve(request.result || {});
    request.onerror = () => reject(request.error || new Error('無法讀取海報製作室資料。'));
  });
  db.close();
  return { records: (saved.records || []).filter(record => !record.isStarter), templateId: saved.templateId || 'original' };
}

function manifestUrl(): string {
  return new URL('../expo-templates/manifest.json', window.location.href).toString();
}

function staticTemplateUrl(filename: string): string {
  return new URL(`../expo-templates/${filename}`, window.location.href).toString();
}

function publicManifest(): Promise<TemplateManifest | null> {
  return fetch(manifestUrl(), { cache: 'no-cache' })
    .then(response => response.ok ? response.json() as Promise<TemplateManifest> : null)
    .catch(() => null);
}

function TransitionThumbnail({ option, active, run }: { option: typeof transitionOptions[number]; active: boolean; run: number }) {
  return (
    <div className={`transition-thumbnail effect-${option.id}${active ? ' is-animated' : ''}`} aria-hidden="true">
      <div className="transition-frame">
        <div className="transition-sample-card before"><span>02</span><b>作品 A</b></div>
        <div key={active ? run : 0} className="transition-sample-card after"><span>03</span><b>作品 B</b></div>
        <span className="transition-direction">{option.id === 'vertical' ? '↑' : option.id === 'flip' ? '↻' : '→'}</span>
      </div>
      <span className="transition-caption"><strong>{option.value}</strong><small>{option.description}</small></span>
    </div>
  );
}

function CardScene({ card, index, total, transition, durationInFrames, transparentBackground = false, boundaryOut = false }: { card: Card; index: number; total: number; transition: string; durationInFrames: number; transparentBackground?: boolean; boundaryOut?: boolean }) {
  const frame = useCurrentFrame();
  const fadeInFrames = Math.min(Math.round(fps * 0.35), Math.max(1, Math.floor(durationInFrames / 4)));
  const fadeOutFrames = boundaryOut ? Math.min(12, fadeInFrames + 2) : fadeInFrames;
  const enterFrames = Math.min(12, Math.max(1, Math.floor(durationInFrames / 4)));
  const exitStart = durationInFrames - fadeOutFrames - 1;
  const fade = interpolate(frame, [0, fadeInFrames, exitStart, durationInFrames - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const showRenderedPoster = Boolean(card.image && card.isRenderedPoster);
  const enter = interpolate(frame, [0, enterFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const exit = interpolate(frame, [exitStart, durationInFrames - 1], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const transform = transition === '滑動切換'
    ? `translateX(${interpolate(frame, [0, enterFrames], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`
      : transition === '柔和縮放'
        ? `scale(${interpolate(frame, [0, enterFrames], [0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`
        : transition === '垂直滑入'
          ? `translateY(${interpolate(frame, [0, enterFrames], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`
          : transition === '立體翻轉'
            ? `perspective(1000px) rotateY(${interpolate(frame, [0, enterFrames, exitStart, durationInFrames - 1], [-70, 0, 0, 55], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}deg)`
            : 'none';
  const opacity = transition === '直接切換' || transition === '遮罩推進'
    ? 1
    : transition === '立體翻轉'
      ? interpolate(frame, [0, enterFrames, exitStart, durationInFrames - 1], [0.2, 1, 1, 0.2], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
      : fade;
  const clipPath = transition === '遮罩推進'
    ? `inset(0 ${frame >= exitStart ? exit * 100 : 100 - enter * 100}% 0 0)`
    : undefined;
  const filter = transition === '模糊溶解'
    ? `blur(${interpolate(frame, [0, enterFrames, exitStart, durationInFrames - 1], [12, 0, 0, 12], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`
    : undefined;
  return (
    <AbsoluteFill style={{ background: transparentBackground ? 'transparent' : '#07152d', color: '#fff', fontFamily: 'Arial, "Noto Sans TC", sans-serif', overflow: 'hidden' }}>
      {card.image && !showRenderedPoster && <img src={card.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.24 }} />}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 90, textAlign: 'center', opacity, transform, clipPath, filter, transformOrigin: transition === '立體翻轉' ? 'left center' : undefined }}>
        {showRenderedPoster && <img src={card.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} />}
        {!showRenderedPoster && <>
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #101f3d99, #07152d33)' }} />
          <div style={{ fontSize: 24, letterSpacing: 6, color: '#d6b66e', marginBottom: 28 }}>{card.domain}</div>
          {card.code && <div style={{ fontSize: 24, opacity: 0.72, marginBottom: 14 }}>編號 {card.code}</div>}
          <div style={{ fontSize: 34, opacity: 0.82, marginBottom: 18 }}>{card.team || '入圍作品'}</div>
          <div style={{ fontSize: 68, fontWeight: 750, maxWidth: 1450, lineHeight: 1.3 }}>{card.title || '作品名稱'}</div>
        </>}
        <div style={{ position: 'absolute', bottom: showRenderedPoster ? 34 : 76, right: showRenderedPoster ? 42 : undefined, fontSize: showRenderedPoster ? 18 : 22, opacity: showRenderedPoster ? 0.95 : 0.62, background: showRenderedPoster ? '#07152dcc' : 'transparent', borderRadius: 6, padding: showRenderedPoster ? '8px 12px' : 0 }}>{String(index + 1).padStart(2, '0')} / {total}</div>
      </AbsoluteFill>
      {!showRenderedPoster && <div style={{ position: 'absolute', right: 48, bottom: 40, fontSize: 18, opacity: 0.5 }}>EXPO MOTION</div>}
    </AbsoluteFill>
  );
}

function IntroFieldOverlay({ project, layout, durationInFrames, animationId }: { project: Project; layout: IntroFieldLayout; durationInFrames: number; animationId: IntroTitleAnimationId }) {
  const frame = useCurrentFrame();
  const domain = project.domains[0] || (project.sourceDomainCode ? domainName(project.sourceDomainCode) : '專題成果展');
  const fieldName = project.sourceDomainCode ? `${project.sourceDomainCode}｜${domain}` : domain;
  const chars = Array.from(fieldName);
  const horizontalPadding = layout.width < 35 ? 16 : 28;
  const verticalPadding = layout.width < 35 ? 8 : 12;
  const letterSpacing = layout.width < 35 ? 0 : 2;
  const textWidthUnits = chars.reduce((width, char) => width + (char.codePointAt(0)! < 256 ? 0.68 : 1), 0);
  const availableWidth = W * layout.width / 100 - horizontalPadding * 2 - 2;
  const widthLimitedFontSize = Math.floor((availableWidth - letterSpacing * Math.max(0, chars.length - 1) - 12) / Math.max(1, textWidthUnits));
  const availableHeight = H * layout.height / 100 - verticalPadding * 2 - 2;
  const heightLimitedFontSize = Math.floor(availableHeight / 1.2);
  const fontSize = Math.min(layout.fontSize, widthLimitedFontSize, heightLimitedFontSize);
  const fadeFrames = Math.min(7, Math.floor(durationInFrames / 4));
  const opacity = layout.replacesEmbeddedTitle ? 1 : interpolate(frame, [0, fadeFrames, durationInFrames - fadeFrames, durationInFrames], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const animationFrames = layout.animationFrames ?? Math.min(24, Math.max(10, Math.floor(durationInFrames / 3)));
  const progress = interpolate(frame, [0, animationFrames], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const titleOpacity = animationId === 'typewriter' ? 1 : progress;
  let titleTransform = animationId === 'rise'
    ? `translateY(${(1 - progress) * 36}px)`
    : animationId === 'slide'
      ? `translateX(${(1 - progress) * 70}px)`
      : animationId === 'zoom'
        ? `scale(${0.72 + progress * 0.28})`
        : `translateY(${(1 - progress) * 5}px)`;
  if (layout.titleOffsetY) titleTransform += ` translateY(${layout.titleOffsetY}px)`;
  const titleClipPath = animationId === 'wipe' ? `inset(0 ${(1 - progress) * 100}% 0 0)` : undefined;
  const animatedLetterSpacing = animationId === 'tracking'
    ? interpolate(frame, [0, animationFrames], [Math.max(18, letterSpacing + 12), letterSpacing], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
    : letterSpacing;
  const characterStep = Math.max(1, Math.floor(animationFrames / Math.max(1, chars.length)));
  return (
    <div style={{ position: 'absolute', left: `${layout.left}%`, top: `${layout.top}%`, width: `${layout.width}%`, height: `${layout.height}%`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: layout.overline ? 5 : 0, padding: layout.width < 35 ? '8px 16px' : '12px 28px', overflow: 'hidden', background: layout.background, color: layout.color, border: layout.border, borderRadius: layout.borderRadius, boxShadow: layout.shadow, opacity, fontFamily: 'Arial, "Noto Sans TC", sans-serif', textAlign: 'center' }}>
      {layout.overline && <span style={{ fontSize: Math.max(14, fontSize * 0.38), fontWeight: 600, letterSpacing: 4, lineHeight: 1.1, opacity: 0.78 }}>本片領域</span>}
      <span aria-label={fieldName} style={{ display: 'inline-flex', fontSize, fontWeight: 800, lineHeight: 1.2, letterSpacing: animatedLetterSpacing, whiteSpace: 'nowrap', textShadow: layout.textShadow || (layout.background.startsWith('rgba') ? '0 2px 12px rgba(0,0,0,0.28)' : 'none'), opacity: titleOpacity, transform: titleTransform, clipPath: titleClipPath }}>
        {animationId === 'typewriter' ? chars.map((char, index) => {
          const characterProgress = interpolate(frame, [index * characterStep, (index + 1) * characterStep], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
          return <span key={`${char}-${index}`} style={{ opacity: characterProgress, transform: `translateY(${(1 - characterProgress) * 5}px)` }}>{char}</span>;
        }) : fieldName}
      </span>
    </div>
  );
}

function IntroTitlePreviewComposition({ project, openingClip, animationId }: { project: Project; openingClip: ClipAsset; animationId: IntroTitleAnimationId }) {
  const fieldLayout = introFieldLayouts[openingClip.id];
  const overlayStart = fieldLayout ? Math.min(openingClip.durationInFrames, Math.round(fieldLayout.startSeconds * fps)) : openingClip.durationInFrames;
  const overlayEnd = fieldLayout ? Math.min(openingClip.durationInFrames, Math.round(fieldLayout.endSeconds * fps)) : openingClip.durationInFrames;
  const overlayDuration = Math.max(0, overlayEnd - overlayStart);
  return (
    <AbsoluteFill style={{ backgroundColor: '#07152d', overflow: 'hidden' }}>
      <Video src={openingClip.src} durationInFrames={openingClip.durationInFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} volume={1} />
      {fieldLayout && overlayDuration > 0 && <Sequence from={overlayStart} durationInFrames={overlayDuration} name="片頭領域名稱">
        <IntroFieldOverlay project={project} layout={fieldLayout} durationInFrames={overlayDuration} animationId={animationId} />
      </Sequence>}
    </AbsoluteFill>
  );
}

function OutroClipWithTailFrame({ clip }: { clip: ClipAsset }) {
  const frame = useCurrentFrame();
  const video = <Video src={clip.src} durationInFrames={clip.durationInFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} volume={1} />;
  return frame < clip.durationInFrames ? video : <Freeze frame={clip.durationInFrames - 1}>{video}</Freeze>;
}

function MusicAttributionLabel({ attribution }: { attribution: string }) {
  return <div style={{ position: 'absolute', left: 34, bottom: 28, maxWidth: 'calc(100% - 68px)', padding: '7px 12px', border: '1px solid rgba(255,255,255,.5)', borderRadius: 5, background: 'rgba(4,13,27,.82)', color: '#fff', fontFamily: 'Arial, sans-serif', fontSize: 18, lineHeight: 1.3, letterSpacing: 0, textShadow: '0 1px 3px rgba(0,0,0,.55)' }}>{attribution}</div>;
}

export function ExpoVideoComposition({ project, openingClip, endingClip }: { project: Project; openingClip: ClipAsset; endingClip: ClipAsset }) {
  const openingFrames = openingClip.durationInFrames;
  const cardsStart = openingFrames;
  const cardDurationInFrames = getCardDurationInFrames(project.cardDurationSeconds);
  const cardsDurationInFrames = project.cards.length * cardDurationInFrames;
  const boundaryOverlapFrames = project.cards.length > 0 ? Math.min(12, cardDurationInFrames) : 0;
  const endingStart = cardsStart + cardsDurationInFrames - boundaryOverlapFrames;
  const musicDurationInFrames = Math.max(0, cardsDurationInFrames - boundaryOverlapFrames);
  const musicFadeFrames = Math.min(Math.round(fps * 1.2), Math.floor(musicDurationInFrames / 4));
  const transitionRepeatEvery = getTransitionRepeatEvery(project.transitionRepeatEvery);
  const transitionSequence = getTransitionSequence(project);
  const musicTrack = getMusicTrack(project);
  const titleAnimationId = getIntroTitleAnimationId(project, openingClip.id);
  return (
    <AbsoluteFill style={{ backgroundColor: '#07152d', overflow: 'hidden' }}>
      <Sequence from={0} durationInFrames={openingFrames} name="原始片頭">
        <IntroTitlePreviewComposition project={project} openingClip={openingClip} animationId={titleAnimationId} />
      </Sequence>
      {boundaryOverlapFrames > 0 && <Sequence from={endingStart} durationInFrames={endingClip.durationInFrames + boundaryOverlapFrames} name="片尾轉場與原始片尾">
        <OutroClipWithTailFrame clip={endingClip} />
      </Sequence>}
      {project.cards.map((card, index) => {
        const isFirst = index === 0;
        const isLast = index === project.cards.length - 1;
        const overlapAtStart = isFirst ? boundaryOverlapFrames : 0;
        const transitionId = transitionSequence[index % transitionRepeatEvery];
        const selectedTransition = transitionOptions.find(option => option.id === transitionId)?.value || '淡入淡出';
        const transition = (isFirst || isLast) && selectedTransition === '直接切換' ? '淡入淡出' : selectedTransition;
        return <Sequence key={card.id} from={cardsStart + index * cardDurationInFrames - overlapAtStart} durationInFrames={cardDurationInFrames + overlapAtStart} name={`作品 ${index + 1}`}>
          <CardScene card={card} index={index} total={project.cards.length} transition={transition} durationInFrames={cardDurationInFrames + overlapAtStart} transparentBackground={isFirst || isLast} boundaryOut={isLast} />
        </Sequence>;
      })}
      {musicDurationInFrames > 0 && <Sequence from={cardsStart} durationInFrames={musicDurationInFrames} name="入圍作品背景音樂">
        <Audio
          src={musicTrack.src}
          loop
          volume={frame => interpolate(frame, [0, musicFadeFrames, musicDurationInFrames - musicFadeFrames, musicDurationInFrames - 1], [0, 0.35, 0.35, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
        />
        {musicTrack.attribution && <MusicAttributionLabel attribution={musicTrack.attribution} />}
      </Sequence>}
      {boundaryOverlapFrames === 0 && <Sequence from={endingStart} durationInFrames={endingClip.durationInFrames} name="原始片尾">
        <Video src={endingClip.src} durationInFrames={endingClip.durationInFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} volume={1} />
      </Sequence>}
    </AbsoluteFill>
  );
}

function StageIcon({ stage, number }: { stage: number; number: number }) {
  return <span className={`step-number ${stage === number ? 'current' : stage > number ? 'done' : ''}`}>{stage > number ? <Check size={15} /> : number}</span>;
}

function TemplateThumbnail({ clip }: { clip?: ClipAsset }) {
  const [customThumbnail, setCustomThumbnail] = useState<{ src: string; image: string } | null>(null);
  const [failedSrc, setFailedSrc] = useState('');

  useEffect(() => {
    if (!clip?.stored) return;
    let cancelled = false;
    const video = document.createElement('video');
    video.muted = true;
    video.preload = 'auto';
    const fail = () => { if (!cancelled) setFailedSrc(clip.src); };
    const timeout = window.setTimeout(fail, 15000);
    video.onloadedmetadata = () => { video.currentTime = Math.min(clip.durationSeconds * (thumbnailPosition[clip.id] || 0.2), Math.max(0, video.duration - 0.1)); };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 180;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('無法擷取影片畫格');
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        if (!cancelled) setCustomThumbnail({ src: clip.src, image: canvas.toDataURL('image/jpeg', 0.85) });
        window.clearTimeout(timeout);
      } catch { fail(); }
    };
    video.onerror = fail;
    video.src = clip.src;
    video.load();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
    };
  }, [clip?.id, clip?.src, clip?.stored, clip?.durationSeconds]);

  const image = clip?.stored
    ? customThumbnail?.src === clip.src ? customThumbnail.image : undefined
    : clip ? templateThumbnails[`../templates/thumbnails/${clip.id}.jpg`] : undefined;
  return <div className="template-visual">{image
    ? <img src={image} alt="" />
    : <span>{!clip ? '尚未載入影片' : failedSrc === clip.src ? '無法顯示縮圖，請點選播放影片' : '正在載入影片縮圖…'}</span>}
  </div>;
}

function IntroTitleAnimationThumbnail({ option, clip, layout, active, run }: { option: typeof introTitleAnimationOptions[number]; clip?: ClipAsset; layout: IntroFieldLayout; active: boolean; run: number }) {
  const image = clip && !clip.stored ? templateThumbnails[`../templates/thumbnails/${clip.id}.jpg`] : undefined;
  const textFontSize = Math.min(11, Math.max(5, 120 * layout.width / 100 / '領域名稱'.length));
  return <>
    <div className={`title-animation-thumbnail sample-${option.id}${active ? ' is-animated' : ''}`} style={image ? { backgroundImage: `linear-gradient(130deg, #07152d45, #07152d16), url("${image}")` } : undefined}>
      <div className="title-animation-sample-plate" style={{ left: `${layout.left}%`, top: `${layout.top}%`, width: `${layout.width}%`, height: `${layout.height}%`, background: layout.background, color: layout.color, border: layout.border, borderRadius: layout.borderRadius, boxShadow: layout.shadow, fontSize: textFontSize }}>
        <span key={active ? run : 0} className={`title-animation-sample-text sample-${option.id}`}>領域名稱</span>
      </div>
      <span className="title-animation-symbol" aria-hidden="true">{option.symbol}</span>
    </div>
    <span className="title-animation-caption"><strong>{option.name}</strong><small>{option.description}</small></span>
  </>;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [galleryCount, setGalleryCount] = useState(0);
  const [clipAssets, setClipAssets] = useState<ClipAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewTemplateId, setPreviewTemplateId] = useState('');
  const [titleAnimationDemo, setTitleAnimationDemo] = useState<{ introId: string; animationId: IntroTitleAnimationId; run: number } | null>(null);
  const [transitionDemo, setTransitionDemo] = useState<{ id: string; run: number } | null>(null);
  const [activeTransitionSlot, setActiveTransitionSlot] = useState(0);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);
  const [busyProgress, setBusyProgress] = useState({ completed: 0, total: 0 });
  const uploadRef = useRef<HTMLInputElement>(null);
  const clipUploadRef = useRef<HTMLInputElement>(null);
  const jsonImportRef = useRef<HTMLInputElement>(null);
  const clipUrlsRef = useRef(new Map<string, string>());

  const refresh = useCallback(async () => {
    try {
      setProjects(await allProjects());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '無法讀取影片專案。');
    }
  }, []);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    let cancelled = false;
    void readPosterDatabase()
      .then(({ records }) => { if (!cancelled) setGalleryCount(records.length); })
      .catch(() => { if (!cancelled) setGalleryCount(0); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    const initialize = async () => {
      try {
        const [savedProjects, storedClips, manifest] = await Promise.all([allProjects(), allStoredClips(), publicManifest()]);
        const storedById = new Map(storedClips.map(clip => [clip.id, clip]));
        const manifestById = new Map([...(manifest?.intros || []), ...(manifest?.outros || [])].map(item => [item.id, item]));
        const loaded: ClipAsset[] = [];
        for (const definition of allTemplateDefinitions) {
          const stored = storedById.get(definition.id);
          if (stored) {
            const src = URL.createObjectURL(stored.blob);
            urls.push(src);
            try {
              const durationSeconds = await readVideoDuration(src);
              loaded.push({ ...definition, name: stored.name, src, durationSeconds, durationInFrames: Math.ceil(durationSeconds * fps), stored: true });
              continue;
            } catch {
              URL.revokeObjectURL(src);
              urls.splice(urls.indexOf(src), 1);
            }
          }
          const asset = manifestById.get(definition.id);
          if (asset) {
            const src = staticTemplateUrl(asset.filename);
            loaded.push({ ...definition, name: definition.title, src, durationSeconds: asset.durationSeconds, durationInFrames: Math.ceil(asset.durationSeconds * fps), stored: false });
          }
        }
        if (!cancelled) {
          setProjects(savedProjects.sort((a, b) => b.updatedAt - a.updatedAt));
          setClipAssets(loaded);
          for (const asset of loaded.filter(item => item.stored)) clipUrlsRef.current.set(asset.id, asset.src);
        } else urls.forEach(url => URL.revokeObjectURL(url));
      } catch (caught) {
        if (!cancelled) setError(caught instanceof Error ? caught.message : '無法準備工作室資料。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void initialize();
    return () => {
      cancelled = true;
      urls.forEach(url => URL.revokeObjectURL(url));
      clipUrlsRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!project) return;
    const timeout = window.setTimeout(() => {
      const next = { ...project, updatedAt: Date.now() };
      putProject(next).then(() => {
        refresh();
      }).catch(caught => setError(caught instanceof Error ? caught.message : '自動儲存失敗，請確認瀏覽器儲存空間。'));
    }, 450);
    return () => window.clearTimeout(timeout);
  }, [project, refresh]);

  useEffect(() => () => {
    for (const url of clipUrlsRef.current.values()) URL.revokeObjectURL(url);
    clipUrlsRef.current.clear();
  }, []);

  const update = (fn: (current: Project) => Project) => setProject(current => current ? fn(current) : current);
  const go = (stage: number) => {
    update(current => ({ ...current, stage }));
  };
  const findClip = (id: string) => clipAssets.find(clip => clip.id === id);
  const selectedOpening = project ? findClip(project.intro) : undefined;
  const selectedEnding = project ? findClip(project.outro) : undefined;
  const selectedMusicTrack = project ? getMusicTrack(project) : musicTracks[0];
  const selectedTitleAnimation = project ? getIntroTitleAnimationId(project) : 'rise';
  const selectedTransitionSequence = project ? getTransitionSequence(project) : [];
  const recommendedTitleAnimation = project ? introTitleAnimationRecommendations[project.intro] : undefined;
  const chooseTitleAnimation = (animationId: IntroTitleAnimationId) => {
    update(current => ({ ...current, titleAnimations: { ...current.titleAnimations, [current.intro]: animationId } }));
    if (project) setTitleAnimationDemo(current => ({ introId: project.intro, animationId, run: (current?.run ?? 0) + 1 }));
  };
  const setTransitionAtSlot = (slot: number, option: typeof transitionOptions[number], preview: boolean) => {
    const targetSlot = Math.max(0, Math.min(slot, selectedTransitionSequence.length - 1));
    update(current => {
      const sequence = getTransitionSequence(current);
      sequence[Math.min(targetSlot, sequence.length - 1)] = option.id;
      return { ...current, transition: option.value, transitionSequence: sequence };
    });
    setActiveTransitionSlot(targetSlot);
    if (preview) setTransitionDemo(current => ({ id: option.id, run: (current?.run ?? 0) + 1 }));
  };
  const chooseTransition = (option: typeof transitionOptions[number]) => setTransitionAtSlot(activeTransitionSlot, option, true);
  const chooseTransitionForSlot = (slot: number, optionId: string) => {
    const option = transitionOptions.find(item => item.id === optionId);
    if (option) setTransitionAtSlot(slot, option, false);
  };
  const copyMusicAttribution = async (track: MusicTrack) => {
    if (!track.attribution) return;
    try {
      await navigator.clipboard.writeText(track.attribution);
      setNotice(`已複製 ${track.title} 署名`);
    } catch {
      setError('瀏覽器無法自動複製；請選取並複製畫面上的完整署名文字。');
    }
  };
  const duration = useMemo(() => {
    if (!project || !selectedOpening || !selectedEnding) return 0;
    return selectedOpening.durationInFrames + project.cards.length * getCardDurationInFrames(project.cardDurationSeconds) + selectedEnding.durationInFrames;
  }, [project, selectedOpening, selectedEnding]);

  const create = () => {
    const next = makeProject('未命名專案');
    setProject(next);
  };

  const del = async (item: Project) => {
    if (!window.confirm(`確定刪除「${item.name}」？此操作無法復原。`)) return;
    await removeProject(item.id);
    if (project?.id === item.id) setProject(null);
    await refresh();
  };

  const rename = () => {
    if (!project) return;
    const name = window.prompt('專案名稱', project.name);
    if (name?.trim()) update(current => ({ ...current, name: name.trim() }));
  };

  const imageFiles = async (files: File[] | null, start = 0) => {
    if (!files?.length) return;
    const list = files.filter(file => file.type.startsWith('image/'));
    if (!list.length) {
      setError('請選擇瀏覽器可讀取的圖片檔案。');
      return;
    }
    const values = await Promise.all(list.map(file => blobToDataUrl(file)));
    update(current => ({
      ...current,
      cards: current.cards.map((card, index) => values[index - start] !== undefined ? { ...card, image: values[index - start], isRenderedPoster: false } : card),
    }));
    setNotice(`已載入 ${Math.min(values.length, Math.max(0, (project?.cards.length || 0) - start))} 張圖片`);
  };

  const parseTemplateFile = (file: File): { id: string; kind: 'intro' | 'outro'; number: number } | null => {
    const match = file.name.match(/方案\s*([一二三四五1-5])/);
    if (!match) return null;
    const numberMap: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5 };
    const number = numberMap[match[1]];
    const kind = file.name.includes('片尾') ? 'outro' : file.name.includes('入圍動畫') || file.name.includes('片頭') ? 'intro' : null;
    if (!kind || (kind === 'outro' && number > 4)) return null;
    return { id: `${kind}-${number}`, kind, number };
  };

  const uploadTemplates = async (files: File[] | null) => {
    if (!files?.length || busyAction) return;
    setError('');
    const accepted = files.filter(file => /\.mp4$/i.test(file.name) || file.type === 'video/mp4');
    const rejected: string[] = [];
    let completed = 0;
    setBusyAction('template-upload');
    setBusyProgress({ completed: 0, total: accepted.length });
    try {
      for (let index = 0; index < accepted.length; index++) {
        const file = accepted[index];
        const parsed = parseTemplateFile(file);
        if (!parsed) {
          rejected.push(file.name);
          setBusyProgress({ completed: index + 1, total: accepted.length });
          continue;
        }
        const definition = allTemplateDefinitions.find(item => item.id === parsed.id);
        if (!definition) {
          rejected.push(file.name);
          setBusyProgress({ completed: index + 1, total: accepted.length });
          continue;
        }
        const src = URL.createObjectURL(file);
        try {
          const durationSeconds = await readVideoDuration(src);
          await putStoredClip({ id: parsed.id, name: file.name, blob: file });
          const oldUrl = clipUrlsRef.current.get(parsed.id);
          if (oldUrl) URL.revokeObjectURL(oldUrl);
          clipUrlsRef.current.set(parsed.id, src);
          setClipAssets(current => [
            ...current.filter(item => item.id !== parsed.id),
            { ...definition, name: file.name, src, durationSeconds, durationInFrames: Math.ceil(durationSeconds * fps), stored: true },
          ].sort((a, b) => allTemplateDefinitions.findIndex(item => item.id === a.id) - allTemplateDefinitions.findIndex(item => item.id === b.id)));
          completed++;
        } catch (caught) {
          URL.revokeObjectURL(src);
          rejected.push(`${file.name}（${caught instanceof Error ? caught.message : '無法讀取'}）`);
        }
        setBusyProgress({ completed: index + 1, total: accepted.length });
      }
      const introCount = clipAssets.filter(clip => clip.kind === 'intro').length;
      const outroCount = clipAssets.filter(clip => clip.kind === 'outro').length;
      setNotice(`新增或更新 ${completed} 支模板；目前片頭 ${Math.min(5, introCount + files.filter(file => parseTemplateFile(file)?.kind === 'intro').length)}/5、片尾 ${Math.min(4, outroCount + files.filter(file => parseTemplateFile(file)?.kind === 'outro').length)}/4。`);
      if (rejected.length) setError(`以下檔案未匯入：${rejected.join('、')}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '更新模板影片失敗。');
    } finally {
      setBusyAction(null);
    }
  };

  const importRecords = async (incomingRecords: PosterRecord[], templateId = 'original') => {
    const records = incomingRecords.filter(record => !record.isStarter);
    if (!records.length) throw new Error('匯入資料沒有可使用的入圍作品記錄。');
    const grouped = new Map<string, Array<{ record: PosterRecord; image?: string }>>();
    let posterTemplate: PosterTemplateImage | undefined;
    const unclassified: PosterRecord[] = [];
    for (const record of records) {
      const code = String(record.code || '').trim();
      const domain = domainForCode(code);
      if (!domain) {
        unclassified.push(record);
        continue;
      }
      const [domainCode] = domain;
      const list = grouped.get(domainCode) || [];
      let image = typeof record.posterDataUrl === 'string' && record.posterDataUrl.startsWith('data:image/') ? record.posterDataUrl : undefined;
      if (!image) {
        const rawImage = await dataUrlFromRecord(record);
        if (rawImage) {
          posterTemplate ||= await loadVideoPosterTemplate(templateId);
          image = await renderImportedPoster(record, rawImage, posterTemplate);
        }
      }
      list.push({ record, image });
      grouped.set(domainCode, list);
    }
    if (!grouped.size) throw new Error('沒有編號以 A–F 或 N 開頭的專題可建立影片。');
    if (unclassified.length) {
      const items = unclassified.slice(0, 12).map(record => String(record.code || '（未填編號）')).join('、');
      const remainder = unclassified.length > 12 ? ` 等 ${unclassified.length} 筆` : '';
      const proceed = window.confirm(`有 ${unclassified.length} 筆資料的編號不屬於 A–F 或 N，無法分類，將略過：${items}${remainder}。要繼續匯入已分類作品嗎？`);
      if (!proceed) return;
    }
    const existing = await allProjects();
    let created = 0;
    let updated = 0;
    let included = 0;
    for (const [code, rows] of grouped) {
      const previous = existing.find(item => item.sourceDomainCode === code);
      const oldByCode = new Map((previous?.cards || []).filter(card => card.code).map(card => [card.code as string, card]));
      const cards = rows.map(({ record, image }) => {
        const recordCode = String(record.code || '').trim();
        const old = oldByCode.get(recordCode);
        return {
          id: old?.id || uid(),
          code: recordCode,
          team: String(record.className || old?.team || ''),
          title: String(record.name || old?.title || '未命名專題'),
          domain: domainName(code),
          image: image || (old?.isRenderedPoster ? old.image : undefined),
          isRenderedPoster: Boolean(image || (old?.isRenderedPoster && old.image)),
        };
      });
      const projectName = `${code}｜${domainName(code)}`;
      const next: Project = previous
        ? { ...previous, name: projectName, updatedAt: Date.now(), domains: [domainName(code)], cards }
        : makeProject(projectName, code, cards);
      await putProject(next);
      if (previous) updated++;
      else created++;
      included += cards.length;
    }
    await refresh();
    setProject(null);
    setNotice(`完成：建立 ${created} 個新領域專案、更新 ${updated} 個既有專案，含 ${included} 件作品；空領域已略過${unclassified.length ? `，另有 ${unclassified.length} 筆未分類資料未匯入` : ''}。`);
    setError('');
  };

  const importPosterDatabase = async () => {
    if (busyAction) return;
    setBusyAction('poster-import');
    setError('');
    try {
      const { records, templateId } = await readPosterDatabase();
      await importRecords(records, templateId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '讀取海報資料失敗。');
    } finally {
      setBusyAction(null);
    }
  };

  const importJsonFile = async (file?: File) => {
    if (!file || busyAction) return;
    setBusyAction('json-import');
    setError('');
    try {
      const parsed = JSON.parse(await file.text()) as { records?: PosterRecord[]; templateId?: string } | PosterRecord[];
      const records = Array.isArray(parsed) ? parsed : parsed.records;
      if (!Array.isArray(records)) throw new Error('JSON 檔案格式不符；請使用海報製作室匯出的「影片資料 JSON」。');
      if ((Array.isArray(parsed) || !parsed.templateId) && records.some(record => !record.posterDataUrl && (record.imageDataUrl || record.image))) {
        if (!window.confirm('此舊版 JSON 沒有儲存所選海報模板，將使用原始模板重製海報。若要保留原本選用的模板，請先從新版海報製作室重新匯出 JSON。是否繼續？')) return;
      }
      await importRecords(records, Array.isArray(parsed) ? 'original' : parsed.templateId || 'original');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '無法匯入這個 JSON 檔案。');
    } finally {
      setBusyAction(null);
    }
  };

  const exportVideo = async () => {
    if (!project || !selectedOpening || !selectedEnding) {
      setError('請先選好一支片頭與一支片尾模板。');
      return;
    }
    setError('');
    setNotice('');
    setProgress(0);
    setRendering(true);
    try {
      const capability = await canRenderMediaOnWeb({ container: 'mp4', videoCodec: 'h264', width: W, height: H, muted: false });
      if (!capability.canRender) {
        const messages = capability.issues.filter(issue => issue.severity === 'error').map(issue => issue.message).join('；');
        throw new Error(messages || '此瀏覽器不支援含音訊的 H.264 / WebCodecs MP4 匯出。請使用最新版 Chrome 或 Edge。');
      }
      const result = await renderMediaOnWeb({
        composition: {
          component: ExpoVideoComposition,
          durationInFrames: duration,
          fps,
          width: W,
          height: H,
          id: 'expo-motion-seven-domain-video',
          defaultProps: { project, openingClip: selectedOpening, endingClip: selectedEnding },
        },
        inputProps: { project, openingClip: selectedOpening, endingClip: selectedEnding },
        container: 'mp4',
        videoCodec: 'h264',
        muted: false,
        onProgress: ({ progress: current }: { progress: number }) => setProgress(Math.round(current * 100)),
      });
      const blob = typeof result.getBlob === 'function' ? await result.getBlob() : (result as unknown as { blob: Blob }).blob;
      if (!(blob instanceof Blob)) throw new Error('瀏覽器未回傳 MP4 檔案。');
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const domainPrefix = project.sourceDomainCode ? `${project.sourceDomainCode}_` : '';
      link.download = `${domainPrefix}${safeFileName(project.name)}.mp4`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
      setNotice('MP4 已產生，下載已開始。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '算繪失敗，請稍後再試。');
    } finally {
      setRendering(false);
    }
  };

  const stage = project?.stage || 1;
  const introCount = clipAssets.filter(clip => clip.kind === 'intro').length;
  const outroCount = clipAssets.filter(clip => clip.kind === 'outro').length;
  const templateList = (kind: 'intro' | 'outro') => kind === 'intro' ? introTemplates : outroTemplates;
  const chosenTemplate = project ? findClip(project.stage === 2 ? project.intro : project.outro) : undefined;

  if (loading) return <div className="loading"><div className="brand-mark"><Film /></div>正在準備創作空間與九支模板影片…</div>;

  return (
    <div className="app-shell min-h-screen antialiased">
      <header className="studio-header video-studio-header">
        <button type="button" className="exhibition-brand video-brand" onClick={() => setProject(null)} aria-label="返回影片專案首頁">
          <img className="brand-icon" src={brandIcon} alt="" />
          <span className="exhibition-brand-copy">
            <span className="exhibition-affiliation">國立臺中科技大學</span>
            <span className="exhibition-title">專題成果展</span>
            <span className="exhibition-subtitle">影片工作室</span>
          </span>
        </button>
        <div className={`header-actions${project ? ' has-project-tools' : ''}`}>
          {project && <>
            <div className="project-crumb"><span>/</span><button onClick={() => setProject(null)}>我的專案</button><span>/</span><button className="crumb-current" onClick={rename}>{project.name}</button></div>
          </>}
          <a className="guide-link" href="../index.html" aria-label="返回海報製作室"><ArrowLeft size={16} />海報製作室</a>
        </div>
        <details className="mobile-site-menu">
          <summary className="mobile-menu-toggle" aria-label="開啟導覽選單" aria-controls="mobileSiteMenuPanel"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg><span>選單</span></summary>
          <nav className="mobile-site-menu-panel" id="mobileSiteMenuPanel" aria-label="主要導覽">
            <a className="guide-link" href="../index.html">海報製作室</a>
            <a className="guide-link" href="./">影片工作室</a>
            <a className="guide-link album-open" href="../gallery.html">圖片相簿 <span className="header-gallery-count">{galleryCount} 張</span></a>
            <a className="guide-link" href="../guide.html">使用教學</a>
          </nav>
        </details>
      </header>

      {!project ? <>
        <main className="home">
        <div className="hero">
          <div className="eyebrow"><Sparkles size={15} /> 專題成果展動畫製作工具</div>
          <h1>讓每一份創意，<br /><em>都值得被看見。</em></h1>
          <p>直接使用海報製作室既有入圍資料，按 A–F、N 領域建立獨立影片；片頭片尾採用你提供的原始 MP4。</p>
          <button className="button primary large" onClick={create}><Plus size={18} /> 建立空白專案 <ArrowRight size={17} /></button>
          <div className="hero-note"><Cloud size={15} /> 專案與上傳素材只儲存在此裝置；公開模板影片已預載</div>
          <div className="hero-orbit orbit-one" /><div className="hero-orbit orbit-two" /><div className="hero-spark">✳</div>
        </div>

        <section className="import-workflow">
          <div className="import-workflow-copy">
            <div className="eyebrow muted">FROM YOUR POSTER STUDIO</div>
            <h2>使用既有入圍作品</h2>
            <p>同一網站來源可直接讀取海報資料庫；若你的資料在另一個網址，先從海報製作室匯出 JSON，再於此匯入。圖片會一併帶入。</p>
          </div>
          <div className="import-actions">
            <button className="button primary" disabled={busyAction !== null} aria-busy={busyAction === 'poster-import'} onClick={() => void importPosterDatabase()}>{busyAction === 'poster-import' ? <><span className="spinner" />讀取中…</> : <><Layers size={16} /> 讀取本來源海報資料</>}</button>
            <button className="button secondary" disabled={busyAction !== null} aria-busy={busyAction === 'json-import'} onClick={() => jsonImportRef.current?.click()}>{busyAction === 'json-import' ? <><span className="spinner dark" />匯入中…</> : <><Upload size={16} /> 匯入海報資料 JSON</>}</button>
            <input ref={jsonImportRef} type="file" accept="application/json,.json" hidden onChange={event => { void importJsonFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </div>
        </section>

        <section className="clip-library">
          <div className="clip-library-top">
            <div className="clip-library-copy"><div className="eyebrow muted">SOURCE VIDEO TEMPLATES</div><h2>片頭／片尾原始影片</h2><p>九支原始影片都可預覽；建立專案後，能在片頭與片尾步驟選用。影片保留原音訊。</p></div>
            <div className="clip-library-meta"><span className={`clip-count ${introCount === 5 && outroCount === 4 ? 'complete' : ''}`}>{introCount + outroCount} / 9 支已就緒</span><button className="button secondary" disabled={busyAction !== null} aria-busy={busyAction === 'template-upload'} onClick={() => clipUploadRef.current?.click()}>{busyAction === 'template-upload' ? <><span className="spinner dark" />更新中 {busyProgress.completed}/{busyProgress.total}</> : <><Upload size={15} /> 更新／補上 MP4</>}</button><input ref={clipUploadRef} type="file" accept="video/mp4,.mp4" multiple hidden onChange={event => { void uploadTemplates(event.target.files ? Array.from(event.target.files) : null); event.currentTarget.value = ''; }} /></div>
          </div>
          <div className="clip-library-groups">
            {(['intro', 'outro'] as const).map(kind => <section className={`clip-group ${kind}`} key={kind} aria-label={kind === 'intro' ? '片頭影片模板' : '片尾影片模板'}>
              <div className="clip-group-heading"><div><strong>{kind === 'intro' ? '片頭動畫' : '片尾動畫'}</strong><small>{kind === 'intro' ? '開場主視覺' : '作品結尾收束'}</small></div><span>{kind === 'intro' ? introCount : outroCount} / {kind === 'intro' ? 5 : 4}</span></div>
              <div className="clip-card-grid">{templateList(kind).map(item => {
                const clip = findClip(item.id);
                return <button type="button" className={`home-clip-card ${previewTemplateId === item.id ? 'selected' : ''}`} key={item.id} disabled={!clip} aria-pressed={previewTemplateId === item.id} onClick={() => setPreviewTemplateId(item.id)}>
                  <div className="home-clip-visual"><TemplateThumbnail clip={clip} />{clip && <span className="clip-duration">{clip.durationSeconds.toFixed(1)} 秒</span>}{previewTemplateId === item.id && <span className="clip-preview-indicator"><Check size={11} />預覽中</span>}</div>
                  <span className="home-clip-name">{item.title}</span><small>{clip ? '原始影片 · 可選用' : '尚未載入'}</small>
                </button>;
              })}</div>
            </section>)}
          </div>
          {previewTemplateId && findClip(previewTemplateId) && <div className="clip-library-preview"><div><strong>{findClip(previewTemplateId)?.kind === 'intro' ? '片頭' : '片尾'}實際預覽</strong><span>{findClip(previewTemplateId)?.name} · {findClip(previewTemplateId)?.durationSeconds.toFixed(2)} 秒</span></div><video key={findClip(previewTemplateId)?.src} src={findClip(previewTemplateId)?.src} controls playsInline preload="metadata" /></div>}
        </section>

        {error && <div className="error-box"><X size={17} /><span>{error}</span></div>}
        <section className="project-section">
          <div className="section-head"><div><div className="eyebrow muted">WORKSPACE</div><h2>我的影片專案 <span className="count">{projects.length}</span></h2></div><button className="button secondary" onClick={create}><Plus size={16} /> 新增空白專案</button></div>
          {projects.length === 0 ? <div className="empty-state"><div className="empty-icon"><FolderOpen size={25} /></div><h3>還沒有影片專案</h3><p>點「讀取本來源海報資料」或匯入 JSON，依每個有作品的領域自動建立一支影片。</p></div> : <div className="project-grid">{projects.map(item => <article className="project-card" key={item.id}>
            <button className="project-open" onClick={() => setProject(item)}><div className={`project-art art-${Number(item.intro.replace('intro-', '')) || 0}`}><div className="art-lines" /><Film size={26} /><span>{item.sourceDomainCode ? `${item.sourceDomainCode}｜${domainName(item.sourceDomainCode)}` : 'EXPO MOTION'}</span></div><div className="project-info"><strong>{item.name}</strong><span>{item.cards.length} 件作品 · {new Date(item.updatedAt).toLocaleDateString('zh-TW')}</span></div></button>
            <button className="icon-button delete-project" title="刪除專案" onClick={() => void del(item)}><Trash2 size={16} /></button>
          </article>)}</div>}
        </section>
        </main>
        <footer className="site-footer">
          <strong className="site-footer-title">國立臺中科技大學</strong>
          <span className="site-footer-english" lang="en">National Taichung University of Science and Technology</span>
          <small className="site-footer-copyright">© 2026 國立臺中科技大學 資訊與流通學院專題成果展</small>
        </footer>
      </> : <>
        <div className="workflow"><div className="workflow-inner">{['專案', '片頭', '編輯影片', '片尾', '預覽匯出'].map((label, index) => <button key={label} className={`workflow-step ${stage === index + 1 ? 'active' : ''} ${stage > index + 1 ? 'past' : ''}`} disabled={index + 1 > Math.max(stage, 1)} onClick={() => go(index + 1)}><StageIcon stage={stage} number={index + 1} /><span>{label}</span>{index < 4 && <span className="step-line" />}</button>)}</div></div>
        <main className="studio-body">
          {stage === 1 && <section className="stage-panel center-panel"><div className="panel-kicker">STEP 01 · PROJECT</div><h1>設定你的專案</h1><p className="lead">專案由原站入圍資料自動按領域建立；這裡可調整影片標題與活動資訊。</p>
            {project.sourceDomainCode && <div className="domain-lock"><strong>{project.sourceDomainCode}</strong><span>{domainName(project.sourceDomainCode)} · {project.cards.length} 件實際入圍作品</span></div>}
            <label className="field-label">專案名稱<input className="text-input" value={project.name} onChange={event => update(current => ({ ...current, name: event.target.value }))} /></label>
            <label className="field-label project-field">影片標題<input className="text-input" value={project.title} onChange={event => update(current => ({ ...current, title: event.target.value }))} /></label>
            <label className="field-label project-field">副標題<input className="text-input" value={project.subtitle} onChange={event => update(current => ({ ...current, subtitle: event.target.value }))} /></label>
            <label className="field-label project-field">活動／學校名稱<input className="text-input" value={project.activity} onChange={event => update(current => ({ ...current, activity: event.target.value }))} /></label>
            <div className="stage-actions"><button className="button primary" onClick={() => go(2)}>選擇片頭 <ArrowRight size={17} /></button></div>
          </section>}

          {stage === 2 && <section className="stage-panel"><div className="panel-kicker">STEP 02 · ORIGINAL OPENING CLIPS</div><h1>選擇原始片頭影片</h1><p className="lead">縮圖擷取自原始 MP4；點選方案可播放完整影片。預覽與最終匯出會套用目前領域名稱。</p>
            <div className="template-grid intro-grid">{templateList('intro').map(item => {
              const clip = findClip(item.id);
              return <button className={`template-card ${project.intro === item.id ? 'selected' : ''}`} key={item.id} disabled={!clip} aria-pressed={project.intro === item.id} onClick={() => { update(current => ({ ...current, intro: item.id })); setPreviewTemplateId(item.id); }}>
                <TemplateThumbnail clip={clip} />
                <span className="template-caption"><strong>{item.title}</strong><small>{clip ? `${clip.durationSeconds.toFixed(2)} 秒 · H.264 MP4${clip.stored ? ' · 本機匯入' : ' · 預載模板'}` : '尚未載入此影片'}</small></span>
                {project.intro === item.id && <span className="selected-check"><Check size={14} /></span>}
              </button>;
            })}</div>
            {previewTemplateId.startsWith('intro-') && findClip(previewTemplateId) && <div className="source-preview"><div><strong>片頭實際預覽</strong><span>{findClip(previewTemplateId)?.name}</span></div><video key={findClip(previewTemplateId)?.src} src={findClip(previewTemplateId)?.src} controls playsInline preload="metadata" /></div>}
            <div className="stage-actions spread"><button className="button secondary" onClick={() => go(1)}><ArrowLeft size={16} /> 上一步</button><button className="button primary" disabled={!selectedOpening} onClick={() => go(3)}>編輯影片內容 <ArrowRight size={17} /></button></div>
          </section>}

          {stage === 3 && <section className="stage-panel edit-stage"><div className="panel-kicker">STEP 03 · CONTENT</div><div className="edit-heading"><div><h1>編輯影片內容</h1><p className="lead">作品名稱、班級、圖片與順序取自海報製作室；分類依原站 A–F、N 保留，不會重分。</p></div><span className="group-count"><Layers size={15} />{project.cards.length} 件作品 · {getCardDurationSeconds(project.cardDurationSeconds)} 秒／件</span></div>
            <div className="editor-layout"><div className="editor-main">
              <div className="edit-card"><div className="card-heading"><span className="mini-icon"><Sparkles size={15} /></span><div><h3>展覽領域</h3><small>依原海報編號自動分類，影片工作室不變更原站分類</small></div></div><div className="domain-readonly"><strong>{project.sourceDomainCode || '自訂'}</strong><span>{project.domains.join('、')}</span><span>{project.cards.length} 件作品</span></div></div>
              <div className="card-heading groups-title"><div><h3>入圍作品卡片</h3><small>成品海報文字請在海報製作室修改後重新讀取；可調整圖片及順序</small></div><div className="group-tools"><button className="button secondary small" onClick={() => uploadRef.current?.click()}><Upload size={14} /> 批次上傳圖片</button><input ref={uploadRef} type="file" accept="image/*" multiple hidden onChange={event => { void imageFiles(event.target.files ? Array.from(event.target.files) : null); event.currentTarget.value = ''; }} /></div></div>
              <div className="cards-list">{project.cards.map((card, index) => <article key={card.id} className="group-card" draggable onDragStart={event => { event.dataTransfer.setData('text/plain', String(index)); event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const from = Number(event.dataTransfer.getData('text/plain')); if (!Number.isInteger(from) || from === index) return; update(current => { const cards = [...current.cards]; const [moved] = cards.splice(from, 1); cards.splice(index, 0, moved); return { ...current, cards }; }); }}>
                <div className="group-order"><span>{String(index + 1).padStart(2, '0')}</span><button title="上移" aria-label={`第 ${index + 1} 件上移`} disabled={index === 0} onClick={() => update(current => { const cards = [...current.cards]; [cards[index - 1], cards[index]] = [cards[index], cards[index - 1]]; return { ...current, cards }; })}><MoveUp size={15} /></button><button title="下移" aria-label={`第 ${index + 1} 件下移`} disabled={index === project.cards.length - 1} onClick={() => update(current => { const cards = [...current.cards]; [cards[index], cards[index + 1]] = [cards[index + 1], cards[index]]; return { ...current, cards }; })}><MoveDown size={15} /></button></div>
                <button type="button" className={`image-drop ${card.image ? 'has-image' : ''}`} onClick={() => document.getElementById(`file-${card.id}`)?.click()} aria-label={`為第 ${index + 1} 件選擇圖片`}>{card.image ? <img src={card.image} alt="作品預覽" /> : <><ImagePlus size={20} /><span>加入圖片</span></>}</button><input id={`file-${card.id}`} hidden type="file" accept="image/*" onChange={event => { const file = event.target.files?.[0]; if (file) void imageFiles([file], index); event.currentTarget.value = ''; }} />
                <div className="group-fields"><label className="field-label">編號<input className="text-input" value={card.code || ''} readOnly /></label><label className="field-label">班級／團隊<input className="text-input" value={card.team} readOnly={card.isRenderedPoster} title={card.isRenderedPoster ? '請在海報製作室修改後重新讀取' : undefined} onChange={event => update(current => ({ ...current, cards: current.cards.map(item => item.id === card.id ? { ...item, team: event.target.value } : item) }))} /></label><label className="field-label">作品名稱<input className="text-input" value={card.title} readOnly={card.isRenderedPoster} title={card.isRenderedPoster ? '請在海報製作室修改後重新讀取' : undefined} onChange={event => update(current => ({ ...current, cards: current.cards.map(item => item.id === card.id ? { ...item, title: event.target.value } : item) }))} /></label></div>
                <button className="icon-button remove-group" title="移除此作品" onClick={() => update(current => ({ ...current, cards: current.cards.filter(item => item.id !== card.id) }))}><Trash2 size={16} /></button>
              </article>)}</div>
              <button className="add-group" onClick={() => update(current => ({ ...current, cards: [...current.cards, blankCard(current.domains[0] || domains[0][1])] }))}><Plus size={17} /> 新增一件作品 <span>{project.cards.length} 件</span></button>
              <div className="edit-card title-animation-card">
                <div className="title-animation-heading">
                  <div><h3>片頭領域名稱進場動畫</h3><small>依目前片頭提供推薦；每支片頭各自記住選擇</small></div>
                  {recommendedTitleAnimation && <span className="title-animation-recommendation"><Sparkles size={13} /> 片頭方案 {project.intro.replace('intro-', '')} 建議：{introTitleAnimationOptions.find(option => option.id === recommendedTitleAnimation.animationId)?.name}</span>}
                </div>
                {recommendedTitleAnimation && <p className="title-animation-reason">{recommendedTitleAnimation.reason}。點選縮圖會在該範例中播放效果並套用選擇；預覽與 MP4 匯出都會使用此效果。</p>}
                <div className="title-animation-options" role="radiogroup" aria-label="選擇片頭領域名稱進場動畫">
                  {introTitleAnimationOptions.map(option => <button key={`${project.intro}-${option.id}`} type="button" className={`title-animation-option ${selectedTitleAnimation === option.id ? 'selected' : ''}`} role="radio" aria-checked={selectedTitleAnimation === option.id} aria-label={`選擇${option.name}`} onClick={() => chooseTitleAnimation(option.id)}>
                    <IntroTitleAnimationThumbnail option={option} clip={selectedOpening} layout={introFieldLayouts[project.intro] || introFieldLayouts['intro-1']} active={titleAnimationDemo?.introId === project.intro && titleAnimationDemo.animationId === option.id} run={titleAnimationDemo?.introId === project.intro && titleAnimationDemo.animationId === option.id ? titleAnimationDemo.run : 0} />
                    {recommendedTitleAnimation?.animationId === option.id && <span className="title-animation-recommended-tag">此片頭推薦</span>}
                  </button>)}
                </div>
                <p className="title-animation-note">點擊某個縮圖會只播放該範例；其他縮圖不會自動播放，也不會開啟額外播放器。每支片頭的選擇分別保存。</p>
              </div>
              <div className="edit-card card-duration-card">
                <div><h3>入圍作品顯示時間</h3><small>設定每件作品卡片停留秒數，並同步調整預覽與匯出影片長度</small></div>
                <label className="duration-control"><span>每件作品</span><input className="text-input duration-input" type="number" min={minCardDurationSeconds} max={maxCardDurationSeconds} step={0.5} aria-label="每件入圍作品顯示秒數" value={getCardDurationSeconds(project.cardDurationSeconds)} onChange={event => update(current => ({ ...current, cardDurationSeconds: Math.min(maxCardDurationSeconds, Math.max(minCardDurationSeconds, Number(event.target.value) || minCardDurationSeconds)) }))} /><span>秒</span></label>
              </div>
              <div className="edit-card transition-card">
                <div className="transition-settings-heading">
                  <div><h3>轉場動畫</h3><small>每個循環位置可直接指定效果；點縮圖則只預覽並套用該效果</small></div>
                  <label className="repeat-control"><span>每</span><input className="text-input repeat-input" type="number" min={1} max={maxTransitionRepeatEvery} step={1} aria-label="轉場動畫每幾件作品循環一次" value={getTransitionRepeatEvery(project.transitionRepeatEvery)} onChange={event => { const count = getTransitionRepeatEvery(Number(event.target.value)); update(current => ({ ...current, transitionRepeatEvery: count })); setActiveTransitionSlot(slot => Math.min(slot, count - 1)); }} /><span>件重複一次</span></label>
                </div>
                <div className="transition-cycle" aria-label="轉場循環順序">
                  {selectedTransitionSequence.map((effectId, index) => {
                    const effect = transitionOptions.find(option => option.id === effectId) || transitionOptions[0];
                    const repeatEvery = getTransitionRepeatEvery(project.transitionRepeatEvery);
                    const workExamples = Array.from({ length: 3 }, (_, cycle) => index + 1 + cycle * repeatEvery).join('、');
                    return <div key={index} className="transition-cycle-position">
                      <button type="button" className={`transition-cycle-slot ${activeTransitionSlot === index ? 'active' : ''}`} aria-pressed={activeTransitionSlot === index} aria-label={`選擇循環位置 ${index + 1}，目前 ${effect.value}，套用於作品 ${workExamples}`} onClick={() => setActiveTransitionSlot(index)}>
                        <span>循環位置 {index + 1}</span><strong>{effect.value}</strong><small>作品 {workExamples}…</small>
                      </button>
                      <label className="transition-cycle-select-label"><span>指定效果</span><select className="text-input transition-cycle-select" aria-label={`指定循環位置 ${index + 1} 的轉場效果`} value={effect.id} onFocus={() => setActiveTransitionSlot(index)} onChange={event => chooseTransitionForSlot(index, event.target.value)}>
                        {transitionOptions.map(option => <option key={option.id} value={option.id}>{option.value}</option>)}
                      </select></label>
                    </div>;
                  })}
                </div>
                <div className="transition-options" role="group" aria-label={`預覽並選擇循環位置 ${activeTransitionSlot + 1} 的轉場效果`}>
                  {transitionOptions.map(option => {
                    const selectedCount = selectedTransitionSequence.filter(id => id === option.id).length;
                    return <button key={option.value} type="button" className={`transition-option ${selectedTransitionSequence[activeTransitionSlot] === option.id ? 'selected' : ''}`} aria-pressed={selectedTransitionSequence[activeTransitionSlot] === option.id} aria-label={`將${option.value}設為循環第 ${activeTransitionSlot + 1} 個轉場並預覽單一效果`} onClick={() => chooseTransition(option)}>
                      <TransitionThumbnail option={option} active={transitionDemo?.id === option.id} run={transitionDemo?.id === option.id ? transitionDemo.run : 0} />
                      {selectedCount > 0 && <span className="transition-selected-tag">循環 {selectedCount} 次</span>}
                    </button>;
                  })}
                </div>
                <p className="transition-repeat-note">循環順序：{selectedTransitionSequence.map(id => transitionOptions.find(option => option.id === id)?.value || '淡入淡出').join(' → ')} → 重複。點縮圖只預覽單一效果；作品會依此順序循環播放。</p>
              </div>
              <section className="edit-card music-track-card" aria-labelledby="music-track-heading">
                <div className="music-track-heading"><div><h3 id="music-track-heading">入圍作品背景音樂</h3><small>選擇一首配樂；只在入圍作品段落播放，段落前後淡入淡出，片頭與片尾原音保留</small></div><span className="music-track-badge">4 首可選</span></div>
                <div className="music-track-grid" role="radiogroup" aria-label="選擇入圍作品背景音樂">
                  {musicTracks.map(track => <article key={track.id} className={`music-track-option ${selectedMusicTrack.id === track.id ? 'selected' : ''}`}>
                    <button type="button" className="music-track-select" role="radio" aria-checked={selectedMusicTrack.id === track.id} onClick={() => update(current => ({ ...current, musicTrackId: track.id }))}>
                      <span className="music-track-title"><strong>{track.title}</strong>{track.id === 'original' ? <small>原本提供</small> : <small>CC BY 4.0</small>}</span>
                      <span className="music-track-description">{track.description}</span>
                    </button>
                    <label className="music-track-listen"><span>預聽</span><audio controls preload="metadata" src={track.src} aria-label={`預聽 ${track.title}`} /></label>
                    {track.attribution && <div className="music-track-credit"><p>{track.attribution}</p><div><button type="button" className="music-copy-credit" onClick={() => void copyMusicAttribution(track)}>複製署名</button><a href={track.sourceUrl} target="_blank" rel="noreferrer">官方曲目與授權</a></div></div>}
                  </article>)}
                </div>
                <p className="music-track-note">選用 Scott Buckley 曲目時，逐字署名也會疊加在生成影片的入圍作品段落；上方「複製署名」文字可一併貼到影片說明欄。</p>
              </section>
            </div><aside className="editor-aside"><div className="aside-sticky"><div className="aside-label">製作小提示</div><div className="tip-icon"><CircleHelp size={20} /></div><h3>讓作品有自己的順序</h3><p>影片每支只收錄目前領域的真實入圍作品。圖片沒有資料時會留白，不會用假作品代替。</p><div className="aside-divider" /><div className="aside-stat"><span>作品數</span><strong>{project.cards.length} 件</strong></div><div className="aside-stat"><span>影片規格</span><strong>Full HD · MP4</strong></div><div className="aside-note"><Cloud size={14} /> 編輯內容會自動儲存至此裝置</div></div></aside></div>
            <div className="stage-actions spread"><button className="button secondary" onClick={() => go(2)}><ArrowLeft size={16} /> 上一步</button><button className="button primary" onClick={() => go(4)}>選擇片尾 <ArrowRight size={17} /></button></div>
          </section>}

          {stage === 4 && <section className="stage-panel"><div className="panel-kicker">STEP 04 · ORIGINAL CLOSING CLIPS</div><h1>選擇原始片尾影片</h1><p className="lead">縮圖擷取自原始 MP4；點選方案可播放完整影片。片尾會接在作品之後並保留原音訊。</p>
            <div className="template-grid outro-grid">{templateList('outro').map(item => {
              const clip = findClip(item.id);
              return <button className={`template-card ${project.outro === item.id ? 'selected' : ''}`} key={item.id} disabled={!clip} aria-pressed={project.outro === item.id} onClick={() => { update(current => ({ ...current, outro: item.id })); setPreviewTemplateId(item.id); }}>
                <TemplateThumbnail clip={clip} />
                <span className="template-caption"><strong>{item.title}</strong><small>{clip ? `${clip.durationSeconds.toFixed(2)} 秒 · H.264 MP4${clip.stored ? ' · 本機匯入' : ' · 預載模板'}` : '尚未載入此影片'}</small></span>
                {project.outro === item.id && <span className="selected-check"><Check size={14} /></span>}
              </button>;
            })}</div>
            {previewTemplateId.startsWith('outro-') && findClip(previewTemplateId) && <div className="source-preview"><div><strong>片尾實際預覽</strong><span>{findClip(previewTemplateId)?.name}</span></div><video key={findClip(previewTemplateId)?.src} src={findClip(previewTemplateId)?.src} controls playsInline preload="metadata" /></div>}
            <div className="stage-actions spread"><button className="button secondary" onClick={() => go(3)}><ArrowLeft size={16} /> 上一步</button><button className="button primary" disabled={!selectedEnding} onClick={() => go(5)}>預覽影片 <ArrowRight size={17} /></button></div>
          </section>}

          {stage === 5 && <section className="stage-panel preview-stage"><div className="panel-kicker">STEP 05 · PREVIEW & EXPORT</div><div className="edit-heading"><div><h1>預覽與匯出</h1><p className="lead">領域名稱會依片頭畫面直接疊入；原有固定領域字樣會被替換，不再接重複標題卡。</p></div><span className="quality-pill">FULL HD · 1080P</span></div>
            {selectedOpening && selectedEnding && duration > 0 ? <div className="player-wrap"><Player component={ExpoVideoComposition} inputProps={{ project, openingClip: selectedOpening, endingClip: selectedEnding }} durationInFrames={duration} compositionWidth={W} compositionHeight={H} fps={fps} controls loop style={{ width: '100%', aspectRatio: '16/9' }} /></div> : <div className="empty-state"><h3>模板素材尚未就緒</h3><p>請先選擇可用的片頭與片尾影片。</p></div>}
            <div className="preview-meta"><span><Film size={15} />{project.cards.length} 件作品 · {getCardDurationSeconds(project.cardDurationSeconds)} 秒／件</span><span>{Math.floor(duration / fps / 60)}:{String(Math.floor(duration / fps) % 60).padStart(2, '0')} 分鐘總長</span><span>轉場每 {getTransitionRepeatEvery(project.transitionRepeatEvery)} 件循環</span><span>1920 × 1080 · 30 FPS · H.264 / AAC</span></div>
            <div className="browser-note"><CircleHelp size={16} /><div><strong>瀏覽器端算繪</strong><span>MP4 會在你的裝置上產生；背景音樂只在入圍作品卡片段落播放，開頭與結尾各淡化最長 1.2 秒，片頭／片尾保留原音訊。請保持此分頁開啟，時間視電腦效能而定。</span></div></div>
            {error && <div className="error-box"><X size={17} /><span>{error}</span></div>}
            {rendering && <div className="render-progress"><div className="progress-label"><span>正在算繪 H.264 / AAC 影片…</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><small>請保持頁面開啟；來源片頭與片尾會完整納入輸出。</small></div>}
            <div className="stage-actions spread"><button className="button secondary" onClick={() => go(4)}><ArrowLeft size={16} /> 返回片尾</button><button className="button primary export-button" disabled={rendering || !selectedOpening || !selectedEnding} onClick={() => void exportVideo()}>{rendering ? <><span className="spinner" /> 正在算繪 {progress}%</> : <><Download size={17} /> 匯出此領域 MP4</>}</button></div>
          </section>}
        </main>
        <footer className="site-footer">
          <strong className="site-footer-title">國立臺中科技大學</strong>
          <span className="site-footer-english" lang="en">National Taichung University of Science and Technology</span>
          <small className="site-footer-copyright">© 2026 國立臺中科技大學 資訊與流通學院專題成果展</small>
        </footer>
      </>}
      {notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice('')}><X size={14} /></button></div>}
      </div>
  );
}
