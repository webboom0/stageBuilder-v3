import { Command } from '../Command.js';

function resolveLightTimeline( editor ) {

	return (
		editor?.lightTimeline ||
		editor?.timeline?.timelines?.light ||
		window.timeline?.timelines?.light ||
		window.lightTimeline ||
		null
	);

}

class AddLightKeyframeAtPlayheadCommand extends Command {

	constructor( editor, trackObjectId = '', time = 0 ) {

		super( editor );

		this.type = 'AddLightKeyframeAtPlayheadCommand';
		this.name = '조명 키프레임 추가';
		this.updatable = false;

		this.trackObjectId = trackObjectId;
		this.time = time;
		this.previousSnapshot = null;

	}

	execute() {

		const lightTimeline = resolveLightTimeline( this.editor );
		if ( !lightTimeline ) {
			this.lastResult = {
				success: false,
				message: '조명 타임라인을 사용할 수 없습니다.',
			};
			return;
		}

		this.previousSnapshot = lightTimeline._captureLightKeyframesAtTime(
			this.trackObjectId,
			this.time,
		);

		lightTimeline._inHistoryPlayback = true;
		this.lastResult = lightTimeline._addKeyframeAtPlayheadInternal( this.trackObjectId );
		lightTimeline._inHistoryPlayback = false;

		if ( this.editor?.signals?.timelineChanged ) {
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	undo() {

		const lightTimeline = resolveLightTimeline( this.editor );
		if ( !lightTimeline ) return;

		lightTimeline._inHistoryPlayback = true;
		lightTimeline._restoreLightKeyframesAtTime(
			this.trackObjectId,
			this.time,
			this.previousSnapshot,
		);
		lightTimeline._inHistoryPlayback = false;

		if ( this.editor?.signals?.timelineChanged ) {
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	toJSON() {

		const output = super.toJSON( this );
		output.trackObjectId = this.trackObjectId;
		output.time = this.time;
		output.previousSnapshot = this.previousSnapshot;
		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );
		this.trackObjectId = json.trackObjectId;
		this.time = json.time;
		this.previousSnapshot = json.previousSnapshot;

	}

}

export { AddLightKeyframeAtPlayheadCommand };
