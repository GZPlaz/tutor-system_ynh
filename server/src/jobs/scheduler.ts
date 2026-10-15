/**
 * In-process background jobs. Deliberately dependency-free: a single API
 * process on YunoHost doesn't need a queue server. Each job is guarded so a
 * slow run never overlaps the next tick. All jobs are idempotent, so moving
 * them to a separate worker process (or several) later is safe.
 */
import { logger } from '../lib/logger.js';
import { processOutbox } from '../modules/email/email.service.js';
import { cleanup, sendReminders } from './reminders.js';

interface Job {
  name: string;
  everyMs: number;
  run: () => Promise<unknown>;
}

const JOBS: Job[] = [
  { name: 'email-outbox', everyMs: 15_000, run: processOutbox },
  { name: 'session-reminders', everyMs: 60_000, run: sendReminders },
  { name: 'cleanup', everyMs: 6 * 3_600_000, run: cleanup },
];

const timers: NodeJS.Timeout[] = [];

export function startJobs(): void {
  for (const job of JOBS) {
    let running = false;
    const tick = async () => {
      if (running) return;
      running = true;
      try {
        await job.run();
      } catch (err) {
        logger.error({ err, job: job.name }, 'Background job failed');
      } finally {
        running = false;
      }
    };
    timers.push(setInterval(tick, job.everyMs));
    void tick();
  }
  logger.info({ jobs: JOBS.map((j) => j.name) }, 'Background jobs started');
}

export function stopJobs(): void {
  timers.forEach(clearInterval);
}
