import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

/**
 * WebSocket JWT Authentication Guard
 *
 * Validates JWT token from:
 * 1. auth.token in handshake (preferred for Socket.IO client)
 * 2. Authorization header (Bearer token)
 * 3. access_token cookie (HTTP-only cookie)
 *
 * Attaches user payload to socket.data.user with expiration tracking
 */
@Injectable()
export class WsJwtGuard implements CanActivate {
  private readonly logger = new Logger(WsJwtGuard.name);

  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: Socket = context.switchToWs().getClient();

      // Check if user is already authenticated and token not expired
      if (client.data.user && client.data.tokenExp) {
        const now = Math.floor(Date.now() / 1000);
        if (client.data.tokenExp > now) {
          // Token still valid, allow through
          return true;
        } else {
          // Token expired during connection
          this.logger.warn(`Token expired for user ${client.data.user.email}`);
          client.disconnect(true);
          throw new WsException('Unauthorized: Token expired');
        }
      }

      const token = this.extractToken(client);

      if (!token) {
        throw new WsException('Unauthorized: No token provided');
      }

      // Verify JWT token using JwtService (uses configured secret)
      const payload = await this.jwtService.verifyAsync(token);

      // Attach user to socket for use in handlers
      client.data.user = {
        id: payload.sub,
        email: payload.email,
      };

      // Store token expiration for validation
      client.data.tokenExp = payload.exp;
      client.data.tokenIat = payload.iat;

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
   * Priority: auth.token > Authorization header > cookie
   */
  private extractToken(client: Socket): string | null {
    // 1. Socket.IO auth object (recommended)
    // Frontend: socket = io(url, { auth: { token: 'jwt_token' } })
    const authToken = client.handshake.auth?.token;
    if (authToken) {
      return authToken;
    }

    // 2. Authorization header (Bearer token)
    const authHeader = client.handshake.headers?.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 3. HTTP-only cookie (access_token)
    const cookies = client.handshake.headers?.cookie;
    if (cookies) {
      const match = cookies.match(/access_token=([^;]+)/);
      if (match) {
        return match[1];
      }
    }

    return null;
  }
}
