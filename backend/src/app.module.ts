import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { BundleModule } from './bundle/bundle.module';
import { VerifierModule } from './verifier/verifier.module';
import { DatabaseModule } from './database/database.module';
import { PassportModule } from './passport/passport.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
  imports: [BundleModule, VerifierModule, DatabaseModule, PassportModule, TasksModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}


