import { Command } from '../Command.js';

class RemoveKeyframeCommand extends Command {

	constructor( editor, objectId = '', property = '', time = 0 ) {

		super( editor );

		this.type = 'RemoveKeyframeCommand';
		this.name = editor.strings.getKey( 'command/RemoveKeyframe' ) + ': ' + property;
		this.updatable = false;

		this.objectId = objectId;
		this.property = property;
		this.time = time;
		this.removedSnapshot = null;

	}

	execute() {

		const motionTimeline = this.editor?.motionTimeline;
		if ( motionTimeline ) {
			this.removedSnapshot = motionTimeline._captureKeyframesAtTime(
				this.objectId,
				this.time,
			);
		}

		if ( this.editor?.signals ) {
			this.editor.signals.removeKeyframeRequested.dispatch( {
				objectId: this.objectId,
				property: this.property,
				time: this.time,
				allProperties: true,
			} );
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	undo() {

		const motionTimeline = this.editor?.motionTimeline;
		if ( motionTimeline ) {
			motionTimeline._inHistoryPlayback = true;
			motionTimeline._restoreKeyframesAtTime(
				this.objectId,
				this.time,
				this.removedSnapshot,
			);
			motionTimeline._inHistoryPlayback = false;
		}

		if ( this.editor?.signals ) {
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	toJSON() {

		const output = super.toJSON( this );

		output.objectId = this.objectId;
		output.property = this.property;
		output.time = this.time;
		output.removedSnapshot = this.removedSnapshot;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.objectId = json.objectId;
		this.property = json.property;
		this.time = json.time;
		this.removedSnapshot = json.removedSnapshot;

	}

}

export { RemoveKeyframeCommand };
