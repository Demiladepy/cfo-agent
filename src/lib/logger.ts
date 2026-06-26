import pino from "pino";
import { loadEnv } from "../config/env.js";
import { redactValue } from "./redact.js";

const env = loadEnv();
const isDev = env.NODE_ENV === "development";

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      "privateKey",
      "private_key",
      "mnemonic",
      "seedPhrase",
      "apiKey",
      "api_key",
      "passphrase",
      "password",
      "secret",
    ],
    censor: "[REDACTED]",
  },
  ...(isDev
    ? {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        },
      }
    : {}),
  hooks: {
    logMethod(inputArgs, method) {
      const sanitized = inputArgs.map((arg) =>
        typeof arg === "object" && arg !== null ? redactValue(arg) : arg,
      );
      return method.apply(this, sanitized as Parameters<typeof method>);
    },
  },
});

export type Logger = typeof logger;

export interface ExternalCallLog {
  service: string;
  operation: string;
  input: unknown;
  output?: unknown;
  durationMs: number;
  error?: string;
}

/**
 * Wraps an external call with structured logging: input, output, duration.
 * Every integration (LI.FI, Index, off-ramp) should use this.
 */
export async function logExternalCall<T>(
  service: string,
  operation: string,
  input: unknown,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const child = logger.child({ service, operation });

  child.info({ input: redactValue(input) }, "external call started");

  try {
    const output = await fn();
    const durationMs = Math.round(performance.now() - start);
    child.info(
      { output: redactValue(output), durationMs },
      "external call completed",
    );
    return output;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    child.error({ error: message, durationMs }, "external call failed");
    throw err;
  }
}

export function logExternalCallSync<T>(
  service: string,
  operation: string,
  input: unknown,
  fn: () => T,
): T {
  const start = performance.now();
  const child = logger.child({ service, operation });

  child.info({ input: redactValue(input) }, "external call started");

  try {
    const output = fn();
    const durationMs = Math.round(performance.now() - start);
    child.info(
      { output: redactValue(output), durationMs },
      "external call completed",
    );
    return output;
  } catch (err) {
    const durationMs = Math.round(performance.now() - start);
    const message = err instanceof Error ? err.message : String(err);
    child.error({ error: message, durationMs }, "external call failed");
    throw err;
  }
}
