import { UIHorizontalRule, UIPanel, UIRow } from './libs/ui.js';
import { bindMenubarSubmenu } from './utils/menubarSubmenu.js';
import {
	applyCameraPreset,
	setCeilingTransparencyForTopView,
	STAGE_CAMERA_PRESETS
} from './stageCameraView.js';
import {
	GRID_MODE_ADAPTIVE,
	GRID_MODE_FIXED,
} from './utils/stageGridAdaptive.js';

function MenubarView(editor) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setClass('menu');

	const title = new UIPanel();
	title.setClass('title');
	title.setTextContent(strings.getKey('menubar/view'));
	container.add(title);

	const options = new UIPanel();
	options.setClass('options');
	container.add(options);

	// Helpers

	const states = editor.viewportHelperStates ?? {
		gridHelper: false,
		guideHelper: false,
		cameraHelpers: false,
		lightHelpers: false,
		skeletonHelpers: false
	};
	editor.viewportHelperStates = states;

	let gridHelperRow;
	let guideHelperRow;
	let skeletonHelperRow;

	// === 도우미 메뉴 (2단계) ===
	const helperSubmenuTitle = new UIRow()
		.setTextContent('도우미')
		.addClass('option')
		.addClass('submenu-title');
	options.add(helperSubmenuTitle);

	const helperSubmenu = new UIPanel()
		.setPosition('fixed')
		.addClass('options')
		.addClass('options--submenu')
		.setDisplay('none');
	container.add(helperSubmenu);
	bindMenubarSubmenu(helperSubmenuTitle, helperSubmenu, container);

	// Grid Helper
	gridHelperRow = new UIRow().addClass('option').addClass('toggle').setTextContent('그리드 도우미').onClick(function () {
		states.gridHelper = !states.gridHelper;
		this.toggleClass('toggle-on', states.gridHelper);
		signals.showHelpersChanged.dispatch({ ...states });
	}).toggleClass('toggle-on', states.gridHelper);
	helperSubmenu.add(gridHelperRow);

	let viewportGridMode =
		editor.config.getKey('viewport/gridMode') ?? GRID_MODE_FIXED;

	function applyViewportGridMode(mode) {
		viewportGridMode = mode;
		editor.config.setKey('viewport/gridMode', mode);
		if (typeof editor.setViewportGridMode === 'function') {
			editor.setViewportGridMode(mode);
		}
		gridModeAdaptiveRow.toggleClass('toggle-on', mode === GRID_MODE_ADAPTIVE);
		gridModeFixedRow.toggleClass('toggle-on', mode === GRID_MODE_FIXED);
	}

	const gridModeAdaptiveRow = new UIRow()
		.addClass('option')
		.addClass('toggle')
		.setTextContent(strings.getKey('menubar/view/gridAdaptive'))
		.onClick(function () {
			applyViewportGridMode(GRID_MODE_ADAPTIVE);
		})
		.toggleClass('toggle-on', viewportGridMode === GRID_MODE_ADAPTIVE);
	helperSubmenu.add(gridModeAdaptiveRow);

	const gridModeFixedRow = new UIRow()
		.addClass('option')
		.addClass('toggle')
		.setTextContent(strings.getKey('menubar/view/gridFixed'))
		.onClick(function () {
			applyViewportGridMode(GRID_MODE_FIXED);
		})
		.toggleClass('toggle-on', viewportGridMode === GRID_MODE_FIXED);
	helperSubmenu.add(gridModeFixedRow);

	// Guide Helper
	guideHelperRow = new UIRow().addClass('option').addClass('toggle').setTextContent('가이드 도우미').onClick(function () {
		states.guideHelper = !states.guideHelper;
		this.toggleClass('toggle-on', states.guideHelper);
		signals.showHelpersChanged.dispatch({ ...states });
	}).toggleClass('toggle-on', states.guideHelper);
	helperSubmenu.add(guideHelperRow);

	// Skeleton Helpers
	skeletonHelperRow = new UIRow().addClass('option').addClass('toggle').setTextContent('골격 도우미').onClick(function () {
		states.skeletonHelpers = !states.skeletonHelpers;
		this.toggleClass('toggle-on', states.skeletonHelpers);
		signals.showHelpersChanged.dispatch({ ...states });
	}).toggleClass('toggle-on', states.skeletonHelpers);
	helperSubmenu.add(skeletonHelperRow);

	signals.showHelpersChanged.add(function (appearanceStates) {
		Object.assign(states, appearanceStates);
		gridHelperRow?.toggleClass('toggle-on', states.gridHelper);
		guideHelperRow?.toggleClass('toggle-on', states.guideHelper);
		skeletonHelperRow?.toggleClass('toggle-on', states.skeletonHelpers);
	});

	// 초기 상태 적용 (모든 도우미 숨김)
	signals.showHelpersChanged.dispatch({ ...states });

	options.add(new UIHorizontalRule());

	// === 카메라 메뉴 (2단계) ===
	const cameraSubmenuTitle = new UIRow()
		.setTextContent('카메라')
		.addClass('option')
		.addClass('submenu-title');
	options.add(cameraSubmenuTitle);

	const cameraSubmenu = new UIPanel()
		.setPosition('fixed')
		.addClass('options')
		.addClass('options--submenu')
		.setDisplay('none');
	container.add(cameraSubmenu);
	bindMenubarSubmenu(cameraSubmenuTitle, cameraSubmenu, container);

	let option;

	// 원근 시점
	option = new UIRow().addClass('option').setTextContent('원근 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, false);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.perspective);

	});
	cameraSubmenu.add(option);

	// 객석 시점
	option = new UIRow().addClass('option').setTextContent('객석 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, false);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.audience);

	});
	cameraSubmenu.add(option);

	// 정면 시점
	option = new UIRow().addClass('option').setTextContent('정면 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, false);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.front);

	});
	cameraSubmenu.add(option);

	// 우측 시점
	option = new UIRow().addClass('option').setTextContent('우측 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, false);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.right);

	});
	cameraSubmenu.add(option);

	// 좌측 시점
	option = new UIRow().addClass('option').setTextContent('좌측 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, false);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.left);

	});
	cameraSubmenu.add(option);

	// 상단 시점
	option = new UIRow().addClass('option').setTextContent('상단 시점').onClick(function () {

		setCeilingTransparencyForTopView(editor, true);
		applyCameraPreset(editor, STAGE_CAMERA_PRESETS.top);

	});
	cameraSubmenu.add(option);

	//

	options.add(new UIHorizontalRule());

	// Fullscreen

	option = new UIRow();
	option.setClass('option');
	option.setTextContent(strings.getKey('menubar/view/fullscreen'));
	option.onClick(function () {

		if (document.fullscreenElement === null) {

			document.documentElement.requestFullscreen();

		} else if (document.exitFullscreen) {

			document.exitFullscreen();

		}

		// Safari

		if (document.webkitFullscreenElement === null) {

			document.documentElement.webkitRequestFullscreen();

		} else if (document.webkitExitFullscreen) {

			document.webkitExitFullscreen();

		}

	});
	options.add(option);

	// XR (Work in progress)

	if ('xr' in navigator) {

		if ('offerSession' in navigator.xr) {

			signals.offerXR.dispatch('immersive-ar');

		} else {

			navigator.xr.isSessionSupported('immersive-ar')
				.then(function (supported) {

					if (supported) {

						const option = new UIRow();
						option.setClass('option');
						option.setTextContent('AR');
						option.onClick(function () {

							signals.enterXR.dispatch('immersive-ar');

						});
						options.add(option);

					} else {

						navigator.xr.isSessionSupported('immersive-vr')
							.then(function (supported) {

								if (supported) {

									const option = new UIRow();
									option.setClass('option');
									option.setTextContent('VR');
									option.onClick(function () {

										signals.enterXR.dispatch('immersive-vr');

									});
									options.add(option);

								}

							});

					}

				});

		}

	}

	//

	return container;

}

export { MenubarView };
