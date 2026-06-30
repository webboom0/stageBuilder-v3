// editor/core/Editor.js
import * as THREE from "three";
import { Scene } from "./Scene.js";
import { Signal } from "../libs/signals.js";

class Editor {
  constructor() {
    // 씬 관리
    this.scene = null;
    this.scenes = new Map();
    this.currentSceneId = null;

    // 시그널 초기화
    this.signals = {
      // 씬 관련 시그널
      sceneAdded: new Signal(),
      sceneRemoved: new Signal(),
      sceneChanged: new Signal(),

      // 객체 관련 시그널
      objectAdded: new Signal(),
      objectRemoved: new Signal(),
      objectSelected: new Signal(),
      objectChanged: new Signal(),

      // 타임라인 관련 시그널
      timelineChanged: new Signal(),
      frameChanged: new Signal(),

      // 히스토리 관련 시그널
      historyChanged: new Signal(),

      // 렌더링 관련 시그널
      renderStarted: new Signal(),
      renderFinished: new Signal(),

      // 에디터 상태 관련 시그널
      editorCleared: new Signal(),
      savingStarted: new Signal(),
      savingFinished: new Signal(),
    };

    // 선택된 객체 관리
    this.selected = null;
  }

  // 씬 관리 메서드
  createScene() {
    const sceneId = this.scenes.size + 1;
    const scene = new Scene(this, sceneId);

    // 기본 타임라인 설정
    scene.userData.timeline = {
      totalSeconds: 180,
      framesPerSecond: 30,
      currentFrame: 0,
      isPlaying: false,
    };

    this.scenes.set(sceneId, scene);

    if (!this.scene) {
      this.setScene(sceneId);
    }

    this.signals.sceneAdded.dispatch(scene);
    return scene;
  }

  setScene(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      this.scene = scene;
      this.currentSceneId = sceneId;
      this.signals.sceneChanged.dispatch(scene);
    }
  }

  removeScene(sceneId) {
    const scene = this.scenes.get(sceneId);
    if (scene) {
      this.scenes.delete(sceneId);
      this.signals.sceneRemoved.dispatch(scene);

      if (this.currentSceneId === sceneId) {
        const nextScene = this.scenes.values().next().value;
        if (nextScene) {
          this.setScene(nextScene.id);
        } else {
          this.scene = null;
          this.currentSceneId = null;
        }
      }
    }
  }

  // 객체 관리 메서드
  addObject(object, parent = null) {
    if (!this.scene) return;

    if (parent !== null) {
      parent.add(object);
    } else {
      this.scene.add(object);
    }

    this.signals.objectAdded.dispatch(object);
  }

  removeObject(object) {
    if (!this.scene) return;

    object.parent.remove(object);
    this.signals.objectRemoved.dispatch(object);

    if (this.selected === object) {
      this.selected = null;
      this.signals.objectSelected.dispatch(null);
    }
  }

  // 선택 관리 메서드
  select(object) {
    if (this.selected === object) return;

    this.selected = object;
    this.signals.objectSelected.dispatch(object);
  }

  deselect() {
    this.select(null);
  }

  // 타임라인 관리 메서드
  setFrame(frame) {
    if (!this.scene) return;

    this.scene.userData.timeline.currentFrame = frame;
    this.scene.updateAnimation(frame);
    this.signals.frameChanged.dispatch(frame);
  }

  // 프로젝트 저장/불러오기
  toJSON() {
    return {
      metadata: {
        version: 1.0,
        type: "Editor",
        generator: "Editor.toJSON",
      },
      scenes: Array.from(this.scenes.entries()).reduce((obj, [id, scene]) => {
        obj[id] = scene.toJSON();
        return obj;
      }, {}),
      currentSceneId: this.currentSceneId,
    };
  }

  fromJSON(json) {
    this.clear();

    // 씬 복원
    Object.entries(json.scenes).forEach(([id, sceneData]) => {
      const scene = new Scene(this, parseInt(id));
      scene.fromJSON(sceneData);
      this.scenes.set(parseInt(id), scene);
    });

    // 현재 씬 설정
    if (json.currentSceneId) {
      this.setScene(json.currentSceneId);
    }

    this.signals.editorCleared.dispatch();
  }

  // 초기화
  clear() {
    this.scenes.clear();
    this.scene = null;
    this.currentSceneId = null;
    this.selected = null;

    this.signals.editorCleared.dispatch();
  }

  // 명령 실행
  execute(cmd) {
    cmd.execute();
    this.signals.historyChanged.dispatch(cmd);
  }
}

export { Editor };
