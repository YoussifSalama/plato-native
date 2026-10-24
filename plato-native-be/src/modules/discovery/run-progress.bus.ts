import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';
import { RunProgress } from './discovery-run.helpers';

// ponytail: in-process pub/sub — swap for Redis pub/sub when there's >1 API instance.
@Injectable()
export class RunProgressBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(runId: string, progress: RunProgress) {
    this.emitter.emit(runId, progress);
  }

  stream(runId: string): Observable<RunProgress> {
    return new Observable((subscriber) => {
      const handler = (p: RunProgress) => {
        subscriber.next(p);
        if (p.stage === 'done' || p.stage === 'failed') subscriber.complete();
      };
      this.emitter.on(runId, handler);
      return () => this.emitter.off(runId, handler);
    });
  }
}
