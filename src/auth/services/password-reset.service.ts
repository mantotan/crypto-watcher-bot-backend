import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';

/**
 * PasswordResetService: Password reset operations
 * Handles: Forgot password flow, reset code verification, password reset
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  /**
   * Initiate password reset
   * Sends reset code to user's email
   * SECURITY: Doesn't reveal if email exists or not
   */
  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Don't reveal if user exists or not for security
    if (!user) {
      return {
        message: 'If the email exists, a password reset code has been sent.',
      };
    }

    // Generate reset code
    const resetCode = this.generateResetCode();
    await this.savePasswordResetToken(user.id, resetCode);
    await this.emailService.sendPasswordResetEmail(email, resetCode);

    return {
      message: 'If the email exists, a password reset code has been sent.',
    };
  }

  /**
   * Verify password reset code validity
   */
  async verifyResetCode(email: string, code: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset code');
    }

    // Find valid reset token
    const token = await this.prisma.passwordResetToken.findFirst({
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
      throw new BadRequestException('Invalid or expired reset code');
    }

    return {
      message: 'Reset code is valid',
      valid: true,
    };
  }

  /**
   * Reset password with code
   */
  async resetPassword(email: string, code: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      throw new BadRequestException('Invalid reset code');
    }

    // Find valid reset token
    const token = await this.prisma.passwordResetToken.findFirst({
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
      throw new BadRequestException('Invalid or expired reset code');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and mark token as used
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: {
          password: hashedPassword,
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: token.id },
        data: {
          used_at: new Date(),
        },
      }),
    ]);

    return {
      message: 'Password reset successfully',
    };
  }

  /**
   * Generate 6-digit reset code using cryptographically secure random
   */
  private generateResetCode(): string {
    const { randomInt } = require('crypto');
    return randomInt(100000, 1000000).toString();
  }

  /**
   * Save password reset token to database
   * SECURITY: Invalidates all previous tokens before creating new one
   */
  private async savePasswordResetToken(userId: string, code: string) {
    const expiryMinutes = parseInt(process.env.PASSWORD_RESET_CODE_EXPIRY_MINUTES || '15');
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + expiryMinutes);

    // Invalidate all previous unused reset codes for this user
    await this.prisma.passwordResetToken.updateMany({
      where: {
        user_id: userId,
        used_at: null,
      },
      data: {
        used_at: new Date(),
      },
    });

    // Create new password reset token
    await this.prisma.passwordResetToken.create({
      data: {
        user_id: userId,
        token: code,
        expires_at: expiresAt,
      },
    });
  }

  /**
   * Clean up expired password reset tokens
   * Can be called periodically by a cron job
   */
  async cleanupExpiredTokens() {
    const now = new Date();

    await this.prisma.passwordResetToken.deleteMany({
      where: {
        expires_at: {
          lt: now,
        },
      },
    });
  }
}
