import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosError } from 'axios';

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

    this.logger.log(`GraphQL Chart Service initialized with URL: ${this.serviceUrl}`);

    // Warn if using default URL (likely misconfiguration in production)
    if (!process.env.GRAPHQL_CHART_SERVICE_URL) {
      this.logger.warn(
        'GRAPHQL_CHART_SERVICE_URL not set, using default: http://localhost:8000/graphql. ' +
        'This may cause issues in production if the chart service is on a different host.'
      );
    }
  }

  /**
   * Fetch candles from GraphQL service within a date range
   * Returns partial results if full range is not available
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

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        this.logger.debug(
          `Fetching candles for ${symbol} ${timeframe} (${startTime.toISOString()} to ${endTime.toISOString()}) - Attempt ${attempt}/${maxRetries}`,
        );

        const response = await this.client.post<GraphQLResponse<{ getCandles: CandleData[] }>>(
          '',
          {
            query,
            variables,
          },
        );

        if (response.data.errors) {
          const errorMsg = response.data.errors[0].message;
          this.logger.warn(
            `GraphQL query returned errors for ${symbol} ${timeframe}: ${errorMsg}`,
          );

          // Return empty array for GraphQL errors (e.g., no data available)
          // These are not retryable - the data simply doesn't exist
          return response.data.data?.getCandles || [];
        }

        const candles = response.data.data?.getCandles || [];

        if (attempt > 1) {
          this.logger.log(
            `Successfully fetched ${candles.length} candles for ${symbol} ${timeframe} on attempt ${attempt}`,
          );
        } else {
          this.logger.debug(
            `Fetched ${candles.length} candles for ${symbol} ${timeframe}`,
          );
        }

        return candles;
      } catch (error) {
        lastError = error;
        const isNetworkError = this.isNetworkError(error);
        const isLastAttempt = attempt === maxRetries;

        // Enhanced error logging with more details
        const errorDetails = this.formatErrorDetails(error);

        if (isNetworkError && !isLastAttempt) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Exponential backoff: 1s, 2s, 4s (max 10s)
          this.logger.warn(
            `Network error fetching candles for ${symbol} ${timeframe} from ${startTime.toISOString()} to ${endTime.toISOString()} ` +
            `(attempt ${attempt}/${maxRetries}): ${errorDetails}. Retrying in ${delay}ms...`
          );
          await this.sleep(delay);
          continue;
        }

        // Log detailed error for debugging
        this.logger.error(
          `Failed to fetch candles for ${symbol} ${timeframe} after ${attempt} attempt(s). ` +
          `Date range: ${startTime.toISOString()} to ${endTime.toISOString()}. ` +
          `GraphQL URL: ${this.serviceUrl}. Error details: ${errorDetails}`
        );

        // Return empty array instead of throwing - graceful degradation
        return [];
      }
    }

    // If we get here, all retries failed
    this.logger.error(
      `All ${maxRetries} attempts failed to fetch candles for ${symbol} ${timeframe}. ` +
      `Date range: ${startTime.toISOString()} to ${endTime.toISOString()}. ` +
      `GraphQL URL: ${this.serviceUrl}. ` +
      `Last error: ${this.formatErrorDetails(lastError)}`
    );
    return [];
  }

  /**
   * Check if an error is a network-related error that should be retried
   */
  private isNetworkError(error: any): boolean {
    if (axios.isAxiosError(error)) {
      // Network errors (ECONNREFUSED, ENOTFOUND, ETIMEDOUT, etc.)
      if (error.code && ['ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNRESET', 'EPIPE', 'EAI_AGAIN'].includes(error.code)) {
        return true;
      }
      // Socket hang up
      if (error.message?.includes('socket hang up')) {
        return true;
      }
      // Timeout errors
      if (error.code === 'ECONNABORTED') {
        return true;
      }
    }
    return false;
  }

  /**
   * Sleep helper for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Format error details for better debugging
   * Safely handles circular references and large objects
   */
  private formatErrorDetails(error: any): string {
    if (axios.isAxiosError(error)) {
      const details: string[] = [];

      // Add error code
      if (error.code) {
        details.push(`Code: ${error.code}`);
      }

      // Add HTTP status
      if (error.response?.status) {
        details.push(`HTTP ${error.response.status}`);
      }

      // Add response data if available (safely handle all types)
      if (error.response?.data !== undefined && error.response?.data !== null) {
        try {
          let responseData: string;

          if (typeof error.response.data === 'string') {
            // Safely truncate string responses
            responseData = error.response.data.length > 200
              ? error.response.data.substring(0, 200) + '...'
              : error.response.data;
          } else if (typeof error.response.data === 'object') {
            // Safely stringify objects (handles circular references)
            const seen = new WeakSet();
            const safeStringify = (obj: any): string => {
              return JSON.stringify(obj, (key, value) => {
                if (typeof value === 'object' && value !== null) {
                  if (seen.has(value)) {
                    return '[Circular]';
                  }
                  seen.add(value);
                }
                return value;
              });
            };

            const jsonStr = safeStringify(error.response.data);
            responseData = jsonStr.length > 200 ? jsonStr.substring(0, 200) + '...' : jsonStr;
          } else {
            // Handle other types (number, boolean, etc.)
            responseData = String(error.response.data);
          }

          details.push(`Response: ${responseData}`);
        } catch (e) {
          // If all else fails, indicate data was present but couldn't be serialized
          details.push(`Response: [Unable to serialize: ${e.message}]`);
        }
      }

      // Add base error message
      if (error.message) {
        details.push(`Message: ${error.message}`);
      }

      return details.length > 0 ? details.join(', ') : 'Unknown axios error';
    }

    // Handle non-axios errors
    if (error instanceof Error) {
      return `${error.name}: ${error.message}`;
    }

    // Handle primitive values and other types
    try {
      return String(error);
    } catch (e) {
      return 'Unknown error (could not stringify)';
    }
  }

  /**
   * Get the interval in milliseconds for a given timeframe
   */
  getCandleInterval(timeframe: string): number {
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

    return interval;
  }

  /**
   * Helper to calculate time based on timeframe and number of candles
   */
  calculateTimeOffset(timeframe: string, numCandles: number): number {
    return this.getCandleInterval(timeframe) * numCandles;
  }

  /**
   * Fetch candles around a specific timestamp
   * Gets N candles before and N candles after the reference time
   * Returns partial results if full range is not available
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

    this.logger.debug(
      `Requesting ${candlesBefore} candles before and ${candlesAfter} candles after ${referenceTime.toISOString()} for ${symbol} ${timeframe}`,
    );

    const allCandles = await this.getCandles(
      symbol,
      timeframe,
      startTime,
      endTime,
      candlesBefore + candlesAfter + 10, // Add buffer
    );

    // Split candles into before and after reference time
    // Use period-aware splitting: a candle "contains" the reference time if the
    // reference falls within the candle's period [timestamp, timestamp + interval)
    const candleInterval = this.getCandleInterval(timeframe);
    const before: CandleData[] = [];
    const after: CandleData[] = [];

    // Find the candle that contains the reference time
    let containingCandleTime: number | null = null;
    for (const candle of allCandles) {
      const candleTime = new Date(candle.timestamp).getTime();
      const candleEnd = candleTime + candleInterval;
      if (candleTime <= referenceTime.getTime() && referenceTime.getTime() < candleEnd) {
        containingCandleTime = candleTime;
        break;
      }
    }

    // Split candles: before the containing candle, and from the containing candle onwards
    for (const candle of allCandles) {
      const candleTime = new Date(candle.timestamp).getTime();
      if (containingCandleTime !== null && candleTime < containingCandleTime) {
        before.push(candle);
      } else if (containingCandleTime !== null && candleTime >= containingCandleTime) {
        after.push(candle);
      } else if (containingCandleTime === null) {
        // Fallback to simple timestamp comparison if no containing candle found
        if (candleTime < referenceTime.getTime()) {
          before.push(candle);
        } else {
          after.push(candle);
        }
      }
    }

    // Sort to ensure correct order
    before.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    after.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    // Limit to requested number of candles
    const limitedBefore = before.slice(-candlesBefore);
    const limitedAfter = after.slice(0, candlesAfter);

    // Log result with details about partial data
    const beforeMsg = limitedBefore.length < candlesBefore
      ? `${limitedBefore.length}/${candlesBefore} (partial)`
      : `${limitedBefore.length}/${candlesBefore}`;
    const afterMsg = limitedAfter.length < candlesAfter
      ? `${limitedAfter.length}/${candlesAfter} (partial)`
      : `${limitedAfter.length}/${candlesAfter}`;

    if (limitedBefore.length < candlesBefore || limitedAfter.length < candlesAfter) {
      this.logger.warn(
        `Partial candles data for ${symbol} ${timeframe}: ${beforeMsg} before, ${afterMsg} after reference time ${referenceTime.toISOString()}`,
      );
    } else {
      this.logger.debug(
        `Fetched ${beforeMsg} candles before and ${afterMsg} after ${referenceTime.toISOString()}`,
      );
    }

    return {
      before: limitedBefore,
      after: limitedAfter,
      reference: referenceTime,
    };
  }
}
