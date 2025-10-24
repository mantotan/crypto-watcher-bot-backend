import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * WebSocket JWT Authentication Guard
 *
 * Validates JWT token from HTTP-only cookies (web frontend only)
 * This matches the REST API authentication method for consistency.
 *
 * Validates security settings (2FA, password changes) on each message
 * Attaches user payload to socket.data.user with expiration tracking
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(
    private jwtService: JwtService,
    private prismaService: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();

      // Check if user is already authenticated and token not expired
      if (client.data.user && client.data.tokenExp) {
        const now = Math.floor(Date.now() / 1000);

        // Check token expiration
        if (client.data.tokenExp <= now) {
          this.logger.warn(`Token expired for user ${client.data.user.email}`);
          client.disconnect(true);
          throw new WsException('Unauthorized: Token expired');
        }

        // SECURITY: Re-validate 2FA and password settings on each message
        // WebSocket messages are infrequent (subscribe/unsubscribe), so DB query overhead is acceptable
        const user = await this.prismaService.user.findUnique({
          where: { id: client.data.user.id },
          select: {
            id: true,
            two_factor_enabled_at: true,
            password_changed_at: true,
          },
        });

        if (!user) {
          this.logger.warn(`User ${client.data.user.email} no longer exists`);
          client.disconnect(true);
          throw new WsException('Unauthorized: User not found');
        }

        // Validate 2FA settings haven't changed
        const userTwoFactorEnabledAt = user.two_factor_enabled_at
          ? Math.floor(user.two_factor_enabled_at.getTime() / 1000)
          : null;

        if (client.data.tokenTwoFactorEnabledAt !== userTwoFactorEnabledAt) {
          this.logger.warn(
            `User ${client.data.user.email} 2FA settings changed - disconnecting`
          );
          client.disconnect(true);
          throw new WsException('Unauthorized: Session expired - 2FA settings changed');
        }

        // Validate password hasn't changed
        const userPasswordChangedAt = user.password_changed_at
          ? Math.floor(user.password_changed_at.getTime() / 1000)
          : null;

        if (
          client.data.tokenPasswordChangedAt !== userPasswordChangedAt &&
          userPasswordChangedAt !== null
        ) {
          this.logger.warn(
            `User ${client.data.user.email} password changed - disconnecting`
          );
          client.disconnect(true);
          throw new WsException('Unauthorized: Session expired - password changed');
        }

        // All validations passed
        return true;
      }

      // User not authenticated - this shouldn't happen as middleware runs first
      // But handle it gracefully for defense in depth
      const token = this.extractToken(client);

      if (!token) {
        throw new WsException('Unauthorized: No token provided');
      }

      // Verify JWT token using JwtService (uses configured secret)
      const payload = await this.jwtService.verifyAsync(token);

      // Validate user exists and security settings
      const user = await this.prismaService.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          two_factor_enabled_at: true,
          password_changed_at: true,
        },
      });

      if (!user) {
        throw new WsException('Unauthorized: User not found');
      }

      // Validate security settings
      const tokenTwoFactorEnabledAt = payload.two_factor_enabled_at || null;
      const userTwoFactorEnabledAt = user.two_factor_enabled_at
        ? Math.floor(user.two_factor_enabled_at.getTime() / 1000)
        : null;

      if (tokenTwoFactorEnabledAt !== userTwoFactorEnabledAt) {
        throw new WsException('Unauthorized: Session expired - 2FA settings changed');
      }

      const tokenPasswordChangedAt = payload.password_changed_at || null;
      const userPasswordChangedAt = user.password_changed_at
        ? Math.floor(user.password_changed_at.getTime() / 1000)
        : null;

      if (tokenPasswordChangedAt !== userPasswordChangedAt && userPasswordChangedAt !== null) {
        throw new WsException('Unauthorized: Session expired - password changed');
      }

      // Attach user to socket for use in handlers
      client.data.user = {
        id: payload.sub,
        email: payload.email,
      };

      // Store token expiration for validation
      client.data.tokenExp = payload.exp;
      client.data.tokenIat = payload.iat;

      // Store security settings for future validations
      client.data.tokenTwoFactorEnabledAt = tokenTwoFactorEnabledAt;
      client.data.tokenPasswordChangedAt = tokenPasswordChangedAt;

      this.logger.debug(
        `WebSocket authenticated: ${payload.email} (${payload.sub}), expires: ${new Date(payload.exp * 1000).toISOString()}`
      );

      return true;
    } catch (error) {
      this.logger.warn(`WebSocket authentication failed: ${error.message}`);

      if (error.name === 'TokenExpiredError') {
        throw new WsException('Unauthorized: Token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new WsException('Unauthorized: Invalid token');
      }

      throw new WsException('Unauthorized: Authentication failed');
    }
  }

  /**
   * Extract JWT token from Socket.IO handshake
   *
   * Web frontend only: Extracts token from HTTP-only cookies
   * Frontend: socket = io(url, { withCredentials: true })
   */
  private extractToken(client: Socket): string | null {
    // Extract JWT from HTTP-only cookie (accessToken - must match cookie.util.ts)
    const cookies = client.handshake.headers?.cookie;
    if (!cookies) {
      return null;
    }

    const match = cookies.match(/accessToken=([^;]+)/);
    return match ? match[1] : null;
  }
}
