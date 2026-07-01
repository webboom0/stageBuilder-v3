import { Command } from '../Command.js';

class RemoveAudioTrackCommand extends Command {

	constructor( editor, objectId = '' ) {

		super( editor );

		this.type = 'RemoveAudioTrackCommand';
		this.name = '오디오 트랙 제거';
		this.updatable = false;

		this.objectId = objectId;
		this.snapshot = null;

	}

	execute() {

		const audioTimeline = this.editor?.audioTimeline || window.timeline?.timelines?.audio;
		if ( !audioTimeline ) return;

		this.snapshot = audioTimeline._captureAudioTrackSnapshot( this.objectId );

		audioTimeline._inHistoryPlayback = true;
		audioTimeline._removeTrackInternal( this.objectId );
		audioTimeline._inHistoryPlayback = false;

		if ( this.editor?.signals?.timelineChanged ) {
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	undo() {

		const audioTimeline = this.editor?.audioTimeline;
		if ( !audioTimeline || !this.snapshot?.audioFile?.path ) return;

		audioTimeline._inHistoryPlayback = true;
		audioTimeline.loadAudioFile( this.snapshot.audioFile ).then( ( track ) => {
			if ( track && this.snapshot.trackProps ) {
				audioTimeline.restoreTrackProperties( track, this.snapshot.trackProps );
			}
			audioTimeline._inHistoryPlayback = false;
			if ( this.editor?.signals?.timelineChanged ) {
				this.editor.signals.timelineChanged.dispatch();
			}
		} ).catch( () => {
			audioTimeline._inHistoryPlayback = false;
		} );

	}

	toJSON() {

		const output = super.toJSON( this );
		output.objectId = this.objectId;
		output.snapshot = this.snapshot;
		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.objectId = json.objectId;
		this.snapshot = json.snapshot;

	}

}

export { RemoveAudioTrackCommand };
