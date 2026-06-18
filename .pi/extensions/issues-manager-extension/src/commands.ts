import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { matchesKey, visibleWidth } from "@earendil-works/pi-tui";
import { IssueService, IssueIndex, formatProjects, normalizeProjects } from "./issue-service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function padRight(s: string, len: number): string {
  return s + " ".repeat(Math.max(0, len - visibleWidth(s)));
}

function padLeft(s: string, len: number): string {
  return " ".repeat(Math.max(0, len - visibleWidth(s))) + s;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "");
}

/** Limit a string to `max` visible columns, appending "…" when truncated. */
function truncate(s: string, max: number): string {
  return visibleWidth(s) > max ? s.slice(0, Math.max(0, max - 1)) + "…" : s;
}

// ---------------------------------------------------------------------------
// Interactive table component
// ---------------------------------------------------------------------------

class IssueTableComponent {
  private issues: IssueIndex[];
  private selectedIndex: number;
  private tui: { requestRender: () => void };
  private done: (result: string | undefined) => void;
  private theme: any;
  private cachedLines: string[] = [];
  private version: number = 0;
  private cachedVersion: number = -1;

  constructor(
    tui: { requestRender: () => void },
    theme: any,
    issues: IssueIndex[],
    done: (result: string | undefined) => void,
  ) {
    this.tui = tui;
    this.theme = theme;
    this.issues = issues;
    this.selectedIndex = 0;
    this.done = done;
  }

  render(width: number): string[] {
    if (this.cachedVersion === this.version) return this.cachedLines;
    this.cachedVersion = this.version;

    const lines: string[] = [];

    // Column widths (right-aligned: ID, Pri; left-aligned: Title, Status, Projects)
    const idW = 5;
    const statusW = 12;
    const priW = 5;
    const projW = Math.max(10, Math.min(30, Math.floor(width * 0.22)));
    const titleW = Math.max(10, width - idW - statusW - priW - projW - 12);

    // Title
    lines.push(this.theme.bold(this.theme.fg("accent", "Issues List")));
    lines.push("");

    // Header row
    const header =
      padRight("ID", idW) +
      " │ " +
      padRight("Title", titleW) +
      " │ " +
      padRight("Status", statusW) +
      " │ " +
      padRight("Pri", priW) +
      " │ " +
      padRight("Projects", projW);
    lines.push(this.theme.bold(this.theme.fg("accent", header)));

    // Separator
    lines.push(this.theme.fg("dim", "─".repeat(visibleWidth(header))));

    // Issue rows
    for (let i = 0; i < this.issues.length; i++) {
      const issue = this.issues[i];
      const isSelected = i === this.selectedIndex;
      const projects = Array.isArray(issue.pj) ? issue.pj.join(", ") : String(issue.pj ?? "");

      const title = truncate(issue.t, titleW);
      const proj = truncate(projects, projW);

      const row =
        padLeft(issue.id, idW) +
        " │ " +
        padRight(title, titleW) +
        " │ " +
        padRight(issue.s, statusW) +
        " │ " +
        padLeft(issue.p, priW) +
        " │ " +
        padRight(proj, projW);

      lines.push(isSelected ? this.theme.fg("warning", row) : row);
    }

    // Footer hints
    lines.push("");
    lines.push(this.theme.fg("muted", "↑↓ navigate · Enter view details · Esc / q exit"));

    this.cachedLines = lines;
    return lines;
  }

  handleInput(data: string): void {
    if (matchesKey(data, "down") || matchesKey(data, "j")) {
      if (this.selectedIndex < this.issues.length - 1) {
        this.selectedIndex++;
        this.version++;
        this.tui.requestRender();
      }
    } else if (matchesKey(data, "up") || matchesKey(data, "k")) {
      if (this.selectedIndex > 0) {
        this.selectedIndex--;
        this.version++;
        this.tui.requestRender();
      }
    } else if (matchesKey(data, "enter") || matchesKey(data, "return")) {
      this.done(this.issues[this.selectedIndex].id);
    } else if (matchesKey(data, "escape") || matchesKey(data, "q")) {
      this.done(undefined);
    }
  }

  invalidate(): void {
    this.cachedVersion = -1;
  }
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export async function registerCommands(pi: ExtensionAPI, issueService: IssueService) {
  // /issues:list
  pi.registerCommand("issues:list", {
    description: "Display all issues in an interactive table",
    handler: async (_args, ctx) => {
      const index = await issueService.getIndex();
      if (index.length === 0) {
        ctx.ui.notify("No issues found.", "info");
        return;
      }

      const selectedId = await ctx.ui.custom<string | undefined>(
        (tui, theme, _kb, done) => {
          const table = new IssueTableComponent(tui, theme, index, done);

          return {
            render: (w: number) => {
              const innerW = Math.max(1, w - 2);
              const topBorder = theme.fg("accent", "┌" + "─".repeat(innerW) + "┐");
              const bottomBorder = theme.fg("accent", "└" + "─".repeat(innerW) + "┘");
              const innerLines = table.render(innerW);
              const borderedLines = innerLines.map((line) => {
                const pad = Math.max(0, innerW - visibleWidth(line));
                return theme.fg("accent", "│") + line + " ".repeat(pad) + theme.fg("accent", "│");
              });
              return [topBorder, ...borderedLines, bottomBorder];
            },
            invalidate: () => { table.invalidate(); },
            handleInput: (data: string) => { table.handleInput(data); tui.requestRender(); },
          };
        },
        {
          overlay: true,
          overlayOptions: {
            maxHeight: "80%",
            anchor: "center",
            width: "95%",
            minWidth: 60,
          },
        },
      );

      if (selectedId) {
        const issue = await issueService.getIssueFile(selectedId);
        if (issue) {
          const projects = Array.isArray(issue.projects) ? issue.projects.join(", ") : issue.projects || "";
          ctx.ui.notify(
            `Issue #${selectedId}: ${issue.title}\nStatus: ${issue.status}\nPriority: ${issue.priority}\nProjects: ${projects}`,
            "info",
          );
        }
      }
    },
  });

  // /issues:new
  pi.registerCommand("issues:new", {
    description: "Create a new issue via a wizard",
    handler: async (_args, ctx) => {
      const title = await ctx.ui.input("Issue Title:");
      if (!title) return;

      const priority = await ctx.ui.select("Priority:", ["H", "M", "L"]);
      if (!priority) return;

      const projectInput = await ctx.ui.input("Project Names (comma-separated):");
      if (!projectInput) return;
      const projects = normalizeProjects(projectInput);

      const status = "open";

      const index = await issueService.getIndex();
      const newId = (index.length > 0 ? parseInt(index[index.length - 1].id) + 1 : 1).toString().padStart(3, "0");

      const newIssue: IssueIndex = {
        id: newId,
        t: title,
        s: status,
        p: priority,
        pj: projects,
      };

      const newIssueFile: any = {
        title,
        status,
        priority,
        projects,
      };

      await issueService.saveIssueFile(newId, newIssueFile);
      index.push(newIssue);
      await issueService.updateIndex(index);
      await issueService.updateIssuesList(index);

      ctx.ui.notify(`Created issue #${newId}`, "success");
    },
  });

  // /issues:projects
  pi.registerCommand("issues:projects", {
    description: "Assign one or more projects to an issue",
    handler: async (args, ctx) => {
      const trimmedArgs = args.trim();
      const argMatch = trimmedArgs.match(/^(\S+)\s+([\s\S]+)$/);
      const id = argMatch?.[1] || trimmedArgs || (await ctx.ui.input("Issue ID:"));
      if (!id) return;

      const projectInput = argMatch?.[2] || (await ctx.ui.input("Project Names (comma-separated):"));
      if (!projectInput) return;
      const projects = normalizeProjects(projectInput);

      const issue = await issueService.getIssueFile(id);
      if (!issue) {
        ctx.ui.notify(`Issue #${id} not found.`, "error");
        return;
      }

      issue.projects = projects;
      await issueService.saveIssueFile(id, issue);

      const index = await issueService.getIndex();
      const idx = index.findIndex((i) => i.id === id);
      if (idx !== -1) {
        index[idx].pj = projects;
        await issueService.updateIndex(index);
        await issueService.updateIssuesList(index);
      }

      ctx.ui.notify(`Updated issue #${id} projects: ${formatProjects(projects)}`, "success");
    },
  });

  // /issues:status
  pi.registerCommand("issues:status", {
    description: "Show current issues status in a widget",
    handler: async (_args, ctx) => {
      const index = await issueService.getIndex();
      const openCount = index.filter((i) => i.s === "open" || i.s === "in_progress").length;
      const totalCount = index.length;
      ctx.ui.setWidget("issues", [`Open: ${openCount}`, `Total: ${totalCount}`]);
      ctx.ui.notify("Status widget updated", "info");
    },
  });

  // /issues:archive
  pi.registerCommand("issues:archive", {
    description: "Archive an issue",
    handler: async (args, ctx) => {
      const id = args || (await ctx.ui.input("Issue ID to archive:"));
      if (!id) return;

      const ok = await ctx.ui.confirm("Are you sure you want to archive issue #" + id + "?", "Warning");
      if (!ok) return;

      const index = await issueService.getIndex();
      const foundIdx = index.findIndex((i) => i.id === id);

      if (foundIdx === -1) {
        ctx.ui.notify(`Issue #${id} not found.`, "error");
        return;
      }

      await issueService.deleteIssueFile(id);
      index.splice(foundIdx, 1);
      await issueService.updateIndex(index);
      await issueService.updateIssuesList(index);

      ctx.ui.notify(`Archived issue #${id}`, "info");
    },
  });
}
