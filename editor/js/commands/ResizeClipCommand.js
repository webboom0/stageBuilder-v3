/**
 * 클립 길이 조절을 위한 Command 클래스
 */
import { Command } from './Command.js';

class ResizeClipCommand extends Command {
    constructor(editor, objectUuid, oldLeft, oldWidth, oldDuration, newLeft, newWidth, newDuration, resizeHandle) {
        super(editor);
        
        this.objectUuid = objectUuid;
        this.oldLeft = oldLeft;
        this.oldWidth = oldWidth;
        this.oldDuration = oldDuration;
        this.newLeft = newLeft;
        this.newWidth = newWidth;
        this.newDuration = newDuration;
        this.resizeHandle = resizeHandle; // 'left' 또는 'right'
        
        this.name = `Resize Clip (${resizeHandle} handle)`;
    }

    execute() {
        // 클립 길이 조절 실행
        if (this.editor && this.editor.signals) {
            this.editor.signals.resizeClipRequested.dispatch({
                objectUuid: this.objectUuid,
                left: this.newLeft,
                width: this.newWidth,
                duration: this.newDuration,
                resizeHandle: this.resizeHandle
            });
        }
    }

    undo() {
        // 클립 길이 조절 되돌리기
        if (this.editor && this.editor.signals) {
            this.editor.signals.resizeClipRequested.dispatch({
                objectUuid: this.objectUuid,
                left: this.oldLeft,
                width: this.oldWidth,
                duration: this.oldDuration,
                resizeHandle: this.resizeHandle
            });
        }
    }

    toJSON() {
        return {
            type: 'ResizeClipCommand',
            objectUuid: this.objectUuid,
            oldLeft: this.oldLeft,
            oldWidth: this.oldWidth,
            oldDuration: this.oldDuration,
            newLeft: this.newLeft,
            newWidth: this.newWidth,
            newDuration: this.newDuration,
            resizeHandle: this.resizeHandle
        };
    }

    fromJSON(json) {
        this.objectUuid = json.objectUuid;
        this.oldLeft = json.oldLeft;
        this.oldWidth = json.oldWidth;
        this.oldDuration = json.oldDuration;
        this.newLeft = json.newLeft;
        this.newWidth = json.newWidth;
        this.newDuration = json.newDuration;
        this.resizeHandle = json.resizeHandle;
        
        return this;
    }
}

export { ResizeClipCommand };
