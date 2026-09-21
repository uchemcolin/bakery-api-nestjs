// Root module. Loads environment variables globally and imports AuthModule.
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [
    // isGlobal:true makes ConfigService injectable everywhere without
    // importing ConfigModule into every module.
    ConfigModule.forRoot({ isGlobal: true }),

    // Our auth + user module.
    AuthModule,
  ],
})
export class AppModule {}