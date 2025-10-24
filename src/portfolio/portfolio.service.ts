import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import {
  PortfolioPerformanceQueryDto,
  PerformanceTimeframe,
  PerformanceGranularity
} from './dto/portfolio-performance-query.dto';
import { TradingMode, Prisma } from '@prisma/client';

@Injectable()
export class PortfolioService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get portfolios for a strategy (both REAL and PAPER)
   */
  async getStrategyPortfolios(userId: string, strategyId: string) {
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

    // Get portfolios
    const portfolios = await this.prisma.portfolio.findMany({
      where: { strategy_id: strategyId },
    });

    // Separate by type
    const real = portfolios.find((p) => p.type === TradingMode.REAL);
    const paper = portfolios.find((p) => p.type === TradingMode.PAPER);

    return {
      real: real || null,
      paper: paper || null,
    };
  }

  /**
   * Get portfolio by ID
   */
  async getPortfolioById(userId: string, portfolioId: string) {
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        strategy: {
          select: {
            id: true,
            name: true,
            mode: true,
            is_live: true,
            account: {
              select: {
                user_id: true,
                name: true,
                exchange: true,
              },
            },
          },
        },
        account: {
          select: {
            id: true,
            name: true,
            exchange: true,
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    // Verify user owns portfolio
    if (portfolio.strategy.account.user_id !== userId) {
      throw new NotFoundException('Portfolio not found');
    }

    // Calculate equity
    const equity = Number(portfolio.balance) + Number(portfolio.unrealized_pnl);

    return {
      ...portfolio,
      equity,
    };
  }

  /**
   * Get portfolio performance over time
   */
  async getPortfolioPerformance(
    userId: string,
    portfolioId: string,
    query: PortfolioPerformanceQueryDto,
  ) {
    // Verify portfolio exists and belongs to user
    const portfolio = await this.getPortfolioById(userId, portfolioId);

    // Calculate date range based on timeframe
    const now = new Date();
    let startDate = new Date();

    switch (query.timeframe) {
      case PerformanceTimeframe.ONE_DAY:
        startDate.setDate(now.getDate() - 1);
        break;
      case PerformanceTimeframe.ONE_WEEK:
        startDate.setDate(now.getDate() - 7);
        break;
      case PerformanceTimeframe.ONE_MONTH:
        startDate.setMonth(now.getMonth() - 1);
        break;
      case PerformanceTimeframe.THREE_MONTHS:
        startDate.setMonth(now.getMonth() - 3);
        break;
      case PerformanceTimeframe.ONE_YEAR:
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case PerformanceTimeframe.ALL:
        startDate = portfolio.created_at;
        break;
    }

    // Query portfolio snapshots from database
    const snapshots = await this.prisma.portfolioSnapshot.findMany({
      where: {
        portfolio_id: portfolioId,
        snapshot_at: {
          gte: startDate,
          lte: now,
        },
      },
      orderBy: {
        snapshot_at: 'asc',
      },
    });

    // If no snapshots found, return initial and current values as fallback
    if (snapshots.length === 0) {
      const equity = Number(portfolio.balance) + Number(portfolio.unrealized_pnl);
      const initialBalance = Number(portfolio.initial_balance);
      const endBalance = Number(portfolio.balance);
      const totalReturn = Number(portfolio.realized_pnl) + Number(portfolio.unrealized_pnl);

      return {
        data: [
          {
            timestamp: portfolio.created_at.toISOString(),
            balance: initialBalance,
            equity: initialBalance,
            available_balance: initialBalance,
            margin_used: 0,
            unrealized_pnl: 0,
            realized_pnl: 0,
            total_fees_paid: 0,
            trading_fees: 0,
            funding_fees: 0,
            total_trades: 0,
            win_rate: 0,
            open_positions_count: 0,
            positions_skipped: 0,
          },
          {
            timestamp: now.toISOString(),
            balance: endBalance,
            equity,
            available_balance: Number(portfolio.available_balance),
            margin_used: Number(portfolio.margin_used),
            unrealized_pnl: Number(portfolio.unrealized_pnl),
            realized_pnl: Number(portfolio.realized_pnl),
            total_fees_paid: Number(portfolio.total_fees_paid),
            trading_fees: Number(portfolio.trading_fees),
            funding_fees: Number(portfolio.funding_fees),
            total_trades: portfolio.total_trades,
            win_rate: Number(portfolio.win_rate),
            open_positions_count: 0, // Not available in Portfolio table
            positions_skipped: 0,    // Not available in Portfolio table
          },
        ],
        summary: {
          start_balance: initialBalance,
          end_balance: endBalance,
          total_return: totalReturn,
          return_percentage: initialBalance > 0 ? ((endBalance - initialBalance) / initialBalance) * 100 : 0,
        },
      };
    }

    // Aggregate snapshots based on granularity
    const aggregatedData = this.aggregateSnapshots(snapshots, query.granularity);

    // Calculate summary statistics
    const firstSnapshot = aggregatedData[0];
    const lastSnapshot = aggregatedData[aggregatedData.length - 1];
    const startBalance = Number(firstSnapshot.balance);
    const endBalance = Number(lastSnapshot.balance);
    const totalReturn = Number(lastSnapshot.realized_pnl) + Number(lastSnapshot.unrealized_pnl);

    return {
      data: aggregatedData.map((snapshot) => ({
        timestamp: snapshot.snapshot_at.toISOString(),
        balance: Number(snapshot.balance),
        equity: Number(snapshot.balance) + Number(snapshot.unrealized_pnl),
        available_balance: Number(snapshot.available_balance),
        margin_used: Number(snapshot.margin_used),
        unrealized_pnl: Number(snapshot.unrealized_pnl),
        realized_pnl: Number(snapshot.realized_pnl),
        total_fees_paid: Number(snapshot.total_fees_paid),
        trading_fees: Number(snapshot.trading_fees),
        funding_fees: Number(snapshot.funding_fees),
        total_trades: snapshot.total_trades,
        win_rate: Number(snapshot.win_rate),
        open_positions_count: snapshot.open_positions_count,
        positions_skipped: snapshot.positions_skipped,
      })),
      summary: {
        start_balance: startBalance,
        end_balance: endBalance,
        total_return: totalReturn,
        return_percentage: startBalance > 0 ? ((endBalance - startBalance) / startBalance) * 100 : 0,
        total_snapshots: snapshots.length,
        aggregated_points: aggregatedData.length,
      },
    };
  }

  /**
   * Aggregate snapshots based on granularity
   * Takes the last snapshot in each time interval
   */
  private aggregateSnapshots(
    snapshots: Prisma.PortfolioSnapshotGetPayload<{}>[],
    granularity?: PerformanceGranularity
  ): Prisma.PortfolioSnapshotGetPayload<{}>[] {
    if (!granularity || granularity === PerformanceGranularity.HOURLY) {
      // Return all hourly snapshots
      return snapshots;
    }

    // Group snapshots by time interval
    const groups = new Map<string, Prisma.PortfolioSnapshotGetPayload<{}>[]>();

    snapshots.forEach((snapshot) => {
      const date = new Date(snapshot.snapshot_at);
      let groupKey: string;

      switch (granularity) {
        case PerformanceGranularity.TWELVE_HOURLY:
          // Group by 12-hour intervals (0-11, 12-23)
          const twelveHourBlock = Math.floor(date.getUTCHours() / 12);
          groupKey = `${date.toISOString().split('T')[0]}_${twelveHourBlock}`;
          break;

        case PerformanceGranularity.DAILY:
          // Group by day (UTC)
          groupKey = date.toISOString().split('T')[0];
          break;

        case PerformanceGranularity.WEEKLY:
          // Group by week (ISO week)
          const weekStart = new Date(date);
          weekStart.setUTCHours(0, 0, 0, 0);
          const dayOfWeek = weekStart.getUTCDay();
          const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start of week
          weekStart.setUTCDate(weekStart.getUTCDate() - diff);
          groupKey = weekStart.toISOString().split('T')[0];
          break;

        default:
          groupKey = date.toISOString();
      }

      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(snapshot);
    });

    // For each group, take the last snapshot (most recent in that interval)
    // Since snapshots are already ordered ASC from DB, the last item is the most recent
    const aggregated: Prisma.PortfolioSnapshotGetPayload<{}>[] = [];
    groups.forEach((group) => {
      // Take the last snapshot in the group (most recent)
      aggregated.push(group[group.length - 1]);
    });

    // Sort final result by timestamp ascending
    aggregated.sort((a, b) => new Date(a.snapshot_at).getTime() - new Date(b.snapshot_at).getTime());

    return aggregated;
  }

  /**
   * Update portfolio (deposits/withdrawals)
   */
  async updatePortfolio(
    userId: string,
    portfolioId: string,
    dto: UpdatePortfolioDto,
  ) {
    // Verify portfolio exists and belongs to user
    const portfolio = await this.prisma.portfolio.findUnique({
      where: { id: portfolioId },
      include: {
        strategy: {
          include: {
            account: {
              select: { user_id: true },
            },
          },
        },
      },
    });

    if (!portfolio) {
      throw new NotFoundException('Portfolio not found');
    }

    // Verify user owns portfolio
    if (portfolio.strategy.account.user_id !== userId) {
      throw new NotFoundException('Portfolio not found');
    }

    // CRITICAL: Only allow manual balance adjustments for PAPER portfolios
    if (portfolio.type === TradingMode.REAL) {
      throw new BadRequestException(
        'Cannot manually adjust REAL portfolio balance. REAL portfolios are managed by the exchange and trading service.',
      );
    }

    // Validate deposit and withdrawal not both provided
    if (dto.deposit && dto.withdrawal) {
      throw new BadRequestException('Cannot deposit and withdraw in the same request');
    }

    // Calculate new balances
    let newBalance = Number(portfolio.balance);
    let newAvailableBalance = Number(portfolio.available_balance);
    let newTotalDeposits = Number(portfolio.total_deposits);
    let newTotalWithdrawals = Number(portfolio.total_withdrawals);

    if (dto.deposit) {
      // Handle deposit
      newBalance += dto.deposit;
      newAvailableBalance += dto.deposit;
      newTotalDeposits += dto.deposit;

      // TODO: For REAL portfolios, implement exchange API deposit verification
    }

    if (dto.withdrawal) {
      // Handle withdrawal
      if (dto.withdrawal > newAvailableBalance) {
        throw new BadRequestException(
          `Insufficient available balance. Available: ${newAvailableBalance}, Requested: ${dto.withdrawal}`,
        );
      }

      newBalance -= dto.withdrawal;
      newAvailableBalance -= dto.withdrawal;
      newTotalWithdrawals += dto.withdrawal;

      // TODO: For REAL portfolios, implement exchange API withdrawal
    }

    // Update portfolio
    const updatedPortfolio = await this.prisma.portfolio.update({
      where: { id: portfolioId },
      data: {
        balance: newBalance,
        available_balance: newAvailableBalance,
        total_deposits: newTotalDeposits,
        total_withdrawals: newTotalWithdrawals,
      },
    });

    return updatedPortfolio;
  }
}
