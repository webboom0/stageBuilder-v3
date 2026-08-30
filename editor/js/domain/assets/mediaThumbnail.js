const THUMB_SIZE = 72;

/** @type {Map<string, string>} */
const cache = new Map();
/** @type {Map<string, Promise<string | null>>} */
const inflight = new Map();

/**
 * @param {HTMLVideoElement} video
 * @returns {string | null}
 */
function captureVideoFrame(video) {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return null;

  const canvas = document.createElement('canvas');
  canvas.width = THUMB_SIZE;
  canvas.height = THUMB_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const scale = Math.max(THUMB_SIZE / vw, THUMB_SIZE / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (THUMB_SIZE - dw) / 2, (THUMB_SIZE - dh) / 2, dw, dh);
  return canvas.toDataURL('image/png');
}

/**
 * @param {string} url
 * @returns {Promise<string | null>}
 */
function renderVideoThumb(url) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };

    const onError = () => finish(null);

    video.addEventListener('error', onError, { once: true });
    video.addEventListener('loadeddata', () => {
      const onSeeked = () => {
        try {
          finish(captureVideoFrame(video));
        } catch {
          finish(null);
        }
      };
      video.addEventListener('seeked', onSeeked, { once: true });
      try {
        video.currentTime = Math.min(0.1, Math.max(0, (video.duration || 1) * 0.05));
      } catch {
        onSeeked();
      }
    }, { once: true });

    video.src = url;
  });
}

/**
 * @param {string} url
 * @returns {Promise<string | null>}
 */
export function getVideoThumbnailDataUrl(url) {
  if (!url) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached) return Promise.resolve(cached);

  const running = inflight.get(url);
  if (running) return running;

  const promise = renderVideoThumb(url).then((dataUrl) => {
    if (dataUrl) cache.set(url, dataUrl);
    inflight.delete(url);
    return dataUrl;
  });

  inflight.set(url, promise);
  return promise;
}
