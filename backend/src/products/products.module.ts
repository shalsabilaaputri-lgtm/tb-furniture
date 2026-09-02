import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { ProductCategoriesController, ProductsController, UnitsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [ProductsController, ProductCategoriesController, UnitsController],
  providers: [ProductsService],
})
export class ProductsModule {}
