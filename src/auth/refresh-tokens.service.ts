import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { createHash, randomBytes } from 'crypto';
import { RefreshToken } from './refresh-token.entity';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly repo: Repository<RefreshToken>,
  ) {}

  /**
   * Generate a fresh refresh token, store its hash, return the raw token to caller.
   * Caller passes the raw token to the client and never stores it server-side.
   */
  async issue(userId: string, ttlMs: number, userAgent?: string): Promise<string> {
    const rawToken = randomBytes(48).toString('base64url');
    const tokenHash = this.hash(rawToken);
    const expiresAt = new Date(Date.now() + ttlMs);

    await this.repo.save(
      this.repo.create({
        userId,
        tokenHash,
        expiresAt,
        userAgent: userAgent ?? null,
      }),
    );

    return rawToken;
  }

  /**
   * Look up a refresh token by its raw value. Returns the entity if valid (not revoked, not expired).
   */
  async findValid(rawToken: string): Promise<RefreshToken | null> {
    const tokenHash = this.hash(rawToken);
    return this.repo.findOne({
      where: {
        tokenHash,
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
    });
  }

  async revoke(id: string): Promise<void> {
    await this.repo.update(id, { revoked: true });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.repo.update({ userId, revoked: false }, { revoked: true });
  }

  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}