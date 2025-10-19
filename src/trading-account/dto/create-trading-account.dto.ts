import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class CreateTradingAccountDto {
  @ApiProperty({
    description: 'Name for the trading account',
    example: 'My Binance Account',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'Exchange name',
    example: 'binance',
    enum: ['binance'],
  })
  @IsString()
  @IsNotEmpty()
  exchange: string;

  @ApiProperty({
    description: 'Exchange API key',
    example: 'your_api_key_here',
  })
  @IsString()
  @IsNotEmpty()
  api_key: string;

  @ApiProperty({
    description: 'Exchange API secret',
    example: 'your_api_secret_here',
  })
  @IsString()
  @IsNotEmpty()
  api_secret: string;

  @ApiPropertyOptional({
    description: 'Initial balance for paper trading portfolio',
    example: 10000,
    minimum: 0,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  initial_balance?: number;

  @ApiPropertyOptional({
    description: 'Maker fee percentage (e.g., 0.02 for 0.02%)',
    example: 0.02,
    minimum: 0,
    maximum: 100,
    default: 0.02,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  maker_fee?: number;

  @ApiPropertyOptional({
    description: 'Taker fee percentage (e.g., 0.05 for 0.05%)',
    example: 0.05,
    minimum: 0,
    maximum: 100,
    default: 0.05,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  taker_fee?: number;

  @ApiPropertyOptional({
    description: 'Maximum leverage allowed (e.g., 125 for 125x)',
    example: 125,
    minimum: 1,
    maximum: 125,
    default: 125,
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(125)
  max_leverage?: number;
}
