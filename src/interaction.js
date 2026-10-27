import {
    ArrowAnnotation, EllipseAnnotation, FreeHandAnnotation, FreeTextAnnotation, LineAnnotation, PolygonAnnotation,
    PolylineAnnotation, RectangleAnnotation, StickyAnnotation, TextHighlightAnnotation, TextMarkupAnnotation,
    TextSquigglyAnnotation, TextStrikeoutAnnotation, TextUnderlineAnnotation,
} from './annotations.js';
import { Color, Point } from './geometry.js';
import { renderAnnotation } from './render-annotation.js';
import { PageText } from './text-geometry.js';

export const ToolNames = {
    EDIT: 'AnnotationEdit',
    PAN: 'Pan',
    TEXT_SELECT: 'TextSelect',
    RECTANGLE: 'AnnotationCreateRectangle',
    ELLIPSE: 'AnnotationCreateEllipse',
    LINE: 'AnnotationCreateLine',
    ARROW: 'AnnotationCreateArrow',
    POLYGON: 'AnnotationCreatePolygon',
    POLYLINE: 'AnnotationCreatePolyline',
    FREEHAND: 'AnnotationCreateFreeHand',
    FREETEXT: 'AnnotationCreateFreeText',
    STICKY: 'AnnotationCreateSticky',
    HIGHLIGHT: 'AnnotationCreateTextHighlight',
    UNDERLINE: 'AnnotationCreateTextUnderline',
    STRIKEOUT: 'AnnotationCreateTextStrikeout',
    SQUIGGLY: 'AnnotationCreateTextSquiggly',
};

const RED = () => new Color(228, 66, 52, 1);

/** Creation tools: how a drag becomes an annotation, and the default style. */
export const TOOLS = {
    [ToolNames.RECTANGLE]: { kind: 'box', Ctor: RectangleAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.ELLIPSE]: { kind: 'box', Ctor: EllipseAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.LINE]: { kind: 'line', Ctor: LineAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.ARROW]: { kind: 'line', Ctor: ArrowAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.POLYGON]: { kind: 'poly', Ctor: PolygonAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.POLYLINE]: { kind: 'poly', Ctor: PolylineAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.FREEHAND]: { kind: 'ink', Ctor: FreeHandAnnotation, style: { StrokeColor: RED, StrokeThickness: 1 } },
    [ToolNames.FREETEXT]: { kind: 'freetext', Ctor: FreeTextAnnotation, style: { TextColor: RED, FontSize: () => '12pt' } },
    [ToolNames.STICKY]: { kind: 'sticky', Ctor: StickyAnnotation, style: { StrokeColor: () => new Color(255, 205, 69, 1) } },
    [ToolNames.HIGHLIGHT]: { kind: 'markup', Ctor: TextHighlightAnnotation, style: { StrokeColor: () => new Color(255, 255, 0, 1) } },
    [ToolNames.UNDERLINE]: { kind: 'markup', Ctor: TextUnderlineAnnotation, style: { StrokeColor: () => new Color(0, 0, 255, 1) } },
    [ToolNames.STRIKEOUT]: { kind: 'markup', Ctor: TextStrikeoutAnnotation, style: { StrokeColor: RED } },
    [ToolNames.SQUIGGLY]: { kind: 'markup', Ctor: TextSquigglyAnnotation, style: { StrokeColor: RED } },
};

export const SWATCHES = ['#E44234', '#FF8D00', '#FFFF00', '#00CC63', '#2C6AFF', '#000000'];

/** The style property a color swatch changes on a given annotation. */
const colorProperty = (a) => (a instanceof FreeTextAnnotation ? 'TextColor' : 'StrokeColor');

/**
 * Pointer interaction on the pages: selecting, moving and resizing annotations, the creation
 * tools, the in-place editors for free text and notes, and the OCR marquee (`is-ocr` class on
 * the viewer element, styled by the host application through `.ui-selectable-helper`).
 */
export class Interaction {
    constructor(viewer, manager, { t, hotkeysEnabled }) {
        this.viewer = viewer;
        this.manager = manager;
        this.t = t;
        this.hotkeysEnabled = hotkeysEnabled;
        this.doc = viewer._ownerDocument;
        this.viewerEl = viewer.getViewerElement();
        this.scrollEl = viewer.getScrollViewElement();
        this.toolMode = ToolNames.EDIT;
        this.toolStyles = {};
        this.drag = null;
        this.poly = null;
        this.editor = null;

        this.selectionEl = this._div('pmw-selection-layer');
        this.viewerEl.append(this.selectionEl);

        this._onPointerDown = (e) => this.pointerDown(e);
        this._onPointerMove = (e) => this.pointerMove(e);
        this._onPointerUp = (e) => this.pointerUp(e);
        this._onDblClick = (e) => this.doubleClick(e);
        this._onKeyDown = (e) => this.keyDown(e);
        this.viewerEl.addEventListener('pointerdown', this._onPointerDown);
        this.viewerEl.addEventListener('pointermove', this._onPointerMove);
        this.viewerEl.addEventListener('pointerup', this._onPointerUp);
        this.viewerEl.addEventListener('pointercancel', this._onPointerUp);
        this.viewerEl.addEventListener('dblclick', this._onDblClick);
        this.scrollEl.addEventListener('keydown', this._onKeyDown);
        manager.addEventListener('_layout', () => this.drawSelection());
        viewer.addEventListener('documentUnloaded', () => {
            this.cancelEditor();
            this.poly = null;
            this.drag = null;
            this.selectionEl.replaceChildren();
        });
        viewer.addEventListener('layoutChanged', () => {
            // The pages container is rebuilt on load: keep the selection layer in it.
            if (!this.selectionEl.isConnected || this.selectionEl.parentNode !== this.viewerEl) {
                this.viewerEl.append(this.selectionEl);
            }
            this.drawSelection();
        });
    }

    _div(className) {
        const el = this.doc.createElement('div');
        el.className = className;
        return el;
    }

    destroy() {
        this.viewerEl.removeEventListener('pointerdown', this._onPointerDown);
        this.viewerEl.removeEventListener('pointermove', this._onPointerMove);
        this.viewerEl.removeEventListener('pointerup', this._onPointerUp);
        this.viewerEl.removeEventListener('pointercancel', this._onPointerUp);
        this.viewerEl.removeEventListener('dblclick', this._onDblClick);
        this.scrollEl.removeEventListener('keydown', this._onKeyDown);
    }

    // Tools ---------------------------------------------------------------------------------------------

    setToolMode(name) {
        const mode = name && (TOOLS[name] || name === ToolNames.PAN || name === ToolNames.TEXT_SELECT) ? name : ToolNames.EDIT;
        if (mode === this.toolMode) {
            return;
        }
        this.finishPoly(false);
        this.commitEditor();
        this.toolMode = mode;
        const tool = TOOLS[mode];
        this.viewerEl.classList.toggle('pmw-creating', !!tool);
        this.viewerEl.classList.toggle('pmw-panning', mode === ToolNames.PAN);
        this.viewerEl.dataset.tool = mode;
        if (tool) {
            this.manager.deselectAllAnnotations();
        }
        this.viewer.trigger('toolModeUpdated', mode);
    }

    getToolStyle(name) {
        const tool = TOOLS[name];
        const style = {};
        for (const [k, v] of Object.entries(tool?.style || {})) {
            style[k] = typeof v === 'function' ? v() : v;
        }
        return { ...style, ...(this.toolStyles[name] || {}) };
    }

    setToolColor(name, color) {
        const tool = TOOLS[name];
        if (!tool) {
            return;
        }
        const prop = tool.kind === 'freetext' ? 'TextColor' : 'StrokeColor';
        this.toolStyles[name] = { ...(this.toolStyles[name] || {}), [prop]: Color.from(color) };
    }

    _newAnnotation(name, pageNumber) {
        const a = new TOOLS[name].Ctor();
        Object.assign(a, this.getToolStyle(name));
        a.PageNumber = pageNumber;
        a.Author = this.manager.getCurrentUser();
        return a;
    }

    // Pointer --------------------------------------------------------------------------------------------

    _pageOf(e) {
        const el = e.target.closest?.('.pmw-page');
        if (el) {
            return Number(el.dataset.pageNumber);
        }
        const rect = this.viewerEl.getBoundingClientRect();
        return this.viewer.pageAtWindowPoint({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }

    _windowPoint(e) {
        const rect = this.viewerEl.getBoundingClientRect();
        return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }

    _capture(e) {
        try {
            this.viewerEl.setPointerCapture(e.pointerId);
        } catch {
            // Synthetic events have no active pointer.
        }
    }

    pointerDown(e) {
        if (e.button !== 0 || !this.viewer.getPageCount()) {
            return;
        }
        if (this.editor) {
            if (this.editor.el.contains(e.target)) {
                return;
            }
            this.commitEditor();
        }
        if (e.target.closest?.('.pmw-annot-popup')) {
            return;
        }
        if (this.viewerEl.classList.contains('is-ocr')) {
            this.startMarquee(e);
            return;
        }
        const pageNumber = this._pageOf(e);
        if (!pageNumber) {
            return;
        }
        const point = this.viewer.clientToPage(e.clientX, e.clientY, pageNumber);
        const tool = TOOLS[this.toolMode];

        if (this.toolMode === ToolNames.PAN) {
            this.drag = { type: 'pan', x: e.clientX, y: e.clientY, left: this.scrollEl.scrollLeft, top: this.scrollEl.scrollTop };
            this._capture(e);
            return;
        }
        if (tool) {
            this.startCreate(e, tool, pageNumber, point);
            return;
        }

        const handle = e.target.closest?.('[data-handle]');
        const selected = this.manager.getSelectedAnnotations()[0];
        if (handle && selected) {
            this.drag = { type: 'resize', annotation: selected, corner: handle.dataset.handle, moved: false };
            this._capture(e);
            return;
        }
        const hit = e.target.closest?.('[data-annotation-id]');
        const annotation = hit && this.manager.getAnnotationById(hit.dataset.annotationId);
        if (annotation && annotation.isInteractive() && !this.manager.isReadOnlyModeEnabled()) {
            if (!this.manager.isAnnotationSelected(annotation)) {
                this.manager.deselectAllAnnotations();
                this.manager.selectAnnotation(annotation);
            }
            this.drag = { type: 'move', annotation, last: point, pageNumber, moved: false };
            this._capture(e);
            this.scrollEl.focus({ preventScroll: true });
            return;
        }
        if (this.manager.getSelectedAnnotations().length) {
            this.manager.deselectAllAnnotations();
        }
    }

    pointerMove(e) {
        const drag = this.drag;
        if (!drag) {
            if (this.poly) {
                this.drawPolyPreview(this.viewer.clientToPage(e.clientX, e.clientY, this.poly.pageNumber));
            }
            return;
        }
        if (drag.type === 'pan') {
            this.scrollEl.scrollLeft = drag.left - (e.clientX - drag.x);
            this.scrollEl.scrollTop = drag.top - (e.clientY - drag.y);
            return;
        }
        if (drag.type === 'marquee') {
            this.updateMarquee(e);
            return;
        }
        const a = drag.annotation;
        const pageNumber = drag.pageNumber || a?.PageNumber;
        const point = this.viewer.clientToPage(e.clientX, e.clientY, pageNumber);
        if (drag.type === 'move') {
            const dx = point.x - drag.last.x;
            const dy = point.y - drag.last.y;
            if (!dx && !dy) {
                return;
            }
            const box = a._getBox();
            a._setBox({ ...box, x: box.x + dx, y: box.y + dy });
            a._touch();
            drag.last = point;
            drag.moved = true;
            this.manager.drawAnnotations(a.PageNumber);
        } else if (drag.type === 'resize') {
            const box = a._getBox();
            const fixed = {
                x: drag.corner.includes('w') ? box.x + box.w : box.x,
                y: drag.corner.includes('n') ? box.y + box.h : box.y,
            };
            drag.fixed = drag.fixed || fixed;
            const x = Math.min(drag.fixed.x, point.x);
            const y = Math.min(drag.fixed.y, point.y);
            a._setBox({ x, y, w: Math.max(2, Math.abs(point.x - drag.fixed.x)), h: Math.max(2, Math.abs(point.y - drag.fixed.y)) });
            a._touch();
            drag.moved = true;
            this.manager.drawAnnotations(a.PageNumber);
        } else if (drag.type === 'create') {
            this.updateCreate(drag, point);
        }
    }

    pointerUp(e) {
        const drag = this.drag;
        this.drag = null;
        if (!drag) {
            return;
        }
        if (drag.type === 'marquee') {
            drag.helper.remove();
            return;
        }
        if ((drag.type === 'move' || drag.type === 'resize') && drag.moved) {
            this.manager.notifyModified([drag.annotation]);
            return;
        }
        if (drag.type === 'create') {
            const point = this.viewer.clientToPage(e.clientX, e.clientY, drag.pageNumber);
            this.finishCreate(drag, point);
        }
    }

    doubleClick(e) {
        if (this.poly) {
            this.finishPoly(true);
            return;
        }
        if (TOOLS[this.toolMode]) {
            return;
        }
        const hit = e.target.closest?.('[data-annotation-id]');
        const annotation = hit && this.manager.getAnnotationById(hit.dataset.annotationId);
        if (annotation && annotation.isInteractive() && !annotation.LockedContents
            && (annotation instanceof FreeTextAnnotation || annotation instanceof StickyAnnotation)) {
            this.openEditor(annotation);
        }
    }

    keyDown(e) {
        if (e.key === 'Escape') {
            if (this.editor) {
                this.cancelEditor();
            } else if (this.poly) {
                this.finishPoly(false);
            } else {
                this.manager.deselectAllAnnotations();
            }
            return;
        }
        if (e.key === 'Enter' && this.poly) {
            this.finishPoly(true);
            return;
        }
        if (!this.hotkeysEnabled() || this.editor) {
            return;
        }
        if (e.key === 'Delete' || e.key === 'Backspace') {
            const selected = this.manager.getSelectedAnnotations().filter((a) => a.isInteractive());
            if (selected.length) {
                e.preventDefault();
                this.manager.deleteAnnotations(selected);
            }
        } else if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
            e.preventDefault();
            this.viewer.zoomIn();
        } else if ((e.ctrlKey || e.metaKey) && e.key === '-') {
            e.preventDefault();
            this.viewer.zoomOut();
        }
    }

    // OCR marquee ---------------------------------------------------------------------------------------------

    startMarquee(e) {
        const helper = this._div('ui-selectable-helper pmw-marquee');
        const start = this._windowPoint(e);
        this.viewerEl.append(helper);
        this.drag = { type: 'marquee', helper, start };
        this._capture(e);
        this.updateMarquee(e);
    }

    updateMarquee(e) {
        const { helper, start } = this.drag;
        const p = this._windowPoint(e);
        Object.assign(helper.style, {
            left: `${Math.min(start.x, p.x)}px`,
            top: `${Math.min(start.y, p.y)}px`,
            width: `${Math.abs(p.x - start.x)}px`,
            height: `${Math.abs(p.y - start.y)}px`,
        });
    }

    // Creation ------------------------------------------------------------------------------------------------

    _preview(pageNumber, annotations) {
        const p = this.viewer._page(pageNumber);
        if (!p) {
            return;
        }
        p.previewRoot.replaceChildren(...annotations.map((a) => renderAnnotation(this.doc, a)));
    }

    _clearPreview(pageNumber) {
        this.viewer._page(pageNumber)?.previewRoot.replaceChildren();
    }

    startCreate(e, tool, pageNumber, point) {
        if (tool.kind === 'freetext') {
            this.openEditor(null, pageNumber, point);
            return;
        }
        if (tool.kind === 'sticky') {
            const a = this._newAnnotation(this.toolMode, pageNumber);
            a._setBox({ x: point.x - 10, y: point.y - 10, w: 20, h: 20 });
            this.openEditor(a, pageNumber, point, true);
            return;
        }
        if (tool.kind === 'poly') {
            if (!this.poly) {
                this.poly = { pageNumber, annotation: this._newAnnotation(this.toolMode, pageNumber) };
            } else if (pageNumber !== this.poly.pageNumber) {
                return;
            }
            const path = this.poly.annotation.getPath();
            const first = path[0];
            const closeDistance = 6 / this.viewer.getZoomLevel();
            if (path.length > 2 && first && Math.hypot(point.x - first.x, point.y - first.y) < closeDistance) {
                this.finishPoly(true);
                return;
            }
            this.poly.annotation.addPathPoint(point.x, point.y);
            this.drawPolyPreview(point);
            return;
        }
        const drag = {
            type: 'create', tool, name: this.toolMode, pageNumber, start: point, points: [point], annotation: null,
        };
        if (tool.kind === 'markup') {
            drag.text = this.viewer._pageText(pageNumber).catch(() => null);
            drag.text.then((text) => {
                drag.pageText = text;
            });
        }
        this.drag = drag;
        this._capture(e);
    }

    _buildCreated(drag, point) {
        const { tool, start, pageNumber } = drag;
        const a = this._newAnnotation(drag.name, pageNumber);
        switch (tool.kind) {
            case 'box':
                a._setBox({ x: Math.min(start.x, point.x), y: Math.min(start.y, point.y), w: Math.abs(point.x - start.x), h: Math.abs(point.y - start.y) });
                break;
            case 'line':
                a.setStartPoint(start.x, start.y);
                a.setEndPoint(point.x, point.y);
                break;
            case 'ink':
                a.setPath(drag.points);
                break;
            case 'markup': {
                const chars = drag.pageText ? drag.pageText.range(start, point) : [];
                const quads = PageText.quads(chars);
                if (!quads.length) {
                    return null;
                }
                a.Quads = quads;
                // WebViewer stores the marked-up text as the annotation contents.
                a.setContents(drag.pageText.text(chars).replace(/\s+/g, ' ').trim());
                break;
            }
            default:
                return null;
        }
        return a;
    }

    updateCreate(drag, point) {
        if (drag.tool.kind === 'ink') {
            const last = drag.points[drag.points.length - 1];
            if (Math.hypot(point.x - last.x, point.y - last.y) < 0.75 / this.viewer.getZoomLevel()) {
                return;
            }
            drag.points.push(point);
        }
        drag.moved = true;
        const a = this._buildCreated(drag, point);
        this._preview(drag.pageNumber, a ? [a] : []);
    }

    finishCreate(drag, point) {
        this._clearPreview(drag.pageNumber);
        const finish = () => {
            const a = this._buildCreated(drag, point);
            if (!a) {
                return;
            }
            const box = a._getBox();
            const tiny = drag.tool.kind !== 'markup' && Math.max(box.w, box.h) < 3;
            if (tiny) {
                return;
            }
            this.manager.addAnnotation(a);
        };
        if (drag.tool.kind === 'markup' && !drag.pageText) {
            drag.text.then(finish);
        } else {
            finish();
        }
    }

    drawPolyPreview(point) {
        const { annotation, pageNumber } = this.poly;
        const preview = new (annotation.constructor)();
        Object.assign(preview, this.getToolStyle(this.toolMode));
        preview.setPath([...annotation.getPath(), new Point(point.x, point.y)]);
        this._preview(pageNumber, [preview]);
    }

    finishPoly(commit) {
        const poly = this.poly;
        this.poly = null;
        if (!poly) {
            return;
        }
        this._clearPreview(poly.pageNumber);
        const minPoints = poly.annotation instanceof PolylineAnnotation ? 2 : 3;
        if (commit && poly.annotation.getPath().length >= minPoints) {
            this.manager.addAnnotation(poly.annotation);
        }
    }

    // Editors ----------------------------------------------------------------------------------------------------

    /**
     * Free text and note editor. `annotation` null creates a free text at `point`; `isNew` adds
     * the given (note) annotation on commit.
     */
    openEditor(annotation, pageNumber = annotation?.PageNumber, point = null, isNew = false) {
        this.commitEditor();
        const creating = !annotation || isNew;
        const isNote = annotation instanceof StickyAnnotation;
        const scale = this.viewer.getZoomLevel();
        const el = this._div(`pmw-editor ${isNote ? 'pmw-note-editor' : 'pmw-freetext-editor'}`);
        const input = this.doc.createElement('textarea');
        input.value = annotation ? annotation.getContents() : '';
        input.setAttribute('aria-label', this.t(isNote ? 'note' : 'freeText'));
        el.append(input);

        let anchor;
        if (isNote) {
            const box = annotation._getBox();
            anchor = this.viewer.pageToWindow({ x: box.x + box.w, y: box.y }, pageNumber);
            input.placeholder = this.t('notePlaceholder');
            const actions = this._div('pmw-editor-actions');
            const ok = this.doc.createElement('button');
            ok.type = 'button';
            ok.textContent = this.t('save');
            ok.addEventListener('click', () => this.commitEditor());
            const cancel = this.doc.createElement('button');
            cancel.type = 'button';
            cancel.textContent = this.t('cancel');
            cancel.addEventListener('click', () => this.cancelEditor());
            actions.append(cancel, ok);
            el.append(actions);
        } else {
            const style = annotation || Object.assign(new FreeTextAnnotation(), this.getToolStyle(ToolNames.FREETEXT));
            const box = annotation ? annotation._getBox() : { x: point.x, y: point.y, w: 160, h: 0 };
            anchor = this.viewer.pageToWindow({ x: box.x, y: box.y }, pageNumber);
            Object.assign(input.style, {
                fontSize: `${style.getFontSizeValue() * scale}px`,
                color: style.TextColor.toString(),
                width: `${Math.max(80, box.w * scale)}px`,
                minHeight: `${Math.max(style.getFontSizeValue() * 1.6, box.h) * scale}px`,
            });
        }
        Object.assign(el.style, { left: `${anchor.x}px`, top: `${anchor.y}px` });
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Escape') {
                this.cancelEditor();
            } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                this.commitEditor();
            }
        });
        this.viewerEl.append(el);
        this.editor = { el, input, annotation, pageNumber, point, creating, isNote };
        input.focus();
    }

    commitEditor() {
        const editor = this.editor;
        if (!editor) {
            return;
        }
        this.editor = null;
        editor.el.remove();
        const text = editor.input.value;
        const { annotation } = editor;
        if (editor.isNote) {
            annotation.setContents(text);
            if (editor.creating) {
                this.manager.addAnnotation(annotation);
                this.setToolMode(ToolNames.EDIT);
            } else {
                this.manager.notifyModified([annotation]);
            }
            return;
        }
        if (editor.creating) {
            this.setToolMode(ToolNames.EDIT);
            if (!text.trim()) {
                return;
            }
            const scale = this.viewer.getZoomLevel();
            const a = this._newAnnotation(ToolNames.FREETEXT, editor.pageNumber);
            const lines = text.split('\n');
            const size = a.getFontSizeValue();
            const width = Math.max(editor.input.offsetWidth / scale, 20);
            a._setBox({ x: editor.point.x, y: editor.point.y, w: width, h: Math.max(lines.length * size * 1.25 + 4, editor.input.offsetHeight / scale) });
            a.setContents(text);
            this.manager.addAnnotation(a);
            return;
        }
        if (!text.trim()) {
            this.manager.deleteAnnotations([annotation]);
        } else if (text !== annotation.getContents()) {
            annotation.setContents(text);
            this.manager.notifyModified([annotation]);
        }
    }

    cancelEditor() {
        const editor = this.editor;
        if (!editor) {
            return;
        }
        this.editor = null;
        editor.el.remove();
        if (editor.creating) {
            this.setToolMode(ToolNames.EDIT);
        }
    }

    // Selection --------------------------------------------------------------------------------------------------

    drawSelection() {
        const selected = this.manager.getSelectedAnnotations().filter((a) => this.viewer._page(a.PageNumber));
        this.selectionEl.replaceChildren();
        for (const a of selected) {
            const box = a._getBox();
            const corners = [[box.x, box.y], [box.x + box.w, box.y], [box.x, box.y + box.h], [box.x + box.w, box.y + box.h]]
                .map(([x, y]) => this.viewer.pageToWindow({ x, y }, a.PageNumber));
            const left = Math.min(...corners.map((c) => c.x));
            const top = Math.min(...corners.map((c) => c.y));
            const right = Math.max(...corners.map((c) => c.x));
            const bottom = Math.max(...corners.map((c) => c.y));
            const frame = this._div('pmw-selection');
            Object.assign(frame.style, {
                left: `${left - 3}px`, top: `${top - 3}px`, width: `${right - left + 6}px`, height: `${bottom - top + 6}px`,
            });
            const resizable = !(a instanceof StickyAnnotation) && !(a instanceof TextMarkupAnnotation) && !a.LockedContents;
            if (resizable) {
                const names = ['nw', 'ne', 'sw', 'se'];
                corners.forEach((c, i) => {
                    const h = this._div('pmw-handle');
                    h.dataset.handle = names[i];
                    Object.assign(h.style, { left: `${c.x - left + 3}px`, top: `${c.y - top + 3}px` });
                    frame.append(h);
                });
            }
            this.selectionEl.append(frame);
            if (selected.length === 1) {
                this.selectionEl.append(this.popup(a, left, bottom));
            }
        }
    }

    popup(a, left, bottom) {
        const el = this._div('pmw-annot-popup');
        Object.assign(el.style, { left: `${left}px`, top: `${bottom + 8}px` });
        if (a instanceof StickyAnnotation && a.getContents()) {
            const note = this._div('pmw-popup-note');
            note.textContent = a.getContents();
            el.append(note);
        }
        const row = this._div('pmw-popup-row');
        const prop = colorProperty(a);
        for (const hex of SWATCHES) {
            const b = this.doc.createElement('button');
            b.type = 'button';
            b.className = 'pmw-swatch';
            b.title = hex;
            b.style.background = hex;
            if (a[prop]?.toHexString?.() === hex) {
                b.classList.add('active');
            }
            b.addEventListener('click', () => {
                a[prop] = Color.parse(hex);
                this.manager.notifyModified([a]);
            });
            row.append(b);
        }
        if ((a instanceof FreeTextAnnotation || a instanceof StickyAnnotation) && !a.LockedContents) {
            const edit = this.doc.createElement('button');
            edit.type = 'button';
            edit.className = 'pmw-popup-button';
            edit.dataset.element = 'annotationEditButton';
            edit.title = this.t('edit');
            edit.innerHTML = '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg>';
            edit.addEventListener('click', () => this.openEditor(a));
            row.append(edit);
        }
        const del = this.doc.createElement('button');
        del.type = 'button';
        del.className = 'pmw-popup-button';
        del.dataset.element = 'annotationDeleteButton';
        del.title = this.t('delete');
        del.innerHTML = '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/></svg>';
        del.addEventListener('click', () => this.manager.deleteAnnotations([a]));
        row.append(del);
        el.append(row);
        return el;
    }
}
