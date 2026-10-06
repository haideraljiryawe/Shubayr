import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Global teardown for the live suite: keep the API's log next to the test
 * report (test-results/api.log), so a failure can still be explained after
 * the stack — and its database — is torn down.
 *
 *   LIVE_API_LOG_FILE=<path>      copy that file (CI: the API's nohup log)
 *   LIVE_API_CONTAINER=<name>     save `docker logs <name>` (a local stack)
 *
 * Neither set: nothing is saved. A failure to save never fails the run.
 */
export default function saveApiLog(): void {
  const file = process.env.LIVE_API_LOG_FILE;
  const container = process.env.LIVE_API_CONTAINER;
  if (!file && !container) return;
  const directory = join(__dirname, "..", "test-results");
  const target = join(directory, "api.log");
  try {
    mkdirSync(directory, { recursive: true });
    if (file) {
      if (!existsSync(file)) throw new Error(`${file} does not exist`);
      copyFileSync(file, target);
    } else {
      const logs = spawnSync("docker", ["logs", container!], { encoding: "utf8", maxBuffer: 512 * 1024 * 1024 });
      if (logs.status !== 0) throw new Error(logs.stderr || `docker logs ${container} failed`);
      writeFileSync(target, `${logs.stdout}${logs.stderr}`);
    }
    console.log(`API log saved: ${target}`);
  } catch (error) {
    console.warn(`API log not saved: ${error instanceof Error ? error.message : String(error)}`);
  }
}
