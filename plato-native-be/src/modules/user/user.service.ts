import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JobSeekerService } from './job-seeker.service';
import { CreateUserInput, UpdateUserInput } from './types';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jobSeeker: JobSeekerService,
  ) {}

  create(input: CreateUserInput) {
    return this.prisma.user.create({
      data: { ...input, job_seeker: { create: {} } },
    });
  }

  findWithJobSeeker(id: string) {
    return this.jobSeeker.getByUserId(id, { includeRelations: true });
  }

  async findById(id: string) {
    try {
      return await this.prisma.user.findUniqueOrThrow({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException(`User ${id} not found`);
      }
      throw error;
    }
  }

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  update(id: string, data: UpdateUserInput) {
    return this.prisma.user.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.user.delete({ where: { id } });
  }
}
