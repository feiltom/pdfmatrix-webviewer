import { Emitter } from './events.js';
import { FitMode, LayoutMode } from './document-viewer.js';
import { iconHtml } from './icons.js';
import { translator } from './i18n.js';
import { SWATCHES, TOOLS, ToolNames } from './interaction.js';

// Components ------------------------------------------------------------------------------------------

let componentCount = 0;

class Component {
    constructor(props = {}) {
        componentCount += 1;
        this.props = { ...props };
        this.dataElement = props.dataElement || `pmw-item-${componentCount}`;
        this._ui = null;
    }

    setStyle(style) {
        this.props.style = { ...(this.props.style || {}), ...style };
        this._ui?.render();
    }

    _render() {
        return null;
    }
}

/** `UI.Components.CustomButton`: `{ dataElement, img, title, label, onClick, disabled, className }`. */
export class CustomButton extends Component {
    constructor(props) {
        super(props);
        this.type = 'customButton';
    }

    setImg(img) { this.props.img = img; this._ui?.render(); }

    setLabel(label) { this.props.label = label; this._ui?.render(); }

    setTitle(title) { this.props.title = title; this._ui?.render(); }

    _render(ui) {
        return ui._button({
            dataElement: this.dataElement,
            img: this.props.img,
            label: this.props.label,
            title: this.props.title,
            disabled: this.props.disabled,
            className: this.props.className,
            style: this.props.style,
            onClick: (event) => this.props.onClick?.(event),
        });
    }
}

/**
 * `UI.Components.StatefulButton`: `{ dataElement, initialState, states }` where each state has
 * `img`, `title`, `label`, `className` and `onClick(update, activeState)`; `update(name)` switches
 * state and re-renders.
 */
export class StatefulButton extends Component {
    constructor(props) {
        super(props);
        this.type = 'statefulButton';
        this.activeState = props.initialState || Object.keys(props.states || {})[0];
    }

    setState(name) {
        if (this.props.states?.[name]) {
            this.activeState = name;
            this._ui?.render();
        }
    }

    _render(ui) {
        const state = this.props.states?.[this.activeState] || {};
        const update = (name) => this.setState(name);
        return ui._button({
            dataElement: this.dataElement,
            img: state.img,
            label: state.label,
            title: state.title,
            disabled: state.disabled ?? this.props.disabled,
            className: [state.className, this.props.className].filter(Boolean).join(' '),
            style: this.props.style,
            onClick: () => state.onClick?.(update, this.activeState),
        });
    }
}

/** `UI.Components.ToggleElementButton`: a button toggling another element (panels are not implemented). */
export class ToggleElementButton extends CustomButton {
    constructor(props) {
        super(props);
        this.type = 'toggleButton';
    }
}

/** `UI.Components.ToolButton`: a button activating a tool by name. */
export class ToolButton extends Component {
    constructor(props) {
        super(props);
        this.type = 'toolButton';
    }

    _render(ui) {
        return ui._toolButton(this.props.toolName, this.dataElement);
    }
}

export class Divider extends Component {
    constructor(props) {
        super(props);
        this.type = 'divider';
    }

    _render(ui) {
        const el = ui.doc.createElement('div');
        el.className = 'pmw-divider';
        el.dataset.element = this.dataElement;
        return el;
    }
}

/** `UI.Components.GroupedItems`: `{ dataElement, items, grow, gap, justifyContent }`. */
export class GroupedItems extends Component {
    constructor(props) {
        super(props);
        this.type = 'groupedItems';
        this.items = [...(props.items || [])];
    }

    setItems(items) {
        this.items = [...items];
        this._ui?.render();
    }

    _render(ui) {
        const el = ui.doc.createElement('div');
        el.className = 'pmw-group';
        el.dataset.element = this.dataElement;
        if (this.props.grow) { el.style.flex = `${this.props.grow} 1 auto`; }
        if (this.props.gap !== undefined) { el.style.gap = `${this.props.gap}px`; }
        if (this.props.justifyContent) { el.style.justifyContent = this.props.justifyContent; }
        for (const item of this.items) {
            const child = ui._renderItem(item);
            if (child) { el.append(child); }
        }
        return el;
    }
}

/** Built-in header entries, rendered by the UI from their data element. */
class BuiltinItem {
    constructor(dataElement) {
        this.dataElement = dataElement;
        this.type = 'builtin';
    }
}

const RIBBONS = [
    { dataElement: 'toolbarGroup-View', label: 'view', tools: [] },
    {
        dataElement: 'toolbarGroup-Annotate',
        label: 'annotate',
        tools: [ToolNames.HIGHLIGHT, ToolNames.UNDERLINE, ToolNames.STRIKEOUT, ToolNames.SQUIGGLY, ToolNames.FREEHAND,
            ToolNames.FREETEXT, ToolNames.STICKY],
    },
    {
        dataElement: 'toolbarGroup-Shapes',
        label: 'shapes',
        tools: [ToolNames.RECTANGLE, ToolNames.ELLIPSE, ToolNames.LINE, ToolNames.ARROW, ToolNames.POLYGON, ToolNames.POLYLINE],
    },
];

const TOOL_BUTTONS = {
    [ToolNames.HIGHLIGHT]: { dataElement: 'highlightToolGroupButton', icon: 'highlight', label: 'highlight' },
    [ToolNames.UNDERLINE]: { dataElement: 'underlineToolGroupButton', icon: 'underline', label: 'underline' },
    [ToolNames.STRIKEOUT]: { dataElement: 'strikeoutToolGroupButton', icon: 'strikeout', label: 'strikeout' },
    [ToolNames.SQUIGGLY]: { dataElement: 'squigglyToolGroupButton', icon: 'squiggly', label: 'squiggly' },
    [ToolNames.FREEHAND]: { dataElement: 'freeHandToolGroupButton', icon: 'freehand', label: 'freeHand' },
    [ToolNames.FREETEXT]: { dataElement: 'freeTextToolGroupButton', icon: 'freetext', label: 'freeText' },
    [ToolNames.STICKY]: { dataElement: 'stickyToolGroupButton', icon: 'sticky', label: 'note' },
    [ToolNames.RECTANGLE]: { dataElement: 'rectangleToolGroupButton', icon: 'rectangle', label: 'rectangle' },
    [ToolNames.ELLIPSE]: { dataElement: 'ellipseToolGroupButton', icon: 'ellipse', label: 'ellipse' },
    [ToolNames.LINE]: { dataElement: 'lineToolGroupButton', icon: 'line', label: 'line' },
    [ToolNames.ARROW]: { dataElement: 'arrowToolGroupButton', icon: 'arrow', label: 'arrow' },
    [ToolNames.POLYGON]: { dataElement: 'polygonToolGroupButton', icon: 'polygon', label: 'polygon' },
    [ToolNames.POLYLINE]: { dataElement: 'polylineToolGroupButton', icon: 'polyline', label: 'polyline' },
    [ToolNames.PAN]: { dataElement: 'panToolButton', icon: 'pan', label: 'pan' },
    [ToolNames.EDIT]: { dataElement: 'selectToolButton', icon: 'select', label: 'select' },
};

const ZOOM_PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

/**
 * The `instance.UI` namespace: header and ribbon rendering, element visibility, language, and the
 * document level actions WebViewer exposes on the UI (download, zoom, fit, tool mode).
 */
export class UI extends Emitter {
    constructor({ doc, root, viewer, manager, interaction, language }) {
        super();
        this.doc = doc;
        this.root = root;
        this.viewer = viewer;
        this.manager = manager;
        this.interaction = interaction;
        this.language = language || 'en';
        this.t = translator(() => this.language);
        this.disabled = new Set();
        this.overrides = {};
        this.activeRibbon = 'toolbarGroup-View';
        this.hotkeysEnabled = true;
        this.disposed = false;
        this.FitMode = FitMode;
        this.LayoutMode = LayoutMode;
        this.Components = { CustomButton, StatefulButton, ToggleElementButton, ToolButton, Divider, GroupedItems };

        this.app = doc.createElement('div');
        this.app.className = 'pmw-app';
        this.header = doc.createElement('div');
        this.header.className = 'pmw-header';
        this.header.dataset.element = 'default-top-header';
        this.header.setAttribute('role', 'toolbar');
        this.toolsHeader = doc.createElement('div');
        this.toolsHeader.className = 'pmw-tools-header';
        this.toolsHeader.dataset.element = 'tools-header';
        this.toolsHeader.setAttribute('role', 'toolbar');
        const body = doc.createElement('div');
        body.className = 'pmw-body';
        const scroll = viewer.getScrollViewElement();
        scroll.tabIndex = 0;
        this.pageNav = doc.createElement('div');
        this.pageNav.className = 'pmw-page-nav';
        this.pageNav.dataset.element = 'pageNavOverlay';
        body.append(scroll, this.pageNav);
        this.app.append(this.header, this.toolsHeader, body);
        root.append(this.app);

        this.headerItems = [
            new BuiltinItem('default-ribbon-group'),
            new BuiltinItem('pmw-spacer'),
            new BuiltinItem('zoomOverlayButton'),
            new BuiltinItem('panToolButton'),
            new BuiltinItem('selectToolButton'),
            new BuiltinItem('rotateCounterClockwiseButton'),
            new BuiltinItem('rotateClockwiseButton'),
            new BuiltinItem('downloadButton'),
        ];
        this.hotkeys = {
            off: () => { this.hotkeysEnabled = false; },
            on: () => { this.hotkeysEnabled = true; },
            isActive: () => this.hotkeysEnabled,
        };

        const rerender = () => this.render();
        for (const event of ['documentLoaded', 'documentUnloaded', 'zoomUpdated', 'fitModeUpdated', 'rotationUpdated', 'toolModeUpdated']) {
            viewer.addEventListener(event, rerender);
        }
        viewer.addEventListener('pageNumberUpdated', () => this.renderPageNav());
        this.render();
    }

    // Rendering ---------------------------------------------------------------------------------------

    isElementDisabled(dataElement) {
        return this.disabled.has(dataElement);
    }

    isElementOpen() {
        return false;
    }

    _button({ dataElement, img, label, title, disabled, className, style, onClick, pressed }) {
        const b = this.doc.createElement('button');
        b.type = 'button';
        b.className = ['pmw-btn', className].filter(Boolean).join(' ');
        if (dataElement) {
            b.dataset.element = dataElement;
        }
        if (title) {
            b.title = title;
            b.setAttribute('aria-label', title);
        }
        b.innerHTML = iconHtml(img);
        if (label) {
            const span = this.doc.createElement('span');
            span.textContent = label;
            b.append(span);
        }
        if (pressed !== undefined) {
            b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
        }
        b.disabled = !!disabled;
        if (style) {
            Object.assign(b.style, style);
        }
        b.addEventListener('click', (event) => {
            try {
                onClick?.(event);
            } catch (error) {
                console.error('[pdfmatrix-webviewer] button handler failed', error);
            }
        });
        if (dataElement && this.isElementDisabled(dataElement)) {
            b.hidden = true;
        }
        return b;
    }

    /** A built-in button, honoring `updateElement` overrides. */
    _builtinButton(dataElement, defaults) {
        const props = { ...defaults, ...(this.overrides[dataElement] || {}) };
        return this._button({ ...props, dataElement });
    }

    _toolButton(toolName, dataElement) {
        const def = TOOL_BUTTONS[toolName];
        if (!def) {
            return null;
        }
        const element = dataElement || def.dataElement;
        const active = this.interaction.toolMode === toolName;
        return this._builtinButton(element, {
            img: def.icon,
            title: this.t(def.label),
            className: active ? 'active' : '',
            pressed: active,
            onClick: () => this.setToolMode(active && toolName !== ToolNames.EDIT ? ToolNames.EDIT : toolName),
        });
    }

    _renderItem(item) {
        if (!item) {
            return null;
        }
        if (item instanceof Component) {
            item._ui = this;
            const el = item._render(this);
            if (el && this.isElementDisabled(item.dataElement)) {
                el.hidden = true;
            }
            return el;
        }
        const name = item.dataElement || item;
        if (this.isElementDisabled(name)) {
            return null;
        }
        const hasDoc = this.viewer.getPageCount() > 0;
        switch (name) {
            case 'pmw-spacer': {
                const el = this.doc.createElement('div');
                el.className = 'pmw-spacer';
                return el;
            }
            case 'default-ribbon-group':
                return this._renderRibbons();
            case 'zoomOverlayButton':
                return this._renderZoom(hasDoc);
            case 'panToolButton':
                return this._toolButton(ToolNames.PAN);
            case 'selectToolButton':
                return this._toolButton(ToolNames.EDIT);
            case 'rotateCounterClockwiseButton':
                return this._builtinButton(name, {
                    img: 'rotate-ccw', title: this.t('rotateCounterClockwise'), disabled: !hasDoc,
                    onClick: () => this.viewer.rotateCounterClockwise(this.viewer.getCurrentPage()),
                });
            case 'rotateClockwiseButton':
                return this._builtinButton(name, {
                    img: 'rotate-cw', title: this.t('rotateClockwise'), disabled: !hasDoc,
                    onClick: () => this.viewer.rotateClockwise(this.viewer.getCurrentPage()),
                });
            case 'downloadButton':
                return this._builtinButton(name, {
                    img: 'download', title: this.t('download'), disabled: !hasDoc,
                    onClick: () => this.downloadPdf({ includeAnnotations: true }),
                });
            default:
                return null;
        }
    }

    _renderRibbons() {
        const group = this.doc.createElement('div');
        group.className = 'pmw-group';
        group.dataset.element = 'default-ribbon-group';
        group.setAttribute('role', 'tablist');
        for (const ribbon of RIBBONS) {
            if (this.isElementDisabled(ribbon.dataElement)) {
                continue;
            }
            const tab = this.doc.createElement('button');
            tab.type = 'button';
            tab.className = `pmw-tab${this.activeRibbon === ribbon.dataElement ? ' active' : ''}`;
            tab.dataset.element = ribbon.dataElement;
            tab.setAttribute('role', 'tab');
            tab.setAttribute('aria-selected', this.activeRibbon === ribbon.dataElement ? 'true' : 'false');
            tab.textContent = this.t(ribbon.label);
            tab.addEventListener('click', () => this.setActiveRibbonItem(ribbon.dataElement));
            group.append(tab);
        }
        return group.children.length ? group : null;
    }

    _renderZoom(hasDoc) {
        const group = this.doc.createElement('div');
        group.className = 'pmw-group';
        group.dataset.element = 'zoomOverlayButton';
        group.append(this._builtinButton('zoomOutButton', {
            img: 'zoom-out', title: this.t('zoomOut'), disabled: !hasDoc, onClick: () => this.viewer.zoomOut(),
        }));
        const select = this.doc.createElement('select');
        select.className = 'pmw-zoom-select';
        select.setAttribute('aria-label', this.t('zoom'));
        select.disabled = !hasDoc;
        const current = this.doc.createElement('option');
        current.value = '';
        current.textContent = `${Math.round(this.viewer.getZoomLevel() * 100)}%`;
        current.hidden = true;
        select.append(current);
        for (const [value, label] of [['FitWidth', this.t('fitWidth')], ['FitPage', this.t('fitPage')],
            ...ZOOM_PRESETS.map((z) => [String(z), `${Math.round(z * 100)}%`])]) {
            const option = this.doc.createElement('option');
            option.value = value;
            option.textContent = label;
            select.append(option);
        }
        select.value = '';
        select.addEventListener('change', () => {
            const v = select.value;
            if (v === 'FitWidth' || v === 'FitPage') {
                this.setFitMode(v);
            } else if (v) {
                this.setZoomLevel(Number(v));
            }
            this.render();
        });
        group.append(select);
        group.append(this._builtinButton('zoomInButton', {
            img: 'zoom-in', title: this.t('zoomIn'), disabled: !hasDoc, onClick: () => this.viewer.zoomIn(),
        }));
        return group;
    }

    _renderToolsHeader() {
        const ribbon = RIBBONS.find((r) => r.dataElement === this.activeRibbon);
        const visible = ribbon && ribbon.tools.length
            && !this.isElementDisabled('default-ribbon-group')
            && !this.isElementDisabled(ribbon.dataElement)
            && !this.isElementDisabled('tools-header');
        this.toolsHeader.replaceChildren();
        this.toolsHeader.hidden = !visible;
        if (!visible) {
            return;
        }
        for (const tool of ribbon.tools) {
            const b = this._toolButton(tool);
            if (b) { this.toolsHeader.append(b); }
        }
        const active = this.interaction.toolMode;
        if (TOOLS[active]) {
            const divider = this.doc.createElement('div');
            divider.className = 'pmw-divider';
            this.toolsHeader.append(divider);
            const style = this.interaction.getToolStyle(active);
            const current = (style.TextColor && TOOLS[active].kind === 'freetext' ? style.TextColor : style.StrokeColor)?.toHexString?.();
            for (const hex of SWATCHES) {
                const s = this.doc.createElement('button');
                s.type = 'button';
                s.className = `pmw-swatch${current === hex ? ' active' : ''}`;
                s.style.background = hex;
                s.title = `${this.t('color')} ${hex}`;
                s.addEventListener('click', () => {
                    this.interaction.setToolColor(active, hex);
                    this.render();
                });
                this.toolsHeader.append(s);
            }
        }
    }

    renderPageNav() {
        const count = this.viewer.getPageCount();
        this.pageNav.replaceChildren();
        this.pageNav.hidden = !count || this.isElementDisabled('pageNavOverlay');
        if (!count) {
            return;
        }
        const current = this.viewer.getCurrentPage();
        const prev = this._builtinButton('previousPageButton', {
            img: 'chevron-left', title: this.t('previousPage'), disabled: current <= 1,
            onClick: () => this.viewer.setCurrentPage(current - 1),
        });
        const input = this.doc.createElement('input');
        input.type = 'text';
        input.inputMode = 'numeric';
        input.value = String(current);
        input.setAttribute('aria-label', this.t('page'));
        const go = () => {
            const n = parseInt(input.value, 10);
            if (n >= 1 && n <= count) {
                this.viewer.setCurrentPage(n);
            } else {
                input.value = String(this.viewer.getCurrentPage());
            }
        };
        input.addEventListener('change', go);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { go(); }
        });
        const total = this.doc.createElement('span');
        total.className = 'pmw-count';
        total.textContent = `/ ${count}`;
        const next = this._builtinButton('nextPageButton', {
            img: 'chevron-right', title: this.t('nextPage'), disabled: current >= count,
            onClick: () => this.viewer.setCurrentPage(current + 1),
        });
        this.pageNav.append(prev, input, total, next);
    }

    render() {
        if (this.disposed) {
            return;
        }
        this.header.replaceChildren();
        for (const item of this.headerItems) {
            const el = this._renderItem(item);
            if (el) {
                this.header.append(el);
            }
        }
        this.header.hidden = this.isElementDisabled('default-top-header') || this.isElementDisabled('header');
        this._renderToolsHeader();
        this.renderPageNav();
    }

    // Public API ---------------------------------------------------------------------------------------

    disableElements(dataElements = []) {
        for (const e of [].concat(dataElements)) {
            this.disabled.add(e);
        }
        if (this.isElementDisabled(this.activeRibbon)) {
            this.activeRibbon = 'toolbarGroup-View';
        }
        this.render();
    }

    enableElements(dataElements = []) {
        for (const e of [].concat(dataElements)) {
            this.disabled.delete(e);
        }
        this.render();
    }

    updateElement(dataElement, props = {}) {
        const custom = this._findItem(dataElement);
        if (custom) {
            Object.assign(custom.props, props);
        } else {
            this.overrides[dataElement] = { ...(this.overrides[dataElement] || {}), ...props };
        }
        this.render();
    }

    _findItem(dataElement, items = this.headerItems) {
        for (const item of items) {
            if (item instanceof Component && item.dataElement === dataElement) {
                return item;
            }
            if (item instanceof GroupedItems) {
                const found = this._findItem(dataElement, item.items);
                if (found) { return found; }
            }
        }
        return null;
    }

    setActiveRibbonItem(dataElement) {
        if (!RIBBONS.some((r) => r.dataElement === dataElement)) {
            return;
        }
        this.activeRibbon = dataElement;
        const ribbon = RIBBONS.find((r) => r.dataElement === dataElement);
        if (!ribbon.tools.includes(this.interaction.toolMode)) {
            this.interaction.setToolMode(ToolNames.EDIT);
        }
        this.render();
    }

    getActiveRibbonItem() {
        return this.activeRibbon;
    }

    getModularHeader(dataElement) {
        if (dataElement !== 'default-top-header' && dataElement !== 'tools-header') {
            return null;
        }
        const ui = this;
        return {
            dataElement,
            get items() { return dataElement === 'default-top-header' ? [...ui.headerItems] : []; },
            getItems() { return this.items; },
            setItems(items) {
                if (dataElement === 'default-top-header') {
                    ui.headerItems = [...items];
                    ui.render();
                }
            },
            setStyle() { },
            setJustifyContent() { },
            setGap() { },
        };
    }

    getModularHeaderList() {
        return [this.getModularHeader('default-top-header')];
    }

    setLanguage(language) {
        this.language = language || 'en';
        this.render();
        return Promise.resolve();
    }

    getLanguage() {
        return this.language;
    }

    setToolMode(name) {
        this.interaction.setToolMode(name);
        const ribbon = RIBBONS.find((r) => r.tools.includes(name));
        if (ribbon && !this.isElementDisabled(ribbon.dataElement)) {
            this.activeRibbon = ribbon.dataElement;
        }
        this.render();
    }

    getToolMode() {
        return { name: this.interaction.toolMode, toolName: this.interaction.toolMode };
    }

    setZoomLevel(zoom) {
        const value = typeof zoom === 'string' && zoom.trim().endsWith('%') ? parseFloat(zoom) / 100 : Number(zoom);
        this.viewer.zoomTo(value);
    }

    getZoomLevel() {
        return this.viewer.getZoomLevel();
    }

    setFitMode(mode) {
        this.viewer.setFitMode(mode);
    }

    getFitMode() {
        return this.viewer.getFitMode();
    }

    setLayoutMode(mode) {
        this.viewer.setLayoutMode(mode);
    }

    getLayoutMode() {
        return this.viewer.getLayoutMode();
    }

    setCurrentPageNumber(n) {
        this.viewer.setCurrentPage(n);
    }

    getCurrentPageNumber() {
        return this.viewer.getCurrentPage();
    }

    getPageCount() {
        return this.viewer.getPageCount();
    }

    loadDocument(src, options) {
        return this.viewer.loadDocument(src, options);
    }

    closeDocument() {
        return this.viewer.closeDocument();
    }

    /**
     * Downloads the loaded PDF as it was received. Annotations live in the viewer only (the host
     * application stores them as XFDF), so `includeAnnotations: true` cannot flatten them into the
     * file; the original document is downloaded either way.
     */
    async downloadPdf(options = {}) {
        const document = this.viewer.getDocument();
        if (!document) {
            return;
        }
        const data = await document.getFileData();
        const blob = new Blob([data], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = this.doc.createElement('a');
        a.href = url;
        a.download = options.filename || document.getFilename();
        a.style.display = 'none';
        this.doc.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
    }

    print() {
        this.downloadPdf();
    }

    // Features without an equivalent here: accepted and ignored so host code keeps running.
    setHeaderItems(callback) {
        try {
            callback?.({ push: () => { }, unshift: () => { }, getItems: () => [], update: () => { }, get: () => ({ insertBefore() { }, insertAfter() { }, delete() { } }) });
        } catch {
            // Legacy header API: nothing to apply.
        }
    }

    openElements() { }

    closeElements() { }

    toggleElement() { }

    setTheme() { }

    enableFeatures() { }

    disableFeatures() { }

    setPrintQuality() { }

    setAnnotationContentOverlayHandler() { }

    dispose() {
        this.disposed = true;
        this.app.remove();
    }
}
