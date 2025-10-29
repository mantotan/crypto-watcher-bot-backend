import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsNumber,
  IsOptional,
  IsIn,
  IsNotEmpty,
  ValidateIf,
  IsEnum,
  IsBoolean,
} from 'class-validator';
import { PositionSide } from '../../common/enums';

export class BacktestStrategyConfigDto {
  @ApiProperty({
    description: 'Strategy type identifier',
    example: 'pattern_breakout',
  })
  @IsString()
  @IsNotEmpty()
  strategy_type: string;

  @ApiPropertyOptional({
    description: 'List of allowed pattern types to trade',
    example: ['double_top', 'double_bottom', 'bullish_pennant', 'bearish_pennant'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_patterns?: string[];

  @ApiProperty({
    description: 'Risk calculation mode',
    enum: ['PERCENTAGE', 'FIXED_AMOUNT'],
    example: 'PERCENTAGE',
  })
  @IsString()
  @IsIn(['PERCENTAGE', 'FIXED_AMOUNT'])
  risk_mode: 'PERCENTAGE' | 'FIXED_AMOUNT';

  @ApiPropertyOptional({
    description: 'Risk percentage per trade (required if risk_mode is "PERCENTAGE")',
    example: 5.0,
    minimum: 0.1,
    maximum: 100,
  })
  @ValidateIf((o) => o.risk_mode === 'PERCENTAGE')
  @IsNumber()
  @IsNotEmpty()
  risk_per_trade_percentage?: number;

  @ApiPropertyOptional({
    description: 'Fixed risk amount in USD per trade (required if risk_mode is "FIXED_AMOUNT")',
    example: 100.0,
    minimum: 1,
  })
  @ValidateIf((o) => o.risk_mode === 'FIXED_AMOUNT')
  @IsNumber()
  @IsNotEmpty()
  fixed_risk_amount?: number;

  @ApiProperty({
    description: 'Initial capital for the backtest in USD',
    example: 10000.0,
    minimum: 100,
  })
  @IsNumber()
  initial_capital: number;

  @ApiPropertyOptional({
    description: 'Minimum acceptable risk/reward ratio',
    example: 1.5,
  })
  @IsNumber()
  @IsOptional()
  min_risk_ratio?: number;

  @ApiPropertyOptional({
    description: 'Maximum acceptable risk/reward ratio',
    example: 5.0,
  })
  @IsNumber()
  @IsOptional()
  max_risk_ratio?: number;

  @ApiPropertyOptional({
    description: 'Position type filter (LONG or SHORT)',
    enum: PositionSide,
    example: PositionSide.LONG,
  })
  @IsEnum(PositionSide)
  @IsOptional()
  position_type?: PositionSide;

  @ApiPropertyOptional({
    description: 'Maximum leverage to use',
    example: 3.0,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  max_leverage?: number;

  @ApiPropertyOptional({
    description: 'Trading fee percentage (e.g., 0.1 for 0.1%)',
    example: 0.1,
    minimum: 0,
  })
  @IsNumber()
  @IsOptional()
  trading_fee_percentage?: number;

  @ApiPropertyOptional({
    description: 'Maximum position size in USD',
    example: 100000,
    minimum: 1,
  })
  @IsNumber()
  @IsOptional()
  max_position_size_usd?: number;

  @ApiPropertyOptional({
    description:
      'Allow opening opposite positions (LONG + SHORT) on the same symbol. ' +
      'When false (default), only one position side per symbol is allowed. ' +
      'When true, both LONG and SHORT positions can exist simultaneously. ' +
      'IMPORTANT: Python backtest worker must respect this setting.',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  allow_hedging?: boolean;
}
