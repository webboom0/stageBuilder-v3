/**
 * QLab-like cue stack (MVP)
 */
import * as THREE from "three";
import { computeFormationOffsets } from "./groupFormation.js";
import {
  ensureGroupSegments,
  getGroupTotalDuration,
  newSegmentId,
  syncLegacyFieldsFromSegments,
} from "./groupSegments.js";

export class ShowControl {
  constructor(editor) {
    this.editor = editor;
    this.cues = [];
    this.standbyIndex = 0;
    this.registry = {
      motion: [], // { uuid, name?, actorId? }
      lights: [], // { uuid, name? }
      groups: [], // { id, name, members: [uuid] }
    };
    this.selectedGroupId = null;
    this.selectedSegmentId = null;
    this.selectedFbxSlotIndices = new Set();
    this._fbxCatalog = null;
    this._timers = []; // { t, dur, fire } or { t, dur, tick }
    this._running = false;
    this._pathPick = null;
    this._pathPickHandlers = null;
  }

  setGroupPathPickMode(groupId, mode, segmentId = null) {
    const m =
      mode === "from" || mode === "to" || mode === "segmentAnchor" ? mode : null;
    if (!m || !groupId) {
      this._pathPick = null;
    } else if (
      this._pathPick?.groupId === groupId &&
      this._pathPick?.mode === m &&
      this._pathPick?.segmentId === segmentId
    ) {
      this._pathPick = null;
    } else {
      this._pathPick = { groupId, mode: m, segmentId: segmentId || null };
    }
    return !!this._pathPick;
  }

  getGroupPathPickMode() {
    return this._pathPick ? { ...this._pathPick } : null;
  }

  _ensurePathPickHandlers() {
    if (this._pathPickHandlers) return this._pathPickHandlers;
    this._pathPickHandlers = {
      ndc: new THREE.Vector2(),
      raycaster: new THREE.Raycaster(),
      ground: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
      hit: new THREE.Vector3(),
    };
    return this._pathPickHandlers;
  }

  /** Viewport 클릭(0–1 정규화 좌표)으로 시작/끝 위치 지정 */
  applyGroupPathPickFromNormalized(nx, ny) {
    if (!this._pathPick) return false;

    const cam = this.editor?.viewportCamera || this.editor?.camera;
    if (!cam) return false;

    const group = this.getGroup(this._pathPick.groupId);
    if (!group) return false;

    const { raycaster, ground, hit } = this._ensurePathPickHandlers();
    raycaster.setFromCamera(new THREE.Vector2(nx * 2 - 1, -(ny * 2) + 1), cam);
    if (!raycaster.ray.intersectPlane(ground, hit)) return false;

    const patch =
      this._pathPick.mode === "from"
        ? { fromX: hit.x, fromZ: hit.z }
        : this._pathPick.mode === "to"
          ? { toX: hit.x, toZ: hit.z }
          : null;

    if (this._pathPick.mode === "segmentAnchor" && this._pathPick.segmentId) {
      this.updateGroupSegment(group.id, this._pathPick.segmentId, {
        anchorX: hit.x,
        anchorZ: hit.z,
      });
    } else if (patch) {
      this.updateGroup(group.id, patch);
      if (this._pathPick.mode === "to") {
        const segments = ensureGroupSegments(group);
        const last = segments[segments.length - 1];
        if (last) {
          last.anchorX = hit.x;
          last.anchorZ = hit.z;
        }
      }
      syncLegacyFieldsFromSegments(group);
    } else {
      return false;
    }
    this._pathPick = null;

    this.editor.signals?.sceneGraphChanged?.dispatch?.();
    this.editor.signals?.timelineChanged?.dispatch?.();
    this.editor._showControlPathPickDone?.();
    return true;
  }

  setRunning(on) {
    this._running = !!on;
  }

  loadFromSceneUserData() {
    const data = this.editor?.scene?.userData?.showControl;
    if (!data) return;
    if (Array.isArray(data.cues)) this.cues = data.cues;
    if (Number.isFinite(data.standbyIndex)) this.standbyIndex = data.standbyIndex;
    if (data.registry && typeof data.registry === "object") {
      const r = data.registry;
      const motion = Array.isArray(r.motion) ? r.motion : [];
      const lights = Array.isArray(r.lights) ? r.lights : [];
      const groups = Array.isArray(r.groups) ? r.groups : [];
      this.registry = { motion, lights, groups };
      this._normalizeRegistry();
    }
    if (data.selectedGroupId) this.selectedGroupId = data.selectedGroupId;
    requestAnimationFrame(() => {
      import("./motionTimelineGroupFolder.js").then(({ restoreAllGroupFolders }) => {
        restoreAllGroupFolders(this.editor);
      });
    });
  }

  persistToSceneUserData() {
    if (!this.editor?.scene?.userData) return;
    this.editor.scene.userData.showControl = {
      cues: this.cues,
      standbyIndex: this.standbyIndex,
      registry: this.registry,
      selectedGroupId: this.selectedGroupId,
    };
  }

  ensureRegistry() {
    if (!this.registry || typeof this.registry !== "object") {
      this.registry = { motion: [], lights: [], groups: [] };
    }
    if (!Array.isArray(this.registry.motion)) this.registry.motion = [];
    if (!Array.isArray(this.registry.lights)) this.registry.lights = [];
    if (!Array.isArray(this.registry.groups)) this.registry.groups = [];
    return this.registry;
  }

  ensureGroups() {
    const r = this.ensureRegistry();
    r.groups = r.groups.map((g) => this._normalizeGroup(g)).filter((g) => g.id);
    if (!r.groups.length) {
      r.groups.push({ id: this._newGroupId(), name: "군무", members: [] });
    }
    if (!this.selectedGroupId || !r.groups.some((g) => g.id === this.selectedGroupId)) {
      this.selectedGroupId = r.groups[0].id;
    }
    return r.groups;
  }

  _newGroupId() {
    return `grp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  _newMemberId() {
    return `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  }

  _normalizeGroup(g) {
    if (!g) return { id: this._newGroupId(), name: "그룹", members: [] };
    const group = {
      id: g.id || this._newGroupId(),
      name: String(g.name || "그룹"),
      members: this._normalizeGroupMembers(g.members),
      formation: g.formation || "grid",
      formationSpacing: Math.max(0.5, Number(g.formationSpacing) || 30),
      startTime: Math.max(0, Number(g.startTime) || 0),
      duration: Math.max(0.1, Number(g.duration) || 3),
      fromX: Number(g.fromX) || 0,
      fromZ: Number(g.fromZ) || -2,
      toX: Number(g.toX) || 0,
      toZ: Number(g.toZ) || 2,
      fromRotY: Number(g.fromRotY) || 0,
      toRotY: Number(g.toRotY) || 0,
      segments: Array.isArray(g.segments) ? g.segments : undefined,
    };
    ensureGroupSegments(group);
    syncLegacyFieldsFromSegments(group);
    return group;
  }

  _normalizeGroupMembers(members) {
    if (!Array.isArray(members)) return [];
    return members
      .map((m) => {
        if (!m) return null;
        if (typeof m === "string") {
          return {
            id: this._newMemberId(),
            deployedUuid: m,
            displayName: "Object",
          };
        }
        return {
          id: m.id || this._newMemberId(),
          catalogIndex: m.catalogIndex,
          filename: m.filename,
          path: m.path,
          displayName: m.displayName || m.name || m.filename || "Member",
          actorId: m.actorId,
          deployedUuid: m.deployedUuid || m.uuid || null,
        };
      })
      .filter(Boolean);
  }

  createGroupMemberFromCatalog(catalogEntry, catalogIndex) {
    return {
      id: this._newMemberId(),
      catalogIndex: Number(catalogIndex),
      filename: catalogEntry.filename || catalogEntry.name,
      path: catalogEntry.path,
      displayName: catalogEntry.displayName || catalogEntry.name || catalogEntry.filename,
      deployedUuid: null,
    };
  }

  createGroupMemberFromActor(actorId) {
    const id = Number(actorId);
    return {
      id: this._newMemberId(),
      actorId: id,
      displayName: `Actor ${id}`,
      deployedUuid: null,
    };
  }

  updateGroup(groupId, patch) {
    const group = this.getGroup(groupId);
    if (!group || !patch) return;
    Object.assign(group, patch);
    syncLegacyFieldsFromSegments(group);
    this.persistToSceneUserData();
  }

  setGroupFormation(groupId, formation, segmentId = null) {
    const group = this.getGroup(groupId);
    if (!group) return;
    const segId = segmentId || this.selectedSegmentId;
    if (segId) {
      this.updateGroupSegment(groupId, segId, { formation });
    } else {
      group.formation = formation;
      ensureGroupSegments(group).forEach((s) => {
        s.formation = formation;
      });
      syncLegacyFieldsFromSegments(group);
      this.persistToSceneUserData();
    }
  }

  setSelectedSegmentId(segmentId) {
    this.selectedSegmentId = segmentId || null;
  }

  getSelectedSegment(group) {
    if (!group?.segments?.length) return null;
    return group.segments.find((s) => s.id === this.selectedSegmentId) || group.segments[0];
  }

  addGroupSegment(groupId) {
    const group = this.getGroup(groupId);
    if (!group) return null;
    const segments = ensureGroupSegments(group);
    const last = segments[segments.length - 1];
    const seg = {
      id: newSegmentId(),
      duration: 3,
      formation: last?.formation || group.formation || "grid",
      anchorX: Number(last?.anchorX) || 0,
      anchorZ: (Number(last?.anchorZ) || 0) + 5,
      toRotY: Number(last?.toRotY) || 0,
    };
    segments.push(seg);
    this.selectedSegmentId = seg.id;
    syncLegacyFieldsFromSegments(group);
    this.persistToSceneUserData();
    return seg;
  }

  removeGroupSegment(groupId, segmentId) {
    const group = this.getGroup(groupId);
    if (!group) return false;
    const segments = ensureGroupSegments(group);
    if (segments.length <= 1) return false;
    group.segments = segments.filter((s) => s.id !== segmentId);
    if (this.selectedSegmentId === segmentId) {
      this.selectedSegmentId = group.segments[0]?.id || null;
    }
    syncLegacyFieldsFromSegments(group);
    this.persistToSceneUserData();
    return true;
  }

  updateGroupSegment(groupId, segmentId, patch) {
    const group = this.getGroup(groupId);
    if (!group || !patch) return;
    const seg = ensureGroupSegments(group).find((s) => s.id === segmentId);
    if (!seg) return;
    Object.assign(seg, patch);
    syncLegacyFieldsFromSegments(group);
    this.persistToSceneUserData();
  }

  getGroup(groupId) {
    return this.ensureGroups().find((g) => g.id === groupId) || null;
  }

  getSelectedGroup() {
    return this.getGroup(this.selectedGroupId) || this.ensureGroups()[0] || null;
  }

  setSelectedGroupId(groupId) {
    if (!this.getGroup(groupId)) return;
    this.selectedGroupId = groupId;
    this.selectedSegmentId = null;
    this._pathPick = null;
    this.persistToSceneUserData();
  }

  createGroup(name = "새 그룹") {
    const r = this.ensureRegistry();
    const group = this._normalizeGroup({ id: this._newGroupId(), name: String(name || "새 그룹"), members: [] });
    r.groups.push(group);
    this.selectedGroupId = group.id;
    this.persistToSceneUserData();
    return group;
  }

  renameGroup(groupId, name) {
    const group = this.getGroup(groupId);
    if (!group) return;
    group.name = String(name || group.name);
    this.persistToSceneUserData();
    import("./motionTimelineGroupFolder.js").then(({ ensureGroupFolder }) => {
      ensureGroupFolder(this.editor, group);
    });
  }

  async syncGroupTimeline(groupId, scope = "selected") {
    const group = this.getGroup(groupId);
    if (!group) return { ok: false, reason: "no_group" };
    const { syncGroupTimelineMove } = await import("./motionTimelineGroupFolder.js");
    const result = syncGroupTimelineMove(this.editor, group, scope);
    if (result.ok) this.persistToSceneUserData();
    return result;
  }

  async deleteGroup(groupId) {
    const { purgeGroupFromTimeline } = await import("./motionTimelineGroupFolder.js");
    purgeGroupFromTimeline(this.editor, groupId);
    const r = this.ensureRegistry();
    r.groups = r.groups.filter((g) => g.id !== groupId);
    if (!r.groups.length) {
      r.groups.push({ id: this._newGroupId(), name: "군무", members: [] });
    }
    if (this.selectedGroupId === groupId) {
      this.selectedGroupId = r.groups[0].id;
    }
    this.persistToSceneUserData();
  }

  findGroupWithCatalogIndex(catalogIndex, excludeGroupId = null) {
    const idx = Number(catalogIndex);
    if (!Number.isFinite(idx)) return null;
    return (
      this.ensureGroups().find(
        (g) =>
          g.id !== excludeGroupId &&
          g.members.some((m) => Number(m?.catalogIndex) === idx),
      ) || null
    );
  }

  addCatalogSlotToGroup(groupId, catalogEntry, catalogIndex) {
    if (!catalogEntry) return false;
    const group = this.getGroup(groupId);
    if (!group) return false;
    const idx = Number(catalogIndex);
    const exists = group.members.some(
      (m) => Number(m?.catalogIndex) === idx || m?.filename === catalogEntry.filename,
    );
    if (exists) return true;

    const r = this.ensureRegistry();
    for (const g of r.groups) {
      if (g.id === groupId) continue;
      g.members = g.members.filter(
        (m) =>
          Number(m?.catalogIndex) !== idx &&
          m?.filename !== catalogEntry.filename,
      );
    }

    group.members.push(this.createGroupMemberFromCatalog(catalogEntry, idx));
    this.persistToSceneUserData();
    return true;
  }

  addActorSlotToGroup(groupId, actorId) {
    const group = this.getGroup(groupId);
    if (!group) return false;
    const id = Number(actorId);
    const exists = group.members.some((m) => Number(m?.actorId) === id);
    if (exists) return true;
    group.members.push(this.createGroupMemberFromActor(id));
    this.persistToSceneUserData();
    return true;
  }

  removeMemberFromGroup(groupId, memberId) {
    const group = this.getGroup(groupId);
    if (!group) return;
    group.members = group.members.filter((m) => {
      if (typeof m === "string") return m !== memberId;
      return m?.id !== memberId && m?.deployedUuid !== memberId;
    });
    this.persistToSceneUserData();
  }

  updateGroupMember(groupId, memberId, patch) {
    const group = this.getGroup(groupId);
    if (!group || !patch) return;
    const member = group.members.find((m) => m?.id === memberId);
    if (!member) return;
    Object.assign(member, patch);
    this.persistToSceneUserData();
  }

  async deployGroup(groupId) {
    this.editor?.connectTimelineInstances?.();
    const group = this.getGroup(groupId);
    if (!group) return { ok: false, count: 0, errors: ["그룹을 찾을 수 없습니다."] };
    const catalog = await this.ensureFbxCatalog();
    const { deployGroupToStage } = await import("./showControlGroupDeploy.js");
    const result = await deployGroupToStage(this.editor, group, catalog);
    this.persistToSceneUserData();
    return result;
  }

  toggleFbxSlot(index) {
    const i = Number(index);
    if (!Number.isFinite(i) || i < 0) return;
    if (this.selectedFbxSlotIndices.has(i)) this.selectedFbxSlotIndices.delete(i);
    else this.selectedFbxSlotIndices.add(i);
  }

  clearFbxSlotSelection() {
    this.selectedFbxSlotIndices.clear();
  }

  async ensureFbxCatalog() {
    if (this._fbxCatalog) return this._fbxCatalog;
    if (!this._fbxCatalogPromise) {
      const { loadMotionFbxCatalog } = await import("../utils/motionFbxCatalog.js");
      this._fbxCatalogPromise = loadMotionFbxCatalog().then((list) => {
        this._fbxCatalog = list;
        this._fbxCatalogPromise = null;
        return list;
      });
    }
    return this._fbxCatalogPromise;
  }

  async addSelectedFbxSlotsToGroup(groupId, catalog) {
    if (!groupId || !Array.isArray(catalog) || !this.selectedFbxSlotIndices.size) return 0;
    let added = 0;
    for (const idx of [...this.selectedFbxSlotIndices].sort((a, b) => a - b)) {
      const entry = catalog[idx];
      if (!entry) continue;
      const ok = this.addCatalogSlotToGroup(groupId, entry, idx);
      if (ok) added++;
    }
    this.clearFbxSlotSelection();
    return added;
  }

  registerLight(uuid, name) {
    if (!uuid) return;
    const r = this.ensureRegistry();
    const exists = r.lights.some((x) => x?.uuid === uuid);
    if (!exists) r.lights.push({ uuid, name });
    this.persistToSceneUserData();
  }

  unregisterLight(uuid) {
    const r = this.ensureRegistry();
    r.lights = r.lights.filter((x) => x?.uuid !== uuid);
    this.persistToSceneUserData();
  }

  _normalizeRegistry() {
    const r = this.ensureRegistry();
    const mgr = this.editor?.actorsManager;
    r.motion = r.motion
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        if (entry.uuid) {
          const obj = this.editor?.scene?.getObjectByProperty?.("uuid", entry.uuid);
          return {
            uuid: entry.uuid,
            name: entry.name || obj?.name || entry.uuid,
            actorId: entry.actorId ?? obj?.userData?.actorId,
          };
        }
        if (entry.kind === "actor" && entry.actorId != null) {
          const actor = mgr?.getActor?.(Number(entry.actorId));
          if (actor?.object) {
            return {
              uuid: actor.object.uuid,
              name: actor.object.name || `Actor ${entry.actorId}`,
              actorId: Number(entry.actorId),
            };
          }
        }
        return null;
      })
      .filter(Boolean);
  }

  registerMotionObject(uuid, name, actorId) {
    if (!uuid) return;
    const r = this.ensureRegistry();
    const idx = r.motion.findIndex((x) => x?.uuid === uuid);
    const entry = { uuid, name: name || uuid };
    if (actorId != null) entry.actorId = Number(actorId);
    if (idx >= 0) r.motion[idx] = { ...r.motion[idx], ...entry };
    else r.motion.push(entry);
    this.persistToSceneUserData();
  }

  unregisterMotionObject(uuid) {
    if (!uuid) return;
    const r = this.ensureRegistry();
    r.motion = r.motion.filter((x) => x?.uuid !== uuid);
    r.groups.forEach((g) => {
      g.members = g.members.filter((m) => {
        if (typeof m === "string") return m !== uuid;
        return m?.deployedUuid !== uuid;
      });
    });
    this.persistToSceneUserData();
  }

  registerActor(actorId) {
    const id = Number(actorId);
    if (!Number.isFinite(id) || id <= 0) return;
    const actor = this.editor?.actorsManager?.getActor?.(id);
    if (actor?.object) {
      this.registerMotionObject(actor.object.uuid, actor.object.name || `Actor ${id}`, id);
      return;
    }
    const r = this.ensureRegistry();
    const exists = r.motion.some((x) => Number(x?.actorId) === id);
    if (!exists) r.motion.push({ actorId: id, name: `Actor ${id}` });
    this.persistToSceneUserData();
  }

  unregisterActor(actorId) {
    const id = Number(actorId);
    const r = this.ensureRegistry();
    r.motion = r.motion.filter((x) => Number(x?.actorId) !== id);
    this.persistToSceneUserData();
  }

  registerSelectedObject() {
    const obj = this.editor?.selected;
    if (!obj) return false;
    if (obj.isLight) {
      this.registerLight(obj.uuid, obj.name || obj.uuid);
      return true;
    }
    if (obj.userData?.source === "motion") {
      this.registerMotionObject(obj.uuid, obj.name || obj.uuid, obj.userData?.actorId);
      return true;
    }
    return false;
  }

  ensureDefaultShow() {
    if (this.cues.length > 0) return;
    this.cues = [
      {
        num: "1",
        name: "WORK Light 30%",
        preWait: 0,
        duration: 0,
        cont: "none",
        actions: [{ type: "workLight", level01: 0.3 }],
      },
    ];
    this.standbyIndex = 0;
    this.persistToSceneUserData();
  }

  setStandby(i) {
    const idx = Math.max(0, Math.min(this.cues.length, Number(i) || 0));
    this.standbyIndex = idx;
    this.persistToSceneUserData();
  }

  prev() {
    this.setStandby(this.standbyIndex - 1);
  }

  next() {
    this.setStandby(this.standbyIndex + 1);
  }

  go() {
    if (!this.cues.length) return;
    const i = this._nextArmed(this.standbyIndex);
    if (i >= this.cues.length) return;
    const cue = this.cues[i];
    this.setStandby(i + 1);
    this._fire(cue);
  }

  _nextArmed(i) {
    let idx = i;
    while (idx < this.cues.length && this.cues[idx]?.armed === false) idx++;
    return idx;
  }

  _fire(cue) {
    if (!cue || cue.armed === false) {
      if (cue?.cont === "cont") this.go();
      if (cue?.cont === "follow") this._schedule(cue?.duration || 0, () => this.go());
      return;
    }

    const pre = Number(cue.preWait) || 0;
    if (pre > 0) {
      this._schedule(pre, () => this._dispatch(cue));
    } else {
      this._dispatch(cue);
    }
  }

  _dispatch(cue) {
    const dur = Math.max(0, Number(cue.duration) || 0);
    const actions = Array.isArray(cue.actions) ? cue.actions : [];
    actions.forEach((a) => this._dispatchAction(a, dur));

    if (cue.cont === "cont") {
      this.go();
    } else if (cue.cont === "follow") {
      this._schedule(dur, () => this.go());
    }
  }

  _dispatchAction(action, cueDuration) {
    if (!action || !action.type) return;

    if (action.type === "workLight") {
      const v = Math.max(0, Math.min(1, Number(action.level01) || 0));
      if (this.editor?.setWorkLightLevel) this.editor.setWorkLightLevel(v);
      return;
    }

    if (action.type === "lightToggle") {
      const uuid = action.uuid;
      const enabled = !!action.enabled;
      const obj = uuid ? this.editor?.scene?.getObjectByProperty("uuid", uuid) : null;
      if (obj) {
        obj.visible = enabled;
        if (obj.isLight) obj.intensity = enabled ? (obj.userData?.savedIntensity ?? obj.intensity ?? 1) : 0;
      }
      return;
    }

    if (action.type === "moveActor") {
      this._moveMotionTarget(action.uuid, action.actorId, action.x, action.z, action.duration ?? cueDuration);
      return;
    }

    if (action.type === "moveGroup") {
      const group = this.getGroup(action.groupId);
      if (!group) return;
      const anchorX = Number(action.x ?? group.toX) || 0;
      const anchorZ = Number(action.z ?? group.toZ) || 0;
      const dur = action.duration ?? cueDuration ?? group.duration;
      const offsets = computeFormationOffsets(
        group.members.length,
        group.formation,
        group.formationSpacing,
      );
      group.members.forEach((member, i) => {
        const uuid = typeof member === "string" ? member : member?.deployedUuid;
        if (!uuid) return;
        const off = offsets[i] || { x: 0, z: 0 };
        this._moveMotionTarget(uuid, null, anchorX + off.x, anchorZ + off.z, dur);
      });
      return;
    }

    if (action.type === "deployGroup") {
      const gid = action.groupId || this.selectedGroupId;
      this.deployGroup(gid).catch((e) => console.error("deployGroup failed:", e));
      return;
    }
  }

  _moveMotionTarget(uuid, actorId, x, z, duration) {
    let obj = null;
    let actorEntry = null;
    const mgr = this.editor?.actorsManager;

    if (uuid) {
      obj = this.editor?.scene?.getObjectByProperty?.("uuid", uuid);
      const aid = obj?.userData?.actorId;
      if (aid != null) actorEntry = mgr?.getActor?.(Number(aid));
    } else if (actorId != null) {
      actorEntry = mgr?.getActor?.(Number(actorId));
      obj = actorEntry?.object || null;
    }
    if (!obj) return;

    const tx = Number(x);
    const tz = Number(z);
    if (!Number.isFinite(tx) || !Number.isFinite(tz)) return;

    const dur = Math.max(0.15, Number(duration) || 1.2);
    const fromX = obj.position.x;
    const fromZ = obj.position.z;
    if (actorEntry?.target) actorEntry.target.set(tx, 0, tz);

    this._tween(dur, (p) => {
      obj.position.x = fromX + (tx - fromX) * p;
      obj.position.z = fromZ + (tz - fromZ) * p;
    });
  }

  _schedule(delay, fn) {
    const d = Math.max(0, Number(delay) || 0);
    this._timers.push({ t: 0, dur: d, fire: fn });
  }

  _tween(duration, tick) {
    const d = Math.max(0.01, Number(duration) || 0.5);
    this._timers.push({
      t: 0,
      dur: d,
      ticking: true,
      tick,
    });
  }

  tick(dt) {
    if (!this._running) return;
    const delta = Math.max(0, Number(dt) || 0);
    if (delta <= 0) return;

    for (let i = this._timers.length - 1; i >= 0; i--) {
      const tm = this._timers[i];
      tm.t += delta;
      if (tm.ticking) {
        const p = Math.min(1, tm.t / tm.dur);
        const ease = p * p * (3 - 2 * p);
        tm.tick?.(ease);
        if (p >= 1) this._timers.splice(i, 1);
      } else if (tm.t >= tm.dur) {
        this._timers.splice(i, 1);
        tm.fire?.();
      }
    }

    this.persistToSceneUserData();
  }
}

