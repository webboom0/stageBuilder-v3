import * as THREE from "three";
import { ensureMotionTimelineTrack } from "../utils/motionTimelineAutoTrack.js";

/**
 * Simple ensemble/actor manager (MVP)
 * - Spawns up to 4 numbered actors
 * - Select actor by id
 * - "Place mode": click stage to set target position
 * - Per-frame update: move toward target (straight-line)
 *
 * Data is persisted in scene.userData.actors (array)
 */
export class ActorsManager {
  constructor(editor) {
    this.editor = editor;
    this.actors = new Map(); // id -> { id, object, target }
    this.maxActors = 4;
    this.placeArmed = false;

    this._raycaster = new THREE.Raycaster();
    this._ndc = new THREE.Vector2();
    this._groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._hit = new THREE.Vector3();

    this._boundOnPointerUp = (e) => this._onPointerUp(e);
  }

  attach() {
    const dom = this.editor?.viewport?.renderer?.domElement;
    if (!dom) return;
    dom.addEventListener("pointerup", this._boundOnPointerUp);
  }

  detach() {
    const dom = this.editor?.viewport?.renderer?.domElement;
    if (!dom) return;
    dom.removeEventListener("pointerup", this._boundOnPointerUp);
  }

  setPlaceArmed(on) {
    this.placeArmed = !!on;
  }

  spawnNext() {
    if (this.actors.size >= this.maxActors) return null;
    const id = this._nextId();
    return this.spawn(id);
  }

  _nextId() {
    for (let i = 1; i <= this.maxActors; i++) {
      if (!this.actors.has(i)) return i;
    }
    return null;
  }

  spawn(id) {
    if (!id || id < 1 || id > this.maxActors) return null;
    if (this.actors.has(id)) return this.actors.get(id);

    const group = new THREE.Group();
    group.name = `Actor_${id}`;
    group.userData.type = "actor";
    group.userData.actorId = id;
    // Mark as motion source so MotionTimeline auto-track can include it
    group.userData.source = "motion";

    const color = new THREE.Color().setHSL((id * 0.18) % 1, 0.55, 0.55);
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.0 });

    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 1.1, 4, 10), mat);
    body.castShadow = true;
    body.position.y = 0.85;
    group.add(body);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 22),
      new THREE.MeshBasicMaterial({ color: 0x3fd6e0, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    ring.visible = false;
    ring.userData._actorRing = true;
    group.add(ring);

    // initial positions spread
    group.position.set((id - 2.5) * 1.6, 0, -2.0);

    const entry = {
      id,
      object: group,
      ring,
      target: new THREE.Vector3(group.position.x, 0, group.position.z),
      speed: 1.6, // units/sec
    };

    this.editor.scene.add(group);
    this.editor.signals.sceneGraphChanged.dispatch();

    this.actors.set(id, entry);
    this.persistToSceneUserData();

    // Create/ensure MotionTimeline track for this actor
    try {
      ensureMotionTimelineTrack(this.editor, group);
    } catch (e) {
      // ignore
    }

    return entry;
  }

  getActor(id) {
    return this.actors.get(Number(id)) || null;
  }

  selectActor(id) {
    const actor = this.getActor(id);
    if (!actor) return;
    if (this.editor?.select) {
      this.editor.select(actor.object);
    }
  }

  setTargetForSelectedActors(localPoint) {
    const selected = this.editor?.selected;
    if (!selected) return;

    // Actor capsule
    if (selected.userData?.type === "actor" && selected.userData?.actorId) {
      const a = this.getActor(selected.userData.actorId);
      if (a) {
        a.target.copy(localPoint.clone());
        this.persistToSceneUserData();
      }
      return;
    }

    // Assets FBX / other motion objects
    if (selected.userData?.source === "motion") {
      selected.position.x = localPoint.x;
      selected.position.z = localPoint.z;
      this.editor?.signals?.sceneGraphChanged?.dispatch();
    }
  }

  update(dt) {
    const delta = Math.max(0, Number(dt) || 0);
    if (delta <= 0) return;

    this.actors.forEach((a) => {
      const o = a.object;
      const dx = a.target.x - o.position.x;
      const dz = a.target.z - o.position.z;
      const dist = Math.hypot(dx, dz);

      const moving = dist > 0.03;
      a.ring.visible = (this.editor.selected === o);

      if (!moving) return;

      const step = a.speed * delta;
      const k = Math.min(1, step / dist);
      o.position.x += dx * k;
      o.position.z += dz * k;

      const heading = Math.atan2(dx, dz);
      o.rotation.y += this._angleDelta(o.rotation.y, heading) * 0.22;
    });
  }

  _angleDelta(cur, tgt) {
    let d = (tgt - cur) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  persistToSceneUserData() {
    if (!this.editor?.scene?.userData) return;
    const arr = [];
    this.actors.forEach((a) => {
      arr.push({
        id: a.id,
        x: a.object.position.x,
        z: a.object.position.z,
        tx: a.target.x,
        tz: a.target.z,
      });
    });
    this.editor.scene.userData.actors = arr;
  }

  restoreFromSceneUserData() {
    const data = this.editor?.scene?.userData?.actors;
    if (!Array.isArray(data)) return;
    data.forEach((row) => {
      const id = Number(row.id);
      const a = this.spawn(id);
      if (!a) return;
      a.object.position.x = Number(row.x) || 0;
      a.object.position.z = Number(row.z) || 0;
      a.target.set(Number(row.tx) || a.object.position.x, 0, Number(row.tz) || a.object.position.z);
    });
  }

  _onPointerUp(e) {
    if (!this.placeArmed) return;
    const dom = this.editor?.viewport?.renderer?.domElement;
    if (!dom) return;

    const r = dom.getBoundingClientRect();
    this._ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this._ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;

    const cam = this.editor?.viewportCamera || this.editor?.camera;
    if (!cam) return;
    this._raycaster.setFromCamera(this._ndc, cam);

    const ok = this._raycaster.ray.intersectPlane(this._groundPlane, this._hit);
    if (!ok) return;

    // Convert to scene local (already)
    const p = this._hit.clone();
    p.y = 0;
    this.setTargetForSelectedActors(p);

    // auto-disarm like the demo
    this.placeArmed = false;
    if (this.editor?.signals?.timelineChanged) {
      this.editor.signals.timelineChanged.dispatch();
    }
  }
}

