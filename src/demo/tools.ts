import { createAppContext, type AppContext } from "../app/create-tools.js";

export type DemoContext = AppContext;

export function createDemoContext(options: {
  dataDir: string;
  killSwitchPath: string;
  env: import("../config/env.js").Env;
  dryRun?: boolean;
  mockWalletRpc?: boolean;
}): DemoContext {
  return createAppContext({
    dataDir: options.dataDir,
    killSwitchPath: options.killSwitchPath,
    env: options.env,
    dryRun: options.dryRun ?? true,
    useDemoPolicy: true,
    mockWalletRpc: options.mockWalletRpc ?? true,
  });
}
