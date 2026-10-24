import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  // Lets recordUsage() reach the DB from plain functions.
  static instance?: PrismaService;
  constructor() {
    super();
    PrismaService.instance = this;
  }

  async onModuleInit() {
    await this.$connect();
  }
}
