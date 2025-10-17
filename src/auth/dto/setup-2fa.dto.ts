import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Setup2FADto {
  @ApiProperty({
    description: 'Current password to confirm identity',
    example: 'MySecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  currentPassword: string;
}
