// Devpost's official MCP server for the Scout (issue #46): which tools the agent may call, and how to read the
// server's replies. The read-only token is the first lock; this name filter is the second.

const READ_VERB = /^(search|get|list)$/;
const WRITE_STEMS = [
  'submit',
  'regist',
  'creat',
  'updat',
  'delet',
  'remov',
  'send',
  'join',
  'invit',
  'vote',
  'messag',
  'edit',
  'upload',
  'follow',
  'publish',
  'set',
];

/** search_hackathons → [search, hackathons]; getHackathonOverview → [get, hackathon, overview]. */
function words(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s_-]+/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}
const SAFE_NAME = /^[A-Za-z0-9_-]{1,64}$/;

/** Tool names the Scout may call: read verbs only, nothing that sounds like a write, plain characters only. */
export function readOnlyTools(names: string[]): string[] {
  return [...new Set(names)]
    .filter(
      (n) =>
        SAFE_NAME.test(n) &&
        READ_VERB.test(words(n)[0] ?? '') &&
        !words(n).some((w) => WRITE_STEMS.some((s) => w.startsWith(s))),
    )
    .sort();
}

/** The `--allowedTools` entries for the devpost MCP server, each followed by a comma (or "" when none). */
export function allowedToolsArg(tools: string[]): string {
  return tools.map((t) => `mcp__devpost__${t},`).join('');
}

/** An MCP reply over Streamable HTTP is either plain JSON or server-sent events with `data:` lines. */
export function parseRpc(
  body: string,
  id: number,
): { result?: unknown; error?: unknown } | undefined {
  const candidates = body.trimStart().startsWith('{')
    ? [body]
    : body
        .split(/\r?\n/)
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trim());
  for (const c of candidates) {
    try {
      const msg = JSON.parse(c) as { id?: number; result?: unknown; error?: unknown };
      if (msg.id === id) return msg;
    } catch {
      /* not JSON: skip */
    }
  }
  return undefined;
}

/** Adds the devpost server to an MCP config. The header keeps a placeholder: Claude Code fills it from the
 * environment at start, so the token never appears in a file the agent could read. */
export function withDevpost(config: { mcpServers?: Record<string, unknown> }): {
  mcpServers: Record<string, unknown>;
} {
  return {
    ...config,
    mcpServers: {
      ...config.mcpServers,
      devpost: {
        type: 'http',
        url: 'https://devpost.com/mcp',
        headers: { Authorization: 'Bearer ${DEVPOST_MCP_TOKEN}' },
      },
    },
  };
}
