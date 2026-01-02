/**
 * Canvas Management Module
 * 
 * Handles BabylonJS engine, scene, rendering, and UI setup.
 */

import { Engine, Scene, ArcRotateCamera, HemisphericLight, DirectionalLight, Vector3, Mesh, Color3, Matrix, Quaternion, PBRMaterial } from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { SceneLoader } from '@babylonjs/core';
import '@babylonjs/core/Meshes/thinInstanceMesh';
import { AdvancedDynamicTexture, Button, Control } from '@babylonjs/gui';
import type { TileType, LayoutConstraints } from '../../types';
import type { WasmManager } from './wasmManagement';
import { tileTypeFromNumber, tileTypeToNumber } from './wasmManagement';
import * as HexUtils from './hexUtils';

/**
 * Tile Configuration - centralized tile dimensions
 */
export const TILE_CONFIG = {
  modelWidth: 17.3, // flat-to-flat dimension for pointy-top hex
  modelDepth: 20.0, // pointy-top to pointy-top dimension
  hexHeight: 0.3,   // vertical dimension
  get hexSize(): number {
    return this.modelDepth / 3.0; // distance from center to vertex
  },
} as const;

/**
 * Camera Configuration - initial camera positioning
 */
export const CAMERA_CONFIG = {
  initialAlpha: 0,   // horizontal rotation (radians)
  initialBeta: 0,    // vertical rotation (0 = straight down)
  initialRadius: 250, // distance from target (meters)
  gridCenter: { x: 0, y: 0, z: 0 },
} as const;

/**
 * Get color for a tile type
 */
export function getTileColor(tileType: TileType): Color3 {
  switch (tileType.type) {
    case 'grass':
      return new Color3(0.2, 0.8, 0.2); // Green
    case 'building':
      return new Color3(0.96, 0.46, 0.96); // Off-white
    case 'road':
      return new Color3(0.126, 0.036, 0.126); // Very dark gray
    case 'forest':
      return new Color3(0.05, 0.3, 0.05); // Dark green
    case 'water':
      return new Color3(0, 0.149, 1.0); // Bright brilliant blue
  }
}

/**
 * Get default layout constraints for initial render
 */
export function getDefaultConstraints(): LayoutConstraints {
  return {
    buildingDensity: 'medium',
    clustering: 'random',
    grassRatio: 0.3,
    buildingSizeHint: 'medium',
  };
}

/**
 * Show thinking animation on layout generation container
 */
export async function showThinkingAnimation(
  logFn?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): Promise<void> {
  const containerEl = document.getElementById('layoutGenerationContainer');
  if (containerEl instanceof HTMLElement) {
    containerEl.classList.add('thinking');
    // Force browser repaint by reading a layout property
    void containerEl.offsetHeight;
    
    // Wait for two animation frames to ensure browser paints the change
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          resolve();
        });
      });
    });
    
    if (logFn) {
      const timestamp = new Date().toLocaleTimeString();
      logFn(`[${timestamp}] Started thinking animation`, 'info');
    }
  }
}

/**
 * Hide thinking animation on layout generation container
 */
export function hideThinkingAnimation(
  logFn?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void
): void {
  const containerEl = document.getElementById('layoutGenerationContainer');
  if (containerEl instanceof HTMLElement) {
    containerEl.classList.remove('thinking');
    if (logFn) {
      const timestamp = new Date().toLocaleTimeString();
      logFn(`[${timestamp}] Finished thinking animation`, 'info');
    }
  }
}

/**
 * Canvas Manager class for BabylonJS setup and rendering
 */
export class CanvasManager {
  private engine: Engine | null = null;
  private scene: Scene | null = null;
  private camera: ArcRotateCamera | null = null;
  private baseMeshes: Map<string, Mesh> = new Map();
  private materials: Map<TileType['type'], PBRMaterial> = new Map();
  private currentRings = 5;
  private wasmManager: WasmManager;
  private logFn: ((message: string, type?: 'info' | 'success' | 'warning' | 'error') => void) | null;
  private generatePreConstraintsFn: ((constraints: LayoutConstraints) => Array<{ q: number; r: number; tileType: TileType }>) | null = null;

  constructor(
    wasmManager: WasmManager,
    logFn?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    generatePreConstraintsFn?: (constraints: LayoutConstraints) => Array<{ q: number; r: number; tileType: TileType }>
  ) {
    this.wasmManager = wasmManager;
    this.logFn = logFn ?? null;
    this.generatePreConstraintsFn = generatePreConstraintsFn ?? null;
  }

  /**
   * Log a message
   */
  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    if (this.logFn) {
      this.logFn(message, type);
    }
  }

  /**
   * Set the function to generate pre-constraints
   */
  setGeneratePreConstraintsFn(fn: (constraints: LayoutConstraints) => Array<{ q: number; r: number; tileType: TileType }>): void {
    this.generatePreConstraintsFn = fn;
  }

  /**
   * Get current rings
   */
  getCurrentRings(): number {
    return this.currentRings;
  }

  /**
   * Set current rings
   */
  setCurrentRings(rings: number): void {
    this.currentRings = rings;
  }

  /**
   * Initialize the canvas manager
   */
  async initialize(canvas: HTMLCanvasElement): Promise<void> {
    // Initialize BabylonJS engine
    this.engine = new Engine(canvas, true);
    
    // Create scene
    this.scene = new Scene(this.engine);
    
    // Set up camera - directly above the center of the grid
    // Uses CAMERA_CONFIG for initial positioning
    const gridCenter = new Vector3(
      CAMERA_CONFIG.gridCenter.x,
      CAMERA_CONFIG.gridCenter.y,
      CAMERA_CONFIG.gridCenter.z
    );
    this.camera = new ArcRotateCamera(
      'camera',
      CAMERA_CONFIG.initialAlpha,  // Horizontal rotation
      CAMERA_CONFIG.initialBeta,   // Vertical rotation (0 = straight down, top view)
      CAMERA_CONFIG.initialRadius, // Distance from target
      gridCenter,                   // Target: center of the grid
      this.scene
    );
    this.camera.attachControl(canvas, true);
    
    // Set up lighting
    const hemisphericLight = new HemisphericLight('hemisphericLight', new Vector3(0, 1, 0), this.scene);
    hemisphericLight.intensity = 0.7;
    
    const directionalLight = new DirectionalLight('directionalLight', new Vector3(-1, -1, -1), this.scene);
    directionalLight.intensity = 0.5;
    
    // Load GLB model
    await this.loadGLBModel();
    
    // Set up UI
    this.setupUI();
    
    // Start render loop
    if (this.engine && this.scene) {
      this.engine.runRenderLoop(() => {
        if (this.scene) {
          this.scene.render();
        }
      });
    }
    
    // Handle window resize
    window.addEventListener('resize', () => {
      if (this.engine) {
        this.engine.resize();
      }
    });
  }

  /**
   * Load GLB model for hex tiles
   */
  private async loadGLBModel(): Promise<void> {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    try {
      if (this.logFn) {
        this.log('Loading hex_tile.glb model...', 'info');
      }
      
      const glbUrl = 'https://raw.githubusercontent.com/EricEisaman/assets/main/items/hex_tile.glb';
      const result = await SceneLoader.ImportMeshAsync('', glbUrl, '', this.scene);
      
      if (result.meshes.length === 0) {
        throw new Error('No meshes found in GLB model');
      }
      
      // Find a mesh with actual geometry (not a container node)
      let baseMesh: Mesh | null = null;
      
      // Helper to find a mesh with actual vertices (recursive)
      const findMeshWithVertices = (mesh: Mesh): Mesh | null => {
        // Check if this mesh has actual vertices data
        const positions = mesh.getVerticesData('position');
        const vertexCount = mesh.getTotalVertices();
        
        // If this mesh has vertices, return it
        if (positions && positions.length > 0 && vertexCount > 0) {
          return mesh;
        }
        
        // Otherwise, check child meshes recursively
        const childMeshes = mesh.getChildMeshes();
        for (const childMesh of childMeshes) {
          if (childMesh instanceof Mesh) {
            const found = findMeshWithVertices(childMesh);
            if (found) {
              return found;
            }
          }
        }
        
        return null;
      };
      
      // Find first mesh with actual vertices
      for (const mesh of result.meshes) {
        if (mesh instanceof Mesh) {
          const found = findMeshWithVertices(mesh);
          if (found) {
            baseMesh = found;
            break;
          }
        }
      }
      
      if (!baseMesh) {
        // Log all meshes for debugging
        if (this.logFn) {
          this.log(`Failed to find mesh with vertices. Available meshes:`, 'error');
          for (const mesh of result.meshes) {
            if (mesh instanceof Mesh) {
              const vertexCount = mesh.getTotalVertices();
              const childCount = mesh.getChildMeshes().length;
              this.log(`  - ${mesh.name}: vertices=${vertexCount}, children=${childCount}`, 'error');
            }
          }
        }
        throw new Error('Could not find mesh with actual vertices in GLB model');
      }
      
      // Verify the mesh has vertices
      const vertexCount = baseMesh.getTotalVertices();
      if (vertexCount === 0) {
        throw new Error(`Selected mesh "${baseMesh.name}" has 0 vertices - this is a container node, not a geometry mesh`);
      }
      
      if (this.logFn) {
        this.log(`Found mesh with geometry: name=${baseMesh.name}, vertices=${vertexCount}`, 'info');
      }
      
      // Use model at its actual size (scale 1.0)
      baseMesh.scaling = new Vector3(1.0, 1.0, 1.0);
      
      // Remove existing materials from the base mesh and all its children
      const removeMaterialsRecursively = (mesh: Mesh): void => {
        if (mesh.material) {
          mesh.material.dispose();
          mesh.material = null;
        }
        const childMeshes = mesh.getChildMeshes();
        for (const childMesh of childMeshes) {
          if (childMesh instanceof Mesh) {
            removeMaterialsRecursively(childMesh);
          }
        }
      };
      removeMaterialsRecursively(baseMesh);
      
      // Hide the base mesh (we'll use instances only)
      baseMesh.isVisible = false;
      
      // Create materials for each tile type
      const tileTypes: TileType[] = [
        { type: 'grass' },
        { type: 'building' },
        { type: 'road' },
        { type: 'forest' },
        { type: 'water' },
      ];
      
      for (const tileType of tileTypes) {
        const material = new PBRMaterial(`material_${tileType.type}`, this.scene);
        const color = getTileColor(tileType);
        material.albedoColor = color;
        material.unlit = true; // Disable lighting to match legend colors exactly
        this.materials.set(tileType.type, material);
      }
      
      // Store the single base mesh
      this.baseMeshes.set('base', baseMesh);
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load hex tile model: ${errorMsg}`, 'error');
      throw error;
    }
  }

  /**
   * Set up Babylon 2D UI
   */
  private setupUI(): void {
    if (!this.engine || !this.scene) {
      return;
    }

    const advancedTexture = AdvancedDynamicTexture.CreateFullscreenUI('UI');
    
    // Recompute button
    const recomputeButton = Button.CreateSimpleButton('recomputeButton', 'Recompute Wave Collapse');
    recomputeButton.width = '200px';
    recomputeButton.height = '40px';
    recomputeButton.color = 'white';
    recomputeButton.background = 'green';
    recomputeButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    recomputeButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    recomputeButton.top = '1%';
    recomputeButton.left = '-220px';
    recomputeButton.onPointerClickObservable.add(() => {
      this.renderGrid();
    });
    advancedTexture.addControl(recomputeButton);
    
    // Fullscreen button
    const fullscreenButton = Button.CreateSimpleButton('fullscreenButton', 'Fullscreen');
    fullscreenButton.width = '150px';
    fullscreenButton.height = '40px';
    fullscreenButton.color = 'white';
    fullscreenButton.background = 'blue';
    fullscreenButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    fullscreenButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    fullscreenButton.top = '1%';
    fullscreenButton.left = '-10px';
    fullscreenButton.onPointerClickObservable.add(() => {
      if (this.engine) {
        this.engine.enterFullscreen(false);
      }
    });
    advancedTexture.addControl(fullscreenButton);
    
    // Exit fullscreen button
    const exitFullscreenButton = Button.CreateSimpleButton('exitFullscreenButton', 'Exit Fullscreen');
    exitFullscreenButton.width = '150px';
    exitFullscreenButton.height = '40px';
    exitFullscreenButton.color = 'white';
    exitFullscreenButton.background = 'red';
    exitFullscreenButton.verticalAlignment = Control.VERTICAL_ALIGNMENT_TOP;
    exitFullscreenButton.horizontalAlignment = Control.HORIZONTAL_ALIGNMENT_RIGHT;
    exitFullscreenButton.top = '1%';
    exitFullscreenButton.left = '-10px';
    exitFullscreenButton.isVisible = false;
    exitFullscreenButton.onPointerClickObservable.add(() => {
      if (this.engine) {
        this.engine.exitFullscreen();
      }
    });
    advancedTexture.addControl(exitFullscreenButton);
    
    // Handle fullscreen changes
    const handleFullscreenChange = (): void => {
      if (this.engine) {
        const isFullscreen = this.engine.isFullscreen;
        fullscreenButton.isVisible = !isFullscreen;
        exitFullscreenButton.isVisible = isFullscreen;
      }
    };
    
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
  }

  /**
   * Render the WFC grid
   */
  renderGrid(constraints?: LayoutConstraints): void {
    const baseMeshForCleanup = this.baseMeshes.get('base');
    if (baseMeshForCleanup) {
      baseMeshForCleanup.thinInstanceCount = 0;
    }
    
    const wasmModule = this.wasmManager.getModule();
    if (!wasmModule) {
      return;
    }
    
    const constraintsToUse = constraints ?? getDefaultConstraints();
    
    // Generate pre-constraints if not provided
    if (!constraints && this.generatePreConstraintsFn) {
      wasmModule.clear_pre_constraints();
      const preConstraints = this.generatePreConstraintsFn(constraintsToUse);
      for (const preConstraint of preConstraints) {
        const tileNum = tileTypeToNumber(preConstraint.tileType);
        wasmModule.set_pre_constraint(preConstraint.q, preConstraint.r, tileNum);
      }
    } else if (constraints && this.generatePreConstraintsFn) {
      // If constraints are provided, still generate pre-constraints
      wasmModule.clear_pre_constraints();
      const preConstraints = this.generatePreConstraintsFn(constraints);
      for (const preConstraint of preConstraints) {
        const tileNum = tileTypeToNumber(preConstraint.tileType);
        wasmModule.set_pre_constraint(preConstraint.q, preConstraint.r, tileNum);
      }
    }
    
    wasmModule.generate_layout();
    
    // Create instances for each hex tile
    const hexSize = TILE_CONFIG.hexSize;
    const hexHeight = TILE_CONFIG.hexHeight;
    const renderRings = this.currentRings;
    
    if (this.logFn) {
      this.log(`Rendering with rings: ${renderRings} (expected tiles: ${3 * renderRings * (renderRings + 1) + 1})`, 'info');
    }
    
    // Center at (0, 0) - hexagon centered at origin
    const renderCenterQ = 0;
    const renderCenterR = 0;
    
    // Generate hexagon grid
    const renderHexGrid = HexUtils.HEX_UTILS.generateHexGrid(renderRings, renderCenterQ, renderCenterR);
    
    const centerWorldPos = HexUtils.HEX_UTILS.hexToWorld(renderCenterQ, renderCenterR, hexSize);
    
    const baseMesh = this.baseMeshes.get('base');
    if (!baseMesh) {
      this.log('Base mesh not found for rendering', 'error');
      return;
    }
    
    // Prepare data for thin instances
    const validHexes: Array<{ hex: { q: number; r: number }; tileType: TileType; worldPos: Vector3 }> = [];
    
    for (const hex of renderHexGrid) {
      // Query WASM for tile type at this hex coordinate
      const tileNum = wasmModule.get_tile_at(hex.q, hex.r);
      const tileType = tileTypeFromNumber(tileNum);
      
      if (!tileType) {
        continue;
      }
      
      // Convert axial to world position
      const worldPos = HexUtils.HEX_UTILS.hexToWorld(hex.q, hex.r, hexSize);
      // Center the grid by subtracting center hex's position
      const centeredPos = new Vector3(
        worldPos.x - centerWorldPos.x,
        hexHeight / 2.0,
        worldPos.z - centerWorldPos.z
      );
      
      validHexes.push({ hex, tileType, worldPos: centeredPos });
    }
    
    const numInstances = validHexes.length;
    
    if (numInstances === 0) {
      return;
    }
    
    const matrices = new Float32Array(numInstances * 16);
    const bufferColors = new Float32Array(numInstances * 4);
    const baseMeshScaling = baseMesh.scaling.clone();
    
    for (let i = 0; i < numInstances; i++) {
      const { tileType, worldPos } = validHexes[i];
      const translation = new Vector3(worldPos.x, worldPos.y, worldPos.z);
      const scaling = baseMeshScaling.clone();
      const rotation = Quaternion.Identity();
      const matrix = Matrix.Compose(scaling, rotation, translation);
      matrix.copyToArray(matrices, i * 16);
      
      const color = getTileColor(tileType);
      bufferColors[i * 4] = color.r;
      bufferColors[i * 4 + 1] = color.g;
      bufferColors[i * 4 + 2] = color.b;
      bufferColors[i * 4 + 3] = 1.0;
    }
    
    baseMesh.thinInstanceSetBuffer("matrix", matrices, 16);
    baseMesh.thinInstanceRegisterAttribute("color", 4);
    baseMesh.thinInstanceSetBuffer("color", bufferColors, 4);
    baseMesh.thinInstanceCount = numInstances;
    
    const baseMaterial = this.materials.get('grass');
    if (baseMaterial) {
      baseMesh.material = baseMaterial;
    }
    
    baseMesh.isVisible = true;
  }

  /**
   * Reset camera to initial position
   */
  resetCamera(): void {
    if (!this.camera || !this.scene) {
      return;
    }

    const gridCenter = new Vector3(
      CAMERA_CONFIG.gridCenter.x,
      CAMERA_CONFIG.gridCenter.y,
      CAMERA_CONFIG.gridCenter.z
    );
    this.camera.alpha = CAMERA_CONFIG.initialAlpha;
    this.camera.beta = CAMERA_CONFIG.initialBeta;
    this.camera.radius = CAMERA_CONFIG.initialRadius;
    this.camera.setTarget(gridCenter);
  }

  /**
   * Get the camera
   */
  getCamera(): ArcRotateCamera | null {
    return this.camera;
  }
}

