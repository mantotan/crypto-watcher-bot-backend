import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TradingAccountService } from './trading-account.service';
import { CreateTradingAccountDto } from './dto/create-trading-account.dto';
import { UpdateTradingAccountDto } from './dto/update-trading-account.dto';
import { TestConnectionResponseDto } from './dto/test-connection-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Trading Accounts')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('trading-accounts')
export class TradingAccountController {
  constructor(private tradingAccountService: TradingAccountService) {}

  @Get()
  @ApiOperation({
    summary: 'List user trading accounts',
    description: 'Returns all trading accounts for the authenticated user',
  })
  @ApiResponse({
    status: 200,
    description: 'Trading accounts retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async listAccounts(@Request() req) {
    return this.tradingAccountService.listAccounts(req.user.id);
  }

  @Post()
  @ApiOperation({
    summary: 'Create new trading account',
    description:
      'Creates a new trading account with encrypted API credentials. API keys are encrypted before storage.',
  })
  @ApiResponse({
    status: 201,
    description: 'Trading account created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or unsupported exchange',
  })
  @ApiResponse({
    status: 409,
    description: 'Trading account with this name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async createAccount(@Request() req, @Body() dto: CreateTradingAccountDto) {
    return this.tradingAccountService.createAccount(req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get trading account details',
    description:
      'Returns details of a specific trading account including strategies count and portfolios summary',
  })
  @ApiParam({
    name: 'id',
    description: 'Trading account ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trading account retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Trading account not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getAccountById(@Request() req, @Param('id') id: string) {
    return this.tradingAccountService.getAccountById(req.user.id, id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update trading account',
    description:
      'Updates trading account details. Can update name and API credentials. Credentials are re-encrypted if provided.',
  })
  @ApiParam({
    name: 'id',
    description: 'Trading account ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trading account updated successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Trading account not found',
  })
  @ApiResponse({
    status: 409,
    description: 'Trading account with this name already exists',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async updateAccount(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateTradingAccountDto,
  ) {
    return this.tradingAccountService.updateAccount(req.user.id, id, dto);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete trading account',
    description:
      'Deletes a trading account. Validates that there are no active strategies or open positions before deletion.',
  })
  @ApiParam({
    name: 'id',
    description: 'Trading account ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trading account deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete account with active strategies or open positions',
  })
  @ApiResponse({
    status: 404,
    description: 'Trading account not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async deleteAccount(@Request() req, @Param('id') id: string) {
    return this.tradingAccountService.deleteAccount(req.user.id, id);
  }

  @Post(':id/test-connection')
  @ApiOperation({
    summary: 'Test exchange connection',
    description:
      'Tests the connection to the exchange using the stored API credentials. Returns account balance if successful.',
  })
  @ApiParam({
    name: 'id',
    description: 'Trading account ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Connection test completed',
    type: TestConnectionResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Trading account not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to decrypt API credentials',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async testConnection(@Request() req, @Param('id') id: string) {
    return this.tradingAccountService.testConnection(req.user.id, id);
  }
}
