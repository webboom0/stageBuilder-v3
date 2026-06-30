// editor/core/Scene.js
import * as THREE from "three";
import { TIMELINE_CONSTRAINTS, TimelineHelpers } from "../timeline/Timeline.js";

class Scene extends THREE.Scene {
  constructor(editor, id) {
    super();
    this.editor = editor;
    this.id = id;

    // 씬 기본 설정 초기화
    this.userData = {
      // 키프레임 데이터
      keyframes: {},

      // 타임라인 설정 (저장된 설정이 있으면 사용, 없으면 기본값)
      timeline: this.loadTimelineSettings(),

      // 렌더링 설정
      render: {
        width: 1600,
        height: 900,
        backgroundColor: 0xf0f0f0,
      },
    };

    this.initializeScene();
  }

  // 타임라인 설정 로드
  loadTimelineSettings() {
    // localStorage에서 저장된 타임라인 설정 불러오기
    const savedSettings = localStorage.getItem('timelineSettings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        // 저장된 설정이 범위를 벗어나면 기본값으로 조정
        let totalSeconds = TimelineHelpers.clampTimeRange(parsed.totalSeconds || 180);
        let fps = TimelineHelpers.clampFPS(parsed.framesPerSecond || 30);

        return {
          totalSeconds: totalSeconds,
          framesPerSecond: fps,
          currentFrame: parsed.currentFrame || 0,
        };
      } catch (error) {
        console.warn('저장된 타임라인 설정을 불러오는 중 오류 발생:', error);
      }
    }

    // 기본 설정 반환
    return {
      totalSeconds: 180, // 3분 (60초~300초 범위 내)
      framesPerSecond: 30,
      currentFrame: 0,
    };
  }

  initializeScene() {
    // 기본 카메라 설정
    const camera = new THREE.PerspectiveCamera(75, 400 / 300, 0.1, 1000);
    camera.position.set(0, 0, 100);
    camera.lookAt(this.position);
    this.userData.camera = camera;

    // 기본 조명 설정
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 200, 100);
    this.add(directionalLight);
  }

  // 키프레임 관련 메서드
  addKeyframe(objectId, frameData) {
    if (!this.userData.keyframes[objectId]) {
      this.userData.keyframes[objectId] = [];
    }

    const frames = this.userData.keyframes[objectId];
    const frameIndex = frameData.frameIndex;

    // 같은 프레임에 키프레임이 있으면 업데이트
    const existingFrameIndex = frames.findIndex(
      (f) => f.frameIndex === frameIndex
    );
    if (existingFrameIndex !== -1) {
      frames[existingFrameIndex] = { ...frameData };
    } else {
      frames.push(frameData);
      // 프레임 인덱스로 정렬
      frames.sort((a, b) => a.frameIndex - b.frameIndex);
    }
  }

  getKeyframesAtFrame(frame) {
    const result = {};
    Object.entries(this.userData.keyframes).forEach(([objectId, frames]) => {
      let prevFrame = null;
      let nextFrame = null;

      for (let i = 0; i < frames.length; i++) {
        if (frames[i].frameIndex <= frame) {
          prevFrame = frames[i];
        }
        if (frames[i].frameIndex > frame && !nextFrame) {
          nextFrame = frames[i];
          break;
        }
      }

      if (prevFrame || nextFrame) {
        result[objectId] = { prevFrame, nextFrame };
      }
    });
    return result;
  }

  // 애니메이션 업데이트
  updateAnimation(frame) {
    const keyframes = this.getKeyframesAtFrame(frame);

    Object.entries(keyframes).forEach(([objectId, frames]) => {
      const object = this.getObjectById(parseInt(objectId));
      if (!object) return;

      const { prevFrame, nextFrame } = frames;

      if (prevFrame && nextFrame) {
        // 두 키프레임 사이 보간
        const t =
          (frame - prevFrame.frameIndex) /
          (nextFrame.frameIndex - prevFrame.frameIndex);

        // 위치 보간
        if (prevFrame.position && nextFrame.position) {
          object.position.lerpVectors(
            prevFrame.position,
            nextFrame.position,
            t
          );
        }

        // 회전 보간
        if (prevFrame.rotation && nextFrame.rotation) {
          object.rotation.set(
            THREE.MathUtils.lerp(prevFrame.rotation.x, nextFrame.rotation.x, t),
            THREE.MathUtils.lerp(prevFrame.rotation.y, nextFrame.rotation.y, t),
            THREE.MathUtils.lerp(prevFrame.rotation.z, nextFrame.rotation.z, t)
          );
        }

        // 스케일 보간
        if (prevFrame.scale && nextFrame.scale) {
          object.scale.lerpVectors(prevFrame.scale, nextFrame.scale, t);
        }
      } else if (prevFrame) {
        // 마지막 키프레임 유지
        if (prevFrame.position) object.position.copy(prevFrame.position);
        if (prevFrame.rotation) object.rotation.copy(prevFrame.rotation);
        if (prevFrame.scale) object.scale.copy(prevFrame.scale);
      }
    });
  }

  // 씬 데이터 저장/불러오기
  toJSON() {
    return {
      id: this.id,
      objects: super.toJSON(),
      userData: this.userData,
    };
  }

  fromJSON(json) {
    this.id = json.id;
    this.userData = json.userData;
    super.fromJSON(json.objects);
  }

  // 씬 초기화
  clear() {
    // 기본 조명을 제외한 모든 객체 제거
    const objectsToRemove = this.children.filter(
      (child) =>
        !(
          child instanceof THREE.AmbientLight ||
          child instanceof THREE.DirectionalLight
        )
    );

    objectsToRemove.forEach((obj) => this.remove(obj));

    // 키프레임 데이터 초기화
    this.userData.keyframes = {};
    this.userData.timeline.currentFrame = 0;
  }
}

export { Scene };
