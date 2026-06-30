// editor/js/SidebarAssets.video.js
import { UIPanel, UIRow, UIButton, UISelect, UIBreak, UIText, UISpan, UIDiv } from "./libs/ui.js";
import { UIBoolean } from "./libs/ui.three.js";
import { createPanel } from './ui/floatPanel.js';
import { getVideoApiUrl, VIDEO_UPLOAD_CONFIG } from "./config/video-upload-config.js";
import { VideoBackground } from './timeline/VideoBackground.js';


export function createVideoPanel(editor) {
  // 선택된 비디오 항목을 추적하는 변수
  let selectedVideoItem = null;

  // 다중 선택된 비디오 항목들을 추적하는 변수
  let selectedVideoItems = new Set();

  // VideoBackground import 확인
  console.log("🎬 VideoBackground import 상태:", {
    VideoBackground: typeof VideoBackground,
    editor: !!editor,
    scene: !!editor?.scene
  });

  // Video 패널
  const videoPanel = document.createElement("div");
  videoPanel.className = "video-panel";

  // Motion 패널 컨텐츠
  const videoContent = document.createElement("div");
  videoContent.className = "panel-content";
  videoPanel.appendChild(videoContent);

  // 비디오 목록 컨테이너
  const videoListContainer = document.createElement("div");
  videoListContainer.className = "video-list-container";
  videoContent.appendChild(videoListContainer);

  // Motion 패널 푸터
  const footer = document.createElement("div");
  footer.className = "panel-footer";
  videoPanel.appendChild(footer);

  // 업로드 섹션
  const uploadSection = document.createElement("div");
  uploadSection.className = "upload-section";

  // 파일 선택 버튼
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.id = "videoFileInput";
  fileInput.multiple = true; // 다중 선택 활성화
  fileInput.accept = "video/*";
  fileInput.style.display = "none";
  uploadSection.appendChild(fileInput);

  const uploadBtn = new UIButton("");
  uploadBtn.setInnerHTML("<i class='fas fa-upload'></i>");
  uploadBtn.dom.title = "비디오 업로드";
  uploadBtn.onClick(async (event) => {
    event.preventDefault();
    event.stopPropagation();

    console.log("비디오 업로드 시작...");

    // 수정: getVideoApiUrl 사용하여 올바른 서버 URL 생성
    try {
      const healthResponse = await fetch(getVideoApiUrl(VIDEO_UPLOAD_CONFIG.ENDPOINTS.HEALTH), {
        method: 'GET',
        mode: 'cors',
        credentials: 'include'
      });

      if (!healthResponse.ok) {
        alert("서버에 연결할 수 없습니다. 서버를 시작해주세요.");
        return;
      }



      // 파일 선택 다이얼로그 열기
      fileInput.click();

    } catch (error) {
      console.error("❌ 서버 연결 확인 실패:", error);
      alert("서버에 연결할 수 없습니다. 서버를 시작해주세요.");
    }
  });

  footer.appendChild(uploadBtn.dom);
  videoContent.appendChild(uploadSection);

  // 파일 업로드 처리
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    console.log("📁 선택된 파일:", file);

    try {
      // 수정: 함수명 변경하여 중복 제거
      if (!validateVideoFile(file)) {
        return;
      }

      // 업로드 진행 상태 표시
      showUploadProgress(file.name);

      // 파일을 서버에 업로드
      const success = await uploadFileToServer(file);

      if (success) {
        // 성공 메시지 표시
        showUploadSuccess(file.name);

        // 파일 입력 초기화
        fileInput.value = "";

        // 비디오 목록 새로고침
        setTimeout(async () => {
          try {
            await loadVideoFilesFromFolder();
            console.log("✅ 비디오 목록 새로고침 완료");
          } catch (error) {
            console.error("❌ 비디오 목록 새로고침 실패:", error);
          }
        }, 1500);

      } else {
        showUploadError("파일 업로드에 실패했습니다.");
      }

    } catch (error) {
      console.error("❌ 파일 업로드 오류:", error);
      showUploadError(`업로드 오류: ${error.message}`);
    }
  });

  // 삭제 버튼 상태 업데이트
  function updateDeleteButton() {
    if (deleteBtn && deleteBtn.dom) {
      if (selectedVideoItems.size > 0) {
        deleteBtn.dom.disabled = false;
        deleteBtn.dom.style.opacity = "1";
        // 선택된 파일 수에 따라 텍스트 설정
        if (selectedVideoItems.size === 1) {
          const filename = Array.from(selectedVideoItems)[0].dataset.filename;
          deleteBtn.dom.title = `선택된 비디오: ${filename}`;
        } else {
          deleteBtn.dom.title = `선택된 비디오: ${selectedVideoItems.size}개`;
        }
      } else {
        deleteBtn.dom.disabled = true;
        deleteBtn.dom.style.opacity = "0.5";
        deleteBtn.dom.title = "삭제할 비디오를 선택해주세요";
      }
    }
  }

  // 비디오 목록 로드
  loadVideoFilesFromFolder();

  // 전역 클릭 핸들러 설정
  setupGlobalClickHandler();


  // 새로고침 버튼
  const refreshBtn = new UIButton("");
  refreshBtn.setInnerHTML("<i class='fas fa-retweet'></i>");
  refreshBtn.dom.title = "목록 새로고침";
  refreshBtn.onClick(async () => {
    await loadVideoFilesFromFolder();
  });

  // 삭제 버튼 (초기에는 비활성화)
  const deleteBtn = new UIButton("");
  deleteBtn.setInnerHTML("<i class='fas fa-trash'></i>");
  deleteBtn.setClass("Button");
  deleteBtn.dom.className += " delete-video-btn";
  deleteBtn.dom.disabled = true;
  deleteBtn.dom.style.opacity = "0.5";
  deleteBtn.dom.title = "삭제할 비디오를 선택해주세요";
  deleteBtn.onClick(async () => {
    if (selectedVideoItems.size > 0) {
      await deleteSelectedVideo();
    } else {
      alert("삭제할 비디오를 선택해주세요.");
    }
  });

  footer.appendChild(refreshBtn.dom);
  footer.appendChild(deleteBtn.dom);
  videoPanel.appendChild(footer);

  // 선택 해제 함수
  function clearSelection() {
    if (selectedVideoItem) {
      selectedVideoItem.classList.remove('selected');
      selectedVideoItem = null;
    }

    // 다중 선택된 항목들도 모두 해제
    selectedVideoItems.forEach(item => {
      item.classList.remove('selected');
    });
    selectedVideoItems.clear();

    updateDeleteButton();
    console.log("🎬 비디오 항목 선택 해제됨");
  }

  // 문서 전체 클릭 이벤트 (선택 해제용)
  function setupGlobalClickHandler() {
    document.addEventListener('click', (event) => {
      // video-item이나 관련 버튼을 클릭한 경우는 제외
      if (event.target.closest('.video-item') ||
        event.target.closest('.delete-video-btn') ||
        event.target.closest('.add-btn')) {
        return;
      }

      // 다른 곳을 클릭하면 선택 해제
      clearSelection();
    });
  }

  // 초기 삭제 버튼 상태 설정
  updateDeleteButton();

  // 비디오 파일 목록 로드
  async function loadVideoFilesFromFolder() {
    try {
      console.log("🎬 비디오 폴더 스캔 시작...");

      const response = await fetch(getVideoApiUrl(VIDEO_UPLOAD_CONFIG.ENDPOINTS.GET_VIDEOS));

      if (response.ok) {
        const videoFiles = await response.json();
        console.log("✅ 비디오 파일 목록 로드 완료:", videoFiles);

        // 서버에서 받은 데이터를 그대로 사용
        const processedFiles = videoFiles.map(file => {
          console.log("처리 중인 파일:", file);
          return {
            path: `..${file.path}`, // 상대 경로로 변환
            name: file.name,
            displayName: file.displayName,
            filename: file.filename// 실제 파일명 (확장자 포함)
          };
        });

        console.log("처리된 파일 목록:", processedFiles);
        displayVideoList(videoFiles);
        // 선택 상태 초기화
        clearSelection();
        return processedFiles;
      } else {
        console.warn("서버에서 비디오 파일 목록을 가져올 수 없습니다. 기본 목록 사용");
        throw new Error(`HTTP ${response.status}`);
      }

    } catch (error) {
      console.error("❌ 비디오 폴더 스캔 실패:", error);

      // 서버 연결 실패 시 기본 비디오 파일 표시
      const defaultVideos = [
        {
          path: "../files/video/video3.mp4",
          name: "video3",
          displayName: "Video 3",
          filename: "video3.mp4"
        }, {
          path: "../files/video/video4.mp4",
          name: "video4",
          displayName: "video4",
          filename: "video4.mp4"
        }
      ];

      displayVideoList(defaultVideos);
    }
  }
  // 비디오 소스 변경 함수 추가
  function changeVideoSource(filename) {
    try {
      console.log("🎬 비디오 소스 변경:", filename);

      // 기존 VideoBackground 찾기
      let videoBackground = null;

      if (editor.videoBackground) {
        videoBackground = editor.videoBackground;
      } else if (window.timeline && window.timeline.timelines && window.timeline.timelines.motion) {
        const motionTimeline = window.timeline.timelines.motion;
        if (motionTimeline.editor && motionTimeline.editor.videoBackground) {
          videoBackground = motionTimeline.editor.videoBackground;
        }
      }

      if (videoBackground) {
        // 현재 재생 상태 저장
        const wasPlaying = videoBackground.isPlaying;

        // 비디오 소스 변경
        const videoPath = `../files/video/${filename}`;
        const loadSuccess = videoBackground.loadVideo(videoPath);

        if (loadSuccess) {
          console.log("비디오 소스 변경 완료:", filename);

          // 이전에 재생 중이었다면 새 비디오도 재생
          if (wasPlaying) {
            setTimeout(() => {
              if (videoBackground.isVideoLoaded()) {
                videoBackground.playVideo();
                console.log("새 비디오 재생 시작");
              }
            }, 1000);
          }

          // 성공 메시지 표시
          showChangeSuccess(filename);

        } else {
          throw new Error("비디오 소스 변경에 실패했습니다");
        }
      } else {
        // VideoBackground가 없으면 새로 생성
        addVideoToScene(filename);
      }

    } catch (error) {
      console.error("❌ 비디오 소스 변경 중 오류:", error);
      showChangeError(error.message);
    }
  }

  // 비디오 목록 표시
  function displayVideoList(videoFiles) {
    videoListContainer.innerHTML = "";

    if (videoFiles.length === 0) {
      const noVideos = new UIDiv();
      noVideos.setClass("no-videos");
      noVideos.setTextContent("비디오 파일이 없습니다");
      videoListContainer.add(noVideos);
      return;
    }

    videoFiles.forEach(videoFile => {
      const videoItem = new UIDiv();
      videoItem.setClass("video-item");
      videoItem.dom.dataset.filename = videoFile.filename;

      // 비디오 정보
      const videoInfo = new UIDiv();
      videoInfo.setClass("video-info");

      const videoName = new UISpan();
      videoName.setTextContent(videoFile.filename);
      videoName.setClass("video-name");

      const videoSize = new UISpan();
      videoSize.setTextContent(formatFileSize(videoFile.size));
      videoSize.setClass("video-size");

      videoInfo.add(videoName);
      videoInfo.add(videoSize);

      // 추가 버튼 - setTitle 대신 dom.title 사용
      const addBtn = new UIButton();
      addBtn.setInnerHTML("<i class='fas fa-plus'></i>");
      addBtn.setClass("add-btn sb-dock-btn sb-dock-btn--icon");
      addBtn.dom.title = "씬에 비디오 배경 추가"; // setTitle 대신 dom.title 사용
      // 중복 추가 방지를 위한 상태 추적
      let isAdding = false;
      addBtn.onClick((event) => {
        event.preventDefault();
        event.stopPropagation();

        if (isAdding) {
          console.log("이미 추가 중입니다...");
          return;
        }

        // 버튼 상태 변경
        isAdding = true;
        addBtn.dom.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 비디오 변경 중...';
        addBtn.dom.disabled = true;
        addBtn.dom.classList.add('adding');
        const loadSuccess = addVideoToScene(videoFile.filename);

        if (loadSuccess) {
          console.log("✅ 비디오 추가 완료:", videoFile.filename);
          // 3초 후 원래 상태로 복원
          setTimeout(() => {
            console.log("🎬 비디오 추가 완료:", videoFile.filename);
            addBtn.dom.innerHTML = '<i class="fas fa-plus"></i>';
            addBtn.dom.classList.remove('success');
            addBtn.dom.disabled = false;
            isAdding = false;
          }, 3000);
        } else {
          console.error("❌ 비디오 추가 실패:", videoFile.filename);
          // 버튼 상태 복원
          addBtn.dom.innerHTML = '<i class="fas fa-plus"></i>';
          addBtn.dom.classList.remove('adding');
          addBtn.dom.disabled = false;
          isAdding = false;
        }

      });

      videoItem.add(videoInfo);
      videoItem.add(addBtn);

      // 비디오 항목 클릭 이벤트 (토글 선택 지원)
      videoItem.dom.addEventListener("click", (event) => {
        // 버튼 클릭은 제외
        if (event.target.closest('.add-btn')) {
          return;
        }

        // Ctrl/Cmd + 클릭으로 다중 선택/해제
        if (event.ctrlKey || event.metaKey) {
          event.preventDefault();

          if (selectedVideoItems.has(videoItem.dom)) {
            // 이미 선택된 항목이면 선택 해제
            selectedVideoItems.delete(videoItem.dom);
            videoItem.dom.classList.remove('selected');
            console.log("🎬 비디오 항목 선택 해제됨:", videoFile.filename);
          } else {
            // 새로 선택
            selectedVideoItems.add(videoItem.dom);
            videoItem.dom.classList.add('selected');
            console.log("🎬 비디오 항목 다중 선택됨:", videoFile.filename);
          }
        } else {
          // 일반 클릭으로 토글 선택
          if (selectedVideoItems.has(videoItem.dom)) {
            // 이미 선택된 항목이면 선택 해제
            selectedVideoItems.delete(videoItem.dom);
            videoItem.dom.classList.remove('selected');
            console.log("🎬 비디오 항목 선택 해제됨:", videoFile.filename);
          } else {
            // 새로 선택
            selectedVideoItems.add(videoItem.dom);
            videoItem.dom.classList.add('selected');
            console.log("🎬 비디오 항목 선택됨:", videoFile.filename);
          }
        }

        // 단일 선택 상태 업데이트 (휴지통 버튼용)
        if (selectedVideoItems.size === 1) {
          selectedVideoItem = Array.from(selectedVideoItems)[0];
        } else {
          selectedVideoItem = null;
        }

        // 삭제 버튼 상태 업데이트
        updateDeleteButton();
      });

      videoListContainer.appendChild(videoItem.dom);
    });
  }

  // 비디오 항목 선택
  function selectVideoItem(videoItem, filename) {
    // 기존 선택 해제
    videoListContainer.querySelectorAll(".video-item").forEach(item => {
      item.classList.remove("selected");
    });

    // 현재 항목 선택
    videoItem.dom.classList.add("selected");

    // 삭제 버튼 활성화
    deleteBtn.dom.disabled = false;
    deleteBtn.dom.title = `선택된 비디오: ${filename}`;

    console.log("🎬 비디오 항목 선택됨:", filename);
  }

  // 비디오 파일 검증
  function validateVideoFile(file) {
    const validTypes = ['video/mp4', 'video/webm', 'video/ogg', 'video/avi', 'video/mov'];
    const maxSize = 500 * 1024 * 1024; // 500MB

    if (!validTypes.includes(file.type)) {
      alert("지원되지 않는 비디오 형식입니다. MP4, WebM, OGG, AVI, MOV 파일만 지원됩니다.");
      return false;
    }

    if (file.size > maxSize) {
      alert("파일 크기가 너무 큽니다. 500MB 이하의 파일만 업로드 가능합니다.");
      return false;
    }

    return true;
  }

  // 서버에 비디오 파일 업로드
  async function uploadFileToServer(file) {
    try {
      console.log("🎬 비디오 업로드 요청 시작:", file.name);

      const formData = new FormData();
      formData.append('video', file);

      const response = await fetch(getVideoApiUrl(VIDEO_UPLOAD_CONFIG.ENDPOINTS.UPLOAD), {
        method: 'POST',
        body: formData,
        mode: 'cors',
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`업로드 실패: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();
      console.log("✅ 비디오 업로드 완료:", result);

      // 성공 메시지 표시
      showUploadSuccess(file.name);

      return true; // 성공 시 true 반환

    } catch (error) {
      console.error("❌ 업로드 중 오류:", error);
      showUploadError(error.message);
      return false; // 실패 시 false 반환
    }
  }

  // 선택된 비디오 삭제
  async function deleteSelectedVideo() {
    if (selectedVideoItems.size === 0) {
      alert("삭제할 비디오를 선택해주세요.");
      return;
    }

    // 다중 선택된 파일들의 정보 수집
    const filesToDelete = Array.from(selectedVideoItems).map(item => ({
      filename: item.dataset.filename,
      displayName: item.dataset.filename
    }));

    // 삭제 확인 메시지
    let confirmMessage;
    if (filesToDelete.length === 1) {
      const file = filesToDelete[0];
      confirmMessage = `정말로 "${file.displayName}" 파일을 삭제하시겠습니까?`;
    } else {
      const fileNames = filesToDelete.map(f => f.displayName).join(', ');
      confirmMessage = `정말로 ${filesToDelete.length}개 파일을 삭제하시겠습니까?\n\n${fileNames}`;
    }

    if (!confirm(confirmMessage)) {
      return;
    }

    try {
      console.log("🗑️ 비디오 파일 삭제 시작:", filesToDelete.length, "개");

      // 모든 선택된 파일을 순차적으로 삭제
      const results = [];
      for (let i = 0; i < filesToDelete.length; i++) {
        const fileInfo = filesToDelete[i];
        console.log(`🗑️ 파일 ${i + 1}/${filesToDelete.length} 삭제 중:`, fileInfo.filename);

        try {
          // 서버에 삭제 요청
          const response = await fetch(getVideoApiUrl(VIDEO_UPLOAD_CONFIG.ENDPOINTS.DELETE_VIDEO, fileInfo.filename), {
            method: 'DELETE',
            mode: 'cors',
            credentials: 'include'
          });

          if (response.ok) {
            console.log(`✅ ${fileInfo.filename} 삭제 성공`);
            results.push({ filename: fileInfo.filename, success: true });
          } else {
            const errorText = await response.text();
            console.error(`❌ ${fileInfo.filename} 삭제 실패:`, response.status, errorText);
            results.push({ filename: fileInfo.filename, success: false, error: `HTTP ${response.status}: ${errorText}` });
          }
        } catch (error) {
          console.error(`❌ ${fileInfo.filename} 삭제 중 오류:`, error);
          results.push({ filename: fileInfo.filename, success: false, error: error.message });
        }
      }

      // 결과 분석
      const successfulDeletes = results.filter(r => r.success);
      const failedDeletes = results.filter(r => !r.success);

      // 결과 표시
      if (successfulDeletes.length > 0) {
        if (successfulDeletes.length === 1) {
          alert(`"${successfulDeletes[0].filename}" 파일이 삭제되었습니다.`);
        } else {
          alert(`${successfulDeletes.length}개 파일이 성공적으로 삭제되었습니다.`);
        }
        console.log("✅ 삭제 성공한 파일들:", successfulDeletes.map(r => r.filename));
      }

      if (failedDeletes.length > 0) {
        const failedNames = failedDeletes.map(r => r.filename).join(', ');
        alert(`${failedDeletes.length}개 파일 삭제에 실패했습니다:\n${failedNames}`);
        console.error("❌ 삭제 실패한 파일들:", failedDeletes);
      }

      // 선택 상태 초기화
      clearSelection();

      // 목록 새로고침
      await loadVideoFilesFromFolder();

    } catch (error) {
      console.error("❌ 비디오 파일 삭제 중 오류:", error);
      alert(`파일 삭제 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // 씬에 비디오 배경 추가
  async function addVideoToScene(filename) {
    try {
      console.log("🎬 비디오 배경 추가:", filename);

      // 기존 VideoBackground 찾기
      let videoBackground = editor.videoBackground;

      // 없으면 새로 생성
      if (!videoBackground) {
        videoBackground = new VideoBackground(editor);
        editor.videoBackground = videoBackground;
        console.log("✅ 새로운 VideoBackground 생성");

        // 씬에 비디오 배경 추가
        videoBackground.createVideoBackground(editor.scene);
      } else {
        console.log("✅ 기존 VideoBackground 재사용");
      }

      // 비디오 소스 변경 전에 기존 비디오 정지
      if (videoBackground.isPlaying) {
        console.log("⏸️ 기존 비디오 정지");
        videoBackground.pauseVideo();
      }

      // 비디오 소스 변경
      const videoPath = `../files/video/${filename}`;
      console.log(" 비디오 파일 로드:", videoPath);

      // 기존 비디오 요소 정리
      if (videoBackground.videoElement) {
        videoBackground.videoElement.pause();
        videoBackground.videoElement.currentTime = 0;
        videoBackground.videoElement.src = '';
        videoBackground.videoElement.load();
      }

      // 새 비디오 로드
      const loadSuccess = videoBackground.loadVideo(videoPath);

      if (loadSuccess) {
        console.log("✅ 비디오 로드 성공");

        // 비디오 로드 완료 후 재생 준비
        setTimeout(() => {
          if (videoBackground.isVideoLoaded()) {
            console.log("✅ 비디오 로드 완료, 재생 준비");

            // 비디오 재생 준비 (자동 재생은 하지 않음)
            videoBackground.videoElement.currentTime = 0;
            videoBackground.videoElement.volume = 0.5;
            videoBackground.videoElement.muted = true;

            console.log("🎬 비디오 재생 준비 완료:", filename);
            requestSceneUpdate()

          } else {
            console.log("⚠️ 비디오 로드 실패 또는 대기 중");
          }
        }, 1000);

      } else {
        console.error("❌ 비디오 로드 실패");
      }

      console.log("✅ 비디오 추가 완료:", filename);

    } catch (error) {
      console.error("❌ 비디오 추가 실패:", error);
    }
  }

  // 씬 업데이트 요청 함수
  function requestSceneUpdate() {
    try {

      if (editor.signals && editor.signals.rendererUpdated) {
        editor.signals.rendererUpdated.dispatch();
        console.log("✅ rendererUpdated 시그널 디스패치");
      }


    } catch (error) {
      console.error("❌ 씬 업데이트 요청 실패:", error);
    }
  }

  // 파일 크기 포맷팅
  function formatFileSize(bytes) {
    if (typeof bytes === 'string') return bytes;

    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';

    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  }

  // 업로드 진행 상태 표시
  function showUploadProgress(fileName) {
    const existingProgress = uploadSection.querySelector(".upload-progress");
    if (existingProgress) existingProgress.remove();

    const progressDiv = document.createElement("div");
    progressDiv.className = "upload-progress";
    progressDiv.innerHTML = `
      <div class="progress-text">📤 ${fileName} 업로드 중...</div>
      <div class="progress-bar">
        <div class="progress-fill"></div>
      </div>
    `;

    uploadSection.appendChild(progressDiv);
  }

  // 성공/오류 메시지 표시
  function showUploadSuccess(filename) {
    showMessage(`✅ "${filename}" 업로드 완료`, 'success');
  }

  function showUploadError(message) {
    showMessage(`❌ 업로드 실패: ${message}`, 'error');
  }

  function showMessage(text, type = 'info') {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    message.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 10px 15px;
            border-radius: 4px;
            color: white;
            z-index: 10000;
            font-size: 14px;
            background: ${type === 'success' ? '#4CAF50' : type === 'error' ? '#f44336' : '#2196F3'};
        `;

    document.body.appendChild(message);

    setTimeout(() => {
      if (message.parentNode) {
        document.body.removeChild(message);
      }
    }, 3000);
  }

  return videoPanel;
}