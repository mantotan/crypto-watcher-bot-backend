import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTradingAccountDto } from './dto/create-trading-account.dto';
import { UpdateTradingAccountDto } from './dto/update-trading-account.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';
import { encrypt, decrypt } from '../common/utils/encryption.util';

@Injectable()
export class TradingAccountService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all trading accounts for a user
   */
  async listAccounts(userId: string) {
    const accounts = await this.prisma.tradingAccount.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        name: true,
        exchange: true,
        maker_fee: true,
        taker_fee: true,
        max_leverage: true,
        created_at: true,
        updated_at: true,
        encrypted_at: true,
        // Exclude api_key and secret_key for security
        _count: {
          select: {
            strategies: true,
            portfolios: true,
            positions: true,
          },
        },
      },
    });

    return { data: accounts };
  }

  /**
   * Create a new trading account
   */
  async createAccount(userId: string, dto: CreateTradingAccountDto) {
    // Validate exchange is supported
    if (dto.exchange !== 'binance') {
      throw new BadRequestException('Only Binance exchange is currently supported');
    }

    // Check for duplicate name
    const existingAccount = await this.prisma.tradingAccount.findUnique({
      where: {
        user_id_name: {
          user_id: userId,
          name: dto.name,
        },
      },
    });

    if (existingAccount) {
      throw new ConflictException('Trading account with this name already exists');
    }

    // Encrypt API credentials
    const encryptedApiKey = encrypt(dto.api_key);
    const encryptedSecretKey = encrypt(dto.api_secret);

    // Create trading account
    const account = await this.prisma.tradingAccount.create({
      data: {
        user_id: userId,
        name: dto.name,
        exchange: dto.exchange,
        api_key: encryptedApiKey,
        secret_key: encryptedSecretKey,
        encrypted_at: new Date(),
        ...(dto.maker_fee !== undefined && { maker_fee: dto.maker_fee }),
        ...(dto.taker_fee !== undefined && { taker_fee: dto.taker_fee }),
        ...(dto.max_leverage !== undefined && { max_leverage: dto.max_leverage }),
      },
      select: {
        id: true,
        name: true,
        exchange: true,
        maker_fee: true,
        taker_fee: true,
        max_leverage: true,
        created_at: true,
        updated_at: true,
        encrypted_at: true,
      },
    });

    return account;
  }

  /**
   * Get trading account by ID
   */
  async getAccountById(userId: string, accountId: string) {
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: accountId,
        user_id: userId,
      },
      select: {
        id: true,
        name: true,
        exchange: true,
        maker_fee: true,
        taker_fee: true,
        max_leverage: true,
        created_at: true,
        updated_at: true,
        encrypted_at: true,
        _count: {
          select: {
            strategies: true,
            portfolios: true,
            positions: true,
            paper_positions: true,
          },
        },
        portfolios: {
          select: {
            id: true,
            type: true,
            balance: true,
            unrealized_pnl: true,
            realized_pnl: true,
          },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    return account;
  }

  /**
   * Update trading account
   */
  async updateAccount(
    userId: string,
    accountId: string,
    dto: UpdateTradingAccountDto,
  ) {
    // Verify account exists and belongs to user
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: accountId,
        user_id: userId,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Check for duplicate name if name is being updated
    if (dto.name && dto.name !== account.name) {
      const existingAccount = await this.prisma.tradingAccount.findUnique({
        where: {
          user_id_name: {
            user_id: userId,
            name: dto.name,
          },
        },
      });

      if (existingAccount) {
        throw new ConflictException('Trading account with this name already exists');
      }
    }

    // Prepare update data
    const updateData: any = {};

    if (dto.name) {
      updateData.name = dto.name;
    }

    if (dto.api_key) {
      updateData.api_key = encrypt(dto.api_key);
      updateData.encrypted_at = new Date();
    }

    if (dto.api_secret) {
      updateData.secret_key = encrypt(dto.api_secret);
      updateData.encrypted_at = new Date();
    }

    if (dto.maker_fee !== undefined) {
      updateData.maker_fee = dto.maker_fee;
    }

    if (dto.taker_fee !== undefined) {
      updateData.taker_fee = dto.taker_fee;
    }

    if (dto.max_leverage !== undefined) {
      updateData.max_leverage = dto.max_leverage;
    }

    // Validate that at least one field is being updated
    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No fields provided to update');
    }

    // Update account
    const updatedAccount = await this.prisma.tradingAccount.update({
      where: { id: accountId },
      data: updateData,
      select: {
        id: true,
        name: true,
        exchange: true,
        maker_fee: true,
        taker_fee: true,
        max_leverage: true,
        created_at: true,
        updated_at: true,
        encrypted_at: true,
      },
    });

    return updatedAccount;
  }

  /**
   * Delete trading account
   */
  async deleteAccount(userId: string, accountId: string) {
    // Verify account exists and belongs to user
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: accountId,
        user_id: userId,
      },
      include: {
        strategies: {
          where: { is_live: true },
        },
        positions: {
          where: { is_active: true },
        },
        paper_positions: {
          where: { is_active: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Validate no active strategies
    if (account.strategies.length > 0) {
      throw new BadRequestException(
        'Cannot delete account with active (is_live=true) strategies. Please stop all strategies first.',
      );
    }

    // Validate no open positions
    if (account.positions.length > 0 || account.paper_positions.length > 0) {
      throw new BadRequestException(
        'Cannot delete account with open positions. Please close all positions first.',
      );
    }

    // Delete account (cascade will delete strategies and portfolios)
    await this.prisma.tradingAccount.delete({
      where: { id: accountId },
    });

    return { message: 'Trading account deleted successfully' };
  }

  /**
   * Test exchange connection
   */
  async testConnection(
    userId: string,
    accountId: string,
  ): Promise<TestConnectionResponseDto> {
    // Verify account exists and belongs to user
    const account = await this.prisma.tradingAccount.findFirst({
      where: {
        id: accountId,
        user_id: userId,
      },
    });

    if (!account) {
      throw new NotFoundException('Trading account not found');
    }

    // Decrypt credentials
    let apiKey: string;
    let secretKey: string;

    try {
      apiKey = decrypt(account.api_key);
      secretKey = decrypt(account.secret_key);
    } catch (error) {
      throw new BadRequestException('Failed to decrypt API credentials');
    }

    // TODO: Implement actual exchange API call
    // For now, return a mock response
    // In production, this should call the Binance API to verify credentials
    try {
      // Mock exchange API call
      // const binance = new Binance({ apiKey, apiSecret: secretKey });
      // const accountInfo = await binance.accountInfo();
      // const balance = accountInfo.balances.find(b => b.asset === 'USDT')?.free || 0;

      return {
        success: true,
        message: 'Connection successful (mock implementation - exchange integration pending)',
        balance: 10000, // Mock balance
      };
    } catch (error) {
      return {
        success: false,
        message: `Connection failed: ${error.message}`,
      };
    }
  }
}
