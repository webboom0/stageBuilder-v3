/**
 * Main editor viewport — single camera only (multi-view is MultiViewPopup).
 */
export class MultiViewManager {
  /**
   * @param {{
   *   renderer: import('three').WebGLRenderer,
   *   scene: import('three').Scene,
   *   helpers: import('../stage/StageViewportHelpers.js').StageViewportHelpers,
   *   mainCamera: import('three').PerspectiveCamera,
   *   viewportEl: HTMLElement,
   * }} opts
   */
  constructor(opts) {
    this.renderer = opts.renderer;
    this.scene = opts.scene;
    this.helpers = opts.helpers;
    this.mainCamera = opts.mainCamera;
    this.viewportEl = opts.viewportEl;
  }

  render() {
    const w = this.viewportEl.clientWidth;
    const h = this.viewportEl.clientHeight;
    if (w < 2 || h < 2) return;

    const renderer = this.renderer;
    renderer.setScissorTest(false);
    this.mainCamera.aspect = w / h;
    this.mainCamera.updateProjectionMatrix();
    // Full drawing buffer — do not setViewport (breaks with devicePixelRatio > 1).
    renderer.render(this.scene, this.mainCamera);
    if (this.helpers.shouldRenderOverlay()) {
      renderer.autoClear = false;
      renderer.render(this.helpers.getOverlayScene(), this.mainCamera);
      renderer.autoClear = true;
    }
  }
}
