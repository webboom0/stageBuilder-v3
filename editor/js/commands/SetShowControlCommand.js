import { Command } from "../Command.js";
import {
  applyShowControlState,
  captureShowControlState,
  setShowControlHistoryPlayback,
} from "../showcontrol/showControlHistory.js";

class SetShowControlCommand extends Command {
  constructor(editor, label = "", mutateFn = null) {
    super(editor);

    this.type = "SetShowControlCommand";
    this.name = label || "그룹 / Ensemble";
    this.updatable = false;
    this.object = editor;

    this.mutateFn = mutateFn;
    this.oldState = captureShowControlState(editor);
    this.newState = null;
  }

  execute() {
    setShowControlHistoryPlayback(true);
    try {
      if (!this.newState) {
        this.mutateFn?.();
        this.newState = captureShowControlState(this.editor);
      }
      applyShowControlState(this.editor, this.newState);
    } finally {
      setShowControlHistoryPlayback(false);
    }
  }

  undo() {
    setShowControlHistoryPlayback(true);
    try {
      applyShowControlState(this.editor, this.oldState);
      this.newState = captureShowControlState(this.editor);
    } finally {
      setShowControlHistoryPlayback(false);
    }
  }

  toJSON() {
    const output = super.toJSON();
    output.label = this.name;
    output.oldState = this.oldState;
    output.newState = this.newState;
    return output;
  }

  fromJSON(json) {
    super.fromJSON(json);
    this.name = json.label || this.name;
    this.oldState = json.oldState;
    this.newState = json.newState;
    this.mutateFn = null;
  }
}

export { SetShowControlCommand };
