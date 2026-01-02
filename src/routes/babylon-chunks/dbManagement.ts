/**
 * Database Management Module
 * 
 * Handles IndexedDB pattern cache operations.
 */

import type { LayoutConstraints } from '../../types';
import type { ParameterSetPattern } from '../../parameter-set-embedding-prompts';
import { PARAMETER_SET_PATTERNS } from '../../parameter-set-embedding-prompts';

/**
 * Cached pattern with embedding and constraints
 * Constraints are partial - patterns only specify semantically relevant constraints
 * Defaults are applied separately when blending
 */
export interface CachedPattern {
  pattern: string;
  embedding: Float32Array;
  constraints: Partial<LayoutConstraints>;
}

/**
 * IndexedDB database name for pattern cache
 */
const PATTERN_CACHE_DB_NAME = 'babylon-chunks-pattern-cache';
const PATTERN_CACHE_STORE_NAME = 'patterns';
const PATTERN_CACHE_VERSION = 1;

/**
 * Stored pattern format in IndexedDB (embedding as number[] instead of Float32Array)
 */
interface StoredPattern {
  pattern: string;
  embedding: number[];
  constraints: unknown;
}

/**
 * Type predicate to validate CachedPattern structure from IndexedDB
 * Validates the stored format (embedding as number[]) and narrows unknown to the stored shape
 */
function isCachedPatternStored(data: unknown): data is StoredPattern {
  if (typeof data !== 'object' || data === null) {
    return false;
  }
  
  // Check for required properties using 'in' operator
  if (!('pattern' in data) || !('embedding' in data) || !('constraints' in data)) {
    return false;
  }
  
  // Use Object.getOwnPropertyDescriptor for safe property access
  const patternDesc = Object.getOwnPropertyDescriptor(data, 'pattern');
  const embeddingDesc = Object.getOwnPropertyDescriptor(data, 'embedding');
  const constraintsDesc = Object.getOwnPropertyDescriptor(data, 'constraints');
  
  if (!patternDesc || !embeddingDesc || !constraintsDesc || !('value' in patternDesc) || !('value' in embeddingDesc) || !('value' in constraintsDesc)) {
    return false;
  }
  
  const patternValue: unknown = patternDesc.value;
  const embeddingValue: unknown = embeddingDesc.value;
  const constraintsValue: unknown = constraintsDesc.value;
  
  // Exhaustive validation of required properties
  return (
    typeof patternValue === 'string' &&
    Array.isArray(embeddingValue) &&
    embeddingValue.every((n): n is number => typeof n === 'number' && !Number.isNaN(n) && Number.isFinite(n)) &&
    typeof constraintsValue === 'object' &&
    constraintsValue !== null
  );
}

/**
 * Generic helper to get typed results from IndexedDB with validator
 * Uses type predicate to safely narrow unknown to T
 * Uses safeGetAll to avoid unsafe access to request.result
 */
function getTypedAll<T>(
  store: IDBObjectStore,
  validator: (raw: unknown) => raw is T
): Promise<Array<T>> {
  return safeGetAll(store).then((rawResults) => {
    const results: Array<T> = [];
    
    // Validate each result using the type predicate
    for (const raw of rawResults) {
      if (validator(raw)) {
        results.push(raw);
      }
    }
    
    return results;
  });
}

/**
 * Helper to safely get all results from IndexedDB store
 * Returns unknown[] to avoid unsafe access - narrow in consumer
 */
function safeGetAll(store: IDBObjectStore): Promise<unknown[]> {
  return new Promise<unknown[]>((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => {
      const result = req.result;
      resolve(Array.isArray(result) ? result : []);
    };
    req.onerror = () => {
      if (req.error) {
        reject(req.error);
      } else {
        reject(new Error('Failed to get all items from IndexedDB'));
      }
    };
  });
}

/**
 * Pattern Cache Manager class for IndexedDB operations
 */
export class PatternCacheManager {
  private logFn: ((message: string, type?: 'info' | 'success' | 'warning' | 'error') => void) | null;
  private generateEmbeddingFn: ((text: string) => Promise<Float32Array | null>) | null;

  constructor(
    logFn?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void,
    generateEmbeddingFn?: (text: string) => Promise<Float32Array | null>
  ) {
    this.logFn = logFn ?? null;
    this.generateEmbeddingFn = generateEmbeddingFn ?? null;
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
   * Initialize IndexedDB for pattern cache
   */
  private async initPatternCacheDB(): Promise<IDBDatabase> {
    return new Promise<IDBDatabase>((resolve, reject) => {
      if (!('indexedDB' in window)) {
        reject(new Error('IndexedDB not available'));
        return;
      }

      const request = indexedDB.open(PATTERN_CACHE_DB_NAME, PATTERN_CACHE_VERSION);

      request.onerror = () => {
        reject(new Error('Failed to open IndexedDB'));
      };

      request.onsuccess = () => {
        const result = request.result;
        // Narrow result type - IDBOpenDBRequest.result is IDBDatabase on success
        if (result instanceof IDBDatabase) {
          resolve(result);
        } else {
          reject(new Error('IndexedDB request result is not a database'));
        }
      };

      request.onupgradeneeded = (event) => {
        const target = event.target;
        if (!(target instanceof IDBOpenDBRequest)) {
          throw new Error('Event target is not IDBOpenDBRequest');
        }
        const result = target.result;
        if (result instanceof IDBDatabase) {
          const db = result;
          if (!db.objectStoreNames.contains(PATTERN_CACHE_STORE_NAME)) {
            const store = db.createObjectStore(PATTERN_CACHE_STORE_NAME, { keyPath: 'pattern' });
            store.createIndex('pattern', 'pattern', { unique: true });
          }
        }
      };
    });
  }

  /**
   * Store pattern in IndexedDB cache
   */
  async cachePattern(pattern: string, embedding: Float32Array, constraints: Partial<LayoutConstraints>): Promise<void> {
    try {
      const db = await this.initPatternCacheDB();
      const transaction = db.transaction([PATTERN_CACHE_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(PATTERN_CACHE_STORE_NAME);

      // Convert Float32Array to Array for IndexedDB storage
      const embeddingArray = Array.from(embedding);

      // Store as plain object with array instead of Float32Array
      const storedPattern: StoredPattern = {
        pattern,
        embedding: embeddingArray,
        constraints,
      };

      await new Promise<void>((resolve, reject) => {
        const request = store.put(storedPattern);
        request.onsuccess = () => {
          resolve();
        };
        request.onerror = () => {
          reject(new Error('Failed to store pattern in cache'));
        };
      });

      db.close();

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to cache pattern: ${errorMsg}`, 'warning');
    }
  }

  /**
   * Load all cached patterns from IndexedDB
   */
  async loadCachedPatterns(): Promise<Array<CachedPattern>> {
    try {
      const db = await this.initPatternCacheDB();
      const transaction = db.transaction([PATTERN_CACHE_STORE_NAME], 'readonly');
      const store = transaction.objectStore(PATTERN_CACHE_STORE_NAME);

      // Use generic helper with type predicate validator
      // Type predicate validates and narrows unknown to the stored shape
      const storedResults = await getTypedAll(store, isCachedPatternStored);
      const cachedPatterns: Array<CachedPattern> = [];

      for (const stored of storedResults) {
        // Type predicate already validated structure - stored is properly narrowed
        // Convert embedding array to Float32Array
        const embedding = new Float32Array(stored.embedding.length);
        for (let i = 0; i < stored.embedding.length; i++) {
          const val = stored.embedding[i];
          // Type predicate already validated these are numbers, but double-check for safety
          if (typeof val === 'number' && !Number.isNaN(val) && Number.isFinite(val)) {
            embedding[i] = val;
          }
        }

        // Narrow constraints type properly with union type checks
        const constraints: Partial<LayoutConstraints> = {};
        const constraintsObj = stored.constraints;
        
        // Helper function to safely get property value without type assertions
        const getPropertyValue = (obj: unknown, key: string): unknown => {
          if (typeof obj !== 'object' || obj === null) {
            return undefined;
          }
          const descriptor = Object.getOwnPropertyDescriptor(obj, key);
          if (descriptor && 'value' in descriptor) {
            return descriptor.value;
          }
          return undefined;
        };
        
        // Validate and extract each constraint property with proper type narrowing
        if (typeof constraintsObj === 'object' && constraintsObj !== null) {
          // Extract and validate each property individually using helper function
          const buildingDensityValue = getPropertyValue(constraintsObj, 'buildingDensity');
          if (buildingDensityValue === 'sparse' || buildingDensityValue === 'medium' || buildingDensityValue === 'dense') {
            constraints.buildingDensity = buildingDensityValue;
          }
          
          const clusteringValue = getPropertyValue(constraintsObj, 'clustering');
          if (clusteringValue === 'clustered' || clusteringValue === 'distributed' || clusteringValue === 'random') {
            constraints.clustering = clusteringValue;
          }
          
          const grassRatioValue = getPropertyValue(constraintsObj, 'grassRatio');
          if (typeof grassRatioValue === 'number') {
            constraints.grassRatio = grassRatioValue;
          }
          
          const buildingSizeHintValue = getPropertyValue(constraintsObj, 'buildingSizeHint');
          if (buildingSizeHintValue === 'small' || buildingSizeHintValue === 'medium' || buildingSizeHintValue === 'large') {
            constraints.buildingSizeHint = buildingSizeHintValue;
          }
          
          const ringsValue = getPropertyValue(constraintsObj, 'rings');
          if (typeof ringsValue === 'number') {
            constraints.rings = ringsValue;
          }
          // Legacy support: also check for maxLayer
          const maxLayerValue = getPropertyValue(constraintsObj, 'maxLayer');
          if (typeof maxLayerValue === 'number' && constraints.rings === undefined) {
            constraints.rings = maxLayerValue;
          }
          
          const primaryTileTypeValue = getPropertyValue(constraintsObj, 'primaryTileType');
          if (primaryTileTypeValue === 'grass' || primaryTileTypeValue === 'building' || primaryTileTypeValue === 'road' || primaryTileTypeValue === 'forest' || primaryTileTypeValue === 'water') {
            constraints.primaryTileType = primaryTileTypeValue;
          }
        }

        cachedPatterns.push({
          pattern: stored.pattern,
          embedding,
          constraints,
        });
      }

      db.close();
      return cachedPatterns;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load cached patterns: ${errorMsg}`, 'warning');
      return [];
    }
  }

  /**
   * Initialize parameter set patterns in cache if not already present
   * Uses the 27 rich sensory pattern descriptions from parameter-set-embedding-prompts.ts
   * Validates that existing patterns have valid embeddings, regenerates if needed
   */
  async initializeCommonPatterns(): Promise<void> {
    if (!this.generateEmbeddingFn) {
      this.log('Embedding function not available - cannot generate embeddings', 'error');
      return;
    }

    try {
      const commonPatterns: Array<ParameterSetPattern> = PARAMETER_SET_PATTERNS;
      const existingPatterns = await this.loadCachedPatterns();
      const existingPatternMap = new Map<string, CachedPattern>();
      for (const existing of existingPatterns) {
        existingPatternMap.set(existing.pattern, existing);
      }

      for (const commonPattern of commonPatterns) {
        const existing = existingPatternMap.get(commonPattern.pattern);
        const needsRegeneration = !existing || !existing.embedding || existing.embedding.length === 0;

        if (needsRegeneration) {
          const embedding = await this.generateEmbeddingFn(commonPattern.pattern);
          if (embedding && embedding.length > 0) {
            await this.cachePattern(commonPattern.pattern, embedding, commonPattern.constraints);
          } else {
            this.log(`Failed to generate embedding for "${commonPattern.pattern}"`, 'error');
          }
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to initialize common patterns: ${errorMsg}`, 'error');
    }
  }
}

