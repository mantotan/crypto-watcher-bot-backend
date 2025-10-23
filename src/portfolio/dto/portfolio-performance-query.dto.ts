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

export enum PerformanceGranularity {
  HOURLY = 'HOURLY',
  TWELVE_HOURLY = '12H',
  DAILY = 'DAILY',
  WEEKLY = 'WEEKLY',
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

  @ApiPropertyOptional({
    description: 'Data granularity - how to aggregate hourly snapshots',
    enum: PerformanceGranularity,
    default: PerformanceGranularity.DAILY,
  })
  @IsOptional()
  @IsEnum(PerformanceGranularity)
  granularity?: PerformanceGranularity = PerformanceGranularity.DAILY;
}
