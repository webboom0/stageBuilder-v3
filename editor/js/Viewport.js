import * as THREE from "three";

import { TransformControls } from "three/addons/controls/TransformControls.js";

import { UIPanel } from "./libs/ui.js";

import { EditorControls } from "./EditorControls.js";

import { ViewportControls } from "./Viewport.Controls.js";
import { ViewportInfo } from "./Viewport.Info.js";

import { ViewHelper } from "./Viewport.ViewHelper.js";
import { XR } from "./Viewport.XR.js";

import { SetPositionCommand } from "./commands/SetPositionCommand.js";
import { SetRotationCommand } from "./commands/SetRotationCommand.js";
import { SetScaleCommand } from "./commands/SetScaleCommand.js";

import { getMeshWorldHalfHeightY } from "./utils/meshFloor.js";

import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { ViewportPathtracer } from "./Viewport.Pathtracer.js";
import { ViewportObjectDimensions } from "./Viewport.ObjectDimensions.js";
import { ViewportStageGrid } from "./ViewportStageGrid.js";
import {
  GRID_MODE_ADAPTIVE,
  GRID_MODE_FIXED,
  computeStageGridSizes,
} from "./utils/stageGridAdaptive.js";

function Viewport(editor) {
  const selector = editor.selector;
  const signals = editor.signals;

  const container = new UIPanel();
  container.setId("viewport");
  container.setPosition("absolute");

  const viewportControls = new ViewportControls(editor);
  editor.viewportControls = viewportControls;

  const menuBarHost = editor.tabRoot?.querySelector(".topMenuBar");
  if (menuBarHost) {
    menuBarHost.appendChild(viewportControls.dom);
  } else {
    container.add(viewportControls);
  }

  container.add(new ViewportInfo(editor));

  viewportControls.setGridMode = function (mode) {
    gridMode = mode;
    editor.config.setKey("viewport/gridMode", mode);
    if (typeof viewportControls.syncGridModeSelect === "function") {
      viewportControls.syncGridModeSelect(mode);
    }
    render();
  };
  viewportControls.getGridMode = function () {
    return gridMode;
  };

  editor.setViewportGridMode = viewportControls.setGridMode;
  editor.getViewportGridMode = viewportControls.getGridMode;

  //

  let renderer = null;
  let pmremGenerator = null;
  let pathtracer = null;

  const camera = editor.camera;
  const scene = editor.scene;
  const sceneHelpers = editor.sceneHelpers;

  // helpers

  const GRID_COLORS_LIGHT = [0x999999, 0x777777];
  const GRID_COLORS_DARK = [0x555555, 0x888888];

  // 그리드·가이드 공통 Y (바닥에 가깝게 두고, 아래 depth/render로 가시성 처리)
  const STAGE_DECK_HELPER_Y = 1.5;

  /**
   * 무대 바닥과 겹칠 때: polygonOffset으로 z-fight 완화.
   * depthTest 끄고 renderOrder를 높여 씬 이후에 그려 바닥에 묻히지 않게 함(캐릭터 위로 겹칠 수 있음).
   */
  function applyStageGridOverlay(mat) {
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -8;
  }

  const grid = new THREE.Group();

  const stageGrid = new ViewportStageGrid({
    minorColor: GRID_COLORS_LIGHT[0],
    majorColor: GRID_COLORS_LIGHT[1],
    opacity: 0.9,
  });
  stageGrid.applyOverlaySettings();
  grid.add(stageGrid);

  let gridMode =
    editor.config.getKey("viewport/gridMode") ?? GRID_MODE_FIXED;
  editor.viewportGridScale = null;

  // 초기 상태: 그리드 숨김
  grid.visible = false;
  grid.position.y = STAGE_DECK_HELPER_Y;

  // 가이드 라인 생성
  const guides = new THREE.Group();

  // X축 가이드 (빨간색)
  const xAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-100, 0, 0),
    new THREE.Vector3(100, 0, 0)
  ]);
  const xAxisMaterial = new THREE.LineBasicMaterial({
    color: 0xff0000,
    linewidth: 2,
    opacity: 0.8,
    transparent: true
  });
  applyStageGridOverlay(xAxisMaterial);
  const xAxisLine = new THREE.Line(xAxisGeometry, xAxisMaterial);
  xAxisLine.renderOrder = 1002;
  guides.add(xAxisLine);

  // Z축 가이드 (파란색)
  const zAxisGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, -100),
    new THREE.Vector3(0, 0, 100)
  ]);
  const zAxisMaterial = new THREE.LineBasicMaterial({
    color: 0x0000ff,
    linewidth: 2,
    opacity: 0.8,
    transparent: true
  });
  applyStageGridOverlay(zAxisMaterial);
  const zAxisLine = new THREE.Line(zAxisGeometry, zAxisMaterial);
  zAxisLine.renderOrder = 1002;
  guides.add(zAxisLine);

  // 중심점 마커 (노란색)
  const centerGeometry = new THREE.RingGeometry(0.5, 1, 8);
  const centerMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    side: THREE.DoubleSide,
    opacity: 0.9,
    transparent: true
  });
  applyStageGridOverlay(centerMaterial);
  const centerMarker = new THREE.Mesh(centerGeometry, centerMaterial);
  centerMarker.rotation.x = -Math.PI / 2; // 바닥에 평행하게
  centerMarker.position.y = 2; // 그리드보다 살짝 더 위
  centerMarker.renderOrder = 1003;
  guides.add(centerMarker);

  // 초기 상태: 가이드 숨김
  guides.visible = false;
  guides.position.y = STAGE_DECK_HELPER_Y;

  // 가이드 그룹을 sceneHelpers에 추가
  sceneHelpers.add(guides);

  const viewHelper = new ViewHelper(camera, container);
  const objectDimensions = new ViewportObjectDimensions(container.dom, editor);
  sceneHelpers.add(objectDimensions.group);

  //

  const box = new THREE.Box3();

  const selectionBox = new THREE.Box3Helper(box);
  selectionBox.material.depthTest = false;
  selectionBox.material.transparent = true;
  selectionBox.visible = false;
  sceneHelpers.add(selectionBox);

  let objectPositionOnDown = null;
  let objectRotationOnDown = null;
  let objectScaleOnDown = null;

  const transformControls = new TransformControls(camera, container.dom);
  transformControls.addEventListener("axis-changed", function () {
    if (editor.viewportShading !== "realistic") render();
  });
  transformControls.addEventListener("objectChange", function () {
    const object = transformControls.object;

    // 🎯 바닥 접촉면 고정(floorContactY): 스케일에 따라 허용 중심 Y가 달라짐(높이 줄이면 아래로 내려갈 수 있음)
    if (
      object &&
      object.userData &&
      typeof object.userData.floorContactY === "number" &&
      object.isMesh
    ) {
      const halfH = getMeshWorldHalfHeightY(object);
      const minCenterY = object.userData.floorContactY + halfH;
      if (transformControls.getMode && transformControls.getMode() === "scale") {
        object.position.y = minCenterY;
      } else if (object.position.y < minCenterY) {
        object.position.y = minCenterY;
      }
      object.userData.minYPosition = minCenterY;
    } else if (object && object.userData && typeof object.userData.minYPosition === "number") {
      const minYPosition = object.userData.minYPosition;
      if (object.position.y < minYPosition) {
        object.position.y = minYPosition;
        console.log(`🎯 객체 "${object.name || 'Unknown'}"가 초기 위치(Y=${minYPosition.toFixed(2)}) 아래로 이동하는 것을 방지했습니다.`);
      }
    } else {
      const defaultFloorLevel = -3.8;
      if (object && object.position.y < defaultFloorLevel) {
        object.position.y = defaultFloorLevel;
        console.log(`🎯 객체 "${object.name || 'Unknown'}"가 기본 바닥 레벨 아래로 이동하는 것을 방지했습니다.`);
      }
    }

    signals.objectChanged.dispatch(object);
  });
  transformControls.addEventListener("mouseDown", function () {
    const object = transformControls.object;

    objectPositionOnDown = object.position.clone();
    objectRotationOnDown = object.rotation.clone();
    objectScaleOnDown = object.scale.clone();

    controls.enabled = false;
  });
  transformControls.addEventListener("mouseUp", function () {
    const object = transformControls.object;

    if (object !== undefined) {
      switch (transformControls.getMode()) {
        case "translate":
          if (!objectPositionOnDown.equals(object.position)) {
            editor.execute(
              new SetPositionCommand(
                editor,
                object,
                object.position,
                objectPositionOnDown
              )
            );
          }

          break;

        case "rotate":
          if (!objectRotationOnDown.equals(object.rotation)) {
            editor.execute(
              new SetRotationCommand(
                editor,
                object,
                object.rotation,
                objectRotationOnDown
              )
            );
          }

          break;

        case "scale":
          if (!objectScaleOnDown.equals(object.scale)) {
            editor.execute(
              new SetScaleCommand(
                editor,
                object,
                object.scale,
                objectScaleOnDown
              )
            );
          }

          break;
      }
    }

    controls.enabled = true;
  });

  sceneHelpers.add(transformControls.getHelper());

  //

  const xr = new XR(editor, transformControls); // eslint-disable-line no-unused-vars

  // events

  function updateAspectRatio() {
    for (const uuid in editor.cameras) {
      const camera = editor.cameras[uuid];

      const aspect = container.dom.offsetWidth / container.dom.offsetHeight;

      if (camera.isPerspectiveCamera) {
        camera.aspect = aspect;
      } else {
        camera.left = -aspect;
        camera.right = aspect;
      }

      camera.updateProjectionMatrix();

      const cameraHelper = editor.helpers[camera.id];
      if (cameraHelper) cameraHelper.update();
    }
  }

  const onDownPosition = new THREE.Vector2();
  const onUpPosition = new THREE.Vector2();
  const onDoubleClickPosition = new THREE.Vector2();

  function getMousePosition(dom, x, y) {
    const rect = dom.getBoundingClientRect();
    return [(x - rect.left) / rect.width, (y - rect.top) / rect.height];
  }

  function handleClick() {
    if (onDownPosition.distanceTo(onUpPosition) === 0) {
      const intersects = selector.getPointerIntersects(onUpPosition, camera);
      signals.intersectionsDetected.dispatch(intersects);

      render();
    }
  }

  function onMouseDown(event) {
    // event.preventDefault();

    if (event.target !== renderer.domElement) return;

    const array = getMousePosition(container.dom, event.clientX, event.clientY);
    onDownPosition.fromArray(array);

    document.addEventListener("mouseup", onMouseUp);
  }

  function onMouseUp(event) {
    const array = getMousePosition(container.dom, event.clientX, event.clientY);
    onUpPosition.fromArray(array);

    handleClick();

    document.removeEventListener("mouseup", onMouseUp);
  }

  function onTouchStart(event) {
    const touch = event.changedTouches[0];

    const array = getMousePosition(container.dom, touch.clientX, touch.clientY);
    onDownPosition.fromArray(array);

    document.addEventListener("touchend", onTouchEnd);
  }

  function onTouchEnd(event) {
    const touch = event.changedTouches[0];

    const array = getMousePosition(container.dom, touch.clientX, touch.clientY);
    onUpPosition.fromArray(array);

    handleClick();

    document.removeEventListener("touchend", onTouchEnd);
  }

  // 전체화면 상태 변수
  let isFullscreen = false;
  let originalContainerStyle = null;

  function onDoubleClick(event) {
    const array = getMousePosition(container.dom, event.clientX, event.clientY);
    onDoubleClickPosition.fromArray(array);

    const intersects = selector.getPointerIntersects(
      onDoubleClickPosition,
      camera
    );

    // 객체 포커스 기능 주석처리
    // if (intersects.length > 0) {
    //   const intersect = intersects[0];
    //   signals.objectFocused.dispatch(intersect.object);
    // } else {
    //   // 빈 공간을 더블클릭하면 전체화면 토글
    //   toggleFullscreen();
    // }

    // 객체 위든 빈 공간이든 상관없이 더블클릭하면 전체화면 토글
    toggleFullscreen();
  }

  // 전체화면 토글 함수
  function toggleFullscreen() {
    if (!isFullscreen) {
      enterFullscreen();
    } else {
      exitFullscreen();
    }
  }

  // 전체화면 진입
  function enterFullscreen() {
    // 현재 스타일 저장 (computed style도 고려)
    const computedStyle = window.getComputedStyle(container.dom);
    originalContainerStyle = {
      position: container.dom.style.position || computedStyle.position,
      width: container.dom.style.width || computedStyle.width,
      height: container.dom.style.height || computedStyle.height,
      zIndex: container.dom.style.zIndex || computedStyle.zIndex,
      top: container.dom.style.top || computedStyle.top,
      left: container.dom.style.left || computedStyle.left,
      right: container.dom.style.right || computedStyle.right,
      bottom: container.dom.style.bottom || computedStyle.bottom,
      backgroundColor: container.dom.style.backgroundColor || computedStyle.backgroundColor
    };

    // 전체화면 스타일 적용
    container.dom.style.position = 'fixed';
    container.dom.style.top = '0';
    container.dom.style.left = '0';
    container.dom.style.width = '100vw';
    container.dom.style.height = '100vh';
    container.dom.style.zIndex = '9999';
    container.dom.style.backgroundColor = '#1a1a1a';
    container.dom.style.transition = 'all 0.3s ease';

    // body 스크롤 방지 및 클래스 추가
    document.body.style.overflow = 'hidden';
    document.body.classList.add('full-mode');

    isFullscreen = true;

    // 전체화면 알림 표시
    showFullscreenNotification('전체화면 모드 (ESC키나 더블클릭으로 종료)');

    // 렌더러 크기 조정
    setTimeout(() => {
      if (renderer) {
        renderer.setSize(window.innerWidth, window.innerHeight);
        updateAspectRatio();
        render();
      }
    }, 100);

    // ESC 키로 전체화면 종료 가능하도록 이벤트 리스너 추가
    document.addEventListener('keydown', onEscapeKey);

    // 윈도우 크기 변경 이벤트 리스너 추가
    window.addEventListener('resize', onFullscreenResize);
  }

  // 전체화면 종료
  function exitFullscreen() {
    if (originalContainerStyle) {
      // 원래 스타일 복원
      container.dom.style.position = originalContainerStyle.position;
      container.dom.style.width = originalContainerStyle.width;
      container.dom.style.height = originalContainerStyle.height;
      container.dom.style.zIndex = originalContainerStyle.zIndex;
      container.dom.style.top = originalContainerStyle.top;
      container.dom.style.left = originalContainerStyle.left;
      container.dom.style.right = originalContainerStyle.right;
      container.dom.style.bottom = originalContainerStyle.bottom;
      container.dom.style.backgroundColor = originalContainerStyle.backgroundColor;
      container.dom.style.transition = '';
    }

    // body 스크롤 복원 및 클래스 제거
    document.body.style.overflow = '';
    document.body.classList.remove('full-mode');

    isFullscreen = false;

    // 전체화면 종료 알림 표시
    showFullscreenNotification('일반 모드로 복원되었습니다');

    // 렌더러 크기 조정
    setTimeout(() => {
      if (renderer) {
        renderer.setSize(container.dom.offsetWidth, container.dom.offsetHeight);
        updateAspectRatio();
        render();
      }
    }, 100);

    // 이벤트 리스너 제거
    document.removeEventListener('keydown', onEscapeKey);
    window.removeEventListener('resize', onFullscreenResize);
  }

  // ESC 키 처리 함수
  function onEscapeKey(event) {
    if (event.key === 'Escape' && isFullscreen) {
      exitFullscreen();
    }
  }

  // 전체화면 모드에서 윈도우 크기 변경 처리
  function onFullscreenResize() {
    if (isFullscreen && renderer) {
      renderer.setSize(window.innerWidth, window.innerHeight);
      updateAspectRatio();
      render();
    }
  }

  // 전체화면 알림 표시 함수
  function showFullscreenNotification(message) {
    // 기존 알림이 있다면 제거
    const existingNotification = document.getElementById('fullscreen-notification');
    if (existingNotification) {
      existingNotification.remove();
    }

    // 알림 요소 생성
    const notification = document.createElement('div');
    notification.id = 'fullscreen-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 10px 20px;
      border-radius: 5px;
      font-size: 14px;
      z-index: 10000;
      pointer-events: none;
      transition: opacity 0.3s ease;
    `;

    document.body.appendChild(notification);

    // 3초 후 자동 제거
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.opacity = '0';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
      }
    }, 3000);
  }

  container.dom.addEventListener("mousedown", onMouseDown);
  container.dom.addEventListener("touchstart", onTouchStart, {
    passive: false,
  });
  container.dom.addEventListener("dblclick", onDoubleClick);

  // controls need to be added *after* main logic,
  // otherwise controls.enabled doesn't work.

  const controls = new EditorControls(camera, container.dom);
  controls.addEventListener("change", function () {
    signals.cameraChanged.dispatch(camera);
    signals.refreshSidebarObject3D.dispatch(camera);
  });
  viewHelper.center = controls.center;

  // signals

  signals.editorCleared.add(function () {
    controls.center.set(0, 0, 0);
    pathtracer.reset();

    initPT();
    render();
  });

  signals.transformModeChanged.add(function (mode) {
    transformControls.setMode(mode);

    render();
  });

  signals.snapChanged.add(function (dist) {
    transformControls.setTranslationSnap(dist);
  });

  signals.spaceChanged.add(function (space) {
    transformControls.setSpace(space);

    render();
  });

  signals.rendererUpdated.add(function () {
    scene.traverse(function (child) {
      if (child.material !== undefined) {
        child.material.needsUpdate = true;
      }
    });

    render();
  });

  signals.rendererCreated.add(function (newRenderer) {
    if (renderer !== null) {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      pmremGenerator.dispose();

      container.dom.removeChild(renderer.domElement);
    }

    renderer = newRenderer;

    renderer.setAnimationLoop(animate);
    renderer.setClearColor(0xaaaaaa);

    if (window.matchMedia) {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      mediaQuery.addEventListener("change", function (event) {
        renderer.setClearColor(event.matches ? 0x333333 : 0xaaaaaa);
        updateGridColors(
          stageGrid,
          event.matches ? GRID_COLORS_DARK : GRID_COLORS_LIGHT
        );

        render();
      });

      renderer.setClearColor(mediaQuery.matches ? 0x333333 : 0xaaaaaa);
      updateGridColors(
        stageGrid,
        mediaQuery.matches ? GRID_COLORS_DARK : GRID_COLORS_LIGHT
      );
    }

    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(container.dom.offsetWidth, container.dom.offsetHeight);
    objectDimensions.setSize(
      container.dom.offsetWidth,
      container.dom.offsetHeight,
    );

    pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    pathtracer = new ViewportPathtracer(renderer);

    container.dom.appendChild(renderer.domElement);

    render();
  });

  signals.rendererDetectKTX2Support.add(function (ktx2Loader) {
    ktx2Loader.detectSupport(renderer);
  });

  signals.sceneGraphChanged.add(function () {
    initPT();
    render();
  });

  signals.cameraChanged.add(function () {
    pathtracer.reset();

    render();
  });

  signals.objectSelected.add(function (object) {
    selectionBox.visible = false;
    transformControls.detach();

    if (object !== null && object !== scene && object !== camera) {
      box.setFromObject(object, true);

      if (box.isEmpty() === false) {
        selectionBox.visible = true;
      }

      transformControls.attach(object);
      objectDimensions.setObject(object);
    } else {
      objectDimensions.setObject(null);
    }

    render();
  });

  signals.objectFocused.add(function (object) {
    controls.focus(object);
  });

  signals.geometryChanged.add(function (object) {
    if (object !== undefined) {
      box.setFromObject(object, true);
    }
    initPT();
    render();
  });

  signals.objectChanged.add(function (object) {
    if (editor.selected === object) {
      box.setFromObject(object, true);
      objectDimensions.update();
    }

    if (object.isPerspectiveCamera) {
      object.updateProjectionMatrix();
    }

    const helper = editor.helpers[object.id];

    if (helper !== undefined && helper.isSkeletonHelper !== true) {
      helper.update();
    }

    initPT();
    render();
  });

  signals.objectRemoved.add(function (object) {
    controls.enabled = true; // see #14180

    if (object === transformControls.object) {
      transformControls.detach();
    }
  });

  signals.materialChanged.add(function () {
    updatePTMaterials();
    render();
  });

  // background

  signals.sceneBackgroundChanged.add(function (
    backgroundType,
    backgroundColor,
    backgroundTexture,
    backgroundEquirectangularTexture,
    backgroundBlurriness,
    backgroundIntensity,
    backgroundRotation
  ) {
    scene.background = null;

    switch (backgroundType) {
      case "Color":
        scene.background = new THREE.Color(backgroundColor);

        break;

      case "Texture":
        if (backgroundTexture) {
          scene.background = backgroundTexture;
        }

        break;

      case "Equirectangular":
        if (backgroundEquirectangularTexture) {
          backgroundEquirectangularTexture.mapping =
            THREE.EquirectangularReflectionMapping;

          scene.background = backgroundEquirectangularTexture;
          scene.backgroundBlurriness = backgroundBlurriness;
          scene.backgroundIntensity = backgroundIntensity;
          scene.backgroundRotation.y =
            backgroundRotation * THREE.MathUtils.DEG2RAD;

          if (useBackgroundAsEnvironment) {
            scene.environment = scene.background;
            scene.environmentRotation.y =
              backgroundRotation * THREE.MathUtils.DEG2RAD;
          }
        }

        break;
    }

    updatePTBackground();
    render();
  });

  // environment

  let useBackgroundAsEnvironment = false;

  signals.sceneEnvironmentChanged.add(function (
    environmentType,
    environmentEquirectangularTexture
  ) {
    scene.environment = null;

    useBackgroundAsEnvironment = false;

    switch (environmentType) {
      case "Background":
        useBackgroundAsEnvironment = true;

        if (scene.background !== null && scene.background.isTexture) {
          scene.environment = scene.background;
          scene.environment.mapping = THREE.EquirectangularReflectionMapping;
          scene.environmentRotation.y = scene.backgroundRotation.y;
        }

        break;

      case "Equirectangular":
        if (environmentEquirectangularTexture) {
          scene.environment = environmentEquirectangularTexture;
          scene.environment.mapping = THREE.EquirectangularReflectionMapping;
        }

        break;

      case "ModelViewer":
        scene.environment = pmremGenerator.fromScene(
          new RoomEnvironment(),
          0.04
        ).texture;

        break;
    }

    updatePTEnvironment();
    render();
  });

  // fog

  signals.sceneFogChanged.add(function (
    fogType,
    fogColor,
    fogNear,
    fogFar,
    fogDensity
  ) {
    switch (fogType) {
      case "None":
        scene.fog = null;
        break;
      case "Fog":
        scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
        break;
      case "FogExp2":
        scene.fog = new THREE.FogExp2(fogColor, fogDensity);
        break;
    }

    render();
  });

  signals.sceneFogSettingsChanged.add(function (
    fogType,
    fogColor,
    fogNear,
    fogFar,
    fogDensity
  ) {
    switch (fogType) {
      case "Fog":
        scene.fog.color.setHex(fogColor);
        scene.fog.near = fogNear;
        scene.fog.far = fogFar;
        break;
      case "FogExp2":
        scene.fog.color.setHex(fogColor);
        scene.fog.density = fogDensity;
        break;
    }

    render();
  });

  signals.viewportCameraChanged.add(function () {
    const viewportCamera = editor.viewportCamera;

    if (
      viewportCamera.isPerspectiveCamera ||
      viewportCamera.isOrthographicCamera
    ) {
      updateAspectRatio();
    }

    // disable EditorControls when setting a user camera

    controls.enabled = viewportCamera === editor.camera;

    initPT();
    render();
  });

  signals.viewportShadingChanged.add(function () {
    const viewportShading = editor.viewportShading;

    switch (viewportShading) {
      case "realistic":
        pathtracer.init(scene, editor.viewportCamera);
        break;

      case "solid":
        scene.overrideMaterial = null;
        break;

      case "normals":
        scene.overrideMaterial = new THREE.MeshNormalMaterial();
        break;

      case "wireframe":
        scene.overrideMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
          wireframe: true,
        });
        break;
    }

    render();
  });

  //

  signals.windowResize.add(function () {
    updateAspectRatio();

    renderer.setSize(container.dom.offsetWidth, container.dom.offsetHeight);
    pathtracer.setSize(container.dom.offsetWidth, container.dom.offsetHeight);
    objectDimensions.setSize(
      container.dom.offsetWidth,
      container.dom.offsetHeight,
    );

    render();
  });

  signals.showHelpersChanged.add(function (appearanceStates) {
    grid.visible = appearanceStates.gridHelper;
    guides.visible = appearanceStates.guideHelper;

    sceneHelpers.traverse(function (object) {
      switch (object.type) {
        case "CameraHelper": {
          object.visible = appearanceStates.cameraHelpers;
          break;
        }

        case "PointLightHelper":
        case "DirectionalLightHelper":
        case "SpotLightHelper":
        case "HemisphereLightHelper": {
          object.visible = appearanceStates.lightHelpers;
          break;
        }

        case "SkeletonHelper": {
          object.visible = appearanceStates.skeletonHelpers;
          break;
        }

        default: {
          // not a helper, skip.
        }
      }
    });

    render();
  });

  signals.cameraResetted.add(updateAspectRatio);

  // animations

  let prevActionsInUse = 0;

  const clock = new THREE.Clock(); // only used for animations

  function animate() {
    const mixer = editor.mixer;
    const delta = clock.getDelta();

    let needsUpdate = false;

    // Animations

    const actions = mixer.stats.actions;

    if (actions.inUse > 0 || prevActionsInUse > 0) {
      prevActionsInUse = actions.inUse;

      mixer.update(delta);
      needsUpdate = true;

      if (editor.selected !== null) {
        editor.selected.updateWorldMatrix(false, true); // avoid frame late effect for certain skinned meshes (e.g. Michelle.glb)
        selectionBox.box.setFromObject(editor.selected, true); // selection box should reflect current animation state
      }
    }

    // View Helper

    if (viewHelper.animating === true) {
      viewHelper.update(delta);
      needsUpdate = true;
    }

    if (renderer.xr.isPresenting === true) {
      needsUpdate = true;
    }

    if (needsUpdate === true) render();

    updatePT();
  }

  function initPT() {
    if (editor.viewportShading === "realistic") {
      pathtracer.init(scene, editor.viewportCamera);
    }
  }

  function updatePTBackground() {
    if (editor.viewportShading === "realistic") {
      pathtracer.setBackground(scene.background, scene.backgroundBlurriness);
    }
  }

  function updatePTEnvironment() {
    if (editor.viewportShading === "realistic") {
      pathtracer.setEnvironment(scene.environment);
    }
  }

  function updatePTMaterials() {
    if (editor.viewportShading === "realistic") {
      pathtracer.updateMaterials();
    }
  }

  function updatePT() {
    if (editor.viewportShading === "realistic") {
      pathtracer.update();
      editor.signals.pathTracerUpdated.dispatch(pathtracer.getSamples());
    }
  }

  //

  let startTime = 0;
  let endTime = 0;

  function render() {
    startTime = performance.now();

    renderer.setViewport(
      0,
      0,
      container.dom.offsetWidth,
      container.dom.offsetHeight
    );
    renderer.render(scene, editor.viewportCamera);

    if (camera === editor.viewportCamera) {
      renderer.autoClear = false;
      if (grid.visible === true) {
        const gridSizes = computeStageGridSizes(
          editor,
          camera,
          controls.center,
          container.dom.offsetHeight,
          gridMode,
        );
        stageGrid.setCellSizes(gridSizes.minorWorld, gridSizes.majorWorld);
        stageGrid.followCenter(controls.center, STAGE_DECK_HELPER_Y);
        editor.viewportGridScale = gridSizes;
        renderer.render(grid, camera);
      } else {
        editor.viewportGridScale = null;
      }
      if (sceneHelpers.visible === true) renderer.render(sceneHelpers, camera);
      objectDimensions.render(camera);
      if (renderer.xr.isPresenting !== true) viewHelper.render(renderer);
      renderer.autoClear = true;
    }

    endTime = performance.now();
    editor.signals.sceneRendered.dispatch(endTime - startTime);
  }

  return container;
}

function updateGridColors(stageGrid, colors) {
  stageGrid.setColors(colors[0], colors[1]);
}

export { Viewport };