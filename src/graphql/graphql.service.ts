import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface CandleData {
  symbol: string;
  timeframe: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quote_volume?: number;
  trade_count?: number;
}

interface GraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

@Injectable()
export class GraphQLService {
  private readonly logger = new Logger(GraphQLService.name);
  private client: AxiosInstance;
  private serviceUrl: string;

  constructor() {
    this.serviceUrl = process.env.GRAPHQL_CHART_SERVICE_URL || 'http://localhost:8000/graphql';
    this.client = axios.create({
      baseURL: this.serviceUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.logger.log(`GraphQL Chart Service URL: ${this.serviceUrl}`);
  }

  /**
   * Fetch candles from GraphQL service within a date range
   */
  async getCandles(
    symbol: string,
    timeframe: string,
    startTime: Date,
    endTime: Date,
    limit: number = 100,
  ): Promise<CandleData[]> {
    const query = `
      query GetCandles($symbol: String!, $timeframe: String!, $dateRange: DateRangeInput, $limit: Int) {
        getCandles(symbol: $symbol, timeframe: $timeframe, dateRange: $dateRange, limit: $limit) {
          symbol
          timeframe
          timestamp
          open
          high
          low
          close
          volume
          quoteVolume
          tradeCount
        }
      }
    `;

    const variables = {
      symbol,
      timeframe,
      dateRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString(),
      },
      limit,
    };

    try {
      const response = await this.client.post<GraphQLResponse<{ getCandles: CandleData[] }>>(
        '',
        {
          query,
          variables,
        },
      );

      if (response.data.errors) {
        this.logger.error(
          `GraphQL errors: ${JSON.stringify(response.data.errors)}`,
        );
        throw new Error(`GraphQL query failed: ${response.data.errors[0].message}`);
      }

      const candles = response.data.data?.getCandles || [];
      this.logger.log(
        `Fetched ${candles.length} candles for ${symbol} ${timeframe}`,
      );

      return candles;
    } catch (error) {
      this.logger.error(
        `Failed to fetch candles: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Helper to calculate time based on timeframe and number of candles
   */
  calculateTimeOffset(timeframe: string, numCandles: number): number {
    const timeframeMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };

    const interval = timeframeMap[timeframe];
    if (!interval) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    return interval * numCandles;
  }

  /**
   * Fetch candles around a specific timestamp
   * Gets N candles before and N candles after the reference time
   */
  async getCandlesAroundTime(
    symbol: string,
    timeframe: string,
    referenceTime: Date,
    candlesBefore: number = 50,
    candlesAfter: number = 50,
  ): Promise<{
    before: CandleData[];
    after: CandleData[];
    reference: Date;
  }> {
    const offsetBefore = this.calculateTimeOffset(timeframe, candlesBefore);
    const offsetAfter = this.calculateTimeOffset(timeframe, candlesAfter);

    const startTime = new Date(referenceTime.getTime() - offsetBefore);
    const endTime = new Date(referenceTime.getTime() + offsetAfter);

    const allCandles = await this.getCandles(
      symbol,
      timeframe,
      startTime,
      endTime,
      candlesBefore + candlesAfter + 10, // Add buffer
    );

    // Split candles into before and after reference time
    const before: CandleData[] = [];
    const after: CandleData[] = [];

    for (const candle of allCandles) {
      const candleTime = new Date(candle.timestamp);
      if (candleTime < referenceTime) {
        before.push(candle);
      } else if (candleTime >= referenceTime) {
        after.push(candle);
      }
    }

    // Sort to ensure correct order
    before.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    after.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Limit to requested number of candles
    const limitedBefore = before.slice(-candlesBefore);
    const limitedAfter = after.slice(0, candlesAfter);

    this.logger.log(
      `Fetched ${limitedBefore.length} candles before and ${limitedAfter.length} candles after ${referenceTime.toISOString()}`,
    );

    return {
      before: limitedBefore,
      after: limitedAfter,
      reference: referenceTime,
    };
  }
}
