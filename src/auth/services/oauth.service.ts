import { Injectable, ConflictException, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * OAuthService: OAuth provider integration
 * Handles: Google OAuth login, account linking/unlinking, CSRF protection
 */
@Injectable()
export class OAuthService {
  constructor(private prisma: PrismaService) {}

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
}
