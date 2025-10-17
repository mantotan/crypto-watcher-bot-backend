import { IsString, IsNotEmpty, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegenerateBackupCodesDto {
  @ApiProperty({
    description: 'Current password to confirm identity',
    example: 'MySecurePassword123!',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  currentPassword: string;

  @ApiProperty({
    description: '6-digit 2FA code from authenticator app',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  twoFactorCode: string;
}
