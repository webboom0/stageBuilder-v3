/**
 * 키보드 단축키 관리 클래스
 * 타임라인 관련 모든 단축키를 중앙에서 관리
 */
export class KeyboardShortcuts {
    constructor(motionTimeline) {
        this.motionTimeline = motionTimeline;
        this.isEnabled = true;

        // 단축키 정의
        this.shortcuts = {
            'Space': {
                description: '재생/일시정지',
                action: () => this.togglePlayPause(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            },
            'KeyK': {
                description: '현재 시간에 키프레임 추가 (모션 객체 / 조명)',
                action: () => this.addKeyframe(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            },
            'KeyD': {
                description: '선택된 키프레임 삭제',
                action: () => this.deleteSelectedKeyframe(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            },
            'KeyM': {
                description: 'Playhead 위치 이동',
                action: () => this.showPlayheadMoveDialog(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            },
            'Escape': {
                description: '정지',
                action: () => this.stop(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            },
            'F1': {
                description: '단축키 도움말 표시',
                action: () => this.showHelp(),
                preventDefault: true,
                conditions: {
                    ctrlKey: false,
                    metaKey: false,
                    shiftKey: false
                }
            }
        };

        this.init();
    }

    init() {
        this.bindEvents();
        console.log('KeyboardShortcuts 초기화 완료');
    }

    bindEvents() {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
    }

    handleKeyDown(e) {
        if (!this.isEnabled) return;

        // 프로젝트 설정 팝업이 열려있을 때는 단축키 무시
        const projectSetupPopup = document.querySelector('.project-setup-overlay');
        if (projectSetupPopup) return;

        // 입력 필드에 포커스가 있으면 단축키 비활성화
        const activeElement = document.activeElement;
        if (this.isInputField(activeElement)) {
            return;
        }

        // Ctrl+Z 디버깅
        // if (e.code === 'KeyZ' && e.ctrlKey) {
        //     console.log("🎯 Ctrl+Z 감지됨:", {
        //         code: e.code,
        //         ctrlKey: e.ctrlKey,
        //         shiftKey: e.shiftKey,
        //         metaKey: e.metaKey
        //     });
        // }

        // Shift+K: 모션 + 조명 동시 키프레임
        if (
            e.code === "KeyK" &&
            e.shiftKey &&
            !e.ctrlKey &&
            !e.metaKey
        ) {
            e.preventDefault();
            this.addKeyframeBoth();
            return;
        }

        // [ / ] — 이전 / 다음 키프레임으로 이동
        if (
            e.code === "BracketLeft" &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            !e.altKey
        ) {
            e.preventDefault();
            this.jumpAdjacentKeyframe("prev");
            return;
        }
        if (
            e.code === "BracketRight" &&
            !e.ctrlKey &&
            !e.metaKey &&
            !e.shiftKey &&
            !e.altKey
        ) {
            e.preventDefault();
            this.jumpAdjacentKeyframe("next");
            return;
        }

        const shortcut = this.shortcuts[e.code];
        if (!shortcut) {
            return; // 로그 제거
        }

        // 조건 확인
        if (shortcut.conditions) {
            for (const [key, value] of Object.entries(shortcut.conditions)) {
                if (e[key] !== value) {
                    return; // 로그 제거
                }
            }
        }

        // 기본 동작 방지
        if (shortcut.preventDefault) {
            e.preventDefault();
        }

        // 액션 실행
        try {
            if (shortcut.code === 'KeyZ' && shortcut.conditions?.ctrlKey) {
                // KeyZ의 경우 shiftKey 상태를 전달
                this.handleKeyZAction(e.shiftKey);
            } else {
                shortcut.action();
            }
        } catch (error) {
            console.error('단축키 실행 중 오류:', error);
        }
    }

    // 입력 필드인지 확인하는 헬퍼 함수
    isInputField(element) {
        if (!element) return false;

        const inputTypes = [
            'input', 'textarea', 'select', 'contenteditable'
        ];

        // input, textarea, select 요소 확인
        if (inputTypes.includes(element.tagName.toLowerCase())) {
            return true;
        }

        // contenteditable 속성 확인
        if (element.contentEditable === 'true') {
            return true;
        }

        // CodeMirror 에디터 확인
        if (element.closest('.CodeMirror')) {
            return true;
        }

        // 특정 클래스나 ID를 가진 입력 필드 확인
        const inputClasses = ['input', 'textarea', 'form-control', 'ui-input', 'totalSeconds', 'seconds'];
        const inputIds = ['seconds', 'search', 'command', 'totalSeconds'];

        if (inputClasses.some(cls => element.classList.contains(cls))) {
            return true;
        }

        if (inputIds.some(id => element.id === id)) {
            return true;
        }

        // 부모 요소에서 입력 필드 관련 클래스 확인
        const parentWithInputClass = element.closest('.input, .textarea, .form-control, .ui-input');
        if (parentWithInputClass) {
            return true;
        }

        return false;
    }

    // 재생/일시정지 토글
    togglePlayPause() {
        console.log("KeyboardShortcuts - 재생/일시정지 토글");

        if (!this.motionTimeline.isPlaying) {
            console.log("재생 시작");
            this.motionTimeline.play();
        } else {
            console.log("일시정지");
            this.motionTimeline.pause();
        }
    }

    getLightTimeline() {
        const editor = this.motionTimeline.editor;
        return (
            editor?.lightTimeline ||
            window.timeline?.timelines?.light ||
            window.lightTimeline ||
            null
        );
    }

    // 조명 키프레임 추가 시도 — { success, message?, skipped?, count? }
    // allAtPlayhead: Shift+K — 선택 없이 플레이헤드 시점의 모든 조명 트랙
    tryAddLightKeyframe({ allAtPlayhead = false } = {}) {
        const lightTimeline = this.getLightTimeline();
        if (!lightTimeline?.addKeyframeAtPlayhead) {
            return { success: false, message: "조명 타임라인을 사용할 수 없습니다." };
        }

        if (allAtPlayhead && lightTimeline.addKeyframesAtPlayheadForAll) {
            return lightTimeline.addKeyframesAtPlayheadForAll();
        }

        const editor = this.motionTimeline.editor;
        const selected = editor?.selected;
        const lightTrackEl = document.querySelector(
            ".light-timeline.timeline-track--selected",
        );
        const trackId =
            lightTrackEl?.dataset?.objectId ||
            (selected?.isLight ? selected.name : null) ||
            (selected?.name?.includes("_Target")
                ? selected.name.replace("_Target", "")
                : null) ||
            (lightTrackEl ? lightTimeline?.selectedTrackId : null);

        if (!trackId && !lightTrackEl) {
            return {
                success: false,
                message: "조명 또는 조명 트랙을 선택하세요.",
            };
        }

        return lightTimeline.addKeyframeAtPlayhead(trackId);
    }

    /** [ / ] — 선택 트랙의 이전·다음 키프레임으로 이동 */
    jumpAdjacentKeyframe(direction) {
        const editor = this.motionTimeline.editor;
        const selected = editor?.selected;
        const motionTrackEl = document.querySelector(
            ".timeline-track--selected[data-uuid]:not(.light-timeline)",
        );
        const lightTrackEl = document.querySelector(
            ".light-timeline.timeline-track--selected",
        );

        if (motionTrackEl?.dataset?.uuid && this.motionTimeline.moveToAdjacentKeyframe) {
            this.motionTimeline.moveToAdjacentKeyframe(motionTrackEl, direction);
            return;
        }

        if (lightTrackEl) {
            const lightTimeline = this.getLightTimeline();
            if (lightTimeline?.moveToAdjacentKeyframe) {
                lightTimeline.moveToAdjacentKeyframe(lightTrackEl, direction);
            }
            return;
        }

        const isLightObject =
            selected?.isLight || selected?.name?.includes("_Target");

        if (isLightObject) {
            const lightTimeline = this.getLightTimeline();
            if (!lightTimeline?.moveToAdjacentKeyframe) return;

            let trackEl = lightTrackEl;
            if (!trackEl && selected?.name) {
                const lightId = selected.name.includes("_Target")
                    ? selected.name.replace("_Target", "")
                    : selected.name;
                trackEl = document.querySelector(
                    `.timeline-track.light-timeline[data-object-id="${lightId}"]`,
                );
            }
            if (trackEl) {
                lightTimeline.moveToAdjacentKeyframe(trackEl, direction);
            }
            return;
        }

        let trackEl = motionTrackEl;
        if (!trackEl && selected?.uuid) {
            trackEl = document.querySelector(
                `.timeline-track[data-uuid="${selected.uuid}"]:not(.light-timeline)`,
            );
        }
        if (trackEl?.dataset?.uuid && this.motionTimeline.moveToAdjacentKeyframe) {
            this.motionTimeline.moveToAdjacentKeyframe(trackEl, direction);
        }
    }

    /** 룰러 플레이헤드 DOM 기준 현재 시간(초) */
    getPlayheadTimeSeconds() {
        const editor = this.motionTimeline.editor;
        const mainTimeline = editor?.timeline;
        const playhead =
            mainTimeline?.container?.querySelector(".playhead") ||
            document.querySelector("#main-timeline .playhead") ||
            document.querySelector(".sb-tl .playhead") ||
            document.querySelector(".playhead");
        const total =
            this.motionTimeline.options?.totalSeconds ||
            mainTimeline?.timelineSettings?.totalSeconds ||
            180;

        if (playhead) {
            const left = parseFloat(playhead.style.left) || 0;
            const time = (left / 100) * total;
            this.motionTimeline.currentTime = time;
            return time;
        }

        return this.motionTimeline.currentTime || 0;
    }

    // 모션 키프레임 추가 시도 — { success, message?, skipped?, count? }
    // allAtPlayhead: Shift+K — 선택 없이 플레이헤드 시점의 모든 모션 트랙
    tryAddMotionKeyframe({ allAtPlayhead = false } = {}) {
        if (allAtPlayhead && this.motionTimeline.addKeyframesAtPlayheadForAll) {
            return this.motionTimeline.addKeyframesAtPlayheadForAll();
        }

        const editor = this.motionTimeline.editor;
        let selected = editor?.selected;

        if (selected?.isLight || selected?.name?.includes("_Target")) {
            const motionTrackEl = document.querySelector(
                ".timeline-track--selected[data-uuid]:not(.light-timeline)",
            );
            if (motionTrackEl?.dataset?.uuid) {
                selected = editor.scene.getObjectByProperty(
                    "uuid",
                    motionTrackEl.dataset.uuid,
                );
            } else {
                return {
                    success: false,
                    message: "모션 객체 또는 모션 트랙을 선택하세요.",
                    skipped: true,
                };
            }
        }

        if (!selected) {
            const motionTrackEl = document.querySelector(
                ".timeline-track--selected[data-uuid]:not(.light-timeline)",
            );
            if (motionTrackEl?.dataset?.uuid) {
                selected = editor.scene.getObjectByProperty(
                    "uuid",
                    motionTrackEl.dataset.uuid,
                );
            }
        }

        if (!selected?.uuid) {
            return {
                success: false,
                message: "모션 객체 또는 모션 트랙을 선택하세요.",
            };
        }

        if (this.motionTimeline.addKeyframeAtPlayhead) {
            return this.motionTimeline.addKeyframeAtPlayhead(selected.uuid);
        }

        const currentTime = this.getPlayheadTimeSeconds();
        const trackElement = this.motionTimeline.container.querySelector(
            `[data-uuid="${selected.uuid}"]`,
        );
        if (!trackElement) {
            return {
                success: false,
                message: "선택된 객체의 모션 트랙이 없습니다.",
            };
        }

        const sprites = trackElement.querySelectorAll(".animation-sprite");
        let isInClipRange = false;
        sprites.forEach((sprite) => {
            const clipLeft = parseFloat(sprite.style.left) || 0;
            const clipStartTime =
                (clipLeft / 100) * this.motionTimeline.options.totalSeconds;
            const clipDuration = parseFloat(sprite.dataset.duration) || 5;
            const clipEndTime = clipStartTime + clipDuration;
            if (currentTime >= clipStartTime && currentTime <= clipEndTime) {
                isInClipRange = true;
            }
        });

        if (!isInClipRange) {
            return {
                success: false,
                message: `모션 클립 밖 (${currentTime.toFixed(2)}s) — 클립 구간 안에서만 추가됩니다.`,
            };
        }

        const value = this.motionTimeline.getKeyframeValue(selected, "position");
        if (!value || !selected.uuid) {
            return { success: false, message: "모션 키프레임 값을 가져올 수 없습니다." };
        }

        const ok = this.motionTimeline.addKeyframe(
            selected.uuid,
            "position",
            currentTime,
            value,
        );
        return ok
            ? { success: true }
            : { success: false, message: "모션 키프레임 추가에 실패했습니다." };
    }

    // Shift+K — 모션 + 조명 동시 키프레임
    addKeyframeBoth() {
        const motionResult = this.tryAddMotionKeyframe({ allAtPlayhead: true });
        const lightResult = this.tryAddLightKeyframe({ allAtPlayhead: true });

        if (motionResult.success && lightResult.success) {
            const motionLabel =
                motionResult.count > 1
                    ? `모션 ${motionResult.count}개`
                    : "모션";
            const lightLabel =
                lightResult.count > 1
                    ? `조명 ${lightResult.count}개`
                    : "조명";
            this.showSuccess(`✓ ${motionLabel} + ${lightLabel} 키프레임 추가됨`);
            return;
        }
        if (motionResult.success) {
            const motionLabel =
                motionResult.count > 1
                    ? `모션 ${motionResult.count}개`
                    : "모션";
            this.showSuccess(
                `✓ ${motionLabel} 키프레임 추가됨 (조명: ${lightResult.message || "실패"})`,
            );
            return;
        }
        if (lightResult.success) {
            const lightLabel =
                lightResult.count > 1
                    ? `조명 ${lightResult.count}개`
                    : "조명";
            this.showSuccess(
                `✓ ${lightLabel} 키프레임 추가됨 (모션: ${motionResult.message || "실패"})`,
            );
            return;
        }

        this.showWarning(
            `키프레임을 추가할 수 없습니다.\n모션: ${motionResult.message}\n조명: ${lightResult.message}`,
        );
    }

    // 키프레임 추가 — 모션 또는 조명 (타임라인 DOM 선택 우선)
    addKeyframe() {
        const motionTrackEl = document.querySelector(
            ".timeline-track--selected[data-uuid]:not(.light-timeline)",
        );
        const lightTrackEl = document.querySelector(
            ".light-timeline.timeline-track--selected",
        );

        if (motionTrackEl?.dataset?.uuid) {
            const result = this.tryAddMotionKeyframe();
            if (result.success) {
                this.showSuccess("✓ 키프레임 추가됨");
            } else {
                this.showWarning(result.message || "키프레임 추가에 실패했습니다.");
            }
            return;
        }

        if (lightTrackEl?.dataset?.objectId) {
            const result = this.tryAddLightKeyframe();
            if (result.success) {
                this.showSuccess("✓ 조명 키프레임 추가됨");
            } else {
                this.showWarning(
                    result.message || "조명 키프레임을 추가할 수 없습니다.",
                );
            }
            return;
        }

        const editor = this.motionTimeline.editor;
        const selected = editor?.selected;
        const isLightObject =
            selected?.isLight || selected?.name?.includes("_Target");

        if (isLightObject) {
            const result = this.tryAddLightKeyframe();
            if (result.success) {
                this.showSuccess("✓ 조명 키프레임 추가됨");
            } else {
                this.showWarning(
                    result.message || "조명 키프레임을 추가할 수 없습니다.",
                );
            }
            return;
        }

        const result = this.tryAddMotionKeyframe();
        if (result.success) {
            this.showSuccess("✓ 키프레임 추가됨");
        } else {
            this.showWarning(result.message || "키프레임 추가에 실패했습니다.");
        }
    }

    // 선택된 키프레임 삭제
    deleteSelectedKeyframe() {
        console.log("KeyboardShortcuts - 선택된 키프레임 삭제");

        // 선택된 키프레임이 있는지 확인
        if (!this.motionTimeline.selectedKeyframe) {
            console.warn("삭제할 키프레임이 선택되지 않았습니다.");
            this.showWarning("삭제할 키프레임을 선택하세요.");
            return;
        }

        // 삭제 전에 선택된 키프레임 정보 저장
        const wasSelected = !!this.motionTimeline.selectedKeyframe;

        // 키프레임 삭제 실행
        this.motionTimeline.deleteSelectedKeyframeByIndex();

        // 삭제가 성공했는지 확인 (selectedKeyframe이 null이 되었는지)
        if (wasSelected && !this.motionTimeline.selectedKeyframe) {
            // 성공 메시지 표시
            this.showSuccess("선택된 키프레임이 삭제되었습니다.");
        }
    }

    // 정지
    stop() {
        console.log("KeyboardShortcuts - 정지");
        this.motionTimeline.stop();
    }

    // 히스토리 관련 메서드들은 Editor.js에서 전역으로 처리됨
    // Ctrl+Z: 되돌리기, Ctrl+Shift+Z: 다시하기

    // // KeyZ 액션 처리 (Ctrl+Z vs Ctrl+Shift+Z)
    // handleKeyZAction(shiftKey) {
    // 	console.log("🎯 handleKeyZAction 호출됨:", { shiftKey });
    // 	if (shiftKey) {
    // 		console.log("🎯 Ctrl+Shift+Z 감지 - 에디터 히스토리 되돌리기");
    // 		this.editorUndo();
    // 	} else {
    // 		console.log("🎯 Ctrl+Z 감지 - 통합 히스토리 되돌리기");
    // 		this.undo();
    // 	}
    // }

    // 에디터 히스토리 되돌리기 (Editor Undo)
    // editorUndo() {
    // 	console.log("KeyboardShortcuts - 에디터 히스토리 되돌리기");

    // 	if (this.motionTimeline.editor && this.motionTimeline.editor.history) {
    // 		try {
    // 			const result = this.motionTimeline.editor.history.undo();
    // 			if (result) {
    // 				console.log("에디터 되돌리기 성공:", result.name);
    // 			this.showSuccess(`✓ 에디터 되돌리기: ${result.name}`);
    // 			} else {
    // 				console.log("에디터 되돌리기할 명령이 없습니다.");
    // 				this.showWarning("에디터 되돌리기할 명령이 없습니다.");
    // 			}
    // 		} catch (error) {
    // 			console.error("에디터 되돌리기 중 오류:", error);
    // 			this.showWarning("에디터 되돌리기 중 오류가 발생했습니다.");
    // 		}
    // 	} else {
    // 		console.warn("에디터 히스토리 시스템을 찾을 수 없습니다.");
    // 		this.showWarning("에디터 히스토리 시스템을 찾을 수 없습니다.");
    // 	}
    // }

    // Playhead 이동 다이얼로그 표시
    showPlayheadMoveDialog() {
        console.log("KeyboardShortcuts - Playhead 이동 다이얼로그 표시");

        // 기존 다이얼로그가 있으면 제거
        const existingDialog = document.querySelector('.playhead-move-dialog');
        if (existingDialog) {
            existingDialog.remove();
        }

        // 현재 시간 정보 가져오기
        const currentTime = this.motionTimeline.currentTime || 0;
        const totalSeconds = this.motionTimeline.options?.totalSeconds || 180;
        const currentFrame = Math.round(currentTime * (this.motionTimeline.options?.framesPerSecond || 30));

        const dialogContainer = document.createElement('div');
        dialogContainer.className = 'playhead-move-dialog';
        dialogContainer.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #2a2a2a;
            border: 1px solid #444;
            border-radius: 8px;
            padding: 20px;
            z-index: 1000;
            min-width: 350px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.5);
            color: #fff;
        `;

        dialogContainer.innerHTML = `
            <div style="margin-bottom: 15px;">
                <h3 style="margin: 0 0 15px 0; color: #fff; border-bottom: 1px solid #444; padding-bottom: 10px;">
                    🎯 Playhead 위치 이동
                </h3>
                <div style="margin-bottom: 15px; color: #888; font-size: 12px;">
                    원하는 시간으로 Playhead를 이동할 수 있습니다.
                </div>
                
                <div style="margin-bottom: 15px;">
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; color: #ccc;">시간 (초):</label>
                        <input type="number" id="playhead-time-input" min="0" max="${totalSeconds}" step="0.1" value="${currentTime.toFixed(1)}" 
                               style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <span style="color: #888; font-size: 11px;">0초 ~ ${totalSeconds}초 (${Math.floor(totalSeconds / 60)}분)</span>
                    </div>
                    
                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; color: #ccc;">프레임:</label>
                        <input type="number" id="playhead-frame-input" min="0" max="${Math.round(totalSeconds * (this.motionTimeline.options?.framesPerSecond || 30))}" value="${currentFrame}" 
                               style="width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; border-radius: 4px;">
                        <span style="color: #888; font-size: 11px;">0 ~ ${Math.round(totalSeconds * (this.motionTimeline.options?.framesPerSecond || 30))} 프레임</span>
                    </div>
                </div>
                
                <div style="margin-bottom: 15px; padding: 10px; background: #333; border-radius: 4px;">
                    <span style="color: #ccc; font-size: 12px;">현재 위치: <span style="color: #4CAF50; font-weight: bold;">${this.formatTime(currentTime)}</span> (프레임 ${currentFrame})</span>
                </div>
            </div>
            <div style="display: flex; gap: 10px; justify-content: flex-end;">
                <button id="playhead-move-cancel" style="padding: 8px 16px; background: #555; border: none; color: #fff; border-radius: 4px; cursor: pointer;">취소</button>
                <button id="playhead-move-apply" style="padding: 8px 16px; background: #007acc; border: none; color: #fff; border-radius: 4px; cursor: pointer;">이동</button>
            </div>
        `;

        document.body.appendChild(dialogContainer);

        // 입력 필드 참조
        const timeInput = dialogContainer.querySelector('#playhead-time-input');
        const frameInput = dialogContainer.querySelector('#playhead-frame-input');
        const fps = this.motionTimeline.options?.framesPerSecond || 30;

        // 시간 입력 시 프레임 자동 업데이트
        timeInput.addEventListener('input', () => {
            const time = parseFloat(timeInput.value) || 0;
            const frame = Math.round(time * fps);
            frameInput.value = frame;
        });

        // 프레임 입력 시 시간 자동 업데이트
        frameInput.addEventListener('input', () => {
            const frame = parseInt(frameInput.value) || 0;
            const time = frame / fps;
            timeInput.value = time.toFixed(1);
        });

        // 이동 버튼 이벤트
        const applyBtn = dialogContainer.querySelector('#playhead-move-apply');
        applyBtn.addEventListener('click', () => {
            const time = parseFloat(timeInput.value) || 0;
            const clampedTime = Math.max(0, Math.min(totalSeconds, time));

            console.log(`Playhead를 ${clampedTime}초로 이동`);

            // Playhead 이동 - 메인 Timeline 인스턴스 사용
            const mainTimeline = this.motionTimeline.editor?.timeline;
            if (mainTimeline && mainTimeline.setCurrentFrame) {
                mainTimeline.setCurrentFrame(Math.round(clampedTime * fps), true);
            } else {
                // 대안: MotionTimeline의 직접적인 방법 사용
                const frame = Math.round(clampedTime * fps);
                this.motionTimeline.setCurrentFrame?.(frame, true);
                this.motionTimeline.updatePlayheadPosition?.(clampedTime / totalSeconds * 100);
            }

            // 속성패널 닫기
            const propertyPanel = document.querySelector('.property-panel');
            if (propertyPanel) {
                propertyPanel.style.display = 'none';
            }

            // 다이얼로그 닫기
            dialogContainer.remove();

            // 성공 메시지 표시
            this.showSuccess(`Playhead가 ${this.formatTime(clampedTime)}로 이동되었습니다.`);
        });

        // 취소 버튼 이벤트
        const cancelBtn = dialogContainer.querySelector('#playhead-move-cancel');
        cancelBtn.addEventListener('click', () => {
            dialogContainer.remove();
        });

        // ESC 키로 닫기
        const handleEscape = (e) => {
            if (e.key === 'Escape') {
                dialogContainer.remove();
                document.removeEventListener('keydown', handleEscape);
            }
        };
        document.addEventListener('keydown', handleEscape);

        // 외부 클릭으로 닫기 (약간의 지연을 두고 등록하여 이벤트 전파 방지)
        setTimeout(() => {
            const closeOnOutsideClick = (e) => {
                if (!dialogContainer.contains(e.target)) {
                    dialogContainer.remove();
                    document.removeEventListener('click', closeOnOutsideClick);
                }
            };
            document.addEventListener('click', closeOnOutsideClick);
        }, 200);

        // Enter 키로 이동
        const handleEnter = (e) => {
            if (e.key === 'Enter') {
                const time = parseFloat(timeInput.value) || 0;
                const clampedTime = Math.max(0, Math.min(totalSeconds, time));

                // Playhead 이동 - 메인 Timeline 인스턴스 사용
                const mainTimeline = this.motionTimeline.editor?.timeline;
                if (mainTimeline && mainTimeline.setCurrentFrame) {
                    mainTimeline.setCurrentFrame(Math.round(clampedTime * fps), true);
                } else {
                    // 대안: MotionTimeline의 직접적인 방법 사용
                    const frame = Math.round(clampedTime * fps);
                    this.motionTimeline.setCurrentFrame?.(frame, true);
                    this.motionTimeline.updatePlayheadPosition?.(clampedTime / totalSeconds * 100);
                }

                // 속성패널 닫기
                const propertyPanel = document.querySelector('.property-panel');
                if (propertyPanel) {
                    propertyPanel.style.display = 'none';
                }

                dialogContainer.remove();
                this.showSuccess(`Playhead가 ${this.formatTime(clampedTime)}로 이동되었습니다.`);

                document.removeEventListener('keydown', handleEnter);
            }
        };
        document.addEventListener('keydown', handleEnter);

        // 포커스를 시간 입력 필드에 설정
        timeInput.focus();
        timeInput.select();
    }

    // 시간 포맷팅 헬퍼 메서드
    formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = Math.floor(seconds % 60);
        const milliseconds = Math.floor((seconds % 1) * 100);
        return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(2, '0')}`;
    }

    // 도움말 표시
    showHelp() {
        // 기존 도움말이 있으면 제거
        const existingHelp = document.querySelector('.keyboard-shortcuts-help');
        if (existingHelp) {
            existingHelp.remove();
        }

        const help = document.createElement('div');
        help.className = 'keyboard-shortcuts-help';
        help.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: white;
            border: 2px solid #333;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            max-width: 400px;
            min-width: 300px;
        `;

        const shortcutsList = Object.entries(this.shortcuts)
            .map(([key, shortcut]) => `<div style="margin-bottom: 8px;"><strong>${this.getKeyDisplayName(key)}</strong> - ${shortcut.description}</div>`)
            .join('');

        help.innerHTML = `
            <h3 style="margin: 0 0 15px 0; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 10px;">
                🎬 타임라인 단축키
            </h3>
            <div style="line-height: 1.6;">
                ${shortcutsList}
                <div style="margin-bottom: 8px;"><strong>Shift+K</strong> - 플레이헤드 시점의 모든 모션·조명 트랙에 키프레임 동시 추가</div>
                <div style="margin-bottom: 8px;"><strong>[</strong> - 이전 키프레임 · <strong>]</strong> - 다음 키프레임</div>
            </div>
            <div style="margin-top: 15px; padding-top: 10px; border-top: 1px solid #ccc; font-size: 12px; color: #666;">
                💡 <strong>K 키 사용법:</strong><br>
                • <strong>K</strong>: 선택한 모션 객체 또는 조명에 키프레임<br>
                • <strong>Shift+K</strong>: 플레이헤드가 클립 안에 있는 모든 모션·조명 트랙에 동시 키프레임<br>
                • <strong>[</strong> / <strong>]</strong>: 선택 트랙의 이전·다음 키프레임으로 이동<br>
                1. 객체/조명 선택 (또는 타임라인 트랙 선택)<br>
                2. playhead를 원하는 시간으로 이동<br>
                3. K 또는 Shift+K<br><br>
                                 💡 <strong>히스토리 단축키:</strong><br>
                 • Ctrl+Z: 모든 작업 되돌리기 (통합)<br>
                 • Ctrl+Y: 되돌린 작업 다시하기 (통합)<br>
                 • Ctrl+Shift+Z: 에디터 작업 되돌리기
            </div>
            <button onclick="this.parentElement.remove()" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: #ff6b6b;
                color: white;
                border: none;
                border-radius: 50%;
                width: 25px;
                height: 25px;
                cursor: pointer;
                font-size: 16px;
                line-height: 1;
            ">×</button>
        `;

        document.body.appendChild(help);

        // ESC 키나 클릭으로 닫기
        const closeHelp = (e) => {
            if (e.code === "Escape" || e.target === help) {
                help.remove();
                document.removeEventListener("keydown", closeHelp);
                document.removeEventListener("click", closeHelp);
            }
        };

        document.addEventListener("keydown", closeHelp);
        document.addEventListener("click", closeHelp);
    }

    // 키 표시 이름 변환
    getKeyDisplayName(keyCode) {
        const keyNames = {
            'Space': 'Space',
            'KeyK': 'K',
            'KeyD': 'D',
            'KeyM': 'M',
            'KeyZ': 'Ctrl+Z',
            'KeyY': 'Ctrl+Y',
            'Escape': 'ESC',
            'F1': 'F1'
        };
        return keyNames[keyCode] || keyCode;
    }

    // 성공 메시지 표시
    showSuccess(message) {
        this.showNotification(message, '#4CAF50');
    }

    // 경고 메시지 표시
    showWarning(message) {
        this.showNotification(message, '#ff9800');
    }

    // 알림 표시
    showNotification(message, color) {
        // 기존 알림이 있으면 제거
        const existingNotification = document.querySelector('.keyboard-notification');
        if (existingNotification) {
            existingNotification.remove();
        }

        const notification = document.createElement('div');
        notification.className = 'keyboard-notification';
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: ${color};
            color: white;
            padding: 8px 16px;
            border-radius: 4px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            z-index: 10000;
            font-family: Arial, sans-serif;
            font-size: 14px;
            animation: fadeInOut 1s ease-in-out;
        `;

        notification.textContent = message;

        // CSS 애니메이션 추가
        if (!document.querySelector('#keyboard-notification-style')) {
            const style = document.createElement('style');
            style.id = 'keyboard-notification-style';
            style.textContent = `
                @keyframes fadeInOut {
                    0% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                    20% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    80% { opacity: 1; transform: translateX(-50%) translateY(0); }
                    100% { opacity: 0; transform: translateX(-50%) translateY(-10px); }
                }
            `;
            document.head.appendChild(style);
        }

        document.body.appendChild(notification);

        // 0.8초 후 자동 제거 (더 빠르게 사라지도록)
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 800);
    }

    // 단축키 활성화/비활성화
    enable() {
        this.isEnabled = true;
        console.log('키보드 단축키 활성화');
    }

    disable() {
        this.isEnabled = false;
        console.log('키보드 단축키 비활성화');
    }

    // 단축키 추가
    addShortcut(keyCode, shortcut) {
        this.shortcuts[keyCode] = shortcut;
        console.log(`단축키 추가: ${keyCode}`);
    }

    // 단축키 제거
    removeShortcut(keyCode) {
        delete this.shortcuts[keyCode];
        console.log(`단축키 제거: ${keyCode}`);
    }

    // 현재 단축키 목록 반환
    getShortcuts() {
        return this.shortcuts;
    }
} 