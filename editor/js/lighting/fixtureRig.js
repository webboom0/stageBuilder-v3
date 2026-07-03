import * as THREE from "three";
import {
  BEAM_REF_ANGLE,
  FIXTURE_RIG_TYPES,
  fixtureFidFromRowCol,
  mkFixtureAttr,
  RIG_MATRIX,
  ROW_DEFS,
} from "./fixtureTypes.js";

function tagFixture(obj, part) {
  obj.userData.isFixture = true;
  obj.userData.fixturePart = part;
  obj.userData.notSelectable = true;
  obj.userData.excludeFromTimeline = true;
}

export function aimPanTilt(from, target) {
  const p = new THREE.Vector3(from[0], from[1], from[2]);
  const d = new THREE.Vector3(target[0], target[1], target[2]).sub(p);
  const pan = THREE.MathUtils.radToDeg(Math.atan2(d.x, d.z));
  const horiz = Math.hypot(d.x, d.z);
  const tilt = THREE.MathUtils.radToDeg(Math.atan2(horiz, -d.y));
  return { pan, tilt };
}

export function buildFixtureObject(options = {}) {
  const o = options;
  const grp = new THREE.Group();
  grp.name = o.name || "Fixture";
  grp.position.set(o.pos[0], o.pos[1], o.pos[2]);

  if (!o.floor) {
    const clamp = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.42, 0.42),
      new THREE.MeshStandardMaterial({ color: 0x202327, roughness: 0.5, metalness: 0.75 }),
    );
    clamp.position.y = 0.42;
    tagFixture(clamp, "clamp");
    grp.add(clamp);
  }

  const aim = new THREE.Group();
  aim.name = "aim";
  aim.rotation.order = "YXZ";
  grp.add(aim);

  let body;
  const rig = o.rig || "mh";
  if (rig === "mh") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.66, 0.45, 16),
      new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.4, metalness: 0.7 }),
    );
    base.position.y = 0.06;
    tagFixture(base, "body");
    grp.add(base);
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.46, 0.58, 1.15, 16),
      new THREE.MeshStandardMaterial({ color: 0x0d0f12, roughness: 0.4, metalness: 0.7 }),
    );
    body.position.y = -0.45;
  } else if (rig === "wash") {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.0, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.5, metalness: 0.5 }),
    );
  } else if (rig === "fl") {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.42, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x101216, roughness: 0.6, metalness: 0.4 }),
    );
  } else if (rig === "cyc") {
    body = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 0.5, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.6 }),
    );
  } else {
    body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.42, 0.52, 1.05, 14),
      new THREE.MeshStandardMaterial({ color: 0x0e1014, roughness: 0.45, metalness: 0.65 }),
    );
  }
  tagFixture(body, "body");
  aim.add(body);

  const reach = o.reach || FIXTURE_RIG_TYPES.mh.reach;
  const zoom = o.zoom || 16;
  const spot = new THREE.SpotLight(0xffffff, 0, reach, THREE.MathUtils.degToRad(zoom), 0.4, 1.1);
  spot.castShadow = !!o.shadow;
  if (o.shadow) {
    spot.shadow.mapSize.set(1024, 1024);
    spot.shadow.camera.far = reach;
  }
  spot.position.set(0, 0, 0);
  spot.target.position.set(0, -reach, 0);
  tagFixture(spot, "spot");
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
  tagFixture(beam, "beam");
  aim.add(beam);

  tagFixture(grp, "root");
  return { grp, aim, spot, beam, body };
}

function makeBatten(z, battenY, spanX) {
  const pipe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.5, 0.5, spanX + 8, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.5, metalness: 0.85 }),
  );
  pipe.rotation.z = Math.PI / 2;
  pipe.position.set(0, battenY + 1.6, z);
  tagFixture(pipe, "batten");
  return pipe;
}

/**
 * Build fixture matrix under parent group (local space).
 */
export function buildFixtureMatrix(parent, options = {}) {
  const cfg = Object.assign({}, RIG_MATRIX, options);
  const fixtures = [];
  const battens = [];
  const colX = [];
  for (let c = 0; c < cfg.cols; c++) {
    colX.push(-cfg.spanX / 2 + c * (cfg.spanX / (cfg.cols - 1)));
  }
  const rowZ = [];
  const zHi = cfg.spanZ * (cfg.zFront ?? 0.5);
  const zLo = cfg.spanZ * (cfg.zBack ?? -0.5);
  for (let r = 0; r < cfg.rows; r++) {
    rowZ.push(cfg.rows === 1 ? 0 : zHi - r * ((zHi - zLo) / (cfg.rows - 1)));
  }

  for (let r = 0; r < cfg.rows; r++) {
    const def = ROW_DEFS[r];
    const typeDef = FIXTURE_RIG_TYPES[def.rig] || FIXTURE_RIG_TYPES.mh;
    const z = rowZ[r];
    battens.push(makeBatten(z, cfg.battenY, cfg.spanX));
    for (let c = 0; c < cfg.cols; c++) {
      const x = colX[c];
      const fid = fixtureFidFromRowCol(r, c);
      const pos = [x, cfg.battenY, z];
      const deckY = -cfg.battenY;
      const target =
        def.grp === "cyc"
          ? [x, deckY + 4, -cfg.spanZ * 0.42]
          : [x * 0.35, deckY, Math.max(-cfg.spanZ * 0.08, z * 0.15)];
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
        rig: def.rig,
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
  return fixtures;
}

export function beamRefRad() {
  return THREE.MathUtils.degToRad(BEAM_REF_ANGLE);
}
