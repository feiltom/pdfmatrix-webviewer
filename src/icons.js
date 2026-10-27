/**
 * Line icons, 24×24, stroked with `currentColor`. Keys include the WebViewer icon names that host
 * applications pass to `CustomButton`/`StatefulButton` (`img: 'icon-…'`), so their buttons get a
 * sensible glyph. Unknown names fall back to a neutral dot; inline `<svg>` strings and image URLs
 * are rendered as given.
 */
const ICONS = {
    'zoom-in': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6"/>',
    'zoom-out': '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 20 20M7.5 10.5h6"/>',
    'fit-width': '<path d="M3 5v14M21 5v14M7 12h10M7 12l3-3M7 12l3 3M17 12l-3-3M17 12l-3 3"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 19h14"/>',
    'chevron-left': '<path d="M15 6l-6 6 6 6"/>',
    'chevron-right': '<path d="M9 6l6 6-6 6"/>',
    'rotate-cw': '<path d="M20 12a8 8 0 1 1-2.34-5.66M20 4v5h-5"/>',
    'rotate-ccw': '<path d="M4 12a8 8 0 1 0 2.34-5.66M4 4v5h5"/>',
    pan: '<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11M11 10.5V5a1.5 1.5 0 0 1 3 0v5.5M14 10.5V6.5a1.5 1.5 0 0 1 3 0v6.5c0 4-2.5 7-6.5 7-2.8 0-4.4-1.4-5.8-3.6L3.4 13.9a1.5 1.5 0 0 1 2.4-1.8L8 14"/>',
    select: '<path d="M5 3l14 8-6 1.5L10 19z"/>',
    highlight: '<path d="M4 20h16"/><rect x="5" y="6" width="14" height="9" rx="1" fill="currentColor" fill-opacity=".25"/><path d="M9 13l3-6 3 6M10 11h4"/>',
    underline: '<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>',
    strikeout: '<path d="M4 12h16M16 6.5C15.3 5 13.8 4 12 4c-2.5 0-4 1.4-4 3.2 0 1.4.9 2.3 2.6 2.8M8.5 17c.8 1.8 2.2 3 3.9 3 2.5 0 4.1-1.5 4.1-3.4 0-.9-.3-1.6-.9-2.1"/>',
    squiggly: '<path d="M7 4v6a5 5 0 0 0 10 0V4M4 19l2-2 2 2 2-2 2 2 2-2 2 2 2-2 2 2"/>',
    freetext: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
    sticky: '<path d="M4 5h16v11h-8l-5 4v-4H4z"/><path d="M8 9h8M8 12h5"/>',
    freehand: '<path d="M4 17c2-6 4-9 6-9 3 0-1 9 2 9 2 0 3-4 5-4 1.5 0 1.5 2 3 2"/>',
    rectangle: '<rect x="4" y="6" width="16" height="12" rx="1"/>',
    ellipse: '<ellipse cx="12" cy="12" rx="8" ry="6"/>',
    line: '<path d="M5 19L19 5"/>',
    arrow: '<path d="M5 19L19 5M11 5h8v8"/>',
    polygon: '<path d="M12 3l8 6-3 10H7L4 9z"/>',
    polyline: '<path d="M3 17l5-8 5 6 4-9 4 5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/>',
    delete: '<path d="M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6"/>',
    'new-window': '<path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    'full-screen': '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    'full-screen-exit': '<path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/>',
    'text-select': '<path d="M9 4h6M9 20h6M12 4v16"/>',
    dot: '<circle cx="12" cy="12" r="3"/>',
};

/** WebViewer icon names (as used by host applications) mapped to the glyphs above. */
const ALIASES = {
    'icon-header-zoom-in-line': 'zoom-in',
    'icon-header-zoom-out-line': 'zoom-out',
    'icon-header-download': 'download',
    'icon-download': 'download',
    'icon-chevron-left': 'chevron-left',
    'icon-chevron-right': 'chevron-right',
    'icon-header-page-manipulation-page-rotation-clockwise-line': 'rotate-cw',
    'icon-header-page-manipulation-page-rotation-counterclockwise-line': 'rotate-ccw',
    'icon-header-pan': 'pan',
    'icon-header-select-line': 'select',
    'icon-tool-highlight': 'highlight',
    'icon-tool-text-manipulation-highlight': 'highlight',
    'icon-tool-text-manipulation-underline': 'underline',
    'icon-tool-text-manipulation-strikethrough': 'strikeout',
    'icon-tool-text-manipulation-squiggly': 'squiggly',
    'icon-tool-text-free-text': 'freetext',
    'icon-tool-comment-line': 'sticky',
    'icon-tool-pen-line': 'freehand',
    'icon-tool-shape-rectangle': 'rectangle',
    'icon-tool-shape-oval': 'ellipse',
    'icon-tool-shape-line': 'line',
    'icon-tool-shape-arrow': 'arrow',
    'icon-tool-shape-polygon': 'polygon',
    'icon-tool-shape-polyline': 'polyline',
    'icon-delete-line': 'delete',
    'icon-panel-thumbnail-line': 'new-window',
    'icon-header-full-screen': 'full-screen',
    'icon-header-full-screen-exit': 'full-screen-exit',
};

const markup = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${paths}</svg>`;

/** HTML for an icon given a built-in name, a WebViewer icon name, inline SVG or an image URL. */
export const iconHtml = (img) => {
    if (!img) {
        return '';
    }
    const value = String(img).trim();
    if (value.startsWith('<svg')) {
        return value;
    }
    const known = ICONS[value] || ICONS[ALIASES[value]];
    if (known) {
        return markup(known);
    }
    if (/^(data:|https?:|\/|\.\.?\/)|\.(svg|png|jpe?g|gif|webp)(\?.*)?$/i.test(value)) {
        const safe = value.replace(/"/g, '&quot;');
        return `<img src="${safe}" alt="" />`;
    }
    return markup(ICONS.dot);
};
