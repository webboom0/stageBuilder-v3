import * as THREE from "three";

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

  float gridLine(vec2 coord, float cellSize) {
    vec2 c = coord / cellSize;
    vec2 grid = abs(fract(c - 0.5) - 0.5) / fwidth(c);
    return 1.0 - min(min(grid.x, grid.y), 1.0);
  }

  void main() {
    vec2 xz = vWorldPosition.xz;

    float minor = gridLine(xz, uCellSize);
    float major = gridLine(xz, uSectionSize);

    float alpha = max(minor * 0.32, major) * uOpacity;
    if (alpha < 0.02) discard;

    vec3 color = mix(uColorMinor, uColorMajor, step(0.5, major));
    gl_FragColor = vec4(color, alpha);
  }
`;

/**
 * 뷰포트 바닥 그리드 — 월드 XZ 원점에 고정(카메라 팬·줌과 무관하게 무대 바닥에 붙어 보임).
 * cellSize / sectionSize는 월드 단위(표시 m와 맞추려면 motionDisplayUnits로 환산).
 */
class ViewportStageGrid extends THREE.Mesh {
  constructor(options = {}) {
    const planeSize = options.planeSize ?? 40000;

    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColorMinor: {
          value: new THREE.Color(options.minorColor ?? 0x999999),
        },
        uColorMajor: {
          value: new THREE.Color(options.majorColor ?? 0x777777),
        },
        uCellSize: { value: options.cellSize ?? 1 },
        uSectionSize: { value: options.sectionSize ?? 10 },
        uOpacity: { value: options.opacity ?? 0.9 },
      },
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
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
    const uniforms = this.material.uniforms;
    uniforms.uCellSize.value = cellSize;
    uniforms.uSectionSize.value = sectionSize;
  }

  applyOverlaySettings() {
    const mat = this.material;
    mat.depthTest = true;
    mat.depthWrite = false;
    mat.polygonOffset = true;
    mat.polygonOffsetFactor = -2;
    mat.polygonOffsetUnits = -2;
  }
}

export { ViewportStageGrid };
