import { normalizePositionPreset, newPositionPresetId } from './positionPresets.js';

/**
 * Project-scoped saved positions (등장·퇴장 등) — persisted in project.json.
 */
export class PositionPresetStore {
  constructor() {
    /** @type {import('./positionPresets.js').PositionPreset[]} */
    this.presets = [];
  }

  list() {
    return this.presets.slice();
  }

  /** @param {string} id */
  get(id) {
    return this.presets.find((p) => p.id === id) ?? null;
  }

  /** @param {Partial<import('./positionPresets.js').PositionPreset>} raw */
  add(raw) {
    const p = normalizePositionPreset({ ...raw, id: raw?.id || newPositionPresetId() });
    this.presets.push(p);
    return p;
  }

  /** @param {string} id @param {Partial<import('./positionPresets.js').PositionPreset>} patch */
  update(id, patch) {
    const i = this.presets.findIndex((p) => p.id === id);
    if (i < 0) return null;
    this.presets[i] = normalizePositionPreset({ ...this.presets[i], ...patch, id });
    return this.presets[i];
  }

  /** @param {string} id */
  remove(id) {
    const before = this.presets.length;
    this.presets = this.presets.filter((p) => p.id !== id);
    return this.presets.length < before;
  }

  /** @param {import('./positionPresets.js').PositionPreset[]} next */
  replaceAll(next) {
    this.presets = (next || []).map((p) => normalizePositionPreset(p));
  }
}
