/**
 * 데이터 분리 저장 유틸리티 클래스
 * 큰 데이터를 여러 파일로 분리하여 저장/로드하는 기능 제공
 */
export class DataSplitter {

  /**
   * 프로젝트 데이터를 분리하여 저장
   * @param {Object} projectData - 전체 프로젝트 데이터
   * @param {Object} options - 저장 옵션
   * @returns {Object} 분리된 데이터 구조
   */
  static splitProjectData(projectData, options = {}) {
    console.log("=== 프로젝트 데이터 분리 시작 ===");

    const {
      splitTimeline = true,
      splitMusic = true,
      splitHistory = false,
      forceSplit = false,
      timelineFileName = "timeline_data.json",
      musicFileName = "music_data.json",
      historyFileName = "history_data.json"
    } = options;

    const baseData = { ...projectData };
    const splitFiles = {};

    // 1. MotionTimeline 데이터 분리
    if (splitTimeline && baseData.motionTimeline) {
      console.log("MotionTimeline 데이터 분리 중...");
      splitFiles[timelineFileName] = baseData.motionTimeline;
      baseData.motionTimeline = null; // 참조만 남김
      baseData.motionTimelineFile = timelineFileName;
      console.log("MotionTimeline 데이터 분리 완료");
    }

    // 2. 음악 데이터 분리
    if (splitMusic && baseData.music) {
      console.log("음악 데이터 분리 중...");
      splitFiles[musicFileName] = baseData.music;
      baseData.music = null; // 참조만 남김
      baseData.musicFile = musicFileName;
      console.log("음악 데이터 분리 완료");
    }

    // 3. 히스토리 데이터 분리 (선택적)
    if (splitHistory && baseData.history) {
      console.log("히스토리 데이터 분리 중...");
      splitFiles[historyFileName] = baseData.history;
      baseData.history = null; // 참조만 남김
      baseData.historyFile = historyFileName;
      console.log("히스토리 데이터 분리 완료");
    }

    // 4. 씬 데이터에서 큰 geometry 데이터 분리
    if (baseData.scene) {
      const sceneSplitResult = this.splitSceneData(baseData.scene, forceSplit);
      if (sceneSplitResult.splitFiles) {
        Object.assign(splitFiles, sceneSplitResult.splitFiles);
        baseData.scene = sceneSplitResult.baseScene;
      }
    }

    const result = {
      baseData,
      splitFiles,
      fileReferences: Object.keys(splitFiles)
    };

    console.log("분리된 파일 수:", result.fileReferences.length);
    console.log("분리된 파일들:", result.fileReferences);
    console.log("=== 프로젝트 데이터 분리 완료 ===");

    return result;
  }

  /**
   * 씬 데이터에서 큰 geometry 데이터 분리
   * @param {Object} sceneData - 씬 데이터
   * @param {boolean} forceSplit - 강제 분리 여부
   * @returns {Object} 분리 결과
   */
  static splitSceneData(sceneData, forceSplit = false) {
    const splitFiles = {};
    const baseScene = { ...sceneData };

    // children 데이터가 너무 큰 경우 분리
    if (baseScene.children && Array.isArray(baseScene.children)) {
      try {
        const childrenSize = JSON.stringify(baseScene.children).length;
        console.log("children 데이터 크기:", childrenSize, "bytes");

        // children 데이터가 1MB 이상이거나 강제 분리가 설정된 경우 분리
        if (childrenSize > 1000000 || forceSplit) {
          console.log("children 데이터가 너무 큽니다. 분리합니다.");
          const childrenFileName = `scene_children_${Date.now()}.json`;
          splitFiles[childrenFileName] = baseScene.children;

          // 참조만 남김
          baseScene.children = null;
          baseScene.childrenFile = childrenFileName;
          console.log("children 데이터 분리 완료:", childrenFileName);
        } else {
          // geometry 데이터가 큰 객체들을 분리
          baseScene.children = baseScene.children.map((child, index) => {
            if (this.isLargeGeometry(child)) {
              const fileName = `geometry_${child.uuid || index}.json`;
              splitFiles[fileName] = child;

              // 참조만 남김
              return {
                ...child,
                geometry: null,
                material: null,
                geometryFile: fileName
              };
            }
            return child;
          });
        }
      } catch (error) {
        console.warn("children 데이터 크기 측정 실패, 강제 분리:", error);
        // 오류 발생 시 강제 분리
        const childrenFileName = `scene_children_${Date.now()}.json`;
        splitFiles[childrenFileName] = baseScene.children;
        baseScene.children = null;
        baseScene.childrenFile = childrenFileName;
        console.log("오류로 인한 children 데이터 강제 분리 완료:", childrenFileName);
      }
    }

    return {
      baseScene,
      splitFiles: Object.keys(splitFiles).length > 0 ? splitFiles : null
    };
  }

  /**
   * geometry가 큰지 판단
   * @param {Object} object - 객체
   * @returns {boolean} 큰 geometry 여부
   */
  static isLargeGeometry(object) {
    if (!object.geometry) return false;

    // 정점 수가 1000개 이상이거나
    if (object.geometry.attributes.position &&
      object.geometry.attributes.position.count > 1000) {
      return true;
    }

    // JSON 크기가 50KB 이상이면
    const geometrySize = JSON.stringify(object.geometry).length;
    if (geometrySize > 50000) {
      return true;
    }

    return false;
  }

  /**
   * 분리된 데이터를 하나의 ZIP 파일로 압축
   * @param {Object} splitResult - 분리된 데이터
   * @param {string} projectName - 프로젝트 이름
   * @returns {Promise<Blob>} ZIP 파일
   */
  static async createProjectZip(splitResult, projectName = "project") {
    console.log("=== ZIP 파일 생성 시작 ===");

    try {
      // JSZip 라이브러리 동적 로드
      const JSZip = await this.loadJSZip();
      const zip = new JSZip();

      // 1. 기본 프로젝트 데이터 추가 (안전한 JSON.stringify)
      try {
        const projectJson = JSON.stringify(splitResult.baseData, null, 0);
        zip.file("project.json", projectJson);
        console.log("project.json 크기:", projectJson.length, "bytes");
      } catch (error) {
        console.error("project.json 생성 실패:", error);
        throw new Error("프로젝트 데이터가 너무 커서 저장할 수 없습니다.");
      }

      // 2. 분리된 파일들 추가 (안전한 JSON.stringify)
      for (const [fileName, fileData] of Object.entries(splitResult.splitFiles)) {
        try {
          const fileJson = JSON.stringify(fileData, null, 0);
          zip.file(fileName, fileJson);
          console.log(`${fileName} 크기:`, fileJson.length, "bytes");
        } catch (error) {
          console.error(`${fileName} 생성 실패:`, error);
          throw new Error(`${fileName} 파일이 너무 커서 저장할 수 없습니다.`);
        }
      }

      // 3. 프로젝트 정보 파일 추가
      const projectInfo = {
        version: "1.0",
        projectName,
        createdAt: new Date().toISOString(),
        files: splitResult.fileReferences,
        totalFiles: splitResult.fileReferences.length + 1 // +1 for project.json
      };
      zip.file("project_info.json", JSON.stringify(projectInfo, null, 0));

      // 4. ZIP 파일 생성
      const zipBlob = await zip.generateAsync({
        type: "blob",
        compression: "DEFLATE",
        compressionOptions: { level: 9 }
      });

      console.log("ZIP 파일 생성 완료:", zipBlob.size, "bytes");
      console.log("=== ZIP 파일 생성 완료 ===");

      return zipBlob;

    } catch (error) {
      console.error("ZIP 파일 생성 실패:", error);
      throw error;
    }
  }

  /**
   * ZIP 파일에서 분리된 데이터 로드
   * @param {Blob} zipBlob - ZIP 파일
   * @returns {Promise<Object>} 로드된 데이터
   */
  static async loadFromProjectZip(zipBlob) {
    console.log("=== ZIP 파일에서 데이터 로드 시작 ===");

    try {
      const JSZip = await this.loadJSZip();
      const zip = await JSZip.loadAsync(zipBlob);

      console.log("ZIP 파일 내용:", Object.keys(zip.files));

      // 1. 프로젝트 정보 확인
      const projectInfo = zip.file("project_info.json");
      if (projectInfo) {
        const info = JSON.parse(await projectInfo.async("string"));
        console.log("프로젝트 정보:", info);
      } else {
        console.warn("project_info.json 파일을 찾을 수 없습니다.");
      }

      // 2. 기본 프로젝트 데이터 로드
      const projectFile = zip.file("project.json");
      if (!projectFile) {
        throw new Error("project.json 파일을 찾을 수 없습니다.");
      }

      const baseData = JSON.parse(await projectFile.async("string"));
      console.log("기본 데이터 로드 완료:", Object.keys(baseData));
      console.log("baseData.scene 존재:", !!baseData.scene);

      // 3. 분리된 파일들 로드
      const splitFiles = {};
      for (const fileName of Object.keys(zip.files)) {
        if (fileName !== "project.json" && fileName !== "project_info.json" && !fileName.endsWith('/')) {
          const fileData = zip.file(fileName);
          if (fileData) {
            try {
              splitFiles[fileName] = JSON.parse(await fileData.async("string"));
              console.log(`분리된 파일 로드 완료: ${fileName}`);
            } catch (parseError) {
              console.error(`파일 파싱 실패: ${fileName}`, parseError);
            }
          }
        }
      }

      console.log("분리된 파일들:", Object.keys(splitFiles));

      // 4. 분리된 데이터를 기본 데이터에 병합
      const mergedData = await this.mergeSplitData(baseData, splitFiles);
      console.log("병합된 데이터:", Object.keys(mergedData));
      console.log("mergedData.scene 존재:", !!mergedData.scene);

      console.log("ZIP 파일에서 데이터 로드 완료");
      console.log("=== ZIP 파일에서 데이터 로드 완료 ===");

      return mergedData;

    } catch (error) {
      console.error("ZIP 파일에서 데이터 로드 실패:", error);
      throw error;
    }
  }

  /**
   * 분리된 데이터를 기본 데이터에 병합
   * @param {Object} baseData - 기본 데이터
   * @param {Object} splitFiles - 분리된 파일들
   * @returns {Object} 병합된 데이터
   */
  static async mergeSplitData(baseData, splitFiles) {
    console.log("=== mergeSplitData 시작 ===");
    console.log("baseData 키:", Object.keys(baseData));
    console.log("splitFiles 키:", Object.keys(splitFiles));

    // DataCompressor 로드
    const { DataCompressor } = await import('./DataCompressor.js');

    // baseData는 이미 압축 해제된 데이터이므로 그대로 사용
    const mergedData = { ...baseData };

    // 1. MotionTimeline 데이터 병합
    if (baseData.motionTimelineFile && splitFiles[baseData.motionTimelineFile]) {
      console.log("MotionTimeline 데이터 병합:", baseData.motionTimelineFile);
      mergedData.motionTimeline = splitFiles[baseData.motionTimelineFile];
      delete mergedData.motionTimelineFile;

      // MotionTimeline 데이터 압축 해제 (압축된 데이터만)
      try {
        console.log("MotionTimeline 데이터 확인 중...");
        console.log("MotionTimeline 데이터:", mergedData.motionTimeline);

        // 압축된 데이터인지 확인 (t, f, tracks 구조를 가지고 있는지)
        if (mergedData.motionTimeline.t && mergedData.motionTimeline.f && mergedData.motionTimeline.tracks) {
          console.log("압축된 MotionTimeline 데이터 해제 중...");
          mergedData.motionTimeline = DataCompressor.decompressTimelineData(mergedData.motionTimeline);
          console.log("MotionTimeline 데이터 압축 해제 완료");
        } else {
          console.log("압축되지 않은 MotionTimeline 데이터, 그대로 사용");
        }
      } catch (error) {
        console.warn("MotionTimeline 데이터 처리 실패:", error);
      }
    }

    // 2. 음악 데이터 병합
    if (baseData.musicFile && splitFiles[baseData.musicFile]) {
      mergedData.music = splitFiles[baseData.musicFile];
      delete mergedData.musicFile;
    }

    // 3. 히스토리 데이터 병합
    if (baseData.historyFile && splitFiles[baseData.historyFile]) {
      mergedData.history = splitFiles[baseData.historyFile];
      delete mergedData.historyFile;
    }

    // 4. 씬 데이터의 children 파일 병합
    if (mergedData.scene && mergedData.scene.childrenFile && splitFiles[mergedData.scene.childrenFile]) {
      console.log("children 데이터 복원 중:", mergedData.scene.childrenFile);
      mergedData.scene.children = splitFiles[mergedData.scene.childrenFile];
      delete mergedData.scene.childrenFile;
      console.log("children 데이터 복원 완료");
    }

    // 5. 씬 데이터의 개별 children 파일들 병합 (새로운 방식)
    console.log("largeChildrenFiles 조건 확인:");
    console.log("mergedData.scene 존재:", !!mergedData.scene);
    console.log("mergedData.scene.object 존재:", !!mergedData.scene?.object);
    console.log("mergedData.scene.object.largeChildrenFiles 존재:", !!mergedData.scene?.object?.largeChildrenFiles);
    console.log("mergedData.scene.object.largeChildrenFiles 타입:", typeof mergedData.scene?.object?.largeChildrenFiles);
    console.log("mergedData.scene.object.largeChildrenFiles 배열 여부:", Array.isArray(mergedData.scene?.object?.largeChildrenFiles));
    console.log("mergedData.scene.object.largeChildrenFiles 값:", mergedData.scene?.object?.largeChildrenFiles);

    if (mergedData.scene && mergedData.scene.object && mergedData.scene.object.largeChildrenFiles && Array.isArray(mergedData.scene.object.largeChildrenFiles)) {
      console.log("개별 children 파일들 복원 중:", mergedData.scene.object.largeChildrenFiles);
      const obj = mergedData.scene.object;
      const largeList = obj.largeChildrenFiles;
      const inlineSlots = obj.inlineChildSlots;

      let allChildren;

      if (inlineSlots && typeof inlineSlots === 'object') {
        let maxI = -1;
        largeList.forEach((fn) => {
          const m = String(fn).match(/scene_child_\d+_(\d+)\.json/);
          if (m) maxI = Math.max(maxI, parseInt(m[1], 10));
        });
        Object.keys(inlineSlots).forEach((k) => {
          const n = parseInt(k, 10);
          if (!Number.isNaN(n)) maxI = Math.max(maxI, n);
        });
        const N = typeof obj.sceneChildCount === 'number' && obj.sceneChildCount > 0
          ? obj.sceneChildCount
          : maxI + 1;
        allChildren = new Array(N).fill(null);
        Object.entries(inlineSlots).forEach(([k, data]) => {
          const i = parseInt(k, 10);
          if (!Number.isNaN(i) && i >= 0 && i < N) allChildren[i] = data;
        });
        console.log(`inlineChildSlots 복원: N=${N}`);
      } else {
        if (!obj.children) obj.children = [];
        allChildren = [...obj.children];
        console.log("레거시 병합(작은 children 연속 배열):", allChildren.length);
      }

      for (const fileName of largeList) {
        const match = String(fileName).match(/scene_child_\d+_(\d+)\.json/);
        if (match) {
          const index = parseInt(match[1], 10);
          let foundFile = splitFiles[fileName];
          if (!foundFile) {
            const matchingFiles = Object.keys(splitFiles).filter((key) => {
              const keyMatch = key.match(/scene_child_\d+_(\d+)\.json/);
              return keyMatch && parseInt(keyMatch[1], 10) === index;
            });
            if (matchingFiles.length > 0) foundFile = splitFiles[matchingFiles[0]];
          }
          if (foundFile) {
            while (allChildren.length <= index) allChildren.push(null);
            allChildren[index] = foundFile;
          } else {
            console.warn(`인덱스 ${index} 파일 없음: ${fileName}`);
          }
        } else if (splitFiles[fileName]) {
          allChildren.push(splitFiles[fileName]);
        }
      }

      const nulls = allChildren.filter((c) => c === null).length;
      if (nulls > 0) console.warn(`children 병합 후 빈 슬롯 ${nulls}개`);
      mergedData.scene.object.children = allChildren.filter((c) => c !== null);
      delete mergedData.scene.object.largeChildrenFiles;
      delete mergedData.scene.object.inlineChildSlots;
      delete mergedData.scene.object.sceneChildCount;
      console.log("최종 children:", mergedData.scene.object.children.length);
    }

    // 6. 씬 데이터의 geometry 파일들 병합
    if (mergedData.scene && mergedData.scene.children) {
      mergedData.scene.children = mergedData.scene.children.map(child => {
        if (child.geometryFile && splitFiles[child.geometryFile]) {
          const geometryData = splitFiles[child.geometryFile];
          return {
            ...child,
            geometry: geometryData.geometry,
            material: geometryData.material,
            // geometryFile 속성은 제거
          };
        }
        return child;
      });
    }

    // 씬 데이터에 animations 속성 보장
    if (mergedData.scene && !mergedData.scene.animations) {
      mergedData.scene.animations = [];
    }

    return mergedData;
  }

  /**
   * JSZip 라이브러리 동적 로드
   * @returns {Promise<Object>} JSZip 클래스
   */
  static async loadJSZip() {
    try {
      // 먼저 전역 JSZip 확인
      if (typeof JSZip !== 'undefined') {
        return JSZip;
      }

      // 동적 import 시도
      const { default: JSZip } = await import('jszip');
      return JSZip;
    } catch (error) {
      console.warn("JSZip 라이브러리를 찾을 수 없습니다. CDN에서 로드합니다.");

      // CDN에서 로드
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';
        script.onload = () => resolve(JSZip);
        script.onerror = () => reject(new Error('JSZip 로드 실패'));
        document.head.appendChild(script);
      });
    }
  }

  /**
   * 분리 저장 방식의 장점 설명
   * @returns {Object} 장점 정보
   */
  static getBenefits() {
    return {
      storage: "파일 크기 60-80% 감소",
      loading: "점진적 로딩으로 초기 로딩 속도 개선",
      sharing: "필요한 데이터만 공유 가능",
      backup: "개별 파일 백업 및 복원 가능",
      versioning: "파일별 버전 관리 가능"
    };
  }
} 