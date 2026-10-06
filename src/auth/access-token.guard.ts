import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { Request } from 'express';

import { PersonalAccessTokenService } from './personal-access-token.service';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokens: PersonalAccessTokenService,
  ) {}

  async canActivate(
    context: ExecutionContext,
  ): Promise<boolean> {
    const req =
      context.switchToHttp().getRequest<Request>();

    const authorization =
      req.headers.authorization;

    if (!authorization) {
      throw new UnauthorizedException();
    }

    if (!authorization.startsWith('Bearer ')) {
      throw new UnauthorizedException();
    }

    const token =
      authorization.substring('Bearer '.length).trim();

    if (!token) {
      throw new UnauthorizedException();
    }

    const accessToken =
      await this.tokens.findValidToken(token);

    if (!accessToken) {
      throw new UnauthorizedException();
    }

    /*
     * Make the authenticated user available to controllers.
     */
    (req as any).user = accessToken.user;

    /*
     * Make the current application token available too.
     *
     * This is the NestJS equivalent of Laravel Sanctum's:
     *
     *     currentAccessToken()
     */
    (req as any).accessToken = accessToken;

    return true;
  }
}
