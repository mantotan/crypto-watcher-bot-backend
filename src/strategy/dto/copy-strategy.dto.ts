import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CopyStrategyDto {
  @ApiProperty({
    description: 'Trading account ID to link the copied strategy to',
    example: 'clxy1234567890abcdefghijk',
  })
  @IsString()
  @IsNotEmpty()
  trading_account_id: string;

  @ApiPropertyOptional({
    description: 'Custom name for the copied strategy (defaults to "Copy of {original}")',
    example: 'My Custom Strategy Name',
  })
  @IsOptional()
  @IsString()
  name?: string;
}
