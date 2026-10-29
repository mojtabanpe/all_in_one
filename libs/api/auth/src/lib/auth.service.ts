import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type {
  LoginInput,
  RegisterInput,
  User,
} from '@all-in-one/shared/schemas';
import { PrismaService, type User as DbUser } from '@all-in-one/api/db';
import { hashPassword, verifyPassword } from './password';

export function toUser(user: DbUser): User {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<DbUser> {
    const email = input.email.toLowerCase();
    if (await this.prisma.user.findUnique({ where: { email } })) {
      throw new ConflictException('این ایمیل قبلاً ثبت شده است');
    }
    return this.prisma.user.create({
      data: {
        email,
        name: input.name ?? null,
        passwordHash: await hashPassword(input.password),
        role: 'CUSTOMER',
      },
    });
  }

  async login(input: LoginInput): Promise<DbUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
    });
    // Same error for unknown email and wrong password: no account enumeration.
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      throw new UnauthorizedException('ایمیل یا رمز عبور نادرست است');
    }
    return user;
  }

  findById(id: string): Promise<DbUser | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  sign(user: DbUser): Promise<string> {
    return this.jwt.signAsync({ sub: user.id, role: user.role });
  }
}
