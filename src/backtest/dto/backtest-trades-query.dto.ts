import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum BacktestTradeSortBy {
  ENTRY_DATETIME = 'entry_datetime',
  EXIT_DATETIME = 'exit_datetime',
  CREATED_AT = 'created_at',
  NET_PNL = 'net_pnl',
  REWARD_RISK_RATIO = 'reward_risk_ratio',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class BacktestTradesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination (last trade ID from previous page). WARNING: Reset cursor to null when changing sort_by or sort_order parameters.',
    example: 'cm1234567890abcdefghijk',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of trades to return per page',
    example: 100,
    minimum: 1,
    maximum: 1000,
    default: 100,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  @IsOptional()
  limit?: number = 100;

  @ApiPropertyOptional({
    description: 'Filter by symbol',
    example: 'BTCUSDT',
  })
  @IsString()
  @IsOptional()
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Filter by timeframe',
    example: '4h',
  })
  @IsString()
  @IsOptional()
  timeframe?: string;

  @ApiPropertyOptional({
    description: 'Filter by profitability (true = winning trades, false = losing trades)',
    example: true,
  })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  profitable?: boolean;

  @ApiPropertyOptional({
    description: 'Filter by exit reason',
    example: 'stop_loss_hit',
    enum: ['stop_loss_hit', 'take_profit_hit', 'pattern_expired'],
  })
  @IsString()
  @IsOptional()
  exit_reason?: string;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    enum: BacktestTradeSortBy,
    example: BacktestTradeSortBy.ENTRY_DATETIME,
    default: BacktestTradeSortBy.ENTRY_DATETIME,
  })
  @IsEnum(BacktestTradeSortBy)
  @IsOptional()
  sort_by?: BacktestTradeSortBy = BacktestTradeSortBy.ENTRY_DATETIME;

  @ApiPropertyOptional({
    description: 'Sort order (asc = ascending, desc = descending). Default is asc for date fields, desc for metrics (pnl, reward_risk_ratio)',
    enum: SortOrder,
    example: SortOrder.ASC,
  })
  @IsEnum(SortOrder)
  @IsOptional()
  sort_order?: SortOrder;
}
