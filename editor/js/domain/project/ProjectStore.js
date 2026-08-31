import { resolveProjectMetaFromStageProfile } from '../stage/StageProfile.js';
import { fetchProject, fetchScene, saveProjectMeta, addScene as apiAddScene, deleteScene as apiDeleteScene, saveScene, reorderScenes as apiReorderScenes } from './projectApi.js';
import { applyScene, persistScene, serializeScene } from './SceneDocument.js';
import { createSceneLoadReport, verifySceneAssets } from './sceneLoadReport.js';
import { normalizePositionPreset } from '../motion/positionPresets.js';
import { normalizeMotionTemplate } from '../motion/motionTemplates.js';

/**
 * Active project + scene session (Phase 6).
 */
export class ProjectStore {
  /**
   * @param {string} projectId
   * @param {object} project — project.json body
   */
  constructor(projectId, project) {
    this.projectId = projectId;
    this.project = project;
    this.dirty = false;
    /** @type {object | null} */
    this.activeSceneDoc = null;
  }

  get activeSceneId() {
    return this.project.activeSceneId || this.project.scenes?.[0]?.id || 'scene_01';
  }

  get activeSceneMeta() {
    return (this.project.scenes || []).find((s) => s.id === this.activeSceneId) || null;
  }

  sceneName() {
    return this.activeSceneMeta?.name || '1막';
  }

  /** @param {string} sceneId */
  setActiveSceneId(sceneId) {
    this.project.activeSceneId = sceneId;
    this.dirty = true;
  }

  markDirty() {
    this.dirty = true;
  }

  markSaved() {
    this.dirty = false;
    this.project.updatedAt = new Date().toISOString();
  }

  /** @returns {boolean} project.json already owns positionPresets (incl. empty list) */
  hasProjectPositionPresetsField() {
    return Object.prototype.hasOwnProperty.call(this.project, 'positionPresets')
      && Array.isArray(this.project.positionPresets);
  }

  /** @param {import('../motion/PositionPresetStore.js').PositionPresetStore} store */
  syncPositionPresetsToProject(store) {
    if (!store) return;
    this.project.positionPresets = store.list();
  }

  /** Keep in-memory presets on project object after server returns a slim project.json */
  preservePositionPresetsInProject(store) {
    const list = store?.list?.() || [];
    if (list.length) {
      this.project.positionPresets = list;
    }
  }

  /**
   * Write positionPresets to project.json immediately (project-wide, not per scene).
   * @param {import('../motion/PositionPresetStore.js').PositionPresetStore} store
   */
  async persistPositionPresets(store) {
    if (!store) return;
    this.syncPositionPresetsToProject(store);
    this.project.updatedAt = new Date().toISOString();
    const saved = await saveProjectMeta(this.projectId, this.project);
    if (saved) this.project = saved;
  }

  /**
   * @param {import('./positionPresets.js').PositionPreset[]} lists
   * @returns {import('./positionPresets.js').PositionPreset[]}
   */
  mergePositionPresetLists(...lists) {
    /** @type {Map<string, import('../motion/positionPresets.js').PositionPreset>} */
    const byId = new Map();
    for (const list of lists) {
      for (const raw of list || []) {
        const p = normalizePositionPreset(raw);
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
    return [...byId.values()];
  }

  /**
   * One-time: collect presets stored in legacy per-scene JSON files.
   * @param {object | null | undefined} activeSceneDoc
   */
  async collectLegacyPositionPresets(activeSceneDoc) {
    /** @type {import('../motion/positionPresets.js').PositionPreset[][]} */
    const chunks = [activeSceneDoc?.positionPresets || []];
    for (const scene of this.project.scenes || []) {
      if (scene.id === activeSceneDoc?.id) continue;
      try {
        const doc = await fetchScene(this.projectId, scene.id);
        if (doc?.positionPresets?.length) chunks.push(doc.positionPresets);
      } catch {
        /* skip unreadable scene */
      }
    }
    return this.mergePositionPresetLists(...chunks);
  }

  /**
   * Load project-wide saved positions before applying scene content.
   * @param {import('../motion/PositionPresetStore.js').PositionPresetStore} store
   * @param {object | null | undefined} sceneDoc
   */
  async applyPositionPresetsForLoad(store, sceneDoc = null) {
    if (!store) return;

    const projectPresets = this.hasProjectPositionPresetsField()
      ? this.project.positionPresets
      : null;

    if (Array.isArray(projectPresets) && projectPresets.length > 0) {
      store.replaceAll(projectPresets);
      return;
    }

    const legacy = await this.collectLegacyPositionPresets(sceneDoc);
    if (legacy.length) {
      store.replaceAll(legacy);
      this.project.positionPresets = legacy;
      this.dirty = true;
      try {
        await this.persistPositionPresets(store);
      } catch (err) {
        console.warn('[ProjectStore] positionPresets migration save failed:', err);
      }
      return;
    }

    if (Array.isArray(projectPresets)) {
      store.replaceAll(projectPresets);
    }
  }

  /** @returns {boolean} */
  hasProjectMotionTemplatesField() {
    return Object.prototype.hasOwnProperty.call(this.project, 'motionTemplates')
      && Array.isArray(this.project.motionTemplates);
  }

  /** @param {import('../motion/MotionTemplateStore.js').MotionTemplateStore} store */
  syncMotionTemplatesToProject(store) {
    if (!store) return;
    this.project.motionTemplates = store.list();
  }

  /**
   * @param {import('../motion/MotionTemplateStore.js').MotionTemplateStore} store
   */
  async persistMotionTemplates(store) {
    if (!store) return;
    this.syncMotionTemplatesToProject(store);
    this.project.updatedAt = new Date().toISOString();
    const saved = await saveProjectMeta(this.projectId, this.project);
    if (saved) this.project = saved;
  }

  /**
   * @param {import('../motion/MotionTemplateStore.js').MotionTemplateStore} store
   */
  applyMotionTemplatesForLoad(store) {
    if (!store) return;
    const list = this.hasProjectMotionTemplatesField()
      ? this.project.motionTemplates
      : [];
    store.replaceAll((list || []).map((t) => normalizeMotionTemplate(t)));
    if (!store.activeId && store.list().length) {
      store.setActive(store.list()[0].id);
    }
  }

  /**
   * @param {{
   *   showName: string,
   *   genre?: string,
   *   venue?: string,
   *   director?: string,
   *   startDate?: string,
   *   endDate?: string,
   *   stageProfile?: object,
   * }} patch
   */
  applyMetaPatch(patch) {
    const showName = String(patch.showName || '').trim();
    if (!showName) throw new Error('공연명을 입력해주세요.');
    const p = this.project;
    p.showName = showName;
    p.name = showName;
    p.genre = String(patch.genre ?? p.genre ?? '').trim();
    p.venue = String(patch.venue ?? p.venue ?? '').trim();
    p.director = String(patch.director ?? p.director ?? '').trim();
    p.startDate = String(patch.startDate ?? p.startDate ?? '').trim();
    p.endDate = String(patch.endDate ?? p.endDate ?? '').trim();
    p.showPeriod = p.startDate && p.endDate ? `${p.startDate} ~ ${p.endDate}` : (p.showPeriod || '');
    if (patch.stageProfile) {
      p.stageProfile = { ...patch.stageProfile };
    }
    this.dirty = true;
  }

  /** 무대 패널 규격 변경 → project.venue / project.stageProfile 동기화 */
  syncStageProfileMeta(profile) {
    const meta = resolveProjectMetaFromStageProfile(profile);
    this.project.venue = meta.venue;
    this.project.stageProfile = { ...meta.stageProfile };
    this.dirty = true;
  }

  /**
   * @param {Parameters<typeof serializeScene>[0]} ctx
   */
  captureScene(ctx) {
    const doc = serializeScene({
      ...ctx,
      projectId: this.projectId,
      sceneId: this.activeSceneId,
      sceneName: this.sceneName(),
      previousSceneDoc: this.activeSceneDoc,
    });
    this.activeSceneDoc = doc;
    return doc;
  }

  /**
   * @param {Parameters<typeof applyScene>[1]} ctx
   */
  async loadActiveScene(ctx) {
    const doc = await fetchScene(this.projectId, this.activeSceneId);
    this.activeSceneDoc = doc;
    await this.applyPositionPresetsForLoad(ctx.positionPresetStore, doc);
    this.applyMotionTemplatesForLoad(ctx.motionTemplateStore);
    const loadReport = createSceneLoadReport();
    await applyScene(doc, { ...ctx, projectId: this.projectId, loadReport });
    await verifySceneAssets(this.projectId, doc, loadReport);
    this.markSaved();
    return { doc, loadReport };
  }

  /**
   * @param {Parameters<typeof serializeScene>[0]} ctx
   */
  async saveActiveScene(ctx) {
    this.syncPositionPresetsToProject(ctx.positionPresetStore);
    this.syncMotionTemplatesToProject(ctx.motionTemplateStore);
    const doc = this.captureScene(ctx);
    await persistScene(this, doc);
    this.project.activeSceneId = this.activeSceneId;
    await saveProjectMeta(this.projectId, this.project);
    return doc;
  }

  /** Persist project.json only (popup edit). */
  async saveMetaOnly() {
    await saveProjectMeta(this.projectId, this.project);
  }

  /**
   * @param {Parameters<typeof applyScene>[1]} ctx
   * @param {string} sceneId
   */
  async switchScene(ctx, sceneId) {
    if (sceneId === this.activeSceneId) return null;
    await this.saveActiveScene(ctx);
    this.setActiveSceneId(sceneId);
    await saveProjectMeta(this.projectId, this.project);
    return this.loadActiveScene(ctx);
  }

  /**
   * @param {Parameters<typeof applyScene>[1]} ctx
   * @param {string} [name]
   */
  async createScene(ctx, name) {
    await this.saveActiveScene(ctx);
    const data = await apiAddScene(this.projectId, name);
    this.project = data.project;
    this.preservePositionPresetsInProject(ctx.positionPresetStore);
    const result = await this.loadActiveScene(ctx);
    return { sceneId: data.sceneId, loadReport: result.loadReport };
  }

  /**
   * @param {string} sceneId
   * @param {string} name
   */
  async renameScene(sceneId, name) {
    const scenes = this.project.scenes || [];
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;
    scene.name = name;
    this.dirty = true;
    await saveProjectMeta(this.projectId, this.project);
  }

  /**
   * @param {string} sceneId
   * @param {'up' | 'down'} direction
   */
  async reorderScene(sceneId, direction) {
    const scenes = [...(this.project.scenes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx < 0) return;
    const swap = direction === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= scenes.length) return;
    const reordered = [...scenes];
    [reordered[idx], reordered[swap]] = [reordered[swap], reordered[idx]];
    const data = await apiReorderScenes(this.projectId, reordered.map((s) => s.id));
    if (!data?.project) throw new Error('씬 순서 저장 응답이 올바르지 않습니다.');
    this.project = data.project;
  }

  /**
   * @param {Parameters<typeof applyScene>[1]} ctx
   * @param {string} [sceneId] — default active
   */
  async duplicateScene(ctx, sceneId) {
    await this.saveActiveScene(ctx);
    const sourceId = sceneId || this.activeSceneId;
    const srcMeta = (this.project.scenes || []).find((s) => s.id === sourceId);
    let sourceDoc;
    if (sourceId === this.activeSceneId) {
      sourceDoc = this.captureScene(ctx);
    } else {
      sourceDoc = await fetchScene(this.projectId, sourceId);
    }
    const name = `${srcMeta?.name || sourceDoc?.name || sourceId} 복사`;
    const data = await apiAddScene(this.projectId, name);
    const newId = data.sceneId;
    const copy = {
      ...JSON.parse(JSON.stringify(sourceDoc)),
      id: newId,
      name,
    };
    await saveScene(this.projectId, newId, copy);
    this.project = data.project;
    this.preservePositionPresetsInProject(ctx.positionPresetStore);
    const result = await this.loadActiveScene(ctx);
    this.markSaved();
    return { newId, loadReport: result.loadReport };
  }

  /**
   * @param {Parameters<typeof applyScene>[1]} ctx
   * @param {string} sceneId
   */
  async deleteScene(ctx, sceneId) {
    const scenes = this.project.scenes || [];
    if (scenes.length <= 1) {
      throw new Error('마지막 씬은 삭제할 수 없습니다.');
    }
    if (!scenes.some((s) => s.id === sceneId)) {
      throw new Error('씬을 찾을 수 없습니다.');
    }
    const deletingActive = sceneId === this.activeSceneId;
    if (this.dirty) {
      await this.saveActiveScene(ctx);
    }
    const data = await apiDeleteScene(this.projectId, sceneId);
    this.project = data.project;
    this.preservePositionPresetsInProject(ctx.positionPresetStore);
    if (deletingActive) {
      return this.loadActiveScene(ctx);
    }
    this.markSaved();
    return null;
  }

  /** @param {Parameters<typeof applyScene>[1]} ctx — reload project.json + active scene from server */
  async reloadFromServer(ctx) {
    this.project = await fetchProject(this.projectId);
    this.activeSceneDoc = null;
    const scenes = this.project.scenes || [];
    if (scenes.length && !scenes.some((s) => s.id === this.activeSceneId)) {
      this.project.activeSceneId = scenes[0].id;
      await saveProjectMeta(this.projectId, this.project);
    }
    return this.loadActiveScene(ctx);
  }

  /** @param {string} projectId */
  static async open(projectId) {
    const project = await fetchProject(projectId);
    return new ProjectStore(projectId, project);
  }
}
