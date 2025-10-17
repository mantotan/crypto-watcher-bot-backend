import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResendVerificationDto {
  @ApiProperty({
    description: 'User email address to resend verification code',
    example: 'user@example.com',
  })
  @IsEmail()
  email: string;
}
