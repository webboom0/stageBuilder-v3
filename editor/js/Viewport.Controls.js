import { UIPanel, UISelect, UIText } from './libs/ui.js';

import {
	GRID_MODE_ADAPTIVE,
	GRID_MODE_FIXED,
} from './utils/stageGridAdaptive.js';

function ViewportControls( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setId( 'viewport-controls' );
	container.dom.classList.add( 'menubar-viewport-controls' );
	container.setColor( '#ffffff' );
	container.setStyle( 'display', [ 'flex' ] );
	container.setStyle( 'flex-direction', [ 'row' ] );
	container.setStyle( 'align-items', [ 'center' ] );
	container.setStyle( 'gap', [ '6px' ] );
	container.setStyle( 'flex-shrink', [ '0' ] );
	container.setStyle( 'margin-left', [ 'auto' ] );
	container.setStyle( 'padding', [ '0 8px' ] );
	container.setStyle( 'height', [ '26px' ] );
	container.setStyle( 'box-sizing', [ 'border-box' ] );
	container.setStyle( 'pointer-events', [ 'auto' ] );

	// camera

	const cameraSelect = new UISelect();

	cameraSelect.onChange( function () {

		editor.setViewportCamera( this.getValue() );

	} );
	container.add( cameraSelect );

	signals.cameraAdded.add( update );
	signals.cameraRemoved.add( update );
	signals.objectChanged.add( function ( object ) {

		if ( object.isCamera ) {

			update();

		}

	} );

	// shading

	const shadingSelect = new UISelect();
	shadingSelect.setOptions( { 'realistic': 'realistic', 'solid': 'solid', 'normals': 'normals', 'wireframe': 'wireframe' } );
	shadingSelect.setValue( 'solid' );
	shadingSelect.onChange( function () {

		editor.setViewportShading( this.getValue() );

	} );
	container.add( shadingSelect );

	// grid mode (adaptive / fixed 1m display)

	const gridModeSelect = new UISelect();
	gridModeSelect.setStyle( 'width', [ '168px' ] );
	gridModeSelect.setOptions( {
		[ GRID_MODE_ADAPTIVE ]: strings.getKey( 'viewport/controls/gridAdaptive' ),
		[ GRID_MODE_FIXED ]: strings.getKey( 'viewport/controls/gridFixed' ),
	} );
	gridModeSelect.setValue(
		editor.config.getKey( 'viewport/gridMode' ) ?? GRID_MODE_FIXED,
	);
	gridModeSelect.onChange( function () {

		if ( typeof container.setGridMode === 'function' ) {

			container.setGridMode( this.getValue() );

		}

	} );
	container.add( gridModeSelect );

	container.syncGridModeSelect = function ( mode ) {

		gridModeSelect.setValue( mode );

	};

	const gridScaleText = new UIText( '' );
	gridScaleText.setFontSize( '11px' );
	gridScaleText.setOpacity( 0.88 );
	container.add( gridScaleText );

	signals.sceneRendered.add( function () {

		const scale = editor.viewportGridScale;

		if ( scale ) {

			gridScaleText.setValue(
				`${ strings.getKey( 'viewport/info/gridScale' ) }: ${ scale.label }`,
			);

		} else {

			gridScaleText.setValue( '' );

		}

	} );

	signals.editorCleared.add( function () {

		editor.setViewportCamera( editor.camera.uuid );

		shadingSelect.setValue( 'solid' );
		editor.setViewportShading( shadingSelect.getValue() );

	} );

	signals.cameraResetted.add( update );

	update();

	//

	function update() {

		const options = {};

		const cameras = editor.cameras;

		for ( const key in cameras ) {

			const camera = cameras[ key ];
			options[ camera.uuid ] = camera.name;

		}

		cameraSelect.setOptions( options );

		const selectedCamera = ( editor.viewportCamera.uuid in options )
			? editor.viewportCamera
			: editor.camera;

		cameraSelect.setValue( selectedCamera.uuid );
		editor.setViewportCamera( selectedCamera.uuid );

	}

	return container;

}

export { ViewportControls };
