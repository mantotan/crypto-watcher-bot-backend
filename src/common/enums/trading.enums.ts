/**
 * Trading-related enums that mirror the database schema enums.
 * These provide type safety and better IDE support throughout the application.
 */

/**
 * Order status enum - represents the lifecycle of an order
 */
export enum OrderStatus {
  PENDING = 'PENDING',
  OPEN = 'OPEN',
  FILLED = 'FILLED',
  PARTIALLY_FILLED = 'PARTIALLY_FILLED',
  CANCELLED = 'CANCELLED',
  REJECTED = 'REJECTED',
  EXPIRED = 'EXPIRED',
}

/**
 * Order side enum - indicates buy or sell direction
 */
export enum OrderSide {
  BUY = 'BUY',
  SELL = 'SELL',
}

/**
 * Position side enum - indicates long or short position
 */
export enum PositionSide {
  LONG = 'LONG',
  SHORT = 'SHORT',
}

/**
 * Log level enum - for order logs and system logging
 */
export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
}
