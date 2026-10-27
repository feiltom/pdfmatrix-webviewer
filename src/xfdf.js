import {
    ELEMENT_CLASSES, FreeTextAnnotation, GenericAnnotation, LineAnnotation, StampAnnotation, StickyAnnotation,
    TextMarkupAnnotation, FreeHandAnnotation, PolygonAnnotation,
} from './annotations.js';
import { Color, Point, Quad, quadBounds } from './geometry.js';

/**
 * XFDF import/export in the dialect WebViewer writes, which is also what PDFMatrix's
 * `mergeXFDFString` reads on the server: PDF user space coordinates, 0-based `page`,
 * `coords` quads in Acrobat order (UL, UR, LL, LR), `vertices`/`gesture` as `x,y;x,y`.
 *
 * `pageInfo(pageNumber)` returns `{ toPdf(x, y), fromPdf(x, y), pdfHeight }` for a loaded page, or
 * null; without it a 612×792 page with no rotation is assumed.
 */

const XFDF_NS = 'http://ns.adobe.com/xfdf/';

const fallbackInfo = {
    toPdf: (x, y) => [x, 792 - y],
    fromPdf: (x, y) => [x, 792 - y],
    pdfHeight: 792,
};

const num = (n) => {
    const v = Math.round(Number(n) * 1000) / 1000;
    return Object.is(v, -0) ? '0' : String(v);
};

const escapeXml = (s) => String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const numbers = (s) => String(s || '')
    .split(/[\s,;]+/)
    .filter((x) => x !== '')
    .map(Number)
    .filter(Number.isFinite);

const pairs = (list) => {
    const out = [];
    for (let i = 0; i + 1 < list.length; i += 2) {
        out.push([list[i], list[i + 1]]);
    }
    return out;
};

export const toPdfDate = (date) => {
    const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
    const p = (n) => String(n).padStart(2, '0');
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const abs = Math.abs(offset);
    return `D:${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
        + `${sign}${p(Math.floor(abs / 60))}'${p(abs % 60)}'`;
};

export const fromPdfDate = (s) => {
    const m = /^D:(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?([Zz+-])?(\d{2})?'?(\d{2})?'?/.exec(String(s || '').trim());
    if (!m) {
        return null;
    }
    const [, y, mo = '01', d = '01', h = '00', mi = '00', se = '00', tz, th = '00', tm = '00'] = m;
    const utc = Date.UTC(+y, +mo - 1, +d, +h, +mi, +se);
    if (!tz || tz === 'Z' || tz === 'z') {
        return tz ? new Date(utc) : new Date(+y, +mo - 1, +d, +h, +mi, +se);
    }
    const offset = (+th * 60 + +tm) * (tz === '-' ? -1 : 1);
    return new Date(utc - offset * 60000);
};

const FLAG_NAMES = {
    hidden: 'Hidden', print: 'Printable', readonly: 'ReadOnly', locked: 'Locked', lockedcontents: 'LockedContents',
    noview: 'NoView', nozoom: 'NoZoom', norotate: 'NoRotate',
};

const hasStroke = (a) => !(a instanceof TextMarkupAnnotation) && !(a instanceof StickyAnnotation) && !(a instanceof StampAnnotation);
const hasInterior = (a) => !(a instanceof TextMarkupAnnotation) && !(a instanceof StickyAnnotation) && !(a instanceof FreeHandAnnotation);

/** Attributes recomputed from the model; everything else from an imported element is preserved. */
const COMPUTED = new Set(['page', 'rect', 'color', 'interior-color', 'opacity', 'width', 'flags', 'name', 'title', 'subject',
    'date', 'creationdate', 'start', 'end', 'head', 'tail', 'icon', 'coords', 'fringe', 'textcolor', 'fontsize',
    'justification']);

const pdfRect = (box, info) => {
    const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]
        .map(([x, y]) => info.toPdf(x, y));
    const xs = corners.map((c) => c[0]);
    const ys = corners.map((c) => c[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};

const boxFromPdfRect = (r, info) => {
    const a = info.fromPdf(r[0], r[1]);
    const b = info.fromPdf(r[2], r[3]);
    return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), w: Math.abs(b[0] - a[0]), h: Math.abs(b[1] - a[1]) };
};

const pointList = (points, info) => points
    .map((p) => info.toPdf(p.x, p.y).map(num).join(','))
    .join(';');

/** Serializes one annotation to an XFDF element. */
export const serializeAnnotation = (a, pageInfo) => {
    if (a._xfdf && (!a._dirty || a instanceof GenericAnnotation)) {
        return a._xfdf;
    }
    if (a instanceof GenericAnnotation) {
        return '';
    }
    const info = pageInfo(a.PageNumber) || fallbackInfo;
    const attrs = new Map();
    const children = [];

    attrs.set('page', String(a.PageNumber - 1));
    attrs.set('rect', pdfRect(a._getBox(), info).map(num).join(','));
    if (!a.StrokeColor.isTransparent()) {
        attrs.set('color', a.StrokeColor.toHexString());
    }
    if (hasInterior(a) && !a.FillColor.isTransparent()) {
        attrs.set('interior-color', a.FillColor.toHexString());
    }
    if (a.Opacity !== undefined && Number(a.Opacity) !== 1) {
        attrs.set('opacity', num(a.Opacity));
    }
    if (hasStroke(a)) {
        attrs.set('width', num(a.StrokeThickness));
    }
    const flags = Object.entries(FLAG_NAMES)
        .filter(([, prop]) => (prop === 'Printable' ? a.Printable : a[prop]))
        .map(([flag]) => flag);
    attrs.set('flags', flags.join(','));
    attrs.set('name', a.Id);
    if (a.Author) {
        attrs.set('title', a.Author);
    }
    if (a.Subject) {
        attrs.set('subject', a.Subject);
    }
    attrs.set('date', toPdfDate(a.DateModified));
    attrs.set('creationdate', toPdfDate(a.DateCreated));

    if (a.getContents()) {
        children.push(`<contents>${escapeXml(a.getContents())}</contents>`);
    }

    if (a instanceof LineAnnotation) {
        const s = a.getStartPoint();
        const e = a.getEndPoint();
        attrs.set('start', info.toPdf(s.x, s.y).map(num).join(','));
        attrs.set('end', info.toPdf(e.x, e.y).map(num).join(','));
        attrs.set('head', a.StartStyle || 'None');
        attrs.set('tail', a.EndStyle || 'None');
    } else if (a instanceof PolygonAnnotation) {
        children.push(`<vertices>${pointList(a.getPath(), info)}</vertices>`);
    } else if (a instanceof FreeHandAnnotation) {
        const gestures = a.getPaths().map((path) => `<gesture>${pointList(path, info)}</gesture>`).join('');
        children.push(`<inklist>${gestures}</inklist>`);
    } else if (a instanceof TextMarkupAnnotation) {
        const coords = a.Quads.flatMap((q) => {
            const b = quadBounds(q);
            return [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]
                .flatMap(([x, y]) => info.toPdf(x, y));
        });
        attrs.set('coords', coords.map(num).join(','));
    } else if (a instanceof StickyAnnotation || a instanceof StampAnnotation) {
        attrs.set('icon', a.Icon || (a instanceof StickyAnnotation ? 'Comment' : 'Draft'));
        if (a instanceof StampAnnotation && a.ImageData) {
            children.push(`<imagedata>${escapeXml(a.ImageData)}</imagedata>`);
        }
    } else if (a instanceof FreeTextAnnotation) {
        const size = a.getFontSizeValue();
        const color = a.TextColor.toHexString();
        const align = { left: 0, center: 1, right: 2 }[a.TextAlign] ?? 0;
        attrs.set('TextColor', color);
        attrs.set('FontSize', num(size));
        attrs.set('justification', String(align));
        const rgb = [a.TextColor.R, a.TextColor.G, a.TextColor.B].map((v) => num(v / 255)).join(' ');
        children.push(`<defaultappearance>${rgb} rg /Helv ${num(size)} Tf</defaultappearance>`);
        children.push(`<defaultstyle>font: Helvetica ${num(size)}pt; text-align: ${a.TextAlign || 'left'}; color: ${color}</defaultstyle>`);
    }

    for (const [key, value] of Object.entries(a._xfdfAttrs || {})) {
        if (!COMPUTED.has(key.toLowerCase()) && !attrs.has(key)) {
            attrs.set(key, value);
        }
    }

    const attrText = [...attrs].map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join('');
    return children.length
        ? `<${a.elementName}${attrText}>${children.join('')}</${a.elementName}>`
        : `<${a.elementName}${attrText} />`;
};

export const exportXfdf = (annotations, pageInfo) => {
    const body = annotations.map((a) => serializeAnnotation(a, pageInfo)).filter(Boolean).join('');
    const first = pageInfo(1);
    const pages = first ? `<pages><defmtx matrix="1,0,0,-1,0,${num(first.pdfHeight)}" /></pages>` : '';
    return `<?xml version="1.0" encoding="UTF-8" ?><xfdf xmlns="${XFDF_NS}" xml:space="preserve"><fields />`
        + `${body ? `<annots>${body}</annots>` : '<annots />'}${pages}</xfdf>`;
};

const childElements = (el) => Array.from(el.children || []);

const findChild = (el, name) => childElements(el).find((c) => c.localName.toLowerCase() === name);

const parseFreeTextStyle = (a, el) => {
    let size = parseFloat(el.getAttribute('FontSize') || el.getAttribute('fontsize'));
    let color = el.getAttribute('TextColor') || el.getAttribute('textcolor');
    let align = null;
    const style = findChild(el, 'defaultstyle')?.textContent || '';
    for (const part of style.split(';')) {
        const [k, ...rest] = part.split(':');
        const v = rest.join(':').trim();
        switch ((k || '').trim().toLowerCase()) {
            case 'font': {
                const m = /([\d.]+)\s*pt/i.exec(v);
                if (m && !Number.isFinite(size)) { size = parseFloat(m[1]); }
                break;
            }
            case 'font-size':
                if (!Number.isFinite(size)) { size = parseFloat(v); }
                break;
            case 'color':
                if (!color) { color = v; }
                break;
            case 'text-align':
                align = v;
                break;
            default:
        }
    }
    const da = findChild(el, 'defaultappearance')?.textContent || '';
    const tf = /([\d.]+)\s+Tf/.exec(da);
    if (tf && !Number.isFinite(size)) {
        size = parseFloat(tf[1]);
    }
    const rg = /([\d.]+)\s+([\d.]+)\s+([\d.]+)\s+rg/.exec(da);
    if (rg && !color) {
        a.TextColor = new Color(rg[1] * 255, rg[2] * 255, rg[3] * 255, 1);
    } else if (color) {
        a.TextColor = Color.parse(color);
    }
    if (Number.isFinite(size) && size > 0) {
        a.FontSize = `${size}pt`;
    }
    const just = el.getAttribute('justification');
    a.TextAlign = align || (just === '1' ? 'center' : just === '2' ? 'right' : 'left');
};

const parseElement = (el, pageInfo) => {
    const tag = el.localName.toLowerCase();
    const Ctor = ELEMENT_CLASSES[tag];
    const a = Ctor ? new Ctor() : new GenericAnnotation(tag);
    const attr = (name) => el.getAttribute(name);

    a.PageNumber = (parseInt(attr('page'), 10) || 0) + 1;
    const info = pageInfo(a.PageNumber) || fallbackInfo;

    let rect = numbers(attr('rect'));
    if (rect.length === 4) {
        const fringe = numbers(attr('fringe'));
        if (fringe.length === 4 && ['square', 'circle', 'freetext'].includes(tag)) {
            rect = [rect[0] + fringe[0], rect[1] + fringe[3], rect[2] - fringe[2], rect[3] - fringe[1]];
        }
        a._setBox(boxFromPdfRect(rect, info));
    }
    if (attr('color')) {
        a.StrokeColor = Color.parse(attr('color'));
    } else if (Ctor) {
        a.StrokeColor = new Color(0, 0, 0, tag === 'freetext' ? 0 : 1);
    }
    if (attr('interior-color')) {
        a.FillColor = Color.parse(attr('interior-color'));
    }
    if (attr('opacity')) {
        a.Opacity = parseFloat(attr('opacity'));
    }
    if (attr('width')) {
        a.StrokeThickness = parseFloat(attr('width'));
    }
    const flags = (attr('flags') || '').split(/[\s,]+/).map((f) => f.toLowerCase());
    for (const [flag, prop] of Object.entries(FLAG_NAMES)) {
        a[prop] = flags.includes(flag);
    }
    if (attr('name')) {
        a.Id = attr('name');
    }
    a.Author = attr('title') || '';
    a.Subject = attr('subject') || a.Subject;
    a.DateModified = fromPdfDate(attr('date')) || new Date();
    a.DateCreated = fromPdfDate(attr('creationdate')) || a.DateModified;
    const contents = findChild(el, 'contents') || findChild(el, 'contents-richtext');
    if (contents) {
        a._contents = contents.textContent || '';
    }

    switch (tag) {
        case 'line': {
            const s = numbers(attr('start'));
            const e = numbers(attr('end'));
            if (s.length >= 2 && e.length >= 2) {
                const ps = info.fromPdf(s[0], s[1]);
                const pe = info.fromPdf(e[0], e[1]);
                a.setStartPoint(ps[0], ps[1]);
                a.setEndPoint(pe[0], pe[1]);
            }
            a.StartStyle = attr('head') || 'None';
            a.EndStyle = attr('tail') || 'None';
            break;
        }
        case 'polygon':
        case 'polyline': {
            const v = findChild(el, 'vertices');
            a.setPath(pairs(numbers(v?.textContent)).map(([x, y]) => {
                const p = info.fromPdf(x, y);
                return new Point(p[0], p[1]);
            }));
            break;
        }
        case 'ink': {
            const list = findChild(el, 'inklist');
            const paths = list ? childElements(list).filter((g) => g.localName.toLowerCase() === 'gesture') : [];
            a.setPaths(paths.map((g) => pairs(numbers(g.textContent)).map(([x, y]) => {
                const p = info.fromPdf(x, y);
                return new Point(p[0], p[1]);
            })));
            break;
        }
        case 'highlight':
        case 'underline':
        case 'strikeout':
        case 'squiggly': {
            const c = numbers(attr('coords'));
            const quads = [];
            for (let i = 0; i + 7 < c.length; i += 8) {
                const pts = pairs(c.slice(i, i + 8)).map(([x, y]) => info.fromPdf(x, y));
                const xs = pts.map((p) => p[0]);
                const ys = pts.map((p) => p[1]);
                const x0 = Math.min(...xs);
                const x1 = Math.max(...xs);
                const y0 = Math.min(...ys);
                const y1 = Math.max(...ys);
                quads.push(new Quad(x0, y1, x1, y1, x1, y0, x0, y0));
            }
            if (quads.length) {
                a.Quads = quads;
            }
            break;
        }
        case 'freetext':
            parseFreeTextStyle(a, el);
            break;
        case 'text':
        case 'stamp':
            a.Icon = attr('icon') || a.Icon;
            if (tag === 'stamp') {
                const image = findChild(el, 'imagedata');
                if (image?.textContent) {
                    a.ImageData = image.textContent.trim();
                }
            }
            break;
        default:
    }

    a._xfdfAttrs = Object.fromEntries(Array.from(el.attributes).map((at) => [at.name, at.value]));
    a._xfdf = new XMLSerializer().serializeToString(el).replace(` xmlns="${XFDF_NS}"`, '');
    a._dirty = false;
    return a;
};

/**
 * Parses an XFDF document. Returns the annotations found under `<annots>` (popups are skipped)
 * and the names listed under `<delete>`.
 */
export const parseXfdf = (xml, pageInfo) => {
    const doc = new DOMParser().parseFromString(String(xml || ''), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
        throw new Error('Invalid XFDF');
    }
    const annotations = [];
    const deleted = [];
    for (const el of Array.from(doc.getElementsByTagName('*'))) {
        const name = el.localName.toLowerCase();
        if (name === 'annots') {
            for (const child of childElements(el)) {
                if (child.localName.toLowerCase() !== 'popup') {
                    annotations.push(parseElement(child, pageInfo));
                }
            }
        } else if (name === 'delete') {
            for (const id of childElements(el)) {
                if (id.textContent) {
                    deleted.push(id.textContent.trim());
                }
            }
        }
    }
    return { annotations, deleted };
};
