import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BundleModule } from './bundle/bundle.module';
import { ChainModule } from './chain/chain.module';

@Module({
  imports: [BundleModule, ChainModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

