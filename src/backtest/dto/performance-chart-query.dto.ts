import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class PerformanceChartQueryDto {
  @ApiPropertyOptional({
    description: 'Filter performance data by specific symbol (e.g., "BTCUSDT")',
    example: 'BTCUSDT',
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Filter performance data by specific timeframe (e.g., "4h", "1h")',
    example: '4h',
  })
  @IsOptional()
  @IsString()
  timeframe?: string;
}
