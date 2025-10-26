import {
  Controller,
  Get,
  Param,
  Query,
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
import { PositionService } from './position.service';
import { ListPositionsQueryDto } from './dto/list-positions-query.dto';
import { PositionChartQueryDto } from './dto/position-chart-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Positions')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller()
export class PositionController {
  constructor(private positionService: PositionService) {}

  @Get('strategies/:strategyId/positions')
  @ApiOperation({
    summary: 'Get positions for a strategy',
    description:
      'Returns paginated list of positions for a strategy. ' +
      'For REAL mode: queries Position table. ' +
      'For PAPER mode: queries PaperPosition (open) and/or PaperTrade (closed) tables based on status filter. ' +
      'When status is not specified in PAPER mode, returns both open positions and closed trades merged and sorted by date. ' +
      'Each item includes a "status" field ("OPEN" or "CLOSED") to distinguish between active positions and closed trades.',
  })
  @ApiParam({
    name: 'strategyId',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Positions retrieved successfully with summary. ' +
      'Response includes a "status" field for each item indicating whether it is an open position or closed trade. ' +
      'Open positions have unrealized_pnl and mark_price. ' +
      'Closed trades have exit_datetime, exit_price, exit_reason, net_pnl, and roi_percentage.',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getStrategyPositions(
    @Request() req,
    @Param('strategyId') strategyId: string,
    @Query() query: ListPositionsQueryDto,
  ) {
    return this.positionService.getStrategyPositions(req.user.id, strategyId, query);
  }

  @Get('positions/:id')
  @ApiOperation({
    summary: 'Get position details',
    description:
      'Returns detailed information about a specific position. ' +
      'For REAL mode: queries Position table. ' +
      'For PAPER mode: checks both PaperPosition (open) and PaperTrade (closed) tables. ' +
      'Response includes a "status" field ("OPEN" or "CLOSED").',
  })
  @ApiParam({
    name: 'id',
    description: 'Position ID',
  })
  @ApiResponse({
    status: 200,
    description:
      'Position retrieved successfully. ' +
      'Includes "status" field. ' +
      'Open positions have unrealized_pnl and mark_price (exit fields are null). ' +
      'Closed trades have exit_datetime, exit_price, exit_reason, net_pnl, roi_percentage (unrealized_pnl is null).',
  })
  @ApiResponse({
    status: 404,
    description: 'Position not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPositionById(
    @Request() req,
    @Param('id') id: string,
    @Query('mode') mode: string,
  ) {
    return this.positionService.getPositionById(req.user.id, id, mode as any);
  }

  @Get('positions/:id/chart-data')
  @ApiOperation({
    summary: 'Get candle data for position chart',
    description:
      'Fetches candle data from GraphQL service for visualizing the position on a chart. ' +
      'Returns candles before and after position entry time. ' +
      'Works with both open positions and closed trades (uses entry_datetime for closed trades). ' +
      'For closed positions: automatically calculates candles needed to show complete position lifecycle ' +
      'with minimum 30 candles before entry and 30 candles after exit. Auto-calculation can exceed the 200 candles_after limit ' +
      'but is capped at 5000 candles for performance. Very long positions (>5000 candles) may not show the exit.',
  })
  @ApiParam({
    name: 'id',
    description: 'Position ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Candle data retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Position not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Failed to fetch candle data',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getPositionChartData(
    @Request() req,
    @Param('id') id: string,
    @Query() query: PositionChartQueryDto,
  ) {
    return this.positionService.getPositionChartData(req.user.id, id, query);
  }
}
