import { filesUrl } from '../../config/app-config.js';
import { MIN_CLIP_SEC } from './types.js';

/**
 * Reject blob: and non-server paths (Phase 5 — no blob in projects).
 * @param {string} path
 */
export function assertServerAudioPath(path) {
  const p = String(path || '').trim();
  if (!p) throw new Error('오디오 경로가 비어 있습니다.');
  if (p.startsWith('blob:')) {
    throw new Error('blob URL은 저장할 수 없습니다. 서버에 업로드한 파일만 사용하세요.');
  }
  if (!p.includes('/files/music/') && !p.includes('/music/')) {
    throw new Error('서버 music 경로만 사용할 수 있습니다.');
  }
  return p;
}

/** @param {string} path */
export function resolveAudioUrl(path) {
  const p = assertServerAudioPath(path);
  if (p.startsWith('http://') || p.startsWith('https://')) return p;
  // API paths are /files/music/... — do NOT strip /files/ (would 404 as /music/...)
  if (p.startsWith('/files/')) return filesUrl(p);
  if (p.startsWith('files/')) return filesUrl(`/${p}`);
  if (p.startsWith('/music/')) return filesUrl(`/files${p}`);
  if (p.startsWith('music/')) return filesUrl(`/files/${p}`);
  return filesUrl(`/files/music/${p.replace(/^\/+/, '')}`);
}

/**
 * @param {string} path — server path
 * @returns {Promise<number>}
 */
export function probeAudioDurationSec(path) {
  const url = resolveAudioUrl(path);
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = 'metadata';
    const cleanup = () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('error', onErr);
      audio.src = '';
    };
    const onMeta = () => {
      const d = audio.duration;
      cleanup();
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error('오디오 길이를 읽을 수 없습니다.'));
        return;
      }
      resolve(d);
    };
    const onErr = () => {
      cleanup();
      reject(new Error(`오디오 로드 실패: ${url}`));
    };
    audio.addEventListener('loadedmetadata', onMeta, { once: true });
    audio.addEventListener('error', onErr, { once: true });
    audio.src = url;
  });
}

let _waveDrawSeq = 0;
let _waveSuspended = false;
/** @type {Map<string, Promise<AudioBuffer>>} */
const _waveBufCache = new Map();
/** @type {Promise<void>} */
let _waveQueue = Promise.resolve();

/** Pause waveform decode while timeline is playing (avoids CPU spikes / audio glitches). */
export function setWaveformSuspended(v) {
  _waveSuspended = !!v;
}

/** @param {string} url */
async function loadWaveAudioBuffer(url) {
  let pending = _waveBufCache.get(url);
  if (!pending) {
    pending = (async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = await res.arrayBuffer();
      const ac = new AudioContext();
      try {
        return await ac.decodeAudioData(buf.slice(0));
      } finally {
        await ac.close();
      }
    })();
    _waveBufCache.set(url, pending);
  }
  return pending;
}

/**
 * Draw waveform into canvas (v2-style, trimmed region).
 * @param {HTMLCanvasElement} canvas
 * @param {string} sourcePath
 * @param {{ sourceInSec?: number, sourceOutSec?: number }} [opt]
 */
export function drawAudioWaveform(canvas, sourcePath, opt = {}) {
  if (!canvas || _waveSuspended) return;
  const url = resolveAudioUrl(sourcePath);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const token = String(++_waveDrawSeq);
  canvas.dataset.waveToken = token;

  _waveQueue = _waveQueue.then(async () => {
    if (_waveSuspended || canvas.dataset.waveToken !== token) return;

    try {
      const audioBuf = await loadWaveAudioBuffer(url);
      if (_waveSuspended || canvas.dataset.waveToken !== token) return;

      const w = Math.max(Number(canvas.dataset.wavePixelW) || canvas.clientWidth || 120, 40);
      const h = Math.max(canvas.clientHeight || 28, 16);
      canvas.width = w;
      canvas.height = h;

      if (_waveSuspended || canvas.dataset.waveToken !== token) return;

      const data = audioBuf.getChannelData(0);
      const total = data.length;
      const rate = audioBuf.sampleRate;
      const inSec = Math.max(0, opt.sourceInSec ?? 0);
      const outSec = Math.min(audioBuf.duration, opt.sourceOutSec ?? audioBuf.duration);
      const startIdx = Math.floor(inSec * rate);
      const endIdx = Math.ceil(outSec * rate);
      const span = Math.max(1, endIdx - startIdx);
      const step = Math.max(1, Math.floor(span / w));

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(120, 175, 235, 0.85)';
      const mid = h / 2;
      for (let x = 0; x < w; x++) {
        const i0 = startIdx + Math.floor((x / w) * span);
        let min = 1;
        let max = -1;
        for (let j = 0; j < step; j++) {
          const v = data[Math.min(total - 1, i0 + j)] ?? 0;
          if (v < min) min = v;
          if (v > max) max = v;
        }
        const amp = Math.max(Math.abs(min), Math.abs(max));
        const barH = Math.max(1, amp * (h - 2));
        ctx.fillRect(x, mid - barH / 2, 1, barH);
      }
    } catch (err) {
      if (canvas.dataset.waveToken === token) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      console.warn('[waveform]', err);
    }
  }).catch((err) => {
    console.warn('[waveform queue]', err);
  });
}

/** @param {number} sec */
export function formatAudioTime(sec) {
  if (!Number.isFinite(sec)) return '0:00.0';
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${m}:${s.toFixed(1).padStart(m > 0 ? 4 : 3, '0')}`;
}

/** @param {import('./types.js').AudioClip} clip @param {number} timelineSec */
export function clipContainsTime(clip, timelineSec) {
  return timelineSec >= clip.timelineStartSec - 1e-6
    && timelineSec < clip.timelineStartSec + clip.durationSec + 1e-6;
}

/** @param {import('./types.js').AudioClip} clip @param {number} splitTimelineSec */
export function canSplitClipAt(clip, splitTimelineSec) {
  const rel = splitTimelineSec - clip.timelineStartSec;
  return rel > MIN_CLIP_SEC && rel < clip.durationSec - MIN_CLIP_SEC;
}
