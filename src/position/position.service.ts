import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphQLService } from '../graphql/graphql.service';
import { ListPositionsQueryDto } from './dto/list-positions-query.dto';
import { PositionChartQueryDto } from './dto/position-chart-query.dto';
import { TradingMode } from '@prisma/client';

@Injectable()
export class PositionService {
  private readonly logger = new Logger(PositionService.name);

  constructor(
    private prisma: PrismaService,
    private graphqlService: GraphQLService,
  ) {}

  /**
   * Get positions for a strategy
   * For PAPER mode, queries PaperPosition (open) and/or PaperTrade (closed) tables
   */
  async getStrategyPositions(
    userId: string,
    strategyId: string,
    query: ListPositionsQueryDto,
  ) {
    // Verify strategy exists and belongs to user
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        account: { user_id: userId },
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    const { mode, symbol, side, status, cursor, limit = 20 } = query;

    if (mode === TradingMode.REAL) {
      return this.getRealPositions(strategyId, query);
    } else {
      return this.getPaperPositions(strategyId, query);
    }
  }

  /**
   * Get real positions (existing logic)
   */
  private async getRealPositions(strategyId: string, query: ListPositionsQueryDto) {
    const { symbol, side, status, cursor, limit = 20 } = query;

    const where: any = { strategy_id: strategyId };

    if (symbol) {
      where.symbol = symbol;
    }

    if (side) {
      where.side = side;
    }

    if (status === 'OPEN') {
      where.is_active = true;
    } else if (status === 'CLOSED') {
      where.is_active = false;
    }

    const queryOptions: any = {
      where,
      take: limit + 1,
      orderBy: { created_at: 'desc' },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    const positions = await this.prisma.position.findMany(queryOptions);

    const hasMore = positions.length > limit;
    const data = hasMore ? positions.slice(0, limit) : positions;

    // Add status field to each position
    const dataWithStatus = data.map((p) => ({
      ...p,
      status: p.is_active ? 'OPEN' : 'CLOSED',
    }));

    const activePositions = data.filter((p) => p.is_active);
    const totalUnrealizedPnl = activePositions.reduce(
      (sum, p) => sum + (Number(p.unrealized_pnl) || 0),
      0,
    );

    return {
      data: dataWithStatus,
      pagination: {
        total: data.length,
        limit,
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
      summary: {
        total_positions: data.length,
        open_positions: activePositions.length,
        total_unrealized_pnl: totalUnrealizedPnl,
      },
    };
  }

  /**
   * Get paper positions/trades (queries both PaperPosition and PaperTrade tables)
   */
  private async getPaperPositions(strategyId: string, query: ListPositionsQueryDto) {
    const { symbol, side, status, cursor, limit = 20 } = query;

    const baseWhere: any = { strategy_id: strategyId };

    if (symbol) {
      baseWhere.symbol = symbol;
    }

    if (side) {
      baseWhere.side = side;
    }

    let allResults: any[] = [];

    // Determine which table(s) to query based on status filter
    if (!status || status === 'OPEN') {
      // Query open positions from PaperPosition
      const openPositions = await this.prisma.paperPosition.findMany({
        where: { ...baseWhere, is_active: true },
        orderBy: { created_at: 'desc' },
        // Fetch more to ensure we have enough after merging
        take: !status ? limit + 1 : limit + 1,
      });

      // Map to include status field
      const mappedOpen = openPositions.map((p) => ({
        ...p,
        status: 'OPEN' as const,
        // Ensure consistent field names
        exit_datetime: null,
        exit_price: null,
        exit_reason: null,
        net_pnl: null,
        roi_percentage: null,
        gross_pnl: null,
        total_fees: null,
        funding_rate_fees: null,
        bars_held: null,
        duration_seconds: null,
        portfolio_balance_before: null,
        portfolio_balance_after: null,
      }));

      allResults.push(...mappedOpen);
    }

    if (!status || status === 'CLOSED') {
      // Query closed trades from PaperTrade
      const closedTrades = await this.prisma.paperTrade.findMany({
        where: baseWhere,
        orderBy: { created_at: 'desc' },
        take: !status ? limit + 1 : limit + 1,
      });

      // Map to include status field and match PaperPosition schema
      const mappedClosed = closedTrades.map((t) => ({
        ...t,
        status: 'CLOSED' as const,
        // Ensure consistent field names (PaperPosition fields that don't exist in PaperTrade)
        is_active: false,
        mark_price: t.exit_price, // Use exit price as mark price for closed trades
        unrealized_pnl: null, // Closed trades don't have unrealized PnL
      }));

      allResults.push(...mappedClosed);
    }

    // Sort merged results by created_at descending
    allResults.sort((a, b) => {
      const timeA = a.created_at?.getTime() || 0;
      const timeB = b.created_at?.getTime() || 0;
      return timeB - timeA;
    });

    // Apply cursor-based pagination on merged results
    if (cursor) {
      const cursorIndex = allResults.findIndex((item) => item.id === cursor);
      if (cursorIndex !== -1) {
        allResults = allResults.slice(cursorIndex + 1);
      }
    }

    // Check if there are more results
    const hasMore = allResults.length > limit;
    const data = hasMore ? allResults.slice(0, limit) : allResults;

    // Calculate summary
    const openPositions = data.filter((p) => p.status === 'OPEN');
    const totalUnrealizedPnl = openPositions.reduce(
      (sum, p) => sum + (Number(p.unrealized_pnl) || 0),
      0,
    );

    return {
      data,
      pagination: {
        total: data.length,
        limit,
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
      summary: {
        total_positions: data.length,
        open_positions: openPositions.length,
        total_unrealized_pnl: totalUnrealizedPnl,
      },
    };
  }

  /**
   * Get position by ID
   * For PAPER mode, checks both PaperPosition and PaperTrade tables
   */
  async getPositionById(userId: string, positionId: string, mode: TradingMode) {
    if (mode === TradingMode.REAL) {
      // Query from Position table
      const position = await this.prisma.position.findUnique({
        where: { id: positionId },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
              account: {
                select: {
                  user_id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (!position) {
        throw new NotFoundException('Position not found');
      }

      // Verify user owns position
      if (position.strategy.account.user_id !== userId) {
        throw new NotFoundException('Position not found');
      }

      // Add status field
      return {
        ...position,
        status: position.is_active ? 'OPEN' : 'CLOSED',
      };
    } else {
      // For PAPER mode, check both PaperPosition and PaperTrade
      // Try PaperPosition first (open positions)
      const paperPosition = await this.prisma.paperPosition.findUnique({
        where: { id: positionId },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
              account: {
                select: {
                  user_id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (paperPosition) {
        // Verify user owns position
        if (paperPosition.strategy.account.user_id !== userId) {
          throw new NotFoundException('Position not found');
        }

        // Map to unified format with status field
        return {
          ...paperPosition,
          status: 'OPEN' as const,
          exit_datetime: null,
          exit_price: null,
          exit_reason: null,
          net_pnl: null,
          roi_percentage: null,
          gross_pnl: null,
          total_fees: null,
          funding_rate_fees: null,
          bars_held: null,
          duration_seconds: null,
          portfolio_balance_before: null,
          portfolio_balance_after: null,
        };
      }

      // Try PaperTrade (closed trades)
      const paperTrade = await this.prisma.paperTrade.findUnique({
        where: { id: positionId },
        include: {
          strategy: {
            select: {
              id: true,
              name: true,
              account: {
                select: {
                  user_id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      if (paperTrade) {
        // Verify user owns trade
        if (paperTrade.strategy.account.user_id !== userId) {
          throw new NotFoundException('Position not found');
        }

        // Map to unified format with status field
        return {
          ...paperTrade,
          status: 'CLOSED' as const,
          is_active: false,
          mark_price: paperTrade.exit_price,
          unrealized_pnl: null,
        };
      }

      // Not found in either table
      throw new NotFoundException('Position not found');
    }
  }

  /**
   * Find the candle that matches a trade based on datetime and price
   * Uses hybrid approach: finds by datetime first, validates price is in range,
   * and searches nearby candles if needed
   */
  private findCandleByDatetimeAndPrice(
    candles: any[],
    targetDatetime: Date,
    targetPrice: number,
    searchWindowCandles: number = 10,
  ): string | null {
    if (!candles || candles.length === 0) return null;

    const targetTime = targetDatetime.getTime();
    const priceNum = Number(targetPrice);

    if (isNaN(priceNum)) return null;

    // Step 1: Find the candle by datetime (at or before target time)
    let datetimeMatchCandle: any = null;
    let minTimeDiff = Infinity;
    let datetimeMatchIndex = -1;

    for (let i = 0; i < candles.length; i++) {
      const candle = candles[i];
      const candleTime = new Date(candle.timestamp).getTime();
      const diff = targetTime - candleTime;

      // Only consider candles at or before the target time
      if (diff >= 0 && diff < minTimeDiff) {
        minTimeDiff = diff;
        datetimeMatchCandle = candle;
        datetimeMatchIndex = i;
      }
    }

    // Step 2: Check if the price is in the datetime-matched candle
    if (datetimeMatchCandle) {
      const inRange = priceNum >= datetimeMatchCandle.low && priceNum <= datetimeMatchCandle.high;
      if (inRange) {
        return datetimeMatchCandle.timestamp;
      }
    }

    // Step 3: Price not in datetime match - search nearby candles
    // Search within a window around the datetime match
    const searchStart = Math.max(0, datetimeMatchIndex - searchWindowCandles);
    const searchEnd = Math.min(candles.length, datetimeMatchIndex + searchWindowCandles + 1);

    for (let i = searchStart; i < searchEnd; i++) {
      const candle = candles[i];
      const inRange = priceNum >= candle.low && priceNum <= candle.high;

      if (inRange) {
        // Found a candle with the price - prefer the one closest to target datetime
        return candle.timestamp;
      }
    }

    // Step 4: Fallback to datetime match even if price not in range
    return datetimeMatchCandle ? datetimeMatchCandle.timestamp : null;
  }

  /**
   * Get candle data for position chart
   * Handles both open positions and closed trades
   * For closed positions: automatically calculates candles needed to show complete lifecycle
   * with minimum 30 candles before entry and 30 candles after exit
   */
  async getPositionChartData(
    userId: string,
    positionId: string,
    query: PositionChartQueryDto,
  ) {
    const { mode, candles_before = 50, candles_after = 50 } = query;

    // Get position (will return unified format from either table)
    const position = await this.getPositionById(userId, positionId, mode);

    // Extract entry datetime - use entry_datetime for closed trades, created_at for open positions
    const entryDatetime = (position as any).entry_datetime || position.created_at;

    // Get timeframe from position (fallback to '4h' for legacy data or Real positions)
    const timeframe = (position as any).timeframe || '4h';

    // Warn if using fallback timeframe (indicates Real position or legacy data)
    if (!(position as any).timeframe) {
      this.logger.debug(
        `Position ${positionId}: No timeframe in position data. Using default '4h'. ` +
        `This may occur for Real trading positions or legacy data.`
      );
    }

    // Calculate actual candles needed for closed positions
    let actualCandlesBefore = candles_before;
    let actualCandlesAfter = candles_after;

    const isClosed = (position as any).status === 'CLOSED';
    if (isClosed && (position as any).exit_datetime) {
      try {
        const exitDatetime = (position as any).exit_datetime;
        const durationMs = exitDatetime.getTime() - entryDatetime.getTime();

        // Validate duration (detect corrupted data)
        if (durationMs < 0) {
          this.logger.warn(
            `Position ${positionId}: Exit datetime is before entry datetime. ` +
            `Entry: ${entryDatetime.toISOString()}, Exit: ${exitDatetime.toISOString()}. ` +
            `Using default candle counts.`
          );
        } else if (durationMs === 0) {
          this.logger.debug(
            `Position ${positionId}: Zero duration (instant close). Using default candle counts.`
          );
        } else {
          // Get candle interval (may throw if timeframe is invalid)
          const candleIntervalMs = this.graphqlService.getCandleInterval(timeframe);
          const candlesFromEntryToExit = Math.ceil(durationMs / candleIntervalMs);

          // Ensure minimum 30 candles before entry
          actualCandlesBefore = Math.max(30, candles_before);

          // Ensure we cover entry → exit + at least 30 candles after exit
          // Apply reasonable upper limit to prevent excessive data fetching
          const MAX_CANDLES_AFTER = 5000; // ~52 days at 15m, ~833 days at 4h
          const desiredCandlesAfter = candlesFromEntryToExit + 30;
          actualCandlesAfter = Math.max(candles_after, Math.min(desiredCandlesAfter, MAX_CANDLES_AFTER));

          // Warn if position duration exceeds limit
          if (desiredCandlesAfter > MAX_CANDLES_AFTER) {
            const durationDays = (durationMs / (1000 * 60 * 60 * 24)).toFixed(1);
            this.logger.warn(
              `Position ${positionId} (${position.symbol} ${timeframe}): ` +
              `Very long duration (${durationDays} days, ${candlesFromEntryToExit} candles). ` +
              `Limiting to ${MAX_CANDLES_AFTER} candles after entry. Exit may not be visible.`
            );
          }

          this.logger.debug(
            `Position ${positionId} (${position.symbol} ${timeframe}): ` +
            `Closed position requires ${candlesFromEntryToExit} candles from entry to exit. ` +
            `Fetching ${actualCandlesBefore} before (min 30) and ${actualCandlesAfter} after (exit + 30 buffer).`
          );
        }
      } catch (error) {
        this.logger.error(
          `Failed to calculate candles for position ${positionId}: ${error.message}. ` +
          `Using default candle counts (${candles_before} before, ${candles_after} after).`,
          error.stack
        );
        // Keep defaults on error
        actualCandlesBefore = candles_before;
        actualCandlesAfter = candles_after;
      }
    }

    // GraphQL service now handles errors gracefully and returns partial/empty data
    const candleData = await this.graphqlService.getCandlesAroundTime(
      position.symbol,
      timeframe,
      entryDatetime,
      actualCandlesBefore,
      actualCandlesAfter,
    );

    const totalCandles = (candleData.before?.length || 0) + (candleData.after?.length || 0);

    // Log warning if no candles available
    if (totalCandles === 0) {
      this.logger.warn(
        `No candles available for position ${positionId} (${position.symbol} ${timeframe} at ${entryDatetime.toISOString()})`,
      );
    }

    // Find candles that match entry and exit datetimes + prices
    const allCandles = [...(candleData.before || []), ...(candleData.after || [])];
    const entryPrice = (position as any).entry_price;
    const exitDatetime = (position as any).exit_datetime;
    const exitPrice = (position as any).exit_price;

    const entryCandleTimestamp = this.findCandleByDatetimeAndPrice(
      allCandles,
      entryDatetime,
      entryPrice,
    );

    const exitCandleTimestamp = isClosed && exitDatetime && exitPrice
      ? this.findCandleByDatetimeAndPrice(allCandles, exitDatetime, exitPrice)
      : null;

    return {
      position,
      candles: {
        before: candleData.before || [],
        after: candleData.after || [],
        reference_time: entryDatetime.toISOString(),
        total_candles: totalCandles,
        entry_candle_timestamp: entryCandleTimestamp,
        ...(isClosed && exitCandleTimestamp && { exit_candle_timestamp: exitCandleTimestamp }),
        ...(totalCandles === 0 && {
          error: 'No candle data available from chart service for this time range',
        }),
      },
    };
  }
}
