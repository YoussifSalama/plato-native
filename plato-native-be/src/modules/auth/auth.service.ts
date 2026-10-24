import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, User } from '@prisma/client';
import { UserService } from '../user/user.service';
import { LoginInput, SignupInput } from './auth.schema';

const SALT_ROUNDS = 10;

function toSafeUser(user: User) {
  const { password_hash: _password_hash, ...safeUser } = user;
  return safeUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async signup(input: SignupInput) {
    const existing = await this.userService.findByEmail(input.email);
    if (existing) throw new ConflictException('Email is already registered');

    const password_hash = await bcrypt.hash(input.password, SALT_ROUNDS);
    let user: User;
    try {
      user = await this.userService.create({
        full_name: input.full_name,
        email: input.email,
        phone: input.phone,
        password_hash,
      });
    } catch (error) {
      // Unique index hit between the pre-check and the insert, or on phone
      // (which has no pre-check): surface as 409, not 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const target = JSON.stringify(error.meta?.target ?? '');
        throw new ConflictException(
          target.includes('phone')
            ? 'Phone number is already registered'
            : 'Email is already registered',
        );
      }
      throw error;
    }

    const token = await this.jwtService.signAsync({ sub: user.id });
    return { token, user: toSafeUser(user) };
  }

  async login(input: LoginInput) {
    const user = await this.userService.findByEmail(input.email);
    if (!user) throw new UnauthorizedException('Invalid email or password');

    const passwordMatches = await bcrypt.compare(
      input.password,
      user.password_hash,
    );
    if (!passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const token = await this.jwtService.signAsync({ sub: user.id });
    return { token, user: toSafeUser(user) };
  }

  async me(userId: string) {
    const user = await this.userService.findById(userId);
    return toSafeUser(user);
  }
}
