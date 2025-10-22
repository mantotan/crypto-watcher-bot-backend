import { IsString, IsOptional, Matches } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({
    description: 'User full name',
    example: 'John Doe',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'User preferred timezone (IANA timezone identifier)',
    example: 'America/New_York',
  })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]+\/[A-Za-z_]+$/, {
    message: 'Timezone must be a valid IANA timezone identifier (e.g., "America/New_York", "Asia/Singapore")',
  })
  preferred_timezone?: string;
}
