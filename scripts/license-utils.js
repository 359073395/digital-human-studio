const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PRODUCT_ID = "paoliang-video-workbench";
const PREFIX = "PLV1";
const DEFAULT_PRIVATE_KEY_PATH = path.resolve("data", "license", "private-key.pem");
const PUBLIC_KEY_SOURCE_PATH = path.resolve("src", "main", "license", "licensePublicKey.ts");

function normalizeMachineCode(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(.{4})(?=.)/g, "$1-");
}

function createLicenseCode({ machineCode, holder, days, privateKeyPem }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + Number(days) * 86_400_000);
  const payload = {
    productId: PRODUCT_ID,
    holder: String(holder || "").trim(),
    machineCode: normalizeMachineCode(machineCode),
    issuedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    licenseId: `lic_${now.getTime()}_${crypto.randomBytes(5).toString("hex")}`
  };

  if (!payload.holder) {
    throw new Error("授权对象不能为空。");
  }
  if (!payload.machineCode) {
    throw new Error("机器码不能为空。");
  }
  if (!Number.isFinite(Number(days)) || Number(days) <= 0) {
    throw new Error("有效天数必须大于 0。");
  }

  const payloadPart = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signingInput = `${PREFIX}.${payloadPart}`;
  const signature = crypto.sign(null, Buffer.from(signingInput, "utf8"), privateKeyPem);
  return {
    code: `${signingInput}.${signature.toString("base64url")}`,
    payload
  };
}

function readPrivateKey(privateKeyPath = DEFAULT_PRIVATE_KEY_PATH) {
  if (!fs.existsSync(privateKeyPath)) {
    throw new Error(
      `没有找到授权私钥：${privateKeyPath}。请先运行 npm run license:keygen 生成密钥。`
    );
  }
  return fs.readFileSync(privateKeyPath, "utf8");
}

function writePublicKeySource(publicKeyPem) {
  fs.mkdirSync(path.dirname(PUBLIC_KEY_SOURCE_PATH), { recursive: true });
  fs.writeFileSync(
    PUBLIC_KEY_SOURCE_PATH,
    `export const LICENSE_PUBLIC_KEY_PEM = \`${publicKeyPem.trim()}\n\`;\n`,
    "utf8"
  );
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith("--")) {
      continue;
    }
    const key = item.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = "true";
      continue;
    }
    result[key] = next;
    index += 1;
  }
  return result;
}

module.exports = {
  DEFAULT_PRIVATE_KEY_PATH,
  PRODUCT_ID,
  PUBLIC_KEY_SOURCE_PATH,
  createLicenseCode,
  normalizeMachineCode,
  parseArgs,
  readPrivateKey,
  writePublicKeySource
};
