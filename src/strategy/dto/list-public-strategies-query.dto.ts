import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { Transform } from 'class-transformer';

enum PublicStrategySortOrder {
  POPULAR = 'popular',
  PERFORMANCE = 'performance',
  NEWEST = 'newest',
}

export class ListPublicStrategiesQueryDto {
  @ApiPropertyOptional({
    description: 'Search by strategy name or description',
    example: 'double bottom',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: PublicStrategySortOrder,
    default: 'newest',
  })
  @IsOptional()
  @IsEnum(PublicStrategySortOrder)
  sort?: PublicStrategySortOrder = PublicStrategySortOrder.NEWEST;

  @ApiPropertyOptional({
    description: 'Cursor for pagination (strategy ID)',
    example: 'clxy1234567890abcdefghijk',
  })
  @IsOptional()
  @IsString()
  cursor?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: 20,
    default: 20,
    minimum: 1,
    maximum: 100,
  })
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
