import { IsString, IsNotEmpty, MinLength, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Disable2FADto {
  @ApiProperty({
    description: 'Current password to confirm identity',
    example: 'MySecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty({
    description: '6-digit 2FA code or backup code to verify identity',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  twoFactorCode: string;
}
