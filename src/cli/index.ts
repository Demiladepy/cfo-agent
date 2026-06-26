import "dotenv/config";
import { boot } from "../app/boot.js";

export function main(argv: string[] = process.argv.slice(2)): void {
  boot(argv);
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/index.ts") ?? false;
if (isMain) {
  main();
}
