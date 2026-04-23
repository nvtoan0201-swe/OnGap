import { admin } from "../supabase/admin.js";
import { parseDocument } from "../pipeline/parse-document.js";
import { logger } from "../logger.js";

interface ClaimedJob {
  job_id: string;
  document_id: string;
  kind: "parse" | "chunk" | "extract" | "audit";
}

/** Execute at most one job. Returns true if a job was handled. */
export async function runOnce(workerId: string): Promise<boolean> {
  const sb = admin();
  const { data, error } = await sb.rpc("claim_next_document_job", {
    worker_id: workerId,
  });
  if (error) {
    logger.error("claim rpc failed", { err: error.message });
    return false;
  }
  const jobs = (data ?? []) as ClaimedJob[];
  if (jobs.length === 0) return false;

  const job = jobs[0]!;
  logger.info("job claimed", { ...job });

  try {
    switch (job.kind) {
      case "parse":
        await parseDocument(job.document_id);
        break;
      default:
        throw new Error(`Phase 2 only handles 'parse' jobs; got '${job.kind}'`);
    }
    await sb.rpc("complete_document_job", {
      p_job_id: job.job_id,
      p_success: true,
      p_error: null,
    });
    logger.info("job done", { job_id: job.job_id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("job failed", { job_id: job.job_id, err: msg });
    await sb.rpc("complete_document_job", {
      p_job_id: job.job_id,
      p_success: false,
      p_error: msg,
    });
  }
  return true;
}

/** Long-running poll loop. Sleeps `intervalMs` when idle. */
export async function runLoop(workerId: string, intervalMs = 5000): Promise<never> {
  logger.info("poller started", { workerId, intervalMs });
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const handled = await runOnce(workerId);
    if (!handled) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
