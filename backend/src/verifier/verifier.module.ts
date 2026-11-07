import { Module } from '@nestjs/common';
import { ChainReaderService } from './chain-reader.service';

@Module({
  providers: [ChainReaderService],
  exports: [ChainReaderService],
})
export class VerifierModule {}

