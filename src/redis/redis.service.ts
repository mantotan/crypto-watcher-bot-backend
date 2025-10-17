import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { createClient, RedisClientType } from 'redis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClientType;

  async onModuleInit() {
    const host = process.env.REDIS_HOST || 'localhost';
    const port = parseInt(process.env.REDIS_PORT || '6333', 10);
    const password = process.env.REDIS_PASSWORD || undefined;
    const database = parseInt(process.env.REDIS_DB || '0', 10);

    this.client = createClient({
      socket: {
        host,
        port,
      },
      password: password && password.length > 0 ? password : undefined,
      database,
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis Client Error:', err);
    });

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    await this.client.connect();
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.disconnect();
      this.logger.log('Disconnected from Redis');
    }
  }

  getClient(): RedisClientType {
    return this.client;
  }
}
