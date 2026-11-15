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

// Three phases per run (issue #52): same tools and guards in each, each one short, all before the data guard.
describe('Scout workflow phases', () => {
  const phases = steps.filter((s) =>
    s.uses?.startsWith('anthropics/claude-code-action'),
  ) as (Step & {
    id: string;
    'continue-on-error'?: boolean;
  })[];
  const allowed = (s: Step) => /--allowedTools "([^"]*)"/.exec(s.with?.claude_args ?? '')?.[1];

  it('runs the agent three times, phase 1 to 3, with the same allowed tools', () => {
    expect(phases.map((p) => p.id)).toEqual(['phase1', 'phase2', 'phase3']);
    phases.forEach((p, i) => expect(p.with?.prompt).toContain(`phase ${i + 1} of 3`));
    expect(new Set(phases.map(allowed)).size).toBe(1);
    for (const p of phases)
      expect(p.env?.DEVPOST_MCP_TOKEN).toBe('${{ secrets.DEVPOST_MCP_TOKEN }}');
  });

  it('keeps each phase short and lets the next phase run when one fails', () => {
    for (const p of phases) {
      expect(p.with?.claude_args).toMatch(/--max-turns 80\b/);
      expect(p['continue-on-error']).toBe(true);
    }
  });

  it('checks the data only after the last phase', () => {
    const names = steps.map((s) => s.name ?? '');
    const guard = names.findIndex((n) => n.startsWith('Only data/ changed'));
    const last = names.findIndex((n) => n.includes('phase 3 of 3'));
    expect(last).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(last);
  });
});

// Test runs (dry): never a data PR, and always dry off main, so nothing from a branch can reach main.
describe('Scout workflow test runs', () => {
  const wf = parse(readFileSync('.github/workflows/scout.yml', 'utf8'));
  const open = steps.find((s) => s.name?.startsWith('Skip if an earlier data PR')) as Step & {
    run: string;
  };
  const pr = steps.find((s) => s.name === 'Open the data PR') as Step & { if: string };

  it('offers a dry_run input that defaults to off', () => {
    expect(wf.on.workflow_dispatch.inputs.dry_run).toMatchObject({
      type: 'boolean',
      default: false,
    });
  });

  it('is dry when asked and whenever the run is not on main', () => {
    expect(open.env?.DRY).toBe("${{ inputs.dry_run == true || github.ref != 'refs/heads/main' }}");
    expect(open.run).toContain('echo "dry=$DRY"');
  });

  it('never opens a data PR in a dry run', () => {
    expect(pr.if).toContain("steps.open.outputs.dry != 'true'");
  });
});

// The agent gets only this run's read-only GitHub token: no Claude App token exchange, no write access.
describe('Scout workflow GitHub access', () => {
  const wf = parse(readFileSync('.github/workflows/scout.yml', 'utf8'));
  it('gives every phase the read-only run token and asks for no id-token or write permission', () => {
    const phases = steps.filter((s) => s.uses?.startsWith('anthropics/claude-code-action'));
    for (const p of phases) expect(p.with?.github_token).toBe('${{ github.token }}');
    expect(wf.jobs.scout.permissions).toEqual({
      contents: 'read',
      'pull-requests': 'read',
      issues: 'read',
    });
  });
});

describe('Scout workflow data guard', () => {
  const guard = steps.find((s) => s.name?.startsWith('Only data/ changed')) as Step & {
    run: string;
  };
  it('removes only new files the agent emptied, before validating', () => {
    expect(guard.run).toContain('git ls-files --others --exclude-standard -z -- data');
    expect(guard.run.indexOf('rm -- "$f"')).toBeLessThan(guard.run.indexOf('npm run data:check'));
    expect(guard.run).not.toMatch(/git rm|rm -r|rm -rf/);
  });
});
