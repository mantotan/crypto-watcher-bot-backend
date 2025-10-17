import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsArray,
  IsOptional,
  IsNotEmpty,
  ValidateNested,
  IsEnum,
} from 'class-validator';
import { Type } from 'class-transformer';
import { BacktestStrategyConfigDto } from './backtest-strategy-config.dto';
import { PositionSide } from '../../common/enums';

export class CreateBacktestStrategyDto {
  @ApiProperty({
    description: 'User-friendly name for the strategy',
    example: 'Aggressive Double Top Strategy',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Strategy type identifier',
    example: 'pattern_breakout',
  })
  @IsString()
  @IsNotEmpty()
  strategy_type: string;

  @ApiProperty({
    description: 'List of allowed pattern types to trade',
    example: ['double_top', 'double_bottom'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  allowed_patterns: string[];

  @ApiPropertyOptional({
    description: 'List of allowed symbols (empty array or omit for all symbols)',
    example: ['BTCUSDT', 'ETHUSDT'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowed_symbols?: string[];

  @ApiPropertyOptional({
    description: 'List of allowed timeframes (empty array or omit for all timeframes)',
    example: ['4h', '1h'],
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  timeframes?: string[];

  @ApiPropertyOptional({
    description: 'Position type filter (LONG, SHORT, or omit for both)',
    enum: PositionSide,
    example: PositionSide.LONG,
  })
  @IsEnum(PositionSide)
  @IsOptional()
  position_type?: PositionSide;

  @ApiProperty({
    description: 'Strategy configuration including risk management',
    type: BacktestStrategyConfigDto,
  })
  @ValidateNested()
  @Type(() => BacktestStrategyConfigDto)
  config: BacktestStrategyConfigDto;
}
