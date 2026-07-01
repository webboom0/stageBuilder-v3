import { TimelineData, INTERPOLATION } from './TimelineCore.js';

export class BaseTimeline {
  constructor(editor, options) {
    this.editor = editor;
    this.options = options || {};
    this.timelineData = new TimelineData();
    this.isPlaying = false;
    this.currentTime = 0;
    this.container = document.createElement('div');
    this.container.className = 'timeline-container';
    this.tracks = new Map();
    this.selectedKeyframe = null;
    this.selectedTrack = null;
    this.selectedSprite = null;
    this.currentFrame = 0;
    this.animationFrameId = null;
    this.lastFrameTime = 0;
    this.frameDuration = 1000 / this.options.framesPerSecond;
    this.keyframeOffsets = new Map();
    this.initUI();
  }

  // 타임라인 설정 업데이트 (기본 구현)
  updateSettings(newSettings) {
    console.log('BaseTimeline 설정 업데이트:', newSettings);

    // 기존 설정 백업
    const oldSettings = { ...this.options };

    // 기존 설정 업데이트
    this.options = { ...this.options, ...newSettings };

    // TimelineData의 frameRate 업데이트
    if (newSettings.framesPerSecond && this.timelineData) {
      this.timelineData.frameRate = newSettings.framesPerSecond;
    }

    // 프레임 지속 시간 업데이트
    if (newSettings.framesPerSecond) {
      this.frameDuration = 1000 / newSettings.framesPerSecond;
    }

    // Scene의 timeline 설정 업데이트
    if (this.editor.scene) {
      if (!this.editor.scene.userData.timeline) {
        this.editor.scene.userData.timeline = {};
      }
      Object.assign(this.editor.scene.userData.timeline, newSettings);
    }

    // 클립 너비 업데이트 (시간 변경 시)
    if (newSettings.totalSeconds && oldSettings.totalSeconds !== newSettings.totalSeconds) {
      this.updateClipWidths(oldSettings.totalSeconds, newSettings.totalSeconds);
    }

    console.log('BaseTimeline 설정이 성공적으로 업데이트되었습니다.');
  }

  // 클립 너비 업데이트 (기본 구현)
  updateClipWidths(oldTotalSeconds, newTotalSeconds) {
    console.log('BaseTimeline 클립 너비 업데이트:', { oldTotalSeconds, newTotalSeconds });

    const sprites = this.container.querySelectorAll('.animation-sprite');
    sprites.forEach(sprite => {
      const duration = parseFloat(sprite.dataset.duration) || 5;
      const currentLeft = parseFloat(sprite.style.left) || 0;

      // 클립의 절대 시작 시간 계산 (현재 위치 기반)
      const clipStartTime = (currentLeft / 100) * oldTotalSeconds;

      // 기존 너비 계산
      const oldWidth = (duration / oldTotalSeconds) * 100;
      // 새로운 너비 계산
      const newWidth = (duration / newTotalSeconds) * 100;

      console.log('BaseTimeline 클립 너비 업데이트:', {
        duration,
        clipStartTime,
        currentLeft: `${currentLeft}%`,
        oldWidth: `${oldWidth}%`,
        newWidth: `${newWidth}%`
      });

      // 너비 업데이트
      sprite.style.width = `${newWidth}%`;

      // 클립의 절대 시작 시간을 보존하여 새로운 위치 계산
      const newLeft = (clipStartTime / newTotalSeconds) * 100;

      // 클립이 타임라인 끝을 벗어나지 않도록 위치 조정
      const maxLeft = 100 - newWidth;
      const clampedLeft = Math.max(0, Math.min(maxLeft, newLeft));

      sprite.style.left = `${clampedLeft}%`;

      console.log('BaseTimeline 클립 위치 업데이트:', {
        originalStartTime: clipStartTime,
        newLeft: `${newLeft}%`,
        clampedLeft: `${clampedLeft}%`,
        maxLeft: `${maxLeft}%`
      });

      // 클립 내의 키프레임 위치 업데이트
      this.updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds);
    });
  }

  // 타임라인 시간 변경 후 클립 내 키프레임 위치 업데이트 (기본 구현)
  updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds) {
    console.log('BaseTimeline 클립 내 키프레임 위치 업데이트:', { oldTotalSeconds, newTotalSeconds });

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

      console.log('BaseTimeline 키프레임 위치 업데이트:', {
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

      console.log('BaseTimeline 최종 키프레임 위치:', {
        originalTime: keyframeTime,
        newLeft: `${clampedPosition}%`,
        newTime: newRelativeTime.toFixed(3)
      });
    });
  }

  initUI() {
    this.tracks = new Map();
    this.selectedKeyframe = null;
    this.selectedTrack = null;
    this.selectedSprite = null;
    this.currentFrame = 0;
    this.animationFrameId = null;
    this.lastFrameTime = 0;
    this.frameDuration = 1000 / this.options.framesPerSecond;
    this.keyframeOffsets = new Map();
  }

  createContainer() {
    const container = document.createElement("div");
    container.className = "timeline-container";
    return container;
  }

  createTrackHeader(objectId, objectName) {
    const header = document.createElement("div");
    header.className = "track-header";
    header.innerHTML = `
      <div class="track-info">
        <span class="track-name">${typeof objectName === "object"
        ? objectName.name || "Object"
        : objectName
      }</span>
      </div>
      <div class="track-controls">
        <button class="add-keyframe-btn" title="Add Keyframe">+</button>
      </div>
    `;
    return header;
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
    keyframesContainer.className = "property-keyframes-scroll";

    const keyframesArea = document.createElement("div");
    keyframesArea.className = "property-keyframes";

    const keyframeLayer = document.createElement("div");
    keyframeLayer.className = "keyframe-layer";

    keyframesArea.appendChild(keyframeLayer);
    keyframesContainer.appendChild(keyframesArea);
    propertyTrack.appendChild(propertyHeader);
    propertyTrack.appendChild(keyframesContainer);

    return propertyTrack;
  }

  formatPropertyName(propertyType) {
    return propertyType.charAt(0).toUpperCase() + propertyType.slice(1);
  }

  addTrack(objectId, objectName) {
    console.log("addTrack called with:", { objectId, objectName });
    if (this.tracks.has(objectId)) return;

    const track = {
      element: document.createElement("div"),
      keyframes: {},
      objectId: objectId,
      objectName: objectName,
    };

    track.element.className = "timeline-track";
    track.element.dataset.objectId = objectId;

    const trackTopArea = document.createElement("div");
    trackTopArea.className = "timeline-tracks";
    trackTopArea.appendChild(this.createTrackHeader(objectId, objectName));

    const trackContent = document.createElement("div");
    trackContent.className = "track-content";
    trackTopArea.appendChild(trackContent);

    track.element.appendChild(trackTopArea);

    const propertyTracksContainer = document.createElement("div");
    propertyTracksContainer.className = "property-tracks";
    track.element.appendChild(propertyTracksContainer);

    this.tracks.set(objectId, track);
    this.container.appendChild(track.element);

    this.bindTrackEvents(track);
    return track;
  }

  addKeyframe(objectId, property, time, value, interpolation = INTERPOLATION.LINEAR) {
    if (!this.timelineData) {
      console.error("TimelineData가 초기화되지 않았습니다.");
      return false;
    }

    if (!value || typeof value.x === 'undefined' || typeof value.y === 'undefined' || typeof value.z === 'undefined') {
      console.error("키프레임 값이 유효하지 않습니다:", value);
      return false;
    }

    const track = this.timelineData.addTrack(objectId, property);
    if (!track) {
      console.error("트랙을 생성할 수 없습니다:", objectId);
      return false;
    }

    if (track.addKeyframe(time, value, interpolation)) {
      this.timelineData.updateMaxTime(time);
      this.updateUI();
      return true;
    }
    return false;
  }

  removeKeyframeByIndex(objectId, property, index) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track && track.removeKeyframeByIndex(index)) {
      this.updateUI();
      return true;
    }
    return false;
  }

  removeKeyframe(objectId, property, time) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track && track.removeKeyframe(time)) {
      this.updateUI();
      return true;
    }
    return false;
  }

  getKeyframe(objectId, property, time) {
    return this.timelineData.getValueAtTime(objectId, property, time);
  }

  getKeyframeByIndex(objectId, property, index) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track) {
      return track.getKeyframeByIndex(index);
    }
    return null;
  }

  setKeyframeByIndex(objectId, property, index, time, value, interpolation = INTERPOLATION.LINEAR) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track && track.setKeyframeByIndex(index, time, value, interpolation)) {
      this.timelineData.updateMaxTime(time);
      this.updateUI();
      return true;
    }
    return false;
  }

  getKeyframeCount(objectId, property) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track) {
      return track.getKeyframeCount();
    }
    return 0;
  }

  getAllKeyframes(objectId, property) {
    const track = this.timelineData.tracks.get(objectId)?.get(property);
    if (track) {
      return track.getAllKeyframes();
    }
    return [];
  }

  createKeyframeElement(frame) {
    const keyframeElement = document.createElement("div");
    keyframeElement.className = "keyframe";
    keyframeElement.style.left = `${(frame / (this.options.totalSeconds * this.options.framesPerSecond)) * 100
      }%`;
    return keyframeElement;
  }

  addKeyframeToTrack(track, propertyType, keyframeElement) {
    const container = track.element.querySelector(
      `[data-property="${propertyType}"] .keyframe-layer`
    );
    if (container) {
      container.appendChild(keyframeElement);
    }
  }

  bindTrackEvents(track) {
    if (!track || !track.objectId) {
      console.warn("트랙 또는 트랙의 objectId가 없습니다:", track);
      return;
    }

    const addBtn = track.element.querySelector(".add-keyframe-btn");
    if (addBtn) {
      addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const currentFrame = this.currentFrame;

        // track.objectId가 문자열인지 확인하고 변환
        const objectId = typeof track.objectId === 'string' ? parseInt(track.objectId) : track.objectId;
        if (isNaN(objectId)) {
          console.warn("유효하지 않은 objectId입니다:", track.objectId);
          return;
        }

        const object = this.editor.scene.getObjectById(objectId);
        if (!object) {
          console.warn("객체를 찾을 수 없습니다:", objectId);
          return;
        }

        // 현재 객체의 position 값 가져오기
        const position = {
          x: object.position.x,
          y: object.position.y,
          z: object.position.z
        };

        console.log("키프레임 추가 시도 (BaseTimeline):", {
          objectId: objectId,
          currentFrame,
          position
        });

        this.addKeyframe(objectId, "position", currentFrame / this.options.framesPerSecond, position);
      });
    }

    track.element.querySelectorAll(".keyframe-layer").forEach((layer) => {
      layer.addEventListener("click", (e) => {
        const propertyTrack = e.target.closest(".property-track");
        if (!propertyTrack) {
          console.warn("property-track을 찾을 수 없습니다");
          return;
        }

        const propertyType = propertyTrack.dataset.property;
        if (!propertyType) {
          console.warn("property type이 정의되지 않았습니다");
          return;
        }

        const rect = layer.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const frame = Math.round(
          (x / rect.width) *
          this.options.totalSeconds *
          this.options.framesPerSecond
        );

        // track.objectId가 문자열인지 확인하고 변환
        const objectId = typeof track.objectId === 'string' ? parseInt(track.objectId) : track.objectId;
        if (isNaN(objectId)) {
          console.warn("유효하지 않은 objectId입니다:", track.objectId);
          return;
        }

        const object = this.editor.scene.getObjectById(objectId);
        if (!object) {
          console.warn("객체를 찾을 수 없습니다:", objectId);
          return;
        }

        // 현재 객체의 position 값 가져오기
        const position = {
          x: object.position.x,
          y: object.position.y,
          z: object.position.z
        };

        console.log("키프레임 추가 시도 (BaseTimeline - layer click):", {
          objectId: objectId,
          frame,
          position
        });

        this.addKeyframe(objectId, propertyType, frame / this.options.framesPerSecond, position);
      });
    });
  }

  bindKeyframeEvents(keyframeElement, objectId, propertyType, frame) {
    keyframeElement.addEventListener("click", (e) => {
      console.log("키프레임 클릭");
      e.stopPropagation();
      this.selectKeyframe(objectId, propertyType, frame, keyframeElement);
    });
  }

  bindSpriteEvents(sprite, track) {
    let isDragging = false;
    let startX, startLeft;
    let isResizing = false;
    let resizeHandle = null;

    // 스프라이트 클릭 이벤트
    sprite.addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("sprite-handle")) {
        isResizing = true;
        resizeHandle = e.target;
      } else {
        isDragging = true;
      }
      startX = e.clientX;
      startLeft = parseFloat(sprite.style.left) || 0;

      // 스프라이트 선택
      this.selectedSprite = sprite;
      sprite.classList.add("selected");

      e.stopPropagation();
    });

    // 마우스 이동 이벤트
    document.addEventListener("mousemove", (e) => {
      if (!isDragging && !isResizing) return;

      const dx = e.clientX - startX;
      const container = sprite.closest(".track-content");
      const containerRect = container.getBoundingClientRect();

      if (isResizing) {
        this.handleSpriteResize(e, sprite, resizeHandle, startX, startLeft);
      } else if (isDragging) {
        // 드래그 처리
        const newLeft = Math.max(
          0,
          Math.min(100, startLeft + (dx / containerRect.width) * 100)
        );
        sprite.style.left = `${newLeft}%`;
      }
    });

    // 마우스 업 이벤트
    document.addEventListener("mouseup", () => {
      isDragging = false;
      isResizing = false;
      resizeHandle = null;
    });
  }

  handleSpriteResize(e, sprite, handle, startX, startLeft) {
    const container = sprite.closest(".track-content");
    const containerRect = container.getBoundingClientRect();
    const spriteRect = sprite.getBoundingClientRect();

    // 현재 마우스 위치의 상대적 위치를 백분율로 계산
    const mouseX = e.clientX - containerRect.left;
    const mousePercent = (mouseX / containerRect.width) * 100;

    const minWidth = parseFloat(sprite.dataset.minWidth) || 0;
    const maxWidth = parseFloat(sprite.dataset.maxWidth) || 100;
    const currentLeft = parseFloat(sprite.style.left) || 0;
    const currentWidth = parseFloat(sprite.style.width) || 0;

    if (handle.classList.contains("left")) {
      // 왼쪽 핸들 드래그
      const newLeft = Math.max(
        0,
        Math.min(currentLeft + currentWidth - minWidth, mousePercent)
      );
      const newWidth = currentLeft + currentWidth - newLeft;

      if (newWidth >= minWidth && newWidth <= maxWidth) {
        sprite.style.left = `${newLeft}%`;
        sprite.style.width = `${newWidth}%`;
      }
    } else if (handle.classList.contains("right")) {
      // 오른쪽 핸들 드래그
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, mousePercent - currentLeft)
      );
      sprite.style.width = `${newWidth}%`;
    }
  }

  play() {
    console.log("BaseTimeline- play");
    if (this.isPlaying) return;
    this.isPlaying = true;
    this.timelineData.precomputeAnimationData(); // 애니메이션 데이터 프리컴파일
    this.animate();
  }

  pause() {
    this.isPlaying = false;
  }

  stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.updateUI();
  }

  animate() {
    if (!this.isPlaying) return;

    const deltaTime = 1 / this.timelineData.frameRate;
    this.currentTime += deltaTime;

    if (this.currentTime >= this.timelineData.maxTime) {
      this.currentTime = 0;
    }

    this.updateAnimation();
    this.updateUI();
    requestAnimationFrame(() => this.animate());
  }

  updateAnimation() {
    const precomputedData = this.timelineData.precomputedData;
    if (!precomputedData) return;

    const frameIndex = Math.floor(this.currentTime * this.timelineData.frameRate);

    precomputedData.forEach((objectData, objectId) => {
      const object = this.editor.scene.getObjectByProperty('uuid', objectId);
      if (!object) return;

      objectData.forEach((frames, property) => {
        const value = new THREE.Vector3(
          frames[frameIndex * 3],
          frames[frameIndex * 3 + 1],
          frames[frameIndex * 3 + 2]
        );
        this.applyValue(object, property, value);
      });
    });
  }

  applyValue(object, property, value) {
    // 하위 클래스에서 구현
  }

  updateUI() {
    // 하위 클래스에서 구현
  }

  toJSON() {
    return this.timelineData.toJSON();
  }

  fromJSON(data) {
    this.timelineData.fromJSON(data);
    this.updateUI();
  }

  isWithinClipRange(track, frame) {
    throw new Error("isWithinClipRange must be implemented by child class");
  }

  saveKeyframeOffsets(track, sprite) {
    this.keyframeOffsets.clear();
    Object.keys(track.keyframes).forEach((propertyType) => {
      const keyframes = track.keyframes[propertyType];
      if (!keyframes) return;

      const keyframeElements = track.element.querySelectorAll(
        `[data-property="${propertyType}"] .keyframe`
      );

      keyframeElements.forEach((element) => {
        const left = parseFloat(element.style.left);
        const clipLeft = parseFloat(sprite.style.left);
        const offset = left - clipLeft;
        this.keyframeOffsets.set(element, offset);
      });
    });
  }

  moveKeyframesWithSprite(track, newLeft, sprite) {
    Object.keys(track.keyframes).forEach((propertyType) => {
      const keyframes = track.keyframes[propertyType];
      if (!keyframes) return;

      const keyframeElements = track.element.querySelectorAll(
        `[data-property="${propertyType}"] .keyframe`
      );

      keyframeElements.forEach((element) => {
        const offset = this.keyframeOffsets.get(element);
        if (offset !== undefined) {
          const newKeyframeLeft = newLeft + offset;
          if (
            newKeyframeLeft >= newLeft &&
            newKeyframeLeft <= newLeft + parseFloat(sprite.style.width)
          ) {
            this.updateKeyframePosition(
              track,
              propertyType,
              element,
              newKeyframeLeft,
              sprite
            );
          }
        }
      });
    });
  }

  updateKeyframePosition(track, propertyType, element, newLeft, sprite) {
    const oldFrame = Math.round(
      (parseFloat(element.dataset.left || "0") / 100) *
      this.options.totalSeconds *
      this.options.framesPerSecond
    );
    const newFrame = Math.round(
      (newLeft / 100) * this.options.totalSeconds * this.options.framesPerSecond
    );

    if (oldFrame !== newFrame) {
      const keyframeData = track.keyframes[propertyType].get(oldFrame);
      if (keyframeData) {
        track.keyframes[propertyType].delete(oldFrame);
        track.keyframes[propertyType].set(newFrame, {
          ...keyframeData,
          time: newFrame / this.options.framesPerSecond,
        });
        element.dataset.left = newLeft.toString();
      }
    }

    // 클립 범위 체크
    if (sprite) {
      const clipDuration = parseFloat(sprite.dataset.duration);
      const maxFrame = Math.floor(clipDuration * this.options.framesPerSecond);
      const maxLeft =
        (maxFrame /
          (this.options.totalSeconds * this.options.framesPerSecond)) *
        100;
      const clipLeft = parseFloat(sprite.style.left);
      const clipWidth = parseFloat(sprite.style.width);

      // 클립 범위를 벗어나면 드래그 중지
      if (newLeft < clipLeft || newLeft > clipLeft + clipWidth) {
        return;
      }
    }

    // 선택된 키프레임이 이동한 경우 선택 상태 업데이트
    if (
      this.selectedKeyframe &&
      this.selectedKeyframe.objectId === track.objectId &&
      this.selectedKeyframe.propertyType === propertyType &&
      this.selectedKeyframe.frame === oldFrame
    ) {
      this.selectedKeyframe.frame = newFrame;
    }

    // 씬 업데이트
    if (this.editor.signals?.objectChanged) {
      this.editor.signals.objectChanged.dispatch(sprite);
    }
  }

  updateKeyframeLimits(track, sprite) {
    const clipLeft = parseFloat(sprite.style.left);
    const clipWidth = parseFloat(sprite.style.width);

    Object.keys(track.keyframes).forEach((propertyType) => {
      const keyframes = track.keyframes[propertyType];
      if (!keyframes) return;

      const keyframeElements = track.element.querySelectorAll(
        `[data-property="${propertyType}"] .keyframe`
      );

      keyframeElements.forEach((element) => {
        const left = parseFloat(element.style.left);
        if (left < clipLeft || left > clipLeft + clipWidth) {
          const frame = Math.round(
            (left / 100) *
            this.options.totalSeconds *
            this.options.framesPerSecond
          );
          keyframes.delete(frame);
          element.remove();
        } else {
          element.dataset.left = left.toString();
        }
      });
    });

    if (this.editor.signals?.sceneGraphChanged) {
      this.editor.signals.sceneGraphChanged.dispatch();
    }
  }

  makeKeyframeDraggable(keyframeElement, track, frame, object) {
    let isDragging = false;
    let startX, startY;
    let startLeft;
    const REMOVE_THRESHOLD = 50;

    // this를 저장
    const self = this;

    keyframeElement.addEventListener("mousedown", (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      startLeft = parseFloat(keyframeElement.style.left) || 0;

      // self 사용
      self.selectKeyframe(track.objectId, frame, keyframeElement);

      e.stopPropagation();
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;

      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      if (dy > REMOVE_THRESHOLD) {
        keyframeElement.classList.add("delete-preview");
      } else {
        keyframeElement.classList.remove("delete-preview");

        const sprite = keyframeElement.closest(".animation-sprite");
        if (sprite) {
          const spriteRect = sprite.getBoundingClientRect();
          const newLeft = Math.max(
            0,
            Math.min(spriteRect.width, startLeft + dx)
          );
          keyframeElement.style.left = `${newLeft}px`;
        }
      }
    });

    document.addEventListener("mouseup", (e) => {
      if (!isDragging) return;

      const dy = e.clientY - startY;

      if (dy > REMOVE_THRESHOLD) {
        const propertyType =
          keyframeElement.closest(".property-track")?.dataset.property;
        const actualFrame = parseInt(keyframeElement.dataset.frame);

        // self 사용
        self.deleteKeyframe(
          track.objectId,
          propertyType,
          actualFrame,
          keyframeElement
        );
      }

      keyframeElement.classList.remove("delete-preview");
      isDragging = false;
    });
  }

  showKeyframeContextMenu(e, objectId, propertyType, frame, keyframeElement) {
    // 기존 메뉴가 있다면 제거
    const existingMenu = document.querySelector(".keyframe-context-menu");
    if (existingMenu) {
      existingMenu.remove();
    }

    // 새 컨텍스트 메뉴 생성
    const menu = document.createElement("div");
    menu.className = "keyframe-context-menu";
    menu.style.cssText = `
      position: fixed;
      left: ${e.clientX}px;
      top: ${e.clientY}px;
      background-color: #2c2c2c;
      border: 1px solid #444;
      padding: 5px 0;
      border-radius: 3px;
      z-index: 1000;
      box-shadow: 0 2px 5px rgba(0,0,0,0.2);
    `;

    // 삭제 메뉴 아이템
    const deleteItem = document.createElement("div");
    deleteItem.textContent = "키프레임 삭제";
    deleteItem.style.cssText = `
      padding: 5px 15px;
      cursor: pointer;
      color: #ff4444;
      font-size: 12px;
      transition: background-color 0.2s;
    `;

    // 호버 효과
    deleteItem.addEventListener("mouseover", () => {
      deleteItem.style.backgroundColor = "#3c3c3c";
    });
    deleteItem.addEventListener("mouseout", () => {
      deleteItem.style.backgroundColor = "transparent";
    });

    // 삭제 클릭 이벤트
    deleteItem.addEventListener("click", () => {
      this.deleteKeyframe(objectId, propertyType, frame, keyframeElement);
      menu.remove();
    });

    menu.appendChild(deleteItem);
    document.body.appendChild(menu);

    // 메뉴 외부 클릭 시 닫기
    const closeMenu = (e) => {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener("click", closeMenu);
      }
    };
    document.addEventListener("click", closeMenu);
  }

  deleteKeyframe(objectId, propertyType, frame, keyframeElement) {
    console.log("deleteKeyframe called with:", {
      objectId,
      propertyType,
      frame,
    });

    const actualObjectId =
      typeof objectId === "object" ? objectId.objectId : objectId;
    const track = this.tracks.get(actualObjectId);

    if (!track || !track.keyframes) {
      console.warn("트랙 또는 키프레임을 찾을 수 없습니다:", {
        objectId: actualObjectId,
        track,
        originalObjectId: objectId,
        availableTracks: Array.from(this.tracks.keys()),
      });
      return;
    }

    // 키프레임 데이터 삭제
    if (track.keyframes[propertyType]) {
      track.keyframes[propertyType].delete(frame);
    }

    // DOM에서 키프레임과 속성 키프레임 요소 제거
    if (keyframeElement && keyframeElement.parentNode) {
      const sprite = keyframeElement.closest(".animation-sprite");
      console.log("Found sprite:", sprite);

      if (sprite) {
        // 속성 키프레임 찾기 시도 - 여러 선택자로 시도
        let propertyKeyframe = sprite.querySelector(
          `.property-track[data-property="${propertyType}"] .keyframe[data-frame="${frame}"]`
        );
        console.log(
          "Property keyframe found with first selector:",
          propertyKeyframe
        );

        // 첫 번째 시도가 실패하면 다른 선택자로 시도
        if (!propertyKeyframe) {
          propertyKeyframe = sprite.querySelector(
            `.property-keyframes .keyframe[data-frame="${frame}"]`
          );
          console.log(
            "Property keyframe found with second selector:",
            propertyKeyframe
          );
        }

        if (propertyKeyframe) {
          propertyKeyframe.remove();
          console.log("Property keyframe removed successfully");
        } else {
          console.warn("Property keyframe not found with any selector");
        }
      }
      keyframeElement.parentNode.removeChild(keyframeElement);
    }

    // 선택된 키프레임이 삭제된 키프레임이었다면 선택 해제
    if (
      this.selectedKeyframe &&
      this.selectedKeyframe.objectId === actualObjectId &&
      this.selectedKeyframe.propertyType === propertyType &&
      this.selectedKeyframe.frame === frame
    ) {
      this.selectedKeyframe = null;
      if (this.updatePropertyPanel) {
        this.updatePropertyPanel();
      }
    }
  }

  selectKeyframe(objectId, propertyType, frame, keyframeElement) {
    // 이전 선택 해제
    const previousSelected = document.querySelector(".keyframe.selected");
    if (previousSelected) {
      previousSelected.classList.remove("selected");
    }

    // 새로운 선택
    keyframeElement.classList.add("selected");

    const track = this.tracks.get(objectId);
    if (!track || !track.keyframes) {
      console.warn("트랙 또는 키프레임을 찾을 수 없습니다:", {
        objectId,
        track,
      });
      return;
    }

    const keyframeData = track.keyframes[propertyType]?.get(frame);
    if (!keyframeData) {
      console.warn("키프레임 데이터를 찾을 수 없습니다:", {
        frame,
        propertyType,
        trackKeyframes: track.keyframes,
      });
      return;
    }

    // 선택 상태 저장
    this.selectedKeyframe = {
      objectId,
      propertyType,
      frame,
      element: keyframeElement,
      data: keyframeData,
    };

    console.log("키프레임 선택됨:", {
      objectId,
      propertyType,
      frame,
      data: keyframeData,
    });

    // 속성 패널 업데이트 (자식 클래스에서 구현)
    if (this.updatePropertyPanel) {
      this.updatePropertyPanel();
    }
  }
}

// 공통으로 사용할 Track 클래스
class Track {
  constructor(options) {
    this.options = options;
    this.keyframes = new Map();
    this.element = this.createTrackElement();
  }

  createTrackElement() {
    const track = document.createElement("div");
    track.className = "timeline-track";

    // 트랙 헤더
    const header = document.createElement("div");
    header.className = "track-header";
    header.innerHTML = `
            <div class="track-name">${this.options.name}</div>
            <div class="track-controls">
                <button class="track-toggle">▼</button>
                <button class="track-lock">🔒</button>
            </div>
        `;

    // 키프레임 영역
    const keyframeArea = document.createElement("div");
    keyframeArea.className = "track-keyframes";

    track.appendChild(header);
    track.appendChild(keyframeArea);

    return track;
  }

  addKeyframe(frame, value) {
    const keyframe = {
      frame,
      value,
      element: this.createKeyframeElement(frame),
    };
    this.keyframes.set(frame, keyframe);
    return keyframe;
  }

  createKeyframeElement(frame) {
    const element = document.createElement("div");
    element.className = "keyframe";
    element.style.left = `${frame * this.options.frameWidth}px`;
    return element;
  }

  updateFrame(frame) {
    // 현재 프레임에 따른 트랙 업데이트
    this.element.querySelectorAll(".keyframe").forEach((keyframe) => {
      keyframe.classList.toggle(
        "current",
        parseInt(keyframe.dataset.frame) === frame
      );
    });
  }

  updateSettings(options) {
    this.options = {
      ...this.options,
      ...options,
    };
    // 트랙 설정 업데이트에 따른 UI 갱신
    this.updateUI();
  }

  updateUI() {
    // 트랙 UI 업데이트 로직
    this.keyframes.forEach((keyframe, frame) => {
      keyframe.element.style.left = `${frame * this.options.frameWidth}px`;
    });
  }
}

export default BaseTimeline;
