import { v } from 'convex/values';
import { Id } from './_generated/dataModel';
import { MutationCtx, mutation, query } from './_generated/server';
import { CodexEventKind, CodexEventSource, CodexSessionStatus } from './schema';

const defaultSessionLimit = 8;
const defaultEventLimit = 160;

const eventInput = v.object({
  ts: v.optional(v.number()),
  kind: CodexEventKind,
  source: v.optional(CodexEventSource),
  agentName: v.optional(v.string()),
  channel: v.optional(v.string()),
  parentSeq: v.optional(v.number()),
  text: v.optional(v.string()),
  data: v.optional(v.any()),
});

function boundedLimit(limit: number | undefined, fallback: number, max: number) {
  if (!limit || !Number.isFinite(limit)) return fallback;
  return Math.max(1, Math.min(Math.floor(limit), max));
}

async function nextSeq(ctx: Pick<MutationCtx, 'db'>, sessionId: Id<'codexSessions'>) {
  const latest = await ctx.db
    .query('codexEvents')
    .withIndex('by_session_seq', (q) => q.eq('sessionId', sessionId))
    .order('desc')
    .first();
  return (latest?.seq ?? 0) + 1;
}

export const listSessions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query('codexSessions')
      .order('desc')
      .take(boundedLimit(args.limit, defaultSessionLimit, 40));
  },
});

export const getSession = query({
  args: { sessionId: v.id('codexSessions') },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

export const listEvents = query({
  args: {
    sessionId: v.id('codexSessions'),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query('codexEvents')
      .withIndex('by_session_seq', (q) => q.eq('sessionId', args.sessionId))
      .order('desc')
      .take(boundedLimit(args.limit, defaultEventLimit, 500));
    return events.reverse();
  },
});

export const startSession = mutation({
  args: {
    sessionKey: v.string(),
    name: v.string(),
    cwd: v.string(),
    command: v.array(v.string()),
    startedAt: v.optional(v.number()),
    pid: v.optional(v.number()),
    host: v.optional(v.string()),
    branch: v.optional(v.string()),
    gitHead: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = args.startedAt ?? Date.now();
    const existing = await ctx.db
      .query('codexSessions')
      .withIndex('by_sessionKey', (q) => q.eq('sessionKey', args.sessionKey))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        cwd: args.cwd,
        command: args.command,
        status: 'running',
        startedAt: existing.startedAt,
        updatedAt: now,
        pid: args.pid,
        host: args.host,
        branch: args.branch,
        gitHead: args.gitHead,
      });
      return existing._id;
    }

    const sessionId = await ctx.db.insert('codexSessions', {
      sessionKey: args.sessionKey,
      name: args.name,
      cwd: args.cwd,
      command: args.command,
      status: 'starting',
      startedAt: now,
      updatedAt: now,
      pid: args.pid,
      host: args.host,
      branch: args.branch,
      gitHead: args.gitHead,
    });

    await ctx.db.insert('codexEvents', {
      sessionId,
      seq: 1,
      ts: now,
      kind: 'status',
      source: 'collector',
      text: `Started ${args.name}`,
      data: {
        cwd: args.cwd,
        command: args.command,
        branch: args.branch,
        gitHead: args.gitHead,
      },
    });
    return sessionId;
  },
});

export const heartbeat = mutation({
  args: {
    sessionId: v.id('codexSessions'),
    status: v.optional(CodexSessionStatus),
    pid: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error(`No Codex session found for ${args.sessionId}`);
    await ctx.db.patch(args.sessionId, {
      status: args.status ?? session.status,
      pid: args.pid ?? session.pid,
      updatedAt: Date.now(),
    });
  },
});

export const recordEvent = mutation({
  args: {
    sessionId: v.id('codexSessions'),
    event: eventInput,
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error(`No Codex session found for ${args.sessionId}`);
    const seq = await nextSeq(ctx, args.sessionId);
    const ts = args.event.ts ?? Date.now();
    const eventId = await ctx.db.insert('codexEvents', {
      sessionId: args.sessionId,
      seq,
      ts,
      kind: args.event.kind,
      source: args.event.source ?? 'codex',
      agentName: args.event.agentName,
      channel: args.event.channel,
      parentSeq: args.event.parentSeq,
      text: args.event.text,
      data: args.event.data,
    });
    await ctx.db.patch(args.sessionId, { updatedAt: ts, status: 'running' });
    return eventId;
  },
});

export const recordEvents = mutation({
  args: {
    sessionId: v.id('codexSessions'),
    events: v.array(eventInput),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error(`No Codex session found for ${args.sessionId}`);
    if (!args.events.length) return [];

    let seq = await nextSeq(ctx, args.sessionId);
    const ids = [];
    let latestTs = session.updatedAt;
    for (const event of args.events) {
      const ts = event.ts ?? Date.now();
      latestTs = Math.max(latestTs, ts);
      ids.push(
        await ctx.db.insert('codexEvents', {
          sessionId: args.sessionId,
          seq,
          ts,
          kind: event.kind,
          source: event.source ?? 'codex',
          agentName: event.agentName,
          channel: event.channel,
          parentSeq: event.parentSeq,
          text: event.text,
          data: event.data,
        }),
      );
      seq += 1;
    }

    await ctx.db.patch(args.sessionId, { updatedAt: latestTs, status: 'running' });
    return ids;
  },
});

export const endSession = mutation({
  args: {
    sessionId: v.id('codexSessions'),
    status: CodexSessionStatus,
    exitCode: v.optional(v.number()),
    signal: v.optional(v.string()),
    endedAt: v.optional(v.number()),
    text: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error(`No Codex session found for ${args.sessionId}`);
    const endedAt = args.endedAt ?? Date.now();
    await ctx.db.patch(args.sessionId, {
      status: args.status,
      exitCode: args.exitCode,
      signal: args.signal,
      endedAt,
      updatedAt: endedAt,
    });

    const seq = await nextSeq(ctx, args.sessionId);
    await ctx.db.insert('codexEvents', {
      sessionId: args.sessionId,
      seq,
      ts: endedAt,
      kind: args.status === 'failed' ? 'error' : 'status',
      source: 'collector',
      text: args.text ?? `Session ${args.status}`,
      data: {
        exitCode: args.exitCode,
        signal: args.signal,
      },
    });
  },
});
