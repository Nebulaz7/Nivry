import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  SessionAuthGuard,
  type AuthenticatedRequest,
} from '../session/session-auth.guard';
import { SessionService } from '../session/session.service';
import { BundleService, type BundleManifestInput } from './bundle.service';

export interface UploadBundleDto {
  /** Base64-encoded or UTF-8 string bundle payload */
  content_base64?: string;
  content_utf8?: string;
  /** Optional token_id when uploading for an existing minted agent */
  token_id?: string;
}

@Controller('bundles')
export class BundleController {
  constructor(
    private readonly bundleService: BundleService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('validate-manifest')
  @HttpCode(HttpStatus.OK)
  validateManifest(@Body() body: BundleManifestInput) {
    return this.bundleService.validateAndHashManifest(body);
  }

  @Post(':sha256')
  @UseGuards(SessionAuthGuard)
  @HttpCode(HttpStatus.CREATED)
  async uploadBundle(
    @Param('sha256') sha256: string,
    @Body() body: UploadBundleDto,
    @Req() req: AuthenticatedRequest,
  ) {
    if (body?.token_id) {
      await this.sessionService.assertAgentOwnerOrExecutor(
        body.token_id,
        req.session!,
        { allowExecutor: false },
      );
    }
    let bytes: Buffer;
    if (typeof body?.content_base64 === 'string') {
      bytes = Buffer.from(body.content_base64, 'base64');
    } else if (typeof body?.content_utf8 === 'string') {
      bytes = Buffer.from(body.content_utf8, 'utf8');
    } else {
      throw new BadRequestException(
        'Provide content_base64 or content_utf8 in request body',
      );
    }

    return this.bundleService.storeBundle(sha256, bytes);
  }

  @Get(':sha256')
  getBundle(@Param('sha256') sha256: string, @Res() res: Response) {
    const bytes = this.bundleService.getBundle(sha256);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('X-Content-SHA256', sha256);
    res.status(HttpStatus.OK).send(bytes);
  }
}
