import { Module } from '@nestjs/common';
import { VerifierModule } from '../verifier/verifier.module';
import { EventProjectionService } from './event-projection.service';
import { PassportController } from './passport.controller';

@Module({
  imports: [VerifierModule],
  controllers: [PassportController],
  providers: [EventProjectionService],
  exports: [EventProjectionService],
})
export class PassportModule {}

