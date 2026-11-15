import { describe, expect, it } from 'vitest';
import { allowedToolsArg, parseRpc, readOnlyTools, withDevpost } from './devpost.ts';

describe('readOnlyTools', () => {
  it('keeps search, get and list tools in either naming style', () => {
    expect(
      readOnlyTools([
        'search_hackathons',
        'getHackathonOverview',
        'list_my_hackathons',
        'get_devpost_project',
      ]),
    ).toEqual([
      'getHackathonOverview',
      'get_devpost_project',
      'list_my_hackathons',
      'search_hackathons',
    ]);
  });

  it('drops every tool that writes or does not start with a read verb', () => {
    expect(
      readOnlyTools([
        'register_for_hackathon',
        'submit_project',
        'create_team',
        'get_and_join_team',
        'list_then_send_message',
        'searchAndVote',
        'update_profile',
        'hackathon_search',
        'set_status',
      ]),
    ).toEqual([]);
  });

  it('refuses names that could break out of the command line', () => {
    expect(
      readOnlyTools(['search_x" --dangerously-skip-permissions', 'get x', 'list;rm', 'search_ok']),
    ).toEqual(['search_ok']);
  });
});

describe('allowedToolsArg', () => {
  it('prefixes each tool with the server name and ends with a comma', () => {
    expect(allowedToolsArg(['get_a', 'search_b'])).toBe(
      'mcp__devpost__get_a,mcp__devpost__search_b,',
    );
    expect(allowedToolsArg([])).toBe('');
  });
});

describe('parseRpc', () => {
  it('reads plain JSON and server-sent events', () => {
    expect(parseRpc('{"jsonrpc":"2.0","id":2,"result":{"tools":[]}}', 2)).toMatchObject({
      result: { tools: [] },
    });
    const sse = 'event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{"ok":true}}\n\n';
    expect(parseRpc(sse, 1)).toMatchObject({ result: { ok: true } });
    expect(parseRpc('data: not json', 1)).toBeUndefined();
  });
});

describe('withDevpost', () => {
  it('adds the server next to the browser, with a placeholder instead of the token', () => {
    const cfg = withDevpost({ mcpServers: { playwright: { command: 'node' } } });
    expect(Object.keys(cfg.mcpServers)).toEqual(['playwright', 'devpost']);
    expect(JSON.stringify(cfg)).toContain('"Authorization":"Bearer ${DEVPOST_MCP_TOKEN}"');
  });
});
