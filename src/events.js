/**
 * Minimal event emitter with the WebViewer surface: `addEventListener`, `removeEventListener`
 * and `trigger`. Listeners receive the trigger arguments as-is, so `trigger('x', data)` calls
 * `listener(data)` like WebViewer does for custom events.
 */
export class Emitter {
    constructor() {
        this._listeners = new Map();
    }

    addEventListener(name, listener, options = {}) {
        if (typeof listener !== 'function') {
            return;
        }
        const list = this._listeners.get(name) || [];
        list.push({ listener, once: !!options.once });
        this._listeners.set(name, list);
    }

    removeEventListener(name, listener) {
        if (!listener) {
            this._listeners.delete(name);
            return;
        }
        const list = this._listeners.get(name);
        if (list) {
            this._listeners.set(name, list.filter((entry) => entry.listener !== listener));
        }
    }

    trigger(name, ...args) {
        const list = this._listeners.get(name);
        if (!list?.length) {
            return;
        }
        for (const entry of [...list]) {
            if (entry.once) {
                this.removeEventListener(name, entry.listener);
            }
            try {
                entry.listener(...args);
            } catch (error) {
                console.error(`[pdfmatrix-webviewer] listener for "${name}" failed`, error);
            }
        }
    }
}
