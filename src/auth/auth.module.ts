import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';

import {
  SsoController,
  ApiController,
} from './auth.controller';

import { OidcService } from './oidc.service';
import { SessionGuard } from './session.guard';
import { AccessTokenGuard } from './access-token.guard';

import { PersonalAccessTokenService } from './personal-access-token.service';
import { AuthExchangeService } from './auth-exchange.service';

import { PrismaService } from '../prisma.service';

@Module({
  imports: [
    PassportModule,
  ],

  controllers: [
    SsoController,
    ApiController,
  ],

  providers: [
    OidcService,
    SessionGuard,
    AccessTokenGuard,
    PersonalAccessTokenService,
    AuthExchangeService,
    PrismaService,
  ],

  exports: [
    PrismaService,
    PersonalAccessTokenService,
  ],
})
export class AuthModule {}
