import { Injectable, ConflictException, UnauthorizedException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { TwoFactorService } from './services/two-factor.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';
import { encrypt, decrypt } from '../common/utils/encryption.util';
import { setAuthCookies, clearAuthCookies } from '../common/utils/cookie.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private emailService: EmailService,
    private twoFactorService: TwoFactorService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { email, password, name } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user with email_verified = false
    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        name,
        email_verified: false,
      },
      select: {
        id: true,
        email: true,
        name: true,
        email_verified: true,
        created_at: true,
      },
    });

    // Generate verification code and send email
    const verificationCode = this.generateVerificationCode();
    await this.saveVerificationToken(user.id, verificationCode);
    await this.emailService.sendVerificationEmail(email, verificationCode);

    return {
      message: 'Registration successful. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        created_at: user.created_at,
      },
    };
  }

  async login(loginDto: LoginDto, res?: Response) {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // SECURITY: Check if account is locked
    if (user && user.locked_until && user.locked_until > new Date()) {
      const remainingMinutes = Math.ceil((user.locked_until.getTime() - Date.now()) / 60000);
      throw new ForbiddenException(
        `Account is locked due to multiple failed login attempts. Please try again in ${remainingMinutes} minute(s).`
      );
    }

    // SECURITY: Always perform bcrypt comparison to prevent timing attacks
    // Use dummy hash if user doesn't exist
    const passwordHash = user?.password || '$2b$10$YourDummyHashToPreventTimingAttack.PasswordHashHere.DoNotUseRealHash';
    const isPasswordValid = await bcrypt.compare(password, passwordHash);

    // Handle failed login
    if (!user || !isPasswordValid) {
      if (user) {
        // Increment failed login attempts
        const newAttempts = user.login_attempts + 1;
        const lockoutThreshold = 5;

        if (newAttempts >= lockoutThreshold) {
          // Lock account for 15 minutes
          const lockedUntil = new Date();
          lockedUntil.setMinutes(lockedUntil.getMinutes() + 15);

          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              login_attempts: newAttempts,
              locked_until: lockedUntil,
            },
          });

          throw new ForbiddenException(
            'Account locked due to multiple failed login attempts. Please try again in 15 minutes.'
          );
        } else {
          // Increment attempts
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              login_attempts: newAttempts,
            },
          });

          const remainingAttempts = lockoutThreshold - newAttempts;
          throw new UnauthorizedException(
            `Invalid credentials. ${remainingAttempts} attempt(s) remaining before account lockout.`
          );
        }
      }

      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if email is verified
    if (!user.email_verified) {
      throw new ForbiddenException('Email not verified. Please verify your email before logging in.');
    }

    // CRITICAL SECURITY: Check if 2FA is enabled AFTER password verification
    // Never reveal 2FA status before verifying password (prevents user enumeration)
    if (user.two_factor_enabled) {
      // Generate temporary token for 2FA verification (short-lived, 5 minutes)
      const tempPayload = {
        sub: user.id,
        email: user.email,
        purpose: '2fa_pending',
      };

      const tempToken = await this.jwtService.signAsync(tempPayload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: '5m', // 5 minutes to complete 2FA
      });

      return {
        requires2FA: true,
        tempToken,
        message: 'Please provide your 2FA code to complete login',
      };
    }

    // SECURITY: Reset login attempts on successful login
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        login_attempts: 0,
        locked_until: null,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    // Set HTTP-only cookies if response object provided
    if (res) {
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    }

    // Return user data only (no tokens in body)
    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        created_at: user.created_at,
      },
    };
  }

  async refreshToken(req: any, res?: Response) {
    // Extract refresh token from HTTP-only cookie
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      throw new UnauthorizedException('No refresh token provided');
    }

    try {
      // Verify refresh token
      const payload = this.jwtService.verify(refreshToken, {
        secret: process.env.JWT_REFRESH_SECRET,
      });

      // Generate new tokens
      const tokens = await this.generateTokens(payload.sub, payload.email);

      // Set new HTTP-only cookies if response object provided
      if (res) {
        setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      }

      return {
        message: 'Tokens refreshed successfully',
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  /**
   * Verify email with code
   */
  async verifyEmail(email: string, code: string, res?: Response) {
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
    const tokens = await this.generateTokens(user.id, user.email);

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
      },
    };
  }

  /**
   * Resend verification code
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
   * Initiate password reset
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
    const resetCode = this.generateVerificationCode();
    await this.savePasswordResetToken(user.id, resetCode);
    await this.emailService.sendPasswordResetEmail(email, resetCode);

    return {
      message: 'If the email exists, a password reset code has been sent.',
    };
  }

  /**
   * Verify password reset code
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
   * Clean up expired tokens (can be called periodically)
   */
  async cleanupExpiredTokens() {
    const now = new Date();

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.deleteMany({
        where: {
          expires_at: {
            lt: now,
          },
        },
      }),
      this.prisma.passwordResetToken.deleteMany({
        where: {
          expires_at: {
            lt: now,
          },
        },
      }),
    ]);
  }

  private async generateTokens(userId: string, email: string) {
    // Get user's 2FA and password change timestamps for JWT invalidation
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        two_factor_enabled_at: true,
        password_changed_at: true,
      },
    });

    const payload: JwtPayload = {
      sub: userId,
      email,
      two_factor_enabled_at: user?.two_factor_enabled_at
        ? Math.floor(user.two_factor_enabled_at.getTime() / 1000)
        : undefined,
      password_changed_at: user?.password_changed_at
        ? Math.floor(user.password_changed_at.getTime() / 1000)
        : undefined,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_ACCESS_SECRET,
        expiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
      }),
      this.jwtService.signAsync(payload, {
        secret: process.env.JWT_REFRESH_SECRET,
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * OAuth: Validate and login/register user via Google OAuth
   */
  async validateGoogleUser(
    googleId: string,
    email: string,
    name: string,
    image: string | null,
    accessToken: string,
    refreshToken: string | null,
  ) {
    // Check if account already exists
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_provider_account_id: {
          provider: 'google',
          provider_account_id: googleId,
        },
      },
      include: {
        user: true,
      },
    });

    if (existingAccount) {
      // Update OAuth tokens
      await this.prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: this.getTokenExpiryTimestamp(accessToken),
          updated_at: new Date(),
        },
      });

      return {
        id: existingAccount.user.id,
        email: existingAccount.user.email,
        name: existingAccount.user.name,
        image: existingAccount.user.image,
        email_verified: existingAccount.user.email_verified,
      };
    }

    // Check if user exists with this email (auto-link scenario)
    let user = await this.prisma.user.findUnique({
      where: { email },
    });

    if (user) {
      // Auto-link: Create account entry for existing user
      await this.prisma.account.create({
        data: {
          user_id: user.id,
          type: 'oauth',
          provider: 'google',
          provider_account_id: googleId,
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: this.getTokenExpiryTimestamp(accessToken),
          token_type: 'Bearer',
          scope: 'email profile',
        },
      });

      // Update user image if not set
      if (!user.image && image) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { image },
        });
      }

      // Auto-verify email if not already verified (OAuth emails are verified by provider)
      if (!user.email_verified) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: {
            email_verified: true,
            email_verified_at: new Date(),
          },
        });
      }

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        email_verified: user.email_verified,
      };
    }

    // Create new user with OAuth account
    const newUser = await this.prisma.user.create({
      data: {
        email,
        name,
        image,
        password: null, // OAuth users don't have passwords initially
        email_verified: true, // Auto-verify OAuth emails
        email_verified_at: new Date(),
        accounts: {
          create: {
            type: 'oauth',
            provider: 'google',
            provider_account_id: googleId,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: this.getTokenExpiryTimestamp(accessToken),
            token_type: 'Bearer',
            scope: 'email profile',
          },
        },
      },
      select: {
        id: true,
        email: true,
        name: true,
        image: true,
        email_verified: true,
      },
    });

    return newUser;
  }

  /**
   * OAuth: Link Google account to authenticated user
   */
  async linkGoogleAccount(
    userId: string,
    googleId: string,
    email: string,
    name: string,
    image: string | null,
    accessToken: string,
    refreshToken: string | null,
  ) {
    // Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if this Google account is already linked to another user
    const existingAccount = await this.prisma.account.findUnique({
      where: {
        provider_provider_account_id: {
          provider: 'google',
          provider_account_id: googleId,
        },
      },
    });

    if (existingAccount && existingAccount.user_id !== userId) {
      throw new ConflictException('This Google account is already linked to another user');
    }

    if (existingAccount && existingAccount.user_id === userId) {
      throw new ConflictException('This Google account is already linked to your account');
    }

    // Create account link
    await this.prisma.account.create({
      data: {
        user_id: userId,
        type: 'oauth',
        provider: 'google',
        provider_account_id: googleId,
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_at: this.getTokenExpiryTimestamp(accessToken),
        token_type: 'Bearer',
        scope: 'email profile',
      },
    });

    // Update user image if not set
    if (!user.image && image) {
      await this.prisma.user.update({
        where: { id: userId },
        data: { image },
      });
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image || image,
      email_verified: user.email_verified,
    };
  }

  /**
   * OAuth: Unlink OAuth provider from user account
   */
  async unlinkGoogleAccount(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Check if user has a password (prevent lockout)
    if (!user.password) {
      throw new BadRequestException(
        'Cannot unlink Google account. Please set a password first to prevent losing access to your account.',
      );
    }

    // Find Google account
    const googleAccount = user.accounts.find(acc => acc.provider === 'google');

    if (!googleAccount) {
      throw new BadRequestException('Google account is not linked to this user');
    }

    // Delete account link
    await this.prisma.account.delete({
      where: { id: googleAccount.id },
    });

    return {
      message: 'Google account unlinked successfully',
    };
  }

  /**
   * Get linked OAuth accounts for a user
   */
  async getLinkedAccounts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        accounts: {
          select: {
            provider: true,
            created_at: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      accounts: user.accounts.map(acc => ({
        provider: acc.provider,
        linked_at: acc.created_at,
      })),
      hasPassword: !!user.password,
    };
  }

  /**
   * Calculate token expiry timestamp from JWT
   * Returns Unix timestamp (seconds since epoch)
   */
  private getTokenExpiryTimestamp(token: string): number | null {
    try {
      // Google access tokens typically expire in 1 hour
      // Add 3600 seconds (1 hour) to current timestamp
      const now = Math.floor(Date.now() / 1000);
      return now + 3600;
    } catch (error) {
      return null;
    }
  }

  /**
   * SECURITY: Generate cryptographically signed state parameter for OAuth
   * Format: userId:nonce:timestamp:signature
   */
  generateSignedState(userId: string): string {
    const { randomBytes, createHmac } = require('crypto');

    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now().toString();
    const stateData = `link_${userId}:${nonce}:${timestamp}`;

    const signature = createHmac('sha256', process.env.JWT_ACCESS_SECRET || 'fallback-secret')
      .update(stateData)
      .digest('hex');

    return `${stateData}:${signature}`;
  }

  /**
   * SECURITY: Validate signed state parameter from OAuth callback
   * Returns userId if valid, throws error if invalid
   */
  validateSignedState(state: string): string {
    const { createHmac } = require('crypto');

    const parts = state.split(':');
    if (parts.length !== 4) {
      throw new UnauthorizedException('Invalid state parameter format');
    }

    const [userIdPart, nonce, timestamp, signature] = parts;
    const userId = userIdPart.replace('link_', '');

    // Verify signature
    const stateData = `link_${userId}:${nonce}:${timestamp}`;
    const expectedSignature = createHmac('sha256', process.env.JWT_ACCESS_SECRET || 'fallback-secret')
      .update(stateData)
      .digest('hex');

    if (signature !== expectedSignature) {
      throw new UnauthorizedException('Invalid state signature');
    }

    // Verify timestamp (state valid for 10 minutes)
    const stateAge = Date.now() - parseInt(timestamp);
    if (stateAge > 600000) { // 10 minutes
      throw new UnauthorizedException('State parameter expired');
    }

    return userId;
  }

  // ========================================
  // Two-Factor Authentication Methods
  // ========================================

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
  async verify2FALogin(tempToken: string, code: string, ipAddress?: string, userAgent?: string, res?: Response) {
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
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        login_attempts: 0,
        locked_until: null,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

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

  /**
   * Logout user by clearing authentication cookies
   */
  async logout(res: Response) {
    clearAuthCookies(res);
    return {
      message: 'Logged out successfully',
    };
  }

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
