import { z } from "zod";

export const GeneratedChangeSchema = z.object({
  summary: z.string().min(1).max(1000),
  files: z
    .array(
      z.object({
        path: z.string().min(1).max(240),
        content: z.string(),
      }),
    )
    .min(1)
    .max(60),
  notes: z.array(z.string().max(1000)).default([]),
  errors: z.array(z.string().max(1000)).default([]),
});

export const GENERATED_CHANGE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "files", "notes", "errors"],
  properties: {
    summary: {
      type: "string",
      description: "Brief user-facing summary of the project changes.",
    },
    files: {
      type: "array",
      minItems: 1,
      maxItems: 60,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "content"],
        properties: {
          path: {
            type: "string",
            description: "Relative project path for a complete file replacement.",
          },
          content: {
            type: "string",
            description: "Complete file content.",
          },
        },
      },
    },
    notes: {
      type: "array",
      items: { type: "string" },
      description: "Important implementation notes for the user.",
    },
    errors: {
      type: "array",
      items: { type: "string" },
      description: "Recoverable issues or limitations, empty when none.",
    },
  },
} as const;
