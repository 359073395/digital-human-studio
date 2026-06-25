const path = require("node:path");
const {
  DEFAULT_PRIVATE_KEY_PATH,
  createLicenseCode,
  normalizeMachineCode,
  parseArgs,
  readPrivateKey
} = require("./license-utils");

function main() {
  const args = parseArgs(process.argv.slice(2));
  const machineCode = args.machine || args.machineCode;
  const holder = args.holder || args.name;
  const days = Number(args.days || 90);
  const privateKeyPath = path.resolve(args.privateKey || DEFAULT_PRIVATE_KEY_PATH);
  const privateKeyPem = readPrivateKey(privateKeyPath);
  const result = createLicenseCode({
    machineCode,
    holder,
    days,
    privateKeyPem
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        code: result.code,
        payload: {
          ...result.payload,
          machineCode: normalizeMachineCode(result.payload.machineCode)
        }
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
