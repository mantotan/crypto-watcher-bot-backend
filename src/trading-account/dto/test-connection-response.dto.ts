import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TestConnectionResponseDto {
  @ApiProperty({
    description: 'Whether the connection was successful',
    example: true,
  })
  success: boolean;

  @ApiProperty({
    description: 'Connection status message',
    example: 'Connection successful',
  })
  message: string;

  @ApiPropertyOptional({
    description: 'Account balance from exchange (if successful)',
    example: 10000.50,
  })
  balance?: number;
}
