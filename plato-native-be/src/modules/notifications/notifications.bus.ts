import { Injectable } from '@nestjs/common';
import { EventEmitter } from 'events';
import { Observable } from 'rxjs';

export type NotificationTone = 'success' | 'warning' | 'error' | 'info';

// One thing worth telling the seeker about. Derived from a search run or an
// application reaching a state they care about.
export interface SeekerNotification {
  // Stable per (thing, state): a status change is a new, unread notification.
  id: string;
  // queue: live-only batch messages (ETA up front, summary at the end).
  kind: 'run' | 'application' | 'queue';
  status: string;
  tone: NotificationTone;
  title: string;
  body: string;
  // Where clicking it lands inside the app.
  href: string;
  at: string;
}

// ponytail: in-process pub/sub keyed by seeker — Redis pub/sub when there's >1 API instance.
@Injectable()
export class NotificationsBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  publish(jobSeekerId: string, notification: SeekerNotification) {
    this.emitter.emit(jobSeekerId, notification);
  }

  stream(jobSeekerId: string): Observable<SeekerNotification> {
    return new Observable((subscriber) => {
      const handler = (n: SeekerNotification) => subscriber.next(n);
      this.emitter.on(jobSeekerId, handler);
      return () => this.emitter.off(jobSeekerId, handler);
    });
  }
}
