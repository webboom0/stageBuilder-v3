import { Command } from "../Command.js";
import { fixtureTrackId } from "../lighting/fixtureLightTimeline.js";

function resolveLightTimeline(editor) {
  return (
    editor?.lightTimeline ||
    editor?.timeline?.timelines?.light ||
    window.timeline?.timelines?.light ||
    null
  );
}

class DeleteFixtureKeyframesAtPlayheadCommand extends Command {
  constructor(editor, fixtureIds = [], time = 0) {
    super(editor);

    this.type = "DeleteFixtureKeyframesAtPlayheadCommand";
    this.name = "키프레임 삭제";
    this.updatable = false;

    this.fixtureIds = fixtureIds.map(Number).filter((n) => Number.isFinite(n));
    this.time = time;
    this.snapshots = {};
    this.lastResult = null;

    const lt = resolveLightTimeline(editor);
    if (lt) {
      this.fixtureIds.forEach((fid) => {
        const trackId = fixtureTrackId(fid);
        this.snapshots[fid] = lt._captureLightKeyframesAtTime(trackId, time);
      });
    }
  }

  execute() {
    const lt = resolveLightTimeline(this.editor);
    if (!lt) {
      this.lastResult = { success: false, message: "픽스처 타임라인을 사용할 수 없습니다." };
      return;
    }

    let count = 0;
    lt._inHistoryPlayback = true;
    this.fixtureIds.forEach((fid) => {
      const trackId = fixtureTrackId(fid);
      const track = lt.tracks.get(trackId);
      if (!track) return;
      if (
        lt._deleteKeyframesAtTimeForTrack(track, this.time, {
          clearSelection: false,
        })
      ) {
        count++;
      }
    });
    lt.clearSelectedKeyframe?.();
    lt.fixtureBridge?.applyAtTime?.(this.time);
    lt._inHistoryPlayback = false;

    this.lastResult = { success: count > 0, count };
    this.editor?.signals?.timelineChanged?.dispatch?.();
  }

  undo() {
    const lt = resolveLightTimeline(this.editor);
    if (!lt) return;

    lt._inHistoryPlayback = true;
    this.fixtureIds.forEach((fid) => {
      const trackId = fixtureTrackId(fid);
      lt._restoreLightKeyframesAtTime(
        trackId,
        this.time,
        this.snapshots[fid] || {},
      );
    });
    lt.fixtureBridge?.applyAtTime?.(this.time);
    lt._inHistoryPlayback = false;

    this.editor?.signals?.timelineChanged?.dispatch?.();
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

export { DeleteFixtureKeyframesAtPlayheadCommand };
