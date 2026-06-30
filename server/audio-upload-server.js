const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = 3001;

function getUniqueFileName(dirPath, originalName) {
  const parsed = path.parse(originalName);
  const safeBase = parsed.name;
  const ext = parsed.ext;

  let candidate = `${safeBase}${ext}`;
  let n = 2;
  while (fs.existsSync(path.join(dirPath, candidate))) {
    candidate = `${safeBase}${n}${ext}`;
    n += 1;
  }
  return candidate;
}

// CORS — 에디터 http://127.0.0.1:3000 ↔ API http://localhost:3001
const CORS_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3001',
]);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || CORS_ORIGINS.has(origin)) {
        callback(null, true);
        return;
      }
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
        callback(null, true);
        return;
      }
      callback(null, true);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
    optionsSuccessStatus: 204,
  }),
);

app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 정적 파일 제공
app.use('/files', express.static(path.join(__dirname, '../files')));

// 헬스체크 API
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    server: 'audio-upload-server',
    version: '1.0.0'
  });
});

// 루트 경로
app.get('/', (req, res) => {
  res.json({
    message: '음악 & FBX 업로드 서버가 실행 중입니다.',
    endpoints: {
      health: '/api/health',
      // 오디오 관련
      audio: {
        upload: '/api/upload-audio',
        files: '/api/audio-files'
      },
      // FBX 관련
      fbx: {
        upload: '/api/upload-fbx',
        files: '/api/fbx-files'
      },
      // 비디오 관련
      video: {
        upload: '/api/upload-video',
        files: '/api/video-files'
      }
    },
    timestamp: new Date().toISOString()
  });
});

// 음악 파일 업로드를 위한 multer 설정
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../files/music');

    // 폴더가 없으면 생성
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }

    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uploadPath = path.join(__dirname, '../files/music');
    const filename = getUniqueFileName(uploadPath, file.originalname);
    cb(null, filename);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB 제한
  },
  fileFilter: function (req, file, cb) {
    // 오디오 파일 형식 검사
    const allowedTypes = [
      'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg',
      'audio/mp4', 'audio/aac', 'audio/flac'
    ];

    if (allowedTypes.includes(file.mimetype) ||
      file.originalname.match(/\.(mp3|wav|ogg|m4a|aac|flac)$/i)) {
      cb(null, true);
    } else {
      cb(new Error('지원하지 않는 오디오 파일 형식입니다.'), false);
    }
  }
});

// 음악 파일 업로드 API
app.post('/api/upload-audio', upload.single('audioFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const fileInfo = {
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadTime: new Date().toISOString()
    };

    console.log('음악 파일 업로드 성공:', fileInfo);

    res.json({
      success: true,
      message: '파일 업로드가 완료되었습니다.',
      file: fileInfo
    });

  } catch (error) {
    console.error('파일 업로드 오류:', error);
    res.status(500).json({ error: '파일 업로드 중 오류가 발생했습니다.' });
  }
});

// 음악 파일 목록 조회 API
app.get('/api/audio-files', (req, res) => {
  try {
    const musicPath = path.join(__dirname, '../files/music');

    if (!fs.existsSync(musicPath)) {
      return res.json([]);
    }

    const files = fs.readdirSync(musicPath);
    const audioFiles = files
      .filter(file => {
        const ext = path.extname(file).toLowerCase();
        return ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'].includes(ext);
      })
      .map(file => {
        const name = path.parse(file).name;
        const ext = path.extname(file);
        const stats = fs.statSync(path.join(musicPath, file));

        return {
          name: name,
          displayName: name.replace(/[_-]/g, ' '), // 언더스코어와 하이픈을 공백으로 변환
          filename: file, // 실제 파일명 (확장자 포함)
          path: `/files/music/${file}`,
          size: stats.size,
          modifiedTime: stats.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.modifiedTime) - new Date(a.modifiedTime)); // 최신 파일 순으로 정렬

    res.json(audioFiles);

  } catch (error) {
    console.error('음악 파일 목록 조회 오류:', error);
    res.status(500).json({ error: '파일 목록 조회 중 오류가 발생했습니다.' });
  }
});

// 특정 음악 파일 삭제 API
app.delete('/api/audio-files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../files/music', filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    fs.unlinkSync(filePath);
    console.log('음악 파일 삭제 완료:', filename);

    res.json({
      success: true,
      message: '파일이 삭제되었습니다.'
    });

  } catch (error) {
    console.error('파일 삭제 오류:', error);
    res.status(500).json({ error: '파일 삭제 중 오류가 발생했습니다.' });
  }
});




// FBX 파일 업로드를 위한 multer 설정 추가
const fbxStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const fbxDir = path.join(__dirname, '../files/fbx');
    if (!fs.existsSync(fbxDir)) {
      fs.mkdirSync(fbxDir, { recursive: true });
      console.log('📁 FBX 폴더 생성됨:', fbxDir);
    }
    cb(null, fbxDir);
  },
  filename: function (req, file, cb) {
    const fbxDir = path.join(__dirname, '../files/fbx');
    const filename = getUniqueFileName(fbxDir, file.originalname);
    cb(null, filename);
  }
});

// FBX 파일 업로드용 multer
const fbxUpload = multer({
  storage: fbxStorage,
  limits: {
    fileSize: 100 * 1024 * 1024 // 100MB
  },
  fileFilter: (req, file, cb) => {
    // FBX 파일은 mimetype이 application/octet-stream이므로 확장자로 검사
    const allowedExtensions = ['.fbx'];
    const fileExtension = path.extname(file.originalname).toLowerCase();

    if (allowedExtensions.includes(fileExtension)) {
      cb(null, true);
    } else {
      cb(new Error('FBX 파일만 업로드 가능합니다.'));
    }
  }
});

// FBX 파일 업로드 엔드포인트 추가
app.post('/api/upload-fbx', fbxUpload.single('fbxFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '파일이 업로드되지 않았습니다.' });
    }

    const uploadedFile = req.file;
    console.log('FBX 파일 업로드:', uploadedFile.originalname);

    // 파일이 이미 fbxStorage에 의해 올바른 위치에 저장됨
    console.log('✅ FBX 파일 저장됨:', uploadedFile.path);

    res.json({
      message: 'FBX 파일 업로드 성공',
      filename: uploadedFile.originalname,
      path: `/files/fbx/${uploadedFile.originalname}`,
      size: uploadedFile.size,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ FBX 업로드 오류:', error);
    res.status(500).json({ error: 'FBX 파일 업로드 중 오류가 발생했습니다.' });
  }
});

// FBX 파일 목록 조회 엔드포인트
app.get('/api/fbx-files', (req, res) => {
  try {
    const fbxDir = path.join(__dirname, '../files/fbx');

    if (!fs.existsSync(fbxDir)) {
      console.log('FBX 폴더가 존재하지 않음, 빈 배열 반환');
      return res.json([]);
    }

    const files = fs.readdirSync(fbxDir)
      .filter(file => file.toLowerCase().endsWith('.fbx'))
      .map(file => {
        const filePath = path.join(fbxDir, file);
        const stats = fs.statSync(filePath);

        return {
          name: path.parse(file).name,
          filename: file,
          path: `/files/fbx/${file}`,
          size: stats.size,
          displayName: path.parse(file).name.replace(/_/g, ' '),
          uploadDate: stats.mtime,
          type: 'fbx'
        };
      });

    console.log(`FBX 파일 ${files.length}개 발견`);
    res.json(files);

  } catch (error) {
    console.error('❌ FBX 파일 목록 조회 오류:', error);
    res.status(500).json({ error: 'FBX 파일 목록 조회 중 오류가 발생했습니다.' });
  }
});

// FBX 파일 삭제 엔드포인트
app.delete('/api/fbx-files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const fbxPath = path.join(__dirname, '../files/fbx', filename);

    if (!fs.existsSync(fbxPath)) {
      console.log(`❌ FBX 파일을 찾을 수 없음: ${filename}`);
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    fs.unlinkSync(fbxPath);
    console.log('✅ FBX 파일 삭제됨:', filename);

    res.json({
      message: 'FBX 파일이 삭제되었습니다.',
      filename,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ FBX 파일 삭제 오류:', error);
    res.status(500).json({ error: 'FBX 파일 삭제 중 오류가 발생했습니다.' });
  }
});

// FBX 파일 다운로드 엔드포인트
app.get('/files/fbx/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const fbxPath = path.join(__dirname, '../files', 'fbx', filename);

    if (!fs.existsSync(fbxPath)) {
      return res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

    res.download(fbxPath, filename);

  } catch (error) {
    console.error('FBX 파일 다운로드 오류:', error);
    res.status(500).json({ error: 'FBX 파일 다운로드 중 오류가 발생했습니다.' });
  }
});

// 비디오 파일 업로드를 위한 multer 설정
const videoStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const videoDir = path.join(__dirname, '../files/video');
    if (!fs.existsSync(videoDir)) {
      fs.mkdirSync(videoDir, { recursive: true });
    }
    cb(null, videoDir);
  },
  filename: function (req, file, cb) {
    const videoDir = path.join(__dirname, '../files/video');
    const filename = getUniqueFileName(videoDir, file.originalname);
    cb(null, filename);
  }
});

const videoUpload = multer({
  storage: videoStorage,
  limits: {
    fileSize: 500 * 1024 * 1024 // 500MB
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('지원되지 않는 비디오 형식입니다.'));
    }
  }
});

// 비디오 파일 업로드
app.post('/api/upload-video', videoUpload.single('video'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '비디오 파일이 없습니다.' });
    }

    console.log('비디오 파일 업로드 완료:', req.file.filename);
    res.json({
      message: '비디오 파일이 성공적으로 업로드되었습니다.',
      filename: req.file.filename,
      size: req.file.size
    });

  } catch (error) {
    console.error('비디오 업로드 오류:', error);
    res.status(500).json({ error: '비디오 업로드 중 오류가 발생했습니다.' });
  }
});

// 비디오 파일 목록 가져오기
app.get('/api/video-files', (req, res) => {
  try {
    const videoDir = path.join(__dirname, '../files/video');

    if (!fs.existsSync(videoDir)) {
      return res.json([]);
    }

    const files = fs.readdirSync(videoDir);
    const videoFiles = files.map(filename => {
      const filePath = path.join(videoDir, filename);
      const stats = fs.statSync(filePath);
      return {
        filename: filename,
        size: stats.size,
        uploadDate: stats.mtime
      };
    });

    res.json(videoFiles);

  } catch (error) {
    console.error('비디오 파일 목록 가져오기 오류:', error);
    res.status(500).json({ error: '비디오 파일 목록을 가져오는 중 오류가 발생했습니다.' });
  }
});

// 비디오 파일 삭제
app.delete('/api/video-files/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '../files/video', filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log('비디오 파일 삭제 완료:', filename);
      res.json({ message: '비디오 파일이 성공적으로 삭제되었습니다.' });
    } else {
      res.status(404).json({ error: '파일을 찾을 수 없습니다.' });
    }

  } catch (error) {
    console.error('비디오 파일 삭제 오류:', error);
    res.status(500).json({ error: '비디오 파일 삭제 중 오류가 발생했습니다.' });
  }
});




// 서버 시작
app.listen(PORT, () => {
  console.log(`음악 업로드 서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`음악 파일 경로: ${path.join(__dirname, '../files/music')}`);
  console.log(`API 엔드포인트: http://localhost:${PORT}/api`);
});

// 에러 핸들링
app.use((error, req, res, next) => {
  console.error('서버 오류:', error);

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: '파일 크기가 제한을 초과했습니다.',
        details: `최대 파일 크기: ${(50 * 1024 * 1024 / (1024 * 1024)).toFixed(0)}MB`
      });
    }
  }

  res.status(500).json({
    error: '서버 내부 오류가 발생했습니다.',
    details: error.message,
    stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
  });
});

// 404 핸들링
app.use('*', (req, res) => {
  res.status(404).json({
    error: '요청한 엔드포인트를 찾을 수 없습니다.',
    path: req.originalUrl,
    method: req.method
  });
});

module.exports = app;

