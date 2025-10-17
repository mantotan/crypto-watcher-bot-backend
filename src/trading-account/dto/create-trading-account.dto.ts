import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

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
}
