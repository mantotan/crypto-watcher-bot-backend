import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStrategyDto } from './dto/create-strategy.dto';
import { UpdateStrategyDto } from './dto/update-strategy.dto';
import { CopyStrategyDto } from './dto/copy-strategy.dto';
import { ListStrategiesQueryDto } from './dto/list-strategies-query.dto';
import { ListPublicStrategiesQueryDto } from './dto/list-public-strategies-query.dto';
import { TradingMode } from '@prisma/client';

@Injectable()
export class StrategyService {
  constructor(private prisma: PrismaService) {}

  /**
   * List user's strategies with filters and pagination
   */
  async listStrategies(userId: string, query: ListStrategiesQueryDto) {
    const {
      trading_account_id,
      mode,
      is_live,
      include_archived = false,
      archived_only = false,
      cursor,
      limit = 20,
    } = query;

    // Build where clause
    const where: any = {
      account: { user_id: userId },
      deleted_at: null, // Always exclude soft-deleted strategies
    };

    if (trading_account_id) {
      where.account_id = trading_account_id;
    }

    if (mode) {
      where.mode = mode;
    }

    if (is_live !== undefined) {
      where.is_live = is_live;
    }

    // Handle archive filtering
    if (archived_only) {
      where.archived = true;
    } else if (!include_archived) {
      where.archived = false;
    }

    // Build query options
    const queryOptions: any = {
      where,
      take: limit + 1, // Fetch one extra to check if there's more
      orderBy: { created_at: 'desc' },
      include: {
        account: {
          select: {
            id: true,
            name: true,
            exchange: true,
          },
        },
        portfolios: {
          select: {
            id: true,
            type: true,
            balance: true,
            available_balance: true,
            margin_used: true,
            unrealized_pnl: true,
            realized_pnl: true,
            total_fees_paid: true,
            initial_balance: true,
            total_deposits: true,
            total_withdrawals: true,
            total_trades: true,
            winning_trades: true,
            losing_trades: true,
            win_rate: true,
            profit_factor: true,
            max_drawdown: true,
            sharpe_ratio: true,
            created_at: true,
            updated_at: true,
          },
        },
      },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    const strategies = await this.prisma.strategy.findMany(queryOptions);

    // Check if there are more results
    const hasMore = strategies.length > limit;
    const data = hasMore ? strategies.slice(0, limit) : strategies;

    return {
      data,
      pagination: {
        total: data.length,
        limit,
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  /**
   * List public strategies (marketplace)
   */
  async listPublicStrategies(query: ListPublicStrategiesQueryDto) {
    const { search, sort = 'newest', cursor, limit = 20 } = query;

    // Build where clause - only public strategies that are not deleted or archived
    const where: any = {
      is_public: true,
      deleted_at: null,
      archived: false,
    };

    if (search) {
      where.name = {
        contains: search,
        mode: 'insensitive',
      };
    }

    // Determine order by based on sort
    let orderBy: any = { created_at: 'desc' }; // Default: newest

    if (sort === 'performance') {
      // Sort by portfolio win rate (join with portfolios)
      orderBy = { portfolios: { _count: 'desc' } }; // Simplified - adjust based on actual performance metric
    } else if (sort === 'popular') {
      // Sort by number of copies or views (if tracked)
      orderBy = { created_at: 'desc' }; // Placeholder - implement copy counter if needed
    }

    // Build query options
    const queryOptions: any = {
      where,
      take: limit + 1,
      orderBy,
      select: {
        id: true,
        name: true,
        mode: true,
        is_live: true,
        created_at: true,
        trade_size_type: true,
        trade_size_amount: true,
        trade_size_benchmark: true,
        allowed_signals: true,
        allowed_symbols: true,
        allowed_timeframes: true,
        portfolios: {
          select: {
            type: true,
            balance: true,
            unrealized_pnl: true,
            realized_pnl: true,
            win_rate: true,
            total_trades: true,
            winning_trades: true,
            losing_trades: true,
            sharpe_ratio: true,
            max_drawdown: true,
          },
        },
        account: {
          select: {
            user_id: true, // Will be anonymized
          },
        },
      },
    };

    if (cursor) {
      queryOptions.cursor = { id: cursor };
      queryOptions.skip = 1;
    }

    const strategies = await this.prisma.strategy.findMany(queryOptions);

    // Check if there are more results
    const hasMore = strategies.length > limit;
    const data = hasMore ? strategies.slice(0, limit) : strategies;

    // Anonymize user data
    const anonymizedData = data.map((strategy: any) => {
      const userId = strategy.account?.user_id || 'unknown';
      // Remove account from response
      const { account, ...rest } = strategy;
      return {
        ...rest,
        author: `User#${userId.slice(-8)}`, // Show only last 8 chars
      };
    });

    return {
      data: anonymizedData,
      pagination: {
        total: anonymizedData.length,
        limit,
        nextCursor: hasMore ? data[data.length - 1].id : null,
        hasMore,
      },
    };
  }

  /**
   * Get strategy details by ID
   */
  async getStrategyById(userId: string, strategyId: string) {
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        deleted_at: null,
      },
      include: {
        account: {
          select: {
            id: true,
            user_id: true,
            name: true,
            exchange: true,
          },
        },
        portfolios: {
          select: {
            id: true,
            type: true,
            balance: true,
            available_balance: true,
            margin_used: true,
            unrealized_pnl: true,
            realized_pnl: true,
            total_fees_paid: true,
            initial_balance: true,
            total_deposits: true,
            total_withdrawals: true,
            total_trades: true,
            winning_trades: true,
            losing_trades: true,
            win_rate: true,
            profit_factor: true,
            max_drawdown: true,
            sharpe_ratio: true,
            created_at: true,
            updated_at: true,
          },
        },
        _count: {
          select: {
            positions: true,
            paper_positions: true,
            orders: true,
          },
        },
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Check if user owns strategy OR strategy is public
    const isOwner = strategy.account.user_id === userId;
    const isPublic = strategy.is_public;

    if (!isOwner && !isPublic) {
      throw new ForbiddenException('You do not have access to this strategy');
    }

    // If not owner and strategy is public, hide sensitive configuration
    if (!isOwner && isPublic) {
      const { account, ...strategyData } = strategy;
      return {
        ...strategyData,
        trading_account: {
          id: account.id,
          name: 'Hidden',
          exchange: account.exchange,
        },
        author: `User#${account.user_id.slice(-8)}`,
      };
    }

    return strategy;
  }

  /**
   * Create a new strategy
   */
  async createStrategy(userId: string, dto: CreateStrategyDto) {
    // Verify trading account belongs to user
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: dto.trading_account_id,
        user_id: userId,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Check for duplicate name within the same trading account (excluding soft-deleted)
    const existingStrategy = await this.prisma.strategy.findFirst({
      where: {
        account_id: dto.trading_account_id,
        name: dto.name,
        deleted_at: null,
      },
    });

    if (existingStrategy) {
      throw new ConflictException('Strategy with this name already exists for this account');
    }

    // Default values
    const mode = dto.mode || TradingMode.PAPER;
    const is_live = dto.is_live || false;
    const is_public = dto.is_public || false;

    // Create strategy and portfolio in a transaction
    const result = await this.prisma.$transaction(async (prisma) => {
      // Create strategy
      const strategy = await prisma.strategy.create({
        data: {
          name: dto.name,
          account_id: dto.trading_account_id,
          trade_size_type: dto.trade_size_type || 'PERCENTAGE',
          trade_size_amount: dto.trade_size_amount || 5.0,
          trade_size_benchmark: dto.trade_size_benchmark || 'SL',
          min_risk_ratio: dto.min_risk_ratio,
          max_risk_ratio: dto.max_risk_ratio,
          allowed_signals: dto.allowed_signals || [],
          allowed_symbols: dto.allowed_symbols || [],
          allowed_timeframes: dto.allowed_timeframes || [],
          mode,
          is_live,
          is_public,
        },
      });

      // Create default portfolio based on mode
      const portfolio = await prisma.portfolio.create({
        data: {
          account_id: dto.trading_account_id,
          strategy_id: strategy.id,
          type: mode,
          balance: dto.initial_capital,
          available_balance: dto.initial_capital,
          initial_balance: dto.initial_capital,
        },
      });

      return { strategy, portfolio };
    });

    // Return strategy with portfolio
    return this.getStrategyById(userId, result.strategy.id);
  }

  /**
   * Copy a public strategy
   */
  async copyStrategy(userId: string, strategyId: string, dto: CopyStrategyDto) {
    // Get source strategy (must not be deleted)
    const sourceStrategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        deleted_at: null,
      },
      include: {
        account: true,
        portfolios: {
          where: { type: TradingMode.PAPER },
          take: 1,
        },
      },
    });

    if (!sourceStrategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Verify strategy is public
    if (!sourceStrategy.is_public) {
      throw new ForbiddenException('This strategy is not public');
    }

    // Verify trading account belongs to user
    const targetAccount = await this.prisma.tradingAccount.findFirst({
      where: {
        id: dto.trading_account_id,
        user_id: userId,
      },
    });

    if (!targetAccount) {
      throw new NotFoundException('Trading account not found');
    }

    // Generate name for copied strategy
    const name = dto.name || `Copy of ${sourceStrategy.name}`;

    // Check for duplicate name (excluding soft-deleted)
    const existingStrategy = await this.prisma.strategy.findFirst({
      where: {
        account_id: dto.trading_account_id,
        name,
        deleted_at: null,
      },
    });

    if (existingStrategy) {
      throw new ConflictException('Strategy with this name already exists for this account');
    }

    // Get initial capital from source portfolio
    const initialCapital = sourceStrategy.portfolios[0]?.initial_balance
      ? Number(sourceStrategy.portfolios[0].initial_balance)
      : 10000;

    // Create copied strategy
    const createDto: CreateStrategyDto = {
      name,
      trading_account_id: dto.trading_account_id,
      trade_size_type: sourceStrategy.trade_size_type,
      trade_size_amount: Number(sourceStrategy.trade_size_amount),
      trade_size_benchmark: sourceStrategy.trade_size_benchmark,
      min_risk_ratio: sourceStrategy.min_risk_ratio ? Number(sourceStrategy.min_risk_ratio) : undefined,
      max_risk_ratio: sourceStrategy.max_risk_ratio ? Number(sourceStrategy.max_risk_ratio) : undefined,
      allowed_signals: sourceStrategy.allowed_signals,
      allowed_symbols: sourceStrategy.allowed_symbols,
      allowed_timeframes: sourceStrategy.allowed_timeframes,
      mode: TradingMode.PAPER, // Always start as PAPER
      is_live: false, // Always start as inactive
      is_public: false, // Don't copy public status
      initial_capital: initialCapital,
    };

    return this.createStrategy(userId, createDto);
  }

  /**
   * Update strategy
   */
  async updateStrategy(userId: string, strategyId: string, dto: UpdateStrategyDto) {
    // Verify strategy exists and belongs to user (must not be deleted)
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        account: { user_id: userId },
        deleted_at: null,
      },
      include: {
        portfolios: true,
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Validation: Cannot change mode if is_live=true
    if (dto.mode && strategy.is_live) {
      throw new BadRequestException('Cannot change trading mode while strategy is live. Stop the strategy first.');
    }

    // Validation: Cannot change to REAL mode if REAL portfolio doesn't exist
    if (dto.mode === TradingMode.REAL) {
      const hasRealPortfolio = strategy.portfolios.some((p) => p.type === TradingMode.REAL);
      if (!hasRealPortfolio) {
        throw new BadRequestException('Cannot switch to REAL mode. REAL portfolio does not exist.');
      }
    }

    // Check for duplicate name if name is being updated (excluding soft-deleted)
    if (dto.name && dto.name !== strategy.name) {
      const existingStrategy = await this.prisma.strategy.findFirst({
        where: {
          account_id: strategy.account_id,
          name: dto.name,
          deleted_at: null,
        },
      });

      if (existingStrategy) {
        throw new ConflictException('Strategy with this name already exists for this account');
      }
    }

    // Update strategy
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: {
        name: dto.name,
        is_live: dto.is_live,
        mode: dto.mode,
        is_public: dto.is_public,
        is_active: dto.is_active,
        trade_size_type: dto.trade_size_type,
        trade_size_amount: dto.trade_size_amount,
        trade_size_benchmark: dto.trade_size_benchmark,
        min_risk_ratio: dto.min_risk_ratio,
        max_risk_ratio: dto.max_risk_ratio,
        allowed_signals: dto.allowed_signals,
        allowed_symbols: dto.allowed_symbols,
        allowed_timeframes: dto.allowed_timeframes,
      },
    });

    return this.getStrategyById(userId, strategyId);
  }

  /**
   * Soft delete strategy
   */
  async deleteStrategy(userId: string, strategyId: string) {
    // Verify strategy exists and belongs to user (must not be already deleted)
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        account: { user_id: userId },
        deleted_at: null,
      },
      include: {
        positions: {
          where: { is_active: true },
        },
        paper_positions: {
          where: { is_active: true },
        },
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Validate strategy is not live
    if (strategy.is_live) {
      throw new BadRequestException('Cannot delete a live strategy. Stop the strategy first.');
    }

    // Validate no open positions
    if (strategy.positions.length > 0 || strategy.paper_positions.length > 0) {
      throw new BadRequestException('Cannot delete strategy with open positions. Close all positions first.');
    }

    // Soft delete strategy (set deleted_at timestamp)
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: {
        deleted_at: new Date(),
      },
    });

    return { message: 'Strategy deleted successfully' };
  }

  /**
   * Archive strategy
   */
  async archiveStrategy(userId: string, strategyId: string) {
    // Verify strategy exists and belongs to user
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        account: { user_id: userId },
        deleted_at: null,
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Cannot archive a live strategy
    if (strategy.is_live) {
      throw new BadRequestException('Cannot archive a live strategy. Stop the strategy first.');
    }

    // Cannot archive an already archived strategy
    if (strategy.archived) {
      throw new BadRequestException('Strategy is already archived');
    }

    // Archive strategy
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: {
        archived: true,
        archived_at: new Date(),
      },
    });

    return { message: 'Strategy archived successfully' };
  }

  /**
   * Unarchive strategy
   */
  async unarchiveStrategy(userId: string, strategyId: string) {
    // Verify strategy exists and belongs to user
    const strategy = await this.prisma.strategy.findFirst({
      where: {
        id: strategyId,
        account: { user_id: userId },
        deleted_at: null,
      },
    });

    if (!strategy) {
      throw new NotFoundException('Strategy not found');
    }

    // Strategy must be archived
    if (!strategy.archived) {
      throw new BadRequestException('Strategy is not archived');
    }

    // Unarchive strategy
    await this.prisma.strategy.update({
      where: { id: strategyId },
      data: {
        archived: false,
        archived_at: null,
      },
    });

    return { message: 'Strategy unarchived successfully' };
  }

}
