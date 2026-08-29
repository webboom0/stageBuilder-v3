import { apiUrl } from '../../config/app-config.js';

/**
 * @returns {Promise<boolean>}
 */
export async function probeProjectsApi() {
  try {
    const res = await fetch(apiUrl('/api/projects'), { credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

/** @returns {Promise<Array<{ id: string, name: string, sceneCount: number, updatedAt: string }>>} */
export async function listProjects() {
  const res = await fetch(apiUrl('/api/projects'), { credentials: 'include' });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/**
 * @param {object} meta — showName, genre, startDate, endDate, venue, director, stageProfile
 */
export async function createProject(meta) {
  const res = await fetch(apiUrl('/api/projects'), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.project;
}

/** @param {string} projectId */
export async function fetchProject(projectId) {
  const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectId)}`), {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.project;
}

/** @param {string} projectId @param {object} project */
export async function saveProjectMeta(projectId, project) {
  const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectId)}`), {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.project;
}

/** @param {string} projectId */
export async function deleteProject(projectId) {
  const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectId)}`), {
    method: 'DELETE',
    credentials: 'include',
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @param {string} projectId @param {string} sceneId */
export async function fetchScene(projectId, sceneId) {
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`),
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.scene;
}

/**
 * @param {string} projectId
 * @param {string} sceneId
 * @param {object} scene
 * @param {object} [manifest]
 */
export async function saveScene(projectId, sceneId, scene, manifest = null) {
  const body = { scene };
  if (manifest) body.manifest = manifest;
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`),
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  const data = await res.json();
  return data.scene;
}

/** @param {string} projectId @param {string} sceneId */
export async function deleteScene(projectId, sceneId) {
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/scenes/${encodeURIComponent(sceneId)}`),
    { method: 'DELETE', credentials: 'include' },
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @param {string} projectId @param {string[]} sceneIds — ordered scene ids */
export async function reorderScenes(projectId, sceneIds) {
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/scenes/order`),
    {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sceneIds }),
    },
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @param {string} projectId @param {'bundle' | 'snapshot'} [mode] */
export async function exportProjectBundle(projectId, mode = 'bundle') {
  const q = mode === 'snapshot' ? '?mode=snapshot' : '';
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/export${q}`),
    { credentials: 'include' },
  );
  if (!res.ok) throw new Error(await readError(res));
  const blob = await res.blob();
  let filename = `${projectId}.zip`;
  const cd = res.headers.get('Content-Disposition');
  if (cd) {
    const star = cd.match(/filename\*=UTF-8''([^;\s]+)/i);
    const plain = cd.match(/filename="([^"]+)"/i);
    if (star?.[1]) filename = decodeURIComponent(star[1]);
    else if (plain?.[1]) filename = plain[1];
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @param {string} projectId */
export async function exportProjectSnapshot(projectId) {
  return exportProjectBundle(projectId, 'snapshot');
}

/**
 * @param {string} projectId
 * @param {File} file — snapshot ZIP (JSON only)
 * @returns {Promise<{ projectId: string, project: object }>}
 */
export async function restoreProjectSnapshot(projectId, file) {
  const fd = new FormData();
  fd.append('snapshotZip', file);
  const res = await fetch(
    apiUrl(`/api/projects/${encodeURIComponent(projectId)}/snapshot/restore`),
    { method: 'POST', credentials: 'include', body: fd },
  );
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/**
 * @param {File} file — bundle ZIP from export
 * @returns {Promise<{ projectId: string, project: object }>}
 */
export async function importProjectBundle(file) {
  const fd = new FormData();
  fd.append('projectZip', file);
  const res = await fetch(apiUrl('/api/projects/import'), {
    method: 'POST',
    credentials: 'include',
    body: fd,
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @param {string} projectId @param {string} [name] */
export async function addScene(projectId, name) {
  const res = await fetch(apiUrl(`/api/projects/${encodeURIComponent(projectId)}/scenes`), {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(await readError(res));
  return res.json();
}

/** @param {Response} res */
async function readError(res) {
  try {
    const data = await res.json();
    if (data?.error) return data.error;
  } catch {
    /* non-JSON body (e.g. Express default 404 page) */
  }
  if (res.status === 404) {
    return 'API를 찾을 수 없습니다. server를 재시작했는지 확인하세요. (node server.js)';
  }
  return res.statusText || '요청 실패';
}
