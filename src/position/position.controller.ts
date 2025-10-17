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
      'Returns paginated list of positions for a strategy. Queries from Position or PaperPosition table based on mode parameter.',
  })
  @ApiParam({
    name: 'strategyId',
    description: 'Strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Positions retrieved successfully with summary',
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
    description: 'Returns detailed information about a specific position (REAL or PAPER based on mode parameter)',
  })
  @ApiParam({
    name: 'id',
    description: 'Position ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Position retrieved successfully',
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
      'Returns candles before and after position entry time.',
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
