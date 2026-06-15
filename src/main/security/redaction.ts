const SECRET_PATTERNS = [
  { pattern: /sk-[A-Za-z0-9_-]{8,}/g, replacement: "[REDACTED]" },
  { pattern: /Bearer\s+[A-Za-z0-9._-]+/gi, replacement: "Bearer [REDACTED]" },
  { pattern: /(api[_-]?key["'\s:=]+)[A-Za-z0-9._-]+/gi, replacement: "$1[REDACTED]" }
];

export function redactSecret(value: string): string {
  return SECRET_PATTERNS.reduce(
    (redacted, rule) => redacted.replace(rule.pattern, rule.replacement),
    value
  );
}

export function maskConfiguredSecret(): string {
  return "••••••••";
}
