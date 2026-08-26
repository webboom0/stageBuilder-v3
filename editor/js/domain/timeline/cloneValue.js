/** Deep-ish clone for keyframe values (motion bags, arrays). */
export function cloneKeyframeValue(value) {
  if (Array.isArray(value)) return value.map((v) => (typeof v === 'number' ? v : cloneKeyframeValue(v)));
  if (value && typeof value === 'object') {
    /** @type {Record<string, any>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = cloneKeyframeValue(v);
    }
    return out;
  }
  return value;
}
