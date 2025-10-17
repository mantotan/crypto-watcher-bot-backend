import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, Min, Max, IsBoolean } from 'class-validator';
import { Transform, Type } from 'class-transformer';

export class ListStrategiesQueryDto {
  @ApiPropertyOptional({
    description: 'Cursor for pagination',
    example: 'cm1234567890abcdefghijk',
  })
  @IsString()
  @IsOptional()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of strategies per page (default: 20, max: 100)',
    example: 20,
    type: Number,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional({
    description: 'Filter by archive status (default: false - shows only non-archived strategies)',
    example: false,
    type: Boolean,
  })
  @Transform(({ value }) => {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
  })
  @IsBoolean()
  @IsOptional()
  archived?: boolean;
}
