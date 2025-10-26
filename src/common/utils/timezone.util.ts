import { DateTime } from 'luxon';
import { BadRequestException } from '@nestjs/common';

/**
 * Convert a datetime string in user's timezone to UTC Date object
 *
 * @param dateTimeStr - Datetime string (e.g., '2024-01-01 00:00:00' or '2024-01-01T00:00:00')
 * @param timezone - IANA timezone identifier (e.g., 'Asia/Singapore', 'America/New_York')
 * @returns Date object in UTC
 * @throws BadRequestException if datetime string is invalid or timezone is invalid
 *
 * @example
 * ```typescript
 * // User in Singapore (UTC+8) wants to backtest from 9:00 AM SGT
 * const utcDate = convertUserTimezoneToUTC('2024-01-01 09:00:00', 'Asia/Singapore');
 * // Returns: Date object representing 2024-01-01T01:00:00.000Z (9 AM SGT = 1 AM UTC)
 * ```
 */
export function convertUserTimezoneToUTC(dateTimeStr: string, timezone: string): Date {
  if (!dateTimeStr || typeof dateTimeStr !== 'string') {
    throw new BadRequestException('Invalid datetime string provided');
  }

  if (!timezone || typeof timezone !== 'string') {
    throw new BadRequestException('Invalid timezone provided');
  }

  // Parse datetime string as being in the user's timezone
  // Support both formats: '2024-01-01 00:00:00' and '2024-01-01T00:00:00'
  let dt: DateTime;

  // Try ISO format first (YYYY-MM-DDTHH:mm:ss)
  dt = DateTime.fromISO(dateTimeStr, { zone: timezone });

  // If invalid, try SQL format (YYYY-MM-DD HH:mm:ss)
  if (!dt.isValid) {
    dt = DateTime.fromSQL(dateTimeStr, { zone: timezone });
  }

  // Check if parsing was successful
  if (!dt.isValid) {
    throw new BadRequestException(
      `Invalid datetime format: "${dateTimeStr}". Expected format: "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DDTHH:mm:ss"`
    );
  }

  // Check if timezone is valid
  if (!dt.zoneName || dt.zoneName === 'invalid') {
    throw new BadRequestException(
      `Invalid timezone: "${timezone}". Expected IANA timezone identifier (e.g., "Asia/Singapore", "America/New_York")`
    );
  }

  // Convert to UTC and return as JavaScript Date object
  const utcDate = dt.toUTC().toJSDate();

  return utcDate;
}

/**
 * Validate IANA timezone identifier
 *
 * @param timezone - IANA timezone identifier to validate
 * @returns true if valid, false otherwise
 *
 * @example
 * ```typescript
 * isValidTimezone('Asia/Singapore'); // true
 * isValidTimezone('America/New_York'); // true
 * isValidTimezone('Invalid/Timezone'); // false
 * ```
 */
export function isValidTimezone(timezone: string): boolean {
  if (!timezone || typeof timezone !== 'string') {
    return false;
  }

  try {
    const dt = DateTime.now().setZone(timezone);
    return dt.isValid && dt.zoneName !== 'invalid';
  } catch {
    return false;
  }
}

/**
 * Format UTC Date to user's timezone for display
 *
 * @param date - Date object in UTC
 * @param timezone - IANA timezone identifier
 * @param format - Output format (default: 'yyyy-MM-dd HH:mm:ss')
 * @returns Formatted datetime string in user's timezone
 *
 * @example
 * ```typescript
 * const utcDate = new Date('2024-01-01T01:00:00.000Z');
 * formatUTCToUserTimezone(utcDate, 'Asia/Singapore');
 * // Returns: '2024-01-01 09:00:00' (1 AM UTC = 9 AM SGT)
 * ```
 */
export function formatUTCToUserTimezone(
  date: Date,
  timezone: string,
  format: string = 'yyyy-MM-dd HH:mm:ss'
): string {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    throw new BadRequestException('Invalid date provided');
  }

  if (!timezone || typeof timezone !== 'string') {
    throw new BadRequestException('Invalid timezone provided');
  }

  const dt = DateTime.fromJSDate(date, { zone: 'UTC' });

  if (!dt.isValid) {
    throw new BadRequestException('Invalid date provided');
  }

  const userDt = dt.setZone(timezone);

  if (!userDt.isValid || userDt.zoneName === 'invalid') {
    throw new BadRequestException(
      `Invalid timezone: "${timezone}". Expected IANA timezone identifier`
    );
  }

  return userDt.toFormat(format);
}
