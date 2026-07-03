import { Command } from "../Command.js";

function resolveLightTimeline(editor) {
  return (
    editor?.lightTimeline ||
    editor?.timeline?.timelines?.light ||
    window.timeline?.timelines?.light ||
    null
  );
}

class AddFixtureKeyframesAtPlayheadCommand extends Command {
  constructor(editor, fixtureIds = [], time = 0) {
    super(editor);

    this.type = "AddFixtureKeyframesAtPlayheadCommand";
    this.name = "조명 키프레임 추가";
    this.updatable = false;

    this.fixtureIds = fixtureIds.map(Number).filter((n) => Number.isFinite(n));
    this.time = time;
    this.snapshots = {};
    this.lastResult = null;

    const lt = resolveLightTimeline(editor);
    if (lt) {
      this.fixtureIds.forEach((fid) => {
        const trackId = `fx_${fid}`;
        this.snapshots[fid] = lt._captureLightKeyframesAtTime(trackId, time);
      });
    }
  }

  execute() {
    const lt = resolveLightTimeline(this.editor);
    if (!lt?.fixtureBridge?.addKeyframesForSelection) {
      this.lastResult = { success: false, message: "픽스처 타임라인을 사용할 수 없습니다." };
      return;
    }

    lt._inHistoryPlayback = true;
    this.lastResult = lt.fixtureBridge.addKeyframesForSelection();
    lt._inHistoryPlayback = false;

    this.editor?.signals?.timelineChanged?.dispatch?.();
  }

  undo() {
    const lt = resolveLightTimeline(this.editor);
    if (!lt) return;

    lt._inHistoryPlayback = true;
    this.fixtureIds.forEach((fid) => {
      const trackId = `fx_${fid}`;
      lt._restoreLightKeyframesAtTime(
        trackId,
        this.time,
        this.snapshots[fid] || {},
      );
    });
    lt.fixtureBridge?.applyAtTime?.(this.time);
    lt._inHistoryPlayback = false;

    this.editor?.signals?.timelineChanged?.dispatch?.();
    this.editor?.signals?.rendererUpdated?.dispatch?.();
  }

  toJSON() {
    const output = super.toJSON();
    output.fixtureIds = this.fixtureIds;
    output.time = this.time;
    output.snapshots = this.snapshots;
    return output;
  }

  fromJSON(json) {
    super.fromJSON(json);
    this.fixtureIds = json.fixtureIds || [];
    this.time = json.time;
    this.snapshots = json.snapshots || {};
  }
}

export { AddFixtureKeyframesAtPlayheadCommand };
