import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AccountService } from './account.service';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { IEnvParams } from '../../types/config/env.types';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    secret: configService.get<IEnvParams>('env')!.jwtSecret,
    signOptions: { expiresIn: '7d' },
  }),
});

@Module({
  imports: [UserModule, jwtModule],
  controllers: [AuthController],
  providers: [AuthService, AccountService, JwtAuthGuard],
  // Re-export JwtModule too: any module that imports AuthModule to use
  // JwtAuthGuard also needs JwtService in scope to instantiate it.
  exports: [JwtAuthGuard, jwtModule],
})
export class AuthModule {}
