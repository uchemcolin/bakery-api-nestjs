// Imports NestJS decorators and lifecycle interfaces.
//
// Injectable:
// Marks this class as a NestJS provider so it can be injected into
// controllers or other services using NestJS dependency injection.
//
// OnModuleInit:
// Allows the service to run initialization logic automatically after
// the NestJS module has been initialized.
import { Injectable, OnModuleInit } from '@nestjs/common';

// ConfigService provides access to values loaded from environment
// variables and other NestJS configuration sources.
//
// In this service, it is used to retrieve:
// - OIDC_ISSUER_URL
// - OIDC_CLIENT_ID
// - OIDC_CLIENT_SECRET
// - NODE_ENV
import { ConfigService } from '@nestjs/config';

// openid-client is the library used to communicate with the
// OpenID Connect (OIDC) provider.
//
// The `client` namespace gives us access to types and functions such as:
// - Configuration
// - discovery()
// - allowInsecureRequests
import * as client from 'openid-client';


/**
 * OidcService
 *
 * This service is responsible for initializing and storing the OIDC
 * client configuration for the application.
 *
 * It performs OIDC discovery when the NestJS application starts.
 *
 * OIDC discovery allows the application to automatically retrieve
 * important endpoints and capabilities from the configured identity
 * provider, such as:
 *
 * - authorization_endpoint
 * - token_endpoint
 * - userinfo_endpoint
 * - jwks_uri
 * - end_session_endpoint
 *
 * Instead of hard-coding these endpoints, we obtain them from the
 * OIDC provider's discovery document.
 *
 * Example providers include:
 * - Keycloak
 * - Auth0
 * - Okta
 * - Microsoft Entra ID
 * - Google
 *
 * The actual provider depends on the value of OIDC_ISSUER_URL.
 */
@Injectable()
export class OidcService implements OnModuleInit {

  /**
   * Stores the discovered OIDC configuration.
   *
   * The `!` tells TypeScript:
   *
   * "This property will be initialized before it is used."
   *
   * We cannot initialize it in the constructor because the discovery
   * operation is asynchronous and happens inside `onModuleInit()`.
   *
   * The underscore is intentional. It prevents a naming conflict with
   * the public `configuration` getter below.
   *
   * Example:
   *
   *     private _configuration
   *
   * is the internal/private value, while:
   *
   *     this.configuration
   *
   * is the public read-only accessor used by other classes.
   */
  private _configuration!: client.Configuration;


  /**
   * Constructor
   *
   * NestJS automatically injects ConfigService into this service.
   *
   * The `private readonly` syntax does two things:
   *
   * 1. Creates a private property called `configService`.
   * 2. Prevents that property from being reassigned.
   *
   * NestJS's dependency injection system supplies the ConfigService
   * instance automatically.
   */
  constructor(
    private readonly configService: ConfigService,
  ) {}


  /**
   * onModuleInit()
   *
   * NestJS calls this method automatically during application startup.
   *
   * Because this method is asynchronous, NestJS waits for the returned
   * Promise to resolve before considering this initialization step
   * complete.
   *
   * This makes it a suitable place to perform OIDC discovery.
   */
  async onModuleInit() {

    /**
     * Retrieve the OIDC issuer URL from configuration.
     *
     * Example:
     *
     *     OIDC_ISSUER_URL=https://example.com/realms/my-realm
     *
     * The issuer URL identifies the OpenID Connect provider.
     *
     * `get<string>()` tells TypeScript that we expect this configuration
     * value to be a string.
     */
    const issuerUrl =
      this.configService.get<string>('OIDC_ISSUER_URL');


    /**
     * Retrieve the OIDC client ID.
     *
     * This identifies our application to the OIDC provider.
     *
     * Example:
     *
     *     OIDC_CLIENT_ID=my-nestjs-app
     */
    const clientId =
      this.configService.get<string>('OIDC_CLIENT_ID');


    /**
     * Retrieve the OIDC client secret.
     *
     * This is the credential associated with the OIDC client.
     *
     * It should be kept secret and should NOT be committed to source
     * control or exposed to frontend/browser code.
     *
     * Example:
     *
     *     OIDC_CLIENT_SECRET=super-secret-value
     */
    const clientSecret =
      this.configService.get<string>('OIDC_CLIENT_SECRET');


    /**
     * Retrieve the current application environment.
     *
     * Typical values are:
     *
     *     development
     *     test
     *     production
     *
     * We use this value below to determine whether development-only
     * insecure HTTP requests should be allowed.
     */
    const nodeEnv =
      this.configService.get<string>('NODE_ENV');


    /**
     * Validate the required OIDC configuration.
     *
     * The application cannot perform OIDC discovery without:
     *
     * - the issuer URL
     * - the client ID
     * - the client secret
     *
     * If any of these values are missing, we immediately throw an error.
     *
     * Failing during application startup is preferable to allowing the
     * application to start with a broken authentication configuration.
     */
    if (!issuerUrl || !clientId || !clientSecret) {
      throw new Error(
        'OIDC_ISSUER_URL, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be set in .env',
      );
    }


    /**
     * Determine whether the application is running outside production.
     *
     * This evaluates to `true` for anything other than:
     *
     *     NODE_ENV=production
     *
     * For example:
     *
     *     development -> true
     *     test        -> true
     *     undefined   -> true
     *     production  -> false
     *
     * We use this to enable development-specific OIDC behavior.
     */
    const isDevelopment = nodeEnv !== 'production';


    /**
     * Perform OIDC provider discovery.
     *
     * `client.discovery()` contacts the OIDC issuer and retrieves its
     * discovery metadata.
     *
     * The arguments are:
     *
     * 1. new URL(issuerUrl)
     *    -------------------
     *    Converts the configured issuer URL string into a URL object.
     *
     * 2. clientId
     *    --------
     *    The application's OIDC client ID.
     *
     * 3. clientSecret
     *    ------------
     *    The application's OIDC client secret.
     *
     * 4. undefined
     *    ---------
     *    Uses the default authentication method/options for this
     *    parameter.
     *
     * 5. Development-specific options
     *    -----------------------------
     *    When running outside production, we allow insecure requests.
     *
     * The result is stored in `_configuration`.
     *
     * After this call succeeds, the application has access to the
     * discovered OIDC metadata through:
     *
     *     this._configuration
     *
     * or, externally:
     *
     *     this.oidcService.configuration
     */
    this._configuration = await client.discovery(
      new URL(issuerUrl),
      clientId,
      clientSecret,
      undefined,

      /**
       * Only enable `allowInsecureRequests` outside production.
       *
       * This is useful when developing against a local OIDC provider
       * that uses plain HTTP, for example:
       *
       *     http://localhost:8080/realms/my-realm
       *
       * `client.allowInsecureRequests` tells openid-client that HTTP
       * requests are allowed.
       *
       * IMPORTANT:
       *
       * We deliberately do NOT enable this in production.
       *
       * Production OIDC communication should use HTTPS so credentials,
       * authorization codes, tokens, and other sensitive information
       * are protected in transit.
       *
       * The conditional expression:
       *
       *     isDevelopment
       *       ? { execute: [client.allowInsecureRequests] }
       *       : undefined
       *
       * means:
       *
       * Development:
       *     { execute: [client.allowInsecureRequests] }
       *
       * Production:
       *     undefined
       */
      isDevelopment
        ? { execute: [client.allowInsecureRequests] }
        : undefined,
    );
  }


  /**
   * configuration
   *
   * Public getter that exposes the discovered OIDC configuration.
   *
   * Other parts of the application can use:
   *
   *     this.oidc.configuration
   *
   * without directly accessing the private `_configuration` property.
   *
   * This is intentionally implemented as a getter rather than making
   * `_configuration` public.
   *
   * This keeps the internal field private while still providing a clean
   * public API for the service.
   *
   * The return type is `client.Configuration`, which is the type
   * provided by openid-client.
   */
  get configuration(): client.Configuration {
    return this._configuration;
  }


  /**
   * endSessionEndpoint
   *
   * Convenience getter used by the logout functionality.
   *
   * OpenID Connect providers can expose an `end_session_endpoint`
   * through their discovery metadata.
   *
   * This endpoint is used for OIDC logout / RP-initiated logout when
   * supported by the identity provider.
   *
   * The endpoint is retrieved from:
   *
   *     this._configuration.serverMetadata()
   *
   * and then:
   *
   *     .end_session_endpoint
   *
   * Because the OIDC provider may not expose a logout endpoint,
   * the return type is:
   *
   *     string | undefined
   *
   * Therefore, callers should handle the possibility that the endpoint
   * does not exist.
   *
   * Example:
   *
   *     const logoutUrl = this.oidc.endSessionEndpoint;
   *
   *     if (logoutUrl) {
   *       // Perform OIDC logout
   *     }
   */
  get endSessionEndpoint(): string | undefined {
    return this._configuration
      .serverMetadata()
      .end_session_endpoint;
  }
}
