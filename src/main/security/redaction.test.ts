// @vitest-environment node

import { describe, expect, it } from "vitest";
import { maskConfiguredSecret, redactSecret } from "./redaction";

describe("redaction helpers", () => {
  it("redacts common API key patterns", () => {
    expect(redactSecret("Authorization: Bearer abc.def_123")).toBe(
      "Authorization: Bearer [REDACTED]"
    );
    expect(redactSecret('{"apiKey":"secret-value-123"}')).toBe('{"apiKey":"[REDACTED]"}');
    expect(redactSecret("sk-test_123456789")).toBe("[REDACTED]");
  });

  it("returns a stable configured-secret mask", () => {
    expect(maskConfiguredSecret()).toBe("••••••••");
  });
});
