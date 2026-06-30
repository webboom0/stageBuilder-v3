import { UIPanel, UIInput, UIButton, UIRow } from "./libs/ui.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { Timeline } from "./timeline/Timeline.js";
import { NANSEOL_FRONT_SPOT_PRESETS } from "./Sidebar.Nanseol.js";
import {
  arenaFloorLayoutFromBackground,
} from "./arenaStageLayout.js";

/**
 * 무대 셸 FBX(_Background)가 레이에 먼저 맞으면 배우/소품 선택이 막힘.
 * 지오메트리 노드만 레이캐스트 비활성화(조명·스팟은 _Background 밖에 두므로 영향 없음).
 */
function disableStageBackgroundRaycast(root) {
  root.traverse((child) => {
    if (
      !child.isMesh &&
      !child.isLine &&
      !child.isLineSegments &&
      !child.isLineLoop &&
      !child.isPoints &&
      !child.isSkinnedMesh
    ) {
      return;
    }
    if (child.userData && child.userData.allowStageRaycast) return;
    child.raycast = function () {};
  });
}

function VideoEdit(editor) {
  console.log("VideoEdit");
  const signals = editor.signals;
  const container = new UIPanel();
  container.setId("videoEdit");

  // 타임라인 컨테이너 생성
  const timelinePanel = new UIPanel();
  timelinePanel.setId("timelinePanel");

  // Timeline 인스턴스 생성
  const timeline = new Timeline(editor);

  // Timeline 인스턴스를 editor에 저장하여 전역적으로 접근 가능하도록 함
  editor.timeline = timeline;

  // flex 높이 체인 유지 — 불필요한 Panel 래퍼 제거
  const shellLayout =
    "flex:1 1 0;min-height:0;display:flex;flex-direction:column;overflow:hidden;padding:0;border:none;margin:0;height:100%;";
  timelinePanel.dom.style.cssText = shellLayout;
  timelinePanel.dom.appendChild(timeline.container);
  container.dom.style.cssText = shellLayout;

  // 시간 설정 UI
  const setSeconds = () => {
    const optionGroup = new UIRow();
    optionGroup.setClass("optionGroup");

    const inputSeconds = new UIInput();
    inputSeconds.setId("seconds");
    inputSeconds.setClass("totalSeconds");
    inputSeconds.dom.type = "number";
    inputSeconds.dom.min = 30;
    inputSeconds.dom.max = 180;
    inputSeconds.dom.value = timeline.timelineSettings.totalSeconds;
    inputSeconds.dom.step = 1;
    inputSeconds.dom.placeholder = "Seconds";

    // 시간 변경 이벤트
    inputSeconds.onChange(() => {
      const newSeconds = parseInt(inputSeconds.getValue());
      if (newSeconds >= 30 && newSeconds <= 180) {
        if (editor.scene) {
          editor.scene.userData.timeline.totalSeconds = newSeconds;
          timeline.onSceneChanged();
        }
      }
    });

    const setSecondsBtn = new UIButton("트랙시간설정(초) 변경하기");
    setSecondsBtn.setId("setSeconds");
    setSecondsBtn.setClass("setSecondsBtn Button");

    optionGroup.add(inputSeconds);
    optionGroup.add(setSecondsBtn);

    return optionGroup;
  };

  // // 타임라인 추가 버튼
  const createAddTimelineButton = () => {
    const row = new UIRow();
    row.setClass("timeline-controls");

    const addTimelineBtn = new UIButton("Add Track");
    addTimelineBtn.setClass("add-timeline-btn");

    addTimelineBtn.onClick(() => {
      const selectedObject = editor.selected;

      if (!selectedObject) {
        alert('씬에서 객체를 선택해 주세요. (FBX/OBJ 또는 메시)');
        return;
      }

      // 선택된 FBX 객체의 모션 타임라인 추가
      if (timeline.timelines.motion) {
        // 이미 존재하는 트랙인지 확인
        const existingTrack = timeline.timelines.motion.tracks.get(
          selectedObject.id,
        );
        if (existingTrack) {
          alert("This object already has a timeline");
          return;
        }

        // 새로운 모션 트랙 추가
        timeline.timelines.motion.addTrack(selectedObject.id, {
          name: selectedObject.name || `Motion Timeline ${selectedObject.id}`,
          object: selectedObject,
        });

        // 씬의 타임라인 데이터 업데이트
        if (!editor.scene.userData.timeline) {
          editor.scene.userData.timeline = {
            totalSeconds: timeline.timelineSettings.totalSeconds,
            framesPerSecond: timeline.timelineSettings.framesPerSecond,
            currentFrame: 0,
            isPlaying: false,
          };
        }

        // 씬의 키프레임 데이터 초기화
        if (!editor.scene.userData.keyframes) {
          editor.scene.userData.keyframes = {};
        }
        if (!editor.scene.userData.keyframes[selectedObject.id]) {
          editor.scene.userData.keyframes[selectedObject.id] = [];
        }

        // 트랙 추가 후 UI 갱신
        timeline.initializeUI();
      }
    });

    row.add(addTimelineBtn);
    return row;
  };

  // UI 구성
  // container.add(setSeconds());
  // container.add(createAddTimelineButton());
  container.add(timelinePanel);

  requestAnimationFrame(() => {
    timeline.applyShellLayout?.();
    editor.signals?.windowResize?.dispatch();
  });

  // 씬 변경 시그널 처리
  if (signals?.sceneChanged) {
    signals.sceneChanged.add(() => {
      if (editor.scene) {
        const sceneTimeline = editor.scene.userData.timeline;
        const inputSeconds = document.querySelector("#seconds");
        if (inputSeconds) {
          inputSeconds.value = sceneTimeline.totalSeconds;
        }
      }
    });
  }
  const background = {
    init: function () {
      this.stageGroup = editor.scene.children.find(
        (child) => child.name === "Stage",
      );

      if (!this.stageGroup) {
        this.stageGroup = new THREE.Group();
        this.stageGroup.name = "Stage";
        editor.scene.add(this.stageGroup);
      }
    },
    changeStage: function (stageType, stageFile) {
      console.log(`Changing stage to: ${stageType}, file: ${stageFile}`);

      // loading 모달 표시
      const modal = document.getElementById("loading-modal");
      if (modal) modal.style.display = "flex";

      // 기존 배경 제거
      const existingBackground = this.stageGroup.children.find(
        (child) => child.name === "_Background",
      );
      if (existingBackground) {
        this.stageGroup.remove(existingBackground);
        // 메모리 정리
        existingBackground.traverse((child) => {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach((mat) => mat.dispose());
            } else {
              child.material.dispose();
            }
          }
        });
      }

      // 새로운 무대 로드
      const loader = new FBXLoader();
      loader.load(
        stageFile,
        (object) => {
          object.name = "_Background";

          // 무대 타입에 따른 위치/회전/스케일 설정
          if (stageType === "proscenium") {
            object.position.set(228.340, -125.909, 764.44);
            object.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
            object.scale.set(0.6, 0.6, 0.4);

            // 프로시니엄 무대로 변경 시 카메라 위치 설정 (정면 뷰)
            if (editor.camera) {
              editor.camera.position.set(0.000, 46.380, 288.37);
              editor.camera.rotation.set(0, 0, 0);
              // 화각 설정
              if (editor.camera.fov !== undefined) {
                editor.camera.fov = 50.00;
                editor.camera.updateProjectionMatrix();
              }
            }
          } else if (stageType === "arena") {
            // 아레나 무대의 위치/회전/스케일 (필요에 따라 조정)
            // object.position.set(-543.945, 260.784, 610.685);
            // object.rotation.set(-90 * Math.PI / 180, 0, 0);
            // object.scale.set(0.094, 0.094, 0.180);
            object.position.set(-752.465, 318.258, 830.285);
            object.rotation.set(-90 * Math.PI / 180, 0, 0);
            object.scale.set(0.130, 0.130, 0.220);

            // 아레나 무대로 변경 시 카메라 위치 설정
            if (editor.camera) {
              editor.camera.position.set(0.000, 126.461, 262.92);
              editor.camera.rotation.set(
                -26.57 * Math.PI / 180,
                0.00 * Math.PI / 180,
                0.00 * Math.PI / 180
              );
            }
          }

          this.stageGroup.add(object);

          disableStageBackgroundRaycast(object);

          // scene userData에 현재 무대 타입 저장
          editor.scene.userData.stageType = stageType;

          // 무대 타입에 맞는 바닥 생성
          this.createFloor(stageType);

          // 비디오 배경 다시 생성 (비디오가 로드되어 있을 때만)
          if (editor.videoBackground && editor.videoBackground.currentVideoPath) {
            try {
              console.log("🎬 무대 변경으로 인한 비디오 배경 재생성");
              const currentVideoPath = editor.videoBackground.currentVideoPath;
              const wasPlaying = editor.videoBackground.isPlaying;

              // 기존 비디오 배경 제거
              editor.videoBackground.removeVideoBackground();

              // 새로운 무대 타입으로 비디오 배경 생성
              editor.videoBackground.createVideoBackground(this.stageGroup);

              // 비디오 다시 로드
              const loadSuccess = editor.videoBackground.loadVideo(currentVideoPath);

              // 재생 중이었고 로드에 성공했다면 다시 재생
              if (wasPlaying && loadSuccess) {
                setTimeout(() => {
                  try {
                    if (editor.videoBackground && editor.videoBackground.videoElement) {
                      editor.videoBackground.playVideo();
                    }
                  } catch (playError) {
                    console.warn("비디오 재생 중 오류:", playError);
                  }
                }, 1000);
              }
            } catch (videoError) {
              console.warn("비디오 배경 재생성 중 오류:", videoError);
              // 오류가 발생해도 조용히 처리
            }
          }

          editor.signals.sceneGraphChanged.dispatch();

          console.log(`Stage changed to ${stageType}`);

          // loading 모달 숨김
          if (modal) modal.style.display = "none";
        },
        undefined,
        (error) => {
          console.error(`Error loading ${stageType} stage:`, error);
          alert(`무대 로드 중 오류가 발생했습니다: ${error.message}`);
          if (modal) modal.style.display = "none";
        }
      );
    },
    create: function (stageFile = "../files/stage/background.fbx") {
      console.log("background");

      const loader = new FBXLoader();
      loader.load(
        stageFile,
        (object) => {
          if (!editor.scene || !editor.scene.children) {
            console.log("Scene or children not initialized yet");
            return;
          }

          // 씬의 배경색을 검정색으로 설정
          // editor.scene.background = new THREE.Color(0x000000);



          // Background 객체 생성 및 추가
          const existingBackground = this.stageGroup.children.find(
            (child) => child.name === "_Background",
          );
          console.log("existingBackground");
          console.log(existingBackground);
          if (!existingBackground) {
            object.name = "_Background";
            /*  obj 기준
            object.position.set(234.86, -116.269, 619.18);
            object.rotation.set(
              0, // -90도
              Math.PI / 2, // 0도
              0, // 90도
            );
            object.scale.set(0.6, 0.4, 0.6);
            */
            /* fbx 기준*/
            // object.position.set(228.340, -153.989, 764.44);
            object.position.set(228.340, -125.909, 764.44); // 원래 위치로 복원

            object.rotation.set(
              -Math.PI / 2, // -90도
              0, // 0도
              Math.PI / 2, // 90도
            );
            object.scale.set(0.6, 0.6, 0.4);


            // object.traverse((child) => {
            //   if (child.isMesh) {
            //     child.material = new THREE.MeshStandardMaterial({
            //       color: 0x808080,
            //       side: THREE.DoubleSide,
            //       transparent: true,
            //       opacity: 1,
            //     });
            //     child.userData.isBackground = true;
            //     child.userData.notSelectable = true;
            //     child.userData.notEditable = true;
            //     child.raycast = () => null;
            //   }
            // });
            // 객체 자체에도 설정
            // object.userData.isBackground = true;
            // object.userData.notSelectable = true;
            // object.userData.notEditable = true;

            this.stageGroup.add(object);
            disableStageBackgroundRaycast(object);
            // editor.scene.add(object);

            // scene userData에 현재 무대 타입 저장 (없으면 기본값)
            if (!editor.scene.userData.stageType) {
              editor.scene.userData.stageType = "proscenium";
            }

            // === 프로시니엄 무대 카메라 위치 설정 (정면 뷰) ===
            if (editor.camera) {
              editor.camera.position.set(0.000, 46.380, 288.37);
              editor.camera.rotation.set(0, 0, 0);
              // 화각 설정
              if (editor.camera.fov !== undefined) {
                editor.camera.fov = 50.00;
                editor.camera.updateProjectionMatrix();
              }
            }
          }

          // 조명 설정
          const existingLight = this.stageGroup.children.find(
            (child) => child.name === "_Light",
          );

          if (!existingLight) {
            // 무대 전체조명
            const hemiLight = new THREE.HemisphereLight(0xffffff, 0x181818, 0.92);
            hemiLight.position.set(0, 1, 0);
            hemiLight.name = "_Light";
            this.stageGroup.add(hemiLight);

            // 난설 프리셋 중 가운데(앞_C)만 — 동일 수치, 이름은 `_StageFrontSpot_C`
            const cfg = NANSEOL_FRONT_SPOT_PRESETS.find(
              (p) => p.name === "난설_조명_앞_C",
            );
            if (cfg) {
              const target = new THREE.Object3D();
              target.position.set(cfg.target[0], cfg.target[1], cfg.target[2]);
              target.name = "_StageFrontSpotTarget_C";
              target.userData.isBackground = false;
              target.userData.notEditable = false;
              target.userData.notSelectable = false;
              target.userData.selectSelf = true;
              this.stageGroup.add(target);

              const spot = new THREE.SpotLight(
                cfg.color !== undefined ? cfg.color : 0xffffff,
                cfg.intensity,
                cfg.distance,
                cfg.angle,
                cfg.penumbra,
                0,
              );
              spot.name = "_StageFrontSpot_C";
              // _StageFrontSpot_C 초기값은 UI 기준값으로 고정
              spot.position.set(1.89, 72.905, 225.001);
              spot.intensity = 2.24;
              spot.distance = 519.7;
              spot.angle = 1.13;
              spot.penumbra = 0.14;
              spot.decay = 0.0;
              spot.color.setHex(0xffffff);
              spot.visible = true;
              spot.target = target;
              spot.userData.isBackground = false;
              spot.userData.notEditable = false;
              spot.userData.notSelectable = false;
              spot.userData.selectSelf = true;
              spot.castShadow = true;
              spot.shadow.mapSize.set(2048, 2048);
              spot.shadow.bias = -0.00025;
              this.stageGroup.add(spot);
            }
          } else {
            console.log("Light already exists");
          }

          // 기존 파일/재생성 케이스 포함: 무대 스팟라이트/타겟은 항상 선택·편집 가능 상태로 정규화
          const editableStageSpotNames = ["_StageFrontSpot_C", "_StageFrontSpotTarget_C"];
          editableStageSpotNames.forEach((name) => {
            const obj = this.stageGroup.children.find((child) => child.name === name);
            if (!obj) return;
            if (!obj.userData) obj.userData = {};
            obj.userData.isBackground = false;
            obj.userData.notEditable = false;
            obj.userData.notSelectable = false;
            obj.userData.selectSelf = true;
          });

          // Stage 그룹 전체에 대한 userData 설정
          this.stageGroup.userData.isBackground = true;
          this.stageGroup.userData.notSelectable = true;
          this.stageGroup.userData.notEditable = true;
          this.stageGroup.userData.excludeFromTimeline = true;

          editor.signals.sceneGraphChanged.dispatch();
          editor.scene.userData.hasBackground = true;

          editor.signals.objectSelected.remove(background.onObjectSelected);
          editor.signals.objectSelected.add(background.onObjectSelected);

          console.log("Background and floor loaded successfully");

          // loading 모달 숨김
          const modal = document.getElementById("loading-modal");
          if (modal) modal.style.display = "none";
        },
        undefined,
        (error) => {
          // 에러 시에도 모달 숨기기
          const modal = document.getElementById("loading-modal");
          if (modal) modal.style.display = "none";
          console.error("Error loading background:", error);
        },
      );
    },
    createFloor: function (stageType) {
      console.log("createFloor for stage type:", stageType);

      // 기존 바닥 제거
      const existingFloor = this.stageGroup.children.find(
        (child) => child.name === "_Floor",
      );
      if (existingFloor) {
        this.stageGroup.remove(existingFloor);
        if (existingFloor.geometry) existingFloor.geometry.dispose();
        if (existingFloor.material) existingFloor.material.dispose();
      }

      // 현재 무대 타입 확인
      const currentStageType = stageType || editor.scene.userData.stageType || "proscenium";

      let floorGeometry;
      let floor;

      const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x808080,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 1,
        envMapIntensity: 1.0,
        roughness: 0.5,
        metalness: 0.0,
      });

      if (currentStageType === "arena") {
        // 아레나: 합성 바닥 — arenaStageLayout.js (에디터에서 맞춘 위치·XZ 스케일)
        const bg = this.stageGroup.children.find((c) => c.name === "_Background");
        const layout = arenaFloorLayoutFromBackground(bg);
        console.log("Creating arena floor mesh", layout);
        floorGeometry = new THREE.CircleGeometry(layout.geometryRadius, 96);
        floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2; // XY 원판 → XZ 바닥
        floor.position.set(layout.x, layout.y, layout.z);
        floor.scale.set(layout.scaleX, layout.scaleY, layout.scaleZ);
      } else {
        // 프로시니엄: 사각형 바닥 (기본)
        console.log("Creating rectangular floor for proscenium");
        floorGeometry = new THREE.BoxGeometry(147.446, 1, 111.747);
        floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.position.set(74, -4.163, 0.0);
        floor.scale.set(5.5, 6.779, 3.0);

      }

      floor.name = "_Floor";

      // 🎯 그리드가 바닥을 뚫고 보이도록 설정
      floor.renderOrder = -500;
      floor.material.depthWrite = true;
      floor.raycast = () => null;

      this.stageGroup.add(floor);
      console.log("Floor created successfully for", currentStageType);
    },
    onObjectSelected: function (selected) {
      if (!selected) return;

      const selectedName = String(selected.name || "");
      const isEditableStageSpot =
        selectedName.startsWith("_StageFrontSpot_") ||
        selectedName.startsWith("_StageFrontSpotTarget_");

      if (isEditableStageSpot) return;

      // 4/8 방식 유지: 무대(Stage) / 배경 그룹(isBackground)은 선택 즉시 해제
      // 단, 무대 기본 스팟/타겟은 예외로 선택 가능
      if (selectedName === "Stage" || selected.userData?.isBackground === true) {
        editor.selected = null;
        editor.signals.objectSelected.dispatch(null);
      }
    },
  };
  console.log(editor.scene.userData.hasBackground);
  // 새 파일일 경우에만 Background 생성
  if (!editor.scene.userData.hasBackground) {
    console.log("새 파일 - 기본 프로시니엄 무대 생성");
    background.init();
    // 기본값으로 프로시니엄 무대 설정
    editor.scene.userData.stageType = "proscenium";
    background.create();
    background.createFloor("proscenium");
  } else {
    // 기존 파일 로드 시
    console.log("기존 파일 로드 중...");
    background.init();

    // stageType이 없으면 기본값 설정
    if (!editor.scene.userData.stageType) {
      console.log("stageType 없음 - 기본값 proscenium 설정");
      editor.scene.userData.stageType = "proscenium";
    }

    console.log("저장된 무대 타입:", editor.scene.userData.stageType);

    // Stage 그룹에 _Background가 이미 있는지 확인
    const existingBackground = background.stageGroup?.children.find(
      (child) => child.name === "_Background"
    );

    if (!existingBackground) {
      console.log("무대 모델이 없음 - 저장된 타입으로 무대 로드:", editor.scene.userData.stageType);

      // 저장된 무대 타입에 맞는 파일 경로 설정
      const stageFiles = {
        proscenium: "../files/stage/background.fbx",
        arena: "../files/stage/arena_stage.fbx"
      };

      const stageFile = stageFiles[editor.scene.userData.stageType] || stageFiles.proscenium;

      // 무대 생성
      background.create(stageFile);
      background.createFloor(editor.scene.userData.stageType);
    } else {
      console.log("무대 모델이 이미 로드되어 있음");
      // 바닥만 없으면 생성
      const existingFloor = background.stageGroup?.children.find(
        (child) => child.name === "_Floor"
      );
      if (!existingFloor) {
        background.createFloor(editor.scene.userData.stageType);
      }
    }
  }

  // background 객체를 editor에 저장하여 Sidebar.Scene에서 접근 가능하도록 함
  editor.videoEdit = {
    background: background
  };

  return container;
}

export { VideoEdit };
