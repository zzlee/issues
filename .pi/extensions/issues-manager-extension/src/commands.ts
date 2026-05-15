import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { IssueService, IssueIndex } from "./issue-service";
import path from "node:path";

export async function registerCommands(ctx: ExtensionCommandContext, issueService: IssueService) {
  // /issues:list
  ctx.registerCommand("issues:list", {
    description: "List all issues in a TUI-like format",
    handler: async (args, ctx) => {
      const index = await issueService.getIndex();
      if (index.length === 0) {
        ctx.ui.notify("No issues found.", "info");
        return;
      }

      const options = index.map(i => `${i.id} - ${i.t} [${i.s}]`);
      const selected = await ctx.ui.select("Select an issue to view details or exit:", options);
      
      if (selected) {
        const id = selected.split(' - ')[0];
        const issue = await issueService.getIssueFile(id);
        if (issue) {
          ctx.ui.notify(`Issue #${id}: ${issue.title}\nStatus: ${issue.status}\nPriority: ${issue.priority}\nProject: ${issue.project}`, "info");
        }
      }
    }
  });

  // /issues:new
  ctx.registerCommand("issues:new", {
    description: "Create a new issue via a wizard",
    handler: async (args, ctx) => {
      const title = await ctx.ui.input("Issue Title:");
      if (!title) return;

      const priority = await ctx.ui.select("Priority:", ["H", "M", "L"]);
      if (!priority) return;

      const project = await ctx.ui.input("Project Name:");
      if (!project) return;

      const status = "open";

      const index = await issueService.getIndex();
      const newId = (index.length > 0 ? parseInt(index[index.length - 1].id) + 1 : 1).toString().padStart(3, '0');

      const newIssue: IssueIndex = {
        id: newId,
        t: title,
        s: status,
        p: priority,
        pj: project
      };

      const newIssueFile: any = {
        title,
        status,
        priority,
        project
      };

      await issueService.saveIssueFile(newId, newIssueFile);
      index.push(newIssue);
      await issueService.updateIndex(index);
      await issueService.updateIssuesList(index);

      ctx.ui.notify(`Created issue #${newId}`, "success");
    }
  });

  // /issues:status
  ctx.registerCommand("issues:status", {
    description: "Show current issues status in a widget",
    handler: async (args, ctx) => {
      const index = await issueService.getIndex();
      const openCount = index.filter(i => i.s === "open" || i.s === "in_progress").length;
      const totalCount = index.length;
      ctx.ui.setWidget("issues", [`Open: ${openCount}`, `Total: ${totalCount}`]);
      ctx.ui.notify(`Status widget updated`, "info");
    }
  });

  // /issues:archive
  ctx.registerCommand("issues:archive", {
    description: "Archive an issue",
    handler: async (args, ctx) => {
      const id = args || await ctx.ui.input("Issue ID to archive:");
      if (!id) return;

      const ok = await ctx.ui.confirm("Are you sure you want to archive issue #" + id + "?", "Warning");
      if (!ok) return;

      const index = await issueService.getIndex();
      const foundIdx = index.findIndex(i => i.id === id);

      if (foundIdx === -1) {
        ctx.ui.notify(`Issue #${id} not found.`, "error");
        return;
      }

      await issueService.deleteIssueFile(id);
      index.splice(foundIdx, 1);
      await issueService.updateIndex(index);
      await issueService.updateIssuesList(index);

      ctx.ui.notify(`Archived issue #${id}`, "info");
    }
  });
}
