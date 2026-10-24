import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
  Sse,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { map } from 'rxjs';
import { z } from 'zod';
import { AuthenticatedRequest, JwtAuthGuard } from '../auth/jwt-auth.guard';
import { JobSeekerService } from '../user/job-seeker.service';
import { ApplyService } from './apply.service';

const answersSchema = z.object({
  answers: z.record(
    z.string(),
    z.union([z.string().max(5000), z.boolean(), z.array(z.string().max(500))]),
  ),
});

const liveInputSchema = z.object({
  type: z.enum(['click', 'move', 'wheel', 'key']),
  x: z.number().min(0).max(1).optional(),
  y: z.number().min(0).max(1).optional(),
  dx: z.number().optional(),
  dy: z.number().optional(),
  key: z.string().max(30).optional(),
});

// Same-origin page: the cookie rides along on the stream and the input posts.
const LIVE_VIEWER = `<!doctype html><meta charset="utf-8"><title>Plato live browser</title>
<style>html,body{margin:0;height:100%;background:#111;display:flex;align-items:center;justify-content:center}
img{max-width:100vw;max-height:100vh;cursor:crosshair;user-select:none}
#m{position:fixed;top:8px;left:8px;color:#fff;font:12px sans-serif;background:#0008;padding:4px 8px;border-radius:4px}</style>
<div id="m">Live. Click, scroll and type here: it goes to the real page.</div>
<img id="v" src="live/stream" draggable="false">
<script>
const v=document.getElementById('v');
const send=b=>fetch('live/input',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)}).catch(()=>{});
const pos=e=>{const r=v.getBoundingClientRect();return{x:Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),y:Math.min(1,Math.max(0,(e.clientY-r.top)/r.height))}};
v.addEventListener('click',e=>send({type:'click',...pos(e)}));
v.addEventListener('wheel',e=>{e.preventDefault();send({type:'wheel',...pos(e),dx:e.deltaX,dy:e.deltaY})},{passive:false});
addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey)return;e.preventDefault();send({type:'key',key:e.key})});
v.onerror=()=>{document.getElementById('m').textContent='Not running (finished or not started).'};
</script>`;

const intakeSchema = z.object({
  facts: z.record(z.string(), z.string().max(200).nullable()),
});

// Listing/queueing applications lives in DiscoveryController; this is the
// apply worker's surface: live events and the seeker's side of NEEDS_INPUT.
@Controller('job-seeker/applications')
@UseGuards(JwtAuthGuard)
export class ApplyController {
  constructor(
    private readonly applyService: ApplyService,
    private readonly jobSeekerService: JobSeekerService,
  ) {}

  private async requireJobSeekerId(userId: string) {
    const jobSeeker = await this.jobSeekerService.getByUserId(userId);
    if (!jobSeeker) throw new NotFoundException('Job seeker profile not found');
    return jobSeeker.id;
  }

  // Worker state, this seeker's queue positions + ETA, and recent steps, so
  // the page can always say what is happening, even after a refresh.
  @Get('queue')
  async queue(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.queueStatus(jobSeekerId);
  }

  // Every step the worker takes on this seeker's applications, live.
  @Sse('events')
  async events(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService
      .events(jobSeekerId)
      .pipe(map((data) => ({ data })));
  }

  // Is the application snapshot complete enough to apply without asking?
  @Get('readiness')
  async readiness(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.readiness(jobSeekerId);
  }

  // The intake bank: facts asked once, reused on every form.
  @Get('intake')
  async intake(@Req() req: AuthenticatedRequest) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.intake(jobSeekerId);
  }

  @Post('intake')
  async saveIntake(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = intakeSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.applyService.saveIntake(jobSeekerId, parsed.data.facts);
  }

  // Proof of application. Private: only the owner can fetch it.
  @Get(':id/screenshot')
  async screenshot(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const png = await this.applyService.screenshot(jobSeekerId, id);
    res
      .setHeader('Content-Type', 'image/png')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(png);
  }

  // "Watch live": bring this application's real browser window to the front.
  @Post(':id/live/focus')
  async liveFocus(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    await this.applyService.liveFocus(jobSeekerId, id);
    return { ok: true };
  }

  // The resume Plato tailored for this job. Private: owner only.
  @Get(':id/resume')
  async resume(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const pdf = await this.applyService.resume(jobSeekerId, id);
    res
      .setHeader('Content-Type', 'application/pdf')
      .setHeader('Cache-Control', 'private, max-age=3600')
      .send(pdf);
  }

  // After completing a human-verification step (or to reopen the window).
  @Post(':id/continue')
  async continueVerification(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.continueVerification(jobSeekerId, id);
  }

  @Post(':id/retry')
  async retry(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.retry(jobSeekerId, id);
  }

  @Delete(':id')
  async withdraw(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.withdraw(jobSeekerId, id);
  }

  @Post(':id/answers')
  async answers(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    const parsed = answersSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues);
    return this.applyService.provideAnswers(
      jobSeekerId,
      id,
      parsed.data.answers,
    );
  }

  @Post(':id/mark-submitted')
  async markSubmitted(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.markSubmitted(jobSeekerId, id);
  }

  // Declared last: static GET routes above (queue, readiness, events) must
  // win over this parameterised one.
  @Get(':id')
  async one(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const jobSeekerId = await this.requireJobSeekerId(req.userId);
    return this.applyService.getOne(jobSeekerId, id);
  }
}
