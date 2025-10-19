import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';

export class UpdateTradingAccountDto {
  @ApiPropertyOptional({
    description: 'Name for the trading account',
    example: 'My Updated Binance Account',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Exchange API key',
    example: 'your_new_api_key_here',
  })
  @IsOptional()
  @IsString()
  api_key?: string;

  @ApiPropertyOptional({
    description: 'Exchange API secret',
    example: 'your_new_api_secret_here',
  })
  @IsOptional()
  @IsString()
  api_secret?: string;

  @ApiPropertyOptional({
    description: 'Maker fee percentage (e.g., 0.02 for 0.02%)',
    example: 0.02,
    minimum: 0,
    maximum: 100,
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
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(125)
  max_leverage?: number;
}
