const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  DEFAULT_PRIVATE_KEY_PATH,
  PUBLIC_KEY_SOURCE_PATH,
  parseArgs,
  writePublicKeySource
} = require("./license-utils");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const privateKeyPath = path.resolve(args.privateKey || DEFAULT_PRIVATE_KEY_PATH);
  const force = args.force === "true";

  if (fs.existsSync(privateKeyPath) && !force) {
    throw new Error(
      `私钥已存在：${privateKeyPath}。如果确认要重置授权体系，请加 --force；重置后旧激活码会全部失效。`
    );
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const publicKeyPem = publicKey.export({ type: "spki", format: "pem" });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" });

  fs.mkdirSync(path.dirname(privateKeyPath), { recursive: true });
  fs.writeFileSync(privateKeyPath, privateKeyPem, { encoding: "utf8", mode: 0o600 });
  writePublicKeySource(publicKeyPem);

  console.log(
    JSON.stringify(
      {
        ok: true,
        privateKeyPath,
        publicKeySourcePath: PUBLIC_KEY_SOURCE_PATH,
        message: "授权密钥已生成。私钥在 data/license/private-key.pem，不会提交到 GitHub。"
      },
      null,
      2
    )
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
