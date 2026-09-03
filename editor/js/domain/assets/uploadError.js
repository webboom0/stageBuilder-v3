/** Shared upload HTTP error parsing — nginx 413 HTML must not appear in alerts. */

const SIZE_HINT =
  '캐릭터·스테이지 최대 100MB, 오디오 50MB, 비디오 500MB입니다.';

/**
 * @param {string} raw
 * @param {number} status
 */
function isEntityTooLarge(raw, status) {
  if (status === 413) return true;
  return /request entity too large|413/i.test(raw || '');
}

/**
 * @param {Response} res
 * @returns {Promise<string>}
 */
export async function readHttpUploadError(res) {
  const raw = await res.text().catch(() => '');
  if (isEntityTooLarge(raw, res.status)) {
    return `파일 크기가 서버 제한을 초과했습니다.\n${SIZE_HINT}`;
  }
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.error) return String(data.error);
    } catch {
      /* html or plain text */
    }
    if (/<\s*html/i.test(raw)) {
      return `서버 오류 (HTTP ${res.status})`;
    }
    const plain = raw.trim();
    if (plain && plain.length <= 240) return plain;
  }
  return `서버 오류 (HTTP ${res.status})`;
}

/** @param {unknown} err */
export function formatUploadFailureAlert(err) {
  const msg = String(err?.message || err || '').trim();
  if (!msg) return '업로드에 실패했습니다.';
  if (/^업로드 실패/.test(msg) || /^파일 크기가/.test(msg) || /^지원하지 않는/.test(msg)) {
    return msg;
  }
  return `업로드 실패\n\n${msg}`;
}
