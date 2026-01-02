/**
 * Babylon-Chunks Route Handler
 * 
 * This endpoint demonstrates the Wave Function Collapse (WFC) algorithm
 * visualized in 3D using BabylonJS. It generates a hexagonal grid of 3D tiles
 * using mesh instancing for optimal performance.
 * 
 * **Key Features:**
 * - WFC algorithm implemented in Rust WASM
 * - 5 different 3D tile types
 * - GLB model loading for hex tiles (see TILE_CONFIG for dimensions, pointy-top orientation)
 * - Mesh instancing for performance
 * - Babylon 2D UI for controls
 * - Fullscreen support
 */

import type { LayoutConstraints } from '../types';
import { WasmLoadError, WasmInitError } from '../wasm/types';
import { WasmManager } from './babylon-chunks/wasmManagement';
import { PatternCacheManager } from './babylon-chunks/dbManagement';
import { LlmManager } from './babylon-chunks/llmManagement';
import { CanvasManager } from './babylon-chunks/canvasManagement';
import { generateLayoutFromText, constraintsToPreConstraints } from './babylon-chunks/layoutGeneration';

/**
 * Initialize the babylon-chunks route
 */
export const init = async (): Promise<void> => {
  const errorEl = document.getElementById('error');
  const canvasEl = document.getElementById('renderCanvas');
  const systemLogsContentEl = document.getElementById('systemLogsContent');
  
  if (!canvasEl) {
    throw new Error('renderCanvas element not found');
  }
  
  if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('renderCanvas element is not an HTMLCanvasElement');
  }
  
  const canvas = canvasEl;
  
  // Prevent wheel events from scrolling the page when over canvas
  // CSS overscroll-behavior doesn't work for wheel events, need JavaScript
  canvas.addEventListener('wheel', (event) => {
    // Only prevent if the event is actually on the canvas
    if (event.target === canvas) {
      event.preventDefault();
    }
  }, { passive: false });
  
  // Setup logging
  let addLogEntry: ((message: string, type?: 'info' | 'success' | 'warning' | 'error') => void) | null = null;
  if (systemLogsContentEl) {
    addLogEntry = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void => {
      const timestamp = new Date().toLocaleTimeString();
      const logEntry = document.createElement('div');
      logEntry.className = `log-entry ${type}`;
      logEntry.textContent = `[${timestamp}] ${message}`;
      systemLogsContentEl.appendChild(logEntry);
      systemLogsContentEl.scrollTop = systemLogsContentEl.scrollHeight;
    };
  }

  // Initialize modules with dependency injection
  const wasmManager = new WasmManager();
  const llmManager = new LlmManager(addLogEntry ?? undefined);
  const patternCache = new PatternCacheManager(
    addLogEntry ?? undefined,
    (text: string) => llmManager.generateEmbedding(text)
  );
  const canvasManager = new CanvasManager(wasmManager, addLogEntry ?? undefined);

  // Set up pre-constraints generation function for canvas manager
  canvasManager.setGeneratePreConstraintsFn((constraints: LayoutConstraints) => {
    const wasmModule = wasmManager.getModule();
    if (!wasmModule) {
      return [];
    }
    return constraintsToPreConstraints(
      constraints,
      wasmModule,
      canvasManager.getCurrentRings(),
      (rings) => canvasManager.setCurrentRings(rings),
      addLogEntry ?? undefined
    );
  });

  // Initialize pattern cache in background (non-blocking)
  void patternCache.initializeCommonPatterns().catch((error) => {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    if (addLogEntry) {
      addLogEntry(`Pattern cache initialization failed: ${errorMsg}`, 'warning');
    }
  });
  
  // Initialize WASM module
  try {
    await wasmManager.initialize();
    
    // Log WASM version for debugging and cache verification
    const wasmModule = wasmManager.getModule();
    if (wasmModule && addLogEntry) {
      const wasmVersion = wasmModule.get_wasm_version();
      addLogEntry(`WASM module version: ${wasmVersion}`, 'info');
    }
  } catch (error) {
    if (errorEl) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      if (error instanceof WasmLoadError) {
        errorEl.textContent = `Failed to load WASM module: ${errorMsg}`;
      } else if (error instanceof WasmInitError) {
        errorEl.textContent = `WASM module initialization failed: ${errorMsg}`;
      } else if (error instanceof Error) {
        errorEl.textContent = `Error: ${errorMsg}`;
        if (error.stack) {
          errorEl.textContent += `\n\nStack: ${error.stack}`;
        }
        if ('cause' in error && error.cause) {
          const causeMsg = error.cause instanceof Error 
            ? error.cause.message 
            : typeof error.cause === 'string' 
              ? error.cause 
              : JSON.stringify(error.cause);
          errorEl.textContent += `\n\nCause: ${causeMsg}`;
        }
      } else {
        errorEl.textContent = 'Unknown error loading WASM module';
      }
    }
    throw error;
  }
  
  // Initialize canvas manager
  await canvasManager.initialize(canvas);
  
  // Initial render
  canvasManager.renderGrid();
  
  // Text input and generate button (HTML elements)
  const promptInputEl = document.getElementById('layoutPromptInput');
  const generateFromTextBtn = document.getElementById('generateFromTextBtn');
  const modelStatusEl = document.getElementById('modelStatus');

  if (generateFromTextBtn && promptInputEl) {
    generateFromTextBtn.addEventListener('click', () => {
      const prompt = promptInputEl instanceof HTMLInputElement ? promptInputEl.value.trim() : '';
      if (prompt) {
        generateLayoutFromText(
          prompt,
          wasmManager,
          llmManager,
          patternCache,
          canvasManager,
          (constraints?: LayoutConstraints) => canvasManager.renderGrid(constraints),
          errorEl,
          modelStatusEl,
          addLogEntry ?? undefined
        ).catch((error) => {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          if (errorEl) {
            errorEl.textContent = `Error: ${errorMsg}`;
          }
        });
      }
    });
  }

  // Rings dropdown handler
  const ringsSelectEl = document.getElementById('ringsSelect');
  if (ringsSelectEl && ringsSelectEl instanceof HTMLSelectElement) {
    // Set initial value to currentRings (default 5)
    ringsSelectEl.value = canvasManager.getCurrentRings().toString();
    
    ringsSelectEl.addEventListener('change', () => {
      const selectedRings = Number.parseInt(ringsSelectEl.value, 10);
      if (!Number.isNaN(selectedRings) && selectedRings >= 0 && selectedRings <= 50) {
        // Update rings in canvas manager
        canvasManager.setCurrentRings(selectedRings);
        
        // Reset camera to initial position and rotation from config
        canvasManager.resetCamera();
        
        // Clear all state
        const wasmModule = wasmManager.getModule();
        if (wasmModule) {
          // Clear WASM grid
          wasmModule.clear_layout();
          // Clear pre-constraints
          wasmModule.clear_pre_constraints();
        }
        
        // Re-render with new rings
        canvasManager.renderGrid();
      }
    });
  }
};
