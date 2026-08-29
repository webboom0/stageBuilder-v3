/**
 * StageBuilder v4 — project folder API (Phase 6).
 * Mount from v4 server/server.js and pivot nginx/server.js:
 *
 *   const { mountProjectRoutes } = require('./projectsRoutes');
 *   mountProjectRoutes(app, { requireAuth, filesRoot, helpers });
 *
 * @param {import('express').Express} app
 * @param {{
 *   requireAuth: import('express').RequestHandler,
 *   filesRoot: string,
 *   ensureDir: (p: string) => void,
 *   getUniqueFileName: (dir: string, name: string) => string,
 *   safeListFiles: (dir: string, prefix: string, exts?: string[] | null) => any[],
 *   safeDeleteFile: (dir: string, filename: string) => boolean,
 *   buildUploadResponse: (req: any, prefix: string) => object,
 *   MEDIA_EXTS: Record<string, string[]>,
 *   multer: typeof import('multer'),
 *   createFileFilter: (exts: string[]) => import('multer').Options['fileFilter'],
 * }} deps
 */
function mountProjectRoutes(app, deps) {
  const path = require('path');
  const fs = require('fs');
  const {
    requireAuth,
    filesRoot,
    ensureDir,
    getUniqueFileName,
    safeListFiles,
    safeDeleteFile,
    buildUploadResponse,
    MEDIA_EXTS,
    multer,
    createFileFilter,
  } = deps;

  const PROJECTS_ROOT = path.join(filesRoot, 'projects');
  ensureDir(PROJECTS_ROOT);

  /** @type {Record<string, { subDir: string, field: string, exts: string[], maxBytes: number }>} */
  const ASSET_KINDS = {
    characters: {
      subDir: 'assets/characters',
      field: 'fbxFile',
      exts: MEDIA_EXTS.characters || MEDIA_EXTS.fbx,
      maxBytes: 100 * 1024 * 1024,
    },
    props: {
      subDir: 'assets/props',
      field: 'propFile',
      exts: MEDIA_EXTS.props,
      maxBytes: 100 * 1024 * 1024,
    },
    audio: {
      subDir: 'assets/audio',
      field: 'audioFile',
      exts: MEDIA_EXTS.music,
      maxBytes: 50 * 1024 * 1024,
    },
    video: {
      subDir: 'assets/video',
      field: 'video',
      exts: MEDIA_EXTS.video,
      maxBytes: 500 * 1024 * 1024,
    },
  };

  function projectsRoot() {
    return PROJECTS_ROOT;
  }

  function projectDir(projectId) {
    const safe = path.basename(String(projectId || ''));
    if (!safe || safe !== projectId) return null;
    return path.join(PROJECTS_ROOT, safe);
  }

  function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  function writeJson(filePath, data) {
    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  function copyDirectoryRecursive(src, dest) {
    ensureDir(dest);
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) copyDirectoryRecursive(srcPath, destPath);
      else fs.copyFileSync(srcPath, destPath);
    }
  }

  function slugify(name) {
    const base = String(name || 'project')
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^\w\uAC00-\uD7A3-]/g, '')
      .slice(0, 48);
    return base || 'project';
  }

  function uniqueProjectId(baseName) {
    let id = slugify(baseName);
    let n = 2;
    while (fs.existsSync(path.join(PROJECTS_ROOT, id))) {
      id = `${slugify(baseName)}_${n}`;
      n += 1;
    }
    return id;
  }

  function ensureProjectAssetDirs(dir) {
    for (const kind of Object.keys(ASSET_KINDS)) {
      ensureDir(path.join(dir, ASSET_KINDS[kind].subDir));
    }
    ensureDir(path.join(dir, 'scenes'));
  }

  function defaultSceneDocument(sceneId, name) {
    return {
      version: 4,
      id: sceneId,
      name: name || '1막',
      stageType: 'proscenium',
      durationSec: 180,
      durationMode: 'clampEnd',
      playheadSec: 0,
      tracks: [],
      folders: [],
      motions: [],
      groups: [],
      video: null,
      audioMasterVolume: 1,
    };
  }

  function createProjectOnDisk(projectId, meta) {
    const dir = path.join(PROJECTS_ROOT, projectId);
    ensureProjectAssetDirs(dir);

    const now = new Date().toISOString();
    const sceneId = 'scene_01';
    const sceneFile = `scenes/${sceneId}.json`;

    /** @type {object} */
    const project = {
      version: 4,
      id: projectId,
      name: meta.showName || projectId,
      showName: meta.showName || projectId,
      genre: meta.genre || '',
      startDate: meta.startDate || '',
      endDate: meta.endDate || '',
      showPeriod: meta.showPeriod || '',
      venue: meta.venue || '',
      director: meta.director || '',
      stageProfile: meta.stageProfile || null,
      scenes: [{ id: sceneId, name: '1막', order: 0, file: sceneFile }],
      activeSceneId: sceneId,
      createdAt: now,
      updatedAt: now,
    };

    writeJson(path.join(dir, 'project.json'), project);
    writeJson(path.join(dir, sceneFile), defaultSceneDocument(sceneId, '1막'));
    writeJson(path.join(dir, 'manifest.json'), { version: 4, assets: [] });

    return project;
  }

  function publicPrefix(projectId, kind) {
    const cfg = ASSET_KINDS[kind];
    if (!cfg) return null;
    return `/files/projects/${projectId}/${cfg.subDir.replace(/\\/g, '/')}/`;
  }

  function assetRelPath(kind, filename) {
    const cfg = ASSET_KINDS[kind];
    return `${cfg.subDir}/${filename}`.replace(/\\/g, '/');
  }

  function createProjectUpload(kind) {
    const cfg = ASSET_KINDS[kind];
    return multer({
      storage: multer.diskStorage({
        destination: (req, _file, cb) => {
          const dir = projectDir(req.params.id);
          if (!dir) return cb(new Error('잘못된 프로젝트 ID'));
          const uploadPath = path.join(dir, cfg.subDir);
          ensureDir(uploadPath);
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const dir = projectDir(req.params.id);
          const uploadPath = path.join(dir, cfg.subDir);
          cb(null, getUniqueFileName(uploadPath, file.originalname));
        },
      }),
      limits: { fileSize: cfg.maxBytes },
      fileFilter: createFileFilter(cfg.exts),
    });
  }

  const uploadByKind = {};
  for (const kind of Object.keys(ASSET_KINDS)) {
    uploadByKind[kind] = createProjectUpload(kind);
  }

  // ─── List / create / read / update / delete project ───

  app.get('/api/projects', requireAuth, (_req, res) => {
    if (!fs.existsSync(PROJECTS_ROOT)) return res.json([]);
    const dirs = fs.readdirSync(PROJECTS_ROOT, { withFileTypes: true }).filter((d) => d.isDirectory());
    const projects = dirs
      .map((d) => {
        const projectJson = path.join(PROJECTS_ROOT, d.name, 'project.json');
        if (!fs.existsSync(projectJson)) return null;
        try {
          const data = readJson(projectJson);
          const stats = fs.statSync(projectJson);
          return {
            id: d.name,
            name: data.showName || data.name || d.name,
            sceneCount: Array.isArray(data.scenes) ? data.scenes.length : 0,
            updatedAt: data.updatedAt || stats.mtime.toISOString(),
          };
        } catch {
          return { id: d.name, name: d.name, sceneCount: 0, updatedAt: null };
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    res.json(projects);
  });

  app.post('/api/projects', requireAuth, (req, res) => {
    const meta = req.body || {};
    if (!meta.showName || !String(meta.showName).trim()) {
      return res.status(400).json({ error: '공연명(showName)이 필요합니다.' });
    }
    const projectId = uniqueProjectId(meta.showName);
    try {
      const project = createProjectOnDisk(projectId, meta);
      return res.status(201).json({ success: true, project });
    } catch (err) {
      console.error('[projects] create failed:', err);
      return res.status(500).json({ error: err.message || '프로젝트 생성 실패' });
    }
  });

  app.get('/api/projects/:id', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    try {
      const project = readJson(projectPath);
      return res.json({ project });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/projects/:id', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    try {
      const prev = readJson(projectPath);
      const patch = req.body?.project || req.body || {};
      const next = {
        ...prev,
        ...patch,
        id: prev.id,
        version: 4,
        updatedAt: new Date().toISOString(),
      };
      writeJson(projectPath, next);
      return res.json({ success: true, project: next });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir || !fs.existsSync(dir)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      return res.json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Scenes ───

  // Must be registered before /scenes/:sceneId so "order" is not captured as sceneId
  app.put('/api/projects/:id/scenes/order', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    const sceneIds = req.body?.sceneIds;
    if (!Array.isArray(sceneIds) || !sceneIds.length) {
      return res.status(400).json({ error: 'sceneIds 배열이 필요합니다.' });
    }
    try {
      const project = readJson(projectPath);
      const scenes = Array.isArray(project.scenes) ? project.scenes : [];
      const byId = new Map(scenes.map((s) => [s.id, s]));
      if (sceneIds.length !== scenes.length || sceneIds.some((id) => !byId.has(id))) {
        return res.status(400).json({ error: '씬 ID 목록이 프로젝트와 일치하지 않습니다.' });
      }
      project.scenes = sceneIds.map((id, i) => {
        const s = byId.get(id);
        return { ...s, order: i };
      });
      project.updatedAt = new Date().toISOString();
      writeJson(projectPath, project);
      return res.json({ success: true, project });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/projects/:id/scenes/:sceneId', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const scenePath = path.join(dir, 'scenes', `${path.basename(req.params.sceneId)}.json`);
    if (!fs.existsSync(scenePath)) return res.status(404).json({ error: '씬을 찾을 수 없습니다.' });
    try {
      return res.json({ scene: readJson(scenePath) });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/projects/:id/scenes/:sceneId', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const sceneId = path.basename(req.params.sceneId);
    const scene = req.body?.scene || req.body;
    if (!scene || typeof scene !== 'object') {
      return res.status(400).json({ error: 'scene JSON이 필요합니다.' });
    }
    const scenePath = path.join(dir, 'scenes', `${sceneId}.json`);
    try {
      const next = { ...scene, id: sceneId, version: 4 };
      writeJson(scenePath, next);

      const projectPath = path.join(dir, 'project.json');
      if (fs.existsSync(projectPath)) {
        const project = readJson(projectPath);
        project.updatedAt = new Date().toISOString();
        writeJson(projectPath, project);
      }

      if (req.body?.manifest) {
        writeJson(path.join(dir, 'manifest.json'), req.body.manifest);
      }

      return res.json({ success: true, scene: next });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/projects/:id/scenes', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    try {
      const project = readJson(projectPath);
      const scenes = Array.isArray(project.scenes) ? project.scenes : [];
      const n = scenes.length + 1;
      const sceneId = `scene_${String(n).padStart(2, '0')}`;
      const name = req.body?.name || `${n}막`;
      const sceneFile = `scenes/${sceneId}.json`;
      writeJson(path.join(dir, sceneFile), defaultSceneDocument(sceneId, name));
      scenes.push({ id: sceneId, name, order: n - 1, file: sceneFile });
      project.scenes = scenes;
      project.activeSceneId = sceneId;
      project.updatedAt = new Date().toISOString();
      writeJson(projectPath, project);
      return res.status(201).json({ success: true, project, sceneId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/projects/:id/scenes/:sceneId', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    if (!dir) return res.status(400).json({ error: '잘못된 프로젝트 ID' });
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    const sceneId = path.basename(req.params.sceneId);
    try {
      const project = readJson(projectPath);
      const scenes = Array.isArray(project.scenes) ? project.scenes : [];
      if (scenes.length <= 1) {
        return res.status(400).json({ error: '마지막 씬은 삭제할 수 없습니다.' });
      }
      const idx = scenes.findIndex((s) => s.id === sceneId);
      if (idx < 0) return res.status(404).json({ error: '씬을 찾을 수 없습니다.' });
      const scenePath = path.join(dir, 'scenes', `${sceneId}.json`);
      if (fs.existsSync(scenePath)) fs.unlinkSync(scenePath);
      scenes.splice(idx, 1);
      scenes.forEach((s, i) => { s.order = i; });
      project.scenes = scenes;
      if (project.activeSceneId === sceneId) {
        project.activeSceneId = scenes[Math.min(idx, scenes.length - 1)].id;
      }
      project.updatedAt = new Date().toISOString();
      writeJson(projectPath, project);
      return res.json({ success: true, project, activeSceneId: project.activeSceneId });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // ─── Project-scoped assets ───

  app.get('/api/projects/:id/assets/:kind', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    const kind = req.params.kind;
    const cfg = ASSET_KINDS[kind];
    if (!dir || !cfg) return res.status(400).json({ error: '잘못된 요청' });
    const assetDir = path.join(dir, cfg.subDir);
    const prefix = publicPrefix(req.params.id, kind);
    const files = safeListFiles(assetDir, prefix, cfg.exts).map((f) => ({
      ...f,
      relPath: assetRelPath(kind, f.filename),
    }));
    return res.json(files);
  });

  app.post('/api/projects/:id/assets/:kind', requireAuth, (req, res, next) => {
    const kind = req.params.kind;
    const upload = uploadByKind[kind];
    if (!upload) return res.status(400).json({ error: '지원하지 않는 asset 종류' });
    upload.single(ASSET_KINDS[kind].field)(req, res, (err) => {
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: `${ASSET_KINDS[kind].field}이 필요합니다.` });
      const prefix = publicPrefix(req.params.id, kind);
      const resp = buildUploadResponse(req, prefix);
      resp.file.relPath = assetRelPath(kind, req.file.filename);
      return res.json(resp);
    });
  });

  app.delete('/api/projects/:id/assets/:kind/:filename', requireAuth, (req, res) => {
    const dir = projectDir(req.params.id);
    const kind = req.params.kind;
    const cfg = ASSET_KINDS[kind];
    if (!dir || !cfg) return res.status(400).json({ error: '잘못된 요청' });
    const ok = safeDeleteFile(path.join(dir, cfg.subDir), req.params.filename);
    if (!ok) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    return res.json({ success: true });
  });

  // ─── Bundle ZIP export / import ───

  const AdmZip = require('adm-zip');
  const extractZip = require('extract-zip');

  const ZIP_MAX_BYTES = 1024 * 1024 * 1024;
  const uploadProjectZip = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => {
        const tmp = path.join(filesRoot, '.import-tmp');
        ensureDir(tmp);
        cb(null, tmp);
      },
      filename: (_req, file, cb) => {
        cb(null, `import_${Date.now()}${path.extname(file.originalname).toLowerCase() || '.zip'}`);
      },
    }),
    limits: { fileSize: ZIP_MAX_BYTES },
    fileFilter: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      if (ext === '.zip') return cb(null, true);
      return cb(new Error('ZIP 파일만 업로드할 수 있습니다.'));
    },
  });

  /** @param {string} extractDir @returns {string | null} */
  function findProjectRootInExtract(extractDir) {
    const direct = path.join(extractDir, 'project.json');
    if (fs.existsSync(direct)) return extractDir;
    const entries = fs.readdirSync(extractDir, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const e of entries) {
      const sub = path.join(extractDir, e.name, 'project.json');
      if (fs.existsSync(sub)) return path.join(extractDir, e.name);
    }
    return null;
  }

  app.get('/api/projects/:id/export', requireAuth, (req, res) => {
    const projectId = path.basename(req.params.id);
    const dir = projectDir(projectId);
    if (!dir || !fs.existsSync(dir)) {
      return res.status(404).json({ error: '프로젝트를 찾을 수 없습니다.' });
    }
    const projectPath = path.join(dir, 'project.json');
    if (!fs.existsSync(projectPath)) {
      return res.status(404).json({ error: 'project.json이 없습니다.' });
    }
    let project;
    try {
      project = readJson(projectPath);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
    const zipBase = slugify(project.showName || project.name || projectId) || projectId;
    const mode = req.query.mode === 'link' ? 'link' : 'bundle';
    const filename = mode === 'link' ? `${zipBase}_link.zip` : `${zipBase}.zip`;
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);

    try {
      const zip = new AdmZip();
      const prefix = `${projectId}/`;

      if (mode === 'link') {
        zip.addFile(`${prefix}project.json`, fs.readFileSync(projectPath));
        const manifestPath = path.join(dir, 'manifest.json');
        if (fs.existsSync(manifestPath)) {
          zip.addFile(`${prefix}manifest.json`, fs.readFileSync(manifestPath));
        }
        const scenesDir = path.join(dir, 'scenes');
        if (fs.existsSync(scenesDir)) {
          for (const name of fs.readdirSync(scenesDir)) {
            if (!name.endsWith('.json')) continue;
            zip.addFile(
              `${prefix}scenes/${name}`,
              fs.readFileSync(path.join(scenesDir, name)),
            );
          }
        }
      } else {
        zip.addLocalFolder(dir, projectId);
      }

      const buffer = zip.toBuffer();
      res.send(buffer);
    } catch (err) {
      console.error('[projects] export zip error:', err);
      if (!res.headersSent) return res.status(500).json({ error: err.message });
      return res.end();
    }
  });

  app.post('/api/projects/import', requireAuth, (req, res, next) => {
    uploadProjectZip.single('projectZip')(req, res, (err) => {
      if (err) return next(err);
      if (!req.file) return res.status(400).json({ error: 'projectZip 파일이 필요합니다.' });

      const zipPath = req.file.path;
      const extractRoot = path.join(path.dirname(zipPath), `extract_${Date.now()}`);
      ensureDir(extractRoot);

      void (async () => {
        try {
          await extractZip(zipPath, { dir: extractRoot });

          const srcRoot = findProjectRootInExtract(extractRoot);
          if (!srcRoot) {
            fs.rmSync(extractRoot, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
            return res.status(400).json({ error: 'ZIP 안에 project.json을 찾을 수 없습니다.' });
          }

          let project;
          try {
            project = readJson(path.join(srcRoot, 'project.json'));
          } catch (parseErr) {
            fs.rmSync(extractRoot, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
            return res.status(400).json({ error: `project.json 읽기 실패: ${parseErr.message}` });
          }

          const baseId = slugify(project.id || project.showName || project.name || path.basename(srcRoot));
          const projectId = uniqueProjectId(baseId || 'project');
          const destDir = path.join(PROJECTS_ROOT, projectId);

          if (projectId !== (project.id || baseId)) {
            project.id = projectId;
            project.updatedAt = new Date().toISOString();
            writeJson(path.join(srcRoot, 'project.json'), project);
          }

          if (fs.existsSync(destDir)) {
            fs.rmSync(destDir, { recursive: true, force: true });
          }
          copyDirectoryRecursive(srcRoot, destDir);
          fs.rmSync(extractRoot, { recursive: true, force: true });
          fs.unlinkSync(zipPath);

          return res.status(201).json({ success: true, projectId, project });
        } catch (importErr) {
          try {
            if (fs.existsSync(extractRoot)) fs.rmSync(extractRoot, { recursive: true, force: true });
            if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
          } catch { /* ignore cleanup */ }
          return res.status(500).json({ error: importErr.message });
        }
      })();
    });
  });

  return { projectsRoot, ASSET_KINDS };
}

module.exports = { mountProjectRoutes };
