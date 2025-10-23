import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  NotFoundException,
  Logger,
  InternalServerErrorException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { BacktestService } from './backtest.service';
import { CreateBacktestTaskDto } from './dto/create-backtest-task.dto';
import { CreateBacktestStrategyDto } from './dto/create-backtest-strategy.dto';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto';
import { ListStrategiesQueryDto } from './dto/list-strategies-query.dto';
import { BacktestTradesQueryDto } from './dto/backtest-trades-query.dto';
import { BacktestTradesResponseDto } from './dto/backtest-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RedisService } from '../redis/redis.service';

@ApiTags('Backtest')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('backtest')
export class BacktestController {
  private readonly logger = new Logger(BacktestController.name);

  constructor(
    private backtestService: BacktestService,
    private redisService: RedisService,
  ) {}

  @Post('tasks')
  @ApiOperation({
    summary: 'Create a new backtest task',
    description:
      'Creates a new backtest task with the specified parameters. The task will be queued for processing.',
  })
  @ApiResponse({
    status: 201,
    description: 'Backtest task created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or date range',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async createTask(@Request() req, @Body() dto: CreateBacktestTaskDto) {
    return this.backtestService.createTask(req.user.id, dto);
  }

  @Get('tasks')
  @ApiOperation({
    summary: 'List all backtest tasks',
    description:
      'Returns a paginated list of backtest tasks for the authenticated user. ' +
      'By default, returns only non-archived and non-deleted tasks.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async listTasks(@Request() req, @Query() query: ListTasksQueryDto) {
    return this.backtestService.listTasks(req.user.id, query);
  }

  @Get('tasks/:id')
  @ApiOperation({
    summary: 'Get backtest task by ID',
    description:
      'Returns a specific backtest task including its result summary (without individual trades). ' +
      'Archived tasks are still accessible. Returns 404 only if task is soft deleted or not found.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest task ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Task retrieved successfully (including archived tasks)',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found or has been deleted',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getTaskById(@Request() req, @Param('id') id: string) {
    return this.backtestService.getTaskById(req.user.id, id);
  }

  @Patch('tasks/:id/archive')
  @ApiOperation({
    summary: 'Archive a backtest task',
    description:
      'Archives a backtest task. Cannot archive a task that is currently running.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest task ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Task archived successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot archive a running task',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async archiveTask(@Request() req, @Param('id') id: string) {
    return this.backtestService.archiveTask(req.user.id, id);
  }

  @Patch('tasks/:id/unarchive')
  @ApiOperation({
    summary: 'Unarchive a backtest task',
    description: 'Restores an archived backtest task to active status.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest task ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Task unarchived successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async unarchiveTask(@Request() req, @Param('id') id: string) {
    return this.backtestService.unarchiveTask(req.user.id, id);
  }

  @Delete('tasks/:id')
  @ApiOperation({
    summary: 'Soft delete a backtest task',
    description:
      'Soft deletes a backtest task. The task will be permanently hidden from all endpoints. ' +
      'Cannot delete a task that is currently running.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest task ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Task deleted successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete a running task',
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async deleteTask(@Request() req, @Param('id') id: string) {
    return this.backtestService.softDeleteTask(req.user.id, id);
  }

  @Get('results/:resultId/trades')
  @ApiOperation({
    summary: 'Get backtest result trades with pagination',
    description:
      'Returns individual trades from a backtest result with cursor-based pagination and filtering options. ' +
      'Use this endpoint to retrieve large datasets efficiently.',
  })
  @ApiParam({
    name: 'resultId',
    description: 'Backtest result ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trades retrieved successfully',
    type: BacktestTradesResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Result not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getResultTrades(
    @Request() req,
    @Param('resultId') resultId: string,
    @Query() query: BacktestTradesQueryDto,
  ) {
    return this.backtestService.getResultTrades(req.user.id, resultId, query);
  }

  @Get('trades/:tradeId')
  @ApiOperation({
    summary: 'Get backtest trade details with candle data',
    description:
      'Returns detailed information about a specific backtest trade including 50 candles before ' +
      'and 50 candles after the first top/bottom from the pattern. This endpoint fetches candle data ' +
      'from the GraphQL chart data service.',
  })
  @ApiParam({
    name: 'tradeId',
    description: 'Backtest trade ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Trade details retrieved successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Trade not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getTradeDetails(@Request() req, @Param('tradeId') tradeId: string) {
    return this.backtestService.getTradeDetails(req.user.id, tradeId);
  }

  // ============================================================================
  // PROGRESS TRACKING ENDPOINTS (HTTP Polling Fallback)
  // ============================================================================

  @Get('tasks/:taskId/progress')
  @ApiOperation({
    summary: 'Get backtest task progress (HTTP polling fallback)',
    description:
      'Returns the current progress of a backtest task. This is a polling fallback for clients ' +
      'that cannot use WebSocket. For real-time updates, use the WebSocket gateway instead.',
  })
  @ApiParam({
    name: 'taskId',
    description: 'Backtest task ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'running', 'completed', 'failed'] },
            progress_percentage: { type: 'number', example: 45.5 },
            current_step: { type: 'string', example: 'detecting_patterns' },
            timestamp: { type: 'string', format: 'date-time' },
            metadata: {
              type: 'object',
              properties: {
                current_symbol: { type: 'string', example: 'BTCUSDT' },
                current_timeframe: { type: 'string', example: '4h' },
                total_patterns_found: { type: 'number', example: 87 },
                estimated_completion: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Task not found or no progress available',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getTaskProgress(@Param('taskId') taskId: string) {
    // Validate taskId format (basic security check)
    if (!taskId || typeof taskId !== 'string' || taskId.length > 100) {
      throw new NotFoundException('Invalid task ID format');
    }

    try {
      const progress = await this.redisService.getTaskProgress(taskId);

      if (!progress) {
        throw new NotFoundException(`Progress for task ${taskId} not found or completed`);
      }

      return {
        success: true,
        data: progress,
      };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(`Error fetching progress for task ${taskId}:`, error);
      throw new NotFoundException('Failed to fetch progress');
    }
  }

  @Get('progress/all')
  @ApiOperation({
    summary: 'Get all active backtest tasks progress (dashboard)',
    description:
      'Returns progress for all currently active backtest tasks. Useful for dashboard views. ' +
      'For real-time updates, use the WebSocket gateway instead.',
  })
  @ApiResponse({
    status: 200,
    description: 'All active tasks progress retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        data: {
          type: 'object',
          additionalProperties: {
            type: 'object',
            properties: {
              task_id: { type: 'string' },
              status: { type: 'string' },
              progress_percentage: { type: 'number' },
              current_step: { type: 'string' },
              timestamp: { type: 'string' },
              metadata: { type: 'object' },
            },
          },
        },
        count: { type: 'number', example: 3 },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getAllProgress() {
    try {
      const allProgress = await this.redisService.getAllTasksProgress();

      return {
        success: true,
        data: allProgress,
        count: Object.keys(allProgress).length,
      };
    } catch (error) {
      this.logger.error('Error fetching all progress:', error);
      // Return empty result instead of failing
      return {
        success: true,
        data: {},
        count: 0,
        error: 'Failed to fetch progress data',
      };
    }
  }

  // ============================================================================
  // BACKTEST STRATEGY ENDPOINTS
  // ============================================================================

  @Post('strategies')
  @ApiOperation({
    summary: 'Create a new backtest strategy',
    description: 'Creates a new backtest strategy template that can be reused for multiple backtest tasks.',
  })
  @ApiResponse({
    status: 201,
    description: 'Strategy created successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input or duplicate strategy name',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async createStrategy(@Request() req, @Body() dto: CreateBacktestStrategyDto) {
    return this.backtestService.createStrategy(req.user.id, dto);
  }

  @Get('strategies')
  @ApiOperation({
    summary: 'List all backtest strategies',
    description:
      'Returns a paginated list of backtest strategies for the authenticated user. ' +
      'By default, returns only non-archived and non-deleted strategies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategies retrieved successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async listStrategies(@Request() req, @Query() query: ListStrategiesQueryDto) {
    return this.backtestService.listStrategies(req.user.id, query);
  }

  @Get('strategies/:id')
  @ApiOperation({
    summary: 'Get backtest strategy by ID',
    description:
      'Returns a specific backtest strategy. Archived strategies are still accessible. ' +
      'Returns 404 only if strategy is soft deleted or not found.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy retrieved successfully (including archived strategies)',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found or has been deleted',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getStrategyById(@Request() req, @Param('id') id: string) {
    return this.backtestService.getStrategyById(req.user.id, id);
  }

  @Patch('strategies/:id/archive')
  @ApiOperation({
    summary: 'Archive a backtest strategy',
    description: 'Archives a backtest strategy.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy archived successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async archiveStrategy(@Request() req, @Param('id') id: string) {
    return this.backtestService.archiveStrategy(req.user.id, id);
  }

  @Patch('strategies/:id/unarchive')
  @ApiOperation({
    summary: 'Unarchive a backtest strategy',
    description: 'Restores an archived backtest strategy to active status.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy unarchived successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async unarchiveStrategy(@Request() req, @Param('id') id: string) {
    return this.backtestService.unarchiveStrategy(req.user.id, id);
  }

  @Delete('strategies/:id')
  @ApiOperation({
    summary: 'Soft delete a backtest strategy',
    description:
      'Soft deletes a backtest strategy. The strategy will be permanently hidden from all endpoints.',
  })
  @ApiParam({
    name: 'id',
    description: 'Backtest strategy ID',
  })
  @ApiResponse({
    status: 200,
    description: 'Strategy deleted successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Strategy not found',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async deleteStrategy(@Request() req, @Param('id') id: string) {
    return this.backtestService.softDeleteStrategy(req.user.id, id);
  }
}
