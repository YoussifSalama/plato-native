import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';

export type ApplyStep =
  | 'claimed'
  | 'checking' // is the posting still open? what does the form ask?
  | 'mapping' // profile -> answers
  | 'drafting' // LLM drafts for screening questions
  | 'needs_input'
  | 'filling' // browser open, typing
  | 'submitting'
  | 'human_check' // the site asks for a person; paused, window kept open
  | 'verified' // the person completed it; carrying on
  | 'submitted'
  | 'diagnosing' // the failure doctor is working out why it failed
  | 'retrying'
  | 'skipped'
  | 'failed'
  | 'expired';

export interface ApplyEvent {
  applicationId: string;
  jobId: string;
  status: string;
  step: ApplyStep;
  message: string;
  attempt: number;
  at: string;
}

// ponytail: in-process pub/sub, same as RunProgressBus — Redis pub/sub when there's >1 API instance.
@Injectable()
export class ApplyEventsBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(jobSeekerId: string, event: ApplyEvent) {
    this.emitter.emit(jobSeekerId, event);
  }

  stream(jobSeekerId: string): Observable<ApplyEvent> {
    return new Observable((subscriber) => {
      const handler = (e: ApplyEvent) => subscriber.next(e);
      this.emitter.on(jobSeekerId, handler);
      return () => this.emitter.off(jobSeekerId, handler);
    });
  }
}
