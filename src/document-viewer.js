import { Emitter } from './events.js';
import { rotatePoint, rotationMatrix, unrotatePoint } from './geometry.js';
import { documentOptions, loadPdfjs } from './pdfjs.js';
import { svgEl } from './render-annotation.js';
import { PageText } from './text-geometry.js';

const PAGE_GAP = 10;
const PADDING = 16;
const MAX_CANVAS_PIXELS = 16 * 1024 * 1024;
const MAX_RENDERED_PAGES = 12;

export const PageRotation = { E_0: 0, E_90: 1, E_180: 2, E_270: 3 };

export const DocumentViewerEvents = {
    DOCUMENT_LOADED: 'documentLoaded',
    DOCUMENT_UNLOADED: 'documentUnloaded',
    PAGE_NUMBER_UPDATED: 'pageNumberUpdated',
    PAGE_COMPLETE: 'pageComplete',
    ZOOM_UPDATED: 'zoomUpdated',
    ROTATION_UPDATED: 'rotationUpdated',
    FIT_MODE_UPDATED: 'fitModeUpdated',
    LAYOUT_CHANGED: 'layoutChanged',
    TOOL_MODE_UPDATED: 'toolModeUpdated',
    LOAD_ERROR: 'loaderror',
    ANNOTATIONS_LOADED: 'annotationsLoaded',
};

export const FitMode = { FitWidth: 'FitWidth', FitPage: 'FitPage', Zoom: 'Zoom' };

export const LayoutMode = {
    Single: 'Single', Continuous: 'Continuous', Facing: 'Facing', FacingContinuous: 'FacingContinuous',
    FacingCover: 'FacingCover', FacingCoverContinuous: 'FacingCoverContinuous',
};

const makeError = (message, status = 0, cause) => {
    const error = new Error(message);
    error.serverResponse = { status, statusText: message };
    error.type = status ? 'HTTP' : 'PDF';
    if (cause) {
        error.cause = cause;
    }
    return error;
};

/** The `getDocument()` object: document level queries in page coordinates. */
class LoadedDocument {
    constructor(viewer, pdf, pages, bytes, options) {
        this._viewer = viewer;
        this._pdf = pdf;
        this._pages = pages;
        this._bytes = bytes;
        this._options = options;
    }

    getType() { return 'pdf'; }

    getFilename() { return this._options.filename || 'document.pdf'; }

    getDocumentId() { return this._options.documentId || ''; }

    getPageCount() { return this._pages.length; }

    getPageInfo(pageNumber) {
        const p = this._pages[pageNumber - 1];
        return p ? { width: p.width, height: p.height } : null;
    }

    getPageRotation(pageNumber) {
        return ((this._pages[pageNumber - 1]?.intrinsicRotation || 0) / 90) % 4;
    }

    getFileData() {
        return Promise.resolve(this._bytes.slice().buffer);
    }

    async loadPageText(pageNumber, callback) {
        const text = (await this._viewer._pageText(pageNumber)).chars.map((c) => c.ch).join('');
        callback?.(text);
        return text;
    }

    /**
     * Renders a page, or the `renderRect` part of it (page coordinates), into a new canvas at
     * `multiplier` times the page size, then calls `drawComplete(canvas)`.
     */
    loadCanvas({ pageNumber = 1, multiplier = 1, zoom, renderRect, drawComplete, pageRotation = 0 } = {}) {
        const scale = Number(zoom || multiplier) || 1;
        const run = async () => {
            const page = await this._pdf.getPage(pageNumber);
            const info = this._pages[pageNumber - 1];
            const viewport = page.getViewport({ scale, rotation: (info.intrinsicRotation + (pageRotation % 4) * 90) % 360 });
            const r = renderRect
                ? { x: Math.min(renderRect.x1, renderRect.x2), y: Math.min(renderRect.y1, renderRect.y2), w: Math.abs(renderRect.x2 - renderRect.x1), h: Math.abs(renderRect.y2 - renderRect.y1) }
                : { x: 0, y: 0, w: viewport.width / scale, h: viewport.height / scale };
            const canvas = this._viewer._ownerDocument.createElement('canvas');
            canvas.width = Math.max(1, Math.ceil(r.w * scale));
            canvas.height = Math.max(1, Math.ceil(r.h * scale));
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await page.render({
                canvas, canvasContext: ctx, viewport, transform: [1, 0, 0, 1, -r.x * scale, -r.y * scale],
            }).promise;
            drawComplete?.(canvas, pageNumber);
            return canvas;
        };
        return run();
    }
}

/**
 * Continuous vertical page view on top of pdf.js. Owns the scroll element, the pages container
 * (`getViewerElement()`) and the per-page layers: canvas, pdf.js text layer and two SVG layers
 * for annotations (highlights are drawn with `multiply` blending in their own layer).
 */
export class DocumentViewer extends Emitter {
    constructor(ownerDocument, { disableLogs = false } = {}) {
        super();
        this._ownerDocument = ownerDocument;
        this._disableLogs = disableLogs;
        this._scale = 1;
        this._fitMode = FitMode.FitWidth;
        this._layoutMode = LayoutMode.Continuous;
        this._pages = [];
        this._doc = null;
        this._pdf = null;
        this._loadToken = 0;
        this._currentPage = 1;
        this._visible = new Set();
        this._rendering = new Set();
        this._renderQueued = false;
        this._lockedScrollTop = null;
        this._toolMode = null;
        this._textCache = new Map();
        this._worker = null;
        this._disposed = false;

        this._scrollEl = ownerDocument.createElement('div');
        this._scrollEl.className = 'pmw-scroll';
        this._scrollEl.setAttribute('data-element', 'documentContainer');
        this._scrollEl.style.padding = `${PADDING}px`;
        this._viewerEl = ownerDocument.createElement('div');
        this._viewerEl.className = 'pmw-pages document';
        this._scrollEl.append(this._viewerEl);

        this._onScroll = () => {
            if (!this._scrollQueued) {
                this._scrollQueued = true;
                requestAnimationFrame(() => {
                    this._scrollQueued = false;
                    this._updateCurrentPage();
                });
            }
        };
        this._scrollEl.addEventListener('scroll', this._onScroll, { passive: true });

        this._io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                const n = Number(entry.target.dataset.pageNumber);
                if (entry.isIntersecting) {
                    this._visible.add(n);
                } else {
                    this._visible.delete(n);
                }
            }
            this._scheduleRender();
        }, { root: this._scrollEl, rootMargin: '400px 0px' });

        this._ro = new ResizeObserver(() => {
            if (this._fitMode !== FitMode.Zoom) {
                this._applyFit();
            }
        });
        this._ro.observe(this._scrollEl);
    }

    // Elements ---------------------------------------------------------------------------------

    getScrollViewElement() { return this._scrollEl; }

    getViewerElement() { return this._viewerEl; }

    setScrollViewElement() { }

    setViewerElement() { }

    // Document -----------------------------------------------------------------------------------

    getDocument() { return this._doc; }

    getPageCount() { return this._pages.length; }

    getPageWidth(pageNumber) { return this._pages[pageNumber - 1]?.width ?? 0; }

    getPageHeight(pageNumber) { return this._pages[pageNumber - 1]?.height ?? 0; }

    isDocumentLoaded() { return !!this._doc; }

    _log(...args) {
        if (!this._disableLogs) {
            console.warn('[pdfmatrix-webviewer]', ...args);
        }
    }

    async _fetchBytes(src, options) {
        if (typeof src === 'string' || src instanceof URL) {
            let response;
            try {
                response = await fetch(String(src), {
                    headers: options.customHeaders || {},
                    credentials: options.withCredentials ? 'include' : 'same-origin',
                });
            } catch (cause) {
                throw makeError(`Network error while loading ${src}`, 0, cause);
            }
            if (!response.ok) {
                throw makeError(response.statusText || `HTTP ${response.status}`, response.status);
            }
            return new Uint8Array(await response.arrayBuffer());
        }
        if (src instanceof Blob) {
            return new Uint8Array(await src.arrayBuffer());
        }
        if (src instanceof ArrayBuffer) {
            return new Uint8Array(src.slice(0));
        }
        if (ArrayBuffer.isView(src)) {
            return new Uint8Array(src.buffer.slice(src.byteOffset, src.byteOffset + src.byteLength));
        }
        throw makeError('Unsupported document source');
    }

    /**
     * Loads a document from a URL, Blob, ArrayBuffer or typed array. Options follow WebViewer:
     * `customHeaders`, `withCredentials`, `filename`, `documentId`, `password`, `onError(error)`
     * where `error.serverResponse.status` carries the HTTP status (0 for non-HTTP failures).
     */
    async loadDocument(src, options = {}) {
        const token = ++this._loadToken;
        await this.closeDocument();
        let bytes;
        let pdf;
        try {
            bytes = await this._fetchBytes(src, options);
            if (token !== this._loadToken) { return; }
            const pdfjs = await loadPdfjs();
            this._pdfjs = pdfjs;
            if (!this._worker) {
                this._worker = new pdfjs.PDFWorker();
            }
            const task = pdfjs.getDocument({
                ...documentOptions(),
                data: bytes.slice(),
                password: options.password,
                worker: this._worker,
                verbosity: this._disableLogs ? 0 : 1,
            });
            this._loadingTask = task;
            pdf = await task.promise;
            if (token !== this._loadToken) {
                task.destroy();
                return;
            }
            const infos = await Promise.all(Array.from({ length: pdf.numPages }, async (_, i) => {
                const page = await pdf.getPage(i + 1);
                const viewport = page.getViewport({ scale: 1 });
                return {
                    num: i + 1, width: viewport.width, height: viewport.height, intrinsicRotation: page.rotate,
                    viewport, transform: viewport.transform,
                };
            }));
            if (token !== this._loadToken) {
                task.destroy();
                return;
            }
            this._pdf = pdf;
            this._pages = infos.map((info) => this._createPage(info));
            this._doc = new LoadedDocument(this, pdf, this._pages, bytes, options);
            this._currentPage = 1;
            this._applyFit(true);
            this._layout();
            this._scrollEl.scrollTop = 0;
            for (const p of this._pages) {
                this._io.observe(p.wrapper);
            }
            this.trigger(DocumentViewerEvents.DOCUMENT_LOADED);
            this.trigger(DocumentViewerEvents.ANNOTATIONS_LOADED);
            this._scheduleRender();
        } catch (cause) {
            if (token !== this._loadToken || this._disposed) { return; }
            const error = cause?.serverResponse ? cause : makeError(cause?.message || 'Unable to load the document', 0, cause);
            this._log('loadDocument failed:', error.message);
            this.trigger(DocumentViewerEvents.LOAD_ERROR, error);
            if (typeof options.onError === 'function') {
                options.onError(error);
            }
        }
    }

    async closeDocument() {
        const hadDocument = !!this._doc || !!this._pdf;
        for (const p of this._pages) {
            p.renderTask?.cancel();
            this._io.unobserve(p.wrapper);
        }
        // Destroying the loading task destroys its document too.
        const task = this._loadingTask;
        this._loadingTask = null;
        this._pages = [];
        this._visible.clear();
        this._rendering.clear();
        this._textCache.clear();
        this._viewerEl.replaceChildren();
        this._pdf = null;
        this._doc = null;
        task?.destroy().catch(() => { });
        if (hadDocument) {
            this.trigger(DocumentViewerEvents.DOCUMENT_UNLOADED);
        }
    }

    // Pages ----------------------------------------------------------------------------------------

    _createPage(info) {
        const doc = this._ownerDocument;
        const wrapper = doc.createElement('div');
        wrapper.className = 'pmw-page';
        wrapper.dataset.pageNumber = String(info.num);
        const textLayer = doc.createElement('div');
        textLayer.className = 'textLayer';
        const highlightSvg = svgEl(doc, 'svg', { class: 'pmw-annot-layer pmw-highlight-layer' });
        const annotSvg = svgEl(doc, 'svg', { class: 'pmw-annot-layer' });
        const previewSvg = svgEl(doc, 'svg', { class: 'pmw-annot-layer pmw-preview-layer' });
        const highlightRoot = svgEl(doc, 'g');
        const annotRoot = svgEl(doc, 'g');
        const previewRoot = svgEl(doc, 'g');
        highlightSvg.append(highlightRoot);
        annotSvg.append(annotRoot);
        previewSvg.append(previewRoot);
        wrapper.append(textLayer, highlightSvg, annotSvg, previewSvg);
        this._viewerEl.append(wrapper);
        return {
            ...info, rotation: 0, wrapper, canvas: null, textLayer, highlightSvg, annotSvg, previewSvg,
            highlightRoot, annotRoot, previewRoot, renderedKey: null, renderTask: null,
        };
    }

    _page(pageNumber) {
        return this._pages[pageNumber - 1] || null;
    }

    /** Displayed size of a page at scale 1 (view rotation applied). */
    _displaySize(p) {
        return p.rotation % 2 ? { w: p.height, h: p.width } : { w: p.width, h: p.height };
    }

    _layout() {
        let maxWidth = 0;
        for (const p of this._pages) {
            const size = this._displaySize(p);
            const w = size.w * this._scale;
            const h = size.h * this._scale;
            maxWidth = Math.max(maxWidth, w);
            Object.assign(p.wrapper.style, { width: `${w}px`, height: `${h}px`, marginBottom: `${PAGE_GAP}px` });
            p.wrapper.style.setProperty('--scale-factor', String(this._scale));
            p.wrapper.style.setProperty('--total-scale-factor', String(this._scale));
            for (const svg of [p.highlightSvg, p.annotSvg, p.previewSvg]) {
                svg.setAttribute('viewBox', `0 0 ${size.w} ${size.h}`);
            }
            const matrix = rotationMatrix(p.width, p.height, p.rotation);
            for (const g of [p.highlightRoot, p.annotRoot, p.previewRoot]) {
                if (matrix) {
                    g.setAttribute('transform', matrix);
                } else {
                    g.removeAttribute('transform');
                }
            }
        }
        this._viewerEl.style.width = `${maxWidth}px`;
        this.trigger(DocumentViewerEvents.LAYOUT_CHANGED);
    }

    _renderKey(p) {
        return `${this._scale}|${p.rotation}`;
    }

    _scheduleRender() {
        if (this._renderQueued || this._disposed) {
            return;
        }
        this._renderQueued = true;
        requestAnimationFrame(() => {
            this._renderQueued = false;
            this._renderVisible();
        });
    }

    _renderVisible() {
        if (!this._pdf) {
            return;
        }
        const order = [...this._visible].sort((a, b) => Math.abs(a - this._currentPage) - Math.abs(b - this._currentPage));
        for (const n of order) {
            if (this._rendering.size >= 2) {
                break;
            }
            const p = this._page(n);
            if (p && !this._rendering.has(n) && p.renderedKey !== this._renderKey(p)) {
                this._renderPage(p);
            }
        }
    }

    async _renderPage(p) {
        const pdf = this._pdf;
        const key = this._renderKey(p);
        this._rendering.add(p.num);
        try {
            const page = await pdf.getPage(p.num);
            if (pdf !== this._pdf) { return; }
            const rotation = (p.intrinsicRotation + p.rotation * 90) % 360;
            const viewport = page.getViewport({ scale: this._scale, rotation });
            const dpr = globalThis.devicePixelRatio || 1;
            const outputScale = Math.min(dpr, Math.sqrt(MAX_CANVAS_PIXELS / Math.max(1, viewport.width * viewport.height)));
            const canvas = this._ownerDocument.createElement('canvas');
            canvas.className = 'pmw-canvas';
            canvas.width = Math.max(1, Math.floor(viewport.width * outputScale));
            canvas.height = Math.max(1, Math.floor(viewport.height * outputScale));
            const task = page.render({
                canvas,
                viewport,
                transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
            });
            p.renderTask = task;
            await task.promise;
            p.renderTask = null;
            if (pdf !== this._pdf || key !== this._renderKey(p)) { return; }
            if (p.canvas) {
                p.canvas.replaceWith(canvas);
            } else {
                p.wrapper.prepend(canvas);
            }
            p.canvas = canvas;

            const textLayer = this._ownerDocument.createElement('div');
            textLayer.className = 'textLayer';
            const layer = new this._pdfjs.TextLayer({ textContentSource: page.streamTextContent(), container: textLayer, viewport });
            await layer.render();
            if (pdf !== this._pdf || key !== this._renderKey(p)) { return; }
            p.textLayer.replaceWith(textLayer);
            p.textLayer = textLayer;
            p.renderedKey = key;
            this.trigger(DocumentViewerEvents.PAGE_COMPLETE, p.num, canvas);
            this._releaseFarPages();
        } catch (error) {
            if (error?.name !== 'RenderingCancelledException' && pdf === this._pdf) {
                this._log(`rendering page ${p.num} failed:`, error?.message || error);
            }
        } finally {
            this._rendering.delete(p.num);
            if (pdf === this._pdf) {
                this._scheduleRender();
            }
        }
    }

    /** Keeps memory bounded on long documents by dropping canvases far from the viewport. */
    _releaseFarPages() {
        const rendered = this._pages.filter((p) => p.canvas);
        if (rendered.length <= MAX_RENDERED_PAGES) {
            return;
        }
        rendered
            .filter((p) => !this._visible.has(p.num))
            .sort((a, b) => Math.abs(b.num - this._currentPage) - Math.abs(a.num - this._currentPage))
            .slice(0, rendered.length - MAX_RENDERED_PAGES)
            .forEach((p) => {
                p.canvas.width = 0;
                p.canvas.height = 0;
                p.canvas.remove();
                p.canvas = null;
                p.textLayer.replaceChildren();
                p.renderedKey = null;
            });
    }

    async _pageText(pageNumber) {
        if (!this._textCache.has(pageNumber)) {
            const pdf = this._pdf;
            const promise = (async () => {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();
                return new PageText(content, this._page(pageNumber).transform, this._pdfjs.Util);
            })();
            this._textCache.set(pageNumber, promise);
            promise.catch(() => this._textCache.delete(pageNumber));
        }
        return this._textCache.get(pageNumber);
    }

    // Zoom & fit -------------------------------------------------------------------------------------

    getZoomLevel() { return this._scale; }

    getFitMode() { return this._fitMode; }

    setFitMode(mode) {
        this._fitMode = FitMode[mode] || mode;
        this._applyFit();
        this.trigger(DocumentViewerEvents.FIT_MODE_UPDATED, this._fitMode);
    }

    getLayoutMode() { return this._layoutMode; }

    setLayoutMode(mode) {
        // Only the continuous single-column layout is implemented; other modes fall back to it.
        this._layoutMode = mode;
    }

    _fitScale() {
        if (!this._pages.length) {
            return this._scale;
        }
        const width = this._scrollEl.clientWidth - PADDING * 2;
        const height = this._scrollEl.clientHeight - PADDING * 2;
        const maxWidth = Math.max(...this._pages.map((p) => this._displaySize(p).w));
        const byWidth = width > 0 ? width / maxWidth : 1;
        if (this._fitMode === FitMode.FitPage) {
            const current = this._page(this._currentPage) || this._pages[0];
            const byHeight = height > 0 ? height / this._displaySize(current).h : byWidth;
            return Math.min(byWidth, byHeight);
        }
        return byWidth;
    }

    _applyFit(silent = false) {
        if (this._fitMode === FitMode.Zoom || !this._pages.length) {
            return;
        }
        const scale = this._fitScale();
        if (scale > 0 && Number.isFinite(scale)) {
            this._setScale(scale, { silent });
        }
    }

    _setScale(scale, { silent = false, anchor } = {}) {
        const next = Math.min(32, Math.max(0.05, scale));
        if (Math.abs(next - this._scale) < 1e-6) {
            return;
        }
        const ref = anchor || this._scrollAnchor();
        this._scale = next;
        this._layout();
        if (ref) {
            this._restoreAnchor(ref);
        }
        if (!silent) {
            this.trigger(DocumentViewerEvents.ZOOM_UPDATED, next);
        }
        this._scheduleRender();
    }

    _scrollAnchor() {
        const p = this._page(this._currentPage);
        if (!p) {
            return null;
        }
        const top = this._viewerEl.offsetTop + p.wrapper.offsetTop;
        return { page: p.num, fraction: (this._scrollEl.scrollTop - top) / Math.max(1, p.wrapper.offsetHeight) };
    }

    _restoreAnchor({ page, fraction }) {
        const p = this._page(page);
        if (!p) {
            return;
        }
        const top = this._viewerEl.offsetTop + p.wrapper.offsetTop;
        this._scrollEl.scrollTop = top + fraction * p.wrapper.offsetHeight;
        this._lockedScrollTop = this._scrollEl.scrollTop;
    }

    zoomTo(zoom) {
        this._fitMode = FitMode.Zoom;
        this._setScale(Number(zoom) || 1);
    }

    setZoomLevel(zoom) {
        this.zoomTo(zoom);
    }

    zoomIn(factor = 1.25) {
        this.zoomTo(this._scale * factor);
    }

    zoomOut(factor = 1.25) {
        this.zoomTo(this._scale / factor);
    }

    // Pages navigation ---------------------------------------------------------------------------------

    getCurrentPage() { return this._currentPage; }

    setCurrentPage(pageNumber, isSmoothScroll = false) {
        const p = this._page(Number(pageNumber));
        if (!p) {
            return;
        }
        const top = this._viewerEl.offsetTop + p.wrapper.offsetTop - PAGE_GAP;
        this._scrollEl.scrollTo({ top: Math.max(0, top), behavior: isSmoothScroll ? 'smooth' : 'auto' });
        this._lockedScrollTop = isSmoothScroll ? null : this._scrollEl.scrollTop;
        this._setCurrent(p.num);
        this._scheduleRender();
    }

    _setCurrent(n) {
        if (n !== this._currentPage) {
            this._currentPage = n;
            this.trigger(DocumentViewerEvents.PAGE_NUMBER_UPDATED, n);
        }
    }

    _updateCurrentPage() {
        if (!this._pages.length) {
            return;
        }
        const scrollTop = this._scrollEl.scrollTop;
        if (this._lockedScrollTop !== null && Math.abs(scrollTop - this._lockedScrollTop) < 2) {
            return;
        }
        this._lockedScrollTop = null;
        const viewTop = scrollTop;
        const viewBottom = scrollTop + this._scrollEl.clientHeight;
        let best = this._currentPage;
        let bestArea = -1;
        for (const p of this._pages) {
            const top = this._viewerEl.offsetTop + p.wrapper.offsetTop;
            const bottom = top + p.wrapper.offsetHeight;
            if (bottom < viewTop || top > viewBottom) {
                continue;
            }
            const visible = Math.min(bottom, viewBottom) - Math.max(top, viewTop);
            if (visible > bestArea + 0.5) {
                bestArea = visible;
                best = p.num;
            }
        }
        this._setCurrent(best);
    }

    displayPageLocation(pageNumber, x = 0, y = 0) {
        const p = this._page(pageNumber);
        if (!p) {
            return;
        }
        const w = this.pageToWindow({ x, y }, pageNumber);
        this._scrollEl.scrollTop = this._viewerEl.offsetTop + w.y - PAGE_GAP;
        this._scrollEl.scrollLeft = Math.max(0, this._viewerEl.offsetLeft + w.x - this._scrollEl.clientWidth / 2);
        this._setCurrent(pageNumber);
    }

    // Rotation ---------------------------------------------------------------------------------------------

    getRotation(pageNumber = this._currentPage) {
        return this._page(pageNumber)?.rotation ?? 0;
    }

    getCompleteRotation(pageNumber = this._currentPage) {
        const p = this._page(pageNumber);
        return p ? (p.intrinsicRotation / 90 + p.rotation) % 4 : 0;
    }

    getPageRotations() {
        return Object.fromEntries(this._pages.map((p) => [p.num, p.rotation]));
    }

    /** Sets the view rotation (a `PageRotation` value) of one page, or of every page. */
    setRotation(rotation, pageNumber) {
        const value = ((Number(rotation) % 4) + 4) % 4;
        const targets = pageNumber ? [this._page(Number(pageNumber))].filter(Boolean) : this._pages;
        if (!targets.length) {
            return;
        }
        const anchor = this._scrollAnchor();
        for (const p of targets) {
            p.rotation = value;
        }
        if (this._fitMode !== FitMode.Zoom) {
            const scale = this._fitScale();
            if (Math.abs(scale - this._scale) > 1e-6) {
                this._scale = scale;
                this.trigger(DocumentViewerEvents.ZOOM_UPDATED, scale);
            }
        }
        this._layout();
        if (anchor) {
            this._restoreAnchor(anchor);
        }
        this.trigger(DocumentViewerEvents.ROTATION_UPDATED, value, pageNumber ? Number(pageNumber) : undefined);
        this._scheduleRender();
    }

    rotateClockwise(pageNumber) {
        const pages = pageNumber ? [pageNumber] : this._pages.map((p) => p.num);
        pages.forEach((n) => this.setRotation(this.getRotation(n) + 1, n));
    }

    rotateCounterClockwise(pageNumber) {
        const pages = pageNumber ? [pageNumber] : this._pages.map((p) => p.num);
        pages.forEach((n) => this.setRotation(this.getRotation(n) + 3, n));
    }

    // Coordinates ---------------------------------------------------------------------------------------------

    /**
     * Window coordinates are CSS pixels relative to the top-left corner of the viewer element
     * (`getViewerElement()`), which scrolls with the pages.
     */
    pageToWindow(point, pageNumber) {
        const p = this._page(pageNumber);
        if (!p) {
            return { x: 0, y: 0 };
        }
        const r = rotatePoint(point.x, point.y, p.width, p.height, p.rotation);
        return { x: p.wrapper.offsetLeft + r.x * this._scale, y: p.wrapper.offsetTop + r.y * this._scale };
    }

    windowToPage(point, pageNumber) {
        const p = this._page(pageNumber);
        if (!p) {
            return { x: 0, y: 0, pageNumber };
        }
        const lx = (point.x - p.wrapper.offsetLeft) / this._scale;
        const ly = (point.y - p.wrapper.offsetTop) / this._scale;
        const r = unrotatePoint(lx, ly, p.width, p.height, p.rotation);
        return { x: r.x, y: r.y, pageNumber };
    }

    /** Page coordinates of a pointer event's client position on a given page. */
    clientToPage(clientX, clientY, pageNumber) {
        const rect = this._viewerEl.getBoundingClientRect();
        return this.windowToPage({ x: clientX - rect.left, y: clientY - rect.top }, pageNumber);
    }

    /** Page under a window point; the closest page vertically when the point is in a gap. */
    pageAtWindowPoint(point) {
        let best = null;
        let bestDistance = Infinity;
        for (const p of this._pages) {
            const top = p.wrapper.offsetTop;
            const bottom = top + p.wrapper.offsetHeight;
            const d = point.y < top ? top - point.y : point.y > bottom ? point.y - bottom : 0;
            if (d < bestDistance) {
                bestDistance = d;
                best = p.num;
            }
        }
        return best;
    }

    getDisplayModeManager() {
        const viewer = this;
        const mode = {
            mode: this._layoutMode,
            pageToWindow: (pt, pageNumber) => viewer.pageToWindow(pt, pageNumber),
            windowToPage: (pt, pageNumber) => viewer.windowToPage(pt, pageNumber),
            getSelectedPages: (p1, p2) => {
                const a = viewer.pageAtWindowPoint(p1);
                const b = viewer.pageAtWindowPoint(p2);
                return { first: Math.min(a, b), last: Math.max(a, b) };
            },
            getVisiblePages: () => [...viewer._visible].sort((x, y) => x - y),
            isContinuous: () => true,
        };
        return {
            getDisplayMode: () => mode,
            isContinuousDisplayMode: () => true,
            setDisplayMode: () => { },
        };
    }

    getVisiblePages() {
        return [...this._visible].sort((a, b) => a - b);
    }

    // Misc --------------------------------------------------------------------------------------------------

    refreshAll() {
        for (const p of this._pages) {
            p.renderedKey = null;
        }
        this._scheduleRender();
    }

    updateView() {
        this._scheduleRender();
    }

    scrollViewUpdated() {
        this._updateCurrentPage();
    }

    async dispose() {
        if (this._disposed) {
            return;
        }
        this._loadToken += 1;
        await this.closeDocument();
        this._disposed = true;
        this._io.disconnect();
        this._ro.disconnect();
        this._scrollEl.removeEventListener('scroll', this._onScroll);
        this._worker?.destroy();
        this._worker = null;
    }

    unmount() {
        return this.dispose();
    }
}
