import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../db/prisma';
import { UnauthorizedError, ForbiddenError } from './errorHandler';
import { UserRole } from '@prisma/client';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    roles: UserRole[];
  };
}

export function authenticate(req: AuthRequest, _res: Response, next: NextFunction): void {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : req.cookies?.accessToken;

    if (!token) throw new UnauthorizedError('No token provided');

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      sub: string;
      email: string;
      roles: UserRole[];
    };

    req.user = { id: payload.sub, email: payload.email, roles: payload.roles };
    next();
  } catch (err) {
    if (err instanceof UnauthorizedError) return next(err);
    next(new UnauthorizedError('Invalid or expired token'));
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new UnauthorizedError());
    const hasRole = roles.some((role) => req.user!.roles.includes(role));
    if (!hasRole) return next(new ForbiddenError('Insufficient permissions'));
    next();
  };
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRoles(UserRole.ADMIN, UserRole.SUPER_ADMIN)(req, res, next);
}

export function requireBroker(req: AuthRequest, res: Response, next: NextFunction): void {
  requireRoles(UserRole.BROKER, UserRole.AGENCY, UserRole.ADMIN, UserRole.SUPER_ADMIN)(req, res, next);
}
