/**
 * 툴바·보기 메뉴에서 공유하는 스테이지 카메라 프리셋 및 상단 시점 천장 투명 처리.
 */

export const STAGE_CAMERA_PRESETS = {
	perspective: {
		position: [ 0.000, 126.461, 252.922 ],
		rotation: [ -26.57 * Math.PI / 180, 0, 0 ],
		lookAt: [ 0, 0, 0 ]
	},
	audience: {
		position: [ 0.000, 46.380, 288.37 ],
		rotation: [ 0, 0, 0 ]
	},
	front: {
		position: [ 0.000, 11.660, 284.553 ],
		rotation: [ 0, 0, 0 ]
	},
	right: {
		position: [ 151.409, 11.793, -1.179 ],
		rotation: [ 0, 90 * Math.PI / 180, 0 ]
	},
	left: {
		position: [ -151.409, 11.793, -1.179 ],
		rotation: [ 0, -90 * Math.PI / 180, 0 ]
	},
	top: {
		position: [ 0.000, 125.282, 0.012 ],
		rotation: [ -Math.PI / 2, 0, 0 ],
		lookAt: [ 0, 0, 0 ]
	}
};

/**
 * @param {*} editor
 * @param {{ position: number[], rotation: number[], lookAt?: number[] }} preset
 */
export function applyCameraPreset( editor, preset ) {

	const camera = editor.camera;
	if ( ! camera ) return;

	camera.position.set( preset.position[ 0 ], preset.position[ 1 ], preset.position[ 2 ] );
	camera.rotation.set( preset.rotation[ 0 ], preset.rotation[ 1 ], preset.rotation[ 2 ] );

	if ( preset.lookAt ) camera.lookAt( preset.lookAt[ 0 ], preset.lookAt[ 1 ], preset.lookAt[ 2 ] );

	if ( camera.fov !== undefined ) {

		camera.fov = 50.00;
		camera.updateProjectionMatrix();

	}

	if ( camera.near !== undefined ) camera.near = 0.01;
	if ( camera.far !== undefined ) camera.far = 1000.00;

	camera.updateMatrix();
	camera.updateMatrixWorld();
	editor.signals.cameraChanged.dispatch();

}

/**
 * @param {*} editor
 * @param {boolean} enabled
 */
export function setCeilingTransparencyForTopView( editor, enabled ) {

	const stage = editor.scene?.getObjectByName( 'Stage' );
	if ( ! stage ) return;

	const lightLikeNameRe = /(light|spot|조명|라이트)/i;

	const applyToMaterial = ( material ) => {

		if ( ! material ) return;

		if ( enabled ) {

			if ( ! material.userData ) material.userData = {};
			if ( ! material.userData.__topViewOriginal ) {

				material.userData.__topViewOriginal = {
					transparent: material.transparent,
					opacity: material.opacity,
					depthWrite: material.depthWrite,
					needsUpdate: material.needsUpdate
				};

			}

			material.transparent = true;
			material.opacity = 0.14;
			material.depthWrite = false;
			material.needsUpdate = true;
			return;

		}

		const original = material.userData && material.userData.__topViewOriginal;
		if ( ! original ) return;

		material.transparent = original.transparent;
		material.opacity = original.opacity;
		material.depthWrite = original.depthWrite;
		material.needsUpdate = true;
		delete material.userData.__topViewOriginal;

	};

	stage.traverse( ( child ) => {

		if ( child.isMesh !== true ) return;
		const name = String( child.name || '' );
		if ( name === '_Floor' ) return;

		if ( Array.isArray( child.material ) ) {

			child.material.forEach( applyToMaterial );

		} else {

			applyToMaterial( child.material );

		}

	} );

	const setHiddenForTopView = ( child ) => {

		if ( enabled ) {

			if ( child.userData.__topViewVisible === undefined ) {

				child.userData.__topViewVisible = child.visible;

			}

			child.visible = false;

		} else if ( child.userData.__topViewVisible !== undefined ) {

			child.visible = child.userData.__topViewVisible;
			delete child.userData.__topViewVisible;

		}

	};

	const isHideableLightVisual = ( child ) => {

		const name = String( child.name || '' );
		const type = String( child.type || '' );
		const isActualLight = type.endsWith( 'Light' );
		if ( isActualLight ) return false;

		const isHelper = type.endsWith( 'Helper' ) || type.includes( 'LightHelper' );
		const isLightSpriteLike =
			( child.isSprite === true || child.isPoints === true || child.isLine === true ) &&
			lightLikeNameRe.test( name );
		const isNamedLightLike =
			lightLikeNameRe.test( name ) &&
			( child.isMesh === true || child.isObject3D === true );

		return isHelper || isLightSpriteLike || isNamedLightLike;

	};

	const sceneHelpers = editor.sceneHelpers;
	if ( sceneHelpers ) {

		sceneHelpers.traverse( ( child ) => {

			if ( ! isHideableLightVisual( child ) ) return;
			setHiddenForTopView( child );

		} );

	}

	editor.scene?.traverse( ( child ) => {

		if ( ! isHideableLightVisual( child ) ) return;
		setHiddenForTopView( child );

	} );

}
