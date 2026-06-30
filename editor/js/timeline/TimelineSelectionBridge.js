/**

 * 3D 뷰포트 선택 ↔ 타임라인 트랙/키프레임/클립 통합 선택 (v3)

 */

export class TimelineSelectionBridge {

  constructor(editor, timeline) {

    this.editor = editor;

    this.timeline = timeline;

    this._preserveKeyframesOnSync = false;



    this._onObjectSelected = (object) => this.syncFromViewport(object);

    editor.signals.objectSelected.add(this._onObjectSelected);



    const viewport = timeline.container?.querySelector(".timeline-viewport");

    if (viewport) {

      this._onTrackHeaderClick = (e) => this.syncFromTimeline(e);

      viewport.addEventListener("click", this._onTrackHeaderClick);

      this._viewport = viewport;

    }

  }



  static get(editor) {

    return editor?.timeline?.selectionBridge ?? null;

  }



  setPreserveKeyframesOnNextSync(value) {

    this._preserveKeyframesOnSync = !!value;

  }



  getRoot() {

    return this.timeline.container || document;

  }



  resolveLightBaseId(nameOrId) {

    if (!nameOrId) return null;

    if (nameOrId.includes("_Target")) {

      return nameOrId.replace("_Target", "");

    }

    const match = nameOrId.match(/^(light_\d+)/);

    if (match) return match[1];

    return nameOrId;

  }



  clearTrackHighlights() {

    this.getRoot()

      .querySelectorAll(".timeline-track--selected")

      .forEach((el) => el.classList.remove("timeline-track--selected"));

  }



  clearLightTrackSelection() {

    const lightTimeline = this.editor.lightTimeline;

    if (lightTimeline) {

      lightTimeline.selectedTrackId = null;

    }

  }



  clearClipHighlights() {

    this.getRoot()

      .querySelectorAll(

        ".animation-sprite.selected, .light-sprite.selected, .target-sprite.selected, .audio-sprite.selected",

      )

      .forEach((el) => el.classList.remove("selected"));



    const motion = this.editor.motionTimeline;

    if (motion) motion.selectedSprite = null;

  }



  clearKeyframeSelections() {

    const root = this.getRoot();

    root.querySelectorAll(".keyframe.selected").forEach((el) => {

      el.classList.remove("selected");

      el.dataset.isSelected = "false";

      if (el.dataset.lightId) {

        el.style.backgroundColor = el.dataset.lightId.includes("_Target")

          ? "#f66"

          : "#f90";

      }

    });



    const motion = this.editor.motionTimeline;

    if (motion) {

      motion.selectedKeyframe = null;

      if (this.editor.scene?.userData?.timeline) {

        this.editor.scene.userData.timeline.selectedKeyframe = null;

      }

    }



    const light = this.editor.lightTimeline;

    if (light) {

      light.selectedKeyframe = null;

      if (this.editor.scene?.userData?.lightTimeline) {

        this.editor.scene.userData.lightTimeline.selectedKeyframe = null;

      }

    }

  }



  /** 키프레임·클립만 해제 (트랙 선택 유지) */

  clearKeyframeAndClipSelection() {

    this.clearKeyframeSelections();

    this.clearClipHighlights();

  }



  /** 트랙·키프레임·클립 선택 전부 해제 */

  clearAllTimelineSelection() {

    this.clearKeyframeAndClipSelection();

    this.clearTrackHighlights();

  }



  isLightTrackLocked(trackEl) {
    if (!trackEl) return false;
    const root = trackEl.classList?.contains("light-timeline")
      ? trackEl
      : trackEl.closest?.(".timeline-track.light-timeline[data-object-id]");
    return root?.dataset?.trackLocked === "true";
  }

  isMotionTrackLocked(trackEl) {
    if (!trackEl) return false;
    const root = trackEl.classList?.contains("timeline-track")
      ? trackEl
      : trackEl.closest?.(".timeline-track[data-uuid]");
    return root?.dataset?.trackLocked === "true";
  }

  highlightTrack(trackEl) {
    if (
      !trackEl ||
      this.isMotionTrackLocked(trackEl) ||
      this.isLightTrackLocked(trackEl)
    ) {
      return;
    }

    trackEl.classList.add("timeline-track--selected");

    trackEl.scrollIntoView({ block: "nearest", behavior: "smooth" });

  }



  selectMotionTrack(uuid) {

    if (!uuid) return;

    const root = this.getRoot();
    const trackEl = root.querySelector(
      `.timeline-track[data-uuid="${uuid}"]:not(.light-timeline)`,
    );
    if (this.isMotionTrackLocked(trackEl)) return;

    this.clearTrackHighlights();

    this.clearLightTrackSelection();



    root
      .querySelectorAll(
        `.timeline-track[data-uuid="${uuid}"]:not(.light-timeline)`,
      )
      .forEach((t) => this.highlightTrack(t));



    if (this.editor.selectByUuid) {

      this.editor.selectByUuid(uuid);

    }

  }



  /** SpotLight 조명+타겟 행을 하나의 트랙 그룹으로 선택 */

  selectLightTrackGroup(lightId) {

    const baseId = this.resolveLightBaseId(lightId);

    if (!baseId) return;



    const mainTrack = this.getRoot().querySelector(

      `.timeline-track.light-timeline[data-object-id="${baseId}"]`,

    );

    if (this.isLightTrackLocked(mainTrack)) return;

    this.clearTrackHighlights();

    const lightTimeline = this.editor.lightTimeline;

    if (lightTimeline) {

      lightTimeline.selectedTrackId = baseId;

    }

    if (mainTrack) {

      this.highlightTrack(mainTrack);

    }

    const found = this.editor.scene?.getObjectByName(baseId);

    if (found && !found.userData?.notSelectable) {

      this.setPreserveKeyframesOnNextSync(true);

      this.editor.select(found);

    }

  }



  highlightTracksForObject(object) {

    this.clearTrackHighlights();

    if (!object) return;



    const root = this.timeline.container;

    if (!root) return;



    const motionTracks = root.querySelectorAll(

      `.timeline-track[data-uuid="${object.uuid}"]`,

    );

    let motionHighlighted = false;
    motionTracks.forEach((t) => {
      if (this.isMotionTrackLocked(t)) return;
      this.highlightTrack(t);
      motionHighlighted = true;
    });

    if (motionHighlighted) {

      this.clearLightTrackSelection();

      return;

    }



    if (object.isLight || object.name?.includes("Target")) {

      const baseId = this.resolveLightBaseId(object.name);

      if (baseId) {

        if (this.editor.lightTimeline) {

          this.editor.lightTimeline.selectedTrackId = baseId;

        }

        const mainTrack = root.querySelector(

          `.timeline-track.light-timeline[data-object-id="${baseId}"]`,

        );

        if (mainTrack && !this.isLightTrackLocked(mainTrack)) {

          this.highlightTrack(mainTrack);

        }

      }

      return;

    }



    if (object.name) {

      const byName = root.querySelectorAll(

        `.timeline-track[data-object-id="${object.name}"]`,

      );

      byName.forEach((t) => this.highlightTrack(t));

    }

  }



  syncFromViewport(object) {

    this.clearClipHighlights();

    if (!this._preserveKeyframesOnSync) {

      this.clearKeyframeSelections();

    }

    this._preserveKeyframesOnSync = false;

    this.highlightTracksForObject(object);

  }



  syncFromTimeline(event) {

    const header = event.target.closest(".track-header");

    if (!header) return;



    const track = header.closest(".timeline-track");

    if (!track) return;



    if (event.target.closest("button, select, input")) return;

    if (track.dataset.uuid && this.isMotionTrackLocked(track)) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    if (
      track.classList.contains("light-timeline") &&
      this.isLightTrackLocked(track)
    ) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }



    this.clearKeyframeAndClipSelection();



    const uuid = track.dataset.uuid;

    if (uuid) {

      this.selectMotionTrack(uuid);

      return;

    }



    if (track.classList.contains("light-timeline") && track.dataset.objectId) {

      this.selectLightTrackGroup(track.dataset.objectId);

    }

  }



  /** 키프레임·클립 선택 직후 editor.select 호출 시 키프레임 유지 */

  selectEditorObject(object) {

    if (!object || !this.editor.select) return;

    this.setPreserveKeyframesOnNextSync(true);

    this.editor.select(object);

    this.highlightTracksForObject(object);

  }



  dispose() {

    this.editor.signals.objectSelected.remove(this._onObjectSelected);

    if (this._viewport && this._onTrackHeaderClick) {

      this._viewport.removeEventListener("click", this._onTrackHeaderClick);

    }

  }

}


