import { z } from "zod";

export const FederationAskRequestSchema = z.object({
  question: z.string().trim().min(1, "问题不能为空").max(4000, "问题长度不能超过 4000 字符"),
});

export const FederationNodeDetailSchema = z
  .object({
    node: z.string(),
    status: z.string(),
    confidence: z.number().optional(),
    answer_preview: z.string().optional(),
    detail: z.string().optional(),
  })
  .passthrough();

export type FederationNodeDetail = z.infer<typeof FederationNodeDetailSchema>;

export const CentralAskResponseSchema = z.object({
  answer: z.string(),
  details: z.array(FederationNodeDetailSchema),
  status: z.enum(["ok", "partial", "error"]).optional(),
  request_id: z.string().optional(),
});

export const FederationAskResponseSchema = z.object({
  requestId: z.string(),
  status: z.enum(["ok", "partial", "error"]),
  answer: z.string(),
  details: z.array(FederationNodeDetailSchema),
});

export type FederationAskResponse = z.infer<typeof FederationAskResponseSchema>;

export const FederationErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});

export type FederationErrorBody = z.infer<typeof FederationErrorBodySchema>;
