import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { TradingMode, TradeSizeType, TradeSizeBenchmark } from '@prisma/client';

export class CreateStrategyDto {
  @ApiProperty({
    description: 'Strategy name',
    example: 'My Double Bottom Strategy',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Strategy description',
    example: 'Conservative double bottom pattern strategy',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Trading account ID',
    example: 'clxy1234567890abcdefghijk',
  })
  @IsString()
  @IsNotEmpty()
  trading_account_id: string;

  @ApiPropertyOptional({
    description: 'Trade size type',
    enum: TradeSizeType,
    default: 'PERCENTAGE',
  })
  @IsOptional()
  @IsEnum(TradeSizeType)
  trade_size_type?: TradeSizeType;

  @ApiPropertyOptional({
    description: 'Trade size amount',
    example: 5.0,
    default: 5.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @Max(100)
  trade_size_amount?: number;

  @ApiPropertyOptional({
    description: 'Trade size benchmark',
    enum: TradeSizeBenchmark,
    default: 'SL',
  })
  @IsOptional()
  @IsEnum(TradeSizeBenchmark)
  trade_size_benchmark?: TradeSizeBenchmark;

  @ApiPropertyOptional({
    description: 'Minimum risk ratio filter',
    example: 1.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  min_risk_ratio?: number;

  @ApiPropertyOptional({
    description: 'Maximum risk ratio filter',
    example: 10.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  max_risk_ratio?: number;

  @ApiPropertyOptional({
    description: 'Allowed signal patterns',
    example: ['double_bottom', 'double_top'],
    isArray: true,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_signals?: string[];

  @ApiPropertyOptional({
    description: 'Allowed trading symbols',
    example: ['BTCUSDT', 'ETHUSDT'],
    isArray: true,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_symbols?: string[];

  @ApiPropertyOptional({
    description: 'Allowed timeframes',
    example: ['1m', '15m', '1h', '4h'],
    isArray: true,
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowed_timeframes?: string[];

  @ApiPropertyOptional({
    description: 'Trading mode (REAL or PAPER)',
    enum: TradingMode,
    default: 'PAPER',
  })
  @IsOptional()
  @IsEnum(TradingMode)
  mode?: TradingMode;

  @ApiPropertyOptional({
    description: 'Is strategy currently running',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_live?: boolean;

  @ApiPropertyOptional({
    description: 'Is strategy visible to other users',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiProperty({
    description: 'Initial capital for portfolio',
    example: 10000,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  initial_capital: number;

  @ApiPropertyOptional({
    description: 'Maximum position size in USD',
    example: 100000,
    default: 100000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  max_position_size_usd?: number;

  @ApiPropertyOptional({
    description:
      'Allow opening opposite positions (LONG + SHORT) on the same symbol. ' +
      'When false (default), only one position side per symbol is allowed. ' +
      'When true, both LONG and SHORT positions can exist simultaneously.',
    example: false,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  allow_hedging?: boolean;
}
