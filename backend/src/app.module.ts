import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BundleModule } from './bundle/bundle.module';

@Module({
  imports: [BundleModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
