/**
 * 데이터 압축 유틸리티 클래스
 * JSON 파일 용량을 줄이기 위한 압축/해제 기능 제공
 */
export class DataCompressor {

  /**
   * MotionTimeline 데이터 압축
   * @param {Object} timelineData - 원본 타임라인 데이터
   * @returns {Object} 압축된 데이터
   */
  static compressTimelineData(timelineData) {
    if (!timelineData || !timelineData.tracks) {
      console.warn("압축할 타임라인 데이터가 없습니다.");
      return null;
    }

    console.log("=== 타임라인 데이터 압축 시작 ===");
    console.log("원본 데이터 크기:", JSON.stringify(timelineData).length, "bytes");

    const compressed = {
      t: timelineData.maxTime || 0,
      f: timelineData.frameRate || 30,
      tracks: {} // tracks
    };

    // 트랙 데이터 압축
    Object.entries(timelineData.tracks).forEach(([objectUuid, objectTracks]) => {
      console.log(`압축 중 객체 ${objectUuid}:`, objectTracks);
      compressed.tracks[objectUuid] = {};
      Object.entries(objectTracks).forEach(([property, trackData]) => {
        console.log(`압축 중 속성 ${property}:`, trackData);

        // times 배열이 있으면 키프레임 개수로 사용
        const keyframeCount = trackData.times ? trackData.times.length : 0;
        console.log(`키프레임 개수: ${keyframeCount}`);

        if (keyframeCount === 0) {
          console.log(`빈 트랙 건너뛰기: ${objectUuid}.${property}`);
          return; // 빈 트랙은 건너뛰기
        }

        // 배열 데이터 추출
        const times = trackData.times.slice(0, keyframeCount);
        const values = trackData.values.slice(0, keyframeCount * 3);
        const interpolations = trackData.interpolations.slice(0, keyframeCount);

        console.log(`압축할 데이터 - times:`, times);
        console.log(`압축할 데이터 - values:`, values);
        console.log(`압축할 데이터 - interpolations:`, interpolations);

        // 숫자 배열을 문자열로 압축 (소수점 자릿수 제한)
        compressed.tracks[objectUuid][property] = {
          t: this.compressNumberArray(times, 3), // 시간은 소수점 3자리
          v: this.compressNumberArray(values, 2), // 값은 소수점 2자리
          i: interpolations.join(',') // 보간 타입은 정수
        };

        console.log(`압축된 데이터:`, compressed.tracks[objectUuid][property]);
      });
    });

    const compressedSize = JSON.stringify(compressed).length;
    const compressionRatio = ((timelineData.tracks.size > 0) ?
      (1 - compressedSize / JSON.stringify(timelineData).length) * 100 : 0).toFixed(1);

    console.log("압축된 데이터 크기:", compressedSize, "bytes");
    console.log("압축률:", compressionRatio + "%");
    console.log("=== 타임라인 데이터 압축 완료 ===");

    return compressed;
  }

  /**
   * 압축된 MotionTimeline 데이터 해제
   * @param {Object} compressedData - 압축된 데이터
   * @returns {Object} 원본 형태의 데이터
   */
  static decompressTimelineData(compressedData) {
    if (!compressedData || !compressedData.tracks) {
      console.warn("해제할 압축 데이터가 없습니다.");
      return null;
    }

    console.log("=== 타임라인 데이터 해제 시작 ===");
    console.log("압축된 데이터:", compressedData);
    console.log("tracks 키들:", Object.keys(compressedData.tracks));

    const decompressed = {
      maxTime: compressedData.t || 0,
      frameRate: compressedData.f || 30,
      tracks: {}
    };

    // 트랙 데이터 해제
    Object.entries(compressedData.tracks).forEach(([objectUuid, properties]) => {
      console.log(`객체 ${objectUuid} 처리 중:`, properties);
      console.log(`properties 타입:`, typeof properties);
      console.log(`properties 키들:`, Object.keys(properties));
      console.log(`properties 값:`, JSON.stringify(properties, null, 2));

      decompressed.tracks[objectUuid] = {};

      Object.entries(properties).forEach(([property, data]) => {
        console.log(`속성 ${property} 데이터:`, data);
        console.log(`data 타입:`, typeof data);
        console.log(`data 키들:`, Object.keys(data));
        console.log(`data 값:`, JSON.stringify(data, null, 2));

        try {
          // 문자열을 숫자 배열로 변환
          const times = this.decompressNumberArray(data.t);
          const values = this.decompressNumberArray(data.v);
          const interpolations = data.i.split(',').map(Number);

          console.log(`해제된 데이터 - times:`, times);
          console.log(`해제된 데이터 - values:`, values);
          console.log(`해제된 데이터 - interpolations:`, interpolations);

          // TimelineCore.js가 기대하는 형식으로 변환
          decompressed.tracks[objectUuid][property] = {
            times: times,
            values: values,
            interpolations: interpolations
          };

          console.log(`최종 저장된 데이터:`, decompressed.tracks[objectUuid][property]);
        } catch (error) {
          console.error(`트랙 데이터 해제 중 오류 (${objectUuid}.${property}):`, error);
        }
      });
    });

    console.log("해제된 트랙 수:", Object.keys(decompressed.tracks).length);
    console.log("=== 타임라인 데이터 해제 완료 ===");

    return decompressed;
  }

  /**
   * 숫자 배열을 압축된 문자열로 변환
   * @param {Array|Float32Array} numbers - 숫자 배열
   * @param {number} precision - 소수점 자릿수
   * @returns {string} 압축된 문자열
   */
  static compressNumberArray(numbers, precision = 2) {
    if (!numbers || numbers.length === 0) return '';

    const factor = Math.pow(10, precision);
    return numbers.map(num => Math.round(num * factor) / factor).join(',');
  }

  /**
   * 압축된 문자열을 숫자 배열로 변환
   * @param {string} compressedString - 압축된 문자열
   * @returns {Array} 숫자 배열
   */
  static decompressNumberArray(compressedString) {
    if (!compressedString || compressedString === '') return [];
    return compressedString.split(',').map(Number);
  }

  /**
   * 전체 프로젝트 데이터 압축
   * @param {Object} projectData - 프로젝트 데이터
   * @returns {Object} 압축된 프로젝트 데이터
   */
  static compressProjectData(projectData) {
    console.log("=== 프로젝트 데이터 압축 시작 ===");

    const originalSize = JSON.stringify(projectData).length;
    console.log("원본 프로젝트 크기:", originalSize, "bytes");

    const compressed = { ...projectData };

    // MotionTimeline 데이터 압축 (작은 데이터는 압축하지 않음)
    if (compressed.motionTimeline) {
      const timelineSize = JSON.stringify(compressed.motionTimeline).length;
      console.log("MotionTimeline 데이터 크기:", timelineSize, "bytes");

      if (timelineSize > 1000) { // 1KB 이상일 때만 압축
        console.log("MotionTimeline 데이터 압축 적용");
        compressed.motionTimeline = this.compressTimelineData(compressed.motionTimeline);
      } else {
        console.log("MotionTimeline 데이터가 작아서 압축하지 않음");
      }
    }

    // 씬 데이터에서 불필요한 속성 제거
    if (compressed.scene) {
      compressed.scene = this.cleanupSceneData(compressed.scene);
    }

    const compressedSize = JSON.stringify(compressed).length;
    const compressionRatio = ((1 - compressedSize / originalSize) * 100).toFixed(1);

    console.log("압축된 프로젝트 크기:", compressedSize, "bytes");
    console.log("전체 압축률:", compressionRatio + "%");
    console.log("=== 프로젝트 데이터 압축 완료 ===");

    return compressed;
  }

  /**
   * 압축된 프로젝트 데이터 해제
   * @param {Object} compressedProjectData - 압축된 프로젝트 데이터
   * @returns {Object} 원본 프로젝트 데이터
   */
  static decompressProjectData(compressedProjectData) {
    console.log("=== 프로젝트 데이터 해제 시작 ===");

    const decompressed = { ...compressedProjectData };

    // MotionTimeline 데이터 해제 (압축된 데이터만 해제)
    if (decompressed.motionTimeline) {
      // 압축된 데이터인지 확인 (t, f, tracks 구조를 가지고 있는지)
      if (decompressed.motionTimeline.t && decompressed.motionTimeline.f && decompressed.motionTimeline.tracks) {
        console.log("압축된 MotionTimeline 데이터 해제");
        decompressed.motionTimeline = this.decompressTimelineData(decompressed.motionTimeline);
      } else {
        console.log("압축되지 않은 MotionTimeline 데이터, 그대로 사용");
      }
    }

    console.log("=== 프로젝트 데이터 해제 완료 ===");
    return decompressed;
  }

  /**
   * 씬 데이터에서 불필요한 속성 제거
   * @param {Object} sceneData - 씬 데이터
   * @returns {Object} 정리된 씬 데이터
   */
  static cleanupSceneData(sceneData) {
    const cleanObject = (obj) => {
      if (!obj) return obj;

      // geometry의 불필요한 속성 제거
      if (obj.geometry) {
        delete obj.geometry.boundingSphere;
        delete obj.geometry.boundingBox;
        delete obj.geometry.boundingSphere;
      }

      // material의 불필요한 속성 제거
      if (obj.material) {
        delete obj.material.id;
        delete obj.material.uuid;
        delete obj.material.version;
      }

      // userData에서 불필요한 정보 제거
      if (obj.userData) {
        delete obj.userData.loadTime;
        delete obj.userData.fileHash;
        delete obj.userData._temp;
      }

      // 자식 객체들도 정리
      if (obj.children && Array.isArray(obj.children)) {
        obj.children.forEach(cleanObject);
      }

      return obj;
    };

    return cleanObject(sceneData);
  }
} 