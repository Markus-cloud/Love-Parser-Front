import { Job } from "bull";

import { ParseSearchJob } from "@/jobs/parseSearchJob";
import { logger } from "@/utils/logger";

export async function handleParsingJob(job: Job<ParseSearchJob>) {
  logger.info("Parsing job started", { jobId: job.id, requestId: job.data.requestId, query: job.data.query });

  await job.progress(10);
  const normalizedQuery = job.data.query.trim().toLowerCase();

  await job.progress(60);
  const payload = {
    requestId: job.data.requestId,
    normalizedQuery,
    discoveredItems: Math.max(1, Math.round(Math.random() * 10)),
    metadata: job.data.metadata ?? {},
  };

  await job.progress(100);
  logger.info("Parsing job finished", { jobId: job.id, requestId: job.data.requestId });

  return payload;
}
