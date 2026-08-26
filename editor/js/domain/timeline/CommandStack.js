/**
 * Simple command stack for timeline undo/redo.
 */
export class CommandStack {
  constructor(limit = 100) {
    this.limit = limit;
    /** @type {Array<{ label: string, undo: () => void, redo: () => void }>} */
    this._stack = [];
    this._index = -1;
    /** @type {Set<() => void>} */
    this._listeners = new Set();
  }

  /** @param {{ label: string, undo: () => void, redo: () => void }} cmd */
  push(cmd) {
    this._stack = this._stack.slice(0, this._index + 1);
    this._stack.push(cmd);
    if (this._stack.length > this.limit) {
      this._stack.shift();
    } else {
      this._index += 1;
    }
    this._index = this._stack.length - 1;
    this._emit();
  }

  canUndo() {
    return this._index >= 0;
  }

  canRedo() {
    return this._index < this._stack.length - 1;
  }

  undo() {
    if (!this.canUndo()) return false;
    const cmd = this._stack[this._index];
    cmd.undo();
    this._index -= 1;
    this._emit();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
    this._index += 1;
    this._stack[this._index].redo();
    this._emit();
    return true;
  }

  /** @param {() => void} fn */
  subscribe(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _emit() {
    this._listeners.forEach((fn) => fn());
  }
}
