import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import * as client from 'openid-client';

import { OidcService } from './oidc.service';
import { PrismaService } from '../prisma.service';
import { SessionGuard } from './session.guard';

@Controller('sso')
export class SsoController {
  constructor(
    private readonly oidc: OidcService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /sso/redirect
   *
   * Starts the OIDC authorization code flow with PKCE.
   */
  @Get('redirect')
  async redirect(@Req() req: Request, @Res() res: Response) {
    const config = this.oidc.configuration;

    // 1. Generate PKCE values.
    const codeVerifier = client.randomPKCECodeVerifier();
    const codeChallenge = await client.calculatePKCECodeChallenge(codeVerifier);

    // 2. Store the verifier and a random `state` in the session.
    const state = client.randomState();
    (req.session as any).oidc = { codeVerifier, state };

    // 3. Build the authorization URL.
    const authUrl = client.buildAuthorizationUrl(config, {
      redirect_uri: this.config.get<string>('OIDC_REDIRECT_URI')!,
      scope: 'openid profile email',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    // 4. Redirect the browser to Keycloak.
    res.redirect(authUrl.href);
  }

  /**
   * GET /sso/callback
   *
   * Keycloak redirects here after the user authenticates.
   */
  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response) {
    const config = this.oidc.configuration;
    const stored = (req.session as any).oidc;

    if (!stored) {
      return res.redirect(
        `${this.config.get('FRONTEND_URL')}/login?error=auth_failed`,
      );
    }

    try {
      const currentUrl = new URL(
        req.originalUrl,
        this.config.get<string>('APP_URL')!,
      );

      // Exchange the code for tokens, verifying state and PKCE.
      const tokens = await client.authorizationCodeGrant(config, currentUrl, {
        pkceCodeVerifier: stored.codeVerifier,
        expectedState: stored.state,
      });

      // Fetch userinfo using the access token.
      const userinfo = await client.fetchUserInfo(
        config,
        tokens.access_token,
        tokens.claims()?.sub!,
      );

      const issuer = this.config.get<string>('OIDC_ISSUER_URL')!;
      const subject = userinfo.sub;

      // Upsert the local user (Laravel's updateOrCreate equivalent).
      const user = await this.prisma.user.upsert({
        where: {
          oidcIssuer_oidcSubject: {
            oidcIssuer: issuer,
            oidcSubject: subject,
          },
        },
        update: {
          name: (userinfo.name as string) || 'OIDC User',
          email: (userinfo.email as string) || null,
        },
        create: {
          oidcIssuer: issuer,
          oidcSubject: subject,
          name: (userinfo.name as string) || 'OIDC User',
          email: (userinfo.email as string) || null,
        },
      });

      // Store the session user (what SessionGuard checks).
      (req.session as any).user = {
        id: user.id,
        name: user.name,
        email: user.email,
        oidc_issuer: user.oidcIssuer,
        oidc_subject: user.oidcSubject,
      };

      // Clean up temporary OIDC state.
      delete (req.session as any).oidc;

      return res.redirect(`${this.config.get('FRONTEND_URL')}/dashboard`);
    } catch (err) {
      console.error('OIDC callback failed:', err);
      return res.redirect(
        `${this.config.get('FRONTEND_URL')}/login?error=auth_failed`,
      );
    }
  }
}

@Controller()
export class ApiController {
  constructor(
    private readonly oidc: OidcService,
    private readonly config: ConfigService,
  ) {}

  /**
   * GET /api/user
   *
   * Returns the currently authenticated user from the session.
   */
  @Get('user')
  @UseGuards(SessionGuard)
  async user(@Req() req: Request) {
    return (req as any).user;
  }

  /**
   * POST /api/logout
   *
   * Federated logout in two layers:
   *   1. Destroy the local BFF session.
   *   2. Return the Keycloak end_session_endpoint URL for the frontend
   *      to navigate to, which clears Keycloak's SSO cookie.
   *
   * Note: This handler does NOT call client.discovery() again. It reuses
   * the Configuration that OidcService already discovered at startup.
   * This is critical because re-running discovery requires re-applying
   * the `allowInsecureRequests` escape hatch, which is easy to forget.
   */
  @Post('logout')
  @UseGuards(SessionGuard)
  async logout(@Req() req: Request, @Res() res: Response) {
    const clientId = this.config.get<string>('OIDC_CLIENT_ID')!;
    const frontendUrl = this.config.get<string>('FRONTEND_URL')!;

    // 1. Destroy the local session.
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ message: 'Session destruction error' });
      }

      // 2. Build the federated logout URL from the cached configuration.
      let logoutUrl: string | null = null;
      const endSession = this.oidc.endSessionEndpoint;

      if (endSession) {
        // NOTE: Keycloak does exact-string matching on the registered
        // post-logout URI. Register `http://localhost:3000` WITHOUT a
        // trailing slash in Keycloak and use the same value here.
        const url = new URL(endSession);
        url.searchParams.set('post_logout_redirect_uri', frontendUrl);
        url.searchParams.set('client_id', clientId);
        logoutUrl = url.href;
      }

      return res.json({
        message: 'Logged out',
        logout_url: logoutUrl,
      });
    });
  }
}