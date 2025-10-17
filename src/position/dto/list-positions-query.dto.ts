import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { TradingMode } from '@prisma/client';
import { PositionSide } from '../../common/enums';

export class ListPositionsQueryDto {
  @ApiProperty({
    description: 'Trading mode (REAL or PAPER)',
    enum: TradingMode,
  })
  @IsEnum(TradingMode)
  mode: TradingMode;

  @ApiPropertyOptional({
    description: 'Filter by symbol',
    example: 'BTCUSDT',
  })
  @IsOptional()
  @IsString()
  symbol?: string;

  @ApiPropertyOptional({
    description: 'Filter by position side (LONG or SHORT)',
    enum: PositionSide,
    example: PositionSide.LONG,
  })
  @IsOptional()
  @IsEnum(PositionSide)
  side?: PositionSide;

  @ApiPropertyOptional({
    description: 'Filter by status (is_active)',
    enum: ['OPEN', 'CLOSED'],
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (position ID)',
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
