import { describe, it, expect } from "vitest";
import { indexPlaceholder } from "../index.js";

describe("index", () => {
  it("exports component identifier", () => {
    expect(indexPlaceholder()).toBe("index");
  });
});
