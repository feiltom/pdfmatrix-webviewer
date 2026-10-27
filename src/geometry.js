/**
 * Geometry and color primitives exposed as `Core.Math` and `Core.Annotations.Color`.
 *
 * Coordinate conventions, identical to WebViewer: annotation geometry is in "page coordinates",
 * PDF points with the origin at the top-left corner of the page as it is displayed without any
 * viewer rotation (the page's own /Rotate is applied). XFDF uses PDF user space instead; the
 * conversion lives in xfdf.js.
 */

const clampByte = (v) => Math.max(0, Math.min(255, Math.round(Number(v) || 0)));

export class Color {
    constructor(r = 0, g = 0, b = 0, a = 1) {
        if (typeof r === 'string') {
            const parsed = Color.parse(r);
            this.R = parsed.R;
            this.G = parsed.G;
            this.B = parsed.B;
            this.A = parsed.A;
            return;
        }
        this.R = clampByte(r);
        this.G = clampByte(g);
        this.B = clampByte(b);
        this.A = a === undefined || a === null ? 1 : Math.max(0, Math.min(1, Number(a)));
    }

    set(r, g, b, a = 1) {
        this.R = clampByte(r);
        this.G = clampByte(g);
        this.B = clampByte(b);
        this.A = a;
    }

    clone() {
        return new Color(this.R, this.G, this.B, this.A);
    }

    toHexString() {
        return `#${[this.R, this.G, this.B].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
    }

    toString() {
        return `rgba(${this.R},${this.G},${this.B},${this.A})`;
    }

    /** Transparent colors draw nothing. */
    isTransparent() {
        return this.A === 0;
    }

    /** Accepts `#RGB`, `#RRGGBB`, `rgb()/rgba()` strings; anything else becomes transparent. */
    static parse(value) {
        const s = String(value || '').trim();
        let m = /^#([0-9a-f]{3})$/i.exec(s);
        if (m) {
            const [r, g, b] = m[1].split('').map((c) => parseInt(c + c, 16));
            return new Color(r, g, b, 1);
        }
        m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
        if (m) {
            const n = parseInt(m[1], 16);
            const a = m[2] ? parseInt(m[2], 16) / 255 : 1;
            return new Color((n >> 16) & 255, (n >> 8) & 255, n & 255, a);
        }
        m = /^rgba?\(([^)]+)\)$/i.exec(s);
        if (m) {
            const [r, g, b, a] = m[1].split(',').map((p) => parseFloat(p));
            return new Color(r, g, b, Number.isFinite(a) ? a : 1);
        }
        return new Color(0, 0, 0, 0);
    }

    static from(value, fallback) {
        if (value instanceof Color) {
            return value;
        }
        if (value && typeof value === 'object' && 'R' in value) {
            return new Color(value.R, value.G, value.B, value.A ?? 1);
        }
        if (typeof value === 'string') {
            return Color.parse(value);
        }
        return fallback ? fallback.clone() : new Color(0, 0, 0, 0);
    }
}

export class Point {
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

export class Rect {
    constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0) {
        this.x1 = x1;
        this.y1 = y1;
        this.x2 = x2;
        this.y2 = y2;
    }

    getWidth() {
        return Math.abs(this.x2 - this.x1);
    }

    getHeight() {
        return Math.abs(this.y2 - this.y1);
    }

    normalize() {
        const { x1, y1, x2, y2 } = this;
        this.x1 = Math.min(x1, x2);
        this.x2 = Math.max(x1, x2);
        this.y1 = Math.min(y1, y2);
        this.y2 = Math.max(y1, y2);
        return this;
    }
}

/**
 * Quad points. WebViewer lists the corners counter-clockwise from the bottom-left corner in page
 * coordinates (y grows downwards), which is what callers build by hand.
 */
export class Quad {
    constructor(x1 = 0, y1 = 0, x2 = 0, y2 = 0, x3 = 0, y3 = 0, x4 = 0, y4 = 0) {
        Object.assign(this, { x1, y1, x2, y2, x3, y3, x4, y4 });
    }

    toRect() {
        const b = quadBounds(this);
        return new Rect(b.x, b.y, b.x + b.w, b.y + b.h);
    }

    static fromBox(x, y, w, h) {
        return new Quad(x, y + h, x + w, y + h, x + w, y, x, y);
    }
}

export const quadBounds = (q) => {
    const xs = [q.x1, q.x2, q.x3, q.x4].map(Number);
    const ys = [q.y1, q.y2, q.y3, q.y4].map(Number);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
};

export const pointsBounds = (points) => {
    if (!points.length) {
        return { x: 0, y: 0, w: 0, h: 0 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
};

/**
 * View rotations, in quarter turns clockwise (the `Core.PageRotation` values). Maps a point in
 * page coordinates (page size w × h) to the rotated display, and back.
 */
export const rotatePoint = (x, y, w, h, rotation) => {
    switch (((rotation % 4) + 4) % 4) {
        case 1: return { x: h - y, y: x };
        case 2: return { x: w - x, y: h - y };
        case 3: return { x: y, y: w - x };
        default: return { x, y };
    }
};

export const unrotatePoint = (x, y, w, h, rotation) => {
    switch (((rotation % 4) + 4) % 4) {
        case 1: return { x: y, y: h - x };
        case 2: return { x: w - x, y: h - y };
        case 3: return { x: w - y, y: x };
        default: return { x, y };
    }
};

/** SVG `transform` mapping page coordinates to the rotated display, in page units. */
export const rotationMatrix = (w, h, rotation) => {
    switch (((rotation % 4) + 4) % 4) {
        case 1: return `matrix(0,1,-1,0,${h},0)`;
        case 2: return `matrix(-1,0,0,-1,${w},${h})`;
        case 3: return `matrix(0,-1,1,0,0,${w})`;
        default: return '';
    }
};
