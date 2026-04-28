import { z } from "zod";

export const ConceptSchema = z.object({
  type: z.literal("concept"),
  name: z.string().min(1),
  definition_verbatim: z.string().min(1),
  importance: z.number().int().min(1).max(5).default(3),
  related: z.array(z.string()).default([]),
  page: z.number().int().nullable().optional(),
});

export const ExampleSchema = z.object({
  type: z.literal("example"),
  description: z.string().min(1),
  context: z.string().default(""),
  concept_ref: z.string().nullable().optional(),
  page: z.number().int().nullable().optional(),
});

export const FormulaSchema = z.object({
  type: z.literal("formula"),
  expression: z.string().min(1),
  variables: z.string().default(""),
  conditions: z.string().default(""),
  page: z.number().int().nullable().optional(),
});

export const EntrySchema = z.discriminatedUnion("type", [
  ConceptSchema,
  ExampleSchema,
  FormulaSchema,
]);

export const BatchExtractionSchema = z.array(
  z.object({
    chunk_id: z.string(),
    entries: z.array(EntrySchema),
  }),
);

export type Concept = z.infer<typeof ConceptSchema>;
export type Example = z.infer<typeof ExampleSchema>;
export type Formula = z.infer<typeof FormulaSchema>;
export type Entry = z.infer<typeof EntrySchema>;
export type BatchExtraction = z.infer<typeof BatchExtractionSchema>;
