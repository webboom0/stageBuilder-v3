import { BaseTimeline } from "./BaseTimeline.js";
import { UIPanel, UIRow, UINumber, UIText, UIColor } from "../libs/ui.js";
import * as THREE from "three";
import { TimelineData, TrackData } from "./TimelineCore.js";
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { AddLightKeyframeAtPlayheadCommand } from '../commands/AddLightKeyframeAtPlayheadCommand.js';

// 조명 타입별 속성 정의
const LIGHT_PROPERTIES = {
  SpotLight: {
    intensity: { type: 'number', range: [0, 100], default: 50 },
    color: { type: 'color', default: 0xffffff },
    position: { type: 'vector3', default: new THREE.Vector3() },
    distance: { type: 'number', range: [0, 1000], default: 200 },
    angle: { type: 'number', range: [0, Math.PI / 2], default: Math.PI / 14 },
    penumbra: { type: 'number', range: [0, 1], default: 0.2 },
    decay: { type: 'number', range: [0, 10], default: 0 }
  },
  PointLight: {
    intensity: { type: 'number', range: [0, 100], default: 10 },
    color: { type: 'color', default: 0xffffff },
    position: { type: 'vector3', default: new THREE.Vector3() },
    distance: { type: 'number', range: [0, 1000], default: 200 },
    decay: { type: 'number', range: [0, 10], default: 0 }
  },
  DirectionalLight: {
    intensity: { type: 'number', range: [0, 10], default: 1 },
    color: { type: 'color', default: 0xffffff },
    position: { type: 'vector3', default: new THREE.Vector3() }
  }
};

// 타겟 속성 정의 (SpotLight, DirectionalLight용)
const TARGET_PROPERTIES = {
  position: { type: 'vector3', default: new THREE.Vector3() }
};

const LIGHT_TYPE_BADGE = {
  SpotLight: { short: "SP", title: "SpotLight" },
  PointLight: { short: "PT", title: "PointLight" },
  DirectionalLight: { short: "DI", title: "DirectionalLight" },
};

// 조명 타입별 속성을 반환하는 헬퍼 함수
function getPropertiesForLightType(lightType) {
  return LIGHT_PROPERTIES[lightType] || LIGHT_PROPERTIES.SpotLight;
}

// editor/timeline/LightTimeline.js
export class LightTimeline extends BaseTimeline {
  // 클립 범위 체크용 오차 범위 (초 단위) - 클립 0 위치 근처 키프레임 선택 허용
  static CLIP_RANGE_TOLERANCE = 0.5;
  constructor(editor, options) {
    super(editor, options);
    this.selectedObject = null;
    this.selectedProperty = null;
    this.selectedLightType = null;
    this.selectedTrackId = null;
    // this.propertyPanel = this.createPropertyPanel();
    // this.container.appendChild(this.propertyPanel.dom);
    this.currentTime = 0;

    // tracks 맵 완전 재설정 (문제 해결을 위해)
    this.tracks = new Map();
    console.log(`🔄 LightTimeline 생성자에서 tracks 맵 재설정`);

    // 10개 조명 트랙 자동 생성
    this.lightTracks = [];
    this.createFixedLightTracks();
    this.timelineEl = document.querySelector(".timeline");

    this._inHistoryPlayback = false;

    // TimelineData 초기화 (BaseTimeline에서 이미 초기화됨)
    this.setupTimelineDataEvents();

    // 디바운싱을 위한 변수들
    this.updateTimeout = null;
    this.lastUpdateTime = 0;
    this.isDragging = false;

    // 객체 변경 리스너 설정 (키프레임 선택 시 속성 변경 감지)
    this.setupObjectChangeListener();

    // 전역에서 테스트할 수 있도록 window 객체에 추가
    if (typeof window !== 'undefined') {
      window.lightTimeline = this;
    }
  }

  // 타임라인 설정 업데이트
  updateSettings(newSettings) {
    console.log('LightTimeline 설정 업데이트:', newSettings);

    // 기존 설정 백업
    const oldSettings = { ...this.options };

    // 기존 설정 업데이트
    this.options = { ...this.options, ...newSettings };

    // TimelineData의 frameRate 업데이트
    if (newSettings.framesPerSecond && this.timelineData) {
      this.timelineData.frameRate = newSettings.framesPerSecond;
    }

    // Scene의 timeline 설정 업데이트
    if (this.editor.scene) {
      if (!this.editor.scene.userData.timeline) {
        this.editor.scene.userData.timeline = {};
      }
      this.editor.scene.userData.timeline = { ...this.editor.scene.userData.timeline, ...newSettings };
    }

    // 클립 너비 업데이트 (시간 변경 시)
    if (newSettings.totalSeconds && oldSettings.totalSeconds !== newSettings.totalSeconds) {
      this.updateClipWidths(oldSettings.totalSeconds, newSettings.totalSeconds);
    }

    // UI 업데이트
    this.updateUI();

    console.log('LightTimeline 설정이 성공적으로 업데이트되었습니다.');
  }

  // 클립 너비 업데이트
  updateClipWidths(oldTotalSeconds, newTotalSeconds) {
    console.log('LightTimeline 클립 너비 업데이트:', { oldTotalSeconds, newTotalSeconds });

    const sprites = this.container.querySelectorAll('.animation-sprite');
    sprites.forEach(sprite => {
      // 조명 클립은 항상 전체 타임라인 길이만큼 늘어나거나 줄어듦
      const newWidth = 100; // 항상 100% (전체 타임라인)
      const newDuration = newTotalSeconds; // 새로운 총 시간으로 지속시간 업데이트

      console.log('LightTimeline 클립 너비 업데이트:', {
        oldTotalSeconds,
        newTotalSeconds,
        newWidth: `${newWidth}%`,
        newDuration
      });

      // 너비와 지속시간 업데이트
      sprite.style.width = `${newWidth}%`;
      sprite.dataset.duration = newDuration.toString();

      // 클립을 항상 0% 위치에 고정 (전체 타임라인을 커버)
      sprite.style.left = '0%';

      // 클립 내의 키프레임 위치 업데이트
      this.updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds);
    });
  }

  // 타임라인 시간 변경 후 클립 내 키프레임 위치 업데이트
  updateKeyframesInClipAfterTimeChange(sprite, oldTotalSeconds, newTotalSeconds) {
    console.log('LightTimeline 클립 내 키프레임 위치 업데이트:', { oldTotalSeconds, newTotalSeconds });

    const keyframes = sprite.querySelectorAll('.keyframe');
    keyframes.forEach(keyframe => {
      const absoluteTime = parseFloat(keyframe.dataset.time) || 0;
      this.setKeyframeElementPosition(keyframe, absoluteTime, sprite);
    });
  }

  setupTimelineDataEvents() {
    if (!this.timelineData) return;

    // 트랙 이벤트 리스너 설정
    this.timelineData.addEventListener('track_added', (data) => {
      console.log('트랙 추가됨:', data);
    });

    this.timelineData.addEventListener('track_removed', (data) => {
      console.log('트랙 제거됨:', data);
    });

    // 키프레임 추가 이벤트
    this.timelineData.addEventListener('track_keyframe_added', (data) => {
      console.log('키프레임 추가 이벤트:', data);
      this.onKeyframeAdded(data.objectUuid, data.property, data.index, data.time, data.value);
    });

    // 키프레임 삭제 이벤트
    this.timelineData.addEventListener('track_keyframe_removed', (data) => {
      console.log('키프레임 삭제 이벤트:', data);
      this.onKeyframeRemoved(data.objectUuid, data.property, data.index, data.time, data.value);
    });

    // 키프레임 업데이트 이벤트
    this.timelineData.addEventListener('track_keyframe_updated', (data) => {
      console.log('키프레임 업데이트 이벤트:', data);
      this.onKeyframeUpdated(data.objectUuid, data.property, data.index, data.time, data.oldValue, data.newValue);
    });

    // 키프레임 이동 이벤트
    this.timelineData.addEventListener('track_keyframe_moved', (data) => {
      console.log('키프레임 이동 이벤트:', data);
      this.onKeyframeMoved(data.objectUuid, data.property, data.index, data.oldTime, data.newTime, data.value);
    });
  }

  createFixedLightTracks() {
    console.log(`🔄 createFixedLightTracks 시작: tracks 크기 = ${this.tracks.size}`);

    const numRows = 2;
    const numCols = 5;
    let lightIndex = 0;
    console.log(`🔄 반복문 시작: ${numRows}행 x ${numCols}열 = ${numRows * numCols}개 트랙 생성 예정`);

    for (let row = 0; row < numRows; row++) {
      for (let col = 0; col < numCols; col++) {
        try {
          const lightId = `light_${lightIndex}`;
          const lightName = `Light ${lightIndex + 1}`;
          console.log(`🔄 트랙 생성 시도: ${lightId} (${row}, ${col})`);
          this.addTrack(lightId, lightName, row, col);
          this.placeLightObjOnly(lightId, row, col); // obj만 배치
          lightIndex++;
          console.log(`✅ 트랙 생성 완료: ${lightId}, 현재 tracks 크기 = ${this.tracks.size}`);
        } catch (error) {
          console.error(`❌ 트랙 생성 실패: light_${lightIndex}`, error);
          lightIndex++;
        }
      }
    }

    console.log(`✅ createFixedLightTracks 완료: tracks 크기 = ${this.tracks.size}`);
    console.log(`✅ 생성된 tracks:`, Array.from(this.tracks.keys()));

    // tracks 맵의 모든 키-값 쌍 상세 출력
    console.log(`🔍 tracks 맵 상세 내용:`, {
      size: this.tracks.size,
      entries: Array.from(this.tracks.entries()).map(([key, value]) => ({
        key,
        keyType: typeof key,
        value: value ? { objectId: value.objectId, objectName: value.objectName } : null
      }))
    });
  }

  addTrack(lightId, lightName, row, col, lightType = null) {
    console.log(`🔄 addTrack 호출: ${lightId}`, { hasTrack: this.tracks.has(lightId) });
    if (this.tracks.has(lightId)) {
      console.log(`ℹ️ 이미 존재하는 트랙: ${lightId}`);
      return;
    }

    // 트랙 최상위 div
    const trackElement = document.createElement("div");
    trackElement.className = "timeline-track light-timeline";
    trackElement.dataset.objectId = lightId;

    // motion-tracks div
    const motionTracks = document.createElement("div");
    motionTracks.className = "motion-tracks";
    motionTracks.dataset.objectId = lightId;
    motionTracks.dataset.objectName = lightName;

    // 트랙 헤더
    const trackHeader = document.createElement("div");
    trackHeader.className = "track-header";

    // track-info (뱃지 + select)
    const trackInfo = document.createElement("div");
    trackInfo.className = "track-info track-info--light";

    const lightTypeBadge = document.createElement("span");
    lightTypeBadge.className = "light-type-badge";
    lightTypeBadge.setAttribute("aria-hidden", "true");

    // === select로 변경 ===
    const trackNameSelect = document.createElement("select");
    trackNameSelect.innerHTML = `
      <option value="">조명 선택</option>
      <option value="SpotLight">SpotLight</option>
      <option value="PointLight">PointLight</option>
      <option value="DirectionalLight" hidden>DirectionalLight</option>
    `;
    trackInfo.appendChild(lightTypeBadge);
    trackInfo.appendChild(trackNameSelect);

    // track-controls (눈 / 키프레임 / 잠금)
    const trackControls = document.createElement("div");
    trackControls.className = "track-controls";
    trackControls.innerHTML = `
      <button type="button" class="track-visibility-btn" title="숨기기/보이기"><i class="fa fa-eye"></i></button>
      <button type="button" class="add-keyframe-btn" title="키프레임 추가 (K)"><span class="kf-add-diamond" aria-hidden="true"></span></button>
      <button type="button" class="track-lock-btn" title="잠금"><i class="fa fa-lock-open"></i></button>
    `;

    // track-header에 info, controls 추가
    trackHeader.appendChild(trackInfo);
    trackHeader.appendChild(trackControls);

    // track-content (클립/스프라이트 영역)
    const trackContent = document.createElement("div");
    trackContent.className = "track-content";

    // motion-tracks에 header, content 추가
    motionTracks.appendChild(trackHeader);
    motionTracks.appendChild(trackContent);

    // timeline-track에 motion-tracks 추가
    trackElement.appendChild(motionTracks);

    // 타임라인 컨테이너에 추가
    this.container.appendChild(trackElement);

    // 트랙 객체로 관리
    const track = {
      element: trackElement,
      keyframes: new Map(), // 동적으로 속성별 키프레임 관리
      objectId: lightId,
      objectName: lightName,
      row,
      col,
      trackContent,
      sprite: null,
      lightType: null,
      properties: {}, // 조명 타입별 속성 정보
      timelineDataInitialized: false // TimelineData 초기화 상태
    };
    console.log(`🔄 tracks.set 호출 전: ${lightId}`, {
      tracksSize: this.tracks.size,
      hasTrack: this.tracks.has(lightId)
    });

    try {
      this.tracks.set(lightId, track);
      this.lightTracks.push(track);
      console.log(`✅ tracks.set 성공: ${lightId}`);
    } catch (error) {
      console.error(`❌ tracks.set 실패: ${lightId}`, error);
    }

    console.log(`✅ addTrack 완료: ${lightId}`, {
      tracksSize: this.tracks.size,
      hasTrack: this.tracks.has(lightId),
      track: this.tracks.get(lightId),
      allKeys: Array.from(this.tracks.keys())
    });

    this._ensureTrackHeaderControls(track);
    this._updateLightTypeBadge(track, lightType || "");

    // === select 이벤트: 조명/클립 생성 ===
    trackNameSelect.addEventListener("change", (e) => {
      console.log("trackNameSelect", e.target.value);
      const newType = e.target.value;

      console.log(`🔄 조명 선택 이벤트: ${lightId} -> ${newType}`);
      console.log(`🔄 tracks 상태 (변경 전):`, {
        tracksSize: this.tracks.size,
        tracksKeys: Array.from(this.tracks.keys()),
        hasTrack: this.tracks.has(lightId)
      });

      // 기존 조명/타겟/obj/클립 삭제
      this.removeExistingLight(lightId);

      if (!newType) {
        track.lightType = null;
        this._updateLightTypeBadge(track, "");
        // 조명 선택 해제 시 스테이지에 아무것도 남기지 않음 (플레이스홀더 obj도 추가하지 않음)
        this.editor.signals.sceneGraphChanged.dispatch();
        return;
      }

      // 조명 타입 설정
      track.lightType = newType;
      this._updateLightTypeBadge(track, newType);
      track.properties = LIGHT_PROPERTIES[newType];

      // === 여기서 조명 객체가 Scene에 추가됨 ===
      this.createAndPlaceLight(lightId, row, col, newType);

      // TimelineData에 조명 트랙 추가 (한 번만)
      if (!track.timelineDataInitialized) {
        this.addLightToTimelineData(lightId, newType);
        track.timelineDataInitialized = true;
        console.log(`✅ TimelineData 초기화 완료: ${lightId}`);
      } else {
        console.log(`ℹ️ TimelineData 이미 초기화됨: ${lightId}`);
      }

      // 클립 생성 (SpotLight와 DirectionalLight는 조명과 타겟을 별도 클립으로 분리)
      if (newType === "SpotLight" || newType === "DirectionalLight") {
        console.log(`🔄 SpotLight/DirectionalLight 클립 생성:`, lightId);
        this.createLightClip(track, lightName, true); // 조명 클립, hasTarget=true → 위쪽 트랙 키프레임 추가 시 light+target 동시 추가
        this.createTargetTrack(lightId, lightName); // 타겟 트랙 추가 (키프레임 추가 버튼은 위쪽 트랙에만 있음)
      } else {
        console.log(`🔄 PointLight 클립 생성:`, lightId);
        this.createLightClip(track, lightName, false); // 조명 클립만
      }

      // 키프레임 추가 버튼 이벤트 바인딩
      this.bindTrackEvents(track);

      // 속성 패널 업데이트
      this.updatePropertyPanelForLightType(newType);

      console.log(`✅ 조명 선택 완료: ${lightId} -> ${newType}`);
      this.selectLightTrack(lightId);
      console.log(`✅ tracks 상태 (변경 후):`, {
        tracksSize: this.tracks.size,
        tracksKeys: Array.from(this.tracks.keys()),
        hasTrack: this.tracks.has(lightId),
        track: this.tracks.get(lightId)
      });
    });
  }

  removeExistingLight(lightId) {
    console.log("=== removeExistingLight 시작 ===", { lightId });

    // 1. TimelineData에서 조명과 타겟 트랙 데이터 삭제 (객체 삭제 전에 먼저 실행)
    this.removeLightFromTimelineData(lightId);

    // 2. 조명 객체 삭제
    const oldLight = this.editor.scene.getObjectByName(lightId);
    if (oldLight) {
      // TransformControls에서 선택 해제
      if (this.editor.selected === oldLight) {
        this.editor.select(null);
      }
      this.editor.scene.remove(oldLight);
      console.log("조명 객체 삭제:", lightId);
    }

    // 3. 타겟 객체 삭제
    const oldTarget = this.editor.scene.getObjectByName(`${lightId}_Target`);
    if (oldTarget) {
      // TransformControls에서 선택 해제
      if (this.editor.selected === oldTarget) {
        this.editor.select(null);
      }
      this.editor.scene.remove(oldTarget);
      console.log("타겟 객체 삭제:", `${lightId}_Target`);
    }

    // 4. 조명 obj 삭제
    const oldObj = this.editor.scene.getObjectByName(`${lightId}_LightObjOnly`);
    if (oldObj) {
      this.editor.scene.remove(oldObj);
      console.log("조명 obj 삭제:", `${lightId}_LightObjOnly`);
    }

    // 5. 조명 트랙 UI 삭제
    const track = this.tracks.get(lightId);
    if (track) {
      // 조명 클립 제거
      if (track.sprite) {
        console.log(`🔄 조명 클립 UI 삭제 시작:`, { lightId, sprite: track.sprite });
        track.trackContent.removeChild(track.sprite);
        track.sprite = null;
        console.log(`✅ 조명 클립 UI 삭제 완료:`, lightId);
      } else {
        console.log(`ℹ️ 삭제할 조명 클립이 없음:`, lightId);
      }

      // TimelineData 초기화 상태 리셋
      track.timelineDataInitialized = false;
      console.log("TimelineData 초기화 상태 리셋:", lightId);

      // 조명 트랙을 tracks에서 제거하지 않음 (UI는 유지, sprite만 null로 설정)
      console.log(`ℹ️ 조명 트랙 UI는 유지:`, lightId);
    }

    // 6. 타겟 트랙 UI 삭제
    const targetTrackId = `${lightId}_Target`;
    const targetTrack = this.tracks.get(targetTrackId);
    if (targetTrack) {
      // 타겟 트랙 요소를 DOM에서 제거
      if (targetTrack.element && targetTrack.element.parentNode) {
        targetTrack.element.parentNode.removeChild(targetTrack.element);
        console.log("타겟 트랙 UI 삭제:", targetTrackId);
      }

      // 타겟 트랙을 tracks에서 제거
      this.tracks.delete(targetTrackId);
      console.log("타겟 트랙 데이터 삭제:", targetTrackId);
    }

    // TimelineData 업데이트
    this.timelineData.dirty = true;
    this.timelineData.precomputeAnimationData();

    this.editor.signals.sceneGraphChanged.dispatch();
    console.log("=== removeExistingLight 완료 ===");
  }

  addLightToTimelineData(lightId, lightType) {
    console.log("=== addLightToTimelineData 시작 ===", { lightId, lightType });

    const properties = LIGHT_PROPERTIES[lightType];

    // 조명 객체의 UUID 가져오기
    const light = this.editor.scene.getObjectByName(lightId);
    if (!light) {
      console.warn("조명 객체를 찾을 수 없습니다:", lightId);
      return;
    }

    console.log("조명 객체 정보:", {
      name: light.name,
      uuid: light.uuid,
      type: light.type
    });

    // 조명 속성에 대해 TimelineData 트랙 생성
    Object.keys(properties).forEach(property => {
      console.log(`조명 속성 트랙 생성: ${lightId} ${property}`);

      // 이미 존재하는 트랙인지 확인
      const existingTrack = this.timelineData.getTrackByUuid(light.uuid, property);
      if (existingTrack) {
        console.log(`트랙이 이미 존재함: ${lightId} ${property}`, existingTrack);
        return; // 이미 존재하면 건너뛰기
      }

      // 직접 TimelineData에 트랙 추가
      if (!this.timelineData.tracks.has(light.uuid)) {
        this.timelineData.tracks.set(light.uuid, new Map());
        console.log(`🔄 UUID 맵 생성: ${light.uuid}`);
      }

      const trackData = new TrackData();
      this.timelineData.tracks.get(light.uuid).set(property, trackData);
      console.log(`✅ 트랙 생성 완료: ${light.uuid} ${property}`);

      // ID 기반 맵에도 추가
      const uniqueTrackId = `${lightId}_${property}`;
      if (!this.timelineData.tracksById.has(uniqueTrackId)) {
        this.timelineData.tracksById.set(uniqueTrackId, new Map());
      }
      this.timelineData.tracksById.get(uniqueTrackId).set(property, trackData);
      console.log(`✅ ID 기반 트랙 추가: ${uniqueTrackId} ${property}`);
    });

    // SpotLight와 DirectionalLight는 타겟 트랙도 생성 (createTargetTrack에서 처리하므로 여기서는 제거)
    if (lightType === "SpotLight" || lightType === "DirectionalLight") {
      console.log(`ℹ️ 타겟 트랙은 createTargetTrack에서 생성됨: ${lightId}_Target`);
    }

    console.log("TimelineData 트랙 생성 완료:", {
      lightId,
      lightType,
      lightUuid: light.uuid,
      properties: Object.keys(properties),
      hasTarget: lightType === "SpotLight" || lightType === "DirectionalLight"
    });

    // 생성된 트랙들의 전체 상태 출력
    console.log("=== 생성된 트랙들의 전체 상태 ===");
    this.logTimelineDataState();

    console.log("=== addLightToTimelineData 완료 ===");

    // 추가 후 TimelineData 상태 확인
    console.log("🔍 addLightToTimelineData 후 TimelineData 상태:");
    console.log("  - tracksCount:", this.timelineData.tracks.size);
    console.log("  - tracksByIdCount:", this.timelineData.tracksById.size);

    // ID 기반 트랙 확인
    const lightTracks = this.timelineData.tracksById.get(lightId);
    if (lightTracks) {
      console.log(`  - ${lightId} 트랙들:`, Array.from(lightTracks.keys()));
    } else {
      console.log(`  - ${lightId} 트랙을 찾을 수 없음`);
    }
  }

  // TimelineData에서 조명과 타겟 트랙 데이터 삭제
  removeLightFromTimelineData(lightId) {
    console.log("=== removeLightFromTimelineData 시작 ===", { lightId });

    // 삭제 전 TimelineData 상태 확인
    console.log("🔍 삭제 전 TimelineData 상태:", {
      tracksSize: this.timelineData.tracks.size,
      tracksByIdSize: this.timelineData.tracksById.size,
      tracksByIdKeys: Array.from(this.timelineData.tracksById.keys())
    });

    // 1. 조명 객체의 UUID 가져오기
    const light = this.editor.scene.getObjectByName(lightId);
    if (light) {
      console.log("조명 객체 UUID:", light.uuid);

      // 2. 조명 속성 트랙들 삭제 (UUID 기반)
      const lightProperties = Object.keys(LIGHT_PROPERTIES.SpotLight); // 모든 조명 타입의 속성
      lightProperties.forEach(property => {
        // UUID 기반 트랙 삭제
        this.timelineData.removeTrack(light.uuid, property);
        console.log(`UUID 기반 조명 속성 트랙 삭제: ${light.uuid} ${property}`);
      });
    }

    // 3. 타겟 객체의 UUID 가져오기
    const targetId = `${lightId}_Target`;
    const target = this.editor.scene.getObjectByName(targetId);
    if (target) {
      console.log("타겟 객체 UUID:", target.uuid);

      // 4. 타겟 속성 트랙들 삭제 (UUID 기반)
      const targetProperties = Object.keys(TARGET_PROPERTIES);
      targetProperties.forEach(property => {
        // UUID 기반 트랙 삭제
        this.timelineData.removeTrack(target.uuid, property);
        console.log(`UUID 기반 타겟 속성 트랙 삭제: ${target.uuid} ${property}`);
      });
    }

    // 5. ID 기반 트랙들도 삭제 (개별 속성별로, 고유 식별자 사용)
    const lightProperties = Object.keys(LIGHT_PROPERTIES.SpotLight);
    lightProperties.forEach(property => {
      const uniqueTrackId = `${lightId}_${property}`;
      const removed = this.timelineData.removeTrackById(uniqueTrackId, property);
      console.log(`ID 기반 조명 트랙 삭제: ${uniqueTrackId} ${property} - ${removed ? '성공' : '실패'}`);
    });

    const targetProperties = Object.keys(TARGET_PROPERTIES);
    targetProperties.forEach(property => {
      const uniqueTargetTrackId = `${targetId}_${property}`;
      const removed = this.timelineData.removeTrackById(uniqueTargetTrackId, property);
      console.log(`ID 기반 타겟 트랙 삭제: ${uniqueTargetTrackId} ${property} - ${removed ? '성공' : '실패'}`);
    });

    // 6. 모든 관련 키프레임 데이터 완전 삭제
    console.log("🔍 모든 관련 키프레임 데이터 완전 삭제 시도");

    // 조명 관련 모든 키프레임 데이터 삭제 (UUID 기반)
    if (light) {
      lightProperties.forEach(property => {
        const trackData = this.timelineData.tracks.get(light.uuid)?.get(property);
        if (trackData) {
          console.log(`🔍 UUID 기반 ${light.uuid} ${property} 키프레임 데이터 발견:`, {
            keyframeCount: trackData.keyframeCount,
            times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
          });

          // 모든 키프레임 삭제
          while (trackData.keyframeCount > 0) {
            trackData.removeKeyframeByIndex(0);
          }
          console.log(`✅ UUID 기반 ${light.uuid} ${property} 모든 키프레임 삭제 완료`);
        }
      });
    }

    // 타겟 관련 모든 키프레임 데이터 삭제 (UUID 기반)
    if (target) {
      targetProperties.forEach(property => {
        const trackData = this.timelineData.tracks.get(target.uuid)?.get(property);
        if (trackData) {
          console.log(`🔍 UUID 기반 ${target.uuid} ${property} 키프레임 데이터 발견:`, {
            keyframeCount: trackData.keyframeCount,
            times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
          });

          // 모든 키프레임 삭제
          while (trackData.keyframeCount > 0) {
            trackData.removeKeyframeByIndex(0);
          }
          console.log(`✅ UUID 기반 ${target.uuid} ${property} 모든 키프레임 삭제 완료`);
        }
      });
    }

    // 조명 관련 모든 키프레임 데이터 삭제 (ID 기반)
    lightProperties.forEach(property => {
      const uniqueTrackId = `${lightId}_${property}`;
      const trackData = this.timelineData.tracksById.get(uniqueTrackId)?.get(property);
      if (trackData) {
        console.log(`🔍 ID 기반 ${uniqueTrackId} ${property} 키프레임 데이터 발견:`, {
          keyframeCount: trackData.keyframeCount,
          times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
        });

        // 모든 키프레임 삭제
        while (trackData.keyframeCount > 0) {
          trackData.removeKeyframeByIndex(0);
        }
        console.log(`✅ ID 기반 ${uniqueTrackId} ${property} 모든 키프레임 삭제 완료`);
      }
    });

    // 타겟 관련 모든 키프레임 데이터 삭제 (ID 기반)
    targetProperties.forEach(property => {
      const uniqueTargetTrackId = `${targetId}_${property}`;
      const trackData = this.timelineData.tracksById.get(uniqueTargetTrackId)?.get(property);
      if (trackData) {
        console.log(`🔍 ID 기반 ${uniqueTargetTrackId} ${property} 키프레임 데이터 발견:`, {
          keyframeCount: trackData.keyframeCount,
          times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
        });

        // 모든 키프레임 삭제
        while (trackData.keyframeCount > 0) {
          trackData.removeKeyframeByIndex(0);
        }
        console.log(`✅ ID 기반 ${uniqueTargetTrackId} ${property} 모든 키프레임 삭제 완료`);
      }
    });

    // 7. precomputedData에서도 완전 삭제
    console.log("🔍 precomputedData에서 관련 데이터 삭제");
    if (light) {
      this.timelineData.precomputedData.delete(light.uuid);
      console.log(`✅ precomputedData에서 조명 UUID 삭제: ${light.uuid}`);
    }
    if (target) {
      this.timelineData.precomputedData.delete(target.uuid);
      console.log(`✅ precomputedData에서 타겟 UUID 삭제: ${target.uuid}`);
    }

    // ID 기반 precomputedData 삭제
    lightProperties.forEach(property => {
      const uniqueTrackId = `${lightId}_${property}`;
      this.timelineData.precomputedData.delete(uniqueTrackId);
      console.log(`✅ precomputedData에서 조명 ID 삭제: ${uniqueTrackId}`);
    });

    targetProperties.forEach(property => {
      const uniqueTargetTrackId = `${targetId}_${property}`;
      this.timelineData.precomputedData.delete(uniqueTargetTrackId);
      console.log(`✅ precomputedData에서 타겟 ID 삭제: ${uniqueTargetTrackId}`);
    });

    // 삭제 후 TimelineData 상태 확인
    console.log("🔍 삭제 후 TimelineData 상태:", {
      tracksSize: this.timelineData.tracks.size,
      tracksByIdSize: this.timelineData.tracksById.size,
      tracksByIdKeys: Array.from(this.timelineData.tracksById.keys()),
      precomputedDataSize: this.timelineData.precomputedData.size
    });

    // TimelineData 업데이트
    this.timelineData.dirty = true;
    this.timelineData.precomputeAnimationData();

    console.log("=== removeLightFromTimelineData 완료 ===");
  }

  ensureKeyframeLayer(sprite) {
    let layer = sprite.querySelector(".keyframe-layer");
    if (layer) return layer;

    layer = document.createElement("div");
    layer.className = "keyframe-layer";
    const content = sprite.querySelector(".sprite-content");
    if (content) {
      content.appendChild(layer);
    } else {
      sprite.appendChild(layer);
    }
    return layer;
  }

  createLightClip(track, lightName, hasTarget = false) {
    console.log(`🔄 createLightClip 시작:`, { track: track.objectId, lightName, hasTarget });

    const sprite = document.createElement("div");
    sprite.className = "animation-sprite light-sprite";
    sprite.dataset.duration = this.options.totalSeconds || 180;
    sprite.style.width = "100%";
    sprite.style.left = "0%";

    // 조명 클립은 파란색으로 표시 (바디 영역)
    sprite.style.background = "transparent";

    const spriteContent = document.createElement("div");
    spriteContent.className = "sprite-content";
    const spriteName = document.createElement("span");
    spriteName.className = "sprite-name";
    spriteName.textContent = lightName;
    const keyframeLayer = document.createElement("div");
    keyframeLayer.className = "keyframe-layer";
    spriteContent.appendChild(spriteName);
    spriteContent.appendChild(keyframeLayer);
    sprite.appendChild(spriteContent);

    track.trackContent.appendChild(sprite);
    track.sprite = sprite;
    track.hasTarget = hasTarget;

    console.log(`✅ createLightClip 완료:`, {
      trackId: track.objectId,
      sprite,
      trackContent: track.trackContent,
      spriteSet: !!track.sprite
    });

    sprite.addEventListener("click", () => {
      // 클립 선택 처리 - 공통 메서드 사용
      this.selectClip(sprite);
    });
  }

  // 타겟 트랙 생성 메서드
  createTargetTrack(lightId, lightName) {
    console.log("=== 타겟 트랙 생성 ===", { lightId, lightName });

    // 기존 트랙 요소 찾기
    const existingTrackElement = this.container.querySelector(`[data-object-id="${lightId}"]`);
    if (!existingTrackElement) {
      console.error("기존 트랙을 찾을 수 없습니다:", lightId);
      return;
    }

    // 타겟 트랙 컨테이너 생성
    const targetTrackElement = document.createElement("div");
    targetTrackElement.className = "motion-tracks target-tracks";
    targetTrackElement.dataset.objectId = `${lightId}_Target`;
    targetTrackElement.dataset.objectName = `${lightName}_Target`;

    // 타겟 트랙 헤더
    const targetTrackHeader = document.createElement("div");
    targetTrackHeader.className = "track-header";

    // 타겟 트랙 정보
    const targetTrackInfo = document.createElement("div");
    targetTrackInfo.className = "track-info";
    const targetTrackName = document.createElement("span");
    targetTrackName.className = "track-name track-name--target";
    targetTrackName.textContent = `${lightName}_Target`;
    targetTrackInfo.appendChild(targetTrackName);

    // 타겟 트랙 컨트롤 (키프레임 추가 버튼은 위쪽 light 트랙에만 있음, 여기서는 빈 컨트롤 또는 숨김)
    const targetTrackControls = document.createElement("div");
    targetTrackControls.className = "track-controls";

    // 타겟 이전/다음 키프레임 버튼 (숨김 유지)
    const targetPrevBtn = document.createElement("button");
    targetPrevBtn.className = "prev-keyframe-btn";
    targetPrevBtn.title = "Previous Target Keyframe";
    targetPrevBtn.innerHTML = '<i class="fa fa-angle-left"></i>';
    targetPrevBtn.style.display = "none";

    const targetNextBtn = document.createElement("button");
    targetNextBtn.className = "next-keyframe-btn";
    targetNextBtn.title = "Next Target Keyframe";
    targetNextBtn.innerHTML = '<i class="fa fa-angle-right"></i>';
    targetNextBtn.style.display = "none";

    targetTrackControls.appendChild(targetPrevBtn);
    targetTrackControls.appendChild(targetNextBtn);
    // 키프레임 추가는 위쪽 light 트랙 버튼으로만 수행 → light + target 동시 추가

    // 타겟 트랙 헤더 조립
    targetTrackHeader.appendChild(targetTrackInfo);
    targetTrackHeader.appendChild(targetTrackControls);

    // 타겟 트랙 콘텐츠
    const targetTrackContent = document.createElement("div");
    targetTrackContent.className = "track-content";

    // 타겟 스프라이트 생성
    const targetSprite = document.createElement("div");
    targetSprite.className = "animation-sprite target-sprite";
    targetSprite.dataset.duration = this.options.totalSeconds || 180;
    targetSprite.style.width = "100%";
    targetSprite.style.left = "0%";
    targetSprite.style.background = "transparent";

    const targetSpriteContent = document.createElement("div");
    targetSpriteContent.className = "sprite-content";
    const targetSpriteName = document.createElement("span");
    targetSpriteName.className = "sprite-name";
    targetSpriteName.textContent = `${lightName}_Target`;
    const targetKeyframeLayer = document.createElement("div");
    targetKeyframeLayer.className = "keyframe-layer";
    targetSpriteContent.appendChild(targetSpriteName);
    targetSpriteContent.appendChild(targetKeyframeLayer);
    targetSprite.appendChild(targetSpriteContent);

    targetTrackContent.appendChild(targetSprite);
    targetTrackElement.appendChild(targetTrackHeader);
    targetTrackElement.appendChild(targetTrackContent);

    // 기존 트랙 요소에 타겟 트랙 추가
    existingTrackElement.appendChild(targetTrackElement);

    // 타겟 트랙 객체로 관리
    const targetTrack = {
      element: targetTrackElement,
      keyframes: new Map(),
      objectId: `${lightId}_Target`,
      objectName: `${lightName}_Target`,
      trackContent: targetTrackContent,
      sprite: targetSprite,
      isTarget: true,
      parentLightId: lightId
    };

    // 타겟 트랙을 tracks에 추가
    this.tracks.set(`${lightId}_Target`, targetTrack);

    // 타겟 트랙 요소에 이벤트 리스너 추가 (키프레임 추가는 위쪽 light 트랙 버튼으로만)
    targetTrackElement.addEventListener("click", (e) => {
      if (
        e.target.classList.contains("prev-keyframe-btn") ||
        e.target.closest(".prev-keyframe-btn")
      ) {
        this.moveToAdjacentKeyframe(targetTrackElement, "prev");
      } else if (
        e.target.classList.contains("next-keyframe-btn") ||
        e.target.closest(".next-keyframe-btn")
      ) {
        this.moveToAdjacentKeyframe(targetTrackElement, "next");
      }
    });

    // 타겟 스프라이트 클릭 이벤트
    targetSprite.addEventListener("click", () => {
      // 타겟 클립 선택 처리 - 공통 메서드 사용
      this.selectClip(targetSprite);
    });

    console.log("타겟 트랙 생성 완료:", targetTrack);

    // 타겟 트랙을 TimelineData에 추가
    const targetObject = this.editor.scene.getObjectByName(`${lightId}_Target`);
    if (targetObject) {
      console.log(`🔄 타겟 TimelineData 트랙 추가: ${lightId}_Target position`, {
        targetObject: targetObject,
        targetUuid: targetObject.uuid,
        targetName: targetObject.name,
        targetType: targetObject.type
      });

      const addTrackResult = this.timelineData.addTrack(targetObject.uuid, "position", `${lightId}_Target`);
      console.log(`🔍 createTargetTrack addTrack 결과:`, {
        result: addTrackResult,
        resultType: typeof addTrackResult,
        hasGetKeyframeCount: addTrackResult ? typeof addTrackResult.getKeyframeCount === 'function' : false
      });

      // 추가 후 확인
      const targetTrackData = this.timelineData.getTrackById(`${lightId}_Target`, "position");
      console.log(`🔍 타겟 TimelineData 트랙 추가 확인: ${lightId}_Target position`, {
        found: !!targetTrackData,
        trackData: targetTrackData,
        tracksByIdSize: this.timelineData.tracksById.size,
        tracksByIdKeys: Array.from(this.timelineData.tracksById.keys())
      });
    } else {
      console.warn(`❌ 타겟 객체를 찾을 수 없음: ${lightId}_Target`);
    }
  }



  createAndPlaceLight(lightId, row, col, lightType = "SpotLight") {
    const scene = this.editor.scene;
    if (scene.getObjectByName(lightId)) return;

    const properties = LIGHT_PROPERTIES[lightType];
    let light;

    switch (lightType) {
      case "PointLight":
        light = new THREE.PointLight(
          properties.color.default,
          properties.intensity.default,
          properties.distance.default,
          properties.decay.default
        );
        break;
      case "DirectionalLight":
        light = new THREE.DirectionalLight(
          properties.color.default,
          properties.intensity.default
        );
        break;
      case "SpotLight":
      default:
        light = new THREE.SpotLight(
          properties.color.default,
          properties.intensity.default,
          properties.distance.default,
          properties.angle.default,
          properties.penumbra.default,
          properties.decay.default
        );
        break;
    }

    light.name = lightId;
    light.userData.isBackground = false;
    light.userData.sceneHide = false;

    const x = -100 + col * 50;
    const y = 130.435;
    const z = -30 + row * 50;
    light.position.set(x, y, z);

    // SpotLight와 DirectionalLight는 타겟 필요
    if (lightType === "SpotLight" || lightType === "DirectionalLight") {
      const target = new THREE.Object3D();
      target.position.set(x, 0, z);
      target.name = `${lightId}_Target`;
      target.isLight = true;
      target.userData.isBackground = false;
      scene.add(target);
      light.target = target;
    }

    scene.add(light);
    this.editor.signals.sceneGraphChanged.dispatch();
  }

  placeLightObjOnly(lightId, row, col) {
    const scene = this.editor.scene;

    const x = -100 + col * 50;
    const y = 137.319;
    const z = -30 + row * 50;
    const loader = new OBJLoader();
    loader.load(
      '../files/light.obj',
      (obj) => {
        obj.position.set(x, y, z);
        obj.rotation.set(172.75, 0, 0);
        obj.name = `${lightId}_LightObjOnly`;
        obj.userData.isBackground = false;
        obj.userData.sceneHide = true;
        scene.add(obj);
      },
      undefined,
      (error) => {
        console.error('light.obj 로드 실패:', error);
      }
    );
  }

  // 동적 속성 패널 생성
  createPropertyPanel() {
    const panel = new UIPanel();
    panel.setClass("property-edit-panel");
    panel.dom.style.display = "none";

    this.propertyRows = {};
    this.propertyPanel = panel;

    return panel;
  }

  updatePropertyPanelForLightType(lightType) {
    console.log("=== updatePropertyPanelForLightType 시작 ===", {
      lightType,
      hasPropertyPanel: !!this.propertyPanel
    });

    if (!lightType || !this.propertyPanel) {
      console.warn("속성 패널 업데이트 실패:", { lightType, hasPropertyPanel: !!this.propertyPanel });
      return;
    }

    // 기존 UI 제거
    this.propertyPanel.clear();
    this.propertyRows = {};

    const properties = LIGHT_PROPERTIES[lightType];
    if (!properties) {
      console.warn("조명 속성을 찾을 수 없음:", lightType);
      return;
    }

    console.log("조명 속성 패널 생성:", {
      lightType,
      properties: Object.keys(properties)
    });

    // 조명 속성 표시
    const separator = new UIRow();
    separator.add(new UIText("=== 조명 속성 ==="));
    this.propertyPanel.add(separator);

    Object.entries(properties).forEach(([propertyName, propertyConfig]) => {
      console.log("속성 행 생성:", { propertyName, propertyConfig });
      const row = this.createPropertyRow(propertyName, propertyConfig);
      this.propertyPanel.add(row);
      this.propertyRows[propertyName] = row;
    });

    this.propertyPanel.dom.style.display = "";
    console.log("속성 패널 표시 완료");
  }

  // 타겟 전용 속성 패널
  updatePropertyPanelForTarget() {
    if (!this.propertyPanel) return;

    // 기존 UI 제거
    this.propertyPanel.clear();
    this.propertyRows = {};

    // 타겟 속성 표시
    const separator = new UIRow();
    separator.add(new UIText("=== 타겟 속성 ==="));
    this.propertyPanel.add(separator);

    Object.entries(TARGET_PROPERTIES).forEach(([propertyName, propertyConfig]) => {
      const row = this.createTargetPropertyRow(propertyName, propertyConfig);
      this.propertyPanel.add(row);
      this.propertyRows[propertyName] = row;
    });

    this.propertyPanel.dom.style.display = "";
  }

  createPropertyRow(propertyName, config) {
    // console.log("=== createPropertyRow 시작 ===", { propertyName, config });

    const row = new UIRow();
    row.add(new UIText(this.formatPropertyName(propertyName)));

    switch (config.type) {
      case 'number':
        // console.log("숫자 입력 생성:", { propertyName, config });
        const numberInput = new UINumber(config.default).setRange(config.range[0], config.range[1]);

        // 마우스 이벤트 리스너 추가
        this.addMouseEventListeners(numberInput.dom, propertyName, () => numberInput.getValue());

        numberInput.onChange(() => {
          // console.log("숫자 입력 변경:", { propertyName, value: numberInput.getValue() });
          this.updateLightProperty(propertyName, numberInput.getValue());
        });
        row.add(numberInput);
        break;

      case 'color':
        // console.log("색상 입력 생성:", { propertyName, config });
        const colorInput = new UIColor("#ffffff");

        // 마우스 이벤트 리스너 추가
        this.addMouseEventListeners(colorInput.dom, propertyName, () => new THREE.Color(colorInput.getValue()));

        colorInput.onChange(() => {
          const color = new THREE.Color(colorInput.getValue());
          // console.log("색상 입력 변경:", { propertyName, value: color });
          this.updateLightProperty(propertyName, color);
        });
        row.add(colorInput);
        break;

      case 'vector3':
        // console.log("벡터 입력 생성:", { propertyName, config });
        const xInput = new UINumber(0);
        const yInput = new UINumber(0);
        const zInput = new UINumber(0);

        // 각 입력 필드에 마우스 이벤트 리스너 추가
        this.addMouseEventListeners(xInput.dom, propertyName, () => xInput.getValue(), 'x');
        this.addMouseEventListeners(yInput.dom, propertyName, () => yInput.getValue(), 'y');
        this.addMouseEventListeners(zInput.dom, propertyName, () => zInput.getValue(), 'z');

        xInput.onChange(() => this.updateLightProperty(propertyName, 'x', xInput.getValue()));
        yInput.onChange(() => this.updateLightProperty(propertyName, 'y', yInput.getValue()));
        zInput.onChange(() => this.updateLightProperty(propertyName, 'z', zInput.getValue()));

        row.add(xInput);
        row.add(yInput);
        row.add(zInput);
        break;
    }

    // console.log("속성 행 생성 완료:", { propertyName, configType: config.type });
    return row;
  }

  // 마우스 이벤트 리스너 추가 메서드
  addMouseEventListeners(element, propertyName, getValueCallback, axis = null) {
    let isDragging = false;

    const handleMouseDown = (e) => {
      isDragging = true;
      this.isDragging = true;
      console.log("마우스 다운 - 드래그 시작:", { propertyName, axis });
    };

    const handleMouseMove = (e) => {
      if (isDragging) {
        // 드래그 중에는 업데이트하지 않음
        console.log("마우스 무브 - 드래그 중:", { propertyName, axis });
      }
    };

    const handleMouseUp = (e) => {
      if (isDragging) {
        isDragging = false;
        this.isDragging = false;
        console.log("마우스 업 - 드래그 종료, 업데이트 실행:", { propertyName, axis });

        // 마우스 업 시 즉시 업데이트
        const value = getValueCallback();
        if (axis) {
          this.updateLightProperty(propertyName, axis, value);
        } else {
          this.updateLightProperty(propertyName, value);
        }
      }
    };

    // 이벤트 리스너 추가
    element.addEventListener('mousedown', handleMouseDown);
    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseup', handleMouseUp);

    // 전역 마우스 이벤트도 추가 (드래그가 요소 밖에서 끝날 경우)
    document.addEventListener('mouseup', handleMouseUp);
  }

  createTargetPropertyRow(propertyName, config) {
    const row = new UIRow();
    row.add(new UIText(this.formatPropertyName(`target_${propertyName}`)));

    switch (config.type) {
      case 'vector3':
        const xInput = new UINumber(0);
        const yInput = new UINumber(0);
        const zInput = new UINumber(0);

        xInput.onChange(() => this.updateTargetProperty(propertyName, 'x', xInput.getValue()));
        yInput.onChange(() => this.updateTargetProperty(propertyName, 'y', yInput.getValue()));
        zInput.onChange(() => this.updateTargetProperty(propertyName, 'z', zInput.getValue()));

        row.add(xInput);
        row.add(yInput);
        row.add(zInput);
        break;
    }

    return row;
  }

  updateLightProperty(propertyName, value, axis = null) {
    console.log("=== updateLightProperty 시작 ===", {
      propertyName,
      value,
      axis
    });
    if (!this.selectedObject) return;

    // 선택된 객체가 타겟인 경우 조명 객체를 찾아서 업데이트
    let light = this.selectedObject;
    let lightId = light.name;

    if (light.name.includes('_Target')) {
      // 타겟이 선택된 경우, 해당하는 조명 객체를 찾음
      const baseLightId = light.name.replace('_Target', '');
      const baseLight = this.editor.scene.getObjectByName(baseLightId);
      if (baseLight) {
        light = baseLight;
        lightId = baseLightId;
      } else {
        console.warn("타겟에 해당하는 조명을 찾을 수 없습니다:", baseLightId);
        return;
      }
    }

    if (axis) {
      // vector3 속성의 개별 축 업데이트
      if (propertyName === 'position') {
        light.position[axis] = value;
      } else if (propertyName === 'target' && light.target) {
        light.target.position[axis] = value;
      }
    } else {
      // 일반 속성 업데이트
      switch (propertyName) {
        case 'intensity': // 강도 속성
          light.intensity = value;
          break;
        case 'color': // 색상 속성
          light.color.copy(value);
          break;
        case 'distance': // 거리 속성
          light.distance = value;
          break;
        case 'angle': // 각도 속성
          light.angle = value;
          break;
        case 'penumbra': // 펜유브라 속성
          light.penumbra = value;
          break;
        case 'decay': // 감쇠 속성
          light.decay = value;
          break;
        case 'position': // 위치 속성
          light.position.copy(value);
          break;
        case 'target':
          if (light.target) {
            light.target.position.copy(value);
          }
          break;
      }
    }

    // 선택된 키프레임이 있으면 해당 키프레임 값 업데이트 (scene.userData에서 확인)
    const selectedKeyframeData = this.editor.scene.userData?.lightTimeline?.selectedKeyframe;

    // 선택된 키프레임이 있는지 확인
    let isSelectedKeyframe = false;
    if (selectedKeyframeData) {
      if (selectedKeyframeData.lightId.includes('_Target')) {
        // 타겟 키프레임인 경우 - 원래 선택된 객체의 이름과 비교
        isSelectedKeyframe = (selectedKeyframeData.lightId === this.selectedObject.name);
      } else {
        // 일반 조명 키프레임인 경우 - base light ID로 매칭
        const selectedBaseLightId = selectedKeyframeData.lightId.split('_').slice(0, 2).join('_'); // 'light_0_intensity' -> 'light_0'
        isSelectedKeyframe = (selectedBaseLightId === lightId);
      }
    }

    if (isSelectedKeyframe) {
      console.log("선택된 키프레임이 있음 - 속성 업데이트:", {
        lightId,
        propertyName,
        value,
        selectedKeyframe: selectedKeyframeData,
        isTarget: this.selectedObject.name.includes('_Target')
      });

      if (this.selectedObject.name.includes('_Target')) {
        // 타겟 키프레임인 경우 - position 속성만 업데이트
        const targetId = this.selectedObject.name;
        const trackData = this.timelineData.getTrackById(targetId, 'position');

        if (trackData) {
          const vectorValue = this.selectedObject.position.clone();
          const selectedKeyframeIndex = selectedKeyframeData.index;

          if (selectedKeyframeIndex !== undefined) {
            const success = trackData.updateKeyframeValue(selectedKeyframeIndex, vectorValue);
            if (success) {
              console.log(`✅ 타겟 키프레임 업데이트 성공: ${targetId} position at index ${selectedKeyframeIndex}`);
              this.timelineData.dirty = true;
            } else {
              console.warn(`❌ 타겟 키프레임 업데이트 실패: ${targetId} position at index ${selectedKeyframeIndex}`);
            }
          }
        } else {
          console.warn(`타겟 트랙을 찾을 수 없습니다: ${targetId}`);
        }
      } else {
        // 일반 조명 키프레임인 경우 - 선택된 키프레임의 모든 속성을 업데이트
        console.log("일반 조명 키프레임 - 모든 속성 업데이트:", { lightId, propertyName, value });

        // 조명의 모든 속성을 업데이트
        const properties = ['intensity', 'color', 'distance', 'angle', 'penumbra', 'decay'];

        properties.forEach(prop => {
          const uniqueTrackId = `${lightId}_${prop}`;
          let trackData = this.timelineData.getTrackById(uniqueTrackId, prop);
          if (!trackData) {
            trackData = this.timelineData.getTrackByUuid(light.uuid, prop);
          }

          if (trackData) {
            // 현재 조명 객체에서 속성 값 가져오기
            let propValue;
            switch (prop) {
              case 'intensity':
                propValue = new THREE.Vector3(light.intensity, 0, 0);
                break;
              case 'color':
                propValue = new THREE.Vector3(light.color.r, light.color.g, light.color.b);
                break;
              case 'distance':
                propValue = new THREE.Vector3(light.distance, 0, 0);
                break;
              case 'angle':
                propValue = new THREE.Vector3(light.angle, 0, 0);
                break;
              case 'penumbra':
                propValue = new THREE.Vector3(light.penumbra, 0, 0);
                break;
              case 'decay':
                propValue = new THREE.Vector3(light.decay, 0, 0);
                break;
              default:
                propValue = new THREE.Vector3(0, 0, 0);
            }

            // 선택된 키프레임의 인덱스 찾기
            const selectedKeyframeIndex = selectedKeyframeData.index;
            if (selectedKeyframeIndex !== undefined) {
              // 선택된 키프레임의 값 업데이트
              const success = trackData.updateKeyframeValue(selectedKeyframeIndex, propValue);
              if (success) {
                console.log(`✅ 키프레임 업데이트 성공: ${lightId} ${prop} at index ${selectedKeyframeIndex}`);
              } else {
                console.warn(`❌ 키프레임 업데이트 실패: ${lightId} ${prop} at index ${selectedKeyframeIndex}`);
              }
            }
          } else {
            console.warn(`트랙을 찾을 수 없습니다: ${lightId} ${prop}`);
          }
        });

        this.timelineData.dirty = true;
      }

      // TimelineData 상태 업데이트 (성능 최적화 - 필요할 때만 호출)
      if (this.timelineData.dirty) {
        this.timelineData.precomputeAnimationData();
        this.timelineData.dirty = false;
        // UI 업데이트는 필요할 때만
        this.updateUI();
      }

    } else {
      // 선택된 키프레임이 없으면 새 키프레임 추가
      this.addKeyframeForProperty(lightId, propertyName, this.currentTime, this.getPropertyValue(light, propertyName));
    }

    // objectChanged 시그널은 제거 - 무한 루프 방지
    // if (this.editor.signals?.objectChanged) {
    //   this.editor.signals.objectChanged.dispatch(light);
    // }
  }

  // 디바운싱된 키프레임 업데이트 메서드
  debouncedUpdateKeyframe(propertyName, newValue) {
    // 기존 타임아웃이 있으면 취소
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
    }

    // 새로운 타임아웃 설정 (300ms 후에 업데이트)
    this.updateTimeout = setTimeout(() => {
      console.log("디바운싱된 키프레임 업데이트 실행:", { propertyName, newValue });
      this.updateLightProperty(propertyName, newValue);
      this.updateTimeout = null;
    }, 300);
  }

  updateTargetProperty(propertyName, axis, value) {
    if (!this.selectedObject) return;

    // 선택된 객체가 타겟인 경우 직접 업데이트, 조명인 경우 target을 찾아서 업데이트
    let light = this.selectedObject;
    let lightId = light.name;
    let targetId = `${lightId}_Target`;

    if (light.name.includes('_Target')) {
      // 타겟이 선택된 경우 직접 업데이트
      if (axis) {
        light.position[axis] = value;
      }

      // 선택된 키프레임이 있으면 해당 키프레임 값 업데이트 (scene.userData에서 확인)
      const selectedKeyframeData = this.editor.scene.userData?.lightTimeline?.selectedKeyframe;
      if (selectedKeyframeData && selectedKeyframeData.property === propertyName && selectedKeyframeData.lightId === light.name) {
        console.log("선택된 타겟 키프레임 값 업데이트:", {
          targetId: light.name,
          propertyName,
          value,
          selectedKeyframe: selectedKeyframeData
        });
        this.updateSelectedKeyframeValue(light.name, propertyName, light.position.clone());
      } else {
        // 키프레임 추가 (UI는 이벤트 시스템에서 자동으로 생성됨)
        this.addKeyframeForProperty(light.name, propertyName, this.currentTime, light.position.clone());
      }
    } else {
      // 조명이 선택된 경우 target을 찾아서 업데이트
      if (!light.target) {
        console.warn("조명에 타겟이 없습니다:", light.name);
        return;
      }

      if (axis) {
        light.target.position[axis] = value;
      }

      // 선택된 키프레임이 있으면 해당 키프레임 값 업데이트 (scene.userData에서 확인)
      const selectedKeyframeData = this.editor.scene.userData?.lightTimeline?.selectedKeyframe;
      if (selectedKeyframeData && selectedKeyframeData.property === propertyName && selectedKeyframeData.lightId === targetId) {
        console.log("선택된 타겟 키프레임 값 업데이트:", {
          targetId,
          propertyName,
          value,
          selectedKeyframe: selectedKeyframeData
        });
        this.updateSelectedKeyframeValue(targetId, propertyName, light.target.position.clone());
      } else {
        // 키프레임 추가 (UI는 이벤트 시스템에서 자동으로 생성됨)
        this.addKeyframeForProperty(targetId, propertyName, this.currentTime, light.target.position.clone());
      }
    }

    // objectChanged 시그널은 제거 - 무한 루프 방지
    // if (this.editor.signals?.objectChanged) {
    //   this.editor.signals.objectChanged.dispatch(light);
    // }
  }

  // 모든 속성을 포함하는 키프레임 추가 메서드
  addKeyframeForAllProperties(lightId, time, allProperties) {
    console.log("=== addKeyframeForAllProperties 시작 ===", {
      lightId,
      time,
      allProperties
    });

    // 조명 객체 존재 확인
    const object = this.editor.scene.getObjectByName(lightId);
    if (!object) {
      console.log(`❌ 조명 객체를 찾을 수 없음: ${lightId}`);
      return;
    }

    let hasAddedKeyframe = false;

    // 각 속성에 대해 키프레임 추가
    Object.entries(allProperties).forEach(([propertyName, value]) => {
      // UI 트랙 ID를 고유 식별자로 사용하여 트랙 찾기
      const uniqueTrackId = `${lightId}_${propertyName}`;
      console.log(`🔍 트랙 찾기: ${uniqueTrackId} ${propertyName}`);

      let trackData = this.timelineData.getTrackById(uniqueTrackId, propertyName);
      console.log(`  ID 기반 트랙 찾기 결과:`, trackData ? "찾음" : "없음");

      // ID로 찾지 못한 경우 UUID로도 시도
      if (!trackData) {
        trackData = this.timelineData.getTrackByUuid(object.uuid, propertyName);
        console.log(`  UUID 기반 트랙 찾기 결과:`, trackData ? "찾음" : "없음");

        if (trackData) {
          console.log(`  🔄 UUID 기반 트랙을 ID 기반으로 복사: ${uniqueTrackId}`);

          // 기존 UUID 기반 트랙을 복사하여 새 트랙 생성
          const existingTrackData = trackData;
          const newTrackData = new TrackData();

          // 기존 키프레임들을 새 트랙으로 복사
          for (let i = 0; i < existingTrackData.keyframeCount; i++) {
            const time = existingTrackData.times[i];
            const value = new THREE.Vector3(
              existingTrackData.values[i * 3],
              existingTrackData.values[i * 3 + 1],
              existingTrackData.values[i * 3 + 2]
            );
            const interpolation = existingTrackData.interpolations[i];
            newTrackData.addKeyframe(time, value, interpolation);
          }

          // 새 트랙을 ID 기반 맵에 직접 추가
          if (!this.timelineData.tracksById.has(uniqueTrackId)) {
            this.timelineData.tracksById.set(uniqueTrackId, new Map());
          }
          this.timelineData.tracksById.get(uniqueTrackId).set(propertyName, newTrackData);

          trackData = newTrackData;
          console.log(`  새로 생성된 트랙을 직접 사용:`, newTrackData);
        }
      }

      if (trackData) {
        // 값 타입에 따라 Vector3로 변환
        let vectorValue;
        if (typeof value === 'number') {
          vectorValue = new THREE.Vector3(value, 0, 0);
        } else if (value instanceof THREE.Color) {
          vectorValue = new THREE.Vector3(value.r, value.g, value.b);
        } else if (value instanceof THREE.Vector3) {
          vectorValue = value.clone();
        } else {
          console.warn('지원하지 않는 값 타입:', typeof value, value);
          return;
        }

        // TimelineData의 addKeyframe을 사용
        const success = trackData.addKeyframe(time, vectorValue);
        if (success) {
          hasAddedKeyframe = true;
          console.log(`✅ 키프레임 추가 성공: ${lightId} ${propertyName} at ${time}`);

          // TimelineData의 dirty 플래그만 설정하고 precomputeAnimationData는 호출하지 않음
          this.timelineData.dirty = true;
          console.log(`🔧 TimelineData dirty 플래그 설정: ${lightId} ${propertyName}`);
        } else {
          console.warn(`❌ 키프레임 추가 실패: ${lightId} ${propertyName} at ${time}`);
        }
      } else {
        console.warn(`트랙을 찾을 수 없습니다: ${lightId} ${propertyName}`);
      }
    });

    // 하나의 키프레임 UI만 추가 (첫 번째 속성 기준)
    if (hasAddedKeyframe) {
      const firstProperty = Object.keys(allProperties)[0];
      console.log(`✅ 키프레임 UI 추가 시도: ${lightId} ${firstProperty} at ${time}`);
      this.addKeyframeUI(lightId, firstProperty, time);

      // 키프레임 추가 후 자동으로 선택
      setTimeout(() => {
        const compositeId = `${lightId}_${firstProperty}`;
        const keyframeElement = document.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${firstProperty}"][data-light-id="${compositeId}"]`);
        if (keyframeElement) {
          console.log(`🎯 addKeyframeForAllProperties에서 새로 추가된 키프레임 자동 선택: ${lightId} ${firstProperty} at ${time}`);
          // 키프레임 클릭 이벤트와 동일한 방식으로 timelineDataLightId 생성
          let timelineDataLightId;
          if (lightId.includes('_Target')) {
            // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
            timelineDataLightId = lightId;
          } else {
            // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
            timelineDataLightId = `${lightId}_${firstProperty}`;
          }
          this.selectKeyframe(timelineDataLightId, time, keyframeElement, firstProperty);
        } else {
          console.warn(`❌ addKeyframeForAllProperties에서 새로 추가된 키프레임 요소를 찾을 수 없음: ${lightId} ${firstProperty} at ${time}`);
        }
      }, 100); // UI 생성 후 약간의 지연을 두고 선택
    } else {
      console.warn(`❌ 키프레임 추가 실패로 UI 생성 안함: ${lightId}`);
    }

    console.log("=== addKeyframeForAllProperties 완료 ===");

    // 키프레임 추가 후 TimelineData 상태 확인
    console.log(`🔍 키프레임 추가 후 TimelineData 상태:`, {
      lightId,
      tracksCount: this.timelineData.tracks.size,
      tracksByIdCount: this.timelineData.tracksById.size,
      lightTracks: this.timelineData.tracksById.get(lightId) ?
        Array.from(this.timelineData.tracksById.get(lightId).keys()) : []
    });
  }

  // 키프레임 이벤트 연결 상태 확인 함수
  checkKeyframeEventConnections() {
    console.log("🔍 키프레임 이벤트 연결 상태 확인 시작");

    const allKeyframes = this.container.querySelectorAll('.keyframe');
    console.log(`총 키프레임 개수: ${allKeyframes.length}`);

    allKeyframes.forEach((keyframe, index) => {
      const hasClickEvent = keyframe.onclick || keyframe._clickListener;
      const hasDragEvent = keyframe._dragListener;

      console.log(`키프레임 ${index + 1}:`, {
        lightId: keyframe.dataset.lightId,
        property: keyframe.dataset.property,
        time: keyframe.dataset.time,
        hasClickEvent: !!hasClickEvent,
        hasDragEvent: !!hasDragEvent,
        classes: keyframe.className
      });
    });
  }

  // 브라우저 콘솔에서 직접 호출할 수 있는 디버깅 함수들
  debugKeyframes() {
    console.log("🔍 === 키프레임 디버깅 시작 ===");
    this.checkKeyframeEventConnections();

    // 첫 번째 키프레임 클릭 테스트
    const firstKeyframe = this.container.querySelector('.keyframe');
    if (firstKeyframe) {
      console.log("🔍 첫 번째 키프레임 클릭 테스트:", firstKeyframe);
      console.log("클릭 이벤트 수동 실행:");
      firstKeyframe.click();
    }
  }

  // TimelineData 복원 테스트 함수
  testTimelineDataRestoration() {
    console.log("🔧 === TimelineData 복원 테스트 시작 ===");

    // scene.userData에서 timelineData 확인
    const timelineData = this.editor.scene.userData.lightTimeline;
    if (!timelineData) {
      console.error("❌ scene.userData.lightTimeline이 없습니다!");
      return;
    }

    console.log("저장된 timelineData:", timelineData);
    console.log("lightTracks:", timelineData.lightTracks);

    // 조명 객체 상태 확인
    console.log("현재 씬의 조명 객체들:");
    this.editor.scene.traverse((object) => {
      if (object.isLight) {
        console.log(`  조명: ${object.name} (${object.type}) UUID: ${object.uuid}`);
      }
    });

    // 첫 번째 조명에 대해 TimelineData 복원 테스트
    const lightNames = Object.keys(timelineData.lightTracks || {});
    if (lightNames.length > 0) {
      const firstLightName = lightNames[0];
      console.log(`첫 번째 조명 TimelineData 복원 테스트: ${firstLightName}`);
      this.restoreKeyframeDataToTimelineData(firstLightName, timelineData);
    } else {
      console.warn("❌ 복원할 조명이 없습니다!");
    }

    // 복원 후 TimelineData 상태 확인
    console.log("복원 후 TimelineData 상태:");
    this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
      console.log(`객체 ${objectUuid}:`);
      objectTracks.forEach((trackData, property) => {
        console.log(`  ${property}: ${trackData.getKeyframeCount()}개 키프레임`);
      });
    });

    // MotionTimeline과 비교
    console.log("MotionTimeline 상태 확인:");
    if (window.motionTimeline && window.motionTimeline.timelineData) {
      window.motionTimeline.timelineData.tracks.forEach((objectTracks, objectUuid) => {
        console.log(`MotionTimeline 객체 ${objectUuid}:`);
        objectTracks.forEach((trackData, property) => {
          console.log(`  ${property}: ${trackData.getKeyframeCount()}개 키프레임`);
        });
      });
    }
  }

  // 애니메이션 테스트 함수
  testAnimationWithLoadedKeyframes() {
    console.log("🎬 === 로드된 키프레임 애니메이션 테스트 시작 ===");

    // TimelineData 상태 확인
    console.log("TimelineData 상태:", {
      tracksCount: this.timelineData.tracks.size,
      tracksByIdCount: this.timelineData.tracksById.size,
      dirty: this.timelineData.dirty,
      maxTime: this.timelineData.maxTime
    });

    // 모든 트랙의 키프레임 개수 확인
    this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
      console.log(`객체 ${objectUuid}:`);
      objectTracks.forEach((trackData, property) => {
        console.log(`  ${property}: ${trackData.getKeyframeCount()}개 키프레임`);
        if (trackData.getKeyframeCount() > 0) {
          console.log(`    시간: [${trackData.times.slice(0, trackData.keyframeCount).join(', ')}]`);
        }
      });
    });

    // 현재 시간에서 키프레임 값 확인
    const currentTime = this.currentTime || 0;
    console.log(`현재 시간 ${currentTime}에서의 키프레임 값:`);

    this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
      const object = this.editor.scene.getObjectByUuid(objectUuid);
      if (object) {
        console.log(`조명 ${object.name}:`);
        objectTracks.forEach((trackData, property) => {
          if (trackData.getKeyframeCount() > 0) {
            const value = trackData.getValueAtTime(currentTime);
            console.log(`  ${property}: ${value}`);
          }
        });
      }
    });

    // 애니메이션 재생 테스트
    console.log("애니메이션 재생 테스트 시작...");
    this.play();

    // 3초 후 정지
    setTimeout(() => {
      this.pause();
      console.log("애니메이션 테스트 완료");
    }, 3000);
  }

  // 키프레임 이벤트 수동 재연결 함수
  reconnectKeyframeEvents() {
    console.log("🔧 키프레임 이벤트 수동 재연결 시작");

    const allKeyframes = this.container.querySelectorAll('.keyframe');
    allKeyframes.forEach((keyframe) => {
      const lightId = keyframe.dataset.lightId;
      const property = keyframe.dataset.property;
      const time = parseFloat(keyframe.dataset.time);

      // 클릭 이벤트 재연결
      if (!keyframe._clickListener) {
        console.log(`🔧 클릭 이벤트 재연결: ${lightId} ${property} at ${time}`);
        const clickHandler = (e) => {
          e.stopPropagation();

          let timelineDataLightId;
          if (lightId.includes('_Target')) {
            timelineDataLightId = lightId;
          } else {
            timelineDataLightId = `${lightId}_${property}`;
          }

          this.selectKeyframe(timelineDataLightId, time, keyframe, property);
        };

        keyframe.addEventListener("click", clickHandler);
        keyframe._clickListener = clickHandler;
      }

      // 드래그 이벤트 재연결
      if (!keyframe._dragListener) {
        console.log(`🔧 드래그 이벤트 재연결: ${lightId} ${property} at ${time}`);
        const track = this.tracks.get(lightId);
        if (track) {
          this.makeKeyframeDraggable(keyframe, track, time, property);
        }
      }
    });

    console.log("🔧 키프레임 이벤트 재연결 완료");
  }

  addKeyframeForProperty(lightId, propertyName, time, value) {
    console.log("=== addKeyframeForProperty 시작 ===", {
      lightId,
      propertyName,
      time,
      value,
      valueType: typeof value
    });

    // TimelineData 전체 상태 확인
    console.log("🔍 TimelineData 현재 상태:", {
      tracksCount: this.timelineData.tracks.size,
      tracksByIdCount: this.timelineData.tracksById.size,
      maxTime: this.timelineData.maxTime
    });

    // 조명 객체 존재 확인
    const object = this.editor.scene.getObjectByName(lightId);
    console.log(`🔍 조명 객체 확인: ${lightId}`, {
      exists: !!object,
      uuid: object?.uuid,
      type: object?.type
    });

    // Spot/Directional과 같이 타겟이 있는 조명에서 position은 타겟 트랙에 저장되도록 리다이렉트
    if (propertyName === 'position' && !lightId.includes('_Target') && object && object.target) {
      const redirectedId = `${lightId}_Target`;
      console.log(`↪️ position 키프레임을 타겟 트랙으로 리다이렉트: ${lightId} -> ${redirectedId}`);
      lightId = redirectedId;
    }

    // ID 기반으로 트랙 찾기
    let trackData = this.timelineData.getTrackById(lightId, propertyName);
    console.log(`🔍 ID 기반 트랙 찾기 결과: ${lightId} ${propertyName}`, {
      found: !!trackData,
      trackData: trackData,
      keyframeCount: trackData ? trackData.getKeyframeCount() : 0
    });

    // ID로 찾지 못한 경우 UUID로도 시도
    if (!trackData) {
      const object = this.editor.scene.getObjectByName(lightId);
      if (object) {
        trackData = this.timelineData.getTrackByUuid(object.uuid, propertyName);
        console.log(`🔍 UUID 기반 트랙 찾기 시도: ${object.uuid} ${propertyName}`, {
          found: !!trackData,
          trackData: trackData,
          keyframeCount: trackData ? trackData.getKeyframeCount() : 0
        });

        // UUID로 찾은 경우, ID 기반 트랙도 생성해주기
        if (trackData) {
          console.log(`🔄 UUID 기반 트랙을 ID 기반으로도 생성: ${lightId} ${propertyName}`);
          this.timelineData.addTrack(object.uuid, propertyName, lightId);

          // 생성 후 다시 확인
          trackData = this.timelineData.getTrackById(lightId, propertyName);
          console.log(`🔍 ID 기반 트랙 생성 후 확인: ${lightId} ${propertyName}`, {
            found: !!trackData,
            trackData: trackData
          });
        }
      } else {
        console.log(`❌ 조명 객체를 찾을 수 없음: ${lightId}`);
      }
    }

    // ID-기반 트랙과 UUID-기반 트랙이 다른 인스턴스일 수 있으므로 동기화(특히 타겟 position)
    const sceneObj = this.editor.scene.getObjectByName(lightId);
    if (sceneObj) {
      const uuidTrack = this.timelineData.getTrackByUuid(sceneObj.uuid, propertyName);
      if (uuidTrack && trackData && uuidTrack !== trackData) {
        console.log(`🔄 ID/UUID 트랙 불일치 발견. 동기화 시도: ${lightId} ${propertyName}`);
        // UUID 트랙이 비어 있고 ID 트랙에 데이터가 있으면 병합
        if (uuidTrack.getKeyframeCount && trackData.getKeyframeCount && uuidTrack.getKeyframeCount() === 0 && trackData.getKeyframeCount() > 0) {
          for (let i = 0; i < trackData.getKeyframeCount(); i++) {
            const t = trackData.times[i];
            const v = new THREE.Vector3(
              trackData.values[i * 3],
              trackData.values[i * 3 + 1],
              trackData.values[i * 3 + 2]
            );
            const interp = trackData.interpolations[i];
            uuidTrack.addKeyframe(t, v, interp);
          }
          console.log(`✅ UUID 트랙으로 키프레임 병합 완료: count=${uuidTrack.getKeyframeCount()}`);
        }
        // ID 매핑을 UUID 트랙으로 교체
        if (!this.timelineData.tracksById.has(lightId)) {
          this.timelineData.tracksById.set(lightId, new Map());
        }
        this.timelineData.tracksById.get(lightId).set(propertyName, uuidTrack);
        trackData = uuidTrack;
      }
    }

    if (trackData) {
      console.log("트랙 데이터 찾음:", {
        trackData,
        keyframeCount: trackData.getKeyframeCount(),
        times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
        values: Array.from(trackData.values.slice(0, trackData.keyframeCount * 3))
      });

      // 값 타입에 따라 Vector3로 변환
      let vectorValue;
      if (typeof value === 'number') {
        // intensity, distance, angle, penumbra, decay 등의 숫자 값
        vectorValue = new THREE.Vector3(value, 0, 0);
        console.log("숫자 값을 Vector3로 변환:", { original: value, converted: vectorValue });
      } else if (value instanceof THREE.Color) {
        // color 값
        vectorValue = new THREE.Vector3(value.r, value.g, value.b);
        console.log("Color 값을 Vector3로 변환:", { original: value, converted: vectorValue });
      } else if (value instanceof THREE.Vector3) {
        // position, target 등의 Vector3 값
        vectorValue = value.clone();
        console.log("Vector3 값 복사:", { original: value, converted: vectorValue });
      } else {
        console.warn('지원하지 않는 값 타입:', typeof value, value);
        return;
      }

      // TimelineData의 addKeyframe을 사용하여 이벤트 시스템 활용
      const success = trackData.addKeyframe(time, vectorValue);
      if (success) {
        console.log(`✅ 키프레임 추가 성공: ${lightId} ${propertyName} at ${time}`);

        // TimelineData의 dirty 플래그만 설정하고 precomputeAnimationData는 호출하지 않음
        this.timelineData.dirty = true;
        console.log(`🔧 TimelineData dirty 플래그 설정: ${lightId} ${propertyName}`);

        // 키프레임 UI 생성
        console.log(`🎨 키프레임 UI 생성 시도: ${lightId} ${propertyName} at ${time}`);
        this.addKeyframeUI(lightId, propertyName, time);

        // 키프레임 추가 후 자동으로 선택
        setTimeout(() => {
          let keyframeElement;
          if (lightId.includes('_Target')) {
            keyframeElement = document.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${propertyName}"][data-light-id="${lightId}"]`);
          } else {
            const compositeId = `${lightId}_${propertyName}`;
            keyframeElement = document.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${propertyName}"][data-light-id="${compositeId}"]`);
          }
          if (keyframeElement) {
            console.log(`🎯 새로 추가된 키프레임 자동 선택: ${lightId} ${propertyName} at ${time}`);
            // 키프레임 클릭 이벤트와 동일한 방식으로 timelineDataLightId 생성
            let timelineDataLightId;
            if (lightId.includes('_Target')) {
              // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
              timelineDataLightId = lightId;
            } else {
              // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
              timelineDataLightId = `${lightId}_${propertyName}`;
            }
            this.selectKeyframe(timelineDataLightId, time, keyframeElement, propertyName);
          } else {
            console.warn(`❌ 새로 추가된 키프레임 요소를 찾을 수 없음: ${lightId} ${propertyName} at ${time}`);
          }
        }, 100); // UI 생성 후 약간의 지연을 두고 선택

        // 추가된 후 트랙 데이터 상태 출력
        console.log("📊 키프레임 추가 후 트랙 상태:", {
          lightId,
          propertyName,
          keyframeCount: trackData.getKeyframeCount(),
          times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
          values: Array.from(trackData.values.slice(0, trackData.keyframeCount * 3)),
          interpolations: Array.from(trackData.interpolations.slice(0, trackData.keyframeCount))
        });

        // TimelineData 전체 상태 업데이트 확인
        console.log("📊 TimelineData 업데이트 후 상태:", {
          tracksCount: this.timelineData.tracks.size,
          tracksByIdCount: this.timelineData.tracksById.size,
          maxTime: this.timelineData.maxTime
        });

        // ID 기반 트랙 재확인
        const updatedTrackData = this.timelineData.getTrackById(lightId, propertyName);
        console.log(`🔍 키프레임 추가 후 ID 기반 트랙 재확인: ${lightId} ${propertyName}`, {
          found: !!updatedTrackData,
          keyframeCount: updatedTrackData ? updatedTrackData.getKeyframeCount() : 0
        });

        // 전체 TimelineData 상태 출력
        this.logTimelineDataState();
      } else {
        console.warn(`❌ 키프레임 추가 실패: ${lightId} ${propertyName} at ${time}`);
      }
    } else {
      console.warn(`트랙을 찾을 수 없습니다: ${lightId} ${propertyName}`);
      console.log("사용 가능한 트랙들:", this.timelineData.getAllTracksById());
    }

    console.log("=== addKeyframeForProperty 완료 ===");
  }

  addKeyframeUI(lightId, propertyName, time, index = null) {
    console.log(`🔍 addKeyframeUI 시작: ${lightId} ${propertyName} at ${time}`);
    const actualKeys = Array.from(this.tracks.keys()).map(key => ({ key, type: typeof key }));
    console.log(`🔍 tracks 맵 상태:`, {
      tracksSize: this.tracks.size,
      tracksKeys: Array.from(this.tracks.keys()),
      lightId,
      hasTrack: this.tracks.has(lightId),
      actualKeys,
      tracksEntries: Array.from(this.tracks.entries()).map(([key, value]) => ({
        key,
        objectId: value.objectId,
        lightType: value.lightType,
        hasSprite: !!value.sprite
      }))
    });

    // 실제 키와 lightId 비교
    console.log(`🔍 키 비교:`, {
      lightId,
      lightIdType: typeof lightId,
      actualKeys: actualKeys.map(k => k.key),
      actualKeysDetail: actualKeys,
      matches: actualKeys.some(k => k.key === lightId)
    });

    // tracks 맵의 모든 키-값 쌍 출력
    const entries = Array.from(this.tracks.entries()).map(([key, value]) => ({
      key,
      keyType: typeof key,
      value: value ? { objectId: value.objectId, objectName: value.objectName } : null
    }));
    console.log(`🔍 tracks 맵 전체 내용:`, {
      size: this.tracks.size,
      entries
    });

    // 첫 번째 키 상세 출력
    if (entries.length > 0) {
      console.log(`🔍 첫 번째 키 상세:`, {
        key: entries[0].key,
        keyType: entries[0].keyType,
        keyStringified: JSON.stringify(entries[0].key),
        lightIdStringified: JSON.stringify(lightId),
        strictEqual: entries[0].key === lightId,
        looseEqual: entries[0].key == lightId
      });
    }

    const track = this.tracks.get(lightId);
    if (!track) {
      console.warn(`❌ 트랙을 찾을 수 없음: ${lightId}`);
      console.error(`🔍 tracks 맵 전체 상태:`, {
        size: this.tracks.size,
        keys: Array.from(this.tracks.keys()),
        lightId,
        hasTrack: this.tracks.has(lightId)
      });
      return;
    }
    console.log(`✅ 트랙 찾음:`, track);

    // 타겟인 경우 타겟 스프라이트, 조명인 경우 조명 스프라이트 사용
    let targetSprite = null;
    if (lightId.includes('_Target')) {
      // 타겟 키프레임인 경우 - 타겟 트랙의 스프라이트에 표시
      const targetTrack = this.tracks.get(lightId);
      if (targetTrack && targetTrack.sprite) {
        targetSprite = targetTrack.sprite;
        console.log(`🎯 타겟 스프라이트:`, targetSprite);
      } else {
        console.warn(`❌ 타겟 트랙을 찾을 수 없음: ${lightId}`);
        console.log(`🔍 사용 가능한 트랙들:`, Array.from(this.tracks.keys()));
        return;
      }
    } else {
      // 조명 키프레임인 경우 - 조명 스프라이트에 표시
      targetSprite = track.sprite;
      console.log(`💡 조명 스프라이트:`, targetSprite);
    }

    if (!targetSprite) {
      console.warn(`❌ 스프라이트를 찾을 수 없음: ${lightId}`);
      console.log(`트랙 객체:`, track);

      // 스프라이트가 없으면 동적으로 생성
      console.log(`🔄 스프라이트 동적 생성 시도: ${lightId}`);
      this.createLightClip(track, track.objectName, false);
      targetSprite = track.sprite;

      if (!targetSprite) {
        console.error(`❌ 스프라이트 생성 실패: ${lightId}`);
        return;
      }
      console.log(`✅ 스프라이트 동적 생성 성공:`, targetSprite);
    }

    // 같은 시간에 키프레임이 이미 존재하는지 확인
    const existingKeyframeAtTime = targetSprite.querySelector(`[data-time="${time.toFixed(2)}"]`);
    if (existingKeyframeAtTime) {
      console.log("같은 시간에 키프레임이 이미 존재합니다:", { lightId, propertyName, time });
      return existingKeyframeAtTime; // Return existing keyframe, no new UI created
    }

    // 키프레임 요소 생성
    const keyframe = document.createElement("div");
    keyframe.className = lightId.includes("_Target")
      ? "keyframe keyframe--target"
      : "keyframe";
    keyframe.dataset.time = time.toFixed(2);
    keyframe.dataset.property = propertyName;
    // 일반: lightId_property, 타겟: lightId_Target
    const datasetLightId = lightId.includes('_Target') ? lightId : `${lightId}_${propertyName}`;
    keyframe.dataset.lightId = datasetLightId;
    keyframe.setAttribute('data-light-id', datasetLightId);

    // index 설정 (전달받은 index가 있으면 사용, 없으면 TimelineData에서 정확한 index 가져오기)
    if (index !== null) {
      keyframe.dataset.index = index.toString();
    } else {
      // TimelineData에서 해당 트랙의 키프레임 개수를 가져와서 index 설정
      let trackData = null;
      if (lightId.includes('_Target')) {
        // 타겟 키프레임인 경우
        trackData = this.timelineData.getTrackById(lightId, propertyName);
      } else {
        // 조명 키프레임인 경우
        const timelineDataLightId = `${lightId}_${propertyName}`;
        trackData = this.timelineData.getTrackById(timelineDataLightId, propertyName);
      }

      if (trackData) {
        keyframe.dataset.index = trackData.getKeyframeCount().toString();
      } else {
        // TimelineData에서 찾을 수 없는 경우 기존 키프레임 개수로 설정
        const existingKeyframes = targetSprite.querySelectorAll('.keyframe');
        keyframe.dataset.index = existingKeyframes.length.toString();
      }
    }

    console.log(`🔍 키프레임 설정:`, {
      lightId,
      propertyName,
      time,
      index: keyframe.dataset.index,
      datasetLightId: keyframe.dataset.lightId,
      attributeLightId: keyframe.getAttribute('data-light-id'),
      isTarget: lightId.includes('_Target')
    });

    // MotionTimeline과 동일 — time-ruler 기준 px 위치
    this.setKeyframeElementPosition(keyframe, time, targetSprite);

    // 키프레임을 스프라이트에 추가
    console.log(`🔄 키프레임을 스프라이트에 추가 시도:`, {
      lightId,
      propertyName,
      time,
      targetSprite,
      keyframe
    });

    const keyframeLayer = this.ensureKeyframeLayer(targetSprite);
    keyframeLayer.appendChild(keyframe);
    console.log(`✅ 키프레임 UI 생성 완료: ${lightId} ${propertyName} at ${time}`, keyframe);

    // 키프레임 클릭 이벤트 추가
    const clickHandler = (e) => {
      e.stopPropagation();
      console.log(`🔍 키프레임 클릭 이벤트 발생: ${lightId} ${propertyName} at ${time}`);

      // 타겟 키프레임과 조명 키프레임 구분하여 lightId 생성
      let timelineDataLightId;
      if (lightId.includes('_Target')) {
        // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
        timelineDataLightId = lightId;
        console.log(`🎯 타겟 키프레임 클릭: ${lightId} ${propertyName} at ${time}`, {
          originalLightId: lightId,
          timelineDataLightId: timelineDataLightId
        });
      } else {
        // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
        timelineDataLightId = `${lightId}_${propertyName}`;
        console.log(`💡 조명 키프레임 클릭: ${lightId} ${propertyName} at ${time}`, {
          originalLightId: lightId,
          timelineDataLightId: timelineDataLightId
        });
      }

      console.log(`🔍 selectKeyframe 호출:`, {
        timelineDataLightId,
        time,
        propertyName,
        keyframe: keyframe
      });

      this.selectKeyframe(timelineDataLightId, time, keyframe, propertyName);
    };

    keyframe.addEventListener("click", clickHandler);

    // 클릭 이벤트가 제대로 연결되었는지 확인하기 위해 참조 저장
    keyframe._clickListener = clickHandler;

    // 키프레임 드래그 기능 추가
    this.makeKeyframeDraggable(keyframe, track, time, propertyName);

    // 실제 DOM에 추가되었는지 확인
    const addedKeyframe = targetSprite.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${propertyName}"]`);
    if (addedKeyframe) {
      console.log(`✅ DOM에 키프레임 실제 추가 확인:`, addedKeyframe);
    } else {
      console.error(`❌ DOM에 키프레임 추가 실패 확인`);
    }

    return keyframe; // Return the created keyframe element
  }



  // BaseTimeline의 play 메서드 오버라이드
  play() {
    if (this.isPlaying) {
      return;
    }

    this.isPlaying = true;
    this.timelineData.precomputeAnimationData();

    // Timeline.js가 마스터 클럭 — 중복 rAF 루프 방지
    if (!this.editor.scene?.userData?.timeline?.isPlaying) {
      this.animate();
    }
  }

  animate() {
    if (!this.isPlaying) return;

    if (this.editor.scene?.userData?.timeline?.isPlaying) {
      return;
    }

    const deltaTime = 1 / this.timelineData.frameRate;
    this.currentTime += deltaTime;

    if (this.currentTime >= this.timelineData.maxTime) {
      this.currentTime = 0;
    }

    const frame = this.currentTime * this.options.framesPerSecond;
    this.updateFrame(frame);

    this.updateUI();
    requestAnimationFrame(() => this.animate());
  }

  // BaseTimeline의 pause 메서드 오버라이드
  pause() {
    console.log("=== LightTimeline pause ===");
    this.isPlaying = false;
  }

  // BaseTimeline의 stop 메서드 오버라이드
  stop() {
    console.log("=== LightTimeline stop ===");
    this.isPlaying = false;
    this.currentTime = 0;
  }

  // MotionTimeline과 동일한 방식으로 updateAnimation 메서드 추가
  updateAnimation(time = null) {
    const currentTime = time !== null ? time : this.currentTime;

    // console.log("🎬 === LightTimeline updateAnimation 호출 ===", {
    //   time,
    //   currentTime,
    //   isPlaying: this.isPlaying,
    //   timelineDataExists: !!this.timelineData,
    //   tracksCount: this.tracks.size
    // });

    // 프레임으로 변환하여 updateFrame 호출
    const frame = Math.floor(currentTime * this.options.framesPerSecond);
    // console.log(`🎬 updateFrame 호출: frame=${frame}, currentTime=${currentTime}`);
    this.updateFrame(frame);

    // 애니메이션 업데이트 후 렌더링 강제 업데이트
    this.forceRenderUpdate();

    // 추가: Three.js 렌더러 직접 호출
    if (this.editor.renderer && this.editor.scene && this.editor.camera) {
      console.log("🔄 Three.js 렌더러 직접 호출");
      this.editor.renderer.render(this.editor.scene, this.editor.camera);
    }
  }

  // 강제 렌더링 업데이트 메서드
  forceRenderUpdate() {
    console.log("🔄 강제 렌더링 업데이트 실행");

    // 모든 가능한 렌더링 시그널 발생
    if (this.editor.signals?.rendererUpdated) {
      this.editor.signals.rendererUpdated.dispatch();
    }

    if (this.editor.signals?.sceneGraphChanged) {
      this.editor.signals.sceneGraphChanged.dispatch();
    }

    if (this.editor.signals?.objectChanged) {
      // 모든 조명 객체에 대해 objectChanged 시그널 발생 (fromAnimation 플래그로 무한 루프 방지)
      this.tracks.forEach((track) => {
        const object = this.editor.scene.getObjectByName(track.objectId);
        if (object && track.lightType) {
          this.editor.signals.objectChanged.dispatch(object, { fromAnimation: true });
        }
      });
    }

    // Three.js 렌더러 직접 업데이트 시도
    if (this.editor.renderer && this.editor.renderer.render) {
      this.editor.renderer.render(this.editor.scene, this.editor.camera);
    }
  }

  // BaseTimeline의 추상 메서드 구현
  getPropertyValue(object, propertyType) {
    switch (propertyType) {
      case "intensity":
        return object.intensity;
      case "color":
        return object.color.clone();
      case "position":
        return object.position.clone();
      case "distance":
        return object.distance;
      case "angle":
        return object.angle;
      case "penumbra":
        return object.penumbra;
      case "decay":
        return object.decay;
      case "target":
        return object.target ? object.target.position.clone() : new THREE.Vector3();
      default:
        return null;
    }
  }

  // BaseTimeline의 updateUI 메서드 구현
  updateUI() {
    // 현재 시간에 맞춰 playhead 위치 업데이트
    const totalDuration = this.options.totalSeconds || 180;
    const timePercent = (this.currentTime / totalDuration) * 100;

    // playhead 요소 찾기 및 위치 업데이트
    const playhead = document.querySelector('.playhead');
    if (playhead) {
      playhead.style.left = `${timePercent}%`;
      this.editor?.timeline?.syncPlayheadSpine?.(timePercent);
    }

    console.log("=== LightTimeline updateUI ===", {
      currentTime: this.currentTime,
      timePercent,
      playheadExists: !!playhead
    });

    this.tracks.forEach((track) => {
      if (!track.isTarget && track.element) {
        this._ensureTrackHeaderControls(track);
      }
    });
  }

  updateFrame(frame) {
    this.currentTime = frame / this.options.framesPerSecond;

    // 성능 최적화: 로그 출력 최소화 (재생 중이 아닐 때만)
    if (!this.isPlaying) {
      console.log("🎬 === LightTimeline updateFrame 시작 ===", {
        frame,
        currentTime: this.currentTime,
        tracksCount: this.tracks.size,
        timelineDataExists: !!this.timelineData
      });
    }

    let totalUpdates = 0;
    let totalTracks = 0;

    // 타겟 트랙 데이터를 저장할 Map 초기화
    if (!this.timelineData.targetTracks) {
      this.timelineData.targetTracks = new Map();
    }

    this.tracks.forEach((track) => {
      totalTracks++;

      // 성능 최적화: 로그 출력 최소화
      if (!this.isPlaying) {
        console.log(`🔍 트랙 처리 중: ${track.objectId} (${track.lightType || 'Target'})`);
      }

      // 타겟 트랙인 경우 별도 처리
      if (track.isTarget) {
        const baseId =
          track.parentLightId || track.objectId.replace(/_Target$/, "");
        if (this._isTrackUserHidden(this._getTrackRootElement(baseId))) {
          const targetObject = this.editor.scene.getObjectByName(track.objectId);
          if (targetObject) targetObject.visible = false;
        }
        this.updateTargetTrack(track);
        return;
      }

      const object = this.editor.scene.getObjectByName(track.objectId);
      if (!object) {
        if (!this.isPlaying) {
          console.log(`❌ 조명 객체를 찾을 수 없음: ${track.objectId}`);
        }
        // 객체가 없어도 트랙은 유지 (UI 트랙이므로)
        // this.tracks.delete(track.objectId); // 트랙 삭제 제거
        console.log(`⚠️ 조명 객체 없음, 트랙은 유지: ${track.objectId}`);

        // 조명 객체가 없을 때 재생성 시도 (로드 후 복원 과정에서)
        if (track.lightType && !this.isPlaying) {
          console.log(`🔄 누락된 조명 객체 재생성 시도: ${track.objectId} (${track.lightType})`);
          // 트랙 인덱스 계산 (light_0, light_1, ...)
          const lightIndex = parseInt(track.objectId.replace('light_', ''));
          const row = Math.floor(lightIndex / 5);
          const col = lightIndex % 5;
          this.createAndPlaceLight(track.objectId, row, col, track.lightType);
        }
        return;
      }

      const trackRoot = this._getTrackRootElement(track.objectId);
      if (this._isTrackUserHidden(trackRoot)) {
        object.visible = false;
        const target = this.editor.scene.getObjectByName(`${track.objectId}_Target`);
        if (target) target.visible = false;
        return;
      }

      if (!track.lightType) {
        if (!this.isPlaying) {
          console.log(`❌ 조명 타입이 설정되지 않음: ${track.objectId}`);
        }
        return;
      }

      const properties = LIGHT_PROPERTIES[track.lightType];
      let hasChanges = false;

      // 조명 속성 애니메이션
      Object.keys(properties).forEach((propertyType) => {
        // 성능 최적화: 로그 출력 최소화
        if (!this.isPlaying) {
          console.log(`  💡 속성 체크: ${propertyType}`);
        }

        // UI 트랙 ID를 고유 식별자로 사용하여 트랙 찾기
        const uniqueTrackId = `${track.objectId}_${propertyType}`;
        let trackData = this.timelineData.getTrackById(uniqueTrackId, propertyType);

        // ID로 찾지 못하면 UUID 기반으로 시도
        if (!trackData) {
          const object = this.editor.scene.getObjectByName(track.objectId);
          if (object) {
            trackData = this.timelineData.getTrackByUuid(object.uuid, propertyType);
            if (!this.isPlaying) {
              console.log(`    🔄 UUID 기반 트랙 찾기 시도: ${object.uuid} ${propertyType} `, trackData ? "찾음" : "없음");
            }
            // UUID 기반 트랙을 ID 기반으로 복사
            if (trackData) {
              // 기존 UUID 기반 트랙을 복사하여 새 트랙 생성
              const existingTrackData = trackData;
              const newTrackData = new TrackData();

              // 기존 키프레임들을 새 트랙으로 복사
              for (let i = 0; i < existingTrackData.keyframeCount; i++) {
                const time = existingTrackData.times[i];
                const value = new THREE.Vector3(
                  existingTrackData.values[i * 3],
                  existingTrackData.values[i * 3 + 1],
                  existingTrackData.values[i * 3 + 2]
                );
                const interpolation = existingTrackData.interpolations[i];
                newTrackData.addKeyframe(time, value, interpolation);
              }

              // 새 트랙을 ID 기반 맵에 직접 추가
              if (!this.timelineData.tracksById.has(uniqueTrackId)) {
                this.timelineData.tracksById.set(uniqueTrackId, new Map());
              }
              this.timelineData.tracksById.get(uniqueTrackId).set(propertyType, newTrackData);

              trackData = newTrackData;
            }
          }
        }

        if (!trackData) {
          if (!this.isPlaying) {
            console.log(`    ❌ 트랙 데이터 없음: ${track.objectId} ${propertyType}`);
          }
          return;
        }

        if (trackData.getKeyframeCount() === 0) {
          if (!this.isPlaying) {
            console.log(`    ⚠️ 키프레임 없음: ${track.objectId} ${propertyType}`);
          }
          return;
        }

        if (!this.isPlaying) {
          console.log(`    ✅ 트랙 데이터 찾음: ${track.objectId} ${propertyType}`, {
            keyframeCount: trackData.getKeyframeCount(),
            times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
          });
        }

        const value = trackData.getValueAtTime(this.currentTime);

        if (value !== null) {
          const beforeValue = this.getPropertyValue(object, propertyType);
          this.setPropertyValue(object, propertyType, value);
          hasChanges = true;
          totalUpdates++;

          if (!this.isPlaying) {
            console.log(`    ✅ 조명 속성 업데이트 성공: ${track.objectId} ${propertyType}`, {
              before: beforeValue,
              after: value,
              time: this.currentTime
            });
          }
        } else {
          if (!this.isPlaying) {
            console.log(`    ❌ 보간된 값이 null: ${track.objectId} ${propertyType}`);
          }
        }
      });

      // 타겟 애니메이션은 별도 트랙에서 처리하므로 여기서는 제거

      if (hasChanges) {
        if (!this.isPlaying) {
          console.log(`    🔄 객체 변경 시그널 발생: ${track.objectId}`);
        }

        // 성능 최적화: 시그널 발생 최소화 (fromAnimation 플래그로 무한 루프 방지)
        if (this.editor.signals?.objectChanged) {
          this.editor.signals.objectChanged.dispatch(object, { fromAnimation: true });
        }
      } else {
        if (!this.isPlaying) {
          console.log(`    ⚠️ 변경사항 없음: ${track.objectId}`);
        }
      }
    });

    console.log(`🎬 === LightTimeline updateFrame 완료 ===`, {
      totalTracks,
      totalUpdates,
      currentTime: this.currentTime,
      tracksKeys: Array.from(this.tracks.keys())
    });

    // UI 업데이트
    this.updateUI();

    // 성능 최적화: 변경사항이 있을 때만 렌더링 업데이트
    if (totalUpdates > 0) {
      // 재생 중일 때는 최소한의 렌더링 업데이트만
      if (this.isPlaying) {
        if (this.editor.signals?.rendererUpdated) {
          this.editor.signals.rendererUpdated.dispatch();
        }
      } else {
        this.forceRenderUpdate();
      }
    }
  }



  // 타겟 트랙 업데이트 메서드
  updateTargetTrack(track) {
    console.log(`🎯 타겟 트랙 업데이트: ${track.objectId} `);

    const targetObject = this.editor.scene.getObjectByName(track.objectId);
    if (!targetObject) {
      console.log(`❌ 타겟 객체를 찾을 수 없음: ${track.objectId} `);
      // 타겟 객체가 없어도 트랙은 유지 (UI 트랙이므로)
      // this.tracks.delete(track.objectId); // 트랙 삭제 제거
      console.log(`⚠️ 타겟 객체 없음, 트랙은 유지: ${track.objectId} `);
      return;
    }

    const baseId =
      track.parentLightId || track.objectId.replace(/_Target$/, "");
    if (this._isTrackUserHidden(this._getTrackRootElement(baseId))) {
      targetObject.visible = false;
      return;
    }

    // 타겟 position 트랙 찾기 (타겟 ID를 직접 사용)
    let trackData = this.timelineData.getTrackById(track.objectId, "position");
    if (!trackData) {
      trackData = this.timelineData.getTrackByUuid(targetObject.uuid, "position");
      // UUID 기반 트랙을 ID 기반으로 복사
      if (trackData) {
        // 기존 UUID 기반 트랙을 복사하여 새 트랙 생성
        const existingTrackData = trackData;
        const newTrackData = new TrackData();

        // 기존 키프레임들을 새 트랙으로 복사
        for (let i = 0; i < existingTrackData.keyframeCount; i++) {
          const time = existingTrackData.times[i];
          const value = new THREE.Vector3(
            existingTrackData.values[i * 3],
            existingTrackData.values[i * 3 + 1],
            existingTrackData.values[i * 3 + 2]
          );
          const interpolation = existingTrackData.interpolations[i];
          newTrackData.addKeyframe(time, value, interpolation);
        }

        // 새 트랙을 ID 기반 맵에 직접 추가
        if (!this.timelineData.tracksById.has(track.objectId)) {
          this.timelineData.tracksById.set(track.objectId, new Map());
        }
        this.timelineData.tracksById.get(track.objectId).set("position", newTrackData);

        trackData = newTrackData;
      }
    }

    if (!trackData) {
      console.log(`❌ 타겟 트랙 데이터 없음: ${track.objectId} position`);
      return;
    }

    if (trackData.getKeyframeCount() === 0) {
      console.log(`⚠️ 타겟 키프레임 없음: ${track.objectId} `, {
        trackData,
        trackId: track.objectId,
        hasTrackData: !!trackData
      });
      return;
    }

    console.log(`✅ 타겟 트랙 데이터 찾음: ${track.objectId} `, {
      keyframeCount: trackData.getKeyframeCount(),
      times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
      currentTime: this.currentTime
    });

    // 타겟 트랙 데이터를 targetTracks에 저장 (TimelineRenderer에서 사용)
    if (!this.timelineData.targetTracks.has(track.objectId)) {
      this.timelineData.targetTracks.set(track.objectId, new Map());
    }
    this.timelineData.targetTracks.get(track.objectId).set("position", trackData);

    // 현재 시간에서 타겟 위치 값 가져오기
    const targetValue = trackData.getValueAtTime(this.currentTime);
    console.log(`🎯 타겟 보간 시도: ${track.objectId} `, {
      currentTime: this.currentTime,
      keyframeCount: trackData.getKeyframeCount(),
      times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
      targetValue: targetValue
    });

    if (targetValue !== null) {
      const beforeValue = targetObject.position.clone();
      targetObject.position.copy(targetValue);

      console.log(`✅ 타겟 위치 업데이트 성공: ${track.objectId} `, {
        before: beforeValue,
        after: targetValue,
        time: this.currentTime,
        changed: !beforeValue.equals(targetValue)
      });

      // 객체 변경 시그널 발생 (fromAnimation 플래그로 무한 루프 방지)
      if (this.editor.signals?.objectChanged) {
        this.editor.signals.objectChanged.dispatch(targetObject, { fromAnimation: true });
      }
    } else {
      console.log(`❌ 타겟 보간된 값이 null: ${track.objectId} `);
    }
  }

  setPropertyValue(object, propertyType, value) {
    // 성능 최적화: 로그 출력 최소화
    if (!this.isPlaying) {
      console.log(`    🔧 setPropertyValue 호출: ${object.name} ${propertyType} =`, value);
    }

    switch (propertyType) {
      case "intensity":
        const oldIntensity = object.intensity;
        object.intensity = value.x;
        if (!this.isPlaying) {
          console.log(`      💡 intensity 변경: ${oldIntensity} → ${object.intensity} `);
        }
        break;
      case "color":
        const oldColor = object.color.clone();
        object.color.setRGB(value.x, value.y, value.z);
        if (!this.isPlaying) {
          console.log(`      🎨 color 변경: ${oldColor} → ${object.color} `);
        }
        break;
      case "position":
        const oldPosition = object.position.clone();
        object.position.copy(value);
        if (!this.isPlaying) {
          console.log(`      📍 position 변경: ${oldPosition} → ${object.position} `);
        }
        break;
      case "distance":
        const oldDistance = object.distance;
        object.distance = value.x;
        if (!this.isPlaying) {
          console.log(`      📏 distance 변경: ${oldDistance} → ${object.distance} `);
        }
        break;
      case "angle":
        const oldAngle = object.angle;
        object.angle = value.x;
        if (!this.isPlaying) {
          console.log(`      📐 angle 변경: ${oldAngle} → ${object.angle} `);
        }
        break;
      case "penumbra":
        const oldPenumbra = object.penumbra;
        object.penumbra = value.x;
        if (!this.isPlaying) {
          console.log(`      🌓 penumbra 변경: ${oldPenumbra} → ${object.penumbra} `);
        }
        break;
      case "decay":
        const oldDecay = object.decay;
        object.decay = value.x;
        if (!this.isPlaying) {
          console.log(`      📉 decay 변경: ${oldDecay} → ${object.decay} `);
        }
        break;
      default:
        if (!this.isPlaying) {
          console.log(`      ⚠️ 알 수 없는 속성 타입: ${propertyType} `);
        }
    }

    // 성능 최적화: 재생 중에는 렌더링 업데이트 최소화
    if (!this.isPlaying && this.editor.signals?.rendererUpdated) {
      this.editor.signals.rendererUpdated.dispatch();
    }
  }



  formatPropertyName(propertyType) {
    const names = {
      intensity: "강도",
      color: "색상",
      position: "위치",
      distance: "거리",
      angle: "각도",
      penumbra: "반음영",
      decay: "감쇠",
      target_position: "타겟 위치"
    };
    return names[propertyType] || propertyType;
  }

  // 저장/로드 메서드
  onBeforeSave() {
    // TimelineData를 scene.userData에 저장
    if (!this.editor.scene.userData) {
      this.editor.scene.userData = {};
    }
    this.editor.scene.userData.lightTimeline = this.timelineData.toJSON();
  }

  // onAfterLoad() {
  //   // scene.userData에서 TimelineData 복원
  //   if (this.editor.scene.userData?.lightTimeline) {
  //     this.timelineData.fromJSON(this.editor.scene.userData.lightTimeline);

  //     // 저장된 키프레임 UI 복원
  //     this.restoreKeyframeUI();

  //     // 저장된 선택된 키프레임 정보 복원
  //     const savedSelectedKeyframe = this.editor.scene.userData.lightTimeline.selectedKeyframe;
  //     if (savedSelectedKeyframe) {
  //       console.log("저장된 선택된 키프레임 복원:", savedSelectedKeyframe);
  //       this.selectedKeyframe = {
  //         lightId: savedSelectedKeyframe.lightId,
  //         index: savedSelectedKeyframe.index,
  //         time: savedSelectedKeyframe.time,
  //         property: savedSelectedKeyframe.property,
  //         value: savedSelectedKeyframe.value,
  //         element: null // UI 요소는 복원 시점에 없으므로 null
  //       };

  //       // 선택된 키프레임 UI 하이라이트 복원
  //       this.restoreSelectedKeyframeUI();
  //     }
  //   }
  // }

  restoreKeyframeUI() {
    // 모든 트랙의 키프레임 UI 복원
    this.tracks.forEach((track) => {
      if (!track.lightType) return;

      const properties = LIGHT_PROPERTIES[track.lightType];
      Object.keys(properties).forEach((propertyName) => {
        const trackData = this.timelineData.getTrackById(track.objectId, propertyName);
        if (trackData) {
          for (let i = 0; i < trackData.getKeyframeCount(); i++) {
            const keyframe = trackData.getKeyframeByIndex(i);
            if (keyframe) {
              this.addKeyframeUI(track.objectId, propertyName, keyframe.time);
            }
          }
        }
      });

      // 타겟 키프레임 UI 복원 (SpotLight, DirectionalLight)
      if (track.hasTarget) {
        const targetId = `${track.objectId}_Target`;
        const targetTrackData = this.timelineData.getTrackById(targetId, "position");
        if (targetTrackData) {
          for (let i = 0; i < targetTrackData.getKeyframeCount(); i++) {
            const keyframe = targetTrackData.getKeyframeByIndex(i);
            if (keyframe) {
              this.addKeyframeUI(targetId, "position", keyframe.time);
            }
          }
        }
      }
    });
  }

  // 선택된 키프레임 UI 하이라이트 복원
  restoreSelectedKeyframeUI() {
    if (!this.selectedKeyframe) return;

    // 선택된 키프레임의 UI 요소 찾기
    const keyframeElement = this.container.querySelector(
      `[data-time="${this.selectedKeyframe.time.toFixed(2)}"][data-property="${this.selectedKeyframe.property}"][data-light-id="${this.selectedKeyframe.lightId}"]`
    );

    if (keyframeElement) {
      // 선택된 키프레임 하이라이트
      keyframeElement.style.backgroundColor = "#ff0";
      this.selectedKeyframe.element = keyframeElement;
      console.log("선택된 키프레임 UI 하이라이트 복원 완료");
    } else {
      console.warn("선택된 키프레임의 UI 요소를 찾을 수 없습니다:", this.selectedKeyframe);
    }
  }

  // TimelineData 상태를 콘솔에 출력하는 메서드
  logTimelineDataState() {
    console.log("=== TimelineData 전체 상태 ===");

    // UUID 기반 트랙들
    console.log("UUID 기반 트랙들:");
    this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
      console.log(`  객체 UUID: ${objectUuid} `);
      objectTracks.forEach((trackData, property) => {
        console.log(`    속성: ${property} `);
        console.log(`      키프레임 개수: ${trackData.getKeyframeCount()} `);
        console.log(`      시간들: [${Array.from(trackData.times.slice(0, trackData.keyframeCount)).join(', ')}]`);
        console.log(`      값들: [${Array.from(trackData.values.slice(0, trackData.keyframeCount * 3)).join(', ')}]`);
        console.log(`      보간 방식들: [${Array.from(trackData.interpolations.slice(0, trackData.keyframeCount)).join(', ')}]`);
      });
    });

    // ID 기반 트랙들
    console.log("ID 기반 트랙들:");
    this.timelineData.tracksById.forEach((objectTracks, objectId) => {
      console.log(`  객체 ID: ${objectId} `);
      objectTracks.forEach((trackData, property) => {
        console.log(`    속성: ${property} `);
        console.log(`      키프레임 개수: ${trackData.getKeyframeCount()} `);
        console.log(`      시간들: [${Array.from(trackData.times.slice(0, trackData.keyframeCount)).join(', ')}]`);
        console.log(`      값들: [${Array.from(trackData.values.slice(0, trackData.keyframeCount * 3)).join(', ')}]`);
        console.log(`      보간 방식들: [${Array.from(trackData.interpolations.slice(0, trackData.keyframeCount)).join(', ')}]`);
      });
    });

    console.log("=== TimelineData 상태 출력 완료 ===");
  }

  // 테스트용 메서드: 현재 시간에서 모든 조명의 상태 출력
  logCurrentLightStates() {
    console.log("=== 현재 조명 상태 ===");
    this.tracks.forEach((track) => {
      const object = this.editor.scene.getObjectByName(track.objectId);
      if (!object || !track.lightType) return;

      console.log(`조명 ${track.objectId} (${track.lightType}): `);
      const properties = LIGHT_PROPERTIES[track.lightType];
      Object.keys(properties).forEach((propertyType) => {
        const value = this.getPropertyValue(object, propertyType);
        console.log(`  ${propertyType}: `, value);
      });

      if (object.target) {
        console.log(`  target position: `, object.target.position);
      }
    });
    console.log("=== 조명 상태 출력 완료 ===");
  }

  // 테스트용 메서드: 특정 조명의 키프레임 데이터 확인
  testLightKeyframes(lightId) {
    console.log(`=== ${lightId} 키프레임 테스트 === `);

    const object = this.editor.scene.getObjectByName(lightId);
    if (!object) {
      console.log("조명 객체를 찾을 수 없습니다:", lightId);
      return;
    }

    const track = this.tracks.get(lightId);
    if (!track || !track.lightType) {
      console.log("트랙 또는 조명 타입을 찾을 수 없습니다:", lightId);
      return;
    }

    const properties = LIGHT_PROPERTIES[track.lightType];
    Object.keys(properties).forEach((propertyType) => {
      console.log(`\n속성: ${propertyType} `);

      const trackData = this.timelineData.getTrackById(lightId, propertyType);
      if (!trackData) {
        console.log("  - 트랙 데이터 없음");
        return;
      }

      console.log(`  - 키프레임 개수: ${trackData.getKeyframeCount()} `);
      if (trackData.getKeyframeCount() > 0) {
        console.log(`  - 시간들: [${Array.from(trackData.times.slice(0, trackData.keyframeCount)).join(', ')}]`);
        console.log(`  - 값들: [${Array.from(trackData.values.slice(0, trackData.keyframeCount * 3)).join(', ')}]`);

        // 현재 시간에서의 보간된 값 테스트
        const interpolatedValue = trackData.getValueAtTime(this.currentTime);
        console.log(`  - 현재 시간(${this.currentTime})에서 보간된 값: `, interpolatedValue);
      }
    });
  }

  // 모든 조명의 모든 속성 키프레임 상태를 한 번에 확인하는 메서드
  showAllLightKeyframes() {
    console.log("=== 모든 조명의 키프레임 상태 ===");

    this.tracks.forEach((track, lightId) => {
      if (!track.lightType) return;

      console.log(`\n🔍 조명: ${lightId} (${track.lightType})`);

      // 조명 객체 가져오기
      const light = this.editor.scene.getObjectByName(lightId);
      if (!light) {
        console.log(`  ❌ 조명 객체를 찾을 수 없음: ${lightId} `);
        return;
      }

      const properties = LIGHT_PROPERTIES[track.lightType];
      Object.keys(properties).forEach((propertyType) => {
        // ID 기반으로 먼저 시도
        let trackData = this.timelineData.getTrackById(lightId, propertyType);

        // ID로 찾지 못하면 UUID 기반으로 시도
        if (!trackData) {
          trackData = this.timelineData.getTrackByUuid(light.uuid, propertyType);
        }

        if (trackData && trackData.getKeyframeCount() > 0) {
          console.log(`  ✅ ${propertyType}: ${trackData.getKeyframeCount()}개 키프레임`);
          console.log(`     시간: [${Array.from(trackData.times.slice(0, trackData.keyframeCount)).join(', ')}]`);

          // 키프레임 값들도 출력
          const values = [];
          for (let i = 0; i < trackData.getKeyframeCount(); i++) {
            const value = {
              x: trackData.values[i * 3],
              y: trackData.values[i * 3 + 1],
              z: trackData.values[i * 3 + 2]
            };
            values.push(value);
          }
          console.log(`     값들: [${values.map(v => `{x:${v.x.toFixed(2)}, y:${v.y.toFixed(2)}, z:${v.z.toFixed(2)}}`).join(', ')}]`);
        } else {
          console.log(`  ❌ ${propertyType}: 키프레임 없음`);
        }
      });

      // 타겟 키프레임도 확인
      if (track.hasTarget) {
        const targetId = `${lightId}_Target`;
        const target = this.editor.scene.getObjectByName(targetId);

        let targetTrackData = this.timelineData.getTrackById(targetId, "position");
        if (!targetTrackData && target) {
          targetTrackData = this.timelineData.getTrackByUuid(target.uuid, "position");
        }

        if (targetTrackData && targetTrackData.getKeyframeCount() > 0) {
          console.log(`  ✅ target_position: ${targetTrackData.getKeyframeCount()}개 키프레임`);
        } else {
          console.log(`  ❌ target_position: 키프레임 없음`);
        }
      }
    });

    console.log("=== 키프레임 상태 확인 완료 ===");
  }

  // 키프레임 추가 시 UI 업데이트
  onKeyframeAdded(objectUuid, property, index, time, value) {
    console.log("=== LightTimeline onKeyframeAdded 시작 ===", {
      objectUuid,
      property,
      index,
      time,
      value
    });

    // UUID로 객체 찾기
    const object = this.editor.scene.getObjectByProperty('uuid', objectUuid);
    if (!object) {
      console.warn("UUID로 객체를 찾을 수 없습니다:", objectUuid);
      return;
    }

    // 조명 ID 추출 및 타겟 여부 확인
    let lightId = object.name;
    let isTarget = false;

    if (object.name.includes('_Target')) {
      lightId = object.name.replace('_Target', '');
      isTarget = true;
    }

    // 타겟인 경우 타겟 트랙, 조명인 경우 조명 트랙 찾기
    let track;
    if (isTarget) {
      track = this.tracks.get(object.name); // 타겟 트랙 (object.name = lightId_Target)
    } else {
      track = this.tracks.get(lightId); // 조명 트랙
    }

    if (!track || !track.sprite) {
      console.warn("트랙 또는 스프라이트를 찾을 수 없습니다:", isTarget ? object.name : lightId);
      return;
    }

    // UI에 키프레임 요소 추가 (타겟은 타겟 스프라이트, 조명은 조명 스프라이트)
    const sprite = track.sprite;

    // 클립 범위 체크 제거 - 키프레임은 어느 시간에든 추가 가능
    console.log("🔍 키프레임 UI 추가 시도:", {
      time,
      property,
      sprite: !!sprite,
      trackId: isTarget ? object.name : lightId
    });

    // 이미 같은 시간에 키프레임이 있는지 확인
    const existingKeyframe = sprite.querySelector(`[data-time="${time.toFixed(2)}"]`);
    if (existingKeyframe) {
      console.log("이미 같은 시간에 키프레임이 존재합니다:", time);
      return;
    }

    console.log("키프레임 요소 생성 중...");
    this.addKeyframeUI(object.name, property, time, index);
    console.log("키프레임 요소 추가 완료");

    // 키프레임 추가 후 자동으로 선택
    setTimeout(() => {
      // 타겟 키프레임인 경우 sprite에서 직접 찾기, 조명 키프레임인 경우 data-light-id로 찾기
      let keyframeElement;
      if (object.name.includes('_Target')) {
        keyframeElement = sprite.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${property}"]`);
      } else {
        const compositeId = `${object.name}_${property}`;
        keyframeElement = document.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${property}"][data-light-id="${compositeId}"]`);
      }

      if (keyframeElement) {
        console.log(`🎯 onKeyframeAdded에서 새로 추가된 키프레임 자동 선택: ${object.name} ${property} at ${time}`);
        // 키프레임 클릭 이벤트와 동일한 방식으로 timelineDataLightId 생성
        let timelineDataLightId;
        if (object.name.includes('_Target')) {
          // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
          timelineDataLightId = object.name;
        } else {
          // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
          timelineDataLightId = `${object.name}_${property}`;
        }
        this.selectKeyframe(timelineDataLightId, time, keyframeElement, property);
      } else {
        console.warn(`❌ onKeyframeAdded에서 새로 추가된 키프레임 요소를 찾을 수 없음: ${object.name} ${property} at ${time}`);
      }
    }, 100); // UI 생성 후 약간의 지연을 두고 선택

    // 이벤트 발생 후 TimelineData 상태 출력
    console.log("=== onKeyframeAdded 이벤트 후 TimelineData 상태 ===");
    this.logTimelineDataState();
  }

  // 키프레임 삭제 시 UI 업데이트
  onKeyframeRemoved(objectUuid, property, index, time, value) {
    console.log("=== LightTimeline onKeyframeRemoved ===", {
      objectUuid,
      property,
      index,
      time,
      value
    });

    // UUID로 객체 찾기
    const object = this.editor.scene.getObjectByProperty('uuid', objectUuid);
    if (!object) {
      console.warn("UUID로 객체를 찾을 수 없습니다:", objectUuid);
      return;
    }

    // 조명 ID 추출
    let lightId = object.name;
    if (object.name.includes('_Target')) {
      lightId = object.name.replace('_Target', '');
    }

    const track = this.tracks.get(lightId);
    if (!track || !track.sprite) return;

    // UI에서 키프레임 요소 제거
    const keyframeElement = track.sprite.querySelector(`[data-time="${time.toFixed(2)}"][data-property="${property}"]`);
    if (keyframeElement) {
      keyframeElement.remove();
    }
  }

  // 키프레임 업데이트 시 UI 업데이트
  onKeyframeUpdated(objectUuid, property, index, time, oldValue, newValue) {
    console.log("=== LightTimeline onKeyframeUpdated ===", {
      objectUuid,
      property,
      index,
      time,
      oldValue,
      newValue
    });

    // UUID로 객체 찾기
    const object = this.editor.scene.getObjectByProperty('uuid', objectUuid);
    if (!object) {
      console.warn("UUID로 객체를 찾을 수 없습니다:", objectUuid);
      return;
    }

    // 조명 ID 추출
    let lightId = object.name;
    if (object.name.includes('_Target')) {
      lightId = object.name.replace('_Target', '');
    }

    const track = this.tracks.get(lightId);
    if (!track || !track.sprite) return;

    // UI에서 키프레임 값 업데이트
    const keyframeElement = track.sprite.querySelector(`[data-time="${time}"][data-property="${property}"]`);
    if (keyframeElement) {
      keyframeElement.dataset.value = JSON.stringify([newValue.x, newValue.y, newValue.z]);
    }
  }

  // 키프레임 이동 시 UI 업데이트
  onKeyframeMoved(objectUuid, property, index, oldTime, newTime, value) {
    console.log("=== LightTimeline onKeyframeMoved ===", {
      objectUuid,
      property,
      index,
      oldTime,
      newTime,
      value
    });

    // UUID로 객체 찾기
    const object = this.editor.scene.getObjectByProperty('uuid', objectUuid);
    if (!object) {
      console.warn("UUID로 객체를 찾을 수 없습니다:", objectUuid);
      return;
    }

    // 조명 ID 추출
    let lightId = object.name;
    if (object.name.includes('_Target')) {
      lightId = object.name.replace('_Target', '');
    }

    const track = this.tracks.get(lightId);
    if (!track || !track.sprite) return;

    // UI에서 키프레임 위치 업데이트
    const keyframeElement = track.sprite.querySelector(`[data-time="${oldTime}"][data-property="${property}"]`);
    if (keyframeElement) {
      keyframeElement.dataset.time = newTime.toFixed(2);
      keyframeElement.dataset.index = index.toString();

      const sprite =
        keyframeElement.closest(".animation-sprite") || track.sprite;
      this.setKeyframeElementPosition(keyframeElement, newTime, sprite);
    }
  }

  _getTrackRootElement(lightId) {
    if (!lightId || !this.container) return null;
    const baseId = String(lightId).replace(/_Target$/, "");
    return this.container.querySelector(
      `.timeline-track.light-timeline[data-object-id="${baseId}"]`,
    );
  }

  _resolveTrackRootElement(trackOrEl) {
    const el = trackOrEl?.element || trackOrEl;
    if (!el) return null;
    if (el.classList?.contains("light-timeline")) return el;
    return el.closest?.(".timeline-track.light-timeline[data-object-id]") || null;
  }

  _isTrackUserHidden(trackOrId) {
    const el =
      typeof trackOrId === "string"
        ? this._getTrackRootElement(trackOrId)
        : this._resolveTrackRootElement(trackOrId);
    return el?.dataset?.trackHidden === "true";
  }

  _isTrackLocked(trackOrEl) {
    const el = this._resolveTrackRootElement(trackOrEl);
    return el?.dataset?.trackLocked === "true";
  }

  _updateLightTypeBadge(track, lightType) {
    const el = track?.element;
    if (!el || track.isTarget) return;

    const badge = el.querySelector(
      ":scope > .motion-tracks:not(.target-tracks) > .track-header .light-type-badge",
    );
    if (!badge) return;

    const select = el.querySelector(
      ":scope > .motion-tracks:not(.target-tracks) > .track-header select",
    );
    const type = lightType ?? select?.value ?? track?.lightType ?? "";

    if (!type) {
      badge.dataset.type = "";
      badge.textContent = "—";
      badge.removeAttribute("title");
      return;
    }

    const info = LIGHT_TYPE_BADGE[type] || {
      short: type.slice(0, 2).toUpperCase(),
      title: type,
    };
    badge.dataset.type = type;
    badge.textContent = info.short;
    badge.title = info.title;
  }

  _ensureLightTypeBadge(track) {
    const el = track?.element;
    if (!el || track.isTarget) return;

    const trackInfo = el.querySelector(
      ":scope > .motion-tracks:not(.target-tracks) > .track-header .track-info",
    );
    if (!trackInfo) return;

    trackInfo.classList.add("track-info--light");

    let badge = trackInfo.querySelector(".light-type-badge");
    if (!badge) {
      badge = document.createElement("span");
      badge.className = "light-type-badge";
      badge.setAttribute("aria-hidden", "true");
      const select = trackInfo.querySelector("select");
      if (select) {
        trackInfo.insertBefore(badge, select);
      } else {
        trackInfo.prepend(badge);
      }
    }

    this._updateLightTypeBadge(track, track.lightType);
  }

  _ensureTrackHeaderControls(track) {
    const el = track?.element;
    if (!el || track.isTarget) return;

    const header = el.querySelector(
      ":scope > .motion-tracks:not(.target-tracks) > .track-header",
    );
    if (!header) return;

    this._ensureLightTypeBadge(track);

    let controls = header.querySelector(".track-controls");
    if (!controls) {
      controls = document.createElement("div");
      controls.className = "track-controls";
      header.appendChild(controls);
    }
    controls.hidden = false;
    controls.removeAttribute("aria-hidden");

    const hasAllButtons =
      controls.querySelector(".track-visibility-btn") &&
      controls.querySelector(".add-keyframe-btn") &&
      controls.querySelector(".track-lock-btn");

    if (!hasAllButtons) {
      controls.innerHTML = `
        <button type="button" class="track-visibility-btn" title="숨기기/보이기"><i class="fa fa-eye"></i></button>
        <button type="button" class="add-keyframe-btn" title="키프레임 추가 (K)"><span class="kf-add-diamond" aria-hidden="true"></span></button>
        <button type="button" class="track-lock-btn" title="잠금"><i class="fa fa-lock-open"></i></button>
      `;
      delete el.dataset.headerControlsBound;
    } else {
      const addBtn = controls.querySelector(".add-keyframe-btn");
      if (addBtn && !addBtn.querySelector(".kf-add-diamond")) {
        addBtn.innerHTML =
          '<span class="kf-add-diamond" aria-hidden="true"></span>';
        addBtn.title = "키프레임 추가 (K)";
      }
    }

    if (el.dataset.trackHidden === "true") {
      const visBtn = controls.querySelector(".track-visibility-btn");
      const icon = visBtn?.querySelector("i");
      if (icon) icon.className = "fa fa-eye-slash";
      visBtn?.classList.add("track-btn--active");
      el.classList.add("timeline-track--hidden");
    }

    if (el.dataset.trackLocked === "true") {
      const lockBtn = controls.querySelector(".track-lock-btn");
      const icon = lockBtn?.querySelector("i");
      if (icon) icon.className = "fa fa-lock";
      lockBtn?.classList.add("track-btn--active");
      const addBtn = controls.querySelector(".add-keyframe-btn");
      if (addBtn) addBtn.disabled = true;
      el.classList.add("timeline-track--locked");
    }

    this._bindTrackHeaderControls(track);
  }

  _bindTrackHeaderControls(track) {
    const el = track?.element;
    if (!el || el.dataset.headerControlsBound === "true") return;
    el.dataset.headerControlsBound = "true";

    const visBtn = el.querySelector(".track-visibility-btn");
    visBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleTrackVisibility(track);
    });

    const lockBtn = el.querySelector(".track-lock-btn");
    lockBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      this._toggleTrackLock(track);
    });

    const addBtn = el.querySelector(".add-keyframe-btn");
    addBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (this._isTrackLocked(el)) return;
      const result = this.addKeyframeAtPlayhead(track.objectId);
      if (!result?.success && result?.message) {
        console.warn("조명 키프레임 추가 실패:", result.message);
      }
    });
  }

  _toggleTrackVisibility(track) {
    const el = this._resolveTrackRootElement(track) || track?.element;
    const hidden = el.dataset.trackHidden === "true";
    const nextHidden = !hidden;
    el.dataset.trackHidden = nextHidden ? "true" : "false";

    const visBtn = el.querySelector(".track-visibility-btn");
    const icon = visBtn?.querySelector("i");
    if (icon) icon.className = nextHidden ? "fa fa-eye-slash" : "fa fa-eye";
    visBtn?.classList.toggle("track-btn--active", nextHidden);
    el.classList.toggle("timeline-track--hidden", nextHidden);

    const lightId = track?.objectId || el.dataset?.objectId;
    const light = lightId
      ? this.editor.scene.getObjectByName(lightId)
      : null;
    if (light) {
      if (nextHidden) light.visible = false;
      this.editor.signals?.objectChanged?.dispatch(light, {
        fromTimeline: true,
      });
    }
    const target = lightId
      ? this.editor.scene.getObjectByName(`${lightId}_Target`)
      : null;
    if (target) {
      if (nextHidden) target.visible = false;
      this.editor.signals?.objectChanged?.dispatch(target, {
        fromTimeline: true,
      });
    }

    this.updateAnimation(this.currentTime);
  }

  _toggleTrackLock(track) {
    const el = this._resolveTrackRootElement(track) || track?.element;
    const locked = el.dataset.trackLocked === "true";
    const nextLocked = !locked;
    el.dataset.trackLocked = nextLocked ? "true" : "false";

    const lockBtn = el.querySelector(".track-lock-btn");
    const icon = lockBtn?.querySelector("i");
    if (icon) icon.className = nextLocked ? "fa fa-lock" : "fa fa-lock-open";
    lockBtn?.classList.toggle("track-btn--active", nextLocked);
    el.classList.toggle("timeline-track--locked", nextLocked);

    const addBtn = el.querySelector(".add-keyframe-btn");
    if (addBtn) addBtn.disabled = nextLocked;

    if (nextLocked && el.classList.contains("timeline-track--selected")) {
      this.editor.timeline?.selectionBridge?.clearTrackHighlights();
      this.selectedTrackId = null;
    }
  }

  bindTrackEvents(track) {
    console.log("🔧 bindTrackEvents 시작:", {
      trackId: track?.objectId,
      lightType: track?.lightType,
      hasSprite: !!track?.sprite
    });

    if (!track || !track.objectId || track.isTarget) {
      console.warn("트랙 또는 objectId가 없습니다:", track);
      return;
    }

    this._ensureTrackHeaderControls(track);

    const light = this.editor.scene.getObjectByName(track.objectId);
    if (!light) {
      console.warn(`조명을 찾을 수 없습니다: ${track.objectId} `);
      return;
    }

    console.log(`🔧 조명 객체 확인: ${track.objectId} `, {
      exists: !!light,
      uuid: light.uuid,
      type: light.type
    });

    // 트랙 요소에 이벤트 리스너 추가
    track.element.addEventListener("click", (e) => {
      // 키프레임 추가 버튼 이벤트는 별도로 처리됨
      if (e.target.classList.contains("add-keyframe-btn")) {
        // 이벤트는 아래에서 처리되므로 여기서는 아무것도 하지 않음
        return;
      } else if (
        e.target.classList.contains("prev-keyframe-btn") ||
        e.target.closest(".prev-keyframe-btn")
      ) {
        this.moveToAdjacentKeyframe(track.element, "prev");
      } else if (
        e.target.classList.contains("next-keyframe-btn") ||
        e.target.closest(".next-keyframe-btn")
      ) {
        this.moveToAdjacentKeyframe(track.element, "next");
      }
    });

  }

  /** 트랙 클립 안에 주어진 시각이 포함되는지 */
  isTimeInTrackClip(track, time) {
    if (!track) return false;

    const total = this.options?.totalSeconds || 180;
    const tolerance = LightTimeline.CLIP_RANGE_TOLERANCE;
    const sprites = [];

    if (track.trackContent) {
      track.trackContent
        .querySelectorAll(".animation-sprite")
        .forEach((sprite) => sprites.push(sprite));
    }
    if (track.sprite && !sprites.includes(track.sprite)) {
      sprites.push(track.sprite);
    }
    track.element
      ?.querySelectorAll(".target-sprite")
      .forEach((sprite) => {
        if (!sprites.includes(sprite)) sprites.push(sprite);
      });

    if (!sprites.length) return false;

    return sprites.some((sprite) => {
      const clipLeft = parseFloat(sprite.style.left) || 0;
      const clipDuration = parseFloat(sprite.dataset.duration) || total;
      const clipStartTime = (clipLeft / 100) * total;
      const clipEndTime = clipStartTime + clipDuration;
      return (
        time >= clipStartTime - tolerance && time <= clipEndTime + tolerance
      );
    });
  }

  /**
   * Shift+K — 플레이헤드 시점에 설정된 모든 조명 트랙에 키프레임 추가
   */
  addKeyframesAtPlayheadForAll() {
    const currentTime = this.getPlayheadTimeSeconds();
    this.currentTime = currentTime;

    let successCount = 0;
    const failures = [];

    for (const [, track] of this.tracks) {
      if (!track.lightType) continue;

      const light = this.editor.scene.getObjectByName(track.objectId);
      if (!light) continue;

      if (!this.isTimeInTrackClip(track, currentTime)) continue;

      const result = this.addKeyframeAtPlayhead(track.objectId);
      if (result.success) {
        successCount++;
      } else if (result.message) {
        failures.push(result.message);
      }
    }

    if (successCount > 0) {
      return { success: true, count: successCount };
    }

    const hasConfiguredLight = [...this.tracks.values()].some(
      (t) => t.lightType && this.editor.scene.getObjectByName(t.objectId),
    );
    if (!hasConfiguredLight) {
      return {
        success: false,
        message:
          "조명 트랙에서 Spot/Point Light를 먼저 지정하세요.",
      };
    }

    return {
      success: false,
      message:
        failures[0] ||
        "플레이헤드가 조명 클립 안에 있어야 합니다.",
    };
  }

  /** 플레이헤드(또는 currentTime) 기준 초 단위 시간 */
  getPlayheadTimeSeconds() {
    const mainTimeline = this.editor?.timeline;
    const playhead =
      mainTimeline?.container?.querySelector(".playhead") ||
      document.querySelector(".playhead") ||
      document.querySelector(".timeline-scrubber");
    const total =
      this.options?.totalSeconds ||
      mainTimeline?.timelineSettings?.totalSeconds ||
      180;

    if (playhead) {
      const playheadLeft = parseFloat(playhead.style.left) || 0;
      const calculated = (playheadLeft / 100) * total;
      if (calculated >= 0) {
        this.currentTime = calculated;
        if (this.editor?.motionTimeline) {
          this.editor.motionTimeline.currentTime = calculated;
        }
        return calculated;
      }
    }

    if (this.editor?.motionTimeline?.currentTime != null) {
      return this.editor.motionTimeline.currentTime;
    }

    let currentTime = this.currentTime;

    if (!playhead) {
      const timeDisplay = document.querySelector(
        ".timeline-header .time-display, .sb-tl .time-display",
      );
      if (timeDisplay) {
        const match = timeDisplay.textContent.match(/(\d+\.?\d*)/);
        if (match) currentTime = parseFloat(match[1]);
      }
    }

    return currentTime;
  }

  getTimeRulerWidth() {
    const ruler =
      this.editor?.timeline?.container?.querySelector(".time-ruler-container") ||
      document.querySelector("#main-timeline .time-ruler-container") ||
      document.querySelector(".time-ruler-container");
    return ruler ? ruler.getBoundingClientRect().width : 0;
  }

  /** MotionTimeline.createKeyframeElement 과 동일 — 룰러 기준 클립 내 px */
  computeKeyframeLeftPx(time, sprite) {
    const totalSeconds = this.options?.totalSeconds || 180;
    const numericTime = parseFloat(time);
    if (!Number.isFinite(numericTime) || !sprite) return 0;

    const timeRulerWidth = this.getTimeRulerWidth();
    const spriteLeft = parseFloat(sprite.style.left) || 0;
    const clipDuration = parseFloat(sprite.dataset.duration) || totalSeconds;
    const clipStartTime = (spriteLeft / 100) * totalSeconds;

    if (timeRulerWidth > 0) {
      const absolutePixelPosition =
        (numericTime / totalSeconds) * timeRulerWidth;
      const clipStartPixelPosition = (spriteLeft / 100) * timeRulerWidth;
      return absolutePixelPosition - clipStartPixelPosition;
    }

    const spriteWidth =
      sprite.offsetWidth || sprite.getBoundingClientRect().width || 1;
    const relativeTime = numericTime - clipStartTime;
    return (relativeTime / clipDuration) * spriteWidth;
  }

  setKeyframeElementPosition(keyframeElement, time, sprite) {
    const px = this.computeKeyframeLeftPx(time, sprite);
    keyframeElement.style.left = `${px}px`;
    keyframeElement.dataset.pixelPosition = String(px);
  }

  /** 조명 트랙 행 선택 (조명+타겟 그룹, K 단축키 대상) */
  selectLightTrack(lightId) {
    const bridge = this.editor?.timeline?.selectionBridge;
    if (bridge?.selectLightTrackGroup) {
      bridge.selectLightTrackGroup(lightId);
      return;
    }

    const baseId = lightId?.replace(/_Target$/, "") || lightId;
    if (!baseId || !this.tracks.has(baseId)) return;
    this.selectedTrackId = baseId;

    const track = this.tracks.get(baseId);
    if (!track?.element) return;

    this.container
      ?.querySelectorAll(".light-timeline.timeline-track--selected")
      .forEach((el) => el.classList.remove("timeline-track--selected"));
    track.element.classList.add("timeline-track--selected");
  }

  /** K 단축키 / + 버튼과 동일 — 조명 트랙에 현재 시점 키프레임 추가 */
  addKeyframeAtPlayhead(trackObjectId = null) {
    const resolved = this._resolveTrackForPlayhead(trackObjectId);
    if (!resolved) {
      return {
        success: false,
        message:
          "조명 트랙을 선택하거나 3D 뷰에서 조명을 선택한 뒤 K를 누르세요.",
      };
    }

    if (!resolved.lightType) {
      return {
        success: false,
        message: "조명 트랙에서 SpotLight / PointLight를 먼저 선택하세요.",
      };
    }

    if (this._isTrackLocked(this._getTrackRootElement(resolved.objectId))) {
      return { success: false, message: "잠긴 트랙입니다." };
    }

    const currentTime = this.getPlayheadTimeSeconds();

    if (!this.isTimeInTrackClip(resolved, currentTime)) {
      return {
        success: false,
        message: `플레이헤드(${currentTime.toFixed(2)}s)가 조명 클립 안에 있어야 합니다.`,
      };
    }

    if (!this._inHistoryPlayback && this.editor?.history) {
      const cmd = new AddLightKeyframeAtPlayheadCommand(
        this.editor,
        resolved.objectId,
        currentTime,
      );
      this.editor.history.execute(cmd, "조명 키프레임 추가");
      return (
        cmd.lastResult || {
          success: true,
          trackId: resolved.objectId,
          time: currentTime,
        }
      );
    }

    return this._addKeyframeAtPlayheadInternal(trackObjectId);
  }

  _resolveTrackForPlayhead(trackObjectId = null) {
    let track = null;

    if (trackObjectId && this.tracks.has(trackObjectId)) {
      track = this.tracks.get(trackObjectId);
    }

    if (!track && this.selectedTrackId && this.tracks.has(this.selectedTrackId)) {
      track = this.tracks.get(this.selectedTrackId);
    }

    if (!track) {
      const selectedEl = this.container.querySelector(
        ".light-timeline.timeline-track--selected",
      );
      if (selectedEl?.dataset?.objectId) {
        track = this.tracks.get(selectedEl.dataset.objectId);
      }
    }

    if (!track) {
      const sel = this.editor.selected;
      if (sel?.isLight) {
        track = this.tracks.get(sel.name);
      } else if (sel?.name?.includes("_Target")) {
        const baseId = sel.name.replace("_Target", "");
        track = this.tracks.get(baseId);
      }
    }

    if (!track) return null;
    return track;
  }

  _cloneLightKeyframeValue(value) {
    if (value == null) return value;
    if (typeof value.clone === "function") return value.clone();
    if (typeof value === "object") return { ...value };
    return value;
  }

  _captureLightKeyframesAtTime(trackObjectId, time) {
    const snapshot = {};
    const ids = [trackObjectId, `${trackObjectId}_Target`];

    for (const id of ids) {
      const objectTracks = this.timelineData.tracksById.get(id);
      if (!objectTracks) continue;
      for (const [property, trackData] of objectTracks) {
        const index = trackData.findKeyframeIndex(time);
        if (index === -1) continue;
        const kf = trackData.getKeyframeByIndex(index);
        if (!kf) continue;
        snapshot[`${id}:${property}`] = {
          time: kf.time,
          value: this._cloneLightKeyframeValue(kf.value),
          interpolation: kf.interpolation,
        };
      }
    }

    return snapshot;
  }

  _removeLightKeyframesAtTime(trackObjectId, time) {
    const ids = [trackObjectId, `${trackObjectId}_Target`];
    let removed = false;

    for (const id of ids) {
      const objectTracks = this.timelineData.tracksById.get(id);
      if (!objectTracks) continue;
      for (const [, trackData] of objectTracks) {
        if (trackData.removeKeyframe(time)) {
          removed = true;
        }
      }
    }

    if (removed) {
      this.timelineData.dirty = true;
      this.updateUI?.();
      this.updateFrame?.(this.currentTime);
    }

    return removed;
  }

  _restoreLightKeyframesAtTime(trackObjectId, time, snapshot) {
    this._removeLightKeyframesAtTime(trackObjectId, time);

    for (const [key, kf] of Object.entries(snapshot || {})) {
      const sep = key.indexOf(":");
      if (sep === -1) continue;
      const id = key.slice(0, sep);
      const property = key.slice(sep + 1);
      if (!kf?.value) continue;

      let trackData = this.timelineData.getTrackById(id, property);
      if (!trackData) {
        const object = this.editor.scene.getObjectByName(id);
        if (object) {
          this.timelineData.addTrack(object.uuid, property, id);
          trackData = this.timelineData.getTrackById(id, property);
        }
      }
      if (trackData) {
        trackData.addKeyframe(
          kf.time,
          this._cloneLightKeyframeValue(kf.value),
          kf.interpolation,
        );
      }
    }

    this.timelineData.dirty = true;
    this.updateUI?.();
    this.updateFrame?.(this.currentTime);
  }

  _addKeyframeAtPlayheadInternal(trackObjectId = null) {
    const track = this._resolveTrackForPlayhead(trackObjectId);
    if (!track) {
      return {
        success: false,
        message:
          "조명 트랙을 선택하거나 3D 뷰에서 조명을 선택한 뒤 K를 누르세요.",
      };
    }

    if (!track.lightType) {
      return {
        success: false,
        message: "조명 트랙에서 SpotLight / PointLight를 먼저 선택하세요.",
      };
    }

    const light = this.editor.scene.getObjectByName(track.objectId);
    if (!light) {
      return {
        success: false,
        message: `씬에서 조명을 찾을 수 없습니다: ${track.objectId}`,
      };
    }

    const currentTime = this.getPlayheadTimeSeconds();
    this.currentTime = currentTime;

    if (!this.isTimeInTrackClip(track, currentTime)) {
      return {
        success: false,
        message: `플레이헤드(${currentTime.toFixed(2)}s)가 조명 클립 안에 있어야 합니다.`,
      };
    }

    const properties = LIGHT_PROPERTIES[track.lightType] || LIGHT_PROPERTIES.SpotLight;
    const allProperties = {};
    Object.keys(properties).forEach((propertyName) => {
      const value = this.getPropertyValue(light, propertyName);
      if (value !== null) allProperties[propertyName] = value;
    });

    this.addKeyframeForAllProperties(track.objectId, currentTime, allProperties);

    if (track.hasTarget) {
      const targetId = `${track.objectId}_Target`;
      const targetObject = this.editor.scene.getObjectByName(targetId);
      if (targetObject) {
        let targetTrackData = this.timelineData.getTrackById(targetId, "position");
        if (!targetTrackData) {
          this.timelineData.addTrack(targetObject.uuid, "position", targetId);
        }
        this.addKeyframeForProperty(
          targetId,
          "position",
          currentTime,
          targetObject.position.clone(),
        );
      }
    }

    return { success: true, trackId: track.objectId, time: currentTime };
  }

  // 이전/다음 키프레임으로 이동
  moveToAdjacentKeyframe(trackElement, direction) {
    console.log("=== LightTimeline moveToAdjacentKeyframe 시작 ===", { direction, trackElement });

    // 현재 선택된 키프레임 찾기
    let selectedKeyframe = trackElement.querySelector(".keyframe.selected");
    console.log("현재 선택된 키프레임:", selectedKeyframe ? {
      time: selectedKeyframe.dataset.time,
      property: selectedKeyframe.dataset.property,
      lightId: selectedKeyframe.dataset.lightId,
      index: selectedKeyframe.dataset.index
    } : "없음");

    // 선택된 키프레임이 없으면 첫 번째 키프레임을 선택
    if (!selectedKeyframe) {
      const keyframeElements = Array.from(trackElement.querySelectorAll(".keyframe"));
      console.log("트랙 내 모든 키프레임:", keyframeElements.map(kf => ({
        time: kf.dataset.time,
        property: kf.dataset.property,
        lightId: kf.dataset.lightId,
        index: kf.dataset.index,
        hasSelectedClass: kf.classList.contains('selected')
      })));

      if (keyframeElements.length === 0) {
        console.warn("키프레임이 없습니다.");
        return;
      }

      // 시간 기반으로 정렬
      const sortedKeyframes = keyframeElements.sort((a, b) => {
        const timeA = parseFloat(a.dataset.time || 0);
        const timeB = parseFloat(b.dataset.time || 0);
        return timeA - timeB;
      });

      if (direction === "prev") {
        selectedKeyframe = sortedKeyframes[sortedKeyframes.length - 1]; // 마지막 키프레임
      } else {
        selectedKeyframe = sortedKeyframes[0]; // 첫 번째 키프레임
      }

      console.log("선택된 키프레임 (기본값):", {
        time: selectedKeyframe.dataset.time,
        property: selectedKeyframe.dataset.property,
        lightId: selectedKeyframe.dataset.lightId,
        index: selectedKeyframe.dataset.index
      });
    }

    // 현재 선택된 키프레임의 부모 트랙 요소 찾기
    const parentTrack = selectedKeyframe.closest('.motion-tracks');
    if (!parentTrack) {
      console.warn("부모 트랙을 찾을 수 없습니다.");
      return;
    }

    console.log("부모 트랙 정보:", {
      objectId: parentTrack.dataset.objectId,
      objectName: parentTrack.dataset.objectName,
      isTarget: parentTrack.dataset.objectId?.includes('_Target')
    });

    // 같은 트랙 내의 모든 키프레임 가져오기
    // 타겟 트랙인 경우 타겟 스프라이트 내의 키프레임만 가져오기
    let keyframeElements;
    if (parentTrack.dataset.objectId?.includes('_Target')) {
      // 타겟 트랙인 경우 타겟 스프라이트 내의 키프레임만 가져오기
      const targetSprite = parentTrack.querySelector('.target-sprite');
      if (targetSprite) {
        keyframeElements = Array.from(targetSprite.querySelectorAll(".keyframe"));
      } else {
        keyframeElements = Array.from(parentTrack.querySelectorAll(".keyframe"));
      }
    } else {
      // 일반 조명 트랙인 경우 조명 스프라이트 내의 키프레임만 가져오기
      const lightSprite = parentTrack.querySelector('.light-sprite');
      if (lightSprite) {
        keyframeElements = Array.from(lightSprite.querySelectorAll(".keyframe"));
      } else {
        keyframeElements = Array.from(parentTrack.querySelectorAll(".keyframe"));
      }
    }

    console.log("부모 트랙 내 모든 키프레임들:", keyframeElements.map(kf => ({
      time: kf.dataset.time,
      property: kf.dataset.property,
      lightId: kf.dataset.lightId,
      index: kf.dataset.index,
      hasSelectedClass: kf.classList.contains('selected')
    })));

    // 현재 트랙에 속한 키프레임만 필터링 (data-light-id로 추가 검증)
    const trackObjectId = parentTrack.dataset.objectId;
    keyframeElements = keyframeElements.filter(keyframe => {
      const keyframeLightId = keyframe.dataset.lightId;

      // 일반 조명 키프레임: light_0_intensity 형태
      // 타겟 키프레임: light_0_Target 형태
      // 트랙 ID: light_0 또는 light_0_Target 형태
      let isSameTrack = false;

      if (trackObjectId.includes('_Target')) {
        // 타겟 트랙인 경우: 기본 조명 ID 추출하여 비교
        const baseLightId = trackObjectId.replace('_Target', '');
        if (keyframeLightId.includes('_Target')) {
          // 타겟 키프레임인 경우: light_0_Target === light_0_Target
          isSameTrack = keyframeLightId === trackObjectId;
        } else {
          // 일반 조명 키프레임인 경우: light_0_intensity는 light_0으로 시작하는지 확인
          isSameTrack = keyframeLightId.startsWith(baseLightId + '_');
        }
      } else {
        // 일반 조명 트랙인 경우
        if (keyframeLightId.includes('_Target')) {
          // 타겟 키프레임인 경우: light_0_Target === light_0_Target
          isSameTrack = keyframeLightId === trackObjectId + '_Target';
        } else {
          // 일반 조명 키프레임인 경우: light_0_intensity는 light_0으로 시작하는지 확인
          isSameTrack = keyframeLightId.startsWith(trackObjectId + '_');
        }
      }

      console.log(`키프레임 필터링: ${keyframeLightId} vs ${trackObjectId} = ${isSameTrack}`, {
        keyframeLightId,
        trackObjectId,
        isTargetTrack: trackObjectId.includes('_Target'),
        isTargetKeyframe: keyframeLightId.includes('_Target'),
        baseLightId: trackObjectId.includes('_Target') ? trackObjectId.replace('_Target', '') : trackObjectId,
        startsWithBaseId: keyframeLightId.startsWith((trackObjectId.includes('_Target') ? trackObjectId.replace('_Target', '') : trackObjectId) + '_')
      });

      return isSameTrack;
    });

    console.log("필터링 후 키프레임들:", keyframeElements.map(kf => ({
      time: kf.dataset.time,
      property: kf.dataset.property,
      lightId: kf.dataset.lightId,
      index: kf.dataset.index,
      hasSelectedClass: kf.classList.contains('selected')
    })));

    // 시간 기반으로 정렬 (index가 부정확할 수 있으므로 시간으로 정렬)
    const sortedKeyframes = keyframeElements.sort((a, b) => {
      const timeA = parseFloat(a.dataset.time || 0);
      const timeB = parseFloat(b.dataset.time || 0);
      return timeA - timeB;
    });

    const currentIndex = sortedKeyframes.indexOf(selectedKeyframe);

    console.log("키프레임 이동 정보:", {
      direction,
      currentIndex,
      totalKeyframes: sortedKeyframes.length,
      selectedKeyframe: selectedKeyframe ? {
        time: selectedKeyframe.dataset.time,
        property: selectedKeyframe.dataset.property,
        lightId: selectedKeyframe.dataset.lightId,
        index: selectedKeyframe.dataset.index
      } : null,
      allKeyframes: sortedKeyframes.map(kf => ({
        time: kf.dataset.time,
        property: kf.dataset.property,
        lightId: kf.dataset.lightId,
        index: kf.dataset.index
      }))
    });

    if (direction === "prev" && currentIndex > 0) {
      const prevKeyframe = sortedKeyframes[currentIndex - 1];

      // index 기반으로 selectedKeyframe 업데이트
      const lightId = trackElement.dataset.objectId;
      const time = parseFloat(prevKeyframe.dataset.time);
      const propertyName = prevKeyframe.dataset.property;
      console.log("이전 키프레임으로 이동:", {
        lightId,
        time,
        propertyName
      });

      // 키프레임 선택 (이 메서드에서 다른 키프레임 선택 해제도 처리)
      this.selectKeyframe(lightId, time, prevKeyframe, propertyName);

      // playhead 이동
      this.movePlayheadToTime(time);

    } else if (
      direction === "next" &&
      currentIndex < sortedKeyframes.length - 1
    ) {
      const nextKeyframe = sortedKeyframes[currentIndex + 1];

      // index 기반으로 selectedKeyframe 업데이트
      const lightId = trackElement.dataset.objectId;
      const time = parseFloat(nextKeyframe.dataset.time);
      const propertyName = nextKeyframe.dataset.property;
      console.log("다음 키프레임으로 이동:", {
        lightId,
        time,
        propertyName
      });

      // 키프레임 선택 (이 메서드에서 다른 키프레임 선택 해제도 처리)
      this.selectKeyframe(lightId, time, nextKeyframe, propertyName);

      // playhead 이동
      this.movePlayheadToTime(time);
    } else {
      console.log("더 이상 이동할 키프레임이 없습니다:", {
        direction,
        currentIndex,
        totalKeyframes: sortedKeyframes.length
      });
    }
  }

  // JSON 저장 전 호출되는 메서드 (Editor.js에서 호출될 수 있음)
  onBeforeSave() {
    try {
      console.log("=== LightTimeline onBeforeSave 시작 ===");
      console.log("this.timelineData 존재:", !!this.timelineData);
      console.log("this.timelineData.tracks 크기:", this.timelineData?.tracks?.size || 0);
      console.log("this.timelineData.tracksById 크기:", this.timelineData?.tracksById?.size || 0);

      // 저장 전 데이터 정리
      this.cleanupTimelineData();

      // tracks의 내용을 자세히 확인
      console.log("=== TimelineData 전체 상태 ===");
      console.log("this.timelineData.tracks 크기:", this.timelineData?.tracks?.size || 0);
      console.log("this.timelineData.tracks 키들:", Array.from(this.timelineData?.tracks?.keys() || []));

      if (this.timelineData?.tracks) {
        this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
          console.log(`객체 ${objectUuid}의 트랙들:`, objectTracks);
          console.log(`객체 ${objectUuid}의 트랙 크기:`, objectTracks.size);
          objectTracks.forEach((trackData, property) => {
            console.log(`  ${property} 트랙 키프레임 개수:`, trackData.keyframeCount);
            if (trackData.keyframeCount > 0) {
              console.log(`  ${property} 트랙 시간들:`, Array.from(trackData.times.slice(0, trackData.keyframeCount)));
            }
          });
        });
      }

      // scene.userData에 현재 상태 저장
      if (this.editor.scene && this.timelineData) {
        console.log("TimelineData 직접 처리 시작");

        // 기존 데이터 초기화 (중복 방지)
        if (this.editor.scene.userData.lightTimeline) {
          console.log("기존 lightTimeline 데이터 초기화");
          delete this.editor.scene.userData.lightTimeline;
        }

        // TimelineData에서 직접 키프레임 데이터 추출
        const timelineData = {
          tracks: {},
          maxTime: this.timelineData.maxTime,
          frameRate: this.timelineData.frameRate,
          currentTime: this.currentTime
        };

        // TimelineData의 tracks에서 조명 키프레임 데이터 추출
        this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
          console.log(`TimelineData에서 객체 ${objectUuid} 처리:`, objectTracks);

          const keyframes = [];
          objectTracks.forEach((trackData, property) => {
            console.log(`속성 ${property} 키프레임 개수:`, trackData.keyframeCount);

            for (let i = 0; i < trackData.keyframeCount; i++) {
              const time = trackData.times[i];
              const x = trackData.values[i * 3];
              const y = trackData.values[i * 3 + 1];
              const z = trackData.values[i * 3 + 2];
              const interpolation = trackData.interpolations[i];

              keyframes.push({
                time: time,
                property: property,
                value: { x, y, z },
                interpolation: interpolation
              });

              console.log(`키프레임 ${i}: 시간=${time}, 속성=${property}, 값=(${x},${y},${z})`);
            }
          });

          if (keyframes.length > 0) {
            timelineData.tracks[objectUuid] = keyframes;
            console.log(`객체 ${objectUuid}의 키프레임 저장:`, keyframes);
          }
        });

        console.log("TimelineData 처리 결과:", timelineData);

        // 조명 트랙 정보 수집 (순서 보장)
        const lightTracksData = {};
        console.log("=== 조명 트랙 정보 수집 시작 ===");
        console.log("this.tracks 크기:", this.tracks.size);
        console.log("this.tracks 키들:", Array.from(this.tracks.keys()));

        // 조명 트랙을 순서대로 정렬하여 저장
        const sortedTracks = Array.from(this.tracks.entries()).sort((a, b) => {
          const aIndex = parseInt(a[0].replace('light_', ''));
          const bIndex = parseInt(b[0].replace('light_', ''));
          return aIndex - bIndex;
        });

        sortedTracks.forEach(([lightId, track]) => {
          console.log(`트랙 처리 중: ${lightId}`, {
            hasElement: !!track.element,
            lightType: track.lightType,
            hasTarget: track.hasTarget
          });

          if (track.element) {
            const sprite = track.element.querySelector('.light-sprite');
            console.log(`스프라이트 찾기: ${lightId}`, !!sprite);
            if (sprite) {
              // 조명 객체의 UUID 찾기
              let lightUuid = null;
              console.log(`🔍 조명 UUID 찾기: ${lightId} (${track.lightType})`);

              if (track.lightType) {
                // scene에서 해당 타입의 조명 찾기
                this.editor.scene.traverse((object) => {
                  if (object.isLight && object.name === lightId) {
                    lightUuid = object.uuid;
                    console.log(`✅ 조명 UUID 저장: ${object.name} -> ${object.uuid}`);
                  }
                });

                if (!lightUuid) {
                  console.warn(`❌ 조명 객체를 찾을 수 없음: ${lightId}`);
                  // scene의 모든 조명 출력
                  const allLights = [];
                  this.editor.scene.traverse((object) => {
                    if (object.isLight) {
                      allLights.push({ name: object.name, uuid: object.uuid, type: object.type });
                    }
                  });
                  console.log("scene의 모든 조명:", allLights);
                }
              }

              // TimelineData에서 해당 조명의 키프레임 정보 가져오기
              const keyframeData = {};
              console.log(`🔍 키프레임 데이터 수집 시작: ${lightId} (${lightUuid})`);

              if (lightUuid && this.timelineData.tracks.has(lightUuid)) {
                const objectTracks = this.timelineData.tracks.get(lightUuid);
                console.log(`TimelineData에서 ${lightUuid} 트랙 찾음:`, objectTracks);
                console.log(`트랙 속성 개수:`, objectTracks.size);

                objectTracks.forEach((trackData, property) => {
                  // Spot/Directional 등 타겟이 있는 조명은 position을 타겟 트랙에서만 저장
                  if (track.hasTarget && property === 'position') {
                    console.log(`↩️ position은 타겟에 저장하므로 일반 조명에서는 스킵: ${lightUuid}`);
                    return;
                  }
                  console.log(`속성 ${property} 키프레임 개수:`, trackData.keyframeCount);
                  if (trackData.keyframeCount > 0) {
                    keyframeData[property] = {
                      times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
                      // Vector3 플랫 배열 기준으로 3채널 저장
                      values: Array.from(trackData.values.slice(0, trackData.keyframeCount * 3))
                    };
                    console.log(`✅ 키프레임 데이터 저장: ${lightUuid} ${property}`, keyframeData[property]);
                  } else {
                    console.log(`⚠️ 키프레임 없음: ${lightUuid} ${property}`);
                  }
                });
              } else {
                console.warn(`❌ TimelineData에서 ${lightUuid} 트랙을 찾을 수 없음`);
                console.log("TimelineData tracks 키들:", Array.from(this.timelineData.tracks.keys()));
              }

              lightTracksData[lightId] = {
                left: parseFloat(sprite.style.left) || 0,
                width: parseFloat(sprite.style.width) || 100,
                duration: parseFloat(sprite.dataset.duration) || 5,
                lightType: track.lightType,
                hasTarget: track.hasTarget,
                uuid: lightUuid, // 조명 객체의 UUID 저장
                keyframes: keyframeData // 키프레임 시간/값 데이터 저장
              };

              console.log(`✅ 조명 트랙 데이터 저장 완료: ${lightId}`, {
                lightType: track.lightType,
                uuid: lightUuid,
                keyframesCount: Object.keys(keyframeData).length
              });
            }
          }
        });

        // 타겟 트랙 정보 수집
        const targetTracksData = {};
        this.tracks.forEach((track, lightId) => {
          if (lightId.includes('_Target') && track.element) {
            const targetSprite = track.element.querySelector('.target-sprite');
            if (targetSprite) {
              // 타겟 객체의 UUID 찾기
              let targetUuid = null;
              const baseLightId = lightId.replace('_Target', '');
              this.editor.scene.traverse((object) => {
                if (object.isLight && object.name === baseLightId && object.target) {
                  targetUuid = object.target.uuid;
                  console.log(`타겟 UUID 저장: ${object.target.name} -> ${targetUuid}`);
                }
              });

              // TimelineData에서 타겟의 키프레임 정보 가져오기
              const keyframeData = {};
              if (targetUuid && this.timelineData.tracks.has(targetUuid)) {
                const objectTracks = this.timelineData.tracks.get(targetUuid);
                objectTracks.forEach((trackData, property) => {
                  if (trackData.keyframeCount > 0) {
                    keyframeData[property] = {
                      times: Array.from(trackData.times.slice(0, trackData.keyframeCount)),
                      values: Array.from(trackData.values.slice(0, trackData.keyframeCount * 3))
                    };
                    console.log(`타겟 키프레임 데이터 저장: ${targetUuid} ${property}`, keyframeData[property]);
                  }
                });
              }

              targetTracksData[lightId] = {
                left: parseFloat(targetSprite.style.left) || 0,
                width: parseFloat(targetSprite.style.width) || 100,
                duration: parseFloat(targetSprite.dataset.duration) || 5,
                uuid: targetUuid,
                keyframes: keyframeData
              };
            }
          }
        });

        // timelineData에 조명 트랙 정보 추가
        timelineData.lightTracks = lightTracksData;
        timelineData.targetTracks = targetTracksData;

        console.log("=== 최종 저장 데이터 ===");
        console.log("lightTracks 개수:", Object.keys(lightTracksData).length);
        console.log("lightTracks 키들:", Object.keys(lightTracksData));
        console.log("targetTracks 개수:", Object.keys(targetTracksData).length);

        // 데이터 크기 확인
        const timelineDataString = JSON.stringify(timelineData);
        console.log("timelineData 크기:", timelineDataString.length, "bytes");

        if (timelineDataString.length > 1000000) { // 1MB 제한
          console.warn("⚠️ timelineData가 너무 큽니다! 데이터를 정리합니다.");
          // 불필요한 데이터 제거
          Object.keys(timelineData.tracks).forEach(key => {
            if (timelineData.tracks[key] && timelineData.tracks[key].length === 0) {
              delete timelineData.tracks[key];
              console.log(`빈 트랙 제거: ${key}`);
            }
          });
        }

        console.log("최종 timelineData:", timelineData);

        this.editor.scene.userData.lightTimeline = timelineData;
        console.log("scene.userData.lightTimeline 설정 완료");
      } else {
        console.warn("scene 또는 timelineData가 없습니다");
      }
      console.log("=== LightTimeline onBeforeSave 완료 ===");
    } catch (error) {
      console.error("조명 타임라인 데이터 저장 중 오류:", error);
    }
  }

  // 저장 전 데이터 정리
  cleanupTimelineData() {
    console.log("=== TimelineData 정리 시작 ===");

    if (!this.timelineData) {
      console.log("timelineData가 없어서 정리할 수 없습니다.");
      return;
    }

    // 빈 트랙 제거
    const tracksToRemove = [];
    this.timelineData.tracks.forEach((objectTracks, objectUuid) => {
      const emptyProperties = [];
      objectTracks.forEach((trackData, property) => {
        if (trackData.keyframeCount === 0) {
          emptyProperties.push(property);
        }
      });

      // 모든 속성이 비어있으면 전체 객체 제거
      if (emptyProperties.length === objectTracks.size) {
        tracksToRemove.push(objectUuid);
        console.log(`빈 객체 제거: ${objectUuid}`);
      } else {
        // 빈 속성만 제거
        emptyProperties.forEach(property => {
          objectTracks.delete(property);
          console.log(`빈 속성 제거: ${objectUuid}.${property}`);
        });
      }
    });

    // 빈 객체들 제거
    tracksToRemove.forEach(objectUuid => {
      this.timelineData.tracks.delete(objectUuid);
    });

    console.log(`정리 완료: ${tracksToRemove.length}개 빈 객체 제거`);
  }

  // JSON 로드 후 호출되는 메서드 (Editor.js에서 호출됨)
  onAfterLoad() {
    console.log("=== LightTimeline onAfterLoad 시작 ===");

    try {
      console.log("=== LightTimeline onAfterLoad 시작 ===");
      const timelineData = this.editor.scene?.userData?.lightTimeline;
      // scene.userData에서 lightTimeline 데이터 확인
      if (this.editor.scene && this.editor.scene.userData && this.editor.scene.userData.lightTimeline) {
        console.log("scene.userData.lightTimeline 데이터 발견:", this.editor.scene.userData.lightTimeline);

        const timelineData = this.editor.scene.userData.lightTimeline;
        console.log("timelineData 전체:", timelineData);

        // 이 부분을 추가하세요
        if (!timelineData || !timelineData.lightTracks || Object.keys(timelineData.lightTracks).length === 0) {
          console.log("조명 타임라인 데이터가 없어서 복원을 건너뜁니다.");
          return;
        }

        // 조명 객체 생성 및 UI 복원 (순서 중요)
        console.log("🔄 조명 객체 생성 시작");
        this.recreateLightsFromSavedData(timelineData);

        // 조명 객체 생성 완료 후 UI 복원
        setTimeout(() => {
          console.log("🔄 UI 복원 시작");
          this.recreateUIFromSavedData(timelineData);
        }, 200); // 조명 객체 생성 완료 대기

        console.log("✅ LightTimeline onAfterLoad 완료");
      } else {
        console.warn("scene.userData.lightTimeline 데이터가 없습니다.");
      }

      // 저장된 데이터 상세 분석
      console.log("=== 저장된 데이터 상세 분석 ===");
      console.log("timelineData 타입:", typeof timelineData);
      console.log("timelineData 키들:", Object.keys(timelineData));

      if (timelineData.lightTracks) {
        console.log("lightTracks 존재:", !!timelineData.lightTracks);
        console.log("lightTracks 타입:", typeof timelineData.lightTracks);
        console.log("lightTracks 키들:", Object.keys(timelineData.lightTracks));
        console.log("lightTracks 개수:", Object.keys(timelineData.lightTracks).length);

        // 각 조명 트랙의 상세 정보
        Object.entries(timelineData.lightTracks).forEach(([lightId, trackData]) => {
          console.log(`🔍 조명 트랙 ${lightId}:`, {
            lightType: trackData.lightType,
            uuid: trackData.uuid,
            hasTarget: trackData.hasTarget,
            keyframesCount: Object.keys(trackData.keyframes || {}).length,
            keyframes: Object.keys(trackData.keyframes || {})
          });
        });
      } else {
        console.warn("❌ lightTracks가 없습니다!");
      }

      if (timelineData.targetTracks) {
        console.log("targetTracks 존재:", !!timelineData.targetTracks);
        console.log("targetTracks 키들:", Object.keys(timelineData.targetTracks));
        console.log("targetTracks 개수:", Object.keys(timelineData.targetTracks).length);
      } else {
        console.warn("❌ targetTracks가 없습니다!");
      }

      if (timelineData.tracks) {
        console.log("tracks 존재:", !!timelineData.tracks);
        console.log("tracks 키들:", Object.keys(timelineData.tracks));
        console.log("tracks 개수:", Object.keys(timelineData.tracks).length);
      } else {
        console.warn("❌ tracks가 없습니다!");
      }

      // tracks 데이터가 있는지 확인
      if (timelineData.tracks && Object.keys(timelineData.tracks).length > 0) {
        console.log("tracks 데이터 발견:", timelineData.tracks);

        // 저장된 현재 시간 복원
        if (timelineData.currentTime !== undefined) {
          this.currentTime = timelineData.currentTime;
          console.log(`저장된 현재 시간 복원: ${this.currentTime}s`);
        } else {
          console.log("저장된 현재 시간이 없어서 0으로 초기화");
          this.currentTime = 0;
        }

        // TimelineData 먼저 복원 (이벤트 리스너는 이미 설정됨)
        // 중복 방지를 위해 이벤트 리스너 일시 비활성화
        const originalOnKeyframeAdded = this.onKeyframeAdded;
        this.onKeyframeAdded = () => { }; // 빈 함수로 대체

        // tracks(UUID 기반 덤프)는 저장 시 1채널/형식 불일치가 있을 수 있어 로드시 무시
        const sanitizedData = { ...timelineData };
        if (sanitizedData.tracks) {
          console.log("🧹 로드시 tracks 제거 (lightTracks/targetTracks로 복원 예정)");
          delete sanitizedData.tracks;
        }
        this.timelineData.fromJSON(sanitizedData);
        console.log("TimelineData 기본 틀 복원 완료 (tracks 제외)");

        // 이벤트 리스너 복원
        this.onKeyframeAdded = originalOnKeyframeAdded;

        // scene의 조명이 로드되었는지 확인
        const sceneLights = [];
        this.editor.scene.traverse((object) => {
          if (object.isLight) {
            sceneLights.push(object);
          }
        });

        console.log(`scene에서 찾은 조명 개수: ${sceneLights.length}`);
        if (sceneLights.length > 0) {
          console.log("scene 조명들:", sceneLights.map(l => ({ name: l.name, uuid: l.uuid, type: l.type })));
        }

        // lightTracks/targetTracks 기반으로 TimelineData 트랙 재구성
        console.log("🔄 lightTracks/targetTracks로 TimelineData 재구성 시작");
        if (timelineData.lightTracks) {
          // 순서대로 TimelineData 복원
          const sortedLightIds = Object.keys(timelineData.lightTracks).sort((a, b) => {
            const aIndex = parseInt(a.replace('light_', ''));
            const bIndex = parseInt(b.replace('light_', ''));
            return aIndex - bIndex;
          });

          sortedLightIds.forEach((lightId) => {
            this.restoreKeyframeDataToTimelineData(lightId, timelineData);
          });
        }
        if (timelineData.targetTracks) {
          Object.keys(timelineData.targetTracks).forEach((targetId) => {
            this.restoreKeyframeDataToTimelineData(targetId, timelineData);
          });
        }
        console.log("✅ lightTracks/targetTracks 기반 TimelineData 재구성 완료");

        // 저장값 검증 및 보정: 로드된 트랙과 저장 데이터가 다르면 강제 동기화
        const verifyAndFix = (objectId, property, propertyData) => {
          const times = propertyData?.times || [];
          const values = propertyData?.values || [];
          if (times.length === 0) return;

          let track = this.timelineData.getTrackById(objectId, property);
          // 필요시 UUID로 보강
          if (!track) {
            const obj = this.editor.scene.getObjectByName(objectId);
            if (obj) {
              track = this.timelineData.getTrackByUuid(obj.uuid, property);
              if (track) {
                if (!this.timelineData.tracksById.has(objectId)) this.timelineData.tracksById.set(objectId, new Map());
                this.timelineData.tracksById.get(objectId).set(property, track);
              }
            }
          }

          const needsFix = !track || track.getKeyframeCount() !== times.length;
          if (!needsFix && track) {
            // 값 대조 (첫 두 키만 간단 비교)
            const a0 = track.values[0];
            const b0 = Array.isArray(values) && values.length >= 1 ? values[0] : undefined;
            if (b0 !== undefined && a0 !== b0) {
              track.__mismatch = true;
            }
          }

          if (!track || needsFix || track.__mismatch) {
            const obj = this.editor.scene.getObjectByName(objectId);
            let targetTrack = track;
            if (!targetTrack && obj) {
              targetTrack = this.timelineData.addTrack(obj.uuid, property, objectId);
            }
            if (!targetTrack) return;
            // 초기화 후 재주입
            for (let i = targetTrack.getKeyframeCount() - 1; i >= 0; i--) targetTrack.removeKeyframeByIndex(i);
            for (let i = 0; i < times.length; i++) {
              let v;
              if (Array.isArray(values) && values.length === times.length * 3 && typeof values[0] === 'number') {
                const base = i * 3;
                v = new THREE.Vector3(values[base] || 0, values[base + 1] || 0, values[base + 2] || 0);
              } else {
                const val = values[i];
                if (val && typeof val === 'object' && 'x' in val) v = new THREE.Vector3(val.x, val.y, val.z);
                else if (typeof val === 'number') v = new THREE.Vector3(val, 0, 0);
                else v = new THREE.Vector3();
              }
              targetTrack.addKeyframe(times[i], v);
            }
            if (!this.timelineData.tracksById.has(objectId)) this.timelineData.tracksById.set(objectId, new Map());
            this.timelineData.tracksById.get(objectId).set(property, targetTrack);
          }
        };

        // 조명/타겟 각각 검증
        if (timelineData.lightTracks) {
          Object.entries(timelineData.lightTracks).forEach(([lightId, data]) => {
            const keyframes = data?.keyframes || {};
            Object.entries(keyframes).forEach(([prop, pd]) => {
              // Spot/Directional의 position은 타겟에 저장되므로 건너뜀
              if ((data?.hasTarget) && prop === 'position') return;
              verifyAndFix(lightId, prop, pd);
            });
          });
        }

        if (timelineData.targetTracks) {
          Object.entries(timelineData.targetTracks).forEach(([targetId, data]) => {
            const pd = data?.keyframes?.position;
            if (pd) verifyAndFix(targetId, 'position', pd);
          });
        }

      } else {
        console.warn("scene.userData.lightTimeline이 없습니다");
        console.log("this.editor.scene:", this.editor.scene);
        console.log("this.editor.scene.userData:", this.editor.scene?.userData);
      }

    } catch (error) {
      console.error("onAfterLoad 실행 중 오류:", error);
    }
  }

  // 저장된 조명 데이터로부터 조명 객체 생성
  recreateLightsFromSavedData(timelineData) {
    console.log("=== 저장된 조명 데이터로부터 조명 객체 생성 시작 ===");
    console.log("timelineData:", timelineData);

    if (timelineData.lightTracks) {
      const savedLightTracks = Object.entries(timelineData.lightTracks);
      console.log(`저장된 조명 트랙 개수: ${savedLightTracks.length}`);
      console.log("저장된 조명 트랙들:", savedLightTracks);

      if (savedLightTracks.length === 0) {
        console.warn("⚠️ 저장된 조명 트랙이 없습니다!");
        console.log("timelineData.lightTracks 내용:", timelineData.lightTracks);
        return;
      }

      // 저장된 순서대로 조명 생성 (순서 보장)
      const sortedLightTracks = savedLightTracks.sort((a, b) => {
        const aIndex = parseInt(a[0].replace('light_', ''));
        const bIndex = parseInt(b[0].replace('light_', ''));
        return aIndex - bIndex;
      });

      sortedLightTracks.forEach(([trackKey, trackData], index) => {
        console.log(`처리 중인 트랙 ${index}:`, { trackKey, trackData });

        const lightId = trackKey;
        const lightType = trackData.lightType;

        if (!lightId || !lightType) {
          console.warn(`trackKey ${trackKey}에 uuid 또는 lightType이 없습니다.`);
          return;
        }

        // 이미 존재하는 조명인지 확인
        const existingLight = this.editor.scene.getObjectByName(lightId);
        if (existingLight) {
          console.log(`✅ 조명이 이미 존재함: ${lightId} (${lightType})`);
          return;
        }

        console.log(`🔄 조명 객체 생성: ${lightId} (${lightType})`);

        // 조명 위치 계산 (2행 5열 그리드)
        const row = Math.floor(index / 5);
        const col = index % 5;

        // 조명 객체 생성
        this.createAndPlaceLight(lightId, row, col, lightType);

        console.log(`✅ 조명 객체 생성 완료: ${lightId} (${lightType}) at (${row}, ${col})`);
      });
    } else {
      console.warn("timelineData.lightTracks가 없습니다!");
      console.log("timelineData의 모든 키:", Object.keys(timelineData));
    }
  }

  // 저장된 데이터로부터 UI 재생성
  recreateUIFromSavedData(timelineData) {
    console.log("=== 조명 UI 재생성 시작 ===");
    console.log("timelineData:", timelineData);

    // 저장된 조명 데이터만 복원 (빈 트랙에 순서대로 할당)
    if (timelineData.lightTracks) {
      const savedLightTracks = Object.entries(timelineData.lightTracks);
      console.log(`저장된 조명 트랙 개수: ${savedLightTracks.length}`);

      // 저장된 순서대로 조명 복원 (순서 보장)
      const sortedLightTracks = savedLightTracks.sort((a, b) => {
        const aIndex = parseInt(a[0].replace('light_', ''));
        const bIndex = parseInt(b[0].replace('light_', ''));
        return aIndex - bIndex;
      });

      sortedLightTracks.forEach(([trackKey, trackData], index) => {
        const lightId = trackKey; // trackKey를 그대로 사용 (light_0, light_1 등)
        const lightType = trackData.lightType;
        if (!lightId || !lightType) {
          console.warn(`trackKey ${trackKey}에 uuid 또는 lightType이 없습니다.`);
          return;
        }

        console.log(`조명 ${index + 1}/${sortedLightTracks.length} 복원: ${lightId} (${lightType})`);

        // lightId에 해당하는 정확한 트랙을 찾기
        const targetTrack = this.tracks.get(lightId);
        if (targetTrack && targetTrack.element) {
          const selectElement = targetTrack.element.querySelector('select');
          if (selectElement) {
            // select 값을 저장된 lightType으로 설정하고 change 이벤트 발생
            selectElement.value = lightType;
            selectElement.dispatchEvent(new Event('change'));
            console.log(`✅ 트랙 ${lightId}에 조명 타입 ${lightType} 선택 및 이벤트 발생`);

            // 키프레임 데이터 복원 (TimelineData와 UI 모두)
            setTimeout(() => {
              console.log(`=== recreateUIFromSavedData에서 키프레임 복원 호출 ===`);
              console.log(`트랙 인덱스: ${index}`);
              console.log(`조명 ID: ${lightId}`);
              console.log(`트랙 요소:`, targetTrack.element);

              // 1. TimelineData에 키프레임 데이터 복원 (애니메이션용)
              console.log(`🔄 TimelineData 복원 호출: ${lightId}`);
              this.restoreKeyframeDataToTimelineData(lightId, timelineData);

              // 2. 키프레임 UI 복원 (시각적 표시용)
              console.log(`🔄 키프레임 UI 복원 호출: ${lightId}`);
              this.restoreKeyframesUI(targetTrack.element, lightId, timelineData);
            }, 100); // 약간의 지연을 주어 클립 생성 완료 후 실행
          } else {
            console.warn(`트랙 ${lightId}에서 select 요소를 찾을 수 없습니다.`);
          }
        } else {
          console.warn(`트랙 ${lightId}를 찾을 수 없습니다.`);
          console.log(`사용 가능한 트랙들:`, Array.from(this.tracks.keys()));
        }
      });
    }

    // 타겟 트랙의 키프레임도 복원
    if (timelineData.targetTracks) {
      console.log("=== 타겟 트랙 키프레임 복원 시작 ===");
      Object.entries(timelineData.targetTracks).forEach(([targetKey, targetData]) => {
        console.log(`타겟 트랙 처리: ${targetKey}`, targetData);

        // 타겟 트랙 요소 찾기
        const targetTrackElement = this.container.querySelector(`[data-object-id="${targetKey}"]`);
        if (targetTrackElement) {
          // 타겟 키프레임의 경우 targetKey를 그대로 사용 (light_0_Target 형태)
          console.log(`✅ 타겟 트랙 요소 찾음: ${targetKey}`);

          setTimeout(() => {
            // 1. TimelineData에 타겟 키프레임 데이터 복원 (애니메이션용)
            console.log(`🔄 타겟 TimelineData 복원 호출: ${targetKey}`);
            this.restoreKeyframeDataToTimelineData(targetKey, timelineData);

            // 2. 타겟 키프레임 UI 복원 (시각적 표시용)
            console.log(`🔄 타겟 키프레임 UI 복원 호출: ${targetKey}`);
            this.restoreKeyframesUI(targetTrackElement, targetKey, timelineData);
          }, 200); // 일반조명보다 더 긴 지연을 주어 순서 보장
        } else {
          console.warn(`❌ 타겟 트랙 요소를 찾을 수 없음: ${targetKey}`);
        }
      });
    }
  }

  // 조명 트랙 데이터 복원
  restoreLightTrackData(trackElement, trackData) {
    const sprite = trackElement.querySelector('.light-sprite');
    if (sprite) {
      sprite.style.left = `${trackData.left}%`;
      sprite.style.width = `${trackData.width}%`;
      sprite.dataset.duration = trackData.duration.toString();
    }
  }

  // 타겟 트랙 데이터 복원
  restoreTargetTrackData(trackElement, trackData) {
    const targetSprite = trackElement.querySelector('.target-sprite');
    if (targetSprite) {
      targetSprite.style.left = `${trackData.left}%`;
      targetSprite.style.width = `${trackData.width}%`;
      targetSprite.dataset.duration = trackData.duration.toString();
    }
  }

  // UUID에서 조명 이름 추출
  extractLightNameFromUUID(uuid) {
    // 씬의 모든 조명을 순회하면서 UUID가 일치하는 조명의 이름을 찾기
    let foundLightName = null;
    this.editor.scene.traverse((object) => {
      if (object.isLight && object.uuid === uuid) {
        foundLightName = object.name;
        console.log(`UUID ${uuid}에 해당하는 조명 발견: ${object.name}`);
      }
    });
    return foundLightName;
  }

  // TimelineData에 키프레임 데이터 복원
  // TimelineData에 키프레임 데이터 복원
  restoreKeyframeDataToTimelineData(lightId, timelineData) {
    console.log(`=== TimelineData에 키프레임 데이터 복원 시작: ${lightId} ===`);
    console.log(`전체 timelineData:`, timelineData);

    // 타겟 키프레임인지 확인 (lightId가 _Target으로 끝나는 경우)
    const isTargetKeyframe = lightId.endsWith('_Target');

    let savedTrackData = null; // This will hold the data from scene.userData.lightTimeline
    let objectInScene = null; // This will hold the actual THREE.Light or THREE.Object3D from the current scene

    if (isTargetKeyframe) {
      // For target keyframes, the lightId is already the target's name (e.g., 'light_0_Target')
      // We need to find the corresponding target object in the scene.
      objectInScene = this.editor.scene.getObjectByName(lightId);
      if (!objectInScene) {
        console.warn(`❌ 타겟 객체를 찾을 수 없음: ${lightId}`);
        return;
      }

      // Get saved data for this target from timelineData.targetTracks
      if (timelineData.targetTracks && timelineData.targetTracks[lightId]) {
        savedTrackData = timelineData.targetTracks[lightId];
        console.log(`targetTracks에서 타겟 데이터 찾음: ${lightId}`, savedTrackData);
      } else {
        console.warn(`❌ 저장된 타겟 데이터를 찾을 수 없음: ${lightId}`);
        return;
      }
    } else {
      // For regular light keyframes, lightId is 'light_0', 'light_1', etc.
      // We need to find the corresponding light object in the scene.
      objectInScene = this.editor.scene.getObjectByName(lightId);
      if (!objectInScene) {
        console.warn(`❌ 조명 객체를 찾을 수 없음: ${lightId}`);
        return;
      }

      // Get saved data for this light from timelineData.lightTracks
      if (timelineData.lightTracks && timelineData.lightTracks[lightId]) {
        savedTrackData = timelineData.lightTracks[lightId];
        console.log(`lightTracks에서 조명 데이터 찾음: ${lightId}`, savedTrackData);
      } else {
        // lightId가 light_0, light_1 형태가 아닌 경우를 대비하여 다른 키로도 찾아보기
        const alternativeKeys = Object.keys(timelineData.lightTracks || {}).filter(key =>
          key.includes(lightId) || lightId.includes(key)
        );

        if (alternativeKeys.length > 0) {
          console.log(`대안 키로 조명 데이터 찾기 시도: ${alternativeKeys}`);
          for (const altKey of alternativeKeys) {
            if (timelineData.lightTracks[altKey]) {
              savedTrackData = timelineData.lightTracks[altKey];
              console.log(`대안 키로 조명 데이터 찾음: ${altKey} -> ${lightId}`, savedTrackData);
              break;
            }
          }
        }

        if (!savedTrackData) {
          console.warn(`❌ 저장된 조명 데이터를 찾을 수 없음: ${lightId}`);
          console.log(`사용 가능한 lightTracks 키들:`, Object.keys(timelineData.lightTracks || {}));
          return;
        }
      }
    }

    const keyframesData = savedTrackData.keyframes || {};
    console.log(`키프레임 데이터:`, keyframesData);

    // Iterate through properties and restore keyframes to this.timelineData
    Object.entries(keyframesData).forEach(([property, propertyData]) => {
      console.log(`속성 ${property} TimelineData 복원 중:`, propertyData);

      const times = propertyData.times || [];
      const values = propertyData.values || [];

      if (times.length === 0 || values.length === 0) {
        console.log(`속성 ${property}에 키프레임 데이터가 없음`);
        return;
      }

      // Get or create TrackData in this.timelineData using the *actual UUID* of the object in the scene
      let timelineTrackData = this.timelineData.getTrackByUuid(objectInScene.uuid, property);
      console.log(`TimelineData 트랙 찾기 (UUID: ${objectInScene.uuid}, Property: ${property}):`, timelineTrackData ? '찾음' : '없음');

      if (!timelineTrackData) {
        console.log(`TimelineData에 트랙이 없어서 생성: ${objectInScene.name} ${property}`);
        const objectIdForIdMap = isTargetKeyframe ? lightId : `${lightId}_${property}`;
        timelineTrackData = this.timelineData.addTrack(objectInScene.uuid, property, objectIdForIdMap);
        console.log(`트랙 추가 결과 (UUID: ${objectInScene.uuid}, Property: ${property}, ID: ${objectIdForIdMap})`, timelineTrackData);
      } else {
        // 기존 트랙이어도 ID 매핑이 없을 수 있으니 보강
        const objectIdForIdMap = isTargetKeyframe ? lightId : `${lightId}_${property}`;
        if (!this.timelineData.tracksById.has(objectIdForIdMap) || !this.timelineData.tracksById.get(objectIdForIdMap).has(property)) {
          if (!this.timelineData.tracksById.has(objectIdForIdMap)) {
            this.timelineData.tracksById.set(objectIdForIdMap, new Map());
          }
          this.timelineData.tracksById.get(objectIdForIdMap).set(property, timelineTrackData);
          console.log(`ID 매핑 보강: ${objectIdForIdMap}.${property}`);
        }
      }

      // Clear existing keyframes in the timelineTrackData before adding new ones
      for (let i = timelineTrackData.getKeyframeCount() - 1; i >= 0; i--) {
        timelineTrackData.removeKeyframeByIndex(i);
      }

      // Add saved keyframes to timelineTrackData (플랫 배열/개별 배열/객체 모두 지원)
      times.forEach((time, index) => {
        let vectorValue = null;

        if (Array.isArray(values)) {
          // 플랫 배열 형태인지 검사
          if (values.length === times.length * 3 && typeof values[0] === 'number') {
            const vx = values[index * 3];
            const vy = values[index * 3 + 1];
            const vz = values[index * 3 + 2];
            vectorValue = new THREE.Vector3(vx, vy, vz);
          } else {
            // per-keyframe 배열 (예: [[x,y,z], ...])
            const v = values[index];
            if (Array.isArray(v)) {
              vectorValue = new THREE.Vector3(v[0] || 0, v[1] || 0, v[2] || 0);
            } else if (typeof v === 'number') {
              vectorValue = new THREE.Vector3(v, 0, 0);
            } else if (v && typeof v === 'object' && 'x' in v && 'y' in v && 'z' in v) {
              vectorValue = new THREE.Vector3(v.x, v.y, v.z);
            }
          }
        } else if (typeof values === 'number') {
          vectorValue = new THREE.Vector3(values, 0, 0);
        } else if (values && typeof values === 'object' && 'x' in values && 'y' in values && 'z' in values) {
          vectorValue = new THREE.Vector3(values.x, values.y, values.z);
        }

        if (!vectorValue) {
          console.warn(`지원하지 않는 값 형태. time=${time}, index=${index}, values=`, values);
          return;
        }

        const success = timelineTrackData.addKeyframe(time, vectorValue);
        if (success) {
          console.log(`✅ TimelineData에 키프레임 추가: ${objectInScene.name} ${property} at ${time} = ${vectorValue.x},${vectorValue.y},${vectorValue.z}`);
        } else {
          console.warn(`❌ TimelineData에 키프레임 추가 실패: ${objectInScene.name} ${property} at ${time}`);
        }
      });

      console.log(`✅ 속성 ${property} TimelineData 복원 완료: ${timelineTrackData.getKeyframeCount()}개 키프레임`);
    });

    this.timelineData.dirty = true;
    console.log(`✅ TimelineData 복원 완료: ${lightId}`);
  }

  // 키프레임 UI 복원
  restoreKeyframesUI(trackElement, lightId, timelineData) {
    console.log(`=== 키프레임 UI 복원 시작: ${lightId} ===`);
    console.log(`trackElement:`, trackElement);
    console.log(`lightId:`, lightId);
    console.log(`timelineData keys:`, Object.keys(timelineData.tracks || {}));

    // trackElement에서 스프라이트 찾기
    let targetSprite = trackElement.querySelector('.light-sprite');
    if (!targetSprite) {
      targetSprite = trackElement.querySelector('.target-sprite');
    }

    if (!targetSprite) {
      console.warn(`스프라이트를 찾을 수 없습니다: ${lightId}`);
      return;
    }

    // lightTracks에서 해당 조명의 키프레임 데이터 찾기
    let lightTrackData = null;
    if (timelineData.lightTracks && timelineData.lightTracks[lightId]) {
      lightTrackData = timelineData.lightTracks[lightId];
      console.log(`lightTracks에서 조명 데이터 찾음: ${lightId}`, lightTrackData);
    } else {
      // lightId가 light_0, light_1 형태가 아닌 경우를 대비하여 다른 키로도 찾아보기
      const alternativeKeys = Object.keys(timelineData.lightTracks || {}).filter(key =>
        key.includes(lightId) || lightId.includes(key)
      );

      if (alternativeKeys.length > 0) {
        console.log(`대안 키로 조명 데이터 찾기 시도: ${alternativeKeys}`);
        for (const altKey of alternativeKeys) {
          if (timelineData.lightTracks[altKey]) {
            lightTrackData = timelineData.lightTracks[altKey];
            console.log(`대안 키로 조명 데이터 찾음: ${altKey} -> ${lightId}`, lightTrackData);
            break;
          }
        }
      }

      if (!lightTrackData) {
        console.log(`lightTracks에서 조명 데이터를 찾지 못함: ${lightId}`);
        console.log(`사용 가능한 lightTracks 키들:`, Object.keys(timelineData.lightTracks || {}));
        return;
      }
    }

    // keyframes 객체에서 속성별 키프레임 데이터 추출
    const keyframesData = lightTrackData.keyframes || {};
    console.log(`키프레임 데이터:`, keyframesData);

    // 각 속성별로 키프레임 처리
    Object.entries(keyframesData).forEach(([property, propertyData]) => {
      console.log(`속성 ${property} 처리 중:`, propertyData);

      const times = propertyData.times || [];
      const values = propertyData.values || [];

      console.log(`시간 배열:`, times);
      console.log(`값 배열:`, values);

      // position 속성은 타겟 트랙에, 나머지는 조명 트랙에 생성
      const isTargetProperty = property === 'position';
      const targetLightId = isTargetProperty ? `${lightId}_Target` : lightId;
      let targetTrack = this.tracks.get(targetLightId);

      if (!targetTrack || !targetTrack.element) {
        console.warn(`트랙을 찾을 수 없음: ${targetLightId}`);
        // 대안으로 다른 트랙에서 찾아보기
        const alternativeTrack = Array.from(this.tracks.values()).find(track =>
          track.element && track.element.querySelector(isTargetProperty ? '.target-sprite' : '.light-sprite')
        );
        if (alternativeTrack) {
          console.log(`대안 트랙 사용: ${targetLightId} -> ${alternativeTrack.objectId || 'unknown'}`);
          // 대안 트랙을 사용하도록 업데이트
          targetTrack = alternativeTrack;
        } else {
          return;
        }
      }

      const targetSprite = isTargetProperty
        ? targetTrack.element.querySelector('.target-sprite')
        : targetTrack.element.querySelector('.light-sprite');

      if (!targetSprite) {
        console.warn(`스프라이트를 찾을 수 없음: ${targetLightId}`);
        return;
      }

      console.log(`${property} 키프레임을 ${targetLightId}에 생성 (${times.length}개)`);

      // 각 시간에 대해 키프레임 생성
      times.forEach((time, index) => {
        const value = values[index];

        // 같은 시간에 키프레임이 이미 존재하는지 확인
        const existingKeyframeAtTime = targetSprite.querySelector(`[data-time="${time.toFixed(2)}"]`);
        if (existingKeyframeAtTime) {
          console.log(`같은 시간에 키프레임이 이미 존재합니다: ${targetLightId} ${property} at ${time}`);
          return; // Do not create new UI, rely on existing one
        }

        // 키프레임 UI 요소 생성
        const keyframeElement = this.addKeyframeUI(targetLightId, property, time, index);

        if (keyframeElement) {
          // 키프레임에 이벤트 리스너 등록 (addKeyframeUI에서 이미 추가되었지만 확실히 하기 위해)
          this.makeKeyframeDraggable(keyframeElement, targetTrack, time, property);

          // 클릭 이벤트가 제대로 연결되었는지 확인하고 필요시 재연결
          const hasClickEvent = keyframeElement.onclick || keyframeElement._clickListener;
          if (!hasClickEvent) {
            console.log(`클릭 이벤트 재연결: ${targetLightId} ${property} at ${time}`);
            keyframeElement.addEventListener("click", (e) => {
              e.stopPropagation();

              // 타겟 키프레임과 조명 키프레임 구분하여 lightId 생성
              let timelineDataLightId;
              if (targetLightId.includes('_Target')) {
                timelineDataLightId = targetLightId;
              } else {
                timelineDataLightId = `${targetLightId}_${property}`;
              }

              this.selectKeyframe(timelineDataLightId, time, keyframeElement, property);
            });
          }

          console.log(`✅ 키프레임 생성 완료: ${targetLightId} ${property} at ${time} = ${value}`);
        } else {
          console.warn(`❌ 키프레임 생성 실패: ${targetLightId} ${property} at ${time}`);
        }
      });
    });

    // 키프레임 복원 완료 후 이벤트 연결 상태 확인
    console.log(`✅ 키프레임 UI 복원 완료: ${lightId}`);
    setTimeout(() => {
      this.checkKeyframeEventConnections();
    }, 100);
  }

  // 키프레임 선택 처리
  selectKeyframe(lightId, time, keyframeElement, propertyName) {
    console.log("🎯 === LightTimeline selectKeyframe 시작 ===", {
      lightId,
      time,
      propertyName,
      keyframeElement: keyframeElement ? '존재함' : 'null',
      keyframeElementClasses: keyframeElement ? keyframeElement.className : 'N/A'
    });

    // 클립 범위 체크 - 클립 밖의 키프레임은 선택하지 않음 (허용 범위 추가)
    if (keyframeElement) {
      const sprite = keyframeElement.closest('.light-sprite');
      if (sprite) {
        const spriteLeft = parseFloat(sprite.style.left) || 0;
        const clipStartTime = (spriteLeft / 100) * this.options.totalSeconds;
        const clipDuration = parseFloat(sprite.dataset.duration) || 5;
        const clipEndTime = clipStartTime + clipDuration;

        // 허용 범위 추가
        const tolerance = LightTimeline.CLIP_RANGE_TOLERANCE;
        if (time !== 0 && (time < clipStartTime - tolerance || time > clipEndTime + tolerance)) {
          console.log("클립 범위 밖의 키프레임이므로 선택하지 않습니다:", {
            time,
            clipStartTime,
            clipEndTime,
            tolerance
          });
          return;
        }
      }
    }

    // TimelineData에서 키프레임 데이터 가져오기
    let trackData = this.timelineData.getTrackById(lightId, propertyName);
    if (!trackData) {
      const object = this.editor.scene.getObjectByName(lightId);
      if (object) {
        trackData = this.timelineData.getTrackByUuid(object.uuid, propertyName);
      }
    }

    if (!trackData) {
      console.warn("트랙 데이터를 찾을 수 없습니다:", { lightId, propertyName });
      return;
    }

    const keyframeIndex = trackData.findKeyframeIndex(time);
    if (keyframeIndex === -1) {
      console.warn("키프레임을 찾을 수 없습니다:", { time, lightId, propertyName });
      return;
    }

    const bridge = this.editor.timeline?.selectionBridge;
    bridge?.clearKeyframeAndClipSelection();

    // 새로운 키프레임 선택
    if (keyframeElement) {
      keyframeElement.classList.add('selected');
      keyframeElement.style.backgroundColor = "#ff0";
    }

    // 키프레임 값 가져오기
    const value = {
      x: trackData.values[keyframeIndex * 3],
      y: trackData.values[keyframeIndex * 3 + 1],
      z: trackData.values[keyframeIndex * 3 + 2]
    };

    // 선택된 키프레임 정보 저장 (메모리)
    this.selectedKeyframe = {
      lightId,
      index: keyframeIndex,
      time,
      property: propertyName,
      value,
      element: keyframeElement
    };

    // 선택된 키프레임 정보를 scene.userData에 저장 (MotionTimeline과 동일한 방식)
    if (!this.editor.scene.userData) {
      this.editor.scene.userData = {};
    }
    this.editor.scene.userData.lightTimeline = this.editor.scene.userData.lightTimeline || {};
    this.editor.scene.userData.lightTimeline.selectedKeyframe = {
      lightId,
      index: keyframeIndex,
      time,
      property: propertyName,
      value: {
        x: value.x,
        y: value.y,
        z: value.z
      }
    };

    console.log("선택된 키프레임 데이터 (메모리):", this.selectedKeyframe);
    console.log("선택된 키프레임 데이터 (scene.userData):", this.editor.scene.userData.lightTimeline.selectedKeyframe);

    // 키프레임 선택 시 부모 클립도 함께 선택
    if (keyframeElement) {
      // 키프레임이 속한 클립(스프라이트) 찾기 - 타겟과 조명 구분
      let sprite = null;
      if (lightId.includes('_Target')) {
        // 타겟 키프레임인 경우 타겟 스프라이트 찾기
        // lightId가 'light_0_Target' 형태이므로 직접 타겟 스프라이트 찾기
        const targetSprite = document.querySelector(`[data-object-id="${lightId}"] .target-sprite`);
        if (targetSprite) {
          sprite = targetSprite;
          console.log("키프레임 선택 - 타겟 스프라이트 찾음:", sprite);
        } else {
          // fallback: closest로 찾기
          sprite = keyframeElement.closest('.target-sprite');
          console.log("키프레임 선택 - fallback으로 타겟 스프라이트 찾기:", sprite);
        }

        // 스프라이트를 찾지 못한 경우 다른 방법으로 시도
        if (!sprite) {
          // keyframeElement의 부모 요소들을 탐색하여 target-sprite 찾기
          let parent = keyframeElement.parentElement;
          while (parent && !sprite) {
            if (parent.classList.contains('target-sprite')) {
              sprite = parent;
              console.log("키프레임 선택 - 부모 탐색으로 타겟 스프라이트 찾음:", sprite);
              break;
            }
            parent = parent.parentElement;
          }
        }
      } else {
        // 조명 키프레임인 경우 조명 스프라이트 찾기
        // lightId가 'light_0_intensity' 형태이므로 base light ID 추출
        const baseLightId = lightId.split('_').slice(0, 2).join('_'); // 'light_0_intensity' -> 'light_0'
        console.log("키프레임 선택 - 조명 스프라이트 찾기 시도:", {
          originalLightId: lightId,
          baseLightId: baseLightId
        });

        // base light ID로 조명 스프라이트 찾기
        const lightSprite = document.querySelector(`[data-object-id="${baseLightId}"] .light-sprite`);
        if (lightSprite) {
          sprite = lightSprite;
          console.log("키프레임 선택 - 조명 스프라이트 찾음:", sprite);
        } else {
          // fallback: closest로 찾기
          sprite = keyframeElement.closest('.light-sprite');
          console.log("키프레임 선택 - fallback으로 조명 스프라이트 찾기:", sprite);
        }

        // 스프라이트를 찾지 못한 경우 다른 방법으로 시도
        if (!sprite) {
          // keyframeElement의 부모 요소들을 탐색하여 light-sprite 찾기
          let parent = keyframeElement.parentElement;
          while (parent && !sprite) {
            if (parent.classList.contains('light-sprite')) {
              sprite = parent;
              console.log("키프레임 선택 - 부모 탐색으로 조명 스프라이트 찾음:", sprite);
              break;
            }
            parent = parent.parentElement;
          }
        }
      }

      if (sprite) {
        console.log("키프레임 선택 - 부모 클립 찾음:", sprite);
        // 공통 selectClip 메서드 사용
        const selectResult = this.selectClip(sprite, { fromKeyframe: true });
        console.log("키프레임 선택 - selectClip 결과:", selectResult);
      } else {
        console.warn("키프레임 선택 - 부모 클립을 찾을 수 없음:", {
          keyframeElement: keyframeElement,
          keyframeClasses: keyframeElement.className,
          lightId: lightId,
          isTarget: lightId.includes('_Target')
        });
      }
    }

    // playhead를 키프레임 시간 위치로 이동
    this.movePlayheadToTime(time);

    // 키프레임 값으로 객체 속성 업데이트
    // selectClip에서 선택된 객체를 사용
    if (this.selectedObject) {
      this.setPropertyValueFromKeyframe(this.selectedObject, propertyName, value);
    } else {
      console.warn("키프레임 선택 시 객체가 선택되지 않음:", {
        lightId,
        propertyName,
        selectedObject: this.selectedObject
      });
    }
  }

  // 키프레임 값으로 객체 속성 업데이트
  setPropertyValueFromKeyframe(object, propertyName, value) {
    if (!object || !value) return;

    if (object.name.includes('_Target')) {
      // 타겟 객체인 경우 position만 업데이트
      if (propertyName === 'position') {
        object.position.set(value.x, value.y, value.z);
      }
    } else {
      // 조명 객체인 경우 해당 속성 업데이트
      switch (propertyName) {
        case 'intensity':
          object.intensity = value.x;
          break;
        case 'color':
          object.color.setRGB(value.x, value.y, value.z);
          break;
        case 'position':
          object.position.set(value.x, value.y, value.z);
          break;
        case 'distance':
          object.distance = value.x;
          break;
        case 'angle':
          object.angle = value.x;
          break;
        case 'penumbra':
          object.penumbra = value.x;
          break;
        case 'decay':
          object.decay = value.x;
          break;
      }
    }

    // 객체 변경 시그널 발생 (fromTimeline 플래그로 무한 루프 방지)
    if (this.editor.signals?.objectChanged) {
      this.editor.signals.objectChanged.dispatch(object, { fromTimeline: true, fromAnimation: true });
    }
  }

  // 선택된 키프레임 값 업데이트
  updateSelectedKeyframeValue(lightId, propertyName, newValue) {
    // console.log("=== updateSelectedKeyframeValue 시작 ===", {
    //   lightId,
    //   propertyName,
    //   newValue,
    //   selectedKeyframe: this.selectedKeyframe
    // });

    if (!this.selectedKeyframe) {
      // console.warn("선택된 키프레임이 없음");
      return;
    }

    // 선택된 키프레임의 lightId와 업데이트하려는 lightId가 일치하는지 확인
    const selectedLightId = this.selectedKeyframe.lightId;
    const expectedLightId = lightId.includes('_Target') ? lightId : `${lightId.split('_').slice(0, 2).join('_')}_${propertyName}`;

    if (selectedLightId !== expectedLightId) {
      console.warn("선택된 키프레임과 lightId 불일치:", {
        selectedLightId,
        expectedLightId,
        propertyName
      });
      return;
    }

    // console.log("=== 선택된 키프레임 값 업데이트 시작 ===", {
    //   lightId,
    //   propertyName,
    //   newValue,
    //   selectedKeyframe: this.selectedKeyframe
    // });

    // TimelineData에서 트랙 찾기
    // console.log("트랙 찾기 시도:", { lightId, propertyName });
    let trackData = this.timelineData.getTrackById(lightId, propertyName);
    if (!trackData) {
      // console.log("ID 기반으로 트랙을 찾지 못함, fallback 시도");
      // fallback: base light ID로 찾기 시도
      const baseLightId = lightId.split('_').slice(0, 2).join('_'); // 'light_0_intensity' -> 'light_0'
      const object = this.editor.scene.getObjectByName(baseLightId);
      if (object) {
        trackData = this.timelineData.getTrackByUuid(object.uuid, propertyName);
        // console.log("UUID 기반으로 트랙 찾기 시도:", { baseLightId, objectUuid: object.uuid, found: !!trackData });
      }
    } else {
      // console.log("ID 기반으로 트랙 찾음:", { lightId, propertyName });
    }

    if (!trackData) {
      // console.warn("트랙을 찾을 수 없습니다:", { lightId, propertyName });
      return;
    }

    // 값 타입에 따라 Vector3로 변환
    let vectorValue;
    if (typeof newValue === 'number') {
      vectorValue = new THREE.Vector3(newValue, 0, 0);
      console.log("숫자 값을 Vector3로 변환:", { original: newValue, converted: vectorValue });
    } else if (newValue instanceof THREE.Color) {
      vectorValue = new THREE.Vector3(newValue.r, newValue.g, newValue.b);
      console.log("Color 값을 Vector3로 변환:", { original: newValue, converted: vectorValue });
    } else if (newValue instanceof THREE.Vector3) {
      vectorValue = newValue.clone();
      console.log("Vector3 값 복사:", { original: newValue, converted: vectorValue });
    } else if (newValue && typeof newValue === 'object' && 'x' in newValue && 'y' in newValue && 'z' in newValue) {
      // {x, y, z} 형태의 객체를 Vector3로 변환
      vectorValue = new THREE.Vector3(newValue.x, newValue.y, newValue.z);
      console.log("객체 값을 Vector3로 변환:", { original: newValue, converted: vectorValue });
    } else {
      console.warn('지원하지 않는 값 타입:', typeof newValue, newValue);
      return;
    }

    // 선택된 키프레임의 값 업데이트
    // console.log("키프레임 값 업데이트 시도:", {
    //   index: this.selectedKeyframe.index,
    //   vectorValue,
    //   trackDataExists: !!trackData
    // });

    const success = trackData.updateKeyframeValue(this.selectedKeyframe.index, vectorValue);
    if (success) {
      // console.log(`키프레임 값 업데이트 성공: ${lightId} ${propertyName} at index ${this.selectedKeyframe.index}`);

      // TimelineData 상태 업데이트 (성능 최적화)
      this.timelineData.dirty = true;
      // precomputeAnimationData와 updateUI는 필요할 때만 호출
      this.updateKeyframeUI(lightId, propertyName);
    } else {
      console.warn(`키프레임 값 업데이트 실패: ${lightId} ${propertyName} at index ${this.selectedKeyframe.index}`);
    }

    // console.log("=== 선택된 키프레임 값 업데이트 완료 ===");
  }

  clearSelectedKeyframe() {
    const bridge = this.editor.timeline?.selectionBridge;
    if (bridge) {
      bridge.clearKeyframeSelections();
      return;
    }
    this.selectedKeyframe = null;
    if (this.editor.scene?.userData?.lightTimeline) {
      this.editor.scene.userData.lightTimeline.selectedKeyframe = null;
    }
    this.container?.querySelectorAll(".keyframe.selected").forEach((el) => {
      el.classList.remove("selected");
      if (el.dataset.lightId) {
        el.style.backgroundColor = el.dataset.lightId.includes("_Target")
          ? "#f66"
          : "#f90";
      }
    });
  }

  // 클립 선택 메서드 - 클립 클릭과 키프레임 선택에서 공통으로 사용
  selectClip(sprite, { fromKeyframe = false } = {}) {
    console.log("=== selectClip 메서드 시작 ===", { sprite, fromKeyframe });

    if (!sprite) {
      console.warn("selectClip: sprite가 null입니다.");
      return false;
    }

    const lightRoot = sprite.closest(".timeline-track.light-timeline");
    if (this._isTrackLocked(lightRoot)) {
      return false;
    }

    const bridge = this.editor.timeline?.selectionBridge;
    if (fromKeyframe) {
      bridge?.clearClipHighlights();
    } else {
      bridge?.clearKeyframeAndClipSelection();
    }

    sprite.classList.add("selected");

    // 3. 클립이 속한 트랙 찾기
    const trackElement = sprite.closest('.motion-tracks');
    if (!trackElement) {
      console.warn("selectClip: 트랙 요소를 찾을 수 없습니다.", { sprite });
      return false;
    }

    const trackObjectId = trackElement.dataset.objectId;
    const trackObjectName = trackElement.dataset.objectName;

    console.log("selectClip: 트랙 정보 찾기:", {
      trackObjectId,
      trackObjectName,
      sprite: sprite
    });

    // 4. 객체 선택
    let objectToSelect = null;
    let lightType = null;

    if (trackObjectId.includes('_Target')) {
      // 타겟 클립인 경우
      objectToSelect = this.editor.scene.getObjectByName(trackObjectId);
      lightType = "Target";
      console.log("selectClip: 타겟 객체 선택 시도:", trackObjectId, objectToSelect);
    } else {
      // 조명 클립인 경우
      objectToSelect = this.editor.scene.getObjectByName(trackObjectId);
      // 트랙에서 lightType 가져오기
      const track = this.tracks.get(trackObjectId);
      lightType = track?.lightType;
      console.log("selectClip: 조명 객체 선택 시도:", {
        trackObjectId,
        foundObject: objectToSelect,
        lightType: lightType,
        track: track
      });
    }

    if (objectToSelect) {
      if (bridge && fromKeyframe) {
        bridge.selectEditorObject(objectToSelect);
      } else if (this.editor.select) {
        this.editor.select(objectToSelect);
        bridge?.highlightTracksForObject(objectToSelect);
      } else if (bridge) {
        bridge.selectLightTrackGroup(
          trackObjectId.includes("_Target")
            ? trackObjectId.replace("_Target", "")
            : trackObjectId,
        );
      }
      this.selectedObject = objectToSelect;
      this.selectedLightType = lightType;

      // 속성 패널 업데이트
      if (lightType === "Target") {
        this.updatePropertyPanelForTarget();
      } else {
        this.updatePropertyPanelForLightType(lightType);
      }

      console.log("selectClip: 객체 선택 완료:", {
        objectName: objectToSelect.name,
        lightType: this.selectedLightType
      });

      return true;
    } else {
      console.warn("selectClip: 객체 선택 실패:", {
        objectToSelect: objectToSelect,
        hasEditorSelect: !!this.editor.select,
        trackObjectId: trackObjectId
      });
      return false;
    }
  }

  // playhead를 특정 시간으로 이동하는 메서드
  movePlayheadToTime(time) {
    console.log("=== LightTimeline movePlayheadToTime 시작 ===", { time });

    // 시간 범위 제한
    const clampedTime = Math.max(0, Math.min(time, this.options.totalSeconds));

    // 현재 시간 업데이트
    this.currentTime = clampedTime;

    const playheadPercent = (clampedTime / this.options.totalSeconds) * 100;
    const mainTimeline = this.editor?.timeline;

    if (mainTimeline?.updatePlayheadPosition) {
      mainTimeline.updatePlayheadPosition(playheadPercent);
      const frame = Math.round(
        clampedTime * (mainTimeline.timelineSettings?.framesPerSecond || 30),
      );
      mainTimeline.setCurrentFrame(frame, false);
    } else if (this.editor.scene?.userData?.timeline?.updatePlayheadPosition) {
      this.editor.scene.userData.timeline.updatePlayheadPosition(playheadPercent);
    } else {
      const playhead =
        mainTimeline?.container?.querySelector(".playhead") ||
        document.querySelector(".playhead");
      if (playhead) {
        playhead.style.left = `${playheadPercent}%`;
        const timeBox = playhead.querySelector(".time-box");
        if (timeBox) {
          timeBox.textContent = `${clampedTime.toFixed(2)}s`;
        }
      }
      mainTimeline?.syncPlayheadSpine?.(playheadPercent);
      if (this.editor.scene?.userData?.timeline) {
        this.editor.scene.userData.timeline.currentSeconds = clampedTime;
      }
    }

    // currentTimeChanged 시그널 발생 (다른 타임라인들과 동기화)
    const frame = Math.floor(clampedTime * this.options.framesPerSecond);
    if (this.editor.signals?.currentTimeChanged) {
      this.editor.signals.currentTimeChanged.dispatch(frame);
    }

    console.log("=== LightTimeline movePlayheadToTime 완료 ===", {
      originalTime: time,
      clampedTime,
      playheadPercent,
      frame
    });
  }

  // 키프레임 UI 업데이트 메서드
  updateKeyframeUI(lightId, propertyName) {
    console.log("키프레임 UI 업데이트:", { lightId, propertyName });

    // 해당 키프레임 요소 찾기
    const keyframeElement = document.querySelector(`[data-light-id="${lightId}"][data-property="${propertyName}"]`);
    if (keyframeElement) {
      console.log("키프레임 UI 요소 찾음:", keyframeElement);
      // 키프레임 UI가 업데이트되었음을 시각적으로 표시
      keyframeElement.style.transform = "translate(-50%, -50%) scale(1.2)";
      setTimeout(() => {
        keyframeElement.style.transform = "translate(-50%, -50%) scale(1)";
      }, 200);
    } else {
      console.warn("키프레임 UI 요소를 찾을 수 없음:", { lightId, propertyName });
    }
  }

  // 테스트용 메서드: 키프레임 수동 추가
  testAddKeyframe(lightId, propertyName, time, value) {
    console.log("=== 테스트 키프레임 추가 ===", {
      lightId,
      propertyName,
      time,
      value
    });

    // TimelineData에서 트랙 찾기
    const trackData = this.timelineData.getTrackById(lightId, propertyName);
    if (!trackData) {
      console.warn("트랙을 찾을 수 없습니다:", { lightId, propertyName });
      return false;
    }

    // 키프레임 추가
    const success = trackData.addKeyframe(time, value);
    console.log("키프레임 추가 결과:", success);

    if (success) {
      // UI에 키프레임 추가
      this.addKeyframeUI(lightId, propertyName, time);
      console.log("UI 키프레임 추가 완료");
    }

    return success;
  }

  // 현재 시간에 키프레임 추가하는 테스트 메서드
  addKeyframeAtCurrentTime(lightId, propertyName) {
    const currentTime = this.currentTime || 0;
    console.log(`=== 현재 시간(${currentTime})에 키프레임 추가 ===`, { lightId, propertyName });

    // 조명 객체에서 현재 값 가져오기
    const object = this.editor.scene.getObjectByName(lightId);
    if (!object) {
      console.error(`조명 객체를 찾을 수 없음: ${lightId}`);
      return;
    }

    let value;
    switch (propertyName) {
      case 'intensity':
        value = object.intensity;
        break;
      case 'color':
        value = object.color;
        break;
      case 'position':
        value = object.position.clone();
        break;
      case 'distance':
        value = object.distance;
        break;
      case 'angle':
        value = object.angle;
        break;
      case 'penumbra':
        value = object.penumbra;
        break;
      case 'decay':
        value = object.decay;
        break;
      default:
        console.error(`지원하지 않는 속성: ${propertyName}`);
        return;
    }

    console.log(`현재 ${propertyName} 값: `, value);
    this.addKeyframeForProperty(lightId, propertyName, currentTime, value);
  }

  // 브라우저 콘솔에서 테스트할 수 있는 전역 메서드
  testLightAnimation() {
    console.log("=== 조명 애니메이션 테스트 시작 ===");

    // 1. 조명 객체 확인
    const light = this.editor.scene.getObjectByName('light_0');
    if (!light) {
      console.error("light_0 조명을 찾을 수 없습니다!");
      return;
    }

    console.log("조명 객체:", light);

    // 2. UUID 기반 트랙 확인
    const uuidTrackData = this.timelineData.getTrackByUuid(light.uuid, 'intensity');
    console.log("UUID 기반 intensity 트랙:", uuidTrackData);

    // 3. 기존 키프레임 모두 삭제
    if (uuidTrackData) {
      uuidTrackData.clearAllKeyframes();
      console.log("기존 키프레임 모두 삭제");
    }

    // 4. 다양한 값의 키프레임 추가
    if (uuidTrackData) {
      // 0초: intensity = 1
      uuidTrackData.addKeyframe(0, new THREE.Vector3(1, 0, 0));

      // 5초: intensity = 3
      uuidTrackData.addKeyframe(5, new THREE.Vector3(3, 0, 0));

      // 10초: intensity = 0.5
      uuidTrackData.addKeyframe(10, new THREE.Vector3(0.5, 0, 0));

      // 15초: intensity = 2
      uuidTrackData.addKeyframe(15, new THREE.Vector3(2, 0, 0));

      console.log("✅ 다양한 키프레임 추가 완료!");

      // 5. UI 업데이트
      this.addKeyframeUI('light_0', 'intensity', 0);
      this.addKeyframeUI('light_0', 'intensity', 5);
      this.addKeyframeUI('light_0', 'intensity', 10);
      this.addKeyframeUI('light_0', 'intensity', 15);

      // 6. 애니메이션 테스트
      console.log("애니메이션 테스트 시작...");
      this.currentTime = 0;
      this.updateAnimation(0);

      // 7. 2초마다 애니메이션 테스트
      setTimeout(() => {
        console.log("2초 후 애니메이션 테스트...");
        this.currentTime = 2;
        this.updateAnimation(2);
      }, 2000);

      setTimeout(() => {
        console.log("5초 후 애니메이션 테스트...");
        this.currentTime = 5;
        this.updateAnimation(5);
      }, 5000);

      setTimeout(() => {
        console.log("8초 후 애니메이션 테스트...");
        this.currentTime = 8;
        this.updateAnimation(8);
      }, 8000);
    } else {
      console.error("❌ UUID 기반 트랙을 찾을 수 없습니다!");
    }
  }

  // 키프레임 모두 삭제 메서드 (TrackData에 추가 필요)
  clearAllKeyframes() {
    console.log("=== 모든 키프레임 삭제 ===");

    this.tracks.forEach((track, lightId) => {
      if (!track.lightType) return;

      const light = this.editor.scene.getObjectByName(lightId);
      if (!light) return;

      const properties = LIGHT_PROPERTIES[track.lightType];
      Object.keys(properties).forEach((propertyType) => {
        const trackData = this.timelineData.getTrackByUuid(light.uuid, propertyType);
        if (trackData) {
          // 모든 키프레임 삭제
          for (let i = trackData.getKeyframeCount() - 1; i >= 0; i--) {
            trackData.removeKeyframeByIndex(i);
          }
          console.log(`✅ ${lightId} ${propertyType} 키프레임 모두 삭제`);
        }
      });
    });

    // UI에서도 키프레임 제거
    this.container.querySelectorAll('.keyframe').forEach(keyframe => {
      keyframe.remove();
    });

    console.log("=== 키프레임 삭제 완료 ===");
  }

  // SpotLight/DirectionalLight: 같은 시간의 반대 트랙 키프레임 UI 찾기 (시간 허용 오차)
  findPartnerKeyframeElements(track, originalTime, isTargetTrack) {
    const tol = 0.02;
    const baseId = track.objectId.includes('_Target') ? track.objectId.replace(/_Target$/, '') : track.objectId;
    const partnerTrack = isTargetTrack ? this.tracks.get(baseId) : this.tracks.get(baseId + '_Target');
    if (!partnerTrack || !partnerTrack.sprite) return [];
    const list = [];
    partnerTrack.sprite.querySelectorAll('.keyframe').forEach(el => {
      const t = parseFloat(el.dataset.time);
      if (t !== t) return;
      if (Math.abs(t - originalTime) < tol) list.push(el);
    });
    return list;
  }

  // SpotLight/DirectionalLight: 키프레임 이동 시 반대 트랙도 같은 시간으로 이동
  syncMovePartnerKeyframes(lightIdBase, originalTime, finalTime, track) {
    const targetId = lightIdBase + '_Target';
    if (!this.tracks.has(targetId)) return;

    if (track.objectId.includes('_Target')) {
      const lightProps = Object.keys(LIGHT_PROPERTIES.SpotLight || {});
      lightProps.forEach(prop => {
        const trackId = `${lightIdBase}_${prop}`;
        const trackData = this.timelineData.tracksById.get(trackId)?.get(prop);
        if (trackData) {
          const idx = trackData.findKeyframeIndex(originalTime);
          if (idx !== -1) trackData.updateKeyframeTime(idx, finalTime);
        }
      });
      const partnerEls = this.findPartnerKeyframeElements(track, originalTime, true);
      partnerEls.forEach(el => {
        const sprite = el.closest(".animation-sprite");
        if (sprite) this.setKeyframeElementPosition(el, finalTime, sprite);
        el.dataset.time = finalTime.toFixed(2);
      });
    } else {
      // 조명 트랙에서 드래그한 경우: 같은 시간의 모든 조명 속성 트랙 + 타겟 트랙 시간 이동 (재생 시 수정된 타임라인 반영)
      const lightProps = Object.keys(LIGHT_PROPERTIES.SpotLight || {});
      lightProps.forEach(prop => {
        const trackId = `${lightIdBase}_${prop}`;
        const trackData = this.timelineData.tracksById.get(trackId)?.get(prop);
        if (trackData) {
          const idx = trackData.findKeyframeIndex(originalTime);
          if (idx !== -1) trackData.updateKeyframeTime(idx, finalTime);
        }
      });
      const targetTrackData = this.timelineData.tracksById.get(targetId)?.get('position');
      if (targetTrackData) {
        const idx = targetTrackData.findKeyframeIndex(originalTime);
        if (idx !== -1) targetTrackData.updateKeyframeTime(idx, finalTime);
      }
      const partnerEls = this.findPartnerKeyframeElements(track, originalTime, false);
      partnerEls.forEach(el => {
        const sprite = el.closest(".animation-sprite");
        if (sprite) this.setKeyframeElementPosition(el, finalTime, sprite);
        el.dataset.time = finalTime.toFixed(2);
      });
    }
  }

  // SpotLight/DirectionalLight: 키프레임 삭제 시 반대 트랙 같은 시간 키프레임도 삭제
  syncDeletePartnerKeyframes(lightIdBase, originalTime, track) {
    const targetId = lightIdBase + '_Target';
    if (!this.tracks.has(targetId)) return;

    if (track.objectId.includes('_Target')) {
      const lightProps = Object.keys(LIGHT_PROPERTIES.SpotLight || {});
      lightProps.forEach(prop => {
        const trackId = `${lightIdBase}_${prop}`;
        const trackData = this.timelineData.tracksById.get(trackId)?.get(prop);
        if (trackData) {
          trackData.removeKeyframe(originalTime) || trackData.removeKeyframe(parseFloat(originalTime.toFixed(2)));
        }
      });
      const partnerEls = this.findPartnerKeyframeElements(track, originalTime, true);
      partnerEls.forEach(el => el.remove());
    } else {
      const trackData = this.timelineData.tracksById.get(targetId)?.get('position');
      if (trackData) {
        trackData.removeKeyframe(originalTime) || trackData.removeKeyframe(parseFloat(originalTime.toFixed(2)));
      }
      const partnerEls = this.findPartnerKeyframeElements(track, originalTime, false);
      partnerEls.forEach(el => el.remove());
    }
  }

  _resolveTrackObjectIdFromLightId(lightId) {
    if (!lightId) return null;
    if (lightId.includes("_Target")) {
      const match = lightId.match(/^(.+_Target)/);
      return match ? match[1] : lightId;
    }
    const suffixes = [
      "intensity",
      "color",
      "position",
      "distance",
      "angle",
      "penumbra",
      "decay",
    ];
    for (const suffix of suffixes) {
      if (lightId.endsWith(`_${suffix}`)) {
        return lightId.slice(0, -(suffix.length + 1));
      }
    }
    return lightId;
  }

  _getLightKeyframePropertiesForTrack(track) {
    if (!track?.objectId) return [];
    if (track.objectId.includes("_Target")) return ["position"];
    return Object.keys(
      LIGHT_PROPERTIES[track.lightType] || LIGHT_PROPERTIES.SpotLight,
    );
  }

  _deleteKeyframesAtTimeForTrack(
    track,
    time,
    { keyframeElement = null, clearSelection = true } = {},
  ) {
    if (!track?.objectId) return false;

    const trackRoot = this._getTrackRootElement(track.objectId);
    if (this._isTrackLocked(trackRoot)) return false;

    const properties = this._getLightKeyframePropertiesForTrack(track);
    let removed = false;

    properties.forEach((prop) => {
      const timelineDataLightId = track.objectId.includes("_Target")
        ? track.objectId
        : `${track.objectId}_${prop}`;

      const trackData = this.timelineData.tracksById
        .get(timelineDataLightId)
        ?.get(prop);
      if (!trackData) return;

      if (
        trackData.removeKeyframe(time) ||
        trackData.removeKeyframe(parseFloat(time.toFixed(2)))
      ) {
        removed = true;
      }
    });

    const lightIdBase = track.objectId.includes("_Target")
      ? track.objectId.replace(/_Target$/, "")
      : track.objectId;
    this.syncDeletePartnerKeyframes(lightIdBase, time, track);

    const tol = 0.02;
    const removeUiAtTime = (sprite) => {
      if (!sprite) return;
      sprite.querySelectorAll(".keyframe").forEach((el) => {
        const t = parseFloat(el.dataset.time);
        if (!Number.isNaN(t) && Math.abs(t - time) < tol) {
          el.remove();
        }
      });
    };

    if (keyframeElement?.parentNode) {
      keyframeElement.remove();
    } else {
      removeUiAtTime(track.sprite);
    }

    const partnerEls = this.findPartnerKeyframeElements(
      track,
      time,
      track.objectId.includes("_Target"),
    );
    partnerEls.forEach((el) => el.remove());

    if (removed) {
      this.timelineData.dirty = true;
      this.timelineData.precomputeAnimationData();
      this.updateAnimation?.();
      if (this.editor.signals?.sceneGraphChanged) {
        this.editor.signals.sceneGraphChanged.dispatch();
      }
    }

    if (clearSelection) {
      this.clearSelectedKeyframe();
    }

    return removed;
  }

  deleteSelectedKeyframe() {
    const selected =
      this.selectedKeyframe ||
      this.editor?.scene?.userData?.lightTimeline?.selectedKeyframe;
    if (!selected) return false;

    const trackObjectId = this._resolveTrackObjectIdFromLightId(
      selected.lightId,
    );
    const track = this.tracks.get(trackObjectId);
    if (!track) {
      console.warn("조명 키프레임 삭제: 트랙을 찾을 수 없습니다.", trackObjectId);
      return false;
    }

    return this._deleteKeyframesAtTimeForTrack(track, selected.time, {
      keyframeElement: selected.element || null,
      clearSelection: true,
    });
  }

  _bindKeyframeContextMenu(keyframeElement, track, time, property) {
    if (keyframeElement._contextMenuBound) return;
    keyframeElement._contextMenuBound = true;

    keyframeElement.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();

      const trackRoot = keyframeElement.closest(".timeline-track.light-timeline");
      if (this._isTrackLocked(trackRoot)) return;

      let timelineDataLightId;
      if (track.objectId.includes("_Target")) {
        timelineDataLightId = track.objectId;
      } else {
        timelineDataLightId = `${track.objectId}_${property}`;
      }
      this.selectKeyframe(
        timelineDataLightId,
        parseFloat(keyframeElement.dataset.time) || time,
        keyframeElement,
        property,
      );

      document
        .querySelectorAll(".keyframe-context-menu")
        .forEach((menu) => menu.remove());

      const menu = document.createElement("div");
      menu.className = "keyframe-context-menu";
      menu.style.cssText = `
        position: fixed;
        left: ${e.clientX}px;
        top: ${e.clientY}px;
        z-index: 10000;
      `;

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "timeline-btn";
      deleteBtn.innerHTML =
        '<i class="fa fa-trash" style="color: #ff6b6b;"></i> 키프레임 삭제';

      deleteBtn.addEventListener("click", () => {
        const keyTime =
          parseFloat(keyframeElement.dataset.time) ||
          parseFloat(keyframeElement.dataset.originalTime) ||
          time;
        this._deleteKeyframesAtTimeForTrack(track, keyTime, {
          keyframeElement,
          clearSelection: true,
        });
        menu.remove();
      });

      menu.appendChild(deleteBtn);
      document.body.appendChild(menu);

      const closeMenu = (evt) => {
        if (!menu.contains(evt.target)) {
          menu.remove();
          document.removeEventListener("click", closeMenu);
          document.removeEventListener("contextmenu", closeMenu);
        }
      };
      setTimeout(() => {
        document.addEventListener("click", closeMenu);
        document.addEventListener("contextmenu", closeMenu);
      }, 0);
    });
  }

  // 키프레임을 드래그 가능하게 만드는 메서드 (MotionTimeline과 동일한 기능)
  makeKeyframeDraggable(keyframeElement, track, time, property) {
    let isDragging = false;
    let isOutsideClip = false;
    let startX = 0;
    let startY = 0;
    let dragStartIndex = -1; // MotionTimeline과 동일하게 인덱스 저장
    const REMOVE_THRESHOLD = 50; // 삭제를 위한 드래그 거리 임계값

    const handleMouseMove = (e) => {
      if (!isDragging) return;

      const dy = e.clientY - startY;
      const dx = e.clientX - startX;

      // 드래그 거리 계산
      const dragDistance = Math.sqrt(dx * dx + dy * dy);

      // 클립 정보 가져오기
      const sprite = keyframeElement.closest('.light-sprite, .target-sprite');
      let isOutsideClipRange = false;

      if (sprite) {
        const spriteLeft = parseFloat(sprite.style.left) || 0;
        const clipStartTime = (spriteLeft / 100) * this.options.totalSeconds;
        const clipDuration = parseFloat(sprite.dataset.duration) || 5;
        const clipEndTime = clipStartTime + clipDuration;

        // 허용 범위 추가
        const tolerance = 0.5; // 0.5초 허용 범위
        isOutsideClipRange = time < clipStartTime - tolerance || time > clipEndTime + tolerance;
      }

      // 아래로 충분히 드래그되면 삭제 모드로 전환
      if (dy > REMOVE_THRESHOLD) {
        console.log("아래로 충분히 드래그됨 - 삭제 조건 충족");
        if (!isOutsideClip) {
          isOutsideClip = true;
          console.log("isOutsideClip을 true로 변경");
          keyframeElement.classList.add("delete-preview");
          keyframeElement.style.opacity = "0.5";
        }
      } else {
        if (isOutsideClip) {
          isOutsideClip = false;
          console.log("isOutsideClip을 false로 변경 - 클립 안으로 돌아옴");
          keyframeElement.style.opacity = "1";
          keyframeElement.style.background = "#f90";
          keyframeElement.classList.remove("delete-preview");
        }

        // MotionTimeline과 동일한 방식으로 실시간 업데이트
        const spriteRect = sprite.getBoundingClientRect();
        const relativeX = e.clientX - spriteRect.left;
        const newLeft = Math.max(0, Math.min(spriteRect.width, relativeX));

        // 키프레임 위치 업데이트
        keyframeElement.style.left = `${newLeft}px`;

        // .time-ruler-container 기준으로 새로운 시간 계산
        const timeRulerContainer = document.querySelector('.time-ruler-container');
        if (!timeRulerContainer) {
          console.warn('.time-ruler-container를 찾을 수 없습니다.');
          return;
        }

        const timeRulerRect = timeRulerContainer.getBoundingClientRect();
        const timeRulerWidth = timeRulerRect.width;

        // 클립의 시작 픽셀 위치
        const clipLeft = parseFloat(sprite.style.left) || 0;
        const clipStartPixelPosition = (clipLeft / 100) * timeRulerWidth;

        // 키프레임의 절대 픽셀 위치 = 클립 시작 위치 + 키프레임 상대 위치
        const keyframeAbsolutePixelPosition = clipStartPixelPosition + newLeft;

        // 절대 픽셀 위치를 시간으로 변환
        const newTimeInSeconds = (keyframeAbsolutePixelPosition / timeRulerWidth) * this.options.totalSeconds;

        // UI만 업데이트 (TimelineData는 handleMouseUp에서 업데이트)
        keyframeElement.dataset.time = newTimeInSeconds.toFixed(2);
      }
    };

    const handleMouseUp = (e) => {
      if (isDragging) {
        isDragging = false;
        keyframeElement.classList.remove("dragging");

        // 클립 밖에서 마우스를 놓았으면 키프레임 삭제
        if (isOutsideClip) {
          const originalTime = parseFloat(keyframeElement.dataset.originalTime);
          this._deleteKeyframesAtTimeForTrack(track, originalTime, {
            keyframeElement,
            clearSelection: false,
          });
        } else {
          // 클립 안에서 놓았으면 TimelineData 업데이트
          const finalTime = parseFloat(keyframeElement.dataset.time);
          const originalTime = parseFloat(keyframeElement.dataset.originalTime);

          console.log("🔍 드래그 완료 - TimelineData 업데이트:", {
            originalTime: originalTime,
            finalTime: finalTime,
            lightId: track.objectId,
            property: property
          });

          // TimelineData에서 키프레임 시간 업데이트
          if (track.objectId) {
            // selectKeyframe과 동일한 방식으로 timelineDataLightId 생성
            let timelineDataLightId;
            if (track.objectId.includes('_Target')) {
              // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
              timelineDataLightId = track.objectId;
            } else {
              // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
              timelineDataLightId = `${track.objectId}_${property}`;
            }

            const trackData = this.timelineData.tracksById.get(timelineDataLightId)?.get(property);
            if (trackData) {
              // 원래 시간으로 키프레임 인덱스 찾기
              const keyframeIndex = trackData.findKeyframeIndex(originalTime);
              if (keyframeIndex !== -1) {
                // 키프레임 시간 업데이트
                if (trackData.updateKeyframeTime(keyframeIndex, finalTime)) {
                  console.log("✅ TimelineData 키프레임 시간 업데이트 성공!");

                  // SpotLight/DirectionalLight: 반대 트랙 같은 시간 키프레임도 함께 이동
                  const lightIdBase = track.objectId.includes('_Target') ? track.objectId.replace(/_Target$/, '') : track.objectId;
                  this.syncMovePartnerKeyframes(lightIdBase, originalTime, finalTime, track);

                  // TimelineData 업데이트
                  this.timelineData.dirty = true;
                  this.timelineData.precomputeAnimationData();

                  // 키프레임이 드래그된 위치로 playhead 이동
                  this.movePlayheadToTime(finalTime);

                  // currentTime을 새로운 시간으로 설정
                  this.currentTime = finalTime;

                  // 새로운 시간에 맞춰 애니메이션 즉시 업데이트
                  this.updateAnimation(finalTime);

                  // 드래그 완료 후 키프레임 선택
                  setTimeout(() => {
                    // 타겟 키프레임과 조명 키프레임 구분하여 lightId 생성
                    let timelineDataLightId;
                    if (track.objectId.includes('_Target')) {
                      // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
                      timelineDataLightId = track.objectId;
                    } else {
                      // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
                      timelineDataLightId = `${track.objectId}_${property}`;
                    }

                    console.log("🔍 드래그 완료 후 키프레임 선택:", {
                      timelineDataLightId,
                      finalTime,
                      property
                    });

                    this.selectKeyframe(timelineDataLightId, finalTime, keyframeElement, property);
                  }, 50); // 약간의 지연을 두고 선택
                } else {
                  console.warn("❌ TimelineData 키프레임 시간 업데이트 실패!");
                }
              } else {
                console.warn("❌ 키프레임 인덱스를 찾을 수 없음:", originalTime);
              }
            } else {
              console.warn("❌ 트랙 데이터를 찾을 수 없음:", timelineDataLightId, property);
            }
          }
        }

        // 이벤트 리스너 제거
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      }
    };

    keyframeElement.addEventListener("mousedown", (e) => {
      console.log("=== 키프레임 mousedown 시작 ===");
      e.stopPropagation();
      const trackRoot = keyframeElement.closest(".timeline-track.light-timeline");
      if (this._isTrackLocked(trackRoot)) return;
      isDragging = true;
      keyframeElement.classList.add("dragging");

      startX = e.clientX;
      startY = e.clientY;
      const startLeft = parseFloat(keyframeElement.style.left) || 0;
      const dragStartTime = parseFloat(keyframeElement.dataset.time);

      // 원래 시간을 dataset에 저장 (드래그 중에 dataset.time이 업데이트되므로)
      keyframeElement.dataset.originalTime = dragStartTime.toString();

      console.log("드래그 시작 정보:", {
        startX,
        startY,
        startLeft,
        dragStartTime,
        lightId: track.objectId,
        property
      });

      if (track.objectId) {
        // 키프레임 인덱스 찾기
        // selectKeyframe과 동일한 방식으로 timelineDataLightId 생성
        let timelineDataLightId;
        if (track.objectId.includes('_Target')) {
          // 타겟 키프레임인 경우 이미 올바른 형태 (light_0_Target)
          timelineDataLightId = track.objectId;
        } else {
          // 조명 키프레임인 경우 propertyName 추가 (light_0_intensity)
          timelineDataLightId = `${track.objectId}_${property}`;
        }

        console.log("🔍 handleMouseDown TimelineData 구조 확인:", {
          trackObjectId: track.objectId,
          property: property,
          timelineDataLightId: timelineDataLightId,
          tracksByIdSize: this.timelineData.tracksById.size,
          tracksByIdKeys: Array.from(this.timelineData.tracksById.keys()),
          hasTimelineDataLightId: this.timelineData.tracksById.has(timelineDataLightId)
        });

        const trackData = this.timelineData.tracksById.get(timelineDataLightId)?.get(property);
        let dragStartIndex = -1;

        if (trackData) {
          dragStartIndex = trackData.findKeyframeIndex(dragStartTime);
          console.log("🔍 handleMouseDown dragStartIndex 설정:", {
            dragStartTime,
            dragStartIndex,
            keyframeCount: trackData.keyframeCount,
            times: Array.from(trackData.times.slice(0, trackData.keyframeCount))
          });
        } else {
          console.warn("트랙 데이터를 찾을 수 없음:", timelineDataLightId);
        }
      }

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);

      // 드래그 이벤트 참조 저장 (디버깅용)
      keyframeElement._dragListener = { handleMouseMove, handleMouseUp };

      console.log("이벤트 리스너 등록 완료");
    });

    this._bindKeyframeContextMenu(keyframeElement, track, time, property);
  }

  // 키프레임 선택 시 속성 변경 감지 및 저장
  setupObjectChangeListener() {
    if (this._objectChangeListenerSetup) return;
    this._objectChangeListenerSetup = true;

    // 객체 변경 시그널 감지
    this.editor.signals.objectChanged.add((object, options = {}) => {
      this.onObjectChanged(object, options);
    });

    // Transform Controls 변경 시그널 감지
    if (this.editor.signals.transformChanged) {
      this.editor.signals.transformChanged.add((object) => {
        this.onObjectChanged(object, { fromTransform: true });
      });
    }

    // 속성 패널 변경 시그널 감지
    if (this.editor.signals.propertyChanged) {
      this.editor.signals.propertyChanged.add((object, property, value) => {
        this.onObjectChanged(object, { fromProperty: true, property, value });
      });
    }
  }

  // 객체 변경 처리 메서드
  onObjectChanged(object, options = {}) {
    // console.log("=== onObjectChanged 호출됨 ===", {
    //   objectName: object?.name,
    //   selectedKeyframe: this.selectedKeyframe,
    //   options
    // });

    // fromTimeline 플래그가 있으면 무시 (타임라인에서 발생한 변경)
    if (options.fromTimeline || options.fromAnimation) {
      // console.log("타임라인/애니메이션에서 발생한 변경으로 무시됨:", options);
      return;
    }

    if (!this.selectedKeyframe) {
      // console.log("선택된 키프레임이 없음");
      return;
    }

    const selectedLightId = this.selectedKeyframe.lightId;
    const selectedProperty = this.selectedKeyframe.property;
    const selectedKeyframeElement = this.selectedKeyframe.element;

    // 선택된 키프레임과 관련된 객체인지 확인
    let isRelatedObject = false;
    let trackObjectId = null;

    // 클립을 통해 트랙 정보 찾기
    if (selectedKeyframeElement) {
      let sprite = null;
      if (selectedLightId.includes('_Target')) {
        // 타겟 키프레임인 경우 타겟 스프라이트 찾기
        sprite = selectedKeyframeElement.closest('.target-sprite');
        console.log("onObjectChanged - 타겟 스프라이트 찾기:", sprite);
      } else {
        // 조명 키프레임인 경우 조명 스프라이트 찾기
        // selectedLightId가 'light_0_intensity' 형태이므로 base light ID 추출
        const baseLightId = selectedLightId.split('_').slice(0, 2).join('_'); // 'light_0_intensity' -> 'light_0'
        console.log("onObjectChanged - 조명 스프라이트 찾기:", {
          selectedLightId,
          baseLightId
        });

        // base light ID로 조명 스프라이트 찾기
        const lightSprite = document.querySelector(`[data-object-id="${baseLightId}"] .light-sprite`);
        if (lightSprite) {
          sprite = lightSprite;
          console.log("onObjectChanged - 조명 스프라이트 찾음:", sprite);
        } else {
          // fallback: closest로 찾기
          sprite = selectedKeyframeElement.closest('.light-sprite');
          console.log("onObjectChanged - fallback으로 조명 스프라이트 찾기:", sprite);
        }
      }

      if (sprite) {
        const trackElement = sprite.closest('.motion-tracks');
        if (trackElement) {
          trackObjectId = trackElement.dataset.objectId;
          console.log("클립을 통해 트랙 정보 찾기:", {
            trackObjectId,
            objectName: object.name,
            selectedLightId,
            isTarget: selectedLightId.includes('_Target')
          });
        }
      }
    }

    // 트랙 정보를 통해 객체 매칭
    if (trackObjectId) {
      if (trackObjectId.includes('_Target')) {
        // 타겟 키프레임인 경우
        isRelatedObject = (object.name === trackObjectId);
      } else {
        // 조명 키프레임인 경우 - trackObjectId는 base light ID (light_0)
        isRelatedObject = (object.name === trackObjectId);
      }
    } else {
      // 클립을 통해 찾지 못한 경우 기존 방식으로 시도
      if (selectedLightId.includes('_Target')) {
        isRelatedObject = (object.name === selectedLightId);
      } else {
        const baseLightId = selectedLightId.split('_').slice(0, 2).join('_');
        isRelatedObject = (object.name === baseLightId);
      }
    }

    console.log("객체 매칭 결과:", {
      objectName: object.name,
      selectedLightId,
      trackObjectId,
      isRelatedObject,
      isTarget: selectedLightId.includes('_Target')
    });

    if (isRelatedObject) {
      // console.log("선택된 키프레임과 관련된 객체가 변경됨:", object.name, selectedProperty, options);

      // 객체의 현재 속성 값 가져오기
      let newValue = null;
      switch (selectedProperty) {
        case 'position':
          newValue = new THREE.Vector3(
            object.position.x,
            object.position.y,
            object.position.z
          );
          break;
        case 'intensity':
          if (object.intensity !== undefined) {
            newValue = object.intensity; // 단일 숫자 값
          }
          break;
        case 'color':
          if (object.color) {
            newValue = new THREE.Color(
              object.color.r,
              object.color.g,
              object.color.b
            );
          }
          break;
        case 'distance':
          if (object.distance !== undefined) {
            newValue = object.distance; // 단일 숫자 값
          }
          break;
        case 'angle':
          if (object.angle !== undefined) {
            newValue = object.angle; // 단일 숫자 값
          }
          break;
        case 'penumbra':
          if (object.penumbra !== undefined) {
            newValue = object.penumbra; // 단일 숫자 값
          }
          break;
        case 'decay':
          if (object.decay !== undefined) {
            newValue = object.decay; // 단일 숫자 값
          }
          break;
      }

      if (newValue) {
        // 드래그 중이 아닐 때만 즉시 업데이트, 드래그 중이면 마우스 업 후에 업데이트
        if (!this.isDragging) {
          console.log("즉시 키프레임 업데이트:", { selectedProperty, newValue });
          this.updateLightProperty(selectedProperty, newValue);
        } else {
          console.log("드래그 중 - 업데이트 지연:", { selectedProperty, newValue });
          // 드래그 중이면 디바운싱 적용
          this.debouncedUpdateKeyframe(selectedProperty, newValue);
        }
      } else {
        console.warn("속성 값이 null이거나 undefined:", {
          selectedProperty,
          objectName: object.name,
          hasIntensity: object.intensity !== undefined,
          hasColor: !!object.color,
          hasDistance: object.distance !== undefined,
          hasAngle: object.angle !== undefined,
          hasPenumbra: object.penumbra !== undefined,
          hasDecay: object.decay !== undefined
        });
      }
    }
  }
}

export default LightTimeline;