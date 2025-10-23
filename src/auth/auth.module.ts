import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { GoogleStrategy } from './strategies/google.strategy';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';

// New refactored services
import { AuthCoreService } from './services/auth-core.service';
import { EmailVerificationService } from './services/email-verification.service';
import { PasswordResetService } from './services/password-reset.service';
import { PasswordManagementService } from './services/password-management.service';
import { OAuthService } from './services/oauth.service';
import { TwoFactorAuthService } from './services/two-factor-auth.service';
import { TwoFactorService } from './services/two-factor.service';
import { UserProfileService } from './services/user-profile.service';

@Module({
  imports: [
    PrismaModule,
    EmailModule,
    PassportModule,
    JwtModule.register({}), // We'll use dynamic configuration in the service
  ],
  controllers: [AuthController],
  providers: [
    // Core services
    AuthCoreService,
    EmailVerificationService,
    PasswordResetService,
    PasswordManagementService,
    OAuthService,
    TwoFactorAuthService,
    TwoFactorService,
    UserProfileService,
    // Strategies
    JwtStrategy,
    GoogleStrategy,
  ],
  exports: [
    // Export services needed by GoogleStrategy
    OAuthService,
    AuthCoreService,
  ],
})
export class AuthModule {}
