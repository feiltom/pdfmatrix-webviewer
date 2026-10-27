import { Color, Point, Quad, Rect, pointsBounds, quadBounds } from './geometry.js';

export const uuid = () => {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
};

/** Properties whose change makes a previously imported annotation be re-serialized. */
const TRACKED = ['StrokeColor', 'FillColor', 'TextColor', 'StrokeThickness', 'Opacity', 'FontSize', 'TextAlign', 'Icon',
    'StartStyle', 'EndStyle', 'Author', 'Subject', 'Hidden', 'Printable', 'Locked', 'ReadOnly', 'LockedContents', 'NoView'];

/**
 * Base class of every annotation. Geometry is kept by each subclass; `X`, `Y`, `Width` and
 * `Height` always describe the bounding box and setting them moves or scales the geometry, like
 * in WebViewer (setting `Width` on a polygon stretches its path).
 */
export class Annotation {
    static elementName = 'annotation';

    constructor() {
        this.Id = uuid();
        this.PageNumber = 1;
        this.DateCreated = new Date();
        this.DateModified = new Date();
        this.Listable = true;
        this.IsHoverable = true;
        this.NoZoom = false;
        this.NoRotate = false;
        this.Dashes = '';
        this._values = {
            StrokeColor: new Color(0, 0, 0, 1),
            FillColor: new Color(0, 0, 0, 0),
            TextColor: new Color(0, 0, 0, 1),
            StrokeThickness: 1,
            Opacity: 1,
            Author: '',
            Subject: '',
            Hidden: false,
            Printable: true,
            Locked: false,
            ReadOnly: false,
            LockedContents: false,
            NoView: false,
        };
        this._contents = '';
        this._customData = {};
        /** Source XFDF of an imported annotation, re-emitted verbatim while it is unchanged. */
        this._xfdf = null;
        this._dirty = true;
    }

    get elementName() {
        return this.constructor.elementName;
    }

    // Box -------------------------------------------------------------------------------------

    /** Bounding box in page coordinates. Subclasses override. */
    _getBox() {
        return { x: 0, y: 0, w: 0, h: 0 };
    }

    /** Moves/scales the geometry so its bounding box becomes `box`. Subclasses override. */
    _setBox() { }

    _changeBox(patch) {
        const box = { ...this._getBox(), ...patch };
        this._setBox(box);
        this._touch();
    }

    get X() { return this._getBox().x; }

    set X(v) { this._changeBox({ x: Number(v) }); }

    get Y() { return this._getBox().y; }

    set Y(v) { this._changeBox({ y: Number(v) }); }

    get Width() { return this._getBox().w; }

    set Width(v) { this._changeBox({ w: Math.max(0, Number(v)) }); }

    get Height() { return this._getBox().h; }

    set Height(v) { this._changeBox({ h: Math.max(0, Number(v)) }); }

    getX() { return this.X; }

    getY() { return this.Y; }

    getWidth() { return this.Width; }

    getHeight() { return this.Height; }

    setX(v) { this.X = v; }

    setY(v) { this.Y = v; }

    setWidth(v) { this.Width = v; }

    setHeight(v) { this.Height = v; }

    getRect() {
        const b = this._getBox();
        return new Rect(b.x, b.y, b.x + b.w, b.y + b.h);
    }

    setRect(rect) {
        const r = new Rect(rect.x1, rect.y1, rect.x2, rect.y2).normalize();
        this._changeBox({ x: r.x1, y: r.y1, w: r.getWidth(), h: r.getHeight() });
    }

    resize(rect) {
        this.setRect(rect);
    }

    /** Applies `fn(point) => point` to every geometric point. */
    _mapPoints() { }

    _scaleBox(from, to) {
        const sx = from.w ? to.w / from.w : 1;
        const sy = from.h ? to.h / from.h : 1;
        return (p) => new Point(to.x + (p.x - from.x) * sx, to.y + (p.y - from.y) * sy);
    }

    // Style -----------------------------------------------------------------------------------

    _touch() {
        this._dirty = true;
        this.DateModified = new Date();
    }

    get Color() { return this.StrokeColor; }

    set Color(v) { this.StrokeColor = v; }

    getContents() { return this._contents; }

    setContents(text) {
        this._contents = text === null || text === undefined ? '' : String(text);
        this._touch();
    }

    getCustomData(key) {
        return this._customData[key] ?? '';
    }

    setCustomData(key, value) {
        this._customData[key] = value;
    }

    deleteCustomData(key) {
        delete this._customData[key];
    }

    isReply() { return false; }

    getReplies() { return []; }

    /** Annotations that cannot be selected, moved or edited by the user. */
    isInteractive() {
        return !this.ReadOnly && !this.Locked && !this.Hidden && !this.NoView;
    }

    _copyBaseFrom(other) {
        Object.assign(this._values, other._values);
        this.Id = other.Id;
        this.PageNumber = other.PageNumber;
        this._contents = other._contents;
        this.DateCreated = other.DateCreated;
        this.DateModified = other.DateModified;
        this._customData = { ...other._customData };
    }
}

for (const name of TRACKED) {
    Object.defineProperty(Annotation.prototype, name, {
        configurable: true,
        enumerable: true,
        get() { return this._values[name]; },
        set(value) {
            this._values[name] = /Color$/.test(name) ? Color.from(value) : value;
            this._touch();
        },
    });
}

export class MarkupAnnotation extends Annotation { }

/** Annotations whose geometry is a plain box. */
class BoxAnnotation extends MarkupAnnotation {
    constructor() {
        super();
        this._box = { x: 0, y: 0, w: 0, h: 0 };
    }

    _getBox() {
        return { ...this._box };
    }

    _setBox(box) {
        this._box = { x: box.x, y: box.y, w: box.w, h: box.h };
    }

    _mapPoints(fn) {
        const a = fn(new Point(this._box.x, this._box.y));
        const b = fn(new Point(this._box.x + this._box.w, this._box.y + this._box.h));
        this._box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }
}

export class RectangleAnnotation extends BoxAnnotation {
    static elementName = 'square';

    constructor(init) {
        super();
        this.Subject = 'Rectangle';
        Object.assign(this, init);
    }
}

export class EllipseAnnotation extends BoxAnnotation {
    static elementName = 'circle';

    constructor(init) {
        super();
        this.Subject = 'Ellipse';
        Object.assign(this, init);
    }
}

export class FreeTextAnnotation extends BoxAnnotation {
    static elementName = 'freetext';

    constructor(init) {
        super();
        this.Subject = 'Free Text';
        this.FontSize = '12pt';
        this.TextAlign = 'left';
        this.TextColor = new Color(0, 0, 0, 1);
        this.StrokeThickness = 0;
        this.Font = 'Helvetica';
        Object.assign(this, init);
    }

    /** Font size in points, whatever unit the caller used ("9px", "12pt", 12). */
    getFontSizeValue() {
        const n = parseFloat(this.FontSize);
        return Number.isFinite(n) && n > 0 ? n : 12;
    }
}

export class StickyAnnotation extends BoxAnnotation {
    static elementName = 'text';

    constructor(init) {
        super();
        this.Subject = 'Note';
        this.Icon = 'Comment';
        this.NoZoom = true;
        this.NoRotate = true;
        this._box = { x: 0, y: 0, w: 20, h: 20 };
        this.StrokeColor = new Color(255, 205, 69, 1);
        Object.assign(this, init);
    }
}

export class StampAnnotation extends BoxAnnotation {
    static elementName = 'stamp';

    constructor(init) {
        super();
        this.Subject = 'Stamp';
        this.Icon = 'Draft';
        this.ImageData = null;
        Object.assign(this, init);
    }

    setImageData(dataUrl) {
        this.ImageData = dataUrl;
        this._touch();
    }

    getImageData() {
        return Promise.resolve(this.ImageData);
    }
}

/** Unknown XFDF elements: kept verbatim so a round trip does not lose them. */
export class GenericAnnotation extends BoxAnnotation {
    constructor(name = 'annotation') {
        super();
        this._name = name;
    }

    get elementName() {
        return this._name;
    }

    isInteractive() {
        return false;
    }
}

class PathAnnotation extends MarkupAnnotation {
    constructor() {
        super();
        this._paths = [[]];
    }

    _allPoints() {
        return this._paths.flat();
    }

    _getBox() {
        return pointsBounds(this._allPoints());
    }

    _setBox(box) {
        this._mapPoints(this._scaleBox(this._getBox(), box));
    }

    _mapPoints(fn) {
        this._paths = this._paths.map((path) => path.map((p) => fn(p)));
    }
}

export class PolygonAnnotation extends PathAnnotation {
    static elementName = 'polygon';

    constructor(init) {
        super();
        this.Subject = 'Polygon';
        Object.assign(this, init);
    }

    addPathPoint(x, y) {
        this._paths[0].push(new Point(Number(x), Number(y)));
        this._touch();
    }

    getPath() {
        return this._paths[0].map((p) => new Point(p.x, p.y));
    }

    setPath(points) {
        this._paths[0] = (points || []).map((p) => new Point(Number(p.x), Number(p.y)));
        this._touch();
    }

    setPathPoint(index, x, y) {
        this._paths[0][index] = new Point(Number(x), Number(y));
        this._touch();
    }

    popPath() {
        this._paths[0].pop();
        this._touch();
    }
}

export class PolylineAnnotation extends PolygonAnnotation {
    static elementName = 'polyline';

    constructor(init) {
        super();
        this.Subject = 'Polyline';
        Object.assign(this, init);
    }
}

export class FreeHandAnnotation extends PathAnnotation {
    static elementName = 'ink';

    constructor(init) {
        super();
        this.Subject = 'Free Hand';
        this._paths = [];
        Object.assign(this, init);
    }

    getPaths() {
        return this._paths.map((path) => path.map((p) => new Point(p.x, p.y)));
    }

    setPath(points, index = 0) {
        this._paths[index] = (points || []).map((p) => new Point(Number(p.x), Number(p.y)));
        this._touch();
    }

    setPaths(paths) {
        this._paths = (paths || []).map((path) => path.map((p) => new Point(Number(p.x), Number(p.y))));
        this._touch();
    }

    getPathCount() {
        return this._paths.length;
    }
}

export class LineAnnotation extends PathAnnotation {
    static elementName = 'line';

    constructor(init) {
        super();
        this.Subject = 'Line';
        this.StartStyle = 'None';
        this.EndStyle = 'None';
        this._paths = [[new Point(0, 0), new Point(0, 0)]];
        Object.assign(this, init);
    }

    getStartPoint() {
        return new Point(this._paths[0][0].x, this._paths[0][0].y);
    }

    getEndPoint() {
        return new Point(this._paths[0][1].x, this._paths[0][1].y);
    }

    setStartPoint(x, y) {
        this._paths[0][0] = new Point(Number(x), Number(y));
        this._touch();
    }

    setEndPoint(x, y) {
        this._paths[0][1] = new Point(Number(x), Number(y));
        this._touch();
    }

    setLineStartStyle(style) { this.StartStyle = style; }

    setLineEndStyle(style) { this.EndStyle = style; }
}

export class ArrowAnnotation extends LineAnnotation {
    constructor(init) {
        super();
        this.Subject = 'Arrow';
        this.EndStyle = 'OpenArrow';
        Object.assign(this, init);
    }
}

/**
 * Text markup annotations. `Quads` can be set before or after the box: setting the box when quads
 * exist moves/scales the quads, setting quads updates the box.
 */
export class TextMarkupAnnotation extends MarkupAnnotation {
    constructor() {
        super();
        this._quads = [];
        this._box = { x: 0, y: 0, w: 0, h: 0 };
        this.Opacity = 1;
    }

    get Quads() {
        return this._quads;
    }

    set Quads(quads) {
        this._quads = (quads || []).map((q) => new Quad(q.x1, q.y1, q.x2, q.y2, q.x3, q.y3, q.x4, q.y4));
        if (this._quads.length) {
            const pts = this._quads.flatMap((q) => {
                const b = quadBounds(q);
                return [new Point(b.x, b.y), new Point(b.x + b.w, b.y + b.h)];
            });
            this._box = pointsBounds(pts);
        }
        this._touch();
    }

    getQuads() {
        return this.Quads;
    }

    setQuads(quads) {
        this.Quads = quads;
    }

    _getBox() {
        return { ...this._box };
    }

    _setBox(box) {
        if (this._quads.length) {
            this._mapPoints(this._scaleBox(this._box, box));
        }
        this._box = { x: box.x, y: box.y, w: box.w, h: box.h };
    }

    _mapPoints(fn) {
        this._quads = this._quads.map((q) => {
            const p = [1, 2, 3, 4].map((i) => fn(new Point(q[`x${i}`], q[`y${i}`])));
            return new Quad(p[0].x, p[0].y, p[1].x, p[1].y, p[2].x, p[2].y, p[3].x, p[3].y);
        });
        const a = fn(new Point(this._box.x, this._box.y));
        const b = fn(new Point(this._box.x + this._box.w, this._box.y + this._box.h));
        this._box = { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
    }
}

export class TextHighlightAnnotation extends TextMarkupAnnotation {
    static elementName = 'highlight';

    constructor(init) {
        super();
        this.Subject = 'Highlight';
        this.StrokeColor = new Color(255, 255, 0, 1);
        Object.assign(this, init);
    }
}

export class TextUnderlineAnnotation extends TextMarkupAnnotation {
    static elementName = 'underline';

    constructor(init) {
        super();
        this.Subject = 'Underline';
        this.StrokeColor = new Color(0, 0, 255, 1);
        Object.assign(this, init);
    }
}

export class TextStrikeoutAnnotation extends TextMarkupAnnotation {
    static elementName = 'strikeout';

    constructor(init) {
        super();
        this.Subject = 'Strikeout';
        this.StrokeColor = new Color(228, 66, 52, 1);
        Object.assign(this, init);
    }
}

export class TextSquigglyAnnotation extends TextMarkupAnnotation {
    static elementName = 'squiggly';

    constructor(init) {
        super();
        this.Subject = 'Squiggly';
        this.StrokeColor = new Color(228, 66, 52, 1);
        Object.assign(this, init);
    }
}

/** `Core.Annotations`, as far as the supported subset goes. */
export const Annotations = {
    Annotation,
    MarkupAnnotation,
    RectangleAnnotation,
    EllipseAnnotation,
    LineAnnotation,
    ArrowAnnotation,
    PolygonAnnotation,
    PolylineAnnotation,
    FreeHandAnnotation,
    FreeTextAnnotation,
    StickyAnnotation,
    StampAnnotation,
    TextMarkupAnnotation,
    TextHighlightAnnotation,
    TextUnderlineAnnotation,
    TextStrikeoutAnnotation,
    TextSquigglyAnnotation,
    Color,
};

/** XFDF element name → constructor. */
export const ELEMENT_CLASSES = {
    square: RectangleAnnotation,
    circle: EllipseAnnotation,
    line: LineAnnotation,
    polygon: PolygonAnnotation,
    polyline: PolylineAnnotation,
    ink: FreeHandAnnotation,
    freetext: FreeTextAnnotation,
    text: StickyAnnotation,
    stamp: StampAnnotation,
    highlight: TextHighlightAnnotation,
    underline: TextUnderlineAnnotation,
    strikeout: TextStrikeoutAnnotation,
    squiggly: TextSquigglyAnnotation,
};
