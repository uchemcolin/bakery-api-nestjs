// PrismaService is an injectable wrapper around the generated PrismaClient.
// It uses the SQLite driver adapter (better-sqlite3) that Prisma 6 requires
// for the `@prisma/adapter-better-sqlite3` package.
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    // The adapter receives the SQLite URL from the environment.
    // It internally opens a better-sqlite3 connection.
    const adapter = new PrismaBetterSqlite3({
      url: process.env.DATABASE_URL,
    });

    // Pass the adapter to the PrismaClient constructor.
    super({ adapter });
  }

  // NestJS lifecycle hook — open the DB connection when the module boots.
  async onModuleInit() {
    await this.$connect();
  }

  // NestJS lifecycle hook — close the DB connection on shutdown.
  async onModuleDestroy() {
    await this.$disconnect();
  }
}