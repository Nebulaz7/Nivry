import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SessionService, type VerifyChallengeInput } from './session.service';

export interface IssueChallengeDto {
  account_id: string;
}

@Controller('auth')
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Post('challenge')
  @HttpCode(HttpStatus.CREATED)
  async issueChallenge(@Body() body: IssueChallengeDto) {
    return this.sessionService.issueChallenge(body?.account_id);
  }

  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verifyChallenge(@Body() body: VerifyChallengeInput) {
    return this.sessionService.verifyChallenge(body);
  }
}
