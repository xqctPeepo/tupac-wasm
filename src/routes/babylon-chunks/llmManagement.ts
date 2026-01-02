/**
 * LLM Management Module
 * 
 * Handles Web Worker management, embedding model, and Qwen text generation.
 */

import type { CachedPattern } from './dbManagement';

/**
 * Worker message types using discriminated unions
 */
export type LoadEmbeddingMessage = {
  id: string;
  type: 'load-embedding';
};

export type LoadTextGenMessage = {
  id: string;
  type: 'load-textgen';
};

export type GenerateEmbeddingMessage = {
  id: string;
  type: 'generate-embedding';
  text: string;
};

export type GenerateLayoutMessage = {
  id: string;
  type: 'generate-layout';
  prompt: string;
};

export type LoadedResponse = {
  id: string;
  type: 'loaded';
};

export type EmbeddingResultResponse = {
  id: string;
  type: 'embedding-result';
  embedding: number[];
};

export type LayoutResultResponse = {
  id: string;
  type: 'layout-result';
  response: string;
};

export type ErrorResponse = {
  id: string;
  type: 'error';
  error: string;
};

export type WorkerResponse = LoadedResponse | EmbeddingResultResponse | LayoutResultResponse | ErrorResponse;

/**
 * Calculate cosine similarity between two embeddings
 * COSINE SIMILARITY = (A · B) / (||A|| * ||B||)
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

/**
 * LLM Manager class for Web Worker and LLM operations
 */
export class LlmManager {
  private worker: Worker | null = null;
  private isModelLoading = false;
  private isModelLoaded = false;
  private isEmbeddingModelLoading = false;
  private isEmbeddingModelLoaded = false;
  private logFn: ((message: string, type?: 'info' | 'success' | 'warning' | 'error') => void) | null;

  constructor(logFn?: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void) {
    this.logFn = logFn ?? null;
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
   * Load embedding model for semantic pattern matching in Web Worker
   */
  async loadEmbeddingModel(): Promise<void> {
    if (this.isEmbeddingModelLoaded && this.worker) {
      return;
    }

    if (this.isEmbeddingModelLoading) {
      return;
    }

    this.isEmbeddingModelLoading = true;

    try {
      if (!this.worker) {
        this.worker = new Worker(
          new URL('../babylon-chunks.worker.ts', import.meta.url),
          { type: 'module' }
        );
      }

      const worker = this.worker;

      await new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID();

        const handler = (event: MessageEvent<WorkerResponse>): void => {
          if (event.data.id !== id) {
            return;
          }

          worker.removeEventListener('message', handler);

          if (event.data.type === 'loaded') {
            resolve();
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        };

        worker.addEventListener('message', handler);
        const message: LoadEmbeddingMessage = { id, type: 'load-embedding' };
        worker.postMessage(message);
      });

      this.isEmbeddingModelLoaded = true;
      this.isEmbeddingModelLoading = false;
    } catch (error) {
      this.isEmbeddingModelLoading = false;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to load embedding model: ${errorMsg}`, 'warning');
    }
  }

  /**
   * Load Qwen model for text-to-layout generation in Web Worker
   */
  async loadQwenModel(onProgress?: (progress: number) => void): Promise<void> {
    if (this.isModelLoaded && this.worker) {
      return;
    }

    if (this.isModelLoading) {
      return;
    }

    this.isModelLoading = true;

    try {
      if (onProgress) {
        onProgress(0.1);
      }

      // Create worker if it doesn't exist
      if (!this.worker) {
        this.worker = new Worker(
          new URL('../babylon-chunks.worker.ts', import.meta.url),
          { type: 'module' }
        );
      }

      const worker = this.worker;

      // Wait for worker to load text generation model
      await new Promise<void>((resolve, reject) => {
        const id = crypto.randomUUID();

        const handler = (event: MessageEvent<WorkerResponse>): void => {
          if (event.data.id !== id) {
            return;
          }

          worker.removeEventListener('message', handler);

          if (event.data.type === 'loaded') {
            resolve();
          } else if (event.data.type === 'error') {
            reject(new Error(event.data.error));
          }
        };

        worker.addEventListener('message', handler);
        const message: LoadTextGenMessage = { id, type: 'load-textgen' };
        worker.postMessage(message);
      });

      if (onProgress) {
        onProgress(1.0);
      }

      this.isModelLoaded = true;
      this.isModelLoading = false;
    } catch (error) {
      this.isModelLoading = false;
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to load Qwen model: ${errorMsg}`);
    }
  }

  /**
   * Generate embedding for text using the embedding model in Web Worker
   */
  async generateEmbedding(text: string): Promise<Float32Array | null> {
    if (!this.worker) {
      await this.loadEmbeddingModel();
      if (!this.worker) {
        return null;
      }
    }

    try {
      const worker = this.worker;

      return new Promise<Float32Array | null>((resolve) => {
        const id = crypto.randomUUID();

        const handler = (event: MessageEvent<WorkerResponse>): void => {
          if (event.data.id !== id) {
            return;
          }

          worker.removeEventListener('message', handler);

          if (event.data.type === 'embedding-result') {
            resolve(new Float32Array(event.data.embedding));
          } else if (event.data.type === 'error') {
            this.log(`Failed to generate embedding: ${event.data.error}`, 'warning');
            resolve(null);
          }
        };

        worker.addEventListener('message', handler);
        const message: GenerateEmbeddingMessage = { id, type: 'generate-embedding', text };
        worker.postMessage(message);
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.log(`Failed to generate embedding: ${errorMsg}`, 'warning');
      return null;
    }
  }

  /**
   * Generate layout description from text prompt using Qwen in Web Worker
   * Supports both JSON output and function calling
   */
  async generateLayoutDescription(prompt: string): Promise<string> {
    if (!this.worker) {
      throw new Error('Qwen model not loaded');
    }

    const worker = this.worker;

    return new Promise((resolve, reject) => {
      const id = crypto.randomUUID();

      const handler = (event: MessageEvent<WorkerResponse>): void => {
        if (event.data.id !== id) {
          return;
        }

        worker.removeEventListener('message', handler);

        if (event.data.type === 'layout-result') {
          resolve(event.data.response);
        } else if (event.data.type === 'error') {
          reject(new Error(event.data.error));
        }
      };

      worker.addEventListener('message', handler);
      const message: GenerateLayoutMessage = { id, type: 'generate-layout', prompt };
      worker.postMessage(message);
    });
  }

  /**
   * Find the best matching parameter set pattern using cosine similarity
   * Returns the single best match (highest similarity) from the cached patterns
   */
  async findBestMatchingPattern(
    userPrompt: string,
    cachedPatterns: Array<CachedPattern>
  ): Promise<{ pattern: CachedPattern; similarity: number } | null> {
    const userEmbedding = await this.generateEmbedding(userPrompt);
    if (!userEmbedding) {
      this.log('Failed to generate user prompt embedding', 'warning');
      return null;
    }

    let bestMatch: { pattern: CachedPattern; similarity: number } | null = null;
    let bestSimilarity = -1;

    for (const cached of cachedPatterns) {
      const similarity = cosineSimilarity(userEmbedding, cached.embedding);
      if (similarity > bestSimilarity) {
        bestSimilarity = similarity;
        bestMatch = { pattern: cached, similarity };
      }
    }

    if (bestMatch) {
      this.log(`Best match: similarity ${bestSimilarity.toFixed(3)}`, 'info');
      return bestMatch;
    }

    return null;
  }
}

