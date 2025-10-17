import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

export enum OAuthProvider {
  GOOGLE = 'google',
  // Add more providers as needed (github, facebook, etc.)
}

export class UnlinkProviderDto {
  @ApiProperty({
    description: 'OAuth provider to unlink',
    enum: OAuthProvider,
    example: OAuthProvider.GOOGLE,
  })
  @IsEnum(OAuthProvider)
  provider: OAuthProvider;
}
