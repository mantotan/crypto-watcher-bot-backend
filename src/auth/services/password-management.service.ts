import { Injectable, UnauthorizedException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { EmailService } from '../../email/email.service';

/**
 * PasswordManagementService: Password management operations
 * Handles: Setting password for OAuth users
 */
@Injectable()
export class PasswordManagementService {
  constructor(
    private prisma: PrismaService,
    private emailService: EmailService,
  ) {}

  /**
   * Set password for OAuth users who don't have a password yet
   * SECURITY: Only works if user.password is NULL (prevents use as change password)
   */
  async setPassword(userId: string, newPassword: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        password: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // CRITICAL: Only allow setting password if user doesn't have one
    if (user.password !== null) {
      throw new BadRequestException(
        'Password is already set. Use the password reset flow to change your password.'
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update user with new password and track password change time
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        password_changed_at: new Date(),
      },
    });

    // Send email notification
    await this.emailService.sendPasswordSetEmail(user.email, user.name);

    return {
      message: 'Password set successfully. You can now log in with email and password.',
    };
  }
}
