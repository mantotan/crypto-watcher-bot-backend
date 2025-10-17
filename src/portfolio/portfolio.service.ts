import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { PortfolioPerformanceQueryDto, PerformanceTimeframe } from './dto/portfolio-performance-query.dto';
import { TradingMode } from '@prisma/client';

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

    // TODO: Implement historical portfolio snapshots
    // For now, return current snapshot only
    // In production, you would query a PortfolioSnapshot table for historical data

    const equity = Number(portfolio.balance) + Number(portfolio.unrealized_pnl);

    return {
      data: [
        {
          timestamp: portfolio.created_at.toISOString(),
          balance: Number(portfolio.initial_balance),
          equity: Number(portfolio.initial_balance),
          unrealized_pnl: 0,
          realized_pnl: 0,
        },
        {
          timestamp: now.toISOString(),
          balance: Number(portfolio.balance),
          equity,
          unrealized_pnl: Number(portfolio.unrealized_pnl),
          realized_pnl: Number(portfolio.realized_pnl),
        },
      ],
      note: 'Historical snapshots not yet implemented. Showing initial and current values only.',
    };
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
