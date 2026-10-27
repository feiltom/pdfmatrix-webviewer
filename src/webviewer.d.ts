// Type declarations for the supported subset of the @pdftron/webviewer API.

export interface WebViewerOptions {
    initialDoc?: string | string[];
    licenseKey?: string | null;
    path?: string;
    css?: string;
    preloadWorker?: string;
    disableLogs?: boolean;
    annotationUser?: string;
    enableAnnotations?: boolean;
    language?: string;
    filename?: string;
    customHeaders?: Record<string, string>;
    withCredentials?: boolean;
    password?: string;
    [key: string]: unknown;
}

export interface LoadDocumentOptions {
    filename?: string;
    extension?: string;
    documentId?: string;
    cacheKey?: string;
    customHeaders?: Record<string, string>;
    withCredentials?: boolean;
    password?: string;
    onError?: (error: Error & { serverResponse: { status: number; statusText: string } }) => void;
    [key: string]: unknown;
}

export declare class Color {
    constructor(r?: number | string, g?: number, b?: number, a?: number);
    R: number;
    G: number;
    B: number;
    A: number;
    toHexString(): string;
    toString(): string;
}

export interface PointLike { x: number; y: number }

export declare class Annotation {
    Id: string;
    PageNumber: number;
    X: number;
    Y: number;
    Width: number;
    Height: number;
    Author: string | null;
    Subject: string;
    Color: Color;
    StrokeColor: Color;
    FillColor: Color;
    TextColor: Color;
    StrokeThickness: number;
    Opacity: number;
    Locked: boolean;
    ReadOnly: boolean;
    LockedContents: boolean;
    Hidden: boolean;
    Printable: boolean;
    Listable: boolean;
    IsHoverable: boolean;
    NoView: boolean;
    DateCreated: Date;
    DateModified: Date;
    readonly elementName: string;
    getX(): number;
    getY(): number;
    getWidth(): number;
    getHeight(): number;
    getContents(): string;
    setContents(text: string): void;
    getCustomData(key: string): unknown;
    setCustomData(key: string, value: unknown): void;
}

export declare class RectangleAnnotation extends Annotation { constructor(init?: Partial<Annotation>) }
export declare class EllipseAnnotation extends Annotation { constructor(init?: Partial<Annotation>) }
export declare class PolygonAnnotation extends Annotation {
    constructor(init?: Partial<Annotation>);
    addPathPoint(x: number, y: number): void;
    getPath(): PointLike[];
    setPathPoint(index: number, x: number, y: number): void;
    popPath(): void;
}
export declare class PolylineAnnotation extends PolygonAnnotation { }
export declare class LineAnnotation extends Annotation {
    constructor(init?: Partial<Annotation>);
    StartStyle: string;
    EndStyle: string;
    getStartPoint(): PointLike;
    getEndPoint(): PointLike;
    setStartPoint(x: number, y: number): void;
    setEndPoint(x: number, y: number): void;
}
export declare class ArrowAnnotation extends LineAnnotation { }
export declare class FreeHandAnnotation extends Annotation {
    constructor(init?: Partial<Annotation>);
    getPaths(): PointLike[][];
    setPath(points: PointLike[], index?: number): void;
}
export declare class FreeTextAnnotation extends Annotation {
    constructor(init?: Partial<Annotation>);
    FontSize: string;
    TextAlign: string;
}
export declare class StickyAnnotation extends Annotation { Icon: string }
export declare class StampAnnotation extends Annotation { Icon: string; ImageData: string | null }
export interface QuadLike { x1: number; y1: number; x2: number; y2: number; x3: number; y3: number; x4: number; y4: number }
export declare class TextMarkupAnnotation extends Annotation { Quads: QuadLike[] }
export declare class TextHighlightAnnotation extends TextMarkupAnnotation { constructor(init?: Partial<TextMarkupAnnotation>) }
export declare class TextUnderlineAnnotation extends TextMarkupAnnotation { constructor(init?: Partial<TextMarkupAnnotation>) }
export declare class TextStrikeoutAnnotation extends TextMarkupAnnotation { constructor(init?: Partial<TextMarkupAnnotation>) }
export declare class TextSquigglyAnnotation extends TextMarkupAnnotation { constructor(init?: Partial<TextMarkupAnnotation>) }

type Listener = (...args: any[]) => void;

export interface Emitter {
    addEventListener(name: string, listener: Listener, options?: { once?: boolean }): void;
    removeEventListener(name: string, listener?: Listener): void;
    trigger(name: string, ...args: unknown[]): void;
}

export interface LoadedDocument {
    getType(): 'pdf';
    getFilename(): string;
    getPageCount(): number;
    getPageInfo(pageNumber: number): { width: number; height: number } | null;
    getFileData(): Promise<ArrayBuffer>;
    loadPageText(pageNumber: number, callback?: (text: string) => void): Promise<string>;
    loadCanvas(options: {
        pageNumber?: number;
        multiplier?: number;
        zoom?: number;
        renderRect?: { x1: number; y1: number; x2: number; y2: number };
        drawComplete?: (canvas: HTMLCanvasElement, pageNumber: number) => void;
    }): Promise<HTMLCanvasElement>;
}

export interface DisplayMode {
    pageToWindow(point: PointLike, pageNumber: number): PointLike;
    windowToPage(point: PointLike, pageNumber: number): PointLike & { pageNumber: number };
    getSelectedPages(p1: PointLike, p2: PointLike): { first: number; last: number };
}

export interface DocumentViewer extends Emitter {
    loadDocument(src: string | Blob | ArrayBuffer | Uint8Array, options?: LoadDocumentOptions): Promise<void>;
    closeDocument(): Promise<void>;
    getDocument(): LoadedDocument | null;
    getPageCount(): number;
    getCurrentPage(): number;
    setCurrentPage(pageNumber: number, isSmoothScroll?: boolean): void;
    getZoomLevel(): number;
    zoomTo(zoom: number): void;
    getRotation(pageNumber?: number): number;
    getPageRotations(): Record<number, number>;
    setRotation(rotation: number, pageNumber?: number): void;
    rotateClockwise(pageNumber?: number): void;
    rotateCounterClockwise(pageNumber?: number): void;
    getViewerElement(): HTMLElement;
    getScrollViewElement(): HTMLElement;
    getDisplayModeManager(): { getDisplayMode(): DisplayMode };
    getAnnotationManager(): AnnotationManager;
    unmount(): Promise<void>;
}

export interface AnnotationManager extends Emitter {
    getAnnotationsList(): Annotation[];
    getAnnotationById(id: string): Annotation | null;
    addAnnotation(annotation: Annotation, options?: { source?: string }): void;
    addAnnotations(annotations: Annotation[], options?: { source?: string }): void;
    deleteAnnotation(annotation: Annotation, options?: { force?: boolean; source?: string }): void;
    deleteAnnotations(annotations: Annotation[], options?: { force?: boolean; source?: string }): void;
    redrawAnnotation(annotation: Annotation): void;
    drawAnnotationsFromList(annotations: Annotation[]): Promise<void>;
    jumpToAnnotation(annotation: Annotation, options?: { zoom?: number; verticalOffset?: string | number; horizontalOffset?: string | number; isSmoothScroll?: boolean }): void;
    importAnnotations(xfdf: string): Promise<Annotation[]>;
    exportAnnotations(options?: { annotationList?: Annotation[] }): Promise<string>;
    getSelectedAnnotations(): Annotation[];
    selectAnnotation(annotation: Annotation): void;
    deselectAllAnnotations(): void;
    getCurrentUser(): string;
    setCurrentUser(name: string): void;
}

export interface ButtonState {
    img?: string;
    title?: string;
    label?: string;
    className?: string;
    onClick?: (update: (state: string) => void, activeState: string) => void;
}

export interface WebViewerInstance {
    UI: {
        hotkeys: { off(): void; on(): void };
        disableElements(dataElements: string[]): void;
        enableElements(dataElements: string[]): void;
        updateElement(dataElement: string, props: Record<string, unknown>): void;
        setActiveRibbonItem(dataElement: string): void;
        setLanguage(language: string): Promise<void>;
        setLayoutMode(mode: string): void;
        setFitMode(mode: string): void;
        setZoomLevel(zoom: number | string): void;
        setToolMode(toolName: string): void;
        downloadPdf(options?: { includeAnnotations?: boolean; filename?: string }): Promise<void>;
        getModularHeader(dataElement: string): { items: unknown[]; setItems(items: unknown[]): void } | null;
        loadDocument(src: string | Blob | ArrayBuffer | Uint8Array, options?: LoadDocumentOptions): Promise<void>;
        dispose(): Promise<void>;
        FitMode: { FitWidth: 'FitWidth'; FitPage: 'FitPage'; Zoom: 'Zoom' };
        LayoutMode: Record<string, string>;
        Components: {
            CustomButton: new (props: { dataElement?: string; img?: string; title?: string; label?: string; onClick?: (e: Event) => void; disabled?: boolean }) => unknown;
            StatefulButton: new (props: { dataElement?: string; initialState: string; states: Record<string, ButtonState> }) => unknown;
            [name: string]: new (props: any) => unknown;
        };
        [method: string]: unknown;
    };
    Core: {
        documentViewer: DocumentViewer;
        annotationManager: AnnotationManager;
        Annotations: {
            Color: typeof Color;
            Annotation: typeof Annotation;
            RectangleAnnotation: typeof RectangleAnnotation;
            EllipseAnnotation: typeof EllipseAnnotation;
            LineAnnotation: typeof LineAnnotation;
            ArrowAnnotation: typeof ArrowAnnotation;
            PolygonAnnotation: typeof PolygonAnnotation;
            PolylineAnnotation: typeof PolylineAnnotation;
            FreeHandAnnotation: typeof FreeHandAnnotation;
            FreeTextAnnotation: typeof FreeTextAnnotation;
            StickyAnnotation: typeof StickyAnnotation;
            StampAnnotation: typeof StampAnnotation;
            TextHighlightAnnotation: typeof TextHighlightAnnotation;
            TextUnderlineAnnotation: typeof TextUnderlineAnnotation;
            TextStrikeoutAnnotation: typeof TextStrikeoutAnnotation;
            TextSquigglyAnnotation: typeof TextSquigglyAnnotation;
            [name: string]: unknown;
        };
        PageRotation: { E_0: 0; E_90: 1; E_180: 2; E_270: 3 };
        DocumentViewer: { Events: Record<string, string> };
        AnnotationManager: { Events: Record<string, string> };
        Tools: { ToolNames: Record<string, string> };
        [name: string]: unknown;
    };
}

declare function WebViewer(options: WebViewerOptions, element: HTMLElement | string): Promise<WebViewerInstance>;
declare namespace WebViewer {
    const WebComponent: typeof WebViewer;
    const Iframe: typeof WebViewer;
    const VERSION: string;
}

export default WebViewer;
