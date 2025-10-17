import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
  IsEnum,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { TradingMode, TradeSizeType, TradeSizeBenchmark } from '@prisma/client';

export class UpdateStrategyDto {
  @ApiPropertyOptional({
    description: 'Strategy name',
    example: 'My Updated Strategy',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Strategy description',
    example: 'Updated strategy description',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Is strategy currently running',
  })
  @IsOptional()
  @IsBoolean()
  is_live?: boolean;

  @ApiPropertyOptional({
    description: 'Trading mode (REAL or PAPER)',
    enum: TradingMode,
  })
  @IsOptional()
  @IsEnum(TradingMode)
  mode?: TradingMode;

  @ApiPropertyOptional({
    description: 'Is strategy visible to other users',
  })
  @IsOptional()
  @IsBoolean()
  is_public?: boolean;

  @ApiPropertyOptional({
    description: 'Trade size type',
    enum: TradeSizeType,
  })
  @IsOptional()
  @IsEnum(TradeSizeType)
  trade_size_type?: TradeSizeType;

  @ApiPropertyOptional({
    description: 'Trade size amount',
    example: 5.0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0.01)
  @Max(100)
  trade_size_amount?: number;

  @ApiPropertyOptional({
    description: 'Trade size benchmark',
    enum: TradeSizeBenchmark,
  })
  @IsOptional()
  @IsEnum(TradeSizeBenchmark)
  trade_size_benchmark?: TradeSizeBenchmark;

  @ApiPropertyOptional({
    description: 'Minimum risk ratio filter',
    example: 1.5,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  min_risk_ratio?: number;

  @ApiPropertyOptional({
    description: 'Maximum risk ratio filter',
    example: 10.0,
  })
  @IsOptional()
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
    description: 'Is strategy active',
  })
  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
