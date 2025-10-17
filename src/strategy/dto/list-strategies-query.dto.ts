import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { TradingMode } from '@prisma/client';

export class ListStrategiesQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by trading account ID',
    example: 'clxy1234567890abcdefghijk',
  })
  @IsOptional()
  @IsString()
  trading_account_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by trading mode',
    enum: TradingMode,
  })
  @IsOptional()
  @IsEnum(TradingMode)
  mode?: TradingMode;

  @ApiPropertyOptional({
    description: 'Filter by live status',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_live?: boolean;

  @ApiPropertyOptional({
    description: 'Include archived strategies in results',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  include_archived?: boolean;

  @ApiPropertyOptional({
    description: 'Show only archived strategies',
    example: false,
    default: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  archived_only?: boolean;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (strategy ID)',
    example: 'clxy1234567890abcdefghijk',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
