import initWasm from '../../pkg/wasm_preprocess/wasm_preprocess.js';
import type { WasmModulePreprocess } from '../types';
import { validateWasmModule } from '../wasm/loader';

interface PreprocessStats {
  original_size: number;
  target_size: number;
  scale_factor: number;
}

let wasmModule: WasmModulePreprocess | null = null;

function validatePreprocessModule(exports: unknown): WasmModulePreprocess | null {
  if (!validateWasmModule(exports)) {
    return null;
  }
  
  if (
    typeof exports !== 'object' ||
    exports === null ||
    !('preprocess_image' in exports) ||
    !('preprocess_text' in exports) ||
    !('normalize_text' in exports) ||
    !('get_preprocess_stats' in exports) ||
    !('memory' in exports) ||
    !(exports.memory instanceof WebAssembly.Memory)
  ) {
    return null;
  }
  
  const memory = exports.memory;
  const preprocessImage = exports.preprocess_image;
  const preprocessText = exports.preprocess_text;
  const normalizeText = exports.normalize_text;
  const getPreprocessStats = exports.get_preprocess_stats;
  
  if (
    typeof preprocessImage === 'function' &&
    typeof preprocessText === 'function' &&
    typeof normalizeText === 'function' &&
    typeof getPreprocessStats === 'function'
  ) {
    // TypeScript can't infer the exact function signatures, so we need to validate by calling
    // But we can construct the object with proper typing by checking the structure matches
    const module: WasmModulePreprocess = {
      memory,
      preprocess_image: (imageData: Uint8Array, sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number): Uint8Array => {
        if (typeof preprocessImage !== 'function') {
          throw new Error('preprocess_image is not a function');
        }
        const result = preprocessImage(imageData, sourceWidth, sourceHeight, targetWidth, targetHeight);
        if (!(result instanceof Uint8Array)) {
          throw new Error('preprocess_image did not return Uint8Array');
        }
        return result;
      },
      preprocess_text: (text: string): Uint32Array => {
        if (typeof preprocessText !== 'function') {
          throw new Error('preprocess_text is not a function');
        }
        const result = preprocessText(text);
        if (!(result instanceof Uint32Array)) {
          throw new Error('preprocess_text did not return Uint32Array');
        }
        return result;
      },
      normalize_text: (text: string): string => {
        if (typeof normalizeText !== 'function') {
          throw new Error('normalize_text is not a function');
        }
        const result = normalizeText(text);
        if (typeof result !== 'string') {
          throw new Error('normalize_text did not return string');
        }
        return result;
      },
      get_preprocess_stats: (originalSize: number, targetSize: number): PreprocessStats => {
        if (typeof getPreprocessStats !== 'function') {
          throw new Error('get_preprocess_stats is not a function');
        }
        const result = getPreprocessStats(originalSize, targetSize);
        if (
          typeof result !== 'object' ||
          result === null ||
          !('original_size' in result) ||
          !('target_size' in result) ||
          !('scale_factor' in result) ||
          typeof result.original_size !== 'number' ||
          typeof result.target_size !== 'number' ||
          typeof result.scale_factor !== 'number'
        ) {
          throw new Error('get_preprocess_stats did not return PreprocessStats');
        }
        return {
          original_size: result.original_size,
          target_size: result.target_size,
          scale_factor: result.scale_factor,
        };
      },
    };
    return module;
  }
  
  return null;
}

export const init = async (): Promise<void> => {
  try {
    const initResult = await initWasm();
    const validated = validatePreprocessModule(initResult);
    
    if (!validated) {
      throw new Error('WASM module does not have expected exports');
    }
    
    wasmModule = validated;
    setupUI();
  } catch (error) {
    const errorDiv = document.getElementById('error');
    if (errorDiv) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      errorDiv.textContent = `Failed to load WASM module: ${message}`;
    }
  }
};

function setupUI(): void {
  const imageInputEl = document.getElementById('imageInput');
  const textInputEl = document.getElementById('textInput');
  const processImageBtn = document.getElementById('processImageBtn');
  const processTextBtn = document.getElementById('processTextBtn');
  const imageOutputEl = document.getElementById('imageOutput');
  const textOutputEl = document.getElementById('textOutput');
  const statsOutputEl = document.getElementById('statsOutput');

  if (
    !imageInputEl ||
    !textInputEl ||
    !processImageBtn ||
    !processTextBtn ||
    !imageOutputEl ||
    !textOutputEl ||
    !statsOutputEl ||
    !(imageInputEl instanceof HTMLInputElement) ||
    !(textInputEl instanceof HTMLTextAreaElement) ||
    !(imageOutputEl instanceof HTMLCanvasElement) ||
    !(textOutputEl instanceof HTMLPreElement) ||
    !(statsOutputEl instanceof HTMLDivElement)
  ) {
    throw new Error('Required UI elements not found');
  }

  const imageInput = imageInputEl;
  const textInput = textInputEl;
  const imageOutput = imageOutputEl;
  const textOutput = textOutputEl;
  const statsOutput = statsOutputEl;

  processImageBtn.addEventListener('click', () => {
    if (!imageInput.files || imageInput.files.length === 0) {
      alert('Please select an image file');
      return;
    }
    processImage(imageInput.files[0], imageOutput, statsOutput);
  });

  processTextBtn.addEventListener('click', () => {
    const text = textInput.value;
    if (!text.trim()) {
      alert('Please enter some text');
      return;
    }
    processText(text, textOutput);
  });
}

async function processImage(file: File, canvas: HTMLCanvasElement, statsDiv: HTMLDivElement): Promise<void> {
  const module = wasmModule;
  if (!module) {
    throw new Error('WASM module not initialized');
  }

  const img = new Image();
  const url = URL.createObjectURL(file);
  
  img.onload = () => {
    URL.revokeObjectURL(url);
    
    // Create a temporary canvas to get image data
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    if (!tempCtx) {
      throw new Error('Failed to get 2d context');
    }
    tempCtx.drawImage(img, 0, 0);
    const imageData = tempCtx.getImageData(0, 0, img.width, img.height);
    
    // Target size for preprocessing (e.g., 224x224 for vision models)
    const targetWidth = 224;
    const targetHeight = 224;
    
    // Preprocess image
    const processedData = module.preprocess_image(
      new Uint8Array(imageData.data),
      img.width,
      img.height,
      targetWidth,
      targetHeight
    );
    
    // Display processed image
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get canvas context');
    }
    const processedImageData = new ImageData(
      new Uint8ClampedArray(processedData),
      targetWidth,
      targetHeight
    );
    ctx.putImageData(processedImageData, 0, 0);
    
    // Display stats
    const stats = module.get_preprocess_stats(img.width, targetWidth);
    statsDiv.innerHTML = `
      <h3>Preprocessing Stats</h3>
      <p>Original: ${stats.original_size}x${stats.original_size}</p>
      <p>Target: ${stats.target_size}x${stats.target_size}</p>
      <p>Scale Factor: ${stats.scale_factor.toFixed(2)}</p>
    `;
  };
  
  img.onerror = () => {
    URL.revokeObjectURL(url);
    alert('Failed to load image');
  };
  
  img.src = url;
}

function processText(text: string, output: HTMLPreElement): void {
  const module = wasmModule;
  if (!module) {
    throw new Error('WASM module not initialized');
  }
  
  // Normalize text
  const normalized = module.normalize_text(text);
  
  // Preprocess text (tokenize)
  const tokens = module.preprocess_text(normalized);
  
  // Display results
  output.textContent = `Original: ${text}\n\nNormalized: ${normalized}\n\nTokens (${tokens.length}): [${Array.from(tokens).slice(0, 20).join(', ')}${tokens.length > 20 ? '...' : ''}]`;
}

