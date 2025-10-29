import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger, OnModuleDestroy, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RedisService, ProgressData, BacktestStatus, ProgressStep } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) {
        return callback(null, true);
      }

      // Strip quotes from FRONTEND_URL to match main.ts CORS config
      const allowedOrigin = (process.env.FRONTEND_URL || 'http://localhost:3006')
        .replace(/^["']|["']$/g, '')
        .trim();

      if (origin === allowedOrigin) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
  },
  namespace: '/backtest-progress',
})
@Injectable()
export class BacktestProgressGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect, OnModuleDestroy
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(BacktestProgressGateway.name);
  private isSubscribed = false;
  private readonly REDIS_CHANNEL = 'backtest:progress:all'; // Exact channel for all progress updates
  private tokenExpirationChecker: NodeJS.Timeout | null = null;

  // Redis retry management
  private redisRetryCount = 0;
  private readonly MAX_REDIS_RETRIES = 12; // Stop after 60 seconds (12 × 5s)

  // Redis message handler (stored for cleanup)
  // Signature for pSubscribe listener: (message, channel)
  private messageHandler: ((message: string, channel: string) => void) | null = null;

  // Task status cache for filtering stale updates
  // Maps task_id -> { status, cachedAt timestamp }
  // Purpose: Prevent stale "running" updates after cancellation
  // Cache TTL: 30 seconds (balance between freshness and query reduction)
  private taskStatusCache = new Map<string, { status: string; cachedAt: number }>();
  private readonly CACHE_TTL_MS = 30000; // 30 seconds
  private cacheCleanupInterval: NodeJS.Timeout | null = null;

  constructor(
    private redisService: RedisService,
    private prismaService: PrismaService,
    private jwtService: JwtService,
  ) {}

  async afterInit() {
    this.logger.log('WebSocket Gateway initialized');

    // Add authentication middleware (runs before handleConnection)
    this.server.use(async (socket: Socket, next) => {
      try {
        const token = this.extractToken(socket);

        if (!token) {
          return next(new Error('Unauthorized: No token provided'));
        }

        // Verify JWT token
        const payload = await this.jwtService.verifyAsync(token);

        // Validate user exists and check security settings
        const user = await this.prismaService.user.findUnique({
          where: { id: payload.sub },
          select: {
            id: true,
            email: true,
            two_factor_enabled_at: true,
            password_changed_at: true,
          },
        });

        if (!user) {
          return next(new Error('Unauthorized: User not found'));
        }

        // SECURITY: Invalidate token if 2FA was enabled/disabled after token was issued
        const tokenTwoFactorEnabledAt = payload.two_factor_enabled_at || null;
        const userTwoFactorEnabledAt = user.two_factor_enabled_at
          ? Math.floor(user.two_factor_enabled_at.getTime() / 1000)
          : null;

        if (tokenTwoFactorEnabledAt !== userTwoFactorEnabledAt) {
          this.logger.warn(
            `WebSocket auth rejected for ${user.email}: 2FA settings changed after token issued`
          );
          return next(new Error('Unauthorized: Session expired - 2FA settings changed'));
        }

        // SECURITY: Invalidate token if password was changed after token was issued
        const tokenPasswordChangedAt = payload.password_changed_at || null;
        const userPasswordChangedAt = user.password_changed_at
          ? Math.floor(user.password_changed_at.getTime() / 1000)
          : null;

        if (tokenPasswordChangedAt !== userPasswordChangedAt && userPasswordChangedAt !== null) {
          this.logger.warn(
            `WebSocket auth rejected for ${user.email}: password changed after token issued`
          );
          return next(new Error('Unauthorized: Session expired - password changed'));
        }

        // Attach user to socket for use in handlers
        socket.data.user = {
          id: payload.sub,
          email: payload.email,
        };

        // Store token expiration for validation
        socket.data.tokenExp = payload.exp;
        socket.data.tokenIat = payload.iat;

        // Store security settings timestamps for validation in guards
        socket.data.tokenTwoFactorEnabledAt = tokenTwoFactorEnabledAt;
        socket.data.tokenPasswordChangedAt = tokenPasswordChangedAt;

        this.logger.debug(
          `WebSocket authenticated: ${payload.email} (${payload.sub}), expires: ${new Date(payload.exp * 1000).toISOString()}`
        );

        next();
      } catch (error) {
        this.logger.warn(`WebSocket authentication failed: ${error.message}`);

        if (error.name === 'TokenExpiredError') {
          return next(new Error('Unauthorized: Token expired'));
        } else if (error.name === 'JsonWebTokenError') {
          return next(new Error('Unauthorized: Invalid token'));
        }

        return next(new Error('Unauthorized: Authentication failed'));
      }
    });

    await this.subscribeToRedis();
    this.startTokenExpirationChecker();
    this.startCacheCleanup();
  }

  async onModuleDestroy() {
    this.logger.log('WebSocket Gateway shutting down...');

    // Stop token expiration checker
    if (this.tokenExpirationChecker) {
      clearInterval(this.tokenExpirationChecker);
      this.tokenExpirationChecker = null;
      this.logger.log('Token expiration checker stopped');
    }

    // Stop cache cleanup interval
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
      this.logger.log('Cache cleanup interval stopped');
    }

    // Clear cache
    this.taskStatusCache.clear();
    this.logger.log('Task status cache cleared');

    // Unsubscribe from Redis channel to prevent memory leaks
    if (this.isSubscribed) {
      try {
        const subscriber = this.redisService.getSubscriber();

        // Safety check: Only unsubscribe if client is still open
        if (subscriber && subscriber.isOpen) {
          // Unsubscribe from channel (automatically removes the listener)
          await subscriber.unsubscribe(this.REDIS_CHANNEL);
          this.logger.log(`Unsubscribed from Redis channel: ${this.REDIS_CHANNEL}`);
        } else {
          this.logger.warn('Redis subscriber already closed, skipping unsubscribe');
        }
      } catch (error) {
        this.logger.error(`Failed to unsubscribe from Redis: ${error.message}`);
      } finally {
        // Always clean up state, even if unsubscribe fails
        this.isSubscribed = false;
        this.messageHandler = null;
      }
    }

    // Close all WebSocket connections
    if (this.server) {
      this.server.disconnectSockets(true);
      this.logger.log('All WebSocket clients disconnected');
    }
  }

  /**
   * Extract JWT token from Socket.IO handshake
   *
   * Web frontend only: Extracts token from HTTP-only cookies
   * This matches the REST API authentication method for consistency.
   */
  private extractToken(client: Socket): string | null {
    // Extract JWT from HTTP-only cookie (accessToken - must match cookie.util.ts)
    const cookies = client.handshake.headers?.cookie;
    if (!cookies) {
      return null;
    }

    const match = cookies.match(/accessToken=([^;]+)/);
    return match ? match[1] : null;
  }

  /**
   * Periodically check for expired tokens and disconnect clients
   */
  private startTokenExpirationChecker() {
    // Check every minute
    this.tokenExpirationChecker = setInterval(() => {
      // Safety check: ensure server and sockets are initialized
      // Access the sockets Map (TypeScript types don't expose this correctly, so we cast)
      const socketsMap = (this.server as any)?.sockets as Map<string, Socket> | undefined;

      if (!socketsMap || !(socketsMap instanceof Map)) {
        this.logger.debug('Token expiration checker: No sockets to check');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      let disconnectedCount = 0;

      socketsMap.forEach((socket) => {
        const tokenExp = socket.data.tokenExp;
        const user = socket.data.user;

        if (tokenExp && tokenExp < now) {
          this.logger.warn(
            `Disconnecting client ${socket.id} (user: ${user?.email}) - token expired`
          );
          socket.disconnect(true);
          disconnectedCount++;
        }
      });

      if (disconnectedCount > 0) {
        this.logger.log(`Disconnected ${disconnectedCount} clients with expired tokens`);
      }
    }, 60000); // Check every 60 seconds

    this.logger.log('Token expiration checker started (checks every 60s)');
  }

  /**
   * Subscribe to Redis Pub/Sub channel for progress updates
   */
  private async subscribeToRedis() {
    if (this.isSubscribed) {
      this.logger.warn('Already subscribed to Redis channel');
      return;
    }

    try {
      if (!this.redisService.isConnected()) {
        // Check if we've exceeded retry limit
        if (this.redisRetryCount >= this.MAX_REDIS_RETRIES) {
          this.logger.error(
            `Redis subscription failed after ${this.MAX_REDIS_RETRIES} attempts. ` +
              'Progress tracking will not work until Redis is available and service is restarted.'
          );
          return;
        }

        this.redisRetryCount++;
        this.logger.warn(
          `Redis not connected, retry ${this.redisRetryCount}/${this.MAX_REDIS_RETRIES} in 5s`
        );

        // Retry after 5 seconds
        setTimeout(() => this.subscribeToRedis(), 5000);
        return;
      }

      // Reset retry count on successful connection check
      this.redisRetryCount = 0;

      const subscriber = this.redisService.getSubscriber();

      // Create message handler for Redis v5 API
      // Signature: (message: string, channel: string) => void
      // Note: Redis v5 client automatically resubscribes on reconnection
      this.messageHandler = (message: string, channel: string) => {
        try {
          // Safety check: Ensure message is a string
          if (typeof message !== 'string' || !message) {
            this.logger.warn('Received invalid message type from Redis', {
              channel,
              messageType: typeof message,
            });
            return;
          }

          // Parse message from Python worker (already in correct format)
          const progressData: ProgressData = JSON.parse(message);

          // Validate progress data structure
          if (!this.isValidProgressData(progressData)) {
            this.logger.warn('Received invalid progress data from Python worker', {
              channel,
              message: message.substring(0, 200), // Log first 200 chars
            });
            return;
          }

          this.handleProgressUpdate(progressData);
        } catch (error) {
          this.logger.error(`Failed to parse progress message from Python worker: ${error.message}`, {
            channel,
            error: error.stack,
          });
        }
      };

      // Verify subscriber client is connected
      this.logger.log(`Subscriber client isOpen: ${subscriber.isOpen}, isReady: ${subscriber.isReady}`);

      // Subscribe to exact channel with listener (Redis v5 API requires listener as 2nd param)
      await subscriber.subscribe(this.REDIS_CHANNEL, this.messageHandler);

      this.isSubscribed = true;
      this.logger.log(`✅ Successfully subscribed to Redis channel: ${this.REDIS_CHANNEL}`);
    } catch (error) {
      // Check if we've exceeded retry limit
      if (this.redisRetryCount >= this.MAX_REDIS_RETRIES) {
        this.logger.error(
          `Redis subscription failed after ${this.MAX_REDIS_RETRIES} attempts: ${error.message}. ` +
            'Progress tracking will not work until Redis is available and service is restarted.'
        );
        return;
      }

      this.redisRetryCount++;
      this.logger.error(
        `Failed to subscribe to Redis (${this.redisRetryCount}/${this.MAX_REDIS_RETRIES}): ${error.message}. ` +
          'Retrying in 5 seconds...'
      );

      // Retry after 5 seconds
      setTimeout(() => this.subscribeToRedis(), 5000);
    }
  }

  /**
   * Validate progress data structure from Python worker
   * Ensures all required fields are present and have correct types/values
   *
   * NOTE: Python worker may send various step formats including:
   * - Standard steps: "initializing", "detecting_patterns", "executing_trades", etc.
   * - Intermediate steps: "starting_pattern_detection", "sorting_patterns_chronologically", etc.
   * - Enhanced formats: "executing_trades:_431/505", "completed!", etc.
   *
   * We validate the structure and types but allow any non-empty string for current_step
   * since the Python worker evolves and adds granular steps over time.
   */
  private isValidProgressData(data: any): data is ProgressData {
    // Valid enum values (must match Python worker output)
    const validStatuses: BacktestStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];

    // Validate structure and types
    const isValid =
      data &&
      typeof data === 'object' &&
      typeof data.backtest_id === 'string' &&
      data.backtest_id.length > 0 &&
      typeof data.user_id === 'string' &&
      data.user_id.length > 0 &&
      typeof data.status === 'string' &&
      validStatuses.includes(data.status as BacktestStatus) &&
      typeof data.progress_percentage === 'number' &&
      data.progress_percentage >= 0 &&
      data.progress_percentage <= 100 &&
      typeof data.current_step === 'string' &&
      data.current_step.length > 0 &&  // Accept any non-empty step string
      typeof data.timestamp === 'string';

    if (!isValid) {
      this.logger.error('Invalid progress data from Python worker', {
        data,
        validation: {
          hasBacktestId: typeof data?.backtest_id === 'string' && data.backtest_id.length > 0,
          hasUserId: typeof data?.user_id === 'string' && data.user_id.length > 0,
          hasValidStatus: validStatuses.includes(data?.status),
          hasValidStep: typeof data?.current_step === 'string' && data.current_step.length > 0,
          currentStep: data?.current_step,
          hasValidProgress:
            typeof data?.progress_percentage === 'number' &&
            data?.progress_percentage >= 0 &&
            data?.progress_percentage <= 100,
          hasTimestamp: typeof data?.timestamp === 'string',
        },
      });
    }

    return isValid;
  }

  /**
   * Validate taskId format (UUID or alphanumeric with hyphens)
   */
  private isValidTaskId(taskId: any): boolean {
    if (typeof taskId !== 'string' || !taskId) {
      return false;
    }

    // Allow UUID format or cuid format (alphanumeric with hyphens)
    const validPattern = /^[a-zA-Z0-9-_]{1,100}$/;
    return validPattern.test(taskId);
  }

  /**
   * Normalize status for consistent comparison
   * Database uses uppercase (CANCELLED), Redis uses lowercase (cancelled)
   */
  private normalizeStatus(status: string): string {
    return status.toLowerCase();
  }

  /**
   * Get cached status for a task (returns null if expired or not found)
   */
  private getCachedStatus(taskId: string): string | null {
    const cached = this.taskStatusCache.get(taskId);
    if (!cached) {
      return null;
    }

    const now = Date.now();
    if (now - cached.cachedAt > this.CACHE_TTL_MS) {
      // Cache expired
      this.taskStatusCache.delete(taskId);
      return null;
    }

    return cached.status;
  }

  /**
   * Set cached status for a task
   */
  private setCachedStatus(taskId: string, status: string): void {
    this.taskStatusCache.set(taskId, {
      status: this.normalizeStatus(status),
      cachedAt: Date.now(),
    });
  }

  /**
   * Clear expired cache entries (called periodically)
   */
  private clearExpiredCacheEntries(): void {
    const now = Date.now();
    let clearedCount = 0;

    for (const [taskId, cached] of this.taskStatusCache.entries()) {
      if (now - cached.cachedAt > this.CACHE_TTL_MS) {
        this.taskStatusCache.delete(taskId);
        clearedCount++;
      }
    }

    if (clearedCount > 0) {
      this.logger.debug(`Cleared ${clearedCount} expired cache entries (total cached: ${this.taskStatusCache.size})`);
    }
  }

  /**
   * Start cache cleanup interval
   */
  private startCacheCleanup(): void {
    // Clean up every 60 seconds (2x the TTL for efficiency)
    this.cacheCleanupInterval = setInterval(() => {
      this.clearExpiredCacheEntries();
    }, 60000);

    this.logger.log('Task status cache cleanup started (runs every 60s)');
  }

  /**
   * Validate task status against database
   * Returns true if update should be forwarded, false if it should be filtered
   *
   * This prevents stale "running" updates after cancellation since the Python
   * worker only polls the database every 10 patterns (~10-30 second delay).
   */
  private async validateTaskStatus(
    taskId: string,
    redisStatus: string,
    userId: string,
  ): Promise<boolean> {
    try {
      // Check cache first to reduce database queries
      const cachedStatus = this.getCachedStatus(taskId);
      if (cachedStatus) {
        const normalizedRedisStatus = this.normalizeStatus(redisStatus);

        // If cached status is cancelled but Redis says running, filter it out
        if (cachedStatus === 'cancelled' && normalizedRedisStatus !== 'cancelled') {
          this.logger.warn(
            `Filtering stale progress update for cancelled task ${taskId} ` +
            `(cached: ${cachedStatus}, redis: ${normalizedRedisStatus}) [CACHE HIT]`,
          );
          return false;
        }

        // Cache hit, status matches or is acceptable
        return true;
      }

      // Cache miss - query database
      const task = await this.prismaService.backtestTask.findUnique({
        where: { id: taskId },
        select: { status: true, user_id: true },
      });

      // Task not found - this is unusual but could happen if deleted
      if (!task) {
        this.logger.warn(
          `Skipping progress update for non-existent task ${taskId}`,
        );
        return false;
      }

      const dbStatus = this.normalizeStatus(task.status);
      const normalizedRedisStatus = this.normalizeStatus(redisStatus);

      // Cache the database status
      this.setCachedStatus(taskId, dbStatus);

      // SECURITY: Verify user_id matches (defense in depth)
      if (task.user_id !== userId) {
        this.logger.error(
          `SECURITY: user_id mismatch for task ${taskId}! ` +
          `DB: ${task.user_id}, Redis: ${userId}`,
        );
        return false;
      }

      // If database shows cancelled but Redis doesn't, filter out the stale update
      if (dbStatus === 'cancelled' && normalizedRedisStatus !== 'cancelled') {
        this.logger.warn(
          `Filtering stale progress update for cancelled task ${taskId} ` +
          `(DB: ${dbStatus}, Redis: ${normalizedRedisStatus}) [CACHE MISS - DB QUERY]`,
        );
        return false;
      }

      // Clear cache for terminal statuses after logging
      // This prevents cache buildup for completed/failed/cancelled tasks
      if (['completed', 'failed', 'cancelled'].includes(dbStatus)) {
        // Don't delete immediately - let it cache for the TTL period
        // This helps filter any remaining stale updates in the pipeline
        this.logger.debug(`Task ${taskId} is in terminal status: ${dbStatus}`);
      }

      // Update is valid
      return true;
    } catch (error) {
      // On database error, fail open to avoid blocking legitimate updates
      this.logger.error(
        `Failed to validate task status for ${taskId}: ${error.message}. ` +
        `Forwarding update anyway to avoid blocking progress.`,
      );
      return true;
    }
  }

  /**
   * Handle progress update from Redis
   * Emits ONLY to authenticated users who own this task (filtered by user_id)
   */
  private async handleProgressUpdate(progressData: ProgressData) {
    // Safety check: ensure server is initialized
    if (!this.server) {
      this.logger.warn('Server not initialized, skipping progress update');
      return;
    }

    const { backtest_id, user_id, status } = progressData;

    // SECURITY: Defensive check for missing user_id
    // This should never happen due to isValidProgressData() checks,
    // but we add defense in depth to prevent accidental leaks
    if (!user_id || typeof user_id !== 'string') {
      this.logger.error(
        'CRITICAL: Progress data missing user_id! This should never happen. Dropping update to prevent security leak.',
        { backtest_id, progressData }
      );
      return;
    }

    // VALIDATION: Check database status to filter stale updates
    // This prevents "running" updates after cancellation (worker has ~10-30s polling delay)
    const isValid = await this.validateTaskStatus(backtest_id, status, user_id);
    if (!isValid) {
      // Update filtered out - validation method already logged the reason
      return;
    }

    // Try to access client sockets with defensive checks
    // Note: In a namespaced gateway, this.server IS the Namespace
    // Access sockets via the internal sockets Map (cast to any to bypass type issues)
    try {
      // Access the sockets Map (TypeScript types don't expose this correctly, so we cast)
      const socketsMap = (this.server as any)?.sockets as Map<string, Socket> | undefined;

      // If sockets Map doesn't exist yet, silently return (initialization phase)
      if (!socketsMap || !(socketsMap instanceof Map)) {
        this.logger.warn('Sockets Map not initialized, skipping progress update');
        return;
      }

      // Check if there are any connected clients at all
      const totalClients = socketsMap.size;
      if (totalClients === 0) {
        return; // Silent return - no clients connected (normal during backtest execution)
      }

      // Emit ONLY to authenticated users who own this backtest
      let sentCount = 0;
      socketsMap.forEach((socket) => {
        if (socket.data.user?.id === user_id) {
          socket.emit('progress', progressData);
          sentCount++;
        }
      });

      // Log successful sends for monitoring (useful to confirm WebSocket is working)
      if (sentCount > 0) {
        this.logger.debug(
          `Progress sent to ${sentCount} client(s): ${backtest_id} - ${progressData.progress_percentage}% (${progressData.current_step})`,
        );
      }
    } catch (error) {
      // Catch any unexpected errors accessing sockets during initialization
      // This prevents the Redis subscription from crashing
      this.logger.debug(
        `Could not broadcast progress update (server still initializing): ${error.message}`
      );
    }
  }

  /**
   * Handle client connection (after JWT authentication)
   */
  async handleConnection(client: Socket) {
    const user = client.data.user;

    if (!user) {
      this.logger.warn(`Client ${client.id} connected without authentication`);
      client.disconnect();
      return;
    }

    this.logger.log(`Client connected: ${client.id} (user: ${user.email})`);

    // Send only user's active tasks on connection (for dashboard)
    try {
      const allProgress = await this.redisService.getAllTasksProgress();

      // Filter tasks by user_id first (in-memory filtering)
      const userTasksFromRedis: Record<string, ProgressData> = {};
      let skippedCount = 0;

      for (const [taskId, progress] of Object.entries(allProgress)) {
        // SECURITY: Skip tasks without user_id (old cached data or corrupted)
        if (!progress.user_id) {
          this.logger.warn(
            `Task ${taskId} in Redis cache has no user_id! This may be stale data from before user_id was added. Consider clearing Redis cache.`
          );
          skippedCount++;
          continue;
        }

        if (progress.user_id === user.id) {
          userTasksFromRedis[taskId] = progress;
        }
      }

      // VALIDATION: Fetch actual task statuses from database to filter stale Redis data
      // This prevents sending cancelled/completed tasks that are still cached in Redis
      const taskIds = Object.keys(userTasksFromRedis);

      if (taskIds.length > 0) {
        const dbTasks = await this.prismaService.backtestTask.findMany({
          where: {
            id: { in: taskIds },
            user_id: user.id, // Security: ensure user owns these tasks
          },
          select: { id: true, status: true },
        });

        // Create a map of taskId -> dbStatus for quick lookup
        const dbStatusMap = new Map<string, string>();
        for (const task of dbTasks) {
          dbStatusMap.set(task.id, this.normalizeStatus(task.status));
        }

        // Filter out stale tasks where Redis status doesn't match database status
        const validatedTasks: Record<string, ProgressData> = {};
        let filteredCount = 0;

        for (const [taskId, progress] of Object.entries(userTasksFromRedis)) {
          const dbStatus = dbStatusMap.get(taskId);

          // If task not found in DB, skip it (deleted or doesn't exist)
          if (!dbStatus) {
            this.logger.warn(
              `Filtering stale task ${taskId} on connection: not found in database`
            );
            filteredCount++;
            continue;
          }

          const redisStatus = this.normalizeStatus(progress.status);

          // If database shows terminal status but Redis shows running, filter it out
          if (dbStatus === 'cancelled' && redisStatus === 'running') {
            this.logger.warn(
              `Filtering stale task ${taskId} on connection: DB shows ${dbStatus} but Redis shows ${redisStatus}`
            );
            filteredCount++;
            continue;
          }

          // Cache the status for future real-time updates
          this.setCachedStatus(taskId, dbStatus);

          // Task is valid, include it
          validatedTasks[taskId] = progress;
        }

        client.emit('all_tasks', validatedTasks);

        this.logger.log(
          `Sent ${Object.keys(validatedTasks).length} validated tasks to ${user.email} ` +
          `(filtered ${filteredCount} stale, skipped ${skippedCount} invalid)`,
        );
      } else {
        // No tasks for this user
        client.emit('all_tasks', {});
        this.logger.debug(`No tasks to send to ${user.email}`);
      }
    } catch (error) {
      this.logger.error(`Failed to send tasks to client: ${error.message}`);

      // Notify client that initial data load failed
      // This prevents confusing "No tasks" display when services are down
      client.emit('error', {
        message: 'Failed to load initial task data. Please try reconnecting.',
        code: 'INITIAL_LOAD_FAILED',
        details: error.message,
      });
    }
  }

  /**
   * Handle client disconnection
   */
  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /**
   * Client subscribes to a specific task's progress
   * Requires JWT authentication via WsJwtGuard
   *
   * Note: Authorization happens via user_id filtering in handleProgressUpdate
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('subscribe')
  async handleSubscribe(client: Socket, taskId: string) {
    const user = client.data.user;

    if (!user) {
      this.logger.warn(`Unauthenticated subscribe attempt from ${client.id}`);
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Validate taskId format
    if (!this.isValidTaskId(taskId)) {
      this.logger.warn(
        `User ${user.email} attempted to subscribe with invalid taskId: ${taskId}`,
      );
      client.emit('error', { message: 'Invalid task ID format' });
      return;
    }

    this.logger.log(`User ${user.email} subscribed to task ${taskId}`);

    // Send latest cached progress immediately (if available and owned by user)
    try {
      const cachedProgress = await this.redisService.getTaskProgress(taskId);

      if (cachedProgress) {
        // SECURITY: Check if cached data has user_id (defensive programming)
        if (!cachedProgress.user_id) {
          this.logger.error(
            `Cached progress for task ${taskId} has no user_id! This is a data integrity issue. Cached data may be stale.`,
            { cachedProgress }
          );
          client.emit('error', {
            message: 'Progress data unavailable. Please try again later.',
            code: 'DATA_INTEGRITY_ERROR',
          });
          return;
        }

        // Verify user owns this task before sending cached data
        if (cachedProgress.user_id === user.id) {
          // VALIDATION: Check database status before sending cached progress
          const isValid = await this.validateTaskStatus(taskId, cachedProgress.status, user.id);

          if (!isValid) {
            // Cached data is stale (e.g., task was cancelled but Redis cache still shows running)
            this.logger.warn(
              `Not sending stale cached progress for task ${taskId} to ${user.email}`
            );
            client.emit('no_progress', {
              backtest_id: taskId,
              message: 'Task status has changed. Waiting for updated progress...'
            });
            return;
          }

          client.emit('progress', cachedProgress);
          this.logger.debug(
            `Sent cached progress for task ${taskId}: ${cachedProgress.progress_percentage}%`,
          );
        } else {
          // User doesn't own this task
          this.logger.warn(
            `User ${user.email} attempted to access task ${taskId} owned by user ${cachedProgress.user_id}`,
          );
          client.emit('error', {
            message: 'Access denied: Task not found or unauthorized',
            code: 'UNAUTHORIZED_ACCESS',
          });
        }
      } else {
        // Send a message indicating no progress available yet
        client.emit('no_progress', { backtest_id: taskId, message: 'No progress available yet' });
        this.logger.debug(`No cached progress for backtest ${taskId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to get cached progress: ${error.message}`);
      client.emit('error', {
        message: 'Failed to retrieve progress',
        code: 'REDIS_ERROR',
        details: error.message,
      });
    }
  }

  /**
   * Client unsubscribes from a specific task's progress
   *
   * Note: No room management needed with user_id filtering
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(client: Socket, taskId: string) {
    const user = client.data.user;

    if (!user) {
      return;
    }

    // Validate taskId
    if (!this.isValidTaskId(taskId)) {
      this.logger.warn(`User ${user.email} attempted to unsubscribe with invalid taskId`);
      return;
    }

    // No room management needed - just log for tracking
    this.logger.log(`User ${user.email} unsubscribed from task ${taskId}`);
  }

  /**
   * One-time progress fetch (alternative to subscribe)
   * Requires JWT authentication and user_id match
   */
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('get_progress')
  async handleGetProgress(client: Socket, taskId: string) {
    const user = client.data.user;

    if (!user) {
      client.emit('error', { message: 'Unauthorized' });
      return;
    }

    // Validate taskId
    if (!this.isValidTaskId(taskId)) {
      this.logger.warn(`User ${user.email} requested progress with invalid taskId`);
      client.emit('error', { message: 'Invalid task ID format' });
      return;
    }

    try {
      const progress = await this.redisService.getTaskProgress(taskId);

      if (progress) {
        // SECURITY: Check if cached data has user_id (defensive programming)
        if (!progress.user_id) {
          this.logger.error(
            `Cached progress for task ${taskId} has no user_id! This is a data integrity issue.`,
            { progress }
          );
          client.emit('error', {
            message: 'Progress data unavailable. Please try again later.',
            code: 'DATA_INTEGRITY_ERROR',
          });
          return;
        }

        // Verify user owns this task
        if (progress.user_id === user.id) {
          client.emit('progress', progress);
        } else {
          this.logger.warn(
            `User ${user.email} attempted to fetch task ${taskId} owned by user ${progress.user_id}`,
          );
          client.emit('error', {
            message: 'Access denied: Task not found or unauthorized',
            code: 'UNAUTHORIZED_ACCESS',
          });
        }
      } else {
        client.emit('no_progress', { backtest_id: taskId, message: 'No progress available' });
      }
    } catch (error) {
      this.logger.error(`Failed to fetch progress for backtest ${taskId}: ${error.message}`);
      client.emit('error', {
        message: 'Failed to fetch progress',
        code: 'REDIS_ERROR',
        details: error.message,
      });
    }
  }
}
