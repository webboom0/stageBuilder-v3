import { Command } from '../Command.js';

class RemoveTrackCommand extends Command {

	/**
	 * @param {Editor} editor
	 * @param {string} objectId - 객체 ID (UUID)
	 * @param {string} property - 속성명 (position, rotation, scale 등)
	 * @constructor
	 */
	constructor( editor, objectId = '', property = '' ) {

		super( editor );

		this.type = 'RemoveTrackCommand';
		this.name = editor.strings.getKey( 'command/RemoveTrack' ) + ': ' + property;
		this.updatable = false;

		this.objectId = objectId;
		this.property = property;
		this.removedTrack = null;
		this.removedTracks = null;

	}

	execute() {

		console.log("🔄 RemoveTrackCommand.execute() 호출됨:", {
			objectId: this.objectId,
			property: this.property
		});

		// 트랙 제거 전에 현재 트랙 데이터 백업 (모든 속성)
		if (this.editor && this.editor.motionTimeline && this.editor.motionTimeline.timelineData) {
			const objectTracks = this.editor.motionTimeline.timelineData.tracks.get(this.objectId);
			if (objectTracks) {
				this.removedTracks = {};
				for (const [prop, trackData] of objectTracks) {
					if (typeof trackData.toJSON === 'function') {
						this.removedTracks[prop] = trackData.toJSON();
					}
				}
				if (objectTracks.has(this.property)) {
					const trackData = objectTracks.get(this.property);
					this.removedTrack = trackData.toJSON();
				}
				console.log("🔒 트랙 데이터 백업 완료:", Object.keys(this.removedTracks));
			}
		}

		// 트랙 제거 전에 히스토리에서 관련된 키프레임 명령들 정리
		if (this.editor && this.editor.history) {
			this._cleanupRelatedHistory();
		}

		// 트랙 제거를 위한 시그널 발생 (실제 동작은 MotionTimeline에서 처리)
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

	// 히스토리에서 관련된 키프레임 명령들 정리
	_cleanupRelatedHistory() {
		console.log("🧹 히스토리 정리 시작:", {
			objectId: this.objectId,
			property: this.property
		});

		try {
			if (!this.editor.history || !this.editor.history.undos) {
				console.warn("⚠️ 히스토리에 접근할 수 없음");
				return;
			}

			// 히스토리에서 제거할 명령들의 인덱스 수집
			const indicesToRemove = [];
			const undos = this.editor.history.undos;

			for (let i = undos.length - 1; i >= 0; i--) {
				const command = undos[i];
				
				// 키프레임 관련 명령이고 같은 객체에 대한 것인지 확인
				if (this._isRelatedKeyframeCommand(command)) {
					console.log(`🗑️ 관련 명령 발견 (인덱스 ${i}):`, {
						type: command.type,
						objectId: command.objectId,
						property: command.property
					});
					indicesToRemove.push(i);
				}
			}

			// 수집된 명령들을 제거 (뒤에서부터 제거하여 인덱스 변화 방지)
			indicesToRemove.sort((a, b) => b - a).forEach(index => {
				const removedCommand = undos.splice(index, 1)[0];
				console.log(`✅ 히스토리에서 제거됨:`, {
					type: removedCommand.type,
					objectId: removedCommand.objectId,
					property: removedCommand.property
				});
			});

			console.log(`🧹 히스토리 정리 완료: ${indicesToRemove.length}개 명령 제거됨`);
		} catch (error) {
			console.error("히스토리 정리 중 오류:", error);
		}
	}

	// 명령이 관련된 키프레임 명령인지 확인
	_isRelatedKeyframeCommand(command) {
		if (!command || !command.objectId) return false;

		// 같은 객체에 대한 명령인지 확인
		if (command.objectId !== this.objectId) return false;

		// 키프레임 관련 명령 타입인지 확인
		const keyframeCommandTypes = [
			'AddKeyframeCommand',
			'RemoveKeyframeCommand', 
			'MoveKeyframeCommand'
		];

		return keyframeCommandTypes.includes(command.type);
	}

	undo() {

		console.log("🔄 RemoveTrackCommand.undo() 호출됨:", {
			objectId: this.objectId,
			property: this.property,
			backupKeys: this.removedTracks ? Object.keys(this.removedTracks) : [],
		});

		if ( this.editor && this.editor.signals ) {
			if (this.removedTracks && Object.keys(this.removedTracks).length > 0) {
				this.editor.signals.addTrackRequested.dispatch({
					objectId: this.objectId,
					restoreAll: true,
					tracksBackup: this.removedTracks,
				});
			} else {
				this.editor.signals.addTrackRequested.dispatch({
					objectId: this.objectId,
					property: this.property,
					trackData: this.removedTrack,
				});
			}
			this.editor.signals.timelineChanged.dispatch();
		}

	}

	// 이 메서드는 더 이상 사용하지 않음 (시그널 기반으로 변경)

	toJSON() {

		const output = super.toJSON( this );

		output.objectId = this.objectId;
		output.property = this.property;
		output.removedTrack = this.removedTrack;
		output.removedTracks = this.removedTracks;

		return output;

	}

	fromJSON( json ) {

		super.fromJSON( json );

		this.objectId = json.objectId;
		this.property = json.property;
		this.removedTrack = json.removedTrack;
		this.removedTracks = json.removedTracks;

	}

}

export { RemoveTrackCommand };
