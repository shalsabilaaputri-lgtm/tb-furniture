import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { z } from 'zod';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { BranchesModule } from './branches/branches.module';
import { HealthController } from './health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { ProductsModule } from './products/products.module';
import { OperationsModule } from './operations/operations.module';
import { ReportsModule } from './reports/reports.module';
import { UsersModule } from './users/users.module';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  API_PREFIX: z.string().default('api/v1'),
  FRONTEND_ORIGIN: z.string().min(1),
  DATABASE_URL: z.string().startsWith('postgresql://'),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().min(1).max(180).default(30),
  SITE_PROXY_SECRET: z.string().min(32).optional(),
});

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: (values) => envSchema.parse(values),
    }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    BranchesModule,
    ProductsModule,
    OperationsModule,
    ReportsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
