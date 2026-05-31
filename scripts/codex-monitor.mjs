#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import dotenv from 'dotenv';

const projectRoot = path.resolve(new URL('..', import.meta.url).pathname);
dotenv.config({ path: path.join(projectRoot, '.env.local') });
dotenv.config();

const storeDir = path.join(projectRoot, '.codex-monitor');
const sessionsFile = path.join(storeDir, 'sessions.jsonl');
const eventsFile = path.join(storeDir, 'events.jsonl');
const flushIntervalMs = 500;
const heartbeatIntervalMs = 5000;
const maxBatchSize = 25;

const usage = `Usage:
  node scripts/codex-monitor.mjs run [--name NAME] [--cwd DIR] [--session-key KEY] -- codex ...
  node scripts/codex-monitor.mjs watch --file PATH [--name NAME] [--cwd DIR] [--from-start]
  node scripts/codex-monitor.mjs classify < lines.jsonl
`;

function parseArgs(argv) {
  const [mode, ...rest] = argv;
  if (!mode || mode === '-h' || mode === '--help') {
    return { mode: 'help' };
  }

  const opts = {
    cwd: process.cwd(),
    name: undefined,
    sessionKey: undefined,
    file: undefined,
    fromStart: false,
    command: [],
  };

  let i = 0;
  while (i < rest.length) {
    const arg = rest[i];
    if (arg === '--') {
      opts.command = rest.slice(i + 1);
      break;
    }
    if (arg === '--name') {
      opts.name = rest[i + 1];
      i += 2;
      continue;
    }
    if (arg === '--cwd') {
      opts.cwd = path.resolve(rest[i + 1]);
      i += 2;
      continue;
    }
    if (arg === '--session-key') {
      opts.sessionKey = rest[i + 1];
      i += 2;
      continue;
    }
    if (arg === '--file') {
      opts.file = path.resolve(rest[i + 1]);
      i += 2;
      continue;
    }
    if (arg === '--from-start') {
      opts.fromStart = true;
      i += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return { mode, opts };
}

function appendJsonl(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, `${JSON.stringify(value)}\n`);
}

function gitValue(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  if (result.status !== 0) return undefined;
  const value = result.stdout.trim();
  return value || undefined;
}

function makeSessionKey(prefix) {
  return `${prefix}-${new Date().toISOString()}-${crypto.randomBytes(4).toString('hex')}`;
}

function textFromJson(value) {
  if (!value || typeof value !== 'object') return undefined;
  const candidates = [
    value.message,
    value.content,
    value.text,
    value.delta,
    value.summary,
    value.output,
    value.input,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }
  return undefined;
}

function compactJson(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = { ...value };
  for (const key of ['message', 'content', 'text', 'delta', 'summary', 'output', 'input']) {
    if (typeof copy[key] === 'string' && copy[key].length > 2000) {
      copy[key] = `${copy[key].slice(0, 2000)}...`;
    }
  }
  return copy;
}

function classifyJsonLine(value, fallbackChannel) {
  const type = String(value.type ?? value.event ?? value.kind ?? '').toLowerCase();
  const role = String(value.role ?? value.source ?? '').toLowerCase();
  const agentName = value.agentName ?? value.agent ?? value.subagent ?? value.name;
  const channel = value.channel ?? value.stream ?? fallbackChannel;
  const text = textFromJson(value) ?? JSON.stringify(value);

  if (type.includes('subagent') || value.subagent || value.parentAgent || value.parent_agent) {
    return {
      kind: 'subagent',
      source: 'subagent',
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  if (type.includes('tool') || role === 'tool') {
    return {
      kind: 'tool',
      source: 'tool',
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  if (type.includes('file')) {
    return {
      kind: 'file',
      source: 'codex',
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  if (type.includes('git')) {
    return {
      kind: 'git',
      source: 'codex',
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  if (type.includes('error') || role === 'error') {
    return {
      kind: 'error',
      source: 'codex',
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  if (role === 'assistant' || role === 'user') {
    return {
      kind: 'message',
      source: role,
      agentName: typeof agentName === 'string' ? agentName : undefined,
      channel,
      text,
      data: compactJson(value),
    };
  }

  return {
    kind: 'message',
    source: 'codex',
    agentName: typeof agentName === 'string' ? agentName : undefined,
    channel,
    text,
    data: compactJson(value),
  };
}

function classifyTextLine(line, channel) {
  const trimmed = line.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return classifyJsonLine(parsed, channel);
  } catch {
    // Plain terminal output falls through.
  }

  const explicitSubagentMatch = trimmed.match(
    /(?:subagent|sub-agent|agent)\s+["']?([A-Za-z0-9_.:/-]+)["']?\s*[:>-]\s*(.*)$/i,
  );
  const bracketSpeakerMatch = trimmed.match(/^\[([A-Za-z0-9_.:/-]+)\]\s*(.*)$/);
  const bracketSpeakerLooksAgentLike =
    bracketSpeakerMatch && /agent|sub|planner|reviewer|coder|worker/i.test(bracketSpeakerMatch[1]);
  const subagentMatch = explicitSubagentMatch || (bracketSpeakerLooksAgentLike && bracketSpeakerMatch);

  if (subagentMatch) {
    return {
      kind: 'subagent',
      source: 'subagent',
      agentName: subagentMatch[1],
      channel,
      text: subagentMatch[2] || trimmed,
    };
  }

  return {
    kind: channel === 'stderr' ? 'stderr' : 'stdout',
    source: 'codex',
    channel,
    text: line,
  };
}

async function startSession(opts, command) {
  const cwd = path.resolve(opts.cwd);
  const name = opts.name || command.join(' ') || `Codex watch ${opts.file}`;
  const sessionKey = opts.sessionKey || makeSessionKey('codex');
  const session = {
    id: sessionKey,
    sessionKey,
    name,
    cwd,
    command,
    status: 'starting',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    host: os.hostname(),
    branch: gitValue(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']),
    gitHead: gitValue(cwd, ['rev-parse', '--short', 'HEAD']),
  };
  appendJsonl(sessionsFile, session);
  return session.id;
}

function createEventBuffer(sessionId) {
  let queue = [];
  let flushing = false;

  async function flush() {
    if (flushing || queue.length === 0) return;
    flushing = true;
    const events = queue;
    queue = [];
    try {
      for (const event of events) {
        appendJsonl(eventsFile, { sessionId, ...event });
      }
    } catch (error) {
      queue = [...events, ...queue].slice(-500);
      console.error(`[codex-monitor] failed to record events: ${error.message}`);
    } finally {
      flushing = false;
    }
  }

  function push(event) {
    queue.push({ ts: Date.now(), ...event });
    if (queue.length >= maxBatchSize) void flush();
  }

  return {
    push,
    flush,
    interval: setInterval(() => void flush(), flushIntervalMs),
    stop() {
      clearInterval(this.interval);
    },
  };
}

function recordSessionUpdate(sessionId, update) {
  appendJsonl(sessionsFile, {
    id: sessionId,
    sessionKey: sessionId,
    updatedAt: Date.now(),
    ...update,
  });
}

function attachLineReader(stream, channel, buffer, mirror) {
  const reader = readline.createInterface({ input: stream });
  reader.on('line', (line) => {
    mirror.write(`${line}\n`);
    const event = classifyTextLine(line, channel);
    if (event) buffer.push(event);
  });
  return reader;
}

async function runCommand(opts) {
  if (!opts.command.length) throw new Error('Missing command after --');

  const sessionId = await startSession(opts, opts.command);
  const buffer = createEventBuffer(sessionId);
  const child = spawn(opts.command[0], opts.command.slice(1), {
    cwd: opts.cwd,
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  recordSessionUpdate(sessionId, {
    status: 'running',
    pid: child.pid,
  });

  const heartbeat = setInterval(() => {
    recordSessionUpdate(sessionId, {
      status: 'running',
      pid: child.pid,
    });
  }, heartbeatIntervalMs);

  const stdout = attachLineReader(child.stdout, 'stdout', buffer, process.stdout);
  const stderr = attachLineReader(child.stderr, 'stderr', buffer, process.stderr);

  let interrupted = false;
  process.on('SIGINT', () => {
    interrupted = true;
    child.kill('SIGINT');
  });

  const result = await new Promise((resolve) => {
    child.on('close', (exitCode, signal) => resolve({ exitCode, signal }));
  });

  clearInterval(heartbeat);
  stdout.close();
  stderr.close();
  await buffer.flush();
  buffer.stop();

  const status =
    interrupted || result.signal === 'SIGINT'
      ? 'cancelled'
      : result.exitCode === 0
      ? 'done'
      : 'failed';
  recordSessionUpdate(sessionId, {
    status,
    exitCode: typeof result.exitCode === 'number' ? result.exitCode : undefined,
    signal: result.signal || undefined,
    endedAt: Date.now(),
  });

  process.exitCode = result.exitCode ?? (status === 'done' ? 0 : 1);
}

async function watchFile(opts) {
  if (!opts.file) throw new Error('Missing --file PATH');

  const sessionId = await startSession(opts, ['watch', opts.file]);
  const buffer = createEventBuffer(sessionId);
  let position = opts.fromStart ? 0 : fs.existsSync(opts.file) ? fs.statSync(opts.file).size : 0;
  let partial = '';

  console.log(`[codex-monitor] watching ${opts.file}`);

  async function readNewBytes() {
    if (!fs.existsSync(opts.file)) return;
    const stat = fs.statSync(opts.file);
    if (stat.size < position) position = 0;
    if (stat.size === position) return;

    const fd = fs.openSync(opts.file, 'r');
    const chunk = Buffer.alloc(stat.size - position);
    fs.readSync(fd, chunk, 0, chunk.length, position);
    fs.closeSync(fd);
    position = stat.size;

    const lines = `${partial}${chunk.toString('utf8')}`.split(/\r?\n/);
    partial = lines.pop() ?? '';
    for (const line of lines) {
      const event = classifyTextLine(line, 'jsonl');
      if (event) buffer.push(event);
    }
  }

  const heartbeat = setInterval(() => {
    recordSessionUpdate(sessionId, { status: 'running' });
  }, heartbeatIntervalMs);

  const watcher = setInterval(() => {
    try {
      void readNewBytes();
    } catch (error) {
      buffer.push({
        kind: 'error',
        source: 'collector',
        channel: 'watch',
        text: error.message,
      });
    }
  }, 300);

  async function shutdown(status) {
    clearInterval(watcher);
    clearInterval(heartbeat);
    await readNewBytes();
    await buffer.flush();
    buffer.stop();
    recordSessionUpdate(sessionId, {
      status,
      endedAt: Date.now(),
    });
  }

  process.on('SIGINT', () => {
    void shutdown('cancelled').finally(() => process.exit(130));
  });
  process.on('SIGTERM', () => {
    void shutdown('cancelled').finally(() => process.exit(143));
  });
}

async function classifyStdin() {
  const reader = readline.createInterface({ input: process.stdin });
  for await (const line of reader) {
    const event = classifyTextLine(line, 'stdin');
    if (event) console.log(JSON.stringify(event));
  }
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.mode === 'help') {
    console.log(usage);
    return;
  }

  if (parsed.mode === 'classify') {
    await classifyStdin();
    return;
  }

  if (parsed.mode === 'run') {
    await runCommand(parsed.opts);
    return;
  }
  if (parsed.mode === 'watch') {
    await watchFile(parsed.opts);
    return;
  }
  throw new Error(`Unknown mode: ${parsed.mode}`);
}

main().catch((error) => {
  console.error(`[codex-monitor] ${error.message}`);
  process.exit(1);
});
