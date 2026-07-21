import * as THREE from "three";
import { captureMotionWorldReferenceHeight } from "./motionDisplayUnits.js";

const STAGE_INTERNAL_NAMES = new Set([
  "_Background",
  "_Floor",
  "_Light",
  "_StageFrontSpot_L",
  "_StageFrontSpot_C",
  "_StageFrontSpot_R",
  "_StageFrontSpotTarget_L",
  "_StageFrontSpotTarget_C",
  "_StageFrontSpotTarget_R",
]);

function resolveFbxPath(fileName, userData = {}) {
  if (userData.filePath) return userData.filePath;
  if (userData.assetPath) return userData.assetPath;
  if (userData.sourceFile) return userData.sourceFile;
  if (userData.procedural) return `procedural://${userData.procedural}`;
  if (fileName) return `../files/fbx/${fileName}`;
  return "";
}

function pickMotionUserData(userData = {}) {
  const keys = [
    "source",
    "filePath",
    "fileName",
    "assetPath",
    "sourceFile",
    "displayName",
    "tintable",
    "tintColor",
    "walkLiteColor",
    "scCustomTint",
    "scGroupId",
    "scMemberId",
    "procedural",
    "isTesterMotion",
    "dreamCheonrok",
    "motionWorldReferenceHeight",
    "hideInScenePanel",
  ];
  const out = {};
  keys.forEach((k) => {
    if (userData[k] !== undefined) out[k] = userData[k];
  });
  out.source = "motion";
  return out;
}

/** procedural:// 또는 WalkLite/천록/꾀꼬리 파일명 → 경량 퍼포머 복원 */
function detectProceduralId(userData = {}, filePath = "", fileName = "") {
  const procedural = String(userData.procedural || "").toLowerCase();
  if (
    procedural === "walk-lite" ||
    procedural === "cheonrok-lite" ||
    procedural === "kkekkori-lite"
  ) {
    return procedural;
  }

  const path = String(filePath || userData.filePath || "").toLowerCase();
  if (path.includes("procedural://walk-lite") || path.includes("walk-lite")) {
    return "walk-lite";
  }
  if (path.includes("procedural://cheonrok-lite") || path.includes("cheonrok-lite")) {
    return "cheonrok-lite";
  }
  if (path.includes("procedural://kkekkori-lite") || path.includes("kkekkori-lite")) {
    return "kkekkori-lite";
  }

  const name = String(fileName || userData.fileName || "").toLowerCase();
  if (name.includes("walklite") || name === "walklite.fbx") return "walk-lite";
  if (name.includes("cheonrok")) return "cheonrok-lite";
  if (name.includes("kkekkori")) return "kkekkori-lite";
  return null;
}

function classifyChild(object) {
  if (!object) return "skip";

  const name = String(object.name || "");

  if (name === "_WorkLights" || object.userData?.type === "workLights") {
    return "skip";
  }
  if (name === "Stage" || object.userData?.excludeFromTimeline === true) {
    return "stageRef";
  }
  if (STAGE_INTERNAL_NAMES.has(name) || object.userData?.isBackground === true) {
    return "skip";
  }
  if (object.isLight || /^light_\d+/.test(name) || name.endsWith("_Target")) {
    return "skip";
  }
  if (object.userData?.source === "motion") {
    return "motionRef";
  }
  if (object.userData?.source === "mesh") {
    return "meshScene";
  }
  if (object.isMesh && object.geometry) {
    return "meshScene";
  }
  if (object.userData?.source === "motion" || /\.fbx$/i.test(name) || /\.obj$/i.test(name)) {
    return "motionRef";
  }
  return "legacyScene";
}

export class SceneObjectSerializer {
  static serializeChild(object) {
    const saveType = classifyChild(object);

    if (saveType === "skip") {
      return null;
    }

    if (saveType === "stageRef") {
      return {
        saveType: "stageRef",
        uuid: object.uuid,
        name: object.name,
        type: object.type,
        userData: {
          isBackground: true,
          excludeFromTimeline: true,
          notSelectable: true,
          notEditable: true,
          stageType: object.userData?.stageType,
        },
      };
    }

    if (saveType === "motionRef") {
      const fileName =
        object.userData?.fileName ||
        (object.name && /\.fbx$/i.test(object.name) ? object.name : `${object.name}.fbx`);
      const filePath = resolveFbxPath(fileName, object.userData);
      const procedural = object.userData?.procedural || detectProceduralId(object.userData, filePath, fileName);

      return {
        saveType: "motionRef",
        uuid: object.uuid,
        name: object.name,
        type: object.type || "Group",
        position: object.position.toArray(),
        rotation: object.rotation.toArray(),
        scale: object.scale.toArray(),
        visible: true, // 타임라인이 가시성 제어 — 클립 밖 false로 저장되면 로드 후 영구 숨김
        userData: {
          ...pickMotionUserData(object.userData),
          fileName,
          filePath: procedural ? `procedural://${procedural}` : filePath,
          ...(procedural ? { procedural } : {}),
        },
      };
    }

    if (saveType === "meshScene") {
      const clone = object.clone(true);
      const tempScene = new THREE.Scene();
      tempScene.add(clone);
      const sceneJson = tempScene.toJSON();
      tempScene.remove(clone);
      clone.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
      return {
        saveType: "meshScene",
        uuid: object.uuid,
        scene: sceneJson,
      };
    }

    // legacy: 전체 Three.js 노드 (geometry는 상위 scene JSON에 의존)
    return {
      saveType: "legacyScene",
      uuid: object.uuid,
      object: object.toJSON(),
    };
  }

  static collectChildrenForSave(sceneChildren) {
    const list = new Array(sceneChildren.length).fill(null);
    for (let i = 0; i < sceneChildren.length; i++) {
      list[i] = this.serializeChild(sceneChildren[i]);
    }
    return list;
  }

  static buildScenePayload(projectScene) {
    return {
      metadata: projectScene.metadata,
      geometries: projectScene.geometries,
      materials: projectScene.materials,
      textures: projectScene.textures,
      images: projectScene.images,
      skeletons: projectScene.skeletons,
      animations: projectScene.animations,
    };
  }

  static applyTransform(object, data) {
    if (!object || !data) return;
    if (Array.isArray(data.position)) object.position.fromArray(data.position);
    if (Array.isArray(data.rotation)) object.rotation.fromArray(data.rotation);
    if (Array.isArray(data.scale)) object.scale.fromArray(data.scale);
    if (typeof data.visible === "boolean") object.visible = data.visible;
  }

  static async processMotionObject(object, editor) {
    object.traverse((child) => {
      if (child.parent && child.parent.isGroup) {
        child.userData.hideInScenePanel = true;
        child.userData.notSelectable = true;
        child.userData.notEditable = true;
      }
    });

    if (object.animations?.length > 0) {
      const mixer = new THREE.AnimationMixer(object);
      const clip = object.animations[0];
      const action = mixer.clipAction(clip);
      action.reset();
      action.time = 0;
      action.setEffectiveWeight(1);
      action.play();
      mixer.update(0);
      object.updateMatrixWorld(true);
    }

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      const targetSize = 30;
      const scale = targetSize / maxDim;
      object.scale.multiplyScalar(scale);
    }

    object.updateMatrixWorld(true);
    captureMotionWorldReferenceHeight(object, editor);

    if (!object.userData) object.userData = {};
    object.userData.tintable = true;
    if (object.userData.tintColor === undefined) object.userData.tintColor = 0xff0000;
    object.traverse((child) => {
      if (!child?.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach((mat) => {
        if (mat?.color?.setHex) {
          mat.color.setHex(object.userData.tintColor);
          mat.needsUpdate = true;
        }
      });
    });
  }

  static async restoreMotionRef(data, editor) {
    const fileName = data.userData?.fileName;
    const filePath = resolveFbxPath(fileName, data.userData);
    if (!filePath) {
      console.warn("motionRef 복원 실패: filePath 없음", data.name);
      return null;
    }

    const proceduralId = detectProceduralId(data.userData, filePath, fileName);
    let object = null;

    // WalkLite / 천록 — FBX 없음, 프로시저럴 재생성
    if (proceduralId) {
      try {
        const {
          createWalkLitePerformer,
          createCheonrokLite,
          createKkekkoriLite,
          applyGroupMotionColor,
          WALK_LITE_PROCEDURAL_ID,
          CHEONROK_PROCEDURAL_ID,
          KKEKKORI_PROCEDURAL_ID,
        } = await import("./walkLitePerformer.js");
        const displayName =
          data.userData?.displayName ||
          data.name ||
          (proceduralId === "kkekkori-lite"
            ? "꾀꼬리"
            : proceduralId === "cheonrok-lite"
              ? "천록"
              : "WalkLite");
        const color =
          data.userData?.tintColor ??
          data.userData?.walkLiteColor ??
          (proceduralId === "kkekkori-lite"
            ? 0xffcc33
            : proceduralId === "cheonrok-lite"
              ? 0xc4a574
              : 0xd9c08a);

        if (proceduralId === WALK_LITE_PROCEDURAL_ID || proceduralId === "walk-lite") {
          object = createWalkLitePerformer({ displayName, color });
        } else if (proceduralId === KKEKKORI_PROCEDURAL_ID || proceduralId === "kkekkori-lite") {
          object = createKkekkoriLite({ displayName, color });
        } else {
          object = createCheonrokLite({ displayName, color });
        }

        if (data.userData?.tintColor != null || data.userData?.walkLiteColor != null) {
          applyGroupMotionColor(object, color);
        }
        // processMotionObject 금지 — 이미 autoScale·색 적용됨 (다시 돌리면 이중스케일/빨강)
        captureMotionWorldReferenceHeight(object, editor);
        console.log(`경량 모션 복원: ${displayName} (${proceduralId})`);
      } catch (err) {
        console.warn("경량 모션 복원 실패:", data.name, err);
        return null;
      }
    } else if (String(filePath).startsWith("procedural://")) {
      console.warn("알 수 없는 procedural motionRef:", filePath, data.name);
      return null;
    } else if (editor.loader?.loadMotionFromUrl) {
      object = await editor.loader.loadMotionFromUrl(filePath, {
        fileName: data.userData?.fileName,
        displayName: data.userData?.displayName,
      });
    } else {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const url = new URL(filePath, window.location.href).href;
      const buffer = await fetch(url).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      const loader = new FBXLoader();
      object = loader.parse(buffer);
      object.userData = { ...data.userData, source: "motion", filePath };
      await this.processMotionObject(object, editor);
    }

    if (!object) return null;

    object.uuid = data.uuid;
    object.name = data.name || object.name;
    this.applyTransform(object, data);
    // 타임라인이 가시성 제어 — 저장본 visible:false 로 영구 숨김되지 않게
    object.visible = true;
    const restoredPath = proceduralId ? `procedural://${proceduralId}` : filePath;
    object.userData = {
      ...object.userData,
      ...pickMotionUserData(data.userData),
      filePath: restoredPath,
      ...(proceduralId ? { procedural: proceduralId, isTesterMotion: true } : {}),
    };
    return object;
  }

  static async restoreChild(data, editor, loader, scenePayload) {
    if (!data) return null;

    if (!data.saveType && data.uuid && data.type) {
      if (data.scene) {
        data = { saveType: "meshScene", uuid: data.uuid, scene: data.scene };
      } else {
        data = { saveType: "legacyScene", uuid: data.uuid, object: data };
      }
    }

    const saveType = data.saveType || "legacyScene";

    if (saveType === "stageRef") {
      let stage = editor.scene.children.find((c) => c.name === "Stage");
      if (!stage) {
        stage = new THREE.Group();
        stage.name = "Stage";
        stage.userData = { ...(data.userData || {}), isBackground: true, excludeFromTimeline: true };
        editor.addObject(stage);
      }
      return stage;
    }

    if (saveType === "motionRef") {
      return this.restoreMotionRef(data, editor);
    }

    if (saveType === "meshScene" && data.scene) {
      const parsed = await loader.parseAsync(data.scene);
      let node = null;
      if (parsed?.isScene && parsed.children.length > 0) {
        node = parsed.children[0];
        parsed.remove(node);
      } else {
        node = parsed;
      }
      if (node && data.uuid) node.uuid = data.uuid;
      if (node) {
        node.userData = { ...(node.userData || {}), source: "mesh" };
      }
      return node;
    }

  // legacy / 이전 ZIP 형식
    const legacyObject = data.object || data;
    if (legacyObject?.uuid) {
      const parsed = await loader.parseAsync({ ...scenePayload, object: legacyObject });
      if (parsed?.isScene) {
        const nodes = [...parsed.children];
        return nodes[0] || null;
      }
      return parsed;
    }

    return null;
  }

  static async restoreChildren(editor, projectScene, loader) {
    if (!projectScene?.object) return 0;

    try {
      const { DataSplitter } = await import("./DataSplitter.js");
      DataSplitter.mergeSceneChildrenInPlace(projectScene);
    } catch (e) {
      console.warn("restoreChildren: 슬롯 병합 실패", e);
    }

    const childList = projectScene.object.children;
    if (!Array.isArray(childList) || childList.length === 0) {
      console.warn("restoreChildren: object.children 비어 있음");
      return 0;
    }

    const scenePayload = this.buildScenePayload(projectScene);
    const existingUuids = new Set();
    editor.scene.traverse((o) => {
      if (o.uuid) existingUuids.add(o.uuid);
    });

    let restored = 0;
    for (let i = 0; i < childList.length; i++) {
      const childData = childList[i];
      if (!childData || !childData.uuid) continue;

      if (existingUuids.has(childData.uuid)) {
        const existing = editor.scene.getObjectByProperty("uuid", childData.uuid);
        if (existing) {
          let hasMesh = false;
          existing.traverse((c) => {
            if (c.isMesh || c.isSkinnedMesh) hasMesh = true;
          });
          if (hasMesh || childData.saveType === "stageRef") continue;
          editor.removeObject(existing);
          existingUuids.delete(childData.uuid);
        }
      }

      try {
        const node = await this.restoreChild(childData, editor, loader, scenePayload);
        if (!node?.uuid) continue;

        if (existingUuids.has(node.uuid)) continue;

        if (editor.restoreSkeletonBinding) {
          editor.restoreSkeletonBinding(node);
        }
        editor.addObject(node);
        existingUuids.add(node.uuid);
        node.traverse((o) => {
          if (o.uuid) existingUuids.add(o.uuid);
        });
        restored++;
        console.log(`scene child 복원: ${node.name || node.uuid} (${childData.saveType || "legacy"})`);
      } catch (err) {
        console.warn(`scene child ${i} 복원 실패:`, err);
      }
    }

    console.log(`restoreChildren 완료: ${restored}개, 씬 자식 ${editor.scene.children.length}개`);
    return restored;
  }
}
