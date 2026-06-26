/**
 * Redacts sensitive patterns from log payloads before they reach pino.
 */

const REDACTION_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  {
    pattern: /(?:PRIVATE_KEY|privateKey)\s*[=:]\s*["']?([^\s"',}]+)/gi,
    replacement: "PRIVATE_KEY=[REDACTED]",
  },
  {
    pattern: /(?:MNEMONIC|mnemonic|seedPhrase)\s*[=:]\s*["']?([^\s"',}]+)/gi,
    replacement: "MNEMONIC=[REDACTED]",
  },
  {
    pattern: /(?:API_KEY|apiKey|api_key|secret)\s*[=:]\s*["']?([^\s"',}]+)/gi,
    replacement: "API_KEY=[REDACTED]",
  },
  {
    pattern: /(?:passphrase|password)\s*[=:]\s*["']?([^\s"',}]+)/gi,
    replacement: "passphrase=[REDACTED]",
  },
  // Suspicious hex strings (32+ bytes / 64+ hex chars) — likely keys or secrets
  {
    pattern: /\b0x[a-fA-F0-9]{64,}\b/g,
    replacement: "0x[REDACTED_HEX]",
  },
  {
    pattern: /\b[a-fA-F0-9]{64,}\b/g,
    replacement: "[REDACTED_HEX]",
  },
];

export function redactString(value: string): string {
  let result = value;
  for (const { pattern, replacement } of REDACTION_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

export function redactValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(redactValue);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      const lowerKey = k.toLowerCase();
      if (
        lowerKey.includes("private") ||
        lowerKey.includes("mnemonic") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("passphrase") ||
        lowerKey.includes("password") ||
        lowerKey.includes("apikey") ||
        lowerKey.includes("api_key")
      ) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redactValue(v);
      }
    }
    return out;
  }
  return value;
}
