import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

// Redis keys for progress tracking
const PROGRESS_HASH_KEY = 'backtest:progress:latest';

export interface ProgressData {
  task_id: string;
  status: string;
  progress_percentage: number;
  current_step: string;
  timestamp: string;
  metadata: Record<string, any>;
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
   * Get cached progress for a specific task from Redis hash
   */
  async getTaskProgress(taskId: string): Promise<ProgressData | null> {
    try {
      const cached = await this.client.hGet(PROGRESS_HASH_KEY, taskId);

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
   * Get all active tasks progress from Redis hash
   */
  async getAllTasksProgress(): Promise<Record<string, ProgressData>> {
    try {
      const allProgress = await this.client.hGetAll(PROGRESS_HASH_KEY);
      const result: Record<string, ProgressData> = {};

      for (const [taskId, progressJson] of Object.entries(allProgress)) {
        try {
          result[taskId] = JSON.parse(progressJson) as ProgressData;
        } catch (parseError) {
          this.logger.error(`Failed to parse progress for task ${taskId}: ${parseError.message}`);
        }
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get all tasks progress: ${error.message}`);
      return {};
    }
  }
}
