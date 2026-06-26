import { describe, it, expect } from "vitest";
import { redactString, redactValue } from "../redact.js";

describe("redact", () => {
  it("redacts PRIVATE_KEY patterns", () => {
    const input = 'PRIVATE_KEY=0xabc123def4567890abcdef1234567890abcdef1234567890abcdef1234567890';
    expect(redactString(input)).not.toContain("abc123");
    expect(redactString(input)).toContain("[REDACTED]");
  });

  it("redacts MNEMONIC patterns", () => {
    const input = "mnemonic=word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12";
    expect(redactString(input)).toContain("MNEMONIC=[REDACTED]");
  });

  it("redacts API_KEY patterns", () => {
    const input = "api_key=sk-live-abcdefghijklmnop";
    expect(redactString(input)).toContain("API_KEY=[REDACTED]");
  });

  it("redacts long hex strings", () => {
    const hex = "a".repeat(64);
    expect(redactString(`key=${hex}`)).toContain("[REDACTED_HEX]");
  });

  it("redacts sensitive object keys", () => {
    const result = redactValue({
      publicAddress: "0x1234",
      privateKey: "0x" + "ab".repeat(32),
      apiKey: "secret-value",
      nested: { passphrase: "hunter2" },
    }) as Record<string, unknown>;

    expect(result["privateKey"]).toBe("[REDACTED]");
    expect(result["apiKey"]).toBe("[REDACTED]");
    expect((result["nested"] as Record<string, unknown>)["passphrase"]).toBe(
      "[REDACTED]",
    );
    expect(result["publicAddress"]).toBe("0x1234");
  });
});
