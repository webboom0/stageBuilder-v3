/**
 * StageBuilder v4 local dev server
 * Compatible with pivot nginx/server.js StageBuilder routes.
 *
 * Set DEV_SKIP_AUTH=1 for local editing without JWT.
 */
const express = require('express');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const cors = require('cors');
const { mountProjectRoutes } = require('./projectsRoutes');
const { mountAiPatternRoutes } = require('./aiPatternRoutes');

const SECRET_KEY = process.env.SECRET_KEY || 'pivot-secret-key';
const PORT = Number(process.env.PORT) || 3000;
// Local dev: skip JWT unless explicitly disabled (DEV_SKIP_AUTH=0)
const DEV_SKIP_AUTH =
  process.env.DEV_SKIP_AUTH === '1' ||
  (process.env.DEV_SKIP_AUTH !== '0' && process.env.NODE_ENV !== 'production');

const ROOT = path.join(__dirname, '..');
const EDITOR_ROOT = path.join(ROOT, 'editor');
const DOCS_ROOT = path.join(ROOT, 'docs');
const STAGEBUILDER_FILES_ROOT = path.join(__dirname, 'files');
const PROJECTS_ROOT = path.join(STAGEBUILDER_FILES_ROOT, 'projects');

/** Three.js runtime — same bundle as PIVOT/v3 (r172), NOT CDN */
const RUNTIME_CANDIDATES = [
  path.join(ROOT, 'runtime'),
  path.join(ROOT, '..', '..', 'pivot', 'nginx', 'html', 'stageBuilder'),
  path.join(ROOT, '..', 'StageBuilder_v3'),
];

function resolveRuntimeRoot() {
  for (const candidate of RUNTIME_CANDIDATES) {
    const buildFile = path.join(candidate, 'build', 'three.module.js');
    if (fs.existsSync(buildFile)) return candidate;
  }
  return null;
}

const RUNTIME_ROOT = resolveRuntimeRoot();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cookieParser());

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

ensureDir(STAGEBUILDER_FILES_ROOT);
ensureDir(path.join(STAGEBUILDER_FILES_ROOT, 'music'));
ensureDir(path.join(STAGEBUILDER_FILES_ROOT, 'characters'));
ensureDir(path.join(STAGEBUILDER_FILES_ROOT, 'props'));
ensureDir(path.join(STAGEBUILDER_FILES_ROOT, 'video'));
ensureDir(PROJECTS_ROOT);

function requireAuth(req, res, next) {
  if (DEV_SKIP_AUTH) {
    req.user = { sub: 'dev-user' };
    return next();
  }

  let token = req.cookies?.pb_token;
  if (!token) {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7);
  }

  if (!token) {
    return res.status(401).json({ error: '인증이 필요합니다.', redirect: '/login' });
  }

  try {
    req.user = jwt.verify(token, SECRET_KEY, { algorithms: ['HS256'] });
    next();
  } catch {
    res.clearCookie('pb_token');
    return res.status(401).json({ error: '인증이 만료되었습니다.', redirect: '/login' });
  }
}

const MEDIA_EXTS = {
  music: ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'],
  characters: ['.fbx'],
  props: ['.fbx', '.obj'],
  video: ['.mp4', '.webm', '.ogg', '.avi', '.mov'],
};

function getUniqueFileName(dirPath, originalName) {
  const parsed = path.parse(originalName);
  let candidate = `${parsed.name}${parsed.ext}`;
  let n = 2;
  while (fs.existsSync(path.join(dirPath, candidate))) {
    candidate = `${parsed.name}${n}${parsed.ext}`;
    n += 1;
  }
  return candidate;
}

const createStorage = (subDir) =>
  multer.diskStorage({
    destination: (_req, _file, cb) => {
      const uploadPath = path.join(STAGEBUILDER_FILES_ROOT, subDir);
      ensureDir(uploadPath);
      cb(null, uploadPath);
    },
    filename: (_req, file, cb) => {
      const uploadPath = path.join(STAGEBUILDER_FILES_ROOT, subDir);
      cb(null, getUniqueFileName(uploadPath, file.originalname));
    },
  });

function createFileFilter(allowedExtensions) {
  const allow = new Set(allowedExtensions.map((e) => e.toLowerCase()));
  return (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allow.has(ext)) return cb(null, true);
    return cb(new Error(`지원하지 않는 파일 형식입니다: ${ext}`), false);
  };
}

const uploadAudio = multer({
  storage: createStorage('music'),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: createFileFilter(MEDIA_EXTS.music),
});
const uploadFbx = multer({
  storage: createStorage('characters'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: createFileFilter(MEDIA_EXTS.characters),
});
const uploadProp = multer({
  storage: createStorage('props'),
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: createFileFilter(MEDIA_EXTS.props),
});
const uploadVideo = multer({
  storage: createStorage('video'),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: createFileFilter(MEDIA_EXTS.video),
});

function safeListFiles(dirPath, publicPrefix, allowedExtensions = null) {
  if (!fs.existsSync(dirPath)) return [];
  const allow = allowedExtensions ? new Set(allowedExtensions.map((e) => e.toLowerCase())) : null;

  return fs
    .readdirSync(dirPath, { withFileTypes: true })
    .filter((d) => d.isFile())
    .filter((d) => !d.name.startsWith('.') && d.name.toLowerCase() !== 'thumbs.db')
    .filter((d) => !allow || allow.has(path.extname(d.name).toLowerCase()))
    .map((d) => {
      const filename = d.name;
      const stats = fs.statSync(path.join(dirPath, filename));
      const baseName = path.parse(filename).name;
      return {
        name: baseName,
        displayName: baseName.replace(/[_-]/g, ' '),
        filename,
        path: `${publicPrefix}${filename}`,
        size: stats.size,
        modifiedTime: stats.mtime.toISOString(),
      };
    })
    .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));
}

function safeDeleteFile(dirPath, filename) {
  const safeName = path.basename(filename);
  const targetPath = path.join(dirPath, safeName);
  if (!fs.existsSync(targetPath)) return false;
  fs.unlinkSync(targetPath);
  return true;
}

function buildUploadResponse(req, publicPrefix) {
  return {
    success: true,
    message: '파일 업로드가 완료되었습니다.',
    file: {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: `${publicPrefix}${req.file.filename}`,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadTime: new Date().toISOString(),
    },
  };
}

// ─── Health ───
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', devSkipAuth: DEV_SKIP_AUTH, version: 4 });
});

// ─── Audio ───
app.post('/api/upload-audio', requireAuth, uploadAudio.single('audioFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'audioFile이 필요합니다.' });
  return res.json(buildUploadResponse(req, '/files/music/'));
});

app.get('/api/audio-files', requireAuth, (_req, res) => {
  const musicPath = path.join(STAGEBUILDER_FILES_ROOT, 'music');
  return res.json(safeListFiles(musicPath, '/files/music/', MEDIA_EXTS.music));
});

app.delete('/api/audio-files/:filename', requireAuth, (req, res) => {
  const ok = safeDeleteFile(path.join(STAGEBUILDER_FILES_ROOT, 'music'), req.params.filename);
  if (!ok) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  return res.json({ success: true });
});

// ─── Characters (등장인물 FBX) → files/characters/ ───
app.post('/api/upload-fbx', requireAuth, uploadFbx.single('fbxFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'fbxFile이 필요합니다.' });
  return res.json(buildUploadResponse(req, '/files/characters/'));
});

app.get('/api/fbx-files', requireAuth, (_req, res) => {
  const charsPath = path.join(STAGEBUILDER_FILES_ROOT, 'characters');
  return res.json(safeListFiles(charsPath, '/files/characters/', MEDIA_EXTS.characters));
});

app.delete('/api/fbx-files/:filename', requireAuth, (req, res) => {
  const ok = safeDeleteFile(path.join(STAGEBUILDER_FILES_ROOT, 'characters'), req.params.filename);
  if (!ok) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  return res.json({ success: true });
});

// ─── Stage props (무대·소품 FBX/OBJ) ───
app.post('/api/upload-prop', requireAuth, uploadProp.single('propFile'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'propFile이 필요합니다.' });
  return res.json(buildUploadResponse(req, '/files/props/'));
});

app.get('/api/prop-files', requireAuth, (_req, res) => {
  const propsPath = path.join(STAGEBUILDER_FILES_ROOT, 'props');
  return res.json(safeListFiles(propsPath, '/files/props/', MEDIA_EXTS.props));
});

app.delete('/api/prop-files/:filename', requireAuth, (req, res) => {
  const ok = safeDeleteFile(path.join(STAGEBUILDER_FILES_ROOT, 'props'), req.params.filename);
  if (!ok) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  return res.json({ success: true });
});

// ─── Video ───

// ─── Video ───
app.post('/api/upload-video', requireAuth, uploadVideo.single('video'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'video가 필요합니다.' });
  return res.json(buildUploadResponse(req, '/files/video/'));
});

app.get('/api/video-files', requireAuth, (_req, res) => {
  const videoPath = path.join(STAGEBUILDER_FILES_ROOT, 'video');
  return res.json(safeListFiles(videoPath, '/files/video/', MEDIA_EXTS.video));
});

app.delete('/api/video-files/:filename', requireAuth, (req, res) => {
  const ok = safeDeleteFile(path.join(STAGEBUILDER_FILES_ROOT, 'video'), req.params.filename);
  if (!ok) return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
  return res.json({ success: true });
});

// ─── Projects (Phase 6) — shared module for pivot require ───
mountProjectRoutes(app, {
  requireAuth,
  filesRoot: STAGEBUILDER_FILES_ROOT,
  ensureDir,
  getUniqueFileName,
  safeListFiles,
  safeDeleteFile,
  buildUploadResponse,
  MEDIA_EXTS,
  multer,
  createFileFilter,
});

mountAiPatternRoutes(app, { requireAuth });

// ─── Static (pivot-compatible paths) ───
if (RUNTIME_ROOT) {
  app.use('/build', express.static(path.join(RUNTIME_ROOT, 'build')));
  app.use('/examples', express.static(path.join(RUNTIME_ROOT, 'examples')));
} else {
  console.warn(
    '[StageBuilder] Three.js runtime not found. Link runtime/ → pivot html/stageBuilder or install build/',
  );
}
app.use('/stageBuilder', requireAuth, express.static(EDITOR_ROOT));
app.use('/files', requireAuth, express.static(STAGEBUILDER_FILES_ROOT));
// Alias for older bookmarks — same files live under /stageBuilder/tutorial/
app.use('/tutorial', requireAuth, express.static(path.join(EDITOR_ROOT, 'tutorial')));
app.use('/docs', requireAuth, express.static(DOCS_ROOT));

app.get('/', requireAuth, (_req, res) => {
  res.redirect('/stageBuilder/index.html');
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '파일 크기가 제한을 초과했습니다.' });
    }
    return res.status(400).json({ error: `업로드 오류: ${error.message}` });
  }
  if (error && /지원하지 않는|허용되지 않는/.test(error.message || '')) {
    return res.status(400).json({ error: error.message });
  }
  console.error('서버 오류:', error);
  res.status(500).json({ error: error.message || '서버 내부 오류' });
});

app.listen(PORT, () => {
  console.log(`StageBuilder v4 server: http://localhost:${PORT}`);
  console.log(`Editor: http://localhost:${PORT}/stageBuilder/index.html`);
  console.log(`Tutorial: http://localhost:${PORT}/tutorial/`);
  console.log(`Files root: ${STAGEBUILDER_FILES_ROOT}`);
  if (DEV_SKIP_AUTH) console.log('DEV_SKIP_AUTH=1 — JWT bypass enabled');
});
