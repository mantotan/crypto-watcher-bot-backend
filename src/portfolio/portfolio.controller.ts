import {
  Controller,
  Get,
  Patch,
  Param,
  Query,
  Body,
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
import { PortfolioService } from './portfolio.service';
import { UpdatePortfolioDto } from './dto/update-portfolio.dto';
import { PortfolioPerformanceQueryDto } from './dto/portfolio-performance-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Portfolios')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class PortfolioController {
  constructor(private portfolioService: PortfolioService) {}

  @Get('strategies/:strategyId/portfolios')
  @ApiOperation({
    summary: 'Get portfolios for a strategy',
    description: 'Returns both REAL and PAPER portfolios for a strategy (if they exist)',
  })
  @ApiParam({
    name: 'strategyId',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Portfolios retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getStrategyPortfolios(@Request() req, @Param('strategyId') strategyId: string) {
    return this.portfolioService.getStrategyPortfolios(req.user.id, strategyId);
  }

  @Get('portfolios/:id')
  @ApiOperation({
    summary: 'Get portfolio details',
    description: 'Returns detailed information about a portfolio including strategy info and calculated equity',
  })
  @ApiParam({
    name: 'id',
    description: 'Portfolio ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Portfolio retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Portfolio not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPortfolioById(@Request() req, @Param('id') id: string) {
    return this.portfolioService.getPortfolioById(req.user.id, id);
  }

  @Get('portfolios/:id/performance')
  @ApiOperation({
    summary: 'Get portfolio performance over time',
    description:
      'Returns time-series performance data for a portfolio based on hourly snapshots. ' +
      'Use timeframe parameter to control date range (1D, 1W, 1M, 3M, 1Y, ALL). ' +
      'Use granularity parameter to control data aggregation (HOURLY, 12H, DAILY, WEEKLY). ' +
      'Falls back to initial and current values if no snapshots exist.',
  })
  @ApiParam({
    name: 'id',
    description: 'Portfolio ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Portfolio performance retrieved successfully with time-series data and summary statistics',
  })
  @ApiResponse({
    status: 404,
    description: 'Portfolio not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPortfolioPerformance(
    @Request() req,
    @Param('id') id: string,
    @Query() query: PortfolioPerformanceQueryDto,
  ) {
    return this.portfolioService.getPortfolioPerformance(req.user.id, id, query);
  }

  @Patch('portfolios/:id')
  @ApiOperation({
    summary: 'Update portfolio (deposit/withdrawal)',
    description:
      'Deposits or withdraws funds from a portfolio. Cannot do both in same request. ' +
      'For PAPER portfolios: updates database only. For REAL portfolios: may require exchange API integration.',
  })
  @ApiParam({
    name: 'id',
    description: 'Portfolio ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Portfolio updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid request - cannot deposit and withdraw simultaneously, or insufficient balance',
  })
  @ApiResponse({
    status: 404,
    description: 'Portfolio not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async updatePortfolio(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePortfolioDto,
  ) {
    return this.portfolioService.updatePortfolio(req.user.id, id, dto);
  }
}
