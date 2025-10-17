import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class BacktestTradesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination (last trade ID from previous page)',
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
}
