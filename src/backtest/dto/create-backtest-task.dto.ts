import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsDateString,
  IsOptional,
  IsNotEmpty,
  IsIn,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BacktestStrategyConfigDto } from './backtest-strategy-config.dto';

export class CreateBacktestTaskDto {
  @ApiProperty({
    description: 'User-friendly name for the backtest',
    example: 'Double Top Strategy - Q1 2024',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({
    description: 'Detailed description of the backtest',
    example: 'Testing double top pattern across major pairs',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Optional strategy template ID to use',
    example: 'cm1234567890abcdefghijk',
  })
  @IsString()
  @IsOptional()
  strategy_id?: string;

  @ApiPropertyOptional({
    description: 'Queue priority for the backtest task',
    enum: ['high', 'normal', 'low'],
    default: 'normal',
    example: 'normal',
  })
  @IsString()
  @IsIn(['high', 'normal', 'low'])
  @IsOptional()
  priority?: 'high' | 'normal' | 'low';

  @ApiProperty({
    description: 'List of symbols to backtest',
    example: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  symbols: string[];

  @ApiProperty({
    description: 'List of timeframes to backtest',
    example: ['4h', '1h'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  timeframes: string[];

  @ApiProperty({
    description: 'Start date and time for backtest in your local timezone (from user profile). ' +
      'Format: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" (no timezone offset). ' +
      'Will be automatically converted to UTC using your preferred timezone setting.',
    examples: [
      '2024-01-01 00:00:00',
      '2024-01-01T00:00:00',
    ],
    example: '2024-01-01 00:00:00',
  })
  @IsDateString()
  start_date: string;

  @ApiProperty({
    description: 'End date and time for backtest in your local timezone (from user profile). ' +
      'Format: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss" (no timezone offset). ' +
      'Will be automatically converted to UTC using your preferred timezone setting.',
    examples: [
      '2024-12-31 23:59:59',
      '2024-12-31T23:59:59',
    ],
    example: '2024-12-31 23:59:59',
  })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({
    description: 'If true, create separate backtest tasks for each timeframe. If false, combine all timeframes in a single task.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_combine_timeframe?: boolean;

  @ApiPropertyOptional({
    description: 'If true, create separate backtest tasks for each symbol. If false, combine all symbols in a single task.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_combine_symbol?: boolean;

  @ApiProperty({
    description: 'Strategy configuration for the backtest',
    examples: {
      percentage_mode: {
        summary: 'Percentage Risk Mode',
        value: {
          strategy_type: 'pattern_breakout',
          allowed_patterns: ['double_top', 'double_bottom', 'bullish_pennant', 'bearish_pennant'],
          risk_mode: 'PERCENTAGE',
          risk_per_trade_percentage: 5.0,
          initial_capital: 10000.0,
          min_risk_ratio: 1.5,
          position_type: 'long',
        },
      },
      fixed_amount_mode: {
        summary: 'Fixed Amount Risk Mode',
        value: {
          strategy_type: 'pattern_breakout',
          allowed_patterns: ['double_top', 'double_bottom', 'bullish_pennant', 'bearish_pennant'],
          risk_mode: 'FIXED_AMOUNT',
          fixed_risk_amount: 100.0,
          initial_capital: 10000.0,
          max_risk_ratio: 5.0,
        },
      },
    },
  })
  @ValidateNested()
  @Type(() => BacktestStrategyConfigDto)
  strategy_config: BacktestStrategyConfigDto;
}
