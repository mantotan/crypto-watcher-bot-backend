import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { randomUUID } from 'crypto';

// Redis Queue Keys (matching Python backtest_service/config.py)
const QUEUE_HIGH_PRIORITY = 'backtest:queue:high';
const QUEUE_NORMAL_PRIORITY = 'backtest:queue:normal';
const QUEUE_LOW_PRIORITY = 'backtest:queue:low';
const JOB_PREFIX = 'backtest:job:';
const STATUS_PREFIX = 'backtest:status:';
const JOB_TTL = 7 * 24 * 3600; // 7 days in seconds

export type QueuePriority = 'high' | 'normal' | 'low';

export interface JobData {
  job_id: string;
  backtest_id: string;
  submitted_at: string;
  priority: QueuePriority;
}

export interface StatusData {
  status: string;
  progress: number;
  message: string;
  updated_at: string;
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(private redisService: RedisService) {}

  /**
   * Submit a backtest task to Redis queue
   */
  async submitBacktestTask(
    backtestId: string,
    priority: QueuePriority = 'normal',
  ): Promise<string> {
    const client = this.redisService.getClient();
    const jobId = randomUUID();
    const queueKey = this.getQueueKey(priority);

    try {
      // 1. Store job data
      const jobData: JobData = {
        job_id: jobId,
        backtest_id: backtestId,
        submitted_at: new Date().toISOString(),
        priority,
      };

      const jobKey = `${JOB_PREFIX}${jobId}`;
      await client.setEx(jobKey, JOB_TTL, JSON.stringify(jobData));
      this.logger.log(`Job data stored at: ${jobKey}`);

      // 2. Push to queue
      await client.lPush(queueKey, jobId);
      this.logger.log(`Job ${jobId} pushed to queue: ${queueKey}`);

      // 3. Set initial status
      const statusData: StatusData = {
        status: 'pending',
        progress: 0,
        message: 'Job queued',
        updated_at: new Date().toISOString(),
      };

      const statusKey = `${STATUS_PREFIX}${backtestId}`;
      await client.setEx(statusKey, JOB_TTL, JSON.stringify(statusData));
      this.logger.log(`Initial status set for backtest: ${backtestId}`);

      return jobId;
    } catch (error) {
      this.logger.error(`Failed to submit job to queue: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get backtest status from Redis
   */
  async getBacktestStatus(backtestId: string): Promise<StatusData | null> {
    const client = this.redisService.getClient();
    const statusKey = `${STATUS_PREFIX}${backtestId}`;

    try {
      const data = await client.get(statusKey);

      // Type guard: ensure data is a string before parsing
      if (!data || typeof data !== 'string') {
        return null;
      }

      return JSON.parse(data) as StatusData;
    } catch (error) {
      this.logger.error(`Failed to get status for backtest ${backtestId}: ${error.message}`);
      return null;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats() {
    const client = this.redisService.getClient();

    try {
      const [highCount, normalCount, lowCount] = await Promise.all([
        client.lLen(QUEUE_HIGH_PRIORITY),
        client.lLen(QUEUE_NORMAL_PRIORITY),
        client.lLen(QUEUE_LOW_PRIORITY),
      ]);

      return {
        high: highCount,
        normal: normalCount,
        low: lowCount,
        total: highCount + normalCount + lowCount,
      };
    } catch (error) {
      this.logger.error(`Failed to get queue stats: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get queue key based on priority
   */
  private getQueueKey(priority: QueuePriority): string {
    const mapping: Record<QueuePriority, string> = {
      high: QUEUE_HIGH_PRIORITY,
      normal: QUEUE_NORMAL_PRIORITY,
      low: QUEUE_LOW_PRIORITY,
    };
    return mapping[priority] || QUEUE_NORMAL_PRIORITY;
  }
}
