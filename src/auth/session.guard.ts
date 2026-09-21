// SessionGuard is our equivalent of Laravel's `auth:sanctum` middleware.
//
// It does ONE thing: confirm the request has a valid BFF session with a
// logged-in user attached. If yes, allow. If no, respond with 401.
//
// This is intentionally minimal. It does not look at tokens or JWTs —
// those live on the server side, never on the browser.
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';

@Injectable()
export class SessionGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // `req.session` is populated by express-session.
    // `req.session.user` is populated by our callback handler.
    const user = (req.session as any)?.user;

    if (!user) {
      // 401 = "we cannot establish who you are" — matches the PDF's
      // Authorization Boundary table (No cookie → 401).
      throw new UnauthorizedException();
    }

    // Attach the user to the request so controllers can read it easily.
    (req as any).user = user;
    return true;
  }
}