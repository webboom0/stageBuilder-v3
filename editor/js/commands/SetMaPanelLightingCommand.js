import { Command } from "../Command.js";
import {
  applyMaPanelLightingState,
  captureMaPanelLightingState,
  setMaPanelHistoryPlayback,
} from "../lighting/maPanelHistory.js";

class SetMaPanelLightingCommand extends Command {
  constructor(editor, label = "", mutateFn = null) {
    super(editor);

    this.type = "SetMaPanelLightingCommand";
    this.name = label || "조명 패널";
    this.updatable = true;
    this.object = editor;
    this.attributeName = label || "조명 패널";

    this.mutateFn = mutateFn;
    this.oldState = captureMaPanelLightingState(editor);
    this.newState = null;
  }

  execute() {
    setMaPanelHistoryPlayback(true);
    try {
      this.mutateFn?.();
      this.newState = captureMaPanelLightingState(this.editor);
      const fe = this.editor.fixtureEngine;
      const lt = this.editor.lightTimeline;
      const t = lt?.getPlayheadTimeSeconds?.() ?? lt?.currentTime ?? 0;
      fe?.update?.(t);
      this.editor.signals?.rendererUpdated?.dispatch?.();
    } finally {
      setMaPanelHistoryPlayback(false);
    }
  }

  undo() {
    setMaPanelHistoryPlayback(true);
    try {
      applyMaPanelLightingState(this.editor, this.oldState);
      this.newState = captureMaPanelLightingState(this.editor);
    } finally {
      setMaPanelHistoryPlayback(false);
    }
  }

  update(cmd) {
    this.mutateFn = cmd.mutateFn;
  }

  toJSON() {
    const output = super.toJSON();
    output.label = this.attributeName;
    output.oldState = this.oldState;
    output.newState = this.newState;
    return output;
  }

  fromJSON(json) {
    super.fromJSON(json);
    this.attributeName = json.label || this.name;
    this.oldState = json.oldState;
    this.newState = json.newState;
    this.mutateFn = null;
  }
}

export { SetMaPanelLightingCommand };
