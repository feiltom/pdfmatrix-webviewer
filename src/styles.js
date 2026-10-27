/**
 * Styles of the viewer, scoped by its shadow root. The `.textLayer` rules follow pdf.js
 * (web/pdf_viewer.css, Apache-2.0) so selectable text lines up with the canvas.
 */
export const STYLES = `
:host {
    --pmw-bg: #e9ebee;
    --pmw-surface: #ffffff;
    --pmw-border: #d9dce1;
    --pmw-text: #1f2328;
    --pmw-muted: #5f6670;
    --pmw-accent: #1677ff;
    --pmw-accent-soft: #e6f0ff;
    --pmw-hover: #f0f2f5;
    display: block;
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    font-size: 13px;
    color: var(--pmw-text);
}

* { box-sizing: border-box; }

.pmw-app {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--pmw-bg);
}

.pmw-header, .pmw-tools-header {
    display: flex;
    align-items: center;
    gap: 2px;
    min-height: 44px;
    padding: 4px 8px;
    background: var(--pmw-surface);
    border-bottom: 1px solid var(--pmw-border);
    flex: none;
    overflow-x: auto;
    scrollbar-width: none;
}

.pmw-tools-header { min-height: 40px; justify-content: center; }

.pmw-header[hidden], .pmw-tools-header[hidden], [data-element][hidden] { display: none !important; }

.pmw-spacer { flex: 1 1 auto; }

.pmw-divider { width: 1px; align-self: stretch; margin: 6px 6px; background: var(--pmw-border); flex: none; }

.pmw-group { display: flex; align-items: center; gap: 2px; flex: none; }

.pmw-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-width: 32px;
    height: 32px;
    padding: 0 6px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--pmw-text);
    font: inherit;
    cursor: pointer;
    flex: none;
}

.pmw-btn:hover { background: var(--pmw-hover); }
.pmw-btn.active, .pmw-btn[aria-pressed="true"] { background: var(--pmw-accent-soft); color: var(--pmw-accent); }
.pmw-btn:disabled { opacity: .4; cursor: default; background: transparent; }
.pmw-btn:focus-visible, .pmw-tab:focus-visible, .pmw-swatch:focus-visible { outline: 2px solid var(--pmw-accent); outline-offset: 1px; }

.pmw-btn svg, .pmw-popup-button svg {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.6;
    stroke-linecap: round;
    stroke-linejoin: round;
}

.pmw-btn img { width: 20px; height: 20px; }

.pmw-tab {
    height: 32px;
    padding: 0 12px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--pmw-muted);
    font: inherit;
    font-weight: 500;
    cursor: pointer;
}

.pmw-tab:hover { background: var(--pmw-hover); color: var(--pmw-text); }
.pmw-tab.active { color: var(--pmw-accent); background: var(--pmw-accent-soft); }

.pmw-zoom-select {
    height: 28px;
    min-width: 72px;
    border: 1px solid var(--pmw-border);
    border-radius: 4px;
    background: var(--pmw-surface);
    color: var(--pmw-text);
    font: inherit;
    padding: 0 4px;
}

.pmw-swatch {
    width: 20px;
    height: 20px;
    margin: 0 2px;
    padding: 0;
    border: 1px solid rgba(0, 0, 0, .25);
    border-radius: 50%;
    cursor: pointer;
    flex: none;
}

.pmw-swatch.active { box-shadow: 0 0 0 2px var(--pmw-surface), 0 0 0 4px var(--pmw-accent); }

.pmw-body { position: relative; flex: 1 1 auto; min-height: 0; }

.pmw-scroll {
    position: absolute;
    inset: 0;
    overflow: auto;
    outline: none;
}

.pmw-pages {
    position: relative;
    margin: 0 auto;
}

.pmw-page {
    --scale-round-x: 1px;
    --scale-round-y: 1px;
    --user-unit: 1;
    position: relative;
    margin-left: auto;
    margin-right: auto;
    background: #fff;
    box-shadow: 0 1px 3px rgba(0, 0, 0, .18);
    overflow: hidden;
}

.pmw-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }

.pmw-annot-layer {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
}

.pmw-highlight-layer { mix-blend-mode: multiply; }

.pmw-hit { pointer-events: all; cursor: move; }

.pmw-freetext {
    width: 100%;
    height: 100%;
    overflow: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    font-family: Helvetica, Arial, sans-serif;
}

.pmw-creating .textLayer, .pmw-creating .pmw-hit,
.pmw-panning .textLayer, .pmw-panning .pmw-hit { pointer-events: none; }
.pmw-creating .pmw-page { cursor: crosshair; }
.pmw-panning .pmw-page { cursor: grab; }

.is-ocr { -webkit-user-select: none; user-select: none; }
.is-ocr .textLayer, .is-ocr .pmw-hit { pointer-events: none; }
.is-ocr .pmw-page { cursor: crosshair; }

.ui-selectable-helper {
    position: absolute;
    z-index: 30;
    pointer-events: none;
    border: 1px dashed var(--pmw-accent);
    background: rgba(22, 119, 255, .08);
}

.pmw-selection-layer { position: absolute; inset: 0; pointer-events: none; z-index: 20; }

.pmw-selection {
    position: absolute;
    border: 1px solid var(--pmw-accent);
    pointer-events: none;
}

.pmw-handle {
    position: absolute;
    width: 10px;
    height: 10px;
    margin: -5px 0 0 -5px;
    border: 1px solid var(--pmw-accent);
    border-radius: 2px;
    background: #fff;
    pointer-events: all;
    cursor: nwse-resize;
}

.pmw-handle[data-handle="ne"], .pmw-handle[data-handle="sw"] { cursor: nesw-resize; }

.pmw-annot-popup {
    position: absolute;
    z-index: 25;
    max-width: 280px;
    padding: 6px;
    border: 1px solid var(--pmw-border);
    border-radius: 6px;
    background: var(--pmw-surface);
    box-shadow: 0 4px 14px rgba(0, 0, 0, .15);
    pointer-events: all;
}

.pmw-popup-row { display: flex; align-items: center; gap: 2px; }

.pmw-popup-note {
    max-height: 120px;
    overflow: auto;
    margin-bottom: 6px;
    white-space: pre-wrap;
    word-wrap: break-word;
}

.pmw-popup-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    margin-left: 4px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--pmw-text);
    cursor: pointer;
}

.pmw-popup-button:hover { background: var(--pmw-hover); }

.pmw-editor { position: absolute; z-index: 26; }

.pmw-editor textarea {
    display: block;
    resize: both;
    font-family: Helvetica, Arial, sans-serif;
    line-height: 1.15;
    border: 1px dashed var(--pmw-accent);
    background: rgba(255, 255, 255, .9);
    outline: none;
    padding: 2px;
}

.pmw-note-editor {
    width: 240px;
    padding: 8px;
    margin-left: 6px;
    border: 1px solid var(--pmw-border);
    border-radius: 6px;
    background: var(--pmw-surface);
    box-shadow: 0 4px 14px rgba(0, 0, 0, .15);
}

.pmw-note-editor textarea { width: 100%; min-height: 80px; font-size: 13px; border-style: solid; border-color: var(--pmw-border); }

.pmw-editor-actions { display: flex; justify-content: flex-end; gap: 6px; margin-top: 6px; }

.pmw-editor-actions button {
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--pmw-border);
    border-radius: 4px;
    background: var(--pmw-surface);
    font: inherit;
    cursor: pointer;
}

.pmw-editor-actions button:last-child { background: var(--pmw-accent); border-color: var(--pmw-accent); color: #fff; }

.pmw-page-nav {
    position: absolute;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 3px 6px;
    border: 1px solid var(--pmw-border);
    border-radius: 6px;
    background: var(--pmw-surface);
    box-shadow: 0 2px 8px rgba(0, 0, 0, .12);
    z-index: 40;
    font-variant-numeric: tabular-nums;
}

.pmw-page-nav input {
    width: 44px;
    height: 26px;
    border: 1px solid var(--pmw-border);
    border-radius: 4px;
    text-align: center;
    font: inherit;
}

.pmw-page-nav .pmw-btn { min-width: 28px; height: 28px; }

.pmw-page-nav .pmw-count { color: var(--pmw-muted); padding: 0 4px; }

/* pdf.js text layer */
.textLayer {
    position: absolute;
    text-align: initial;
    inset: 0;
    overflow: clip;
    opacity: 1;
    line-height: 1;
    -webkit-text-size-adjust: none;
    text-size-adjust: none;
    forced-color-adjust: none;
    transform-origin: 0 0;
    caret-color: CanvasText;
    z-index: 0;
    --min-font-size: 1;
    --text-scale-factor: calc(var(--total-scale-factor) * var(--min-font-size));
    --min-font-size-inv: calc(1 / var(--min-font-size));
}

.textLayer :is(span, br) {
    color: transparent;
    position: absolute;
    white-space: pre;
    cursor: text;
    transform-origin: 0% 0%;
    -webkit-user-select: text;
    user-select: text;
}

.textLayer > :not(.markedContent), .textLayer .markedContent span:not(.markedContent) {
    z-index: 1;
    --font-height: 0;
    font-size: calc(var(--text-scale-factor) * var(--font-height));
    --scale-x: 1;
    --rotate: 0deg;
    transform: rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv));
}

.textLayer .markedContent { display: contents; }
.textLayer span[role="img"] { -webkit-user-select: none; user-select: none; cursor: default; }
.textLayer ::selection { background: rgba(0, 0, 255, .25); color: transparent; }
.textLayer br::selection { background: transparent; }
.textLayer .endOfContent { display: block; position: absolute; inset: 100% 0 0; z-index: 0; cursor: default; user-select: none; }
.textLayer.selecting .endOfContent { top: 0; }

[data-main-rotation="90"] { transform: rotate(90deg) translateY(-100%); }
[data-main-rotation="180"] { transform: rotate(180deg) translate(-100%, -100%); }
[data-main-rotation="270"] { transform: rotate(270deg) translateX(-100%); }
`;
