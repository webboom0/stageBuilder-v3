import * as THREE from "three";

import { Config } from "./Config.js";
import { Loader } from "./Loader.js";
import { History as _History } from "./History.js";
import { Strings } from "./Strings.js";
import { Storage as _Storage } from "./Storage.js";
import { Selector } from "./Selector.js";

var _DEFAULT_CAMERA = new THREE.PerspectiveCamera(50, 1, 0.01, 1000);
_DEFAULT_CAMERA.name = "Camera";
_DEFAULT_CAMERA.position.set(0, 5, 10);
_DEFAULT_CAMERA.lookAt(new THREE.Vector3());

function Editor() {
  const Signal = signals.Signal; // eslint-disable-line no-undef

  this.signals = {
    // script

    editScript: new Signal(),

    // player

    startPlayer: new Signal(),
    stopPlayer: new Signal(),

    // xr

    enterXR: new Signal(),
    offerXR: new Signal(),
    leaveXR: new Signal(),

    // notifications

    editorCleared: new Signal(),

    savingStarted: new Signal(),
    savingFinished: new Signal(),

    transformModeChanged: new Signal(),
    snapChanged: new Signal(),
    spaceChanged: new Signal(),
    rendererCreated: new Signal(),
    rendererUpdated: new Signal(),
    rendererDetectKTX2Support: new Signal(),

    sceneBackgroundChanged: new Signal(),
    sceneEnvironmentChanged: new Signal(),
    sceneFogChanged: new Signal(),
    sceneFogSettingsChanged: new Signal(),
    sceneGraphChanged: new Signal(),
    sceneRendered: new Signal(),

    cameraChanged: new Signal(),
    cameraResetted: new Signal(),

    geometryChanged: new Signal(),

    objectSelected: new Signal(),
    objectFocused: new Signal(),

    objectAdded: new Signal(),
    objectChanged: new Signal(),
    objectRemoved: new Signal(),

    cameraAdded: new Signal(),
    cameraRemoved: new Signal(),

    helperAdded: new Signal(),
    helperRemoved: new Signal(),

    materialAdded: new Signal(),
    materialChanged: new Signal(),
    materialRemoved: new Signal(),

    scriptAdded: new Signal(),
    scriptChanged: new Signal(),
    scriptRemoved: new Signal(),

    windowResize: new Signal(),

    showHelpersChanged: new Signal(),
    refreshSidebarObject3D: new Signal(),
    refreshSidebarEnvironment: new Signal(),
    historyChanged: new Signal(),

    viewportCameraChanged: new Signal(),
    viewportShadingChanged: new Signal(),

    intersectionsDetected: new Signal(),

    pathTracerUpdated: new Signal(),

    // 점진적 로딩 (3단계)
    progressiveLoadingComplete: new Signal(),
    progressiveLoadingError: new Signal(),

    // 타임라인
    timelineChanged: new Signal(),

    // MotionTimeline Command 요청 시그널들
    addKeyframeRequested: new Signal(),
    removeKeyframeRequested: new Signal(),
    moveKeyframeRequested: new Signal(),
    addTrackRequested: new Signal(),
    removeTrackRequested: new Signal(),
    resizeClipRequested: new Signal(),
  };

  this.config = new Config();
  this.history = new _History(this);
  this.selector = new Selector(this);
  this.storage = new _Storage();
  this.strings = new Strings(this.config);

  this.loader = new Loader(this);

  this.camera = _DEFAULT_CAMERA.clone();

  this.scene = new THREE.Scene();
  this.scene.name = "Scene";

  this.sceneHelpers = new THREE.Scene();
  // 전역 보조광은 약하게: 무대(Stage) 쪽 키 조명이 더 도드라지도록
  this.sceneHelpers.add(new THREE.HemisphereLight(0xffffff, 0x303030, 0.72));

  this.object = {};
  this.geometries = {};
  this.materials = {};
  this.textures = {};
  this.scripts = {};

  this.materialsRefCounter = new Map(); // tracks how often is a material used by a 3D object

  this.mixer = new THREE.AnimationMixer(this.scene);

  this.selected = null;
  this.helpers = {};

  this.cameras = {};

  this.viewportCamera = this.camera;
  this.viewportShading = "default";

  // 타임라인 인스턴스들 초기화
  this.motionTimeline = null;
  this.lightTimeline = null;
  this.audioTimeline = null;

  this.addCamera(this.camera);
}



Editor.prototype = {
  setScene: function (scene) {
    try {
      // 재로드 시 기존 자식이 남아 중복·UUID 충돌이 나지 않도록 먼저 비움
      while (this.scene.children.length > 0) {
        this.removeObject(this.scene.children[0]);
      }

      this.scene.uuid = scene.uuid;
      this.scene.name = scene.name;

      this.scene.background = scene.background;
      this.scene.environment = scene.environment;
      this.scene.fog = scene.fog;
      this.scene.backgroundBlurriness = scene.backgroundBlurriness;
      this.scene.backgroundIntensity = scene.backgroundIntensity;

      // userData 복사 시 오류 방지
      try {
        if (scene.userData) {
          this.scene.userData = JSON.parse(JSON.stringify(scene.userData));
        } else {
          this.scene.userData = {};
        }
      } catch (userDataError) {
        console.warn("userData 복사 중 오류 발생, 기본값 사용:", userDataError);
        this.scene.userData = {};
      }

      // avoid render per object
      this.signals.sceneGraphChanged.active = false;

      while (scene.children.length > 0) {
        try {
          this.addObject(scene.children[0]);
        } catch (addObjectError) {
          console.warn("객체 추가 중 오류 발생, 건너뜀:", addObjectError, scene.children[0]);
          // 오류가 발생한 객체는 제거하고 계속 진행
          scene.remove(scene.children[0]);
        }
      }

      this.signals.sceneGraphChanged.active = true;
      this.signals.sceneGraphChanged.dispatch();
    } catch (error) {
      console.error("Scene 설정 중 오류 발생:", error);
    }
  },

  //

  addObject: function (object, parent, index) {
    var scope = this;

    try {
      object.traverse(function (child) {
        try {
          if (child.geometry !== undefined) scope.addGeometry(child.geometry);
          if (child.material !== undefined) scope.addMaterial(child.material);

          scope.addCamera(child);
          scope.addHelper(child);
        } catch (error) {
          console.warn("객체 순회 중 오류 발생:", error, child);
        }
      });

      if (parent === undefined) {
        this.scene.add(object);
      } else {
        parent.children.splice(index, 0, object);
        object.parent = parent;
      }

      this.signals.objectAdded.dispatch(object);
      this.signals.sceneGraphChanged.dispatch();
    } catch (error) {
      console.error("객체 추가 중 오류 발생:", error, object);
    }
  },

  nameObject: function (object, name) {
    object.name = name;
    this.signals.sceneGraphChanged.dispatch();
  },

  removeObject: function (object) {
    if (object.parent === null) return; // avoid deleting the camera or scene

    var scope = this;

    object.traverse(function (child) {
      scope.removeCamera(child);
      scope.removeHelper(child);

      if (child.material !== undefined) scope.removeMaterial(child.material);
    });

    object.parent.remove(object);

    this.signals.objectRemoved.dispatch(object);
    this.signals.sceneGraphChanged.dispatch();
  },

  addGeometry: function (geometry) {
    this.geometries[geometry.uuid] = geometry;
  },

  setGeometryName: function (geometry, name) {
    geometry.name = name;
    this.signals.sceneGraphChanged.dispatch();
  },

  addMaterial: function (material) {
    try {
      if (Array.isArray(material)) {
        for (var i = 0, l = material.length; i < l; i++) {
          this.addMaterialToRefCounter(material[i]);
        }
      } else {
        this.addMaterialToRefCounter(material);
      }

      this.signals.materialAdded.dispatch();
    } catch (error) {
      console.warn("재질 추가 중 오류 발생:", error, material);
    }
  },

  addMaterialToRefCounter: function (material) {
    try {
      // 재질의 텍스처 속성들을 확인하고 오류 처리
      if (material && typeof material === 'object') {
        const textureProperties = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'displacementMap', 'alphaMap'];

        textureProperties.forEach(prop => {
          if (material[prop] && material[prop].isDefault) {
            console.warn(`재질 ${material.name || material.uuid}의 ${prop}가 기본 텍스처입니다.`);
          }
        });
      }

      var materialsRefCounter = this.materialsRefCounter;

      var count = materialsRefCounter.get(material);

      if (count === undefined) {
        materialsRefCounter.set(material, 1);
        this.materials[material.uuid] = material;
      } else {
        count++;
        materialsRefCounter.set(material, count);
      }
    } catch (error) {
      console.warn("재질 참조 카운터 추가 중 오류 발생:", error, material);
    }
  },

  removeMaterial: function (material) {
    if (Array.isArray(material)) {
      for (var i = 0, l = material.length; i < l; i++) {
        this.removeMaterialFromRefCounter(material[i]);
      }
    } else {
      this.removeMaterialFromRefCounter(material);
    }

    this.signals.materialRemoved.dispatch();
  },

  removeMaterialFromRefCounter: function (material) {
    var materialsRefCounter = this.materialsRefCounter;

    var count = materialsRefCounter.get(material);
    count--;

    if (count === 0) {
      materialsRefCounter.delete(material);
      delete this.materials[material.uuid];
    } else {
      materialsRefCounter.set(material, count);
    }
  },

  getMaterialById: function (id) {
    var material;
    var materials = Object.values(this.materials);

    for (var i = 0; i < materials.length; i++) {
      if (materials[i].id === id) {
        material = materials[i];
        break;
      }
    }

    return material;
  },

  setMaterialName: function (material, name) {
    material.name = name;
    this.signals.sceneGraphChanged.dispatch();
  },

  addTexture: function (texture) {
    this.textures[texture.uuid] = texture;
  },

  //

  addCamera: function (camera) {
    if (camera.isCamera) {
      this.cameras[camera.uuid] = camera;

      this.signals.cameraAdded.dispatch(camera);
    }
  },

  // 타임라인 인스턴스들 연결
  connectTimelineInstances: function () {
    try {
      console.log("=== 타임라인 인스턴스 연결 시작 ===");
      console.log("window.timeline 존재:", !!window.timeline);
      console.log("window.timeline.timelines 존재:", !!window.timeline?.timelines);

      if (window.timeline && window.timeline.timelines) {
        console.log("사용 가능한 타임라인들:", Object.keys(window.timeline.timelines));

        // AudioTimeline 연결 (항상 window.timeline 인스턴스로 동기화)
        if (window.timeline.timelines.audio) {
          this.audioTimeline = window.timeline.timelines.audio;
          console.log("✅ AudioTimeline 연결 완료:", this.audioTimeline);
        }

        // MotionTimeline 연결 (항상 window.timeline 인스턴스로 동기화)
        if (window.timeline.timelines.motion) {
          this.motionTimeline = window.timeline.timelines.motion;
          console.log("✅ MotionTimeline 연결 완료:", this.motionTimeline);
        }

        // LightTimeline 연결 (항상 window.timeline 인스턴스로 동기화)
        if (window.timeline.timelines.light) {
          this.lightTimeline = window.timeline.timelines.light;
          console.log("✅ LightTimeline 연결 완료:", this.lightTimeline);
        }
      } else {
        console.warn("⚠️ window.timeline 또는 window.timeline.timelines가 없습니다!");
      }

      console.log("=== 타임라인 인스턴스 연결 완료 ===");
      console.log("연결된 타임라인들:", {
        motionTimeline: !!this.motionTimeline,
        lightTimeline: !!this.lightTimeline,
        audioTimeline: !!this.audioTimeline
      });
    } catch (error) {
      console.error("타임라인 인스턴스 연결 중 오류:", error);
    }
  },

  removeCamera: function (camera) {
    if (this.cameras[camera.uuid] !== undefined) {
      delete this.cameras[camera.uuid];

      this.signals.cameraRemoved.dispatch(camera);
    }
  },

  //

  addHelper: (function () {
    var geometry = new THREE.SphereGeometry(2, 4, 2);
    var material = new THREE.MeshBasicMaterial({
      color: 0xff0000,
      visible: false,
    });

    return function (object, helper) {
      if (helper === undefined) {
        if (object.isCamera) {
          helper = new THREE.CameraHelper(object);
        } else if (object.isPointLight) {
          helper = new THREE.PointLightHelper(object, 1);
        } else if (object.isDirectionalLight) {
          helper = new THREE.DirectionalLightHelper(object, 1);
        } else if (object.isSpotLight) {
          helper = new THREE.SpotLightHelper(object);
        } else if (object.isHemisphereLight) {
          helper = new THREE.HemisphereLightHelper(object, 1);
        } else if (object.isSkinnedMesh) {
          helper = new THREE.SkeletonHelper(object.skeleton.bones[0]);
          helper.visible = false; // 초기에는 골격 도우미 숨김
        } else if (
          object.isBone === true &&
          object.parent &&
          object.parent.isBone !== true
        ) {
          helper = new THREE.SkeletonHelper(object);
          helper.visible = false; // 초기에는 골격 도우미 숨김
        } else {
          // no helper for this object type
          return;
        }

        const picker = new THREE.Mesh(geometry, material);
        picker.name = "picker";
        picker.userData.object = object;
        helper.add(picker);
      }

      this.sceneHelpers.add(helper);
      this.helpers[object.id] = helper;

      this.signals.helperAdded.dispatch(helper);
    };
  })(),

  removeHelper: function (object) {
    if (this.helpers[object.id] !== undefined) {
      var helper = this.helpers[object.id];
      helper.parent.remove(helper);
      helper.dispose();

      delete this.helpers[object.id];

      this.signals.helperRemoved.dispatch(helper);
    }
  },

  //

  addScript: function (object, script) {
    if (this.scripts[object.uuid] === undefined) {
      this.scripts[object.uuid] = [];
    }

    this.scripts[object.uuid].push(script);

    this.signals.scriptAdded.dispatch(script);
  },

  removeScript: function (object, script) {
    if (this.scripts[object.uuid] === undefined) return;

    var index = this.scripts[object.uuid].indexOf(script);

    if (index !== -1) {
      this.scripts[object.uuid].splice(index, 1);
    }

    this.signals.scriptRemoved.dispatch(script);
  },

  getObjectMaterial: function (object, slot) {
    var material = object.material;

    if (Array.isArray(material) && slot !== undefined) {
      material = material[slot];
    }

    return material;
  },

  setObjectMaterial: function (object, slot, newMaterial) {
    if (Array.isArray(object.material) && slot !== undefined) {
      object.material[slot] = newMaterial;
    } else {
      object.material = newMaterial;
    }
  },

  setViewportCamera: function (uuid) {
    this.viewportCamera = this.cameras[uuid];
    this.signals.viewportCameraChanged.dispatch();
  },

  setViewportShading: function (value) {
    this.viewportShading = value;
    this.signals.viewportShadingChanged.dispatch();
  },

  //

  select: function (object) {
    this.selector.select(object);
  },

  selectById: function (id) {
    if (id === this.camera.id) {
      this.select(this.camera);
      return;
    }

    this.select(this.scene.getObjectById(id));
  },

  selectByUuid: function (uuid) {
    var scope = this;

    this.scene.traverse(function (child) {
      if (child.uuid === uuid) {
        scope.select(child);
      }
    });
  },

  deselect: function () {
    this.selector.deselect();
  },

  focus: function (object) {
    if (object !== undefined) {
      this.signals.objectFocused.dispatch(object);
    }
  },

  focusById: function (id) {
    this.focus(this.scene.getObjectById(id));
  },

  clear: function () {
    this.history.clear();
    this.storage.clear();

    this.camera.copy(_DEFAULT_CAMERA);
    this.signals.cameraResetted.dispatch();

    this.scene.name = "Scene";
    this.scene.userData = {};
    this.scene.background = null;
    this.scene.environment = null;
    this.scene.fog = null;

    var objects = this.scene.children;

    this.signals.sceneGraphChanged.active = false;

    while (objects.length > 0) {
      this.removeObject(objects[0]);
    }

    this.signals.sceneGraphChanged.active = true;

    this.geometries = {};
    this.materials = {};
    this.textures = {};
    this.scripts = {};

    this.materialsRefCounter.clear();

    this.animations = {};
    this.mixer.stopAllAction();

    this.deselect();

    // 타임라인 UI/트랙 맵 정리 (프로젝트 열기 전 중복 트랙 방지)
    try {
      if (window.timeline?.timelines?.audio?.clearAllTracks) {
        window.timeline.timelines.audio.clearAllTracks();
        window.timeline.timelines.audio._onAfterLoadCalled = false;
      }
      const motionTl = window.timeline?.timelines?.motion;
      if (motionTl) {
        motionTl._onAfterLoadCalled = false;
        if (motionTl.container) {
          motionTl.container.querySelectorAll('.timeline-track').forEach((el) => el.remove());
        }
        if (motionTl.timelineData?.tracks?.clear) {
          motionTl.timelineData.tracks.clear();
        }
      }
    } catch (clearTimelineErr) {
      console.warn('타임라인 초기화 중 경고:', clearTimelineErr);
    }

    this.signals.editorCleared.dispatch();
  },

  // skeleton 정보를 강제로 포함
  ensureSkeletonData: function (sceneData) {
    try {
      console.log("=== Skeleton 정보 강제 포함 시작 ===");

      // scene의 모든 객체를 순회하면서 skeleton 정보 확인
      this.scene.traverse((object) => {
        if (object.isSkinnedMesh && object.skeleton) {
          console.log("SkinnedMesh 발견:", object.name, "skeleton:", object.skeleton);

          // skeleton 정보가 sceneData에 포함되어 있는지 확인
          if (sceneData.skeletons) {
            const skeletonData = sceneData.skeletons.find(s => s.uuid === object.skeleton.uuid);
            if (!skeletonData) {
              console.log("skeleton 정보가 누락됨, 강제 추가:", object.skeleton.uuid);

              // skeleton 정보를 강제로 추가
              const skeletonJSON = object.skeleton.toJSON();
              sceneData.skeletons.push(skeletonJSON);

              console.log("skeleton 정보 추가 완료:", skeletonJSON);
            } else {
              console.log("skeleton 정보 이미 존재:", skeletonData.uuid);
            }
          } else {
            console.log("sceneData.skeletons가 없음, 생성");
            sceneData.skeletons = [object.skeleton.toJSON()];
          }
        }
      });

      console.log("=== Skeleton 정보 강제 포함 완료 ===");
    } catch (error) {
      console.error("Skeleton 정보 강제 포함 중 오류:", error);
    }
  },

  // FBX 객체의 skeleton 바인딩 복원
  restoreSkeletonBinding: function (object) {
    try {
      console.log("=== Skeleton 바인딩 복원 시작 ===", object.name || object.uuid);

      // 객체를 순회하면서 SkinnedMesh 찾기
      object.traverse((child) => {
        if (child.isSkinnedMesh) {
          console.log("SkinnedMesh 발견:", child.name);

          // skeleton이 있는지 확인
          if (child.skeleton) {
            console.log("기존 skeleton 존재:", child.skeleton);

            // skeleton의 bones 배열 확인
            if (child.skeleton.bones && child.skeleton.bones.length > 0) {
              console.log("skeleton bones 개수:", child.skeleton.bones.length);

              // skeleton 업데이트
              child.skeleton.update();
              console.log("skeleton 업데이트 완료");
            } else {
              console.warn("skeleton에 bones가 없습니다");
            }
          } else {
            console.warn("SkinnedMesh에 skeleton이 없습니다");

            // skeleton을 찾아서 바인딩 시도
            let foundSkeleton = null;
            object.traverse((sibling) => {
              if (sibling.isBone && !foundSkeleton) {
                // 루트 본 찾기
                let rootBone = sibling;
                while (rootBone.parent && rootBone.parent.isBone) {
                  rootBone = rootBone.parent;
                }

                // skeleton 생성
                const bones = [];
                rootBone.traverse((bone) => {
                  if (bone.isBone) {
                    bones.push(bone);
                  }
                });

                if (bones.length > 0) {
                  foundSkeleton = new THREE.Skeleton(bones);
                  console.log("새로운 skeleton 생성:", bones.length, "개 bones");
                }
              }
            });

            if (foundSkeleton) {
              child.bind(foundSkeleton, child.bindMatrix);
              console.log("skeleton 바인딩 완료");
            }
          }

          // geometry의 skin attributes 확인
          if (child.geometry) {
            const skinIndex = child.geometry.attributes.skinIndex;
            const skinWeight = child.geometry.attributes.skinWeight;

            if (skinIndex && skinWeight) {
              console.log("skin attributes 확인 완료");
              console.log("skinIndex:", skinIndex.count, "vertices");
              console.log("skinWeight:", skinWeight.count, "vertices");
            } else {
              console.warn("skin attributes가 없습니다");
            }
          }
        }
      });

      console.log("=== Skeleton 바인딩 복원 완료 ===");
    } catch (error) {
      console.error("Skeleton 바인딩 복원 중 오류:", error);
    }
  },

  // parseAsync/setScene 이후 씬에 없는 child UUID를 project scene JSON에서 보충
  restoreMissingSceneChildren: async function (projectScene, loader) {
    if (!projectScene?.object) return 0;

    // inlineChildSlots가 남아 있으면 먼저 병합
    try {
      const { DataSplitter } = await import('./utils/DataSplitter.js');
      DataSplitter.mergeSceneChildrenInPlace(projectScene);
    } catch (e) {
      console.warn('restoreMissingSceneChildren: 슬롯 병합 실패', e);
    }

    const childList = projectScene.object.children;
    if (!Array.isArray(childList) || childList.length === 0) {
      console.warn('restoreMissingSceneChildren: object.children 비어 있음');
      return 0;
    }

    const existingUuids = new Set();
    this.scene.traverse((obj) => {
      if (obj.uuid) existingUuids.add(obj.uuid);
    });

    const scenePayload = {
      metadata: projectScene.metadata,
      geometries: projectScene.geometries,
      materials: projectScene.materials,
      textures: projectScene.textures,
      images: projectScene.images,
      skeletons: projectScene.skeletons,
      animations: projectScene.animations,
    };

    let restored = 0;
    for (let i = 0; i < childList.length; i++) {
      const childData = childList[i];
      if (!childData?.uuid) continue;

      // 루트가 이미 있으면 스킵 (하위 bone 일부만 있는 경우에도 루트는 복원 시도)
      if (existingUuids.has(childData.uuid)) continue;

      try {
        const parsed = await loader.parseAsync({ ...scenePayload, object: childData });
        const nodes = [];
        if (parsed?.isScene) {
          const toMove = [...parsed.children];
          for (const child of toMove) {
            parsed.remove(child);
            nodes.push(child);
          }
        } else if (parsed) {
          nodes.push(parsed);
        }

        for (const child of nodes) {
          if (!child?.uuid || existingUuids.has(child.uuid)) continue;
          this.restoreSkeletonBinding(child);
          this.addObject(child);
          existingUuids.add(child.uuid);
          child.traverse((o) => { if (o.uuid) existingUuids.add(o.uuid); });
          restored++;
          console.log(`누락 child 복원: ${child.name || child.uuid} (${child.type})`);
        }
      } catch (err) {
        console.warn(`누락 child ${i} (${childData.uuid}) 복원 실패:`, err);
      }
    }

    console.log(`restoreMissingSceneChildren 완료: ${restored}개 추가, 씬 자식 ${this.scene.children.length}개`);
    return restored;
  },

  // 프로젝트 로드 후 무대(Stage/_Background) 및 기본 조명 재연결
  restoreStageAfterProjectLoad: function () {
    const bg = this.videoEdit?.background;
    if (!bg) {
      console.warn('videoEdit.background 없음 — 무대 복원 건너뜀');
      return;
    }

    bg.init();

    const stageType = this.scene.userData.stageType || 'proscenium';
    let stageGroup = this.scene.children.find((c) => c.name === 'Stage');
    if (!stageGroup) {
      bg.init();
      stageGroup = bg.stageGroup;
    }
    bg.stageGroup = stageGroup;

    const hasBackground = stageGroup?.children?.some((c) => c.name === '_Background');
    const hasLights = stageGroup?.children?.some((c) => c.name === '_Light');

    if (!hasBackground) {
      console.log('무대 모델 누락 — FBX 무대 재로드:', stageType);
      const stageFiles = {
        proscenium: '../files/stage/background.fbx',
        arena: '../files/stage/arena_stage.fbx',
      };
      const stageFile = stageFiles[stageType] || stageFiles.proscenium;
      if (typeof bg.create === 'function') {
        bg.create(stageFile);
      }
    } else {
      this.scene.userData.hasBackground = true;
      console.log('저장된 무대(_Background) 확인');
      // 배경은 있으나 기본 천장 조명이 없으면 추가 (새 파일 시작 시와 동일)
      if (!hasLights && typeof bg.ensureDefaultStageLights === 'function') {
        bg.ensureDefaultStageLights();
      }
    }

    const hasFloor = stageGroup?.children?.some((c) => c.name === '_Floor');
    if (!hasFloor && typeof bg.createFloor === 'function') {
      bg.createFloor(stageType);
    }

    this.signals.sceneGraphChanged.dispatch();
  },

  // 로드된 씬 객체가 빈 껍데기인 경우 재파싱
  hasRenderableContent: function (object) {
    if (!object) return false;
    let found = false;
    object.traverse((child) => {
      if (found) return;
      if (child.isMesh || child.isSkinnedMesh) found = true;
    });
    return found;
  },

  // 메시·FBX 가시성 보장 및 누락 child 강제 복원
  ensureSceneMeshesAfterLoad: async function (projectScene, loader) {
    if (!projectScene?.object) return;

    try {
      const { DataSplitter } = await import('./utils/DataSplitter.js');
      DataSplitter.mergeSceneChildrenInPlace(projectScene);
    } catch (e) {
      console.warn('ensureSceneMeshesAfterLoad: 슬롯 병합 실패', e);
    }

    const childList = projectScene.object.children;
    if (!Array.isArray(childList) || childList.length === 0) {
      console.warn('ensureSceneMeshesAfterLoad: object.children 비어 있음');
      return;
    }

    const scenePayload = {
      metadata: projectScene.metadata,
      geometries: projectScene.geometries,
      materials: projectScene.materials,
      textures: projectScene.textures,
      images: projectScene.images,
      skeletons: projectScene.skeletons,
      animations: projectScene.animations,
    };

    let repaired = 0;
    for (let i = 0; i < childList.length; i++) {
      const childData = childList[i];
      if (!childData?.uuid) continue;

      const existing = this.scene.getObjectByProperty('uuid', childData.uuid);
      if (existing && this.hasRenderableContent(existing)) continue;

      if (existing) {
        console.warn(`빈 껍데기 객체 제거 후 재복원: ${existing.name || childData.uuid}`);
        this.removeObject(existing);
      }

      try {
        const parsed = await loader.parseAsync({ ...scenePayload, object: childData });
        const nodes = [];
        if (parsed?.isScene) {
          for (const child of [...parsed.children]) {
            parsed.remove(child);
            nodes.push(child);
          }
        } else if (parsed) {
          nodes.push(parsed);
        }

        for (const node of nodes) {
          if (!node?.uuid) continue;
          this.restoreSkeletonBinding(node);
          this.addObject(node);
          node.traverse((o) => {
            if (o.isMesh || o.isSkinnedMesh) {
              o.visible = true;
              o.frustumCulled = true;
            }
          });
          repaired++;
          console.log(`메시 child 재복원: ${node.name || node.uuid} (${node.type})`);
        }
      } catch (err) {
        console.warn(`메시 child ${i} (${childData.uuid}) 재복원 실패:`, err);
      }
    }

    console.log(`ensureSceneMeshesAfterLoad 완료: ${repaired}개 재복원, 씬 자식 ${this.scene.children.length}개`);
    this.signals.sceneGraphChanged.dispatch();
  },

  // 모션/메시 복원 후 타임라인 UI 재생성
  refreshMotionTimelineAfterSceneLoad: function () {
    const data = this.scene.userData?.motionTimeline;
    if (!data) return;

    const hasMotionData =
      (data.tracks && Object.keys(data.tracks).length > 0) ||
      (data.clips && Object.keys(data.clips).length > 0) ||
      (data.objectNames && Object.keys(data.objectNames).length > 0);

    if (!hasMotionData) return;

    const run = () => {
      if (!this.motionTimeline) {
        this.connectTimelineInstances();
      }
      const mt = this.motionTimeline;
      if (!mt) return;

      try {
        if (mt.syncDurationFromSceneTimeline) {
          mt.syncDurationFromSceneTimeline();
        }
        if (mt.timelineData?.tracks?.size > 0 && mt.getClipInfoCallback) {
          mt.timelineData.precomputeAnimationData(
            mt.getClipInfoCallback(),
            mt.totalSeconds,
            mt.fps,
          );
        }
        mt.updateAnimation(mt.currentTime ?? 0);
      } catch (err) {
        console.error('모션 타임라인 동기화 실패:', err);
      }
    };

    setTimeout(run, 300);
  },

  refreshAudioTimelineAfterSceneLoad: function () {
    const data =
      this.scene.userData?.audioTimeline
      || null;
    if (!data?.tracks && !data?.audioObjects) return;

    const run = () => {
      if (!this.audioTimeline) {
        this.connectTimelineInstances();
      }
      if (!this.audioTimeline?.syncAudioElementsAfterLoad) return;
      try {
        this.audioTimeline.syncAudioElementsAfterLoad();
        this.audioTimeline.removeOrphanAudioTrackElements?.();
        this.audioTimeline.rebuildTracksFromDOM?.();
        this.audioTimeline.rebindAllTrackEvents?.();
        if (this.audioTimeline.applyMasterVolume) {
          this.audioTimeline.applyMasterVolume();
        }
      } catch (err) {
        console.error('오디오 타임라인 동기화 실패:', err);
      }
    };

    setTimeout(run, 500);
  },

  waitForProjectLoadCompletion: async function () {
    const loader = this.progressiveLoader;
    if (loader) {
      loader.setProgressMessage('프로젝트 로딩 중...', '타임라인·오디오 복원 중');
    }

    if (this.audioTimeline?.getRestorePromises) {
      const promises = this.audioTimeline.getRestorePromises();
      if (promises.length > 0) {
        await Promise.allSettled(promises);
      }
    }

    // onAfterLoad 내부 setTimeout(500) 등 지연 작업 대기
    await new Promise((resolve) => setTimeout(resolve, 700));

    this.connectTimelineInstances();
    const audioTimeline = window.timeline?.timelines?.audio || this.audioTimeline;
    if (audioTimeline) {
      this.audioTimeline = audioTimeline;
      try {
        audioTimeline.syncAudioElementsAfterLoad();
        audioTimeline.removeOrphanAudioTrackElements?.();
        audioTimeline.rebuildTracksFromDOM?.();
        audioTimeline.rebindAllTrackEvents?.();
        if (audioTimeline.applyMasterVolume) {
          audioTimeline.applyMasterVolume();
        }
      } catch (err) {
        console.error('오디오 동기화 재시도 실패:', err);
      }
    }
  },

  //

  fromJSON: async function (json) {
    console.log("=== fromJSON 진입! (AI 디버깅용) ===");
    console.log("project.json 전체 내용:", json);
    console.log("projectData.scene typeof:", typeof json.scene, "value:", json.scene);

    try {
      const { ProgressiveLoader } = await import('./utils/ProgressiveLoader.js');
      if (!this.progressiveLoader) {
        this.progressiveLoader = new ProgressiveLoader(this);
      }
      this.progressiveLoader.keepOverlayOpen = true;
      if (!document.getElementById('progressive-loader-progress')) {
        this.progressiveLoader.createProgressUI();
      }
      this.progressiveLoader.setProgressMessage('프로젝트 로딩 중...', '데이터 준비 중');
    } catch (overlayError) {
      console.warn('프로젝트 로딩 오버레이 초기화 실패:', overlayError);
    }

    try {
      // ZIP 파일인지 확인 (2단계)
      let projectData = json;
      // console.log("json instanceof Blob:", json instanceof Blob);
      // console.log("json.type:", json.type);
      // console.log("json.type === 'application/zip':", json.type === 'application/zip');
      // console.log("json.type === 'application/x-zip-compressed':", json.type === 'application/x-zip-compressed'); 
      // console.log("json.name:", json.name);
      // console.log("json.size:", json.size);
      // console.log("json.name.endsWith('.zip'):", json.name.endsWith('.zip'));
      // console.log("json.name.endsWith('.json'):", json.name.endsWith('.json'));
      // console.log("json.name.endsWith('.zip'):", json.name.endsWith('.zip'));
      if (json instanceof Blob && (json.type === 'application/zip' || json.type === 'application/x-zip-compressed')) {
        console.log("ZIP 파일 감지, 압축 해제 중...");
        console.log("ZIP 파일 정보:", {
          name: json.name,
          size: json.size,
          type: json.type
        });
        try {
          console.log("DataSplitter 모듈 로드 시작...");
          const { DataSplitter } = await import('./utils/DataSplitter.js');
          console.log("DataSplitter 로드 완료, loadFromProjectZip 호출 중...");

          console.log("loadFromProjectZip 함수 호출 전...");
          projectData = await DataSplitter.loadFromProjectZip(json);
          console.log("loadFromProjectZip 함수 호출 완료");
          console.log("ZIP 파일에서 데이터 로드 완료");
        } catch (error) {
          console.error("ZIP 파일 로드 실패:", error);
          console.error("오류 메시지:", error.message);
          console.error("오류 스택:", error.stack);
          console.error("오류 타입:", error.constructor.name);

          // 오류가 발생해도 계속 진행하도록 기본 데이터 반환
          console.warn("ZIP 파일 로드 실패로 인해 빈 프로젝트 데이터를 사용합니다.");
          projectData = {
            metadata: {},
            project: {},
            camera: {},
            scene: {
              metadata: { version: 4.5, type: "Object" },
              geometries: {},
              materials: {},
              textures: {},
              images: {},
              shapes: {},
              skeletons: {},
              animations: [],
              object: {
                uuid: THREE.MathUtils.generateUUID(),
                type: "Scene",
                name: "Scene",
                children: [],
                userData: {}
              }
            },
            scripts: {},
            history: {},
            environment: null,
            motionTimeline: null,
            lightTimeline: null,
            music: null
          };
        }
      } else {
        // 일반 JSON 파일 처리
        // 압축된 데이터 해제 (1단계)
        try {
          const { DataCompressor } = await import('./utils/DataCompressor.js');
          projectData = DataCompressor.decompressProjectData(json);
          console.log("압축된 데이터 해제 완료");
        } catch (error) {
          console.warn("데이터 해제 실패, 원본 데이터 사용:", error);
          projectData = json;
        }
      }

      // projectData 디버깅
      console.log("=== projectData 디버깅 ===");
      console.log("projectData:", projectData);
      console.log("projectData 타입:", typeof projectData);
      console.log("projectData 키:", projectData ? Object.keys(projectData) : "undefined");
      console.log("projectData.scene:", projectData?.scene);
      console.log("projectData.scene 타입:", typeof projectData?.scene);
      if (projectData?.scene) {
        console.log("projectData.scene 키:", Object.keys(projectData.scene));
        console.log("projectData.scene.object:", projectData.scene.object);
        console.log("projectData.scene.object.children:", projectData.scene.object?.children);
        console.log("projectData.scene.object.largeChildrenFiles:", projectData.scene.object?.largeChildrenFiles);
      }
      console.log("=== projectData 디버깅 완료 ===");

      // 점진적 로딩 적용 (3단계)
      try {
        const { ProgressiveLoader } = await import('./utils/ProgressiveLoader.js');
        // 이미 인스턴스가 있으면 재사용, 없으면 새로 생성
        if (!this.progressiveLoader) {
          this.progressiveLoader = new ProgressiveLoader(this);
        }
        // 로딩 이벤트 설정 (중복 방지)
        this.progressiveLoader.events.onComplete = (loadedData) => {
          console.log("점진적 로딩 완료:", Object.keys(loadedData));
          this.signals.progressiveLoadingComplete.dispatch(loadedData);
        };
        this.progressiveLoader.events.onError = (error) => {
          console.error("점진적 로딩 오류:", error);
          this.signals.progressiveLoadingError.dispatch(error);
        };
        const options = this.progressiveLoadingOptions || {
          enabled: true,
          priorityOrder: ['base', 'scene', 'timeline', 'music', 'history'],
          batchSize: 3,
          delayBetweenBatches: 50,
          showProgress: true
        };
        if (options.enabled) {
          // showProgress: true로 두고, 내부에서 중복 생성만 방지
          projectData = await this.progressiveLoader.loadProjectProgressively(projectData, { ...options, showProgress: true });
          console.log("점진적 로딩 완료");
        } else {
          console.log("점진적 로딩 비활성화됨");
        }
      } catch (error) {
        console.warn("점진적 로딩 실패, 기본 로딩 사용:", error);
        // 점진적 로딩 실패 시 원본 데이터 사용
      }

      var loader = new THREE.ObjectLoader();

      // LoadingManager 설정으로 텍스처 로드 오류 처리 강화
      const loadingManager = new THREE.LoadingManager();
      loadingManager.onError = function (url, itemsLoaded, itemsTotal) {
        console.warn("텍스처 로드 실패:", url, `(${itemsLoaded}/${itemsTotal})`);
        // 오류가 발생해도 계속 진행
      };

      // TextureLoader 오류 처리 강화
      const originalTextureLoaderLoad = THREE.TextureLoader.prototype.load;
      THREE.TextureLoader.prototype.load = function (url, onLoad, onProgress, onError) {
        const safeOnError = function (error) {
          console.warn("텍스처 로드 실패:", url, error);
          // 오류가 발생해도 기본 텍스처 생성
          const defaultTexture = new THREE.Texture();
          defaultTexture.name = 'default';
          defaultTexture.isDefault = true; // 기본 텍스처임을 표시
          if (onLoad) onLoad(defaultTexture);
        };

        // URL이 유효하지 않은 경우 기본 텍스처 반환
        if (!url || url === '' || url === 'undefined') {
          console.warn("유효하지 않은 텍스처 URL:", url);
          const defaultTexture = new THREE.Texture();
          defaultTexture.name = 'default';
          defaultTexture.isDefault = true;
          if (onLoad) onLoad(defaultTexture);
          return;
        }

        return originalTextureLoaderLoad.call(this, url, onLoad, onProgress, safeOnError);
      };

      // ImageLoader 오류 처리 강화
      const originalImageLoaderLoad = THREE.ImageLoader.prototype.load;
      THREE.ImageLoader.prototype.load = function (url, onLoad, onProgress, onError) {
        const safeOnError = function (error) {
          console.warn("이미지 로드 실패:", url, error);
          // 오류가 발생해도 기본 이미지 생성
          const defaultImage = new Image();
          defaultImage.width = 1;
          defaultImage.height = 1;
          defaultImage.isDefault = true;
          if (onLoad) onLoad(defaultImage);
        };

        // URL이 유효하지 않은 경우 기본 이미지 반환
        if (!url || url === '' || url === 'undefined') {
          console.warn("유효하지 않은 이미지 URL:", url);
          const defaultImage = new Image();
          defaultImage.width = 1;
          defaultImage.height = 1;
          defaultImage.isDefault = true;
          if (onLoad) onLoad(defaultImage);
          return;
        }

        return originalImageLoaderLoad.call(this, url, onLoad, onProgress, safeOnError);
      };

      loader.manager = loadingManager;

      var camera = await loader.parseAsync(projectData.camera);

      const existingUuid = this.camera.uuid;
      const incomingUuid = camera.uuid;

      // copy all properties, including uuid
      this.camera.copy(camera);
      this.camera.uuid = incomingUuid;

      delete this.cameras[existingUuid]; // remove old entry [existingUuid, this.camera]
      this.cameras[incomingUuid] = this.camera; // add new entry [incomingUuid, this.camera]

      this.signals.cameraResetted.dispatch();

      this.history.fromJSON(projectData.history);
      this.scripts = projectData.scripts;

      // 사용자 프로젝트 정보 복원 (공연명, 공연기간, 공연장소 등)
      if (projectData.userProject) {
        this.project = projectData.userProject;
        console.log("사용자 프로젝트 정보 복원됨:", this.project);

        // 프로젝트 로드 완료 이벤트 발생
        const event = new CustomEvent('projectLoadComplete', {
          detail: { projectData: this.project, editor: this }
        });
        document.dispatchEvent(event);
        console.log("📡 projectLoadComplete 이벤트 발생됨");
      } else {
        console.log("저장된 사용자 프로젝트 정보가 없습니다.");
        this.project = null;
      }

      // 씬 로드 시 오류 처리
      try {
        console.log("projectData.scene typeof:", typeof projectData.scene, "value:", projectData.scene);

        // scene 데이터가 없는 경우 기본 scene 생성
        if (!projectData.scene) {
          console.warn("scene 데이터가 없습니다. 기본 scene을 생성합니다.");
          projectData.scene = {
            metadata: { version: 4.5, type: "Object" },
            geometries: {},
            materials: {},
            textures: {},
            images: {},
            shapes: {},
            skeletons: {},
            animations: [],
            object: {
              uuid: THREE.MathUtils.generateUUID(),
              type: "Scene",
              name: "Scene",
              children: [],
              userData: {}
            }
          };
        }
        function fixChildrenAndAnimations(obj) {
          if (obj && typeof obj === 'object') {
            if (!Array.isArray(obj.children)) obj.children = [];
            if (!Array.isArray(obj.animations)) obj.animations = [];

            // children 배열에서 실제 객체가 아닌 animations 배열만 필터링
            if (Array.isArray(obj.children)) {
              obj.children = obj.children.filter(child => {
                // animations 속성만 있고 다른 객체 속성이 없는 경우만 제거
                if (child && typeof child === 'object' && Array.isArray(child.animations)) {
                  // FBX 객체는 metadata, geometries, materials, skeletons, animations 등의 속성을 가짐
                  const hasObjectProperties = child.metadata !== undefined ||
                    child.geometries !== undefined ||
                    child.materials !== undefined ||
                    child.skeletons !== undefined ||
                    child.object !== undefined ||
                    child.uuid !== undefined ||
                    child.name !== undefined;

                  if (!hasObjectProperties) {
                    console.warn("children 배열에서 animations 배열만 있는 요소 제거:", child);
                    return false;
                  } else {
                    console.log("FBX 객체 유지:", child.name || child.uuid || "unnamed");
                  }
                }
                return true;
              });
            }

            obj.children.forEach(child => fixChildrenAndAnimations(child));
          }
        }
        if (projectData.scene) {
          // window.projectData 설정 전에 motionTimeline 데이터가 새로운 구조인지 확인
          if (projectData.motionTimeline && projectData.motionTimeline.tracks) {
            console.log("=== motionTimeline 데이터 구조 확인 ===");
            console.log("motionTimeline tracks 키들:", Object.keys(projectData.motionTimeline.tracks));

            // 첫 번째 객체의 데이터 구조 확인
            const firstObjectKey = Object.keys(projectData.motionTimeline.tracks)[0];
            console.log("firstObjectKey:", firstObjectKey);
            console.log("projectData.motionTimeline.tracks:", projectData.motionTimeline.tracks[firstObjectKey]);
            if (firstObjectKey) {
              const firstObjectData = projectData.motionTimeline.tracks[firstObjectKey];
              console.log("첫 번째 객체 데이터:", firstObjectData);
              console.log("첫 번째 객체 타입:", typeof firstObjectData);
              console.log("첫 번째 객체가 배열인가:", Array.isArray(firstObjectData));
            }
          }

          window.projectData = projectData; // 콘솔에서 직접 접근 가능하게
          try {
            if (typeof projectData.scene.toJSON === 'function') {
              projectData.scene = projectData.scene.toJSON();
            }

            // 분리된 children 파일 복원
            if (projectData.scene.object && projectData.scene.object.childrenFile) {
              console.log("분리된 children 파일 복원 중:", projectData.scene.object.childrenFile);
              // ZIP 파일에서 분리된 데이터를 로드한 경우 이미 복원되어 있음
              if (!projectData.scene.object.children) {
                console.warn("children 파일이 참조되어 있지만 데이터가 없습니다.");
                projectData.scene.object.children = [];
              }
            }

            // 개별 children 파일들 복원
            if (projectData.scene.object && projectData.scene.object.largeChildrenFiles) {
              console.log("개별 children 파일들 복원 중:", projectData.scene.object.largeChildrenFiles);
              // ZIP 파일에서 분리된 데이터를 로드한 경우 이미 복원되어 있음
              if (!projectData.scene.object.children) {
                console.warn("개별 children 파일들이 참조되어 있지만 데이터가 없습니다.");
                projectData.scene.object.children = [];
              }
            }

            // object.children을 scene.children으로 복사 (ZIP 파일에서 로드된 경우)
            if (projectData.scene.object && projectData.scene.object.children && projectData.scene.object.children.length > 0) {
              console.log("object.children을 scene.children으로 복사:", projectData.scene.object.children.length, "개");
              projectData.scene.children = [...projectData.scene.object.children];
            }

            fixChildrenAndAnimations(projectData.scene);
          } catch (e) {
            console.warn("scene 방어 코드 실행 중 오류:", e);
          }
          try {
            // scene 데이터가 너무 크면 저장하지 않음
            const sceneString = JSON.stringify(projectData.scene, null, 2);
            if (sceneString.length > 1000000) { // 1MB 제한
              console.warn("scene 데이터가 너무 커서 디버그 저장을 건너뜁니다:", sceneString.length, "bytes");
            }
          } catch (e) {
            console.warn("scene 구조 확인 중 오류:", e);
          }
          // children 전체와 0, 1번 요소 콘솔 출력
          console.log("window.projectData.scene.children:", window.projectData.scene.children);
          if (window.projectData.scene.children && window.projectData.scene.children.length > 0) {
            console.log("children[0]:", window.projectData.scene.children[0]);
          }
          if (window.projectData.scene.children && window.projectData.scene.children.length > 1) {
            console.log("children[1]:", window.projectData.scene.children[1]);
          }
        }
        if (projectData.scene) {
          try {
            const { DataSplitter } = await import('./utils/DataSplitter.js');
            DataSplitter.mergeSceneChildrenInPlace(projectData.scene);
          } catch (mergeErr) {
            console.warn("scene children 슬롯 병합 실패:", mergeErr);
          }
        }
        const scene = await loader.parseAsync(projectData.scene);
        this.setScene(scene);

        const restoredCount = await (async () => {
          const { SceneObjectSerializer } = await import('./utils/SceneObjectSerializer.js');
          return SceneObjectSerializer.restoreChildren(this, projectData.scene, loader);
        })();
        if (restoredCount > 0) {
          console.log(`scene children ${restoredCount}개 복원`);
        }

        if (this.scene.children.length === 0) {
          console.warn('씬 children 복원 실패 — object.children:', projectData.scene?.object?.children?.length ?? 0);
        }

        this.connectTimelineInstances();
        this.signals.sceneGraphChanged.dispatch();

        // parseAsync가 userData 일부를 누락할 수 있어 원본 scene JSON에서 병합
        if (projectData.scene?.object?.userData) {
          this.scene.userData = {
            ...(this.scene.userData || {}),
            ...projectData.scene.object.userData,
          };
        }
      } catch (sceneError) {
        console.warn("씬 로드 중 오류 발생, 기본 씬으로 대체:", sceneError);

        // 기본 씬 설정
        this.scene.name = "Scene";
        this.scene.userData = projectData.scene?.userData || {};

        // 씬의 기본 속성들 복원
        if (projectData.scene) {
          this.scene.uuid = projectData.scene.uuid || this.scene.uuid;
          this.scene.name = projectData.scene.name || "Scene";
          this.scene.userData = { ...this.scene.userData, ...projectData.scene.userData };
        }
      }

      if (projectData.environment === "ModelViewer") {
        this.signals.sceneEnvironmentChanged.dispatch(projectData.environment);
        this.signals.refreshSidebarEnvironment.dispatch();
      }

      // 🔧 1순위: Timeline.js의 onAfterLoad() 먼저 호출 (총 프레임 설정)
      if (this.timeline && this.timeline.onAfterLoad) {
        try {
          console.log("=== Timeline.js onAfterLoad() 호출 시작 (1순위) ===");
          this.timeline.onAfterLoad();
          console.log("=== Timeline.js onAfterLoad() 호출 완료 (1순위) ===");
        } catch (error) {
          console.error("Timeline.js onAfterLoad() 실행 중 오류:", error);
        }
      } else {
        console.warn("this.timeline 또는 onAfterLoad 메서드가 없습니다");
      }

      // 🔧 2순위: MotionTimeline 데이터 복원
      const motionTimelineSource =
        projectData.scene?.object?.userData?.motionTimeline ||
        this.scene.userData?.motionTimeline ||
        projectData.motionTimeline;

      const hasMotionTracks = motionTimelineSource?.tracks && Object.keys(motionTimelineSource.tracks).length > 0;
      const hasMotionClips = motionTimelineSource?.clips && Object.keys(motionTimelineSource.clips).length > 0;
      const hasMotionNames = motionTimelineSource?.objectNames && Object.keys(motionTimelineSource.objectNames).length > 0;

      if (hasMotionTracks || hasMotionClips || hasMotionNames) {
        this.connectTimelineInstances();

        if (this.motionTimeline) {
        try {
          console.log("=== MotionTimeline 데이터 복원 시작 (2순위) ===");
          const correctMotionTimelineData = projectData.scene?.object?.userData?.motionTimeline;
          console.log("올바른 경로의 motionTimeline:", correctMotionTimelineData);
          console.log("올바른 경로의 tracks:", correctMotionTimelineData?.tracks);

          console.log("기존 경로의 motionTimeline:", projectData.motionTimeline);
          console.log("기존 경로의 tracks:", projectData.motionTimeline?.tracks);

          if (correctMotionTimelineData?.tracks) {
            console.log("올바른 경로의 tracks 키들:", Object.keys(correctMotionTimelineData.tracks));
            console.log("올바른 경로의 tracks 타입:", typeof correctMotionTimelineData.tracks);

            // 첫 번째 객체의 데이터 구조 확인
            const firstObjectKey = Object.keys(correctMotionTimelineData.tracks)[0];
            console.log("firstObjectKey:", firstObjectKey);

            if (firstObjectKey) {
              const firstObjectData = correctMotionTimelineData.tracks[firstObjectKey];
              console.log("올바른 경로의 첫 번째 객체 데이터:", firstObjectData);
              console.log("올바른 경로의 첫 번째 객체 타입:", typeof firstObjectData);
              console.log("올바른 경로의 첫 번째 객체가 배열인가:", Array.isArray(firstObjectData));

              if (Array.isArray(firstObjectData)) {
                console.log("올바른 경로의 첫 번째 객체 키프레임 개수:", firstObjectData.length);
                if (firstObjectData.length > 0) {
                  console.log("올바른 경로의 첫 번째 키프레임:", firstObjectData[0]);
                }
              }
            }
          }

          // scene.userData에 motionTimeline 데이터 저장 (올바른 경로 사용)
          if (!this.scene.userData) {
            this.scene.userData = {};
          }

          // 올바른 경로에서 데이터 가져오기
          const correctMotionTimeline = projectData.scene?.object?.userData?.motionTimeline;
          let resolvedMotionTimeline;
          try {
            const { DataCompressor } = await import('./utils/DataCompressor.js');
            resolvedMotionTimeline = DataCompressor.resolveMotionTimelineForLoad(
              correctMotionTimeline,
              motionTimelineSource,
              projectData.motionTimeline,
            );
          } catch (normalizeError) {
            console.warn("MotionTimeline 데이터 정규화 실패:", normalizeError);
            resolvedMotionTimeline = correctMotionTimeline || motionTimelineSource || projectData.motionTimeline;
          }

          if (resolvedMotionTimeline) {
            this.scene.userData.motionTimeline = resolvedMotionTimeline;
            console.log(
              correctMotionTimeline
                ? "올바른 경로에서 motionTimeline 데이터 설정 완료"
                : "대체 경로에서 motionTimeline 데이터 설정 완료"
            );
          }
          console.log("scene.userData.motionTimeline 설정 완료:", this.scene.userData.motionTimeline);
          console.log("scene.userData.motionTimeline.tracks 키들:", Object.keys(this.scene.userData.motionTimeline.tracks || {}));

          // 설정 후 첫 번째 객체 데이터 재확인
          const sceneFirstObjectKey = Object.keys(this.scene.userData.motionTimeline.tracks || {})[0];
          if (sceneFirstObjectKey) {
            const sceneFirstObjectData = this.scene.userData.motionTimeline.tracks[sceneFirstObjectKey];
            console.log("scene.userData 첫 번째 객체 데이터:", sceneFirstObjectData);
            console.log("scene.userData 첫 번째 객체 타입:", typeof sceneFirstObjectData);
            console.log("scene.userData 첫 번째 객체가 배열인가:", Array.isArray(sceneFirstObjectData));
          }

          // MotionTimeline에서 데이터 로드
          console.log("motionTimeline.onAfterLoad() 호출 중...");
          this.motionTimeline.onAfterLoad();
          console.log("=== MotionTimeline 데이터 복원 완료 (2순위) ===");
        } catch (error) {
          console.error("MotionTimeline 데이터 복원 중 오류:", error);
        }
        } else {
          console.warn("MotionTimeline 데이터는 있으나 motionTimeline 인스턴스를 찾을 수 없습니다.");
        }
      } else {
        console.log("MotionTimeline 데이터가 없거나 motionTimeline 인스턴스가 없습니다.");
        console.log("projectData.motionTimeline 존재:", !!projectData.motionTimeline);
        console.log("this.motionTimeline 존재:", !!this.motionTimeline);

        // MotionTimeline 데이터가 없으면 아무것도 하지 않음
        // scene.userData.motionTimeline에 저장된 데이터만으로 트랙을 생성해야 함
        console.log("MotionTimeline 데이터가 없으므로 트랙을 생성하지 않습니다.");
      }

      // 🔧 3순위: LightTimeline 데이터 복원
      if (projectData.lightTimeline || this.scene.userData.lightTimeline) {
        try {
          console.log("=== LightTimeline 데이터 복원 시작 (3순위) ===");

          // 올바른 경로에서 lightTimeline 데이터 가져오기
          const correctLightTimelineData = projectData.scene?.object?.userData?.lightTimeline;
          console.log("올바른 경로의 lightTimeline:", correctLightTimelineData);
          console.log("올바른 경로의 tracks:", correctLightTimelineData?.tracks);

          // 기존 경로도 확인 (비교용)
          console.log("기존 경로의 lightTimeline:", projectData.lightTimeline);
          console.log("기존 경로의 tracks:", projectData.lightTimeline?.tracks);

          // scene.userData에서 lightTimeline 데이터 확인
          console.log("scene.userData.lightTimeline:", this.scene.userData.lightTimeline);
          console.log("scene.userData.lightTimeline tracks:", this.scene.userData.lightTimeline?.tracks);

          // 사용할 lightTimeline 데이터 결정
          let lightTimelineData = null;
          if (correctLightTimelineData?.tracks) {
            lightTimelineData = correctLightTimelineData;
            console.log("올바른 경로의 tracks 키들:", Object.keys(correctLightTimelineData.tracks));
            console.log("올바른 경로의 tracks 타입:", typeof correctLightTimelineData.tracks);
          } else if (this.scene.userData.lightTimeline?.tracks) {
            lightTimelineData = this.scene.userData.lightTimeline;
            console.log("scene.userData의 tracks 키들:", Object.keys(this.scene.userData.lightTimeline.tracks));
            console.log("scene.userData의 tracks 타입:", typeof this.scene.userData.lightTimeline.tracks);
          }

          if (lightTimelineData) {
            // scene.userData에 lightTimeline 데이터 저장 (올바른 경로 사용)
            if (correctLightTimelineData) {
              this.scene.userData.lightTimeline = correctLightTimelineData;
              console.log("올바른 경로에서 lightTimeline 데이터 설정 완료");
            } else if (projectData.lightTimeline) {
              this.scene.userData.lightTimeline = projectData.lightTimeline;
              console.log("기존 경로에서 lightTimeline 데이터 설정 완료");
            } else if (this.scene.userData.lightTimeline) {
              console.log("scene.userData.lightTimeline이 이미 존재합니다");
            } else {
              console.warn("lightTimeline 데이터를 찾을 수 없습니다");
            }

            console.log("scene.userData.lightTimeline 설정 완료:", this.scene.userData.lightTimeline);
            console.log("scene.userData.lightTimeline.tracks 키들:", Object.keys(this.scene.userData.lightTimeline.tracks || {}));

            // 저장된 데이터 상세 확인
            console.log("=== Editor.js에서 저장된 데이터 확인 ===");
            console.log("lightTimeline 데이터 타입:", typeof this.scene.userData.lightTimeline);
            console.log("lightTimeline 데이터 키들:", Object.keys(this.scene.userData.lightTimeline));

            if (this.scene.userData.lightTimeline.lightTracks) {
              console.log("lightTracks 개수:", Object.keys(this.scene.userData.lightTimeline.lightTracks).length);
              console.log("lightTracks 키들:", Object.keys(this.scene.userData.lightTimeline.lightTracks));
            }

            // LightTimeline에서 데이터 로드
            console.log("lightTimeline.onAfterLoad() 호출 중...");
            this.lightTimeline.onAfterLoad();
            console.log("=== LightTimeline 데이터 복원 완료 (3순위) ===");
          }
        } catch (error) {
          console.error("LightTimeline 데이터 복원 중 오류:", error);
        }
      }



      // 🔧 4순위: AudioTimeline 데이터 복원
      const audioTimelineSource =
        projectData.audioTimeline
        || projectData.scene?.object?.userData?.audioTimeline
        || this.scene.userData?.audioTimeline;

      if (audioTimelineSource) {
        if (!this.scene.userData) this.scene.userData = {};
        this.scene.userData.audioTimeline = audioTimelineSource;

        try {
          this.connectTimelineInstances();

          console.log("=== AudioTimeline 데이터 복원 시작 (4순위) ===");
          const audioTimeline = window.timeline?.timelines?.audio || this.audioTimeline;

          if (audioTimeline?.onAfterLoad) {
            this.audioTimeline = audioTimeline;
            console.log("audioTimeline.onAfterLoad() 호출 중...");
            audioTimeline.onAfterLoad();
            console.log("=== AudioTimeline 데이터 복원 완료 (4순위) ===");
          } else {
            console.warn("⚠️ AudioTimeline 인스턴스를 찾을 수 없습니다!");
          }
        } catch (error) {
          console.error("AudioTimeline 데이터 복원 중 오류:", error);
        }
      } else {
        console.log("scene.userData.audioTimeline이 없어서 AudioTimeline 복원을 건너뜁니다.");
      }

      // 모든 타임라인 복원 후 — 무대 배경 + 모션 트랙 UI 최종 재생성
      this.restoreStageAfterProjectLoad();
      this.refreshMotionTimelineAfterSceneLoad();
      this.refreshAudioTimelineAfterSceneLoad();

      // LightTimeline 데이터가 없거나 lightTimeline 인스턴스가 없습니다.
      if (!projectData.lightTimeline && !this.scene.userData.lightTimeline) {
        console.log("LightTimeline 데이터가 없거나 lightTimeline 인스턴스가 없습니다.");
        console.log("projectData.lightTimeline 존재:", !!projectData.lightTimeline);
        console.log("this.lightTimeline 존재:", !!this.lightTimeline);

        // LightTimeline 데이터가 없으면 아무것도 하지 않습니다.
        console.log("LightTimeline 데이터가 없으므로 트랙을 생성하지 않습니다.");
      }

      // 원래 메서드들 복원
      THREE.TextureLoader.prototype.load = originalTextureLoaderLoad;
      THREE.ImageLoader.prototype.load = originalImageLoaderLoad;

      await this.waitForProjectLoadCompletion();

    } catch (error) {
      console.error("JSON 데이터 로드 중 전체 오류:", error);
      throw error; // 상위로 오류 전파
    } finally {
      if (this.progressiveLoader) {
        this.progressiveLoader.keepOverlayOpen = false;
        this.progressiveLoader.hideProgressUI({ force: true });
      }
    }
  },

  toJSON: async function () {
    // scripts clean up
    console.log("Editor toJSON called"); // 디버깅용 로그

    // 저장 시 렌더링 캐시(renderedFrames) 제외 — 프로젝트 용량 폭증 방지
    if (window.timeline && window.timeline.timelineRenderer && window.timeline.timelineRenderer.renderedFrames) {
      const tr = window.timeline.timelineRenderer;
      if (tr.renderedFrames.length > 0) {
        tr.renderedFrames.forEach((frame) => {
          if (frame && frame.dataURL && frame.dataURL.startsWith("blob:")) {
            try { URL.revokeObjectURL(frame.dataURL); } catch (e) {}
          }
        });
        tr.renderedFrames.length = 0;
        tr.renderedFrames = [];
        console.log("저장 전 렌더링 프레임 캐시 비움 (프로젝트 용량 방지)");
      }
    }
    if (window.timeline && Array.isArray(window.timeline.renderedFrames) && window.timeline.renderedFrames.length > 0) {
      window.timeline.renderedFrames.length = 0;
      window.timeline.renderedFrames = [];
    }

    var scene = this.scene;
    var scripts = this.scripts;

    for (var key in scripts) {
      var script = scripts[key];

      if (
        script.length === 0 ||
        scene.getObjectByProperty("uuid", key) === undefined
      ) {
        delete scripts[key];
      }
    }

    // honor modelviewer environment

    let environment = null;

    if (
      this.scene.environment !== null &&
      this.scene.environment.isRenderTargetTexture === true
    ) {
      environment = "ModelViewer";
    }

    // MotionTimeline 데이터 저장
    if (this.motionTimeline) {
      try {
        console.log("=== MotionTimeline 데이터 저장 시작 ===");
        console.log("this.motionTimeline:", this.motionTimeline);
        console.log("this.scene.userData:", this.scene.userData);
        console.log("this.scene.userData.motionTimeline 존재:", !!this.scene.userData?.motionTimeline);

        if (this.scene.userData?.motionTimeline) {
          console.log("저장 전 motionTimeline 데이터:", this.scene.userData.motionTimeline);
          console.log("tracks 키들:", Object.keys(this.scene.userData.motionTimeline.tracks || {}));

          // 각 트랙의 내용 확인
          Object.entries(this.scene.userData.motionTimeline.tracks || {}).forEach(([uuid, properties]) => {
            console.log(`트랙 ${uuid} properties:`, properties);
            console.log(`트랙 ${uuid} properties 키들:`, Object.keys(properties));
          });
        }

        this.motionTimeline.onBeforeSave();

        console.log("onBeforeSave 완료 후 scene.userData.motionTimeline:", this.scene.userData.motionTimeline);
        console.log("onBeforeSave 후 tracks 키들:", Object.keys(this.scene.userData.motionTimeline?.tracks || {}));
        console.log("=== MotionTimeline 데이터 저장 완료 ===");

        // LightTimeline 데이터 저장
        if (this.lightTimeline) {
          try {
            console.log("=== LightTimeline 데이터 저장 시작 ===");
            console.log("this.lightTimeline:", this.lightTimeline);
            console.log("this.scene.userData.lightTimeline 존재:", !!this.scene.userData?.lightTimeline);

            if (this.scene.userData?.lightTimeline) {
              console.log("저장 전 lightTimeline 데이터:", this.scene.userData.lightTimeline);
              console.log("tracks 키들:", Object.keys(this.scene.userData.lightTimeline.tracks || {}));
            }

            this.lightTimeline.onBeforeSave();

            console.log("onBeforeSave 완료 후 scene.userData.lightTimeline:", this.scene.userData.lightTimeline);
            console.log("onBeforeSave 후 tracks 키들:", Object.keys(this.scene.userData.lightTimeline?.tracks || {}));
            console.log("=== LightTimeline 데이터 저장 완료 ===");
          } catch (error) {
            console.error("LightTimeline 데이터 저장 중 오류:", error);
          }
        } else {
          console.log("lightTimeline 인스턴스가 없어서 저장하지 않습니다.");
          // LightTimeline 인스턴스가 없다면 생성 시도
          if (window.timeline && window.timeline.timelines && window.timeline.timelines.light) {
            this.lightTimeline = window.timeline.timelines.light;
            console.log("LightTimeline 인스턴스를 window.timeline에서 찾아서 연결했습니다.");
            try {
              console.log("=== LightTimeline 데이터 저장 시작 ===");
              this.lightTimeline.onBeforeSave();
              console.log("=== LightTimeline 데이터 저장 완료 ===");
            } catch (error) {
              console.error("LightTimeline 데이터 저장 중 오류:", error);
            }
          }
        }
      } catch (error) {
        console.error("MotionTimeline 데이터 저장 중 오류:", error);
      }
    } else {
      console.log("motionTimeline 인스턴스가 없어서 저장하지 않습니다.");
    }

    // AudioTimeline 데이터 저장
    if (this.audioTimeline) {
      try {
        console.log("=== AudioTimeline 데이터 저장 시작 ===");
        console.log("this.audioTimeline:", this.audioTimeline);
        console.log("this.scene.userData.audioTimeline 존재:", !!this.scene.userData?.audioTimeline);

        if (this.scene.userData?.audioTimeline) {
          console.log("저장 전 audioTimeline 데이터:", this.scene.userData.audioTimeline);
          console.log("tracks 키들:", Object.keys(this.scene.userData.audioTimeline.tracks || {}));
        }

        this.audioTimeline.onBeforeSave();

        console.log("onBeforeSave 완료 후 scene.userData.audioTimeline:", this.scene.userData.audioTimeline);
        console.log("onBeforeSave 후 tracks 키들:", Object.keys(this.scene.userData.audioTimeline?.tracks || {}));
        console.log("=== AudioTimeline 데이터 저장 완료 ===");
      } catch (error) {
        console.error("AudioTimeline 데이터 저장 중 오류:", error);
      }
    } else {
      console.log("audioTimeline 인스턴스가 없어서 저장하지 않습니다.");
      // AudioTimeline 인스턴스가 없다면 생성 시도
      if (window.timeline && window.timeline.timelines && window.timeline.timelines.audio) {
        this.audioTimeline = window.timeline.timelines.audio;
        console.log("AudioTimeline 인스턴스를 window.timeline에서 찾아서 연결했습니다.");
        try {
          console.log("=== AudioTimeline 데이터 저장 시작 ===");
          this.audioTimeline.onBeforeSave();
          console.log("=== AudioTimeline 데이터 저장 완료 ===");
        } catch (error) {
          console.error("AudioTimeline 데이터 저장 중 오류:", error);
        }
      }

      // 🔧 Timeline.js의 onBeforeSave() 호출 (중요!)
      if (this.timeline && this.timeline.onBeforeSave) {
        try {
          console.log("=== Timeline.js onBeforeSave() 호출 시작 ===");
          this.timeline.onBeforeSave();
          console.log("=== Timeline.js onBeforeSave() 호출 완료 ===");
        } catch (error) {
          console.error("Timeline.js onBeforeSave() 실행 중 오류:", error);
        }
      } else {
        console.warn("this.timeline 또는 onBeforeSave 메서드가 없습니다");
      }
    }

    // 기본 프로젝트 데이터 생성 (씬 데이터 안전 처리)
    let sceneData;
    let childrenFile = null;

    try {
      // scene.toJSON() 호출 전에 children 전체를 임시로 제거
      const originalChildren = this.scene.children;
      this.scene.children = [];
      // 기본 씬 데이터 생성 (skeleton 정보 포함)
      sceneData = this.scene.toJSON();
      console.log("기본 씬 데이터 생성 완료");

      // skeleton 정보 강제 포함
      this.ensureSkeletonData(sceneData);
      console.log("skeleton 정보 강제 포함 완료");
      // children 저장: motion=경로참조, mesh=geometry포함, Stage=경량참조
      if (originalChildren.length > 0) {
        console.log("children 개수:", originalChildren.length);
        const { SceneObjectSerializer } = await import('./utils/SceneObjectSerializer.js');
        const childrenData = SceneObjectSerializer.collectChildrenForSave(originalChildren);
        const savedCount = childrenData.filter(Boolean).length;
        console.log(`직렬화된 children: ${savedCount}개 (원본 ${originalChildren.length}개)`);

        try {
          const childrenFiles = [];
          const timestamp = Date.now();
          for (let i = 0; i < childrenData.length; i++) {
            if (!childrenData[i]) continue;
            try {
              const childSize = JSON.stringify(childrenData[i]).length;
              console.log(`child ${i} (${childrenData[i].saveType}) 크기:`, childSize, "bytes");
              if (childSize > 100000) {
                const fileName = `scene_child_${timestamp}_${i}.json`;
                childrenFiles.push({ index: i, fileName, data: childrenData[i] });
              } else {
                childrenFiles.push({ index: i, fileName: null, data: childrenData[i] });
              }
            } catch (childSizeError) {
              console.warn(`child ${i} 크기 측정 실패:`, childSizeError);
              const fileName = `scene_child_${timestamp}_${i}.json`;
              childrenFiles.push({ index: i, fileName, data: childrenData[i] });
            }
          }
          // 큰 child → 분리 파일, 작은 child → 인덱스별 inlineChildSlots (순서 유지, 조명 등 누락 방지)
          const inlineChildSlots = {};
          childrenFiles.forEach(({ index, fileName, data }) => {
            if (!fileName && data) inlineChildSlots[String(index)] = data;
          });
          const largeChildrenFiles = childrenFiles
            .filter(item => item.fileName !== null)
            .map(item => item.fileName);
          if (largeChildrenFiles.length > 0) {
            childrenFile = {
              inlineChildSlots,
              largeChildrenFiles,
              childrenFiles: childrenFiles
            };
            console.log(
              `children 데이터 분리: inline ${Object.keys(inlineChildSlots).length}개, 큰 파일 ${largeChildrenFiles.length}개`
            );
            sceneData.object.children = [];
            sceneData.object.inlineChildSlots = inlineChildSlots;
            sceneData.object.sceneChildCount = originalChildren.length;
            sceneData.object.largeChildrenFiles = largeChildrenFiles;
          } else {
            // 작은 children도 inlineChildSlots에만 저장 (Three.js parseAsync와 형식 충돌 방지)
            const inlineOnly = {};
            childrenData.forEach((data, i) => {
              if (data) inlineOnly[String(i)] = data;
            });
            sceneData.object.children = [];
            sceneData.object.inlineChildSlots = inlineOnly;
            sceneData.object.sceneChildCount = originalChildren.length;
            sceneData.object.largeChildrenFiles = [];
            console.log(`children inline 저장: ${Object.keys(inlineOnly).length}개`);
          }
        } catch (sizeError) {
          console.error("children 데이터 처리 실패:", sizeError);
          // 오류 발생 시 모든 children을 개별 파일로 저장
          const childrenFiles = [];
          const timestamp = Date.now();
          for (let i = 0; i < childrenData.length; i++) {
            const fileName = `scene_child_${timestamp}_${i}.json`;
            childrenFiles.push({
              index: i,
              fileName: fileName,
              data: childrenData[i]
            });
          }
          childrenFile = {
            inlineChildSlots: {},
            largeChildrenFiles: childrenFiles.map(item => item.fileName),
            childrenFiles: childrenFiles
          };
          console.log("오류로 인한 모든 children 개별 파일 저장:", childrenFiles.length, "개 파일");
          sceneData.object.children = [];
          sceneData.object.inlineChildSlots = {};
          sceneData.object.sceneChildCount = childrenFiles.length;
          sceneData.object.largeChildrenFiles = childrenFiles.map(item => item.fileName);
        }
      } else {
        sceneData.object.children = [];
      }
      // 원래 children 복원
      this.scene.children = originalChildren;

    } catch (error) {
      console.error("씬 데이터 생성 실패:", error);
      // 기본 씬 데이터 생성
      sceneData = {
        metadata: { version: 4.5, type: "Object" },
        geometries: {},
        materials: {},
        textures: {},
        images: {},
        shapes: {},
        skeletons: {},
        animations: [],
        object: {
          uuid: this.scene.uuid,
          type: "Scene",
          name: this.scene.name,
          children: [],
          userData: this.scene.userData || {}
        }
      };

      // 원래 children 복원
      this.scene.children = originalChildren;
    }

    const baseData = {
      metadata: {},
      project: {
        shadows: this.config.getKey("project/renderer/shadows"),
        shadowType: this.config.getKey("project/renderer/shadowType"),
        toneMapping: this.config.getKey("project/renderer/toneMapping"),
        toneMappingExposure: this.config.getKey(
          "project/renderer/toneMappingExposure"
        ),
      },
      // 사용자 프로젝트 정보 저장 (공연명, 공연기간, 공연장소 등)
      userProject: this.project || null,
      camera: this.viewportCamera.toJSON(),
      scene: sceneData,
      scripts: this.scripts,
      history: this.history.toJSON(),
      environment: environment,
      motionTimeline: this.scene.userData.motionTimeline || null, // MotionTimeline 데이터 저장
      lightTimeline: this.scene.userData.lightTimeline || null, // LightTimeline 데이터 저장
      audioTimeline: this.scene.userData.audioTimeline || null, // AudioTimeline 데이터 저장
      music: this.music ? this.music.toJSON() : undefined, // music 정보 저장
    };

    // MotionTimeline 데이터 저장 확인
    console.log("=== toJSON 반환 전 MotionTimeline 데이터 확인 ===");
    console.log("baseData.motionTimeline 존재:", !!baseData.motionTimeline);
    if (baseData.motionTimeline) {
      console.log("baseData.motionTimeline:", baseData.motionTimeline);
      console.log("baseData.motionTimeline.tracks 키들:", Object.keys(baseData.motionTimeline.tracks || {}));

      // 각 트랙의 내용 확인
      Object.entries(baseData.motionTimeline.tracks || {}).forEach(([uuid, properties]) => {
        console.log(`반환 전 트랙 ${uuid} properties:`, properties);
        console.log(`반환 전 트랙 ${uuid} properties 키들:`, Object.keys(properties));
      });
    }
    console.log("=== toJSON 반환 전 MotionTimeline 데이터 확인 완료 ===");

    // 데이터 크기 측정 및 압축 처리
    try {
      // 씬 데이터 크기만 먼저 측정
      const sceneSize = JSON.stringify(sceneData).length;
      console.log("씬 데이터 크기:", sceneSize, "bytes");

      if (sceneSize > 10000000) { // 10MB 이상이면 압축하지 않음
        console.warn("씬 데이터가 너무 커서 압축을 건너뜁니다.");
        return baseData;
      }

      // 전체 데이터 크기 측정
      const testSize = JSON.stringify(baseData).length;
      console.log("기본 데이터 크기:", testSize, "bytes");

      if (testSize > 50000000) { // 50MB 이상이면 압축하지 않음
        console.warn("데이터가 너무 커서 압축을 건너뜁니다.");
        return baseData;
      }

      // 데이터 압축 적용 (1단계)
      const { DataCompressor } = await import('./utils/DataCompressor.js');
      const compressedData = DataCompressor.compressProjectData(baseData);
      return compressedData;
    } catch (error) {
      console.warn("데이터 압축 실패, 원본 데이터 반환:", error);
      return baseData;
    }
  },

  // 분리 저장을 위한 새로운 메서드 (2단계)
  toSplitJSON: async function (options = {}) {
    console.log("Editor toSplitJSON called"); // 디버깅용 로그

    // 기본 데이터 생성
    const baseData = await this.toJSON();

    // children 파일이 분리된 경우 처리
    let childrenFileData = null;
    let individualChildrenFiles = null;

    if (baseData.scene && baseData.scene.object) {
      // 단일 파일 참조 (이전 버전 호환성)
      if (baseData.scene.object.childrenFile) {
        try {
          // 원래 children 데이터를 다시 생성 (안전한 처리)
          const originalChildren = this.scene.children;
          childrenFileData = [];
          const failedChildren = [];

          for (let i = 0; i < originalChildren.length; i++) {
            try {
              const { SceneObjectSerializer } = await import('./utils/SceneObjectSerializer.js');
              const childData = SceneObjectSerializer.serializeChild(originalChildren[i]);
              if (childData) childrenFileData.push(childData);
            } catch (childError) {
              console.warn(`분리된 children 생성 중 child ${i} 처리 실패:`, childError);
              failedChildren.push(i);
              // 실패한 child는 기본 구조만 추가
              childrenFileData.push({
                uuid: originalChildren[i].uuid || `failed_child_${i}`,
                type: originalChildren[i].type || "Object3D",
                name: originalChildren[i].name || `Failed_Child_${i}`,
                children: [],
                userData: {}
              });
            }
          }

          if (failedChildren.length > 0) {
            console.warn("분리된 children 생성 중 처리 실패한 children:", failedChildren);
          }

          console.log("분리된 children 데이터 생성 완료");
        } catch (error) {
          console.error("분리된 children 데이터 생성 실패:", error);
          childrenFileData = [];
        }
      }
      // 개별 children 파일 참조 (새로운 방식)
      else if (baseData.scene.object.largeChildrenFiles && Array.isArray(baseData.scene.object.largeChildrenFiles)) {
        try {
          const originalChildren = this.scene.children;
          const childrenFiles = [];
          const failedChildren = [];
          const baseLargeChildrenFiles = baseData.scene.object.largeChildrenFiles;

          // baseData가 참조하는 파일명을 인덱스별로 매핑 (파일명은 toJSON 단계에서 생성됨)
          // 예: scene_child_1773802709466_3.json -> index 3
          const indexToFileName = new Map();
          baseLargeChildrenFiles.forEach((fileName) => {
            if (typeof fileName !== 'string') return;
            const match = fileName.match(/scene_child_\d+_(\d+)\.json$/);
            if (!match) return;
            const index = parseInt(match[1], 10);
            if (!Number.isNaN(index)) indexToFileName.set(index, fileName);
          });

          for (let i = 0; i < originalChildren.length; i++) {
            try {
              const { SceneObjectSerializer } = await import('./utils/SceneObjectSerializer.js');
              const childData = SceneObjectSerializer.serializeChild(originalChildren[i]);
              if (!childData) continue;
              const childSize = JSON.stringify(childData).length;

              if (childSize > 100000) { // 100KB 이상이면 개별 파일로 저장
                // ⚠️ 중요: baseData가 참조하는 파일명과 ZIP에 넣는 splitFiles 키가 같아야
                // 열기(loadFromProjectZip → mergeSplitData)에서 children 복원이 정상 동작함.
                const fileName = indexToFileName.get(i) || `scene_child_${Date.now()}_${i}.json`;
                childrenFiles.push({
                  index: i,
                  fileName: fileName,
                  data: childData
                });
              } else {
                // 작은 child는 나중에 배열에 포함
                childrenFiles.push({
                  index: i,
                  fileName: null,
                  data: childData
                });
              }
            } catch (childError) {
              console.warn(`개별 children 생성 중 child ${i} 처리 실패:`, childError);
              failedChildren.push(i);
              // 실패한 child는 개별 파일로 저장
              const fileName = indexToFileName.get(i) || `scene_child_${Date.now()}_${i}.json`;
              childrenFiles.push({
                index: i,
                fileName: fileName,
                data: {
                  uuid: originalChildren[i].uuid || `failed_child_${i}`,
                  type: originalChildren[i].type || "Object3D",
                  name: originalChildren[i].name || `Failed_Child_${i}`,
                  children: [],
                  userData: {}
                }
              });
            }
          }

          if (failedChildren.length > 0) {
            console.warn("개별 children 생성 중 처리 실패한 children:", failedChildren);
          }

          individualChildrenFiles = childrenFiles;
          console.log(`개별 children 데이터 생성 완료: ${childrenFiles.length}개 children`);
        } catch (error) {
          console.error("개별 children 데이터 생성 실패:", error);
          individualChildrenFiles = [];
        }
      }
    }

    // 데이터 분리 적용 (2단계)
    try {
      const { DataSplitter } = await import('./utils/DataSplitter.js');

      // 데이터 크기 확인
      try {
        const dataSize = JSON.stringify(baseData).length;
        console.log("분리 전 데이터 크기:", dataSize, "bytes");

        if (dataSize > 100000000) { // 100MB 이상이면 분리 강제 적용
          console.warn("데이터가 너무 커서 강제 분리를 적용합니다.");
          options.forceSplit = true;
        }
      } catch (sizeError) {
        console.warn("데이터 크기 측정 실패, 강제 분리 적용:", sizeError);
        options.forceSplit = true;
      }

      const splitResult = DataSplitter.splitProjectData(baseData, options);

      // scene children 백업: 개별 scene_child_*.json 분리가 없고, 크기가 작을 때만 단일 파일로 저장
      const hasLargeChildSplit = Array.isArray(baseData.scene?.object?.largeChildrenFiles)
        && baseData.scene.object.largeChildrenFiles.length > 0;

      if (!hasLargeChildSplit) {
        try {
          const allChildrenBackup = [];
          for (let i = 0; i < this.scene.children.length; i++) {
            try {
              allChildrenBackup.push(this.scene.children[i].toJSON());
            } catch (childErr) {
              console.warn(`all_scene_children 백업 중 child ${i} 실패:`, childErr);
            }
          }
          if (allChildrenBackup.length > 0) {
            let backupSize = 0;
            try {
              backupSize = JSON.stringify(allChildrenBackup).length;
            } catch (sizeErr) {
              console.warn('all_scene_children 크기 측정 실패, 백업 생략:', sizeErr);
              backupSize = Infinity;
            }

            const MAX_BACKUP_BYTES = 5 * 1024 * 1024; // 5MB
            if (backupSize <= MAX_BACKUP_BYTES) {
              const backupFileName = 'all_scene_children.json';
              splitResult.splitFiles[backupFileName] = allChildrenBackup;
              if (!splitResult.fileReferences.includes(backupFileName)) {
                splitResult.fileReferences.push(backupFileName);
              }
              if (splitResult.baseData.scene?.object) {
                splitResult.baseData.scene.object.allSceneChildrenFile = backupFileName;
              }
              console.log(`all_scene_children.json 백업 저장: ${allChildrenBackup.length}개 (${backupSize} bytes)`);
            } else {
              console.warn(`all_scene_children 백업 생략: ${backupSize} bytes (한도 ${MAX_BACKUP_BYTES})`);
            }
          }
        } catch (backupErr) {
          console.warn('all_scene_children 백업 생성 실패:', backupErr);
        }
      } else {
        console.log('개별 scene_child 파일이 있어 all_scene_children.json 백업 생략');
      }

      // children 파일 데이터 추가
      if (childrenFileData && baseData.scene && baseData.scene.object && baseData.scene.object.childrenFile) {
        splitResult.splitFiles[baseData.scene.object.childrenFile] = childrenFileData;
        splitResult.fileReferences.push(baseData.scene.object.childrenFile);
        console.log("children 파일 데이터 추가 완료:", baseData.scene.object.childrenFile);
      }

      // 개별 children 파일들 추가
      if (individualChildrenFiles && baseData.scene && baseData.scene.object && baseData.scene.object.largeChildrenFiles) {
        for (const childFile of individualChildrenFiles) {
          if (childFile.fileName) {
            splitResult.splitFiles[childFile.fileName] = childFile.data;
            splitResult.fileReferences.push(childFile.fileName);
            console.log(`개별 child ${childFile.index} 파일 데이터 추가 완료:`, childFile.fileName);
          }
        }
      }

      return splitResult;
    } catch (error) {
      console.warn("데이터 분리 실패, 기본 데이터 반환:", error);
      return {
        baseData,
        splitFiles: childrenFileData ? { [baseData.scene?.object?.childrenFile]: childrenFileData } : {},
        fileReferences: childrenFileData ? [baseData.scene?.object?.childrenFile] : []
      };
    }
  },

  // ZIP 파일로 저장하는 메서드 (2단계)
  toProjectZip: async function (projectName = "project", options = {}) {
    console.log("Editor toProjectZip called"); // 디버깅용 로그

    try {
      // 분리된 데이터 생성
      const splitResult = await this.toSplitJSON(options);

      // ZIP 파일 생성
      const { DataSplitter } = await import('./utils/DataSplitter.js');
      const zipBlob = await DataSplitter.createProjectZip(splitResult, projectName);

      return zipBlob;
    } catch (error) {
      console.error("ZIP 파일 생성 실패:", error);
      throw error;
    }
  },

  // 점진적 로딩 설정 메서드 (3단계)
  setProgressiveLoadingOptions: function (options = {}) {
    this.progressiveLoadingOptions = {
      enabled: true,
      priorityOrder: ['base', 'scene', 'timeline', 'music', 'history'],
      batchSize: 3,
      delayBetweenBatches: 50,
      showProgress: true,
      ...options
    };
  },

  // 점진적 로딩 상태 확인 (3단계)
  getProgressiveLoadingStatus: function () {
    if (this.progressiveLoader) {
      return {
        isLoading: this.progressiveLoader.isLoading,
        progress: this.progressiveLoader.getProgress(),
        totalItems: this.progressiveLoader.totalItems,
        loadedItems: this.progressiveLoader.loadedItems
      };
    }
    return { isLoading: false, progress: 0, totalItems: 0, loadedItems: 0 };
  },

  objectByUuid: function (uuid) {
    return this.scene.getObjectByProperty("uuid", uuid, true);
  },

  execute: function (cmd, optionalName) {
    this.history.execute(cmd, optionalName);
  },

  undo: function () {
    this.history.undo();
  },

  redo: function () {
    this.history.redo();
  },

  utils: {
    save: save,
    saveArrayBuffer: saveArrayBuffer,
    saveString: saveString,
    formatNumber: formatNumber,
  },
};

const link = document.createElement("a");

function save(blob, filename) {
  if (link.href) {
    URL.revokeObjectURL(link.href);
  }

  link.href = URL.createObjectURL(blob);
  link.download = filename || "data.json";
  link.dispatchEvent(new MouseEvent("click"));
}

function saveArrayBuffer(buffer, filename) {
  save(new Blob([buffer], { type: "application/octet-stream" }), filename);
}

function saveString(text, filename) {
  save(new Blob([text], { type: "text/plain" }), filename);
}

function formatNumber(number) {
  return new Intl.NumberFormat("en-us", { useGrouping: true }).format(number);
}

export { Editor };