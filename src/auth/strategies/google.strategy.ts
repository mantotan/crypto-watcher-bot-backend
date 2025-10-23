import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { OAuthService } from '../services/oauth.service';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(private oauthService: OAuthService) {
    super({
      clientID: process.env.GOOGLE_CLIENT_ID || 'dummy-client-id',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'dummy-secret',
      callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3733/auth/google/callback',
      scope: ['email', 'profile'],
      passReqToCallback: true, // Pass request to verify callback
    });
  }

  async validate(
    request: any,
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<any> {
    try {
      // Extract user info from Google profile
      const { id, emails, displayName, photos } = profile;

      if (!emails || emails.length === 0) {
        return done(new Error('No email found in Google profile'), null);
      }

      const email = emails[0].value;
      const image = photos && photos.length > 0 ? photos[0].value : null;

      // Check if this is a linking request (has state with userId)
      const state = request.query.state;
      const isLinkingRequest = state && state.startsWith('link_');

      let user;
      if (isLinkingRequest) {
        // SECURITY: Validate signed state parameter
        const userId = this.oauthService.validateSignedState(state);

        user = await this.oauthService.linkGoogleAccount(
          userId,
          id,
          email,
          displayName,
          image,
          accessToken,
          refreshToken,
        );
      } else {
        // Regular OAuth login
        user = await this.oauthService.validateGoogleUser(
          id,
          email,
          displayName,
          image,
          accessToken,
          refreshToken,
        );
      }

      done(null, { ...user, isLinkingRequest });
    } catch (error) {
      done(error, null);
    }
  }
}
