import { existsSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const mode = args[0];
const flagArgs = args.slice(1);
const supportedFlags = new Set(["--silent"]);
const unknownFlags = flagArgs.filter((flag) => !supportedFlags.has(flag));
const silentMode = flagArgs.includes("--silent");

if ((mode !== "dev" && mode !== "start") || unknownFlags.length > 0) {
  if (unknownFlags.length > 0) {
    console.error(`[run-local] Unknown option(s): ${unknownFlags.join(", ")}`);
  }
  console.error("[run-local] Usage: node ./scripts/run-local.mjs <dev|start> [--silent]");
  process.exit(1);
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, "..");
const npmExecPath = process.env.npm_execpath ?? "";
const isCurrentRunnerPnpm = /pnpm(?:\.(?:cjs|js|mjs))?$/i.test(path.basename(npmExecPath));

const corepackScript = path.join(path.dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js");
const corepackHome = path.join(rootDir, ".corepack");

const runner =
  isCurrentRunnerPnpm && existsSync(npmExecPath)
    ? {
        name: "pnpm (reused from current command)",
        command: process.execPath,
        prefixArgs: [npmExecPath],
        env: {},
        requiresBootstrap: false,
      }
    : {
        name: "corepack pnpm",
        command: process.execPath,
        prefixArgs: [corepackScript, "pnpm"],
        env: {
          COREPACK_HOME: corepackHome,
          COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        },
        requiresBootstrap: true,
      };

if (!isCurrentRunnerPnpm) {
  if (!existsSync(corepackScript)) {
    console.error(
      `[run-local] Could not find pnpm runner. Tried npm_execpath="${npmExecPath || "(empty)"}" and corepack at ${corepackScript}.`,
    );
    process.exit(1);
  }
  mkdirSync(corepackHome, { recursive: true });
}

const sharedEnv = { ...process.env, ...runner.env };

const withPnpm = (...args) => [...runner.prefixArgs, ...args];

const baseTargets =
  mode === "dev"
    ? [
        {
          name: "web",
          command: runner.command,
          args: withPnpm("--filter", "@contrix/web", "dev"),
          cwd: rootDir,
        },
        {
          name: "server",
          command: runner.command,
          args: withPnpm("--filter", "@contrix/server", "dev"),
          cwd: rootDir,
        },
      ]
    : [
        {
          name: "web",
          command: runner.command,
          args: withPnpm("--filter", "@contrix/web", "preview"),
          cwd: rootDir,
        },
        {
          name: "server",
          command: runner.command,
          args: withPnpm("--filter", "@contrix/server", "start"),
          cwd: rootDir,
        },
      ];

const targets = silentMode
  ? baseTargets
      .filter((target) => target.name === "server")
      .map((target) => ({
        ...target,
        env: {
          ...(target.env ?? {}),
          CONTRIX_SILENT_MODE: "1",
        },
      }))
  : baseTargets;

const children = new Map();
let shuttingDown = false;
let requestedExitCode = 0;

const log = (message) => {
  console.log(`[run-local] ${message}`);
};

const waitForExit = (child, timeoutMs) =>
  new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(true);
      return;
    }

    const onExit = () => {
      clearTimeout(timer);
      child.off("exit", onExit);
      resolve(true);
    };

    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);

    child.once("exit", onExit);
  });

const killProcessTree = (pid) =>
  new Promise((resolve) => {
    if (!pid || process.platform !== "win32") {
      resolve();
      return;
    }

    const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
    });
    killer.once("exit", () => resolve());
    killer.once("error", () => resolve());
  });

const stopChild = async (name, child) => {
  if (!child || child.exitCode !== null) {
    return;
  }

  log(`Stopping ${name}...`);
  child.kill("SIGINT");
  const exited = await waitForExit(child, 3000);
  if (exited) {
    return;
  }

  if (process.platform === "win32") {
    await killProcessTree(child.pid);
    return;
  }

  child.kill("SIGTERM");
  const terminated = await waitForExit(child, 1500);
  if (!terminated) {
    child.kill("SIGKILL");
  }
};

const shutdown = async (reason) => {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (reason) {
    log(reason);
  }

  const activeChildren = [...children.entries()]
    .map(([name, child]) => ({ name, child }))
    .filter(({ child }) => child.exitCode === null);

  await Promise.all(activeChildren.map(({ name, child }) => stopChild(name, child)));
  process.exit(requestedExitCode);
};

const spawnTarget = (target) => {
  const child = spawn(target.command, target.args, {
    cwd: target.cwd,
    stdio: "inherit",
    env: { ...sharedEnv, ...(target.env ?? {}) },
  });

  children.set(target.name, child);

  child.once("error", (error) => {
    console.error(`[run-local] Failed to start "${target.name}": ${error.message}`);
    if (!shuttingDown) {
      requestedExitCode = 1;
      void shutdown(`Could not start ${target.name}.`);
    }
  });

  child.once("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const reason =
      code !== null
        ? `"${target.name}" exited with code ${code}.`
        : `"${target.name}" exited with signal ${signal ?? "unknown"}.`;
    requestedExitCode = code ?? (signal ? 1 : 0);
    void shutdown(reason);
  });
};

const prepareRunnerIfNeeded = async () => {
  if (!runner.requiresBootstrap) {
    return;
  }

  log("Preparing pnpm runtime for first launch...");
  await new Promise((resolve, reject) => {
    const bootstrap = spawn(runner.command, withPnpm("--version"), {
      cwd: rootDir,
      stdio: "inherit",
      env: sharedEnv,
    });

    bootstrap.once("error", reject);
    bootstrap.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`pnpm bootstrap failed with exit code ${code ?? "unknown"}`));
    });
  });
};

process.on("SIGINT", () => {
  requestedExitCode = 0;
  void shutdown("Received Ctrl+C. Shutting down all services...");
});

process.on("SIGTERM", () => {
  requestedExitCode = 0;
  void shutdown("Received SIGTERM. Shutting down all services...");
});

log(
  `Starting in "${mode}" mode using ${runner.name}${silentMode ? " with Silent Mode enabled" : ""}...`,
);
if (silentMode) {
  log("Silent Mode active: starting server only (web UI will not be launched).");
}
try {
  await prepareRunnerIfNeeded();
  targets.forEach(spawnTarget);
} catch (error) {
  console.error(
    `[run-local] Failed to prepare startup tooling: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
}
