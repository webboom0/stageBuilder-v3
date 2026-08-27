import * as THREE from 'three';
import { normalizeStageType } from '../stage/StageTypes.js';
import {
  ARENA_VIDEO,
  attachVideoToStage,
} from './videoStageLayout.js';

/**
 * Separate video plane (proper UVs) + hide blank FBX screen panels while active.
 */
export class VideoBackground {
  constructor() {
    /** @type {HTMLVideoElement | null} */
    this.videoElement = null;
    /** @type {THREE.VideoTexture | null} */
    this.videoTexture = null;
    /** @type {THREE.MeshBasicMaterial | null} */
    this.videoMaterial = null;
    /** @type {THREE.Mesh | null} */
    this.videoMesh = null;
    this.isPlaying = false;
    /** @type {string | null} */
    this.currentVideoPath = null;
    /** @type {import('../stage/StageTypes.js').StageTypeId} */
    this.stageType = 'proscenium';
    /** @type {{ obj: import('three').Object3D, visible: boolean }[]} */
    this._hiddenOccluders = [];
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  ensureMesh(stageManager) {
    if (!this.videoElement) this._initVideoElement();
    if (!this.videoMesh) this._buildMesh(stageManager);
    else this._applyLayout(stageManager);
    return this.videoMesh;
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  createVideoBackground(stageManager) {
    this._disposeMesh();
    this.stageType = normalizeStageType(stageManager.stageType);
    if (!this.videoElement) this._initVideoElement();
    this._buildMesh(stageManager);
    return this.videoMesh;
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  syncToStage(stageManager) {
    if (!this.videoMesh && !this.currentVideoPath) return;
    this.ensureMesh(stageManager);
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  rebuildForStage(stageManager) {
    const path = this.currentVideoPath;
    const wasPlaying = this.isPlaying;
    this.createVideoBackground(stageManager);
    if (path) this.loadVideo(path, { autoplay: wasPlaying !== false });
  }

  /**
   * @param {string} videoPath
   * @param {{ autoplay?: boolean }} [opts]
   */
  loadVideo(videoPath, opts = {}) {
    if (!this.videoElement) return false;
    const video = this.videoElement;
    this.currentVideoPath = videoPath;

    this._configureCrossOrigin(videoPath);
    video.pause();
    video.src = videoPath;
    video.load();

    const autoplay = opts.autoplay !== false;
    const onReady = () => {
      if (this.videoTexture) this.videoTexture.needsUpdate = true;
      if (autoplay) this.playVideo();
    };

    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      onReady();
    } else {
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('canplay', onReady, { once: true });
    }

    video.addEventListener('error', () => {
      const err = video.error;
      console.error('Video load failed:', videoPath, err?.code, err?.message);
    }, { once: true });

    return true;
  }

  playVideo() {
    if (!this.videoElement) return;
    const video = this.videoElement;
    video.muted = true;
    const p = video.play();
    if (p && typeof p.then === 'function') {
      p.then(() => {
        this.isPlaying = true;
        if (this.videoTexture) this.videoTexture.needsUpdate = true;
      }).catch((err) => {
        console.warn('Video autoplay blocked:', err);
        this.isPlaying = false;
      });
    } else {
      this.isPlaying = !video.paused;
    }
  }

  pauseVideo() {
    if (!this.videoElement) return;
    this.videoElement.pause();
    this.isPlaying = false;
  }

  update() {
    if (!this.videoTexture || !this.videoElement) return;
    if (this.videoElement.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      this.videoTexture.needsUpdate = true;
    }
  }

  clearFromStage() {
    this._disposeMesh();
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.removeAttribute('src');
      this.videoElement.load();
    }
    this.isPlaying = false;
    this.currentVideoPath = null;
  }

  removeVideoBackground() {
    this.clearFromStage();
    if (this.videoElement) {
      this.videoElement.remove();
    }
    this.videoElement = null;
    this.videoMaterial?.dispose();
    this.videoMaterial = null;
    this.videoTexture?.dispose();
    this.videoTexture = null;
  }

  isVideoLoaded() {
    return !!this.videoElement && this.videoElement.readyState >= 2;
  }

  /**
   * @param {string} videoPath
   */
  _configureCrossOrigin(videoPath) {
    if (!this.videoElement || typeof window === 'undefined') return;
    try {
      const abs = new URL(videoPath, window.location.href);
      if (abs.origin === window.location.origin) {
        this.videoElement.crossOrigin = null;
        this.videoElement.removeAttribute('crossorigin');
      } else {
        this.videoElement.crossOrigin = 'anonymous';
      }
    } catch {
      this.videoElement.crossOrigin = 'anonymous';
    }
  }

  _initVideoElement() {
    this.videoElement = document.createElement('video');
    this.videoElement.muted = true;
    this.videoElement.defaultMuted = true;
    this.videoElement.loop = true;
    this.videoElement.playsInline = true;
    this.videoElement.setAttribute('playsinline', '');
    this.videoElement.setAttribute('webkit-playsinline', '');
    this.videoElement.preload = 'auto';
    // Keep in DOM — some browsers won't decode frames for WebGL otherwise.
    this.videoElement.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;';
    document.body.appendChild(this.videoElement);

    this.videoTexture = new THREE.VideoTexture(this.videoElement);
    this.videoTexture.colorSpace = THREE.SRGBColorSpace;
    this.videoTexture.minFilter = THREE.LinearFilter;
    this.videoTexture.magFilter = THREE.LinearFilter;
    this.videoTexture.generateMipmaps = false;

    this.videoMaterial = new THREE.MeshBasicMaterial({
      map: this.videoTexture,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    this.setupVideoEventListeners();
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  _buildMesh(stageManager) {
    this.stageType = normalizeStageType(stageManager.stageType);
    const geometry = this.stageType === 'arena'
      ? new THREE.CylinderGeometry(
        ARENA_VIDEO.radius,
        ARENA_VIDEO.radius,
        ARENA_VIDEO.height,
        32,
        1,
        true,
      )
      : new THREE.PlaneGeometry(1, 1);

    this.videoMesh = new THREE.Mesh(geometry, this.videoMaterial);
    this.videoMesh.name = '_VideoBackground';
    this.videoMesh.frustumCulled = false;
    this.videoMesh.userData.isBackground = true;
    this.videoMesh.userData.notSelectable = true;
    this.videoMesh.raycast = () => {};

    this._applyLayout(stageManager);
  }

  /**
   * @param {import('../stage/StageManager.js').StageManager} stageManager
   */
  _applyLayout(stageManager) {
    if (!this.videoMesh) return;
    this.stageType = normalizeStageType(stageManager.stageType);
    this._restoreOccluders();
    const { occluders } = attachVideoToStage(this.videoMesh, stageManager);
    this._hideOccluders(occluders);
  }

  /**
   * @param {import('three').Object3D[]} occluders
   */
  _hideOccluders(occluders) {
    for (const obj of occluders) {
      if (!obj || obj.visible === false) continue;
      this._hiddenOccluders.push({ obj, visible: true });
      obj.visible = false;
    }
  }

  _restoreOccluders() {
    for (const entry of this._hiddenOccluders) {
      if (entry.obj) entry.obj.visible = entry.visible;
    }
    this._hiddenOccluders = [];
  }

  _disposeMesh() {
    this._restoreOccluders();
    if (this.videoMesh?.parent) {
      this.videoMesh.parent.remove(this.videoMesh);
    }
    this.videoMesh?.geometry?.dispose();
    this.videoMesh = null;
  }

  setupVideoEventListeners() {
    if (!this.videoElement) return;
    this.videoElement.addEventListener('play', () => { this.isPlaying = true; });
    this.videoElement.addEventListener('pause', () => { this.isPlaying = false; });
    this.videoElement.addEventListener('ended', () => { this.isPlaying = false; });
  }
}
