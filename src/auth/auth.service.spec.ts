import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

const mockUsersService = {
  create: jest.fn(),
  findByEmail: jest.fn(),
  findById: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn().mockResolvedValue('mock-access-token'),
};

const mockConfigService = {
  get: jest.fn().mockReturnValue('7d'),
};

const mockRefreshTokensService = {
  issue: jest.fn().mockResolvedValue('mock-refresh-token'),
  findValid: jest.fn(),
  revoke: jest.fn(),
  revokeAllForUser: jest.fn(),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: RefreshTokensService, useValue: mockRefreshTokensService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should throw UnauthorizedException if user not found', async () => {
    mockUsersService.findByEmail.mockResolvedValue(null);

    await expect(
      service.login({ email: 'wrong@test.com', password: 'wrong' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException for wrong password', async () => {
    mockUsersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      password: await bcrypt.hash('correctpassword', 10),
      role: 'MEMBER',
      name: 'Test User',
    });

    await expect(
      service.login({ email: 'test@test.com', password: 'wrongpassword' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should return tokens on successful login', async () => {
    const hashedPassword = await bcrypt.hash('correctpassword', 10);
    mockUsersService.findByEmail.mockResolvedValue({
      id: 'user-1',
      email: 'test@test.com',
      password: hashedPassword,
      role: 'MEMBER',
      name: 'Test User',
    });

    const result = await service.login({
      email: 'test@test.com',
      password: 'correctpassword',
    });

    expect(result.tokens.accessToken).toBe('mock-access-token');
    expect(result.tokens.refreshToken).toBe('mock-refresh-token');
    expect(result.user.email).toBe('test@test.com');
  });
});