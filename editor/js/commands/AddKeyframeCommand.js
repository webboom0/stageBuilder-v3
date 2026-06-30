import { Command } from '../Command.js';

class AddKeyframeCommand extends Command {

	constructor( editor, objectId = '', property = '', time = 0, value = null ) {

		super( editor );

		this.type = 'AddKeyframeCommand';
		this.name = editor.strings.getKey( 'command/AddKeyframe' ) + ': ' + property;
		this.updatable = false;

		this.objectId = objectId;
		this.property = property;
		this.time = time;
		this.value = value;
		this.previousSnapshot = null;

	}

	execute() {

		const motionTimeline = this.editor?.motionTimeline;
		if ( motionTimeline ) {
			this.previousSnapshot = motionTimeline._captureKeyframesAtTime(
				this.objectId,
				this.time,
			);
		}

		if ( this.editor?.signals ) {
			this.editor.signals.addKeyframeRequested.dispatch( {
				objectId: this.objectId,
				property: this.property,
				time: this.time,
				value: this.value,
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
				this.previousSnapshot,
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
		output.value = this.value;
		output.previousSnapshot = this.previousSnapshot;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.objectId = json.objectId;
		this.property = json.property;
		this.time = json.time;
		this.value = json.value;
		this.previousSnapshot = json.previousSnapshot;

	}

}

export { AddKeyframeCommand };
