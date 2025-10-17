import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { TOTP, Secret } from 'otpauth';
import * as QRCode from 'qrcode';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { encrypt, decrypt } from '../../common/utils/encryption.util';

/**
 * Two-Factor Authentication Service
 * Handles TOTP generation, verification, backup codes, and rate limiting
 */
@Injectable()
export class TwoFactorService {
  private readonly TOTP_ISSUER = 'CryptoWatcher';
  private readonly TOTP_DIGITS = 6;
  private readonly TOTP_PERIOD = 30; // seconds
  private readonly TOTP_WINDOW = 1; // Allow 1 period before/after (30s tolerance)

  private readonly BACKUP_CODE_COUNT = 10;
  private readonly BACKUP_CODE_LENGTH = 8; // 8 characters per code

  private readonly RATE_LIMIT_MAX_ATTEMPTS = 5;
  private readonly RATE_LIMIT_WINDOW_MINUTES = 15;

  constructor(private prisma: PrismaService) {}

  /**
   * Generate a new TOTP secret (Base32 encoded)
   * @returns Base32-encoded secret string
   */
  generateTOTPSecret(): string {
    const secret = new Secret({ size: 20 }); // 20 bytes = 160 bits
    return secret.base32;
  }

  /**
   * Generate QR code data URL for authenticator app setup
   * @param email - User's email
   * @param secret - TOTP secret (Base32)
   * @returns Data URL for QR code image
   */
  async generateQRCode(email: string, secret: string): Promise<string> {
    const totp = new TOTP({
      issuer: this.TOTP_ISSUER,
      label: email,
      algorithm: 'SHA1',
      digits: this.TOTP_DIGITS,
      period: this.TOTP_PERIOD,
      secret: secret,
    });

    const otpauthUrl = totp.toString();

    // Generate QR code as data URL
    return await QRCode.toDataURL(otpauthUrl);
  }

  /**
   * Verify a TOTP code against a secret
   * @param code - 6-digit TOTP code from user
   * @param secret - TOTP secret (Base32)
   * @returns true if code is valid
   */
  verifyTOTPCode(code: string, secret: string): boolean {
    const totp = new TOTP({
      issuer: this.TOTP_ISSUER,
      algorithm: 'SHA1',
      digits: this.TOTP_DIGITS,
      period: this.TOTP_PERIOD,
      secret: secret,
    });

    // Validate with time window tolerance
    const delta = totp.validate({ token: code, window: this.TOTP_WINDOW });

    return delta !== null;
  }

  /**
   * Generate backup codes for account recovery
   * Format: XXXX-XXXX (8 characters split with hyphen)
   * @returns Array of plaintext backup codes (show to user ONCE)
   */
  generateBackupCodes(): string[] {
    const codes: string[] = [];

    for (let i = 0; i < this.BACKUP_CODE_COUNT; i++) {
      // Generate 8 random hex characters
      const code = randomBytes(this.BACKUP_CODE_LENGTH / 2)
        .toString('hex')
        .toUpperCase();

      // Format as XXXX-XXXX
      const formatted = `${code.slice(0, 4)}-${code.slice(4)}`;
      codes.push(formatted);
    }

    return codes;
  }

  /**
   * Hash backup codes for storage
   * SECURITY: Backup codes are hashed like passwords (one-way)
   * @param codes - Plaintext backup codes
   * @returns Array of hashed codes
   */
  async hashBackupCodes(codes: string[]): Promise<string[]> {
    const saltRounds = 10;
    return Promise.all(
      codes.map(code => bcrypt.hash(code.replace('-', ''), saltRounds))
    );
  }

  /**
   * Verify a backup code against stored hashes
   * @param userId - User ID
   * @param code - Backup code from user (with or without hyphen)
   * @returns true if code is valid and unused
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    // Remove hyphen for comparison
    const normalizedCode = code.replace('-', '').toUpperCase();

    // Get all unused backup codes for user
    const backupCodes = await this.prisma.twoFactorBackupCode.findMany({
      where: {
        user_id: userId,
        used_at: null,
      },
    });

    // Try to match against all unused codes
    for (const codeRecord of backupCodes) {
      const isValid = await bcrypt.compare(normalizedCode, codeRecord.code_hash);

      if (isValid) {
        // Mark code as used
        await this.prisma.twoFactorBackupCode.update({
          where: { id: codeRecord.id },
          data: { used_at: new Date() },
        });

        return true;
      }
    }

    return false;
  }

  /**
   * Check 2FA rate limiting
   * @param userId - User ID
   * @throws UnauthorizedException if rate limit exceeded
   */
  async checkRateLimit(userId: string): Promise<void> {
    const windowStart = new Date();
    windowStart.setMinutes(windowStart.getMinutes() - this.RATE_LIMIT_WINDOW_MINUTES);

    const recentAttempts = await this.prisma.twoFactorAttempt.count({
      where: {
        user_id: userId,
        success: false,
        timestamp: {
          gte: windowStart,
        },
      },
    });

    if (recentAttempts >= this.RATE_LIMIT_MAX_ATTEMPTS) {
      throw new UnauthorizedException(
        `Too many failed 2FA attempts. Please try again in ${this.RATE_LIMIT_WINDOW_MINUTES} minutes.`
      );
    }
  }

  /**
   * Log a 2FA verification attempt
   * @param userId - User ID
   * @param success - Whether the attempt was successful
   * @param ipAddress - Client IP address (optional)
   * @param userAgent - Client user agent (optional)
   */
  async logAttempt(
    userId: string,
    success: boolean,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<void> {
    await this.prisma.twoFactorAttempt.create({
      data: {
        user_id: userId,
        success,
        ip_address: ipAddress,
        user_agent: userAgent,
        timestamp: new Date(),
      },
    });
  }

  /**
   * Verify 2FA code (TOTP or backup code) with rate limiting
   * @param userId - User ID
   * @param code - 6-digit TOTP code or backup code
   * @param ipAddress - Client IP (optional)
   * @param userAgent - Client user agent (optional)
   * @returns { success: boolean, usedBackupCode: boolean }
   */
  async verify2FACode(
    userId: string,
    code: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ success: boolean; usedBackupCode: boolean }> {
    // Check rate limit first
    await this.checkRateLimit(userId);

    // Get user's 2FA secret
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        two_factor_enabled: true,
        two_factor_secret: true,
      },
    });

    if (!user || !user.two_factor_enabled || !user.two_factor_secret) {
      throw new BadRequestException('2FA is not enabled for this account');
    }

    // Try TOTP verification first
    const decryptedSecret = decrypt(user.two_factor_secret);
    const totpValid = this.verifyTOTPCode(code, decryptedSecret);

    if (totpValid) {
      await this.logAttempt(userId, true, ipAddress, userAgent);
      return { success: true, usedBackupCode: false };
    }

    // Try backup code verification
    const backupCodeValid = await this.verifyBackupCode(userId, code);

    if (backupCodeValid) {
      await this.logAttempt(userId, true, ipAddress, userAgent);
      return { success: true, usedBackupCode: true };
    }

    // Both failed - log failed attempt
    await this.logAttempt(userId, false, ipAddress, userAgent);
    throw new UnauthorizedException('Invalid 2FA code');
  }

  /**
   * Clean up old 2FA attempts (for periodic cleanup job)
   * @param daysOld - Delete attempts older than this many days
   */
  async cleanupOldAttempts(daysOld: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    await this.prisma.twoFactorAttempt.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });
  }

  /**
   * Get count of remaining unused backup codes for a user
   * @param userId - User ID
   * @returns Number of unused backup codes
   */
  async getRemainingBackupCodesCount(userId: string): Promise<number> {
    return await this.prisma.twoFactorBackupCode.count({
      where: {
        user_id: userId,
        used_at: null,
      },
    });
  }
}
