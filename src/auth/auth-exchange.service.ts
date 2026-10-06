import { Injectable } from '@nestjs/common';
import {
  createHash,
  randomBytes,
} from 'crypto';

import { PrismaService } from '../prisma.service';

@Injectable()
export class AuthExchangeService {
  constructor(
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Create a short-lived, one-time exchange code.
   *
   * The real application bearer token is stored server-side.
   * Only the exchange code is sent through the browser redirect.
   */
  async create(
    userId: number,
    plainTextToken: string,
  ) {
    const code =
      randomBytes(48).toString('hex');

    const codeHash =
      this.hash(code);

    await this.prisma.authExchangeCode.create({
      data: {
        codeHash,
        userId,
        token: plainTextToken,
        expiresAt: new Date(
          Date.now() + 60 * 1000,
        ),
      },
    });

    return code;
  }

  /**
   * Consume the exchange code.
   *
   * Returns the stored application token if the code
   * exists, has not expired, and has not already been used.
   */
  async consume(
    code: string,
  ) {
    const codeHash =
      this.hash(code);

    const record =
      await this.prisma.authExchangeCode.findUnique({
        where: {
          codeHash,
        },
      });

    if (!record) {
      return null;
    }

    if (
      record.usedAt ||
      record.expiresAt <= new Date()
    ) {
      return null;
    }

    /*
     * Mark the code as consumed immediately.
     */
    await this.prisma.authExchangeCode.update({
      where: {
        id: record.id,
      },
      data: {
        usedAt: new Date(),
      },
    });

    return record;
  }

  /**
   * SHA-256 hash helper.
   */
  private hash(
    value: string,
  ): string {
    return createHash('sha256')
      .update(value)
      .digest('hex');
  }
}
