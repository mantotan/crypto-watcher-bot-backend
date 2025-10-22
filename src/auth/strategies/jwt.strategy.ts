import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: string;
  email: string;
  two_factor_enabled_at?: number; // Unix timestamp for JWT invalidation
  password_changed_at?: number; // Unix timestamp for JWT invalidation
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: (req: Request) => {
        // Extract JWT from HTTP-only cookie only (no Authorization header support)
        if (!req || !req.cookies) {
          return null;
        }
        return req.cookies.accessToken || null;
      },
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_ACCESS_SECRET,
      passReqToCallback: false,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        created_at: true,
        preferred_timezone: true,
        two_factor_enabled_at: true,
        password_changed_at: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // SECURITY: Invalidate token if 2FA was enabled/disabled after token was issued
    const tokenTwoFactorEnabledAt = payload.two_factor_enabled_at || null;
    const userTwoFactorEnabledAt = user.two_factor_enabled_at
      ? Math.floor(user.two_factor_enabled_at.getTime() / 1000)
      : null;

    if (tokenTwoFactorEnabledAt !== userTwoFactorEnabledAt) {
      throw new UnauthorizedException(
        'Session expired - 2FA settings changed. Please log in again.'
      );
    }

    // SECURITY: Invalidate token if password was changed after token was issued
    const tokenPasswordChangedAt = payload.password_changed_at || null;
    const userPasswordChangedAt = user.password_changed_at
      ? Math.floor(user.password_changed_at.getTime() / 1000)
      : null;

    if (
      tokenPasswordChangedAt !== userPasswordChangedAt &&
      userPasswordChangedAt !== null
    ) {
      throw new UnauthorizedException(
        'Session expired - password changed. Please log in again.'
      );
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      preferred_timezone: user.preferred_timezone,
      created_at: user.created_at,
    };
  }
}
