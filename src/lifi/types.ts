import { z } from "zod";

export const lifiConfigSchema = z.object({
  max_slippage_bps: z.number().int().positive(),
  max_hops: z.number().int().positive(),
  max_fee_percent: z.number().positive(),
  route_max_age_seconds: z.number().int().positive(),
  default_from_chain_id: z.number().int().positive(),
  default_to_chain_id: z.number().int().positive(),
  default_from_token: z.string(),
  default_to_token: z.string(),
});

export type LifiConfig = z.infer<typeof lifiConfigSchema>;

export const quoteRequestSchema = z.object({
  fromChainId: z.number().int().positive(),
  toChainId: z.number().int().positive(),
  fromToken: z.string(),
  toToken: z.string(),
  fromAmount: z.string(),
  fromAddress: z.string().optional(),
  toAddress: z.string().optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export type RouteStep = {
  tool: string;
  fromChainId: number;
  toChainId: number;
  feeUsd: number;
};

export type RouteQuote = {
  id: string;
  fromAmount: string;
  toAmount: string;
  toAmountMin: string;
  gasCostUsd: number;
  feeCostUsd: number;
  slippageBps: number;
  hops: number;
  steps: RouteStep[];
  createdAt: number;
  toAddress: string;
};

export type LifiErrorCode =
  | "CONFIG_ERROR"
  | "QUOTE_FAILED"
  | "SANITY_FAILED"
  | "POLICY_DENIED"
  | "KILL_SWITCH"
  | "DRY_RUN"
  | "EXECUTE_FAILED";

export type LifiError = {
  code: LifiErrorCode;
  message: string;
  details?: unknown;
};

export type ExecuteResult = {
  routeId: string;
  txHash: `0x${string}`;
  simulated: boolean;
  status: "DONE" | "PENDING" | "FAILED";
};
