import { Injectable, ConflictException, UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from '../dto/register.dto';
import { LoginDto } from '../dto/login.dto';
import { JwtPayload } from '../strategies/jwt.strategy';
import { setAuthCookies, clearAuthCookies } from '../../common/utils/cookie.util';

/**
 * AuthCoreService: Core authentication operations
 * Handles: User registration, login, token generation, logout
 */
@Injectable()
export class AuthCoreService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  /**
   * Register new user with email/password
   * Email verification code is sent to user's email
   */
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
        preferred_timezone: true,
        created_at: true,
      },
    });

    return {
      userId: user.id,
      email: user.email,
      message: 'Registration successful. Please check your email for verification code.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        email_verified: user.email_verified,
        preferred_timezone: user.preferred_timezone,
        created_at: user.created_at,
      },
    };
  }

  /**
   * Login with email and password
   * Supports 2FA flow and account lockout protection
   */
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
        preferred_timezone: user.preferred_timezone,
        created_at: user.created_at,
      },
    };
  }

  /**
   * Refresh access token using refresh token from cookie
   */
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
   * Logout user by clearing authentication cookies
   */
  async logout(res: Response) {
    clearAuthCookies(res);
    return {
      message: 'Logged out successfully',
    };
  }

  /**
   * Generate JWT access and refresh tokens
   * Includes 2FA and password change timestamps for session invalidation
   */
  async generateTokens(userId: string, email: string) {
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
   * Reset login attempts on successful authentication
   * Called by other services after successful 2FA or email verification
   */
  async resetLoginAttempts(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        login_attempts: 0,
        locked_until: null,
      },
    });
  }
}
