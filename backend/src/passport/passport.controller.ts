import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../session/session-auth.guard';
import { SessionService } from '../session/session.service';
import { EventProjectionService } from './event-projection.service';

export interface IngestTxDto {
  tx_hash: string;
  signer_account_id: string;
}

@Controller('agents')
export class PassportController {
  constructor(
    private readonly db: DatabaseService,
    private readonly projectionService: EventProjectionService,
    private readonly sessionService: SessionService,
  ) {}

  @Get()
  async listAgents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : 50;
    const parsedOffset = offset ? Number.parseInt(offset, 10) : 0;
    return {
      agents: await this.db.listAgents(
        Number.isFinite(parsedLimit) ? parsedLimit : 50,
        Number.isFinite(parsedOffset) ? parsedOffset : 0,
      ),
    };
  }

  @Get(':tokenId/passport')
  async getPassport(@Param('tokenId') tokenId: string) {
    return this.projectionService.getAgentPassport(tokenId);
  }

  @Post(':tokenId/ingest-tx')
  @UseGuards(SessionAuthGuard)
  async ingestTransaction(
    @Param('tokenId') tokenId: string,
    @Body() body: IngestTxDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!body?.tx_hash || !body?.signer_account_id) {
      throw new BadRequestException(
        'tx_hash and signer_account_id are required',
      );
    }
    await this.sessionService.assertAgentOwnerOrExecutor(
      tokenId,
      req.session!,
      { allowExecutor: true },
    );
    return this.projectionService.ingestTransactionFromChain({
      tokenId,
      txHash: body.tx_hash,
      signerAccountId: body.signer_account_id,
    });
  }
}
