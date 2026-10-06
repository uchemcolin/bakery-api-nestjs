import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
// `express-session` and `passport` are CommonJS modules. With
// `esModuleInterop` enabled (NestJS default), we MUST use a default import.
// A namespace import (`import * as session`) produces an object that isn't
// callable at runtime and throws "session is not a function".
import session from 'express-session';
import passport from 'passport';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  // -------------------------------------------------------------------------
  // CORS — allow the Nuxt SPA to send cookies to this BFF.
  // -------------------------------------------------------------------------
  // `credentials: true` is REQUIRED. Without it, the browser will refuse
  // to send or receive the session cookie across origins.
  //
  // NOTE: `FRONTEND_URL` must match the origin Nuxt is actually running on.
  // If Nuxt is on :3001 (because :3000 is busy), set FRONTEND_URL to
  // http://localhost:3001 in .env — otherwise the browser will block the
  // request with a CORS error before it even reaches this server.
  app.enableCors({
    origin: config.get<string>('FRONTEND_URL'),
    //credentials: true,
  });

  // -------------------------------------------------------------------------
  // Session middleware — this is our BFF session, NOT the Keycloak one.
  // -------------------------------------------------------------------------
  // Two sessions exist in this architecture:
  //   1. Keycloak's SSO session cookie (lives on the Keycloak domain).
  //   2. This session cookie (lives on our domain).
  // They are independent. Logging out locally does NOT clear Keycloak's
  // session — that requires redirecting the browser to Keycloak's
  // end_session_endpoint, which the logout controller handles.
  app.use(
    session({
      secret: config.get<string>('SESSION_SECRET')!,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true, // JS in the browser cannot read this cookie.
        secure: config.get('SESSION_SECURE_COOKIE') === 'true', // HTTPS only in prod.
        sameSite: 'lax', // Allows top-level cross-site redirects from Keycloak.
        domain: config.get<string>('SESSION_DOMAIN'), // 'localhost' locally.
        maxAge: 1000 * 60 * 60 * 24, // 24 hours.
      },
    }),
  );

  // -------------------------------------------------------------------------
  // Passport middleware — kept for session plumbing even though we're not
  // using a Passport OIDC strategy. Passport's `initialize()` and
  // `session()` are harmless when no strategies are registered; they just
  // ensure the request/response lifecycle is prepared.
  // -------------------------------------------------------------------------
  app.use(passport.initialize());
  app.use(passport.session());

  // -------------------------------------------------------------------------
  // Global route prefix — mirrors Laravel's `routes/api.php` prefix.
  // -------------------------------------------------------------------------
  // Every controller route is prefixed with /api BY DEFAULT, EXCEPT the two
  // listed in `exclude`. This exactly mirrors the Laravel layout:
  //
  //   Laravel (routes/web.php):  /sso/redirect, /sso/callback
  //   Laravel (routes/api.php):  /api/user, /api/logout
  //
  // In NestJS terms:
  //
  //   SsoController  ->  /sso/redirect, /sso/callback    (browser navigation)
  //   ApiController  ->  /api/user,     /api/logout       (JSON API)
  //
  // The excluded paths are matched WITHOUT the global prefix. So
  // 'sso/redirect' here produces a final URL of /sso/redirect (not
  // /api/sso/redirect). If you rename the controller path later, remember
  // to update this list too.
  app.setGlobalPrefix('api', {
    exclude: ['sso/redirect', 'sso/callback'],
  });

  const port = config.get<number>('PORT') || 8000;
  await app.listen(port);
  console.log(`BFF running on http://localhost:${port}`);
}

bootstrap();