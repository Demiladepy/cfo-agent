import { dirname, join } from "node:path";
import type { Env } from "../config/env.js";
import { loadEnv } from "../config/env.js";
import { createAppContext, type AppContext } from "../app/create-tools.js";
import { getKillSwitchPath } from "../policy/kill-switch.js";

export type CliSessionOptions = {
  env?: Env;
  dataDir?: string;
  killSwitchPath?: string;
  dryRun?: boolean;
  sessionLive?: boolean;
  mockWalletRpc?: boolean;
  useDemoPolicy?: boolean;
};

export class CliSession {
  readonly env: Env;
  readonly dataDir: string;
  readonly killSwitchPath: string;
  readonly mockWalletRpc: boolean;
  readonly useDemoPolicy: boolean;

  private sessionLive: boolean;
  private _context: AppContext;

  constructor(options: CliSessionOptions = {}) {
    this.env = options.env ?? loadEnv();
    const dbPath = this.env.DATABASE_PATH;
    this.dataDir = options.dataDir ?? dirname(dbPath);
    this.killSwitchPath =
      options.killSwitchPath ??
      this.env.KILL_SWITCH_PATH ??
      join(this.dataDir, "agent.kill");
    this.mockWalletRpc = options.mockWalletRpc ?? false;
    this.useDemoPolicy = options.useDemoPolicy ?? false;
    this.sessionLive = options.sessionLive ?? false;

    const initialDryRun =
      options.dryRun ?? !(this.sessionLive && this.env.LIVE_EXECUTION);

    this._context = this.buildContext(initialDryRun);
  }

  get context(): AppContext {
    return this._context;
  }

  get dryRun(): boolean {
    return this._context.dryRun;
  }

  get liveSessionEnabled(): boolean {
    return this.sessionLive;
  }

  get envAllowsLive(): boolean {
    return this.env.LIVE_EXECUTION === true;
  }

  private buildContext(dryRun: boolean): AppContext {
    return createAppContext({
      env: this.env,
      dataDir: this.dataDir,
      killSwitchPath: this.killSwitchPath,
      dryRun,
      useDemoPolicy: this.useDemoPolicy,
      mockWalletRpc: this.mockWalletRpc,
      enableConfirmBridge: true,
    });
  }

  private recreateContext(dryRun: boolean): void {
    this._context.close();
    this._context = this.buildContext(dryRun);
  }

  setLiveEnabled(enabled: boolean): { ok: true } | { ok: false; error: string } {
    if (enabled && !this.envAllowsLive) {
      return {
        ok: false,
        error:
          "LIVE_EXECUTION is not true in environment — set it in .env before live on",
      };
    }
    this.sessionLive = enabled;
    this.recreateContext(!(enabled && this.envAllowsLive));
    return { ok: true };
  }

  close(): void {
    this._context.close();
  }
}

export function createCliSession(options?: CliSessionOptions): CliSession {
  if (!options?.killSwitchPath && !process.env["KILL_SWITCH_PATH"]) {
    const env = options?.env ?? loadEnv();
    const dataDir = options?.dataDir ?? dirname(env.DATABASE_PATH);
    process.env["KILL_SWITCH_PATH"] = join(dataDir, "agent.kill");
  }
  return new CliSession(options);
}

export function resolveCliKillSwitchPath(session: CliSession): string {
  return session.killSwitchPath || getKillSwitchPath();
}
