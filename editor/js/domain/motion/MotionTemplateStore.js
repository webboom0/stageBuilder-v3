import { normalizeMotionTemplate, newMotionTemplateId } from './motionTemplates.js';

/**
 * Project-scoped keyframe choreography templates.
 */
export class MotionTemplateStore {
  constructor() {
    /** @type {import('./motionTemplates.js').MotionTemplate[]} */
    this.templates = [];
    /** @type {string | null} */
    this.activeId = null;
  }

  list() {
    return this.templates.slice();
  }

  /** @param {string} id */
  get(id) {
    return this.templates.find((t) => t.id === id) ?? null;
  }

  getActive() {
    return this.activeId ? this.get(this.activeId) : null;
  }

  /** @param {string | null} id */
  setActive(id) {
    this.activeId = id && this.get(id) ? id : null;
  }

  /**
   * @param {string} name
   * @returns {import('./motionTemplates.js').MotionTemplate}
   */
  create(name) {
    const label = String(name || '패턴').trim() || '패턴';
    const t = normalizeMotionTemplate({
      label,
      keyframes: [{
        timeOffset: 0,
        offsetX: 0,
        offsetZ: 0,
        deltaRotY: 0,
        opacity: 1,
        visible: true,
      }],
    });
    this.templates.push(t);
    this.activeId = t.id;
    return t;
  }

  /** @param {Partial<import('./motionTemplates.js').MotionTemplate>} raw */
  add(raw) {
    const t = normalizeMotionTemplate({ ...raw, id: raw?.id || newMotionTemplateId() });
    this.templates.push(t);
    return t;
  }

  /** @param {string} id @param {Partial<import('./motionTemplates.js').MotionTemplate>} patch */
  update(id, patch) {
    const i = this.templates.findIndex((t) => t.id === id);
    if (i < 0) return null;
    this.templates[i] = normalizeMotionTemplate({ ...this.templates[i], ...patch, id });
    return this.templates[i];
  }

  /** @param {string} id */
  remove(id) {
    const before = this.templates.length;
    this.templates = this.templates.filter((t) => t.id !== id);
    if (this.activeId === id) this.activeId = this.templates[0]?.id ?? null;
    return this.templates.length < before;
  }

  /** @param {import('./motionTemplates.js').MotionTemplate[]} next */
  replaceAll(next) {
    this.templates = (next || []).map((t) => normalizeMotionTemplate(t));
    if (this.activeId && !this.get(this.activeId)) {
      this.activeId = this.templates[0]?.id ?? null;
    }
  }
}
