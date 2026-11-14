import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CreditsModule } from '../credits/credits.module';
import { AssessmentsController } from './assessments.controller';
import { AssessmentsService } from './assessments.service';
import { QuizzesController } from './quizzes.controller';
import { QuizzesService } from './quizzes.service';

// Quiz Builder: practice tests in a company's own format for one role, built by AI, plus the standard assessments
// (fixed item banks in data/assessments) and the candidate report (quiz.contract.ts).
@Module({
  imports: [AuthModule, CreditsModule],
  controllers: [QuizzesController, AssessmentsController],
  providers: [QuizzesService, AssessmentsService],
})
export class QuizzesModule {}
