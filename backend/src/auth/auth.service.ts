import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../common/db/prisma';
import { redis } from '../common/db/redis';
import { AppError, UnauthorizedError } from '../common/middleware/errorHandler';
import { UserRole } from '@prisma/client';
import { logger } from '../common/logger';

const JWT_SECRET = process.env.JWT_SECRET!;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET!;
const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function generateTokens(userId: string, email: string, roles: UserRole[]): TokenPair {
  const accessToken = jwt.sign(
    { sub: userId, email, roles },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );

  const refreshToken = jwt.sign(
    { sub: userId, jti: uuidv4() },
    JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_TTL }
  );

  return { accessToken, refreshToken };
}

export class AuthService {
  async register(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roles?: UserRole[];
  }) {
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) throw new AppError('Email already registered', 409, 'EMAIL_TAKEN');

    const hashedPassword = await bcrypt.hash(data.password, 12);
    const roles = data.roles?.length ? data.roles : [UserRole.USER_OWNER];

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        roles,
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        roles: true, isActive: true, createdAt: true,
      },
    });

    const tokens = generateTokens(user.id, user.email, user.roles);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.password) throw new UnauthorizedError('Invalid credentials');
    if (!user.isActive) throw new UnauthorizedError('Account is suspended');

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) throw new UnauthorizedError('Invalid credentials');

    const tokens = generateTokens(user.id, user.email, user.roles);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return {
      user: {
        id: user.id, email: user.email, firstName: user.firstName,
        lastName: user.lastName, roles: user.roles, avatarUrl: user.avatarUrl,
      },
      ...tokens,
    };
  }

  async loginWithGoogle(googleProfile: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarUrl?: string;
  }) {
    let user = await prisma.user.findFirst({
      where: { OR: [{ googleId: googleProfile.id }, { email: googleProfile.email }] },
    });

    if (user) {
      if (!user.googleId) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { googleId: googleProfile.id, avatarUrl: googleProfile.avatarUrl },
        });
      }
    } else {
      user = await prisma.user.create({
        data: {
          email: googleProfile.email,
          googleId: googleProfile.id,
          firstName: googleProfile.firstName,
          lastName: googleProfile.lastName,
          avatarUrl: googleProfile.avatarUrl,
          roles: [UserRole.USER_OWNER],
          isEmailVerified: true,
        },
      });
    }

    const tokens = generateTokens(user.id, user.email, user.roles);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return { user, ...tokens };
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: { sub: string };
    try {
      payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { sub: string };
    } catch {
      throw new UnauthorizedError('Invalid refresh token');
    }

    const stored = await prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedError('Refresh token expired or revoked');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user?.isActive) throw new UnauthorizedError('Account not active');

    // Rotate tokens
    await prisma.refreshToken.delete({ where: { token: refreshToken } });
    const tokens = generateTokens(user.id, user.email, user.roles);
    await this.saveRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async logout(refreshToken: string): Promise<void> {
    await prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  private async saveRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000);
    await prisma.refreshToken.create({ data: { token, userId, expiresAt } });
  }
}

export const authService = new AuthService();
