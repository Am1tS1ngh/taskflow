import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { UserRole } from './user-role.enum';

const BCRYPT_ROUNDS = 10;

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async create(data: CreateUserData): Promise<User> {
    // Check for duplicate email (fast path; the DB will also enforce it)
    const existing = await this.usersRepo.findOne({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const user = this.usersRepo.create({
      name: data.name,
      email: data.email,
      password: passwordHash,
      role: data.role ?? UserRole.MEMBER,
    });

    return this.usersRepo.save(user);
  }

  async findByEmail(email: string): Promise<User | null> {
    // Need password for login comparison, so explicitly include it
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User> {
    const user = await this.usersRepo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}