import "dotenv/config";
import { main } from "./repl.js";

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/index.ts") ?? false;
if (isMain) {
  main();
}
