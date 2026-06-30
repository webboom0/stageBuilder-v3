import * as THREE from "three";
import { UIPanel, UIRow, UIText } from "./libs/ui.js";
import { AddObjectCommand } from "./commands/AddObjectCommand.js";
import { RemoveObjectCommand } from "./commands/RemoveObjectCommand.js";

/**
 * 난설 프리셋: 스크린샷 기준 PointLight 2개 + 무대(Box) 쪽 보조 조명 1개
 */
const NANSEOL_LIGHT_PRESETS = [
  // {
  //   key: "L",
  //   name: "난설_조명_L",
  //   position: new THREE.Vector3(-132.043, 157.002, 165.841),
  //   intensity: 1,
  //   color: 0xffffff,
  //   distance: 0,
  //   decay: 0,
  // },
  {
    key: "R",
    name: "난설_조명_R",
    position: new THREE.Vector3(102.684, 157.002, 176.523),
    // 키 라이트(흰색) — 대비를 위해 강하게
    intensity: 2.4,
    color: 0xffffff,
    distance: 520,
    decay: 1.2,
  },
  // 난설 무대 파란 조명 3개 (스샷 값 그대로)
  {
    key: "B_R",
    name: "난설_조명_파랑_R",
    position: new THREE.Vector3(186.286, 116.551, -68.595),
    // 림/엣지 라이트(푸른색) — 명암 경계 만들기
    intensity: 10.5,
    color: 0x1d3bff,
    distance: 520,
    decay: 1.35,
  },
  {
    key: "B_C",
    name: "난설_조명_파랑_C",
    position: new THREE.Vector3(4.252, 148.069, -57.775),
    intensity: 14.0,
    color: 0x1d3bff,
    distance: 560,
    decay: 1.35,
  },
  {
    key: "B_L",
    name: "난설_조명_파랑_L",
    position: new THREE.Vector3(-172.465, 111.718, -45.042),
    intensity: 10.5,
    color: 0x1d3bff,
    distance: 520,
    decay: 1.35,
  },
  // {
  //   key: "F",
  //   name: "난설_조명_F",
  //   // Box(무대) 영역 상공 — 이미지2 위치 기준
  //   position: new THREE.Vector3(4.293, 120, 52.044),
  //   intensity: 2,
  //   color: 0xffffff,
  //   distance: 0,
  //   decay: 0,
  // },
];

/**
 * 관객 위치(Z 음수)에서 무대 쪽(Z 양수)으로 비추는 SpotLight
 * - 조명: 관객 쪽(뒤) / 타겟: 무대 앞~중앙 → 사람(1.fbx 등) 정면에 조명 들어감
 */
const NANSEOL_FRONT_SPOT_PRESETS = [
  // 스폿은 각도를 줄이고(집중), penumbra를 낮춰 경계가 더 또렷하게 보이도록 설정
  { name: "난설_조명_앞_L", position: [-76.096, 66.489, 223.147], target: [-35, 2, 30], intensity: 6.2, distance: 520, angle: 0.75, penumbra: 0.14 },
  { name: "난설_조명_앞_C", position: [1.890, 56.744, 225.001], target: [0, 2, 30], intensity: 4.0, distance: 520, angle: 0.65, penumbra: 0.10, },
  { name: "난설_조명_앞_R", position: [86.550, 65.051, 218.534], target: [35, 2, 30], intensity: 6.2, distance: 520, angle: 0.65, penumbra: 0.12 },
];

/** 난설 클릭 시 오디오 타임라인에 추가할 음악 (addAudioFromAsset 형식) */
const NANSEOL_AUDIO_ASSET = {
  path: "../files/music/nanseol.mp3",
  name: "nanseol",
  displayName: "nanseol",
  filename: "nanseol.mp3",
};

/** 이미지 기준 Namoo.fbx 9개 배치 (위치, 스케일 0.137, 회전 0) */
const NANSEOL_NAMOO_PRESETS = [
  { position: [-53.429, 2.038, -48.961] },
  { position: [-121.571, 2.038, -48.961] },
  { position: [-141.627, 2.038, 5.365] },
  { position: [-134.766, 2.038, 66.096] },
  { position: [-134.766, 2.038, 104.146] },
  { position: [125.389, 2.038, 5.365] },
  { position: [94.683, 2.038, -48.961] },
  { position: [117.945, 2.038, 66.096] },
  { position: [117.787, 2.038, 104.146] },
  { position: [18.120, 2.038, -48.961] },
];

const NANSEOL_NAMOO_PATH = "../files/fbx/Namoo.fbx";
const NANSEOL_NAMOO_SCALE = 0.137;

/** 난설용 직육면체(Box) — 이미지 기준 위치·스케일 */
const NANSEOL_BOX_PRESET = {
  name: "Box",
  position: [-5.020, 6.2, 18.223],
  rotation: [0, 0, 0],
  scale: [89.254, 8.306, 20],
  visible: true,
};

/**
 * GitHub Pages는 Git LFS 대용량 바이너리를 그대로 서빙하지 못합니다.
 * 난설 캐릭터(1.fbx/2.fbx)가 LFS 포인터로 커밋된 경우, Pages에서는 FBX 대신 포인터/HTML을 받아 파싱이 실패합니다.
 *
 * 해결: CORS 허용되는 외부 정적 호스팅(예: S3/Cloudflare R2 등)에 files/ 폴더를 올린 뒤
 * window.STAGEBUILDER_ASSET_BASE_URL = "https://<host>/<root>/" 형태로 베이스 URL을 지정하세요.
 */
const STAGEBUILDER_ASSET_BASE_URL =
  (typeof window !== "undefined" && window.STAGEBUILDER_ASSET_BASE_URL) || "";

const resolveAssetUrl = (relativePath) => {
  if (!STAGEBUILDER_ASSET_BASE_URL) return relativePath;
  const base = String(STAGEBUILDER_ASSET_BASE_URL);
  const baseWithSlash = base.endsWith("/") ? base : `${base}/`;
  const normalized = String(relativePath).replace(/^\.\.\//, "");
  return new URL(normalized, baseWithSlash).toString();
};

const NANSEOL_MOTION_PRESET_PATH = resolveAssetUrl("../files/motion/temp2.json");
// 난설 캐릭터
const NANSEOL_1_FBX_PATH = resolveAssetUrl("../files/fbx/Character1.fbx");
// 2.fbx만 대용량이라 Cloudflare R2에서 직접 로드
// const NANSEOL_2_FBX_PATH ="https://pub-019b03564766487b9a9d6b42f6f23b8c.r2.dev/stagebuilder/2.fbx";
// const NANSEOL_2_FBX_PATH =resolveAssetUrl("../files/fbx/2.fbx"); //로컬용
const NANSEOL_2_FBX_PATH =resolveAssetUrl("../files/fbx/Character2.fbx"); 

function SidebarNanseol(editor) {
  const container = new UIPanel();
  container.setBorderTop("0");

  const showLoadingModal = (message = "난설 로딩 중...") => {
    // 중복 생성 방지
    const existing = document.getElementById("nanseol-loading-modal");
    if (existing) {
      const msgEl = existing.querySelector(".nanseol-loading-message");
      if (msgEl) msgEl.textContent = message;
      return () => existing.remove();
    }

    const overlay = document.createElement("div");
    overlay.id = "nanseol-loading-modal";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.zIndex = "999999";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0, 0, 0, 0.55)";
    overlay.style.backdropFilter = "blur(2px)";

    const card = document.createElement("div");
    card.style.minWidth = "260px";
    card.style.maxWidth = "420px";
    card.style.padding = "18px 16px";
    card.style.borderRadius = "10px";
    card.style.background = "#111";
    card.style.border = "1px solid rgba(255,255,255,0.12)";
    card.style.boxShadow = "0 12px 30px rgba(0,0,0,0.5)";
    card.style.color = "#fff";
    card.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.gap = "12px";
    row.style.alignItems = "center";

    const spinner = document.createElement("div");
    spinner.style.width = "18px";
    spinner.style.height = "18px";
    spinner.style.borderRadius = "50%";
    spinner.style.border = "2px solid rgba(255,255,255,0.25)";
    spinner.style.borderTopColor = "#fff";
    spinner.style.animation = "nanseol-spin 0.9s linear infinite";

    const msg = document.createElement("div");
    msg.className = "nanseol-loading-message";
    msg.textContent = message;
    msg.style.fontSize = "14px";
    msg.style.lineHeight = "1.4";

    row.appendChild(spinner);
    row.appendChild(msg);
    card.appendChild(row);
    overlay.appendChild(card);

    // keyframes는 1회만 주입
    if (!document.getElementById("nanseol-loading-style")) {
      const style = document.createElement("style");
      style.id = "nanseol-loading-style";
      style.textContent = `
@keyframes nanseol-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `.trim();
      document.head.appendChild(style);
    }

    document.body.appendChild(overlay);
    return () => overlay.remove();
  };

  const waitForMotionTimelineReady = async (timeoutMs = 30000) => {
    const startedAt = Date.now();
    const pollMs = 100;
    while (Date.now() - startedAt < timeoutMs) {
      const mt = editor.motionTimeline;
      // 트랙/클립이 반영되어 UI 생성이 시작되었는지 정도만 확인
      if (mt && mt.timelineData && mt.timelineData.tracks && mt.timelineData.tracks.size > 0) {
        return true;
      }
      await new Promise((r) => setTimeout(r, pollMs));
    }
    return false;
  };

  const row = new UIRow();
  row.setClass("nanseol-panel-row");

  const label = new UIText("난설").setClass("Label");
  row.add(label);

  const wrap = document.createElement("div");
  wrap.className = "nanseol-button-wrap";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nanseol-apply-button sb-dock-btn sb-dock-btn--wide sb-dock-btn--accent";
  btn.textContent = "난설";
  btn.title =
    "조명 3개 적용 + nanseol.mp3 오디오 타임라인에 추가";

  btn.addEventListener("click", async () => {
    const hideLoading = showLoadingModal("난설 모션 타임라인 로딩 중...");
    // 난설 카메라 프리셋 적용 (이미지 값)
    try {
      const cam = editor.viewportCamera || editor.camera;
      if (cam) {
        cam.position.set(0.0, 46.38, 349.672);
        cam.rotation.set(0, 0, 0);
        cam.scale.set(1, 1, 1);
        if (cam.fov !== undefined) {
          cam.fov = 50.0;
          cam.updateProjectionMatrix();
        }
        if (cam.near !== undefined) cam.near = 0.01;
        if (cam.far !== undefined) cam.far = 1000.0;
        cam.updateMatrix();
        cam.updateMatrixWorld();
        if (editor.signals?.cameraChanged) editor.signals.cameraChanged.dispatch();
        if (editor.signals?.viewportCameraChanged) editor.signals.viewportCameraChanged.dispatch();
      }
    } catch (e) {
      console.warn("[난설] 카메라 프리셋 적용 실패:", e);
    }

    const removeList = [];
    editor.scene.traverse((obj) => {
      if (obj.userData && (obj.userData.nanseolPreset === true || obj.userData.nanseolNamoo === true || obj.userData.nanseolBox === true || obj.userData.nanseolFrontSpot === true)) {
        removeList.push(obj);
      }
    });
    for (let i = removeList.length - 1; i >= 0; i--) {
      editor.execute(new RemoveObjectCommand(editor, removeList[i]));
    }

    // ✅ 대비를 위해 기본 주변광(무대 _Light HemisphereLight)을 약하게 낮춤
    // (난설 프리셋 조명 자체가 더 도드라지도록)
    try {
      const stage = editor.scene.getObjectByName("Stage");
      const hemi = stage?.children?.find?.((c) => c?.name === "_Light" && c?.isHemisphereLight);
      if (hemi) {
        if (!hemi.userData) hemi.userData = {};
        if (hemi.userData._nanseolPrevIntensity === undefined) {
          hemi.userData._nanseolPrevIntensity = hemi.intensity;
        }
        hemi.intensity = Math.min(hemi.intensity, 0.25);
      }
    } catch (e) {
      console.warn("[난설] 기본 주변광 조정 실패:", e);
    }

    // ✅ 렌더러 톤매핑/노출/그림자: 명암 대비를 더 선명하게
    try {
      if (editor.config && typeof editor.config.setKey === "function") {
        editor.config.setKey(
          "project/renderer/shadows", true,
          "project/renderer/shadowType", 2, // PCF Soft
          "project/renderer/toneMapping", 4, // ACESFilmic
          "project/renderer/toneMappingExposure", 1.15
        );
        if (editor.signals?.rendererUpdated) editor.signals.rendererUpdated.dispatch();
      }
    } catch (e) {
      console.warn("[난설] 렌더러 설정(톤매핑/그림자) 적용 실패:", e);
    }

    const hideLightHelpers = () => {
      try {
        // helpers는 editor.sceneHelpers(별도 scene)에 존재
        if (editor.sceneHelpers && editor.sceneHelpers.traverse) {
          editor.sceneHelpers.traverse((obj) => {
            if (!obj) return;
            const t = String(obj.type || "");
            if (
              t === "PointLightHelper" ||
              t === "DirectionalLightHelper" ||
              t === "SpotLightHelper" ||
              t === "HemisphereLightHelper"
            ) {
              obj.visible = false;
            }
          });
        }
      } catch (e) {
        console.warn("[난설] sceneHelpers 조명 가이드 숨김 실패:", e);
      }
    };

    // 난설 화면에서는 비디오 배경 박스(스크린)를 제거/숨김
    try {
      // 0) VideoBackground 인스턴스가 있으면 제거가 가장 확실
      if (editor.videoBackground && typeof editor.videoBackground.removeVideoBackground === "function") {
        editor.videoBackground.removeVideoBackground();
        console.log("[난설] videoBackground.removeVideoBackground() 호출");
      }

      const hidden = [];
      const hideVideoObj = (obj) => {
        if (!obj) return;
        const isNamedVideoBg = obj.name === "_VideoBackground" || String(obj.name || "").includes("VideoBackground");
        const hasVideoTexture =
          obj.material &&
          obj.material.map &&
          (obj.material.map.isVideoTexture === true ||
            obj.material.map.constructor?.name === "VideoTexture");
        if (isNamedVideoBg || hasVideoTexture) {
          if (!obj.userData) obj.userData = {};
          obj.userData.nanseolHiddenVideoBackground = true;
          obj.visible = false;
          hidden.push(obj);
        }
      };

      // 1) 씬 전체에서 탐색
      editor.scene.traverse(hideVideoObj);

      // 2) VideoBackground 인스턴스가 있으면 직접 숨김
      if (editor.videoBackground && editor.videoBackground.videoMesh) {
        hideVideoObj(editor.videoBackground.videoMesh);
      }

      // 3) stageGroup이 따로 잡혀 있으면 거기도 탐색
      if (editor.videoEdit && editor.videoEdit.stageGroup && editor.videoEdit.stageGroup.traverse) {
        editor.videoEdit.stageGroup.traverse(hideVideoObj);
      }

      if (hidden.length > 0) {
        console.log("[난설] _VideoBackground 숨김:", hidden.length, "개");
      }
    } catch (err) {
      console.warn("[난설] _VideoBackground 숨김 실패:", err);
    }

    // 난설 화면에서는 조명 가이드(Helper) 숨김
    try {
      // 1) View 메뉴 토글과 동일하게 showHelpersChanged로 강제 숨김
      if (editor.signals && editor.signals.showHelpersChanged) {
        editor.signals.showHelpersChanged.dispatch({
          gridHelper: false,
          guideHelper: false,
          cameraHelpers: false,
          lightHelpers: false,
          skeletonHelpers: false,
        });
      }

      // 2) 실제 helper들은 sceneHelpers에 있으므로 거기도 직접 숨김
      hideLightHelpers();
    } catch (err) {
      console.warn("[난설] Helper 숨김 실패:", err);
    }

    // for (const cfg of NANSEOL_LIGHT_PRESETS) {
    //   const light = new THREE.PointLight(
    //     cfg.color,
    //     cfg.intensity,
    //     cfg.distance,
    //     cfg.decay
    //   );
    //   light.name = cfg.name;
    //   light.position.copy(cfg.position);
    //   light.visible = true;
    //   light.userData.nanseolPreset = true;
    //   light.userData.nanseolKey = cfg.key;

    //   // 대비 강화: 그림자 활성화(프로젝트 설정에서 shadows가 켜져있을 때 효과)
    //   light.castShadow = true;
    //   light.shadow.mapSize.set(1024, 1024);
    //   light.shadow.bias = -0.0002;
    //   editor.execute(new AddObjectCommand(editor, light));
    // }
    console.log("[난설] PointLight 3개 적용 완료");

    for (const cfg of NANSEOL_FRONT_SPOT_PRESETS) {
      const target = new THREE.Object3D();
      target.position.set(cfg.target[0], cfg.target[1], cfg.target[2]);
      target.name = cfg.name + "_Target";
      target.userData.nanseolFrontSpot = true;
      editor.execute(new AddObjectCommand(editor, target));

      const spot = new THREE.SpotLight(
        (cfg.color !== undefined ? cfg.color : 0xffffff),
        cfg.intensity,
        cfg.distance,
        cfg.angle,
        cfg.penumbra,
        0
      );
      spot.name = cfg.name;
      spot.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
      spot.target = target;
      spot.visible = true;
      spot.userData.nanseolFrontSpot = true;

      // 대비 강화: 스폿 그림자 + 약간 더 하드한 그림자 품질
      spot.castShadow = true;
      spot.shadow.mapSize.set(2048, 2048);
      spot.shadow.bias = -0.00025;
      editor.execute(new AddObjectCommand(editor, spot));
    }
    console.log("[난설] 무대 앞쪽 SpotLight 3개 적용 완료");

    const boxGeom = new THREE.BoxGeometry(1, 1, 1);
    // 난설 무대용: 최대한 어둡게 (빛을 받아도 티 안 나게)
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x101010,
      roughness: 1,
      metalness: 0,
    });
    const boxMesh = new THREE.Mesh(boxGeom, boxMat);
    boxMesh.name = NANSEOL_BOX_PRESET.name;
    boxMesh.position.set(NANSEOL_BOX_PRESET.position[0], NANSEOL_BOX_PRESET.position[1], NANSEOL_BOX_PRESET.position[2]);
    boxMesh.rotation.set(NANSEOL_BOX_PRESET.rotation[0], NANSEOL_BOX_PRESET.rotation[1], NANSEOL_BOX_PRESET.rotation[2]);
    boxMesh.scale.set(NANSEOL_BOX_PRESET.scale[0], NANSEOL_BOX_PRESET.scale[1], NANSEOL_BOX_PRESET.scale[2]);
    boxMesh.visible = NANSEOL_BOX_PRESET.visible;
    boxMesh.userData.nanseolBox = true;
    editor.execute(new AddObjectCommand(editor, boxMesh));
    console.log("[난설] 직육면체(Box) 추가 완료");

    // 조명을 추가하면 helper가 다시 생길 수 있으니, 마지막에 한번 더 강제 숨김
    hideLightHelpers();

    if (editor.loader && editor.loader.loadFiles) {
      try {
        const res = await fetch(NANSEOL_NAMOO_PATH);
        if (!res.ok) throw new Error(`Namoo.fbx 로드 실패: ${res.status}`);
        const arrayBuffer = await res.arrayBuffer();
        const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
        const loader = new FBXLoader();
        const rootObject = loader.parse(arrayBuffer);
        rootObject.traverse((child) => {
          if (child.userData) child.userData.nanseolNamoo = true;
        });
        rootObject.userData.nanseolNamoo = true;

        for (let i = 0; i < NANSEOL_NAMOO_PRESETS.length; i++) {
          const preset = NANSEOL_NAMOO_PRESETS[i];
          const obj = i === 0 ? rootObject : rootObject.clone(true);
          obj.name = i === 0 ? "Namoo" : `Namoo_${i + 1}`;
          obj.position.set(preset.position[0], preset.position[1], preset.position[2]);
          obj.rotation.set(0, 0, 0);
          obj.scale.setScalar(NANSEOL_NAMOO_SCALE);
          obj.visible = true;
          if (obj.userData) obj.userData.nanseolNamoo = true;
          editor.execute(new AddObjectCommand(editor, obj));
        }
        console.log("[난설] Namoo.fbx 9개 배치 완료");
      } catch (err) {
        console.warn("[난설] Namoo.fbx 로드/배치 실패:", err);
      }
    }

    if (editor.audioTimeline && typeof editor.audioTimeline.addAudioFromAsset === "function") {
      try {
        await editor.audioTimeline.addAudioFromAsset(NANSEOL_AUDIO_ASSET);
        console.log("[난설] nanseol.mp3 오디오 타임라인 추가 완료");
      } catch (err) {
        console.warn("[난설] 오디오 타임라인 추가 실패:", err);
      }
    } else {
      console.warn("[난설] audioTimeline 없음 — 오디오 타임라인을 먼저 열어주세요.");
    }

    // 난설: temp2.json 모션 타임라인(트랙 2개)을 1.fbx/2.fbx 오브젝트에 적용
    try {
      const nameLooksLike = (objName, baseName, fileName) => {
        const n = String(objName || "").toLowerCase();
        const b = String(baseName || "").toLowerCase();
        const f = String(fileName || "").toLowerCase();
        return (
          n === b ||
          n === `${b}.fbx` ||
          n === f ||
          n.startsWith(`${b} `) ||
          n.includes(`/${f}`) ||
          n.includes(f) ||
          n.includes(`${b}.fbx`)
        );
      };

      const findTargetByBaseName = (baseName, fileName) => {
        const byName =
          editor.scene.getObjectByName(baseName) ||
          editor.scene.getObjectByName(fileName) ||
          editor.scene.getObjectByName(`${baseName}.fbx`) ||
          editor.scene.getObjectByName(`${baseName}.FBX`);
        if (byName) return byName;

        let found = null;
        editor.scene.traverse((obj) => {
          if (found || !obj) return;
          const src = obj.userData?.source;
          if (src === "motion" && nameLooksLike(obj.name, baseName, fileName)) {
            found = obj;
          }
        });
        return found;
      };

      const getMotionObjects = () => {
        const list = [];
        editor.scene.traverse((obj) => {
          if (obj?.userData?.source === "motion") list.push(obj);
        });
        return list;
      };

      const loadFbxAndCapture = async (path, fileName, baseName) => {
        if (!editor.loader || !editor.loader.loadFiles) return null;

        // 이미 있으면 그걸 사용
        const existing = findTargetByBaseName(baseName, fileName);
        if (existing) return existing;

        const before = new Set(getMotionObjects().map((o) => o.uuid));

        const isProbablyFbxBlob = async (blob) => {
          if (!blob || typeof blob.size !== "number" || blob.size < 32) return false;
          const headBuf = await blob.slice(0, 128).arrayBuffer();
          const headText = new TextDecoder("utf-8", { fatal: false }).decode(headBuf);
          // Binary FBX: "Kaydara FBX Binary  \0" (starts with "Kaydara FBX Binary")
          if (headText.startsWith("Kaydara FBX Binary")) return true;
          // ASCII FBX: first non-empty line contains "; FBX"
          const firstNonEmpty = headText.split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) || "";
          if (firstNonEmpty.startsWith("; FBX")) return true;
          return false;
        };

        const looksLikeHtmlOrLfsPointer = async (blob) => {
          if (!blob || typeof blob.size !== "number" || blob.size < 16) return true;
          const headBuf = await blob.slice(0, 256).arrayBuffer();
          const headText = new TextDecoder("utf-8", { fatal: false }).decode(headBuf).trimStart();
          if (headText.startsWith("<!DOCTYPE html") || headText.startsWith("<html") || headText.startsWith("<head")) return true;
          if (headText.startsWith("version https://git-lfs.github.com/spec/v1")) return true;
          return false;
        };

        const fetchBlob = async (url) => {
          const r = await fetch(url, { cache: "no-store" });
          if (!r.ok) throw new Error(`${fileName} fetch 실패: ${r.status}`);
          return await r.blob();
        };

        const buildGithubRawFallbacks = (originalPath) => {
          try {
            if (!location?.hostname?.endsWith("github.io")) return [];
            const owner = location.hostname.split(".")[0];
            const segs = location.pathname.split("/").filter(Boolean);
            const repo = segs[0];
            if (!owner || !repo) return [];
            const normalized = String(originalPath || "").replace(/^\.\.\//, "");
            // NOTE:
            // - github.com/.../raw 는 302 + CORS로 막히는 경우가 많아 후보에서 제외
            // - raw.githubusercontent.com 는 보통 CORS 허용(ACAO: *)이며 리다이렉트가 없음
            const rawMain = `https://raw.githubusercontent.com/${owner}/${repo}/main/${normalized}`;
            const rawMaster = `https://raw.githubusercontent.com/${owner}/${repo}/master/${normalized}`;
            return [rawMain, rawMaster];
          } catch (e) {
            return [];
          }
        };

        let blob = null;
        let lastErr = null;
        const candidates = [path, ...buildGithubRawFallbacks(path)];
        for (const url of candidates) {
          try {
            const b = await fetchBlob(url);
            // GitHub Pages에서 404 HTML/ LFS 포인터가 0KB~수백 bytes로 들어오는 케이스 방어
            if (await isProbablyFbxBlob(b)) {
              blob = b;
              break;
            }
            // 명확히 FBX가 아니면 다음 후보로 시도
            if (await looksLikeHtmlOrLfsPointer(b)) {
              lastErr = new Error(
                `${fileName} 응답이 FBX가 아닙니다 (HTML/ Git LFS 포인터로 보임). GitHub Pages에서는 LFS 파일이 서빙되지 않거나 경로가 잘못되면 이런 현상이 납니다.`
              );
              continue;
            }
            // 알 수 없는 바이너리면 그대로 시도(일부 FBX 변종 대응)
            blob = b;
            break;
          } catch (e) {
            lastErr = e;
          }
        }
        if (!blob) throw lastErr || new Error(`${fileName} 로드 실패`);

        const file = new File([blob], fileName, { type: "application/octet-stream" });
        const dt = new DataTransfer();
        dt.items.add(file);

        // ✅ 대용량 FBX는 로드/파싱 시간이 길 수 있어서, 최대 60초까지 기다렸다가 캡처
        const captured = await new Promise((resolve) => {
          let done = false;
          const signals = editor.signals;
          const startedAt = Date.now();
          const timeoutMs = 60000;
          const pollMs = 150;

          const finish = (obj) => {
            if (done) return;
            done = true;
            try { signals.objectAdded.remove(handler); } catch (e) {}
            resolve(obj || null);
          };

          const handler = (obj) => {
            if (done) return;
            if (!obj) return;
            if (obj.userData?.source !== "motion") return;
            // 이름이 예상과 다르게 들어오는 경우가 있어, 새로 추가된 motion이면 우선 캡처
            if (before.has(obj.uuid)) return;
            // 가능하면 파일명/베이스명으로 우선순위
            if (nameLooksLike(obj.name, baseName, fileName)) {
              console.log(`[난설] ${fileName} objectAdded 캡처(이름 매칭):`, obj.name, obj.uuid);
              return finish(obj);
            }
            // 이름이 안 맞아도, 새로 추가된 motion이면 후보로 캡처
            console.log(`[난설] ${fileName} objectAdded 캡처(이름 무시):`, obj.name, obj.uuid);
            finish(obj);
          };

          try { signals.objectAdded.add(handler); } catch (e) {}

          // 로드 시작 (loadFiles는 Promise를 반환하지 않음)
          try {
            editor.loader.loadFiles(dt.files);
          } catch (e) {
            console.warn(`[난설] ${fileName} loadFiles 예외:`, e);
          }

          // 폴링으로도 확인 (시그널을 놓치는 경우 대비)
          const poll = () => {
            if (done) return;
            const objByName = findTargetByBaseName(baseName, fileName);
            if (objByName) return finish(objByName);

            // 새로 추가된 motion 오브젝트가 하나라도 생기면 그 중 첫 번째 캡처
            const after = getMotionObjects().filter((o) => !before.has(o.uuid));
            if (after.length > 0) return finish(after[0]);

            if (Date.now() - startedAt > timeoutMs) return finish(null);
            setTimeout(poll, pollMs);
          };
          poll();
        });

        return captured;
      };

      const target1 = await loadFbxAndCapture(NANSEOL_1_FBX_PATH, "Character1.fbx", "Character1");
      const target2 = await loadFbxAndCapture(NANSEOL_2_FBX_PATH, "Character2.fbx", "Character2");

      if (!target1 || !target2) {
        const motionNames = [];
        editor.scene.traverse((obj) => {
          if (obj?.userData?.source === "motion") motionNames.push(String(obj.name || ""));
        });
        console.warn("[난설] 1.fbx 또는 2.fbx 오브젝트를 찾을 수 없습니다. 현재 motion 객체들:", motionNames);
        return;
      }

      const res = await fetch(NANSEOL_MOTION_PRESET_PATH);
      if (!res.ok) throw new Error(`모션 프리셋 로드 실패: ${res.status}`);
      const preset = await res.json();

      const srcUuids = Object.keys(preset?.tracks || {});
      if (srcUuids.length < 2) throw new Error("프리셋 tracks uuid가 2개가 아닙니다");

      const targets = [target1, target2];
      const mappedTracks = {};
      const mappedClips = {};
      const mappedVisible = {};

      for (let i = 0; i < 2; i++) {
        const srcUuid = srcUuids[i];
        const tgt = targets[i];
        const track = preset.tracks[srcUuid];
        mappedTracks[tgt.uuid] = track;
        if (preset.clips && preset.clips[srcUuid]) mappedClips[tgt.uuid] = preset.clips[srcUuid];
        // visible 처리:
        // - 프리셋에 visible이 있더라도 "0초 true"만 있으면, 트랙 시작 전에도 계속 보이게 됨
        // - 그래서 트랙의 첫 유효 키프레임 시간 이전에는 false, 첫 키 시간에 true로 보정
        if (preset.visible) {
          const srcVisible = preset.visible[srcUuid];
          if (srcVisible && Array.isArray(srcVisible.keyframes)) {
            // 첫 유효 키프레임 시간 찾기 (position/rotation/scale 중 하나라도 있는 첫 time)
            let firstKeyTime = null;
            if (Array.isArray(track)) {
              for (const kf of track) {
                if (!kf) continue;
                if (kf.position || kf.rotation || kf.scale) {
                  firstKeyTime = typeof kf.time === "number" ? kf.time : null;
                  break;
                }
              }
            }

            if (firstKeyTime !== null && firstKeyTime > 0.0001) {
              mappedVisible[tgt.uuid] = {
                keyframes: [
                  { time: 0, value: false },
                  { time: firstKeyTime, value: true },
                ],
              };
            } else {
              mappedVisible[tgt.uuid] = srcVisible;
            }
          }
        }
      }

      const mapped = {
        ...preset,
        tracks: mappedTracks,
        clips: preset.clips ? mappedClips : undefined,
        visible: preset.visible ? mappedVisible : undefined,
      };

      if (!editor.scene.userData) editor.scene.userData = {};
      editor.scene.userData.motionTimeline = mapped;

      // motionTimeline 인스턴스가 늦게 연결될 수 있어 재시도 포함
      const tryApply = () => {
        if (editor.motionTimeline && typeof editor.motionTimeline.onAfterLoad === "function") {
          // onAfterLoad는 중복 호출 방지가 있어서, 난설에서 주입한 데이터를 즉시 반영하려면 리셋 필요
          editor.motionTimeline._onAfterLoadCalled = false;
          editor.motionTimeline.onAfterLoad();
          editor.motionTimeline.updateAnimation(0);
          console.log("[난설] temp2.json 모션 타임라인 적용 완료:", target1.uuid, target2.uuid);
          return true;
        }
        return false;
      };

      if (!tryApply()) {
        try {
          if (typeof editor.connectTimelineInstances === "function") {
            editor.connectTimelineInstances();
          }
        } catch (e) {
          // ignore
        }

        if (!tryApply()) {
          setTimeout(() => {
            if (!tryApply()) {
              console.warn("[난설] motionTimeline 인스턴스가 없습니다. 모션 타임라인을 한번 열어주세요.");
            }
          }, 200);
        }
      }

      // 모션타임라인 UI/데이터 반영이 끝날 때까지 로딩 유지
      try {
        const ready = await waitForMotionTimelineReady(30000);
        if (!ready) {
          console.warn("[난설] 모션 타임라인 준비 대기 시간 초과");
        }
        // ✅ 난설 로딩 완료 시점: 아무것도 선택되지 않게 + 타임라인 0초 화면을 스테이지에 반영
        try {
          if (typeof editor.deselect === "function") editor.deselect();
          if (editor.scene?.userData?.timeline) editor.scene.userData.timeline.currentSeconds = 0;
          if (editor.motionTimeline && typeof editor.motionTimeline.updateAnimation === "function") {
            editor.motionTimeline.updateAnimation(0);
          }
        } catch (e) {
          console.warn("[난설] 로딩 완료 후 초기 화면 세팅 실패:", e);
        }
      } finally {
        hideLoading();
      }
    } catch (e) {
      console.warn("[난설] 모션 프리셋 적용 실패:", e);
      hideLoading();
    }
  });

  wrap.appendChild(btn);
  row.dom.appendChild(wrap);
  container.add(row);

  return container;
}

export { SidebarNanseol, NANSEOL_LIGHT_PRESETS, NANSEOL_FRONT_SPOT_PRESETS };
