import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../redis/queue.service';
import { GraphQLService } from '../graphql/graphql.service';
import { CreateBacktestTaskDto } from './dto/create-backtest-task.dto';
import { CreateBacktestStrategyDto } from './dto/create-backtest-strategy.dto';
import { BacktestTradesQueryDto, BacktestTradeSortBy, SortOrder } from './dto/backtest-trades-query.dto';
import { Prisma } from '@prisma/client';
import { convertUserTimezoneToUTC } from '../common/utils/timezone.util';

@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);

  constructor(
    private prisma: PrismaService,
    private queueService: QueueService,
    private graphqlService: GraphQLService,
  ) {}

  /**
   * Create a new backtest task and submit to Redis queue
   */
  async createTask(userId: string, dto: CreateBacktestTaskDto) {
    // Fetch user's preferred timezone
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { preferred_timezone: true },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const userTimezone = user.preferred_timezone;

    // Convert dates from user's timezone to UTC
    let startDate: Date;
    let endDate: Date;

    try {
      startDate = convertUserTimezoneToUTC(dto.start_date, userTimezone);
      endDate = convertUserTimezoneToUTC(dto.end_date, userTimezone);
    } catch (error) {
      throw new BadRequestException(
        `Invalid datetime format. ${error.message}`
      );
    }

    // Validate dates
    if (startDate >= endDate) {
      throw new BadRequestException(
        'start_date must be before end_date (in your timezone: ' + userTimezone + ')'
      );
    }

    // If strategy_id is provided, verify it belongs to the user
    if (dto.strategy_id) {
      const strategy = await this.prisma.backtestStrategy.findFirst({
        where: {
          id: dto.strategy_id,
          user_id: userId,
        },
      });

      if (!strategy) {
        throw new NotFoundException('Strategy not found or does not belong to user');
      }
    }

    // Determine combination flags (default to false, meaning split into separate tasks)
    const isCombineTimeframe = dto.is_combine_timeframe ?? false;
    const isCombineSymbol = dto.is_combine_symbol ?? false;

    // Generate task combinations based on the flags
    const taskCombinations = this.generateTaskCombinations(
      dto.symbols,
      dto.timeframes,
      isCombineSymbol,
      isCombineTimeframe,
    );

    this.logger.log(
      `Creating ${taskCombinations.length} backtest task(s) (combine_symbol=${isCombineSymbol}, combine_timeframe=${isCombineTimeframe})`,
    );

    // Create all tasks
    const createdTasks = [];
    const priority = dto.priority || 'normal';

    for (let i = 0; i < taskCombinations.length; i++) {
      const { symbols, timeframes } = taskCombinations[i];

      // Create task name with suffix if multiple tasks
      const taskName = taskCombinations.length > 1
        ? `${dto.name} (${symbols.join(',')} - ${timeframes.join(',')})`
        : dto.name;

      // Create the backtest task with PENDING status
      const task = await this.prisma.backtestTask.create({
        data: {
          user_id: userId,
          name: taskName,
          description: dto.description,
          strategy_id: dto.strategy_id,
          symbols,
          timeframes,
          start_date: startDate,
          end_date: endDate,
          strategy_config: dto.strategy_config as unknown as Prisma.InputJsonValue,
          status: 'PENDING',
        },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      this.logger.log(`Created backtest task: ${task.id} with symbols=[${symbols.join(',')}] timeframes=[${timeframes.join(',')}]`);

      // Submit to Redis queue
      try {
        const jobId = await this.queueService.submitBacktestTask(task.id, priority);

        // Update task with queue_job_id and set status to QUEUED
        const updatedTask = await this.prisma.backtestTask.update({
          where: { id: task.id },
          data: {
            queue_job_id: jobId,
            status: 'QUEUED',
          },
          include: {
            strategy: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        this.logger.log(`Backtest task ${task.id} submitted to queue with job ID: ${jobId}`);
        createdTasks.push(updatedTask);
      } catch (error) {
        this.logger.error(`Failed to submit backtest task to queue: ${error.message}`, error.stack);

        // Task was created but queue submission failed
        // Update task status to FAILED with error message
        await this.prisma.backtestTask.update({
          where: { id: task.id },
          data: {
            status: 'FAILED',
            error_message: `Queue submission failed: ${error.message}`,
          },
        });

        throw new BadRequestException('Failed to submit backtest task to queue');
      }
    }

    // Return all created tasks (or single task if only one)
    return taskCombinations.length === 1 ? createdTasks[0] : { tasks: createdTasks, count: createdTasks.length };
  }

  /**
   * Generate task combinations based on combination flags
   *
   * @param symbols - Array of symbols
   * @param timeframes - Array of timeframes
   * @param isCombineSymbol - If false, split into separate tasks per symbol
   * @param isCombineTimeframe - If false, split into separate tasks per timeframe
   * @returns Array of task configurations with symbols and timeframes
   */
  private generateTaskCombinations(
    symbols: string[],
    timeframes: string[],
    isCombineSymbol: boolean,
    isCombineTimeframe: boolean,
  ): Array<{ symbols: string[]; timeframes: string[] }> {
    const combinations: Array<{ symbols: string[]; timeframes: string[] }> = [];

    if (isCombineSymbol && isCombineTimeframe) {
      // Combine everything into one task
      combinations.push({ symbols, timeframes });
    } else if (!isCombineSymbol && isCombineTimeframe) {
      // Split by symbol, combine timeframes
      for (const symbol of symbols) {
        combinations.push({ symbols: [symbol], timeframes });
      }
    } else if (isCombineSymbol && !isCombineTimeframe) {
      // Combine symbols, split by timeframe
      for (const timeframe of timeframes) {
        combinations.push({ symbols, timeframes: [timeframe] });
      }
    } else {
      // Split by both symbol and timeframe (Cartesian product)
      for (const symbol of symbols) {
        for (const timeframe of timeframes) {
          combinations.push({ symbols: [symbol], timeframes: [timeframe] });
        }
      }
    }

    return combinations;
  }

  /**
   * Archive a backtest task
   */
  async archiveTask(userId: string, taskId: string) {
    // First check if task exists and belongs to user
    const task = await this.prisma.backtestTask.findFirst({
      where: {
        id: taskId,
        user_id: userId,
        deleted_at: null, // Cannot archive already deleted tasks
      },
    });

    if (!task) {
      throw new NotFoundException('Backtest task not found');
    }

    // Cannot archive a running task
    if (task.status === 'RUNNING') {
      throw new BadRequestException('Cannot archive a running task');
    }

    // Update task to archived
    const updatedTask = await this.prisma.backtestTask.update({
      where: { id: taskId },
      data: {
        archived: true,
        archived_at: new Date(),
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    this.logger.log(`Backtest task ${taskId} archived successfully`);
    return updatedTask;
  }

  /**
   * Unarchive a backtest task
   */
  async unarchiveTask(userId: string, taskId: string) {
    // First check if task exists and belongs to user
    const task = await this.prisma.backtestTask.findFirst({
      where: {
        id: taskId,
        user_id: userId,
        deleted_at: null, // Cannot unarchive deleted tasks
      },
    });

    if (!task) {
      throw new NotFoundException('Backtest task not found');
    }

    // Update task to unarchived
    const updatedTask = await this.prisma.backtestTask.update({
      where: { id: taskId },
      data: {
        archived: false,
        archived_at: null,
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    this.logger.log(`Backtest task ${taskId} unarchived successfully`);
    return updatedTask;
  }

  /**
   * Soft delete a backtest task
   */
  async softDeleteTask(userId: string, taskId: string) {
    // First check if task exists and belongs to user
    const task = await this.prisma.backtestTask.findFirst({
      where: {
        id: taskId,
        user_id: userId,
        deleted_at: null, // Cannot delete already deleted tasks
      },
    });

    if (!task) {
      throw new NotFoundException('Backtest task not found');
    }

    // Cannot delete a running task
    if (task.status === 'RUNNING') {
      throw new BadRequestException('Cannot delete a running task');
    }

    // Soft delete the task
    const deletedTask = await this.prisma.backtestTask.update({
      where: { id: taskId },
      data: {
        deleted_at: new Date(),
      },
    });

    this.logger.log(`Backtest task ${taskId} soft deleted successfully`);
    return {
      message: 'Task deleted successfully',
      id: deletedTask.id,
    };
  }

  /**
   * Get a backtest task by ID including its result (without trades)
   */
  async getTaskById(userId: string, taskId: string) {
    const task = await this.prisma.backtestTask.findFirst({
      where: {
        id: taskId,
        user_id: userId,
        deleted_at: null, // Exclude soft deleted tasks only
        // Archived tasks are still accessible by ID
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            strategy_type: true,
            allowed_patterns: true,
          },
        },
        result: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Backtest task not found or has been deleted');
    }

    return task;
  }

  /**
   * List all backtest tasks for a user with pagination
   */
  async listTasks(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      status?: string;
      archived?: boolean;
    } = {},
  ) {
    const limit = options.limit || 20;

    // Build where clause with filters
    const where: Prisma.BacktestTaskWhereInput = {
      user_id: userId,
      deleted_at: null, // ALWAYS exclude soft deleted tasks
      archived: options.archived ?? false, // Default to non-archived tasks
      ...(options.status && { status: options.status as any }),
    };

    // Build query with or without cursor pagination
    const queryOptions: Prisma.BacktestTaskFindManyArgs = {
      where,
      take: limit + 1, // Fetch one extra to determine if there are more
      orderBy: {
        created_at: 'desc',
      },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
          },
        },
        result: {
          select: {
            id: true,
            total_trades: true,
            win_rate: true,
            total_return_percentage: true,
            final_capital: true,
          },
        },
      },
    };

    // Add cursor pagination if cursor is provided
    if (options.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = {
        id: options.cursor,
      };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.backtestTask.findMany(queryOptions),
      this.prisma.backtestTask.count({ where }),
    ]);

    // Check if there are more results
    const hasMore = tasks.length > limit;
    const data = hasMore ? tasks.slice(0, limit) : tasks;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      pagination: {
        total,
        limit,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Get backtest result trades with pagination and filtering
   */
  async getResultTrades(userId: string, resultId: string, query: BacktestTradesQueryDto) {
    // First verify the result exists and belongs to the user
    // Also check that the parent task is not deleted (archived tasks are still accessible)
    const result = await this.prisma.backtestResult.findFirst({
      where: {
        id: resultId,
        backtest: {
          user_id: userId,
          deleted_at: null, // Parent task must not be deleted (archived is OK)
        },
      },
      select: {
        id: true,
        backtest_id: true,
      },
    });

    if (!result) {
      throw new NotFoundException('Backtest result not found or parent task has been deleted');
    }

    // Build where clause for filtering
    const where: Prisma.BacktestTradeWhereInput = {
      result_id: resultId,
      ...(query.symbol && { symbol: query.symbol }),
      ...(query.timeframe && { timeframe: query.timeframe }),
      ...(query.exit_reason && { exit_reason: query.exit_reason }),
      ...(query.profitable !== undefined && {
        net_pnl: query.profitable ? { gt: 0 } : { lte: 0 },
      }),
    };

    const limit = query.limit || 100;

    // Determine sort field and order
    const sortBy = query.sort_by || BacktestTradeSortBy.ENTRY_DATETIME;

    // Smart default for sort_order based on field type
    let sortOrder = query.sort_order;
    if (!sortOrder) {
      // Date fields default to ascending, metrics default to descending
      if (sortBy === BacktestTradeSortBy.NET_PNL || sortBy === BacktestTradeSortBy.REWARD_RISK_RATIO) {
        sortOrder = SortOrder.DESC;
      } else {
        sortOrder = SortOrder.ASC;
      }
    }

    // Build orderBy - handle nullable fields with nulls last
    let orderBy: Prisma.BacktestTradeOrderByWithRelationInput;

    if (sortBy === BacktestTradeSortBy.EXIT_DATETIME || sortBy === BacktestTradeSortBy.NET_PNL) {
      // Nullable fields - nulls always sort last
      orderBy = {
        [sortBy]: { sort: sortOrder, nulls: 'last' },
      };
    } else {
      // Non-nullable fields
      orderBy = {
        [sortBy]: sortOrder,
      };
    }

    // Build query with or without cursor pagination
    const queryOptions: Prisma.BacktestTradeFindManyArgs = {
      where,
      take: limit + 1, // Fetch one extra to check if there are more
      orderBy,
    };

    // Add cursor pagination if cursor is provided
    // ⚠️ WARNING: Cursor-based pagination is incompatible with changing sort parameters.
    // If the client changes sort_by or sort_order while using a cursor, results will be unpredictable.
    // The client should reset cursor to null when changing sort parameters.
    if (query.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = {
        id: query.cursor,
      };
    }

    // Fetch trades and counts in parallel
    const [trades, total, summary] = await Promise.all([
      this.prisma.backtestTrade.findMany(queryOptions),
      this.prisma.backtestTrade.count({ where }),
      this.calculateTradesSummary(resultId, where),
    ]);

    // Check if there are more results
    const hasMore = trades.length > limit;
    const data = hasMore ? trades.slice(0, limit) : trades;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      pagination: {
        total,
        limit,
        nextCursor,
        hasMore,
      },
      summary,
    };
  }

  /**
   * Find the candle that contains a specific price
   * Returns the candle's timestamp if found, null otherwise
   */
  private findCandleContainingPrice(
    candles: any[],
    price: number,
    priceType: 'entry' | 'exit',
    expectedTime?: Date | string,
  ): string | null {
    if (!candles || candles.length === 0) return null;

    const priceNum = Number(price);
    if (isNaN(priceNum)) return null;

    // If expectedTime is provided, filter candles to only those at or after that time
    let searchCandles = candles;
    if (expectedTime) {
      const expectedDate = new Date(expectedTime);
      if (!isNaN(expectedDate.getTime())) {
        searchCandles = candles.filter(candle => {
          const candleDate = new Date(candle.timestamp);
          return candleDate >= expectedDate;
        });

        // If no candles found at or after expected time, search all candles as fallback
        if (searchCandles.length === 0) {
          this.logger.warn(
            `No candles found at or after expected time ${expectedDate.toISOString()} for ${priceType}, ` +
            `searching all candles as fallback`
          );
          searchCandles = candles;
        }
      }
    }

    // First, try to find exact match (open, high, low, close)
    for (const candle of searchCandles) {
      const exactMatch =
        Math.abs(candle.open - priceNum) < 0.001 ||
        Math.abs(candle.high - priceNum) < 0.001 ||
        Math.abs(candle.low - priceNum) < 0.001 ||
        Math.abs(candle.close - priceNum) < 0.001;

      if (exactMatch) {
        return candle.timestamp;
      }
    }

    // If no exact match, find candle where price is within range [low, high]
    for (const candle of searchCandles) {
      if (priceNum >= candle.low && priceNum <= candle.high) {
        return candle.timestamp;
      }
    }

    return null;
  }

  async getTradeDetails(userId: string, tradeId: string) {
    // Fetch the trade and verify it belongs to the user
    // Also check that the parent task is not deleted (archived tasks are still accessible)
    const trade = await this.prisma.backtestTrade.findFirst({
      where: {
        id: tradeId,
        result: {
          backtest: {
            user_id: userId,
            deleted_at: null, // Parent task must not be deleted (archived is OK)
          },
        },
      },
      include: {
        result: {
          select: {
            id: true,
            backtest_id: true,
            symbols: true,
            timeframes: true,
            start_date: true,
            end_date: true,
          },
        },
      },
    });

    if (!trade) {
      throw new NotFoundException('Backtest trade not found or parent task has been deleted');
    }

    // Extract pattern data to find the reference timestamp (first top/bottom)
    const patternData = trade.pattern_data as any;
    let referenceTime: Date;

    // Extract first top/bottom timestamp from pattern_data
    // Pattern data structure varies by pattern type, but generally has first_top or first_bottom
    // Note: Python worker uses 'datetime' field, but we also check 'timestamp' for backward compatibility

    // Helper to safely parse and validate date
    const tryParseDate = (value: any): Date | null => {
      if (!value) return null;
      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    };

    // Try to find valid reference time from pattern data
    let patternSource: string | null = null;

    if (patternData?.first_top) {
      const dateValue = patternData.first_top.datetime || patternData.first_top.timestamp;
      referenceTime = tryParseDate(dateValue);
      if (referenceTime) patternSource = 'first_top';
    }

    if (!referenceTime && patternData?.first_bottom) {
      const dateValue = patternData.first_bottom.datetime || patternData.first_bottom.timestamp;
      referenceTime = tryParseDate(dateValue);
      if (referenceTime) patternSource = 'first_bottom';
    }

    if (!referenceTime && patternData?.peak) {
      const dateValue = patternData.peak.datetime || patternData.peak.timestamp;
      referenceTime = tryParseDate(dateValue);
      if (referenceTime) patternSource = 'peak';
    }

    if (referenceTime && patternSource) {
      this.logger.debug(
        `Using ${patternSource} reference time: ${referenceTime.toISOString()} for trade ${tradeId}`
      );
    } else {
      // Fallback to entry datetime if pattern timestamp not found or invalid
      referenceTime = new Date(trade.entry_datetime);

      // Validate fallback date
      if (isNaN(referenceTime.getTime())) {
        this.logger.error(
          `Invalid entry_datetime for trade ${tradeId}: ${trade.entry_datetime}. This should not happen.`
        );
        throw new Error('Invalid trade entry_datetime');
      }

      this.logger.warn(
        `Could not find valid pattern datetime/timestamp in trade ${tradeId}, using entry_datetime as reference. ` +
        `Pattern keys: ${patternData ? Object.keys(patternData).join(', ') : 'null'}`
      );
    }

    // Fetch candles around the reference time
    // GraphQL service now handles errors gracefully and returns partial/empty data
    const candleData = await this.graphqlService.getCandlesAroundTime(
      trade.symbol,
      trade.timeframe,
      referenceTime,
      50, // 50 candles before
      50, // 50 candles after
    );

    const totalCandles = candleData.before.length + candleData.after.length;

    // Log if no candles were retrieved
    if (totalCandles === 0) {
      this.logger.warn(
        `No candles available for trade ${tradeId} (${trade.symbol} ${trade.timeframe} at ${referenceTime.toISOString()})`,
      );
    }

    // Find candles that contain entry and exit prices
    const allCandles = [...candleData.before, ...candleData.after];
    const entryPrice = trade.entry_price;
    const exitPrice = trade.exit_price;

    const entryCandleTimestamp = this.findCandleContainingPrice(
      allCandles,
      entryPrice.toNumber(),
      'entry',
      trade.entry_datetime,
    );

    const exitCandleTimestamp = exitPrice
      ? this.findCandleContainingPrice(
          allCandles,
          exitPrice.toNumber(),
          'exit',
          trade.exit_datetime,
        )
      : null;

    return {
      trade,
      candles: {
        before: candleData.before,
        after: candleData.after,
        reference_time: candleData.reference,
        total_candles: totalCandles,
        entry_candle_timestamp: entryCandleTimestamp,
        ...(exitCandleTimestamp && { exit_candle_timestamp: exitCandleTimestamp }),
        ...(totalCandles === 0 && {
          error: 'No candle data available from chart service for this time range',
        }),
      },
    };
  }

  /**
   * Calculate summary statistics for filtered trades
   */
  private async calculateTradesSummary(
    resultId: string,
    where: Prisma.BacktestTradeWhereInput,
  ) {
    const trades = await this.prisma.backtestTrade.findMany({
      where,
      select: {
        net_pnl: true,
      },
    });

    const total_trades = trades.length;
    const winning_trades = trades.filter((t) => t.net_pnl && t.net_pnl.toNumber() > 0).length;
    const losing_trades = trades.filter((t) => t.net_pnl && t.net_pnl.toNumber() <= 0).length;
    const win_rate = total_trades > 0 ? (winning_trades / total_trades) * 100 : 0;
    const total_pnl = trades.reduce((sum, t) => sum + (t.net_pnl?.toNumber() || 0), 0);

    return {
      total_trades,
      winning_trades,
      losing_trades,
      win_rate: Math.round(win_rate * 100) / 100,
      total_pnl: Math.round(total_pnl * 100) / 100,
    };
  }

  // ============================================================================
  // BACKTEST STRATEGY METHODS
  // ============================================================================

  /**
   * Create a new backtest strategy
   */
  async createStrategy(userId: string, dto: CreateBacktestStrategyDto) {
    // Check for duplicate strategy name for this user
    const existing = await this.prisma.backtestStrategy.findFirst({
      where: {
        user_id: userId,
        name: dto.name,
        deleted_at: null,
      },
    });

    if (existing) {
      throw new BadRequestException('A strategy with this name already exists');
    }

    // Create the strategy
    const strategy = await this.prisma.backtestStrategy.create({
      data: {
        user_id: userId,
        name: dto.name,
        strategy_type: dto.strategy_type,
        allowed_patterns: dto.allowed_patterns,
        allowed_symbols: dto.allowed_symbols || [],
        timeframes: dto.timeframes || [],
        position_type: dto.position_type,
        risk_mode: dto.config.risk_mode,
        risk_per_trade_percentage: dto.config.risk_per_trade_percentage || 5.0,
        fixed_risk_amount: dto.config.fixed_risk_amount || 100.0,
        initial_capital: dto.config.initial_capital,
        min_risk_ratio: dto.config.min_risk_ratio,
        max_risk_ratio: dto.config.max_risk_ratio,
        max_position_size_usd: dto.config.max_position_size_usd,
        config: dto.config as unknown as Prisma.InputJsonValue,
      },
    });

    this.logger.log(`Backtest strategy ${strategy.id} created successfully`);
    return strategy;
  }

  /**
   * List all backtest strategies for a user with pagination
   */
  async listStrategies(
    userId: string,
    options: {
      cursor?: string;
      limit?: number;
      archived?: boolean;
    } = {},
  ) {
    const limit = options.limit || 20;

    // Build where clause with filters
    const where: Prisma.BacktestStrategyWhereInput = {
      user_id: userId,
      deleted_at: null, // ALWAYS exclude soft deleted strategies
      archived: options.archived ?? false, // Default to non-archived strategies
    };

    // Build query with or without cursor pagination
    const queryOptions: Prisma.BacktestStrategyFindManyArgs = {
      where,
      take: limit + 1, // Fetch one extra to determine if there are more
      orderBy: {
        created_at: 'desc',
      },
    };

    // Add cursor pagination if cursor is provided
    if (options.cursor) {
      queryOptions.skip = 1;
      queryOptions.cursor = {
        id: options.cursor,
      };
    }

    const [strategies, total] = await Promise.all([
      this.prisma.backtestStrategy.findMany(queryOptions),
      this.prisma.backtestStrategy.count({ where }),
    ]);

    // Check if there are more results
    const hasMore = strategies.length > limit;
    const data = hasMore ? strategies.slice(0, limit) : strategies;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return {
      data,
      pagination: {
        total,
        limit,
        nextCursor,
        hasMore,
      },
    };
  }

  /**
   * Get a backtest strategy by ID
   */
  async getStrategyById(userId: string, strategyId: string) {
    const strategy = await this.prisma.backtestStrategy.findFirst({
      where: {
        id: strategyId,
        user_id: userId,
        deleted_at: null, // Exclude soft deleted strategies only
        // Archived strategies are still accessible by ID
      },
    });

    if (!strategy) {
      throw new NotFoundException('Backtest strategy not found or has been deleted');
    }

    return strategy;
  }

  /**
   * Archive a backtest strategy
   */
  async archiveStrategy(userId: string, strategyId: string) {
    // First check if strategy exists and belongs to user
    const strategy = await this.prisma.backtestStrategy.findFirst({
      where: {
        id: strategyId,
        user_id: userId,
        deleted_at: null, // Cannot archive already deleted strategies
      },
    });

    if (!strategy) {
      throw new NotFoundException('Backtest strategy not found');
    }

    // Update strategy to archived
    const updatedStrategy = await this.prisma.backtestStrategy.update({
      where: { id: strategyId },
      data: {
        archived: true,
        archived_at: new Date(),
      },
    });

    this.logger.log(`Backtest strategy ${strategyId} archived successfully`);
    return updatedStrategy;
  }

  /**
   * Unarchive a backtest strategy
   */
  async unarchiveStrategy(userId: string, strategyId: string) {
    // First check if strategy exists and belongs to user
    const strategy = await this.prisma.backtestStrategy.findFirst({
      where: {
        id: strategyId,
        user_id: userId,
        deleted_at: null, // Cannot unarchive deleted strategies
      },
    });

    if (!strategy) {
      throw new NotFoundException('Backtest strategy not found');
    }

    // Update strategy to unarchived
    const updatedStrategy = await this.prisma.backtestStrategy.update({
      where: { id: strategyId },
      data: {
        archived: false,
        archived_at: null,
      },
    });

    this.logger.log(`Backtest strategy ${strategyId} unarchived successfully`);
    return updatedStrategy;
  }

  /**
   * Soft delete a backtest strategy
   */
  async softDeleteStrategy(userId: string, strategyId: string) {
    // First check if strategy exists and belongs to user
    const strategy = await this.prisma.backtestStrategy.findFirst({
      where: {
        id: strategyId,
        user_id: userId,
        deleted_at: null, // Cannot delete already deleted strategies
      },
    });

    if (!strategy) {
      throw new NotFoundException('Backtest strategy not found');
    }

    // Soft delete the strategy
    const deletedStrategy = await this.prisma.backtestStrategy.update({
      where: { id: strategyId },
      data: {
        deleted_at: new Date(),
      },
    });

    this.logger.log(`Backtest strategy ${strategyId} soft deleted successfully`);
    return {
      message: 'Strategy deleted successfully',
      id: deletedStrategy.id,
    };
  }
}
