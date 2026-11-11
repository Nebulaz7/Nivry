import { Module } from '@nestjs/common';
import { PassportModule } from '../passport/passport.module';
import { VerifierModule } from '../verifier/verifier.module';
import { ExecutorController } from './executor.controller';
import { ExecutorService } from './executor.service';

@Module({
  imports: [VerifierModule, PassportModule],
  controllers: [ExecutorController],
  providers: [ExecutorService],
  exports: [ExecutorService],
})
export class ExecutorModule {}

