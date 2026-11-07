import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BundleModule } from './bundle/bundle.module';
import { ChainModule } from './chain/chain.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [BundleModule, ChainModule, DatabaseModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


