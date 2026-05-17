import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import ms, { StringValue } from 'ms';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokensService } from './refresh-tokens.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: { id: string; name: string; email: string; role: string };
  tokens: TokenPair;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly refreshTokens: RefreshTokensService,
  ) {}

  async register(dto: RegisterDto, userAgent?: string): Promise<AuthResponse> {
    const user = await this.usersService.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
    });
    return this.issueAuthResponse(user, userAgent);
  }

  async login(dto: LoginDto, userAgent?: string): Promise<AuthResponse> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('Invalid credentials');

    return this.issueAuthResponse(user, userAgent);
  }

  async refresh(rawRefreshToken: string, userAgent?: string): Promise<TokenPair> {
    const stored = await this.refreshTokens.findValid(rawRefreshToken);
    if (!stored) throw new UnauthorizedException('Invalid or expired refresh token');

    // Rotate: revoke old, issue new
    await this.refreshTokens.revoke(stored.id);

    const user = await this.usersService.findById(stored.userId);
    return this.issueTokenPair(user, userAgent);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const stored = await this.refreshTokens.findValid(rawRefreshToken);
    if (stored) {
      await this.refreshTokens.revoke(stored.id);
    }
    // No error if not found — logout is idempotent
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  private async issueAuthResponse(user: User, userAgent?: string): Promise<AuthResponse> {
    const tokens = await this.issueTokenPair(user, userAgent);
    return { user: this.sanitize(user), tokens };
  }

  private async issueTokenPair(user: User, userAgent?: string): Promise<TokenPair> {
    const payload = { sub: user.id, email: user.email, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshTtl = this.config.get<string>('JWT_REFRESH_EXPIRES_IN', '7d');
    const ttlMs = ms(refreshTtl as ms.StringValue);
    const refreshToken = await this.refreshTokens.issue(user.id, ttlMs, userAgent);

    return { accessToken, refreshToken };
  }

  private sanitize(user: User) {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}