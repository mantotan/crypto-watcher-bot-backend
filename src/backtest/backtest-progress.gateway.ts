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
import { RedisService, ProgressData } from '../redis/redis.service';
import { PrismaService } from '../prisma/prisma.service';
import { WsJwtGuard } from './guards/ws-jwt.guard';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman)
      if (!origin) {
        return callback(null, true);
      }

      const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:3006';
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
  private readonly REDIS_CHANNEL = 'backtest:progress:all';
  private tokenExpirationChecker: NodeJS.Timeout | null = null;

  // Redis retry management
  private redisRetryCount = 0;
  private readonly MAX_REDIS_RETRIES = 12; // Stop after 60 seconds (12 × 5s)

  // Cache for task ownership (taskId -> userId, 5 minute TTL)
  private ownershipCache = new Map<string, { userId: string; expiresAt: number }>();
  private readonly OWNERSHIP_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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

        // Attach user to socket for use in handlers
        socket.data.user = {
          id: payload.sub,
          email: payload.email,
        };

        // Store token expiration for validation
        socket.data.tokenExp = payload.exp;
        socket.data.tokenIat = payload.iat;

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
  }

  async onModuleDestroy() {
    this.logger.log('WebSocket Gateway shutting down...');

    // Stop token expiration checker
    if (this.tokenExpirationChecker) {
      clearInterval(this.tokenExpirationChecker);
      this.tokenExpirationChecker = null;
      this.logger.log('Token expiration checker stopped');
    }

    // Clear ownership cache
    this.ownershipCache.clear();

    // Unsubscribe from Redis channel to prevent memory leaks
    if (this.isSubscribed) {
      try {
        const subscriber = this.redisService.getSubscriber();
        await subscriber.unsubscribe(this.REDIS_CHANNEL);
        this.isSubscribed = false;
        this.logger.log(`Unsubscribed from Redis channel: ${this.REDIS_CHANNEL}`);
      } catch (error) {
        this.logger.error(`Failed to unsubscribe from Redis: ${error.message}`);
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
   * Priority: auth.token > Authorization header > cookie
   */
  private extractToken(client: Socket): string | null {
    // 1. Socket.IO auth object (recommended)
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // 2. Authorization header (Bearer token)
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 3. HTTP-only cookie (access_token)
    const cookies = client.handshake.headers?.cookie;
    if (cookies) {
      const match = cookies.match(/access_token=([^;]+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Periodically check for expired tokens and disconnect clients
   */
  private startTokenExpirationChecker() {
    // Check every minute
    this.tokenExpirationChecker = setInterval(() => {
      // Safety check: ensure server and sockets are initialized
      if (!this.server?.sockets?.sockets) {
        this.logger.debug('Token expiration checker: No sockets to check');
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const sockets = this.server.sockets.sockets;

      let disconnectedCount = 0;

      sockets.forEach((socket) => {
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

      // Clean expired ownership cache entries
      this.cleanOwnershipCache();
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

      // Subscribe to global progress channel (all tasks)
      await subscriber.subscribe(this.REDIS_CHANNEL, (message) => {
        try {
          const progressData: ProgressData = JSON.parse(message);

          // Validate progress data structure
          if (!this.isValidProgressData(progressData)) {
            this.logger.warn('Received invalid progress data from Redis');
            return;
          }

          this.handleProgressUpdate(progressData);
        } catch (error) {
          this.logger.error(`Failed to parse progress message: ${error.message}`);
        }
      });

      this.isSubscribed = true;
      this.logger.log(`Subscribed to Redis channel: ${this.REDIS_CHANNEL}`);
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
   * Validate progress data structure
   */
  private isValidProgressData(data: any): data is ProgressData {
    return (
      data &&
      typeof data === 'object' &&
      typeof data.task_id === 'string' &&
      typeof data.status === 'string' &&
      typeof data.progress_percentage === 'number' &&
      typeof data.current_step === 'string'
    );
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
   * Handle progress update from Redis
   */
  private handleProgressUpdate(progressData: ProgressData) {
    // Safety check: ensure server is initialized
    if (!this.server) {
      this.logger.warn('Progress update received but server not initialized yet');
      return;
    }

    const { task_id } = progressData;

    // Emit to clients subscribed to this specific task
    this.server.to(`task:${task_id}`).emit('progress', progressData);

    // Also broadcast to global listeners (dashboard)
    this.server.emit('global_progress', progressData);

    this.logger.debug(
      `Progress update: ${task_id} - ${progressData.progress_percentage}% (${progressData.current_step})`,
    );
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
      const userTasks = await this.filterTasksByUser(allProgress, user.id);

      client.emit('all_tasks', userTasks);

      this.logger.debug(
        `Sent ${Object.keys(userTasks).length} tasks to user ${user.email}`,
      );
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
   * Filter tasks to only include those belonging to the user
   *
   * PERFORMANCE NOTE: Instead of querying "WHERE id IN (all task IDs from Redis)",
   * we query "user's tasks" then check which are in Redis. This is much faster
   * because:
   * 1. Users typically have < 100 active tasks (vs potentially 10,000+ total tasks)
   * 2. Query is indexed on user_id (faster than large IN clause)
   * 3. No risk of hitting database query length limits
   * 4. Automatically filters to in-progress tasks only
   */
  private async filterTasksByUser(
    allProgress: Record<string, ProgressData>,
    userId: string,
  ): Promise<Record<string, ProgressData>> {
    // Reverse the query: get user's tasks first, then check Redis
    // Only fetch tasks that are likely to have progress (QUEUED or RUNNING)
    const userTasks = await this.prismaService.backtestTask.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
        // Only check tasks in progress (completed tasks won't be in Redis)
        status: { in: ['QUEUED', 'RUNNING'] },
      },
      select: { id: true },
    });

    // Build filtered result by checking which user tasks have progress in Redis
    const filtered: Record<string, ProgressData> = {};
    for (const task of userTasks) {
      const progress = allProgress[task.id];
      if (progress) {
        filtered[task.id] = progress;
      }
    }

    return filtered;
  }

  /**
   * Verify that a task belongs to the authenticated user
   * Uses cache to reduce database queries (5 minute TTL)
   */
  private async verifyTaskOwnership(taskId: string, userId: string): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.ownershipCache.get(taskId);
      const now = Date.now();

      if (cached && cached.expiresAt > now) {
        // Cache hit
        return cached.userId === userId;
      }

      // Cache miss or expired - query database
      const task = await this.prismaService.backtestTask.findFirst({
        where: {
          id: taskId,
          deleted_at: null,
        },
        select: { id: true, user_id: true },
      });

      if (!task) {
        // Task doesn't exist, cache negative result for 1 minute
        this.ownershipCache.set(taskId, {
          userId: '__nonexistent__',
          expiresAt: now + 60000, // 1 minute
        });
        return false;
      }

      // Cache the result
      this.ownershipCache.set(taskId, {
        userId: task.user_id,
        expiresAt: now + this.OWNERSHIP_CACHE_TTL,
      });

      return task.user_id === userId;
    } catch (error) {
      this.logger.error(`Failed to verify task ownership: ${error.message}`);
      return false;
    }
  }

  /**
   * Clear ownership cache entry (call when task is deleted)
   */
  private clearOwnershipCache(taskId: string) {
    this.ownershipCache.delete(taskId);
  }

  /**
   * Periodically clean expired cache entries
   */
  private cleanOwnershipCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [taskId, entry] of this.ownershipCache.entries()) {
      if (entry.expiresAt < now) {
        this.ownershipCache.delete(taskId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug(`Cleaned ${cleanedCount} expired ownership cache entries`);
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

    // Verify task ownership
    const hasAccess = await this.verifyTaskOwnership(taskId, user.id);

    if (!hasAccess) {
      this.logger.warn(
        `User ${user.email} attempted to access unauthorized task ${taskId}`,
      );
      client.emit('error', { message: 'Access denied: Task not found or unauthorized' });
      return;
    }

    // Join room for this specific task
    client.join(`task:${taskId}`);
    this.logger.log(`User ${user.email} subscribed to task ${taskId}`);

    // Send latest cached progress immediately
    try {
      const cachedProgress = await this.redisService.getTaskProgress(taskId);

      if (cachedProgress) {
        client.emit('progress', cachedProgress);
        this.logger.debug(
          `Sent cached progress for task ${taskId}: ${cachedProgress.progress_percentage}%`,
        );
      } else {
        // Send a message indicating no progress available yet
        client.emit('no_progress', { task_id: taskId, message: 'No progress available yet' });
        this.logger.debug(`No cached progress for task ${taskId}`);
      }
    } catch (error) {
      this.logger.error(`Failed to get cached progress: ${error.message}`);
      client.emit('error', { message: 'Failed to retrieve progress' });
    }
  }

  /**
   * Client unsubscribes from a specific task's progress
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

    client.leave(`task:${taskId}`);
    this.logger.log(`User ${user.email} unsubscribed from task ${taskId}`);
  }

  /**
   * One-time progress fetch (alternative to subscribe)
   * Requires ownership verification
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

    // Verify task ownership
    const hasAccess = await this.verifyTaskOwnership(taskId, user.id);

    if (!hasAccess) {
      this.logger.warn(
        `User ${user.email} attempted to fetch unauthorized task ${taskId}`,
      );
      client.emit('error', { message: 'Access denied: Task not found or unauthorized' });
      return;
    }

    try {
      const progress = await this.redisService.getTaskProgress(taskId);

      if (progress) {
        client.emit('progress', progress);
      } else {
        client.emit('no_progress', { task_id: taskId, message: 'No progress available' });
      }
    } catch (error) {
      this.logger.error(`Failed to fetch progress for task ${taskId}: ${error.message}`);
      client.emit('error', { message: 'Failed to fetch progress' });
    }
  }
}
