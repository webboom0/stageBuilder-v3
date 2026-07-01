import * as THREE from "three";

import { TGALoader } from "three/addons/loaders/TGALoader.js";

import { AddObjectCommand } from "./commands/AddObjectCommand.js";

import { LoaderUtils } from "./LoaderUtils.js";
import { captureMotionWorldReferenceHeight } from "./utils/motionDisplayUnits.js";

import { unzipSync, strFromU8 } from "three/addons/libs/fflate.module.js";

function Loader(editor) {
  // 객체를 scene에 추가하기 전에 처리하는 함수 추가
  function processObject(object) {
    object.traverse((child) => {
      if (child.parent && child.parent.isGroup) {
        // 그룹의 하위 객체인 경우
        child.userData.hideInScenePanel = true;
        child.userData.notSelectable = true;
        child.userData.notEditable = true;
      }
    });
    return object;
  }

  // 🎨 FBX/메쉬 틴트(재질 색상) 적용
  function applyTintToObject(object, hexColor) {
    if (!object || hexColor === undefined || hexColor === null) return;

    const applyToMaterial = (mat) => {
      if (!mat) return;
      if (mat.color && typeof mat.color.setHex === "function") {
        mat.color.setHex(hexColor);
        mat.needsUpdate = true;
      }
    };

    object.traverse((child) => {
      if (!child || child.isMesh !== true) return;

      const material = child.material;
      if (Array.isArray(material)) {
        material.forEach(applyToMaterial);
      } else {
        applyToMaterial(material);
      }
    });
  }

  function ensureTintableMotionObject(object) {
    if (!object) return;
    if (!object.userData) object.userData = {};
    object.userData.tintable = true;
    if (object.userData.tintColor === undefined) object.userData.tintColor = 0xff0000; // red default
    applyTintToObject(object, object.userData.tintColor);
  }

  /** FBX 등에 애니메이션이 있으면 첫 클립의 t=0 포즈를 본에 반영(바인드 포즈 대신 첫 키프레임 자세) */
  function applyAnimationFirstFramePose(root) {
    if (!root || !root.animations || root.animations.length === 0) return;

    const mixer = new THREE.AnimationMixer(root);
    const clip = root.animations[0];
    const action = mixer.clipAction(clip);
    action.reset();
    action.time = 0;
    action.setEffectiveWeight(1);
    action.play();
    mixer.update(0);
    root.updateMatrixWorld(true);
  }

  // 🎯 자동 크기 조정 함수 (개선된 버전)
  function autoScaleObject(object, targetSize = 30) {
    try {
      // 바운딩 박스 계산
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());

      // 가장 큰 차원을 기준으로 스케일 계산
      const maxDimension = Math.max(size.x, size.y, size.z);
      
      if (maxDimension > 0) {
        // 객체 크기에 따른 적응적 목표 크기 설정
        let adaptiveTargetSize = targetSize;
        
        // 매우 작은 객체 (1 단위 미만)
        if (maxDimension < 1) {
          adaptiveTargetSize = targetSize * 2; // 더 크게
        }
        // 매우 큰 객체 (1000 단위 이상)
        else if (maxDimension > 1000) {
          adaptiveTargetSize = targetSize * 0.8; // 조금 작게
        }
        // 중간 크기 객체 (100-1000 단위)
        else if (maxDimension > 100) {
          adaptiveTargetSize = targetSize * 0.9; // 약간 작게
        }
        
        const scale = adaptiveTargetSize / maxDimension;
        
        // 스케일 적용
        object.scale.setScalar(scale);
        
        // 루트를 원점에 둠 (요청: 첫 삽입 시 Y=0, XZ도 0)
        object.position.set(0, 0, 0);

        // 객체 정보 저장 (나중에 참조할 수 있도록)
        object.userData.originalSize = {
          x: size.x,
          y: size.y,
          z: size.z,
          maxDimension: maxDimension
        };
        object.userData.autoScale = scale;
        object.userData.adaptiveTargetSize = adaptiveTargetSize;

        object.userData.minYPosition = 0;
        
        console.log(`🎯 자동 크기 조정: ${object.name || 'Unknown'}`);
        console.log(`   원본 크기: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)}`);
        console.log(`   최대 차원: ${maxDimension.toFixed(2)}`);
        console.log(`   목표 크기: ${adaptiveTargetSize.toFixed(2)}`);
        console.log(`   적용된 스케일: ${scale.toFixed(3)}`);
        console.log(`   조정된 크기: ${(size.x * scale).toFixed(2)} x ${(size.y * scale).toFixed(2)} x ${(size.z * scale).toFixed(2)}`);
        console.log(`   위치: (0, 0, 0) 원점`);
      } else {
        object.position.set(0, 0, 0);
        if (!object.userData) object.userData = {};
        object.userData.minYPosition = 0;
      }

      return object;
    } catch (error) {
      console.warn("🎯 자동 크기 조정 실패:", error);
      return object;
    }
  }

  // 파일명에서 이름 추출
  function getFileNameFromPath(path) {
    return path.split("/").pop().split(".").shift();
  }

  const scope = this;

  this.texturePath = "";

  this.loadItemList = function (items) {
    LoaderUtils.getFilesFromItemList(items, function (files, filesMap) {
      scope.loadFiles(files, filesMap);
    });
  };

  this.loadFiles = function (files, filesMap) {
    if (files.length > 0) {
      filesMap = filesMap || LoaderUtils.createFilesMap(files);

      const manager = new THREE.LoadingManager();

      // 로딩 매니저에 오류 핸들러 추가
      manager.onError = function (url) {
        console.warn("리소스 로드 실패:", url);
        // 오류가 발생해도 계속 진행
      };

      manager.setURLModifier(function (url) {
        url = url.replace(/^(\.?\/)/, ""); // remove './'

        const file = filesMap[url];

        if (file) {
          console.log("Loading", url);

          return URL.createObjectURL(file);
        }

        return url;
      });

      manager.addHandler(/\.tga$/i, new TGALoader());

      for (let i = 0; i < files.length; i++) {
        scope.loadFile(files[i], manager);
      }
    }
  };

  /** 저장/복원용 — URL에서 FBX 모션 객체 로드 */
  this.loadMotionFromUrl = async function (url, meta = {}) {
    const resolvedUrl = new URL(url, window.location.href).href;
    const lower = resolvedUrl.toLowerCase();
    const fileName = meta.fileName || url.split("/").pop() || "motion.fbx";

    let object;
    if (lower.endsWith(".obj")) {
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");
      const text = await fetch(resolvedUrl).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.text();
      });
      object = new OBJLoader().parse(text);
    } else {
      const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
      const buffer = await fetch(resolvedUrl).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.arrayBuffer();
      });
      object = new FBXLoader().parse(buffer);
    }

    object.name = meta.displayName || fileName.replace(/\.fbx$/i, "").replace(/\.obj$/i, "");
    object.userData = object.userData || {};
    object.userData.source = "motion";
    object.userData.fileName = fileName;
    object.userData.filePath = url;
    object.userData.displayName = meta.displayName || object.name;

    const { SceneObjectSerializer } = await import("./utils/SceneObjectSerializer.js");
    await SceneObjectSerializer.processMotionObject(object, editor);

    return object;
  };

  this.loadFile = function (file, manager) {
    const filename = file.name;
    const extension = filename.split(".").pop().toLowerCase();

    // 🎯 파일 형식 제한 검증
    const allowedExtensions = {
      // 3D 객체 파일 (obj, fbx만 허용)
      '3d': ['obj', 'fbx'],
      // 이미지 파일 (png만 허용)
      'image': ['png'],
      // 영상 파일 (mp4만 허용) - 현재 미구현
      'video': ['mp4'],
      // 음악 파일 (mp3만 허용) - 현재 미구현
      'audio': ['mp3']
    };

    // 모든 허용된 확장자를 하나의 배열로 합치기
    const allAllowedExtensions = [
      ...allowedExtensions['3d'],
      ...allowedExtensions.image,
      ...allowedExtensions.video,
      ...allowedExtensions.audio,
      // 기타 시스템 파일들
      'zip', 'json'
    ];

    // 파일 형식 검증
    if (!allAllowedExtensions.includes(extension)) {
      let errorMessage = `지원되지 않는 파일 형식입니다: .${extension}\n\n`;
      errorMessage += `허용되는 파일 형식:\n`;
      errorMessage += `• 3D 객체: ${allowedExtensions['3d'].map(ext => '.' + ext).join(', ')}\n`;
      errorMessage += `• 이미지: ${allowedExtensions.image.map(ext => '.' + ext).join(', ')}\n`;
      errorMessage += `• 영상: ${allowedExtensions.video.map(ext => '.' + ext).join(', ')} (준비 중)\n`;
      errorMessage += `• 음악: ${allowedExtensions.audio.map(ext => '.' + ext).join(', ')} (준비 중)`;
      
      alert(errorMessage);
      return;
    }

    // 현재 미구현된 파일 형식에 대한 안내
    if (allowedExtensions.video.includes(extension)) {
      alert(`영상 파일(.${extension})은 아직 지원 준비 중입니다.`);
      return;
    }
    
    if (allowedExtensions.audio.includes(extension)) {
      alert(`음악 파일(.${extension})은 아직 지원 준비 중입니다.`);
      return;
    }

    const reader = new FileReader();
    reader.addEventListener("progress", function (event) {
      const size =
        "(" +
        editor.utils.formatNumber(Math.floor(event.total / 1000)) +
        " KB)";
      const progress = Math.floor((event.loaded / event.total) * 100) + "%";

      console.log("Loading", filename, size, progress);
    });

    switch (extension) {
      // 🎯 허용되지 않는 3D 파일 형식들 (obj, fbx만 허용)
      case "3dm":
      case "3ds":
      case "3mf":
      case "amf":
      case "dae":
      case "drc":
      case "glb":
      case "gltf":
      case "kmz":
      case "md2":
      case "pcd":
      case "ply":
      case "stl":
      case "vtk":
      case "vtp":
      case "vtu":
      case "wrl":
      case "xyz": {
        alert(`3D 파일은 .obj 또는 .fbx 형식만 지원됩니다.\n현재 파일: .${extension}`);
        return;
      }

      // 🎯 허용되지 않는 이미지 파일 형식들 (png만 허용)
      case "jpg":
      case "jpeg":
      case "gif":
      case "bmp":
      case "webp":
      case "tiff":
      case "tga": {
        alert(`이미지 파일은 .png 형식만 지원됩니다.\n현재 파일: .${extension}`);
        return;
      }

      case "3dm_old": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { Rhino3dmLoader } = await import(
              "three/addons/loaders/3DMLoader.js"
            );

            const loader = new Rhino3dmLoader();
            loader.setLibraryPath("../examples/jsm/libs/rhino3dm/");
            loader.parse(
              contents,
              function (object) {
                object.name = filename;

                editor.execute(new AddObjectCommand(editor, object));
              },
              function (error) {
                console.error(error);
              },
            );
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "3ds": {
        reader.addEventListener(
          "load",
          async function (event) {
            const { TDSLoader } = await import(
              "three/addons/loaders/TDSLoader.js"
            );

            const loader = new TDSLoader();
            const object = loader.parse(event.target.result);

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "3mf": {
        reader.addEventListener(
          "load",
          async function (event) {
            const { ThreeMFLoader } = await import(
              "three/addons/loaders/3MFLoader.js"
            );

            const loader = new ThreeMFLoader();
            const object = loader.parse(event.target.result);

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "amf": {
        reader.addEventListener(
          "load",
          async function (event) {
            const { AMFLoader } = await import(
              "three/addons/loaders/AMFLoader.js"
            );

            const loader = new AMFLoader();
            const amfobject = loader.parse(event.target.result);

            editor.execute(new AddObjectCommand(editor, amfobject));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "dae": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { ColladaLoader } = await import(
              "three/addons/loaders/ColladaLoader.js"
            );

            const loader = new ColladaLoader(manager);
            const collada = loader.parse(contents);

            collada.scene.name = filename;

            editor.execute(new AddObjectCommand(editor, collada.scene));
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "drc": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { DRACOLoader } = await import(
              "three/addons/loaders/DRACOLoader.js"
            );

            const loader = new DRACOLoader();
            loader.setDecoderPath("../examples/jsm/libs/draco/");
            loader.parse(contents, function (geometry) {
              let object;

              if (geometry.index !== null) {
                const material = new THREE.MeshStandardMaterial();

                object = new THREE.Mesh(geometry, material);
                object.name = filename;
              } else {
                const material = new THREE.PointsMaterial({ size: 0.01 });
                material.vertexColors = geometry.hasAttribute("color");

                object = new THREE.Points(geometry, material);
                object.name = filename;
              }

              loader.dispose();
              editor.execute(new AddObjectCommand(editor, object));
            });
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "fbx": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { FBXLoader } = await import(
              "three/addons/loaders/FBXLoader.js"
            );

            const loader = new FBXLoader(manager);
            const object = loader.parse(contents);
            
            // 이름 설정
            object.name = getFileNameFromPath(file.name);

            // 애니메이션 첫 프레임 포즈 적용 후 크기/바닥 정렬(바운딩이 보이는 자세와 일치)
            applyAnimationFirstFramePose(object);
            processObject(object);
            object.userData.source = "motion";
            object.userData.fileName = file.name;
            object.userData.filePath = `../files/fbx/${file.name}`;
            autoScaleObject(object, 30);
            object.updateMatrixWorld(true);
            captureMotionWorldReferenceHeight(object, editor);

            // 🎨 모션 객체는 모두 틴트 가능 + 기본 틴트(흰색) 적용
            ensureTintableMotionObject(object);

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }
      /*
      case "fbx": {
        console.log("Loader.js - fbx");
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { FBXLoader } = await import(
              "three/addons/loaders/FBXLoader.js"
            );

            const loader = new FBXLoader(manager);
            const object = loader.parse(contents);

            // 전체 객체의 크기를 0.1로 조절
            object.scale.set(0.1, 0.1, 0.1);

            // 스킨드 메시가 있는지 확인
            let hasSkinnedMesh = false;
            object.traverse((child) => {
              if (child.isSkinnedMesh) {
                hasSkinnedMesh = true;
              }
            });

            // 스킨드 메시가 없는 경우에만 새로운 메시 생성
            if (!hasSkinnedMesh) {
              let rootBone = null;
              object.traverse((child) => {
                if (child.isBone && !child.parent.isBone) {
                  rootBone = child;
                }
              });

              if (rootBone && rootBone.skeleton) {
                console.log("Creating mesh for skeleton");
                const newMesh = createSkinnedMesh(rootBone.skeleton);
                object.add(newMesh);
              }
            }

            // 기존 객체 처리
            processObject(object);

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }
*/
      case "glb": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const loader = await createGLTFLoader();

            loader.parse(contents, "", function (result) {
              const scene = result.scene;
              scene.name = filename;

              // 🎯 자동 크기 조정
              autoScaleObject(scene, 30); // 목표 크기 30 단위 (더 작게)

              scene.animations.push(...result.animations);
              editor.execute(new AddObjectCommand(editor, scene));

              loader.dracoLoader.dispose();
              loader.ktx2Loader.dispose();
            });
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "gltf": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const loader = await createGLTFLoader(manager);

            loader.parse(contents, "", function (result) {
              const scene = result.scene;
              scene.name = filename;

              // 🎯 자동 크기 조정
              autoScaleObject(scene, 30); // 목표 크기 30 단위 (더 작게)

              scene.animations.push(...result.animations);
              editor.execute(new AddObjectCommand(editor, scene));

              loader.dracoLoader.dispose();
              loader.ktx2Loader.dispose();
            });
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "js":
      case "json": {
        reader.addEventListener(
          "load",
          function (event) {
            const contents = event.target.result;

            // 2.0

            if (contents.indexOf("postMessage") !== -1) {
              const blob = new Blob([contents], { type: "text/javascript" });
              const url = URL.createObjectURL(blob);

              const worker = new Worker(url);

              worker.onmessage = function (event) {
                event.data.metadata = { version: 2 };
                handleJSON(event.data);
              };

              worker.postMessage(Date.now());

              return;
            }

            // >= 3.0

            let data;

            try {
              data = JSON.parse(contents);
            } catch (error) {
              alert(error);
              return;
            }

            handleJSON(data);
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "kmz": {
        reader.addEventListener(
          "load",
          async function (event) {
            const { KMZLoader } = await import(
              "three/addons/loaders/KMZLoader.js"
            );

            const loader = new KMZLoader();
            const collada = loader.parse(event.target.result);

            collada.scene.name = filename;

            editor.execute(new AddObjectCommand(editor, collada.scene));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "ldr":
      case "mpd": {
        reader.addEventListener(
          "load",
          async function (event) {
            const { LDrawLoader } = await import(
              "three/addons/loaders/LDrawLoader.js"
            );

            const loader = new LDrawLoader();
            loader.setPath("../../examples/models/ldraw/officialLibrary/");
            loader.parse(event.target.result, function (group) {
              group.name = filename;
              // Convert from LDraw coordinates: rotate 180 degrees around OX
              group.rotation.x = Math.PI;

              editor.execute(new AddObjectCommand(editor, group));
            });
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "md2": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { MD2Loader } = await import(
              "three/addons/loaders/MD2Loader.js"
            );

            const geometry = new MD2Loader().parse(contents);
            const material = new THREE.MeshStandardMaterial();

            const mesh = new THREE.Mesh(geometry, material);
            mesh.mixer = new THREE.AnimationMixer(mesh);
            mesh.name = filename;

            mesh.animations.push(...geometry.animations);
            editor.execute(new AddObjectCommand(editor, mesh));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      // case "obj": {
      //   console.log("loader.js - obj 들어옴");
      //   reader.addEventListener(
      //     "load",
      //     async function (event) {
      //       const contents = event.target.result;

      //       const { OBJLoader } = await import(
      //         "three/addons/loaders/OBJLoader.js"
      //       );

      //       const loader = new OBJLoader();
      //       const object = loader.parse(contents);
      //       object.name = filename;

      //       // 더 단순한 Phong 재질 사용
      //       const wallMaterial = new THREE.MeshPhongMaterial({
      //         color: 0xcccccc, // 밝은 회색
      //         specular: 0x111111, // 반사광 색상
      //         shininess: 30, // 광택
      //         side: THREE.DoubleSide,
      //       });

      //       // 모든 메시에 재질 적용
      //       object.traverse((child) => {
      //         if (child.isMesh) {
      //           child.material = wallMaterial;
      //           // 그림자 설정
      //           child.castShadow = true;
      //           child.receiveShadow = true;
      //         }
      //       });

      //       // 객체 처리
      //       processObject(object);

      //       editor.execute(new AddObjectCommand(editor, object));
      //     },
      //     false,
      //   );
      //   reader.readAsText(file);

      //   break;
      // }

      case "obj": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { OBJLoader } = await import(
              "three/addons/loaders/OBJLoader.js"
            );

            const object = new OBJLoader().parse(contents);
            object.name = filename;

            processObject(object);
            object.userData.source = "motion";
            object.userData.fileName = file.name;
            object.userData.filePath = `../files/fbx/${file.name}`;
            autoScaleObject(object, 30);
            object.updateMatrixWorld(true);
            captureMotionWorldReferenceHeight(object, editor);

            // 🎨 모션 객체는 모두 틴트 가능 + 기본 틴트(흰색) 적용
            ensureTintableMotionObject(object);

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "pcd": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { PCDLoader } = await import(
              "three/addons/loaders/PCDLoader.js"
            );

            const points = new PCDLoader().parse(contents);
            points.name = filename;

            editor.execute(new AddObjectCommand(editor, points));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "ply": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { PLYLoader } = await import(
              "three/addons/loaders/PLYLoader.js"
            );

            const geometry = new PLYLoader().parse(contents);
            let object;

            if (geometry.index !== null) {
              const material = new THREE.MeshStandardMaterial();

              object = new THREE.Mesh(geometry, material);
              object.name = filename;
            } else {
              const material = new THREE.PointsMaterial({ size: 0.01 });
              material.vertexColors = geometry.hasAttribute("color");

              object = new THREE.Points(geometry, material);
              object.name = filename;
            }

            // 🎯 자동 크기 조정
            autoScaleObject(object, 30); // 목표 크기 30 단위 (더 작게)

            editor.execute(new AddObjectCommand(editor, object));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "stl": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { STLLoader } = await import(
              "three/addons/loaders/STLLoader.js"
            );

            const geometry = new STLLoader().parse(contents);
            const material = new THREE.MeshStandardMaterial();

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = filename;

            // 🎯 자동 크기 조정
            autoScaleObject(mesh, 50); // 목표 크기 50 단위

            editor.execute(new AddObjectCommand(editor, mesh));
          },
          false,
        );

        if (reader.readAsBinaryString !== undefined) {
          reader.readAsBinaryString(file);
        } else {
          reader.readAsArrayBuffer(file);
        }

        break;
      }

      case "png": {
        reader.addEventListener(
          "load",
          function (event) {
            const image = new Image();
            image.onload = function () {
              // 텍스처 생성
              const texture = new THREE.Texture(image);
              texture.needsUpdate = true;
              
              // 이미지 비율에 맞는 평면 지오메트리 생성
              const aspectRatio = image.width / image.height;
              const planeWidth = aspectRatio > 1 ? 10 : 10 * aspectRatio;
              const planeHeight = aspectRatio > 1 ? 10 / aspectRatio : 10;
              
              const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
              const material = new THREE.MeshBasicMaterial({
                map: texture,
                transparent: true,
                side: THREE.DoubleSide
              });
              
              const mesh = new THREE.Mesh(geometry, material);
              mesh.name = filename;
              
              // 🎯 자동 크기 조정 및 바닥 위치 설정 적용
              autoScaleObject(mesh);

              editor.execute(new AddObjectCommand(editor, mesh));
            };
            image.src = event.target.result;
          },
          false,
        );
        reader.readAsDataURL(file);

        break;
      }

      case "svg": {
        alert(`이미지 파일은 .png 형식만 지원됩니다.\n현재 파일: .${extension}`);
        return;
      }

      case "svg_old": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { SVGLoader } = await import(
              "three/addons/loaders/SVGLoader.js"
            );

            const loader = new SVGLoader();
            const paths = loader.parse(contents).paths;

            //

            const group = new THREE.Group();
            group.name = filename;
            group.scale.multiplyScalar(0.1);
            group.scale.y *= -1;

            for (let i = 0; i < paths.length; i++) {
              const path = paths[i];

              const material = new THREE.MeshBasicMaterial({
                color: path.color,
                depthWrite: false,
              });

              const shapes = SVGLoader.createShapes(path);

              for (let j = 0; j < shapes.length; j++) {
                const shape = shapes[j];

                const geometry = new THREE.ShapeGeometry(shape);
                const mesh = new THREE.Mesh(geometry, material);

                group.add(mesh);
              }
            }

            editor.execute(new AddObjectCommand(editor, group));
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "usdz": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { USDZLoader } = await import(
              "three/addons/loaders/USDZLoader.js"
            );

            const group = new USDZLoader().parse(contents);
            group.name = filename;

            editor.execute(new AddObjectCommand(editor, group));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "vox": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { VOXLoader, VOXMesh } = await import(
              "three/addons/loaders/VOXLoader.js"
            );

            const chunks = new VOXLoader().parse(contents);

            const group = new THREE.Group();
            group.name = filename;

            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i];

              const mesh = new VOXMesh(chunk);
              group.add(mesh);
            }

            editor.execute(new AddObjectCommand(editor, group));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "vtk":
      case "vtp": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { VTKLoader } = await import(
              "three/addons/loaders/VTKLoader.js"
            );

            const geometry = new VTKLoader().parse(contents);
            const material = new THREE.MeshStandardMaterial();

            const mesh = new THREE.Mesh(geometry, material);
            mesh.name = filename;

            editor.execute(new AddObjectCommand(editor, mesh));
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      case "wrl": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { VRMLLoader } = await import(
              "three/addons/loaders/VRMLLoader.js"
            );

            const result = new VRMLLoader().parse(contents);

            editor.execute(new AddObjectCommand(editor, result));
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "xyz": {
        reader.addEventListener(
          "load",
          async function (event) {
            const contents = event.target.result;

            const { XYZLoader } = await import(
              "three/addons/loaders/XYZLoader.js"
            );

            const geometry = new XYZLoader().parse(contents);

            const material = new THREE.PointsMaterial();
            material.vertexColors = geometry.hasAttribute("color");

            const points = new THREE.Points(geometry, material);
            points.name = filename;

            editor.execute(new AddObjectCommand(editor, points));
          },
          false,
        );
        reader.readAsText(file);

        break;
      }

      case "zip": {
        reader.addEventListener(
          "load",
          function (event) {
            handleZIP(event.target.result);
          },
          false,
        );
        reader.readAsArrayBuffer(file);

        break;
      }

      default:
        console.error("Unsupported file format (" + extension + ").");

        break;
    }
  };

  function handleJSON(data) {
    console.log("=== JSON 파일 로드 시작 ===");
    console.log("파일 데이터:", data);
    console.log("메타데이터:", data.metadata);

    if (data.metadata === undefined) {
      // 2.0

      data.metadata = { type: "Geometry" };
    }

    if (data.metadata.type === undefined) {
      // 3.0

      data.metadata.type = "Geometry";
    }

    if (data.metadata.formatVersion !== undefined) {
      data.metadata.version = data.metadata.formatVersion;
    }

    console.log("처리할 타입:", data.metadata.type.toLowerCase());

    switch (data.metadata.type.toLowerCase()) {
      case "buffergeometry": {
        console.log("BufferGeometry 처리 중...");
        const loader = new THREE.BufferGeometryLoader();
        const result = loader.parse(data);

        const mesh = new THREE.Mesh(result);

        editor.execute(new AddObjectCommand(editor, mesh));

        break;
      }

      case "geometry":
        console.error('Loader: "Geometry" is no longer supported. Please convert to BufferGeometry.');
        console.log("Geometry 데이터:", data);
        // 사용자에게 알림
        alert('이 파일은 더 이상 지원되지 않는 Geometry 형식입니다. BufferGeometry로 변환된 파일을 사용해주세요.');
        break;

      case "object": {
        console.log("Object 처리 중...");
        const loader = new THREE.ObjectLoader();
        loader.setResourcePath(scope.texturePath);

        loader.parse(data, function (result) {
          editor.execute(new AddObjectCommand(editor, result));
        });

        break;
      }

      case "app":
        console.log("App 처리 중...");
        editor.fromJSON(data);

        break;

      default:
        console.error("알 수 없는 타입:", data.metadata.type);
        break;
    }
  }

  async function handleZIP(contents) {
    const zip = unzipSync(new Uint8Array(contents));

    const manager = new THREE.LoadingManager();
    manager.setURLModifier(function (url) {
      const file = zip[url];

      if (file) {
        console.log("Loading", url);

        const blob = new Blob([file.buffer], {
          type: "application/octet-stream",
        });
        return URL.createObjectURL(blob);
      }

      return url;
    });

    // Poly

    if (zip["model.obj"] && zip["materials.mtl"]) {
      const { MTLLoader } = await import("three/addons/loaders/MTLLoader.js");
      const { OBJLoader } = await import("three/addons/loaders/OBJLoader.js");

      const materials = new MTLLoader(manager).parse(
        strFromU8(zip["materials.mtl"]),
      );
      const object = new OBJLoader()
        .setMaterials(materials)
        .parse(strFromU8(zip["model.obj"]));

      object.position.set(0, 0, 0);
      if (object.userData) object.userData.minYPosition = 0;

      editor.execute(new AddObjectCommand(editor, object));
      return;
    }

    //

    for (const path in zip) {
      const file = zip[path];

      const extension = path.split(".").pop().toLowerCase();

      switch (extension) {
        case "fbx": {
          const { FBXLoader } = await import(
            "three/addons/loaders/FBXLoader.js"
          );

          const loader = new FBXLoader(manager);
          const object = loader.parse(file.buffer);

          applyAnimationFirstFramePose(object);

          // 🎨 ZIP 내 FBX(모션 객체)도 틴트 가능 + 기본 틴트(흰색) 적용
          ensureTintableMotionObject(object);

          object.position.set(0, 0, 0);
          if (object.userData) object.userData.minYPosition = 0;

          editor.execute(new AddObjectCommand(editor, object));

          break;
        }

        case "glb": {
          const loader = await createGLTFLoader();

          loader.parse(file.buffer, "", function (result) {
            const scene = result.scene;

            scene.position.set(0, 0, 0);
            if (scene.userData) scene.userData.minYPosition = 0;

            scene.animations.push(...result.animations);
            editor.execute(new AddObjectCommand(editor, scene));

            loader.dracoLoader.dispose();
            loader.ktx2Loader.dispose();
          });

          break;
        }

        case "gltf": {
          const loader = await createGLTFLoader(manager);

          loader.parse(strFromU8(file), "", function (result) {
            const scene = result.scene;

            scene.position.set(0, 0, 0);
            if (scene.userData) scene.userData.minYPosition = 0;

            scene.animations.push(...result.animations);
            editor.execute(new AddObjectCommand(editor, scene));

            loader.dracoLoader.dispose();
            loader.ktx2Loader.dispose();
          });

          break;
        }
      }
    }
  }

  async function createGLTFLoader(manager) {
    const { GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js");
    const { DRACOLoader } = await import("three/addons/loaders/DRACOLoader.js");
    const { KTX2Loader } = await import("three/addons/loaders/KTX2Loader.js");
    const { MeshoptDecoder } = await import(
      "three/addons/libs/meshopt_decoder.module.js"
    );

    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath("../examples/jsm/libs/draco/gltf/");

    const ktx2Loader = new KTX2Loader(manager);
    ktx2Loader.setTranscoderPath("../examples/jsm/libs/basis/");

    editor.signals.rendererDetectKTX2Support.dispatch(ktx2Loader);

    const loader = new GLTFLoader(manager);
    loader.setDRACOLoader(dracoLoader);
    loader.setKTX2Loader(ktx2Loader);
    loader.setMeshoptDecoder(MeshoptDecoder);

    return loader;
  }
}

export { Loader };