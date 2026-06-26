import { describe, it, expect } from "vitest";
import { offrampPlaceholder } from "../index.js";

describe("offramp", () => {
  it("exports component identifier", () => {
    expect(offrampPlaceholder()).toBe("offramp");
  });
});
