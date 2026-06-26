import { describe, it, expect } from "vitest";
import { lifiPlaceholder } from "../index.js";

describe("lifi", () => {
  it("exports component identifier", () => {
    expect(lifiPlaceholder()).toBe("lifi");
  });
});
