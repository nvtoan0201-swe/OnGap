import { z } from "zod";

export const AuditGapSchema = z.object({
  heading_path: z.string().min(1),
  reason: z.string().min(1),
});

export const AuditResponseSchema = z.object({
  coverage_pct: z.number().min(0).max(100),
  gaps: z.array(AuditGapSchema).default([]),
  notes: z.string().default(""),
});

export type AuditGap = z.infer<typeof AuditGapSchema>;
export type AuditResponse = z.infer<typeof AuditResponseSchema>;
