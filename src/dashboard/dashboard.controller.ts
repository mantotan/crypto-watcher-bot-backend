import { Controller, Get, UseGuards, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private dashboardService: DashboardService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Get dashboard summary',
    description:
      'Returns aggregated dashboard data including total strategies, portfolios value, P&L, and top performing strategies. ' +
      'Note: today_pnl and performance_7d are approximations. Implement historical snapshot tracking for accurate calculations.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard summary retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        total_strategies: { type: 'number', example: 5 },
        live_strategies: { type: 'number', example: 2 },
        total_portfolios_value: { type: 'number', example: 25000.50 },
        today_pnl: { type: 'number', example: 150.25 },
        open_positions: { type: 'number', example: 3 },
        strategies_by_performance: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              strategy: { type: 'object' },
              portfolio: { type: 'object' },
              performance_7d: { type: 'number', example: 5.2 },
            },
          },
        },
        note: { type: 'string' },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async getDashboardSummary(@Request() req) {
    return this.dashboardService.getDashboardSummary(req.user.id);
  }
}
