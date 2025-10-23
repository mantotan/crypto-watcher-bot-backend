import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { TwoFactorService } from './two-factor.service';
import { encrypt, decrypt } from '../../common/utils/encryption.util';
import { setAuthCookies } from '../../common/utils/cookie.util';

/**
 * TwoFactorAuthService: 2FA lifecycle management
 * Handles: Setup, enable, disable, login verification, backup codes
 */
@Injectable()
export class TwoFactorAuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private twoFactorService: TwoFactorService,
  ) {}

  /**
   * Setup 2FA for a user (Step 1: Generate secret and QR code)
   * SECURITY: Requires current password confirmation
   * NOTE: 2FA is NOT enabled yet - user must verify code in step 2
   */
  async setup2FA(userId: string, currentPassword: string) {
    // Verify current password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('User not found or no password set');
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (user.two_factor_enabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    // Generate TOTP secret
    const secret = this.twoFactorService.generateTOTPSecret();
    const encryptedSecret = encrypt(secret);

    // Generate QR code
    const qrCodeDataUrl = await this.twoFactorService.generateQRCode(user.email, secret);

    // Save secret to DB but keep 2FA disabled
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        two_factor_secret: encryptedSecret,
        two_factor_enabled: false, // Not enabled yet!
        two_factor_enabled_at: null,
      },
    });

    // Return QR code for user to scan
    return {
      message: 'Scan QR code with authenticator app, then verify with code to complete setup',
      qrCode: qrCodeDataUrl,
      secret, // For manual entry
    };
  }

  /**
   * Enable 2FA for a user (Step 2: Verify code and activate)
   * SECURITY: Verifies user can generate valid codes before enabling
   */
  async enable2FA(userId: string, twoFactorCode: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.two_factor_enabled) {
      throw new BadRequestException('2FA is already enabled');
    }

    if (!user.two_factor_secret) {
      throw new BadRequestException('2FA setup not started. Please call /auth/2fa/setup first.');
    }

    // Decrypt and verify the code
    const decryptedSecret = decrypt(user.two_factor_secret);
    const isValid = this.twoFactorService.verifyTOTPCode(twoFactorCode, decryptedSecret);

    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code. Please try again.');
    }

    // Code is valid! Generate backup codes and enable 2FA
    const backupCodes = this.twoFactorService.generateBackupCodes();
    const hashedCodes = await this.twoFactorService.hashBackupCodes(backupCodes);

    // Save everything in transaction
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: true,
          two_factor_enabled_at: new Date(),
        },
      }),
      ...hashedCodes.map((codeHash) =>
        this.prisma.twoFactorBackupCode.create({
          data: {
            user_id: userId,
            code_hash: codeHash,
          },
        })
      ),
    ]);

    // Send email notification
    await this.emailService.send2FAEnabledEmail(user.email, user.name);

    // Return backup codes (show ONCE)
    return {
      message: '2FA enabled successfully',
      backupCodes, // User must save these
    };
  }

  /**
   * Disable 2FA for a user
   * SECURITY: Requires both password AND 2FA code
   */
  async disable2FA(userId: string, currentPassword: string, twoFactorCode: string) {
    // Verify current password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('User not found or no password set');
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (!user.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Verify 2FA code
    const { success } = await this.twoFactorService.verify2FACode(
      userId,
      twoFactorCode
    );

    if (!success) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    // Disable 2FA and delete backup codes
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: {
          two_factor_enabled: false,
          two_factor_secret: null,
          two_factor_enabled_at: null,
        },
      }),
      this.prisma.twoFactorBackupCode.deleteMany({
        where: { user_id: userId },
      }),
    ]);

    // Send email notification
    await this.emailService.send2FADisabledEmail(user.email, user.name);

    return {
      message: '2FA disabled successfully. All sessions have been invalidated.',
    };
  }

  /**
   * Verify 2FA code during login
   * SECURITY: Completes login flow after password verification
   */
  async verify2FALogin(
    tempToken: string,
    code: string,
    ipAddress: string | undefined,
    userAgent: string | undefined,
    res: Response | undefined,
    generateTokensFn: (userId: string, email: string) => Promise<{ accessToken: string; refreshToken: string }>,
    resetLoginAttemptsFn: (userId: string) => Promise<void>,
  ) {
    // Verify temp token
    let payload: any;
    try {
      payload = this.jwtService.verify(tempToken, {
        secret: process.env.JWT_ACCESS_SECRET,
      });
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired temporary token');
    }

    if (payload.purpose !== '2fa_pending') {
      throw new UnauthorizedException('Invalid token purpose');
    }

    const userId = payload.sub;

    // Verify 2FA code
    const { success, usedBackupCode } = await this.twoFactorService.verify2FACode(
      userId,
      code,
      ipAddress,
      userAgent
    );

    if (!success) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    // Get user details
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // SECURITY: Reset login attempts on successful 2FA
    await resetLoginAttemptsFn(userId);

    // Generate tokens
    const tokens = await generateTokensFn(user.id, user.email);

    // Set HTTP-only cookies if response object provided
    if (res) {
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    }

    // Send email if backup code was used
    if (usedBackupCode) {
      const remaining = await this.twoFactorService.getRemainingBackupCodesCount(userId);
      await this.emailService.sendBackupCodeUsedEmail(user.email, user.name, remaining);
    }

    // Return user data only (no tokens in body)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        preferred_timezone: user.preferred_timezone,
        created_at: user.created_at,
      },
      usedBackupCode,
    };
  }

  /**
   * Regenerate backup codes
   * SECURITY: Requires password AND 2FA code
   */
  async regenerateBackupCodes(userId: string, currentPassword: string, twoFactorCode: string) {
    // Verify current password
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.password) {
      throw new UnauthorizedException('User not found or no password set');
    }

    const passwordValid = await bcrypt.compare(currentPassword, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Invalid password');
    }

    if (!user.two_factor_enabled) {
      throw new BadRequestException('2FA is not enabled');
    }

    // Verify 2FA code (can't use backup code to regenerate backup codes)
    const decryptedSecret = decrypt(user.two_factor_secret);
    const totpValid = this.twoFactorService.verifyTOTPCode(twoFactorCode, decryptedSecret);

    if (!totpValid) {
      throw new UnauthorizedException('Invalid 2FA code. Backup codes cannot be used for this operation.');
    }

    // Generate new backup codes
    const backupCodes = this.twoFactorService.generateBackupCodes();
    const hashedCodes = await this.twoFactorService.hashBackupCodes(backupCodes);

    // Delete old codes and create new ones
    await this.prisma.$transaction([
      this.prisma.twoFactorBackupCode.deleteMany({
        where: { user_id: userId },
      }),
      ...hashedCodes.map((codeHash) =>
        this.prisma.twoFactorBackupCode.create({
          data: {
            user_id: userId,
            code_hash: codeHash,
          },
        })
      ),
    ]);

    return {
      message: 'Backup codes regenerated successfully',
      backupCodes, // Show new codes ONCE
    };
  }

  /**
   * Get 2FA status for a user
   */
  async get2FAStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        two_factor_enabled: true,
        two_factor_enabled_at: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    let remainingBackupCodes = 0;
    if (user.two_factor_enabled) {
      remainingBackupCodes = await this.twoFactorService.getRemainingBackupCodesCount(userId);
    }

    return {
      twoFactorEnabled: user.two_factor_enabled,
      twoFactorEnabledAt: user.two_factor_enabled_at,
      remainingBackupCodes,
    };
  }
}
