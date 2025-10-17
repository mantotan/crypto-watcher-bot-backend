import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional } from 'class-validator';

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
}
