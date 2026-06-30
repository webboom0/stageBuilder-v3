import * as THREE from 'three';
import { UIPanel, UIButton, UICheckbox } from './libs/ui.js';
import {
	applyCameraPreset,
	setCeilingTransparencyForTopView,
	STAGE_CAMERA_PRESETS
} from './stageCameraView.js';

function Toolbar( editor ) {

	const signals = editor.signals;
	const strings = editor.strings;

	const container = new UIPanel();
	container.setId( 'toolbar' );

	function createSvgIcon( svg, title ) {
		const span = document.createElement( 'span' );
		span.className = 'toolbar-svg-icon';
		span.innerHTML = svg;
		span.title = title;
		return span;
	}

	// translate / rotate / scale

	const translateIcon = document.createElement( 'img' );
	translateIcon.title = strings.getKey( 'toolbar/translate' );
	translateIcon.src = 'images/translate.svg';

	const translate = new UIButton();
	translate.dom.className = 'Button selected';
	translate.dom.appendChild( translateIcon );
	translate.onClick( function () {

		signals.transformModeChanged.dispatch( 'translate' );

	} );
	container.add( translate );

	const rotateIcon = document.createElement( 'img' );
	rotateIcon.title = strings.getKey( 'toolbar/rotate' );
	rotateIcon.src = 'images/rotate.svg';

	const rotate = new UIButton();
	rotate.dom.appendChild( rotateIcon );
	rotate.onClick( function () {

		signals.transformModeChanged.dispatch( 'rotate' );

	} );
	container.add( rotate );

	const scaleIcon = document.createElement( 'img' );
	scaleIcon.title = strings.getKey( 'toolbar/scale' );
	scaleIcon.src = 'images/scale.svg';

	const scale = new UIButton();
	scale.dom.appendChild( scaleIcon );
	scale.onClick( function () {

		signals.transformModeChanged.dispatch( 'scale' );

	} );
	container.add( scale );

	// Preset Camera Views
	const perspIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><path d="M4 7h16v10H4z" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><path d="M4 7l8 4.6L20 7" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><text x="12" y="20" text-anchor="middle" font-size="6" fill="#d2d2d2" font-family="Arial">P</text></svg>',
		'원근 시점'
	);

	const persp = new UIButton();
	persp.dom.className = 'Button big';
	persp.dom.style.cssText = 'margin-left: 8px;';
	persp.dom.appendChild( perspIcon );
	persp.dom.title = '원근 시점';
	persp.onClick( function () {

		setCeilingTransparencyForTopView( editor, false );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.perspective );

	} );
	container.add( persp );

	const audienceIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="4" width="14" height="9" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><circle cx="8" cy="17.5" r="1.2" fill="#d2d2d2"/><circle cx="12" cy="17.5" r="1.2" fill="#d2d2d2"/><circle cx="16" cy="17.5" r="1.2" fill="#d2d2d2"/><text x="12" y="21.2" text-anchor="middle" font-size="5" fill="#d2d2d2" font-family="Arial">AUD</text></svg>',
		'객석 시점'
	);

	const audience = new UIButton();
	audience.dom.className = 'Button big';
	audience.dom.appendChild( audienceIcon );
	audience.dom.title = '객석 시점';
	audience.onClick( function () {

		setCeilingTransparencyForTopView( editor, false );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.audience );

	} );
	container.add( audience );

	const frontIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="5" width="14" height="14" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><path d="M12 18V7" stroke="#d2d2d2" stroke-width="1.4"/><path d="M9.5 9.5L12 7l2.5 2.5" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><text x="12" y="22" text-anchor="middle" font-size="6" fill="#d2d2d2" font-family="Arial">F</text></svg>',
		'정면 시점'
	);

	const front = new UIButton();
	front.dom.className = 'Button big';
	front.dom.appendChild( frontIcon );
	front.dom.title = '정면 시점';
	front.onClick( function () {

		setCeilingTransparencyForTopView( editor, false );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.front );

	} );
	container.add( front );

	const rightIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="5" width="14" height="14" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><path d="M7 12h10" stroke="#d2d2d2" stroke-width="1.4"/><path d="M14.5 9.5L17 12l-2.5 2.5" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><text x="12" y="22" text-anchor="middle" font-size="6" fill="#d2d2d2" font-family="Arial">R</text></svg>',
		'우측 시점'
	);

	const side = new UIButton();
	side.dom.className = 'Button big';
	side.dom.appendChild( rightIcon );
	side.dom.title = '우측 시점';
	side.onClick( function () {

		setCeilingTransparencyForTopView( editor, false );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.right );

	} );
	container.add( side );

	const leftIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="5" width="14" height="14" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><path d="M7 12h10" stroke="#d2d2d2" stroke-width="1.4"/><path d="M9.5 9.5L7 12l2.5 2.5" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><text x="12" y="22" text-anchor="middle" font-size="6" fill="#d2d2d2" font-family="Arial">L</text></svg>',
		'좌측 시점'
	);

	const left = new UIButton();
	left.dom.className = 'Button big';
	left.dom.appendChild( leftIcon );
	left.dom.title = '좌측 시점';
	left.onClick( function () {

		setCeilingTransparencyForTopView( editor, false );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.left );

	} );
	container.add( left );

	const topIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><rect x="5" y="5" width="14" height="14" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><path d="M12 17V7" stroke="#d2d2d2" stroke-width="1.4"/><path d="M9.5 9.5L12 7l2.5 2.5" fill="none" stroke="#d2d2d2" stroke-width="1.4"/><text x="12" y="22" text-anchor="middle" font-size="6" fill="#d2d2d2" font-family="Arial">T</text></svg>',
		'상단 시점'
	);
	
	const top = new UIButton();
	top.dom.className = 'Button big';
	top.dom.appendChild( topIcon );
	top.dom.title = '상단 시점';
	top.onClick( function () {

		setCeilingTransparencyForTopView( editor, true );
		applyCameraPreset( editor, STAGE_CAMERA_PRESETS.top );

	} );
	container.add( top );

	// Zoom In/Out buttons
	const zoomInIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="10" cy="10" r="5" fill="none" stroke="#d2d2d2" stroke-width="1.5"/><path d="M14.5 14.5L20 20" stroke="#d2d2d2" stroke-width="1.5"/><path d="M10 7v6M7 10h6" stroke="#d2d2d2" stroke-width="1.5"/></svg>',
		'확대'
	);
	
	const zoomIn = new UIButton();
	zoomIn.dom.className = 'Button big';
	zoomIn.dom.style.cssText = 'margin-left: 8px;';
	zoomIn.dom.appendChild( zoomInIcon );
	zoomIn.dom.title = '확대';
	zoomIn.onClick( function () {
		
		const camera = editor.camera;
		if ( camera ) {
			if ( camera.isPerspectiveCamera ) {
				// Perspective 카메라: 위치를 목표점에 가깝게 이동
				const direction = new THREE.Vector3();
				camera.getWorldDirection( direction );
				camera.position.add( direction.multiplyScalar( 10 ) );
			} else if ( camera.isOrthographicCamera ) {
				// Orthographic 카메라: zoom 속성 조정
				camera.zoom = Math.min( camera.zoom * 1.2, 10 );
				camera.updateProjectionMatrix();
			}
			
			camera.updateMatrix();
			camera.updateMatrixWorld();
			signals.cameraChanged.dispatch();
		}
		
	} );
	container.add( zoomIn );

	const zoomOutIcon = createSvgIcon(
		'<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="10" cy="10" r="5" fill="none" stroke="#d2d2d2" stroke-width="1.5"/><path d="M14.5 14.5L20 20" stroke="#d2d2d2" stroke-width="1.5"/><path d="M7 10h6" stroke="#d2d2d2" stroke-width="1.5"/></svg>',
		'축소'
	);
	
	const zoomOut = new UIButton();
	zoomOut.dom.className = 'Button big';
	zoomOut.dom.appendChild( zoomOutIcon );
	zoomOut.dom.title = '축소';
	zoomOut.onClick( function () {
		
		const camera = editor.camera;
		if ( camera ) {
			if ( camera.isPerspectiveCamera ) {
				// Perspective 카메라: 위치를 목표점에서 멀어지게 이동
				const direction = new THREE.Vector3();
				camera.getWorldDirection( direction );
				camera.position.add( direction.multiplyScalar( -10 ) );
			} else if ( camera.isOrthographicCamera ) {
				// Orthographic 카메라: zoom 속성 조정
				camera.zoom = Math.max( camera.zoom / 1.2, 0.1 );
				camera.updateProjectionMatrix();
			}
			
			camera.updateMatrix();
			camera.updateMatrixWorld();
			signals.cameraChanged.dispatch();
		}
		
	} );
	container.add( zoomOut );

	const local = new UICheckbox( false );
	local.dom.classList.add( 'toolbar-local-switch' );
	local.dom.title = strings.getKey( 'toolbar/local' );
	local.onChange( function () {

		signals.spaceChanged.dispatch( this.getValue() === true ? 'local' : 'world' );

	} );
	container.add( local );

	//

	signals.transformModeChanged.add( function ( mode ) {

		translate.dom.classList.remove( 'selected' );
		rotate.dom.classList.remove( 'selected' );
		scale.dom.classList.remove( 'selected' );

		switch ( mode ) {

			case 'translate': translate.dom.classList.add( 'selected' ); break;
			case 'rotate': rotate.dom.classList.add( 'selected' ); break;
			case 'scale': scale.dom.classList.add( 'selected' ); break;

		}

	} );

	// 스테이지 박스(.viewer) 안에서 툴바 드래그 이동
	{
		let dragging = false;
		let pointerOffsetX = 0;
		let pointerOffsetY = 0;
		let parentRect = null;

		const dom = container.dom;

		dom.addEventListener( 'pointerdown', function ( event ) {
			// 버튼 위에서는 기존 클릭 동작 우선
			if ( event.target.closest( 'button' ) ) return;

			const parent = dom.parentElement;
			if ( ! parent ) return;

			dragging = true;
			parentRect = parent.getBoundingClientRect();
			const rect = dom.getBoundingClientRect();

			// 가운데 정렬 transform에서 픽셀 좌표로 전환
			dom.style.transform = 'none';
			dom.style.left = `${rect.left - parentRect.left}px`;
			dom.style.top = `${rect.top - parentRect.top}px`;
			dom.style.bottom = 'auto';

			pointerOffsetX = event.clientX - rect.left;
			pointerOffsetY = event.clientY - rect.top;

			dom.setPointerCapture( event.pointerId );
			event.preventDefault();
		} );

		dom.addEventListener( 'pointermove', function ( event ) {
			if ( ! dragging || ! parentRect ) return;

			const maxLeft = parentRect.width - dom.offsetWidth;
			const maxTop = parentRect.height - dom.offsetHeight;

			let nextLeft = event.clientX - parentRect.left - pointerOffsetX;
			let nextTop = event.clientY - parentRect.top - pointerOffsetY;

			nextLeft = Math.max( 0, Math.min( maxLeft, nextLeft ) );
			nextTop = Math.max( 0, Math.min( maxTop, nextTop ) );

			dom.style.left = `${nextLeft}px`;
			dom.style.top = `${nextTop}px`;
		} );

		function stopDragging( event ) {
			if ( ! dragging ) return;
			dragging = false;
			try { dom.releasePointerCapture( event.pointerId ); } catch ( e ) {}
		}

		dom.addEventListener( 'pointerup', stopDragging );
		dom.addEventListener( 'pointercancel', stopDragging );
	}

	return container;

}

export { Toolbar };
