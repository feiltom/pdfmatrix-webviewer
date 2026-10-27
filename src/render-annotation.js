import {
    EllipseAnnotation, FreeHandAnnotation, FreeTextAnnotation, LineAnnotation, PolygonAnnotation, PolylineAnnotation,
    RectangleAnnotation, StampAnnotation, StickyAnnotation, TextHighlightAnnotation, TextMarkupAnnotation,
    TextSquigglyAnnotation, TextStrikeoutAnnotation, TextUnderlineAnnotation,
} from './annotations.js';
import { quadBounds } from './geometry.js';

/** Draws annotations as SVG, in page coordinates. */

const SVG = 'http://www.w3.org/2000/svg';
const XHTML = 'http://www.w3.org/1999/xhtml';

export const svgEl = (doc, name, attrs = {}) => {
    const el = doc.createElementNS(SVG, name);
    for (const [k, v] of Object.entries(attrs)) {
        if (v !== undefined && v !== null && v !== '') {
            el.setAttribute(k, String(v));
        }
    }
    return el;
};

const paint = (color) => (color && !color.isTransparent() ? `rgb(${color.R},${color.G},${color.B})` : 'none');

const paintOpacity = (color) => (color && !color.isTransparent() ? color.A : undefined);

const dashArray = (a) => {
    const d = Array.isArray(a.Dashes) ? a.Dashes.join(',') : String(a.Dashes || '').trim();
    return d && d !== '0' ? d : undefined;
};

const strokeAttrs = (a) => ({
    stroke: paint(a.StrokeColor),
    'stroke-opacity': paintOpacity(a.StrokeColor),
    'stroke-width': a.StrokeThickness > 0 ? a.StrokeThickness : 0,
    'stroke-dasharray': dashArray(a),
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
});

const arrowHead = (doc, a, from, to, style) => {
    if (!style || style === 'None') {
        return null;
    }
    const size = Math.max(6, a.StrokeThickness * 4);
    const angle = Math.atan2(to.y - from.y, to.x - from.x);
    const wing = (sign) => ({
        x: to.x - size * Math.cos(angle + (sign * Math.PI) / 7),
        y: to.y - size * Math.sin(angle + (sign * Math.PI) / 7),
    });
    const l = wing(1);
    const r = wing(-1);
    if (/Closed/i.test(style)) {
        return svgEl(doc, 'polygon', {
            points: `${l.x},${l.y} ${to.x},${to.y} ${r.x},${r.y}`,
            ...strokeAttrs(a),
            fill: paint(a.FillColor.isTransparent() ? a.StrokeColor : a.FillColor),
        });
    }
    if (/Arrow/i.test(style)) {
        return svgEl(doc, 'polyline', { points: `${l.x},${l.y} ${to.x},${to.y} ${r.x},${r.y}`, ...strokeAttrs(a), fill: 'none' });
    }
    if (/Circle/i.test(style)) {
        return svgEl(doc, 'circle', { cx: to.x, cy: to.y, r: size / 2, ...strokeAttrs(a), fill: paint(a.FillColor) });
    }
    if (/Square/i.test(style)) {
        return svgEl(doc, 'rect', { x: to.x - size / 2, y: to.y - size / 2, width: size, height: size, ...strokeAttrs(a), fill: paint(a.FillColor) });
    }
    return null;
};

const squigglyPath = (x, y, w, h) => {
    const step = Math.max(1.5, h / 6);
    let d = `M${x},${y}`;
    let up = true;
    for (let cx = x + step; cx <= x + w + 0.01; cx += step) {
        d += ` L${cx},${up ? y - step / 2 : y}`;
        up = !up;
    }
    return d;
};

const stickyIcon = (doc, a, box) => {
    const g = svgEl(doc, 'g');
    const s = Math.min(box.w, box.h) / 24;
    const body = svgEl(doc, 'path', {
        d: 'M3 4h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-9l-5 4v-4H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z',
        transform: `translate(${box.x},${box.y}) scale(${s})`,
        fill: paint(a.StrokeColor),
        stroke: '#5a4b00',
        'stroke-width': 1,
    });
    g.append(body);
    for (const y of [8.5, 12.5]) {
        g.append(svgEl(doc, 'line', {
            x1: 6, y1: y, x2: 18, y2: y, stroke: '#5a4b00', 'stroke-width': 1.2,
            transform: `translate(${box.x},${box.y}) scale(${s})`,
        }));
    }
    return g;
};

/**
 * Builds the SVG group drawing `a`. `interactive` adds an invisible hit area over the bounding box
 * so a click anywhere inside selects the annotation.
 */
export const renderAnnotation = (doc, a, { interactive = false } = {}) => {
    const g = svgEl(doc, 'g', { 'data-annotation-id': a.Id, class: 'pmw-annot' });
    const box = a._getBox();
    if (a.Opacity !== undefined && Number(a.Opacity) !== 1) {
        g.setAttribute('opacity', String(a.Opacity));
    }

    if (interactive) {
        const pad = Math.max(2, (a.StrokeThickness || 0) / 2 + 2);
        g.append(svgEl(doc, 'rect', {
            x: box.x - pad, y: box.y - pad, width: box.w + pad * 2, height: box.h + pad * 2,
            fill: 'transparent', class: 'pmw-hit',
        }));
    }

    if (a instanceof RectangleAnnotation) {
        g.append(svgEl(doc, 'rect', {
            x: box.x, y: box.y, width: box.w, height: box.h, fill: paint(a.FillColor), 'fill-opacity': paintOpacity(a.FillColor), ...strokeAttrs(a),
        }));
    } else if (a instanceof EllipseAnnotation) {
        g.append(svgEl(doc, 'ellipse', {
            cx: box.x + box.w / 2, cy: box.y + box.h / 2, rx: box.w / 2, ry: box.h / 2,
            fill: paint(a.FillColor), 'fill-opacity': paintOpacity(a.FillColor), ...strokeAttrs(a),
        }));
    } else if (a instanceof LineAnnotation) {
        const s = a.getStartPoint();
        const e = a.getEndPoint();
        g.append(svgEl(doc, 'line', { x1: s.x, y1: s.y, x2: e.x, y2: e.y, ...strokeAttrs(a) }));
        const head = arrowHead(doc, a, e, s, a.StartStyle);
        const tail = arrowHead(doc, a, s, e, a.EndStyle);
        if (head) { g.append(head); }
        if (tail) { g.append(tail); }
    } else if (a instanceof PolygonAnnotation) {
        const points = a.getPath().map((p) => `${p.x},${p.y}`).join(' ');
        const closed = !(a instanceof PolylineAnnotation);
        g.append(svgEl(doc, closed ? 'polygon' : 'polyline', {
            points, fill: closed ? paint(a.FillColor) : 'none', 'fill-opacity': closed ? paintOpacity(a.FillColor) : undefined, ...strokeAttrs(a),
        }));
    } else if (a instanceof FreeHandAnnotation) {
        for (const path of a.getPaths()) {
            if (!path.length) { continue; }
            const d = path.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' ');
            g.append(svgEl(doc, 'path', { d: path.length === 1 ? `${d} l0.01,0` : d, fill: 'none', ...strokeAttrs(a) }));
        }
    } else if (a instanceof TextMarkupAnnotation) {
        const color = paint(a.StrokeColor);
        for (const q of a.Quads) {
            const b = quadBounds(q);
            if (a instanceof TextHighlightAnnotation) {
                g.append(svgEl(doc, 'rect', { x: b.x, y: b.y, width: b.w, height: b.h, fill: color, class: 'pmw-highlight' }));
            } else if (a instanceof TextUnderlineAnnotation) {
                const y = b.y + b.h - Math.max(0.5, b.h * 0.07);
                g.append(svgEl(doc, 'line', { x1: b.x, y1: y, x2: b.x + b.w, y2: y, stroke: color, 'stroke-width': Math.max(0.6, b.h * 0.07) }));
            } else if (a instanceof TextStrikeoutAnnotation) {
                const y = b.y + b.h / 2;
                g.append(svgEl(doc, 'line', { x1: b.x, y1: y, x2: b.x + b.w, y2: y, stroke: color, 'stroke-width': Math.max(0.6, b.h * 0.07) }));
            } else if (a instanceof TextSquigglyAnnotation) {
                g.append(svgEl(doc, 'path', {
                    d: squigglyPath(b.x, b.y + b.h - 0.5, b.w, b.h), fill: 'none', stroke: color, 'stroke-width': Math.max(0.6, b.h * 0.06),
                }));
            }
        }
    } else if (a instanceof FreeTextAnnotation) {
        g.append(svgEl(doc, 'rect', {
            x: box.x, y: box.y, width: box.w, height: box.h,
            fill: paint(a.FillColor), 'fill-opacity': paintOpacity(a.FillColor), ...strokeAttrs(a),
        }));
        const fo = svgEl(doc, 'foreignObject', { x: box.x, y: box.y, width: Math.max(box.w, 1), height: Math.max(box.h, 1) });
        const div = doc.createElementNS(XHTML, 'div');
        div.className = 'pmw-freetext';
        const size = a.getFontSizeValue();
        div.style.cssText = `font-size:${size}px;line-height:1.15;color:${paint(a.TextColor)};text-align:${a.TextAlign || 'left'};`
            + `padding:${Math.max(1, a.StrokeThickness)}px 2px;`;
        div.textContent = a.getContents();
        fo.append(div);
        g.append(fo);
    } else if (a instanceof StickyAnnotation) {
        g.append(stickyIcon(doc, a, box));
    } else if (a instanceof StampAnnotation) {
        if (a.ImageData) {
            g.append(svgEl(doc, 'image', { x: box.x, y: box.y, width: box.w, height: box.h, href: a.ImageData, preserveAspectRatio: 'none' }));
        } else {
            g.append(svgEl(doc, 'rect', {
                x: box.x, y: box.y, width: box.w, height: box.h, rx: 4, fill: 'none', stroke: '#c0392b', 'stroke-width': 2,
            }));
            const text = svgEl(doc, 'text', {
                x: box.x + box.w / 2, y: box.y + box.h / 2, fill: '#c0392b', 'font-size': Math.max(6, box.h * 0.45),
                'font-family': 'Helvetica, Arial, sans-serif', 'font-weight': 'bold', 'text-anchor': 'middle', 'dominant-baseline': 'central',
            });
            text.textContent = String(a.Icon || 'Stamp').toUpperCase();
            g.append(text);
        }
    }
    return g;
};
