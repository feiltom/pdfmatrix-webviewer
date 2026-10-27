import { Emitter } from './events.js';
import { GenericAnnotation, TextHighlightAnnotation } from './annotations.js';
import { renderAnnotation } from './render-annotation.js';
import { exportXfdf, parseXfdf } from './xfdf.js';

export const AnnotationManagerEvents = {
    ANNOTATION_CHANGED: 'annotationChanged',
    ANNOTATION_SELECTED: 'annotationSelected',
    ANNOTATIONS_DRAWN: 'annotationsDrawn',
};

/**
 * Annotation store and drawing, with the WebViewer `annotationManager` surface. Every mutation
 * fires `annotationChanged(annotations, action, info)` where `action` is `add`, `modify` or
 * `delete` and `info` carries `imported` and the caller's `source`.
 */
export class AnnotationManager extends Emitter {
    constructor(documentViewer) {
        super();
        this._viewer = documentViewer;
        this._annotations = [];
        this._selected = [];
        this._currentUser = 'Guest';
        this._readOnly = false;

        documentViewer.addEventListener('documentUnloaded', () => {
            this._annotations = [];
            this._selected = [];
        });
        documentViewer.addEventListener('documentLoaded', () => this.drawAllAnnotations());
        documentViewer.addEventListener('rotationUpdated', () => this.trigger('_layout'));
        documentViewer.addEventListener('layoutChanged', () => this.trigger('_layout'));
    }

    // Users ------------------------------------------------------------------------------------------

    getCurrentUser() { return this._currentUser; }

    setCurrentUser(name) { this._currentUser = name; }

    getDisplayAuthor(author) { return author; }

    isReadOnlyModeEnabled() { return this._readOnly; }

    enableReadOnlyMode() { this._readOnly = true; }

    disableReadOnlyMode() { this._readOnly = false; }

    // Store ------------------------------------------------------------------------------------------

    getAnnotationsList() {
        return [...this._annotations];
    }

    getAnnotationById(id) {
        return this._annotations.find((a) => a.Id === id) || null;
    }

    _info(options = {}) {
        return { imported: !!options.imported, isUndoRedo: false, source: options.source, ...options };
    }

    addAnnotation(annotation, options = {}) {
        this.addAnnotations([annotation], options);
    }

    addAnnotations(annotations, options = {}) {
        const added = [];
        for (const a of annotations || []) {
            if (!a) {
                continue;
            }
            const existing = this._annotations.indexOf(a);
            if (existing === -1) {
                this._annotations.push(a);
                added.push(a);
            }
        }
        if (added.length) {
            this._drawPages(added.map((a) => a.PageNumber));
            this.trigger(AnnotationManagerEvents.ANNOTATION_CHANGED, added, 'add', this._info(options));
        }
    }

    deleteAnnotation(annotation, options = {}) {
        this.deleteAnnotations([annotation], options);
    }

    deleteAnnotations(annotations, options = {}) {
        const list = (annotations || []).filter((a) => this._annotations.includes(a));
        if (!list.length) {
            return;
        }
        this._annotations = this._annotations.filter((a) => !list.includes(a));
        const wasSelected = this._selected.filter((a) => list.includes(a));
        if (wasSelected.length) {
            this._selected = this._selected.filter((a) => !list.includes(a));
            this.trigger(AnnotationManagerEvents.ANNOTATION_SELECTED, wasSelected, 'deselected');
        }
        this._drawPages(list.map((a) => a.PageNumber));
        this.trigger(AnnotationManagerEvents.ANNOTATION_CHANGED, list, 'delete', this._info(options));
    }

    /** Signals a change made to annotation properties (used by the UI tools as well). */
    notifyModified(annotations, options = {}) {
        this._drawPages(annotations.map((a) => a.PageNumber));
        this.trigger(AnnotationManagerEvents.ANNOTATION_CHANGED, annotations, 'modify', this._info(options));
    }

    updateAnnotation(annotation, options = {}) {
        this.notifyModified([annotation], options);
    }

    // Selection --------------------------------------------------------------------------------------

    getSelectedAnnotations() {
        return [...this._selected];
    }

    isAnnotationSelected(annotation) {
        return this._selected.includes(annotation);
    }

    selectAnnotation(annotation) {
        this.selectAnnotations([annotation]);
    }

    selectAnnotations(annotations) {
        const list = (annotations || []).filter((a) => this._annotations.includes(a) && !this._selected.includes(a));
        if (!list.length) {
            return;
        }
        this._selected.push(...list);
        this.trigger(AnnotationManagerEvents.ANNOTATION_SELECTED, list, 'selected');
        this.trigger('_layout');
    }

    deselectAnnotation(annotation) {
        this.deselectAnnotations([annotation]);
    }

    deselectAnnotations(annotations) {
        const list = (annotations || []).filter((a) => this._selected.includes(a));
        if (!list.length) {
            return;
        }
        this._selected = this._selected.filter((a) => !list.includes(a));
        this.trigger(AnnotationManagerEvents.ANNOTATION_SELECTED, list, 'deselected');
        this.trigger('_layout');
    }

    deselectAllAnnotations() {
        this.deselectAnnotations([...this._selected]);
    }

    // Drawing ----------------------------------------------------------------------------------------

    _drawPages(pageNumbers) {
        for (const n of new Set(pageNumbers)) {
            this.drawAnnotations(n);
        }
    }

    drawAnnotations(pageNumber) {
        const p = this._viewer._page(pageNumber);
        if (!p) {
            return Promise.resolve();
        }
        const doc = this._viewer._ownerDocument;
        const highlights = [];
        const others = [];
        for (const a of this._annotations) {
            if (a.PageNumber !== pageNumber || a.Hidden || a.NoView || a instanceof GenericAnnotation) {
                continue;
            }
            const g = renderAnnotation(doc, a, { interactive: !this._readOnly && a.isInteractive() });
            (a instanceof TextHighlightAnnotation ? highlights : others).push(g);
        }
        p.highlightRoot.replaceChildren(...highlights);
        p.annotRoot.replaceChildren(...others);
        this.trigger(AnnotationManagerEvents.ANNOTATIONS_DRAWN, pageNumber);
        this.trigger('_layout');
        return Promise.resolve();
    }

    drawAllAnnotations() {
        for (let n = 1; n <= this._viewer.getPageCount(); n += 1) {
            this.drawAnnotations(n);
        }
        return Promise.resolve();
    }

    redrawAnnotation(annotation) {
        if (annotation) {
            this.drawAnnotations(annotation.PageNumber);
        }
    }

    drawAnnotationsFromList(annotations) {
        this._drawPages((annotations || []).map((a) => a.PageNumber));
        return Promise.resolve();
    }

    /** Scrolls to an annotation; `zoom` sets the zoom level, `verticalOffset` is px or a % of the view. */
    jumpToAnnotation(annotation, options = {}) {
        if (!annotation) {
            return;
        }
        const viewer = this._viewer;
        if (options.zoom) {
            viewer.zoomTo(options.zoom);
        }
        const scroll = viewer.getScrollViewElement();
        const pos = viewer.pageToWindow({ x: annotation.X, y: annotation.Y }, annotation.PageNumber);
        const end = viewer.pageToWindow({ x: annotation.X + annotation.Width, y: annotation.Y + annotation.Height }, annotation.PageNumber);
        const top = Math.min(pos.y, end.y);
        const left = Math.min(pos.x, end.x);
        const width = Math.abs(end.x - pos.x);
        const offset = (value, size, fallback) => {
            if (typeof value === 'string' && value.trim().endsWith('%')) {
                return (parseFloat(value) / 100) * size;
            }
            return Number.isFinite(Number(value)) && value !== undefined && value !== null ? Number(value) : fallback;
        };
        const viewerEl = viewer.getViewerElement();
        const targetTop = viewerEl.offsetTop + top - offset(options.verticalOffset, scroll.clientHeight, scroll.clientHeight / 3);
        const targetLeft = viewerEl.offsetLeft + left - offset(options.horizontalOffset, scroll.clientWidth, (scroll.clientWidth - width) / 2);
        scroll.scrollTo({
            top: Math.max(0, targetTop),
            left: Math.max(0, targetLeft),
            behavior: options.isSmoothScroll ? 'smooth' : 'auto',
        });
        viewer._setCurrent(annotation.PageNumber);
    }

    // XFDF -------------------------------------------------------------------------------------------

    _pageInfo() {
        return (pageNumber) => {
            const p = this._viewer._page(pageNumber);
            if (!p) {
                return null;
            }
            return {
                toPdf: (x, y) => p.viewport.convertToPdfPoint(x, y),
                fromPdf: (x, y) => p.viewport.convertToViewportPoint(x, y),
                pdfHeight: p.viewport.viewBox[3] - p.viewport.viewBox[1],
            };
        };
    }

    /**
     * Exports annotations as XFDF. `annotationList` restricts the export (WebViewer semantics);
     * annotations that cannot be expressed (none in the supported set) are skipped.
     */
    exportAnnotations(options = {}) {
        const list = options.annotationList || this._annotations;
        return Promise.resolve(exportXfdf(list, this._pageInfo()));
    }

    exportAnnotationCommand() {
        return this.exportAnnotations();
    }

    /**
     * Imports XFDF. An annotation whose name matches an existing one replaces it. Resolves with the
     * imported annotations; fires `annotationChanged` with `imported: true`.
     */
    async importAnnotations(xfdf, options = {}) {
        if (!xfdf) {
            return [];
        }
        const { annotations, deleted } = parseXfdf(xfdf, this._pageInfo());
        const replaced = [];
        for (const a of annotations) {
            const old = this.getAnnotationById(a.Id);
            if (old) {
                replaced.push(old);
            }
        }
        const toDelete = [...replaced, ...deleted.map((id) => this.getAnnotationById(id)).filter(Boolean)];
        if (toDelete.length) {
            this._annotations = this._annotations.filter((a) => !toDelete.includes(a));
            this._selected = this._selected.filter((a) => !toDelete.includes(a));
            this.trigger(AnnotationManagerEvents.ANNOTATION_CHANGED, toDelete, 'delete', this._info({ ...options, imported: true }));
        }
        this._annotations.push(...annotations);
        this._drawPages([...annotations, ...toDelete].map((a) => a.PageNumber));
        if (annotations.length) {
            this.trigger(AnnotationManagerEvents.ANNOTATION_CHANGED, annotations, 'add', this._info({ ...options, imported: true }));
        }
        return annotations;
    }

    importAnnotationCommand(xfdf) {
        return this.importAnnotations(xfdf);
    }
}
