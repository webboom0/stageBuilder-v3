// editor/js/timeline/VideoBackground.js
import * as THREE from 'three';
import {
  arenaFloorLayoutFromBackground,
  ARENA_VIDEO_Y_ABOVE_FLOOR,
  ARENA_VIDEO_Y_LIFT,
} from '../arenaStageLayout.js';

export class VideoBackground {
  constructor(editor) {
    this.editor = editor;
    this.videoElement = null;
    this.videoTexture = null;
    this.videoMaterial = null;
    this.videoMesh = null;
    this.isPlaying = false;
    this.currentVideoPath = null;
  }



  // 비디오 배경 생성
  createVideoBackground(stageGroup) {
    try {
      console.log("🎬 비디오 배경 생성 시작");

      // 기존 비디오 배경 제거
      this.removeVideoBackground();

      // 비디오 요소 생성
      this.videoElement = document.createElement('video');
      this.videoElement.style.display = 'none';
      this.videoElement.crossOrigin = 'anonymous';
      this.videoElement.loop = true;
      this.videoElement.muted = true;
      this.videoElement.playsInline = true;

      // 비디오 텍스처 생성
      this.videoTexture = new THREE.VideoTexture(this.videoElement);
      this.videoTexture.minFilter = THREE.LinearFilter;
      this.videoTexture.magFilter = THREE.LinearFilter;
      this.videoTexture.format = THREE.RGBFormat;

      // 비디오 머티리얼 생성
      this.videoMaterial = new THREE.MeshBasicMaterial({
        map: this.videoTexture,
        transparent: true,
        opacity: 1.0,
        side: THREE.DoubleSide
      });

      // 현재 무대 타입 확인
      const stageType = this.editor.scene?.userData?.stageType || 'proscenium';
      console.log("🎬 현재 무대 타입:", stageType);

      let geometry;

      if (stageType === 'arena') {
        // 아레나: 원통형 스크린 — 바닥 layout과 동일 중심·반지름
        const bg = stageGroup?.children?.find((c) => c.name === '_Background');
        const layout = arenaFloorLayoutFromBackground(bg);
        const vp = {
          x: layout.x,
          y: layout.y + ARENA_VIDEO_Y_ABOVE_FLOOR + ARENA_VIDEO_Y_LIFT,
          z: layout.z,
        };
        const r = layout.videoCylinderRadius;
        const h = layout.videoCylinderHeight;
        console.log("🎬 아레나 원통형 스크린 생성", { r, h, vp });
        geometry = new THREE.CylinderGeometry(
          r,
          r,
          h,
          32,    // 세그먼트 (부드러운 원통)
          1,     // 높이 세그먼트
          true   // 열린 원통 (양쪽 뚫림)
        );

        this.videoMesh = new THREE.Mesh(geometry, this.videoMaterial);
        this.videoMesh.name = '_VideoBackground';
        this.videoMesh.position.set(vp.x, vp.y, vp.z);
        this.videoMesh.rotation.set(0, Math.PI, 0); // 180도 회전하여 경계선을 뒤로
        this.videoMesh.scale.set(1, 1, 1);

      } else {
        // 프로시니엄: 사각형 평면 스크린
        console.log("🎬 프로시니엄 사각형 스크린 생성");
        geometry = new THREE.PlaneGeometry(1, 1);

        this.videoMesh = new THREE.Mesh(geometry, this.videoMaterial);
        this.videoMesh.name = '_VideoBackground';
        this.videoMesh.position.set(8.243, 65.273, -74.039);
        this.videoMesh.scale.set(374.724, 125.114, 1.000);
        this.videoMesh.rotation.set(0, 0, 0);
      }

      // 스테이지 그룹에 추가
      if (stageGroup) {
        stageGroup.add(this.videoMesh);
        console.log("✅ 비디오 배경을 스테이지 그룹에 추가 완료");
      } else {
        // 스테이지 그룹이 없으면 씬에 직접 추가
        if (this.editor.scene) {
          this.editor.scene.add(this.videoMesh);
          console.log("✅ 비디오 배경을 씬에 직접 추가 완료");
        }
      }

      // 비디오 이벤트 리스너 설정
      this.setupVideoEventListeners();

      return this.videoMesh;

    } catch (error) {
      console.error("❌ 비디오 배경 생성 중 오류:", error);
      return null;
    }
  }

  // 비디오 파일 로드
  loadVideo(videoPath) {
    if (!this.videoElement) {
      console.error("❌ 비디오 요소가 생성되지 않았습니다");
      return false;
    }

    try {
      console.log("🎬 비디오 파일 로드 시작:", videoPath);

      this.currentVideoPath = videoPath;

      // 비디오 소스 설정
      this.videoElement.src = videoPath;

      // 비디오 로드 완료 후 재생
      this.videoElement.addEventListener('loadeddata', () => {
        console.log("✅ 비디오 로드 완료, 재생 시작");

        // 비디오 크기에 맞춰 메시 크기 조정
        // this.adjustVideoSize();

        // 재생 시작
        this.playVideo();
      }, { once: true });

      // 비디오 로드 에러 처리
      this.videoElement.addEventListener('error', (error) => {
        console.error("❌ 비디오 로드 실패:", error);
        // alert("비디오 파일을 로드할 수 없습니다: " + videoPath);
      });

      return true;

    } catch (error) {
      console.error("❌ 비디오 로드 중 오류:", error);
      return false;
    }
  }

  // 비디오 크기에 맞춰 메시 크기 조정
  adjustVideoSize() {
    if (!this.videoElement || !this.videoMesh) return;

    try {
      const videoWidth = this.videoElement.videoWidth;
      const videoHeight = this.videoElement.videoHeight;

      if (videoWidth > 0 && videoHeight > 0) {
        // 비디오 비율 계산
        const aspectRatio = videoWidth / videoHeight;

        // 기본 너비를 20으로 설정하고 높이를 비율에 맞춤
        const width = 20;
        const height = width / aspectRatio;

        // 메시 크기 조정
        this.videoMesh.scale.set(width, height, 1);

        console.log("🎬 비디오 크기 조정:", {
          original: `${videoWidth}x${videoHeight}`,
          adjusted: `${width}x${height}`,
          aspectRatio: aspectRatio.toFixed(2)
        });
      }
    } catch (error) {
      console.error("❌ 비디오 크기 조정 중 오류:", error);
    }
  }


  // 비디오 재생
  playVideo() {
    if (this.videoElement && !this.isPlaying) {
      try {
        this.videoElement.play();
        this.isPlaying = true;
        console.log("▶️ 비디오 재생 시작");
      } catch (error) {
        console.error("❌ 비디오 재생 실패:", error);
        this.isPlaying = false;
      }
    }
  }

  // 비디오 일시정지
  pauseVideo() {
    if (this.videoElement && this.isPlaying) {
      try {
        this.videoElement.pause();
        this.isPlaying = false;
        console.log("⏸️ 비디오 일시정지");
      } catch (error) {
        console.error("❌ 비디오 일시정지 실패:", error);
      }
    }
  }

  // 비디오 정지
  stopVideo() {
    if (this.videoElement) {
      try {
        this.videoElement.pause();
        this.videoElement.currentTime = 0;
        this.isPlaying = false;
        console.log("⏹️ 비디오 정지");
      } catch (error) {
        console.error("❌ 비디오 정지 실패:", error);
      }
    }
  }

  // 비디오 볼륨 설정
  setVolume(volume) {
    if (this.videoElement) {
      this.videoElement.volume = Math.max(0, Math.min(1, volume));
      console.log("🔊 비디오 볼륨 설정:", volume);
    }
  }

  // 비디오 투명도 설정
  setOpacity(opacity) {
    if (this.videoMaterial) {
      this.videoMaterial.opacity = Math.max(0, Math.min(1, opacity));
      this.videoMaterial.needsUpdate = true;
      console.log("🎭 비디오 투명도 설정:", opacity);
    }
  }

  // 비디오 크기 조정
  resizeVideo(width, height) {
    if (this.videoMesh) {
      this.videoMesh.scale.set(width, height, 1);
      console.log("비디오 크기 조정:", width, "x", height);
    }
  }

  // 비디오 위치 조정
  setVideoPosition(x, y, z) {
    if (this.videoMesh) {
      this.videoMesh.position.set(x, y, z);
      console.log("비디오 위치 조정:", x, y, z);
    }
  }

  // 비디오 회전 조정
  setVideoRotation(x, y, z) {
    if (this.videoMesh) {
      this.videoMesh.rotation.set(x, y, z);
      console.log("비디오 회전 조정:", x, y, z);
    }
  }

  // 비디오 업데이트 (애니메이션 루프에서 호출)
  update() {
    if (this.videoTexture && this.isPlaying) {
      this.videoTexture.needsUpdate = true;
    }
  }

  // 비디오 배경 제거
  removeVideoBackground() {
    try {
      if (this.videoMesh) {
        // 부모에서 제거
        if (this.videoMesh.parent) {
          this.videoMesh.parent.remove(this.videoMesh);
        }

        // 메모리 정리
        if (this.videoMaterial) {
          this.videoMaterial.dispose();
        }
        if (this.videoTexture) {
          this.videoTexture.dispose();
        }
        if (this.videoElement) {
          this.videoElement.pause();
          this.videoElement.src = '';
          this.videoElement.load();
        }

        // 변수 정리
        this.videoMesh = null;
        this.videoMaterial = null;
        this.videoTexture = null;
        this.videoElement = null;
        this.isPlaying = false;
        this.currentVideoPath = null;

        console.log("🗑️ 비디오 배경 제거 완료");
      }
    } catch (error) {
      console.error("❌ 비디오 배경 제거 중 오류:", error);
    }
  }

  // 비디오 이벤트 리스너 설정
  setupVideoEventListeners() {
    if (!this.videoElement) return;

    // 비디오 재생 시작
    this.videoElement.addEventListener('play', () => {
      this.isPlaying = true;
      console.log("▶️ 비디오 재생 이벤트");
    });

    // 비디오 일시정지
    this.videoElement.addEventListener('pause', () => {
      this.isPlaying = false;
      console.log("⏸️ 비디오 일시정지 이벤트");
    });

    // 비디오 종료
    this.videoElement.addEventListener('ended', () => {
      this.isPlaying = false;
      console.log("🏁 비디오 종료 이벤트");
    });

    // 비디오 시간 업데이트
    this.videoElement.addEventListener('timeupdate', () => {
      // 시간 업데이트 시 필요한 처리
    });
  }

  // 비디오 상태 정보 반환
  getVideoInfo() {
    if (!this.videoElement) return null;

    return {
      currentTime: this.videoElement.currentTime,
      duration: this.videoElement.duration,
      isPlaying: this.isPlaying,
      volume: this.videoElement.volume,
      muted: this.videoElement.muted,
      path: this.currentVideoPath,
      hasVideo: this.videoMesh !== null
    };
  }

  // 비디오가 로드되었는지 확인
  isVideoLoaded() {
    return this.videoElement && this.videoElement.readyState >= 2;
  }

  // 비디오 재생 시간 설정
  setCurrentTime(time) {
    if (this.videoElement && !isNaN(time)) {
      this.videoElement.currentTime = Math.max(0, Math.min(time, this.videoElement.duration));
      console.log("⏰ 비디오 재생 시간 설정:", time);
    }
  }

  // 비디오 루프 설정
  setLoop(loop) {
    if (this.videoElement) {
      this.videoElement.loop = loop;
      console.log("🔄 비디오 루프 설정:", loop);
    }
  }

  // 비디오 음소거 설정
  setMuted(muted) {
    if (this.videoElement) {
      this.videoElement.muted = muted;
      console.log("🔇 비디오 음소거 설정:", muted);
    }
  }
}

export default VideoBackground;