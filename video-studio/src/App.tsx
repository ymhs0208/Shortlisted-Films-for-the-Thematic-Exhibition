/// <reference types="vite/client" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import brandIcon from '../../favicon.png';
import { Video } from '@remotion/media';
import { Player } from '@remotion/player';
import { canRenderMediaOnWeb, renderMediaOnWeb } from '@remotion/web-renderer';
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from 'remotion';
import { getPosterTemplate, renderPosterCanvas } from '../../js/poster-renderer.js';
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
  transition: string;
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
const framesPerCard = 90;
const domains = [
  ['A', '企業智慧化'],
  ['B', '數位內容與多媒體應用'],
  ['C', '網路應用與資通安全'],
  ['D', '嵌入式系統與行動計算'],
  ['E', '智慧運算創新應用'],
  ['F', '智慧流通應用與研究'],
  ['N', '進修部'],
] as const;
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
  overline?: boolean;
  replacesEmbeddedTitle?: boolean;
};

// Positions and time windows are matched to the five supplied intro clips.
// Clips 2–5 have a baked-in "企業智慧化" title; their opaque plates replace that line.
const introFieldLayouts: Record<string, IntroFieldLayout> = {
  'intro-1': { startSeconds: 0.7, endSeconds: 2.4, left: 21, top: 85.5, width: 58, height: 12.5, background: 'rgba(4, 13, 27, 0.72)', color: '#fff8e8', fontSize: 72, border: '1px solid rgba(214, 182, 110, 0.82)', borderRadius: 30, shadow: '0 8px 32px rgba(0,0,0,0.48)' },
  'intro-2': { startSeconds: 7.5, endSeconds: 10.2, left: 20, top: 36, width: 60, height: 27, background: '#07172f', color: '#f7c932', fontSize: 90, border: '1px solid rgba(242, 206, 108, 0.68)', borderRadius: 20, shadow: '0 0 28px rgba(0,0,0,0.42)', replacesEmbeddedTitle: true },
  'intro-3': { startSeconds: 7.5, endSeconds: 10.2, left: 30, top: 54, width: 45, height: 16, background: '#081a2c', color: '#ffd13a', fontSize: 66, border: '1px solid rgba(117, 201, 247, 0.42)', borderRadius: 12, shadow: '0 8px 30px rgba(0,0,0,0.4)', replacesEmbeddedTitle: true },
  'intro-4': { startSeconds: 10, endSeconds: 13.6, left: 21, top: 38, width: 58, height: 22, background: '#ffefcd', color: '#073e75', fontSize: 86, border: '0 solid transparent', borderRadius: 0, shadow: 'none', replacesEmbeddedTitle: true },
  'intro-5': { startSeconds: 6.55, endSeconds: 10.2, left: 32, top: 75.5, width: 44, height: 15, background: '#1b1d28', color: '#fff9e8', fontSize: 64, border: '1px solid rgba(240, 215, 160, 0.62)', borderRadius: 14, shadow: '0 8px 30px rgba(0,0,0,0.4)', replacesEmbeddedTitle: true },
};

const uid = () => Math.random().toString(36).slice(2, 10);
const domainForCode = (code: string) => domains.find(([prefix]) => prefix === String(code || '').trim().charAt(0).toUpperCase());
const domainName = (code: string) => domainForCode(code)?.[1] || '未分類';
const safeFileName = (name: string) => name.replace(/[\\/:*?"<>|]/g, '_').trim() || '專題展影片';

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

function CardScene({ card, index, total, transition }: { card: Card; index: number; total: number; transition: string }) {
  const frame = useCurrentFrame();
  const fade = interpolate(frame, [0, 10, 78, 89], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const showRenderedPoster = Boolean(card.image && card.isRenderedPoster);
  const transform = transition === '滑動切換'
    ? `translateX(${interpolate(frame, [0, 12], [80, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}px)`
    : transition === '柔和縮放'
      ? `scale(${interpolate(frame, [0, 12], [0.93, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })})`
      : 'none';
  return (
    <AbsoluteFill style={{ background: '#07152d', color: '#fff', fontFamily: 'Arial, "Noto Sans TC", sans-serif', overflow: 'hidden' }}>
      {card.image && !showRenderedPoster && <img src={card.image} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.24 }} />}
      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: 90, textAlign: 'center', opacity: transition === '直接切換' ? 1 : fade, transform }}>
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

function IntroFieldOverlay({ project, layout, durationInFrames }: { project: Project; layout: IntroFieldLayout; durationInFrames: number }) {
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
  return (
    <div style={{ position: 'absolute', left: `${layout.left}%`, top: `${layout.top}%`, width: `${layout.width}%`, height: `${layout.height}%`, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: layout.overline ? 5 : 0, padding: layout.width < 35 ? '8px 16px' : '12px 28px', overflow: 'hidden', background: layout.background, color: layout.color, border: layout.border, borderRadius: layout.borderRadius, boxShadow: layout.shadow, opacity, fontFamily: 'Arial, "Noto Sans TC", sans-serif', textAlign: 'center' }}>
      {layout.overline && <span style={{ fontSize: Math.max(14, fontSize * 0.38), fontWeight: 600, letterSpacing: 4, lineHeight: 1.1, opacity: 0.78 }}>本片領域</span>}
      <span style={{ fontSize, fontWeight: 800, lineHeight: 1.2, letterSpacing, whiteSpace: 'nowrap', textShadow: layout.background.startsWith('rgba') ? '0 2px 12px rgba(0,0,0,0.28)' : 'none' }}>{fieldName}</span>
    </div>
  );
}

export function ExpoVideoComposition({ project, openingClip, endingClip }: { project: Project; openingClip: ClipAsset; endingClip: ClipAsset }) {
  const openingFrames = openingClip.durationInFrames;
  const cardsStart = openingFrames;
  const endingStart = cardsStart + project.cards.length * framesPerCard;
  const fieldLayout = introFieldLayouts[openingClip.id];
  const overlayStart = fieldLayout ? Math.min(openingFrames, Math.round(fieldLayout.startSeconds * fps)) : openingFrames;
  const overlayEnd = fieldLayout ? Math.min(openingFrames, Math.round(fieldLayout.endSeconds * fps)) : openingFrames;
  const overlayDuration = Math.max(0, overlayEnd - overlayStart);
  return (
    <AbsoluteFill style={{ backgroundColor: '#07152d', overflow: 'hidden' }}>
      <Sequence from={0} durationInFrames={openingFrames} name="原始片頭">
        <Video src={openingClip.src} durationInFrames={openingFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} volume={1} />
        {fieldLayout && overlayDuration > 0 && <Sequence from={overlayStart} durationInFrames={overlayDuration} name="片頭領域名稱">
          <IntroFieldOverlay project={project} layout={fieldLayout} durationInFrames={overlayDuration} />
        </Sequence>}
      </Sequence>
      {project.cards.map((card, index) => (
        <Sequence key={card.id} from={cardsStart + index * framesPerCard} durationInFrames={framesPerCard} name={`作品 ${index + 1}`}>
          <CardScene card={card} index={index} total={project.cards.length} transition={project.transition} />
        </Sequence>
      ))}
      <Sequence from={endingStart} durationInFrames={endingClip.durationInFrames} name="原始片尾">
        <Video src={endingClip.src} durationInFrames={endingClip.durationInFrames} style={{ width: '100%', height: '100%', objectFit: 'cover' }} volume={1} />
      </Sequence>
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

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [clipAssets, setClipAssets] = useState<ClipAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [previewTemplateId, setPreviewTemplateId] = useState('');
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
    setSaved(false);
    const timeout = window.setTimeout(() => {
      const next = { ...project, updatedAt: Date.now() };
      putProject(next).then(() => {
        setSaved(true);
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
  const go = (stage: number) => update(current => ({ ...current, stage }));
  const findClip = (id: string) => clipAssets.find(clip => clip.id === id);
  const selectedOpening = project ? findClip(project.intro) : undefined;
  const selectedEnding = project ? findClip(project.outro) : undefined;
  const duration = useMemo(() => {
    if (!project || !selectedOpening || !selectedEnding) return 0;
    return selectedOpening.durationInFrames + project.cards.length * framesPerCard + selectedEnding.durationInFrames;
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
    if (!files?.length) return;
    setError('');
    const accepted = files.filter(file => /\.mp4$/i.test(file.name) || file.type === 'video/mp4');
    const rejected: string[] = [];
    let completed = 0;
    for (const file of accepted) {
      const parsed = parseTemplateFile(file);
      if (!parsed) {
        rejected.push(file.name);
        continue;
      }
      const definition = allTemplateDefinitions.find(item => item.id === parsed.id);
      if (!definition) {
        rejected.push(file.name);
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
    }
    const introCount = clipAssets.filter(clip => clip.kind === 'intro').length;
    const outroCount = clipAssets.filter(clip => clip.kind === 'outro').length;
    setNotice(`新增或更新 ${completed} 支模板；目前片頭 ${Math.min(5, introCount + files.filter(file => parseTemplateFile(file)?.kind === 'intro').length)}/5、片尾 ${Math.min(4, outroCount + files.filter(file => parseTemplateFile(file)?.kind === 'outro').length)}/4。`);
    if (rejected.length) setError(`以下檔案未匯入：${rejected.join('、')}`);
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
    setError('');
    try {
      const { records, templateId } = await readPosterDatabase();
      await importRecords(records, templateId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '讀取海報資料失敗。');
    }
  };

  const importJsonFile = async (file?: File) => {
    if (!file) return;
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
    }
  };

  const exportVideo = async () => {
    if (!project || !selectedOpening || !selectedEnding) {
      setError('請先選好一支片頭與一支片尾模板。');
      return;
    }
    setError('');
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
      <header className="studio-header">
        <button type="button" className="exhibition-brand video-brand" onClick={() => setProject(null)} aria-label="返回影片專案首頁">
          <img className="brand-icon" src={brandIcon} alt="" />
          <span className="exhibition-brand-copy">
            <span className="exhibition-affiliation">國立臺中科技大學</span>
            <span className="exhibition-title">專題成果展</span>
            <span className="exhibition-subtitle">影片工作室</span>
          </span>
        </button>
        <div className="header-actions">
          {project && <>
            <div className="project-crumb"><span>/</span><button onClick={() => setProject(null)}>我的專案</button><span>/</span><button className="crumb-current" onClick={rename}>{project.name}</button></div>
            <div className="save-state"><span className={saved ? 'dot' : 'dot busy'} />{saved ? '已儲存至此裝置' : '儲存中…'}</div>
          </>}
          <a className="guide-link" href="../index.html" aria-label="返回海報製作室"><ArrowLeft size={16} />海報製作室</a>
        </div>
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
            <button className="button primary" onClick={() => void importPosterDatabase()}><Layers size={16} /> 讀取本來源海報資料</button>
            <button className="button secondary" onClick={() => jsonImportRef.current?.click()}><Upload size={16} /> 匯入海報資料 JSON</button>
            <input ref={jsonImportRef} type="file" accept="application/json,.json" hidden onChange={event => { void importJsonFile(event.target.files?.[0]); event.currentTarget.value = ''; }} />
          </div>
        </section>

        <section className="clip-library">
          <div><div className="eyebrow muted">SOURCE VIDEO TEMPLATES</div><h2>片頭／片尾原始影片</h2><p>目前已載入片頭 {introCount}/5、片尾 {outroCount}/4；可直接預覽與匯出，模板影片保留原音訊。</p></div>
          <div className="clip-library-actions"><span className={`clip-count ${introCount === 5 && outroCount === 4 ? 'complete' : ''}`}>{introCount + outroCount} / 9 支</span><button className="button secondary" onClick={() => clipUploadRef.current?.click()}><Upload size={15} /> 更新／補上 MP4</button><input ref={clipUploadRef} type="file" accept="video/mp4,.mp4" multiple hidden onChange={event => { void uploadTemplates(event.target.files ? Array.from(event.target.files) : null); event.currentTarget.value = ''; }} /></div>
          <div className="clip-template-list">{allTemplateDefinitions.map(item => <span key={item.id} className={findClip(item.id) ? 'clip-ready' : 'clip-missing'}><i />{item.title}</span>)}</div>
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

          {stage === 3 && <section className="stage-panel edit-stage"><div className="panel-kicker">STEP 03 · CONTENT</div><div className="edit-heading"><div><h1>編輯影片內容</h1><p className="lead">作品名稱、班級、圖片與順序取自海報製作室；分類依原站 A–F、N 保留，不會重分。</p></div><span className="group-count"><Layers size={15} />{project.cards.length} 件作品</span></div>
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
              <div className="edit-card transition-card"><div><h3>轉場效果</h3><small>套用於作品介紹卡片之間</small></div><select className="text-input" value={project.transition} onChange={event => update(current => ({ ...current, transition: event.target.value }))}><option>淡入淡出</option><option>滑動切換</option><option>柔和縮放</option><option>直接切換</option></select></div>
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
            <div className="preview-meta"><span><Film size={15} />{project.cards.length} 件作品</span><span>{Math.floor(duration / fps / 60)}:{String(Math.floor(duration / fps) % 60).padStart(2, '0')} 分鐘</span><span>1920 × 1080 · 30 FPS · H.264 / AAC</span></div>
            <div className="browser-note"><CircleHelp size={16} /><div><strong>瀏覽器端算繪</strong><span>MP4 會在你的裝置上產生，含所選片頭片尾的影像與音訊；請保持此分頁開啟，時間視電腦效能而定。</span></div></div>
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
