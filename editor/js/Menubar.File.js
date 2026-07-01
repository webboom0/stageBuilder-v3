import { UIPanel, UIRow, UIHorizontalRule } from "./libs/ui.js";
import { ProgressiveLoader } from './utils/ProgressiveLoader.js';
import { Timeline } from './timeline/Timeline.js';
import { ProjectSetup } from './ProjectSetup.js';

function MenubarFile(editor) {
  const strings = editor.strings;

  const saveArrayBuffer = editor.utils.saveArrayBuffer;
  const saveString = editor.utils.saveString;

  const container = new UIPanel();
  container.setClass("menu");

  const title = new UIPanel();
  title.setClass("title");
  title.setTextContent(strings.getKey("menubar/file"));
  container.add(title);

  const options = new UIPanel();
  options.setClass("options");
  container.add(options);

  // New 버튼
  const newButton = new UIRow();
  newButton.setClass("option button-style");
  newButton.setTextContent("새파일");
  newButton.onClick(async function () {
    if (confirm("Any unsaved data will be lost. Are you sure?")) {
      // 현재 editor 초기화
      editor.clear();
      // await initMusic();

      // 전체 탭 초기화 이벤트 발생
      // window.resetAllTabs 함수가 있는지 확인하고 직접 호출
      if (typeof window.resetAllTabs === "function") {
        await window.resetAllTabs();
      }
      //window.dispatchEvent(resetEvent);

      // location.reload();
    }
  });
  options.add(newButton);



  // New Project

  // const newProjectSubmenuTitle = new UIRow()
  //   .setTextContent(strings.getKey("menubar/file/new"))
  //   .addClass("option")
  //   .addClass("submenu-title");
  // newProjectSubmenuTitle.onMouseOver(function () {
  //   const { top, right } = this.dom.getBoundingClientRect();
  //   const { paddingTop } = getComputedStyle(this.dom);
  //   newProjectSubmenu.setLeft(right + "px");
  //   newProjectSubmenu.setTop(top - parseFloat(paddingTop) + "px");
  //   newProjectSubmenu.setDisplay("block");
  // });
  // newProjectSubmenuTitle.onMouseOut(function () {
  //   newProjectSubmenu.setDisplay("none");
  // });
  // options.add(newProjectSubmenuTitle);

  // const newProjectSubmenu = new UIPanel()
  //   .setPosition("fixed")
  //   .addClass("options")
  //   .setDisplay("none");
  // newProjectSubmenuTitle.add(newProjectSubmenu);
  // // New Project / Empty

  let option = new UIRow();
  //   .setTextContent(strings.getKey("menubar/file/new/empty"))
  //   .setClass("option");
  // option.onClick(function () {
  //   if (confirm(strings.getKey("prompt/file/open"))) {
  //     editor.clear();
  //   }
  // });
  // newProjectSubmenu.add(option);

  // newProjectSubmenu.add(new UIHorizontalRule());

  // // New Project / ...

  // const examples = [
  //   { title: "menubar/file/new/Arkanoid", file: "arkanoid.app.json" },
  //   { title: "menubar/file/new/Camera", file: "camera.app.json" },
  //   { title: "menubar/file/new/Particles", file: "particles.app.json" },
  //   { title: "menubar/file/new/Pong", file: "pong.app.json" },
  //   { title: "menubar/file/new/Shaders", file: "shaders.app.json" },
  // ];

  // const loader = new THREE.FileLoader();

  // for (let i = 0; i < examples.length; i++) {
  //   (function (i) {
  //     const example = examples[i];

  //     const option = new UIRow();
  //     option.setClass("option");
  //     option.setTextContent(strings.getKey(example.title));
  //     option.onClick(function () {
  //       if (confirm(strings.getKey("prompt/file/open"))) {
  //         loader.load("examples/" + example.file, function (text) {
  //           editor.clear();
  //           editor.fromJSON(JSON.parse(text));
  //         });
  //       }
  //     });
  //     newProjectSubmenu.add(option);
  //   })(i);
  // }
  // Open

  const openProjectForm = document.createElement("form");
  openProjectForm.style.display = "none";
  document.body.appendChild(openProjectForm);

  const openProjectInput = document.createElement("input");
  openProjectInput.multiple = false;
  openProjectInput.type = "file";
  openProjectInput.accept = ".json,.zip";
  openProjectInput.addEventListener("change", async function () {
    // 파일 선택 즉시 오버레이 UI 띄우기
    import('./utils/ProgressiveLoader.js').then(({ ProgressiveLoader }) => {
      if (!editor.progressiveLoader) {
        editor.progressiveLoader = new ProgressiveLoader(editor);
      }
      editor.progressiveLoader.keepOverlayOpen = true;
      editor.progressiveLoader.createProgressUI();
      editor.progressiveLoader.setProgressMessage('프로젝트 로딩 중...', '데이터 준비 중');
    });
    const file = openProjectInput.files[0];

    if (file === undefined) return;

    try {
      console.log("파일 로드 시작:", file.name, file.type);

      async function onEditorCleared() {
        try {
          if (file.name.endsWith('.zip') || file.type === 'application/zip' || file.type === 'application/x-zip-compressed') {
            // ZIP 파일 처리
            console.log("ZIP 파일 감지, 압축 해제 중...");
            await editor.fromJSON(file); // Blob으로 전달
          } else {
            // JSON 파일 처리
            const fileText = await file.text();
            const json = JSON.parse(fileText);
            console.log("Loading project:", json); // 불러오는 데이터 확인
            
            // JSON 내용에서 외부 파일 참조 확인
            const hasExternalFiles = fileText.includes('"url":"blob:') || 
                                   fileText.includes('.fbx') || 
                                   fileText.includes('.obj') || 
                                   fileText.includes('.glb') || 
                                   fileText.includes('.gltf') || 
                                   fileText.includes('.mp3') || 
                                   fileText.includes('.mp4') || 
                                   fileText.includes('.wav') || 
                                   fileText.includes('.jpg') || 
                                   fileText.includes('.png') || 
                                   fileText.includes('.jpeg') ||
                                   fileText.includes('files/');
            
            if (hasExternalFiles) {
              // 외부 파일 참조가 있는 경우 미리 경고
              console.warn("외부 파일 참조가 감지된 JSON 파일입니다.");
            }
            
            await editor.fromJSON(json);
          }
        } catch (error) {
          console.error("파일 로드 중 오류:", error);

          if (editor.progressiveLoader) {
            editor.progressiveLoader.keepOverlayOpen = false;
            editor.progressiveLoader.hideProgressUI({ force: true });
          }
          
          // JSON 파일 로딩 시 외부 파일 관련 오류들을 감지해서 ZIP 파일 안내
          const isExternalFileError = !file.name.endsWith('.zip') && 
              (error.message.includes('files') || 
               error.message.includes('asset') || 
               error.message.includes('texture') ||
               error.message.includes('model') ||
               error.message.includes('audio') ||
               error.message.includes('video') ||
               error.message.includes('Cannot resolve') ||
               error.message.includes('Failed to load') ||
               error.message.includes('404') ||
               error.message.includes('Not Found') ||
               error.message.includes('blob:') ||
               error.message.includes('.fbx') ||
               error.message.includes('.obj') ||
               error.message.includes('.glb') ||
               error.message.includes('.mp3') ||
               error.message.includes('.mp4') ||
               error.message.includes('.jpg') ||
               error.message.includes('.png') ||
               error.message.includes('animations') ||
               error.message.includes('Cannot read properties of undefined'));
               
          if (isExternalFileError) {
            
            alert("이 프로젝트는 외부 파일들(3D 모델, 텍스처, 오디오 등)을 포함하고 있습니다.\n\n" +
                  "ZIP 파일로 내보낸 프로젝트를 열어주세요.\n" +
                  "JSON 파일만으로는 외부 파일들을 불러올 수 없습니다.");
          } else {
            // 다른 일반적인 오류들
            alert("파일 로드 중 오류가 발생했습니다: " + error.message);
          }
        }

        editor.signals.editorCleared.remove(onEditorCleared);
      }

      editor.signals.editorCleared.add(onEditorCleared);

      editor.clear();
    } catch (e) {
      alert(strings.getKey("prompt/file/failedToOpenProject"));
      console.error("파일 파싱 오류:", e);
    } finally {
      //form.reset();
      openProjectForm.reset();
    }
  });


  openProjectForm.appendChild(openProjectInput);

  option = new UIRow()
    .addClass("option")
    .setTextContent(strings.getKey("menubar/file/open"))
    .onClick(function () {
      if (confirm(strings.getKey("prompt/file/open"))) {
        openProjectInput.click();
      }
    });

  options.add(option);

  // Save

  option = new UIRow()
    .addClass("option")
    .setTextContent(strings.getKey("menubar/file/save"))
    .onClick(async function () {
      try {
        const json = await editor.toJSON(); // async 호출
        
        console.log("Saving project:", json); // 저장되는 전체 데이터 확인
        // 특히 music 데이터가 있는지 확인
        if (json.music) {
          console.log("Music data being saved:", json.music);
        } else {
          console.log("No music data to save");
        }
        
        // 기본 파일명을 공연명으로 설정 (공연명이 있으면)
        let defaultFileName = "project.json";
        if (editor.project && editor.project.showName) {
          // 파일명에 사용할 수 없는 문자 제거 및 한글 지원
          const safeFileName = editor.project.showName
            .replace(/[<>:"/\\|?*]/g, '') // Windows 파일명 제한 문자 제거
            .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
            .trim();
          if (safeFileName) {
            defaultFileName = `${safeFileName}.json`;
          }
        }
        
        const blob = new Blob([JSON.stringify(json)], {
          type: "application/json",
        });
        editor.utils.save(blob, defaultFileName);
      } catch (error) {
        console.error("프로젝트 저장 중 오류:", error);
        alert("프로젝트 저장 중 오류가 발생했습니다: " + error.message);
      }
    });

  // options.add(option);

  //

  // Save As with Download Attribute

  option = new UIRow()
    .addClass("option")
    .setTextContent("저장하기(ZIP)")
    .onClick(async function () {
      // ZIP 저장만 허용, 취소 시 아무 동작 없음
      const saveMethod = confirm("ZIP 파일로 저장하시겠습니까?");
      if (saveMethod) {
        // ZIP 파일로 저장
        await saveAsZip();
      } else {
        // 취소
        return;
      }
    });

  options.add(option);

  // ZIP 파일로 저장하는 함수
  async function saveAsZip() {
    const loader = new ProgressiveLoader(editor);
    try {
      loader.createProgressUI();
      loader.totalItems = 3;
      loader.loadedItems = 0;
      document.querySelector('#progressive-loader-progress h3').textContent = '프로젝트 저장 중...';
      loader.updateProgress();

      // 1단계: 데이터 준비
      loader.loadedItems = 1;
      loader.updateProgress();
      document.getElementById('progress-detail').textContent = '데이터 준비 중...';

      // showSaveFilePicker를 사용자 제스처 내에서 즉시 실행
      if ("showSaveFilePicker" in window) {
        // 기본 파일명을 공연명으로 설정 (공연명이 있으면)
        let suggestedFileName = "project.zip";
        if (editor.project && editor.project.showName) {
          // 파일명에 사용할 수 없는 문자 제거 및 한글 지원
          const safeFileName = editor.project.showName
            .replace(/[<>:"/\\|?*]/g, '') // Windows 파일명 제한 문자 제거
            .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
            .trim();
          if (safeFileName) {
            suggestedFileName = `${safeFileName}.zip`;
          }
        }
        
        const handle = await window.showSaveFilePicker({
          suggestedName: suggestedFileName,
          types: [
            {
              description: "ZIP Files",
              accept: { "application/zip": [".zip"] },
            },
          ],
        });

        // 2단계: ZIP 파일 생성
        loader.loadedItems = 2;
        loader.updateProgress();
        document.getElementById('progress-detail').textContent = 'ZIP 파일 생성 중...';
        const zipBlob = await editor.toProjectZip("project", {
          splitTimeline: true,
          splitMusic: true,
          splitHistory: false
        });

        // 3단계: 파일 저장
        loader.loadedItems = 3;
        loader.updateProgress();
        document.getElementById('progress-detail').textContent = '파일 저장 중...';
        const writable = await handle.createWritable();
        await writable.write(zipBlob);
        await writable.close();
        console.log("ZIP 파일 저장 완료");

      } else {
        // 대체 방법
        loader.loadedItems = 2;
        loader.updateProgress();
        document.getElementById('progress-detail').textContent = 'ZIP 파일 생성 중...';
        const zipBlob = await editor.toProjectZip("project", {
          splitTimeline: true,
          splitMusic: true,
          splitHistory: false
        });

        loader.loadedItems = 3;
        loader.updateProgress();
        document.getElementById('progress-detail').textContent = '파일 저장 중...';
        
        // 기본 파일명을 공연명으로 설정 (공연명이 있으면)
        let defaultFileName = "project.zip";
        if (editor.project && editor.project.showName) {
          // 파일명에 사용할 수 없는 문자 제거 및 한글 지원
          const safeFileName = editor.project.showName
            .replace(/[<>:"/\\|?*]/g, '') // Windows 파일명 제한 문자 제거
            .replace(/\s+/g, '_') // 공백을 언더스코어로 변경
            .trim();
          if (safeFileName) {
            defaultFileName = `${safeFileName}.zip`;
          }
        }
        
        const fileName = prompt("파일 이름을 입력하세요:", defaultFileName);
        if (fileName) {
          const url = URL.createObjectURL(zipBlob);
          const link = document.createElement('a');
          link.href = url;
          link.download = fileName;
          link.style.display = 'none';
          document.body.appendChild(link);
          link.click();
          setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }, 100);
          console.log("ZIP 파일 저장 완료:", fileName);
        }
      }
      setTimeout(() => loader.hideProgressUI(), 700);
    } catch (error) {
      loader.hideProgressUI();
      console.error("ZIP 파일 저장 실패:", error);
      alert("ZIP 파일 저장 중 오류가 발생했습니다: " + error.message);
    }
  }

  // Save As
  // option = new UIRow()
  //   .addClass("option")
  //   .setTextContent(strings.getKey("menubar/file/saveAs"))
  //   .onClick(function () {
  //     const json = editor.toJSON();
  //     const blob = new Blob([JSON.stringify(json)], {
  //       type: "application/json",
  //     });

  //     // 파일 이름 입력 받기
  //     const fileName = prompt("Enter file name:", "project.json");
  //     if (fileName) {
  //       editor.utils.save(blob, fileName);
  //     }
  //   });

  // options.add(option);

  options.add(new UIHorizontalRule());
  // Import

  const form = document.createElement("form");
  form.style.display = "none";
  document.body.appendChild(form);

  const fileInput = document.createElement("input");
  fileInput.multiple = true;
  fileInput.type = "file";
  fileInput.addEventListener("change", function () {
    editor.loader.loadFiles(fileInput.files);
    form.reset();
  });
  form.appendChild(fileInput);

  option = new UIRow();
  option.setClass("option");
  option.setTextContent(strings.getKey("menubar/file/import"));
  option.onClick(function () {
    fileInput.click();
  });
  options.add(option);

  // Export

  const fileExportSubmenuTitle = new UIRow()
    .setTextContent(strings.getKey("menubar/file/export"))
    .addClass("option")
    .addClass("submenu-title");
  fileExportSubmenuTitle.onMouseOver(function () {
    const { top, right } = this.dom.getBoundingClientRect();
    const { paddingTop } = getComputedStyle(this.dom);
    fileExportSubmenu.setLeft(right + "px");
    fileExportSubmenu.setTop(top - parseFloat(paddingTop) + "px");
    fileExportSubmenu.setDisplay("block");
  });
  fileExportSubmenuTitle.onMouseOut(function () {
    fileExportSubmenu.setDisplay("none");
  });
  // options.add(fileExportSubmenuTitle);

  const fileExportSubmenu = new UIPanel()
    .setPosition("fixed")
    .addClass("options")
    .setDisplay("none");
  fileExportSubmenuTitle.add(fileExportSubmenu);

  // Export DRC

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("DRC");
  option.onClick(async function () {
    const object = editor.selected;

    if (object === null || object.isMesh === undefined) {
      alert(strings.getKey("prompt/file/export/noMeshSelected"));
      return;
    }

    const { DRACOExporter } = await import(
      "three/addons/exporters/DRACOExporter.js"
    );

    const exporter = new DRACOExporter();

    const options = {
      decodeSpeed: 5,
      encodeSpeed: 5,
      encoderMethod: DRACOExporter.MESH_EDGEBREAKER_ENCODING,
      quantization: [16, 8, 8, 8, 8],
      exportUvs: true,
      exportNormals: true,
      exportColor: object.geometry.hasAttribute("color"),
    };

    // TODO: Change to DRACOExporter's parse( geometry, onParse )?
    const result = exporter.parse(object, options);
    saveArrayBuffer(result, "model.drc");
  });
  fileExportSubmenu.add(option);

  // Export GLB

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("GLB");
  option.onClick(async function () {
    const scene = editor.scene;
    const animations = getAnimations(scene);

    const optimizedAnimations = [];

    for (const animation of animations) {
      optimizedAnimations.push(animation.clone().optimize());
    }

    const { GLTFExporter } = await import(
      "three/addons/exporters/GLTFExporter.js"
    );

    const exporter = new GLTFExporter();

    exporter.parse(
      scene,
      function (result) {
        saveArrayBuffer(result, "scene.glb");
      },
      undefined,
      { binary: true, animations: optimizedAnimations },
    );
  });
  fileExportSubmenu.add(option);

  // Export GLTF

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("GLTF");
  option.onClick(async function () {
    const scene = editor.scene;
    const animations = getAnimations(scene);

    const optimizedAnimations = [];

    for (const animation of animations) {
      optimizedAnimations.push(animation.clone().optimize());
    }

    const { GLTFExporter } = await import(
      "three/addons/exporters/GLTFExporter.js"
    );

    const exporter = new GLTFExporter();

    exporter.parse(
      scene,
      function (result) {
        saveString(JSON.stringify(result, null, 2), "scene.gltf");
      },
      undefined,
      { animations: optimizedAnimations },
    );
  });
  fileExportSubmenu.add(option);

  // Export OBJ

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("OBJ");
  option.onClick(async function () {
    const object = editor.selected;

    if (object === null) {
      alert(strings.getKey("prompt/file/export/noObjectSelected"));
      return;
    }

    const { OBJExporter } = await import(
      "three/addons/exporters/OBJExporter.js"
    );

    const exporter = new OBJExporter();

    saveString(exporter.parse(object), "model.obj");
  });
  fileExportSubmenu.add(option);

  // Export PLY (ASCII)

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("PLY");
  option.onClick(async function () {
    const { PLYExporter } = await import(
      "three/addons/exporters/PLYExporter.js"
    );

    const exporter = new PLYExporter();

    exporter.parse(editor.scene, function (result) {
      saveArrayBuffer(result, "model.ply");
    });
  });
  fileExportSubmenu.add(option);

  // Export PLY (BINARY)

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("PLY (BINARY)");
  option.onClick(async function () {
    const { PLYExporter } = await import(
      "three/addons/exporters/PLYExporter.js"
    );

    const exporter = new PLYExporter();

    exporter.parse(
      editor.scene,
      function (result) {
        saveArrayBuffer(result, "model-binary.ply");
      },
      { binary: true },
    );
  });
  fileExportSubmenu.add(option);

  // Export STL (ASCII)

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("STL");
  option.onClick(async function () {
    const { STLExporter } = await import(
      "three/addons/exporters/STLExporter.js"
    );

    const exporter = new STLExporter();

    saveString(exporter.parse(editor.scene), "model.stl");
  });
  fileExportSubmenu.add(option);

  // Export STL (BINARY)

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("STL (BINARY)");
  option.onClick(async function () {
    const { STLExporter } = await import(
      "three/addons/exporters/STLExporter.js"
    );

    const exporter = new STLExporter();

    saveArrayBuffer(
      exporter.parse(editor.scene, { binary: true }),
      "model-binary.stl",
    );
  });
  fileExportSubmenu.add(option);

  // Export USDZ

  option = new UIRow();
  option.setClass("option");
  option.setTextContent("USDZ");
  option.onClick(async function () {
    const { USDZExporter } = await import(
      "three/addons/exporters/USDZExporter.js"
    );

    const exporter = new USDZExporter();

    saveArrayBuffer(await exporter.parseAsync(editor.scene), "model.usdz");
  });
  fileExportSubmenu.add(option);

  // 렌더링/비디오추출 메뉴 추가
  option = new UIRow();
  option.setClass("option");
  option.setTextContent("렌더링/비디오추출");
  // 렌더링 시작 메뉴
  // 렌더링 시작 메뉴
  option.onClick(() => {
    // 에디터 객체 찾기
    let editor = null;

    if (this && this.editor) {
      editor = this.editor;
    } else if (window.editor) {
      editor = window.editor;
    } else if (typeof THREE !== 'undefined' && THREE.EDITOR) {
      editor = THREE.EDITOR;
    }

    if (!editor) {
      alert("에디터를 찾을 수 없습니다. 페이지를 새로고침해주세요.");
      return;
    }

    // Timeline.js의 rendering-btn 기능 연결
    if (editor.timeline && typeof editor.timeline.startTimelineRendering === 'function') {
      try {
        editor.timeline.startTimelineRendering();
      } catch (error) {
        alert("렌더링 시작 중 오류가 발생했습니다: " + error.message);
      }
    } else if (editor.renderTimeline && typeof editor.renderTimeline.openRenderWindow === 'function') {
      try {
        editor.renderTimeline.openRenderWindow();
      } catch (error) {
        alert("렌더링 창 열기 중 오류가 발생했습니다: " + error.message);
      }
    } else {
      alert("타임라인 렌더링 기능을 사용할 수 없습니다. 타임라인을 먼저 생성해주세요.");
    }
  });

  options.add(option);

  options.add( new UIHorizontalRule() );
  
   // 프로젝트 설정 메뉴
   const projectSetupButton = new UIRow();
   projectSetupButton.setClass("option button-style");
   projectSetupButton.setTextContent("프로젝트 설정");
   projectSetupButton.onClick(function () {
     const projectSetup = new ProjectSetup();
     projectSetup.showProjectSetupPopup(editor);
   });
   options.add(projectSetupButton);

  function getAnimations(scene) {
    const animations = [];

    scene.traverse(function (object) {
      animations.push(...object.animations);
    });

    return animations;
  }

  return container;
}

export { MenubarFile };