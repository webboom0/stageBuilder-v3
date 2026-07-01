import { BaseTimeline } from "./BaseTimeline.js";
import { UIPanel, UIRow, UINumber, UIText, UIElement } from "../libs/ui.js";
import * as THREE from "three";
import { getApiUrl, AUDIO_UPLOAD_CONFIG } from "../config/audio-upload-config.js";
import { RemoveAudioTrackCommand } from "../commands/RemoveAudioTrackCommand.js";

// editor/timeline/AudioTimeline.js
// 사용 가능한 음악 파일 목록 (동적으로 로드됨)
let AUDIO_FILES = [];

// 음악 파일 목록을 동적으로 로드하는 함수
async function loadAudioFilesFromFolder() {
  const defaultList = () => [
    {
      path: "../files/music/SUJESHUN.mp3",
      name: "SUJESHUN",
      displayName: "수제순",
      filename: "SUJESHUN.mp3",
    },
    {
      path: "../files/music/DRAMA.mp3",
      name: "DRAMA",
      displayName: "드라마",
      filename: "DRAMA.mp3",
    },
  ];

  try {
    console.log("음악 폴더 스캔 시작...");

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 5000);
    const response = await fetch(
      getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.GET_FILES),
      { signal: ctrl.signal, credentials: "include" },
    ).finally(() => clearTimeout(t));

    if (response.ok) {
      const audioFiles = await response.json();
      if (!Array.isArray(audioFiles) || audioFiles.length === 0) {
        return defaultList();
      }

      const processedFiles = audioFiles.map((file) => ({
        path: `..${file.path}`,
        name: file.name,
        displayName: file.displayName,
        filename: file.filename,
      }));

      return processedFiles;
    }

    console.warn("서버에서 음악 파일 목록을 가져올 수 없습니다. 기본 목록 사용");
    return defaultList();
  } catch (error) {
    console.warn("음악 폴더 스캔 실패 → 기본 목록:", error);
    return defaultList();
  }
}

// 음악 asset 선택을 위한 UI 클래스
class UIAudioAssetSelector extends UIElement {
  constructor(audioFiles, onSelect) {
    const dom = document.createElement("div");
    super(dom);

    this.dom.className = "audio-asset-selector";
    this.audioFiles = audioFiles;
    this.onSelect = onSelect;

    this.createUI();
  }

  createUI() {
    // 헤더
    const header = document.createElement("div");
    header.className = "asset-selector-header";
    header.innerHTML = `
      <h3>음악 선택</h3>
      <button class="close-btn">&times;</button>
    `;
    this.dom.appendChild(header);

    // 불러오기 버튼 추가
    const loadButton = document.createElement("button");
    loadButton.textContent = "불러오기";
    loadButton.className = "load-music-btn";
    loadButton.addEventListener("click", () => {
      this.handleLoadMusic();
    });
    
    const loadRow = document.createElement("div");
    loadRow.className = "load-button-row";
    loadRow.appendChild(loadButton);
    this.dom.appendChild(loadRow);

    // 음악 목록 컨테이너
    const listContainer = document.createElement("div");
    listContainer.className = "audio-list-container";
    this.dom.appendChild(listContainer);

    // 음악 목록 생성 (안전성 검사 추가)
    if (!this.audioFiles || !Array.isArray(this.audioFiles)) {
      console.warn("음악 파일 목록이 유효하지 않습니다:", this.audioFiles);
      const noFilesMessage = document.createElement("div");
      noFilesMessage.className = "no-files-message";
      noFilesMessage.innerHTML = `
        <p>사용 가능한 음악 파일이 없습니다.</p>
        <p>files/music 폴더에 음악 파일을 추가해주세요.</p>
      `;
      listContainer.appendChild(noFilesMessage);
      return;
    }

    if (this.audioFiles.length === 0) {
      const noFilesMessage = document.createElement("div");
      noFilesMessage.className = "no-files-message";
      noFilesMessage.innerHTML = `
        <p>사용 가능한 음악 파일이 없습니다.</p>
        <p>files/music 폴더에 음악 파일을 추가해주세요.</p>
      `;
      listContainer.appendChild(noFilesMessage);
      return;
    }

    this.audioFiles.forEach((audioFile) => {
      const audioItem = document.createElement("div");
      audioItem.className = "audio-item";
      audioItem.innerHTML = `
        <div class="audio-info">
          <span class="audio-name">${audioFile.displayName}</span>
          <span class="audio-filename">${audioFile.filename || audioFile.name}</span>
        </div>
        <button class="add-audio-btn">추가</button>
      `;

      // 추가 버튼 클릭 이벤트
      const addBtn = audioItem.querySelector(".add-audio-btn");
      addBtn.addEventListener("click", () => {
        this.onSelect(audioFile);
        this.hide();
      });

      listContainer.appendChild(audioItem);
    });

    // 닫기 버튼 이벤트
    const closeBtn = header.querySelector(".close-btn");
    closeBtn.addEventListener("click", () => {
      this.hide();
    });

    // 스타일 추가
    // this.addStyles();
  }

  setupFileUpload() {
    const uploadBtn = this.dom.querySelector("#uploadBtn");
    const fileInput = this.dom.querySelector("#audioFileInput");

    // this 컨텍스트를 올바르게 바인딩
    uploadBtn.addEventListener("click", async (event) => {
      // 기본 동작 방지
      event.preventDefault();
      event.stopPropagation();
      
      // 서버 연결 상태 확인
      const isServerAvailable = await this.checkServerConnection();
      if (!isServerAvailable) {
        this.showUploadError("서버에 연결할 수 없습니다. 서버를 시작해주세요.");
        return;
      }
      
      fileInput.click();
    });

    fileInput.addEventListener("change", async (event) => {
      // 기본 동작 방지
      event.preventDefault();
      event.stopPropagation();
      
      const file = event.target.files[0];
      if (file) {
        await this.handleFileUpload(file);
      }
    });
  }

  async checkServerConnection() {
    try {
      const healthUrl = getApiUrl('/api/health');
      const response = await fetch(healthUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log("서버 연결 상태:", data.status);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn("서버 연결 확인 실패:", error);
      return false;
    }
  }

  async handleFileUpload(file) {
    try {
      // 파일 유효성 검사
      if (!this.validateAudioFile(file)) {
        return;
      }

      // 업로드 진행 상태 표시
      this.showUploadProgress(file.name);

      // 파일을 /files/music 폴더에 업로드
      const success = await this.uploadFileToServer(file);

      if (success) {
        // 성공 메시지 표시
        this.showUploadSuccess(file.name);
        
        // 파일 입력 초기화
        const fileInput = this.dom.querySelector("#audioFileInput");
        fileInput.value = "";
        
        // 사용자에게 새로고침 안내
        this.showRefreshMessage();
      } else {
        this.showUploadError("파일 업로드에 실패했습니다.");
      }

    } catch (error) {
      console.error("파일 업로드 오류:", error);
      this.showUploadError(`업로드 오류: ${error.message}`);
    }
  }

  validateAudioFile(file) {
    // 설정에서 파일 크기 제한 가져오기
    const maxSize = AUDIO_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE;
    if (file.size > maxSize) {
      this.showUploadError(`파일 크기가 ${(maxSize / (1024 * 1024)).toFixed(0)}MB를 초과합니다.`);
      return false;
    }

    // 설정에서 허용된 파일 형식 가져오기
    const allowedTypes = AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_TYPES;
    const allowedExtensions = AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_EXTENSIONS;
    
    if (!allowedTypes.includes(file.type) && !file.name.match(new RegExp(`\\.(${allowedExtensions.join('|')})$`, 'i'))) {
      this.showUploadError("지원하지 않는 오디오 파일 형식입니다.");
      return false;
    }

    return true;
  }

  showUploadProgress(fileName) {
    const uploadSection = this.dom.querySelector(".upload-section");
    const progressDiv = document.createElement("div");
    progressDiv.className = "upload-progress";
    
    // CSS 변수로 진행률 애니메이션 시간 설정
    const progressDuration = (AUDIO_UPLOAD_CONFIG.UI.PROGRESS_ANIMATION_DURATION / 1000) + 's';
    progressDiv.style.setProperty('--progress-duration', progressDuration);
    
    progressDiv.innerHTML = `
      <div class="progress-text">${fileName} 업로드 중...</div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;
    
    // 기존 진행 상태 제거
    const existingProgress = uploadSection.querySelector(".upload-progress");
    if (existingProgress) {
      existingProgress.remove();
    }
    
    uploadSection.appendChild(progressDiv);
  }

  showUploadSuccess(fileName) {
    const uploadSection = this.dom.querySelector(".upload-section");
    const successDiv = document.createElement("div");
    successDiv.className = "upload-success";
    successDiv.innerHTML = `
      <div class="success-text">✅ ${fileName} 업로드 완료!</div>
    `;
    
    // 기존 진행 상태 제거
    const existingProgress = uploadSection.querySelector(".upload-progress");
    if (existingProgress) {
      existingProgress.remove();
    }
    
    uploadSection.appendChild(successDiv);
    
    // 설정된 시간 후 성공 메시지 제거
    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.remove();
      }
    }, AUDIO_UPLOAD_CONFIG.UI.SUCCESS_MESSAGE_DURATION);
  }

  showUploadError(message) {
    const uploadSection = this.dom.querySelector(".upload-section");
    const errorDiv = document.createElement("div");
    errorDiv.className = "upload-error";
    errorDiv.innerHTML = `
      <div class="error-text">❌ ${message}</div>
    `;
    
    // 기존 진행 상태 제거
    const existingProgress = uploadSection.querySelector(".upload-progress");
    if (existingProgress) {
      existingProgress.remove();
    }
    
    uploadSection.appendChild(errorDiv);
    
    // 설정된 시간 후 오류 메시지 제거
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.remove();
      }
    }, AUDIO_UPLOAD_CONFIG.UI.ERROR_MESSAGE_DURATION);
  }

  async uploadFileToServer(file) {
    try {
      // FormData를 사용하여 파일 업로드
      const formData = new FormData();
      formData.append("audioFile", file);
      formData.append("uploadPath", "/files/music");

      // 설정된 서버 URL 사용
      const uploadUrl = getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.UPLOAD);
      
      console.log("업로드 URL:", uploadUrl);
      console.log("업로드할 파일:", file.name, file.size, file.type);

      // 서버에 업로드 요청
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: formData,
        // CORS 관련 설정 추가
        mode: 'cors',
        credentials: 'omit'
      });

      console.log("응답 상태:", response.status, response.statusText);

      if (response.ok) {
        const result = await response.json();
        console.log("파일 업로드 성공:", result);
        return true;
      } else {
        // 에러 응답 내용 확인
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorData = await response.json();
          if (errorData.error) {
            errorMessage = errorData.error;
            if (errorData.details) {
              errorMessage += ` - ${errorData.details}`;
            }
          }
        } catch (e) {
          console.warn("에러 응답 파싱 실패:", e);
        }
        
        console.error("파일 업로드 실패:", errorMessage);
        this.showUploadError(errorMessage);
        return false;
      }

    } catch (error) {
      console.error("업로드 요청 오류:", error);
      
      // 네트워크 오류인지 확인
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        this.showUploadError("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.");
      } else {
        this.showUploadError(`업로드 오류: ${error.message}`);
      }
      
      return false;
    }
  }

  async refreshAudioFiles() {
    try {
      console.log("🔄 음악 파일 목록 새로고침 시작...");
      
      // 설정된 서버 URL 사용
      const filesUrl = getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.GET_FILES);
      console.log("📡 요청 URL:", filesUrl);
      
      // 서버에서 최신 음악 파일 목록 가져오기
      const response = await fetch(filesUrl, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit'
      });
      
      console.log("📥 응답 상태:", response.status, response.statusText);
      
      if (response.ok) {
        const newAudioFiles = await response.json();
        console.log("🎵 새로 가져온 음악 파일 목록:", newAudioFiles);
        
        // 전역 AUDIO_FILES 업데이트
        if (typeof window !== "undefined" && window.AUDIO_FILES) {
          console.log("🌐 기존 전역 AUDIO_FILES:", window.AUDIO_FILES);
          window.AUDIO_FILES = newAudioFiles;
          console.log("✅ 전역 AUDIO_FILES 업데이트 완료");
        } else {
          console.warn("⚠️ window.AUDIO_FILES가 정의되지 않음");
        }
        
        // UI 새로고침
        this.refreshAudioList(newAudioFiles);
      } else {
        console.error("❌ 음악 파일 목록 조회 실패:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("❌ 음악 파일 목록 새로고침 실패:", error);
    }
  }

  refreshAudioList(newAudioFiles) {
    console.log("🎨 UI 음악 목록 새로고침 시작...");
    
    const listContainer = this.dom.querySelector(".audio-list-container");
    if (!listContainer) {
      console.error("❌ .audio-list-container를 찾을 수 없음");
      return;
    }

    console.log("📋 기존 목록 제거 중...");
    // 기존 목록 제거
    listContainer.innerHTML = "";

    // 새 목록 생성
    if (newAudioFiles && newAudioFiles.length > 0) {
      console.log(`✅ ${newAudioFiles.length}개의 음악 파일을 목록에 추가 중...`);
      
      newAudioFiles.forEach((audioFile, index) => {
        console.log(`🎵 음악 ${index + 1}:`, audioFile);
        
        const audioItem = document.createElement("div");
        audioItem.className = "audio-item";
        audioItem.innerHTML = `
          <div class="audio-info">
            <span class="audio-name">${audioFile.displayName}</span>
            <span class="audio-filename">${audioFile.name}.mp3</span>
          </div>
          <button class="add-audio-btn">추가</button>
        `;

        // 추가 버튼 클릭 이벤트
        const addBtn = audioItem.querySelector(".add-audio-btn");
        addBtn.addEventListener("click", () => {
          console.log("🎯 음악 선택됨:", audioFile);
          this.onSelect(audioFile);
          this.hide();
        });

        listContainer.appendChild(audioItem);
        console.log(`✅ 음악 항목 ${index + 1} 추가 완료`);
      });
      
      console.log("🎉 모든 음악 항목 추가 완료!");
    } else {
      console.log("⚠️ 표시할 음악 파일이 없음");
      const noFilesMessage = document.createElement("div");
      noFilesMessage.className = "no-files-message";
      noFilesMessage.innerHTML = `
        <p>사용 가능한 음악 파일이 없습니다.</p>
        <p>위의 '불러오기' 버튼을 사용하여 음악 파일을 추가해주세요.</p>
      `;
      listContainer.appendChild(noFilesMessage);
    }
  }


  show() {
    this.dom.style.display = "block";
  }

  hide() {
    this.dom.style.display = "none";
  }

  // 로컬 음악 파일 불러오기
  handleLoadMusic() {
    // 숨겨진 파일 input 생성
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "audio/*";
    fileInput.multiple = false;
    fileInput.style.display = "none";
    
    fileInput.addEventListener("change", (event) => {
      const file = event.target.files[0];
      if (file) {
        this.uploadMusicFile(file);
      }
    });
    
    document.body.appendChild(fileInput);
    fileInput.click();
    
    // 파일 선택 후 input 제거
    setTimeout(() => {
      if (fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    }, 1000);
  }

  // 음악 파일 업로드
  async uploadMusicFile(file) {
    try {
      // 파일 유효성 검사
      if (!this.validateAudioFile(file)) {
        return;
      }

      // 업로드 진행 표시
      this.showUploadProgress("업로드 중...");

      // FormData 생성
      const formData = new FormData();
      formData.append("audioFile", file);

      // 서버로 업로드
      const response = await fetch(getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.UPLOAD), {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log("음악 파일 업로드 성공:", result);

      // 성공 메시지 표시
      this.showUploadSuccess("업로드 완료!");

      // 음악 목록 새로고침
      setTimeout(() => {
        this.refreshMusicList();
      }, 1000);

    } catch (error) {
      console.error("음악 파일 업로드 실패:", error);
      this.showUploadError(`업로드 실패: ${error.message}`);
    }
  }

  // 오디오 파일 유효성 검사
  validateAudioFile(file) {
    // 파일 크기 검사
    if (file.size > AUDIO_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE) {
      this.showUploadError(`파일이 너무 큽니다. 최대 ${AUDIO_UPLOAD_CONFIG.UPLOAD.MAX_FILE_SIZE / (1024 * 1024)}MB까지 가능합니다.`);
      return false;
    }

    // 파일 타입 검사
    if (!AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_TYPES.includes(file.type)) {
      this.showUploadError("지원하지 않는 오디오 파일 형식입니다.");
      return false;
    }

    // 파일 확장자 검사
    const fileName = file.name.toLowerCase();
    if (!AUDIO_UPLOAD_CONFIG.UPLOAD.ALLOWED_EXTENSIONS.some(ext => fileName.endsWith(ext))) {
      this.showUploadError("지원하지 않는 파일 확장자입니다.");
      return false;
    }

    return true;
  }

  // 업로드 진행 표시
  showUploadProgress(message) {
    this.showMessage(message, "progress");
  }

  // 업로드 성공 표시
  showUploadSuccess(message) {
    this.showMessage(message, "success");
  }

  // 업로드 에러 표시
  showUploadError(message) {
    this.showMessage(message, "error");
  }

  // 메시지 표시
  showMessage(message, type) {
    // 기존 메시지 제거
    const existingMessage = this.dom.querySelector(".upload-message");
    if (existingMessage) {
      existingMessage.remove();
    }

    const messageDiv = document.createElement("div");
    messageDiv.className = `upload-message ${type}`;
    messageDiv.textContent = message;
    
    // 스타일 적용
    messageDiv.style.padding = "10px";
    messageDiv.style.margin = "10px 0";
    messageDiv.style.borderRadius = "4px";
    messageDiv.style.textAlign = "center";
    messageDiv.style.fontWeight = "bold";
    
    if (type === "progress") {
      messageDiv.style.backgroundColor = "#e3f2fd";
      messageDiv.style.color = "#1976d2";
      messageDiv.style.border = "1px solid #bbdefb";
    } else if (type === "success") {
      messageDiv.style.backgroundColor = "#e8f5e8";
      messageDiv.style.color = "#2e7d32";
      messageDiv.style.border = "1px solid #c8e6c9";
    } else if (type === "error") {
      messageDiv.style.backgroundColor = "#ffebee";
      messageDiv.style.color = "#c62828";
      messageDiv.style.border = "1px solid #ffcdd2";
    }

    this.dom.appendChild(messageDiv);
  }

  // 음악 목록 새로고침
  async refreshMusicList() {
    try {
      // 서버에서 최신 음악 파일 목록 가져오기
      const response = await fetch(getApiUrl(AUDIO_UPLOAD_CONFIG.ENDPOINTS.GET_FILES));
      if (response.ok) {
        const audioFiles = await response.json();
        
        // 전역 AUDIO_FILES 업데이트
        if (window.AUDIO_FILES) {
          window.AUDIO_FILES = audioFiles;
        }
        
        // 현재 인스턴스의 audioFiles도 업데이트
        this.audioFiles = audioFiles;
        
        // UI 새로고침
        this.refreshUI();
      }
    } catch (error) {
      console.error("음악 목록 새로고침 실패:", error);
    }
  }

  // UI 새로고침
  refreshUI() {
    // 기존 음악 목록 제거
    const listContainer = this.dom.querySelector(".audio-list-container");
    if (listContainer) {
      listContainer.innerHTML = "";
    }
    
    // 새로운 음악 목록 생성
    this.createMusicList();
  }

  // 음악 목록 생성 (기존 createUI에서 분리)
  createMusicList() {
    const listContainer = this.dom.querySelector(".audio-list-container");
    if (!listContainer) return;

    if (!this.audioFiles || !Array.isArray(this.audioFiles)) {
      console.warn("음악 파일 목록이 유효하지 않습니다:", this.audioFiles);
      const noFilesMessage = document.createElement("div");
      noFilesMessage.innerHTML = `
        <p>사용 가능한 음악 파일이 없습니다.</p>
        <p>files/music 폴더에 음악 파일을 추가해주세요.</p>
      `;
      noFilesMessage.className = "no-files-message";
      listContainer.appendChild(noFilesMessage);
      return;
    }

    if (this.audioFiles.length === 0) {
      const noFilesMessage = document.createElement("div");
      noFilesMessage.innerHTML = `
        <p>사용 가능한 음악 파일이 없습니다.</p>
        <p>files/music 폴더에 음악 파일을 추가해주세요.</p>
      `;
      noFilesMessage.className = "no-files-message";
      listContainer.appendChild(noFilesMessage);
      return;
    }

    this.audioFiles.forEach((audioFile) => {
      const audioItem = document.createElement("div");
      audioItem.className = "audio-item";
      audioItem.innerHTML = `
        <div class="audio-info">
          <span class="audio-name">${audioFile.displayName}</span>
          <span class="audio-filename">${audioFile.filename || audioFile.name}</span>
        </div>
        <button class="add-audio-btn">추가</button>
      `;

      // 추가 버튼 클릭 이벤트
      const addBtn = audioItem.querySelector(".add-audio-btn");
      addBtn.addEventListener("click", () => {
        this.onSelect(audioFile);
        this.hide();
      });

      listContainer.appendChild(audioItem);
    });
  }
}

// 볼륨 컨트롤을 위한 커스텀 UIElement 클래스
class UIVolumeControl extends UIElement {
  constructor() {
    const dom = document.createElement("div");
    super(dom);

    this.dom.className = "volume-control";

    const slider = document.createElement("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = "100";
    slider.value = "100";
    slider.className = "volume-slider";

    const value = document.createElement("span");
    value.className = "volume-value";
    value.textContent = "100%";

    this.dom.appendChild(slider);
    this.dom.appendChild(value);

    this.slider = slider;
    this.value = value;
  }

  setValue(value) {
    this.slider.value = value;
    this.value.textContent = `${value}%`;
  }

  getValue() {
    return parseInt(this.slider.value) / 100;
  }

  onChange(callback) {
    this.slider.addEventListener("input", (e) => {
      const value = e.target.value;
      this.value.textContent = `${value}%`;
      callback(parseInt(value) / 100);
    });
  }
}

export class AudioTimeline extends BaseTimeline {
  constructor(editor, options) {
    super(editor, options);
    this.selectedObject = null;
    this.selectedProperty = null;
    this.assetSelector = null;
    this._inHistoryPlayback = false;
    this.propertyPanel = this.createPropertyPanel();
    this.container.appendChild(this.propertyPanel.dom);

    // 타임라인 맞춤 관련 초기화
    this.isTimelineFit = false;
    this.originalClipData = null;
    this._restorePromises = [];

    // 음악 파일 목록을 동적으로 로드하고 asset 선택기 초기화
    this.initAudioTimeline();
    
    // 초기 상태에서 타임라인 맞춤 버튼 비활성화
    setTimeout(() => {
      if (this.timelineFitButton) {
        this.updateTimelineFitButtonState();
      }
    }, 100);
  }

  // 타임라인 총 길이 안전 조회 (메인 타임라인 설정 우선)
  getTotalSeconds() {
    const fallback = 300;

    const timelineVal = Number(this?.editor?.timeline?.timelineSettings?.totalSeconds);
    if (Number.isFinite(timelineVal) && timelineVal > 0) {
      return timelineVal;
    }

    const sceneVal = Number(this?.editor?.scene?.userData?.timeline?.totalSeconds);
    if (Number.isFinite(sceneVal) && sceneVal > 0) {
      return sceneVal;
    }

    const optVal = Number(this?.options?.totalSeconds);
    if (Number.isFinite(optVal) && optVal > 0) {
      return optVal;
    }

    const defaultVal = Number(this?.editor?.timeline?.defaultSettings?.totalSeconds);
    if (Number.isFinite(defaultVal) && defaultVal > 0) {
      return defaultVal;
    }

    return fallback;
  }

  getAudioTracksContainer() {
    return document.querySelector('[data-timeline="audio"] .timeline-container')
      || this.container?.querySelector?.('.timeline-container')
      || this.container;
  }

  // 타임라인 길이가 준비되면(left/width) 재계산을 트리거
  scheduleRecalcForTimelineReady() {
    const tryRecalc = (attempt = 0) => {
      const sceneVal = Number(this?.editor?.scene?.userData?.timeline?.totalSeconds);
      const optVal = Number(this?.options?.totalSeconds);
      const isReady = (Number.isFinite(sceneVal) && sceneVal > 0) || (Number.isFinite(optVal) && optVal > 0);

      if (isReady) {
        this.updateUI();
        return;
      }

      if (attempt < 5) {
        setTimeout(() => tryRecalc(attempt + 1), 50 * (attempt + 1));
      } else {
        this.updateUI();
      }
    };

    tryRecalc(0);
  }

  // AudioTimeline 초기화
  async initAudioTimeline() {
    try {
      // 음악 파일 목록 동적 로드
      const loadedFiles = await loadAudioFilesFromFolder();
      AUDIO_FILES = loadedFiles || [];
      console.log("동적으로 로드된 음악 파일:", AUDIO_FILES);

      // asset 선택기 초기화
      this.initAssetSelector();

    } catch (error) {
      console.error("AudioTimeline 초기화 실패:", error);
      // 기본 파일 목록으로 초기화
      AUDIO_FILES = [
        {
          path: "../files/music/SUJESHUN.mp3",
          name: "SUJESHUN",
          displayName: "수제순"
        },
        {
          path: "../files/music/DRAMA.mp3",
          name: "DRAMA",
          displayName: "드라마"
        }
      ];
      this.initAssetSelector();
    }
  }

  // asset 선택기 초기화
  initAssetSelector() {
    this.assetSelector = new UIAudioAssetSelector(AUDIO_FILES, (selectedAudio) => {
      this.addAudioFromAsset(selectedAudio);
    });

    // DOM에 추가하되 숨김 상태로
    this.assetSelector.dom.style.display = "none";
    document.body.appendChild(this.assetSelector.dom);
  }

  // asset에서 오디오 추가
  addAudioFromAsset(audioFile) {
    console.log("선택된 오디오 asset:", audioFile);

    // 이미 같은 오디오가 있는지 확인
    const existingTrack = Array.from(this.tracks.values()).find(
      track => track.name === audioFile.name
    );

    if (existingTrack) {
      console.warn("이미 같은 오디오가 추가되어 있습니다:", audioFile.name);
      
      // 🔧 기존 트랙도 선택 상태로 만들기
      this.selectTrack(existingTrack.objectId || existingTrack.id);
      
      return Promise.resolve(existingTrack);
    }

    // 오디오 로드 및 트랙 생성 (Promise 반환)
    return this.loadAudioFile(audioFile).then((track) => {
      // 🔧 새로 생성된 트랙을 자동으로 선택
      if (track) {
        console.log("🎯 새로 생성된 트랙 자동 선택:", track);
        this.selectTrack(track.objectId || track.id);
        
        // 🔧 선택된 클립의 속성 패널 업데이트를 위한 input 필드 동기화
        setTimeout(() => {
          if (track.element) {
            const audioSprite = track.element.querySelector('.audio-sprite');
            if (audioSprite) {
              // 선택 상태로 만들기
              document.querySelectorAll('.audio-sprite').forEach(s => s.classList.remove('selected'));
              audioSprite.classList.add('selected');
              
              // input 필드 업데이트
              const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId || track.id));
              if (audioObject) {
                const startTime = parseFloat(audioSprite.dataset.startTime) || 0;
                const duration = parseFloat(audioSprite.dataset.duration) || 0;
                const audioStartTime = audioObject.userData.audioStartTime || 0;
                const audioEndTime = audioObject.userData.audioEndTime || (audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : audioStartTime + duration);
                
                this.updateInputFields(audioStartTime, audioEndTime);
                this.updateClipInputFields(startTime, duration);
              }
            }
          }
        }, 100); // DOM 업데이트 후 실행
      }
      
      return track;
    });
  }

  // 저장된 오디오 데이터 로드 (프로젝트 열기 시 사용)
  loadAudioData(savedAudioData) {
    console.log("저장된 오디오 데이터 로드 시작:", savedAudioData);

    if (!savedAudioData || !Array.isArray(savedAudioData)) {
      console.warn("저장된 오디오 데이터가 없거나 유효하지 않습니다:", savedAudioData);
      return;
    }

    // 기존 트랙들 정리
    this.clearAllTracks();

    // 저장된 오디오 데이터로 트랙 복원
    savedAudioData.forEach((audioData, index) => {
      console.log(`오디오 데이터 ${index} 복원 중:`, audioData);

      if (audioData.audioFile && audioData.audioFile.path) {
        // 저장된 트랙 데이터를 originalTrackData로 전달
        const audioFile = {
          path: audioData.audioFile.path,
          name: audioData.audioFile.name,
          displayName: audioData.audioFile.displayName || audioData.audioFile.name,
          originalTrackData: {
            startTime: audioData.startTime !== undefined ? audioData.startTime : 0,
            duration: audioData.duration !== undefined ? audioData.duration : 100,
            volume: audioData.volume !== undefined ? audioData.volume : 1.0,
            mute: audioData.mute !== undefined ? audioData.mute : false,
            playbackRate: audioData.playbackRate !== undefined ? audioData.playbackRate : 1.0,
            audioStartTime: audioData.audioStartTime !== undefined ? audioData.audioStartTime : 0,
            audioEndTime: audioData.audioEndTime !== undefined ? audioData.audioEndTime : (audioData.duration || 100)
          }
        };

        console.log(`복원할 audioFile 구성:`, audioFile);

        // loadAudioFile로 트랙 복원
        this.loadAudioFile(audioFile).then((track) => {
          console.log(`✅ 오디오 트랙 복원 완료:`, track);

          // 저장된 속성들을 UI에 복원
          if (track && track.element) {
            this.restoreTrackProperties(track, audioData);
          }
        }).catch((error) => {
          console.error(`❌ 오디오 트랙 복원 실패: ${audioFile.name}`, error);
        });
      }
    });
  }

  // 트랙 속성 복원
  restoreTrackProperties(track, audioData) {
    const audioSprite = track.element.querySelector('.audio-sprite');
    if (!audioSprite) {
      console.warn('오디오 스프라이트를 찾을 수 없습니다:', track);
      return;
    }

    console.log(`🔍 오디오 스프라이트 속성 복원 시작:`, audioData);

    const safeTotalSeconds = this.getTotalSeconds();

    // 위치/크기 복원
    if (audioData.startTime !== undefined) {
      const left = (audioData.startTime / safeTotalSeconds) * 100;
      audioSprite.style.left = `${left}%`;
      audioSprite.dataset.startTime = audioData.startTime.toString();
      console.log(`📍 startTime 복원: ${audioData.startTime} -> left: ${left}%`);
    }

    if (audioData.duration !== undefined) {
      const width = (audioData.duration / safeTotalSeconds) * 100;
      audioSprite.style.width = `${width}%`;
      audioSprite.dataset.duration = audioData.duration.toString();
      console.log(`📏 duration 복원: ${audioData.duration} -> width: ${width}%`);
    }

    // 볼륨 등 기타 속성 복원
    if (audioData.volume !== undefined) {
      audioSprite.dataset.volume = audioData.volume.toString();
      console.log(`🔊 volume 복원: ${audioData.volume}`);
    }

    if (audioData.mute !== undefined) {
      audioSprite.dataset.mute = audioData.mute.toString();
      console.log(`🔇 mute 복원: ${audioData.mute}`);
    }

    if (audioData.playbackRate !== undefined) {
      audioSprite.dataset.playbackRate = audioData.playbackRate.toString();
      console.log(`⏩ playbackRate 복원: ${audioData.playbackRate}`);
    }

    if (audioData.audioStartTime !== undefined) {
      audioSprite.dataset.audioStartTime = audioData.audioStartTime.toString();
      console.log(`🎵 audioStartTime 복원: ${audioData.audioStartTime}`);
    }

    if (audioData.audioEndTime !== undefined) {
      audioSprite.dataset.audioEndTime = audioData.audioEndTime.toString();
      console.log(`🎵 audioEndTime 복원: ${audioData.audioEndTime}`);
    }

    // 오디오 객체의 userData도 복원
    const object = this.editor.scene.getObjectById(parseInt(track.objectId || track.id));
    if (object && object.userData) {
      if (audioData.startTime !== undefined) {
        object.userData.startTime = audioData.startTime;
      }
      if (audioData.duration !== undefined) {
        object.userData.duration = audioData.duration;
      }
      if (audioData.volume !== undefined) {
        object.userData.volume = audioData.volume;
      }
      if (audioData.mute !== undefined) {
        object.userData.mute = audioData.mute;
      }
      if (audioData.playbackRate !== undefined) {
        object.userData.playbackRate = audioData.playbackRate;
      }
      if (audioData.audioStartTime !== undefined) {
        object.userData.audioStartTime = audioData.audioStartTime;
      }
      if (audioData.audioEndTime !== undefined) {
        object.userData.audioEndTime = audioData.audioEndTime;
      }
    }
  }

  // 모든 트랙 정리
  clearAllTracks() {
    console.log("기존 오디오 트랙들 정리 중...");

    this.tracks.forEach((track) => {
      if (track?.element?.parentNode) {
        track.element.parentNode.removeChild(track.element);
      }
    });
    this.tracks.clear();

    const host = this.getAudioTracksContainer();
    host?.querySelectorAll('.timeline-track').forEach((el) => {
      if (el.querySelector('.audio-sprite')) el.remove();
    });

    console.log("기존 오디오 트랙들 정리 완료");
  }

  clearSceneAudioObjects() {
    const toRemove = [];
    this.editor.scene.traverse((child) => {
      if (child.userData?.type === 'audio' || child.userData?.audioElement) {
        toRemove.push(child);
      }
    });
    toRemove.forEach((obj) => {
      const audioEl = obj.userData?.audioElement;
      if (audioEl && !audioEl.paused) {
        audioEl.pause();
      }
      if (obj.userData?.audioUrl) {
        try { URL.revokeObjectURL(obj.userData.audioUrl); } catch (e) { /* ignore */ }
      }
      this.editor.scene.remove(obj);
    });
    if (toRemove.length > 0) {
      console.log(`씬 오디오 객체 ${toRemove.length}개 정리`);
    }
  }

  resolveTrackMapKey(objectId) {
    if (objectId === undefined || objectId === null || objectId === '') return null;
    const idStr = String(objectId);
    if (this.tracks.has(idStr)) return idStr;

    const idNum = parseInt(idStr, 10);
    for (const [key, track] of this.tracks.entries()) {
      if (String(track.objectId) === idStr) return key;
      if (!Number.isNaN(idNum) && parseInt(key, 10) === idNum) return key;
      const elId = track.element?.dataset?.objectId;
      if (elId && String(elId) === idStr) return key;
    }
    return idStr;
  }

  getTrackByAnyId(objectId) {
    const key = this.resolveTrackMapKey(objectId);
    return key ? this.tracks.get(key) : null;
  }

  // 오디오 파일 로드
  loadAudioFile(audioFile) {
    if (audioFile?.path) {
      const existing = this.findTrackByAudioPath(audioFile.path);
      if (existing?.element?.isConnected) {
        console.log('이미 로드된 오디오 — 기존 트랙 재사용:', audioFile.path);
        return Promise.resolve(existing);
      }
    }

    const resolvedPath = this.resolveAudioPlaybackUrl(audioFile.path);
    console.log("오디오 파일 로드 시작:", audioFile.path, "->", resolvedPath);

    return new Promise((resolve, reject) => {
      fetch(resolvedPath)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status} - 파일을 찾을 수 없습니다: ${audioFile.path}`);
          }
          console.log(`음악 파일 로드 성공: ${audioFile.name}`);
          return response.blob();
        })
        .then((blob) => {
          // Blob URL 생성
          const audioUrl = URL.createObjectURL(blob);
          const audioElement = new Audio();
          audioElement.src = audioUrl;
          audioElement.preload = "auto";

          audioElement.addEventListener("loadedmetadata", () => {
            if (!this.isRestoreGenerationCurrent(audioFile._restoreGeneration)) {
              URL.revokeObjectURL(audioUrl);
              resolve(null);
              return;
            }

            console.log("오디오 메타데이터 로드됨:", audioElement.duration);

            // 오디오 트랙 생성
            const MIN_DURATION = 5;
            const MAX_DURATION = 180; // 3분
            const effectiveDuration = Math.min(
              MAX_DURATION,
              Math.max(MIN_DURATION, audioElement.duration)
            );

            const audioObject = new THREE.Object3D();
            audioObject.name = audioFile.name;

            // userData에 오디오 엘리먼트 저장
            const originalData = audioFile.originalTrackData || {};
            audioObject.userData = {
              audioElement: audioElement,
              volume: originalData.volume !== undefined ? originalData.volume : 1.0,
              mute: originalData.mute !== undefined ? originalData.mute : false,
              playbackRate: originalData.playbackRate !== undefined ? originalData.playbackRate : 1.0,
              type: "audio",
              audioUrl: audioUrl,
              audioFile: audioFile, // 원본 파일 정보 저장
              audioPath: audioFile.path, // 경로 정보 추가
              audioName: audioFile.name, // 이름 정보 추가
              audioStartTime: originalData.audioStartTime || 0, // 오디오 시작 시간 (편집용)
              audioEndTime: originalData.audioEndTime || audioElement.duration, // 오디오 끝 시간 (편집용)
              startTime: originalData.startTime || 0, // 클립 시작 시간 (타임라인상 위치)
              duration: originalData.duration || effectiveDuration, // 클립 지속 시간 (타임라인상 길이)
            };

            // Scene에 오디오 객체 추가
            this.editor.scene.add(audioObject);
            this.editor.signals.sceneGraphChanged.dispatch();
            console.log("오디오 객체 생성됨:", audioObject);

            // addTrack 호출 시 필요한 모든 정보를 전달
            // originalTrackData가 있으면 그것을 우선 사용, 없으면 기본값 사용
            const originalTrackData = audioFile.originalTrackData || {};
            const trackData = {
              name: audioFile.displayName || audioFile.name,
              type: "audio",
              duration: originalTrackData.duration || effectiveDuration,
              startTime: originalTrackData.startTime || 0,
              volume: originalTrackData.volume !== undefined ? originalTrackData.volume : 1.0,
              mute: originalTrackData.mute !== undefined ? originalTrackData.mute : false,
              playbackRate: originalTrackData.playbackRate !== undefined ? originalTrackData.playbackRate : 1.0,
              audioStartTime: originalTrackData.audioStartTime || 0,
              audioEndTime: originalTrackData.audioEndTime || audioElement.duration,
              element: this.createTrackElement(effectiveDuration, audioFile.displayName || audioFile.name, audioFile.path),
              audioElement: audioElement,
            };

            console.log(`🎵 trackData 구성 완료:`, trackData);

            // 트랙 생성
            const track = this.addTrack(audioObject.id, trackData);
            console.log("오디오 트랙 생성됨:", track);

            // 오디오 로드 완료 테스트
            audioElement.addEventListener("canplaythrough", () => {
              console.log("오디오 재생 준비 완료:", audioFile.name);
            });

            // Scene의 userData.audioTimeline에 오디오 정보 저장
            if (!this.editor.scene.userData.audioTimeline) {
              this.editor.scene.userData.audioTimeline = { audioObjects: {} };
            }
            if (!this.editor.scene.userData.audioTimeline.audioObjects) {
              this.editor.scene.userData.audioTimeline.audioObjects = {};
            }
            this.editor.scene.userData.audioTimeline.audioObjects[audioObject.id] = {
              audioElement: audioElement,
              objectId: audioObject.id, // objectId 추가
              volume: originalTrackData.volume !== undefined ? originalTrackData.volume : 1.0,
              mute: originalTrackData.mute !== undefined ? originalTrackData.mute : false,
              playbackRate: originalTrackData.playbackRate !== undefined ? originalTrackData.playbackRate : 1.0,
              audioFile: audioFile,
              audioStartTime: originalTrackData.audioStartTime || 0,
              audioEndTime: originalTrackData.audioEndTime || audioElement.duration,
              startTime: originalTrackData.startTime || 0,
              duration: originalTrackData.duration || effectiveDuration,
            };

            // input 필드 초기화
            this.updateInputFields(0, audioElement.duration);

            // Promise resolve로 트랙 반환
            resolve(track);
          });

          audioElement.addEventListener("error", (e) => {
            console.error("오디오 로드 에러:", e);
            reject(new Error(`오디오 로드 에러: ${e.message}`));
          });
        })
        .catch((error) => {
          console.error("오디오 파일 로드 실패:", error);

          // 사용자에게 알림
          if (error.message.includes('404')) {
            alert(`음악 파일을 찾을 수 없습니다: ${audioFile.name}\n\n파일이 files/music 폴더에 있는지 확인해주세요.`);
          } else {
            alert(`오디오 파일 로드 중 오류가 발생했습니다: ${audioFile.name}\n\n${error.message}`);
          }

          reject(error);
        });
    });
  }

  // 타임라인 설정 업데이트
  updateSettings(newSettings) {
    console.log('🔧 AudioTimeline 설정 업데이트 시작:', newSettings);

    // 기존 설정 백업
    const oldSettings = { ...this.options };
    const oldTotalSeconds = oldSettings.totalSeconds;

    // 기존 설정 업데이트
    this.options = { ...this.options, ...newSettings };

    // TimelineData의 frameRate 업데이트
    if (newSettings.framesPerSecond && this.timelineData) {
      this.timelineData.frameRate = newSettings.framesPerSecond;
      console.log(`🔧 frameRate 업데이트: ${newSettings.framesPerSecond}fps`);
    }

    // Scene의 timeline 설정 업데이트
    if (this.editor.scene) {
      if (!this.editor.scene.userData.timeline) {
        this.editor.scene.userData.timeline = {};
      }
      Object.assign(this.editor.scene.userData.timeline, newSettings);
      console.log(`🔧 Scene userData 업데이트 완료`);
    }

    // 🔧 클립 너비 및 위치 업데이트 (시간 변경 시)
    if (newSettings.totalSeconds && oldTotalSeconds !== newSettings.totalSeconds) {
      console.log(`🔧 총 시간 변경 감지: ${oldTotalSeconds}초 → ${newSettings.totalSeconds}초`);
      
      // 🔧 현재 실제 타임라인 길이 가져오기 (백업)
      const currentTotalSeconds = this.getTotalSeconds();
      const effectiveOldTotalSeconds = oldTotalSeconds || currentTotalSeconds;
      
      console.log(`🔧 효과적인 이전 총 시간: ${effectiveOldTotalSeconds}초`);
      
      // 🔧 즉시 클립 업데이트 실행 (모션타임라인과 동일한 방식)
      console.log(`🔧 즉시 클립 업데이트 실행`);
      
      // 🔧 원본 값 설정 (중요!)
      this.prepareOriginalValues(effectiveOldTotalSeconds);
      
      this.updateClipWidths(effectiveOldTotalSeconds, newSettings.totalSeconds);
      
      // 🔧 약간의 지연 후 한 번 더 업데이트 (안전장치) - 중복 방지
      setTimeout(() => {
        console.log(`🔧 안전장치: 클립 업데이트 재실행 (100ms)`);
        // 🔧 이미 업데이트된 경우 중복 실행 방지
        if (this.lastUpdateTime !== newSettings.totalSeconds) {
          this.updateClipWidths(effectiveOldTotalSeconds, newSettings.totalSeconds);
          this.lastUpdateTime = newSettings.totalSeconds;
        } else {
          console.log(`🔧 이미 업데이트됨, 중복 실행 방지`);
        }
      }, 100);
      
      // 🔧 추가 검증 및 강제 업데이트 (500ms 후)
      setTimeout(() => {
        console.log(`🔧 추가 검증: 클립 상태 확인 및 강제 업데이트 (500ms)`);
        
        // 🔧 현재 스프라이트 상태 확인
        const audioSprites = this.container.querySelectorAll('.audio-sprite');
        audioSprites.forEach((sprite, index) => {
          const currentWidth = parseFloat(sprite.style.width);
          const currentLeft = parseFloat(sprite.style.left);
          const expectedWidth = (parseFloat(sprite.dataset.duration) / newSettings.totalSeconds) * 100;
          const expectedLeft = (parseFloat(sprite.dataset.startTime) / newSettings.totalSeconds) * 100;
          
          console.log(`🔧 스프라이트 ${index + 1} 상태 검증:`, {
            currentWidth: `${currentWidth}%`,
            expectedWidth: `${expectedWidth}%`,
            currentLeft: `${currentLeft}%`,
            expectedLeft: `${expectedLeft}%`
          });
          
          // 🔧 만약 불일치하면 강제 업데이트 (모든 방법 시도)
          if (Math.abs(currentWidth - expectedWidth) > 0.1 || Math.abs(currentLeft - expectedLeft) > 0.1) {
            console.warn(`⚠️ 스프라이트 ${index + 1} 불일치 감지, 강제 업데이트`);
            
            // 🔧 방법 1: 일반 스타일 설정
            sprite.style.width = `${expectedWidth}%`;
            sprite.style.left = `${expectedLeft}%`;
            
            // 🔧 방법 2: setProperty로 강제 적용
            sprite.style.setProperty('width', `${expectedWidth}%`, 'important');
            sprite.style.setProperty('left', `${expectedLeft}%`, 'important');
            
            // 🔧 방법 3: CSS 텍스트로 설정
            sprite.style.cssText = `left: ${expectedLeft}% !important; width: ${expectedWidth}% !important;`;
            
            // 🔧 강제 DOM 업데이트
            sprite.offsetHeight;
            
            console.log(`🔧 스프라이트 ${index + 1} 강제 업데이트 완료`);
          }
          
          // 🔧 시간 표시도 함께 업데이트 (원본 값 사용)
          const startTime = parseFloat(sprite.dataset.originalStartTime || sprite.dataset.startTime);
          const duration = parseFloat(sprite.dataset.originalDuration || sprite.dataset.duration);
          this.updateAudioClipTimeDisplay(sprite, startTime, duration, newSettings.totalSeconds);
        });
      }, 500);
    }

    // 🔧 즉시 UI 업데이트
    this.updateUI();

    // 🔧 설정 변경 후 추가 검증
    setTimeout(() => {
      const currentTotalSeconds = this.getTotalSeconds();
      console.log(`🔧 설정 업데이트 후 검증: getTotalSeconds() = ${currentTotalSeconds}초`);
      
      if (currentTotalSeconds !== newSettings.totalSeconds) {
        console.warn(`⚠️ 설정 불일치: 요청된 ${newSettings.totalSeconds}초 vs 실제 ${currentTotalSeconds}초`);
      }
    }, 100);

    console.log('✅ AudioTimeline 설정이 성공적으로 업데이트되었습니다.');
  }

  // 원본 값 준비 (타임라인 변경 전에 호출)
  prepareOriginalValues(oldTotalSeconds) {
    try {
      console.log(`🔧 원본 값 준비 시작: ${oldTotalSeconds}초 기준`);
      
      const audioSprites = this.container.querySelectorAll('.audio-sprite');
      audioSprites.forEach((sprite, index) => {
        // 🔧 현재 스타일에서 원본 값 계산
        const currentLeft = parseFloat(sprite.style.left) || 0;
        const currentWidth = parseFloat(sprite.style.width) || 20;
        
        // 🔧 절대 시간으로 변환
        const originalStartTime = (currentLeft / 100) * oldTotalSeconds;
        const originalDuration = (currentWidth / 100) * oldTotalSeconds;
        
        // 🔧 dataset에 원본 값 저장
        sprite.dataset.originalStartTime = originalStartTime.toString();
        sprite.dataset.originalDuration = originalDuration.toString();
        
        console.log(`🔧 스프라이트 ${index + 1} 원본 값 설정:`, {
          currentLeft: `${currentLeft}%`,
          currentWidth: `${currentWidth}%`,
          originalStartTime: `${originalStartTime}초`,
          originalDuration: `${originalDuration}초`
        });
      });
      
      console.log(`🔧 원본 값 준비 완료`);
      
    } catch (error) {
      console.error('❌ prepareOriginalValues 오류:', error);
    }
  }

  // 오디오 클립 시간 표시 업데이트
  updateAudioClipTimeDisplay(sprite, startTime, duration, totalSeconds) {
    try {
      // 🔧 트랙 요소 찾기
      const trackElement = sprite.closest('.timeline-track');
      if (!trackElement) {
        console.warn('⚠️ 트랙 요소를 찾을 수 없음');
        return;
      }

      // 🔧 시간 입력 필드들 찾기
      const startTimeInput = trackElement.querySelector('input[data-property="startTime"]');
      const endTimeInput = trackElement.querySelector('input[data-property="endTime"]');
      const clipStartInput = trackElement.querySelector('input[data-property="clipStart"]');
      const clipLengthInput = trackElement.querySelector('input[data-property="clipLength"]');

      // 🔧 새로운 시간 값 계산
      const newStartTime = startTime;
      const newEndTime = startTime + duration;
      const newClipStart = startTime;
      const newClipLength = duration;

      // 🔧 시간 형식 변환 (초 → MM:SS.ss 형식)
      const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = (seconds % 60).toFixed(2);
        return `${mins.toString().padStart(2, '0')}:${secs.padStart(5, '0')}`;
      };

      // 🔧 입력 필드 업데이트
      if (startTimeInput) {
        startTimeInput.value = formatTime(newStartTime);
        startTimeInput.dataset.value = newStartTime.toString();
      }
      
      if (endTimeInput) {
        endTimeInput.value = formatTime(newEndTime);
        endTimeInput.dataset.value = newEndTime.toString();
      }
      
      if (clipStartInput) {
        clipStartInput.value = formatTime(newClipStart);
        clipStartInput.dataset.value = newClipStart.toString();
      }
      
      if (clipLengthInput) {
        clipLengthInput.value = formatTime(newClipLength);
        clipLengthInput.dataset.value = newClipLength.toString();
      }

      console.log(`🔧 오디오 클립 시간 표시 업데이트 완료:`, {
        startTime: formatTime(newStartTime),
        endTime: formatTime(newEndTime),
        clipStart: formatTime(newClipStart),
        clipLength: formatTime(newClipLength),
        totalSeconds: totalSeconds
      });

    } catch (error) {
      console.error('❌ updateAudioClipTimeDisplay 오류:', error);
    }
  }

  // 클립 너비 업데이트 (모션타임라인 방식으로 단순화)
  updateClipWidths(oldTotalSeconds, newTotalSeconds) {
    console.log('🔧 AudioTimeline 클립 너비 업데이트 시작:', { oldTotalSeconds, newTotalSeconds });

    // 🔧 유효성 검사 및 백업 값 설정
    if (!oldTotalSeconds || oldTotalSeconds <= 0) {
      console.warn('⚠️ oldTotalSeconds가 유효하지 않음, 현재 타임라인 길이로 대체');
      oldTotalSeconds = this.getTotalSeconds();
    }
    
    if (!newTotalSeconds || newTotalSeconds <= 0) {
      console.error('❌ newTotalSeconds가 유효하지 않음:', newTotalSeconds);
      return;
    }

    console.log(`🔧 최종 사용할 시간 값: oldTotalSeconds=${oldTotalSeconds}초, newTotalSeconds=${newTotalSeconds}초`);

    // 🔧 오디오 스프라이트만 처리 (오디오 클립만 업데이트)
    const audioSprites = this.getAudioTracksContainer()?.querySelectorAll('.audio-sprite') || [];

    console.log(`🔧 총 ${audioSprites.length}개의 오디오 스프라이트 업데이트`);

    if (audioSprites.length === 0) {
      console.log('🔧 업데이트할 오디오 스프라이트가 없습니다.');
      return;
    }

    audioSprites.forEach((sprite, index) => {
      // 🔧 모션타임라인과 동일한 방식으로 단순하게 처리
      const spriteType = '오디오'; // 오디오 스프라이트만 처리하므로 고정
      const duration = parseFloat(sprite.dataset.duration) || 5;
      
      // 🔧 현재 위치 정보 가져오기 (디버깅용)
      const currentLeft = parseFloat(sprite.style.left) || 0;
      const currentWidth = parseFloat(sprite.style.width) || 20;
      
      // 🔧 원본 시작 시간을 dataset에서 직접 가져오기 (중요!)
      let originalStartTime = parseFloat(sprite.dataset.originalStartTime);
      if (!originalStartTime || isNaN(originalStartTime)) {
        // 원본 값이 없으면 현재 스타일에서 계산
        originalStartTime = (currentLeft / 100) * oldTotalSeconds;
        console.log(`🔧 원본 시작 시간을 스타일에서 계산: ${originalStartTime}초`);
      } else {
        console.log(`🔧 원본 시작 시간을 dataset에서 가져옴: ${originalStartTime}초`);
      }
      
      // 🔧 클립의 절대 시작 시간 계산 (원본 값 사용)
      const clipStartTime = originalStartTime;

      // 🔧 기존 너비 계산
      const oldWidth = (duration / oldTotalSeconds) * 100;
      // 🔧 새로운 너비 계산
      const newWidth = (duration / newTotalSeconds) * 100;

      console.log(`🔧 오디오 스프라이트 ${index + 1} 클립 너비 업데이트:`, {
        duration,
        clipStartTime,
        currentLeft: `${currentLeft}%`,
        currentWidth: `${currentWidth}%`,
        oldWidth: `${oldWidth}%`,
        newWidth: `${newWidth}%`
      });

      // 🔧 너비 업데이트 (강제 적용)
      sprite.style.setProperty('width', `${newWidth}%`, 'important');
      sprite.style.width = `${newWidth}%`; // 백업

      // 🔧 클립의 절대 시작 시간을 보존하여 새로운 위치 계산
      const newLeft = (clipStartTime / newTotalSeconds) * 100;

      // 🔧 클립이 타임라인 끝을 벗어나지 않도록 위치 조정
      const maxLeft = 100 - newWidth;
      const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft));

      // 🔧 위치 업데이트 (강제 적용)
      sprite.style.setProperty('left', `${clampedLeft}%`, 'important');
      sprite.style.left = `${clampedLeft}%`; // 백업
      
      // 🔧 강제 DOM 업데이트 및 검증
      sprite.offsetHeight; // 강제 리플로우
      
      // 🔧 실제 적용된 값 확인
      const actualWidth = parseFloat(sprite.style.width);
      const actualLeft = parseFloat(sprite.style.left);
      
      console.log(`🔧 ${spriteType} 스프라이트 ${index + 1} 실제 적용 결과:`, {
        expectedWidth: `${newWidth}%`,
        actualWidth: `${actualWidth}%`,
        expectedLeft: `${clampedLeft}%`,
        actualLeft: `${actualLeft}%`,
        widthMatch: Math.abs(actualWidth - newWidth) < 0.1,
        leftMatch: Math.abs(actualLeft - clampedLeft) < 0.1
      });
      
      // 🔧 만약 적용이 안 되었다면 강제로 다시 시도
      if (Math.abs(actualWidth - newWidth) > 0.1 || Math.abs(actualLeft - clampedLeft) > 0.1) {
        console.warn(`⚠️ ${spriteType} 스프라이트 ${index + 1} 스타일 적용 실패, 강제 재시도`);
        
        // 🔧 방법 1: setProperty로 강제 적용
        sprite.style.setProperty('left', `${clampedLeft}%`, 'important');
        sprite.style.setProperty('width', `${newWidth}%`, 'important');
        
        // 🔧 방법 2: 직접 속성 설정
        sprite.setAttribute('style', `left: ${clampedLeft}% !important; width: ${newWidth}% !important;`);
        
        // 🔧 방법 3: CSS 텍스트로 설정
        sprite.style.cssText = `left: ${clampedLeft}% !important; width: ${newWidth}% !important;`;
        
        // 🔧 강제 DOM 업데이트
        sprite.offsetHeight;
        
        // 🔧 최종 검증
        const finalWidth = parseFloat(sprite.style.width);
        const finalLeft = parseFloat(sprite.style.left);
        
        console.log(`🔧 ${spriteType} 스프라이트 ${index + 1} 강제 재시도 결과:`, {
          finalWidth: `${finalWidth}%`,
          finalLeft: `${finalLeft}%`,
          success: Math.abs(finalWidth - newWidth) < 0.1 && Math.abs(finalLeft - clampedLeft) < 0.1
        });
        
        // 🔧 여전히 실패하면 경고
        if (Math.abs(finalWidth - newWidth) > 0.1 || Math.abs(finalLeft - clampedLeft) > 0.1) {
          console.error(`❌ ${spriteType} 스프라이트 ${index + 1} 모든 방법으로도 업데이트 실패!`);
        }
      }

      console.log(`🔧 오디오 스프라이트 ${index + 1} 클립 위치 업데이트:`, {
        originalStartTime: clipStartTime,
        newLeft: `${newLeft}%`,
        clampedLeft: `${clampedLeft}%`,
        maxLeft: `${maxLeft}%`
      });

      // 🔧 dataset 속성 업데이트 (원본 값 보존)
      sprite.dataset.startTime = clipStartTime.toString();
      sprite.dataset.duration = duration.toString();
      
      // 🔧 원본 위치 정보 보존 (중요!)
      sprite.dataset.originalStartTime = originalStartTime.toString();
      sprite.dataset.originalDuration = duration.toString();
      
      // 🔧 UI 시간 표시 업데이트 (중요!)
      this.updateAudioClipTimeDisplay(sprite, clipStartTime, duration, newTotalSeconds);

      // 🔧 오디오 스프라이트인 경우 오디오 객체의 userData도 업데이트
      if (sprite.classList.contains('audio-sprite')) {
        const trackElement = sprite.closest('.timeline-track');
        if (trackElement) {
          const objectId = trackElement.dataset.objectId;
          if (objectId) {
            const audioObject = this.editor.scene.getObjectById(parseInt(objectId));
            if (audioObject && audioObject.userData) {
              // 🔧 조정된 시작 시간 사용
              const adjustedStartTime = (clampedLeft / 100) * newTotalSeconds;
              
              audioObject.userData.startTime = adjustedStartTime;
              audioObject.userData.duration = duration;
              
              // 🔧 audioObjects 동기화
              this.updateAudioObjectsEntry(audioObject.id, {
                startTime: adjustedStartTime,
                duration: duration
              });
              
              console.log(`🔧 오디오 객체 ${objectId} userData 업데이트:`, {
                startTime: adjustedStartTime,
                duration: duration
              });
            }
          }
        }
      }

      // 클립 내의 키프레임 위치 업데이트 (애니메이션 스프라이트인 경우)
      if (sprite.classList.contains('animation-sprite')) {
        this.updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds);
      }
    });

    console.log('✅ AudioTimeline 클립 너비 및 위치 업데이트 완료');
    
    // 🔧 업데이트 후 UI 강제 새로고침
    setTimeout(() => {
      this.updateUI();
      console.log('🔧 UI 강제 새로고침 완료');
    }, 100);
  }

  // 타임라인 시간 변경 후 클립 내 키프레임 위치 업데이트
  updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds) {
    console.log('AudioTimeline 클립 내 키프레임 위치 업데이트:', { oldTotalSeconds, newTotalSeconds });

    const keyframes = sprite.querySelectorAll('.keyframe');
    keyframes.forEach(keyframe => {
      // 키프레임의 데이터에서 절대 시간 정보 가져오기
      const keyframeTime = parseFloat(keyframe.dataset.time) || 0;
      const clipLeft = parseFloat(sprite.style.left) || 0;
      const clipDuration = parseFloat(sprite.dataset.duration) || 5;

      // 클립의 시작 시간 계산 (클립의 left 위치 기반)
      const clipStartTime = (clipLeft / 100) * oldTotalSeconds;

      // 키프레임의 절대 시간 (클립 시작 시간 + 키프레임의 상대 시간)
      const absoluteTime = clipStartTime + keyframeTime;

      // 새로운 시간 기준으로 클립의 시작 시간 계산
      const newClipStartTime = (clipLeft / 100) * newTotalSeconds;

      // 새로운 시간 기준으로 키프레임의 상대 시간 계산
      const newRelativeTime = absoluteTime - newClipStartTime;

      // 키프레임의 새로운 위치 계산 (클립 내에서의 상대적 위치)
      const newPosition = (newRelativeTime / clipDuration) * 100;

      console.log('AudioTimeline 키프레임 위치 업데이트:', {
        keyframeTime,
        clipLeft: `${clipLeft}%`,
        clipDuration,
        clipStartTime,
        absoluteTime,
        newClipStartTime,
        newRelativeTime,
        newPosition: `${newPosition}%`
      });

      // 키프레임 위치 업데이트 (클립 범위 내로 제한)
      const clampedPosition = Math.max(0, Math.min(100, newPosition));
      keyframe.style.left = `${clampedPosition}%`;
      keyframe.dataset.time = newRelativeTime.toFixed(3);

      console.log('AudioTimeline 최종 키프레임 위치:', {
        originalTime: keyframeTime,
        newLeft: `${clampedPosition}%`,
        newTime: newRelativeTime.toFixed(3)
      });
    });
  }

  initAudioTracks() {
    console.log("현재 트랙 수:", this.tracks.size);

    for (const track of this.tracks.values()) {
      if (track.type === "audio") {
        console.log("이미 오디오 트랙이 존재합니다:", track);
        return;
      }
    }

    // 기본 오디오 파일 (첫 번째 파일)을 로드
    if (!AUDIO_FILES || AUDIO_FILES.length === 0) {
      console.warn("사용 가능한 오디오 파일이 없습니다");
      return;
    }

    const defaultAudioFile = AUDIO_FILES[0];

    // Fetch를 사용하여 전체 오디오 파일을 한 번에 로드
    fetch(defaultAudioFile.path)
      .then((response) => response.blob())
      .then((blob) => {
        // Blob URL 생성
        const audioUrl = URL.createObjectURL(blob);
        const audioElement = new Audio();
        audioElement.src = audioUrl;
        audioElement.preload = "auto";

        audioElement.addEventListener("loadedmetadata", () => {
          console.log("오디오 메타데이터 로드됨:", audioElement.duration);

          const audioObject = new THREE.Object3D();
          audioObject.name = defaultAudioFile.name;

          // userData에 오디오 엘리먼트 저장
          audioObject.userData = {
            audioElement: audioElement,
            volume: 1.0,
            mute: false,
            playbackRate: 1.0,
            type: "audio",
            audioUrl: audioUrl, // Blob URL 저장
            audioFile: defaultAudioFile, // 원본 파일 정보 저장
          };

          // Scene에 오디오 객체 추가
          this.editor.scene.add(audioObject);
          this.editor.signals.sceneGraphChanged.dispatch();
          console.log("오디오 객체 생성됨:", audioObject);

          // 오디오 트랙 생성
          const MIN_DURATION = 5;
          const MAX_DURATION = 180; // 3분
          const effectiveDuration = Math.min(
            MAX_DURATION,
            Math.max(MIN_DURATION, audioElement.duration)
          );

          // addTrack 호출 시 필요한 모든 정보를 전달
          const trackData = {
            name: defaultAudioFile.displayName || defaultAudioFile.name,
            type: "audio",
            duration: effectiveDuration,
            element: this.createTrackElement(effectiveDuration, defaultAudioFile.displayName || defaultAudioFile.name, defaultAudioFile.path),
            audioElement: audioElement,
          };

          // 트랙 생성
          const track = this.addTrack(audioObject.id, trackData);
          console.log("오디오 트랙 생성됨:", track);

          // 오디오 로드 완료 테스트
          audioElement.addEventListener("canplaythrough", () => {
            console.log("오디오 재생 준비 완료");
          });

          // Scene의 userData.audioTimeline에 오디오 정보 저장
          if (!this.editor.scene.userData.audioTimeline) {
            this.editor.scene.userData.audioTimeline = { audioObjects: {} };
          }
          if (!this.editor.scene.userData.audioTimeline.audioObjects) {
            this.editor.scene.userData.audioTimeline.audioObjects = {};
          }
          this.editor.scene.userData.audioTimeline.audioObjects[audioObject.id] = {
            objectId: audioObject.id, // objectId 추가
            volume: 1.0,
            mute: false,
            playbackRate: 1.0,
            audioFile: defaultAudioFile,
          };
        });

        audioElement.addEventListener("error", (e) => {
          console.error("오디오 로드 에러:", e);
        });
      })
      .catch((error) => {
        console.error("오디오 파일 로드 실패:", error);
      });
  }

  // 트랙 엘리먼트 생성을 위한 별도 메서드
  createTrackElement(duration, trackName = "Audio", audioPath = null) {
    const trackTopArea = document.createElement("div");
    trackTopArea.className = "audio-tracks";

    const trackHeader = document.createElement("div");
    trackHeader.className = "track-header";
    trackHeader.innerHTML = `
      <div class="track-info">
        <span class="track-name">${trackName}</span>
      </div>
    `;
    trackTopArea.appendChild(trackHeader);

    const trackContent = document.createElement("div");
    trackContent.className = "track-content";

    const sprite = document.createElement("div");
    sprite.className = "audio-sprite";

    // 스프라이트 크기 설정
    const spriteWidth = (duration / this.getTotalSeconds()) * 100;
    sprite.style.width = `${spriteWidth}%`;
    sprite.style.left = "0%";
    sprite.dataset.duration = duration;
    sprite.dataset.startTime = "0"; // 클립 시작 시간 (타임라인상 위치)
    sprite.dataset.audioStartTime = "0"; // 오디오 편집 시작 시간
    sprite.dataset.audioEndTime = duration.toString(); // 오디오 편집 끝 시간
    sprite.dataset.minWidth = (5 / this.getTotalSeconds()) * 100;
    sprite.dataset.maxWidth = (180 / this.getTotalSeconds()) * 100;

    // audioPath 설정 (트랙 복원 시 필요)
    if (audioPath) {
      sprite.dataset.audioPath = audioPath;
      sprite.dataset.audioName = trackName;
    }

    const spriteContent = document.createElement("div");
    spriteContent.className = "sprite-content";

    const spriteNameEl = document.createElement("div");
    spriteNameEl.className = "sprite-name";
    spriteNameEl.textContent = trackName;

    const waveformCanvas = document.createElement("canvas");
    waveformCanvas.className = "waveform-canvas";
    waveformCanvas.height = 16;

    spriteContent.appendChild(spriteNameEl);
    spriteContent.appendChild(waveformCanvas);

    sprite.innerHTML = `
      <div class="sprite-handle left"></div>
      <div class="sprite-handle right"></div>
    `;
    sprite.insertBefore(spriteContent, sprite.querySelector(".sprite-handle.right"));

    trackContent.appendChild(sprite);
    trackTopArea.appendChild(trackContent);

    // 파형 그리기 (audioPath가 제공된 경우에만)
    if (audioPath) {
      this.drawWaveform(sprite.querySelector("canvas"), audioPath);
    }

    // 스프라이트 이벤트 바인딩 (track 객체를 찾아서 전달)
    const trackId = trackTopArea.querySelector('.track-header')?.dataset?.objectId;
    const track = trackId ? this.tracks.get(trackId) : null;
    this.bindSpriteEvents(sprite, track);

    // 편집 모드가 활성화되어 있으면 리사이즈 핸들 추가
    if (this.isEditMode) {
      this.addResizeHandles(sprite);
    }

    return trackTopArea;
  }

  // 파형 그리기 메서드 추가
  async drawWaveform(canvas, audioPath = null) {
    try {
      const audioContext = new (window.AudioContext ||
        window.webkitAudioContext)();

      // audioPath가 제공되지 않으면 기본 경로 사용
      const path = audioPath || AUDIO_FILES[0].path;
      const response = await fetch(path);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const ctx = canvas.getContext("2d");
      const width = (canvas.width = canvas.parentElement.offsetWidth);
      const height = canvas.height;
      const data = audioBuffer.getChannelData(0);
      const step = Math.ceil(data.length / width);
      const amp = height / 2;

      // 배경 지우기
      ctx.clearRect(0, 0, width, height);

      // 파형 그리기 스타일 설정
      ctx.fillStyle = "rgba(180, 230, 190, 0.55)";
      ctx.strokeStyle = "rgba(200, 245, 210, 0.7)";
      ctx.lineWidth = 1;

      // 중앙선 기준으로 위아래로 파형 그리기
      const middle = height / 2;

      ctx.beginPath();
      ctx.moveTo(0, middle);

      for (let i = 0; i < width; i++) {
        let min = 1.0;
        let max = -1.0;
        for (let j = 0; j < step; j++) {
          const datum = data[i * step + j];
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }

        const y1 = middle + min * amp;
        const y2 = middle + max * amp;

        ctx.fillRect(i, y1, 1, y2 - y1);
      }

      ctx.stroke();
    } catch (error) {
      console.error("파형 그리기 오류:", error);
    }
  }

  // 오디오 파형 표시 등 특수 기능
  showWaveform(audioData) { }

  // BaseTimeline의 추상 메서드 구현
  getPropertyValue(object, propertyType) {
    switch (propertyType) {
      case "volume":
        return object.userData.volume || 1.0;
      case "mute":
        return object.userData.mute || false;
      case "playbackRate":
        return object.userData.playbackRate || 1.0;
      default:
        return null;
    }
  }

  updateFrame(frame) {
    const isPlaying = this.editor.scene?.userData?.timeline?.isPlaying;
    if (!isPlaying) {
      return;
    }

    this.tracks.forEach((track) => {
      const object = this.editor.scene.getObjectById(parseInt(track.objectId));
      const audioElement = object?.userData?.audioElement || track.audioElement;

      if (!audioElement) {
        return;
      }

      let hasChanges = false;

      ["volume", "mute", "playbackRate"].forEach((propertyType) => {
        const keyframes = track.keyframes[propertyType];
        if (!keyframes || keyframes.size === 0) return;

        const keyframeArray = Array.from(keyframes.entries()).sort(
          ([a], [b]) => a - b
        );
        let prevKeyframe = null;
        let nextKeyframe = null;

        for (let i = 0; i < keyframeArray.length; i++) {
          if (keyframeArray[i][0] <= frame) {
            prevKeyframe = keyframeArray[i];
          }
          if (keyframeArray[i][0] > frame) {
            nextKeyframe = keyframeArray[i];
            break;
          }
        }

        if (prevKeyframe && nextKeyframe) {
          const [prevFrame, prevData] = prevKeyframe;
          const [nextFrame, nextData] = nextKeyframe;
          const alpha = (frame - prevFrame) / (nextFrame - prevFrame);
          if (object) {
            this.interpolateProperty(
              object,
              propertyType,
              prevData.value,
              nextData.value,
              alpha
            );
          }
          hasChanges = true;
        } else if (prevKeyframe) {
          if (object) {
            this.setPropertyValue(object, propertyType, prevKeyframe[1].value);
          }
          hasChanges = true;
        }
      });

      if (audioElement) {
        if (audioElement.readyState === 0) {
          return;
        }

        const sprite = track.element.querySelector(".audio-sprite");

        if (sprite) {
          // 클립의 시작 시간과 지속 시간 가져오기
          const clipStartTime = parseFloat(sprite.dataset.startTime) || 0;
          const clipDuration = parseFloat(sprite.dataset.duration) || audioElement.duration;
          const clipEndTime = clipStartTime + clipDuration;

          // 현재 타임라인 시간 (초)
          const currentTimeInSeconds = frame / this.options.framesPerSecond;

          // 클립 범위 내에 있는지 확인
          if (currentTimeInSeconds >= clipStartTime && currentTimeInSeconds <= clipEndTime) {
            // 클립 내에서의 상대적 시간 계산
            const relativeTime = currentTimeInSeconds - clipStartTime;

            // 오디오 편집 시간 적용
            const audioStartTime = (object?.userData?.audioStartTime ?? track.audioStartTime) || 0;
            const audioEndTime = (object?.userData?.audioEndTime ?? track.audioEndTime) || audioElement.duration;
            const effectiveAudioStartTime = Math.max(0, Math.min(audioStartTime, audioElement.duration));
            const effectiveAudioEndTime = Math.max(effectiveAudioStartTime, Math.min(audioEndTime, audioElement.duration));

            audioElement.volume = object?.userData?.volume ?? track.volume ?? 1.0;
            audioElement.muted = object?.userData?.mute ?? track.mute ?? false;
            audioElement.playbackRate = object?.userData?.playbackRate ?? track.playbackRate ?? 1.0;

            // 오디오 재생 위치 계산 (편집 시간 반영)
            const audioPlayTime = effectiveAudioStartTime + (relativeTime % (effectiveAudioEndTime - effectiveAudioStartTime));

            // 오디오 재생 위치는 큰 차이가 있을 때만 업데이트 (버벅임 방지)
            const timeDifference = Math.abs(audioElement.currentTime - audioPlayTime);
            if (timeDifference > 0.1) { // 0.1초 이상 차이가 날 때만 업데이트
              audioElement.currentTime = audioPlayTime;
            }

            // 오디오가 재생 중이 아니면 재생 시작 (한 번만)
            if (audioElement.paused && !audioElement._playRequested) {
              audioElement._playRequested = true;
              audioElement.play().then(() => {
                audioElement._playRequested = false;
              }).catch((error) => {
                console.error("AudioTimeline에서 오디오 재생 실패:", error);
                audioElement._playRequested = false;
              });
            }

            hasChanges = true;
          } else {
            // 클립 범위 밖이면 오디오 정지
            if (!audioElement.paused) {
              audioElement.pause();
              audioElement._playRequested = false;
            }
          }
        } else {
          // 스프라이트가 없으면 기존 방식으로 처리
          audioElement.volume = object?.userData?.volume ?? track.volume ?? 1.0;
          audioElement.muted = object?.userData?.mute ?? track.mute ?? false;
          audioElement.playbackRate = object?.userData?.playbackRate ?? track.playbackRate ?? 1.0;

          // 현재 프레임이 오디오 시작 시간과 일치하면 재생
          if (frame === 0 && audioElement.paused && !audioElement._playRequested) {
            audioElement._playRequested = true;
            audioElement.currentTime = 0;
            audioElement.play().then(() => {
              audioElement._playRequested = false;
            }).catch((error) => {
              console.error("오디오 재생 실패:", error);
              audioElement._playRequested = false;
            });
          }
        }
      }

      if (hasChanges && this.editor.signals?.objectChanged) {
        this.editor.signals.objectChanged.dispatch(object);
      }
    });
  }

  isWithinClipRange(track, frame) {
    const sprite = track.element.querySelector(".audio-sprite");
    if (!sprite) return true;

    const clipDuration = parseFloat(sprite.dataset.duration);
    const maxFrame = Math.floor(clipDuration * this.options.framesPerSecond);
    const clipLeft = parseFloat(sprite.style.left);
    const clipWidth = parseFloat(sprite.style.width);

    const framePercent =
      (frame / (this.options.totalSeconds * this.options.framesPerSecond)) *
      100;

    // 허용 범위 추가 (0.5초에 해당하는 퍼센트)
    const tolerancePercent = (0.5 / this.options.totalSeconds) * 100;

    return framePercent >= clipLeft - tolerancePercent && framePercent <= clipLeft + clipWidth + tolerancePercent;
  }

  // 오디오 특화 메서드들
  interpolateProperty(object, propertyType, startValue, endValue, t) {
    switch (propertyType) {
      case "volume":
        object.userData.volume = startValue + (endValue - startValue) * t;
        break;
      case "mute":
        // mute는 보간하지 않고 이전 키프레임 값 사용
        object.userData.mute = startValue;
        break;
      case "playbackRate":
        object.userData.playbackRate = startValue + (endValue - startValue) * t;
        break;
    }
  }

  setPropertyValue(object, propertyType, value) {
    switch (propertyType) {
      case "volume":
        object.userData.volume = value;
        break;
      case "mute":
        object.userData.mute = value;
        break;
      case "playbackRate":
        object.userData.playbackRate = value;
        break;
    }
  }

  // UI 관련 메서드들
  createPropertyPanel() {
    const panel = new UIPanel();
    panel.setClass("property-edit-panel audio-property-panel");

    // 음악 추가 버튼
    const addMusicRow = new UIRow();

    const addMusicButton = document.createElement("button");
    addMusicButton.textContent = "음악 선택";
    addMusicButton.className = "add-music-btn";
    addMusicButton.style.display = "none";
    addMusicButton.addEventListener("click", () => {
      console.log("음악 추가 버튼 클릭됨");
      if (this.assetSelector) {
        this.assetSelector.show();
      } else {
        console.warn("음악 선택기가 아직 초기화되지 않았습니다");
        addMusicButton.textContent = "로딩 중...";
        addMusicButton.disabled = true;

        // 잠시 후 다시 시도
        setTimeout(() => {
          if (this.assetSelector) {
            addMusicButton.textContent = "음악 선택";
            addMusicButton.disabled = false;
            this.assetSelector.show();
          }
        }, 1000);
      }
    });

    addMusicRow.add(new UIElement(addMusicButton));
    panel.add(addMusicRow);

    // 전체 볼륨 조절 UI
    const volumeRow = new UIRow();
    volumeRow.add(new UIText("volume"));
    volumeRow.addClass("volume-row");

    const volumeControl = new UIVolumeControl();
    this._masterVolumeControl = volumeControl;
    volumeControl.onChange((value) => {
      this.applyMasterVolume(value);
    });

    // 초기 볼륨 값 설정
    const masterVolume = this.editor.scene.userData.audioTimeline?.audioObjects?.masterVolume || 1.0;
    volumeControl.setValue(masterVolume * 100);

    volumeRow.add(volumeControl);
    panel.add(volumeRow);

    // 오디오 편집 UI 추가
    const audioEditRow = new UIRow();
    // audioEditRow.add(new UIText("오디오 편집"));
    panel.add(audioEditRow);

    // 오디오 시작 시간 조절
    const startTimeRow = new UIRow();
    startTimeRow.add(new UIText("시작 시간"));

    const startTimeInput = document.createElement("input");
    startTimeInput.type = "text";
    startTimeInput.className = "time-input startTimeInput";
    startTimeInput.placeholder = "00:00.00";

    startTimeInput.addEventListener("change", (e) => {
      const timeString = e.target.value;
      const startTime = this.parseFrameToSeconds(timeString);
      this.updateAudioStartTime(startTime);
    });

    // input 필드를 클래스 변수로 저장
    this.startTimeInput = startTimeInput;

    startTimeRow.add(new UIElement(startTimeInput));
    panel.add(startTimeRow);

    // 오디오 끝 시간 조절
    const endTimeRow = new UIRow();
    endTimeRow.add(new UIText("끝 시간"));

    const endTimeInput = document.createElement("input");
    endTimeInput.type = "text";
    endTimeInput.className = "time-input endTimeInput";
    endTimeInput.placeholder = "00:00.00";

    endTimeInput.addEventListener("change", (e) => {
      const timeString = e.target.value;
      const endTime = this.parseFrameToSeconds(timeString);
      this.updateAudioEndTime(endTime);
    });

    // input 필드를 클래스 변수로 저장
    this.endTimeInput = endTimeInput;

    endTimeRow.add(new UIElement(endTimeInput));
    panel.add(endTimeRow);

    // 클립 위치 조절 UI 추가
    const clipPositionRow = new UIRow();
    clipPositionRow.add(new UIText("클립 위치"));
    panel.add(clipPositionRow);

    // 클립 시작 위치 조절
    const clipStartRow = new UIRow();
    clipStartRow.add(new UIText("시작 위치"));

    const clipStartInput = document.createElement("input");
    clipStartInput.type = "text";
    clipStartInput.className = "time-input clipStartInput";
    clipStartInput.placeholder = "00:00.00";

    clipStartInput.addEventListener("change", (e) => {
      const timeString = e.target.value;
      const startTime = this.parseFrameToSeconds(timeString);
      this.updateClipStartTime(startTime);
    });

    // input 필드를 클래스 변수로 저장
    this.clipStartInput = clipStartInput;

    clipStartRow.add(new UIElement(clipStartInput));
    panel.add(clipStartRow);

    // 클립 길이 조절 (자동 계산)
    const clipDurationRow = new UIRow();
    clipDurationRow.add(new UIText("클립 길이 (자동)"));

    const clipDurationInput = document.createElement("input");
    clipDurationInput.type = "text";
    clipDurationInput.className = "time-input clipDurationInput";
    clipDurationInput.placeholder = "00:00.00";
    clipDurationInput.readOnly = true; // 읽기 전용으로 설정

    // input 필드를 클래스 변수로 저장
    this.clipDurationInput = clipDurationInput;

    clipDurationRow.add(new UIElement(clipDurationInput));
    panel.add(clipDurationRow);

    // 클립 편집 도구 버튼들
    const clipToolsRow = new UIRow();
    clipToolsRow.add(new UIText("클립 편집"));

    // 시작/끝 지점 편집 모드 토글 버튼
    const editModeButton = document.createElement("button");
    editModeButton.type = "button";
    editModeButton.textContent = "편집 ON";
    editModeButton.className = "sb-audio-btn edit-mode-button is-active";

    editModeButton.addEventListener("click", () => {
      this.toggleEditMode();
    });

    this.isEditMode = true;
    this.editModeButton = editModeButton;

    // 타임라인 맞춤 버튼 추가
    const timelineFitButton = document.createElement("button");
    timelineFitButton.type = "button";
    timelineFitButton.textContent = "타임라인 맞춤";
    timelineFitButton.className = "sb-audio-btn timeline-fit-button";
    timelineFitButton.title = "클립을 타임라인 크기에 맞춤 / 원본 크기로 복원 (토글)";

    timelineFitButton.addEventListener("click", () => {
      this.toggleTimelineFit();
    });

    // 타임라인 맞춤 상태 변수
    this.isTimelineFit = false;
    this.timelineFitButton = timelineFitButton;

    clipToolsRow.add(new UIElement(editModeButton));
    clipToolsRow.add(new UIElement(timelineFitButton));
    panel.add(clipToolsRow);

    setTimeout(() => this.applyEditModeUI(), 0);

    return panel;
  }

  // 오디오 시작 시간 업데이트
  updateAudioStartTime(startTime) {
    console.log("오디오 시작 시간 업데이트:", startTime);

    // 선택된 클립 찾기
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite) {
      console.warn("선택된 클립이 없습니다");
      return;
    }

    // 선택된 클립의 트랙 찾기
    let targetTrack = null;
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.element && track.element.contains(selectedSprite)) {
        targetTrack = track;
        break;
      }
    }

    if (!targetTrack) {
      console.error("선택된 클립의 트랙을 찾을 수 없습니다");
      return;
    }

    const audioObject = this.getTrackSceneObject(targetTrack);
    if (!audioObject || !audioObject.userData.audioElement) {
      console.error("오디오 객체를 찾을 수 없습니다");
      return;
    }

    const audio = audioObject.userData.audioElement;

    // 시작 시간 제한: 0 ~ (오디오 길이 - 최소 클립 길이)
    const MIN_CLIP_DURATION = 5; // 최소 5초
    const maxStartTime = Math.max(0, audio.duration - MIN_CLIP_DURATION);
    const clampedStartTime = Math.max(0, Math.min(maxStartTime, startTime));

    // 오디오 객체에 시작 시간 저장
    audioObject.userData.audioStartTime = clampedStartTime;

    // 스프라이트 데이터 업데이트
    selectedSprite.dataset.audioStartTime = clampedStartTime.toString();

    // 클립 길이 자동 조정 (오디오 편집 시간에 맞춰)
    const currentAudioEndTime = audioObject.userData.audioEndTime || audio.duration;
    const newClipDuration = currentAudioEndTime - clampedStartTime;

    if (newClipDuration >= MIN_CLIP_DURATION) {
      // 클립 길이 업데이트
      const newWidth = (newClipDuration / this.getTotalSeconds()) * 100;
      selectedSprite.style.width = `${newWidth}%`;
      selectedSprite.dataset.duration = newClipDuration.toString();
      audioObject.userData.duration = newClipDuration;

      // 클립 input 필드도 업데이트
      const clipStartTime = parseFloat(selectedSprite.dataset.startTime) || 0;
      this.updateClipInputFields(clipStartTime, newClipDuration);

      // audioObjects 동기화
      this.updateAudioObjectsEntry(audioObject.id, {
        audioStartTime: clampedStartTime,
        duration: newClipDuration,
        startTime: clipStartTime,
      });
    }

    console.log("오디오 시작 시간 설정됨:", {
      objectId: audioObject.id,
      startTime: clampedStartTime,
      newClipDuration: newClipDuration,
      audioDuration: audio.duration
    });

    // input 필드 업데이트
    const audioEndTime = audioObject.userData.audioEndTime || audio.duration;
    this.updateInputFields(clampedStartTime, audioEndTime);
  }

  // 오디오 끝 시간 업데이트
  updateAudioEndTime(endTime) {
    console.log("오디오 끝 시간 업데이트:", endTime);

    // 선택된 클립 찾기
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite) {
      console.warn("선택된 클립이 없습니다");
      return;
    }

    // 선택된 클립의 트랙 찾기
    let targetTrack = null;
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.element && track.element.contains(selectedSprite)) {
        targetTrack = track;
        break;
      }
    }

    if (!targetTrack) {
      console.error("선택된 클립의 트랙을 찾을 수 없습니다");
      return;
    }

    const audioObject = this.getTrackSceneObject(targetTrack);
    if (!audioObject || !audioObject.userData.audioElement) {
      console.error("오디오 객체를 찾을 수 없습니다");
      return;
    }

    const audio = audioObject.userData.audioElement;

    // 끝 시간 제한: (시작 시간 + 최소 클립 길이) ~ 오디오 길이
    const currentStartTime = audioObject.userData.audioStartTime || 0;
    const MIN_CLIP_DURATION = 5; // 최소 5초
    const minEndTime = currentStartTime + MIN_CLIP_DURATION;
    const clampedEndTime = Math.max(minEndTime, Math.min(audio.duration, endTime));

    // 오디오 객체에 끝 시간 저장
    audioObject.userData.audioEndTime = clampedEndTime;

    // 스프라이트 데이터 업데이트
    selectedSprite.dataset.audioEndTime = clampedEndTime.toString();

    // 클립 길이 자동 조정 (오디오 편집 시간에 맞춰)
    const newClipDuration = clampedEndTime - currentStartTime;

    if (newClipDuration >= MIN_CLIP_DURATION) {
      // 클립 길이 업데이트
      const newWidth = (newClipDuration / this.getTotalSeconds()) * 100;
      selectedSprite.style.width = `${newWidth}%`;
      selectedSprite.dataset.duration = newClipDuration.toString();
      audioObject.userData.duration = newClipDuration;

      // 클립 input 필드도 업데이트
      const clipStartTime = parseFloat(selectedSprite.dataset.startTime) || 0;
      this.updateClipInputFields(clipStartTime, newClipDuration);

      // audioObjects 동기화
      this.updateAudioObjectsEntry(audioObject.id, {
        audioEndTime: clampedEndTime,
        duration: newClipDuration,
      });
    }

    console.log("오디오 끝 시간 설정됨:", {
      objectId: audioObject.id,
      endTime: clampedEndTime,
      newClipDuration: newClipDuration,
      audioDuration: audio.duration
    });

    // input 필드 업데이트
    this.updateInputFields(currentStartTime, clampedEndTime);
  }

  // 시간을 분:초.프레임 형식으로 변환하는 유틸리티 함수
  formatTimeToFrame(seconds) {
    console.log("formatTimeToFrame 입력:", seconds);

    const fps = this.options.framesPerSecond || 30;
    const totalFrames = Math.round(seconds * fps);

    const minutes = Math.floor(totalFrames / (fps * 60));
    const secs = Math.floor((totalFrames % (fps * 60)) / fps);
    const frames = totalFrames % fps;

    const result = `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;

    console.log("formatTimeToFrame 결과:", {
      seconds,
      fps,
      totalFrames,
      minutes,
      secs,
      frames,
      result
    });

    return result;
  }

  // 분:초.프레임 형식을 초 단위로 변환하는 유틸리티 함수
  parseFrameToSeconds(timeString) {
    console.log("parseFrameToSeconds 입력:", timeString);

    // 빈 문자열이나 null 체크
    if (!timeString || timeString.trim() === '') {
      console.warn("빈 시간 문자열");
      return 0;
    }

    const parts = timeString.split(':');
    console.log("분할된 부분:", parts);

    if (parts.length !== 2) {
      console.warn("잘못된 형식:", timeString, "예상: MM:SS.FF");
      return 0;
    }

    const minutes = parseInt(parts[0]) || 0;
    const secondsAndFrames = parts[1].split('.');
    console.log("초와 프레임 부분:", secondsAndFrames);

    const seconds = parseInt(secondsAndFrames[0]) || 0;
    const frames = parseInt(secondsAndFrames[1]) || 0;

    const fps = this.options.framesPerSecond || 30;
    const result = minutes * 60 + seconds + frames / fps;

    console.log("파싱 결과:", {
      minutes,
      seconds,
      frames,
      fps,
      result
    });

    return result;
  }

  // input 필드 값 업데이트 메서드
  updateInputFields(audioStartTime, audioEndTime) {
    console.log("🔍 updateInputFields 호출됨:", { audioStartTime, audioEndTime });
    
    // 🔧 NaN 체크 추가
    if (isNaN(audioStartTime) || !isFinite(audioStartTime)) {
      console.warn("⚠️ audioStartTime이 유효하지 않음:", audioStartTime);
      return;
    }
    
    if (isNaN(audioEndTime) || !isFinite(audioEndTime)) {
      console.warn("⚠️ audioEndTime이 유효하지 않음:", audioEndTime);
      return;
    }
    
    // 🔧 더 안전한 패널 검색
    let panel = document.querySelector('div.timeline-group[data-timeline="audio"] .property-edit-panel');
    
    // 첫 번째 검색이 실패하면 더 넓은 범위에서 검색
    if (!panel) {
      panel = document.querySelector('.property-edit-panel');
      console.log("🔍 넓은 범위에서 패널 검색:", panel);
    }
    
    if (!panel) {
      console.warn("⚠️ property-edit-panel을 찾을 수 없음");
      return;
    }
    
    const startTimeInput = panel.querySelector('input.time-input.startTimeInput');
    const endTimeInput = panel.querySelector('input.time-input.endTimeInput');
    
    console.log("🔍 찾은 input 요소들:", {
      startTimeInput: !!startTimeInput,
      endTimeInput: !!endTimeInput,
      audioStartTime,
      audioEndTime
    });
    
    if (startTimeInput) {
      const formattedStartTime = this.formatTimeToFrame(audioStartTime);
      startTimeInput.value = formattedStartTime;
      console.log("✅ startTimeInput 값 설정:", formattedStartTime);
    } else {
      console.warn("⚠️ startTimeInput을 찾을 수 없음");
    }
    
    if (endTimeInput) {
      const formattedEndTime = this.formatTimeToFrame(audioEndTime);
      endTimeInput.value = formattedEndTime;
      console.log("✅ endTimeInput 값 설정:", formattedEndTime);
    } else {
      console.warn("⚠️ endTimeInput을 찾을 수 없음");
    }
  }

  // 클립 input 필드 값 업데이트 메서드
  updateClipInputFields(startTime, duration) {
    console.log("🔍 updateClipInputFields 호출됨:", { startTime, duration });
    
    // 🔧 NaN 체크 추가
    if (isNaN(startTime) || !isFinite(startTime)) {
      console.warn("⚠️ startTime이 유효하지 않음:", startTime);
      return;
    }
    
    if (isNaN(duration) || !isFinite(duration)) {
      console.warn("⚠️ duration이 유효하지 않음:", duration);
      return;
    }
    
    // 🔧 더 안전한 패널 검색
    let panel = document.querySelector('div.timeline-group[data-timeline="audio"] .property-edit-panel');
    
    // 첫 번째 검색이 실패하면 더 넓은 범위에서 검색
    if (!panel) {
      panel = document.querySelector('.property-edit-panel');
      console.log("🔍 넓은 범위에서 패널 검색:", panel);
    }
    
    if (!panel) {
      console.warn("⚠️ property-edit-panel을 찾을 수 없음");
      return;
    }
    
    const clipStartInput = panel.querySelector('input.time-input.clipStartInput');
    const clipDurationInput = panel.querySelector('input.time-input.clipDurationInput');
    
    console.log("🔍 찾은 input 요소들:", {
      clipStartInput: !!clipStartInput,
      clipDurationInput: !!clipDurationInput,
      startTime,
      duration
    });
    
    if (clipStartInput) {
      const formattedTime = this.formatTimeToFrame(startTime);
      clipStartInput.value = formattedTime;
      console.log("✅ clipStartInput 값 설정:", formattedTime);
    } else {
      console.warn("⚠️ clipStartInput을 찾을 수 없음");
    }
    
    if (clipDurationInput) {
      const formattedDuration = this.formatTimeToFrame(duration);
      clipDurationInput.value = formattedDuration;
      console.log("✅ clipDurationInput 값 설정:", formattedDuration);
    } else {
      console.warn("⚠️ clipDurationInput을 찾을 수 없음");
    }
  }

  // 클립 시작 시간 업데이트
  updateClipStartTime(startTime) {
    console.log("클립 시작 시간 업데이트:", startTime);

    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite) {
      console.warn("선택된 클립이 없습니다");
      return;
    }

    // 모든 트랙에서 선택된 스프라이트를 찾기
    let targetTrack = null;
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.element && track.element.contains(selectedSprite)) {
        targetTrack = track;
        break;
      }
    }

    if (!targetTrack) {
      console.error("클립에 해당하는 트랙을 찾을 수 없습니다");
      return;
    }

    const audioObject = this.getTrackSceneObject(targetTrack);
    if (!audioObject) {
      console.error("오디오 객체를 찾을 수 없습니다");
      return;
    }

    // 제한: 0초 이상, 타임라인 끝을 넘지 않도록
    console.log("#############################")
    console.log("getTotalSeconds", this.getTotalSeconds());

    const maxStartTime = this.getTotalSeconds() - parseFloat(selectedSprite.dataset.duration);
    const clampedStartTime = Math.max(0, Math.min(maxStartTime, startTime));

    // 스프라이트 위치 업데이트
    const newLeft = (clampedStartTime / this.getTotalSeconds()) * 100;
    selectedSprite.style.left = `${newLeft}%`;
    selectedSprite.dataset.startTime = clampedStartTime.toString();

    // 오디오 객체 업데이트
    audioObject.userData.startTime = clampedStartTime;

    // audioObjects 동기화
    this.updateAudioObjectsEntry(audioObject.id, {
      startTime: clampedStartTime,
    });

    console.log("클립 시작 시간 설정됨:", {
      startTime: clampedStartTime,
      newLeft: `${newLeft}%`
    });
  }

  // 클립 길이 업데이트
  updateClipDuration(duration) {
    console.log("클립 길이 업데이트:", duration);

    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite) {
      console.warn("선택된 클립이 없습니다");
      return;
    }

    // 모든 트랙에서 선택된 스프라이트를 찾기
    let targetTrack = null;
    for (const [trackId, track] of this.tracks.entries()) {
      if (track.element && track.element.contains(selectedSprite)) {
        targetTrack = track;
        break;
      }
    }

    if (!targetTrack) {
      console.error("클립에 해당하는 트랙을 찾을 수 없습니다");
      return;
    }

    const audioObject = this.getTrackSceneObject(targetTrack);
    if (!audioObject) {
      console.error("오디오 객체를 찾을 수 없습니다");
      return;
    }

    // 제한: 최소 5초, 최대 3분, 타임라인 끝을 넘지 않도록
    const MIN_DURATION = 5;
    const MAX_DURATION = 180;
    const currentStartTime = parseFloat(selectedSprite.dataset.startTime) || 0;
    const maxDuration = this.getTotalSeconds() - currentStartTime;

    const clampedDuration = Math.max(
      MIN_DURATION,
      Math.min(MAX_DURATION, maxDuration, duration)
    );

    // 스프라이트 너비 업데이트
    console.log("#############################")
    const newWidth = (clampedDuration / this.getTotalSeconds()) * 100;
    selectedSprite.style.width = `${newWidth}%`;
    selectedSprite.dataset.duration = clampedDuration.toString();

    // 오디오 객체 업데이트
    audioObject.userData.duration = clampedDuration;

    // audioObjects 동기화
    this.updateAudioObjectsEntry(audioObject.id, {
      duration: clampedDuration,
    });

    console.log("클립 길이 설정됨:", {
      duration: clampedDuration,
      newWidth: `${newWidth}%`
    });
  }

  // 트랙 삭제 메서드
  removeTrack(objectId) {
    this.rebuildTracksFromDOM();
    const mapKey = this.resolveTrackMapKey(objectId);
    if (!mapKey || !this.tracks.get(mapKey)) {
      return this._removeTrackInternal(objectId);
    }

    if (!this._inHistoryPlayback && this.editor?.history) {
      const snapshot = this._captureAudioTrackSnapshot(mapKey);
      if (snapshot) {
        this.editor.history.execute(
          new RemoveAudioTrackCommand(this.editor, mapKey),
          '오디오 트랙 제거',
        );
        return true;
      }
    }
    return this._removeTrackInternal(mapKey);
  }

  _captureAudioTrackSnapshot(objectId) {
    const mapKey = this.resolveTrackMapKey(objectId);
    const track = mapKey ? this.tracks.get(mapKey) : null;
    if (!track) return null;

    const audioObject = this.getTrackSceneObject(track);
    const ud = audioObject?.userData || {};
    const sprite = track.element?.querySelector('.audio-sprite');
    const audioPath = this.getPersistentAudioPath(mapKey, sprite, track) || ud.audioPath || '';
    if (!audioPath) return null;

    const startTime = parseFloat(sprite?.dataset?.startTime) || ud.startTime || 0;
    const duration = parseFloat(sprite?.dataset?.duration) || ud.duration || 0;
    const audioName = ud.audioName || sprite?.dataset?.audioName || track.objectName || 'Audio';

    return {
      objectId: mapKey,
      audioFile: {
        path: audioPath,
        name: audioName,
        displayName: typeof audioName === 'object' ? audioName.name : audioName,
        originalTrackData: {
          startTime,
          duration,
          volume: ud.volume !== undefined ? ud.volume : 1.0,
          mute: ud.mute !== undefined ? ud.mute : false,
          playbackRate: ud.playbackRate !== undefined ? ud.playbackRate : 1.0,
          audioStartTime: ud.audioStartTime !== undefined ? ud.audioStartTime : 0,
          audioEndTime: ud.audioEndTime !== undefined ? ud.audioEndTime : duration,
        },
      },
      trackProps: {
        startTime,
        duration,
        volume: ud.volume,
        mute: ud.mute,
        playbackRate: ud.playbackRate,
        audioStartTime: ud.audioStartTime,
        audioEndTime: ud.audioEndTime,
      },
    };
  }

  _removeTrackInternal(objectId) {
    this.rebuildTracksFromDOM();
    const mapKey = this.resolveTrackMapKey(objectId);
    console.log("AudioTimeline 트랙 삭제:", mapKey || objectId);

    let track = mapKey ? this.tracks.get(mapKey) : null;

    if (!track) {
      const container = this.getAudioTracksContainer();
      const trackEl = container?.querySelector(
        `.timeline-track[data-object-id="${objectId}"], .timeline-track[data-object-id="${mapKey}"]`,
      );
      if (trackEl) {
        const sprite = trackEl.querySelector('.audio-sprite');
        const path = sprite?.dataset?.audioPath;
        const orphanTrack = { element: trackEl, objectId: trackEl.dataset.objectId };
        const audioObject = this.getTrackSceneObject(orphanTrack);

        if (audioObject) {
          const audioEl = audioObject.userData?.audioElement;
          if (audioEl && !audioEl.paused) audioEl.pause();
          if (audioObject.userData?.audioUrl) {
            try { URL.revokeObjectURL(audioObject.userData.audioUrl); } catch (e) { /* ignore */ }
          }
          this.editor.scene.remove(audioObject);
        } else if (path) {
          this.editor.scene.traverse((child) => {
            const childPath = child.userData?.audioPath || child.userData?.audioFile?.path;
            if (childPath && this.resolveAudioPlaybackUrl(childPath) === this.resolveAudioPlaybackUrl(path)) {
              const audioEl = child.userData?.audioElement;
              if (audioEl && !audioEl.paused) audioEl.pause();
              if (child.userData?.audioUrl) {
                try { URL.revokeObjectURL(child.userData.audioUrl); } catch (e) { /* ignore */ }
              }
              this.editor.scene.remove(child);
            }
          });
        }

        trackEl.remove();
        if (mapKey) this.tracks.delete(mapKey);
        this.tracks.delete(String(objectId));
        return true;
      }
      console.warn("삭제할 트랙을 찾을 수 없습니다:", objectId);
      return false;
    }

    const audioObject = this.getTrackSceneObject(track);
    if (audioObject?.userData?.audioElement) {
      const audioElement = audioObject.userData.audioElement;

      if (!audioElement.paused) {
        audioElement.pause();
        audioElement._playRequested = false;
        console.log("오디오 정지됨:", audioElement.src);
      }

      if (audioObject.userData.audioUrl) {
        URL.revokeObjectURL(audioObject.userData.audioUrl);
        console.log("Blob URL 정리됨:", audioObject.userData.audioUrl);
      }

      this.editor.scene.remove(audioObject);
      console.log("Scene에서 오디오 객체 제거됨:", audioObject.id);
    }

    // 트랙 UI 요소 제거
    if (track.element && track.element.parentNode) {
      track.element.parentNode.removeChild(track.element);
      console.log("트랙 UI 요소 제거됨");
    }

    // 트랙 데이터에서 제거
    this.tracks.delete(mapKey);
    console.log("트랙 데이터에서 제거됨");

    // Scene의 userData.audioTimeline에서도 제거
    if (this.editor.scene.userData.audioTimeline?.audioObjects) {
      const objs = this.editor.scene.userData.audioTimeline.audioObjects;
      delete objs[mapKey];
      if (audioObject?.id) delete objs[String(audioObject.id)];
      console.log("Scene userData.audioTimeline에서 오디오 정보 제거됨");
    }

    // 선택된 클립이 삭제된 클립이면 선택 해제
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (selectedSprite && track.element && track.element.contains(selectedSprite)) {
      selectedSprite.classList.remove('selected');
      console.log("선택된 클립 선택 해제됨");
    }

    console.log("AudioTimeline 트랙 삭제 완료:", mapKey);
    return true;
  }

  // 모든 트랙 삭제 메서드
  removeAllTracks() {
    console.log("AudioTimeline 모든 트랙 삭제");

    const trackIds = Array.from(this.tracks.keys());
    let removedCount = 0;

    trackIds.forEach(objectId => {
      if (this.removeTrack(objectId)) {
        removedCount++;
      }
    });

    console.log(`AudioTimeline ${removedCount}개 트랙 삭제 완료`);
    return removedCount;
  }

  updatePropertyValue(propertyType, value) {
    if (!this.selectedObject) return;

    const object = this.editor.scene.getObjectById(
      parseInt(this.selectedObject)
    );
    if (!object) return;

    // 현재 프레임에 키프레임이 없으면 생성
    const currentFrame = Math.floor(this.currentFrame);
    const track = this.tracks.get(this.selectedObject);

    if (!track.keyframes[propertyType]) {
      track.keyframes[propertyType] = new Map();
    }

    // 키프레임 데이터 업데이트 또는 생성
    const keyframeData = track.keyframes[propertyType].get(currentFrame) || {
      value: value,
      element: null,
    };
    keyframeData.value = value;
    track.keyframes[propertyType].set(currentFrame, keyframeData);

    // 오디오 요소 실시간 업데이트
    if (object.userData.audioElement) {
      const audioElement = object.userData.audioElement;
      switch (propertyType) {
        case "volume":
          audioElement.volume = value;
          // THREE.js Audio 객체가 있는 경우에도 볼륨 업데이트
          if (object.userData.audio) {
            object.userData.audio.setVolume(value);
          }
          break;
        case "mute":
          audioElement.muted = value;
          break;
        case "playbackRate":
          audioElement.playbackRate = value;
          break;
      }
    }

    // 속성 값 업데이트
    this.setPropertyValue(object, propertyType, value);

    if (this.editor.signals?.objectChanged) {
      this.editor.signals.objectChanged.dispatch(object);
    }
  }

  addTrack(objectId, trackData) {
    if (this.tracks.has(objectId)) {
      return this.tracks.get(objectId);
    }

    // trackData.element가 있으면 그것을 timeline-track으로 감싸기, 없으면 새로 생성
    let trackElement;
    let trackContent;

    if (trackData.element) {
      // 기존 요소가 있으면 완전히 새로운 요소를 생성하되 기존 데이터를 복사
      console.log(`기존 trackData.element 사용하여 새로 생성:`, trackData.element);
      trackElement = document.createElement("div");
      trackElement.className = "timeline-track";
      trackElement.dataset.objectId = objectId;

      // 기존 audio-tracks 요소의 내용을 기반으로 새로운 요소 생성
      const existingElement = trackData.element;
      trackContent = document.createElement("div");
      trackContent.className = "audio-tracks";

      // track-header 복사
      const existingHeader = existingElement.querySelector('.track-header');
      if (existingHeader) {
        const newHeader = existingHeader.cloneNode(true);

        // 삭제 버튼 추가
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-track-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Delete Track';
        deleteBtn.style.cssText = 'background: #ff4444; color: white; border: none; border-radius: 3px; padding: 2px 6px; margin-left: 5px; cursor: pointer;';

        const controlsDiv = newHeader.querySelector('.track-controls');
        if (controlsDiv) {
          controlsDiv.appendChild(deleteBtn);
        }

        trackContent.appendChild(newHeader);
      }

      // track-content와 audio-sprite 복사
      const existingContent = existingElement.querySelector('.track-content');
      if (existingContent) {
        const newContent = existingContent.cloneNode(true);
        trackContent.appendChild(newContent);

        // audio-sprite에 이벤트 바인딩을 위한 데이터 설정
        const sprite = newContent.querySelector('.audio-sprite');
        if (sprite) {
          // 기존 데이터 속성들을 복사
          const originalSprite = existingContent.querySelector('.audio-sprite');
          if (originalSprite) {
            sprite.dataset.duration = originalSprite.dataset.duration || '';
            sprite.dataset.audioPath = originalSprite.dataset.audioPath || '';
            sprite.dataset.audioName = originalSprite.dataset.audioName || '';
          }
        }
      }

      trackElement.appendChild(trackContent);
    } else {
      // 새로운 트랙 생성
      console.log(`새로운 트랙 생성:`, objectId);
      trackElement = document.createElement("div");
      trackElement.className = "timeline-track";
      trackElement.dataset.objectId = objectId;

      trackContent = document.createElement("div");
      trackContent.className = "audio-tracks";

      const trackHeader = document.createElement("div");
      trackHeader.className = "track-header";
      trackHeader.innerHTML = `
        <div class="track-info">
          <span class="track-name">${typeof trackData.name === "object"
          ? trackData.name.name || "Audio"
          : trackData.name
        }</span>
        </div>
        <div class="track-controls">
          <button class="add-keyframe-btn" title="Add Keyframe" style="display: none;">+</button>
          <button class="delete-track-btn" title="Delete Track" style="background: #ff4444; color: white; border: none; border-radius: 3px; padding: 2px 6px; margin-left: 5px; cursor: pointer;">×</button>
        </div>
      `;
      trackContent.appendChild(trackHeader);

      // 오디오 스프라이트 생성
      const object = this.getTrackSceneObject({ objectId, element: trackElement }) || this.editor.scene.getObjectById(parseInt(objectId, 10));
      if (object && object.userData.audioElement) {
        const audioElement = object.userData.audioElement;
        const duration = audioElement.duration || 0;
        const totalFrames = Math.floor(duration * this.options.framesPerSecond);

        const trackContentArea = document.createElement("div");
        trackContentArea.className = "track-content";

        const sprite = document.createElement("div");
        sprite.className = "audio-sprite";
        sprite.dataset.duration = duration;
        sprite.innerHTML = `
          <div class="sprite-handle left"></div>
          <div class="sprite-content">
            <span class="sprite-name">${typeof trackData.name === "object" ? trackData.name.name : trackData.name}</span>
            <canvas class="waveform-canvas" height="16"></canvas>
          </div>
          <div class="sprite-handle right"></div>
        `;

        // trackData의 속성값을 사용해서 클립 위치와 크기 설정
        const startTime = trackData.startTime || 0;
        const clipDuration = trackData.duration || duration;
        const totalSeconds = this.options.totalSeconds || 300; // 기본값 5분

        const spriteWidth = (clipDuration / totalSeconds) * 100;
        const spriteLeft = (startTime / totalSeconds) * 100;

        sprite.style.width = `${spriteWidth}%`;
        sprite.style.left = `${spriteLeft}%`;

        console.log(`🎯 클립 위치/크기 설정:`, {
          startTime,
          clipDuration,
          totalSeconds,
          spriteWidth: `${spriteWidth}%`,
          spriteLeft: `${spriteLeft}%`
        });

        trackContentArea.appendChild(sprite);
        trackContent.appendChild(trackContentArea);

        // sprite에 필요한 데이터 속성 설정
        sprite.dataset.startTime = startTime.toString();
        sprite.dataset.duration = clipDuration.toString();
        sprite.dataset.audioPath = object.userData.audioPath || '';
        sprite.dataset.audioName = typeof trackData.name === "object" ? trackData.name.name : trackData.name;

        // 오디오 객체에 기본 속성 설정
        if (object.userData) {
          object.userData.startTime = startTime;
          object.userData.duration = clipDuration;
          object.userData.volume = trackData.volume !== undefined ? trackData.volume : 1.0;
          object.userData.mute = trackData.mute !== undefined ? trackData.mute : false;
          object.userData.playbackRate = trackData.playbackRate !== undefined ? trackData.playbackRate : 1.0;
        }

        // 파장을 그릴 캔버스 추가
        const waveformCanvas = document.createElement("canvas");
        waveformCanvas.className = "waveform-canvas";
        waveformCanvas.height = 26;

        // sprite-content에 파장 캔버스 추가
        const spriteContent = sprite.querySelector('.sprite-content');
        if (spriteContent) {
          spriteContent.appendChild(waveformCanvas);
        }

        // 파형 그리기
        if (object.userData.audioPath) {
          this.drawWaveform(waveformCanvas, object.userData.audioPath);
        }
      }

      trackElement.appendChild(trackContent);
    }

    // track 객체 생성
    const track = {
      element: trackElement,
      keyframes: {
        volume: new Map(),
        mute: new Map(),
        playbackRate: new Map(),
      },
      objectId: objectId,
      objectName: trackData.name || trackData,
      audioElement: trackData.audioElement || null,
      volume: trackData.volume !== undefined ? trackData.volume : 1.0,
      mute: trackData.mute !== undefined ? trackData.mute : false,
      playbackRate: trackData.playbackRate !== undefined ? trackData.playbackRate : 1.0,
    };

    // 이제 track 객체가 완성되었으므로 sprite에 이벤트 바인딩
    if (!trackData.element) {
      // 새로운 트랙의 경우
      const sprite = trackContent.querySelector('.audio-sprite');
      if (sprite) {
        this.bindSpriteEvents(sprite, track);
        // 편집 모드가 활성화되어 있으면 리사이즈 핸들 추가
        if (this.isEditMode) {
          this.addResizeHandles(sprite);
        }
      }
    } else {
      // 기존 요소에서 복사한 경우
      const sprite = trackContent.querySelector('.audio-sprite');
      if (sprite) {
        this.bindSpriteEvents(sprite, track);
        // 편집 모드가 활성화되어 있으면 리사이즈 핸들 추가
        if (this.isEditMode) {
          this.addResizeHandles(sprite);
        }
      }
    }

    this.tracks.set(objectId, track);
    console.log(`트랙 ${objectId}를 tracks에 추가했습니다.`);
    console.log(`현재 tracks 크기:`, this.tracks.size);

    console.log(`트랙 ${objectId}를 container에 추가 중...`);
    console.log(`container:`, this.container);
    console.log(`container 클래스:`, this.container?.className);
    console.log(`container 부모:`, this.container?.parentElement);
    console.log(`track.element:`, track.element);

    const host = this.getAudioTracksContainer();
    if (host) {
      host.appendChild(track.element);
    }
    console.log(`트랙 ${objectId}가 container에 추가되었습니다.`);
    console.log(`container 자식 요소 수:`, this.container.children.length);

    console.log(`트랙 ${objectId}에 이벤트 바인딩 시작...`);
    this.bindTrackEvents(track);
    console.log(`트랙 ${objectId} 이벤트 바인딩 완료`);

    // 트랙 삭제 버튼 이벤트 확인
    const deleteBtn = track.element.querySelector('.delete-track-btn');
    if (deleteBtn) {
      console.log(`트랙 ${objectId} 삭제 버튼 발견:`, deleteBtn);
    } else {
      console.log(`트랙 ${objectId} 삭제 버튼 없음`);
    }

    return track;
  }

  // 오디오 트랙 전용 이벤트 바인딩
  bindTrackEvents(track) {
    if (!track || !track.objectId) {
      console.warn("트랙 또는 트랙의 objectId가 없습니다:", track);
      return;
    }

    // 삭제 버튼 이벤트
    const deleteBtn = track.element.querySelector(".delete-track-btn");
    if (deleteBtn) {
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        const id = track.element?.dataset?.objectId || track.objectId;
        console.log(`트랙 ${id} 삭제 버튼 클릭됨`);

        if (confirm(`트랙 "${track.objectName}"을 삭제하시겠습니까?`)) {
          this._removeTrackInternal(id);
        }
      };
    }

    // 키프레임 추가 버튼 이벤트
    const addBtn = track.element.querySelector(".add-keyframe-btn");
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentFrame = this.currentFrame;
        console.log(`트랙 ${track.objectId} 키프레임 추가 버튼 클릭됨, 현재 프레임: ${currentFrame}`);
      });
    }

    // 트랙 클릭 이벤트 (속성 패널 표시용)
    track.element.addEventListener("click", (e) => {
      if (e.target.closest('.delete-track-btn') || e.target.closest('.add-keyframe-btn')) {
        return; // 버튼 클릭은 무시
      }

      console.log(`트랙 ${track.objectId} 클릭됨`);
      this.selectTrack(track.objectId);
    });
  }

  // 트랙 삭제 메서드
  deleteTrack(objectId) {
    return this._removeTrackInternal(objectId);
  }

  // 트랙 선택 메서드 (속성 패널 표시용)
  selectTrack(objectId) {
    const mapKey = this.resolveTrackMapKey(objectId);
    console.log(`트랙 ${mapKey} 선택됨`);

    // 모든 트랙의 선택 상태 해제
    this.tracks.forEach((track, id) => {
      if (track.element) {
        track.element.classList.remove('selected');
      }
    });

    // 모든 오디오 스프라이트의 선택 상태 해제
    document.querySelectorAll('.audio-sprite').forEach(sprite => {
      sprite.classList.remove('selected');
    });

    // 현재 트랙 선택
    const track = mapKey ? this.tracks.get(mapKey) : null;
    if (track && track.element) {
      track.element.classList.add('selected');

      // 🔧 오디오 스프라이트도 선택 상태로 만들기
      const audioSprite = track.element.querySelector('.audio-sprite');
      if (audioSprite) {
        audioSprite.classList.add('selected');
        console.log(`🎯 오디오 스프라이트 선택됨: ${mapKey}`);
        
        // 🔧 선택된 클립의 input 필드 업데이트
        const audioObject = this.getTrackSceneObject(track);
        if (audioObject) {
          const startTime = parseFloat(audioSprite.dataset.startTime) || 0;
          const duration = parseFloat(audioSprite.dataset.duration) || 0;
          const audioStartTime = audioObject.userData.audioStartTime || 0;
          const audioEndTime = audioObject.userData.audioEndTime || (audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : audioStartTime + duration);
          
          // input 필드 업데이트
          this.updateInputFields(audioStartTime, audioEndTime);
          this.updateClipInputFields(startTime, duration);
          
          console.log(`✅ 선택된 클립 input 필드 업데이트 완료:`, {
            startTime,
            duration,
            audioStartTime,
            audioEndTime
          });
        }

        // 타임라인 맞춤 버튼 상태 업데이트
        this.updateTimelineFitButtonState();
      }

      // 속성 패널에 트랙 정보 표시
      this.showTrackProperties(mapKey);
    }
  }

  // 트랙 속성 표시 메서드
  showTrackProperties(objectId) {
    const track = this.getTrackByAnyId(objectId) || this.tracks.get(objectId);
    if (!track) return;

    const object = this.getTrackSceneObject(track);
    if (!object) return;

    console.log(`트랙 ${objectId} 속성 표시:`, {
      name: track.objectName,
      volume: object.userData.volume || 1,
      mute: object.userData.mute || false,
      playbackRate: object.userData.playbackRate || 1
    });

    // 여기서 속성 패널을 업데이트하는 로직을 추가할 수 있습니다
  }

  // 편집 모드 UI 동기화
  applyEditModeUI() {
    if (!this.editModeButton) return;

    if (this.isEditMode) {
      this.editModeButton.textContent = "편집 ON";
      this.editModeButton.classList.add("is-active");
      this.enableClipEditMode();
    } else {
      this.editModeButton.textContent = "편집";
      this.editModeButton.classList.remove("is-active");
      this.disableClipEditMode();
    }
  }

  // 편집 모드 토글 메서드
  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    this.applyEditModeUI();
  }

  // 클립 편집 모드 활성화
  enableClipEditMode() {
    console.log("클립 편집 모드 활성화");
    
    // 모든 오디오 스프라이트에 리사이즈 핸들 추가
    document.querySelectorAll('.audio-sprite').forEach(sprite => {
      this.addResizeHandles(sprite);
    });
  }

  // 클립 편집 모드 비활성화
  disableClipEditMode() {
    console.log("클립 편집 모드 비활성화");
    
    // 모든 리사이즈 핸들 제거
    document.querySelectorAll('.resize-handle').forEach(handle => {
      handle.remove();
    });
  }

  // 리사이즈 핸들 추가
  addResizeHandles(sprite) {
    // 이미 핸들이 있으면 제거
    sprite.querySelectorAll('.resize-handle').forEach(handle => handle.remove());

    // 왼쪽 핸들 (시작 지점 조정)
    const leftHandle = document.createElement('div');
    leftHandle.className = 'resize-handle resize-handle-left';
    leftHandle.title = '시작 지점 조정';

    // 오른쪽 핸들 (끝 지점 조정)
    const rightHandle = document.createElement('div');
    rightHandle.className = 'resize-handle resize-handle-right';
    rightHandle.title = '끝 지점 조정';

    // 핸들 이벤트 바인딩
    this.bindResizeHandleEvents(leftHandle, sprite, 'left');
    this.bindResizeHandleEvents(rightHandle, sprite, 'right');

    // 스프라이트에 핸들 추가
    sprite.appendChild(leftHandle);
    sprite.appendChild(rightHandle);
  }

  // 리사이즈 핸들 이벤트 바인딩
  bindResizeHandleEvents(handle, sprite, side) {
    let isResizing = false;
    let startX = 0;
    let startLeft = 0;
    let startWidth = 0;
    let startTime = 0;
    let startDuration = 0;
    let originalAudioStartTime = 0;
    let originalAudioEndTime = 0;

    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isResizing = true;
      startX = e.clientX;
      
      const spriteRect = sprite.getBoundingClientRect();
      const container = sprite.closest('.timeline-viewport');
      const containerRect = container.getBoundingClientRect();
      
      startLeft = parseFloat(sprite.style.left) || 0;
      startWidth = parseFloat(sprite.style.width) || 0;
      startTime = parseFloat(sprite.dataset.startTime) || 0;
      startDuration = parseFloat(sprite.dataset.duration) || 0;

      // 드래그 시작 시점의 원본 오디오 시간 저장
      const track = this.findTrackBySprite(sprite);
      if (track) {
        const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
        if (audioObject) {
          originalAudioStartTime = audioObject.userData.audioStartTime || 0;
          originalAudioEndTime = audioObject.userData.audioEndTime || (audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : originalAudioStartTime + startDuration);
        }
      }

      handle.style.opacity = '1';
      document.body.style.cursor = 'ew-resize';
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const container = sprite.closest('.timeline-viewport');
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const totalSeconds = this.getTotalSeconds();

      const deltaX = e.clientX - startX;
      const deltaPercent = (deltaX / containerWidth) * 100;

      if (side === 'left') {
        // 왼쪽 핸들: 클립 시작 위치와 오디오 시작 시간 조정
        const track = this.findTrackBySprite(sprite);
        if (track) {
          const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
          if (audioObject) {
            // 새로운 클립 시작 위치 계산
            const newClipLeft = Math.max(0, startLeft + deltaPercent);
            const newClipStartTime = (newClipLeft / 100) * totalSeconds;
            
            // 클립 너비는 원본에서 변화량만큼 줄어듦
            const newClipWidth = Math.max(10, startWidth - deltaPercent); // 최소 10% 유지
            const newClipDuration = (newClipWidth / 100) * totalSeconds;
            
            // 오디오 시간 조정 - 클립 시작 시간 변화에 따라 오디오 시작 시간도 조정
            const timeDifference = newClipStartTime - startTime;
            const newAudioStartTime = Math.max(0, originalAudioStartTime + timeDifference);
            const newAudioEndTime = Math.min(
              audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : originalAudioEndTime,
              newAudioStartTime + newClipDuration
            );
            
            // 클립 위치와 크기 업데이트
            sprite.style.left = `${newClipLeft}%`;
            sprite.style.width = `${newClipWidth}%`;
            sprite.dataset.startTime = newClipStartTime.toString();
            sprite.dataset.duration = newClipDuration.toString();
            
            // 오디오 시작/끝 시간 업데이트
            audioObject.userData.audioStartTime = newAudioStartTime;
            audioObject.userData.audioEndTime = newAudioEndTime;
            
            // input 필드 실시간 업데이트
            this.updateInputFields(newAudioStartTime, newAudioEndTime);
            this.updateClipInputFields(newClipStartTime, newClipDuration);
          }
        }
        
      } else if (side === 'right') {
        // 오른쪽 핸들: 클립 끝 위치와 오디오 끝 시간 조정
        const track = this.findTrackBySprite(sprite);
        if (track) {
          const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
          if (audioObject) {
            // 새로운 클립 너비 계산 (최소 10% 유지)
            const newClipWidth = Math.max(10, startWidth + deltaPercent);
            const newClipDuration = (newClipWidth / 100) * totalSeconds;
            
            // 오디오 끝 시간 계산 - 클립 길이 변화에 따라 조정
            const newAudioEndTime = Math.min(
              audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : originalAudioEndTime + newClipDuration,
              originalAudioStartTime + newClipDuration
            );
            
            // 클립 크기 업데이트 (위치는 그대로)
            sprite.style.width = `${newClipWidth}%`;
            sprite.dataset.duration = newClipDuration.toString();
            
            // 오디오 시작/끝 시간 업데이트
            audioObject.userData.audioStartTime = originalAudioStartTime;
            audioObject.userData.audioEndTime = newAudioEndTime;
            
            // input 필드 실시간 업데이트
            this.updateInputFields(originalAudioStartTime, newAudioEndTime);
            this.updateClipInputFields(startTime, newClipDuration);
          }
        }
      }
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        handle.style.opacity = '0.8';
        document.body.style.cursor = '';
        
        // 최종 업데이트
        const track = this.findTrackBySprite(sprite);
        if (track) {
          this.updateClipInputFields(
            parseFloat(sprite.dataset.startTime),
            parseFloat(sprite.dataset.duration)
          );
        }
      }
    });
  }

  // 스프라이트로부터 오디오 객체 업데이트
  updateAudioObjectFromSprite(sprite, startTime, duration) {
    const track = this.findTrackBySprite(sprite);
    if (!track) return;

    const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
    if (!audioObject) return;

    audioObject.userData.startTime = startTime;
    audioObject.userData.duration = duration;

    // input 필드 실시간 업데이트
    const audioStartTime = audioObject.userData.audioStartTime || 0;
    const audioEndTime = audioObject.userData.audioEndTime || (audioStartTime + duration);
    
    this.updateInputFields(audioStartTime, audioEndTime);
    this.updateClipInputFields(startTime, duration);
  }

  // 스프라이트로부터 트랙 찾기
  findTrackBySprite(sprite) {
    for (const [objectId, track] of this.tracks) {
      if (track.element && track.element.contains(sprite)) {
        return track;
      }
    }
    return null;
  }

  formatPropertyName(propertyType) {
    const names = {
      volume: "Volume",
      mute: "Mute",
      playbackRate: "Playback Rate",
    };
    return names[propertyType] || propertyType;
  }

  createPropertyTrack(objectId, propertyType) {
    const propertyTrack = document.createElement("div");
    propertyTrack.className = "property-track";
    propertyTrack.dataset.objectId = objectId;
    propertyTrack.dataset.property = propertyType;

    const propertyHeader = document.createElement("div");
    propertyHeader.className = "property-header";
    propertyHeader.innerHTML = `
      <span>${this.formatPropertyName(propertyType)}</span>
      <button class="add-keyframe-btn" title="Add Keyframe">+</button>
    `;

    const keyframesContainer = document.createElement("div");
    keyframesContainer.className = "keyframe-layer";

    propertyTrack.appendChild(propertyHeader);
    propertyTrack.appendChild(keyframesContainer);

    // 키프레임 추가 버튼 이벤트
    const addKeyframeBtn = propertyHeader.querySelector(".add-keyframe-btn");
    addKeyframeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const currentFrame = Math.floor(this.currentFrame);
      const relativePlayheadPosition =
        (currentFrame /
          (this.options.totalSeconds * this.options.framesPerSecond)) *
        100;

      // 키프레임 요소 생성
      const keyframeElement = document.createElement("div");
      keyframeElement.className = "keyframe";
      keyframeElement.style.left = `${relativePlayheadPosition}%`;
      keyframeElement.dataset.frame = currentFrame.toString();

      // 현재 속성 값 가져오기
      const object = this.editor.scene.getObjectById(parseInt(objectId));
      const value = this.getPropertyValue(object, propertyType);

      // 키프레임 데이터 저장
      const track = this.tracks.get(objectId);
      if (!track.keyframes[propertyType]) {
        track.keyframes[propertyType] = new Map();
      }
      track.keyframes[propertyType].set(currentFrame, {
        value: value,
        element: keyframeElement,
      });

      // 키프레임을 레이어에 추가
      // keyframesContainer.appendChild(keyframeElement);

      // 키프레임 드래그 이벤트 설정
      this.makeKeyframeDraggable(keyframeElement, track, currentFrame, object);

      // 키프레임 선택 이벤트 바인딩
      this.bindKeyframeEvents(
        keyframeElement,
        objectId,
        propertyType,
        currentFrame
      );
    });

    return propertyTrack;
  }

  // CSS 스타일도 추가
  addStyle() {
    const style = document.createElement("style");
    style.textContent = `
      .property-track {
        position: relative;
        height: 24px;
        margin-bottom: 4px;
        background-color: rgba(0,0,0,0.1);
        border-radius: 4px;
      }

      .property-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 8px;
        height: 100%;
      }

      .keyframe-layer {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }

      .keyframe {
        position: absolute;
        width: 10px;
        height: 10px;
        background-color: #ffd700;
        border-radius: 50%;
        transform: translate(-50%, -50%);
        top: 50%;
        pointer-events: auto;
        cursor: pointer;
      }

      .keyframe.selected {
        background-color: #ff4444;
        border: 2px solid white;
      }

      .keyframe.delete-preview {
        background-color: #ff0000;
        opacity: 0.5;
      }
    `;
    document.head.appendChild(style);
  }

  // 트랙에서 실제 재생 중인 HTMLAudioElement 조회 (scene 객체 없어도 track.audioElement 사용)
  getTrackSceneObject(track) {
    if (!track) return null;

    const idCandidates = [
      track.objectId,
      track.element?.dataset?.objectId,
    ].filter(Boolean);

    for (const id of idCandidates) {
      const audioObject = this.editor.scene.getObjectById(parseInt(id, 10));
      if (audioObject && (audioObject.userData?.type === 'audio' || audioObject.userData?.audioElement)) {
        return audioObject;
      }
    }

    if (track.audioElement) {
      let found = null;
      this.editor.scene.traverse((child) => {
        if (child.userData?.audioElement === track.audioElement) {
          found = child;
        }
      });
      return found;
    }

    return null;
  }

  getTrackAudioElement(track) {
    if (!track) return null;
    if (track.audioElement && typeof track.audioElement.pause === 'function') {
      return track.audioElement;
    }
    const audioObject = this.getTrackSceneObject(track);
    if (audioObject?.userData?.audioElement) {
      track.audioElement = audioObject.userData.audioElement;
      return audioObject.userData.audioElement;
    }
    return null;
  }

  applyMasterVolume(forcedValue) {
    const masterVolume = forcedValue !== undefined
      ? forcedValue
      : (this.editor.scene.userData.audioTimeline?.audioObjects?.masterVolume ?? 1.0);

    this.rebuildTracksFromDOM();

    this.tracks.forEach((track) => {
      const audio = this.getTrackAudioElement(track);
      if (audio) {
        audio.volume = masterVolume;
      }

      const audioObject = this.getTrackSceneObject(track);
      if (audioObject?.userData) {
        audioObject.userData.volume = masterVolume;
        if (audioObject.userData.audio) {
          audioObject.userData.audio.setVolume(masterVolume);
        }
      }
      track.volume = masterVolume;
    });

    // tracks 맵과 무관하게 씬의 모든 오디오 요소에도 적용
    this.editor.scene.traverse((child) => {
      const audioEl = child.userData?.audioElement;
      if (audioEl && typeof audioEl.volume === 'number') {
        audioEl.volume = masterVolume;
        if (child.userData) child.userData.volume = masterVolume;
      }
    });

    if (!this.editor.scene.userData.audioTimeline) {
      this.editor.scene.userData.audioTimeline = { audioObjects: {} };
    }
    if (!this.editor.scene.userData.audioTimeline.audioObjects) {
      this.editor.scene.userData.audioTimeline.audioObjects = {};
    }
    this.editor.scene.userData.audioTimeline.audioObjects.masterVolume = masterVolume;

    if (this._masterVolumeControl && forcedValue === undefined) {
      this._masterVolumeControl.setValue(masterVolume * 100);
    }
  }

  _registerRestorePromise(promise) {
    if (!promise || typeof promise.then !== 'function') return promise;
    if (!this._restorePromises) this._restorePromises = [];
    this._restorePromises.push(promise);
    return promise;
  }

  getRestorePromises() {
    return [...(this._restorePromises || [])];
  }

  rebuildTracksFromDOM() {
    const container = this.getAudioTracksContainer();
    if (!container) return;

    container.querySelectorAll('.timeline-track').forEach((trackEl) => {
      const objectId = trackEl.dataset?.objectId;
      if (!objectId) return;

      const mapKey = this.resolveTrackMapKey(objectId) || String(objectId);
      let track = this.tracks.get(mapKey);

      if (!track) {
        track = {
          element: trackEl,
          keyframes: {
            volume: new Map(),
            mute: new Map(),
            playbackRate: new Map(),
          },
          objectId: String(objectId),
          objectName: trackEl.querySelector('.track-name')?.textContent?.trim() || 'Audio',
        };
        this.tracks.set(mapKey, track);
      } else {
        track.element = trackEl;
        track.objectId = String(objectId);
      }

      const sprite = trackEl.querySelector('.audio-sprite');
      if (sprite?.dataset?.audioPath) {
        track.audioFile = track.audioFile || { path: sprite.dataset.audioPath };
      }

      const audioObject = this.getTrackSceneObject(track);
      if (audioObject?.userData?.audioElement) {
        track.audioElement = audioObject.userData.audioElement;
      }
    });
  }

  rebindAllTrackEvents() {
    this.rebuildTracksFromDOM();
    this.tracks.forEach((track) => {
      if (!track?.element) return;
      this.bindTrackEvents(track);
      const sprite = track.element.querySelector('.audio-sprite');
      if (sprite) {
        this.bindSpriteEvents(sprite, track);
      }
    });
  }

  removeOrphanAudioTrackElements() {
    const container = this.getAudioTracksContainer();
    if (!container) return;

    const seenPaths = new Set();
    const tracks = [...container.querySelectorAll('.timeline-track')].filter(
      (el) => el.querySelector('.audio-sprite'),
    );

    tracks.forEach((trackEl) => {
      const sprite = trackEl.querySelector('.audio-sprite');
      const path = sprite?.dataset?.audioPath;
      const pathKey = path ? this.resolveAudioPlaybackUrl(path) : trackEl.dataset.objectId;
      if (pathKey && seenPaths.has(pathKey)) {
        console.log('중복 오디오 트랙 DOM 제거:', pathKey);
        trackEl.remove();
        return;
      }
      if (pathKey) seenPaths.add(pathKey);
    });
  }

  pauseTrackAudio(track) {
    const audio = this.getTrackAudioElement(track);
    if (audio && !audio.paused) {
      audio.pause();
      audio._playRequested = false;
    }
  }

  stopTrackAudio(track) {
    const audio = this.getTrackAudioElement(track);
    if (audio) {
      if (!audio.paused) audio.pause();
      audio.currentTime = 0;
      audio._playRequested = false;
    }
  }

  // pause 메소드 추가 - 모든 오디오 트랙 일시정지
  pause() {
    console.log("🔇 AudioTimeline pause() 호출됨");

    // 🔧 tracks가 비어있지 않은지 확인
    if (!this.tracks || this.tracks.size === 0) {
      console.log("⚠️ AudioTimeline pause(): tracks가 비어있습니다");
      this.isPlaying = false;
      return;
    }

    console.log(`🔧 AudioTimeline pause(): ${this.tracks.size}개 트랙 일시정지 처리 중...`);

    this.tracks.forEach((track, trackId) => {
      try {
        const audio = this.getTrackAudioElement(track);
        if (audio) {
          if (!audio.paused) {
            audio.pause();
            audio._playRequested = false;
            console.log(`🔇 오디오 트랙 ${trackId} 일시정지됨`);
          }
        } else {
          console.warn(`⚠️ 트랙 ${trackId}의 오디오 요소를 찾을 수 없습니다`);
        }
      } catch (error) {
        console.error(`❌ 트랙 ${trackId} 일시정지 처리 중 오류:`, error);
      }
    });

    // 🔧 scene.userData.audioTimeline.audioObjects도 동기화
    if (this.editor.scene?.userData?.audioTimeline?.audioObjects) {
      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;
      
      Object.values(audioObjects).forEach((audioObj) => {
        if (audioObj.audioElement) {
          try {
            const audio = audioObj.audioElement;
            
            // 🔧 audio가 HTMLAudioElement인지 확인
            if (audio && typeof audio.pause === 'function' && typeof audio.paused !== 'undefined') {
              if (!audio.paused) {
                audio.pause();
                audio._playRequested = false;
                console.log(`🔇 audioObjects의 오디오 ${audioObj.objectId || 'unknown'} 일시정지됨`);
              }
            } else {
              console.warn(`⚠️ audioObj.audioElement가 HTMLAudioElement가 아닙니다:`, audio);
            }
          } catch (error) {
            console.error(`❌ audioObjects 오디오 일시정지 중 오류:`, error);
          }
        }
      });
    }

    // AudioTimeline 자체 상태도 일시정지
    this.isPlaying = false;
    console.log("🔇 AudioTimeline 일시정지 완료");
  }

  // play 메소드 추가 - 모든 오디오 트랙 재생 시작
  play() {
    console.log("🔊 AudioTimeline play() 호출됨");

    // 🔧 tracks가 비어있지 않은지 확인
    if (!this.tracks || this.tracks.size === 0) {
      console.log("⚠️ AudioTimeline play(): tracks가 비어있습니다");
      this.isPlaying = false;
      return;
    }

    console.log(`🔧 AudioTimeline play(): ${this.tracks.size}개 트랙 재생 처리 중...`);

    this.tracks.forEach((track, trackId) => {
      try {
        const audio = this.getTrackAudioElement(track);
        if (audio) {
          if (audio.paused && !audio._playRequested) {
            audio._playRequested = true;
            audio.play().then(() => {
              audio._playRequested = false;
              console.log(`🔊 오디오 트랙 ${trackId} 재생 시작됨`);
            }).catch((error) => {
              console.error(`🔊 오디오 트랙 ${trackId} 재생 실패:`, error);
              audio._playRequested = false;
            });
          }
        } else {
          console.warn(`⚠️ 트랙 ${trackId}의 오디오 요소를 찾을 수 없습니다`);
        }
      } catch (error) {
        console.error(`❌ 트랙 ${trackId} 재생 처리 중 오류:`, error);
      }
    });

    // AudioTimeline 자체 상태도 재생
    this.isPlaying = true;
    console.log("🔊 AudioTimeline 재생 시작 완료");
  }

  // stop 메소드 추가 - 모든 오디오 트랙 정지
  stop() {
    console.log("⏹️ AudioTimeline stop() 호출됨");

    // 🔧 tracks가 비어있지 않은지 확인
    if (!this.tracks || this.tracks.size === 0) {
      console.log("⚠️ AudioTimeline stop(): tracks가 비어있습니다");
      this.isPlaying = false;
      return;
    }

    console.log(`🔧 AudioTimeline stop(): ${this.tracks.size}개 트랙 정지 처리 중...`);

    this.tracks.forEach((track, trackId) => {
      try {
        const audio = this.getTrackAudioElement(track);
        if (audio) {
          if (!audio.paused) {
            audio.pause();
          }
          audio.currentTime = 0;
          audio._playRequested = false;
          console.log(`⏹️ 오디오 트랙 ${trackId} 정지됨`);
        } else {
          console.warn(`⚠️ 트랙 ${trackId}의 오디오 요소를 찾을 수 없습니다`);
        }
      } catch (error) {
        console.error(`❌ 트랙 ${trackId} 정지 처리 중 오류:`, error);
      }
    });

    // 🔧 scene.userData.audioTimeline.audioObjects도 동기화
    if (this.editor.scene?.userData?.audioTimeline?.audioObjects) {
      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;
      
      Object.values(audioObjects).forEach((audioObj) => {
        if (audioObj.audioElement) {
          try {
            const audio = audioObj.audioElement;
            
            // 🔧 audio가 HTMLAudioElement인지 확인
            if (audio && typeof audio.pause === 'function' && typeof audio.paused !== 'undefined') {
              if (!audio.paused) {
                audio.pause();
              }
              audio.currentTime = 0;
              audio._playRequested = false;
              console.log(`⏹️ audioObjects의 오디오 ${audioObj.objectId || 'unknown'} 정지됨`);
            } else {
              console.warn(`⚠️ audioObj.audioElement가 HTMLAudioElement가 아닙니다:`, audio);
            }
          } catch (error) {
            console.error(`❌ audioObjects 오디오 정지 중 오류:`, error);
          }
        }
      });
    }

    // AudioTimeline 자체 상태도 정지
    this.isPlaying = false;
    console.log("⏹️ AudioTimeline 정지 완료");
  }

  // 클래스 소멸자 추가
  dispose() {
    // Blob URL 정리
    this.tracks.forEach((track) => {
      const audioObject = this.editor.scene.getObjectById(parseInt(track.id));
      if (audioObject && audioObject.userData.audioUrl) {
        URL.revokeObjectURL(audioObject.userData.audioUrl);
      }
    });
  }

  // 프로젝트 저장 시 오디오 데이터 저장
  onBeforeSave() {
    try {
      console.log("=== AudioTimeline onBeforeSave 시작 ===");

      // scene.userData에 현재 상태 저장
      if (this.editor.scene) {
        const audioTimelineData = {
          tracks: {},
          currentTime: this.currentTime || 0,
          frameRate: this.frameRate || 30,
          audioObjects: {}, // 개별 오디오 객체들의 메타데이터
          masterVolume: 1.0 // 마스터 볼륨
        };

        console.log("현재 this.tracks 상태:", this.tracks);
        console.log("this.tracks 크기:", this.tracks.size);
        console.log("this.tracks 키들:", Array.from(this.tracks.keys()));

        // 각 오디오 트랙의 데이터 수집 (동기적으로)
        this.tracks.forEach((track, trackId) => {
          console.log(`트랙 ${trackId} 처리 중:`, track);

          if (track.element) {
            const audioSprite = track.element.querySelector('.audio-sprite');
            if (audioSprite) {
              // 오디오 파일 경로 및 메타데이터 저장 (blob URL 제외, 원본 경로 우선)
              const audioPath = this.getPersistentAudioPath(trackId, audioSprite, track);
              const audioName = audioSprite.dataset.audioName;
              const startTime = parseFloat(audioSprite.dataset.startTime || 0);
              const duration = parseFloat(audioSprite.dataset.duration || 0);
              const volume = parseFloat(audioSprite.dataset.volume || 1.0);

              console.log(`트랙 ${trackId} 데이터 수집:`, {
                audioPath,
                audioName,
                startTime,
                duration,
                volume
              });

              // 오디오 객체 찾기
              const object = this.getTrackSceneObject(track) || this.editor.scene.getObjectById(parseInt(trackId, 10));
              const objectUserData = object && object.userData ? {
                startTime: object.userData.startTime || 0,
                duration: object.userData.duration || duration,
                volume: object.userData.volume || 1.0,
                mute: object.userData.mute || false,
                playbackRate: object.userData.playbackRate || 1.0
              } : {
                startTime: 0,
                duration: duration,
                volume: 1.0,
                mute: false,
                playbackRate: 1.0
              };

              // 즉시 tracks 데이터에 추가 (Base64 인코딩 없이)
              audioTimelineData.tracks[trackId] = {
                audioPath: audioPath,
                audioName: audioName,
                startTime: startTime,
                duration: duration,
                volume: volume,
                audioData: null, // Base64 인코딩은 나중에 처리
                left: parseFloat(audioSprite.style.left) || 0,
                width: parseFloat(audioSprite.style.width) || 100,
                // 오디오 객체의 userData도 저장
                objectUserData: objectUserData
              };

              console.log(`✅ 오디오 트랙 ${trackId} 저장 완료:`, audioTimelineData.tracks[trackId]);

              // 저장된 데이터 상세 확인
              console.log(`🔍 저장된 데이터 상세:`, {
                trackId,
                audioPath,
                audioName,
                startTime,
                duration,
                volume,
                left: parseFloat(audioSprite.style.left) || 0,
                width: parseFloat(audioSprite.style.width) || 100,
                objectUserData: objectUserData
              });
            }
          }
        });

        // this.tracks가 비어있다면 tracks 데이터는 생성하지 않음
        if (this.tracks.size === 0) {
          console.log("🔍 this.tracks가 비어있습니다. tracks 데이터를 생성하지 않습니다.");
        }

        // audioObjects를 완전히 새로 생성 (기존 데이터 복사하지 않음)
        audioTimelineData.audioObjects = {
          masterVolume: 1.0
        };

        // 현재 트랙에서 사용 중인 오디오 파일 정보만 audioObjects에 추가
        const usedAudioFiles = new Set();
        this.tracks.forEach((track, trackId) => {
          if (track.element) {
            const audioSprite = track.element.querySelector('.audio-sprite');
            if (audioSprite && audioSprite.dataset.audioPath) {
              const audioPath = audioSprite.dataset.audioPath;
              if (!usedAudioFiles.has(audioPath)) {
                usedAudioFiles.add(audioPath);

                // 오디오 파일 정보를 audioObjects에 추가
                const audioName = audioSprite.dataset.audioName || 'Unknown';
                const displayName = audioSprite.dataset.audioName || audioName;

                audioTimelineData.audioObjects[trackId] = {
                  objectId: trackId, // objectId 추가
                  audioFile: {
                    path: audioPath,
                    name: audioName,
                    displayName: displayName
                  },
                  startTime: parseFloat(audioSprite.dataset.startTime || 0),
                  duration: parseFloat(audioSprite.dataset.duration || 0),
                  volume: parseFloat(audioSprite.dataset.volume || 1.0),
                  mute: false,
                  playbackRate: 1.0
                };

                console.log(`✅ audioObjects에 오디오 파일 추가: ${trackId}`, audioTimelineData.audioObjects[trackId]);
              }
            }
          }
        });

        console.log(`🔍 새로 생성된 audioObjects:`, audioTimelineData.audioObjects);
        console.log(`🔍 기존 audioTimeline.audioObjects:`, this.editor.scene.userData.audioTimeline?.audioObjects);

        console.log(`🔍 audioObjects에 추가된 오디오 파일 개수: ${Object.keys(audioTimelineData.audioObjects).length - 1}`); // masterVolume 제외

        // 즉시 데이터 저장 (동기적으로)
        // 데이터 크기 확인 및 제한
        const dataString = JSON.stringify(audioTimelineData);
        const maxDataSize = 10 * 1024 * 1024; // 10MB 제한

        if (dataString.length > maxDataSize) {
          console.warn(`⚠️ audioTimeline 데이터가 너무 큽니다: ${(dataString.length / 1024 / 1024).toFixed(2)}MB > 10MB`);
          console.warn(`Base64 데이터를 제거하고 경로만 저장합니다.`);
        }

        // audioTimeline에 통합된 데이터 저장
        this.editor.scene.userData.audioTimeline = audioTimelineData;

        // 기존 audio 키는 제거 (통합 완료)
        if (this.editor.scene.userData.audio) {
          delete this.editor.scene.userData.audio;
          console.log("기존 audio 키를 제거했습니다 (audioTimeline으로 통합 완료).");
        }

        console.log("=== 최종 저장 데이터 ===");
        console.log("audioTracks 개수:", Object.keys(audioTimelineData.tracks).length);
        console.log("audioTracks 키들:", Object.keys(audioTimelineData.tracks));
        console.log("audioTracks 상세 데이터:", audioTimelineData.tracks);
        console.log("audioObjects 개수:", Object.keys(audioTimelineData.audioObjects || {}).length);
        console.log("audioObjects 상세 데이터:", audioTimelineData.audioObjects);
        console.log("데이터 크기:", (JSON.stringify(audioTimelineData).length / 1024 / 1024).toFixed(2), "MB");
        console.log("scene.userData.audioTimeline 설정 완료");

        // 저장된 데이터가 실제로 scene.userData에 설정되었는지 확인
        console.log("🔍 scene.userData.audioTimeline 확인:", this.editor.scene.userData.audioTimeline);
        console.log("🔍 scene.userData.audioTimeline.tracks 확인:", this.editor.scene.userData.audioTimeline?.tracks);

        console.log("=== AudioTimeline onBeforeSave 완료 ===");
      }
    } catch (error) {
      console.error("AudioTimeline onBeforeSave 실행 중 오류:", error);
    }
  }

  // 오디오 파일을 Base64로 인코딩
  async encodeAudioToBase64(audioPath) {
    try {
      if (!audioPath) return null;

      // 상대 경로를 절대 경로로 변환
      const absolutePath = new URL(audioPath, window.location.href).href;

      // 오디오 파일을 Blob으로 가져오기
      const response = await fetch(absolutePath);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const audioBlob = await response.blob();

      // 파일 크기 제한 (5MB)
      const maxSize = 5 * 1024 * 1024; // 5MB
      if (audioBlob.size > maxSize) {
        console.warn(`⚠️ 오디오 파일이 너무 큽니다: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB > 5MB`);
        console.warn(`경로만 저장하고 Base64 데이터는 저장하지 않습니다.`);
        return null;
      }

      // FileReader를 사용하여 Base64로 변환
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('FileReader failed'));
        reader.readAsDataURL(audioBlob);
      });
    } catch (error) {
      console.error(`오디오 파일 인코딩 실패: ${audioPath}`, error);
      return null;
    }
  }

  // 프로젝트 로드 시 오디오 데이터 복원
  onAfterLoad(force = false) {
    if (this._onAfterLoadCalled && !force) {
      return;
    }
    this._onAfterLoadCalled = true;
    this._audioRestoreGeneration = (this._audioRestoreGeneration || 0) + 1;
    const restoreGeneration = this._audioRestoreGeneration;
    this._restorePromises = [];

    console.log("=== AudioTimeline onAfterLoad 시작 ===");

    try {
      // scene.userData에서 audioTimeline 데이터 확인
      if (this.editor.scene && this.editor.scene.userData && this.editor.scene.userData.audioTimeline) {
        console.log("scene.userData.audioTimeline 데이터 발견:", this.editor.scene.userData.audioTimeline);

        const timelineData = this.editor.scene.userData.audioTimeline;

        // 기존 UI/트랙 정리 후 복원 (중복 방지)
        this.clearAllTracks();
        this.clearSceneAudioObjects();
        this._audioRestorePending = false;

        // 저장된 오디오 트랙 복원
        if (timelineData.tracks && Object.keys(timelineData.tracks).length > 0) {
          this._audioRestorePending = true;
          console.log("저장된 오디오 트랙 개수:", Object.keys(timelineData.tracks).length);
          console.log("저장된 tracks 데이터:", timelineData.tracks);

          const restoredPaths = new Set();

          Object.entries(timelineData.tracks).forEach(([trackId, trackData]) => {
            const path = trackData.audioPath || trackData.audioFile?.path;
            const pathKey = path ? this.resolveAudioPlaybackUrl(path) : String(trackId);
            if (pathKey && restoredPaths.has(pathKey)) {
              console.log(`중복 오디오 경로 복원 스킵: ${pathKey}`);
              return;
            }
            if (pathKey) restoredPaths.add(pathKey);

            console.log(`🔍 오디오 트랙 복원 중: ${trackId}`, trackData);
            console.log(`🔍 trackData 상세:`, {
              audioPath: trackData.audioPath,
              startTime: trackData.startTime,
              duration: trackData.duration,
              left: trackData.left,
              width: trackData.width,
              objectUserData: trackData.objectUserData
            });

            // Base64 데이터가 있으면 Blob으로 변환하여 오디오 파일 생성
            if (trackData.audioData) {
              this.restoreAudioFromBase64(trackId, trackData);
            } else if (trackData.audioPath) {
              // Base64 데이터가 없으면 경로로 복원 (기존 방식)
              this._registerRestorePromise(
                this.restoreAudioFromPath(trackId, trackData, restoreGeneration)
              );
            }
          });
        } else {
          console.log("저장된 tracks 데이터가 없습니다. audioObjects에서 트랙을 복원합니다.");

          // audioObjects에서 오디오 파일 정보를 찾아서 트랙 복원
          if (timelineData.audioObjects) {
            console.log(`🔍 audioObjects에서 트랙 복원 시작, 총 ${Object.keys(timelineData.audioObjects).length}개`);

            // 모든 audioObjects를 순회하며 트랙 복원
            Object.entries(timelineData.audioObjects).forEach(([objectId, audioData]) => {
              console.log(`🔍 audioObject 처리 중: ${objectId}`, audioData);

              // 기본적인 오디오 데이터가 있는지 확인
              if (audioData.audioFile && audioData.audioFile.path) {
                console.log(`🔍 ${objectId} 객체로 트랙 복원 시작`);

                // 1. 저장된 오디오 데이터로 loadAudioFile 직접 호출
                const audioFile = {
                  path: audioData.audioFile.path,
                  name: audioData.audioFile.name,
                  displayName: audioData.audioFile.displayName,
                  // 저장된 트랙 데이터를 originalTrackData로 전달
                  originalTrackData: {
                    startTime: audioData.startTime !== undefined ? audioData.startTime : 0,
                    duration: audioData.duration !== undefined ? audioData.duration : 100,
                    volume: audioData.volume !== undefined ? audioData.volume : 1.0,
                    mute: audioData.mute !== undefined ? audioData.mute : false,
                    playbackRate: audioData.playbackRate !== undefined ? audioData.playbackRate : 1.0,
                    audioStartTime: audioData.audioStartTime !== undefined ? audioData.audioStartTime : 0,
                    audioEndTime: audioData.audioEndTime !== undefined ? audioData.audioEndTime : (audioData.duration || 100)
                  }
                };

                console.log(`🔍 구성된 audioFile:`, audioFile);

                // 2. loadAudioFile 직접 호출 (addAudioFromAsset 건너뛰기)
                this._registerRestorePromise(
                  this.loadAudioFile(audioFile).then((track) => {
                  console.log(`✅ loadAudioFile 완료, 생성된 트랙:`, track);

                  // 3. addTrack은 loadAudioFile 내부에서 자동 호출됨

                  // 4. 저장된 속성들을 바로 복원 (UI 업데이트 메서드들)
                  if (track && track.element) {
                    const audioSprite = track.element.querySelector('.audio-sprite');
                    if (audioSprite) {
                      console.log(`🔍 오디오 스프라이트 발견, 속성 복원 시작`);

                      // 위치/크기 복원
                      const safeTotalSeconds = Number(this?.options?.totalSeconds) || Number(this?.editor?.scene?.userData?.timeline?.totalSeconds) || 300;
                      if (audioData.startTime !== undefined) {
                        const left = (audioData.startTime / safeTotalSeconds) * 100;
                        audioSprite.style.left = `${left}%`;
                        audioSprite.dataset.startTime = audioData.startTime.toString();
                        console.log(`📍 startTime 복원: ${audioData.startTime} -> left: ${left}%`);
                      }

                      if (audioData.duration !== undefined) {
                        const width = (audioData.duration / safeTotalSeconds) * 100;
                        audioSprite.style.width = `${width}%`;
                        audioSprite.dataset.duration = audioData.duration.toString();
                        console.log(`📏 duration 복원: ${audioData.duration} -> width: ${width}%`);
                      }

                      // 볼륨 등 기타 속성 복원
                      if (audioData.volume !== undefined) {
                        audioSprite.dataset.volume = audioData.volume.toString();
                        console.log(`🔊 volume 복원: ${audioData.volume}`);
                      }

                      if (audioData.mute !== undefined) {
                        audioSprite.dataset.mute = audioData.mute.toString();
                        console.log(`🔇 mute 복원: ${audioData.mute}`);
                      }

                      if (audioData.playbackRate !== undefined) {
                        audioSprite.dataset.playbackRate = audioData.playbackRate.toString();
                        console.log(`⏩ playbackRate 복원: ${audioData.playbackRate}`);
                      }

                      if (audioData.audioStartTime !== undefined) {
                        audioSprite.dataset.audioStartTime = audioData.audioStartTime.toString();
                        console.log(`🎵 audioStartTime 복원: ${audioData.audioStartTime}`);
                      }

                      if (audioData.audioEndTime !== undefined) {
                        audioSprite.dataset.audioEndTime = audioData.audioEndTime.toString();
                        console.log(`🎵 audioEndTime 복원: ${audioData.audioEndTime}`);
                      }

                      // 오디오 객체의 userData도 복원
                      const object = this.editor.scene.getObjectById(parseInt(track.objectId || track.id));
                      if (object && object.userData) {
                        if (audioData.startTime !== undefined) {
                          object.userData.startTime = audioData.startTime;
                        }
                        if (audioData.duration !== undefined) {
                          object.userData.duration = audioData.duration;
                        }
                        if (audioData.volume !== undefined) {
                          object.userData.volume = audioData.volume;
                        }
                        if (audioData.mute !== undefined) {
                          object.userData.mute = audioData.mute;
                        }
                        if (audioData.playbackRate !== undefined) {
                          object.userData.playbackRate = audioData.playbackRate;
                        }
                        if (audioData.audioStartTime !== undefined) {
                          object.userData.audioStartTime = audioData.audioStartTime;
                        }
                        if (audioData.audioEndTime !== undefined) {
                          object.userData.audioEndTime = audioData.audioEndTime;
                        }

                        console.log(`🎵 오디오 객체 userData 복원 완료:`, {
                          startTime: object.userData.startTime,
                          duration: object.userData.duration,
                          volume: object.userData.volume,
                          mute: object.userData.mute,
                          playbackRate: object.userData.playbackRate,
                          audioStartTime: object.userData.audioStartTime,
                          audioEndTime: object.userData.audioEndTime
                        });
                      }

                      console.log(`✅ 트랙 ${track.objectId || track.id} 속성 복원 완료`);

                      // 동일 UX 보장을 위해: 복원 직후 선택/입력필드 업데이트(직접 추가 케이스와 동일 동작)
                      if (typeof audioSprite.applySelectionAndUpdateInputs === 'function') {
                        audioSprite.applySelectionAndUpdateInputs();
                      } else {
                        // 바인딩이 늦을 수 있으므로 한 번 더 시도
                        setTimeout(() => {
                          const retrySprite = track.element?.querySelector('.audio-sprite');
                          if (retrySprite && typeof retrySprite.applySelectionAndUpdateInputs === 'function') {
                            retrySprite.applySelectionAndUpdateInputs();
                          }
                        }, 0);
                      }
                    }
                  }

                  // 5. 선택 기반 속성 메서드들로 최종 정합성 보정
                  // (updateAudioStartTime / updateAudioEndTime / updateClipStartTime / updateClipDuration)
                  try {
                    this.applySavedPropertiesForTrack(track.objectId || track.id, audioData);
                    // 타임라인 설정 적용 후 한 번 더 보정 (비동기 로드 타이밍 대비)
                    setTimeout(() => {
                      this.applySavedPropertiesForTrack(track.objectId || track.id, audioData);
                    }, 50);
                  } catch (e) {
                    console.warn('선택 기반 속성 보정 중 경고:', e);
                  }

                  // 6. audioObjects의 오래된 ID를 새로운 track.id로 마이그레이션
                  try {
                    if (objectId !== String(track.objectId || track.id)) {
                      const audioTL = this.editor.scene.userData.audioTimeline || { audioObjects: {} };
                      const prev = audioTL.audioObjects?.[objectId];
                      if (prev) {
                        // 새 ID에 복사
                        this.updateAudioObjectsEntry(track.objectId || track.id, {
                          ...prev,
                          audioFile: prev.audioFile || audioFile,
                          startTime: audioData.startTime !== undefined ? audioData.startTime : prev.startTime,
                          duration: audioData.duration !== undefined ? audioData.duration : prev.duration,
                          volume: audioData.volume !== undefined ? audioData.volume : prev.volume,
                          mute: audioData.mute !== undefined ? audioData.mute : prev.mute,
                          playbackRate: audioData.playbackRate !== undefined ? audioData.playbackRate : prev.playbackRate,
                          audioStartTime: audioData.audioStartTime !== undefined ? audioData.audioStartTime : prev.audioStartTime,
                          audioEndTime: audioData.audioEndTime !== undefined ? audioData.audioEndTime : prev.audioEndTime,
                        });
                        // 오래된 항목 삭제
                        delete this.editor.scene.userData.audioTimeline.audioObjects[objectId];
                        console.log(`🧹 audioObjects에서 오래된 ID ${objectId}를 제거하고 새 ID ${track.objectId || track.id}로 마이그레이션했습니다.`);
                      }
                    }
                  } catch (migrateErr) {
                    console.warn('audioObjects ID 마이그레이션 중 경고:', migrateErr);
                  }
                }).catch((error) => {
                  console.error(`❌ loadAudioFile 실패: ${objectId}`, error);
                })
                );
              } else {
                console.log(`⚠️ ${objectId} 객체에 유효한 오디오 데이터가 없습니다.`);
              }
            });
          } else {
            console.log("⚠️ audioObjects 데이터가 없습니다.");
          }
        }

        // 저장된 현재 시간 복원
        if (timelineData.currentTime !== undefined) {
          this.currentTime = timelineData.currentTime;
          console.log(`저장된 현재 시간 복원: ${this.currentTime}s`);
        }

        // 마스터 볼륨 복원
        if (timelineData.audioObjects?.masterVolume !== undefined) {
          console.log(`마스터 볼륨 복원: ${timelineData.audioObjects.masterVolume}`);
          this.applyMasterVolume(timelineData.audioObjects.masterVolume);
        }

        // 타임라인 길이가 준비되면 퍼센트 재계산을 한 번 더 수행
        this.scheduleRecalcForTimelineReady();

        // 🔧 timelineData.tracks와 this.tracks 동기화
        this.syncTimelineDataTracks();

        // 🔧 트랙 복원이 제대로 되었는지 확인하고 최종 동기화
        setTimeout(async () => {
          if (this._restorePromises?.length) {
            await Promise.allSettled(this._restorePromises);
          }

          this.removeOrphanAudioTrackElements();
          this.rebuildTracksFromDOM();
          this.rebindAllTrackEvents();
          this._audioRestorePending = false;

          console.log("🔍 onAfterLoad 완료 후 트랙 상태:", {
            tracksSize: this.tracks.size,
            domTracks: this.getAudioTracksContainer()?.querySelectorAll('.timeline-track')?.length || 0,
          });

          this.syncAudioElementsAfterLoad();
          if (timelineData.audioObjects?.masterVolume !== undefined) {
            this.applyMasterVolume(timelineData.audioObjects.masterVolume);
          } else {
            this.applyMasterVolume();
          }
        }, 500);

        console.log("✅ AudioTimeline onAfterLoad 완료");
      } else {
        console.log("⚠️ scene.userData.audioTimeline 데이터가 없습니다.");
      }
    } catch (error) {
      console.error("❌ AudioTimeline onAfterLoad 오류:", error);
    }
  }

  // 트랙 속성 복원 (직접 트랙 객체 사용)
  restoreTrackPropertiesDirect(track, audioData) {
    try {
      console.log(`트랙 속성 직접 복원:`, track, audioData);

      if (!track || !track.element) {
        console.warn(`트랙 또는 트랙 요소가 없습니다:`, track);
        return;
      }

      const audioSprite = track.element.querySelector('.audio-sprite');
      if (audioSprite) {
        // 트랙 객체의 속성 복원
        if (audioData.startTime !== undefined) {
          track.startTime = audioData.startTime;
          audioSprite.dataset.startTime = audioData.startTime.toString();
          console.log(`⏰ startTime 복원: ${audioData.startTime}`);
        }

        if (audioData.duration !== undefined) {
          track.duration = audioData.duration;
          audioSprite.dataset.duration = audioData.duration.toString();
          console.log(`⏱️ duration 복원: ${audioData.duration}`);
        }

        if (audioData.volume !== undefined) {
          track.volume = audioData.volume;
          audioSprite.dataset.volume = audioData.volume.toString();
          console.log(`🔊 volume 복원: ${audioData.volume}`);
        }

        if (audioData.mute !== undefined) {
          track.mute = audioData.mute;
          audioSprite.dataset.mute = audioData.mute.toString();
          console.log(`🔇 mute 복원: ${audioData.mute}`);
        }

        if (audioData.playbackRate !== undefined) {
          track.playbackRate = audioData.playbackRate;
          audioSprite.dataset.playbackRate = audioData.playbackRate.toString();
          console.log(`⏩ playbackRate 복원: ${audioData.playbackRate}`);
        }

        if (audioData.audioStartTime !== undefined) {
          track.audioStartTime = audioData.audioStartTime;
          audioSprite.dataset.audioStartTime = audioData.audioStartTime.toString();
          console.log(`🎵 audioStartTime 복원: ${audioData.audioStartTime}`);
        }

        if (audioData.audioEndTime !== undefined) {
          track.audioEndTime = audioData.audioEndTime;
          audioSprite.dataset.audioEndTime = audioData.audioEndTime.toString();
          console.log(`🎵 audioEndTime 복원: ${audioData.audioEndTime}`);
        }

        // 위치와 크기 복원 (퍼센트 단위)
        if (audioData.left !== undefined) {
          audioSprite.style.left = `${audioData.left}%`;
          console.log(`📍 left 복원: ${audioData.left}%`);
        } else if (audioData.startTime !== undefined) {
          // startTime이 있으면 left 계산
          const left = (audioData.startTime / this.getTotalSeconds()) * 100;
          audioSprite.style.left = `${left}%`;
          console.log(`📍 left 계산 및 복원: ${left}%`);
        }

        if (audioData.width !== undefined) {
          audioSprite.style.width = `${audioData.width}%`;
          console.log(`📏 width 복원: ${audioData.width}%`);
        } else if (audioData.duration !== undefined) {
          // duration이 있으면 width 계산
          const width = (audioData.duration / this.getTotalSeconds()) * 100;
          audioSprite.style.width = `${width}%`;
          console.log(`📏 width 계산 및 복원: ${width}%`);
        }

        // 오디오 객체의 userData도 복원
        if (audioData.objectUserData) {
          const object = this.editor.scene.getObjectById(parseInt(track.objectId || track.id));
          if (object && object.userData) {
            if (audioData.objectUserData.startTime !== undefined) {
              object.userData.startTime = audioData.objectUserData.startTime;
            }
            if (audioData.objectUserData.duration !== undefined) {
              object.userData.duration = audioData.objectUserData.duration;
            }
            if (audioData.objectUserData.volume !== undefined) {
              object.userData.volume = audioData.objectUserData.volume;
            }
            if (audioData.objectUserData.mute !== undefined) {
              object.userData.mute = audioData.objectUserData.mute;
            }
            if (audioData.objectUserData.playbackRate !== undefined) {
              object.userData.playbackRate = audioData.objectUserData.playbackRate;
            }
            if (audioData.objectUserData.audioStartTime !== undefined) {
              object.userData.audioStartTime = audioData.objectUserData.audioStartTime;
            }
            if (audioData.objectUserData.audioEndTime !== undefined) {
              object.userData.audioEndTime = audioData.objectUserData.audioEndTime;
            }

            console.log(`🎵 오디오 객체 userData 복원 완료:`, {
              startTime: object.userData.startTime,
              duration: object.userData.duration,
              volume: object.userData.volume,
              mute: object.userData.mute,
              playbackRate: object.userData.playbackRate,
              audioStartTime: object.userData.audioStartTime,
              audioEndTime: object.userData.audioEndTime
            });
          }
        }

        console.log(`✅ 트랙 ${track.objectId || track.id} 속성 직접 복원 완료`);
      }
    } catch (error) {
      console.error(`트랙 속성 직접 복원 중 오류:`, error);
    }
  }

  // 저장된 속성 값을 선택 기반 업데이트 메서드들로 적용 (로드 시 최종 보정)
  applySavedPropertiesForTrack(objectId, audioData) {
    try {
      const track = this.tracks.get(objectId);
      if (!track || !track.element) return;
      const sprite = track.element.querySelector('.audio-sprite');
      if (!sprite) return;

      // 선택 상태로 만들기 (선택 기반 메서드들이 선택된 스프라이트를 사용함)
      document.querySelectorAll('.audio-sprite').forEach(s => s.classList.remove('selected'));
      sprite.classList.add('selected');

      // 클립 위치 및 길이 보정
      if (audioData.startTime !== undefined) {
        this.updateClipStartTime(parseFloat(audioData.startTime));
      }
      if (audioData.duration !== undefined) {
        this.updateClipDuration(parseFloat(audioData.duration));
      }

      // 오디오 편집 구간 보정 (원본 파일 내 구간)
      if (audioData.audioStartTime !== undefined) {
        this.updateAudioStartTime(parseFloat(audioData.audioStartTime));
      }
      if (audioData.audioEndTime !== undefined) {
        this.updateAudioEndTime(parseFloat(audioData.audioEndTime));
      }

      // UI 동기화
      this.updateUI();
    } catch (e) {
      console.warn('applySavedPropertiesForTrack 처리 중 경고:', e);
    }
  }

  // 트랙 속성 복원 (audioObjects에서 복원된 트랙용)
  restoreTrackProperties(objectId, audioData) {
    try {
      console.log(`트랙 속성 복원: ${objectId}`, audioData);

      // audioFile.path로 트랙 찾기 (objectId는 새로 생성될 수 있음)
      let track = null;
      if (audioData.audioFile && audioData.audioFile.path) {
        track = Array.from(this.tracks.values()).find(t => {
          if (t.element) {
            const audioSprite = t.element.querySelector('.audio-sprite');
            return audioSprite && audioSprite.dataset.audioPath === audioData.audioFile.path;
          }
          return false;
        });
      }

      // 경로로 찾지 못했다면 objectId로 시도
      if (!track) {
        track = Array.from(this.tracks.values()).find(t => t.objectId === objectId);
      }

      if (!track) {
        console.warn(`트랙을 찾을 수 없습니다: objectId=${objectId}, path=${audioData.audioFile?.path}`);
        console.log("현재 tracks 상태:", Array.from(this.tracks.entries()));
        return;
      }

      console.log(`트랙 찾음:`, track);

      // 트랙 요소 찾기
      if (track.element) {
        const audioSprite = track.element.querySelector('.audio-sprite');
        if (audioSprite) {
          // 저장된 속성 복원
          if (audioData.startTime !== undefined) {
            audioSprite.dataset.startTime = audioData.startTime.toString();
            audioSprite.style.left = `${(audioData.startTime / this.getTotalSeconds()) * 100}%`;
          }

          if (audioData.duration !== undefined) {
            audioSprite.dataset.duration = audioData.duration.toString();
            audioSprite.style.width = `${(audioData.duration / this.getTotalSeconds()) * 100}%`;
          }

          if (audioData.volume !== undefined) {
            audioSprite.dataset.volume = audioData.volume.toString();
          }

          // left, width 속성도 복원
          if (audioData.left !== undefined) {
            audioSprite.style.left = `${audioData.left}%`;
          }

          if (audioData.width !== undefined) {
            audioSprite.style.width = `${audioData.width}%`;
          }

          // 오디오 객체의 userData도 복원
          if (audioData.objectUserData) {
            const object = this.editor.scene.getObjectById(parseInt(track.objectId));
            if (object && object.userData) {
              object.userData.startTime = audioData.objectUserData.startTime || 0;
              object.userData.duration = audioData.objectUserData.duration || audioData.duration || 0;
              object.userData.volume = audioData.objectUserData.volume || 1.0;
              object.userData.mute = audioData.objectUserData.mute || false;
              object.userData.playbackRate = audioData.objectUserData.playbackRate || 1.0;
            }
          }

          console.log(`✅ 트랙 ${track.objectId} 속성 복원 완료`);
        }
      }
    } catch (error) {
      console.error(`트랙 속성 복원 중 오류: ${objectId}`, error);
    }
  }

  // Base64 데이터에서 오디오 복원
  async restoreAudioFromBase64(trackId, trackData) {
    try {
      console.log(`🔄 Base64에서 오디오 복원: ${trackId}`);
      console.log(`트랙 데이터:`, trackData);

      // Base64 데이터를 Blob으로 변환
      const response = await fetch(trackData.audioData);
      const audioBlob = await response.blob();

      // Blob URL 생성
      const blobUrl = URL.createObjectURL(audioBlob);

      // 오디오 파일 객체 생성
      const audioFile = {
        path: blobUrl,
        name: trackData.audioName || trackId,
        displayName: trackData.audioName || trackId,
        blob: audioBlob
      };

      console.log(`생성된 오디오 파일 객체:`, audioFile);
      console.log(`현재 tracks 상태:`, this.tracks);

      // 트랙에 오디오 추가
      console.log(`addAudioFromAsset 호출 시작: ${trackId}`);
      const result = this.addAudioFromAsset(audioFile);
      console.log(`addAudioFromAsset 결과:`, result);

      // 트랙이 생성되었는지 확인
      setTimeout(() => {
        console.log(`복원 후 tracks 상태:`, this.tracks);
        console.log(`트랙 ${trackId} 존재 여부:`, this.tracks.has(trackId));

        // 저장된 위치와 크기 복원
        this.restoreTrackPosition(trackId, trackData);
      }, 200);

      console.log(`✅ Base64에서 오디오 복원 완료: ${trackId}`);
    } catch (error) {
      console.error(`❌ Base64에서 오디오 복원 실패: ${trackId}`, error);
      // 실패 시 경로로 복원 시도
      this.restoreAudioFromPath(trackId, trackData);
    }
  }

  resolveAudioPlaybackUrl(path) {
    if (!path) return '';
    if (path.startsWith('blob:') || path.startsWith('data:') || path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }
    try {
      return new URL(path, window.location.href).href;
    } catch {
      return path;
    }
  }

  getPersistentAudioPath(trackId, audioSprite, track) {
    const resolvedTrack = track || this.getTrackByAnyId(trackId);
    const object = resolvedTrack
      ? this.getTrackSceneObject(resolvedTrack)
      : this.editor.scene.getObjectById(parseInt(trackId, 10));
    const candidates = [
      object?.userData?.audioPath,
      object?.userData?.audioFile?.path,
      track?.audioFile?.path,
      audioSprite?.dataset?.audioPath,
    ].filter(Boolean);
    const persistent = candidates.find((p) => !String(p).startsWith('blob:'));
    return persistent || candidates[0] || '';
  }

  syncAudioElementsAfterLoad() {
    if (!this.tracks || this.tracks.size === 0) return;

    this.tracks.forEach((track, trackId) => {
      const audio = this.getTrackAudioElement(track);
      if (!audio) {
        const sprite = track.element?.querySelector('.audio-sprite');
        const path = this.getPersistentAudioPath(trackId, sprite, track);
        if (path && !String(path).startsWith('blob:')) {
          const audioEl = new Audio();
          audioEl.preload = 'auto';
          audioEl.src = this.resolveAudioPlaybackUrl(path);
          track.audioElement = audioEl;
          const object = this.getTrackSceneObject(track);
          if (object) {
            object.userData = object.userData || {};
            object.userData.audioElement = audioEl;
            object.userData.audioPath = path;
          }
        }
        return;
      }

      const sprite = track.element?.querySelector('.audio-sprite');
      const path = this.getPersistentAudioPath(trackId, sprite, track);
      if (path && !String(path).startsWith('blob:') && String(audio.src).startsWith('blob:')) {
        audio.src = this.resolveAudioPlaybackUrl(path);
      }

      const object = this.getTrackSceneObject(track);
      if (object) {
        object.userData = object.userData || {};
        object.userData.audioElement = audio;
        if (path) object.userData.audioPath = path;
      }

      if (this.editor.scene.userData.audioTimeline?.audioObjects) {
        const objs = this.editor.scene.userData.audioTimeline.audioObjects;
        const key = String(trackId);
        if (objs[key]) {
          objs[key].audioElement = audio;
          objs[key].objectId = trackId;
        }
      }
    });
  }

  findTrackByAudioPath(path) {
    if (!path) return null;
    const target = this.resolveAudioPlaybackUrl(path);
    for (const track of this.tracks.values()) {
      const sprite = track.element?.querySelector('.audio-sprite');
      const candidates = [
        sprite?.dataset?.audioPath,
        track.audioFile?.path,
        track.element?.querySelector('.track-name')?.textContent,
      ].filter(Boolean);
      for (const candidate of candidates) {
        if (this.resolveAudioPlaybackUrl(candidate) === target) {
          return track;
        }
      }
    }
    return null;
  }

  isRestoreGenerationCurrent(generation) {
    return generation === undefined || generation === this._audioRestoreGeneration;
  }

  // 경로에서 오디오 복원 (기존 방식)
  restoreAudioFromPath(trackId, trackData, restoreGeneration) {
    try {
      console.log(`🔄 경로에서 오디오 복원: ${trackId}`);
      console.log(`트랙 데이터:`, trackData);

      // 보조: 씬 객체에 HTMLAudioElement를 보장하는 헬퍼
      const ensureAudioElementForObject = (id, sourcePath, audioFile) => {
        try {
          const object = this.editor.scene.getObjectById(parseInt(id));
          if (!object) {
            console.warn(`ensureAudioElementForObject: id=${id} 객체 없음`);
            return;
          }

          // 이미 연결되어 있으면 스킵
          if (object.userData && object.userData.audioElement) return;

          const audioEl = new Audio();
          audioEl.preload = 'auto';
          const resolvedSrc = this.resolveAudioPlaybackUrl(sourcePath);
          audioEl.src = resolvedSrc;
          audioEl.addEventListener('error', () => {
            fetch(resolvedSrc)
              .then((r) => r.blob())
              .then((blob) => {
                const url = URL.createObjectURL(blob);
                audioEl.src = url;
                object.userData.audioUrl = url;
                console.log(`ensureAudioElementForObject: blob URL로 대체됨 (${id})`);
              })
              .catch((e) => console.warn('ensureAudioElementForObject: blob 대체 실패', e));
          });

          object.userData = object.userData || {};
          object.userData.audioElement = audioEl;
          object.userData.audioPath = sourcePath;
          if (audioFile) object.userData.audioFile = audioFile;
          console.log(`🔗 HTMLAudioElement 연결 보장 완료 (id=${id})`);
        } catch (e) {
          console.warn('ensureAudioElementForObject 예외:', e);
        }
      };

      // 기존 트랙이 있는지 확인
      if (this.tracks.has(trackId)) {
        console.log(`✅ 기존 트랙 ${trackId}가 이미 존재합니다. 속성만 복원합니다.`);

        return new Promise((resolve) => {
          setTimeout(() => {
            this.restoreTrackPosition(trackId, trackData);
            const sourcePath = trackData.audioPath || trackData.audioFile?.path;
            const track = this.tracks.get(trackId);
            if (sourcePath && track) {
              const object = this.getTrackSceneObject(track);
              if (object && !object.userData?.audioElement) {
                ensureAudioElementForObject(object.id, sourcePath, trackData.audioFile);
              }
            }
            if (trackData.volume !== undefined && track) {
              const audio = this.getTrackAudioElement(track);
              if (audio) audio.volume = trackData.volume;
              track.volume = trackData.volume;
              const object = this.getTrackSceneObject(track);
              if (object?.userData) object.userData.volume = trackData.volume;
            }
            resolve();
          }, 100);
        });
      }

      console.log(`⚠️ 기존 트랙 ${trackId}가 없습니다. 새 트랙을 생성합니다.`);

      const audioPath = trackData.audioPath || trackData.audioFile?.path;
      const existingByPath = this.findTrackByAudioPath(audioPath);
      if (existingByPath) {
        console.log(`ℹ️ 동일 경로 오디오 트랙이 이미 있음 — 재사용: ${trackId}`);
        const realId = String(existingByPath.objectId || trackId);
        this.tracks.set(realId, existingByPath);
        this.restoreTrackPosition(realId, trackData);
        return Promise.resolve();
      }

      const audioFile = {
        path: audioPath,
        name: trackData.audioName || trackId,
        displayName: trackData.audioName || trackId,
        _restoreGeneration: restoreGeneration,
        originalTrackData: {
          startTime: trackData.startTime ?? 0,
          duration: trackData.duration ?? 180,
          volume: trackData.volume ?? 1,
          mute: trackData.mute ?? false,
          playbackRate: trackData.playbackRate ?? 1,
          audioStartTime: trackData.audioStartTime ?? 0,
          audioEndTime: trackData.audioEndTime ?? trackData.duration ?? 180,
          left: trackData.left,
          width: trackData.width,
          objectUserData: trackData.objectUserData,
        },
      };

      return this.loadAudioFile(audioFile)
        .then((track) => {
          if (!this.isRestoreGenerationCurrent(restoreGeneration)) {
            console.log(`오디오 복원 취소됨 (이전 세션): ${trackId}`);
            return;
          }
          if (!track) {
            console.error(`❌ loadAudioFile 결과 없음: ${trackId}`);
            return;
          }
          const realId = String(track.objectId || track.id);
          for (const [k, t] of [...this.tracks.entries()]) {
            if (t === track && k !== realId) this.tracks.delete(k);
          }
          this.tracks.set(realId, track);
          track.objectId = realId;
          if (track.element) {
            track.element.dataset.objectId = realId;
          }
          this.restoreTrackPosition(realId, trackData);
          if (trackData.objectUserData) {
            const object = this.getTrackSceneObject(track);
            if (object?.userData) {
              Object.assign(object.userData, trackData.objectUserData);
            }
          }
          if (trackData.volume !== undefined) {
            const audio = this.getTrackAudioElement(track);
            if (audio) audio.volume = trackData.volume;
            track.volume = trackData.volume;
            const object = this.getTrackSceneObject(track);
            if (object?.userData) object.userData.volume = trackData.volume;
          }
          this.syncTimelineDataTracks();
          this.syncAudioElementsAfterLoad();
          console.log(`✅ 오디오 트랙 UI 복원 완료: ${realId}`);
        })
        .catch((error) => {
          console.error(`❌ loadAudioFile 복원 실패: ${trackId}`, error);
        });
    } catch (error) {
      console.error(`❌ 경로에서 오디오 복원 실패: ${trackId}`, error);
      return Promise.resolve();
    }
  }

  // 트랙 위치와 크기 복원
  restoreTrackPosition(trackId, trackData) {
    try {
      console.log(`🔍 restoreTrackPosition 시작: ${trackId}`, trackData);

      const track = this.tracks.get(trackId);
      if (track && track.element) {
        const audioSprite = track.element.querySelector('.audio-sprite');
        if (audioSprite) {
          // 위치와 크기 복원 (퍼센트 단위로 저장되었으므로 퍼센트로 복원)
          if (trackData.left !== undefined) {
            audioSprite.style.left = `${trackData.left}%`;
            console.log(`📍 left 복원: ${trackData.left}%`);
          }
          if (trackData.width !== undefined) {
            audioSprite.style.width = `${trackData.width}%`;
            console.log(`📏 width 복원: ${trackData.width}%`);
          }

          // 오디오 속성 복원 - 트랙 객체와 DOM 요소 모두 동기화
          if (trackData.startTime !== undefined) {
            track.startTime = trackData.startTime;
            audioSprite.dataset.startTime = trackData.startTime.toString();
            console.log(`⏰ startTime 복원: ${trackData.startTime}`);
          }
          if (trackData.duration !== undefined) {
            track.duration = trackData.duration;
            audioSprite.dataset.duration = trackData.duration.toString();
            console.log(`⏱️ duration 복원: ${trackData.duration}`);
          }
          if (trackData.volume !== undefined) {
            track.volume = trackData.volume;
            audioSprite.dataset.volume = trackData.volume.toString();
            console.log(`🔊 volume 복원: ${trackData.volume}`);
          }
          if (trackData.mute !== undefined) {
            track.mute = trackData.mute;
            audioSprite.dataset.mute = trackData.mute.toString();
            console.log(`🔇 mute 복원: ${trackData.mute}`);
          }
          if (trackData.playbackRate !== undefined) {
            track.playbackRate = trackData.playbackRate;
            audioSprite.dataset.playbackRate = trackData.playbackRate.toString();
            console.log(`⏩ playbackRate 복원: ${trackData.playbackRate}`);
          }

          // 오디오 시작/종료 시간 복원
          if (trackData.audioStartTime !== undefined) {
            track.audioStartTime = trackData.audioStartTime;
            audioSprite.dataset.audioStartTime = trackData.audioStartTime.toString();
            console.log(`🎵 audioStartTime 복원: ${trackData.audioStartTime}`);
          }
          if (trackData.audioEndTime !== undefined) {
            track.audioEndTime = trackData.audioEndTime;
            audioSprite.dataset.audioEndTime = trackData.audioEndTime.toString();
            console.log(`🎵 audioEndTime 복원: ${trackData.audioEndTime}`);
          }

          // 오디오 객체의 userData도 복원
          if (trackData.objectUserData) {
            const object = this.editor.scene.getObjectById(parseInt(trackId));
            if (object && object.userData) {
              // 기본 속성 복원
              if (trackData.objectUserData.startTime !== undefined) {
                object.userData.startTime = trackData.objectUserData.startTime;
              }
              if (trackData.objectUserData.duration !== undefined) {
                object.userData.duration = trackData.objectUserData.duration;
              }
              if (trackData.objectUserData.volume !== undefined) {
                object.userData.volume = trackData.objectUserData.volume;
              }
              if (trackData.objectUserData.mute !== undefined) {
                object.userData.mute = trackData.objectUserData.mute;
              }
              if (trackData.objectUserData.playbackRate !== undefined) {
                object.userData.playbackRate = trackData.objectUserData.playbackRate;
              }

              // 오디오 관련 속성 복원
              if (trackData.objectUserData.audioStartTime !== undefined) {
                object.userData.audioStartTime = trackData.objectUserData.audioStartTime;
              }
              if (trackData.objectUserData.audioEndTime !== undefined) {
                object.userData.audioEndTime = trackData.objectUserData.audioEndTime;
              }

              console.log(`🎵 오디오 객체 userData 복원 완료:`, {
                startTime: object.userData.startTime,
                duration: object.userData.duration,
                volume: object.userData.volume,
                mute: object.userData.mute,
                playbackRate: object.userData.playbackRate,
                audioStartTime: object.userData.audioStartTime,
                audioEndTime: object.userData.audioEndTime
              });
            }
          }

          // 트랙 객체의 모든 속성도 동기화
          if (trackData.audioStartTime !== undefined) {
            track.audioStartTime = trackData.audioStartTime;
          }
          if (trackData.audioEndTime !== undefined) {
            track.audioEndTime = trackData.audioEndTime;
          }

          console.log(`✅ 트랙 위치 복원 완료: ${trackId}`);

          // UI 강제 업데이트
          this.updateUI();
        } else {
          console.warn(`❌ audio-sprite를 찾을 수 없음: ${trackId}`);
        }
      } else {
        console.warn(`❌ 트랙을 찾을 수 없음: ${trackId}`);
      }
    } catch (error) {
      console.error(`❌ 트랙 위치 복원 실패: ${trackId}`, error);
    }
  }

  bindSpriteEvents(sprite, track = null) {
    // track 객체가 전달되지 않았으면 sprite에서 찾기
    if (!track) {
      const trackElement = sprite.closest('.timeline-track');
      const trackId = trackElement?.dataset?.objectId;
      track = trackId ? this.tracks.get(trackId) : null;

      // track을 찾지 못한 경우 모든 tracks에서 해당 sprite를 포함하는 track 찾기
      if (!track) {
        for (const [trackId, trackData] of this.tracks.entries()) {
          if (trackData.element && trackData.element.contains(sprite)) {
            track = trackData;
            break;
          }
        }
      }
    }

    console.log("bindSpriteEvents - track 찾기 결과:", { track, sprite });
    let isDragging = false;
    let dragStartX = 0;
    let startLeft = 0;
    let startWidth = 0;
    let isMovingSprite = false;

    // 선택 공통 처리 함수
    const applySelectionAndUpdateInputs = (targetSprite, targetTrack) => {
      // 다른 스프라이트 선택 해제
      document.querySelectorAll('.audio-sprite').forEach(s => s.classList.remove('selected'));
      // 현재 스프라이트 선택
      targetSprite.classList.add('selected');

      if (targetTrack) {
        const audioObject = this.getTrackSceneObject(targetTrack);
        if (audioObject) {
          const startTime = parseFloat(targetSprite.dataset.startTime) || 0;
          const duration = parseFloat(targetSprite.dataset.duration) || 0;
          const audioStartTime = audioObject.userData.audioStartTime || 0;
          const audioEndTime = audioObject.userData.audioEndTime || (audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : audioStartTime + duration);

          // 동일한 포맷팅 경로 사용
          this.updateInputFields(audioStartTime, audioEndTime);
          this.updateClipInputFields(startTime, duration);

          // 전역 선택 상태 갱신하여 사이드바 속성 패널 업데이트 유도
          if (this.editor?.select) {
            this.editor.select(audioObject);
          }
        }
      }
    };

    // 스프라이트 클릭 이벤트 (선택)
    sprite.addEventListener("click", (e) => {
      e.stopPropagation();
      applySelectionAndUpdateInputs(sprite, track);
    });

    // 스프라이트 더블클릭 이벤트 (재생/정지)
    sprite.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      e.preventDefault(); // 기본 동작 방지
      console.log("오디오 스프라이트 더블클릭 - 재생/정지");
      /*
            if (track) {
              const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
              if (audioObject && audioObject.userData.audioElement) {
                const audioElement = audioObject.userData.audioElement;
      
                if (audioElement.paused) {
                  // 재생 시작
                  console.log(`오디오 ${track.objectId} 재생 시작`);
                  audioElement.play().catch(error => {
                    console.error("오디오 재생 실패:", error);
                  });
                } else {
                  // 재생 정지
                  console.log(`오디오 ${track.objectId} 재생 정지`);
                  audioElement.pause();
                }
              }
            }
              */
    });

    // 로드 후 자동 선택 보정: 새로 생성된 스프라이트에 동일 로직 적용되도록 호출 지점에서 재사용 가능
    sprite.applySelectionAndUpdateInputs = () => applySelectionAndUpdateInputs(sprite, track);

    // 스프라이트 전체 드래그 이벤트 (위치 이동만)
    sprite.addEventListener("mousedown", (e) => {
      e.stopPropagation();
      isDragging = true;
      isMovingSprite = true;
      dragStartX = e.clientX;
      startLeft = parseFloat(sprite.style.left) || 0;
      startWidth = parseFloat(sprite.style.width) || 0;

      // 드래그 중인 스프라이트 스타일 변경
      sprite.style.opacity = "0.8";
      sprite.style.cursor = "grabbing";
    });

    // 드래그 중 이벤트
    document.addEventListener("mousemove", (e) => {
      if (!isDragging || !isMovingSprite) return;

      const container = sprite.closest(".timeline-viewport");
      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;

      // 드래그 거리 계산 (퍼센트로)
      const dragDelta = ((e.clientX - dragStartX) / containerWidth) * 100;

      // 스프라이트 전체 이동
      const newLeft = Math.max(
        0,
        Math.min(startLeft + dragDelta, 100 - startWidth)
      );
      sprite.style.left = `${newLeft}%`;

      // 시작 시간 업데이트
      const totalSeconds = this.getTotalSeconds();
      const startTime = (newLeft / 100) * totalSeconds;
      
      // 🔧 startTime이 유효한지 확인
      if (isNaN(startTime) || !isFinite(startTime)) {
        console.warn("⚠️ 계산된 startTime이 유효하지 않음:", {
          newLeft,
          totalSeconds,
          startTime
        });
        return; // 유효하지 않으면 업데이트 건너뛰기
      }
      
      sprite.dataset.startTime = startTime.toString();

      // 오디오 객체 업데이트
      if (track) {
        const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
        if (audioObject) {
          audioObject.userData.startTime = startTime;
          
          // 🔧 드래그 중 실시간으로 input 필드 업데이트
          const duration = parseFloat(sprite.dataset.duration) || 0;
          const audioStartTime = audioObject.userData.audioStartTime || 0;
          const audioEndTime = audioObject.userData.audioEndTime || (audioObject.userData.audioElement ? audioObject.userData.audioElement.duration : audioStartTime + duration);
          
          // 실시간 업데이트 (드래그 중에도)
          this.updateInputFields(audioStartTime, audioEndTime);
          this.updateClipInputFields(startTime, duration);
        }
      }
    });

    // 드래그 종료 이벤트
    document.addEventListener("mouseup", () => {
      if (!isDragging) return;

      isDragging = false;
      isMovingSprite = false;

      // 스타일 복원
      sprite.style.opacity = "";
      sprite.style.cursor = "grab";

      // 변경사항 저장
      if (track) {
        const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
        if (audioObject) {
          const startTime = parseFloat(sprite.dataset.startTime) || 0;
          const duration = parseFloat(sprite.dataset.duration) || 0;

          console.log("클립 변경사항 저장:", {
            startTime: startTime,
            duration: duration,
            endTime: startTime + duration
          });

          // 오디오 객체 userData 업데이트
          audioObject.userData.startTime = startTime;
          audioObject.userData.duration = duration;

          // 씬 데이터 업데이트 (헬퍼 사용)
          this.updateAudioObjectsEntry(audioObject.id, {
            startTime: startTime,
            duration: duration,
            audioStartTime: audioObject.userData.audioStartTime,
            audioEndTime: audioObject.userData.audioEndTime,
          });

          // input 필드 동기화
          const audioStartTime = audioObject.userData.audioStartTime || 0;
          const audioEndTime = audioObject.userData.audioEndTime || audioObject.userData.audioElement.duration;
          this.updateInputFields(audioStartTime, audioEndTime);
          this.updateClipInputFields(startTime, duration);
        }
      }

      // 타임라인 업데이트 시그널 발생
      if (this.editor.signals?.timelineChanged) {
        this.editor.signals.timelineChanged.dispatch();
      }
    });
  }

  // 오디오 트랙 UI 생성 메서드
  createAudioTrackUI(track, trackData) {
    try {
      console.log(`🎨 createAudioTrackUI 시작: ${track.id}`, trackData);

      // 트랙 컨테이너 생성
      const trackElement = document.createElement("div");
      trackElement.className = "timeline-track";
      trackElement.dataset.objectId = track.id;

      // 오디오 트랙 컨텐츠 생성
      const trackContent = document.createElement("div");
      trackContent.className = "audio-tracks";

      // 트랙 헤더 생성
      const trackHeader = document.createElement("div");
      trackHeader.className = "track-header";
      trackHeader.innerHTML = `
        <div class="track-info">
          <span class="track-name">${track.audioFile.displayName || track.audioFile.name || "Audio"}</span>
        </div>
        <div class="track-controls">
          <button class="add-keyframe-btn" title="Add Keyframe">+</button>
          <button class="delete-track-btn" title="Delete Track" style="background: #ff4444; color: white; border: none; border-radius: 3px; padding: 2px 6px; margin-left: 5px; cursor: pointer;">×</button>
        </div>
      `;
      trackContent.appendChild(trackHeader);

      // 트랙 컨텐츠 영역 생성
      const trackContentArea = document.createElement("div");
      trackContentArea.className = "track-content";

      // 오디오 스프라이트 생성
      const audioSprite = document.createElement("div");
      audioSprite.className = "audio-sprite";
      audioSprite.dataset.objectId = track.id;
      audioSprite.dataset.startTime = track.startTime.toString();
      audioSprite.dataset.duration = track.duration.toString();
      audioSprite.dataset.volume = track.volume.toString();
      audioSprite.dataset.mute = track.mute.toString();
      audioSprite.dataset.playbackRate = track.playbackRate.toString();
      audioSprite.dataset.audioStartTime = track.audioStartTime.toString();
      audioSprite.dataset.audioEndTime = track.audioEndTime.toString();
      audioSprite.dataset.audioPath = track.audioFile.path;
      audioSprite.dataset.audioName = track.audioFile.name;

      // 스프라이트 스타일 설정
      const totalSeconds = this.options.totalSeconds || 300; // 기본값 5분
      const leftPercent = (track.startTime / this.getTotalSeconds()) * 100;
      const widthPercent = (track.duration / this.getTotalSeconds()) * 100;

      audioSprite.style.cssText = `
        position: absolute;
        left: ${leftPercent}%;
        width: ${widthPercent}%;
        height: 28px;
        cursor: grab;
        user-select: none;
        z-index: 10;
      `;

      const clipLabel =
        track.audioFile.displayName || track.audioFile.name || "Audio";
      audioSprite.innerHTML = `
        <div class="sprite-handle left"></div>
        <div class="sprite-content">
          <div class="sprite-name">${clipLabel}</div>
          <canvas class="waveform-canvas" height="16"></canvas>
        </div>
        <div class="sprite-handle right"></div>
      `;

      // 스프라이트를 트랙 컨텐츠에 추가
      trackContentArea.appendChild(audioSprite);
      trackContent.appendChild(trackContentArea);
      trackElement.appendChild(trackContent);

      // 트랙 요소를 트랙 객체에 저장
      track.element = trackElement;

      // 이벤트 바인딩
      this.bindSpriteEvents(audioSprite, track);
      // 바인딩 직후 한 번 보정: 데이터셋 기준으로 left/width 재계산
      const totalAfterBind = this.getTotalSeconds();
      const st = parseFloat(audioSprite.dataset.startTime || '0');
      const du = parseFloat(audioSprite.dataset.duration || '0');
      audioSprite.style.left = `${(st / totalAfterBind) * 100}%`;
      audioSprite.style.width = `${(du / totalAfterBind) * 100}%`;

      // 컨테이너에 트랙 추가
      // this.container.appendChild(trackElement);
      console.log("컨테이너에 트랙 추가 his.container", this.container);
      document.querySelector('.timeline-group[data-timeline=audio] .timeline-container')?.appendChild(trackElement)
        || this.getAudioTracksContainer()?.appendChild(trackElement);

      console.log(`✅ createAudioTrackUI 완료: ${track.id}`, {
        element: trackElement,
        sprite: audioSprite,
        left: leftPercent,
        width: widthPercent
      });

    } catch (error) {
      console.error(`❌ createAudioTrackUI 실패: ${track.id}`, error);
    }
  }

  // UI 강제 업데이트
  updateUI() {
    try {
      console.log("🔄 AudioTimeline UI 업데이트 시작");

      // 모든 트랙의 UI 요소들을 강제로 업데이트
      this.tracks.forEach((track, trackId) => {
        if (track.element) {
          const audioSprite = track.element.querySelector('.audio-sprite');
          if (audioSprite) {
            // 데이터셋 속성들을 트랙 객체와 동기화
            if (track.startTime !== undefined) {
              audioSprite.dataset.startTime = track.startTime.toString();
            }
            if (track.duration !== undefined) {
              audioSprite.dataset.duration = track.duration.toString();
            }
            if (track.volume !== undefined) {
              audioSprite.dataset.volume = track.volume.toString();
            }
            if (track.mute !== undefined) {
              audioSprite.dataset.mute = track.mute.toString();
            }
            if (track.playbackRate !== undefined) {
              audioSprite.dataset.playbackRate = track.playbackRate.toString();
            }
            if (track.audioStartTime !== undefined) {
              audioSprite.dataset.audioStartTime = track.audioStartTime.toString();
            }
            if (track.audioEndTime !== undefined) {
              audioSprite.dataset.audioEndTime = track.audioEndTime.toString();
            }
            // 스타일 재계산을 항상 수행하여 분모가 바뀐 경우도 즉시 반영
            const total = this.getTotalSeconds();
            const startTime = parseFloat(audioSprite.dataset.startTime || '0');
            const duration = parseFloat(audioSprite.dataset.duration || '0');
            audioSprite.style.left = `${(startTime / total) * 100}%`;
            audioSprite.style.width = `${(duration / total) * 100}%`;
          }
        }
      });

      console.log("✅ AudioTimeline UI 업데이트 완료");
    } catch (error) {
      console.error("❌ AudioTimeline UI 업데이트 오류:", error);
    }
  }

  // timelineData.tracks와 this.tracks 동기화 메소드
  syncTimelineDataTracks() {
    try {
      console.log("🔧 timelineData.tracks와 this.tracks 동기화 시작");
      console.log("현재 this.tracks 상태:", {
        size: this.tracks.size,
        keys: Array.from(this.tracks.keys())
      });

      if (!this.timelineData) {
        console.warn("timelineData가 없어서 동기화를 건너뜁니다");
        return;
      }

      // this.tracks의 모든 트랙을 timelineData.tracks에 복사
      this.tracks.forEach((track, trackId) => {
        if (track && track.element) {
          const audioSprite = track.element.querySelector('.audio-sprite');
          if (audioSprite) {
            // 트랙 데이터 구성
            const trackData = {
              audioPath: audioSprite.dataset.audioPath || '',
              audioName: audioSprite.dataset.audioName || '',
              startTime: parseFloat(audioSprite.dataset.startTime) || 0,
              duration: parseFloat(audioSprite.dataset.duration) || 0,
              volume: parseFloat(audioSprite.dataset.volume) || 1.0,
              left: parseFloat(audioSprite.style.left) || 0,
              width: parseFloat(audioSprite.style.width) || 100,
              objectUserData: {
                startTime: parseFloat(audioSprite.dataset.startTime) || 0,
                duration: parseFloat(audioSprite.dataset.duration) || 0,
                volume: parseFloat(audioSprite.dataset.volume) || 1.0,
                mute: audioSprite.dataset.mute === 'true',
                playbackRate: parseFloat(audioSprite.dataset.playbackRate) || 1.0
              }
            };

            // timelineData.tracks에 추가
            this.timelineData.tracks.set(trackId, trackData);
            console.log(`✅ 트랙 ${trackId}를 timelineData.tracks에 동기화:`, trackData);
          }
        }
      });

      console.log("🔧 timelineData.tracks 동기화 완료:", {
        size: this.timelineData.tracks.size,
        keys: Array.from(this.timelineData.tracks.keys())
      });

    } catch (error) {
      console.error("timelineData.tracks 동기화 중 오류:", error);
    }
  }

  // scene.userData.audioTimeline.audioObjects 동기화 헬퍼
  updateAudioObjectsEntry(objectId, patch) {
    try {
      if (objectId === undefined || objectId === null || objectId === '' || isNaN(Number(objectId))) {
        console.warn('updateAudioObjectsEntry: 잘못된 objectId, 업데이트를 건너뜁니다.', objectId, patch);
        return;
      }
      if (!this.editor.scene) return;
      if (!this.editor.scene.userData) this.editor.scene.userData = {};
      if (!this.editor.scene.userData.audioTimeline) {
        this.editor.scene.userData.audioTimeline = { audioObjects: {} };
      }
      if (!this.editor.scene.userData.audioTimeline.audioObjects) {
        this.editor.scene.userData.audioTimeline.audioObjects = {};
      }
      const current = this.editor.scene.userData.audioTimeline.audioObjects[objectId] || {};
      this.editor.scene.userData.audioTimeline.audioObjects[objectId] = {
        ...current,
        ...patch,
      };
    } catch (e) {
      console.warn('audioObjects 동기화 실패:', e);
    }
  }

  // audioObjects에서 강제로 트랙 복원하는 메소드 (LightTimeline 방식으로 수정)
  forceRestoreTracksFromAudioObjects() {
    try {
      if (this._audioRestorePending) {
        console.log("오디오 복원 진행 중 — 강제 복원 건너뜀");
        return;
      }

      const hadSavedTracks = this.editor.scene?.userData?.audioTimeline?.tracks
        && Object.keys(this.editor.scene.userData.audioTimeline.tracks).length > 0;
      if (hadSavedTracks) {
        console.log("저장된 tracks 데이터가 있음 — 강제 복원 건너뜀");
        return;
      }

      console.log("🚨 강제 트랙 복원 시작 (LightTimeline 방식)");

      if (!this.editor.scene?.userData?.audioTimeline?.audioObjects) {
        console.warn("audioObjects가 없어서 강제 복원을 건너뜁니다");
        return;
      }

      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;
      console.log("🔍 audioObjects에서 복원할 데이터:", audioObjects);

      // masterVolume은 제외하고 실제 오디오 트랙만 처리
      Object.entries(audioObjects).forEach(([objectId, audioData]) => {
        if (objectId === 'masterVolume') return;

        if (audioData.audioFile && audioData.audioFile.path) {
          console.log(`🚨 강제 복원 시도: ${objectId}`, audioData);

          // 기존 트랙이 있는지 확인
          if (this.tracks.has(objectId)) {
            console.log(`✅ 트랙 ${objectId}가 이미 존재합니다`);
            return;
          }

          // LightTimeline 방식: 먼저 빈 트랙을 this.tracks에 추가
          console.log(`🚨 빈 트랙을 this.tracks에 추가: ${objectId}`);
          const emptyTrack = {
            element: null,
            keyframes: {
              volume: new Map(),
              mute: new Map(),
              playbackRate: new Map(),
            },
            objectId: objectId,
            objectName: audioData.audioFile.displayName || audioData.audioFile.name,
            startTime: audioData.startTime || 0,
            duration: audioData.duration || 100,
            volume: audioData.volume || 1.0,
            mute: audioData.mute || false,
            playbackRate: audioData.playbackRate || 1.0,
            audioStartTime: audioData.audioStartTime || 0,
            audioEndTime: audioData.audioEndTime || (audioData.duration || 100)
          };

          // this.tracks에 직접 추가
          this.tracks.set(objectId, emptyTrack);
          console.log(`✅ 빈 트랙 추가 완료: ${objectId}`, {
            tracksSize: this.tracks.size,
            tracksKeys: Array.from(this.tracks.keys())
          });

          // 오디오 파일 객체 생성
          const audioFile = {
            path: audioData.audioFile.path,
            name: audioData.audioFile.name,
            displayName: audioData.audioFile.displayName,
            originalTrackData: {
              startTime: audioData.startTime || 0,
              duration: audioData.duration || 100,
              volume: audioData.volume || 1.0,
              mute: audioData.mute || false,
              playbackRate: audioData.playbackRate || 1.0,
              audioStartTime: audioData.audioStartTime || 0,
              audioEndTime: audioData.audioEndTime || (audioData.duration || 100)
            }
          };

          console.log(`🚨 강제 복원용 audioFile:`, audioFile);

          // loadAudioFile 호출하여 트랙 생성
          console.log(`🚨 loadAudioFile 호출 시작: ${objectId}`);
          this.loadAudioFile(audioFile).then((track) => {
            console.log(`🚨 강제 복원 성공: ${objectId}`, track);
            console.log(`🚨 생성된 트랙의 objectId:`, track.objectId || track.id);
            console.log(`🚨 현재 this.tracks 상태:`, {
              size: this.tracks.size,
              keys: Array.from(this.tracks.keys()),
              hasTrack: this.tracks.has(track.objectId || track.id)
            });

            // 트랙이 생성되었는지 확인
            if (track && this.tracks.has(track.objectId || track.id)) {
              console.log(`✅ 강제 복원 후 tracks 상태:`, {
                size: this.tracks.size,
                keys: Array.from(this.tracks.keys())
              });

              // timelineData.tracks도 동기화
              this.syncTimelineDataTracks();
            } else {
              console.warn(`⚠️ 트랙 생성됐지만 this.tracks에 없음:`, {
                track,
                trackId: track.objectId || track.id,
                tracksSize: this.tracks.size,
                tracksKeys: Array.from(this.tracks.keys())
              });
            }
          }).catch((error) => {
            console.error(`🚨 강제 복원 실패: ${objectId}`, error);
          });
        }
      });

    } catch (error) {
      console.error("강제 트랙 복원 중 오류:", error);
    }
  }



  // 새로고침 안내 메시지
  showRefreshMessage() {
    const uploadSection = this.dom.querySelector(".upload-section");
    const refreshDiv = document.createElement("div");
    refreshDiv.className = "refresh-message";
    refreshDiv.innerHTML = `
      <div class="refresh-text">🔄 음악 목록을 보려면 페이지를 새로고침하세요</div>
      <button class="refresh-btn" onclick="location.reload()">새로고침</button>
    `;
    
    // 기존 성공 메시지 제거
    const existingSuccess = uploadSection.querySelector(".upload-success");
    if (existingSuccess) {
      existingSuccess.remove();
    }
    
    uploadSection.appendChild(refreshDiv);
    
    // 10초 후 새로고침 안내 제거
    setTimeout(() => {
      if (refreshDiv.parentNode) {
        refreshDiv.remove();
      }
    }, 10000);
  }

  // SidebarAssets에서 음악 추가 시 호출되는 메서드
  addAudioTrack(audioFile) {
    try {
      console.log("SidebarAssets에서 음악 추가 요청:", audioFile);
      
      // 기본 오디오 트랙 데이터 생성
      const audioData = {
        audioFile: audioFile,
        startTime: 0, // 시작 시간 0초
        duration: 100, // 기본 길이 100초
        volume: 1.0, // 기본 볼륨 100%
        mute: false, // 기본값 음소거 해제
        playbackRate: 1.0, // 기본 재생 속도
        audioStartTime: 0, // 오디오 시작 시간
        audioEndTime: 100 // 오디오 끝 시간
      };
      
      // 고유 ID 생성
      const objectId = `audio_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      // 빈 트랙 생성
      const emptyTrack = {
        id: objectId,
        objectId: objectId,
        type: 'audio',
        startTime: audioData.startTime,
        duration: audioData.duration,
        volume: audioData.volume,
        mute: audioData.mute,
        playbackRate: audioData.playbackRate,
        audioStartTime: audioData.audioStartTime,
        audioEndTime: audioData.audioEndTime,
        audioFile: audioData.audioFile
      };
      
      // this.tracks에 추가
      this.tracks.set(objectId, emptyTrack);
      console.log(`✅ SidebarAssets에서 오디오 트랙 추가 완료: ${objectId}`, {
        tracksSize: this.tracks.size,
        tracksKeys: Array.from(this.tracks.keys())
      });
      
      // loadAudioFile 호출하여 트랙 생성
      this.loadAudioFile(audioFile).then((track) => {
        console.log(`✅ SidebarAssets에서 오디오 트랙 생성 성공: ${objectId}`, track);
        
        // UI 업데이트
        this.updateUI();
        
        // timelineData.tracks 동기화
        this.syncTimelineDataTracks();
        
      }).catch((error) => {
        console.error(`❌ SidebarAssets에서 오디오 트랙 생성 실패: ${objectId}`, error);
      });
      
      return objectId;
      
    } catch (error) {
      console.error("SidebarAssets에서 오디오 트랙 추가 중 오류:", error);
      throw error;
    }
  }

  // 타임라인 맞춤 토글 메서드
  toggleTimelineFit() {
    console.log("타임라인 맞춤 토글:", this.isTimelineFit);
    
    if (!this.isTimelineFit) {
      // 타임라인 크기로 맞춤
      this.fitToTimeline();
    } else {
      // 원본 크기로 복원
      this.restoreOriginalSize();
    }
  }

  // 선택된 클립을 타임라인 크기에 맞춤
  fitToTimeline() {
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite) {
      alert("클립을 먼저 선택해주세요.");
      return;
    }

    const track = this.findTrackBySprite(selectedSprite);
    if (!track) {
      console.error("선택된 클립의 트랙을 찾을 수 없습니다.");
      return;
    }

    const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
    if (!audioObject) {
      console.error("오디오 객체를 찾을 수 없습니다.");
      return;
    }

    const totalSeconds = this.getTotalSeconds();
    const currentClipEndTime = parseFloat(selectedSprite.dataset.startTime) + parseFloat(selectedSprite.dataset.duration);
    
    // 클립이 타임라인보다 크거나 같을 때만 맞춤 가능
    if (currentClipEndTime <= totalSeconds) {
      alert("클립이 이미 타임라인 범위 내에 있습니다.");
      this.updateTimelineFitButtonState();
      return;
    }

    // 원본 클립 정보 저장 (복원용)
    this.originalClipData = {
      startTime: parseFloat(selectedSprite.dataset.startTime),
      duration: parseFloat(selectedSprite.dataset.duration),
      audioStartTime: audioObject.userData.audioStartTime || 0,
      audioEndTime: audioObject.userData.audioEndTime || audioObject.userData.audioElement?.duration || 0,
      left: parseFloat(selectedSprite.style.left) || 0,
      width: parseFloat(selectedSprite.style.width) || 0
    };

    // 클립 시작 위치
    const clipStartTime = parseFloat(selectedSprite.dataset.startTime);
    
    // 타임라인 끝까지의 시간으로 조정
    const newDuration = totalSeconds - clipStartTime;
    const newWidth = (newDuration / totalSeconds) * 100;

    // 클립 크기 업데이트
    selectedSprite.style.width = `${newWidth}%`;
    selectedSprite.dataset.duration = newDuration.toString();

    // 오디오 끝 시간을 클립 길이에 맞게 조정
    const newAudioEndTime = audioObject.userData.audioStartTime + newDuration;
    audioObject.userData.audioEndTime = Math.min(
      newAudioEndTime,
      audioObject.userData.audioElement?.duration || newAudioEndTime
    );

    // input 필드 업데이트
    this.updateInputFields(audioObject.userData.audioStartTime, audioObject.userData.audioEndTime);
    this.updateClipInputFields(clipStartTime, newDuration);

    // 상태 업데이트
    this.isTimelineFit = true;
    this.timelineFitButton.textContent = "원본 크기";
    this.timelineFitButton.style.backgroundColor = "#FF9800";
    this.timelineFitButton.title = "원본 음악 크기로 복원";

    console.log("타임라인에 맞춤:", {
      newDuration,
      newWidth,
      newAudioEndTime
    });
  }

  // 원본 크기로 복원
  restoreOriginalSize() {
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    if (!selectedSprite || !this.originalClipData) {
      console.error("복원할 데이터가 없습니다.");
      return;
    }

    const track = this.findTrackBySprite(selectedSprite);
    if (!track) {
      console.error("선택된 클립의 트랙을 찾을 수 없습니다.");
      return;
    }

    const audioObject = this.editor.scene.getObjectById(parseInt(track.objectId));
    if (!audioObject) {
      console.error("오디오 객체를 찾을 수 없습니다.");
      return;
    }

    // 원본 크기로 복원
    selectedSprite.style.left = `${this.originalClipData.left}%`;
    selectedSprite.style.width = `${this.originalClipData.width}%`;
    selectedSprite.dataset.startTime = this.originalClipData.startTime.toString();
    selectedSprite.dataset.duration = this.originalClipData.duration.toString();

    // 오디오 시간 복원
    audioObject.userData.audioStartTime = this.originalClipData.audioStartTime;
    audioObject.userData.audioEndTime = this.originalClipData.audioEndTime;

    // input 필드 업데이트
    this.updateInputFields(audioObject.userData.audioStartTime, audioObject.userData.audioEndTime);
    this.updateClipInputFields(this.originalClipData.startTime, this.originalClipData.duration);

    // 상태 업데이트
    this.isTimelineFit = false;
    this.timelineFitButton.textContent = "타임라인 맞춤";
    this.timelineFitButton.style.backgroundColor = "#2196F3";
    this.timelineFitButton.title = "클립을 타임라인 크기에 맞춤 / 원본 크기로 복원 (토글)";

    // 원본 데이터 삭제
    this.originalClipData = null;

    console.log("원본 크기로 복원 완료");
  }

  // 타임라인 맞춤 버튼 상태 업데이트
  updateTimelineFitButtonState() {
    const selectedSprite = document.querySelector('.audio-sprite.selected');
    
    if (!selectedSprite) {
      // 선택된 클립이 없으면 비활성화
      this.timelineFitButton.disabled = true;
      return;
    }

    const totalSeconds = this.getTotalSeconds();
    const clipStartTime = parseFloat(selectedSprite.dataset.startTime) || 0;
    const clipDuration = parseFloat(selectedSprite.dataset.duration) || 0;
    const clipEndTime = clipStartTime + clipDuration;

    // 클립이 타임라인보다 작거나 같으면 비활성화
    if (clipEndTime <= totalSeconds) {
      this.timelineFitButton.disabled = true;
      this.timelineFitButton.title = "클립이 타임라인 범위 내에 있어 맞춤이 불필요합니다";
    } else {
      this.timelineFitButton.disabled = false;
      this.timelineFitButton.title = this.isTimelineFit ? 
        "원본 음악 크기로 복원" : 
        "클립을 타임라인 크기에 맞춤 / 원본 크기로 복원 (토글)";
    }
  }

}