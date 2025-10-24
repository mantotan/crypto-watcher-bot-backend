import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

// Redis key pattern for progress tracking
const PROGRESS_CACHE_KEY_PREFIX = 'backtest:progress:cache:'; // Individual keys with TTL

/**
 * Backtest task status enum
 * Matches Python worker output
 */
export type BacktestStatus = 'pending' | 'running' | 'completed' | 'failed';

/**
 * Backtest progress step enum
 * Structured progress steps from Python worker
 *
 * Note: Python worker may send enhanced formats with additional details:
 * - "executing_trades:_X/Y" (includes current/total trade count)
 * - "completed!" (includes exclamation mark)
 * The validation logic extracts the base step for validation while preserving
 * the original format for frontend display.
 */
export type ProgressStep =
  | 'initializing'          // 0-5%: Setting up backtest
  | 'fetching_data'         // 5-10%: Loading OHLCV data
  | 'detecting_patterns'    // 10-55%: Scanning for patterns
  | 'sorting_patterns'      // 55-60%: Ordering patterns by date
  | 'executing_trades'      // 60-90%: Running backtest simulation
  | 'generating_results'    // 90-95%: Creating result summary
  | 'finalizing'            // 95-99%: Final cleanup
  | 'completed'             // 100%: Done
  | 'failed'                // 0%: Error occurred
  | string;                 // Allow enhanced formats from Python worker

/**
 * Progress data structure from Python backtest worker
 * Matches the exact format sent via Redis pub/sub
 */
export interface ProgressData {
  backtest_id: string;                // Backtest task ID (renamed from task_id to match Python)
  user_id: string;                    // User who owns this backtest task
  status: BacktestStatus;             // Current status (structured enum)
  progress_percentage: number;        // Progress 0-100 (decimal: 45.5)
  current_step: ProgressStep;         // Current processing step (structured enum)
  timestamp: string;                  // ISO 8601 UTC timestamp
  metadata: Record<string, any>;      // Context-specific metadata
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;

  async onModuleInit() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6333', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const database = parseInt(process.env.REDIS_DB || '0', 10);

    const config = {
      socket: {
        host,
        port,
        reconnectStrategy: (retries: number) => {
          // Exponential backoff: 100ms, 200ms, 400ms, 800ms, max 3000ms
          const delay = Math.min(100 * Math.pow(2, retries), 3000);
          this.logger.warn(`Reconnecting to Redis in ${delay}ms (attempt ${retries + 1})`);
          return delay;
        },
      },
      password: password && password.length > 0 ? password : undefined,
      database,
    };

    try {
      // Create main client for commands
      this.client = createClient(config);

      this.client.on('error', (err) => {
        this.logger.error('Redis Client Error:', err);
      });

      this.client.on('connect', () => {
        this.logger.log(`Redis client connected at ${host}:${port}`);
      });

      this.client.on('reconnecting', () => {
        this.logger.warn('Redis client reconnecting...');
      });

      this.client.on('ready', () => {
        this.logger.log('Redis client ready');
      });

      await this.client.connect();

      // Create separate subscriber client for pub/sub
      // Redis requires a dedicated connection for pub/sub
      this.subscriber = createClient(config);

      this.subscriber.on('error', (err) => {
        this.logger.error('Redis Subscriber Error:', err);
      });

      this.subscriber.on('connect', () => {
        this.logger.log(`Redis subscriber connected at ${host}:${port}`);
      });

      this.subscriber.on('reconnecting', () => {
        this.logger.warn('Redis subscriber reconnecting...');
      });

      this.subscriber.on('ready', () => {
        this.logger.log('Redis subscriber ready');
      });

      await this.subscriber.connect();
    } catch (error) {
      this.logger.error(`Failed to connect to Redis at ${host}:${port}`, error);
      throw error;
    }
  }

  async onModuleDestroy() {
    try {
      if (this.client && this.client.isOpen) {
        await this.client.quit();
        this.logger.log('Redis client disconnected');
      }
    } catch (error) {
      this.logger.error('Error disconnecting Redis client:', error);
    }

    try {
      if (this.subscriber && this.subscriber.isOpen) {
        await this.subscriber.quit();
        this.logger.log('Redis subscriber disconnected');
      }
    } catch (error) {
      this.logger.error('Error disconnecting Redis subscriber:', error);
    }
  }

  getClient(): RedisClientType {
    if (!this.client) {
      throw new Error('Redis client not initialized');
    }
    return this.client;
  }

  getSubscriber(): RedisClientType {
    if (!this.subscriber) {
      throw new Error('Redis subscriber not initialized');
    }
    return this.subscriber;
  }

  /**
   * Check if Redis clients are connected and ready
   */
  isConnected(): boolean {
    return !!(this.client?.isOpen && this.subscriber?.isOpen);
  }

  /**
   * Get cached progress for a specific task from Redis
   * Uses individual key with TTL instead of hash
   */
  async getTaskProgress(taskId: string): Promise<ProgressData | null> {
    try {
      const cacheKey = `${PROGRESS_CACHE_KEY_PREFIX}${taskId}`;
      const cached = await this.client.get(cacheKey);

      if (!cached || typeof cached !== 'string') {
        return null;
      }

      return JSON.parse(cached) as ProgressData;
    } catch (error) {
      this.logger.error(`Failed to get task progress for ${taskId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get all active tasks progress from Redis
   * Uses SCAN pattern matching with pipeline for efficient batch GET
   */
  async getAllTasksProgress(): Promise<Record<string, ProgressData>> {
    try {
      const result: Record<string, ProgressData> = {};
      const pattern = `${PROGRESS_CACHE_KEY_PREFIX}*`;
      const allKeys: string[] = [];
      let cursor = '0';
      let iterations = 0;
      const MAX_SCAN_ITERATIONS = 1000; // Safety limit to prevent infinite loops

      // Step 1: Collect all keys using SCAN
      do {
        const scanResult = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = String(scanResult.cursor);
        allKeys.push(...scanResult.keys);
        iterations++;

        // Safety check: prevent infinite loops
        if (iterations >= MAX_SCAN_ITERATIONS) {
          this.logger.error(
            `SCAN exceeded max iterations (${MAX_SCAN_ITERATIONS}). Found ${allKeys.length} keys. This may indicate a Redis issue.`
          );
          break;
        }
      } while (cursor !== '0');

      if (allKeys.length === 0) {
        return result;
      }

      this.logger.debug(`Found ${allKeys.length} progress keys in ${iterations} SCAN iteration(s)`);

      // Step 2: Batch GET using pipeline for better performance
      const pipeline = this.client.multi();
      for (const key of allKeys) {
        pipeline.get(key);
      }

      const responses = await pipeline.exec();

      // Safety check: ensure responses array matches keys array
      if (!Array.isArray(responses) || responses.length !== allKeys.length) {
        this.logger.error(
          `Pipeline response length mismatch: expected ${allKeys.length}, got ${responses?.length || 0}`
        );
        return result;
      }

      // Step 3: Parse results
      let skippedCount = 0;
      for (let i = 0; i < allKeys.length; i++) {
        const data = responses[i];

        // Skip null responses (key expired or deleted between SCAN and GET)
        if (data === null || data === undefined) {
          skippedCount++;
          continue;
        }

        if (typeof data === 'string') {
          try {
            // Extract backtest_id from key (remove prefix)
            const backtestId = allKeys[i].replace(PROGRESS_CACHE_KEY_PREFIX, '');
            const progressData = JSON.parse(data) as ProgressData;

            // Validate critical fields to ensure data integrity
            if (progressData.backtest_id && progressData.user_id && progressData.status) {
              result[backtestId] = progressData;
            } else {
              this.logger.warn(
                `Progress data missing required fields for key ${allKeys[i]}. Skipping.`
              );
              skippedCount++;
            }
          } catch (parseError) {
            this.logger.error(`Failed to parse progress for key ${allKeys[i]}: ${parseError.message}`);
            skippedCount++;
          }
        } else {
          this.logger.warn(
            `Unexpected response type for key ${allKeys[i]}: ${typeof data}. Expected string or null.`
          );
          skippedCount++;
        }
      }

      if (skippedCount > 0) {
        this.logger.debug(
          `Skipped ${skippedCount} invalid/expired keys out of ${allKeys.length} total`
        );
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get all tasks progress: ${error.message}`);
      return {};
    }
  }

  /**
   * Get all active tasks progress for a specific user
   * Filters by user_id from progress data
   */
  async getUserTasksProgress(userId: string): Promise<Record<string, ProgressData>> {
    try {
      const allProgress = await this.getAllTasksProgress();
      const result: Record<string, ProgressData> = {};

      // Filter by user_id
      for (const [backtestId, progress] of Object.entries(allProgress)) {
        if (progress.user_id === userId) {
          result[backtestId] = progress;
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get user tasks progress for ${userId}: ${error.message}`);
      return {};
    }
  }

  /**
   * Clear progress cache for a specific task
   * Note: Manual cleanup is rarely needed since Redis TTL handles it automatically
   * - Completed/failed backtests expire after 1 hour
   * - Running backtests expire after 24 hours
   */
  async clearTaskProgress(taskId: string): Promise<void> {
    try {
      const cacheKey = `${PROGRESS_CACHE_KEY_PREFIX}${taskId}`;
      await this.client.del(cacheKey);
      this.logger.debug(`Cleared progress cache for task ${taskId}`);
    } catch (error) {
      this.logger.error(`Failed to clear task progress for ${taskId}: ${error.message}`);
    }
  }
}
