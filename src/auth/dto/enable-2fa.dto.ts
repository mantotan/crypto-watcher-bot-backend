import { IsString, IsNotEmpty, Length } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class Enable2FADto {
  @ApiProperty({
    description: '6-digit code from authenticator app to verify 2FA setup',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6)
  twoFactorCode: string;
}
