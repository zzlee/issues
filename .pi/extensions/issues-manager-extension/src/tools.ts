import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { IssueService, IssueIndex } from "./issue-service";

export async function registerTools(pi: ExtensionAPI, issueService: IssueService) {
  pi.registerTool({
    name: "create_issue",
    label: "Create Issue",
    description: "Create a new issue in the tracker",
    parameters: Type.Object({
      title: Type.String({ description: "The title of the issue" }),
      priority: Type.String({ description: "Priority: H, M, or L", enum: ["H", "M", "L"] }),
      project: Type.String({ description: "The project title" }),
    }),
    async execute(_toolCallId, params) {
      const index = await issueService.getIndex();
      const newId = (index.length > 0 ? parseInt(index[index.length - 1].id) + 1 : 1).toString().padStart(3, '0');

      const newIssue: IssueIndex = {
        id: newId,
        t: params.title,
        s: "open",
        p: params.priority,
        pj: params.project
      };

      const newIssueFile: any = {
        title: params.title,
        status: "open",
        priority: params.priority,
        project: params.project
      };

      await issueService.saveIssueFile(newId, newIssueFile);
      index.push(newIssue);
      await issueService.updateIndex(index);
      await issueService.updateIssuesList(index);

      return {
        content: [{ type: "text", text: `Successfully created issue #${newId}: ${params.title}` }],
      };
    },
  });

  pi.registerTool({
    name: "update_issue_status",
    label: "Update Issue Status",
    description: "Update the status of an existing issue (e.g., to 'closed')",
    parameters: Type.Object({
      id: Type.String({ description: "The issue ID" }),
      status: Type.String({ description: "The new status" }),
    }),
    async execute(_toolCallId, params) {
      const issue = await issueService.getIssueFile(params.id);
      if (!issue) {
        return {
          content: [{ type: "text", text: `Issue #${params.id} not found.` }],
          isError: true,
        };
      }

      issue.status = params.status;
      await issueService.saveIssueFile(params.id, issue);

      const index = await issueService.getIndex();
      const idx = index.findIndex(i => i.id === params.id);
      if (idx !== -1) {
        index[idx].s = params.status;
        await issueService.updateIndex(index);
        await issueService.updateIssuesList(index);
      }

      return {
        content: [{ type: "text", text: `Updated issue #${params.id} status to ${params.status}` }],
      };
    },
  });

  pi.registerTool({
    name: "list_issues",
    label: "List Issues",
    description: "Get a list of all current issues",
    parameters: Type.Object({}),
    async execute() {
      const index = await issueService.getIndex();
      const list = index.map(i => `${i.id}: ${i.t} [${i.s}] [${i.p}] [${i.pj}]`).join('\n');
      return {
        content: [{ type: "text", text: list || "No issues found." }],
      };
    },
  });

  pi.registerTool({
    name: "get_issue",
    label: "Get Issue Details",
    description: "Get full details of a specific issue",
    parameters: Type.Object({
      id: Type.String({ description: "The issue ID" }),
    }),
    async execute(_toolCallId, params) {
      const issue = await issueService.getIssueFile(params.id);
      if (!issue) {
        return {
          content: [{ type: "text", text: `Issue #${params.id} not found.` }],
          isError: true,
        };
      }

      const details = `Title: ${issue.title}\nStatus: ${issue.status}\nPriority: ${issue.priority}\nProject: ${issue.project}`;
      return {
        content: [{ type: "text", text: details }],
      };
    },
  });
}
