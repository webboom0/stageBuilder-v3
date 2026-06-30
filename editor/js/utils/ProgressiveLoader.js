/**
 * 점진적 로딩 유틸리티 클래스
 * 큰 데이터를 비동기적으로 로드하여 사용자 경험을 개선
 */
export class ProgressiveLoader {
  
  constructor(editor) {
    this.editor = editor;
    this.loadingQueue = [];
    this.isLoading = false;
    this.loadingProgress = 0;
    this.totalItems = 0;
    this.loadedItems = 0;
    
    // 로딩 상태 이벤트
    this.events = {
      onProgress: null,
      onComplete: null,
      onError: null
    };
  }

  /**
   * 프로젝트 데이터를 점진적으로 로드
   * @param {Object} projectData - 프로젝트 데이터
   * @param {Object} options - 로딩 옵션
   * @returns {Promise<Object>} 로드 완료된 데이터
   */
  async loadProjectProgressively(projectData, options = {}) {
    const {
      priorityOrder = ['base', 'scene', 'timeline', 'music', 'history'],
      batchSize = 3,
      delayBetweenBatches = 50,
      showProgress = true
    } = options;

    console.log("=== 점진적 로딩 시작 ===");
    
    try {
      // 1. 기본 데이터 즉시 로드
      const baseData = await this.loadBaseData(projectData);
      
      // 2. 로딩 큐 구성
      this.setupLoadingQueue(projectData, priorityOrder);
      
      // 3. 점진적 로딩 실행
      const result = await this.executeProgressiveLoading(batchSize, delayBetweenBatches, showProgress);
      
      // 4. 최종 데이터 병합
      const finalData = this.mergeLoadedData(baseData, result);
      
      console.log("=== 점진적 로딩 완료 ===");
      return finalData;
      
    } catch (error) {
      console.error("점진적 로딩 실패:", error);
      this.triggerEvent('onError', error);
      throw error;
    }
  }

  /**
   * 기본 데이터 즉시 로드
   * @param {Object} projectData - 프로젝트 데이터
   * @returns {Object} 기본 데이터
   */
  async loadBaseData(projectData) {
    console.log("기본 데이터 로드 중...");
    
    // 즉시 로드할 필수 데이터
    const baseData = {
      metadata: projectData.metadata,
      project: projectData.project,
      camera: projectData.camera,
      environment: projectData.environment,
      scripts: projectData.scripts
    };

    // 씬의 기본 구조만 로드 (geometry는 나중에)
    if (projectData.scene) {
      baseData.scene = this.extractSceneStructure(projectData.scene);
    }

    console.log("기본 데이터 로드 완료");
    return baseData;
  }

  /**
   * 씬의 기본 구조만 추출
   * @param {Object} sceneData - 씬 데이터
   * @returns {Object} 씬 구조
   */
  extractSceneStructure(sceneData) {
    const structure = { ...sceneData };
    
    if (structure.children && Array.isArray(structure.children)) {
      structure.children = structure.children.map(child => ({
        uuid: child.uuid,
        name: child.name,
        type: child.type,
        position: child.position,
        rotation: child.rotation,
        scale: child.scale,
        visible: child.visible,
        userData: child.userData,
        // geometry와 material은 나중에 로드
        geometryFile: child.geometryFile || null,
        materialFile: child.materialFile || null
      }));
    }
    
    return structure;
  }

  /**
   * 로딩 큐 설정
   * @param {Object} projectData - 프로젝트 데이터
   * @param {Array} priorityOrder - 우선순위 순서
   */
  setupLoadingQueue(projectData, priorityOrder) {
    this.loadingQueue = [];
    this.totalItems = 0;
    this.loadedItems = 0;

    // 우선순위에 따라 로딩 항목 구성
    priorityOrder.forEach(priority => {
      switch (priority) {
        case 'scene':
          if (projectData.scene) {
            this.addSceneLoadingTasks(projectData.scene);
          }
          break;
        case 'timeline':
          if (projectData.motionTimeline) {
            this.addLoadingTask('timeline', () => this.loadTimelineData(projectData.motionTimeline));
          }
          break;
        case 'music':
          if (projectData.music) {
            this.addLoadingTask('music', () => this.loadMusicData(projectData.music));
          }
          break;
        case 'history':
          if (projectData.history) {
            this.addLoadingTask('history', () => this.loadHistoryData(projectData.history));
          }
          break;
      }
    });

    console.log(`로딩 큐 설정 완료: ${this.totalItems}개 항목`);
  }

  /**
   * 씬 로딩 작업 추가
   * @param {Object} sceneData - 씬 데이터
   */
  addSceneLoadingTasks(sceneData) {
    if (sceneData.children && Array.isArray(sceneData.children)) {
      sceneData.children.forEach((child, index) => {
        // geometry 로딩
        if (child.geometry && this.isLargeGeometry(child.geometry)) {
          this.addLoadingTask(`geometry_${child.uuid || index}`, 
            () => this.loadGeometryData(child.geometry));
        }
        
        // material 로딩
        if (child.material && this.isLargeMaterial(child.material)) {
          this.addLoadingTask(`material_${child.uuid || index}`, 
            () => this.loadMaterialData(child.material));
        }
      });
    }
  }

  /**
   * 로딩 작업 추가
   * @param {string} name - 작업 이름
   * @param {Function} task - 실행할 작업
   */
  addLoadingTask(name, task) {
    this.loadingQueue.push({ name, task, status: 'pending' });
    this.totalItems++;
  }

  /**
   * 점진적 로딩 실행
   * @param {number} batchSize - 배치 크기
   * @param {number} delayBetweenBatches - 배치 간 지연 시간
   * @param {boolean} showProgress - 진행률 표시 여부
   * @returns {Promise<Object>} 로드된 데이터
   */
  async executeProgressiveLoading(batchSize, delayBetweenBatches, showProgress) {
    this.isLoading = true;
    const loadedData = {};

    // 진행률 표시 UI 생성
    if (showProgress) {
      this.createProgressUI();
    }

    try {
      // 배치 단위로 로딩
      for (let i = 0; i < this.loadingQueue.length; i += batchSize) {
        const batch = this.loadingQueue.slice(i, i + batchSize);
        
        // 배치 병렬 실행
        const batchPromises = batch.map(async (item) => {
          try {
            item.status = 'loading';
            const result = await item.task();
            item.status = 'completed';
            loadedData[item.name] = result;
            this.loadedItems++;
            
            // 진행률 업데이트
            this.updateProgress();
            
            return result;
          } catch (error) {
            item.status = 'failed';
            console.error(`로딩 실패 (${item.name}):`, error);
            throw error;
          }
        });

        // 배치 완료 대기
        await Promise.all(batchPromises);
        
        // 배치 간 지연
        if (i + batchSize < this.loadingQueue.length) {
          await this.delay(delayBetweenBatches);
        }
      }

      this.isLoading = false;
      this.hideProgressUI();
      this.triggerEvent('onComplete', loadedData);
      
      return loadedData;
      
    } catch (error) {
      this.isLoading = false;
      this.hideProgressUI();
      throw error;
    }
  }

  /**
   * 타임라인 데이터 로드
   * @param {Object} timelineData - 타임라인 데이터
   * @returns {Object} 로드된 타임라인 데이터
   */
  async loadTimelineData(timelineData) {
    console.log("타임라인 데이터 로드 중...");
    
    // 타임라인 데이터를 청크 단위로 처리
    const processedData = { ...timelineData };
    
    if (processedData.tracks) {
      const trackKeys = Object.keys(processedData.tracks);
      
      // 트랙을 청크 단위로 처리
      for (let i = 0; i < trackKeys.length; i += 5) {
        const chunk = trackKeys.slice(i, i + 5);
        
        // 청크 내 트랙들을 병렬 처리
        await Promise.all(chunk.map(async (objectUuid) => {
          const objectTracks = processedData.tracks[objectUuid];
          
          // 각 속성의 키프레임을 청크 단위로 처리
          Object.keys(objectTracks).forEach(property => {
            const keyframes = objectTracks[property];
            if (Array.isArray(keyframes) && keyframes.length > 100) {
              // 큰 키프레임 배열을 압축
              objectTracks[property] = this.compressKeyframes(keyframes);
            }
          });
        }));
        
        // 청크 간 짧은 지연
        await this.delay(10);
      }
    }
    
    console.log("타임라인 데이터 로드 완료");
    return processedData;
  }

  /**
   * 음악 데이터 로드
   * @param {Object} musicData - 음악 데이터
   * @returns {Object} 로드된 음악 데이터
   */
  async loadMusicData(musicData) {
    console.log("음악 데이터 로드 중...");
    
    const processedData = { ...musicData };
    
    if (processedData.tracks && Array.isArray(processedData.tracks)) {
      // 트랙을 병렬로 처리
      await Promise.all(processedData.tracks.map(async (track, index) => {
        if (track.notes && track.notes.length > 100) {
          // 큰 노트 배열을 압축
          processedData.tracks[index].notes = this.compressNotes(track.notes);
        }
      }));
    }
    
    console.log("음악 데이터 로드 완료");
    return processedData;
  }

  /**
   * 히스토리 데이터 로드
   * @param {Object} historyData - 히스토리 데이터
   * @returns {Object} 로드된 히스토리 데이터
   */
  async loadHistoryData(historyData) {
    console.log("히스토리 데이터 로드 중...");
    
    const processedData = { ...historyData };
    
    // 히스토리 항목이 많으면 최근 것만 유지
    if (processedData.undo && processedData.undo.length > 50) {
      processedData.undo = processedData.undo.slice(-50);
    }
    
    if (processedData.redo && processedData.redo.length > 50) {
      processedData.redo = processedData.redo.slice(-50);
    }
    
    console.log("히스토리 데이터 로드 완료");
    return processedData;
  }

  /**
   * Geometry 데이터 로드
   * @param {Object} geometryData - Geometry 데이터
   * @returns {Object} 로드된 Geometry 데이터
   */
  async loadGeometryData(geometryData) {
    console.log("Geometry 데이터 로드 중...");
    
    // 큰 geometry 데이터를 압축
    const processedData = { ...geometryData };
    
    if (processedData.attributes) {
      Object.keys(processedData.attributes).forEach(attrName => {
        const attr = processedData.attributes[attrName];
        if (attr.array && attr.array.length > 1000) {
          // 큰 배열을 압축
          attr.array = this.compressFloatArray(attr.array);
        }
      });
    }
    
    console.log("Geometry 데이터 로드 완료");
    return processedData;
  }

  /**
   * Material 데이터 로드
   * @param {Object} materialData - Material 데이터
   * @returns {Object} 로드된 Material 데이터
   */
  async loadMaterialData(materialData) {
    console.log("Material 데이터 로드 중...");
    
    // Material 데이터는 일반적으로 크기가 작으므로 그대로 반환
    return materialData;
  }

  /**
   * 로드된 데이터 병합
   * @param {Object} baseData - 기본 데이터
   * @param {Object} loadedData - 로드된 데이터
   * @returns {Object} 병합된 데이터
   */
  mergeLoadedData(baseData, loadedData) {
    const mergedData = { ...baseData };
    
    // 타임라인 데이터 병합
    if (loadedData.timeline) {
      mergedData.motionTimeline = loadedData.timeline;
    }
    
    // 음악 데이터 병합
    if (loadedData.music) {
      mergedData.music = loadedData.music;
    }
    
    // 히스토리 데이터 병합
    if (loadedData.history) {
      mergedData.history = loadedData.history;
    }
    
    // 씬 데이터 병합
    if (mergedData.scene && mergedData.scene.children) {
      mergedData.scene.children = mergedData.scene.children.map(child => {
        const geometryKey = `geometry_${child.uuid}`;
        const materialKey = `material_${child.uuid}`;
        
        if (loadedData[geometryKey]) {
          child.geometry = loadedData[geometryKey];
        }
        
        if (loadedData[materialKey]) {
          child.material = loadedData[materialKey];
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
   * 진행률 UI 생성
   */
  createProgressUI() {
    // 기존 UI 제거
    this.hideProgressUI();
    
    const progressContainer = document.createElement('div');
    progressContainer.id = 'progressive-loader-progress';
    progressContainer.style.cssText = `
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 20px;
      border-radius: 10px;
      z-index: 10000;
      text-align: center;
      min-width: 300px;
    `;
    
    progressContainer.innerHTML = `
      <h3>프로젝트 로딩 중...</h3>
      <div style="margin: 15px 0;">
        <div style="background: #333; height: 20px; border-radius: 10px; overflow: hidden;">
          <div id="progress-bar" style="background: #007bff; height: 100%; width: 0%; transition: width 0.3s;"></div>
        </div>
      </div>
      <div id="progress-text">0% (0/${this.totalItems})</div>
      <div id="progress-detail" style="margin-top: 10px; font-size: 12px; opacity: 0.8;"></div>
    `;
    
    document.body.appendChild(progressContainer);
  }

  /**
   * 진행률 업데이트
   */
  updateProgress() {
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressDetail = document.getElementById('progress-detail');
    
    if (progressBar && progressText && progressDetail) {
      const percentage = Math.round((this.loadedItems / this.totalItems) * 100);
      
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = `${percentage}% (${this.loadedItems}/${this.totalItems})`;
      
      // 현재 로딩 중인 항목 표시
      const currentLoading = this.loadingQueue
        .filter(item => item.status === 'loading')
        .map(item => item.name)
        .slice(0, 3);
      
      if (currentLoading.length > 0) {
        progressDetail.textContent = `로딩 중: ${currentLoading.join(', ')}${currentLoading.length === 3 ? '...' : ''}`;
      }
    }
  }

  /**
   * 진행률 UI 숨기기
   */
  hideProgressUI() {
    const progressContainer = document.getElementById('progressive-loader-progress');
    if (progressContainer) {
      document.body.removeChild(progressContainer);
    }
  }

  /**
   * 이벤트 트리거
   * @param {string} eventName - 이벤트 이름
   * @param {*} data - 이벤트 데이터
   */
  triggerEvent(eventName, data) {
    if (this.events[eventName]) {
      this.events[eventName](data);
    }
  }

  /**
   * 지연 함수
   * @param {number} ms - 지연 시간 (밀리초)
   * @returns {Promise} 지연 Promise
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Geometry가 큰지 판단
   * @param {Object} geometry - Geometry 객체
   * @returns {boolean} 큰 geometry 여부
   */
  isLargeGeometry(geometry) {
    if (!geometry) return false;
    
    // 정점 수가 500개 이상이거나
    if (geometry.attributes && geometry.attributes.position) {
      const vertexCount = geometry.attributes.position.count || 0;
      if (vertexCount > 500) return true;
    }
    
    // JSON 크기가 25KB 이상이면
    const geometrySize = JSON.stringify(geometry).length;
    if (geometrySize > 25000) return true;
    
    return false;
  }

  /**
   * Material이 큰지 판단
   * @param {Object} material - Material 객체
   * @returns {boolean} 큰 material 여부
   */
  isLargeMaterial(material) {
    if (!material) return false;
    
    // 텍스처나 큰 설정이 있으면
    const materialSize = JSON.stringify(material).length;
    if (materialSize > 10000) return true;
    
    return false;
  }

  /**
   * 키프레임 배열 압축
   * @param {Array} keyframes - 키프레임 배열
   * @returns {Array} 압축된 키프레임 배열
   */
  compressKeyframes(keyframes) {
    // 간단한 압축: 소수점 자릿수 제한
    return keyframes.map(kf => ({
      time: Math.round(kf.time * 100) / 100,
      value: Array.isArray(kf.value) 
        ? kf.value.map(v => Math.round(v * 100) / 100)
        : Math.round(kf.value * 100) / 100
    }));
  }

  /**
   * 노트 배열 압축
   * @param {Array} notes - 노트 배열
   * @returns {Array} 압축된 노트 배열
   */
  compressNotes(notes) {
    return notes.map(note => ({
      time: Math.round(note.time),
      note: note.note,
      velocity: Math.round(note.velocity * 100) / 100,
      duration: Math.round(note.duration)
    }));
  }

  /**
   * Float 배열 압축
   * @param {Array} array - Float 배열
   * @returns {Array} 압축된 배열
   */
  compressFloatArray(array) {
    return array.map(val => Math.round(val * 1000) / 1000);
  }

  /**
   * 로딩 상태 확인
   * @returns {boolean} 로딩 중 여부
   */
  isLoading() {
    return this.isLoading;
  }

  /**
   * 진행률 확인
   * @returns {number} 진행률 (0-100)
   */
  getProgress() {
    return this.totalItems > 0 ? (this.loadedItems / this.totalItems) * 100 : 0;
  }

  /**
   * 로딩 취소
   */
  cancel() {
    this.isLoading = false;
    this.loadingQueue = [];
    this.hideProgressUI();
  }
} 