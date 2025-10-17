import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ description: 'Total number of items matching the filter' })
  total: number;

  @ApiProperty({ description: 'Number of items per page' })
  limit: number;

  @ApiProperty({ description: 'Cursor for the next page (null if no more pages)', nullable: true })
  nextCursor: string | null;

  @ApiProperty({ description: 'Whether there are more pages available' })
  hasMore: boolean;
}

export class TradesSummaryDto {
  @ApiProperty({ description: 'Total trades in filtered result' })
  total_trades: number;

  @ApiProperty({ description: 'Number of winning trades' })
  winning_trades: number;

  @ApiProperty({ description: 'Number of losing trades' })
  losing_trades: number;

  @ApiProperty({ description: 'Win rate percentage' })
  win_rate: number;

  @ApiProperty({ description: 'Total net PnL' })
  total_pnl: number;
}

export class BacktestTradesResponseDto {
  @ApiProperty({ description: 'Array of backtest trades', type: 'array' })
  data: any[];

  @ApiProperty({ description: 'Pagination metadata', type: PaginationMetaDto })
  pagination: PaginationMetaDto;

  @ApiProperty({ description: 'Summary statistics for filtered trades', type: TradesSummaryDto })
  summary: TradesSummaryDto;
}
