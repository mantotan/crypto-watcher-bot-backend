import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GraphQLService } from '../graphql/graphql.service';
import { ListPositionsQueryDto } from './dto/list-positions-query.dto';
import { PositionChartQueryDto } from './dto/position-chart-query.dto';
import { TradingMode } from '@prisma/client';

@Injectable()
export class PositionService {
  constructor(
    private prisma: PrismaService,
    private graphqlService: GraphQLService,
  ) {}

  /**
   * Get positions for a strategy
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

    // Build where clause
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

    // Build query options
    const queryOptions: any = {
      where,
      take: limit + 1,
      orderBy: { created_at: 'desc' },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    // Query from appropriate table based on mode
    const positions =
      mode === TradingMode.REAL
        ? await this.prisma.position.findMany(queryOptions)
        : await this.prisma.paperPosition.findMany(queryOptions);

    // Check if there are more results
    const hasMore = positions.length > limit;
    const data = hasMore ? positions.slice(0, limit) : positions;

    // Calculate summary
    const activePositions = data.filter((p) => p.is_active);
    const totalUnrealizedPnl = activePositions.reduce(
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
        open_positions: activePositions.length,
        total_unrealized_pnl: totalUnrealizedPnl,
      },
    };
  }

  /**
   * Get position by ID
   */
  async getPositionById(userId: string, positionId: string, mode: TradingMode) {
    // Query from appropriate table
    const position =
      mode === TradingMode.REAL
        ? await this.prisma.position.findUnique({
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
          })
        : await this.prisma.paperPosition.findUnique({
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

    return position;
  }

  /**
   * Get candle data for position chart
   */
  async getPositionChartData(
    userId: string,
    positionId: string,
    query: PositionChartQueryDto,
  ) {
    const { mode, candles_before = 50, candles_after = 50 } = query;

    // Get position
    const position = await this.getPositionById(userId, positionId, mode);

    // Extract entry datetime
    const entryDatetime = position.created_at;

    // Get timeframe from position (fallback to '4h' for legacy data)
    const timeframe = (position as any).timeframe || '4h';

    try {
      const candleData = await this.graphqlService.getCandlesAroundTime(
        position.symbol,
        timeframe,
        entryDatetime,
        candles_before,
        candles_after,
      );

      return {
        position,
        candles: {
          before: candleData.before || [],
          after: candleData.after || [],
          reference_time: entryDatetime.toISOString(),
          total_candles: (candleData.before?.length || 0) + (candleData.after?.length || 0),
        },
      };
    } catch (error) {
      throw new BadRequestException(`Failed to fetch candle data: ${error.message}`);
    }
  }
}
