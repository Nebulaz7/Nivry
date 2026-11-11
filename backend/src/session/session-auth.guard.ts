import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SessionService, type AuthenticatedSession } from './session.service';

export interface AuthenticatedRequest extends Request {
  session?: AuthenticatedSession;
}

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private readonly sessionService: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const rawHeader = req.headers?.authorization;
    if (typeof rawHeader !== 'string') {
      throw new UnauthorizedException(
        'Missing Authorization Bearer session token',
      );
    }
    req.session = this.sessionService.verifySessionToken(rawHeader);
    return true;
  }
}
