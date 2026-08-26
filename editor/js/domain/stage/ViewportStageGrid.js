import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = /* glsl */ `
  varying vec3 vWorldPosition;

  uniform vec3 uColorMinor;
  uniform vec3 uColorMajor;
  uniform float uCellSize;
  uniform float uSectionSize;
  uniform float uOpacity;
  uniform float uMinorStrength;
  uniform vec4 uBounds; // minX, maxX, minZ, maxZ — w unused; if size tiny = no clip

  float gridLine(vec2 coord, float cellSize) {
    vec2 c = coord / cellSize;
    vec2 grid = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(grid.x, grid.y), 1.0);
  }

  void main() {
    vec2 xz = vWorldPosition.xz;

    // Soft clip to stage floor (avoid infinite noisy grid)
    float bx = uBounds.y - uBounds.x;
    float bz = uBounds.w - uBounds.z;
    if (bx > 1.0 && bz > 1.0) {
      if (xz.x < uBounds.x || xz.x > uBounds.y || xz.y < uBounds.z || xz.y > uBounds.w) {
        discard;
      }
    }

    float minor = gridLine(xz, uCellSize);
    float major = gridLine(xz, uSectionSize);

    float alpha = max(minor * uMinorStrength, major) * uOpacity;
    if (alpha < 0.02) discard;

    vec3 color = mix(uColorMinor, uColorMajor, step(0.5, major));
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * v3 ViewportStageGrid — depthTest OFF 오버레이 (자동·1m 고정).
 */
export class ViewportStageGrid extends THREE.Mesh {
  constructor(options = {}) {
    const planeSize = options.planeSize ?? 40000;

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColorMinor: { value: new THREE.Color(options.minorColor ?? 0x444444) },
        uColorMajor: { value: new THREE.Color(options.majorColor ?? 0x666666) },
        uCellSize: { value: options.cellSize ?? 1 },
        uSectionSize: { value: options.sectionSize ?? 10 },
        uOpacity: { value: options.opacity ?? 0.75 },
        uMinorStrength: { value: options.minorStrength ?? 0.22 },
        uBounds: { value: new THREE.Vector4(0, 0, 0, 0) },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    });

    super(geometry, material);

    this.frustumCulled = false;
    this.renderOrder = options.renderOrder ?? 1000;
  }

  setColors(minorHex, majorHex) {
    this.material.uniforms.uColorMinor.value.setHex(minorHex);
    this.material.uniforms.uColorMajor.value.setHex(majorHex);
  }

  setCellSizes(cellSize, sectionSize) {
    this.material.uniforms.uCellSize.value = cellSize;
    this.material.uniforms.uSectionSize.value = sectionSize;
  }

  setMinorStrength(v) {
    this.material.uniforms.uMinorStrength.value = v;
  }

  setOpacity(v) {
    this.material.uniforms.uOpacity.value = v;
  }

  /** @param {number} minX @param {number} maxX @param {number} minZ @param {number} maxZ */
  setFloorBounds(minX, maxX, minZ, maxZ) {
    this.material.uniforms.uBounds.value.set(minX, maxX, minZ, maxZ);
  }

  applyOverlaySettings() {
    const mat = this.material;
    mat.depthTest = false;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -1;
    mat.polygonOffsetUnits = -4;
  }
}
