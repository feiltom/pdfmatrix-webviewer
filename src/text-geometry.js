import { Quad } from './geometry.js';

/**
 * Character boxes of a page in page coordinates, built from pdf.js text content. Used by the text
 * markup tools (highlight, underline…) to turn a drag into quads without relying on the browser
 * selection, which does not cross shadow DOM boundaries reliably.
 */
export class PageText {
    /** `transform` is the scale-1 viewport transform of the page. */
    constructor(textContent, transform, util) {
        this.chars = [];
        const styles = textContent.styles || {};
        for (const item of textContent.items) {
            if (!item.str || !item.transform) {
                continue;
            }
            const tx = util.transform(transform, item.transform);
            const fontHeight = Math.hypot(tx[2], tx[3]);
            if (!fontHeight) {
                continue;
            }
            const style = styles[item.fontName] || {};
            const ascent = Number.isFinite(style.ascent) ? style.ascent : 0.8;
            const descent = Number.isFinite(style.descent) ? style.descent : -0.2;
            const angle = Math.atan2(tx[1], tx[0]);
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            const length = (item.width || 0) * Math.hypot(transform[0], transform[1]);
            const n = item.str.length;
            for (let i = 0; i < n; i += 1) {
                const t0 = (length * i) / n;
                const t1 = (length * (i + 1)) / n;
                // Corners: along the baseline from t0 to t1, from descent to ascent above it.
                const pts = [[t0, -ascent], [t1, -ascent], [t1, -descent], [t0, -descent]].map(([u, v]) => ({
                    x: tx[4] + u * cos - v * fontHeight * sin,
                    y: tx[5] + u * sin + v * fontHeight * cos,
                }));
                const xs = pts.map((p) => p.x);
                const ys = pts.map((p) => p.y);
                const x = Math.min(...xs);
                const y = Math.min(...ys);
                this.chars.push({
                    ch: item.str[i], x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y,
                });
            }
            if (item.hasEOL) {
                this.chars.push(null);
            }
        }
        this.chars = this.chars.filter(Boolean);
    }

    /** Index of the character nearest to the point. */
    hit(x, y) {
        let best = -1;
        let bestDistance = Infinity;
        this.chars.forEach((c, i) => {
            const dx = x < c.x ? c.x - x : x > c.x + c.w ? x - c.x - c.w : 0;
            const dy = y < c.y ? c.y - y : y > c.y + c.h ? y - c.y - c.h : 0;
            // Prefer characters on the same line.
            const d = dy * 4 + dx;
            if (d < bestDistance) {
                bestDistance = d;
                best = i;
            }
        });
        return best;
    }

    /** Text between two points, in content order. */
    range(from, to) {
        if (!this.chars.length) {
            return [];
        }
        let a = this.hit(from.x, from.y);
        let b = this.hit(to.x, to.y);
        if (a > b) {
            [a, b] = [b, a];
        }
        return this.chars.slice(a, b + 1);
    }

    /** Merges characters into one quad per line run. */
    static quads(chars) {
        const lines = [];
        for (const c of chars) {
            if (!c.ch.trim() && !lines.length) {
                continue;
            }
            const last = lines[lines.length - 1];
            const sameLine = last
                && Math.abs((last.y + last.h / 2) - (c.y + c.h / 2)) < Math.max(last.h, c.h) * 0.5
                && c.x >= last.x + last.w - c.h
                && c.x - (last.x + last.w) < c.h * 3;
            if (sameLine) {
                const x2 = Math.max(last.x + last.w, c.x + c.w);
                const y2 = Math.max(last.y + last.h, c.y + c.h);
                last.x = Math.min(last.x, c.x);
                last.y = Math.min(last.y, c.y);
                last.w = x2 - last.x;
                last.h = y2 - last.y;
            } else if (c.ch.trim()) {
                lines.push({ x: c.x, y: c.y, w: c.w, h: c.h });
            }
        }
        return lines.map((l) => Quad.fromBox(l.x, l.y, l.w, l.h));
    }

    text(chars) {
        return chars.map((c) => c.ch).join('');
    }
}
