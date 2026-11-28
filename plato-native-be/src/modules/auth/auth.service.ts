import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../user/user.service';
import { blockedError } from './session-state';
import {
  E164,
  LoginInput,
  normalizePhone,
  SignupInput,
  UpdateMeInput,
} from './auth.schema';

const SALT_ROUNDS = 10;
// Compared against when the email has no account, so a miss takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync('no-account-with-this-email', SALT_ROUNDS);

const PHONE_TAKEN = 'Phone number is already registered';

// A unique index hit: surface as 409, not 500.
function conflict(error: unknown) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    const target = JSON.stringify(error.meta?.target ?? '');
    return new ConflictException(
      target.includes('phone') ? PHONE_TAKEN : 'Email is already registered',
    );
  }
  return error;
}

function toSafeUser(user: User) {
  const {
    password_hash: _password_hash,
    sessions_valid_after: _sessions_valid_after,
    ...safeUser
  } = user;
  return { ...safeUser, email_verified: !!user.email_verified_at };
}

// The forms a number was stored in before normalizePhone: without the "+", or with "00".
const legacyForms = (phone: string) => [
  phone,
  phone.slice(1),
  `00${phone.slice(1)}`,
];

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    await this.normalizeLegacyPhones().catch((e: Error) =>
      this.logger.warn(`legacy phone migration failed: ${e.message}`),
    );
  }

  /**
   * Phones stored before normalizePhone (no "+", "00", spaces) are rewritten to
   * E.164 at boot, each only when no other account holds that number (and the
   * result is a valid E.164 number; a local one is logged instead). A collision
   * leaves both accounts exactly as they are and logs both ids (never the number)
   * for an admin to resolve by hand: accounts are never merged, deleted or
   * reassigned. Idempotent: normalized phones are not read again.
   */
  async normalizeLegacyPhones() {
    // Every phone, checked here: Prisma's Mongo startsWith/contains build unescaped
    // regexes, and "^+" is an invalid one. Two fields per user, once per boot.
    const legacy = await this.prisma.user.findMany({
      select: { id: true, phone: true },
    });
    for (const u of legacy) {
      const phone = normalizePhone(u.phone);
      if (phone === u.phone) continue;
      // a local number without its country code ("010...") has no right E.164 form to guess
      if (!E164.test(phone)) {
        this.logger.warn(
          `phone of user ${u.id} is not an international number; left unchanged, fix by hand`,
        );
        continue;
      }
      const other = await this.prisma.user.findFirst({
        where: { phone, id: { not: u.id } },
        select: { id: true },
      });
      if (!other)
        try {
          await this.prisma.user.update({
            where: { id: u.id },
            data: { phone },
          });
          continue;
        } catch (e) {
          // taken by a sign-up since the read: a collision like any other
          if (!(conflict(e) instanceof ConflictException)) throw e;
        }
      this.logger.warn(
        `phone collision: user ${u.id} (legacy form) and ${other ? `user ${other.id}` : 'another account'} hold the same number; both left unchanged, resolve by hand`,
      );
    }
  }

  /** Taken by another account, in its normalized or a legacy stored form. */
  private async phoneTaken(phone: string, exceptUserId?: string) {
    const hit = await this.prisma.user.findFirst({
      where: {
        phone: { in: legacyForms(phone) },
        ...(exceptUserId && { id: { not: exceptUserId } }),
      },
      select: { id: true },
    });
    return !!hit;
  }

  async signup(input: SignupInput) {
    const existing = await this.userService.findByEmail(input.email);
    if (existing) throw new ConflictException('Email is already registered');
    if (await this.phoneTaken(input.phone))
      throw new ConflictException(PHONE_TAKEN);

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
      // Between the pre-checks and the insert.
      throw conflict(error);
    }

    return { token: await this.issueToken(user.id), user: toSafeUser(user) };
  }

  issueToken(userId: string) {
    return this.jwtService.signAsync({ sub: userId });
  }

  async login(input: LoginInput) {
    const user = await this.userService.findByEmail(input.email);
    const passwordMatches = await bcrypt.compare(
      input.password,
      user?.password_hash ?? DUMMY_HASH,
    );
    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }
    // only once the password is proven, so it never tells who has an account
    if (user.blocked_at) throw blockedError();

    return { token: await this.issueToken(user.id), user: toSafeUser(user) };
  }

  /** Settings → Account: name and phone. Both go onto every application Plato fills. */
  async updateMe(userId: string, input: UpdateMeInput) {
    if (input.phone && (await this.phoneTaken(input.phone, userId)))
      throw new ConflictException(PHONE_TAKEN);
    try {
      return toSafeUser(await this.userService.update(userId, input));
    } catch (error) {
      throw conflict(error);
    }
  }

  async me(userId: string) {
    const user = await this.userService.findById(userId);
    return toSafeUser(user);
  }
}
