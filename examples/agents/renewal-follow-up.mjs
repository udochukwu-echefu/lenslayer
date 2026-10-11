import { LensLayerClient, LensLayerHttpError, PollingStoppedError } from "../../sdk/dist/index.js";
import { configurationFromEnv } from "./config.mjs";
import { createRenewalFollowUp } from "./workflow.mjs";

const controller = new AbortController();
process.once("SIGINT", () => controller.abort());
process.once("SIGTERM", () => controller.abort());

try {
  const config = configurationFromEnv();
  const client = new LensLayerClient({ baseUrl: config.baseUrl, token: config.token });
  const run = await createRenewalFollowUp(client, config, { signal: controller.signal });
  if (run.status !== "succeeded" || run.result.verified !== true) process.exitCode = 1;
} catch (error) {
  // Intentionally no exception object, environment dump, headers, or source text.
  if (controller.signal.aborted) console.error("Stopped locally. This does not cancel or roll back the server run; inspect it in the dashboard before restarting.");
  else if (error instanceof PollingStoppedError) console.error(`${error.message} Inspect run ${error.runId}; restart with the same keys and unchanged input if appropriate.`);
  else if (error instanceof LensLayerHttpError) console.error(`LensLayer HTTP ${error.status}: ${error.message}`);
  else console.error(error instanceof Error ? error.message : "The external-agent example failed.");
  process.exitCode = 1;
}
