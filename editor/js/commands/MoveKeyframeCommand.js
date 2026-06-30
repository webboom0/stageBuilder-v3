import { Command } from '../Command.js';

class MoveKeyframeCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {string} objectId - 객체 ID (UUID)
	 * @param {string} property - 속성명 (position, rotation, scale 등)
	 * @param {number} oldTime - 이전 시간
	 * @param {number} newTime - 새로운 시간
	 * @param {Object} value - 키프레임 값
	 * @constructor
	 */
	constructor( editor, objectId = '', property = '', oldTime = 0, newTime = 0, value = null ) {

		super( editor );

		this.type = 'MoveKeyframeCommand';
		this.name = editor.strings.getKey( 'command/MoveKeyframe' ) + ': ' + property;
		this.updatable = false;

		this.objectId = objectId;
		this.property = property;
		this.oldTime = oldTime;
		this.newTime = newTime;
		this.value = value;
		this.oldKeyframe = null;

	}

	execute() {

		console.log("🔄 MoveKeyframeCommand.execute() 호출됨:", {
			objectId: this.objectId,
			property: this.property,
			oldTime: this.oldTime,
			newTime: this.newTime
		});

		// 키프레임 이동을 위한 시그널만 발생 (실제 동작은 MotionTimeline에서 처리)
		if ( this.editor && this.editor.signals ) {
			// 키프레임 이동 요청 시그널 발생
			this.editor.signals.moveKeyframeRequested.dispatch({
				objectId: this.objectId,
				property: this.property,
				oldTime: this.oldTime,
				newTime: this.newTime,
				value: this.value
			});
			// 타임라인 UI 업데이트
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	// 이 메서드는 더 이상 사용하지 않음 (시그널 기반으로 변경)

	undo() {

		console.log("🔄 MoveKeyframeCommand.undo() 호출됨:", {
			objectId: this.objectId,
			property: this.property,
			oldTime: this.oldTime,
			newTime: this.newTime
		});

		// 키프레임 원래 위치로 복원을 위한 시그널만 발생 (실제 동작은 MotionTimeline에서 처리)
		if ( this.editor && this.editor.signals ) {
			// 키프레임 원래 위치로 복원 요청 시그널 발생
			this.editor.signals.moveKeyframeRequested.dispatch({
				objectId: this.objectId,
				property: this.property,
				oldTime: this.newTime,
				newTime: this.oldTime,
				value: this.value
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
		output.oldTime = this.oldTime;
		output.newTime = this.newTime;
		output.value = this.value;
		output.oldKeyframe = this.oldKeyframe;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.objectId = json.objectId;
		this.property = json.property;
		this.oldTime = json.oldTime;
		this.newTime = json.newTime;
		this.value = json.value;
		this.oldKeyframe = json.oldKeyframe;

	}

}

export { MoveKeyframeCommand };
