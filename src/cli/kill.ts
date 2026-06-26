import {
  activateKillSwitch,
  getKillSwitchPath,
  isKillSwitchActive,
} from "../policy/kill-switch.js";

export function main(): number {
  const path = getKillSwitchPath();

  if (isKillSwitchActive(path)) {
    console.log(`Kill switch already active at ${path}`);
    return 0;
  }

  activateKillSwitch(path);
  console.log(`Kill switch activated at ${path}`);
  console.log("All money-moving actions will be denied until resume.");
  return 0;
}

const isMain =
  process.argv[1]?.replace(/\\/g, "/").endsWith("cli/kill.ts") ?? false;
if (isMain) {
  process.exit(main());
}
