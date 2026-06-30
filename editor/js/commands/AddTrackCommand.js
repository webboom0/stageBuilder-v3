import { Command } from '../Command.js';

class AddTrackCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {string} objectId - 객체 ID (UUID)
	 * @param {string} property - 속성명 (position, rotation, scale 등)
	 * @constructor
	 */
	constructor( editor, objectId = '', property = '' ) {

		super( editor );

		this.type = 'AddTrackCommand';
		this.name = editor.strings.getKey( 'command/AddTrack' ) + ': ' + property;
		this.updatable = false;

		this.objectId = objectId;
		this.property = property;
		this.oldTrack = null;
		this.trackData = null;

	}

	execute() {

		console.log("🔄 AddTrackCommand.execute() 호출됨:", {
			objectId: this.objectId,
			property: this.property
		});

		// 트랙 추가를 위한 시그널 발생 (실제 동작은 MotionTimeline에서 처리)
		if ( this.editor && this.editor.signals ) {
			// 트랙 추가 요청 시그널 발생
			this.editor.signals.addTrackRequested.dispatch({
				objectId: this.objectId,
				property: this.property
			});
			// 타임라인 UI 업데이트
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	undo() {

		console.log("🔄 AddTrackCommand.undo() 호출됨:", {
			objectId: this.objectId,
			property: this.property
		});

		// 트랙 제거를 위한 시그널만 발생 (실제 동작은 MotionTimeline에서 처리)
		if ( this.editor && this.editor.signals ) {
			// 트랙 제거 요청 시그널 발생
			this.editor.signals.removeTrackRequested.dispatch({
				objectId: this.objectId,
				property: this.property
			});
			// 타임라인 UI 업데이트
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	// 이 메서드는 더 이상 사용하지 않음 (시그널 기반으로 변경)

	toJSON() {

		const output = super.toJSON( this );

		output.objectId = this.objectId;
		output.property = this.property;
		output.oldTrack = this.oldTrack;
		output.trackData = this.trackData;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.objectId = json.objectId;
		this.property = json.property;
		this.oldTrack = json.oldTrack;
		this.trackData = json.trackData;

	}

}

export { AddTrackCommand };
