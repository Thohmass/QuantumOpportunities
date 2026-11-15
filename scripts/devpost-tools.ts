// Scout pre-step (issue #46): asks Devpost's MCP server which tools it has, allows only the read-only ones, and
// adds the server to the agent's MCP config. Without a token, or on any error, the Scout runs without Devpost.
// Usage: tsx scripts/devpost-tools.ts <mcp.json>   (writes `allowed=` to $GITHUB_OUTPUT)
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { allowedToolsArg, parseRpc, readOnlyTools, withDevpost } from './lib/devpost.ts';

const URL = 'https://devpost.com/mcp';
const configPath = process.argv[2];
const token = process.env.DEVPOST_MCP_TOKEN ?? '';

function output(allowed: string) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `allowed=${allowed}\n`);
}

async function rpc(id: number | undefined, method: string, params: object, session?: string) {
  const res = await fetch(URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...(session ? { 'mcp-session-id': session } : {}),
    },
    body: JSON.stringify({ jsonrpc: '2.0', ...(id === undefined ? {} : { id }), method, params }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok && res.status !== 202) throw new Error(`${method}: HTTP ${res.status}`);
  return { session: res.headers.get('mcp-session-id') ?? session, body: await res.text() };
}

async function main() {
  if (!configPath) throw new Error('usage: devpost-tools.ts <mcp.json>');
  if (!token) {
    console.log('Devpost: no DEVPOST_MCP_TOKEN secret, skipped.');
    return output('');
  }
  const init = await rpc(1, 'initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'quantum-opportunities-scout', version: '1.0' },
  });
  if (!parseRpc(init.body, 1)?.result) throw new Error('initialize: no result');
  await rpc(undefined, 'notifications/initialized', {}, init.session ?? undefined);
  const list = await rpc(2, 'tools/list', {}, init.session ?? undefined);
  const tools =
    (parseRpc(list.body, 2)?.result as { tools?: { name: string }[] } | undefined)?.tools ?? [];
  const names = tools.map((t) => t.name);
  const allowed = readOnlyTools(names);
  console.log(`Devpost tools (${names.length}): ${names.join(', ')}`);
  console.log(`Allowed for the Scout (${allowed.length}): ${allowed.join(', ') || 'none'}`);
  if (allowed.length === 0) return output('');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  writeFileSync(configPath, JSON.stringify(withDevpost(config), null, 2));
  output(allowedToolsArg(allowed));
}

main().catch((err: Error) => {
  console.log(`Devpost: ${err.message}. The Scout runs without Devpost.`);
  output('');
});
