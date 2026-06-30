import { UIPanel, UIRow } from './libs/ui.js';

function MenubarHelp( editor ) {

	const strings = editor.strings;

	const container = new UIPanel();
	container.setClass( 'menu' );

	const title = new UIPanel();
	title.setClass( 'title' );
	title.setTextContent( strings.getKey( 'menubar/help' ) );
	container.add( title );

	const options = new UIPanel();
	options.setClass( 'options' );
	container.add( options );

	// Source code
/*
	let option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/help/source_code' ) );
	option.onClick( function () {

		window.open( 'https://github.com/mrdoob/three.js/tree/master/editor', '_blank' );

	} );
	options.add( option );
*/
	/*
	// Icon

	let option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/help/icons' ) );
	option.onClick( function () {

		window.open( 'https://www.flaticon.com/packs/interface-44', '_blank' );

	} );
	options.add( option );
	*/

	// About
/*
	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/help/about' ) );
	option.onClick( function () {

		window.open( 'https://threejs.org', '_blank' );

	} );
	options.add( option );
*/
	// Manual
/*
	option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( strings.getKey( 'menubar/help/manual' ) );
	option.onClick( function () {

		window.open( 'https://github.com/mrdoob/three.js/wiki/Editor-Manual', '_blank' );

	} );
	options.add( option );
*/
	let option = new UIRow();
	option.setClass( 'option' );
	option.setTextContent( '타임라인 단축키 (F1)' );
	option.onClick( function () {

		// MotionTimeline의 KeyboardShortcuts를 통해 도움말 팝업 표시
		if (editor.motionTimeline && editor.motionTimeline.keyboardShortcuts) {
			editor.motionTimeline.keyboardShortcuts.showHelp();
		} else {
			// fallback: F1 키 이벤트를 시뮬레이션
			const f1Event = new KeyboardEvent('keydown', {
				key: 'F1',
				keyCode: 112,
				which: 112,
				bubbles: true,
				cancelable: true
			});
			document.dispatchEvent(f1Event);
		}

	} );
	options.add( option );

	return container;

}

export { MenubarHelp };
