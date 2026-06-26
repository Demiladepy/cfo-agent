import { z } from "zod";

export const airtimeRequestSchema = z.object({
  phone: z.string().min(10),
  amountNgn: z.number().positive(),
  network: z.enum(["mtn", "glo", "airtel", "9mobile"]),
  idempotencyKey: z.string().uuid(),
});

export const transferRequestSchema = z.object({
  recipientId: z.string(),
  recipientCategory: z.string(),
  amountNgn: z.number().positive(),
  idempotencyKey: z.string().uuid(),
});

export type AirtimeRequest = z.infer<typeof airtimeRequestSchema>;
export type TransferRequest = z.infer<typeof transferRequestSchema>;

export type IndexToolResult<T> = {
  success: boolean;
  data?: T;
  error?: string;
  reference?: string;
};

export type IndexErrorCode =
  | "POLICY_DENIED"
  | "KILL_SWITCH"
  | "DUPLICATE"
  | "CONFIRM_REQUIRED"
  | "DRY_RUN"
  | "MCP_ERROR";

export type IndexError = {
  code: IndexErrorCode;
  message: string;
};

export type IndexMcpTools = {
  purchaseAirtime: (
    req: AirtimeRequest,
  ) => Promise<IndexToolResult<{ reference: string }>>;
  transfer: (
    req: TransferRequest,
  ) => Promise<IndexToolResult<{ reference: string }>>;
};
