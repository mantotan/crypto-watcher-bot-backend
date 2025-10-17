import { Controller, Post, Get, Body, UseGuards, Request, Delete, Param, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { AuthGuard } from '@nestjs/passport';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { VerifyResetCodeDto } from './dto/verify-reset-code.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { Setup2FADto } from './dto/setup-2fa.dto';
import { Enable2FADto } from './dto/enable-2fa.dto';
import { Disable2FADto } from './dto/disable-2fa.dto';
import { Verify2FADto } from './dto/verify-2fa.dto';
import { RegenerateBackupCodesDto } from './dto/regenerate-backup-codes.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered. Verification email sent. No tokens returned until email is verified.'
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @ApiResponse({ status: 400, description: 'Invalid input' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @Post('verify-email')
  @ApiOperation({ summary: 'Verify email with 6-digit code (sets HTTP-only cookies)' })
  @ApiResponse({
    status: 200,
    description: 'Email verified successfully. Tokens set as HTTP-only cookies.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        user: { type: 'object' }
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Invalid or expired verification code' })
  @ApiResponse({ status: 429, description: 'Too many attempts. Rate limit: 10 per minute' })
  async verifyEmail(@Body() verifyEmailDto: VerifyEmailDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.verifyEmail(verifyEmailDto.email, verifyEmailDto.code, res);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend email verification code' })
  @ApiResponse({ status: 200, description: 'Verification code sent successfully' })
  @ApiResponse({ status: 400, description: 'User not found or email already verified' })
  @ApiResponse({ status: 429, description: 'Too many requests. Rate limit: 3 per minute' })
  async resendVerification(@Body() resendVerificationDto: ResendVerificationDto) {
    return this.authService.resendVerificationCode(resendVerificationDto.email);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login with email and password (sets HTTP-only cookies)' })
  @ApiResponse({
    status: 200,
    description: 'Successfully authenticated. Tokens set as HTTP-only cookies.',
    schema: {
      oneOf: [
        {
          type: 'object',
          properties: {
            user: { type: 'object' },
          },
          description: 'Login successful - tokens set in cookies'
        },
        {
          type: 'object',
          properties: {
            requires2FA: { type: 'boolean', example: true },
            tempToken: { type: 'string' },
            message: { type: 'string' }
          },
          description: '2FA required - use temp token to verify'
        }
      ]
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: 'Email not verified' })
  async login(@Body() loginDto: LoginDto, @Res({ passthrough: true }) res: Response) {
    return this.authService.login(loginDto, res);
  }

  @Post('refresh')
  @ApiOperation({
    summary: 'Refresh access token using refresh token from cookie',
    description: 'Reads refreshToken from HTTP-only cookie and issues new tokens'
  })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully. New tokens set as HTTP-only cookies.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Tokens refreshed successfully' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid or missing refresh token' })
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    return this.authService.refreshToken(req, res);
  }

  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('forgot-password')
  @ApiOperation({ summary: 'Request password reset code' })
  @ApiResponse({
    status: 200,
    description: 'Password reset code sent if email exists (message returned regardless for security)'
  })
  @ApiResponse({ status: 429, description: 'Too many requests. Rate limit: 3 per minute' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.forgotPassword(forgotPasswordDto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @Post('verify-reset-code')
  @ApiOperation({ summary: 'Verify password reset code is valid' })
  @ApiResponse({ status: 200, description: 'Reset code is valid' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset code' })
  @ApiResponse({ status: 429, description: 'Too many attempts. Rate limit: 5 per minute' })
  async verifyResetCode(@Body() verifyResetCodeDto: VerifyResetCodeDto) {
    return this.authService.verifyResetCode(verifyResetCodeDto.email, verifyResetCodeDto.code);
  }

  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 attempts per minute
  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password with verification code' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset code' })
  @ApiResponse({ status: 429, description: 'Too many attempts. Rate limit: 5 per minute' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    return this.authService.resetPassword(
      resetPasswordDto.email,
      resetPasswordDto.code,
      resetPasswordDto.newPassword,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('set-password')
  @ApiOperation({
    summary: 'Set password for OAuth users',
    description: 'Allows OAuth users (Google login) who don\'t have a password to set one. Once set, users can log in with either method. This endpoint ONLY works if the user has no password yet.'
  })
  @ApiResponse({
    status: 200,
    description: 'Password set successfully. User can now log in with email/password.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Password set successfully. You can now log in with email and password.' }
      }
    }
  })
  @ApiResponse({
    status: 400,
    description: 'Password is already set. Use password reset flow to change it.'
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - must be logged in' })
  async setPassword(@Request() req, @Body() setPasswordDto: SetPasswordDto) {
    const userId = req.user.id;
    return this.authService.setPassword(userId, setPasswordDto.password);
  }

  @SkipThrottle() // Skip rate limiting for profile checks (called frequently, protected by JWT)
  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getProfile(@Request() req) {
    return req.user;
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Logout user by clearing authentication cookies' })
  @ApiResponse({
    status: 200,
    description: 'Successfully logged out. Cookies cleared.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string', example: 'Logged out successfully' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Res({ passthrough: true }) res: Response) {
    return this.authService.logout(res);
  }

  // ========================================
  // Google OAuth Endpoints
  // ========================================

  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Initiate Google OAuth login flow' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google consent screen',
  })
  async googleLogin() {
    // Guard redirects to Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback (handles both login and account linking)' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to frontend with secure HTTP-only cookies (login) or to settings page (linking)',
  })
  @ApiResponse({ status: 401, description: 'OAuth authentication failed' })
  @ApiResponse({ status: 409, description: 'Google account already linked to another user (linking only)' })
  async googleCallback(@Request() req, @Res() res: Response) {
    const user = req.user;
    const isLinkingRequest = user.isLinkingRequest;
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    if (isLinkingRequest) {
      // Account linking flow - redirect to dashboard account page
      const redirectUrl = `${frontendUrl}/dashboard/account?linked=google&success=true`;
      return res.redirect(redirectUrl);
    }

    // Regular login flow - generate tokens and set cookies
    const tokens = await this.authService['generateTokens'](user.id, user.email);

    // SECURITY: Set tokens in HTTP-only cookies instead of URL params
    const isProduction = process.env.NODE_ENV === 'production';

    res.cookie('accessToken', tokens.accessToken, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: 'lax',
      domain: isProduction ? undefined : 'localhost', // Share across localhost ports in dev
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      path: '/',
    });

    res.cookie('refreshToken', tokens.refreshToken, {
      httpOnly: true,
      secure: isProduction, // HTTPS only in production
      sameSite: 'strict',
      domain: isProduction ? undefined : 'localhost', // Share across localhost ports in dev
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });

    // Redirect to dashboard (tokens are in cookies)
    return res.redirect(`${frontendUrl}/dashboard`);
  }

  @UseGuards(JwtAuthGuard)
  @Get('google/link')
  @ApiOperation({ summary: 'Initiate Google account linking for authenticated user' })
  @ApiResponse({
    status: 302,
    description: 'Redirects to Google consent screen with state parameter',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized - user must be logged in' })
  async googleLink(@Request() req, @Res() res: Response) {
    const userId = req.user.id;

    // SECURITY: Generate signed state parameter to prevent CSRF
    const state = this.authService.generateSignedState(userId);

    // Build Google OAuth URL with signed state parameter
    // IMPORTANT: Use same callback URL as login (differentiate via state parameter)
    const googleAuthUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    googleAuthUrl.searchParams.append('client_id', process.env.GOOGLE_CLIENT_ID);
    googleAuthUrl.searchParams.append('redirect_uri', process.env.GOOGLE_CALLBACK_URL);
    googleAuthUrl.searchParams.append('response_type', 'code');
    googleAuthUrl.searchParams.append('scope', 'email profile');
    googleAuthUrl.searchParams.append('state', state);
    googleAuthUrl.searchParams.append('access_type', 'offline');
    googleAuthUrl.searchParams.append('prompt', 'consent');

    return res.redirect(googleAuthUrl.toString());
  }

  @UseGuards(JwtAuthGuard)
  @Delete('account/unlink/:provider')
  @ApiOperation({ summary: 'Unlink OAuth provider from account' })
  @ApiParam({
    name: 'provider',
    description: 'OAuth provider to unlink',
    enum: ['google'],
    example: 'google',
  })
  @ApiResponse({ status: 200, description: 'Provider unlinked successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot unlink - user has no password set or provider not linked',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async unlinkProvider(@Request() req, @Param('provider') provider: string) {
    const userId = req.user.id;

    if (provider === 'google') {
      return this.authService.unlinkGoogleAccount(userId);
    }

    throw new Error('Invalid provider');
  }

  @SkipThrottle() // Skip rate limiting for account status checks (protected by JWT)
  @UseGuards(JwtAuthGuard)
  @Get('accounts/linked')
  @ApiOperation({ summary: 'Get list of linked OAuth providers' })
  @ApiResponse({
    status: 200,
    description: 'List of linked OAuth accounts',
    schema: {
      type: 'object',
      properties: {
        accounts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              provider: { type: 'string', example: 'google' },
              linked_at: { type: 'string', format: 'date-time' },
            },
          },
        },
        hasPassword: { type: 'boolean', example: true },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getLinkedAccounts(@Request() req) {
    const userId = req.user.id;
    return this.authService.getLinkedAccounts(userId);
  }

  // ========================================
  // Two-Factor Authentication Endpoints
  // ========================================

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  @ApiOperation({
    summary: 'Setup 2FA - Step 1: Generate QR code',
    description: 'Generates TOTP secret and QR code. User must scan QR code and verify with code in step 2 (/auth/2fa/enable).'
  })
  @ApiResponse({
    status: 200,
    description: 'QR code generated. Scan with authenticator app and verify to complete setup.',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        qrCode: { type: 'string', description: 'QR code data URL for authenticator app' },
        secret: { type: 'string', description: 'TOTP secret for manual entry (Base32)' },
      },
    },
  })
  @ApiResponse({ status: 400, description: '2FA already enabled' })
  @ApiResponse({ status: 401, description: 'Invalid password or unauthorized' })
  async setup2FA(@Request() req, @Body() setup2FADto: Setup2FADto) {
    const userId = req.user.id;
    return this.authService.setup2FA(userId, setup2FADto.currentPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  @ApiOperation({
    summary: 'Enable 2FA - Step 2: Verify code and activate',
    description: 'Verifies 6-digit code from authenticator app. If valid, enables 2FA and returns backup codes.'
  })
  @ApiResponse({
    status: 200,
    description: '2FA enabled successfully. Returns backup codes (save these securely).',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'One-time backup codes (save these securely)',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '2FA already enabled or setup not started' })
  @ApiResponse({ status: 401, description: 'Invalid 2FA code or unauthorized' })
  async enable2FA(@Request() req, @Body() enable2FADto: Enable2FADto) {
    const userId = req.user.id;
    return this.authService.enable2FA(userId, enable2FADto.twoFactorCode);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  @ApiOperation({ summary: 'Disable 2FA for authenticated user' })
  @ApiResponse({
    status: 200,
    description: '2FA disabled successfully. All sessions invalidated.',
  })
  @ApiResponse({ status: 400, description: '2FA is not enabled' })
  @ApiResponse({ status: 401, description: 'Invalid password or 2FA code' })
  async disable2FA(@Request() req, @Body() disable2FADto: Disable2FADto) {
    const userId = req.user.id;
    return this.authService.disable2FA(
      userId,
      disable2FADto.currentPassword,
      disable2FADto.twoFactorCode
    );
  }

  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 attempts per minute
  @Post('2fa/verify')
  @ApiOperation({ summary: 'Verify 2FA code during login (completes login flow, sets HTTP-only cookies)' })
  @ApiResponse({
    status: 200,
    description: '2FA verified successfully. Tokens set as HTTP-only cookies.',
    schema: {
      type: 'object',
      properties: {
        user: { type: 'object' },
        usedBackupCode: { type: 'boolean' }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid temporary token or 2FA code' })
  @ApiResponse({ status: 429, description: 'Too many failed 2FA attempts. Rate limit: 10 per minute' })
  async verify2FA(@Request() req, @Body() verify2FADto: Verify2FADto, @Res({ passthrough: true }) res: Response) {
    const ipAddress = req.ip;
    const userAgent = req.headers['user-agent'];

    return this.authService.verify2FALogin(
      verify2FADto.tempToken,
      verify2FADto.code,
      ipAddress,
      userAgent,
      res
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/regenerate-backup-codes')
  @ApiOperation({ summary: 'Regenerate backup codes' })
  @ApiResponse({
    status: 200,
    description: 'Backup codes regenerated successfully. Returns new codes (show once).',
    schema: {
      type: 'object',
      properties: {
        message: { type: 'string' },
        backupCodes: {
          type: 'array',
          items: { type: 'string' },
          description: 'New one-time backup codes (save these securely)',
        },
      },
    },
  })
  @ApiResponse({ status: 400, description: '2FA is not enabled' })
  @ApiResponse({ status: 401, description: 'Invalid password or 2FA code' })
  async regenerateBackupCodes(@Request() req, @Body() regenerateDto: RegenerateBackupCodesDto) {
    const userId = req.user.id;
    return this.authService.regenerateBackupCodes(
      userId,
      regenerateDto.currentPassword,
      regenerateDto.twoFactorCode
    );
  }

  @SkipThrottle() // Skip rate limiting for 2FA status checks (protected by JWT)
  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  @ApiOperation({ summary: 'Get 2FA status for authenticated user' })
  @ApiResponse({
    status: 200,
    description: '2FA status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        twoFactorEnabled: { type: 'boolean' },
        twoFactorEnabledAt: { type: 'string', format: 'date-time', nullable: true },
        remainingBackupCodes: { type: 'number' },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async get2FAStatus(@Request() req) {
    const userId = req.user.id;
    return this.authService.get2FAStatus(userId);
  }
}
