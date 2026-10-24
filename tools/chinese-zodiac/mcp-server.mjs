#!/usr/bin/env node
// A minimal MCP server over stdio for the Chinese zodiac tools. It speaks
// JSON-RPC 2.0, one message per line, and implements initialize, ping,
// tools/list and tools/call. It reads stdin and writes protocol messages to
// stdout only; it makes no network requests and writes no files.
import { createInterface } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { callTool, listTools } from './mcp-tools.mjs';

export const SERVER_INFO = Object.freeze({ name: 'zodiacs-chinese-zodiac', version: '0.0.0' });
export const PROTOCOL_VERSIONS = Object.freeze(['2025-06-18', '2025-03-26', '2024-11-05']);
const INSTRUCTIONS = 'Chinese zodiac calendar data. Call chinese_zodiac_sign with a birth date (and time and UTC offset when known) for the animal, element and yin or yang; the year starts at Li Chun. When the result is "depends", report both candidates or ask for the missing time or offset; do not pick one. Call chinese_zodiac_relation for the traditional groupings two animals share. Results are calendar facts and a traditional classification, not readings.';

const MAX_LINE_BYTES = 65_536;
const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });
const result = (id, value) => ({ jsonrpc: '2.0', id, result: value });

/** Handle one parsed JSON-RPC message. Returns the response object, or null for a notification. */
export function handleMessage(message) {
  if (message === null || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    const id = message && typeof message === 'object' && (typeof message.id === 'string' || typeof message.id === 'number') ? message.id : null;
    return error(id, -32600, 'Invalid request');
  }
  const isNotification = !('id' in message);
  const { id, method, params } = message;
  if (isNotification) return null;
  switch (method) {
    case 'initialize': {
      const requested = params?.protocolVersion;
      const protocolVersion = PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0];
      return result(id, { protocolVersion, capabilities: { tools: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
    }
    case 'ping':
      return result(id, {});
    case 'tools/list':
      return result(id, { tools: listTools() });
    case 'tools/call': {
      if (params === null || typeof params !== 'object' || typeof params.name !== 'string') return error(id, -32602, 'tools/call needs a tool name');
      const outcome = callTool(params.name, params.arguments ?? {});
      return outcome === null ? error(id, -32602, 'Unknown tool') : result(id, outcome);
    }
    default:
      return error(id, -32601, 'Method not found');
  }
}

/** Serve on the given streams until input ends. */
export function serve(input = process.stdin, output = process.stdout) {
  const lines = createInterface({ input, crlfDelay: Infinity });
  const send = (message) => { if (message) output.write(JSON.stringify(message) + '\n'); };
  lines.on('line', (line) => {
    if (line.trim() === '') return;
    if (Buffer.byteLength(line) > MAX_LINE_BYTES) return send(error(null, -32600, 'Message too large'));
    let message;
    try { message = JSON.parse(line); } catch { return send(error(null, -32700, 'Parse error')); }
    try { send(handleMessage(message)); } catch {
      send(error(message && typeof message === 'object' && 'id' in message ? message.id : null, -32603, 'Internal error'));
    }
  });
  return lines;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) serve();
