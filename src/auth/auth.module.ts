// AuthModule wires together the OIDC service, controllers, guard, and
// Prisma. It's the NestJS equivalent of registering the Laravel routes,
// controller, and User model together.
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SsoController, ApiController } from './auth.controller';
import { OidcService } from './oidc.service';
import { SessionGuard } from './session.guard';
import { PrismaService } from '../prisma.service';

@Module({
  // We keep PassportModule imported only because express-session + Passport
  // is a common pairing and it doesn't cost anything to have it available.
  // We do NOT register an OIDC Passport strategy — v6 doesn't fit that shape.
  imports: [PassportModule],
  controllers: [SsoController, ApiController],
  providers: [OidcService, SessionGuard, PrismaService],
  // Export PrismaService so other modules (future ones) can use it too.
  exports: [PrismaService],
})
export class AuthModule {}