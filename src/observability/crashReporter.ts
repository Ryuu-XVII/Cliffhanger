import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { readJson, writeJson } from '@/api/kv';
import { isOnline } from '@/api/http';
import { supabase, supabaseConfigured } from '@/data/supabase';

/**
 * §12 requires crash reporting "from day one". The spec names Crashlytics, but
 * the backend moved to Supabase and pulling the whole Firebase SDK back in for
 * one feature is not a good trade - so reports go to a Supabase table instead,
 * behind a narrow interface.
 *
 * Two properties matter more than the destination:
 *
 * - Nothing here may throw. A crash reporter that crashes while reporting a
 *   crash turns a recoverable error into an unrecoverable one, so every path is
 *   wrapped and failure is silent by design.
 * - Reports survive being offline. They land in a local ring buffer first and
 *   flush opportunistically, because the crash that matters most is usually the
 *   one that happens on a bad connection.
 */

const QUEUE_KEY = 'crash:queue';
const MAX_QUEUED = 25;
/** Keep payloads small; a full RN stack can run to tens of kilobytes. */
const MAX_STACK_CHARS = 4000;

export interface CrashReport {
  id: string;
  message: string;
  stack: string | null;
  /** 'fatal' means the app could not continue rendering. */
  severity: 'fatal' | 'error';
  /** Where it came from: a React tree, a global handler, a rejected promise. */
  source: 'error-boundary' | 'global-handler' | 'unhandled-rejection' | 'manual';
  context: Record<string, unknown>;
  appVersion: string;
  platform: string;
  occurredAt: number;
}

function appVersion(): string {
  return Constants.expoConfig?.version ?? 'unknown';
}

function readQueue(): CrashReport[] {
  return readJson<CrashReport[]>(QUEUE_KEY) ?? [];
}

function writeQueue(reports: CrashReport[]): void {
  writeJson(QUEUE_KEY, reports.slice(-MAX_QUEUED));
}

function truncate(stack: string | undefined | null): string | null {
  if (!stack) return null;
  return stack.length > MAX_STACK_CHARS ? stack.slice(0, MAX_STACK_CHARS) + '\n[truncated]' : stack;
}

/**
 * Records a crash locally and tries to flush. Never throws and never rejects,
 * so it is always safe to call from a catch block or an error boundary.
 */
export function captureException(
  error: unknown,
  options: {
    severity?: CrashReport['severity'];
    source?: CrashReport['source'];
    context?: Record<string, unknown>;
  } = {},
): void {
  try {
    const normalised =
      error instanceof Error ? error : new Error(typeof error === 'string' ? error : JSON.stringify(error));

    const report: CrashReport = {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      message: normalised.message.slice(0, 500),
      stack: truncate(normalised.stack),
      severity: options.severity ?? 'error',
      source: options.source ?? 'manual',
      context: options.context ?? {},
      appVersion: appVersion(),
      platform: Platform.OS,
      occurredAt: Date.now(),
    };

    writeQueue([...readQueue(), report]);
    if (__DEV__) console.error('[crash]', report.source, report.message);
    void flushCrashReports();
  } catch {
    /* Reporting must never escalate the failure it is reporting. */
  }
}

/**
 * Uploads whatever is queued. Safe to call at any time - it no-ops when
 * offline, unconfigured, or signed out, leaving the queue intact for later.
 */
export async function flushCrashReports(): Promise<void> {
  try {
    const queued = readQueue();
    if (queued.length === 0) return;
    if (!supabaseConfigured || !isOnline()) return;

    const { data } = await supabase.auth.getUser();
    // Reports are keyed to a user by RLS; anonymous local sessions keep theirs
    // on the device until the account is upgraded.
    if (!data.user) return;

    const { error } = await supabase.from('crash_reports').insert(
      queued.map((report) => ({
        id: report.id,
        user_id: data.user!.id,
        message: report.message,
        stack: report.stack,
        severity: report.severity,
        source: report.source,
        context: report.context,
        app_version: report.appVersion,
        platform: report.platform,
        occurred_at: new Date(report.occurredAt).toISOString(),
      })),
    );
    if (error) return;

    // Only drop what was actually uploaded; anything captured mid-flight stays.
    const uploaded = new Set(queued.map((report) => report.id));
    writeQueue(readQueue().filter((report) => !uploaded.has(report.id)));
  } catch {
    /* Offline or transient - the queue survives for the next attempt. */
  }
}

/** Backs the diagnostics list in Settings, so a user can see what was sent. */
export function pendingCrashReports(): CrashReport[] {
  return readQueue();
}

export function clearCrashReports(): void {
  writeQueue([]);
}

let installed = false;

/**
 * Installs the global handlers. Called once from the root layout.
 *
 * Without this, an error thrown outside a React render - in a promise, a
 * listener, a worklet callback - is swallowed in release builds with no trace.
 */
export function installCrashReporter(): void {
  if (installed) return;
  installed = true;

  try {
    const globalWithHandler = global as typeof global & {
      ErrorUtils?: {
        getGlobalHandler: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
        setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
      };
    };

    const errorUtils = globalWithHandler.ErrorUtils;
    if (errorUtils) {
      const previous = errorUtils.getGlobalHandler();
      errorUtils.setGlobalHandler((error, isFatal) => {
        captureException(error, {
          severity: isFatal ? 'fatal' : 'error',
          source: 'global-handler',
          context: { isFatal: Boolean(isFatal) },
        });
        // Keep RN's own handler so the red box still shows in development.
        previous?.(error, isFatal);
      });
    }

    // Hermes surfaces unhandled rejections through this hook when it is enabled.
    const tracking = globalWithHandler as unknown as {
      HermesInternal?: { enablePromiseRejectionTracker?: (options: unknown) => void };
    };
    tracking.HermesInternal?.enablePromiseRejectionTracker?.({
      allRejections: true,
      onUnhandled: (_id: number, rejection: unknown) => {
        captureException(rejection, { severity: 'error', source: 'unhandled-rejection' });
      },
    });
  } catch {
    /* An environment without ErrorUtils still runs; it just reports less. */
  }
}
