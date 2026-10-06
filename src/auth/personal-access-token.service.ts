import { Injectable } from '@nestjs/common';
import {
  createHash,
  randomBytes,
} from 'crypto';

import { PrismaService } from '../prisma.service';

@Injectable()
export class PersonalAccessTokenService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Creates an application access token.
   *
   * The plaintext token is returned ONLY at creation time.
   * Only its SHA-256 hash is stored in the database.
   */
  async createToken(
    userId: number,
    name = 'nuxt-app',
    abilities: string[] = ['*'],
  ) {
    const randomPart =
      randomBytes(48).toString('hex');

    const plainTextToken =
      `bkr_${randomPart}`;

    const tokenHash =
      this.hashToken(plainTextToken);

    const token =
      await this.prisma.personalAccessToken.create({
        data: {
          userId,
          name,
          tokenHash,
          abilities: JSON.stringify(
            abilities,
          ),
        },
      });

    return {
      token,
      plainTextToken,
    };
  }

  /**
   * Hash a token before looking it up.
   */
  hashToken(
    token: string,
  ): string {
    return createHash('sha256')
      .update(token)
      .digest('hex');
  }

  /**
   * Resolve a bearer token.
   *
   * Revoked and expired tokens are rejected.
   */
  async findValidToken(
    token: string,
  ) {
    const tokenHash =
      this.hashToken(token);

    const accessToken =
      await this.prisma.personalAccessToken.findUnique({
        where: {
          tokenHash,
        },
        include: {
          user: true,
        },
      });

    if (!accessToken) {
      return null;
    }

    if (accessToken.revokedAt) {
      return null;
    }

    if (
      accessToken.expiresAt &&
      accessToken.expiresAt <= new Date()
    ) {
      return null;
    }

    await this.prisma.personalAccessToken.update({
      where: {
        id: accessToken.id,
      },
      data: {
        lastUsedAt: new Date(),
      },
    });

    return accessToken;
  }

  /**
   * Revoke one token.
   *
   * Prisma's PersonalAccessToken.id is an Int,
   * so tokenId must be a number.
   */
  async revokeToken(
    tokenId: number,
  ) {
    return this.prisma.personalAccessToken.update({
      where: {
        id: tokenId,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  /**
   * Revoke all tokens belonging to a user.
   */
  async revokeAllUserTokens(
    userId: number,
  ) {
    return this.prisma.personalAccessToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }
}
