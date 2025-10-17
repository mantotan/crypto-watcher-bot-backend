import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsEnum } from 'class-validator';

export enum PerformanceTimeframe {
  ONE_DAY = '1D',
  ONE_WEEK = '1W',
  ONE_MONTH = '1M',
  THREE_MONTHS = '3M',
  ONE_YEAR = '1Y',
  ALL = 'ALL',
}

export class PortfolioPerformanceQueryDto {
  @ApiPropertyOptional({
    description: 'Performance timeframe',
    enum: PerformanceTimeframe,
    default: PerformanceTimeframe.ONE_MONTH,
  })
  @IsOptional()
  @IsEnum(PerformanceTimeframe)
  timeframe?: PerformanceTimeframe = PerformanceTimeframe.ONE_MONTH;
}
