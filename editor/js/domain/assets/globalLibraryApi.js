import { API, apiUrl } from '../../config/app-config.js';
import { probePropApiAvailable } from '../motion/propCatalog.js';

/** Must match server/server.js MEDIA_EXTS + limits */
export const LIBRARY_UPLOAD_RULES = Object.freeze({
  character: Object.freeze({
    label: '캐릭터',
    exts: ['.fbx'],
    extHint: '.fbx',
    maxBytes: 100 * 1024 * 1024,
    maxLabel: '100MB',
  }),
  stage: Object.freeze({
    label: '스테이지',
    exts: ['.fbx', '.obj'],
    extHint: '.fbx, .obj',
    maxBytes: 100 * 1024 * 1024,
    maxLabel: '100MB',
  }),
  video: Object.freeze({
    label: '비디오',
    exts: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
    extHint: '.mp4, .webm, .mov, .avi, .ogg',
    maxBytes: 500 * 1024 * 1024,
    maxLabel: '500MB',
  }),
  audio: Object.freeze({
    label: '오디오',
    exts: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
    extHint: '.mp3, .wav, .ogg, .m4a, .aac, .flac',
    maxBytes: 50 * 1024 * 1024,
    maxLabel: '50MB',
  }),
});

/** @param {string} name */
function fileExt(name) {
  const i = String(name).lastIndexOf('.');
  if (i < 0) return '';
  return String(name).slice(i).toLowerCase();
}

/**
 * @param {File} file
 * @param {'character' | 'stage' | 'video' | 'audio'} kind
 * @param {{ propApiAvailable?: boolean | null }} [opts]
 * @returns {string | null}
 */
export function validateLibraryUpload(file, kind, opts = {}) {
  const rules = LIBRARY_UPLOAD_RULES[kind];
  const ext = fileExt(file.name);
  if (kind === 'stage' && ext === '.obj' && opts.propApiAvailable === false) {
    return [
      'PIVOT 서버에는 Stage(OBJ) API가 없습니다.',
      '',
      'FBX만 업로드할 수 있습니다.',
      'OBJ는 v4 개발 서버 또는 PIVOT server.js 업데이트 후 사용하세요.',
    ].join('\n');
  }
  if (!rules.exts.includes(ext)) {
    return [
      '지원하지 않는 파일 형식입니다.',
      '',
      `${rules.label} — 허용: ${rules.extHint}`,
      `선택한 파일: ${file.name}`,
    ].join('\n');
  }
  if (file.size > rules.maxBytes) {
    const mb = (file.size / (1024 * 1024)).toFixed(1);
    return [
      '파일 크기가 제한을 초과했습니다.',
      '',
      `${rules.label} — 최대 ${rules.maxLabel}`,
      `선택한 파일: ${file.name} (${mb}MB)`,
    ].join('\n');
  }
  return null;
}

/** @param {Response} res */
async function readUploadError(res) {
  const raw = await res.text().catch(() => '');
  if (raw) {
    try {
      const data = JSON.parse(raw);
      if (data?.error) return String(data.error);
    } catch {
      /* plain text */
    }
    if (raw.length <= 240) return raw;
    return raw.slice(0, 240);
  }
  if (res.status === 413) return '파일 크기가 제한을 초과했습니다.';
  return `서버 오류 (HTTP ${res.status})`;
}

/**
 * @param {'character' | 'stage' | 'video' | 'audio'} tab
 * @param {File} file
 * @param {{ propApiAvailable?: boolean | null }} [opts]
 */
export async function uploadGlobalLibraryAsset(tab, file, opts = {}) {
  let propApiAvailable = opts.propApiAvailable;
  if (tab === 'stage' && propApiAvailable == null) {
    propApiAvailable = await probePropApiAvailable();
  }

  const fd = new FormData();
  let endpoint = API.uploadFbx;
  let field = 'fbxFile';
  if (tab === 'stage') {
    endpoint = propApiAvailable === false ? API.uploadFbx : API.uploadProp;
    field = propApiAvailable === false ? 'fbxFile' : 'propFile';
  } else if (tab === 'video') {
    endpoint = API.uploadVideo;
    field = 'video';
  } else if (tab === 'audio') {
    endpoint = API.uploadAudio;
    field = 'audioFile';
  }
  fd.append(field, file);

  const res = await fetch(apiUrl(endpoint), {
    method: 'POST',
    body: fd,
    credentials: 'include',
  });
  if (!res.ok) {
    if (tab === 'stage' && endpoint === API.uploadProp) {
      const fd2 = new FormData();
      fd2.append('fbxFile', file);
      const res2 = await fetch(apiUrl(API.uploadFbx), {
        method: 'POST',
        body: fd2,
        credentials: 'include',
      });
      if (!res2.ok) throw new Error(await readUploadError(res2));
      return;
    }
    throw new Error(await readUploadError(res));
  }
}

/**
 * @param {'character' | 'stage' | 'video' | 'audio'} tab
 * @param {string} filename
 * @param {{ propApiAvailable?: boolean | null }} [opts]
 */
export async function deleteGlobalLibraryAsset(tab, filename, opts = {}) {
  let propApiAvailable = opts.propApiAvailable;
  if (tab === 'stage' && propApiAvailable == null) {
    propApiAvailable = await probePropApiAvailable();
  }

  let path = API.deleteFbx;
  if (tab === 'stage') path = propApiAvailable === false ? API.deleteFbx : API.deleteProp;
  else if (tab === 'video') path = API.deleteVideo;
  else if (tab === 'audio') path = API.deleteAudio;

  const res = await fetch(apiUrl(`${path}/${encodeURIComponent(filename)}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
