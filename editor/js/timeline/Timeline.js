// editor/timeline/Timeline.js
import { UIPanel, UIRow, UINumber, UIText, UIButton } from "../libs/ui.js";
import { BaseTimeline } from "./BaseTimeline.js";
import { MotionTimeline } from "./MotionTimeline.js";
import { LightTimeline } from "./LightTimeline.js";
import { AudioTimeline } from "./AudioTimeline.js";
import { KeyboardShortcuts } from "./KeyboardShortcuts.js";
import { TimelineRenderer } from "./TimelineRenderer.js";
import { VideoBackground } from './VideoBackground.js';
import { TimelineSelectionBridge } from "./TimelineSelectionBridge.js";
import * as TWEEN from "../../../examples/jsm/libs/tween.module.js";

// 타임라인 설정 상수
export const TIMELINE_CONSTRAINTS = {
  MIN_SECONDS: 60,    // 최소 1분
  MAX_SECONDS: 300,   // 최대 5분
  MIN_FPS: 1,         // 최소 FPS
  MAX_FPS: 120        // 최대 FPS
};

// 타임라인 설정 유효성 검사 헬퍼 함수들
export const TimelineHelpers = {
  // 시간 범위 검사
  isValidTimeRange(seconds) {
    return seconds >= TIMELINE_CONSTRAINTS.MIN_SECONDS && seconds <= TIMELINE_CONSTRAINTS.MAX_SECONDS;
  },

  // FPS 범위 검사
  isValidFPS(fps) {
    return fps >= TIMELINE_CONSTRAINTS.MIN_FPS && fps <= TIMELINE_CONSTRAINTS.MAX_FPS;
  },

  // 시간 범위 조정
  clampTimeRange(seconds) {
    return Math.max(TIMELINE_CONSTRAINTS.MIN_SECONDS, Math.min(TIMELINE_CONSTRAINTS.MAX_SECONDS, seconds));
  },

  // FPS 범위 조정
  clampFPS(fps) {
    return Math.max(TIMELINE_CONSTRAINTS.MIN_FPS, Math.min(TIMELINE_CONSTRAINTS.MAX_FPS, fps));
  },

  // 시간 범위 안내 메시지
  getTimeRangeMessage() {
    return `${TIMELINE_CONSTRAINTS.MIN_SECONDS}초에서 ${TIMELINE_CONSTRAINTS.MAX_SECONDS}초(${Math.floor(TIMELINE_CONSTRAINTS.MIN_SECONDS / 60)}분~${Math.floor(TIMELINE_CONSTRAINTS.MAX_SECONDS / 60)}분)`;
  },

  // FPS 범위 안내 메시지
  getFPSRangeMessage() {
    return `${TIMELINE_CONSTRAINTS.MIN_FPS}에서 ${TIMELINE_CONSTRAINTS.MAX_FPS} FPS`;
  }
};

class Timeline {
  constructor(editor) {
    this.editor = editor;
    // 비디오 배경 생성
    const videoBackground = new VideoBackground(this.editor);
    // videoBackground.createVideoBackground(this.editor.scene);
    // videoBackground.loadVideo("../files/video/video3.mp4");

    // 기본 타임라인 설정을 먼저 초기화
    this.defaultSettings = {
      totalSeconds: 180, // 3분 (60초~300초 범위 내)
      framesPerSecond: 30, // 60에서 30으로 변경하여 성능 향상
      currentFrame: 0,
    };

    // 🎬 렌더링 관련 속성들은 TimelineRenderer.js로 이동됨

    // 타임라인 트랙 컨테이너 DOM 요소 찾기
    const trackContainer = document.querySelector(".timelineWrapper");
    console.log("trackContainer", trackContainer);
    if (trackContainer) {
      // 드래그 오버(드롭 허용)
      trackContainer.addEventListener("dragover", (e) => {
        e.preventDefault();
      });

      // 드롭 이벤트(타임라인 트랙 추가)
      trackContainer.addEventListener("drop", (e) => {
        e.preventDefault();
        // const objectUuid = e.dataTransfer.getData("objectUuid");
        // const objectId = e.dataTransfer.getData("objectId");
        // const objectName = e.dataTransfer.getData("objectName");
        this.addTimelineTrack();
      });
    }

    // 타임라인 설정 로드 (Scene > localStorage > 기본값 순서)
    this.timelineSettings = this.loadTimelineSettings();

    // container는 timelineSettings 초기화 후에 생성
    this.container = this.createMainContainer();
    this.applyShellLayout();

    // addTrack 추가가
    const controls = this.container.querySelector(
      ".timeline-header .controls-container",
    );
    const divider = document.createElement("span");
    divider.className = "controls-divider controls-divider--end";
    divider.setAttribute("aria-hidden", "true");
    controls.appendChild(divider);
    controls.appendChild(this.createAddKeyframeButton().dom);

    // 타임라인 상단 눈금 및 플레이헤드 생성
    this.createTimeRuler();
    this.createPlayhead();

    // 각 타임라인 인스턴스 생성 (한 번만)
    if (!this.timelines) {
      this.timelines = {
        motion: new MotionTimeline(editor, this.timelineSettings),
        light: new LightTimeline(editor, this.timelineSettings),
        audio: new AudioTimeline(editor, this.timelineSettings),
      };

      // MotionTimeline 인스턴스를 editor에 저장하여 전역적으로 접근 가능하도록 함
      editor.motionTimeline = this.timelines.motion;

      // LightTimeline 인스턴스를 editor에 저장하여 전역적으로 접근 가능하도록 함
      editor.lightTimeline = this.timelines.light;

      // AudioTimeline 인스턴스를 editor에 저장하여 전역적으로 접근 가능하도록 함
      editor.audioTimeline = this.timelines.audio;

      // window.timeline에 할당하여 전역적으로 접근 가능하도록 함
      if (!window.timeline) {
        window.timeline = {};
      }
      window.timeline.timelines = this.timelines;

      console.log("✅ Timeline 초기화 완료:", {
        motion: !!this.timelines.motion,
        light: !!this.timelines.light,
        audio: !!this.timelines.audio,
        windowTimeline: !!window.timeline,
        windowTimelineTimelines: !!window.timeline.timelines
      });
    }


    // 🎬 TimelineRenderer 인스턴스 생성 (새로운 렌더링 시스템)
    this.timelineRenderer = new TimelineRenderer(editor);

    this.activeTimeline = "motion";
    this.initializeUI();
    this.bindEvents();
    this.selectionBridge = new TimelineSelectionBridge(editor, this);

    const initialFrame =
      this.editor.scene?.userData?.timeline?.currentFrame ??
      this.timelineSettings?.currentFrame ??
      0;
    this.updateTimeDisplay(initialFrame);

    // 초기 상태 설정
    this.isPlaying = false;
    if (this.editor.scene?.userData?.timeline) {
      this.editor.scene.userData.timeline.isPlaying = false;
    } else if (this.editor.scene) {
      this.editor.scene.userData = {
        timeline: {
          isPlaying: false,
          currentFrame: 0,
          currentSeconds: 0
        }
      };
    }

    const controlsContainer = this.container.querySelector(
      ".controls-container"
    );
    const zoomSlider = document.createElement("input");
    zoomSlider.type = "range";
    zoomSlider.min = "0.5";
    zoomSlider.max = "2";
    zoomSlider.step = "0.1";
    zoomSlider.value = "1";
    zoomSlider.style.marginLeft = "10px";
    zoomSlider.style.width = "50px";
    // controlsContainer.appendChild(zoomSlider);  // 타임라인 줌 기능 비활성화

    zoomSlider.addEventListener("input", (e) => {
      const zoomLevel = parseFloat(e.target.value);

      // 타임라인 룰러와 트랙 크기 조정
      const timeRuler = this.container.querySelector(".time-ruler-container");
      const tracks = this.container.querySelectorAll(".timeline-track");

      // 1초 단위의 픽셀 크기 조정
      const basePixelPerSecond = 10; // 기본 1초당 10px
      const newPixelPerSecond = basePixelPerSecond * zoomLevel;

      timeRuler.style.width = `${newPixelPerSecond * this.timelineSettings.totalSeconds
        }px`;
      tracks.forEach((track) => {
        track.style.width = `${newPixelPerSecond * this.timelineSettings.totalSeconds
          }px`;

        // 클립 크기 조정
        const clips = track.querySelectorAll(".animation-sprite");
        clips.forEach((clip) => {
          const duration = parseFloat(clip.dataset.duration) || 0;
          clip.style.width = `${newPixelPerSecond * duration}px`;

          // 키프레임 위치 조정
          const keyframes = clip.querySelectorAll(".keyframe");
          keyframes.forEach((keyframe) => {
            const timeInSeconds = parseFloat(keyframe.dataset.time) || 0;
            const newLeft = newPixelPerSecond * timeInSeconds;
            keyframe.style.left = `${newLeft}px`;
          });
          console.log(`Clip width set to: ${clip.style.width}`);
          // 키프레임 업데이트
          // this.updateKeyframesInClip(track, clip);
        });
      });
    });

    this.container.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      const track = e.target.closest(".timeline-track");
      if (!track) return;

      // 조명 트랙(및 타겟 서브트랙) — 삭제 메뉴 비활성
      if (
        track.classList.contains("light-timeline") ||
        e.target.closest(".tl-section-light")
      ) {
        return;
      }

      const existingMenu = document.querySelector(".context-menu");
      if (existingMenu) {
        existingMenu.remove();
      }

      const menu = document.createElement("div");
      menu.className = "context-menu";
      menu.style.position = "absolute";
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
      menu.style.zIndex = "1000";

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "timeline-btn";
      deleteBtn.innerHTML = `<i class="fa fa-trash" style="color: #ff6b6b;"></i>트랙 삭제`;
      deleteBtn.onclick = () => {
        const objectId = parseInt(track.dataset.objectId, 10);
        const objectUuid = track.dataset.uuid;
        console.log("트랙 삭제", { objectId, objectUuid });

        const isAudioTrack = track.querySelector('.audio-sprite') && !objectUuid;

        if (this.timelines.motion && objectUuid && !isAudioTrack) {
          this.timelines.motion._removeTrackCompletelyInternal(objectUuid);
          console.log(`Motion 완전 삭제 완료: ${objectUuid}`);
        } else if (this.timelines.audio && (objectId || isAudioTrack)) {
          const audioId = objectId || track.dataset.objectId;
          this.timelines.audio.rebuildTracksFromDOM();
          const removed = this.timelines.audio._removeTrackInternal(audioId);
          console.log(`Audio 트랙 삭제 완료: ${removed}`);
        } else if (this.timelines.motion?.timelineData && objectUuid) {
          this.timelines.motion._removeTrackCompletelyInternal(objectUuid);
        } else {
          const wasDeleted = this.timelines.motion.timelineData.removeTrackById(objectId, 'position') ||
            this.timelines.motion.timelineData.removeTrackById(objectId, 'rotation') ||
            this.timelines.motion.timelineData.removeTrackById(objectId, 'scale');
          console.log(`기존 방식 삭제 성공 여부: ${wasDeleted}`);
          track.remove();
        }

        menu.remove();
        if (
          editor.selected &&
          editor.selected.uuid === track.dataset.objectId
        ) {
          editor.selected = null;
        }
      };

      menu.appendChild(deleteBtn);
      document.body.appendChild(menu);

      const closeMenu = (e) => {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener("click", closeMenu);
        }
      };
      document.addEventListener("click", closeMenu);
    });
  }

  createMainContainer() {
    const c = document.createElement("div");
    c.id = "main-timeline";
    c.className = "main-timeline-container sb-tl premiere-shell show-all-timelines";
    c.innerHTML = `
    <div class="tl-head">
      <span class="seq">Sequence · <b>Stage Builder</b></span>
      <span class="tc mono" id="sb-tl-tc">00:00:00</span>
      <span class="sp"></span>
      <button type="button" class="tl-jump tl-jump-all on" data-timeline="all" title="전체 타임라인 보기">All</button>
      <button type="button" class="tl-jump" data-timeline="motion">Motion</button>
      <button type="button" class="tl-jump" data-timeline="light">Light</button>
      <button type="button" class="tl-jump" data-timeline="audio">Audio</button>
    </div>
    <div class="tl-main tl-main-full">
      <div class="tl-workspace">
        <div class="timeline-top-container">
          <div class="timeline-footer" style="display:none">
            <div class="controls-container">
              <span class="time-display">00:00:00</span>
              <input type="number" class="frame-input" min="0" value="0">
              <span class="frame-total">/ ${this.timelineSettings.totalSeconds * this.timelineSettings.framesPerSecond}</span>
            </div>
          </div>
          <div class="timeline-header">
            <div class="controls-container">
              <button type="button" class="play-button" title="Play"><i class="fa fa-play"></i></button>
              <button type="button" class="stop-button" title="Stop"><i class="fa fa-stop"></i></button>
              <button type="button" class="render-button" title="타임라인 렌더링"><i class="fa fa-film"></i></button>
              <button type="button" class="timeline-settings-button" title="타임라인 설정"><i class="fa fa-cog"></i></button>
            </div>
            <div class="time-ruler-container"></div>
          </div>
        </div>
        <div class="timeline-body">
          <div class="timeline-viewport"></div>
        </div>
      </div>
    </div>
    `;
    return c;
  }

  applyShellLayout() {
    const el = this.container;
    if (!el) return;
    el.style.flex = "1 1 0";
    el.style.minHeight = "0";
    el.style.display = "flex";
    el.style.flexDirection = "column";
    el.style.width = "100%";
    el.style.overflow = "hidden";
  }

  mountInspector() {
    const tab = this.editor.tabRoot;
    const panel =
      tab?.querySelector("#keyframe-property-panel") ||
      document.querySelector("#keyframe-property-panel");
    if (panel) {
      panel.style.display = "block";
      panel.classList.add("premiere-inspector");
    }
  }

  initializeUI() {
    const viewport = this.container.querySelector(".timeline-viewport");
    const inner = this.ensureViewportInner() || viewport;

    const existingGroups = inner.querySelectorAll(".timeline-group");
    if (existingGroups.length > 0) {
      this.mountInspector();
      this.showAllTimelines();
      this.bindSectionCollapse();
      return;
    }

    const sections = [
      { key: "motion", label: "PERFORMER / MOTION", cls: "pf" },
      { key: "light", label: "LIGHTING", cls: "lt" },
      { key: "audio", label: "AUDIO", cls: "au" },
    ];

    sections.forEach(({ key, label, cls }) => {
      const timeline = this.timelines[key];
      if (!timeline) return;

      const section = document.createElement("div");
      section.className = `tl-section tl-section-${key}`;

      const secHeader = document.createElement("div");
      secHeader.className = `sec ${cls}`;
      secHeader.innerHTML = `<span class="dot"></span><span class="sec-label">${label}</span>`;
      section.appendChild(secHeader);

      const wrapper = document.createElement("div");
      wrapper.className = "timeline-group premiere-group active";
      wrapper.dataset.timeline = key;
      wrapper.appendChild(timeline.container);
      section.appendChild(wrapper);
      inner.appendChild(section);
    });

    if (this.editor.scene?.userData?.keyframes) {
      this.loadKeyframesFromScene();
    }

    this.mountInspector();
    this.activeTimeline = "all";
    this.showAllTimelines();
    this.bindSectionCollapse();

    requestAnimationFrame(() => {
      this.refreshPlayheadSpineHeight();
      const ph = this.container?.querySelector(".playhead");
      if (ph && this.syncPlayheadSpine) {
        this.syncPlayheadSpine(parseFloat(ph.style.left) || 0);
      }
    });
  }

  // 타임라인 설정 UI 생성
  createTimelineSettingsUI() {
    const settingsContainer = document.createElement("div");
    settingsContainer.className = "timeline-settings-modal";
    settingsContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 8px;
      padding: 20px;
      z-index: 1000;
      min-width: 300px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;

    settingsContainer.innerHTML = `
      <div style="margin-bottom: 15px;">
        <h3 style="margin: 0 0 15px 0; color: #fff;">타임라인 설정</h3>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">총 시간 (초):</label>
          <input type="number" id="timeline-total-seconds" min="${TIMELINE_CONSTRAINTS.MIN_SECONDS}" max="${TIMELINE_CONSTRAINTS.MAX_SECONDS}" value="${this.timelineSettings.totalSeconds}" 
                 style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
          <span style="color: #888; font-size: 11px;">${TimelineHelpers.getTimeRangeMessage()}</span>
        </div>
        <div style="margin-bottom: 10px;">
          <label style="display: block; margin-bottom: 5px; color: #ccc;">프레임 레이트 (FPS):</label>
          <input type="number" id="timeline-fps" min="${TIMELINE_CONSTRAINTS.MIN_FPS}" max="${TIMELINE_CONSTRAINTS.MAX_FPS}" value="${this.timelineSettings.framesPerSecond}" 
                 style="width: 100%; padding: 8px; background: #222; border: 1px solid #444; color: #666; border-radius: 4px; cursor: not-allowed;" disabled>
          <span style="color: #888; font-size: 11px;">${TimelineHelpers.getFPSRangeMessage()} (수정 불가)</span>
        </div>
        <div style="margin-bottom: 15px; padding: 10px; background: #333; border-radius: 4px;">
          <span style="color: #ccc; font-size: 12px;">총 프레임: <span id="total-frames-display" style="color: #4CAF50; font-weight: bold;">${this.timelineSettings.totalSeconds * this.timelineSettings.framesPerSecond}</span></span>
          <br>
          <span style="color: #888; font-size: 11px;">총 시간: <span class="total-time-display">${this.formatTime(this.timelineSettings.totalSeconds)}</span></span>
        </div>
      </div>
      <div style="display: flex; gap: 10px; justify-content: flex-end;">
        <button id="timeline-settings-cancel" style="padding: 8px 16px; background: #555; border: none; color: #fff; border-radius: 4px; cursor: pointer;">취소</button>
        <button id="timeline-settings-apply" style="padding: 8px 16px; background: #007acc; border: none; color: #fff; border-radius: 4px; cursor: pointer;">적용</button>
      </div>
    `;

    return settingsContainer;
  }

  // 타임라인 설정 적용
  applyTimelineSettings(newSettings) {
    console.log('타임라인 설정 적용:', newSettings);

    // 기존 설정 백업
    const oldSettings = { ...this.timelineSettings };

    // 현재 playhead 위치 및 프레임 저장
    const currentPlayhead = this.container.querySelector('.playhead');
    const currentPercent = currentPlayhead ? parseFloat(currentPlayhead.style.left) : 0;
    const currentFrame = this.timelineSettings.currentFrame || 0;

    // 새 설정 적용
    this.timelineSettings = { ...this.timelineSettings, ...newSettings };

    // Scene에 설정 저장
    if (this.editor.scene) {
      if (!this.editor.scene.userData.timeline) {
        this.editor.scene.userData.timeline = {};
      }
      Object.assign(this.editor.scene.userData.timeline, this.timelineSettings);
    }

    // localStorage에 설정 저장
    this.saveTimelineSettings();

    // 모든 타임라인 인스턴스에 새 설정 적용
    Object.values(this.timelines).forEach(timeline => {
      if (timeline.updateSettings) {
        timeline.updateSettings(this.timelineSettings);
      }
    });

    // UI 업데이트
    this.updateTimelineUI();

    // 타임라인 눈금 및 플레이헤드 재생성
    this.recreateTimeRuler();

    // playhead 위치 및 프레임 복원
    if (this.updatePlayheadPosition) {
      this.updatePlayheadPosition(currentPercent);
    }

    // 현재 프레임 설정
    this.setCurrentFrame(currentFrame, false);

    console.log('타임라인 설정이 성공적으로 적용되었습니다.');
  }

  // 타임라인 설정을 localStorage에 저장
  saveTimelineSettings() {
    try {
      const settingsToSave = {
        totalSeconds: this.timelineSettings.totalSeconds,
        framesPerSecond: this.timelineSettings.framesPerSecond,
        currentFrame: this.timelineSettings.currentFrame || 0
      };
      localStorage.setItem('timelineSettings', JSON.stringify(settingsToSave));
      console.log('타임라인 설정이 localStorage에 저장되었습니다:', settingsToSave);
    } catch (error) {
      console.error('타임라인 설정 저장 중 오류 발생:', error);
    }
  }

  // 타임라인 설정 로드 (Scene > localStorage > 기본값 순서)
  loadTimelineSettings() {
    // 1. Scene의 설정이 있으면 우선 사용 (단, 재생 상태는 초기화)
    if (this.editor.scene?.userData?.timeline) {
      const sceneSettings = this.editor.scene.userData.timeline;
      // 재생 상태는 항상 false로 초기화
      const loadedSettings = {
        ...sceneSettings,
        isPlaying: false,
        currentFrame: 0,
        currentSeconds: 0
      };
      console.log('Scene에서 타임라인 설정을 로드했습니다 (재생 상태 초기화):', loadedSettings);
      return loadedSettings;
    }

    // 2. localStorage에서 저장된 설정 불러오기
    const savedSettings = localStorage.getItem('timelineSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // 저장된 설정이 범위를 벗어나면 기본값으로 조정
        let totalSeconds = TimelineHelpers.clampTimeRange(parsed.totalSeconds || this.defaultSettings.totalSeconds);
        let fps = TimelineHelpers.clampFPS(parsed.framesPerSecond || this.defaultSettings.framesPerSecond);

        const loadedSettings = {
          totalSeconds: totalSeconds,
          framesPerSecond: fps,
          currentFrame: 0, // 항상 0으로 초기화
          isPlaying: false, // 항상 false로 초기화
          currentSeconds: 0 // 항상 0으로 초기화
        };
        console.log('localStorage에서 타임라인 설정을 로드했습니다 (재생 상태 초기화):', loadedSettings);
        return loadedSettings;
      } catch (error) {
        console.warn('localStorage의 타임라인 설정을 불러오는 중 오류 발생:', error);
      }
    }

    // 3. 기본 설정 사용 (재생 상태 초기화)
    const defaultSettingsWithReset = {
      ...this.defaultSettings,
      isPlaying: false,
      currentSeconds: 0
    };
    console.log('기본 타임라인 설정을 사용합니다 (재생 상태 초기화):', defaultSettingsWithReset);
    return defaultSettingsWithReset;
  }

  // 타임라인 UI 업데이트
  updateTimelineUI() {
    // 프레임 총 개수 업데이트
    const frameTotal = this.container.querySelector('.frame-total');
    if (frameTotal) {
      frameTotal.textContent = ` / ${this.timelineSettings.totalSeconds * this.timelineSettings.framesPerSecond}`;
    }

    // 프레임 입력 최대값 업데이트
    const frameInput = this.container.querySelector('.frame-input');
    if (frameInput) {
      frameInput.max = this.timelineSettings.totalSeconds * this.timelineSettings.framesPerSecond;
    }
  }

  // 타임라인 눈금 및 플레이헤드 재생성
  recreateTimeRuler() {
    const timeRulerContainer = this.container.querySelector('.time-ruler-container');
    if (timeRulerContainer) {
      timeRulerContainer.innerHTML = '';
      this.createTimeRuler();
      this.createPlayhead();
    }
  }

  // 타임라인 설정 표시
  showTimelineSettings() {
    const settingsModal = this.createTimelineSettingsUI();
    document.body.appendChild(settingsModal);

    // 총 프레임 수 실시간 업데이트
    const totalSecondsInput = settingsModal.querySelector('#timeline-total-seconds');
    const fpsInput = settingsModal.querySelector('#timeline-fps');
    const totalFramesDisplay = settingsModal.querySelector('#total-frames-display');

    const updateTotalFrames = () => {
      const totalSeconds = parseInt(totalSecondsInput.value) || 0;
      const fps = parseInt(fpsInput.value) || 0;
      const totalFrames = totalSeconds * fps;
      totalFramesDisplay.textContent = totalFrames;

      // 총 시간도 업데이트
      const totalTimeDisplay = settingsModal.querySelector('.total-time-display');
      if (totalTimeDisplay) {
        totalTimeDisplay.textContent = this.formatTime(totalSeconds);
      }
    };

    totalSecondsInput.addEventListener('input', updateTotalFrames);
    fpsInput.addEventListener('input', updateTotalFrames);

    // 취소 버튼
    const cancelButton = settingsModal.querySelector('#timeline-settings-cancel');
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(settingsModal);
    });

    // 적용 버튼
    const applyButton = settingsModal.querySelector('#timeline-settings-apply');
    applyButton.addEventListener('click', () => {
      const newTotalSeconds = parseInt(totalSecondsInput.value);
      const newFps = parseInt(fpsInput.value);

      if (!TimelineHelpers.isValidTimeRange(newTotalSeconds)) {
        alert(`총 시간은 ${TimelineHelpers.getTimeRangeMessage()} 사이여야 합니다.`);
        return;
      }

      if (!TimelineHelpers.isValidFPS(newFps)) {
        alert(`프레임 레이트는 ${TimelineHelpers.getFPSRangeMessage()} 사이여야 합니다.`);
        return;
      }

      this.applyTimelineSettings({
        totalSeconds: newTotalSeconds,
        framesPerSecond: newFps
      });

      // 성공 메시지 표시
      this.showNotification(`타임라인 설정이 적용되었습니다: ${newTotalSeconds}초, ${newFps} FPS`, '#4CAF50');

      document.body.removeChild(settingsModal);
    });

    // ESC 키로 닫기
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(settingsModal);
        document.removeEventListener('keydown', handleEscape);
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  // 알림 메시지 표시
  showNotification(message, color = '#333') {
    const notification = document.createElement('div');
    notification.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: ${color};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      transition: opacity 0.3s ease;
    `;
    notification.textContent = message;

    document.body.appendChild(notification);

    // 3초 후 자동 제거
    setTimeout(() => {
      notification.style.opacity = '0';
      setTimeout(() => {
        if (notification.parentNode) {
          document.body.removeChild(notification);
        }
      }, 300);
    }, 3000);
  }

  // 타임라인 헤더 — 플레이헤드 시점 전체 키프레임 추가
  createAddKeyframeButton = () => {
    const addKeyframeBtn = new UIButton();
    addKeyframeBtn.setClass("add-global-keyframe-btn");
    addKeyframeBtn.dom.type = "button";
    addKeyframeBtn.dom.title = "전체 키프레임 추가 (Shift+K)";
    addKeyframeBtn.dom.innerHTML =
      '<span class="kf-add-diamond" aria-hidden="true"></span>';

    addKeyframeBtn.onClick(() => {
      const keyboardShortcuts =
        this.timelines?.motion?.keyboardShortcuts ||
        this.editor?.motionTimeline?.keyboardShortcuts;

      if (keyboardShortcuts?.addKeyframeBoth) {
        keyboardShortcuts.addKeyframeBoth();
        return;
      }

      this.timelines?.motion?.addKeyframesAtPlayheadForAll?.();
      this.timelines?.light?.addKeyframesAtPlayheadForAll?.();
    });

    return addKeyframeBtn;
  };

  /** @deprecated 트랙 추가는 에셋 패널에서 수행 — 레거시 호환용 */
  createAddTimelineButton = () => {
    return this.createAddKeyframeButton();
  };

  addTimelineTrack() {
    console.log("addTimelineTrack");
    const selectedObject = editor.selected;

    if (!selectedObject) {
      alert('씬에서 객체를 선택해 주세요. (FBX/OBJ 또는 메시)');
      return;
    }

    if (
      this.timelines.motion &&
      typeof this.timelines.motion.isValidObjectForMotionTrack === 'function' &&
      !this.timelines.motion.isValidObjectForMotionTrack(selectedObject)
    ) {
      alert('모션 트랙에 추가할 수 없는 객체입니다. FBX/OBJ 또는 메시를 선택해 주세요.');
      return;
    }

    console.log("트랙 추가 시작 - 선택된 객체:", {
      name: selectedObject.name,
      uuid: selectedObject.uuid,
      id: selectedObject.id,
      type: selectedObject.type,
    });
    // 선택된 FBX 객체의 모션 타임라인 추가
    if (this.timelines.motion) {
      // TimelineData와 UI 모두에서 기존 트랙이 있는지 확인
      const existingTracks = this.timelines.motion.timelineData.getObjectTracks(selectedObject.uuid);
      const existingTrackElement = this.timelines.motion.container.querySelector(`[data-uuid="${selectedObject.uuid}"]`);

      console.log("트랙 추가 전 확인:", {
        objectUuid: selectedObject.uuid,
        timelineDataTracks: existingTracks.size,
        uiElementExists: !!existingTrackElement
      });

      if (existingTracks.size > 0 || existingTrackElement) {
        console.log("기존 트랙이 발견되었습니다. 완전히 제거합니다.");

        // 완전한 트랙 제거
        this.timelines.motion.removeTrackCompletely(selectedObject.uuid);

        // 잠시 대기 후 다시 확인
        setTimeout(() => {
          const remainingTracks = this.timelines.motion.timelineData.getObjectTracks(selectedObject.uuid);
          const remainingElement = this.timelines.motion.container.querySelector(`[data-uuid="${selectedObject.uuid}"]`);

          if (remainingTracks.size > 0 || remainingElement) {
            console.warn("트랙 제거 후에도 여전히 존재합니다:", {
              remainingTracks: remainingTracks.size,
              remainingElement: !!remainingElement
            });
            alert("트랙 제거 중 오류가 발생했습니다. 다시 시도해주세요.");
            return;
          }
        }, 100);
      }

      const objectUuid = selectedObject.uuid;
      // 새로운 모션 트랙 추가
      const track = this.timelines.motion.addTrack(
        objectUuid,
        selectedObject.id,
        selectedObject.name || `Motion Timeline ${selectedObject.id}`
      );

      console.log("생성된 트랙:", {
        track: track,
        uuid: track.uuid,
        element: track.element,
        dataset: track.element?.dataset,
      });

      // 씬의 타임라인 데이터 업데이트
      this.ensureTimelineData();

      // 씬의 키프레임 데이터 초기화
      if (!editor.scene.userData.keyframes) {
        editor.scene.userData.keyframes = {};
      }
      if (!editor.scene.userData.keyframes[objectUuid]) {
        editor.scene.userData.keyframes[objectUuid] = [];
      }

      // 트랙 추가 후 UI 갱신
      // this.initializeUI();
    }
  }

  loadKeyframesFromScene() {
    const scene = this.editor.scene;
    if (!scene?.userData?.keyframes) return;

    const keyframes = scene.userData.keyframes;

    // 모션 키프레임 로드
    Object.entries(keyframes).forEach(([objectId, frames]) => {
      frames.forEach((frame) => {
        if (frame.position || frame.rotation || frame.scale) {
          this.timelines.motion.addKeyframe(objectId, frame);
        }
        if (frame.intensity || frame.color) {
          this.timelines.light.addKeyframe(objectId, frame);
        }
      });
    });

    // 오디오 데이터는 AudioTimeline.onAfterLoad()에서만 복원 (중복 트랙 방지)
    // scene.userData.music 하위 호환은 프로젝트 로드 시 Editor.fromJSON → onAfterLoad에서 처리
  }

  bindEvents() {
    // 섹션 점프 / 필터 (All = 전체, 나머지 = 해당 타임라인만)
    this.container.querySelectorAll(".tl-jump").forEach((btn) => {
      btn.addEventListener("click", () => {
        const type = btn.dataset.timeline;
        if (type === "all") {
          this.showAllTimelines();
        } else {
          this.switchTimeline(type);
        }
      });
    });

    // 하위 호환: 구 tab-button이 있으면 동일 동작
    this.container.querySelectorAll(".tab-button").forEach((tab) => {
      tab.addEventListener("click", () => {
        this.container.querySelectorAll(".tab-button").forEach((btn) => btn.classList.remove("active"));
        tab.classList.add("active");
        this.switchTimeline(tab.dataset.timeline);
      });
    });

    // 타임라인 설정 버튼 이벤트
    const settingsButton = this.container.querySelector(".timeline-settings-button");
    if (settingsButton) {
      settingsButton.addEventListener("click", () => {
        this.showTimelineSettings();
      });
    }

    // 렌더링 버튼 이벤트
    const renderButton = this.container.querySelector(".render-button");
    if (renderButton) {
      renderButton.addEventListener("click", () => {
        console.log("렌더링 버튼 클릭됨");
        this.startTimelineRendering();
      });
    }

    // 재생 컨트롤 이벤트
    const playButton = this.container.querySelector(".play-button");
    const stopButton = this.container.querySelector(".stop-button");

    if (playButton) {
      playButton.addEventListener("click", () => {
        console.log("재생/일시정지 버튼 클릭됨");

        // scene이 없거나 timeline이 초기화되지 않은 경우 처리
        if (!this.editor.scene) {
          this.editor.scene = {
            userData: {
              timeline: {
                isPlaying: false,
                currentFrame: 0,
              },
            },
          };
        } else if (!this.editor.scene.userData) {
          this.editor.scene.userData = {
            timeline: {
              isPlaying: false,
              currentFrame: 0,
            },
          };
        } else if (!this.editor.scene.userData.timeline) {
          this.editor.scene.userData.timeline = {
            isPlaying: false,
            currentFrame: 0,
          };
        }

        const isPlaying = this.isPlaying;
        console.log("현재 재생 상태:", isPlaying);

        if (!isPlaying) {
          console.log("재생 시작");
          this.play();
        } else {
          console.log("일시정지");
          this.pause();
        }
      });
    }

    if (stopButton) {
      stopButton.addEventListener("click", () => {
        console.log("정지 버튼 클릭됨");
        this.stop();
        // 정지 시 처음으로 돌아가기
        this.setCurrentFrame(0);
        this.updatePlayheadPosition(0);

        const frameInput = this.container.querySelector(".frame-input");
        if (frameInput) {
          frameInput.value = "0.0";
        }
      });
    }

    // 플레이헤드 드래그 & 눈금 클릭 처리
    const ruler = this.container.querySelector(".time-ruler-container");
    const playhead = this.container.querySelector(".playhead");
    if (ruler && playhead) {
      let dragging = false;

      playhead.addEventListener("mousedown", (e) => {
        e.preventDefault();
        dragging = true;
      });

      document.addEventListener("mousemove", (e) => {
        if (!dragging) return;
        console.log("드래그 중");
        const rect = ruler.getBoundingClientRect();
        let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
        const percent = x / rect.width;
        const totalFrames =
          this.timelineSettings.totalSeconds *
          this.timelineSettings.framesPerSecond;
        const frame = Math.round(percent * totalFrames);
        const currentTime = frame / this.timelineSettings.framesPerSecond;

        // 모든 타임라인 업데이트
        if (this.timelines.motion) {
          // MotionTimeline의 updateAnimation 호출
          this.timelines.motion.currentTime = currentTime;
          this.timelines.motion.updateAnimation(currentTime);
        }

        if (this.timelines.light) {
          // LightTimeline의 updateFrame 호출
          this.timelines.light.currentTime = currentTime;
          this.timelines.light.updateFrame(frame);
        }

        // 현재 프레임 업데이트 (애니메이션은 이미 위에서 처리됨)
        this.setCurrentFrame(frame, false); // 애니메이션 업데이트 건너뛰기

        // playhead 드래그 시 오디오 정지 및 currentTime 업데이트
        if (this.timelines.audio) {
          // AudioTimeline currentTime 업데이트
          this.timelines.audio.currentTime = currentTime;
          console.log("AudioTimeline currentTime 설정 (드래그):", currentTime);

          const audioTracks = Array.from(this.timelines.audio.tracks.values());
          audioTracks.forEach((track) => {
            const objectId = typeof track.objectId === "string" ? parseInt(track.objectId) : track.objectId;
            const audioObject = this.editor.scene.getObjectById(objectId);
            const audio = audioObject?.userData?.audioElement || track.audioElement;
            if (audio && !audio.paused) {
              audio.pause();
              audio._playRequested = false;
            }
          });
        }

        // 플레이헤드 위치 업데이트
        this.updatePlayheadPosition(percent * 100);
      });

      document.addEventListener("mouseup", () => {
        dragging = false;
      });

      ruler.addEventListener("click", (e) => {
        if (e.target === playhead) return;
        const rect = ruler.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(x, rect.width)) / rect.width;
        const totalFrames =
          this.timelineSettings.totalSeconds *
          this.timelineSettings.framesPerSecond;
        const frame = Math.round(percent * totalFrames);
        const currentTime = frame / this.timelineSettings.framesPerSecond;
        console.log(frame);

        // 모든 타임라인 애니메이션 업데이트
        if (this.timelines.motion) {
          this.timelines.motion.currentTime = currentTime;
          this.timelines.motion.updateAnimation(currentTime);
        }

        if (this.timelines.light) {
          this.timelines.light.currentTime = currentTime;
          this.timelines.light.updateFrame(frame);
        }

        // 현재 프레임 업데이트 (애니메이션은 이미 위에서 처리됨)
        this.setCurrentFrame(frame, false);

        // 눈금 클릭 시 오디오 정지 및 currentTime 업데이트
        if (this.timelines.audio) {
          // AudioTimeline currentTime 업데이트
          this.timelines.audio.currentTime = currentTime;
          console.log("AudioTimeline currentTime 설정 (눈금 클릭):", currentTime);

          const audioTracks = Array.from(this.timelines.audio.tracks.values());
          audioTracks.forEach((track) => {
            const objectId = typeof track.objectId === "string" ? parseInt(track.objectId) : track.objectId;
            const audioObject = this.editor.scene.getObjectById(objectId);
            const audio = audioObject?.userData?.audioElement || track.audioElement;
            if (audio && !audio.paused) {
              audio.pause();
              audio._playRequested = false;
            }
          });
        }

        // 플레이헤드 위치 업데이트
        this.updatePlayheadPosition(percent * 100);
      });

      // 타임라인 눈금 우클릭 메뉴 추가
      ruler.addEventListener("contextmenu", (e) => {
        e.preventDefault();

        // 기존 컨텍스트 메뉴 제거
        const existingMenu = document.querySelector(".timeline-ruler-context-menu");
        if (existingMenu) {
          existingMenu.remove();
        }

        // 컨텍스트 메뉴 생성
        const menu = document.createElement("div");
        menu.className = "timeline-ruler-context-menu";
        menu.style.position = "fixed";
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;
        menu.style.background = "#2a2a2a";
        menu.style.border = "1px solid #444";
        menu.style.borderRadius = "4px";
        menu.style.padding = "4px 0";
        menu.style.zIndex = "10000";
        menu.style.minWidth = "180px";
        menu.style.boxShadow = "0 4px 12px rgba(0,0,0,0.5)";

        // 시간 이동 버튼
        const moveBtn = document.createElement("button");
        moveBtn.className = "timeline-context-menu-item";
        moveBtn.innerHTML = `<i class="fa fa-crosshairs" style="margin-right: 8px; color: #007acc;"></i>시간 이동 (M)`;
        moveBtn.style.cssText = `
          width: 100%;
          padding: 8px 12px;
          background: none;
          border: none;
          color: #fff;
          text-align: left;
          cursor: pointer;
          font-size: 13px;
          display: flex;
          align-items: center;
        `;

        moveBtn.onmouseover = () => {
          moveBtn.style.background = "#007acc";
        };
        moveBtn.onmouseout = () => {
          moveBtn.style.background = "none";
        };

        moveBtn.onclick = (e) => {
          e.stopPropagation(); // 이벤트 전파 중단
          console.log("시간 이동 버튼 클릭됨");

          // 메뉴 먼저 제거
          menu.remove();

          // KeyboardShortcuts의 showPlayheadMoveDialog 함수 호출
          let keyboardShortcuts = null;

          // 방법 1: MotionTimeline의 keyboardShortcuts
          if (this.timelines.motion && this.timelines.motion.keyboardShortcuts) {
            keyboardShortcuts = this.timelines.motion.keyboardShortcuts;
            console.log("MotionTimeline에서 KeyboardShortcuts 찾음");
          }
          // 방법 2: window.motionTimeline
          else if (window.motionTimeline && window.motionTimeline.keyboardShortcuts) {
            keyboardShortcuts = window.motionTimeline.keyboardShortcuts;
            console.log("window.motionTimeline에서 KeyboardShortcuts 찾음");
          }
          // 방법 3: editor
          else if (this.editor.keyboardShortcuts && this.editor.keyboardShortcuts.showPlayheadMoveDialog) {
            keyboardShortcuts = this.editor.keyboardShortcuts;
            console.log("editor에서 KeyboardShortcuts 찾음");
          }
          // 방법 4: window
          else if (window.keyboardShortcuts && window.keyboardShortcuts.showPlayheadMoveDialog) {
            keyboardShortcuts = window.keyboardShortcuts;
            console.log("window에서 KeyboardShortcuts 찾음");
          }

          if (keyboardShortcuts && keyboardShortcuts.showPlayheadMoveDialog) {
            console.log("showPlayheadMoveDialog 호출");
            // 약간의 지연을 두고 다이얼로그 열기 (이벤트 전파 방지)
            setTimeout(() => {
              keyboardShortcuts.showPlayheadMoveDialog();
            }, 100);
          } else {
            console.error("KeyboardShortcuts를 찾을 수 없습니다.", {
              motionTimeline: this.timelines.motion,
              hasKeyboardShortcuts: this.timelines.motion?.keyboardShortcuts,
              windowMotionTimeline: window.motionTimeline,
              windowHasKeyboardShortcuts: window.motionTimeline?.keyboardShortcuts
            });
            alert("KeyboardShortcuts를 찾을 수 없습니다. 콘솔을 확인해주세요.");
          }
        };

        menu.appendChild(moveBtn);
        document.body.appendChild(menu);

        // 메뉴 외부 클릭 시 닫기
        const closeMenu = (e) => {
          if (!menu.contains(e.target)) {
            menu.remove();
            document.removeEventListener("click", closeMenu);
          }
        };
        setTimeout(() => {
          document.addEventListener("click", closeMenu);
        }, 0);
      });
    }

    // 키보드 단축키 이벤트
    document.addEventListener("keydown", (e) => {
      // 프로젝트 설정 팝업이 열려있을 때는 단축키 무시
      const projectSetupPopup = document.querySelector('.project-setup-overlay');
      if (projectSetupPopup) return;

      // 입력 필드에 포커스가 있을 때는 단축키 무시
      const target = e.target;
      const isInputField = target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable;

      if (isInputField) return;

      // 스페이스바로 재생/일시정지 토글
      if (e.code === "Space") {
        e.preventDefault(); // 기본 스크롤 동작 방지

        // scene이 없거나 timeline이 초기화되지 않은 경우 처리
        if (!this.editor.scene) {
          this.editor.scene = {
            userData: {
              timeline: {
                isPlaying: false,
                currentFrame: 0,
              },
            },
          };
        } else if (!this.editor.scene.userData) {
          this.editor.scene.userData = {
            timeline: {
              isPlaying: false,
              currentFrame: 0,
            },
          };
        } else if (!this.editor.scene.userData.timeline) {
          this.editor.scene.userData.timeline = {
            isPlaying: false,
            currentFrame: 0,
          };
        }

        const isPlaying = this.isPlaying;
        console.log("스페이스바 단축키 - 현재 재생 상태:", isPlaying);

        if (!isPlaying) {
          console.log("재생 시작");
          this.play();
        } else {
          console.log("일시정지");
          this.pause();
        }
      }

      // ESC 키로 정지
      if (e.code === "Escape") {
        e.preventDefault();
        console.log("ESC 키 - 정지");
        this.stop();
        // 정지 시 처음으로 돌아가기
        this.setCurrentFrame(0);
        this.updatePlayheadPosition(0);

        const frameInput = this.container.querySelector(".frame-input");
        if (frameInput) {
          frameInput.value = "0.0";
        }
      }
    });

    // Editor 시그널이 존재하는 경우에만 바인딩
    if (this.editor.signals) {
      // 씬 변경 감지
      if (this.editor.signals.sceneChanged) {
        this.editor.signals.sceneChanged.add(() => {
          this.onSceneChanged();
        });
      }

      // 프레임 변경 감지
      if (this.editor.signals.frameChanged) {
        this.editor.signals.frameChanged.add((frame) => {
          this.updateTimeDisplay(frame);
          this.updateAllTimelines(frame);
        });
      }
    }

    this.setupKeyframeTimeTooltip();
  }

  /** 키프레임 호버 시간 — body 고정 툴팁 (트랙 overflow·z-index 클리핑 회피) */
  setupKeyframeTimeTooltip() {
    if (this._kfTooltipSetup) return;
    this._kfTooltipSetup = true;

    const tip = document.createElement("div");
    tip.className = "kf-time-tooltip";
    tip.hidden = true;
    document.body.appendChild(tip);
    this._kfTimeTooltip = tip;
    this._kfTooltipTarget = null;

    const hide = () => {
      tip.hidden = true;
      this._kfTooltipTarget = null;
    };

    const position = (kf) => {
      const rect = kf.getBoundingClientRect();
      tip.style.left = `${rect.left + rect.width / 2}px`;
      tip.style.top = `${rect.top - 4}px`;
    };

    const show = (kf) => {
      const time = kf.dataset?.time;
      if (time == null || time === "") return;
      tip.textContent = `${time}s`;
      this._kfTooltipTarget = kf;
      tip.hidden = false;
      position(kf);
    };

    const root = this.container;
    if (!root) return;

    root.addEventListener(
      "mouseover",
      (e) => {
        const kf = e.target.closest?.(".keyframe");
        if (!kf || !root.contains(kf)) return;
        if (kf.classList.contains("dragging")) return;
        show(kf);
      },
      true,
    );

    root.addEventListener(
      "mouseout",
      (e) => {
        const kf = e.target.closest?.(".keyframe");
        if (!kf || this._kfTooltipTarget !== kf) return;
        const next = e.relatedTarget;
        if (next && kf.contains(next)) return;
        hide();
      },
      true,
    );

    root.addEventListener(
      "mousedown",
      (e) => {
        if (e.target.closest?.(".keyframe")) hide();
      },
      true,
    );

    const viewport = root.querySelector(".timeline-viewport");
    const onReposition = () => {
      if (this._kfTooltipTarget) position(this._kfTooltipTarget);
    };
    viewport?.addEventListener("scroll", onReposition, { passive: true });
    window.addEventListener("resize", onReposition, { passive: true });
  }

  onSceneChanged() {
    const scene = this.editor.scene;
    if (!scene) return;

    // 타임라인 설정 업데이트
    const timelineSettings = scene.userData.timeline;
    Object.values(this.timelines).forEach((timeline) => {
      timeline.updateSettings({
        totalSeconds: timelineSettings.totalSeconds,
        framesPerSecond: timelineSettings.framesPerSecond,
      });
    });

    // 키프레임 데이터 리로드
    this.loadKeyframesFromScene();

    // 프레임 정보 표시 업데이트
    const frameTotal = this.container.querySelector(".frame-total");
    if (frameTotal) {
      frameTotal.textContent = `/ ${timelineSettings.totalSeconds * timelineSettings.framesPerSecond
        }`;
    }
  }

  updateTimeDisplay(frame) {
    if (!this.timelineSettings) return;

    const seconds = frame / this.timelineSettings.framesPerSecond;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    const timecode = this.formatTimecode(seconds);

    const headTc = this.container.querySelector("#sb-tl-tc");
    if (headTc) {
      headTc.textContent = timecode;
    }

    const timeDisplay = this.container.querySelector(".time-display");
    if (timeDisplay) {
      timeDisplay.textContent = `${minutes
        .toString()
        .padStart(2, "0")}:${remainingSeconds.toFixed(1).padStart(4, "0")}s`;
    }

    const frameInput = this.container.querySelector(".frame-input");
    if (frameInput) {
      frameInput.value = seconds.toFixed(1);
    }

    // 플레이헤드 위치 업데이트
    const totalFrames =
      this.timelineSettings.totalSeconds *
      this.timelineSettings.framesPerSecond;
    const percent = (frame / totalFrames) * 100;

    // updatePlayheadPosition 메서드가 존재하는 경우에만 호출
    if (this.updatePlayheadPosition) {
      this.updatePlayheadPosition(percent);
    }
  }

  updateAllTimelines(frame) {
    Object.values(this.timelines).forEach((timeline) => {
      timeline.updateFrame(frame);
    });
  }

  showAllTimelines() {
    this.activeTimeline = "all";
    this.container.classList.add("show-all-timelines");
    this.container.classList.remove("tl-filtered");

    this.container.querySelectorAll(".timeline-group").forEach((group) => {
      group.classList.add("active");
    });

    const viewport = this.container.querySelector(".timeline-viewport");
    if (viewport) {
      viewport.scrollTop = 0;
    }

    this.container.querySelectorAll(".tl-jump").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.timeline === "all");
    });
  }

  /** 모션 / 조명 / 오디오 섹션 헤더(.sec) 클릭으로 트랙 영역 접기·펼치기 */
  bindSectionCollapse() {
    const viewport = this.container?.querySelector(".timeline-viewport");
    if (!viewport) return;

    viewport.querySelectorAll(".tl-section > .sec").forEach((sec) => {
      if (sec.dataset.collapseBound === "true") return;
      sec.dataset.collapseBound = "true";
      sec.classList.add("sec--collapsible");
      sec.setAttribute("role", "button");
      sec.setAttribute("tabindex", "0");
      sec.setAttribute("aria-expanded", "true");

      if (!sec.querySelector(".sec-label")) {
        const dot = sec.querySelector(".dot");
        const labelText = Array.from(sec.childNodes)
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent.trim())
          .join(" ");
        sec.childNodes.forEach((n) => {
          if (n.nodeType === Node.TEXT_NODE) sec.removeChild(n);
        });
        if (labelText) {
          const label = document.createElement("span");
          label.className = "sec-label";
          label.textContent = labelText;
          if (dot?.nextSibling) {
            sec.insertBefore(label, dot.nextSibling);
          } else {
            sec.appendChild(label);
          }
        }
      }

      if (!sec.querySelector(".sec-chevron")) {
        const chevron = document.createElement("span");
        chevron.className = "sec-chevron";
        chevron.setAttribute("aria-hidden", "true");
        sec.appendChild(chevron);
      }

      const section = sec.closest(".tl-section");
      if (section?.classList.contains("tl-section--collapsed")) {
        sec.setAttribute("aria-expanded", "false");
      }

      const toggle = () => {
        const parent = sec.closest(".tl-section");
        if (!parent) return;
        const collapsed = parent.classList.toggle("tl-section--collapsed");
        sec.setAttribute("aria-expanded", collapsed ? "false" : "true");
        requestAnimationFrame(() => {
          this.refreshPlayheadSpineHeight();
          const ph = this.container?.querySelector(".playhead");
          if (ph && this.syncPlayheadSpine) {
            this.syncPlayheadSpine(parseFloat(ph.style.left) || 0);
          }
        });
      };

      sec.addEventListener("click", toggle);
      sec.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggle();
        }
      });
    });
  }

  switchTimeline(type) {
    if (type === "all") {
      this.showAllTimelines();
      return;
    }

    this.activeTimeline = type;
    this.container.classList.remove("show-all-timelines");
    this.container.classList.add("tl-filtered");

    this.container.querySelectorAll(".timeline-group").forEach((group) => {
      group.classList.toggle("active", group.dataset.timeline === type);
    });

    const section = this.container.querySelector(`.tl-section-${type}`);
    const viewport = this.container.querySelector(".timeline-viewport");
    if (section && viewport) {
      viewport.scrollTop = Math.max(0, section.offsetTop - viewport.offsetTop);
    }

    this.container.querySelectorAll(".tl-jump").forEach((btn) => {
      btn.classList.toggle("on", btn.dataset.timeline === type);
    });
  }

  play() {
    console.log("Timeline- play");
    if (!this.editor.scene) return;

    this.ensureTimelineData();

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.isPlaying = true;
    if (this.editor.scene.userData.timeline) {
      this.editor.scene.userData.timeline.isPlaying = true;
    }

    // 항상 0초부터 시작하도록 currentFrame 설정
    let currentFrame = 0;

    // 현재 playhead 위치가 0이 아닌 경우에만 해당 위치에서 시작
    const playhead = document.querySelector('.playhead');
    if (playhead) {
      const playheadLeft = parseFloat(playhead.style.left) || 0;
      if (playheadLeft > 0) {
        const playheadPercent = playheadLeft / 100;
        currentFrame = Math.floor(playheadPercent * this.timelineSettings.totalSeconds * this.timelineSettings.framesPerSecond);
        console.log("현재 playhead 위치에서 재생 시작:", {
          playheadLeft,
          playheadPercent,
          currentFrame
        });
      } else {
        console.log("0초부터 재생 시작");
      }
    }
    const totalFrames =
      this.timelineSettings.totalSeconds *
      this.timelineSettings.framesPerSecond;
    // 재생 속도 조절 (1로 설정하여 정상 속도로 재생)
    const playbackSpeed = 1; // 정상 속도로 재생

    // 오디오 재생 처리 (클립 시작/끝 시간 반영)
    if (this.editor.scene?.userData?.audioTimeline?.audioObjects) {
      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;

      console.log("🎵 오디오 재생 시작 - audioObjects:", audioObjects);

      Object.values(audioObjects).forEach((audioObj, index) => {
        console.log(`🎵 오디오 객체 ${index}:`, audioObj);

        if (audioObj.audioElement) {
          const audio = audioObj.audioElement;
          console.log(`🎵 오디오 요소 발견:`, audio);

          // audioTimeline 강제 연결 시도
          if (!this.audioTimeline && this.editor.audioTimeline) {
            console.log("🔧 audioTimeline 강제 연결 시도");
            this.audioTimeline = this.editor.audioTimeline;
          }

          if (!this.audioTimeline && window.timeline?.timelines?.audio) {
            console.log("🔧 window.timeline에서 audioTimeline 연결");
            this.audioTimeline = window.timeline.timelines.audio;
          }

          // audioObj.objectId를 통해 트랙을 찾아서 스프라이트에 접근
          let sprite = null;
          console.log(`🔍 audioTimeline 확인:`, {
            audioTimeline: !!this.audioTimeline,
            tracks: !!this.audioTimeline?.tracks,
            tracksSize: this.audioTimeline?.tracks?.size,
            objectId: audioObj.objectId,
            id: audioObj.id
          });

          if (this.audioTimeline?.tracks) {
            const track = this.audioTimeline.tracks.get(audioObj.objectId || audioObj.id);
            console.log(`🔍 찾은 트랙:`, {
              track: !!track,
              trackElement: !!track?.element,
              trackKeys: track ? Object.keys(track) : null
            });

            if (track && track.element) {
              sprite = track.element.querySelector(".audio-sprite");
              console.log(`🔍 스프라이트 검색 결과:`, {
                sprite: !!sprite,
                elementChildren: track.element.children.length,
                elementHTML: track.element.innerHTML.substring(0, 200) + "..."
              });
            }
          }
          console.log(`🎵 최종 오디오 스프라이트:`, sprite);

          // 현재 타임라인 시간 (초) - sprite 블록 밖으로 이동
          const currentTimeInSeconds = currentFrame / this.timelineSettings.framesPerSecond;

          if (sprite) {
            // 디버깅: sprite.dataset 값 확인
            console.log(`🔍 sprite.dataset 확인:`, {
              startTime: sprite.dataset.startTime,
              duration: sprite.dataset.duration,
              startTimeType: typeof sprite.dataset.startTime,
              durationType: typeof sprite.dataset.duration
            });

            // 클립의 시작 시간과 지속 시간 가져오기 (우선순위: sprite.dataset > audioObj > 기본값)
            let clipStartTime = parseFloat(sprite.dataset.startTime);
            let clipDuration = parseFloat(sprite.dataset.duration);

            // sprite.dataset에 값이 없으면 audioObj에서 가져오기
            if (isNaN(clipStartTime) || isNaN(clipDuration)) {
              console.log(`⚠️ sprite.dataset 값 누락, audioObj에서 가져오기 시도`);
              clipStartTime = audioObj.startTime || 0;
              clipDuration = audioObj.duration || audio.duration;
              console.log(`🔍 audioObj에서 가져온 값:`, { clipStartTime, clipDuration });
            }

            // 여전히 값이 없으면 기본값 사용
            if (isNaN(clipStartTime) || isNaN(clipDuration)) {
              console.log(`⚠️ audioObj 값도 누락, 기본값 사용`);
              clipStartTime = 0;
              clipDuration = audio.duration;
            }

            const clipEndTime = clipStartTime + clipDuration;

            // 디버깅: 파싱된 값 확인
            console.log(`🔍 파싱된 클립 시간:`, {
              clipStartTime,
              clipDuration,
              clipEndTime,
              startTimeParsed: parseFloat(sprite.dataset.startTime),
              durationParsed: parseFloat(sprite.dataset.duration)
            });

            // 클립 범위 내에 있는지 확인
            console.log(`🎵 클립 범위 확인:`, {
              currentTimeInSeconds,
              clipStartTime,
              clipEndTime,
              isInRange: currentTimeInSeconds >= clipStartTime && currentTimeInSeconds <= clipEndTime
            });

            if (currentTimeInSeconds >= clipStartTime && currentTimeInSeconds <= clipEndTime) {
              console.log(`🎵 클립 범위 내 - 재생 시작`);
              // 클립 내에서의 상대적 시간 계산
              const relativeTime = currentTimeInSeconds - clipStartTime;

              // 오디오 편집 시간 적용
              const audioStartTime = audioObj.audioStartTime || 0;
              const audioEndTime = audioObj.audioEndTime || audio.duration;
              const effectiveAudioStartTime = Math.max(0, Math.min(audioStartTime, audio.duration));
              const effectiveAudioEndTime = Math.max(effectiveAudioStartTime, Math.min(audioEndTime, audio.duration));

              // 오디오 재생 위치 계산 (편집 시간 반영)
              const audioPlayTime = effectiveAudioStartTime + (relativeTime % (effectiveAudioEndTime - effectiveAudioStartTime));

              // 오디오 설정 (재생 위치는 큰 차이가 있을 때만 업데이트)
              const timeDifference = Math.abs(audio.currentTime - audioPlayTime);
              if (timeDifference > 0.1) { // 0.1초 이상 차이가 날 때만 업데이트
                audio.currentTime = audioPlayTime;
              }

              audio.volume = audioObj.volume || 1.0;
              audio.playbackRate = audioObj.playbackRate || 1.0;
              audio.muted = audioObj.mute || false;

              // 재생 요청이 진행 중이 아니면 재생 시작
              if (!audio._playRequested) {
                audio._playRequested = true;
                const playPromise = audio.play();
                if (playPromise !== undefined) {
                  playPromise
                    .then(() => {
                      console.log("오디오 재생 시작됨 (클립 범위 내)");
                      audio._playRequested = false;
                    })
                    .catch((error) => {
                      console.error("오디오 재생 실패:", error);
                      audio._playRequested = false;
                    });
                }
              }
            } else {
              // 클립 범위 밖이면 오디오 정지
              if (!audio.paused) {
                audio.pause();
                audio._playRequested = false;
                console.log("오디오 정지 (클립 범위 밖)");
              }
            }
          } else {
            console.log(`🎵 스프라이트 없음 - 기본 방식으로 처리`);
            // 스프라이트가 없으면 기존 방식으로 처리
            audio.currentTime = currentTimeInSeconds;
            audio.volume = audioObj.volume || 1.0;
            audio.playbackRate = audioObj.playbackRate || 1.0;
            audio.muted = audioObj.mute || false;

            // 재생 요청이 진행 중이 아니면 재생 시작
            if (!audio._playRequested) {
              audio._playRequested = true;
              const playPromise = audio.play();
              if (playPromise !== undefined) {
                playPromise
                  .then(() => {
                    console.log("오디오 재생 시작됨");
                    audio._playRequested = false;
                  })
                  .catch((error) => {
                    console.error("오디오 재생 실패:", error);
                    audio._playRequested = false;
                  });
              }
            }
          }
        }
      });
    }

    // MotionTimeline의 play() 메서드 호출
    if (this.timelines.motion) {
      // console.log("MotionTimeline play() 호출");
      // 현재 playhead 위치를 MotionTimeline에 전달
      const currentTimeInSeconds = currentFrame / this.timelineSettings.framesPerSecond;
      this.timelines.motion.currentTime = currentTimeInSeconds;
      console.log("MotionTimeline currentTime 설정:", currentTimeInSeconds);
      this.timelines.motion.play();
    }

    // LightTimeline의 play() 메서드 호출
    if (this.timelines.light) {
      // console.log("LightTimeline play() 호출");
      // 현재 playhead 위치를 LightTimeline에 전달
      const currentTimeInSeconds = currentFrame / this.timelineSettings.framesPerSecond;
      this.timelines.light.currentTime = currentTimeInSeconds;
      console.log("LightTimeline currentTime 설정:", currentTimeInSeconds);
      this.timelines.light.play();
    }

    // AudioTimeline의 currentTime 업데이트 및 재생
    if (this.timelines.audio) {
      const currentTimeInSeconds = currentFrame / this.timelineSettings.framesPerSecond;
      this.timelines.audio.currentTime = currentTimeInSeconds;
      console.log("AudioTimeline currentTime 설정:", currentTimeInSeconds);
      this.timelines.audio.play();
    }

    // 애니메이션 프레임 업데이트 - 실제 시간 기반으로 제어
    let lastTime = performance.now();
    const animate = () => {
      if (!this.isPlaying) {
        return;
      }

      if (this.editor.scene?.userData?.timeline) {
        this.editor.scene.userData.timeline.isPlaying = true;
      }

      const now = performance.now();
      const deltaTime = Math.min((now - lastTime) / 1000, 0.1); // 탭 전환 시 급점프 방지
      lastTime = now;

      // 실제 시간 기반으로 프레임 계산
      const frameDelta = deltaTime * this.timelineSettings.framesPerSecond * playbackSpeed;
      currentFrame += frameDelta;

      if (currentFrame >= totalFrames) {
        currentFrame = 0;
      }

      // 오디오는 자체적으로 재생되도록 함 - 시간 동기화 제거

      // setCurrentFrame을 사용하여 모션 애니메이션 업데이트 (오디오 제외)
      // Math.floor 제거 — 서브프레임 시간으로 부드럽게 보간
      this.setCurrentFrame(currentFrame, true);

      // 플레이헤드 위치 업데이트
      const percent = (currentFrame / totalFrames) * 100;
      this.updatePlayheadPosition(percent);

      this.animationFrameId = requestAnimationFrame(animate);
    };

    this.animationFrameId = requestAnimationFrame(animate);

    // UI 업데이트
    const playButton = this.container.querySelector(".play-button");
    if (playButton) {
      playButton.innerHTML = '<i class="fa fa-pause"></i>';
      playButton.classList.add("is-playing");
    }
  }

  pause() {
    console.log("일시정지 호출됨, 현재 재생 상태:", this.isPlaying);
    if (!this.isPlaying) return;

    this.isPlaying = false;
    this.editor.scene.userData.timeline.isPlaying = false;
    console.log("########$$$$$$#########");
    console.log(this.timelines);
    // MotionTimeline의 pause() 메서드 호출
    if (this.timelines.motion) {
      this.timelines.motion.pause();
    }

    // LightTimeline의 pause() 메서드 호출
    if (this.timelines.light) {
      this.timelines.light.pause();
    }

    if (this.timelines.audio) {
      this.timelines.audio.pause();
    }

    // audioObjects에 남아 있는 HTMLAudioElement도 함께 정지 (scene 객체 없을 때 track과 별개일 수 있음)
    if (this.editor.scene?.userData?.audioTimeline?.audioObjects) {
      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;
      Object.values(audioObjects).forEach((audioObj) => {
        if (audioObj.audioElement && typeof audioObj.audioElement.pause === 'function') {
          const audio = audioObj.audioElement;
          if (!audio.paused) {
            audio.pause();
          }
          audio._playRequested = false;
        }
      });
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    // UI 업데이트
    const playButton = this.container.querySelector(".play-button");
    if (playButton) {
      playButton.innerHTML = '<i class="fa fa-play"></i>';
      playButton.classList.remove("is-playing");
    }
  }

  stop() {
    // 항상 정지 가능하도록 조건 제거
    this.isPlaying = false;
    this.editor.scene.userData.timeline.isPlaying = false;
    this.editor.scene.userData.timeline.currentFrame = 0;
    this.editor.scene.userData.timeline.currentSeconds = 0;

    // MotionTimeline의 stop() 메서드 호출
    if (this.timelines.motion) {
      this.timelines.motion.stop();
    }

    // LightTimeline의 stop() 메서드 호출
    if (this.timelines.light) {
      this.timelines.light.stop();
    }

    // 🔧 AudioTimeline의 stop() 메서드 호출 (tracks 기반으로 정확한 정지)
    if (this.timelines.audio) {
      this.timelines.audio.stop();
    }

    // 🔧 기존 audioObjects 방식도 유지 (하위 호환성)
    if (this.editor.scene?.userData?.audioTimeline?.audioObjects) {
      const audioObjects = this.editor.scene.userData.audioTimeline.audioObjects;

      Object.values(audioObjects).forEach((audioObj) => {
        if (audioObj.audioElement) {
          try {
            const audio = audioObj.audioElement;

            // 🔧 audio가 HTMLAudioElement인지 확인
            if (audio && typeof audio.pause === 'function' && typeof audio.paused !== 'undefined') {
              audio.pause();
              audio.currentTime = 0;
              audio._playRequested = false; // 재생 요청 플래그 초기화
              console.log(`✅ audioObjects의 오디오 ${audioObj.objectId || 'unknown'} 정지됨`);
            } else {
              console.warn(`⚠️ audioObj.audioElement가 HTMLAudioElement가 아닙니다:`, audio);
            }
          } catch (error) {
            console.error(`❌ audioObjects 오디오 정지 중 오류:`, error);
          }
        }
      });
    }

    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }

    this.setCurrentFrame(0);
    this.updatePlayheadPosition(0);

    // 🔧 UI 업데이트 - play 버튼 아이콘을 재생 상태로 변경
    const playButton = this.container.querySelector(".play-button");
    if (playButton) {
      playButton.innerHTML = '<i class="fa fa-play"></i>';
      playButton.classList.remove("is-playing");
      console.log("✅ stop() 후 play 버튼 아이콘이 재생 상태로 변경됨");
    } else {
      console.warn("⚠️ stop() 후 play 버튼을 찾을 수 없습니다. container:", this.container);
      // 🔧 더 넓은 범위에서 검색
      const globalPlayButton = document.querySelector(".play-button");
      if (globalPlayButton) {
        globalPlayButton.innerHTML = '<i class="fa fa-play"></i>';
        console.log("✅ stop() 후 전역 검색으로 play 버튼 아이콘 변경됨");
      } else {
        console.error("❌ stop() 후 전역에서도 play 버튼을 찾을 수 없습니다");
      }
    }

    // 🔧 강제로 모든 play 버튼 업데이트 (프로젝트 로드 후 문제 해결)
    const allPlayButtons = document.querySelectorAll(".play-button");
    if (allPlayButtons.length > 0) {
      allPlayButtons.forEach((btn, index) => {
        btn.innerHTML = '<i class="fa fa-play"></i>';
        console.log(`✅ 강제 업데이트: play 버튼 ${index + 1} 아이콘 변경됨`);
      });
    }
  }

  setCurrentFrame(frame, updateAnimation = true) {
    if (!this.editor.scene) return;

    const totalFrames =
      this.timelineSettings.totalSeconds *
      this.timelineSettings.framesPerSecond;
    frame = Math.max(0, Math.min(frame, totalFrames));

    const currentTime = frame / this.timelineSettings.framesPerSecond;

    // 렌더링 중일 때는 currentTime만 설정, 아닐 때는 기존 방식 사용
    if (this.isRendering) {
      if (this.timelines.motion && updateAnimation) {
        this.timelines.motion.currentTime = currentTime;
      }
      if (this.timelines.light && updateAnimation) {
        this.timelines.light.currentTime = currentTime;
      }
    } else if (updateAnimation) {
      if (this.timelines.motion) {
        this.timelines.motion.currentTime = currentTime;
        this.timelines.motion.updateAnimation(currentTime);
      }
      if (this.timelines.light) {
        this.timelines.light.currentTime = currentTime;
        this.timelines.light.updateAnimation(currentTime);
      }
    }

    this.editor.scene.userData.timeline.currentFrame = frame;

    // 시간 표시 업데이트
    this.updateTimeDisplay(frame);

    // 오디오 등 motion/light 외 타임라인만 updateFrame (중복 updateAnimation 방지)
    if (!this.isRendering) {
      Object.values(this.timelines).forEach((timeline) => {
        if (timeline === this.timelines.motion || timeline === this.timelines.light) {
          return;
        }
        if (!timeline.updateFrame) return;

        if (timeline.constructor.name === "AudioTimeline") {
          if (updateAnimation && this.isPlaying) {
            timeline.currentTime = currentTime;
            timeline.updateFrame(frame);
          }
        } else {
          timeline.updateFrame(frame);
        }
      });
    } else {
      Object.values(this.timelines).forEach((timeline) => {
        if (timeline.currentTime !== undefined) {
          timeline.currentTime = currentTime;
        }
      });
    }

    if (this.editor.signals?.frameChanged) {
      this.editor.signals.frameChanged.dispatch(frame);
    }

    if (
      !this.isRendering
      && this.editor.signals?.rendererUpdated
      && (!this.isPlaying || updateAnimation)
    ) {
      this.editor.signals.rendererUpdated.dispatch();
    }
  }

  createTimeRuler() {
    console.log("createTimeRuler");
    const ruler = this.container.querySelector(".time-ruler-container");
    ruler.innerHTML = "";
    const totalFrames =
      this.timelineSettings.totalSeconds *
      this.timelineSettings.framesPerSecond;
    const intervalSec = 30; // 30초 단위로 변경

    for (
      let sec = 0;
      sec <= this.timelineSettings.totalSeconds;
      sec += intervalSec
    ) {
      const frame = sec * this.timelineSettings.framesPerSecond;
      const tick = document.createElement("div");
      tick.className = "time-tick major";
      tick.style.left = (frame / totalFrames) * 100 + "%";

      const label = document.createElement("div");
      label.className = "time-label";
      // MM:SS 형식으로 변경
      const minutes = Math.floor(sec / 60);
      const seconds = sec % 60;
      label.textContent = `${minutes.toString().padStart(2, "0")}:${seconds
        .toString()
        .padStart(2, "0")}s`;
      tick.appendChild(label);

      ruler.appendChild(tick);

      // 중간 눈금 (10초 단위)
      if (sec < this.timelineSettings.totalSeconds) {
        for (let i = 10; i < intervalSec; i += 10) {
          const minorSec = sec + i;
          if (minorSec < this.timelineSettings.totalSeconds) {
            const minorFrame = minorSec * this.timelineSettings.framesPerSecond;
            const minorTick = document.createElement("div");
            minorTick.className = "time-tick minor";
            minorTick.style.left = (minorFrame / totalFrames) * 100 + "%";

            const minorLabel = document.createElement("div");
            minorLabel.className = "time-label minor";
            // 중간 눈금도 MM:SS 형식으로
            const minorMinutes = Math.floor(minorSec / 60);
            const minorSeconds = minorSec % 60;
            minorLabel.textContent = `${minorMinutes
              .toString()
              .padStart(2, "0")}:${minorSeconds.toString().padStart(2, "0")}s`;
            minorTick.appendChild(minorLabel);

            ruler.appendChild(minorTick);
          }
        }
      }
    }
  }

  // 🔧 프로젝트 저장 시 타임라인 설정 저장
  onBeforeSave() {
    try {
      console.log("💾 Timeline.js onBeforeSave 시작");

      // 🔧 현재 타임라인 설정을 scene.userData에 저장
      if (this.editor.scene) {
        if (!this.editor.scene.userData.timeline) {
          this.editor.scene.userData.timeline = {};
        }

        this.editor.scene.userData.timeline.totalSeconds = this.timelineSettings.totalSeconds;
        this.editor.scene.userData.timeline.framesPerSecond = this.timelineSettings.framesPerSecond;

        console.log("💾 타임라인 설정 저장 완료:", {
          totalSeconds: this.timelineSettings.totalSeconds,
          framesPerSecond: this.timelineSettings.framesPerSecond
        });
      }

    } catch (error) {
      console.error("❌ Timeline.js onBeforeSave 오류:", error);
    }
  }

  // 프로젝트 로드 시 타임라인 설정 복원
  onAfterLoad() {
    try {
      console.log("🔧 Timeline.js onAfterLoad 시작");

      // 🔧 scene.userData.timeline에서 저장된 타임라인 설정 확인 (중요!)
      if (this.editor.scene && this.editor.scene.userData && this.editor.scene.userData.timeline) {
        const savedTimelineData = this.editor.scene.userData.timeline;
        console.log("🔧 저장된 타임라인 데이터 (scene.userData.timeline):", savedTimelineData);

        if (savedTimelineData.totalSeconds) {
          this.timelineSettings.totalSeconds = savedTimelineData.totalSeconds;
        }
        if (savedTimelineData.framesPerSecond) {
          this.timelineSettings.framesPerSecond = savedTimelineData.framesPerSecond;
        }

        console.log(`🔧 타임라인 설정 복원: ${this.timelineSettings.totalSeconds}초, ${this.timelineSettings.framesPerSecond}fps`);

        // 로드 후 playhead / updatePlayheadPosition 재바인딩 (userData 교체 시 끊김 방지)
        this.recreateTimeRuler();
      } else {
        console.log("🔧 scene.userData.timeline이 없음");
      }

    } catch (error) {
      console.error("❌ Timeline.js onAfterLoad 오류:", error);
    }
  }

  ensureViewportInner() {
    const viewport = this.container?.querySelector(".timeline-viewport");
    if (!viewport) return null;

    let inner = viewport.querySelector(":scope > .timeline-viewport-inner");
    if (!inner) {
      inner = document.createElement("div");
      inner.className = "timeline-viewport-inner";
      const movable = [...viewport.children].filter(
        (node) => !node.classList?.contains("playhead-spine"),
      );
      movable.forEach((node) => inner.appendChild(node));
      viewport.appendChild(inner);
    }
    return inner;
  }

  refreshPlayheadSpineHeight() {
    const viewport = this.container?.querySelector(".timeline-viewport");
    const inner = this.ensureViewportInner();
    const spine = inner?.querySelector(":scope > .playhead-spine");
    if (!spine || !inner) return;

    const contentHeight = Math.max(inner.scrollHeight, inner.offsetHeight);
    spine.style.height = `${contentHeight}px`;
    spine.style.top = "0px";
    spine.style.bottom = "auto";
  }

  createPlayhead() {
    const ruler = this.container.querySelector(".time-ruler-container");
    if (!ruler) {
      console.warn('time-ruler-container를 찾을 수 없습니다.');
      return;
    }

    const viewport = this.container.querySelector(".timeline-viewport");
    const inner = this.ensureViewportInner();
    if (!inner) {
      console.warn('timeline-viewport-inner를 찾을 수 없습니다.');
      return;
    }

    ruler.querySelectorAll(".playhead").forEach((el) => el.remove());
    inner.querySelectorAll(":scope > .playhead-spine").forEach((el) => el.remove());

    const ph = document.createElement("div");
    ph.className = "playhead";
    ph.style.left = "0%";
    ph.innerHTML = '<span class="time-box"></span>';
    ruler.appendChild(ph);

    let spine = document.createElement("div");
    spine.className = "playhead-spine";
    spine.setAttribute("aria-hidden", "true");
    inner.insertBefore(spine, inner.firstChild);

    const syncPlayheadSpine = (percent) => {
      if (!spine || !viewport) return;

      this.refreshPlayheadSpineHeight();

      const vRect = viewport.getBoundingClientRect();
      const rulerRect = ruler.getBoundingClientRect();
      const rulerCenterX =
        rulerRect.left + (percent / 100) * rulerRect.width;
      spine.style.left = `${rulerCenterX - vRect.left + viewport.scrollLeft}px`;
    };

    this.syncPlayheadSpine = syncPlayheadSpine;

    const updatePlayheadPosition = (percent) => {
      ph.style.left = `${percent}%`;

      const totalFrames =
        this.timelineSettings.totalSeconds *
        this.timelineSettings.framesPerSecond;
      const currentFrame = Math.round((percent / 100) * totalFrames);
      const currentTimeInSeconds = (
        currentFrame / this.timelineSettings.framesPerSecond
      ).toFixed(2);
      const timeBox = ph.querySelector(".time-box");
      if (timeBox) {
        timeBox.textContent = `${currentTimeInSeconds}s`;
      }

      syncPlayheadSpine(percent);

      const currentTime =
        (percent / 100) * this.timelineSettings.totalSeconds;
      if (this.timelines?.motion) {
        this.timelines.motion.currentTime = currentTime;
        this.timelines.motion.setAnimationProperty?.(
          "animationFrame",
          Math.floor(
            currentTime * (this.timelines.motion.timelineData?.frameRate || 30),
          ),
        );
        this.timelines.motion.setAnimationProperty?.(
          "currentTime",
          currentTime,
        );
      }
      if (this.timelines?.light) {
        this.timelines.light.currentTime = currentTime;
      }
      if (this.editor.scene?.userData?.timeline) {
        this.editor.scene.userData.timeline.currentSeconds = currentTime;
      }
    };

    this.ensureTimelineData();
    this.editor.scene.userData.timeline.updatePlayheadPosition =
      updatePlayheadPosition;

    updatePlayheadPosition(0);

    let dragging = false;
    ph.addEventListener("mousedown", (e) => {
      e.preventDefault();
      dragging = true;
    });

    document.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const rect = ruler.getBoundingClientRect();
      let x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const percent = (x / rect.width) * 100;
      updatePlayheadPosition(percent);

      const totalFrames =
        this.timelineSettings.totalSeconds *
        this.timelineSettings.framesPerSecond;
      const currentFrame = Math.round((percent / 100) * totalFrames);
      const currentTimeInSeconds = (
        currentFrame / this.timelineSettings.framesPerSecond
      ).toFixed(2);
      const timeBox = ph.querySelector(".time-box");
      if (timeBox) {
        timeBox.textContent = `${currentTimeInSeconds}s`;
      }

      this.setCurrentFrame(currentFrame, true);
    });

    document.addEventListener("mouseup", () => {
      dragging = false;
    });

    this.updatePlayheadPosition = updatePlayheadPosition;

    if (!this._playheadResizeBound) {
      this._playheadResizeBound = true;
      window.addEventListener("resize", () => {
        const pct = parseFloat(ph.style.left) || 0;
        syncPlayheadSpine(pct);
      });
    }

    if (!this._playheadScrollBound && viewport) {
      this._playheadScrollBound = true;
      viewport.addEventListener("scroll", () => {
        const pct = parseFloat(ph.style.left) || 0;
        syncPlayheadSpine(pct);
      });
    }

    if (!this._playheadSpineResizeObserver && inner) {
      this._playheadSpineResizeObserver = new ResizeObserver(() => {
        const pct = parseFloat(ph.style.left) || 0;
        syncPlayheadSpine(pct);
      });
      this._playheadSpineResizeObserver.observe(inner);
    }

    this.refreshPlayheadSpineHeight();
  }

  formatTimecode(seconds) {
    const s = Math.max(0, seconds);
    const minutes = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    const cs = Math.floor((s % 1) * 100);
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}:${cs.toString().padStart(2, "0")}`;
  }

  formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes.toString().padStart(2, "0")}:${secs
      .toString()
      .padStart(2, "0")}s`;
  }

  ensureTimelineData() {
    if (!this.editor.scene.userData.timeline) {
      this.editor.scene.userData.timeline = {
        totalSeconds: this.timelineSettings.totalSeconds,
        framesPerSecond: this.timelineSettings.framesPerSecond,
        currentFrame: 0,
        currentSeconds: 0,
        isPlaying: false,
      };
    }
  }

  updateKeyframesInClip(track, clip) {
    // console.log("updateKeyframesInClip");
    // 클립 내의 키프레임들 가져오기
    const keyframes = Array.from(clip.querySelectorAll(".keyframe"))
      .map((kf) => ({
        time: parseFloat(kf.dataset.time),
        position: JSON.parse(kf.dataset.position || '{"x":0,"y":0,"z":0}'),
      }))
      .sort((a, b) => a.time - b.time);

    // 클립의 시작 시간 가져오기
    const clipStartTime = parseFloat(clip.dataset.startTime || "0");

    // 키프레임 위치 업데이트
    keyframes.forEach((keyframe) => {
      const timeInSeconds = keyframe.time + clipStartTime;
      const newLeft =
        (timeInSeconds / this.timelineSettings.totalSeconds) * 100;
      keyframe.element.style.left = `${newLeft}%`;
    });
  }

  // 🔧 재생 컨트롤 이벤트 바인딩 메서드
  bindPlaybackControls() {
    console.log("🔧 bindPlaybackControls 호출됨 - 재생 컨트롤 이벤트 바인딩 시작");

    // 🔧 기존 이벤트 리스너 제거 (중복 방지)
    const playButton = this.container.querySelector(".play-button");
    const stopButton = this.container.querySelector(".stop-button");

    if (playButton) {
      // 기존 이벤트 리스너 제거
      const newPlayButton = playButton.cloneNode(true);
      playButton.parentNode.replaceChild(newPlayButton, playButton);

      // 새로운 이벤트 리스너 추가
      newPlayButton.addEventListener("click", () => {
        console.log("🔧 재생/일시정지 버튼 클릭됨 (새로 바인딩됨)");

        // scene이 없거나 timeline이 초기화되지 않은 경우 처리
        if (!this.editor.scene) {
          this.editor.scene = {
            userData: {
              timeline: {
                isPlaying: false,
                currentFrame: 0,
              },
            },
          };
        } else if (!this.editor.scene.userData) {
          this.editor.scene.userData = {
            timeline: {
              isPlaying: false,
              currentFrame: 0,
            },
          };
        } else if (!this.editor.scene.userData.timeline) {
          this.editor.scene.userData.timeline = {
            isPlaying: false,
            currentFrame: 0,
          };
        }

        const isPlaying = this.isPlaying;
        console.log("🔧 현재 재생 상태:", isPlaying);

        if (!isPlaying) {
          console.log("🔧 재생 시작");
          this.play();
        } else {
          console.log("🔧 일시정지");
          this.pause();
        }
      });

      console.log("✅ play 버튼 이벤트 리스너 바인딩 완료");
    } else {
      console.warn("⚠️ play 버튼을 찾을 수 없습니다");
    }

    if (stopButton) {
      // 기존 이벤트 리스너 제거
      const newStopButton = stopButton.cloneNode(true);
      stopButton.parentNode.replaceChild(newStopButton, stopButton);

      // 새로운 이벤트 리스너 추가
      newStopButton.addEventListener("click", () => {
        console.log("🔧 정지 버튼 클릭됨 (새로 바인딩됨)");
        this.stop();
        // 정지 시 처음으로 돌아가기
        this.setCurrentFrame(0);
        this.updatePlayheadPosition(0);

        const frameInput = this.container.querySelector(".frame-input");
        if (frameInput) {
          frameInput.value = "0.0";
        }
      });

      console.log("✅ stop 버튼 이벤트 리스너 바인딩 완료");
    } else {
      console.warn("⚠️ stop 버튼을 찾을 수 없습니다");
    }

    console.log("🔧 bindPlaybackControls 완료");
  }

  // 🔧 프로젝트 로드 후 이벤트 리스너 재바인딩
  rebindPlaybackControls() {
    console.log("🔧 rebindPlaybackControls 호출됨 - 프로젝트 로드 후 이벤트 리스너 재바인딩");

    // 잠시 대기 후 바인딩 (DOM이 완전히 로드될 때까지)
    setTimeout(() => {
      this.bindPlaybackControls();
    }, 100);
  }

  // 🎬 타임라인 렌더링 시작 (간단한 버전)
  startTimelineRendering() {
    console.log("🎬 startTimelineRendering 호출됨");

    try {
      console.log("🎬 새로운 TimelineRenderer를 사용하여 렌더링 시작");

      // 🎬 새로운 TimelineRenderer 사용
      if (this.timelineRenderer) {
        this.timelineRenderer.createRenderPopup();
        console.log("✅ TimelineRenderer 팝업 생성 완료");
      } else {
        throw new Error("TimelineRenderer가 초기화되지 않았습니다");
      }

    } catch (error) {
      console.error("❌ startTimelineRendering에서 오류 발생:", error);
      alert("렌더링 시작 중 오류가 발생했습니다: " + error.message);
    }
  }

  // 🎬 렌더링 관련 메서드들은 TimelineRenderer.js로 이동됨

  // 🎬 렌더링 관련 메서드들은 TimelineRenderer.js로 이동됨

  // 🎬 타임라인 렌더링 실행 (TimelineRenderer.js로 이동됨)
  // async executeTimelineRendering() {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }

  // 🎬 프레임 캡처 (TimelineRenderer.js로 이동됨)
  // 🎬 프레임 캡처 (TimelineRenderer.js로 이동됨)
  // async captureFrame(frameNumber, time) {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }

  // 🎬 렌더링 진행상황 업데이트 (TimelineRenderer.js로 이동됨)
  // updateRenderProgress(frame) {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }

  // 🎬 렌더링 완료 (TimelineRenderer.js로 이동됨)
  // renderComplete() {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }

  // 🎬 렌더링 오류 표시 (TimelineRenderer.js로 이동됨)
  // showRenderError(error) {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }

  // 🎬 비디오 다운로드 (TimelineRenderer.js로 이동됨)
  // async downloadVideo() {
  //   // 이 메서드는 TimelineRenderer.js로 이동되었습니다
  // }



  // 🎬 renderer 찾기 (안전한 방법)
  findRenderer() {
    console.log("🔍 findRenderer 시작...");

    // 방법 1: 직접 접근
    if (this.editor.renderer && this.editor.renderer.domElement) {
      console.log("✅ renderer 직접 접근 성공");
      return this.editor.renderer;
    }

    // 방법 2: editor 객체에서 검색
    if (this.editor) {
      console.log("🔍 editor 객체 검색 시작...");
      for (let key in this.editor) {
        const obj = this.editor[key];
        if (obj && typeof obj.render === 'function' && obj.domElement) {
          console.log("✅ editor에서 renderer 발견:", key, obj);
          return obj;
        }
      }
      console.log("❌ editor에서 renderer를 찾을 수 없음");
    }

    // 방법 3: window에서 검색
    if (window.renderer && window.renderer.domElement) {
      console.log("✅ window에서 renderer 발견");
      return window.renderer;
    }

    // 방법 4: document에서 canvas 찾기
    console.log("🔍 document에서 canvas 검색...");
    const allCanvases = document.querySelectorAll('canvas');
    console.log(`🔍 총 ${allCanvases.length}개의 canvas 발견`);

    for (let i = 0; i < allCanvases.length; i++) {
      const canvas = allCanvases[i];
      console.log(`🔍 canvas ${i}:`, {
        width: canvas.width,
        height: canvas.height,
        visible: canvas.style.display !== 'none',
        type: canvas.constructor.name
      });

      // 가장 큰 canvas를 선택 (메인 렌더링용일 가능성)
      if (canvas.width > 100 && canvas.height > 100 && canvas.style.display !== 'none') {
        console.log("✅ 적합한 canvas 발견:", canvas);
        // 임시 renderer 객체 생성
        return {
          render: (scene, camera) => {
            console.log("임시 renderer로 렌더링:", scene, camera);
          },
          domElement: canvas
        };
      }
    }

    // 방법 5: editor 객체의 모든 속성 상세 검사
    if (this.editor) {
      console.log("🔍 editor 객체 상세 검사...");
      console.log("editor 타입:", this.editor.constructor.name);
      console.log("editor 속성들:", Object.getOwnPropertyNames(this.editor));

      // prototype 체인도 검사
      let prototype = Object.getPrototypeOf(this.editor);
      let level = 1;
      while (prototype && level <= 3) {
        console.log(`prototype level ${level}:`, Object.getOwnPropertyNames(prototype));
        prototype = Object.getPrototypeOf(prototype);
        level++;
      }
    }

    console.error("❌ renderer를 찾을 수 없습니다");
    return null;
  }

  // 🎬 JSZip 라이브러리 동적 로드 (RenderTimeline.js 방식 적용)
  async loadJSZip() {
    try {
      console.log("🎬 JSZip 라이브러리 로딩 중...");

      // 여러 CDN 시도 (RenderTimeline.js 방식 + 추가 안정성)
      const cdnUrls = [
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js',
        'https://unpkg.com/jszip@3.10.1/dist/jszip.min.js',
        'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js',
        'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.9.1/jszip.min.js',
        'https://unpkg.com/jszip@3.9.1/dist/jszip.min.js'
      ];

      for (let i = 0; i < cdnUrls.length; i++) {
        try {
          console.log(`🎬 CDN ${i + 1} 시도: ${cdnUrls[i]}`);

          const script = document.createElement('script');
          script.src = cdnUrls[i];
          script.crossOrigin = 'anonymous';

          // integrity 체크 제거 (일부 CDN에서 문제 발생 가능)

          const result = await new Promise((resolve, reject) => {
            script.onload = () => {
              // JSZip이 실제로 로드되었는지 확인
              setTimeout(() => {
                if (typeof JSZip !== 'undefined') {
                  console.log(`✅ JSZip 라이브러리 로드 완료 (CDN ${i + 1})`);
                  resolve();
                } else {
                  console.warn(`⚠️ JSZip 로드 후에도 객체를 찾을 수 없음 (CDN ${i + 1})`);
                  reject(new Error(`JSZip 객체를 찾을 수 없음 (CDN ${i + 1})`));
                }
              }, 100); // 100ms 지연으로 안정성 향상
            };

            script.onerror = () => {
              console.warn(`❌ CDN ${i + 1} 로드 실패`);
              reject(new Error(`CDN ${i + 1} 로드 실패`));
            };

            // 타임아웃 설정 (15초로 증가)
            setTimeout(() => {
              reject(new Error(`CDN ${i + 1} 타임아웃`));
            }, 15000);

            document.head.appendChild(script);
          });

          // 성공하면 반환
          return result;

        } catch (cdnError) {
          console.warn(`❌ CDN ${i + 1} 실패:`, cdnError.message);

          // 마지막 CDN이 아니면 계속 시도
          if (i < cdnUrls.length - 1) {
            continue;
          }

          // 모든 CDN 실패 시 최종 오류
          throw new Error(`모든 CDN에서 JSZip 로드 실패: ${cdnError.message}`);
        }
      }

    } catch (error) {
      console.error('🎬 JSZip 로드 중 최종 오류:', error);
      throw error;
    }
  }

  // 🎬 프레임들로 비디오 생성 (실제 비디오 파일)
  async createVideoFromFrames() {
    try {
      console.log("🎬 프레임으로 비디오 생성 시작...");

      // 방법 1: MediaRecorder로 WebM 비디오 생성 (우선순위 1)
      if (typeof MediaRecorder !== 'undefined') {
        try {
          console.log("🎬 MediaRecorder로 WebM 비디오 생성 시도...");
          return await this.createWebMVideo();
        } catch (mediaRecorderError) {
          console.warn("⚠️ MediaRecorder 실패, 대체 방법 사용:", mediaRecorderError.message);
        }
      }

      // 방법 2: Canvas Stream으로 비디오 생성
      try {
        console.log("🎬 Canvas Stream으로 비디오 생성 시도...");
        return await this.createCanvasStreamVideo();
      } catch (canvasStreamError) {
        console.warn("⚠️ Canvas Stream 실패, 대체 방법 사용:", canvasStreamError.message);
      }

      // 방법 3: GIF 생성 시도
      if (typeof gifshot !== 'undefined') {
        try {
          console.log("🎬 gifshot으로 GIF 생성 시도...");
          return await this.createGIF();
        } catch (gifError) {
          console.warn("⚠️ GIF 생성 실패, 대체 방법 사용:", gifError.message);
        }
      }

      // 방법 4: ZIP으로 프레임 압축 (최후 수단)
      console.log("🎬 최후 수단: ZIP으로 프레임 압축");
      return await this.createZIPFromFrames();

    } catch (error) {
      console.error("🎬 비디오 생성 중 오류:", error);
      // 대체 방법: 개별 프레임 다운로드
      return await this.downloadIndividualFrames();
    }
  }

  // 🎬 WebM 비디오 생성 (MediaRecorder 사용)
  async createWebMVideo() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("🎬 WebM 비디오 생성 시작...");

        // 임시 캔버스 생성 (렌더링된 프레임 크기에 맞춤)
        const tempCanvas = document.createElement('canvas');
        const tempContext = tempCanvas.getContext('2d');

        // 첫 번째 프레임에서 크기 가져오기
        const firstFrame = this.renderedFrames[0];
        if (!firstFrame) {
          throw new Error("렌더링된 프레임이 없습니다");
        }

        // 이미지 로드하여 크기 확인
        const img = new Image();
        img.onload = () => {
          tempCanvas.width = img.width;
          tempCanvas.height = img.height;

          console.log("🎬 비디오 크기:", { width: img.width, height: img.height });

          // Canvas Stream 생성
          const stream = tempCanvas.captureStream(this.timelineSettings.framesPerSecond);

          // MediaRecorder 설정
          const mediaRecorder = new MediaRecorder(stream, {
            mimeType: 'video/webm;codecs=vp9',
            videoBitsPerSecond: 5000000 // 5 Mbps
          });

          const chunks = [];

          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              chunks.push(event.data);
            }
          };

          mediaRecorder.onstop = () => {
            try {
              const blob = new Blob(chunks, { type: 'video/webm' });
              const url = URL.createObjectURL(blob);

              // 비디오 다운로드
              const a = document.createElement('a');
              a.href = url;
              a.download = `timeline_render_${Date.now()}.webm`;
              a.style.display = 'none';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);

              // 메모리 정리
              URL.revokeObjectURL(url);

              console.log("🎬 WebM 비디오 생성 완료!");
              resolve();
            } catch (error) {
              reject(error);
            }
          };

          // 녹화 시작
          mediaRecorder.start();

          // 프레임들을 순차적으로 캔버스에 그리기
          let currentFrame = 0;
          const frameInterval = 1000 / this.timelineSettings.framesPerSecond;

          const drawNextFrame = () => {
            if (currentFrame >= this.renderedFrames.length) {
              mediaRecorder.stop();
              return;
            }

            const frame = this.renderedFrames[currentFrame];
            const frameImg = new Image();
            frameImg.onload = () => {
              // 캔버스 지우기
              tempContext.clearRect(0, 0, tempCanvas.width, tempCanvas.height);
              // 프레임 그리기
              tempContext.drawImage(frameImg, 0, 0);

              currentFrame++;

              // 진행률 표시 (UI 업데이트)
              const progress = 30 + (currentFrame / this.renderedFrames.length) * 60; // 30% ~ 90%
              this.updateDownloadProgress(progress, `WebM 비디오 생성 중... ${currentFrame}/${this.renderedFrames.length} 프레임`);
              console.log(`🎬 WebM 비디오 생성 진행률: ${(currentFrame / this.renderedFrames.length * 100).toFixed(1)}%`);

              // 다음 프레임 그리기
              setTimeout(drawNextFrame, frameInterval);
            };
            frameImg.src = frame.dataURL;
          };

          // 첫 번째 프레임부터 시작
          drawNextFrame();

        };
        img.src = firstFrame.dataURL;

      } catch (error) {
        reject(error);
      }
    });
  }

  // 🎬 Canvas Stream으로 비디오 생성 (렌더링 전용 canvas 사용)
  async createCanvasStreamVideo() {
    return new Promise(async (resolve, reject) => {
      try {
        console.log("🎬 Canvas Stream 비디오 생성 시작...");

        // 렌더링 전용 canvas 사용
        if (!this.renderRenderer || !this.renderRenderer.domElement) {
          throw new Error("렌더링 전용 renderer를 찾을 수 없습니다");
        }

        const canvas = this.renderRenderer.domElement;
        console.log("🎬 렌더링 전용 canvas 정보:", { width: canvas.width, height: canvas.height });

        // Canvas Stream 생성
        const stream = canvas.captureStream(this.timelineSettings.framesPerSecond);

        // MediaRecorder 설정
        const mediaRecorder = new MediaRecorder(stream, {
          mimeType: 'video/webm;codecs=vp8',
          videoBitsPerSecond: 3000000 // 3 Mbps
        });

        const chunks = [];

        mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          try {
            const blob = new Blob(chunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);

            // 비디오 다운로드
            const a = document.createElement('a');
            a.href = url;
            a.download = `timeline_render_${Date.now()}.webm`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            // 메모리 정리
            URL.revokeObjectURL(url);

            console.log("🎬 Canvas Stream 비디오 생성 완료!");
            resolve();
          } catch (error) {
            reject(error);
          }
        };

        // 녹화 시작
        mediaRecorder.start();

        // 타임라인 재생하면서 녹화
        await this.recordTimelineForVideo(mediaRecorder);

      } catch (error) {
        reject(error);
      }
    });
  }

  // 🎬 타임라인 재생하면서 비디오 녹화
  async recordTimelineForVideo(mediaRecorder) {
    const totalFrames = this.renderedFrames.length;
    const frameInterval = 1000 / this.timelineSettings.framesPerSecond;

    console.log(`🎬 비디오 녹화 시작: ${totalFrames}프레임, ${frameInterval}ms 간격`);

    for (let frame = 0; frame < totalFrames; frame++) {
      const time = frame / this.timelineSettings.framesPerSecond;

      // 타임라인 시간 설정
      this.setCurrentFrame(frame);
      this.updatePlayheadPosition(time);

      // 애니메이션 업데이트 (렌더링 전용 scene에서만)
      if (this.renderScene) {
        console.log(`🎬 비디오 녹화: 렌더링 전용 scene 애니메이션 업데이트 시작...`);

        // FBX 애니메이션 업데이트
        if (this.renderAnimationMixers && this.renderClock && this.renderClock.getDelta) {
          try {
            const deltaTime = this.renderClock.getDelta();
            console.log(`🎬 비디오 녹화: deltaTime = ${deltaTime.toFixed(4)}초`);

            this.renderAnimationMixers.forEach((mixer, index) => {
              if (mixer && mixer.update && typeof mixer.update === 'function') {
                console.log(`🎬 비디오 녹화: 믹서 ${index + 1} 업데이트 중...`);
                mixer.update(deltaTime);
                console.log(`🎬 비디오 녹화: 믹서 ${index + 1} 업데이트 완료`);
              } else {
                console.warn(`🎬 비디오 녹화: 믹서 ${index + 1} 업데이트 실패 - 유효하지 않은 믹서`);
              }
            });
            console.log(`🎬 비디오 녹화: FBX 애니메이션 업데이트 완료 (${this.renderAnimationMixers.length}개 믹서)`);
          } catch (animationError) {
            console.warn("⚠️ 비디오 녹화 FBX 애니메이션 업데이트 실패:", animationError);
          }
        } else {
          console.log(`🎬 비디오 녹화: FBX 애니메이션 업데이트 건너뜀 - 믹서 또는 클록 없음`);
        }

        // 타임라인 애니메이션 데이터는 currentTime만 업데이트
        if (this.timelines.motion) {
          this.timelines.motion.currentTime = time;
          console.log(`🎬 비디오 녹화: MotionTimeline currentTime 설정 완료 (${time}초)`);
        }
        if (this.timelines.light) {
          this.timelines.light.currentTime = time;
          console.log(`🎬 비디오 녹화: LightTimeline currentTime 설정 완료 (${time}초)`);
        }
      } else {
        console.warn(`🎬 비디오 녹화: renderScene이 없음`);
      }

      // 렌더링 전용 renderer로 씬 렌더링
      if (this.renderRenderer && this.renderScene && this.renderCamera) {
        this.renderRenderer.render(this.renderScene, this.renderCamera);
      }

      // 진행률 표시
      const progress = ((frame + 1) / totalFrames) * 100;
      console.log(`🎬 비디오 녹화 진행률: ${progress.toFixed(1)}%`);

      // 프레임 간 지연
      await new Promise(resolve => setTimeout(resolve, frameInterval));
    }

    // 녹화 중지
    mediaRecorder.stop();
    console.log('🎬 비디오 녹화 완료');
  }

  // 🎬 GIF 생성
  async createGIF() {
    return new Promise((resolve, reject) => {
      const options = {
        images: this.renderedFrames.map(frame => frame.dataURL),
        gifWidth: 1200,
        gifHeight: 600,
        interval: 1 / this.timelineSettings.framesPerSecond,
        progressCallback: (progress) => {
          console.log(`🎬 GIF 생성 진행률: ${(progress * 100).toFixed(1)}%`);
        }
      };

      gifshot.createGIF(options, (obj) => {
        if (obj.error) {
          reject(new Error(obj.error));
          return;
        }

        // GIF 다운로드
        const a = document.createElement('a');
        a.href = obj.image;
        a.download = `timeline_render_${Date.now()}.gif`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        console.log("🎬 GIF 생성 완료!");
        resolve();
      });
    });
  }

  // 🎬 ZIP으로 프레임 압축
  async createZIPFromFrames() {
    try {
      console.log("🎬 ZIP 생성 시작...");

      const zip = new JSZip();
      const framesFolder = zip.folder('frames');

      // 모든 프레임을 ZIP에 추가
      for (let i = 0; i < this.renderedFrames.length; i++) {
        const frame = this.renderedFrames[i];

        // base64 데이터 추출
        const base64Data = frame.dataURL.split(',')[1];
        const fileName = `frame_${frame.frame.toString().padStart(4, '0')}_${frame.time.toFixed(2)}s.png`;

        framesFolder.file(fileName, base64Data, { base64: true });

        // 진행률 표시 (UI 업데이트)
        if (i % 5 === 0 || i === this.renderedFrames.length - 1) {
          const progress = 50 + ((i + 1) / this.renderedFrames.length) * 40; // 50% ~ 90%
          this.updateDownloadProgress(progress, `ZIP 파일 생성 중... ${i + 1}/${this.renderedFrames.length} 프레임`);
          console.log(`🎬 ZIP 생성 진행률: ${((i + 1) / this.renderedFrames.length * 100).toFixed(1)}%`);
        }
      }

      // ZIP 파일 생성 및 다운로드
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `timeline_frames_${Date.now()}.zip`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      // 메모리 정리
      URL.revokeObjectURL(url);

      console.log("🎬 ZIP 생성 완료!");
      alert(`총 ${this.renderedFrames.length}개 프레임이 ZIP 파일로 다운로드되었습니다.`);

    } catch (error) {
      console.error("🎬 ZIP 생성 중 오류:", error);
      throw error;
    }
  }

  // 🎬 개별 프레임 다운로드
  async downloadIndividualFrames() {
    try {
      console.log("🎬 개별 프레임 다운로드 시작...");

      // 최대 100개 프레임만 다운로드 (성능 고려)
      const maxFrames = Math.min(100, this.renderedFrames.length);
      const frameInterval = Math.max(1, Math.floor(this.renderedFrames.length / maxFrames));

      for (let i = 0; i < maxFrames; i++) {
        const frameIndex = i * frameInterval;
        const frame = this.renderedFrames[frameIndex];

        if (frame) {
          // 프레임을 이미지로 다운로드
          const a = document.createElement('a');
          a.href = frame.dataURL;
          a.download = `frame_${frame.frame.toString().padStart(4, '0')}_${frame.time.toFixed(2)}s.png`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);

          // 진행률 표시
          const progress = ((i + 1) / maxFrames) * 100;
          console.log(`🎬 프레임 다운로드 진행률: ${progress.toFixed(1)}%`);

          // 브라우저 부하 방지를 위한 지연
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log("🎬 개별 프레임 다운로드 완료");
      alert(`${maxFrames}개 프레임 다운로드가 완료되었습니다.`);

    } catch (error) {
      console.error("🎬 개별 프레임 다운로드 중 오류:", error);
      throw error;
    }
  }

  // 🎬 프레임 다운로드 (기존 메서드와 동일)
  async downloadFrames() {
    try {
      console.log("🎬 프레임 다운로드 시작...");

      if (this.renderedFrames.length === 0) {
        throw new Error("렌더링된 프레임이 없습니다. 먼저 렌더링을 완료해주세요.");
      }

      // 다운로드 진행률 UI 표시
      this.showDownloadProgressUI();
      this.updateDownloadProgress(0, "프레임 다운로드 준비 중...");

      // 개별 프레임 다운로드
      await this.downloadIndividualFrames();

    } catch (error) {
      console.error("🎬 프레임 다운로드 중 오류:", error);
      this.updateDownloadProgress(0, "프레임 다운로드 실패: " + error.message);
      alert("프레임 다운로드에 실패했습니다: " + error.message);
    }
  }

  // 🎬 다운로드 진행률 UI 표시
  showDownloadProgressUI() {
    const downloadProgressContainer = document.querySelector('#download-progress-container');
    if (downloadProgressContainer) {
      downloadProgressContainer.style.display = 'block';
    }
  }

  // 🎬 다운로드 진행률 업데이트
  updateDownloadProgress(progress, statusText) {
    const progressBar = document.querySelector('#download-progress-bar');
    const progressText = document.querySelector('#download-progress-text');
    const statusTextElement = document.querySelector('#download-status-text');

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (progressText) {
      progressText.textContent = `${progress.toFixed(1)}%`;
    }

    if (statusTextElement) {
      statusTextElement.textContent = statusText;
    }
  }

}

export { Timeline };