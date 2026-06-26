import * as readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import {
  deactivateKillSwitch,
  getKillSwitchPath,
  isKillSwitchActive,
} from "../policy/kill-switch.js";

export async function main(): Promise<number> {
  const path = getKillSwitchPath();

  if (!isKillSwitchActive(path)) {
    console.log("Kill switch is not active.");
    return 0;
  }

  const rl = readline.createInterface({ input, output });
  const answer = await rl.question(
    "Resume money-moving operations? Type 'yes' to confirm: ",
  );
  rl.close();

  if (answer.trim().toLowerCase() !== "yes") {
    console.log("Resume cancelled. Kill switch remains active.");
    return 1;
  }

  deactivateKillSwitch(path);
  console.log("Kill switch deactivated. Policy-gated operations may proceed.");
  return 0;
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/resume.ts") ?? false;
if (isMain) {
  main()
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
