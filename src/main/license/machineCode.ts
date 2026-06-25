import crypto from "node:crypto";
import os from "node:os";
import { execFileSync } from "node:child_process";

export function getMachineCode(): string {
  const fingerprint = [
    readWindowsMachineGuid(),
    os.hostname(),
    os.platform(),
    os.arch(),
    os.userInfo().username
  ]
    .filter(Boolean)
    .join("|");
  const hash = crypto
    .createHash("sha256")
    .update(fingerprint || os.hostname())
    .digest("hex");
  return hash
    .slice(0, 16)
    .toUpperCase()
    .replace(/(.{4})(?=.)/g, "$1-");
}

function readWindowsMachineGuid(): string {
  if (process.platform !== "win32") {
    return "";
  }

  try {
    const output = execFileSync(
      "reg",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      {
        encoding: "utf8",
        timeout: 5000,
        windowsHide: true
      }
    );
    const match = output.match(/MachineGuid\s+REG_SZ\s+([^\r\n]+)/i);
    return match?.[1]?.trim() ?? "";
  } catch {
    return "";
  }
}
