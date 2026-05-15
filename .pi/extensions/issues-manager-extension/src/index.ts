import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import path from "node:path";
import { IssueService } from "./issue-service";
import { registerCommands } from "./commands";
import { registerTools } from "./tools";

export default async function (pi: ExtensionAPI) {
  const baseDir = process.cwd();
  const issueService = new IssueService(baseDir);

  // Register commands for user interaction
  await registerCommands(pi, issueService);

  // Register tools for agent interaction
  await registerTools(pi, issueService);

  // Notify user extension is loaded
  // We use notify instead of confirm/select to avoid blocking startup if in non-interactive mode
  pi.on("session_start", async (event, ctx) => {
     ctx.ui.notify("Issues Manager Extension loaded", "info");
  });
}
