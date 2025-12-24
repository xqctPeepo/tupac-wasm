// Type definitions for WASM modules

// A* Pathfinding module types
export interface WasmModuleAstar {
  memory: WebAssembly.Memory;
  wasm_init(debug: number, renderIntervalMs: number, windowWidth: number, windowHeight: number): void;
  tick(elapsedTime: number): void;
  key_down(keyCode: number): void;
  key_up(keyCode: number): void;
  mouse_move(x: number, y: number): void;
}

export interface Layer {
  ctx: CanvasRenderingContext2D;
  canvas: HTMLCanvasElement;
  setSize(width: number, height: number, quality: number): void;
  clearScreen(): void;
  drawRect(px: number, py: number, sx: number, sy: number, ch: number, cs: number, cl: number, ca: number): void;
  drawCircle(px: number, py: number, r: number, ch: number, cs: number, cl: number, ca: number): void;
  drawText(text: string, fontSize: number, px: number, py: number): void;
}

export interface WasmAstar {
  wasmModule: WasmModuleAstar | null;
  wasmModulePath: string;
  debug: boolean;
  renderIntervalMs: number;
  layers: Map<number, Layer>;
  layerWrapperEl: HTMLElement;
}

// Preprocessing module types
export interface WasmModulePreprocess {
  memory: WebAssembly.Memory;
  preprocess_image(
    imageData: Uint8Array,
    sourceWidth: number,
    sourceHeight: number,
    targetWidth: number,
    targetHeight: number
  ): Uint8Array;
  preprocess_text(text: string): Uint32Array;
  normalize_text(text: string): string;
  get_preprocess_stats(originalSize: number, targetSize: number): PreprocessStats;
}

export interface PreprocessStats {
  original_size: number;
  target_size: number;
  scale_factor: number;
}

