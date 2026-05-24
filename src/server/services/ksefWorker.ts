import { env } from "../config/env.js";
import { notifyTelegram } from "./telegram.js";
import { processDueKsefRetries, processPendingKsefStatusRefreshes } from "./ksef.js";

interface WorkerRunStatus {
  autorun: boolean;
  running: boolean;
  intervalSeconds: number;
  batchLimit: number;
  lastStartedAt: string | null;
  lastFinishedAt: string | null;
  lastError: string | null;
  lastRetryProcessed: number;
  lastStatusProcessed: number;
}

const workerStatus: WorkerRunStatus = {
  autorun: env.KSEF_WORKER_AUTORUN,
  running: false,
  intervalSeconds: env.KSEF_WORKER_INTERVAL_SECONDS,
  batchLimit: env.KSEF_WORKER_BATCH_LIMIT,
  lastStartedAt: null,
  lastFinishedAt: null,
  lastError: null,
  lastRetryProcessed: 0,
  lastStatusProcessed: 0
};

let timer: NodeJS.Timeout | null = null;

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function getKsefWorkerStatus() {
  return { ...workerStatus };
}

export async function runKsefWorkerOnce() {
  if (workerStatus.running) {
    return { skipped: true, reason: "KSeF worker is already running.", ...getKsefWorkerStatus() };
  }

  workerStatus.running = true;
  workerStatus.lastStartedAt = new Date().toISOString();
  workerStatus.lastError = null;

  try {
    const [retries, statuses] = await Promise.all([
      processDueKsefRetries(env.KSEF_WORKER_BATCH_LIMIT),
      processPendingKsefStatusRefreshes(env.KSEF_WORKER_BATCH_LIMIT)
    ]);

    workerStatus.lastRetryProcessed = retries.processed;
    workerStatus.lastStatusProcessed = statuses.processed;

    const processed = retries.processed + statuses.processed;
    if (processed > 0) {
      await notifyTelegram(
        `KSeF Pilot worker: processed ${retries.processed} retry item(s), ${statuses.processed} status refresh item(s).`
      );
    }

    return {
      skipped: false,
      retries,
      statuses,
      ...getKsefWorkerStatus()
    };
  } catch (error) {
    workerStatus.lastError = errorMessage(error);
    await notifyTelegram(`KSeF Pilot worker error: ${workerStatus.lastError}`);
    throw error;
  } finally {
    workerStatus.running = false;
    workerStatus.lastFinishedAt = new Date().toISOString();
  }
}

export function startKsefWorker() {
  if (!env.KSEF_WORKER_AUTORUN || timer) {
    return getKsefWorkerStatus();
  }

  const intervalMs = env.KSEF_WORKER_INTERVAL_SECONDS * 1000;
  timer = setInterval(() => {
    runKsefWorkerOnce().catch((error) => {
      console.error("KSeF worker failed", error);
    });
  }, intervalMs);
  timer.unref();

  setTimeout(() => {
    runKsefWorkerOnce().catch((error) => {
      console.error("Initial KSeF worker run failed", error);
    });
  }, 10_000).unref();

  return getKsefWorkerStatus();
}
