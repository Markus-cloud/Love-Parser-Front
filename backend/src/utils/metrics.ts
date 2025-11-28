import { Registry, collectDefaultMetrics, Counter, Histogram } from "prom-client";

export const metricsRegistry = new Registry();

collectDefaultMetrics({ register: metricsRegistry });

export const cronJobResultCounter = new Counter({
  name: "cron_job_runs_total",
  help: "Total cron job executions grouped by status",
  labelNames: ["job_name", "status"],
  registers: [metricsRegistry],
});

export const cronJobDurationHistogram = new Histogram({
  name: "cron_job_duration_seconds",
  help: "Duration of cron job executions in seconds",
  labelNames: ["job_name"],
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
  registers: [metricsRegistry],
});
