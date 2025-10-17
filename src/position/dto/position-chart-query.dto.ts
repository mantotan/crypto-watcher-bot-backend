import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';
import { TradingMode } from '@prisma/client';

export class PositionChartQueryDto {
  @ApiProperty({
    description: 'Trading mode (REAL or PAPER)',
    enum: TradingMode,
  })
  @IsEnum(TradingMode)
  mode: TradingMode;

  @ApiPropertyOptional({
    description: 'Number of candles before entry',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(200)
  candles_before?: number = 50;

  @ApiPropertyOptional({
    description: 'Number of candles after entry',
    example: 50,
    default: 50,
    minimum: 1,
    maximum: 200,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(200)
  candles_after?: number = 50;
}
