import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Res,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';

import { ConfigService } from '@nestjs/config';

import type {
  Request,
  Response,
} from 'express';

import * as client from 'openid-client';

import { OidcService } from './oidc.service';
import { PrismaService } from '../prisma.service';

import { AccessTokenGuard } from './access-token.guard';

import {
  PersonalAccessTokenService,
} from './personal-access-token.service';

import {
  AuthExchangeService,
} from './auth-exchange.service';


@Controller('sso')
export class SsoController {
  constructor(
    private readonly oidc: OidcService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly tokens: PersonalAccessTokenService,
    private readonly exchange: AuthExchangeService,
  ) {}

  /**
   * GET /sso/redirect
   *
   * Starts the OIDC Authorization Code + PKCE flow.
   */
  @Get('redirect')
  async redirect(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const config =
      this.oidc.configuration;

    const codeVerifier =
      client.randomPKCECodeVerifier();

    const codeChallenge =
      await client.calculatePKCECodeChallenge(
        codeVerifier,
      );

    const state =
      client.randomState();

    (req.session as any).oidc = {
      codeVerifier,
      state,
    };

    const authUrl =
      client.buildAuthorizationUrl(
        config,
        {
          redirect_uri:
            this.config.get<string>(
              'OIDC_REDIRECT_URI',
            )!,

          scope:
            'openid profile email',

          code_challenge:
            codeChallenge,

          code_challenge_method:
            'S256',

          state,
        },
      );

    return res.redirect(
      authUrl.href,
    );
  }


  /**
   * GET /sso/callback
   *
   * Keycloak redirects here after authentication.
   */
  @Get('callback')
  async callback(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const config =
      this.oidc.configuration;

    const stored =
      (req.session as any).oidc;

    if (!stored) {
      return res.redirect(
        `${this.config.get('FRONTEND_URL')}` +
        `/login?error=auth_failed`,
      );
    }

    try {
      const currentUrl =
        new URL(
          req.originalUrl,
          this.config.get<string>(
            'APP_URL',
          )!,
        );

      /*
       * Exchange authorization code.
       *
       * openid-client validates:
       *
       * - authorization response
       * - state
       * - PKCE
       */
      const tokens =
        await client.authorizationCodeGrant(
          config,
          currentUrl,
          {
            pkceCodeVerifier:
              stored.codeVerifier,

            expectedState:
              stored.state,
          },
        );

      const userinfo =
        await client.fetchUserInfo(
          config,
          tokens.access_token,
          tokens.claims()?.sub!,
        );

      const issuer =
        this.config.get<string>(
          'OIDC_ISSUER_URL',
        )!;

      const subject =
        userinfo.sub;

      /*
       * Map Keycloak identity to local user.
       */
      const user =
        await this.prisma.user.upsert({
          where: {
            oidcIssuer_oidcSubject: {
              oidcIssuer: issuer,
              oidcSubject: subject,
            },
          },

          update: {
            name:
              (userinfo.name as string) ||
              'OIDC User',

            email:
              (userinfo.email as string) ||
              null,
          },

          create: {
            oidcIssuer: issuer,
            oidcSubject: subject,

            name:
              (userinfo.name as string) ||
              'OIDC User',

            email:
              (userinfo.email as string) ||
              null,
          },
        });

      /*
       * Create our own application access token.
       *
       * The Keycloak access token is NOT given to Nuxt.
       */
      const createdToken =
        await this.tokens.createToken(
          user.id,
          'nuxt-app',
          ['*'],
        );

      /*
       * Create a short-lived one-time exchange code.
       *
       * Only this code is placed in the browser redirect URL.
       */
      const exchangeCode =
        await this.exchange.create(
          user.id,
          createdToken.plainTextToken,
        );

      /*
       * OIDC session state is no longer required.
       */
      delete (req.session as any).oidc;

      /*
       * Destroy the temporary BFF session.
       *
       * Authentication after this point is performed
       * using the application access token.
       */
      req.session.destroy(() => {});

      /*
       * Only the one-time code reaches the browser.
       */
      return res.redirect(
        `${this.config.get('FRONTEND_URL')}` +
        `/oauth/callback?code=` +
        encodeURIComponent(
          exchangeCode,
        ),
      );

    } catch (err) {
      console.error(
        'OIDC callback failed:',
        err,
      );

      return res.redirect(
        `${this.config.get('FRONTEND_URL')}` +
        `/login?error=auth_failed`,
      );
    }
  }
}


@Controller()
export class ApiController {
  constructor(
    private readonly oidc: OidcService,
    private readonly config: ConfigService,
    private readonly tokens: PersonalAccessTokenService,
    private readonly exchange: AuthExchangeService,
  ) {}

  /**
   * POST /api/auth/exchange
   *
   * Converts the short-lived one-time authentication code
   * into the application's personal access token.
   */
  @Post('auth/exchange')
  async exchangeToken(
    @Body('code') code: string,
  ) {
    if (!code) {
      throw new UnauthorizedException(
        'Authentication code is required.',
      );
    }

    const record =
      await this.exchange.consume(
        code,
      );

    if (!record) {
      throw new UnauthorizedException(
        'Invalid or expired authentication code.',
      );
    }

    return {
      token: record.token,
      token_type: 'Bearer',
    };
  }


  /**
   * GET /api/user
   *
   * Protected by the application's Bearer token.
   */
  @Get('user')
  @UseGuards(AccessTokenGuard)
  async user(
    @Req() req: Request,
  ) {
    return (req as any).user;
  }


  /**
   * POST /api/logout
   *
   * Revokes the current application access token
   * and returns the Keycloak federated logout URL.
   */
  @Post('logout')
  @UseGuards(AccessTokenGuard)
  async logout(
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const accessToken =
      (req as any).accessToken;

    /*
     * Revoke ONLY the token that authenticated
     * this request.
     */
    await this.tokens.revokeToken(
      accessToken.id,
    );

    const clientId =
      this.config.get<string>(
        'OIDC_CLIENT_ID',
      )!;

    const frontendUrl =
      this.config.get<string>(
        'FRONTEND_URL',
      )!;

    let logoutUrl:
      string | null = null;

    const endSession =
      this.oidc.endSessionEndpoint;

    if (endSession) {
      const url =
        new URL(endSession);

      url.searchParams.set(
        'post_logout_redirect_uri',
        frontendUrl,
      );

      url.searchParams.set(
        'client_id',
        clientId,
      );

      logoutUrl =
        url.href;
    }

    return res.json({
      message: 'Logged out',
      logout_url: logoutUrl,
    });
  }
}
