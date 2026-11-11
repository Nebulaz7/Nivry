import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { VerifierModule } from '../verifier/verifier.module';
import { SessionAuthGuard } from './session-auth.guard';
import { SessionController } from './session.controller';
import { SessionService } from './session.service';

@Global()
@Module({
  imports: [DatabaseModule, VerifierModule],
  controllers: [SessionController],
  providers: [SessionService, SessionAuthGuard],
  exports: [SessionService, SessionAuthGuard],
})
export class SessionModule {}

