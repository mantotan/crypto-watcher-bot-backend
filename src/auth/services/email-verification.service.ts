import { Injectable, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';
import { setAuthCookies } from '../../common/utils/cookie.util';

/**
 * EmailVerificationService: Email verification operations
 * Handles: Email verification code generation, sending, validation
 */
@Injectable()
export class EmailVerificationService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  /**
   * Send verification code to user's email
   * Called after user registration
   */
  async sendVerificationCode(userId: string, email: string) {
    const verificationCode = this.generateVerificationCode();
    await this.saveVerificationToken(userId, verificationCode);
    await this.emailService.sendVerificationEmail(email, verificationCode);
  }

  /**
   * Verify email with code
   * Generates tokens and sets cookies on successful verification
   */
  async verifyEmail(email: string, code: string, res: Response | undefined, generateTokensFn: (userId: string, email: string) => Promise<{ accessToken: string; refreshToken: string }>) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email already verified');
    }

    // Find valid verification token
    const token = await this.prisma.emailVerificationToken.findFirst({
      where: {
        user_id: user.id,
        token: code,
        used_at: null,
        expires_at: {
          gt: new Date(),
        },
      },
    });

    if (!token) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    // Update user and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          email_verified: true,
          email_verified_at: new Date(),
        },
      }),
      this.prisma.emailVerificationToken.update({
        where: { id: token.id },
        data: {
          used_at: new Date(),
        },
      }),
    ]);

    // Generate tokens
    const tokens = await generateTokensFn(user.id, user.email);

    // Set HTTP-only cookies if response object provided
    if (res) {
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    }

    // Return user data only (no tokens in body)
    return {
      message: 'Email verified successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: true,
        preferred_timezone: user.preferred_timezone,
      },
    };
  }

  /**
   * Resend verification code to user's email
   */
  async resendVerificationCode(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    if (user.email_verified) {
      throw new BadRequestException('Email already verified');
    }

    // Generate new verification code
    const verificationCode = this.generateVerificationCode();
    await this.saveVerificationToken(user.id, verificationCode);
    await this.emailService.sendVerificationEmail(email, verificationCode);

    return {
      message: 'Verification code sent successfully',
    };
  }

  /**
   * Generate 6-digit verification code using cryptographically secure random
   */
  private generateVerificationCode(): string {
    const { randomInt } = require('crypto');
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Save verification token to database
   * SECURITY: Invalidates all previous tokens before creating new one
   */
  private async saveVerificationToken(userId: string, code: string) {
    const expiryMinutes = parseInt(process.env.EMAIL_VERIFICATION_CODE_EXPIRY_MINUTES || '30');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Invalidate all previous unused verification codes for this user
    await this.prisma.emailVerificationToken.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    // Create new verification token
    await this.prisma.emailVerificationToken.create({
      data: {
        user_id: userId,
        token: code,
        expires_at: expiresAt,
      },
    });
  }

  /**
   * Clean up expired verification tokens
   * Can be called periodically by a cron job
   */
  async cleanupExpiredTokens() {
    const now = new Date();

    await this.prisma.emailVerificationToken.deleteMany({
      where: {
        expires_at: {
          lt: now,
        },
      },
    });
  }
}
