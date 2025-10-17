import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TradingMode } from '@prisma/client';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get dashboard summary for user
   */
  async getDashboardSummary(userId: string) {
    // Get all user's strategies
    const strategies = await this.prisma.strategy.findMany({
      where: {
        account: { user_id: userId },
      },
      include: {
        portfolios: {
          select: {
            id: true,
            type: true,
            balance: true,
            unrealized_pnl: true,
            realized_pnl: true,
            win_rate: true,
            total_trades: true,
            created_at: true,
          },
        },
        positions: {
          where: { is_active: true },
        },
        paper_positions: {
          where: { is_active: true },
        },
      },
    });

    // Count totals
    const totalStrategies = strategies.length;
    const liveStrategies = strategies.filter((s) => s.is_live).length;

    // Calculate total portfolios value
    const totalPortfoliosValue = strategies.reduce((sum, strategy) => {
      const portfolioValue = strategy.portfolios.reduce((pSum, p) => {
        return pSum + Number(p.balance) + Number(p.unrealized_pnl);
      }, 0);
      return sum + portfolioValue;
    }, 0);

    // Count open positions (both REAL and PAPER)
    const openPositions = strategies.reduce((sum, strategy) => {
      return sum + strategy.positions.length + strategy.paper_positions.length;
    }, 0);

    // Calculate today's P&L (approximation - would need historical snapshots for accuracy)
    // For now, return total unrealized P&L as proxy
    const todayPnl = strategies.reduce((sum, strategy) => {
      const pnl = strategy.portfolios.reduce((pSum, p) => {
        return pSum + Number(p.unrealized_pnl);
      }, 0);
      return sum + pnl;
    }, 0);

    // Get top 5 strategies by 7-day performance
    // Note: Without historical snapshots, we'll sort by current performance metrics
    const strategiesByPerformance = strategies
      .map((strategy) => {
        // Get primary portfolio (based on strategy mode)
        const primaryPortfolio = strategy.portfolios.find(
          (p) => p.type === strategy.mode,
        );

        if (!primaryPortfolio) {
          return null;
        }

        // Calculate 7-day performance (approximation)
        // In production, this should calculate actual P&L change over last 7 days
        const initialBalance = Number(primaryPortfolio.balance);
        const currentEquity = initialBalance + Number(primaryPortfolio.unrealized_pnl);
        const performance7d =
          initialBalance > 0
            ? ((currentEquity - initialBalance) / initialBalance) * 100
            : 0;

        return {
          strategy: {
            id: strategy.id,
            name: strategy.name,
            mode: strategy.mode,
            is_live: strategy.is_live,
          },
          portfolio: {
            type: primaryPortfolio.type,
            balance: Number(primaryPortfolio.balance),
            unrealized_pnl: Number(primaryPortfolio.unrealized_pnl),
            realized_pnl: Number(primaryPortfolio.realized_pnl),
            win_rate: Number(primaryPortfolio.win_rate),
            total_trades: primaryPortfolio.total_trades,
          },
          performance_7d: performance7d,
        };
      })
      .filter((item) => item !== null)
      .sort((a, b) => b.performance_7d - a.performance_7d)
      .slice(0, 5);

    return {
      total_strategies: totalStrategies,
      live_strategies: liveStrategies,
      total_portfolios_value: totalPortfoliosValue,
      today_pnl: todayPnl,
      open_positions: openPositions,
      strategies_by_performance: strategiesByPerformance,
      note: 'today_pnl and performance_7d are approximations. Historical snapshot tracking needed for accurate calculations.',
    };
  }
}
