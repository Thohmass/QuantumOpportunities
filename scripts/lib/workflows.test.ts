import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

// Guards on the Scout's browser (issue #41): a pinned version and read-only tools only.
const READ_ONLY_BROWSER_TOOLS = new Set([
  'browser_navigate',
  'browser_navigate_back',
  'browser_snapshot',
  'browser_wait_for',
  'browser_close',
]);

type Step = {
  name?: string;
  uses?: string;
  env?: Record<string, string>;
  with?: Record<string, string>;
};
const steps: Step[] = parse(readFileSync('.github/workflows/scout.yml', 'utf8')).jobs.scout.steps;

describe('Scout workflow browser', () => {
  it('installs an exact Playwright MCP version from a lockfile', () => {
    const step = steps.find((s) => s.name?.startsWith('Browser for the agent')) as Step & {
      run: string;
    };
    expect(step.run).toContain('npm ci --prefix tool/scout-browser');
    const pkg = JSON.parse(readFileSync('tool/scout-browser/package.json', 'utf8'));
    expect(pkg.dependencies['@playwright/mcp']).toMatch(/^\d+\.\d+\.\d+$/);
    const lock = JSON.parse(readFileSync('tool/scout-browser/package-lock.json', 'utf8'));
    expect(lock.packages['node_modules/@playwright/mcp'].version).toBe(
      pkg.dependencies['@playwright/mcp'],
    );
  });

  it('allows only read-only browser tools', () => {
    const agent = steps.find((s) => s.uses?.startsWith('anthropics/claude-code-action'));
    const args = agent?.with?.claude_args ?? '';
    const allowed = /--allowedTools "([^"]*)"/.exec(args)?.[1]?.split(',') ?? [];
    const browser = allowed.filter((t) => t.startsWith('mcp__playwright__'));
    expect(browser.length).toBeGreaterThan(0);
    for (const tool of browser) {
      expect(READ_ONLY_BROWSER_TOOLS.has(tool.replace('mcp__playwright__', ''))).toBe(true);
    }
    expect(allowed.some((t) => t === 'mcp__playwright' || t.endsWith('__*'))).toBe(false);
  });

  it('runs the browser headless with an in-memory profile and the sandbox on', () => {
    const run = steps.find((s) => s.name?.startsWith('Browser for the agent')) as Step & {
      run: string;
    };
    expect(run.run).toContain('"--headless"');
    expect(run.run).toContain('"--isolated"');
    expect(run.run).not.toContain('--no-sandbox');
    expect(run.run).not.toContain('--allow-unrestricted-file-access');
  });
});

// Guards on Devpost's MCP (issue #46): the token only ever travels in env, and only filtered tools are allowed.
describe('Scout workflow Devpost', () => {
  const pre = steps.find((s) => s.name?.startsWith('Devpost for the agent')) as Step & {
    run: string;
    id: string;
  };
  const agent = steps.find((s) => s.uses?.startsWith('anthropics/claude-code-action'));

  it('passes the token as an environment variable, never inside a command or a file', () => {
    expect(pre.env?.DEVPOST_MCP_TOKEN).toBe('${{ secrets.DEVPOST_MCP_TOKEN }}');
    expect(agent?.env?.DEVPOST_MCP_TOKEN).toBe('${{ secrets.DEVPOST_MCP_TOKEN }}');
    expect(pre.run).not.toContain('secrets.');
    expect(agent?.with?.claude_args).not.toContain('secrets.');
  });

  it('runs the filtering script and allows only what it outputs, plus the read-only browser', () => {
    expect(pre.run).toContain('scripts/devpost-tools.ts');
    const allowed = /--allowedTools "([^"]*)"/.exec(agent?.with?.claude_args ?? '')?.[1] ?? '';
    expect(
      allowed.startsWith(
        `\${{ steps.${pre.id}.outputs.allowed }}mcp__playwright__browser_navigate,`,
      ),
    ).toBe(true);
    expect(allowed).not.toMatch(/mcp__devpost__/);
  });

  it('runs before the agent, after the browser config it extends', () => {
    const names = steps.map((s) => s.name ?? '');
    const at = (prefix: string) => names.findIndex((n) => n.startsWith(prefix));
    expect(at('Browser for the agent')).toBeLessThan(at('Devpost for the agent'));
    expect(at('Devpost for the agent')).toBeLessThan(at('Scout agent'));
  });
});
