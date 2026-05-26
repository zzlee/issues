import fs from 'node:fs/promises';
import path from 'node:path';

export type ProjectField = string | string[];

export interface IssueIndex {
  id: string;
  t: string;
  s: string;
  p: string;
  pj: ProjectField;
}

export interface IssueFile {
  title: string;
  status: string;
  priority: string;
  projects: string[];
  /** Backward-compatible alias for older callers/frontmatter. */
  project?: string;
  created_at?: string;
  description?: string;
  comments?: string[];
  rawContent?: string;
}

export function normalizeProjects(input?: ProjectField | null): string[] {
  const values = Array.isArray(input) ? input : [input];
  const projects = values.flatMap((value) => {
    if (!value) return [];
    const normalized = value.trim().replace(/^\[(.*)\]$/, '$1');
    return normalized
      .split(',')
      .map((project) => project.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
  });

  return [...new Set(projects)];
}

export function formatProjects(input?: ProjectField | null): string {
  return normalizeProjects(input).join(', ');
}

export class IssueService {
  private indexFilePath: string;
  private issuesDir: string;
  private issuesListFilePath: string;

  constructor(baseDir: string) {
    this.indexFilePath = path.join(baseDir, 'data', 'index.json');
    this.issuesDir = path.join(baseDir, 'data', 'issues');
    this.issuesListFilePath = path.join(baseDir, 'data', 'issues.md');
  }

  async getIndex(): Promise<IssueIndex[]> {
    try {
      const data = await fs.readFile(this.indexFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return [];
    }
  }

  async updateIndex(index: IssueIndex[]): Promise<void> {
    await fs.writeFile(this.indexFilePath, JSON.stringify(index, null, 2) + '\n');
  }

  async getIssueFile(id: string): Promise<IssueFile | null> {
    const filePath = path.join(this.issuesDir, `${id}.md`);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return this.parseIssueFile(content);
    } catch (e) {
      return null;
    }
  }

  private parseIssueFile(content: string): IssueFile {
    const issue: Partial<IssueFile> = { rawContent: content };
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const metadata = frontMatterMatch ? frontMatterMatch[1] : content;
    const projects: string[] = [];

    for (const line of metadata.split('\n')) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
      if (!match) continue;

      const [, key, value] = match;
      const trimmed = value.trim();
      if (key === 'title') issue.title = trimmed;
      if (key === 'status') issue.status = trimmed;
      if (key === 'priority') issue.priority = trimmed;
      if (key === 'projects' || key === 'project_title' || key === 'project') {
        projects.push(...normalizeProjects(trimmed));
      }
      if (key === 'created_at') issue.created_at = trimmed;
    }

    issue.projects = normalizeProjects(projects);
    issue.project = issue.projects[0] || '';

    return issue as IssueFile;
  }

  private upsertFrontMatterValue(frontMatter: string, key: string, value: string): string {
    const line = `${key}: ${value}`;
    const regex = new RegExp(`^${key}:.*$`, 'm');
    if (regex.test(frontMatter)) {
      return frontMatter.replace(regex, line);
    }
    return `${frontMatter.replace(/\s*$/, '')}\n${line}`;
  }

  private removeFrontMatterValues(frontMatter: string, keys: string[]): string {
    const keySet = new Set(keys);
    return frontMatter
      .split('\n')
      .filter((line) => {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*):/);
        return !match || !keySet.has(match[1]);
      })
      .join('\n');
  }

  async saveIssueFile(id: string, issue: IssueFile): Promise<void> {
    const filePath = path.join(this.issuesDir, `${id}.md`);
    const projects = normalizeProjects(issue.projects?.length ? issue.projects : issue.project);
    const projectText = formatProjects(projects);
    const rawContent = issue.rawContent;

    if (rawContent?.startsWith('---\n')) {
      const updated = rawContent.replace(/^---\n([\s\S]*?)\n---/, (_match, frontMatter) => {
        let nextFrontMatter = this.removeFrontMatterValues(frontMatter, ['project', 'project_title', 'projects']);
        nextFrontMatter = this.upsertFrontMatterValue(nextFrontMatter, 'id', id);
        nextFrontMatter = this.upsertFrontMatterValue(nextFrontMatter, 'title', issue.title);
        nextFrontMatter = this.upsertFrontMatterValue(nextFrontMatter, 'status', issue.status);
        nextFrontMatter = this.upsertFrontMatterValue(nextFrontMatter, 'priority', issue.priority);
        nextFrontMatter = this.upsertFrontMatterValue(nextFrontMatter, 'projects', projectText);
        return `---\n${nextFrontMatter}\n---`;
      });
      await fs.writeFile(filePath, updated.endsWith('\n') ? updated : `${updated}\n`);
      return;
    }

    const createdAt = issue.created_at || new Date().toISOString().slice(0, 10);
    const content = `---\nid: ${id}\ntitle: ${issue.title}\nstatus: ${issue.status}\npriority: ${issue.priority}\nprojects: ${projectText}\ncreated_at: ${createdAt}\n---\n\n# ${issue.title}\n\n## Description\n${issue.description || `${issue.title} in ${projectText}`}\n`;
    await fs.writeFile(filePath, content);
  }

  async deleteIssueFile(id: string): Promise<void> {
    const filePath = path.join(this.issuesDir, `${id}.md`);
    await fs.unlink(filePath);
  }

  async updateIssuesList(issues: IssueIndex[]): Promise<void> {
    let markdown = '| ID | Title | Status | Priority | Projects |\n|---|---|---|---|---|\n';
    for (const issue of issues) {
      markdown += `| [${issue.id}](./issues/${issue.id}.md) | ${issue.t} | ${issue.s} | ${issue.p} | ${formatProjects(issue.pj)} |\n`;
    }
    await fs.writeFile(this.issuesListFilePath, markdown);
  }
}
