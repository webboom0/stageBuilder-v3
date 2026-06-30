// editor/js/timeline/TimelineRenderer.js
// 타임라인 렌더링을 위한 별도 클래스

class TimelineRenderer {
  constructor(editor) {
    this.editor = editor;
    this.isRendering = false;
    this.renderPopup = null;
    this.renderCanvas = null;
    this.renderRenderer = null;
    this.renderScene = null;
    this.renderCamera = null;
    this.animationLoopId = null;
    this.isRenderingActive = false;

    // 🎬 렌더링된 프레임 저장소 추가
    this.renderedFrames = [];
    this.currentFrameIndex = 0;
    this.renderClock = new THREE.Clock();

    // 🎬 애니메이션 테스트 관련 변수 추가
    this.isTestAnimationActive = false;
    this.testAnimationLoopId = null;
    this.testAnimationClock = new THREE.Clock();

    // 🎬 UUID 매핑을 위한 Map 추가
    this.uuidMapping = new Map();
  }

  // 🎬 렌더링 팝업 생성
  createRenderPopup() {
    try {
      console.log("🎬 렌더링 팝업 생성 시작...");

      // 🎯 렌더링 팝업 열릴 때 MotionTimeline과 LightTimeline의 선택된 키프레임 해제
      this.deselectTimelineKeyframes();
      
      // 기존 팝업이 있으면 제거
      const existingPopup = document.querySelector('.render-popup');
      if (existingPopup) {
        existingPopup.remove();
      }

      // 팝업 컨테이너 생성
      const popup = document.createElement('div');
      popup.className = 'render-popup';
      popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: #1a1a1a;
        border: 2px solid #4CAF50;
        border-radius: 12px;
        z-index: 9999;
        display: flex;
        flex-direction: column;
        box-shadow: 0 8px 32px rgba(0,0,0,0.8);
        max-height: 90vh;
        overflow: auto;
      `;
      
      // 팝업 헤더
      const header = document.createElement('div');
      header.style.cssText = `
        padding: 15px 20px;
        border-bottom: 1px solid #333;
        display: flex;
        justify-content: space-between;
        align-items: center;
      `;
      header.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 5px;">
          <h3 style="margin: 0; color: #4CAF50; font-size: 18px;">🎬 타임라인 렌더링 뷰어</h3>
          <div style="font-size: 12px; color: #888; display: none;">
            🖱️ 좌클릭+드래그: 회전 | 🖱️ 우클릭+드래그: 이동 | 🖱️ 휠: 줌 | 🎮 버튼: 정밀 조정
          </div>
        </div>
        <div style="display: flex; gap: 10px; align-items: center;">
          <button id="render-mute-btn" type="button" title="렌더링 중 오디오 음소거" style="display: none; background: #444; border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer;"><i class="fas fa-volume-up"></i> 소리</button>
          <button id="start-render-btn" style="background: #4CAF50; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold;"><i class="fas fa-play"></i> 렌더링 시작</button>
          <button id="download-video-btn" style="background: #2196F3; border: none; color: white; padding: 8px 16px; border-radius: 4px; cursor: pointer; font-weight: bold; display: none;"> 비디오 다운로드</button>
          <button id="close-render-popup" style="background: #666; border: none; color: white; padding: 8px 12px; border-radius: 4px; cursor: pointer;">닫기</button>
        </div>
      `;
      
      // 캔버스 컨테이너
      const canvasContainer = document.createElement('div');
      canvasContainer.style.cssText = `
        flex: 1;
        padding: 20px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background: #000;
        border-radius: 0 0 10px 10px;
        gap: 20px;
      `;
      
      // 렌더링 상태 표시
      const renderStatus = document.createElement('div');
      renderStatus.id = 'render-status';
      renderStatus.style.cssText = `
        color: #888;
        font-size: 14px;
        text-align: center;
        padding: 10px;
        background: #222;
        border-radius: 5px;
        min-width: 300px;
        display: none;
      `;
      renderStatus.innerHTML = '⏸️ 렌더링 대기 중... (시작 버튼을 클릭하세요)';

      // 🎬 렌더링 설정 패널
      const renderSettings = document.createElement('div');
      renderSettings.id = 'render-settings';
      renderSettings.style.cssText = `
        display: flex;
        gap: 20px;
        padding: 15px;
        background: #222;
        border-radius: 8px;
        flex-wrap: wrap;
        justify-content: center;
        align-items: flex-end;
      `;

      // 해상도 설정
      const resolutionDiv = document.createElement('div');
      resolutionDiv.style.cssText = 'display: flex; flex-direction: column; gap: 5px;';
      resolutionDiv.innerHTML = `
        <label style="color: #4CAF50; font-size: 12px;">해상도</label>
        <select id="resolution-select" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 5px;">
          <option value="1920x1080">1920x1080 (Full HD)</option>
          <option value="1280x720" selected>1280x720 (HD)</option>
          <option value="800x450">800x450 (Preview)</option>
        </select>
      `;

      // FPS 설정
      const fpsDiv = document.createElement('div');
      fpsDiv.style.cssText = 'display: flex; flex-direction: column; gap: 5px;';
      fpsDiv.innerHTML = `
        <label style="color: #4CAF50; font-size: 12px;">FPS</label>
        <select id="fps-select" class="disabled" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 5px;" disabled>
          <option value="30">30 FPS</option>
          <option value="60">60 FPS</option>
          <option value="24">24 FPS</option>
        </select>
      `;

      // 지속시간 설정
      const durationDiv = document.createElement('div');
      durationDiv.style.cssText = 'display: flex; flex-direction: column; gap: 5px;';
      // 타임라인에서 총 지속시간 가져오기
      durationDiv.innerHTML = `
        <label style="color: #4CAF50; font-size: 12px;">지속시간 (초)</label>
        <input type="number" id="duration-input" class="disabled" value="10" min="1" max="300" style="background: #333; color: white; border: 1px solid #555; border-radius: 4px; padding: 5px; width: 80px;" disabled>
      `;

      renderSettings.appendChild(resolutionDiv);
      renderSettings.appendChild(fpsDiv);
      renderSettings.appendChild(durationDiv);

      // 🎬 렌더링 프로그레스바
      const progressContainer = document.createElement('div');
      progressContainer.id = 'progress-container';
      progressContainer.style.cssText = `
        display: none;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        max-width: 500px;
      `;

      const progressBar = document.createElement('div');
      progressBar.id = 'progress-bar';
      progressBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: #333;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #555;
      `;

      const progressFill = document.createElement('div');
      progressFill.id = 'progress-fill';
      progressFill.style.cssText = `
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #4CAF50, #45a049);
        transition: width 0.3s ease;
      `;

      const progressText = document.createElement('div');
      progressText.id = 'progress-text';
      progressText.style.cssText = `
        color: #4CAF50;
        font-size: 14px;
        text-align: center;
        font-weight: bold;
      `;
      progressText.innerHTML = '0% 완료';

      // 🎬 프레임 정보 표시
      const frameInfo = document.createElement('div');
      frameInfo.id = 'frame-info';
      frameInfo.style.cssText = `
        color: #888;
        font-size: 12px;
        text-align: center;
        padding: 5px;
        background: #222;
        border-radius: 4px;
        display: none;
      `;
      frameInfo.innerHTML = '프레임: 0 / 0 | 크기: 0KB';

      // 🎬 비디오 다운로드 프로그레스바
      const videoProgressContainer = document.createElement('div');
      videoProgressContainer.id = 'video-progress-container';
      videoProgressContainer.style.cssText = `
        display: none;
        flex-direction: column;
        gap: 10px;
        width: 100%;
        max-width: 500px;
      `;

      const videoProgressBar = document.createElement('div');
      videoProgressBar.id = 'video-progress-bar';
      videoProgressBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: #333;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid #555;
      `;

      const videoProgressFill = document.createElement('div');
      videoProgressFill.id = 'video-progress-fill';
      videoProgressFill.style.cssText = `
        width: 0%;
        height: 100%;
        background: linear-gradient(90deg, #2196F3, #1976D2);
        transition: width 0.3s ease;
      `;

      const videoProgressText = document.createElement('div');
      videoProgressText.id = 'video-progress-text';
      videoProgressText.style.cssText = `
        color: #2196F3;
        font-size: 14px;
        text-align: center;
        font-weight: bold;
      `;
      videoProgressText.innerHTML = '0% 완료';

      videoProgressBar.appendChild(videoProgressFill);
      videoProgressContainer.appendChild(videoProgressBar);
      videoProgressContainer.appendChild(videoProgressText);

      progressBar.appendChild(progressFill);
      // 🎬 시간 표시 요소 추가
      const timeDisplay = document.createElement('div');
      timeDisplay.id = 'time-display';
      timeDisplay.style.cssText = `
        color: #4CAF50;
        font-size: 16px;
        font-weight: bold;
        text-align: center;
        padding: 10px;
        background: #222;
        border-radius: 4px;
        font-family: monospace;
        display: none;
      `;
      timeDisplay.innerHTML = '00:00:00';

      progressContainer.appendChild(progressBar);
      progressContainer.appendChild(progressText);
      progressContainer.appendChild(frameInfo);
      progressContainer.appendChild(timeDisplay);

      // 🎬 캔버스 컨트롤 버튼들
      const canvasControls = document.createElement('div');
      canvasControls.id = 'canvas-controls';
      canvasControls.style.cssText = `
        display: flex;
        gap: 10px;
        padding: 10px;
        background: #222;
        border-radius: 8px;
        flex-wrap: wrap;
        justify-content: center;
      `;

      // 줌 인/아웃 버튼
      const zoomInBtn = document.createElement('button');
      zoomInBtn.id = 'zoom-in-btn';
      zoomInBtn.innerHTML = '<i class="fas fa-search-minus"></i>';
      zoomInBtn.style.cssText = `
        background: #4CAF50;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      const zoomOutBtn = document.createElement('button');
      zoomOutBtn.id = 'zoom-out-btn';
      zoomOutBtn.innerHTML = '<i class="fas fa-search-plus"></i>';
      zoomOutBtn.style.cssText = `
        background: #4CAF50;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      // 회전 버튼들
      const rotateLeftBtn = document.createElement('button');
      rotateLeftBtn.id = 'rotate-left-btn';
      rotateLeftBtn.innerHTML = '<i class="fas fa-sync-alt"></i> left';
      rotateLeftBtn.style.cssText = `
        background: #FF9800;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      const rotateRightBtn = document.createElement('button');
      rotateRightBtn.id = 'rotate-right-btn';
      rotateRightBtn.innerHTML = '<i class="fas fa-sync-alt"></i> right</i>';
      rotateRightBtn.style.cssText = `
        background: #FF9800;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      // 🎬 이동 버튼들 추가
      const moveUpBtn = document.createElement('button');
      moveUpBtn.id = 'move-up-btn';
      moveUpBtn.innerHTML = '<i class="fas fa-arrow-up"></i>';
      moveUpBtn.style.cssText = `
        background: #607D8B;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      const moveDownBtn = document.createElement('button');
      moveDownBtn.id = 'move-down-btn';
      moveDownBtn.innerHTML = '<i class="fas fa-arrow-down"></i>';
      moveDownBtn.style.cssText = `
        background: #607D8B;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      const moveLeftBtn = document.createElement('button');
      moveLeftBtn.id = 'move-left-btn';
      moveLeftBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
      moveLeftBtn.style.cssText = `
        background: #607D8B;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      const moveRightBtn = document.createElement('button');
      moveRightBtn.id = 'move-right-btn';
      moveRightBtn.innerHTML = '<i class="fas fa-arrow-right"></i>';
      moveRightBtn.style.cssText = `
        background: #607D8B;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      // 리셋 버튼
      const resetViewBtn = document.createElement('button');
      resetViewBtn.id = 'reset-view-btn';
      resetViewBtn.innerHTML = 'RESET';
      resetViewBtn.style.cssText = `
        background: #9C27B0;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
      `;

      // 🎬 visible 디버깅 버튼 추가
      const debugVisibleBtn = document.createElement('button');
      debugVisibleBtn.id = 'debug-visible-btn';
      debugVisibleBtn.innerHTML = '🔍 Debug Visible';
      debugVisibleBtn.style.cssText = `
        background: #E91E63;
        border: none;
        color: white;
        padding: 8px 12px;
        border-radius: 4px;
        cursor: pointer;
        font-weight: bold;
        font-size: 14px;
        display: none;
      `;

      canvasControls.appendChild(zoomInBtn);
      canvasControls.appendChild(zoomOutBtn);
      canvasControls.appendChild(rotateLeftBtn);
      canvasControls.appendChild(rotateRightBtn);
      canvasControls.appendChild(moveUpBtn);
      canvasControls.appendChild(moveDownBtn);
      canvasControls.appendChild(moveLeftBtn);
      canvasControls.appendChild(moveRightBtn);
      canvasControls.appendChild(resetViewBtn);
      canvasControls.appendChild(debugVisibleBtn);
      
      // 렌더링 캔버스
      const renderCanvas = document.createElement('canvas');
      renderCanvas.id = 'render-canvas';
      renderCanvas.width = 1200;
      renderCanvas.height = 600;
      renderCanvas.style.cssText = `
        border: 1px solid #333;
        background: #000;
        cursor: grab;
      `;
      
      canvasContainer.appendChild(renderStatus);
      canvasContainer.appendChild(renderSettings);
      canvasContainer.appendChild(progressContainer);
      canvasContainer.appendChild(videoProgressContainer); // 비디오 다운로드 프로그레스바 추가
      canvasContainer.appendChild(canvasControls); // 캔버스 컨트롤 추가
      canvasContainer.appendChild(renderCanvas);

      
      // 팝업에 요소들 추가
      popup.appendChild(header);
      popup.appendChild(canvasContainer);
      
      // body에 팝업 추가
      document.body.appendChild(popup);
      
      // 이벤트 바인딩
      this.bindPopupEvents(popup, renderCanvas, renderStatus);
      
      // 렌더링 객체들 생성
      this.createRenderObjects(renderCanvas);

      // 🎬 초기 시간 표시 설정
      this.updateTimeDisplay(0);
      
      this.renderPopup = popup;
      this.renderCanvas = renderCanvas;
      
      console.log("✅ 렌더링 팝업 생성 완료");
      
    } catch (error) {
      console.error("❌ 렌더링 팝업 생성 실패:", error);
      throw error;
    }
  }

  // 🎬 팝업 이벤트 바인딩
  bindPopupEvents(popup, canvas, statusElement) {
    // 렌더링 시작 버튼
    const startRenderBtn = popup.querySelector('#start-render-btn');
    startRenderBtn.addEventListener('click', () => {
      console.log("🎬 렌더링 시작 버튼 클릭됨");
      this.startRenderProcess(canvas, statusElement, startRenderBtn);
    });
    // 비디오 다운로드 버튼
    const downloadBtn = popup.querySelector('#download-video-btn');
    downloadBtn.addEventListener('click', () => {
      console.log("📥 비디오 다운로드 버튼 클릭됨");
      this.downloadVideo();
    });

    // 🎬 렌더링 중 오디오 음소거 버튼
    const muteBtn = popup.querySelector('#render-mute-btn');
    if (muteBtn) {
      muteBtn.addEventListener('click', () => {
        this._renderMuted = !this._renderMuted;
        if (this._renderAudioResult && this._renderAudioResult.setMuted) {
          this._renderAudioResult.setMuted(this._renderMuted);
        }
        muteBtn.title = this._renderMuted ? '소리 켜기' : '렌더링 중 오디오 음소거';
        muteBtn.innerHTML = this._renderMuted ? '<i class="fas fa-volume-mute"></i> 음소거' : '<i class="fas fa-volume-up"></i> 소리';
      });
    }

    // 🎬 해상도 변경 이벤트
    const resolutionSelect = popup.querySelector('#resolution-select');
    resolutionSelect.addEventListener('change', () => {
      console.log("🎬 해상도 변경됨:", resolutionSelect.value);
      this.updateResolution(canvas, resolutionSelect.value);
    });

    // 🎬 FPS 변경 이벤트
    const fpsSelect = popup.querySelector('#fps-select');
    fpsSelect.addEventListener('change', () => {
      console.log("🎬 FPS 변경됨:", fpsSelect.value);
      this.updateFPS(parseInt(fpsSelect.value));
    });

    // 🎬 지속시간 변경 이벤트
    const durationInput = popup.querySelector('#duration-input');
    if (this.editor.timeline.timelineSettings?.totalSeconds) {
      durationInput.value = this.editor.timeline.timelineSettings.totalSeconds;
      console.log(`🎬 duration-input 설정: ${this.editor.timeline.timelineSettings.totalSeconds}초`);
    } else if (this.editor.timeline.defaultSettings?.totalSeconds) {
      durationInput.value = this.editor.timeline.defaultSettings.totalSeconds;
      console.log(`🎬 duration-input 설정 (fallback): ${this.editor.timeline.defaultSettings.totalSeconds}초`);
    } else {
      durationInput.value = 20;
      console.log(`🎬 duration-input 설정 (기본값): 20초`);
    }
    durationInput.addEventListener('change', () => {
      console.log("🎬 지속시간 변경됨:", durationInput.value);
      this.updateDuration(parseInt(durationInput.value));
    });

    // 🎬 캔버스 컨트롤 버튼 이벤트
    const zoomInBtn = popup.querySelector('#zoom-in-btn');
    const zoomOutBtn = popup.querySelector('#zoom-out-btn');
    const rotateLeftBtn = popup.querySelector('#rotate-left-btn');
    const rotateRightBtn = popup.querySelector('#rotate-right-btn');
    const moveUpBtn = popup.querySelector('#move-up-btn');
    const moveDownBtn = popup.querySelector('#move-down-btn');
    const moveLeftBtn = popup.querySelector('#move-left-btn');
    const moveRightBtn = popup.querySelector('#move-right-btn');
    const resetViewBtn = popup.querySelector('#reset-view-btn');

    // 줌 인/아웃
    zoomInBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.zoomIn();
      }
    });

    zoomOutBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.zoomOut();
      }
    });

    // 회전
    rotateLeftBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.rotateLeft();
      }
    });

    rotateRightBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.rotateRight();
      }
    });

    // 이동
    moveUpBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.moveUp();
      }
    });

    moveDownBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.moveDown();
      }
    });

    moveLeftBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.moveLeft();
      }
    });

    moveRightBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.moveRight();
      }
    });

    // 뷰 리셋
    resetViewBtn.addEventListener('click', () => {
      if (!this.isRenderingActive) {
        this.resetView();
      }
    });

    // 🎬 visible 디버깅 버튼 이벤트
    const debugVisibleBtn = popup.querySelector('#debug-visible-btn');
    debugVisibleBtn.addEventListener('click', () => {
      console.log("🔍 visible 디버깅 버튼 클릭됨");
      
      // 현재 씬에서 첫 번째 객체의 UUID를 가져와서 디버깅 실행
      let firstObjectUuid = null;
      this.editor.scene.traverse((object) => {
        if (object !== this.editor.scene && !firstObjectUuid) {
          firstObjectUuid = object.uuid;
        }
      });
      
      if (firstObjectUuid) {
        console.log(`🎬 첫 번째 객체 UUID로 visible 디버깅 실행: ${firstObjectUuid}`);
        this.debugVisibleProperty(firstObjectUuid);
      } else {
        console.log("❌ 씬에서 객체를 찾을 수 없습니다");
      }
    });
    
    // 닫기 버튼
    const closeBtn = popup.querySelector('#close-render-popup');
    closeBtn.addEventListener('click', () => {
      console.log("🎬 렌더링 팝업 닫기 시작...");
      this.dispose();
      popup.remove();
      console.log("✅ 렌더링 팝업 닫기 완료");
    });

    // 팝업 외부 클릭 시 닫기
    const handleOutsideClick = (e) => {
      if (e.target === popup) {
        console.log("🎬 팝업 외부 클릭으로 렌더링 팝업 닫기 시작...");
        this.dispose();
        popup.remove();
        document.removeEventListener('click', handleOutsideClick);
        document.removeEventListener('keydown', handleEscKey);
        console.log("✅ 팝업 외부 클릭으로 렌더링 팝업 닫기 완료");
      }
    };
    document.addEventListener('click', handleOutsideClick);
    
    // ESC 키
    const handleEscKey = (e) => {
      if (e.key === 'Escape' && document.querySelector('.render-popup')) {
        console.log("🎬 ESC 키로 렌더링 팝업 닫기 시작...");
        this.dispose();
        popup.remove();
        document.removeEventListener('click', handleOutsideClick);
        document.removeEventListener('keydown', handleEscKey);
        console.log("✅ ESC 키로 렌더링 팝업 닫기 완료");
      }
    };
    document.addEventListener('keydown', handleEscKey);
  }

  // 🎬 렌더링 객체들 생성
  createRenderObjects(canvas) {
    try {
      console.log("🎬 렌더링 객체들 생성 시작...");
      
      // 1. WebGL Renderer 생성
      this.renderRenderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true
      });
      this.renderRenderer.setSize(1280, 720);
      this.renderRenderer.setPixelRatio(1);
      this.renderRenderer.setClearColor(0x000000, 1);
      
      // 2. Scene 직접 참조 (복제하지 않음)
      this.renderScene = this.editor.scene;
      
      // 3. Camera 복사
      if (this.editor.camera) {
        this.renderCamera = this.editor.camera.clone();
        // 초기 카메라 위치 설정
        this.renderCamera.position.set(0, 30, 177.16);
        this.renderCamera.lookAt(0, 30, 0); // Y축 30 위치를 바라보도록 설정
      } else {
        this.renderCamera = new THREE.PerspectiveCamera(75, 1200 / 600, 0.1, 1000);
        // 초기 카메라 위치 설정
        this.renderCamera.position.set(0, 30, 177.16);
        this.renderCamera.lookAt(0, 30, 0);
      }

      // 4. 원본 씬 설정 (도우미 객체 제거, FBX 애니메이션 활성화, 애니메이션 믹서 설정)
      this.removeHelperObjects(this.editor.scene);
      this.activateFBXAnimations(this.editor.scene);
      this.setupAnimationMixers(this.editor.scene);

      // 5. Canvas 컨트롤 설정
      this.setupCanvasControls(canvas);

      // 🎬 6. 렌더링 클럭 초기화 (dispose 후 재사용을 위해)
      if (!this.renderClock) {
        this.renderClock = new THREE.Clock();
      } else {
        this.renderClock.start(); // 기존 클럭이 있다면 시작
      }

      // 🎬 7. 첫 번째 화면 렌더링
      this.renderFirstFrame();
      
      console.log("✅ 렌더링 객체들 생성 완료");
      
    } catch (error) {
      console.error("❌ 렌더링 객체들 생성 실패:", error);
      throw error;
    }
  }

  // 🎬 첫 번째 화면 렌더링
  renderFirstFrame() {
    try {
      console.log("🎬 첫 번째 화면 렌더링 시작...");

      if (!this.renderRenderer || !this.editor.scene || !this.renderCamera) {
        console.warn("⚠️ 렌더링 객체가 준비되지 않았습니다");
        return;
      }

      // 애니메이션 믹서가 있다면 초기 상태로 업데이트
      if (this.editor.scene.userData.animationMixers) {
        this.editor.scene.userData.animationMixers.forEach((mixer) => {
          if (mixer && mixer.update && typeof mixer.update === 'function') {
            // 시간을 0으로 설정하여 첫 프레임 상태로 초기화
            mixer.setTime(0);
          }
        });
      }

      // 🎬 초기 애니메이션 상태 설정 (시간 0)
      this.updateAnimationFromTimeline(0, 0);

      // 첫 번째 프레임 렌더링
      this.renderRenderer.render(this.editor.scene, this.renderCamera);

      console.log("✅ 첫 번째 화면 렌더링 완료");

    } catch (error) {
      console.warn("⚠️ 첫 번째 화면 렌더링 실패:", error);
    }
  }

  // 🎬 간단한 Scene 생성 (사용하지 않음 - 직접 참조 방식으로 변경)
  /*
  createSimpleScene() {
    try {
      console.log("🎬 Scene 직접 참조 시작...");

      // Three.js가 로드되었는지 확인
      if (typeof THREE === 'undefined') {
        console.error('Three.js가 로드되지 않았습니다.');
        return new THREE.Scene();
      }

      console.log('Three.js 객체 확인:', typeof THREE);
      console.log('원본 씬 정보:', {
        children: this.editor.scene ? this.editor.scene.children.length : 'undefined',
        name: this.editor.scene ? this.editor.scene.name : 'undefined'
      });

      // 🚀 핵심: 씬을 복제하지 않고 직접 참조
      // UUID 매핑 불필요 (원본 객체 사용)
      this.uuidMapping = new Map();
      
      // 원본 에디터 씬을 직접 사용
      const scene = this.editor.scene;

      // 🎬 도우미 객체 제거 (원본 씬에서 직접 제거)
      this.removeHelperObjects(scene);

      // 🎬 FBX 애니메이션 활성화 (원본 씬에서 직접 활성화)
      this.activateFBXAnimations(scene);

      // 🚀 애니메이션 믹서들을 원본 씬에 직접 설정
      console.log('🎬 === 애니메이션 믹서 설정 시작 ===');
      this.setupAnimationMixers(scene);
      console.log('🎬 === 애니메이션 믹서 설정 완료 ===');

      console.log('씬 직접 참조 완료:', {
        children: scene.children.length,
        name: scene.name
      });

      // 원본 씬의 객체들 확인
      console.log('원본 씬의 객체들:');
      scene.traverse((object) => {
        if (object.name) {
          console.log(`- ${object.name} (${object.type})`);
        }
      });

      console.log("✅ Scene 직접 참조 완료");
      return scene;

    } catch (error) {
      console.error("❌ Scene 직접 참조 실패:", error);
      // 실패 시 기본 씬 반환
      return new THREE.Scene();
    }
  }
  */

  // 🎬 씬 깊은 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  /*
  deepCloneScene(originalScene) {
    try {
      if (!originalScene) {
        console.warn("⚠️ 원본 씬이 없어서 새 씬 생성");
        return new THREE.Scene();
      }

      // UUID 매핑 초기화
      this.uuidMapping.clear();
      console.log("🎬 UUID 매핑 초기화 완료");

      const clonedScene = new THREE.Scene();

      // 씬 속성 복사
      clonedScene.name = originalScene.name || 'ClonedScene';
      clonedScene.background = originalScene.background;
      clonedScene.fog = originalScene.fog;
      clonedScene.userData = { ...originalScene.userData };

      // 모든 자식 객체들을 재귀적으로 복사
      originalScene.children.forEach((child) => {
        try {
          const clonedChild = this.deepCloneObject(child);
          if (clonedChild) {
            clonedScene.add(clonedChild);
          }
        } catch (error) {
          console.warn(`⚠️ 자식 객체 복사 실패: ${child.name || child.type}`, error);
        }
      });

      console.log(`🎬 UUID 매핑 완료: ${this.uuidMapping.size}개 객체`);
      console.log("🎬 UUID 매핑 내용:", Array.from(this.uuidMapping.entries()));

      return clonedScene;

    } catch (error) {
      console.error("❌ 씬 깊은 복사 실패:", error);
      return new THREE.Scene();
    }
  }

  // 🎬 객체 깊은 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  deepCloneObject(object) {
    try {
      if (!object) return null;

      // 도우미 객체는 건너뛰기
      if (this.isHelperObject(object)) {
        return null;
      }

              let clonedObject;
              
      // 객체 타입별 복사
      if (object.type === 'Mesh') {
        clonedObject = this.cloneMesh(object);
      } else if (object.type === 'Group') {
        clonedObject = this.cloneGroup(object);
      } else if (object.type === 'Light') {
        clonedObject = this.cloneLight(object);
      } else if (object.type === 'Camera') {
        clonedObject = this.cloneCamera(object);
      } else {
        // 기본 객체는 clone() 사용
        clonedObject = object.clone();
      }

      // UUID 매핑 저장
      if (clonedObject && object.uuid) {
        this.uuidMapping.set(object.uuid, clonedObject.uuid);
      }

      // 자식 객체들도 재귀적으로 복사
      if (object.children && object.children.length > 0) {
        object.children.forEach((child) => {
          try {
            const clonedChild = this.deepCloneObject(child);
            if (clonedChild) {
              clonedObject.add(clonedChild);
            }
          } catch (error) {
            console.warn(`⚠️ 자식 객체 복사 실패: ${child.name || child.type}`, error);
          }
        });
      }

      return clonedObject;

    } catch (error) {
      console.warn(`⚠️ 객체 복사 실패: ${object.name || object.type}`, error);
      return null;
    }
  }
  */

  // 🎬 Mesh 객체 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  /*
  cloneMesh(mesh) {
    try {
      const clonedMesh = mesh.clone();

      // 재질 복사
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          clonedMesh.material = mesh.material.map(mat => this.cloneMaterial(mat));
              } else {
          clonedMesh.material = this.cloneMaterial(mesh.material);
        }
      }

      // 지오메트리 복사
      if (mesh.geometry) {
        clonedMesh.geometry = mesh.geometry.clone();
      }

      return clonedMesh;

            } catch (error) {
      console.warn(`⚠️ Mesh 복사 실패: ${mesh.name}`, error);
      return mesh.clone(); // 기본 복사로 폴백
    }
  }

  // 🎬 Group 객체 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  cloneGroup(group) {
    try {
      const clonedGroup = new THREE.Group();
      clonedGroup.name = group.name;
      clonedGroup.userData = { ...group.userData };
      clonedGroup.position.copy(group.position);
      clonedGroup.rotation.copy(group.rotation);
      clonedGroup.scale.copy(group.scale);
      return clonedGroup;

    } catch (error) {
      console.warn(`⚠️ Group 복사 실패: ${group.name}`, error);
      return group.clone(); // 기본 복사로 폴백
    }
  }

  // 🎬 Light 객체 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  cloneLight(light) {
    try {
      const clonedLight = light.clone();

      // 조명 특성 복사
      if (light.target) {
        clonedLight.target = light.target.clone();
      }

      return clonedLight;

    } catch (error) {
      console.warn(`⚠️ Light 복사 실패: ${light.name}`, error);
      return light.clone(); // 기본 복사로 폴백
    }
  }

  // 🎬 Camera 객체 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  cloneCamera(camera) {
    try {
      const clonedCamera = camera.clone();

      // 카메라 특성 복사
      if (camera.target) {
        clonedCamera.target = camera.target.clone();
      }

      return clonedCamera;

    } catch (error) {
      console.warn(`⚠️ Camera 복사 실패: ${camera.name}`, error);
      return camera.clone(); // 기본 복사로 폴백
    }
  }

  // 🎬 Material 복사 (사용하지 않음 - 직접 참조 방식으로 변경)
  cloneMaterial(material) {
    try {
      if (!material) return null;

      const clonedMaterial = material.clone();

      // 텍스처는 참조로 유지 (직렬화 방지)
      if (material.map) clonedMaterial.map = material.map;
      if (material.normalMap) clonedMaterial.normalMap = material.normalMap;
      if (material.roughnessMap) clonedMaterial.roughnessMap = material.roughnessMap;
      if (material.metalnessMap) clonedMaterial.metalnessMap = material.metalnessMap;
      if (material.aoMap) clonedMaterial.aoMap = material.aoMap;
      if (material.emissiveMap) clonedMaterial.emissiveMap = material.emissiveMap;

      return clonedMaterial;

    } catch (error) {
      console.warn(`⚠️ Material 복사 실패:`, error);
      return material; // 원본 반환
    }
  }
  */

  // 🎬 도우미 객체 제거
  removeHelperObjects(scene) {
    try {
      const objectsToRemove = [];

      scene.traverse((object) => {
        if (this.isHelperObject(object)) {
          objectsToRemove.push(object);
        }
      });

      objectsToRemove.forEach((object) => {
        if (object.parent) {
          object.parent.remove(object);
        }
      });

      console.log(`✅ 도우미 객체 ${objectsToRemove.length}개 제거 완료`);
      
    } catch (error) {
      console.warn("⚠️ 도우미 객체 제거 실패:", error);
    }
  }

  // 🎬 FBX 애니메이션 활성화
  activateFBXAnimations(scene) {
    try {
      console.log("🎬 FBX 애니메이션 활성화 시작...");

      let totalAnimations = 0;
      let totalClips = 0;

      // FBX 애니메이션 믹서들을 찾아서 활성화
      scene.traverse((object) => {
        if (object.animations && object.animations.length > 0) {
          totalAnimations++;
          totalClips += object.animations.length;

          console.log(`🎬 FBX 애니메이션 발견: ${object.name || object.type} (${object.animations.length}개 클립)`, {
            objectType: object.type,
            objectUuid: object.uuid,
            clips: object.animations.map(clip => ({
              name: clip.name,
              duration: clip.duration,
              tracks: clip.tracks.length
            }))
          });
        }
      });

      console.log(`🎬 FBX 애니메이션 활성화 완료: 총 ${totalAnimations}개 객체, ${totalClips}개 클립`);

    } catch (error) {
      console.warn("⚠️ FBX 애니메이션 활성화 실패:", error);
    }
  }

  // 🎬 FBX 애니메이션 믹서들을 생성하고 설정 (VideoEdit.Render.js 방식)
  setupAnimationMixers(scene) {
    try {
      console.log("🎬 FBX 애니메이션 믹서 설정 시작...");

      // 씬의 애니메이션 믹서 배열 초기화
      if (!scene.userData.animationMixers) {
        scene.userData.animationMixers = [];
      }

      let totalMixers = 0;
      let createdMixers = 0;

      // 씬 내의 모든 객체를 순회하며 애니메이션 클립이 있는 객체 찾기
      scene.traverse((character) => {
        if (character.animations && character.animations.length > 0) {
          try {
            console.log(`🎬 FBX 애니메이션 발견: ${character.name || character.type}`, {
              clipCount: character.animations.length,
              clips: character.animations.map(clip => ({
                name: clip.name,
                duration: clip.duration,
                tracks: clip.tracks.length
              }))
            });

            // 새로운 애니메이션 믹서 생성
            const mixer = new THREE.AnimationMixer(character);
            scene.userData.animationMixers.push(mixer);

            // 모든 애니메이션 클립을 재생
            character.animations.forEach((clip) => {
              const action = mixer.clipAction(clip);
              action.play();
              console.log(`✅ 애니메이션 클립 재생 시작: ${clip.name}`);
            });

            totalMixers++;
            createdMixers++;

            console.log(`✅ ${character.name || character.type}에 대한 애니메이션 믹서 생성 완료`);
          } catch (error) {
            console.warn(`⚠️ ${character.name || character.type} 애니메이션 믹서 생성 실패:`, error);
          }
        }
      });

      console.log(`🎬 FBX 애니메이션 믹서 설정 완료: 총 ${totalMixers}개, 생성됨 ${createdMixers}개`);

      // 기존 믹서들도 유지 (혹시 다른 곳에서 생성된 경우)
      if (this.editor.scene && this.editor.scene.userData && this.editor.scene.userData.animationMixers) {
        const existingMixers = this.editor.scene.userData.animationMixers;
        existingMixers.forEach((mixer, index) => {
          if (mixer && mixer.update && typeof mixer.update === 'function') {
            scene.userData.animationMixers.push(mixer);
            console.log(`✅ 기존 애니메이션 믹서 ${index} 추가`);
          }
        });
      }

    } catch (error) {
      console.warn("⚠️ FBX 애니메이션 믹서 설정 실패:", error);
    }
  }

  // 🎬 FBX 애니메이션 믹서 업데이트 (렌더링용 - 클립 상대 시간 사용)
  updateFBXAnimationMixersForRendering(currentTime) {
    try {
      console.log("🎬 FBX 애니메이션 믹서 렌더링 시간 설정 중...");
      console.log("🎬 현재 시간:", currentTime);

      // 🎬 MotionTimeline에서 클립 정보 가져오기
      if (!this.editor.motionTimeline) {
        console.warn("⚠️ MotionTimeline이 없습니다");
        return;
      }

      // 🎬 씬 내의 모든 객체를 순회하며 애니메이션 믹서 찾기 및 시간 설정
      this.editor.scene.traverse((object) => {
        if (!object.animations || object.animations.length === 0) return;

        // 🎬 해당 객체의 클립 범위 확인
        const trackElement = this.editor.motionTimeline.container.querySelector(`[data-uuid="${object.uuid}"]`);
        if (!trackElement) {
          console.log(`🎬 객체 ${object.uuid}의 트랙 요소를 찾을 수 없음`);
          return;
        }

        const sprites = trackElement.querySelectorAll('.animation-sprite');
        let isInActiveClip = false;
        let clipRelativeTime = 0;

        sprites.forEach(sprite => {
          const clipLeft = parseFloat(sprite.style.left) || 0;
          const clipStartTime = (clipLeft / 100) * this.editor.motionTimeline.options.totalSeconds;
          const clipDuration = parseFloat(sprite.dataset.duration) || 5;
          const clipEndTime = clipStartTime + clipDuration;

          if (currentTime >= clipStartTime && currentTime <= clipEndTime) {
            isInActiveClip = true;
            clipRelativeTime = currentTime - clipStartTime;
            console.log(`🎬 객체 ${object.uuid} 클립 범위 내:`, {
              clipStartTime,
              clipEndTime,
              clipRelativeTime,
              currentTime
            });
          }
        });

        // 🎬 클립 범위에 있을 때만 FBX 애니메이션 믹서 시간 설정
        if (isInActiveClip) {
          // 🎬 객체 자체에 애니메이션 믹서가 있는 경우
          if (object.animationMixer) {
            object.animationMixer.setTime(clipRelativeTime);
            console.log(`🎬 FBX 애니메이션 믹서 시간 설정: ${object.name || object.type} (object.animationMixer) - 상대시간: ${clipRelativeTime}`);
          }

          // 🎬 userData에 애니메이션 믹서가 있는 경우
          if (object.userData && object.userData.animationMixer) {
            object.userData.animationMixer.setTime(clipRelativeTime);
            console.log(`🎬 FBX 애니메이션 믹서 시간 설정: ${object.name || object.type} (userData.animationMixer) - 상대시간: ${clipRelativeTime}`);
          }

          // 🎬 userData에 애니메이션 믹서 배열이 있는 경우
          if (object.userData && object.userData.animationMixers && Array.isArray(object.userData.animationMixers)) {
            object.userData.animationMixers.forEach((mixer, index) => {
              if (mixer && mixer.setTime) {
                mixer.setTime(clipRelativeTime);
                console.log(`🎬 FBX 애니메이션 믹서 시간 설정: ${object.name || object.type} (userData.animationMixers[${index}]) - 상대시간: ${clipRelativeTime}`);
              }
            });
          }

          // 🎬 씬의 애니메이션 믹서 배열에서 해당 객체의 믹서 찾기
          if (this.editor.scene.userData.animationMixers) {
            this.editor.scene.userData.animationMixers.forEach((mixer, index) => {
              if (mixer && mixer.setTime) {
                // 🎬 믹서가 해당 객체에 속하는지 확인 (정확한 매칭은 어려우므로 일단 모든 믹서에 적용)
                mixer.setTime(clipRelativeTime);
                console.log(`🎬 씬 애니메이션 믹서 시간 설정: 인덱스 ${index} - 상대시간: ${clipRelativeTime}`);
              }
            });
          }

          // 🎬 객체 가시성 설정
          object.visible = true;
        } else {
          // 🎬 클립 범위 밖이면 객체 숨기기
          object.visible = false;
          console.log(`🎬 객체 ${object.uuid} 클립 범위 밖 - 숨김`);
        }
      });

    } catch (error) {
      console.warn("⚠️ FBX 애니메이션 믹서 렌더링 시간 설정 실패:", error);
    }
  }

  // 🎬 FBX 애니메이션 믹서 업데이트
  updateFBXAnimationMixers(deltaTime) {
    try {
      let totalMixers = 0;
      let updatedMixers = 0;

      // 🎬 현재 씬의 애니메이션 믹서들 업데이트
      if (this.editor.scene && this.editor.scene.userData && this.editor.scene.userData.animationMixers) {
        const sceneMixers = this.editor.scene.userData.animationMixers;
        console.log(`🎬 씬 애니메이션 믹서 배열 크기: ${sceneMixers.length}`);

        sceneMixers.forEach((mixer, index) => {
          if (mixer && mixer.update && typeof mixer.update === 'function') {
            totalMixers++;
            mixer.update(deltaTime);
            updatedMixers++;
            console.log(`🎬 씬 믹서 ${index} 업데이트 완료`);
          } else {
            console.warn(`⚠️ 씬 믹서 ${index}가 유효하지 않음:`, mixer);
          }
        });
      } else {
        console.log("ℹ️ 씬에 애니메이션 믹서가 없습니다");
      }

      // 🎬 씬 내의 모든 객체를 순회하며 애니메이션 믹서 찾기 및 업데이트
      this.editor.scene.traverse((object) => {
        // 객체 자체에 애니메이션 믹서가 있는 경우
        if (object.animationMixer && object.animationMixer.update) {
          totalMixers++;
          object.animationMixer.update(deltaTime);
          updatedMixers++;
          console.log(`🎬 FBX 애니메이션 믹서 업데이트: ${object.name || object.type} (object.animationMixer)`);
        }

        // userData에 애니메이션 믹서가 있는 경우 (FBX 로더에서 생성된 경우)
        if (object.userData && object.userData.animationMixer && object.userData.animationMixer.update) {
          totalMixers++;
          object.userData.animationMixer.update(deltaTime);
          updatedMixers++;
          console.log(`🎬 FBX 애니메이션 믹서 업데이트: ${object.name || object.type} (userData.animationMixer)`);
        }

        // userData에 애니메이션 믹서 배열이 있는 경우
        if (object.userData && object.userData.animationMixers && Array.isArray(object.userData.animationMixers)) {
          const objectMixers = object.userData.animationMixers;
          console.log(`🎬 객체 ${object.name || object.type}의 애니메이션 믹서 배열 크기: ${objectMixers.length}`);

          objectMixers.forEach((mixer, index) => {
            if (mixer && mixer.update && typeof mixer.update === 'function') {
              totalMixers++;
              mixer.update(deltaTime);
              updatedMixers++;
              console.log(`🎬 FBX 애니메이션 믹서 업데이트: ${object.name || object.type} (userData.animationMixers[${index}])`);
            } else {
              console.warn(`⚠️ 객체 ${object.name || object.type}의 믹서 ${index}가 유효하지 않음:`, mixer);
            }
          });
        }

        // 🎬 FBX 애니메이션 클립 정보 로깅 (첫 번째 프레임에서만)
        if (this.currentFrameIndex === 0) {
          if (object.animations && object.animations.length > 0) {
            console.log(`🎬 FBX 애니메이션 클립 발견: ${object.name || object.type}`, {
              clipCount: object.animations.length,
              clips: object.animations.map(clip => ({
                name: clip.name,
                duration: clip.duration,
                tracks: clip.tracks.length
              }))
            });
          }
        }
      });

      // 🎬 애니메이션 믹서 업데이트 요약 로깅 (주기적으로)
      if (this.currentFrameIndex % 30 === 0) { // 30프레임마다 로깅
        console.log(`🎬 FBX 애니메이션 믹서 업데이트 요약: 총 ${totalMixers}개, 업데이트됨 ${updatedMixers}개`);
      }

      // 🎬 첫 번째 프레임에서 믹서 상태 상세 로깅
      if (this.currentFrameIndex === 0) {
        console.log(`🎬 첫 번째 프레임 - 애니메이션 믹서 상태:`, {
          sceneMixers: this.editor.scene.userData.animationMixers ? this.editor.scene.userData.animationMixers.length : 0,
          totalMixers,
          updatedMixers
        });
      }

    } catch (error) {
      console.warn("⚠️ FBX 애니메이션 믹서 업데이트 실패:", error);
    }
  }

  // 🎬 도우미 객체 식별
  isHelperObject(object) {
    const helperTypes = [
      'GridHelper', 'AxesHelper', 'SkeletonHelper', 'BoneHelper',
      'DirectionalLightHelper', 'PointLightHelper', 'SpotLightHelper',
      'HemisphereLightHelper', 'RectAreaLightHelper', 'CameraHelper',
      'BoxHelper', 'Box3Helper', 'PlaneHelper', 'ArrowHelper'
    ];
    
    if (helperTypes.includes(object.type)) return true;
    if (object.name && object.name.toLowerCase().includes('helper')) return true;
    if (object.userData && object.userData.isHelper) return true;
    
    return false;
  }

  // 🎬 Canvas 컨트롤 설정 (간단한 버전)
  setupCanvasControls(canvas) {
    try {
      console.log("🎮 Canvas 컨트롤 설정 시작...");
      
      const controls = {
        isMouseDown: false,
        isRightMouseDown: false,
        lastMouseX: 0,
        lastMouseY: 0,
        zoom: 17.72,
        rotationX: 0,
        rotationY: 0,
        panX: 0,
        panY: 30.0
      };
      
      // 마우스 이벤트 (렌더링 중에는 비활성화)
      canvas.addEventListener('mousedown', (event) => {
        if (this.isRenderingActive) return; // 렌더링 중에는 마우스 컨트롤 비활성화

        event.preventDefault();
        if (event.button === 0) {
          controls.isMouseDown = true;
          controls.lastMouseX = event.clientX;
          controls.lastMouseY = event.clientY;
          canvas.style.cursor = 'grabbing';
        } else if (event.button === 2) {
          controls.isRightMouseDown = true;
          controls.lastMouseX = event.clientX;
          controls.lastMouseY = event.clientY;
          canvas.style.cursor = 'move';
        }
      });
      
      canvas.addEventListener('mousemove', (event) => {
        if (this.isRenderingActive) return; // 렌더링 중에는 마우스 컨트롤 비활성화

        event.preventDefault();
        
        if (controls.isMouseDown) {
          const deltaX = event.clientX - controls.lastMouseX;
          const deltaY = event.clientY - controls.lastMouseY;
          
          // 🎬 회전 감도 조정 (더 부드럽게)
          // 🎯 좌우 드래그 시 회전 방향 수정 (사용자 요청)
          controls.rotationY -= deltaX * 0.005;
          controls.rotationX += deltaY * 0.005;
          controls.rotationX = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, controls.rotationX));
          
          controls.lastMouseX = event.clientX;
          controls.lastMouseY = event.clientY;
          
          this.updateCameraPosition(controls);
          // 🎬 실시간 렌더링으로 부드러운 움직임
          this.renderCurrentFrame();
        } else if (controls.isRightMouseDown) {
          const deltaX = event.clientX - controls.lastMouseX;
          const deltaY = event.clientY - controls.lastMouseY;
          
          // 🎬 이동 감도 조정 (더 부드럽게)
          controls.panX += deltaX * 0.005;
          controls.panY -= deltaY * 0.005;
          
          controls.lastMouseX = event.clientX;
          controls.lastMouseY = event.clientY;
          
          this.updateCameraPosition(controls);
          // 🎬 실시간 렌더링으로 부드러운 움직임
          this.renderCurrentFrame();
        }
      });
      
      canvas.addEventListener('mouseup', (event) => {
        if (this.isRenderingActive) return; // 렌더링 중에는 마우스 컨트롤 비활성화

        event.preventDefault();
        if (event.button === 0) {
          controls.isMouseDown = false;
          canvas.style.cursor = 'grab';
        } else if (event.button === 2) {
          controls.isRightMouseDown = false;
          canvas.style.cursor = 'grab';
        }
      });
      
      // 줌 (렌더링 중에는 비활성화)
      canvas.addEventListener('wheel', (event) => {
        if (this.isRenderingActive) return; // 렌더링 중에는 휠 컨트롤 비활성화

        event.preventDefault();
        const zoomSpeed = 0.1;
        const delta = event.deltaY > 0 ? 1 + zoomSpeed : 1 - zoomSpeed;
        controls.zoom *= delta;
        controls.zoom = Math.max(0.1, Math.min(1000, controls.zoom));

        this.updateCameraPosition(controls);
        // 🎬 줌 후 즉시 렌더링
        this.renderCurrentFrame();
      });
      
      // 우클릭 메뉴 비활성화
      canvas.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });
      
      this.canvasControls = controls;
      console.log("✅ Canvas 컨트롤 설정 완료");
      
    } catch (error) {
      console.error("❌ Canvas 컨트롤 설정 실패:", error);
    }
  }

  // 🎬 카메라 위치 업데이트
  updateCameraPosition(controls) {
    try {
      if (!this.renderCamera) return;
      
      const distance = 10;
      const x = Math.sin(controls.rotationY) * Math.cos(controls.rotationX) * distance * controls.zoom;
      const y = Math.sin(controls.rotationX) * distance * controls.zoom;
      const z = Math.cos(controls.rotationY) * Math.cos(controls.rotationX) * distance * controls.zoom;
      
      this.renderCamera.position.set(
        x + controls.panX,
        y + controls.panY,
        z
      );
      
      this.renderCamera.lookAt(controls.panX, controls.panY, 0);
      this.renderCamera.up.set(0, 1, 0);
      
      // 🎬 카메라 상태 콘솔 출력
      console.log('🎮 카메라 상태 업데이트:', {
        position: {
          x: this.renderCamera.position.x.toFixed(2),
          y: this.renderCamera.position.y.toFixed(2),
          z: this.renderCamera.position.z.toFixed(2)
        },
        rotation: {
          x: (controls.rotationX * 180 / Math.PI).toFixed(1) + '°',
          y: (controls.rotationY * 180 / Math.PI).toFixed(1) + '°'
        },
        zoom: controls.zoom.toFixed(2),
        pan: {
          x: controls.panX.toFixed(2),
          y: controls.panY.toFixed(2)
        }
      });

    } catch (error) {
      console.warn("⚠️ 카메라 위치 업데이트 실패:", error);
    }
  }

  // 🎬 렌더링 프로세스 시작
  startRenderProcess(canvas, statusElement, startBtn) {
    try {
      console.log("🎬 렌더링 프로세스 시작...");

      // 렌더링 설정 가져오기
      const resolution = document.getElementById('resolution-select').value;
      const fps = parseInt(document.getElementById('fps-select').value);
      const duration = parseInt(document.getElementById('duration-input').value);

      console.log(`🎬 렌더링 설정: ${resolution}, ${fps} FPS, ${duration}초`);
      
      // 버튼 상태 변경
      startBtn.disabled = true;
      startBtn.style.background = '#666';
      startBtn.innerHTML = '⏳ 렌더링 중...';
      
      // 상태 표시 업데이트
      statusElement.innerHTML = '🔄 렌더링 초기화 중...';
      statusElement.style.color = '#FFA500';
      
      // 프로그레스바 표시
      const progressContainer = document.getElementById('progress-container');
      const progressFill = document.getElementById('progress-fill');
      const progressText = document.getElementById('progress-text');

      progressContainer.style.display = 'flex';
      progressFill.style.width = '0%';
      progressText.innerHTML = '0% 완료';

      // 비디오 다운로드 프로그레스바 숨김 처리
      const videoProgressContainer = document.getElementById('video-progress-container');
      const videoProgressBar = document.getElementById('video-progress-bar');
      const videoProgressFill = document.getElementById('video-progress-fill');
      const videoProgressText = document.getElementById('video-progress-text');

      videoProgressContainer.style.display = 'none';
      videoProgressBar.style.width = '0%';
      videoProgressText.innerHTML = '0% 완료';

      // 🎬 렌더링 중 캔버스 컨트롤 비활성화
      this.setCanvasControlsEnabled(false);

      // 🎬 렌더링 중 렌더링 설정 폼 비활성화
      this.setRenderSettingsEnabled(false);

      // 🎬 렌더링 시작 버튼을 중지 버튼으로 변경
      this.changeStartButtonToStop(startBtn);

      // 렌더링 활성화
      this.isRenderingActive = true;

      // 실제 렌더링 시작
      this.startVideoRendering(canvas, statusElement, startBtn, {
        resolution,
        fps,
        duration,
        progressFill,
        progressText,
        videoProgressFill, // 비디오 다운로드 프로그레스바 참조 전달
        videoProgressText // 비디오 다운로드 프로그레스바 참조 전달
      });
      
    } catch (error) {
      console.error("❌ 렌더링 프로세스 시작 실패:", error);
      
      statusElement.innerHTML = '❌ 렌더링 시작 실패: ' + error.message;
      statusElement.style.color = '#FF4444';
      
      this.isRenderingActive = false;
      startBtn.disabled = false;
      startBtn.style.background = '#4CAF50';
      startBtn.innerHTML = '<i class="fas fa-play"></i> 렌더링 시작';

      // 🎬 에러 발생 시 캔버스 컨트롤 다시 활성화
      this.setCanvasControlsEnabled(true);
    }
  }

  // 🎬 캔버스 컨트롤 활성화/비활성화
  setCanvasControlsEnabled(enabled) {
    try {
      const zoomInBtn = document.getElementById('zoom-in-btn');
      const zoomOutBtn = document.getElementById('zoom-out-btn');
      const rotateLeftBtn = document.getElementById('rotate-left-btn');
      const rotateRightBtn = document.getElementById('rotate-right-btn');
      const moveUpBtn = document.getElementById('move-up-btn');
      const moveDownBtn = document.getElementById('move-down-btn');
      const moveLeftBtn = document.getElementById('move-left-btn');
      const moveRightBtn = document.getElementById('move-right-btn');
      const resetViewBtn = document.getElementById('reset-view-btn');

      const buttons = [zoomInBtn, zoomOutBtn, rotateLeftBtn, rotateRightBtn, moveUpBtn, moveDownBtn, moveLeftBtn, moveRightBtn, resetViewBtn];

      buttons.forEach(button => {
        if (button) {
          button.disabled = !enabled;
          button.style.opacity = enabled ? '1' : '0.5';
          button.style.cursor = enabled ? 'pointer' : 'not-allowed';
        }
      });

      console.log(`🎮 캔버스 컨트롤 ${enabled ? '활성화' : '비활성화'} 완료`);

    } catch (error) {
      console.warn("⚠️ 캔버스 컨트롤 상태 변경 실패:", error);
    }
  }

  // 🎬 렌더링 설정 폼 요소 활성화/비활성화
  setRenderSettingsEnabled(enabled) {
    try {
      const renderSettings = document.getElementById('render-settings');
      if (!renderSettings) {
        console.warn("⚠️ #render-settings 요소를 찾을 수 없습니다");
        return;
      }

      // 폼 내의 모든 입력 요소들 찾기
      const inputs = renderSettings.querySelectorAll('input:not(.disabled), select:not(.disabled), textarea:not(.disabled)');
      const buttons = renderSettings.querySelectorAll('button:not(#start-render-btn)'); // 렌더링 시작 버튼 제외

      // 입력 요소들 비활성화/활성화
      inputs.forEach(input => {
        input.disabled = !enabled;
        input.style.opacity = enabled ? '1' : '0.5';
        input.style.cursor = enabled ? 'auto' : 'not-allowed';
      });

      // 버튼들 비활성화/활성화 (렌더링 시작 버튼 제외)
      buttons.forEach(button => {
        button.disabled = !enabled;
        button.style.opacity = enabled ? '1' : '0.5';
        button.style.cursor = enabled ? 'pointer' : 'not-allowed';
      });

      console.log(`⚙️ 렌더링 설정 폼 ${enabled ? '활성화' : '비활성화'} 완료`);

    } catch (error) {
      console.warn("⚠️ 렌더링 설정 폼 상태 변경 실패:", error);
    }
  }

  // 🎬 렌더링 시작 버튼을 중지 버튼으로 변경
  changeStartButtonToStop(startBtn) {
    try {
      startBtn.disabled = false;
      startBtn.style.background = '#FF4444';
      startBtn.innerHTML = ' <i class="fas fa-stop"></i> 렌더링 중지';
      
      // 기존 이벤트 리스너 제거 후 중지 이벤트 리스너 추가
      startBtn.removeEventListener('click', this.startRenderProcess);
      startBtn.addEventListener('click', () => this.stopRendering(startBtn));
      
      console.log("🔄 렌더링 시작 버튼을 중지 버튼으로 변경 완료");
    } catch (error) {
      console.warn("⚠️ 버튼 변경 실패:", error);
    }
  }

  // 🎬 렌더링 중지 버튼을 시작 버튼으로 변경
  changeStopButtonToStart(startBtn) {
    try {
      startBtn.disabled = false;
      startBtn.style.background = '#4CAF50';
      startBtn.innerHTML = '<i class="fas fa-play"></i> 렌더링 시작';
      
      // 이벤트 리스너 제거 후 다시 추가
      startBtn.removeEventListener('click', this.stopRendering);
      startBtn.addEventListener('click', () => {
        console.log("🎬 렌더링 시작 버튼 클릭됨");
        this.startRenderProcess(this.renderCanvas, document.getElementById('render-status'), startBtn);
      });
      
      console.log("🔄 렌더링 중지 버튼을 시작 버튼으로 변경 완료");
    } catch (error) {
      console.warn("⚠️ 버튼 변경 실패:", error);
    }
  }

  // 🎬 렌더링 중지
  stopRendering(startBtn) {
    try {
      console.log("⏹️ 렌더링 중지 요청됨");
      
      // 렌더링 상태 비활성화
      this.isRenderingActive = false;
      
      // 애니메이션 루프 중지
      if (this.animationLoopId) {
        cancelAnimationFrame(this.animationLoopId);
        this.animationLoopId = null;
        console.log("✅ 애니메이션 루프 중지 완료");
      }

      // 상태 메시지 업데이트
      const statusElement = document.getElementById('render-status');
      if (statusElement) {
        statusElement.innerHTML = '⏸️ 렌더링이 중지되었습니다.';
        statusElement.style.color = '#FF9800';
      }

      // 버튼을 시작 버튼으로 변경 (올바른 컨텍스트 전달)
      this.changeStopButtonToStart(startBtn);

      // 렌더링 설정 폼 다시 활성화
      this.setRenderSettingsEnabled(true);

      // 캔버스 컨트롤 다시 활성화
      this.setCanvasControlsEnabled(true);

      console.log("✅ 렌더링 중지 완료");

    } catch (error) {
      console.error("❌ 렌더링 중지 실패:", error);
    }
  }

  // 🎬 visible 속성 테스트 메서드
  testVisibleProperty(objectUuid, time, isVisible) {
    try {
      if (this.editor.motionTimeline) {
        const success = this.editor.motionTimeline.addVisibleKeyframe(objectUuid, time, isVisible);
        if (success) {
          console.log(`🎬 visible 키프레임 테스트 완료: ${objectUuid} at ${time}s -> ${isVisible}`);
          // 프리컴퓨트 데이터 업데이트 (클립 정보 콜백 전달)
          this.editor.motionTimeline.timelineData.precomputeAnimationData(
            this.editor.motionTimeline.getClipInfoCallback()
          );
          return true;
        }
      }
      return false;
    } catch (error) {
      console.error(`❌ visible 속성 테스트 실패:`, error);
      return false;
    }
  }

  // 🎬 애니메이션 루프 시작
  startAnimationLoop(canvas) {
    try {
      console.log("🎬 애니메이션 루프 시작...");
      
      if (!this.isRenderingActive) {
        console.log("⏸️ 렌더링이 비활성화되어 있어 애니메이션 루프를 시작하지 않습니다");
        return;
      }
      
      let lastTime = 0;
      const animate = () => {
        // 팝업이 닫혔으면 중단
        if (!document.querySelector('.render-popup')) {
          console.log("🎬 팝업이 닫혀서 애니메이션 루프 중단");
          this.animationLoopId = null;
          this.isRenderingActive = false;
          return;
        }
        
        // 렌더링 플래그 확인
        if (!this.isRenderingActive) {
          console.log("⏸️ 렌더링이 비활성화되어 애니메이션 루프 중단");
          this.animationLoopId = null;
          return;
        }
        
        const currentTime = performance.now();
        const deltaTime = (currentTime - lastTime) / 1000;
        lastTime = currentTime;
        
        // 🎯 기존 editor.timeline 데이터 활용하여 애니메이션 업데이트
        this.updateAnimationFromTimeline(deltaTime);
        
        // 렌더링
        if (this.renderRenderer && this.editor.scene && this.renderCamera) {
          this.renderRenderer.render(this.editor.scene, this.renderCamera);
        }
        
        // 다음 프레임 요청
        if (this.isRenderingActive) {
          this.animationLoopId = requestAnimationFrame(animate);
        }
      };
      
      // 애니메이션 루프 시작
      if (this.isRenderingActive) {
        this.animationLoopId = requestAnimationFrame(animate);
        console.log("✅ 애니메이션 루프 시작됨");
      }
      
    } catch (error) {
      console.error("❌ 애니메이션 루프 시작 실패:", error);
      this.isRenderingActive = false;
      this.animationLoopId = null;
    }
  }

  // 🎯 기존 editor.timeline 데이터 활용하여 애니메이션 업데이트
  updateAnimationFromTimeline(deltaTime, customTime = null) {
    try {
      console.log("🎬 애니메이션 업데이트 시작...");
      console.log("🎬 deltaTime:", deltaTime);
      console.log("🎬 customTime:", customTime);

      // 1. MotionTimeline 데이터 활용
      if (this.editor.motionTimeline && this.editor.motionTimeline.timelineData) {
        const motionData = this.editor.motionTimeline.timelineData;
        const currentTime = customTime !== null ? customTime : (this.editor.motionTimeline.currentTime || 0);

        console.log("🎬 MotionTimeline 데이터 발견:", motionData);
        console.log("🎬 MotionTimeline tracks 크기:", motionData.tracks.size);
        console.log("🎬 MotionTimeline precomputedData 크기:", motionData.precomputedData ? motionData.precomputedData.size : "없음");
        
        // 현재 시간에 맞는 애니메이션 값 적용
        this.applyMotionTimelineData(motionData, currentTime);
      } else {
        console.log("⚠️ MotionTimeline 또는 timelineData가 없습니다");
      }
      
      // 2. LightTimeline 데이터 활용
      console.log("🎬 LightTimeline 확인:", {
        hasLightTimeline: !!this.editor.lightTimeline,
        lightTimeline: this.editor.lightTimeline,
        hasTimelineData: !!(this.editor.lightTimeline && this.editor.lightTimeline.timelineData),
        timelineData: this.editor.lightTimeline ? this.editor.lightTimeline.timelineData : null
      });
      
      if (this.editor.lightTimeline && this.editor.lightTimeline.timelineData) {
        const lightData = this.editor.lightTimeline.timelineData;
        const currentTime = customTime !== null ? customTime : (this.editor.lightTimeline.currentTime || 0);
        
        console.log("🎬 LightTimeline 데이터 발견:", {
          lightData: lightData,
          currentTime: currentTime,
          tracksSize: lightData.tracks ? lightData.tracks.size : 0
        });
        
        // 현재 시간에 맞는 조명 값 적용
        this.applyLightTimelineData(lightData, currentTime);
      } else {
        console.log("⚠️ LightTimeline 또는 timelineData가 없습니다");
      }
      
      // 3. Scene의 userData에서 애니메이션 정보 활용
      if (this.editor.scene && this.editor.scene.userData) {
        this.applySceneAnimationData(this.editor.scene.userData, deltaTime);
      }
      
    } catch (error) {
      console.warn("⚠️ 타임라인 애니메이션 업데이트 실패:", error);
    }
  }

  // 🎯 MotionTimeline 데이터 적용
  applyMotionTimelineData(motionData, currentTime) {
    try {
      if (!motionData) return;

      console.log("🎬 MotionTimeline 데이터 적용 중...");
      console.log("🎬 현재 시간:", currentTime);
      console.log("🎬 tracks 크기:", motionData.tracks ? motionData.tracks.size : "없음");
      console.log("🎬 precomputedData 크기:", motionData.precomputedData ? motionData.precomputedData.size : "없음");

      // 🎬 FBX 애니메이션 믹서 시간 설정 (클립 상대 시간 사용)
      this.updateFBXAnimationMixersForRendering(currentTime);

      // precomputedData가 있다면 사용, 없다면 tracks 사용
      if (motionData.precomputedData && motionData.precomputedData.size > 0) {
        console.log("🎬 precomputedData 사용하여 애니메이션 적용...");
        const frameRate = motionData.frameRate || 30;
        this.applyPrecomputedData(motionData.precomputedData, currentTime, frameRate);
      } else {
        console.log("🎬 tracks를 사용하여 애니메이션 적용 (fallback)");
        console.log("🎬 precomputedData가 없거나 비어있어서 tracks 데이터를 사용합니다");

        if (!motionData.tracks) return;
      
      // 각 객체의 애니메이션 데이터 적용
        motionData.tracks.forEach((objectTracks, objectUuid) => {
          console.log(`🎬 객체 ${objectUuid} 처리 중...`);
          console.log(`🎬 객체 속성 개수:`, objectTracks.size);
          console.log(`🎬 객체 속성들:`, Array.from(objectTracks.keys()));

          // 원본 에디터 씬에서 직접 객체 찾기
          let targetObject = null;
          this.editor.scene.traverse((object) => {
            if (object.uuid === objectUuid) {
              targetObject = object;
            }
          });
          
          if (!targetObject) {
            console.warn(`⚠️ UUID ${objectUuid}에 해당하는 객체를 찾을 수 없음`);
            return;
          }

          console.log(`🎬 대상 객체:`, targetObject);
          console.log(`🎬 원본 UUID: ${objectUuid} 직접 사용`);

          // 🎬 객체 가시성 먼저 설정 (tracks에서 직접 가져오기)
          const visibleTrack = objectTracks.get('visible');
          if (visibleTrack) {
            const isVisible = visibleTrack.getValueAtTime(currentTime);
            targetObject.visible = isVisible;
            console.log(`🎬 객체 ${objectUuid} 가시성 설정:`, isVisible);
          } else {
            // fallback: 기본적으로 보이게 설정
            targetObject.visible = true;
          }

          // 각 속성(position, rotation, scale)에 대해 처리
          objectTracks.forEach((trackData, property) => {
            console.log(`🎬 속성 ${property} 처리 중...`);
            console.log(`🎬 trackData:`, trackData);
            console.log(`🎬 trackData.times:`, trackData.times);
            console.log(`🎬 trackData.values:`, trackData.values);
            console.log(`🎬 trackData.keyframeCount:`, trackData.keyframeCount);

            // 현재 시간에 맞는 값 계산 및 적용
            const value = this.calculateTimelineValue(trackData, currentTime, property);
            if (value !== null) {
              console.log(`🎬 ${property} 값 적용:`, value);
              this.applyValueToObject(targetObject, property, value);
            } else {
              console.log(`⚠️ ${property} 값 계산 실패`);
            }
          });
        });
      }

    } catch (error) {
      console.warn("⚠️ MotionTimeline 데이터 적용 실패:", error);
    }
  }

  // 🎯 precomputedData를 사용한 애니메이션 적용
  applyPrecomputedData(precomputedData, currentTime, frameRate = 30) {
    try {
      console.log("🎬 precomputedData 애니메이션 적용 중...");
      console.log("🎬 현재 시간:", currentTime);
      console.log("🎬 precomputedData 크기:", precomputedData.size);
      console.log("🎬 precomputedData 전체 구조:", precomputedData);

      // 각 객체의 precomputedData 처리
      precomputedData.forEach((objectProperties, objectUuid) => {
        console.log(`🎬 객체 ${objectUuid}의 precomputedData 처리 중...`);
        console.log(`🎬 객체 속성 개수:`, objectProperties.size);
        console.log(`🎬 객체 속성들:`, Array.from(objectProperties.keys()));
        console.log(`🎬 객체 ${objectUuid}의 전체 precomputedData:`, objectProperties);

        // 원본 에디터 씬에서 직접 객체 찾기
        let targetObject = null;
        this.editor.scene.traverse((object) => {
          if (object.uuid === objectUuid) {
            targetObject = object;
          }
        });

        if (!targetObject) {
          console.warn(`⚠️ UUID ${objectUuid}에 해당하는 객체를 찾을 수 없음`);
          return;
        }

        console.log(`🎬 대상 객체:`, targetObject);

        // 🎬 객체 가시성 먼저 설정 (precomputedData에서 직접 가져오기)
        const visibleArray = objectProperties.get('visible');
        console.log(`🎬 visible 배열 확인:`, {
            hasVisible: objectProperties.has('visible'),
            visibleArray: visibleArray,
            visibleArrayType: visibleArray ? visibleArray.constructor.name : 'undefined',
            visibleArrayLength: visibleArray ? visibleArray.length : 0
        });
        
        if (visibleArray && visibleArray instanceof Uint8Array) {
          const frameIndex = Math.floor(currentTime * frameRate);
          console.log(`🎬 visible 프레임 인덱스 계산:`, {
            currentTime,
            frameRate,
            frameIndex,
            visibleArrayLength: visibleArray.length
          });
          
          if (visibleArray.length > frameIndex) {
            const isVisible = visibleArray[frameIndex] === 1;
            targetObject.visible = isVisible;
            console.log(`🎬 객체 ${objectUuid} 가시성 설정 (프레임 ${frameIndex}):`, isVisible);
            console.log(`🎬 visible 배열 값들 (처음 10개):`, Array.from(visibleArray.slice(0, 10)));
            console.log(`🎬 현재 프레임 ${frameIndex}의 visible 값: ${visibleArray[frameIndex]} (${isVisible ? 'true' : 'false'})`);
          } else {
            targetObject.visible = true; // 기본값
            console.log(`🎬 객체 ${objectUuid} 가시성 기본값 설정: true (프레임 인덱스 ${frameIndex}가 배열 길이 ${visibleArray.length}를 초과)`);
          }
        } else {
          // visible 트랙이 없으면 기본적으로 보이게 설정
          targetObject.visible = true;
          console.log(`🎬 객체 ${objectUuid} 가시성 기본값 설정: true (visible 배열 없음)`);
        }

        // 각 속성(position, rotation, scale)에 대해 처리
        objectProperties.forEach((valuesArray, property) => {
          console.log(`🎬 속성 ${property} 처리 중...`);
          console.log(`🎬 ${property} valuesArray 전체 구조:`, valuesArray);
          console.log(`🎬 ${property} valuesArray 길이:`, valuesArray ? valuesArray.length : 0);
          console.log(`🎬 ${property} valuesArray 타입:`, valuesArray ? valuesArray.constructor.name : 'undefined');

          // valuesArray가 Float32Array인지 확인
          if (!(valuesArray instanceof Float32Array)) {
            console.warn(`⚠️ ${property} valuesArray가 Float32Array가 아님:`, valuesArray);
            return;
          }

          // 현재 시간에 맞는 프레임 인덱스 계산
          // precomputedData는 frameRate 기반으로 계산된 값들이므로
          // 전달받은 frameRate를 사용하여 인덱스 계산
          const frameIndex = Math.floor(currentTime * frameRate);

          console.log(`🎬 ${property} 프레임 ${frameIndex} (precomputedData 배열 인덱스):`, frameIndex);
          console.log(`🎬 ${property} valuesArray 배열 크기:`, valuesArray.length);
          console.log(`🎬 ${property} 현재 프레임 인덱스: ${frameIndex}, 데이터 범위: ${frameIndex * 3} ~ ${frameIndex * 3 + 2}`);
          console.log(`🎬 ${property} 현재 시간 ${currentTime}초에 해당하는 프레임 인덱스: ${frameIndex}`);

          // valuesArray에서 해당 프레임의 값 가져오기
          if (valuesArray.length > frameIndex * 3 + 2) {
            let value;

            if (property === 'position') {
              value = new THREE.Vector3(
                valuesArray[frameIndex * 3],
                valuesArray[frameIndex * 3 + 1],
                valuesArray[frameIndex * 3 + 2]
              );
            } else if (property === 'rotation') {
              value = new THREE.Vector3(
                valuesArray[frameIndex * 3],
                valuesArray[frameIndex * 3 + 1],
                valuesArray[frameIndex * 3 + 2]
              );
            } else if (property === 'scale') {
              value = new THREE.Vector3(
                valuesArray[frameIndex * 3],
                valuesArray[frameIndex * 3 + 1],
                valuesArray[frameIndex * 3 + 2]
              );
            }

            if (value) {
              console.log(`🎬 ${property} 값 적용 (프레임 ${frameIndex}):`, value);
              console.log(`🎬 ${property} valuesArray 원본 값: [${valuesArray[frameIndex * 3]}, ${valuesArray[frameIndex * 3 + 1]}, ${valuesArray[frameIndex * 3 + 2]}]`);
              console.log(`🎬 ${property} 적용 전 객체 ${property}:`, targetObject[property]);
              this.applyValueToObject(targetObject, property, value);
              console.log(`🎬 ${property} 적용 후 객체 ${property}:`, targetObject[property]);
            }
          } else {
            console.warn(`⚠️ ${property} 프레임 ${frameIndex} 데이터가 부족합니다. 배열 크기: ${valuesArray.length}, 필요 크기: ${frameIndex * 3 + 3}`);
          }
        });
      });
      
    } catch (error) {
      console.warn("⚠️ precomputedData 애니메이션 적용 실패:", error);
    }
  }

  // 🎯 LightTimeline 데이터 적용
  applyLightTimelineData(lightData, currentTime) {
    try {
      // console.log("🎬 === LightTimeline 데이터 적용 시작 ===");
      // console.log("🎬 lightData:", lightData);
      // console.log("🎬 currentTime:", currentTime);
      
      if (!lightData) {
        console.warn("⚠️ lightData가 없습니다");
        return;
      }
      
      if (!lightData.tracks) {
        console.warn("⚠️ lightData.tracks가 없습니다");
        return;
      }
      
      // console.log("🎬 tracks 크기:", lightData.tracks.size);

      // 각 조명의 애니메이션 데이터 적용
      lightData.tracks.forEach((objectTracks, objectId) => {
        // 원본 에디터 씬에서 직접 조명 찾기 (UUID 매칭)
        let targetLight = null;
        this.editor.scene.traverse((object) => {
          if (object.type.includes('Light') && object.uuid === objectId) {
            targetLight = object;
          }
        });
          
        if (!targetLight) {
          // UUID로 찾지 못한 경우 이름으로도 시도
          this.editor.scene.traverse((object) => {
            if (object.type.includes('Light') && object.name === objectId) {
              targetLight = object;
            }
          });
        }

        if (!targetLight) {
          return; // 조명을 찾지 못한 경우 건너뛰기
        }

        // 각 속성에 대해 처리
        objectTracks.forEach((trackData, property) => {
          if (trackData.getKeyframeCount() === 0) {
            return; // 키프레임이 없는 경우 건너뛰기
          }

          const value = trackData.getValueAtTime(currentTime);
          
          if (value !== null) {
            // 조명 속성 적용
            switch (property) {
              case "intensity":
                targetLight.intensity = value.x;
                break;
              case "color":
                targetLight.color.setRGB(value.x, value.y, value.z);
                break;
              case "position":
                targetLight.position.copy(value);
                break;
              case "distance":
                targetLight.distance = value.x;
                break;
              case "angle":
                targetLight.angle = value.x;
                break;
              case "penumbra":
                targetLight.penumbra = value.x;
                break;
              case "decay":
                targetLight.decay = value.x;
                break;
            }

            // 조명 객체의 matrix 업데이트 (렌더링 시 정확한 위치/회전 보장)
            if (targetLight.updateMatrix) {
              targetLight.updateMatrix();
            }
            if (targetLight.updateMatrixWorld) {
              targetLight.updateMatrixWorld(true);
            }
          }
        });
      });

      // 🎯 타겟 조명의 target position 처리
      if (lightData.targetTracks) {
        lightData.targetTracks.forEach((objectTracks, objectId) => {
          // 타겟 객체 찾기 (이름으로)
          let targetObject = this.editor.scene.getObjectByName(objectId);
          
          if (!targetObject) {
            return; // 타겟 객체를 찾지 못한 경우 건너뛰기
          }

          // 각 속성에 대해 처리
          objectTracks.forEach((trackData, property) => {
            if (trackData.getKeyframeCount() === 0) {
              return; // 키프레임이 없는 경우 건너뛰기
            }

            const value = trackData.getValueAtTime(currentTime);
            
            if (value !== null) {
              // 타겟 속성 적용
              switch (property) {
                case "position":
                  targetObject.position.copy(value);
                  break;
              }

              // 타겟 객체의 matrix 업데이트
              if (targetObject.updateMatrix) {
                targetObject.updateMatrix();
              }
              if (targetObject.updateMatrixWorld) {
                targetObject.updateMatrixWorld(true);
              }
            }
          });
        });
      }
      
      // console.log("🎬 === LightTimeline 데이터 적용 완료 ===");
      
    } catch (error) {
      console.error("❌ LightTimeline 데이터 적용 실패:", error);
      console.error("❌ 에러 스택:", error.stack);
    }
  }

  // 🎯 Scene userData 애니메이션 적용
  applySceneAnimationData(sceneUserData, deltaTime) {
    try {
      // FBX 애니메이션 믹서가 있다면 업데이트
      if (sceneUserData.animationMixers && Array.isArray(sceneUserData.animationMixers)) {
        sceneUserData.animationMixers.forEach((mixer) => {
          if (mixer && mixer.update && typeof mixer.update === 'function') {
            mixer.update(deltaTime);
          }
        });
      }
      
      // 키프레임 애니메이션 데이터가 있다면 적용
      if (sceneUserData.keyframes) {
        this.applyKeyframeAnimation(sceneUserData.keyframes, deltaTime);
      }
      
    } catch (error) {
      console.warn("⚠️ Scene 애니메이션 데이터 적용 실패:", error);
    }
  }

  // 🎯 타임라인 값 계산
  calculateTimelineValue(track, currentTime, property) {
    try {
      if (!track.times || !track.values || track.times.length === 0) {
        return null;
      }
      
      // 현재 시간에 맞는 키프레임 찾기
      let startIndex = 0;
      let endIndex = 0;
      
      for (let i = 0; i < track.times.length; i++) {
        if (track.times[i] <= currentTime) {
          startIndex = i;
        } else {
          endIndex = i;
          break;
        }
      }
      
      if (startIndex === endIndex) {
        // 정확한 키프레임
        return this.extractValue(track, startIndex, property);
      }
      
      // 보간 계산
      const startTime = track.times[startIndex];
      const endTime = track.times[endIndex];
      const alpha = (currentTime - startTime) / (endTime - startTime);
      
      const startValue = this.extractValue(track, startIndex, property);
      const endValue = this.extractValue(track, endIndex, property);
      
      return this.interpolateValue(startValue, endValue, alpha);
      
    } catch (error) {
      console.warn("⚠️ 타임라인 값 계산 실패:", error);
      return null;
    }
  }

  // 🎯 값 추출
  extractValue(track, index, property) {
    try {
      if (property === 'position') {
        return new THREE.Vector3(
          track.values[index * 3],
          track.values[index * 3 + 1],
          track.values[index * 3 + 2]
        );
      } else if (property === 'rotation') {
        return new THREE.Vector3(
          track.values[index * 3],
          track.values[index * 3 + 1],
          track.values[index * 3 + 2]
        );
      } else if (property === 'scale') {
        return new THREE.Vector3(
          track.values[index * 3],
          track.values[index * 3 + 1],
          track.values[index * 3 + 2]
        );
      }
      
      return track.values[index];
      
    } catch (error) {
      console.warn("⚠️ 값 추출 실패:", error);
      return null;
    }
  }

  // 🎯 값 보간
  interpolateValue(startValue, endValue, alpha) {
    try {
      if (startValue instanceof THREE.Vector3 && endValue instanceof THREE.Vector3) {
        return startValue.clone().lerp(endValue, alpha);
      }
      
      if (typeof startValue === 'number' && typeof endValue === 'number') {
        return startValue + (endValue - startValue) * alpha;
      }
      
      return startValue;
      
    } catch (error) {
      console.warn("⚠️ 값 보간 실패:", error);
      return startValue;
    }
  }

  // 🎯 객체에 값 적용
  applyValueToObject(object, property, value) {
    try {
      if (property === 'position' && value instanceof THREE.Vector3) {
        object.position.copy(value);
        console.log(`🎬 position 적용: ${object.name}`, value[0]);
      } else if (property === 'rotation' && value instanceof THREE.Vector3) {
        // MotionTimeline 옵션으로 회전 축 제한 지원
        const rotationAxisLock = this.editor?.motionTimeline?.options?.rotationAxisLock;
        if (rotationAxisLock === 'y') {
          const base = object.userData?.motionRotationBase || object.userData?.motionRotationOffset;
          const bx = base?.x ?? 0;
          const by = base?.y ?? 0;
          const bz = base?.z ?? 0;
          object.rotation.set(bx, by + value.y, bz);
        } else {
          object.rotation.set(value.x, value.y, value.z);
        }
        console.log(`🎬 rotation 적용: ${object.name}`, value);
      } else if (property === 'scale' && value instanceof THREE.Vector3) {
        object.scale.copy(value);
        console.log(`🎬 scale 적용: ${object.name}`, value);
      } else if (property === 'intensity' && typeof value === 'number') {
        if (object.intensity !== undefined) {
          const oldIntensity = object.intensity;
          object.intensity = value;
          console.log(`🎬 intensity 적용: ${object.name} ${oldIntensity} → ${value}`);
        } else {
          console.warn(`⚠️ ${object.name}에 intensity 속성이 없습니다`);
        }
      } else if (property === 'color') {
        if (object.color) {
          const oldColor = object.color.getHexString();
          if (value instanceof THREE.Color) {
            object.color.copy(value);
          } else if (typeof value === 'number') {
            object.color.setHex(value);
          } else if (Array.isArray(value) && value.length >= 3) {
            object.color.setRGB(value[0], value[1], value[2]);
          }
          console.log(`🎬 color 적용: ${object.name} #${oldColor} → #${object.color.getHexString()}`);
        } else {
          console.warn(`⚠️ ${object.name}에 color 속성이 없습니다`);
        }
      }

      // 객체의 매트릭스 업데이트
      object.updateMatrix();
      object.updateMatrixWorld(true);

      // 에디터 시그널 발생 (메인 캔버스 업데이트용)
      if (this.editor.signals && this.editor.signals.objectChanged) {
        this.editor.signals.objectChanged.dispatch(object, { fromTimeline: true });
      }

      // 🎬 즉시 렌더링하여 변경사항 표시
      if (this.renderRenderer && this.editor.scene && this.renderCamera) {
        this.renderRenderer.render(this.editor.scene, this.renderCamera);
      }

    } catch (error) {
      console.warn("⚠️ 객체에 값 적용 실패:", error);
    }
  }

  // 🎯 키프레임 애니메이션 적용
  applyKeyframeAnimation(keyframes, deltaTime) {
    try {
      // 키프레임 애니메이션 로직 구현
      // (필요에 따라 확장)
      
    } catch (error) {
      console.warn("⚠️ 키프레임 애니메이션 적용 실패:", error);
    }
  }

  // 🎬 렌더링 프로세스 중지
  stopRenderProcess() {
    try {
      console.log("🎬 렌더링 프로세스 중지...");
      
      this.isRenderingActive = false;
      
      if (this.animationLoopId) {
        cancelAnimationFrame(this.animationLoopId);
        this.animationLoopId = null;
      }
      
      console.log("✅ 렌더링 프로세스 중지 완료");
      
    } catch (error) {
      console.error("❌ 렌더링 프로세스 중지 실패:", error);
    }
  }

  // 🎬 정리
  dispose() {
    try {
      console.log("🎬 TimelineRenderer 리소스 정리 시작...");

      // 1. 렌더링 프로세스 중지
      this.stopRenderProcess();
      this.stopTestAnimation();

      // 2. 애니메이션 루프 정리
      if (this.animationLoopId) {
        cancelAnimationFrame(this.animationLoopId);
        this.animationLoopId = null;
        console.log("✅ 애니메이션 루프 정리 완료");
      }

      // 3. 렌더러 정리
      if (this.renderRenderer) {
        this.renderRenderer.dispose();
        this.renderRenderer = null;
        console.log("✅ WebGL 렌더러 정리 완료");
      }

      // 4. 카메라 정리
      if (this.renderCamera) {
        this.renderCamera = null;
        console.log("✅ 렌더링 카메라 정리 완료");
      }

      // 5. 씬 참조 정리 (직접 참조이므로 null만 설정)
      if (this.renderScene) {
        this.renderScene = null;
        console.log("✅ 렌더링 씬 참조 정리 완료");
      }

      // 6. 캔버스 컨트롤 정리
      if (this.canvasControls) {
        this.canvasControls = null;
        console.log("✅ 캔버스 컨트롤 정리 완료");
      }

      // 7. 렌더링된 프레임 데이터 정리 (메모리 해제 강화)
      if (this.renderedFrames) {
        console.log(`🗑️ ${this.renderedFrames.length}개의 렌더링된 프레임 데이터 정리 시작...`);
        
        // 각 프레임의 데이터 URL 메모리 해제
        this.renderedFrames.forEach((frame, index) => {
          if (frame && frame.dataURL) {
            // Blob URL이 있다면 해제
            if (frame.dataURL.startsWith('blob:')) {
              URL.revokeObjectURL(frame.dataURL);
            }
            // 프레임 데이터 완전 삭제
            delete frame.dataURL;
            delete frame.size;
            delete frame.timestamp;
          }
        });
        
        // 배열 완전 초기화
        this.renderedFrames.length = 0;
        this.renderedFrames = [];
        
        // 가비지 컬렉션 힌트
        if (typeof window.gc === 'function') {
          window.gc();
        }
        
        console.log("✅ 렌더링된 프레임 데이터 정리 완료 (메모리 해제 포함)");
      }

      // 8. 현재 프레임 인덱스 초기화
      this.currentFrameIndex = 0;

      // 9. 렌더링 상태 초기화
      this.isRenderingActive = false;

      // 10. 렌더링 클록 정리
      if (this.renderClock) {
        this.renderClock.stop();
        // renderClock을 null로 설정하지 않음 (재사용을 위해)
        console.log("✅ 렌더링 클록 정리 완료");
      }

      // 11. 테스트 애니메이션 관련 정리
      if (this.testAnimationId) {
        cancelAnimationFrame(this.testAnimationId);
        this.testAnimationId = null;
        console.log("✅ 테스트 애니메이션 정리 완료");
      }

      // 12. 에디터 씬의 애니메이션 믹서 정리 (필요시)
      if (this.editor && this.editor.scene && this.editor.scene.userData.animationMixers) {
        // 애니메이션 믹서는 에디터 씬의 일부이므로 완전히 제거하지 않고 정리만
        console.log("ℹ️ 에디터 씬 애니메이션 믹서는 유지 (에디터 씬의 일부)");
      }

      // 에디터 참조는 유지 (외부에서 관리되는 객체이므로)
      console.log("ℹ️ 에디터 참조는 유지 (외부에서 관리되는 객체)");

      // 13. 팝업과 캔버스 참조 정리
      if (this.renderPopup) {
        this.renderPopup = null;
        console.log("✅ 렌더링 팝업 참조 정리 완료");
      }

      if (this.renderCanvas) {
        // 캔버스 메모리 정리
        const ctx = this.renderCanvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, this.renderCanvas.width, this.renderCanvas.height);
        }
        
        // WebGL 컨텍스트 정리
        const gl = this.renderCanvas.getContext('webgl') || this.renderCanvas.getContext('webgl2');
        if (gl) {
          const ext = gl.getExtension('WEBGL_lose_context');
          if (ext) {
            ext.loseContext();
          }
        }
        
        this.renderCanvas = null;
        console.log("✅ 렌더링 캔버스 메모리 정리 완료");
      }

      // 렌더링 중 오디오 정지 및 참조 정리
      if (this._renderAudioResult) {
        try {
          if (this._renderAudioResult.source) {
            this._renderAudioResult.source.stop();
          }
        } catch (e) {
          // 이미 정지된 경우 등 무시
        }
        this._renderAudioResult = null;
      }
      if (this._renderAudioContext && this._renderAudioContext.state !== 'closed') {
        this._renderAudioContext.close().catch(() => {});
        this._renderAudioContext = null;
      }
      const renderMuteBtn = document.getElementById('render-mute-btn');
      if (renderMuteBtn) renderMuteBtn.style.display = 'none';

      // 14. 추가 메모리 정리
      // DOM 요소들의 이벤트 리스너 정리
      const renderElements = document.querySelectorAll('#render-canvas, #start-render-btn, #download-video-btn, #close-render-popup');
      renderElements.forEach(element => {
        if (element && element.cloneNode) {
          const newElement = element.cloneNode(true);
          if (element.parentNode) {
            element.parentNode.replaceChild(newElement, element);
          }
        }
      });

      // 15. 최종 메모리 정리
      if (typeof window.gc === 'function') {
        window.gc();
        console.log("✅ 가비지 컬렉션 요청 완료");
      }
      
      console.log("🎯 렌더링 데이터 완전 정리 완료 - 메모리 해제됨");

      console.log("✅ TimelineRenderer 리소스 정리 완료");
      
    } catch (error) {
      console.error("❌ TimelineRenderer 리소스 정리 실패:", error);
    }
  }

  // 🎬 실제 비디오 렌더링 시작
  startVideoRendering(canvas, statusElement, startBtn, renderOptions) {
    try {
      console.log("🎬 비디오 렌더링 시작...");

      const { resolution, fps, duration, progressFill, progressText, videoProgressFill, videoProgressText } = renderOptions;

      // 사용자 제스처 직후에 AudioContext 생성·resume (렌더링 중 오디오 재생 허용)
      if (!this._renderAudioContext || this._renderAudioContext.state === 'closed') {
        this._renderAudioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      this._renderAudioContext.resume().catch(() => {});

      // 렌더링 중 오디오 재생 (비동기, 위에서 resume된 컨텍스트 전달)
      this._renderAudioResult = null;
      this._renderMuted = false;
      (async () => {
        try {
          const result = await this.getMixedAudioStream(duration, this._renderAudioContext);
          if (result) {
            this._renderAudioResult = result;
            result.startPlayback();
            const muteBtn = document.getElementById('render-mute-btn');
            if (muteBtn) {
              muteBtn.style.display = '';
              muteBtn.title = '렌더링 중 오디오 음소거';
              muteBtn.innerHTML = '<i class="fas fa-volume-up"></i> 소리';
            }
            console.log("🎵 렌더링 중 오디오 재생 시작");
          }
        } catch (e) {
          console.warn("⚠️ 렌더링 중 오디오 재생 실패:", e);
        }
      })();

      // 해상도 파싱
      const [width, height] = resolution.split('x').map(Number);

      // 캔버스 크기 조정
      canvas.width = width;
      canvas.height = height;
      this.renderRenderer.setSize(width, height);

      // 렌더링 상태 업데이트
      statusElement.innerHTML = `🎬 렌더링 중... (${width}x${height}, ${fps} FPS, ${duration}초)`;
      statusElement.style.color = '#FFA500';

      // 프레임 수 계산
      const totalFrames = fps * duration;
      let currentFrame = 0;

      // 렌더링된 프레임 배열 초기화
      this.renderedFrames = [];
      this.currentFrameIndex = 0;

      // 🎬 렌더링용 클록 초기화
      this.renderClock.start();

      // 렌더링 루프
      const renderFrame = async () => {
        if (!this.isRenderingActive) {
          console.log("⏸️ 렌더링이 중단되었습니다");
          return;
        }

        try {
          // 현재 시간 계산 (0초 ~ duration초)
          const currentTime = (currentFrame / fps);

          // 🎬 FBX 애니메이션 믹서 업데이트 (deltaTime 기반)
          const deltaTime = this.renderClock.getDelta();
          this.updateFBXAnimationMixers(deltaTime);

          // 타임라인 애니메이션 업데이트
          this.updateAnimationFromTimeline(1 / fps, currentTime);

          // 🎬 시간 표시 업데이트
          // this.updateTimeDisplay(currentTime);

          // 렌더링
          if (this.renderRenderer && this.editor.scene && this.renderCamera) {
            this.renderRenderer.render(this.editor.scene, this.renderCamera);
          }

          // 🎬 프레임을 캔버스에서 캡처하여 저장
          const frameData = this.captureFrame(canvas, currentFrame, currentTime);
          this.renderedFrames.push(frameData);

          // 🎬 현재 프레임 인덱스 업데이트 (FBX 애니메이션 로깅용)
          this.currentFrameIndex = currentFrame;

          // 프로그레스 업데이트
          const progress = (currentFrame / totalFrames) * 100;
          progressFill.style.width = `${progress}%`;
          progressText.innerHTML = `${Math.round(progress)}% 완료 (${currentFrame}/${totalFrames} 프레임)`;

          // 프레임 정보 업데이트
          this.updateFrameInfo(currentFrame, totalFrames);

          currentFrame++;

          // 다음 프레임 렌더링
          if (currentFrame <= totalFrames && this.isRenderingActive) {
            setTimeout(renderFrame, 1000 / fps);
          } else {
            // 렌더링 완료
            this.onRenderingComplete(statusElement, startBtn, progressFill, progressText, videoProgressFill, videoProgressText);
          }

        } catch (error) {
          console.error("❌ 프레임 렌더링 실패:", error);
          this.onRenderingError(statusElement, startBtn, error);
        }
      };

      // 첫 번째 프레임 렌더링 시작
      renderFrame();

    } catch (error) {
      console.error("❌ 비디오 렌더링 시작 실패:", error);
      this.onRenderingError(statusElement, startBtn, error);
    }
  }

  // 🎬 프레임 캡처 및 저장
  captureFrame(canvas, frameIndex, currentTime) {
    try {
      // 캔버스에서 이미지 데이터 URL 생성
      const dataURL = canvas.toDataURL('image/png', 0.9);

      // 프레임 정보 저장
      const frameData = {
        index: frameIndex,
        time: currentTime,
        dataURL: dataURL,
        size: Math.round(dataURL.length * 0.75 / 1024), // 대략적인 KB 크기
        timestamp: Date.now()
      };

      console.log(`🎬 프레임 ${frameIndex} 캡처 완료: ${frameData.size}KB`);
      return frameData;

    } catch (error) {
      console.error(`❌ 프레임 ${frameIndex} 캡처 실패:`, error);
      return null;
    }
  }

  // 🎬 프레임 정보 업데이트
  updateFrameInfo(currentFrame, totalFrames) {
    try {
      const frameInfo = document.getElementById('frame-info');
      if (frameInfo) {
        const totalSize = this.renderedFrames.reduce((sum, frame) => sum + (frame?.size || 0), 0);
        frameInfo.innerHTML = `프레임: ${currentFrame} / ${totalFrames} | 크기: ${totalSize}KB`;
      }
    } catch (error) {
      console.warn("⚠️ 프레임 정보 업데이트 실패:", error);
    }
  }

  // 🎬 렌더링 완료 처리
  onRenderingComplete(statusElement, startBtn, progressFill, progressText, videoProgressFill, videoProgressText) {
    try {
      console.log("✅ 렌더링 완료!");

      // 상태 업데이트
      statusElement.innerHTML = `✅ 렌더링 완료! ${this.renderedFrames.length}개 프레임 생성됨. 비디오 다운로드가 가능합니다.`;
      statusElement.style.color = '#4CAF50';

      // 프로그레스바 완료 표시
      progressFill.style.width = '100%';
      progressText.innerHTML = '100% 완료!';

      // 비디오 다운로드 프로그레스바 표시
      videoProgressFill.style.width = '100%';
      videoProgressText.innerHTML = '100% 완료!';

      // 프레임 정보 최종 업데이트
      const frameInfo = document.getElementById('frame-info');
      if (frameInfo) {
        const totalSize = this.renderedFrames.reduce((sum, frame) => sum + (frame?.size || 0), 0);
        frameInfo.innerHTML = `프레임: ${this.renderedFrames.length} / ${this.renderedFrames.length} | 크기: ${totalSize}KB`;
        frameInfo.style.color = '#4CAF50';
      }

      // 다운로드 버튼 표시
      const downloadBtn = document.getElementById('download-video-btn');
      if (downloadBtn) {
        downloadBtn.style.display = 'inline-block';
        downloadBtn.disabled = false;
      }

      // 🎬 렌더링 완료 후 렌더링 설정 폼 다시 활성화
      this.setRenderSettingsEnabled(true);

      // 🎬 렌더링 완료 후 캔버스 컨트롤 다시 활성화
      this.setCanvasControlsEnabled(true);

      // 시작 버튼 복원
      startBtn.disabled = false;
      startBtn.style.background = '#4CAF50';
      startBtn.innerHTML = '🔄 다시 렌더링';

      // 렌더링 상태 비활성화
      this.isRenderingActive = false;

      // 총 크기 계산
      const totalSize = this.renderedFrames.reduce((sum, frame) => sum + (frame?.size || 0), 0);
      console.log(`🎬 렌더링 완료 요약: ${this.renderedFrames.length}개 프레임, 총 ${totalSize}KB`);

    } catch (error) {
      console.error("❌ 렌더링 완료 처리 실패:", error);
    }
  }

  // 🎬 렌더링 에러 처리
  onRenderingError(statusElement, startBtn, error) {
    try {
      console.error("❌ 렌더링 에러 발생:", error);

      // 상태 업데이트
      statusElement.innerHTML = '❌ 렌더링 실패: ' + error.message;
      statusElement.style.color = '#FF4444';

      // 🎬 에러 발생 시 렌더링 설정 폼 다시 활성화
      this.setRenderSettingsEnabled(true);

      // 🎬 에러 발생 시 캔버스 컨트롤 다시 활성화
      this.setCanvasControlsEnabled(true);

      // 시작 버튼 복원
      startBtn.disabled = false;
      startBtn.style.background = '#4CAF50';
      startBtn.innerHTML = '<i class="fas fa-play"></i> 렌더링 시작';

      // 렌더링 상태 비활성화
      this.isRenderingActive = false;

    } catch (error) {
      console.error("❌ 렌더링 에러 처리 실패:", error);
    }
  }

  // 📥 비디오 다운로드
  async downloadVideo() {
    try {
      console.log("📥 비디오 다운로드 시작...");

      if (!this.renderCanvas) {
        console.error("❌ 렌더링 캔버스가 없습니다");
        return;
      }

      // 다운로드 상태 업데이트
      const downloadBtn = document.getElementById('download-video-btn');
      if (downloadBtn) {
        downloadBtn.disabled = true;
        downloadBtn.innerHTML = '⏳ 비디오 생성 중...';
      }

      // 비디오 다운로드 프로그레스바 표시
      const videoProgressContainer = document.getElementById('video-progress-container');
      const videoProgressBar = document.getElementById('video-progress-bar');
      const videoProgressFill = document.getElementById('video-progress-fill');
      const videoProgressText = document.getElementById('video-progress-text');

      videoProgressContainer.style.display = 'flex';
      videoProgressBar.style.width = '0%';
      videoProgressText.innerHTML = '0% 완료';

      // 렌더링 설정 가져오기
      const resolution = document.getElementById('resolution-select').value;
      const fps = parseInt(document.getElementById('fps-select').value);
      const duration = parseInt(document.getElementById('duration-input').value);

      console.log(`🎬 비디오 생성 설정: ${resolution}, ${fps} FPS, ${duration}초`);

      // 🎬 MediaRecorder로 WebM 비디오 생성
      try {
        await this.createWebMVideo(resolution, fps, duration);
      } catch (webmError) {
        console.warn("⚠️ WebM 비디오 생성 실패, PNG 이미지로 대체:", webmError);
        // WebM 실패 시 PNG 이미지 다운로드로 폴백
        this.downloadPNGImage();
      }

    } catch (error) {
      console.error("❌ 비디오 다운로드 실패:", error);
      alert('비디오 다운로드에 실패했습니다: ' + error.message);

      // 버튼 상태 복원
      const downloadBtn = document.getElementById('download-video-btn');
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '📥 비디오 다운로드';
      }
    }
  }

  /**
   * 씬의 오디오 객체들을 타임라인에 맞춰 믹싱한 뒤 MediaStream으로 반환.
   * @param {number} durationSeconds - 출력 길이(초)
   * @param {AudioContext} [reusedContext] - 사용자 제스처에서 이미 resume된 컨텍스트 (렌더 중 재생용)
   * @returns {Promise<{ stream: MediaStream, startPlayback: function }|null>}
   */
  async getMixedAudioStream(durationSeconds, reusedContext) {
    const scene = this.editor.scene;
    const audioObjects = [];
    scene.traverse((obj) => {
      if (obj.userData && obj.userData.type === 'audio') audioObjects.push(obj);
    });
    if (audioObjects.length === 0) return null;

    const sampleRate = 48000;
    const numChannels = 2;
    const length = Math.ceil(sampleRate * durationSeconds);
    const offlineContext = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(numChannels, length, sampleRate);

    const decodedCache = {};
    for (const obj of audioObjects) {
      const el = obj.userData.audioElement;
      if (!el || !el.src) continue;
      if (!decodedCache[el.src]) {
        decodedCache[el.src] = fetch(el.src)
          .then((r) => r.arrayBuffer())
          .then((ab) => offlineContext.decodeAudioData(ab))
          .catch((err) => {
            console.warn('오디오 디코드 실패:', el.src, err);
            return null;
          });
      }
    }

    const srcToBuffer = {};
    for (const k of Object.keys(decodedCache)) {
      srcToBuffer[k] = await decodedCache[k];
    }

    for (const obj of audioObjects) {
      const ud = obj.userData;
      const el = ud.audioElement;
      if (!el || !el.src || !srcToBuffer[el.src]) continue;

      const buffer = srcToBuffer[el.src];
      const startTime = ud.startTime || 0;
      const offset = ud.audioStartTime || 0;
      const endTime = ud.audioEndTime != null ? ud.audioEndTime : el.duration;
      const clipDuration = Math.min(ud.duration || 0, Math.max(0, endTime - offset));
      if (clipDuration <= 0) continue;

      const gainNode = offlineContext.createGain();
      gainNode.gain.value = ud.mute ? 0 : (ud.volume != null ? ud.volume : 1);
      const source = offlineContext.createBufferSource();
      source.buffer = buffer;
      source.connect(gainNode);
      gainNode.connect(offlineContext.destination);
      source.start(startTime, offset, clipDuration);
    }

    const renderedBuffer = await offlineContext.startRendering();

    const audioContext = reusedContext && reusedContext.state !== 'closed'
      ? reusedContext
      : new (window.AudioContext || window.webkitAudioContext)();
    const destination = audioContext.createMediaStreamDestination();
    const gainNode = audioContext.createGain();
    gainNode.gain.value = 1;
    const source = audioContext.createBufferSource();
    source.buffer = renderedBuffer;
    source.connect(gainNode);
    gainNode.connect(destination);
    gainNode.connect(audioContext.destination); // 스피커로 재생 (렌더링 중 들리도록)

    return {
      stream: destination.stream,
      startPlayback: () => {
        const play = () => {
          try {
            source.start(0);
          } catch (e) {
            console.warn('오디오 재생 시작 실패:', e);
          }
        };
        if (audioContext.state === 'suspended') {
          audioContext.resume().then(play).catch((e) => console.warn('AudioContext resume 실패:', e));
        } else {
          play();
        }
      },
      setMuted: (muted) => {
        gainNode.gain.value = muted ? 0 : 1;
      },
      audioContext,
      source,
      gainNode
    };
  }

  // 🎬 WebM 비디오 생성
  async createWebMVideo(resolution, fps, duration) {
    try {
      console.log("🎬 WebM 비디오 생성 시작...");

      if (this.renderedFrames.length === 0) {
        throw new Error("렌더링된 프레임이 없습니다. 먼저 렌더링을 완료해주세요.");
      }

      const [width, height] = resolution.split('x').map(Number);
      const totalFrames = this.renderedFrames.length;
      const durationSeconds = totalFrames / fps;

      let audioResult = null;
      try {
        audioResult = await this.getMixedAudioStream(durationSeconds);
        if (audioResult) console.log("🎵 오디오 믹싱 완료, WebM에 포함됩니다.");
      } catch (e) {
        console.warn("⚠️ 오디오 믹싱 실패, 비디오만 포함:", e);
      }

      console.log(`🎬 비디오 생성 정보: ${width}x${height}, ${fps} FPS, ${totalFrames} 프레임${audioResult ? ', 오디오 포함' : ''}`);

      // 🎬 Timeline.js 방식: 임시 캔버스 생성하여 프레임들을 순차적으로 그리기
      const tempCanvas = document.createElement('canvas');
      const tempContext = tempCanvas.getContext('2d');

      // 첫 번째 프레임에서 크기 확인
      const firstFrame = this.renderedFrames[0];
      if (!firstFrame || !firstFrame.dataURL) {
        throw new Error("첫 번째 프레임 데이터가 유효하지 않습니다");
      }

      // 이미지 로드하여 크기 설정
      const img = new Image();
      img.onload = () => {
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;

        console.log("🎬 임시 캔버스 크기:", { width: img.width, height: img.height });

        const videoStream = tempCanvas.captureStream(fps);
        const hasAudio = audioResult && audioResult.stream.getAudioTracks().length > 0;
        const stream = hasAudio
          ? new MediaStream([...videoStream.getVideoTracks(), ...audioResult.stream.getAudioTracks()])
          : videoStream;

        const mimeType = hasAudio && MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
          ? 'video/webm;codecs=vp9,opus'
          : 'video/webm;codecs=vp9';
        const recorderOptions = {
          mimeType,
          videoBitsPerSecond: 5000000
        };
        if (hasAudio) recorderOptions.audioBitsPerSecond = 128000;

        const mediaRecorder = new MediaRecorder(stream, recorderOptions);

        const chunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
            console.log(`🎬 비디오 청크 수집: ${event.data.size} bytes`);
          }
        };

        mediaRecorder.onstop = () => {
          try {
            console.log(`🎬 비디오 청크 수집 완료: ${chunks.length}개 청크`);

            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            console.log(`🎬 비디오 Blob 생성 완료: ${blob.size} bytes`);

            // 다운로드 링크 생성
            const link = document.createElement('a');
            link.download = `timeline-render-${Date.now()}.webm`;
            link.href = url;

            // 다운로드 실행
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // 메모리 정리
            URL.revokeObjectURL(url);

            console.log("✅ WebM 비디오 다운로드 완료");

            // 버튼 상태 복원
            const downloadBtn = document.getElementById('download-video-btn');
            if (downloadBtn) {
              downloadBtn.disabled = false;
              downloadBtn.innerHTML = '📥 비디오 다운로드';
            }

          } catch (error) {
            console.error("❌ WebM 비디오 처리 실패:", error);
            throw error;
          }
        };

        // 녹화 시작 (오디오가 있으면 비디오와 동시에 재생 시작)
        if (hasAudio && audioResult && audioResult.startPlayback) {
          audioResult.startPlayback();
        }
        mediaRecorder.start();
        console.log("🎬 MediaRecorder 녹화 시작" + (hasAudio ? " (오디오 포함)" : ""));

        // 프레임들을 순차적으로 캔버스에 그리기
        let currentFrame = 0;
        const frameInterval = 1000 / fps;

        const drawNextFrame = () => {
          if (currentFrame >= this.renderedFrames.length) {
            console.log("🎬 모든 프레임 그리기 완료, 녹화 중지");
            mediaRecorder.stop();
            return;
          }

          const frame = this.renderedFrames[currentFrame];
          if (!frame || !frame.dataURL) {
            console.warn(`⚠️ 프레임 ${currentFrame} 데이터가 유효하지 않음`);
            currentFrame++;
            setTimeout(drawNextFrame, frameInterval);
            return;
          }

          const frameImg = new Image();
          frameImg.onload = () => {
            // 캔버스 지우기
            tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
            // 프레임 그리기
            tempContext.drawImage(frameImg, 0, 0);

            console.log(`🎬 프레임 ${currentFrame} 그리기 완료`);

            // 🎬 비디오 다운로드 프로그레스바 업데이트
            this.updateVideoProgress(currentFrame, this.renderedFrames.length);

            currentFrame++;

            // 다음 프레임 그리기
            if (currentFrame < this.renderedFrames.length) {
              setTimeout(drawNextFrame, frameInterval);
            } else {
              // 마지막 프레임 후 약간의 지연을 두고 녹화 중지
              setTimeout(() => {
                console.log("🎬 마지막 프레임 후 녹화 중지");
                mediaRecorder.stop();
              }, frameInterval);
            }
          };

          frameImg.onerror = (error) => {
            console.error(`❌ 프레임 ${currentFrame} 이미지 로드 실패:`, error);
            currentFrame++;
            setTimeout(drawNextFrame, frameInterval);
          };

          frameImg.src = frame.dataURL;
        };

        // 첫 번째 프레임부터 시작
        drawNextFrame();

      };

      img.onerror = (error) => {
        console.error("❌ 첫 번째 프레임 이미지 로드 실패:", error);
        throw new Error("첫 번째 프레임을 로드할 수 없습니다");
      };

      img.src = firstFrame.dataURL;

    } catch (error) {
      console.error("❌ WebM 비디오 생성 실패:", error);
      throw error;
    }
  }

  // 🎬 비디오 다운로드 프로그레스바 업데이트
  updateVideoProgress(currentFrame, totalFrames) {
    try {
      const videoProgressFill = document.getElementById('video-progress-fill');
      const videoProgressText = document.getElementById('video-progress-text');

      if (videoProgressFill && videoProgressText) {
        const progress = ((currentFrame + 1) / totalFrames) * 100;
        videoProgressFill.style.width = `${progress}%`;
        videoProgressText.innerHTML = `${Math.round(progress)}% 완료 (${currentFrame + 1}/${totalFrames} 프레임)`;
      }
    } catch (error) {
      console.warn("⚠️ 비디오 프로그레스바 업데이트 실패:", error);
    }
  }

  // 📷 PNG 이미지 다운로드 (폴백)
  downloadPNGImage() {
    try {
      console.log("📷 PNG 이미지 다운로드 시작...");

      if (!this.renderCanvas) {
        console.error("❌ 렌더링 캔버스가 없습니다");
        return;
      }

      // 캔버스에서 이미지 데이터 가져오기
      const canvas = this.renderCanvas;

      // 현재 캔버스 내용을 이미지로 변환
      const imageData = canvas.toDataURL('image/png');

      // 다운로드 링크 생성
      const link = document.createElement('a');
      link.download = `timeline-render-${Date.now()}.png`;
      link.href = imageData;

      // 다운로드 실행
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      console.log("✅ PNG 이미지 다운로드 완료");

      // 버튼 상태 복원
      const downloadBtn = document.getElementById('download-video-btn');
      if (downloadBtn) {
        downloadBtn.disabled = false;
        downloadBtn.innerHTML = '📥 비디오 다운로드';
      }

    } catch (error) {
      console.error("❌ PNG 이미지 다운로드 실패:", error);
      alert('이미지 다운로드에 실패했습니다: ' + error.message);
    }
  }

  // 🎬 해상도 업데이트
  updateResolution(canvas, resolution) {
    try {
      const [width, height] = resolution.split('x').map(Number);
      canvas.width = width;
      canvas.height = height;
      this.renderRenderer.setSize(width, height);
      console.log(`🎬 캔버스 크기 업데이트: ${width}x${height}`);
    } catch (error) {
      console.error("❌ 해상도 업데이트 실패:", error);
    }
  }

  // 🎬 FPS 업데이트
  updateFPS(fps) {
    try {
      this.renderRenderer.setAnimationLoop(() => {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        this.updateAnimationFromTimeline(deltaTime);
        if (this.renderRenderer && this.renderScene && this.renderCamera) {
          this.renderRenderer.render(this.renderScene, this.renderCamera);
        }
      });
      console.log(`🎬 FPS 업데이트: ${fps}`);
    } catch (error) {
      console.error("❌ FPS 업데이트 실패:", error);
    }
  }

  // 🎬 지속시간 업데이트
  updateDuration(duration) {
    console.log("지속시간 업데이트");
    console.log(duration);
    try {
      this.renderRenderer.setAnimationLoop(() => {
        const currentTime = performance.now();
        const deltaTime = (currentTime - this.lastFrameTime) / 1000;
        this.lastFrameTime = currentTime;
        this.updateAnimationFromTimeline(deltaTime);
        if (this.renderRenderer && this.renderScene && this.renderCamera) {
          this.renderRenderer.render(this.renderScene, this.renderCamera);
        }
      });
      console.log(`🎬 지속시간 업데이트: ${duration}초`);
    } catch (error) {
      console.error("❌ 지속시간 업데이트 실패:", error);
    }
  }

  // 🎬 줌 인
  zoomIn() {
    try {
      if (!this.canvasControls) return;

      const oldZoom = this.canvasControls.zoom;
      this.canvasControls.zoom *= 1.2;
      this.canvasControls.zoom = Math.min(1000, this.canvasControls.zoom);

      console.log(`🔍 줌 인: ${oldZoom.toFixed(2)} → ${this.canvasControls.zoom.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("🔍 줌 인 완료:", this.canvasControls.zoom);
    } catch (error) {
      console.warn("⚠️ 줌 인 실패:", error);
    }
  }

  // 🎬 줌 아웃
  zoomOut() {
    try {
      if (!this.canvasControls) return;

      const oldZoom = this.canvasControls.zoom;
      this.canvasControls.zoom *= 0.8;
      this.canvasControls.zoom = Math.max(0.1, this.canvasControls.zoom);

      console.log(`🔍 줌 아웃: ${oldZoom.toFixed(2)} → ${this.canvasControls.zoom.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("🔍 줌 아웃 완료:", this.canvasControls.zoom);
    } catch (error) {
      console.warn("⚠️ 줌 아웃 실패:", error);
    }
  }

  // 🎬 왼쪽 회전
  rotateLeft() {
    try {
      if (!this.canvasControls) return;

      const oldRotation = this.canvasControls.rotationY;
      this.canvasControls.rotationY -= 0.1;

      console.log(`🔄 왼쪽 회전: ${(oldRotation * 180 / Math.PI).toFixed(1)}° → ${(this.canvasControls.rotationY * 180 / Math.PI).toFixed(1)}°`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("🔄 왼쪽 회전 완료");
    } catch (error) {
      console.warn("⚠️ 왼쪽 회전 실패:", error);
    }
  }

  // 🎬 오른쪽 회전
  rotateRight() {
    try {
      if (!this.canvasControls) return;

      const oldRotation = this.canvasControls.rotationY;
      this.canvasControls.rotationY += 0.1;

      console.log(`🔄 오른쪽 회전: ${(oldRotation * 180 / Math.PI).toFixed(1)}° → ${(this.canvasControls.rotationY * 180 / Math.PI).toFixed(1)}°`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("🔄 오른쪽 회전 완료");
    } catch (error) {
      console.warn("⚠️ 오른쪽 회전 실패:", error);
    }
  }

  // 🎬 뷰 리셋
  resetView() {
    try {
      if (!this.canvasControls) return;

      const oldState = {
        zoom: this.canvasControls.zoom,
        rotationX: this.canvasControls.rotationX,
        rotationY: this.canvasControls.rotationY,
        panX: this.canvasControls.panX,
        panY: this.canvasControls.panY
      };

      this.canvasControls.zoom = 17.72;
      this.canvasControls.rotationX = 0;
      this.canvasControls.rotationY = 0;
      this.canvasControls.panX = 0;
      this.canvasControls.panY = 30.0;

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("🏠 뷰 리셋 완료");
    } catch (error) {
      console.warn("⚠️ 뷰 리셋 실패:", error);
    }
  }

  // 🎬 현재 프레임 렌더링 (컨트롤 버튼용)
  renderCurrentFrame() {
    try {
      if (!this.renderRenderer || !this.editor.scene || !this.renderCamera) {
        console.warn("⚠️ 렌더링 객체가 준비되지 않았습니다");
        return;
      }

      // 현재 상태로 렌더링
      this.renderRenderer.render(this.editor.scene, this.renderCamera);

    } catch (error) {
      console.warn("⚠️ 현재 프레임 렌더링 실패:", error);
    }
  }

  // 🎬 이동 메서드들
  moveUp() {
    try {
      if (!this.canvasControls) return;

      const oldPanY = this.canvasControls.panY;
      this.canvasControls.panY += 0.5;

      console.log(`⬆️ 위로 이동: Y ${oldPanY.toFixed(2)} → ${this.canvasControls.panY.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("⬆️ 위로 이동 완료");
    } catch (error) {
      console.warn("⚠️ 위로 이동 실패:", error);
    }
  }

  moveDown() {
    try {
      if (!this.canvasControls) return;

      const oldPanY = this.canvasControls.panY;
      this.canvasControls.panY -= 0.5;

      console.log(`⬇️ 아래로 이동: Y ${oldPanY.toFixed(2)} → ${this.canvasControls.panY.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("⬇️ 아래로 이동 완료");
    } catch (error) {
      console.warn("⚠️ 아래로 이동 실패:", error);
    }
  }

  moveLeft() {
    try {
      if (!this.canvasControls) return;

      const oldPanX = this.canvasControls.panX;
      this.canvasControls.panX -= 0.5;

      console.log(`⬅️ 왼쪽으로 이동: X ${oldPanX.toFixed(2)} → ${this.canvasControls.panX.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("⬅️ 왼쪽으로 이동 완료");
    } catch (error) {
      console.warn("⚠️ 왼쪽으로 이동 실패:", error);
    }
  }

  moveRight() {
    try {
      if (!this.canvasControls) return;

      const oldPanX = this.canvasControls.panX;
      this.canvasControls.panX += 0.5;

      console.log(`➡️ 오른쪽으로 이동: X ${oldPanX.toFixed(2)} → ${this.canvasControls.panX.toFixed(2)}`);

      this.updateCameraPosition(this.canvasControls);
      this.renderCurrentFrame();

      console.log("➡️ 오른쪽으로 이동 완료");
    } catch (error) {
      console.warn("⚠️ 오른쪽으로 이동 실패:", error);
    }
  }

  // 🎬 시간 표시 업데이트
  updateTimeDisplay(currentTime) {
    try {
      const timeDisplay = document.getElementById('time-display');
      if (timeDisplay) {
        const seconds = Math.floor(currentTime);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const displaySeconds = seconds % 60;
        const displayMinutes = minutes % 60;
        const displayHours = hours;

        timeDisplay.innerHTML = `${displayHours.toString().padStart(2, '0')}:${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`;
      }
    } catch (error) {
      console.error("❌ 시간 표시 업데이트 실패:", error);
    }
  }

  // 🎬 테스트 애니메이션 중지
  stopTestAnimation() {
    try {
      if (this.testAnimationId) {
        cancelAnimationFrame(this.testAnimationId);
        this.testAnimationId = null;
        console.log("✅ 테스트 애니메이션 중지 완료");
      }
    } catch (error) {
      console.warn("⚠️ 테스트 애니메이션 중지 실패:", error);
    }
  }

  // 🎯 타임라인 키프레임 선택 해제
  deselectTimelineKeyframes() {
    try {
      const bridge = this.editor.timeline?.selectionBridge;
      if (bridge) {
        bridge.clearKeyframeSelections();
        console.log("🎯 타임라인 키프레임 선택 해제 완료 (selectionBridge)");
        return;
      }

      if (this.editor.motionTimeline?.clearSelectedKeyframe) {
        this.editor.motionTimeline.clearSelectedKeyframe();
      }
      if (this.editor.lightTimeline?.clearSelectedKeyframe) {
        this.editor.lightTimeline.clearSelectedKeyframe();
      }
    } catch (error) {
      console.error("❌ 타임라인 키프레임 선택 해제 실패:", error);
    }
  }

  // 🎬 visible 속성 디버깅 함수
  debugVisibleProperty(objectUuid) {
    try {
      console.log("🎬 === visible 속성 디버깅 시작 ===");
      
      if (!this.editor.motionTimeline) {
        console.log("❌ MotionTimeline이 없습니다");
        return;
      }

      const timelineData = this.editor.motionTimeline.timelineData;
      if (!timelineData) {
        console.log("❌ TimelineData가 없습니다");
        return;
      }

      console.log("🎬 TimelineData 상태:", {
        dirty: timelineData.dirty,
        maxTime: timelineData.maxTime,
        frameRate: timelineData.frameRate,
        tracksSize: timelineData.tracks.size
      });

      // visible 트랙 확인
      const visibleTrack = timelineData.getTrackByUuid(objectUuid, 'visible');
      if (visibleTrack) {
        console.log("🎬 visible 트랙 발견:", {
          keyframeCount: visibleTrack.keyframeCount,
          propertyType: visibleTrack.propertyType,
          capacity: visibleTrack.capacity,
          times: Array.from(visibleTrack.times.slice(0, visibleTrack.keyframeCount)),
          values: Array.from(visibleTrack.values.slice(0, visibleTrack.keyframeCount))
        });
      } else {
        console.log("❌ visible 트랙을 찾을 수 없습니다");
      }

      // precomputedData 확인
      if (timelineData.precomputedData) {
        const objectData = timelineData.precomputedData.get(objectUuid);
        if (objectData) {
          const visibleArray = objectData.get('visible');
          if (visibleArray) {
            console.log("🎬 precomputedData visible 배열:", {
              type: visibleArray.constructor.name,
              length: visibleArray.length,
              first10Values: Array.from(visibleArray.slice(0, 10))
            });
          } else {
            console.log("❌ precomputedData에 visible 배열이 없습니다");
          }
        } else {
          console.log("❌ precomputedData에 해당 객체가 없습니다");
        }
      } else {
        console.log("❌ precomputedData가 없습니다");
      }

      // 클립 정보 확인
      const clipInfoCallback = this.editor.motionTimeline.getClipInfoCallback();
      if (clipInfoCallback) {
        const clipInfo = clipInfoCallback(objectUuid);
        console.log("🎬 클립 정보:", clipInfo);
      } else {
        console.log("❌ clipInfoCallback이 없습니다");
      }

      console.log("🎬 === visible 속성 디버깅 완료 ===");
    } catch (error) {
      console.error("❌ visible 속성 디버깅 실패:", error);
    }
  }















}

export { TimelineRenderer };