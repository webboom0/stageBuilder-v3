import * as THREE from 'three';
import {
  BEAM_REF_ANGLE,
  FIXTURE_RIG_TYPES,
  fixtureFidFromRowCol,
  mkFixtureAttr,
  RIG_MATRIX,
  ROW_DEFS,
  rigRowLocalZ,
} from './fixtureTypes.js';

function tagFixture(obj, part) {
  obj.userData.isFixture = true;
  obj.userData.fixturePart = part;
  obj.userData.notSelectable = true;
  obj.userData.excludeFromTimeline = true;
}

export function aimPanTilt(from, target) {
  const p = new THREE.Vector3(from[0], from[1], from[2]);
  const d = new THREE.Vector3(target[0], target[1], target[2]).sub(p);
  const pan = THREE.MathUtils.radToDeg(Math.atan2(-d.x, -d.z));
  const horiz = Math.hypot(d.x, d.z);
  const tilt = THREE.MathUtils.radToDeg(Math.atan2(horiz, -d.y));
  return { pan, tilt };
}

/**
 * Default aim point on the deck — pull edge fixtures onto the acting area
 * (avoid audience / apron spill). Local rig space.
 * @param {number} x
 * @param {number} z
 * @param {number} deckY
 * @param {number} spanZ
 * @param {string} [grp]
 */
export function deckAimTarget(x, z, deckY, spanZ, grp) {
  if (grp === 'back' || grp === 'cyc') {
    return [x * 0.55, deckY, z * 0.35 - spanZ * 0.12];
  }
  // Aim toward deck under each fixture — mild center pull (was 0.55 → left wing too dark)
  return [x * 0.72, deckY, z * 0.45];
}

export function buildFixtureObject(options = {}) {
  const o = options;
  const grp = new THREE.Group();
  grp.name = o.name || 'Fixture';
  grp.position.set(o.pos[0], o.pos[1], o.pos[2]);

  if (!o.floor) {
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.85, 0.55, 0.85),
      new THREE.MeshStandardMaterial({ color: 0x202327, roughness: 0.5, metalness: 0.75 }),
    );
    clamp.position.y = 0.55;
    tagFixture(clamp, 'clamp');
    grp.add(clamp);
  }

  const aim = new THREE.Group();
  aim.name = 'aim';
  aim.rotation.order = 'YXZ';
  grp.add(aim);

  let body;
  const rig = o.rig || 'mh';
  if (rig === 'mh') {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 0.9, 0.55, 16),
      new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.4, metalness: 0.7 }),
    );
    base.position.y = 0.08;
    tagFixture(base, 'body');
    grp.add(base);
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.78, 1.55, 16),
      new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.4, metalness: 0.7 }),
    );
    body.position.y = -0.55;
  } else if (rig === 'wash') {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(1.55, 1.25, 0.95),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.5 }),
    );
    body.position.y = -0.35;
  } else {
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.7, 1.35, 14),
      new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.45, metalness: 0.65 }),
    );
    body.position.y = -0.4;
  }
  tagFixture(body, 'body');
  aim.add(body);

  const reach = o.reach || FIXTURE_RIG_TYPES.mh.reach;
  const zoom = o.zoom || 16;
  const spot = new THREE.SpotLight(0xffffff, 0, reach, THREE.MathUtils.degToRad(zoom), 0.4, 1.1);
  spot.castShadow = false;
  spot.position.set(0, 0, 0);
  spot.target.position.set(0, -reach, 0);
  tagFixture(spot, 'spot');
  aim.add(spot);
  aim.add(spot.target);
  spot.userData.baseDist = reach;

  const beamLen = o.beamLen || 38;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(6, beamLen, 22, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.04,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  beam.position.y = -beamLen / 2;
  tagFixture(beam, 'beam');
  aim.add(beam);

  tagFixture(grp, 'root');
  return { grp, aim, spot, beam, body };
}

function makeBatten(z, battenY, spanX) {
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.55, 0.55, spanX + 2, 14),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.85 }),
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, battenY + 1.6, z);
  tagFixture(pipe, 'batten');
  return pipe;
}

/**
 * Build fixture matrix under parent group (local space).
 * @param {THREE.Object3D} parent
 * @param {Partial<typeof RIG_MATRIX>} [options]
 * @returns {{ fixtures: any[], battens: THREE.Object3D[] }}
 */
export function buildFixtureMatrix(parent, options = {}) {
  const cfg = Object.assign({}, RIG_MATRIX, options);
  const fixtures = [];
  const battens = [];
  const colX = [];
  for (let c = 0; c < cfg.cols; c++) {
    colX.push(-cfg.spanX / 2 + c * (cfg.spanX / (cfg.cols - 1)));
  }

  for (let r = 0; r < cfg.rows; r++) {
    const def = ROW_DEFS[r];
    const typeDef = FIXTURE_RIG_TYPES[def.rig] || FIXTURE_RIG_TYPES.mh;
    const z = rigRowLocalZ(r, cfg);
    battens.push(makeBatten(z, cfg.battenY, cfg.spanX));
    for (let c = 0; c < cfg.cols; c++) {
      const x = colX[c];
      const fid = fixtureFidFromRowCol(r, c);
      const pos = [x, cfg.battenY, z];
      const deckY = -cfg.battenY;
      const target = deckAimTarget(x, z, deckY, cfg.spanZ, def.grp);
      const obj = buildFixtureObject({
        pos,
        rig: def.rig,
        reach: typeDef.reach,
        beamLen: typeDef.beamLen,
        zoom: typeDef.zoom,
        name: `${def.name} ${c + 1}`,
      });
      parent.add(obj.grp);
      const aimAngles = aimPanTilt(pos, target);
      const home = mkFixtureAttr({
        pan: aimAngles.pan,
        tilt: aimAngles.tilt,
        zoom: typeDef.zoom,
        dim: 0,
      });
      const attr = mkFixtureAttr({
        pan: aimAngles.pan,
        tilt: aimAngles.tilt,
        zoom: typeDef.zoom,
        dim: 0,
      });
      fixtures.push({
        fid,
        name: `${def.name} ${c + 1}`,
        type: def.type,
        grp: def.grp,
        short: def.short,
        rig: def.rig,
        row: r,
        col: c,
        obj,
        max: typeDef.max,
        enabled: true,
        attr,
        home,
        prog: {},
        tl: null,
        live: null,
        sel: false,
        fanOff: 0,
      });
    }
  }

  battens.forEach((b) => parent.add(b));
  return { fixtures, battens };
}

/**
 * Re-place fixtures/battens in local space from RIG_MATRIX (after fit constants change).
 * @param {any[]} fixtures
 * @param {THREE.Object3D[]} battens
 * @param {Partial<typeof RIG_MATRIX>} [options]
 */
export function layoutFixtureMatrixLocal(fixtures, battens, options = {}) {
  const cfg = Object.assign({}, RIG_MATRIX, options);
  const colX = [];
  for (let c = 0; c < cfg.cols; c++) {
    colX.push(-cfg.spanX / 2 + c * (cfg.spanX / (cfg.cols - 1)));
  }
  for (const f of fixtures) {
    const row = Number.isFinite(f.row) ? f.row : Math.floor(f.fid / 10) - 1;
    const col = Number.isFinite(f.col) ? f.col : (f.fid % 10) - 1;
    const x = colX[col] ?? 0;
    const z = rigRowLocalZ(row, cfg);
    f.row = row;
    f.col = col;
    f.obj.grp.position.set(x, cfg.battenY, z);
  }
  for (let r = 0; r < battens.length; r++) {
    const z = rigRowLocalZ(r, cfg);
    battens[r].position.set(0, cfg.battenY + 1.6, z);
  }
}

export function beamRefRad() {
  return THREE.MathUtils.degToRad(BEAM_REF_ANGLE);
}
