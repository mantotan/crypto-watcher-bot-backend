import { ApiProperty } from '@nestjs/swagger';

export class EquityCurvePointDto {
  @ApiProperty({ description: 'Timestamp of the data point (ISO 8601)', example: '2025-01-15T10:30:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Portfolio balance at this point', example: 10500.50 })
  balance: number;

  @ApiProperty({ description: 'Trade sequence number (0 = initial state)', example: 1 })
  trade_number: number;
}

export class PerformanceChartSummaryDto {
  @ApiProperty({ description: 'Initial capital at start of backtest', example: 10000.00 })
  initial_balance: number;

  @ApiProperty({ description: 'Final balance at end of backtest', example: 12500.50 })
  final_balance: number;

  @ApiProperty({ description: 'Total return percentage', example: 25.01 })
  total_return_percentage: number;

  @ApiProperty({ description: 'Maximum drawdown percentage experienced', example: 15.25 })
  max_drawdown_percentage: number;

  @ApiProperty({ description: 'Highest balance reached during backtest', example: 13000.00 })
  peak_balance: number;

  @ApiProperty({ description: 'Total number of trades executed', example: 45 })
  total_trades: number;

  @ApiProperty({ description: 'Number of winning trades', example: 28 })
  winning_trades: number;

  @ApiProperty({ description: 'Number of losing trades', example: 17 })
  losing_trades: number;

  @ApiProperty({ description: 'Win rate percentage', example: 62.22 })
  win_rate: number;
}

export class PerformanceChartResponseDto {
  @ApiProperty({
    description: 'Time-series data for equity curve (portfolio balance over time)',
    type: [EquityCurvePointDto],
    example: [
      { timestamp: '2025-01-01T00:00:00.000Z', balance: 10000, trade_number: 0 },
      { timestamp: '2025-01-02T10:30:00.000Z', balance: 10150.50, trade_number: 1 },
    ],
  })
  equity_curve: EquityCurvePointDto[];

  @ApiProperty({
    description: 'Summary statistics for the performance chart',
    type: PerformanceChartSummaryDto,
  })
  summary: PerformanceChartSummaryDto;
}
