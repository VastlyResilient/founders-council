import { randomUUID } from "node:crypto";
import { pool } from "./db.js";
import type { Source } from "./retrieve.js";

export type Mode = "counsel" | "grill" | "ask" | "act";

export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  mode?: Mode;
  sources?: Pick<Source, "episodeId" | "title" | "show" | "url" | "startSeconds">[];
  replies?: string[];
  createdAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  /** Names of the founders leading this session's voice. */
  voices: string[];
  createdAt: string;
  updatedAt: string;
  messages: StoredMessage[];
};

export type Take = {
  id: string;
  kind: "belief" | "goal" | "venture" | "tendency" | "context";
  text: string;
  createdAt: string;
  updatedAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function db() {
  if (!pool) throw new Error("DATABASE_URL is required to store conversations.");
  return pool;
}

/** Creates the Council's own tables next to the Founders Brain tables. Safe to run on every start. */
export async function migrate() {
  await db().query(`
    create table if not exists council_conversations (
      id uuid primary key,
      title text not null,
      messages jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create index if not exists council_conversations_updated_idx on council_conversations (updated_at desc);
    create table if not exists council_memory (
      id uuid primary key,
      kind text not null,
      text text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    alter table council_conversations add column if not exists visitor_id text;
    alter table council_conversations add column if not exists voices jsonb not null default '[]'::jsonb;
    alter table council_memory add column if not exists visitor_id text;
    create index if not exists council_conversations_visitor_idx on council_conversations (visitor_id, updated_at desc);
    create index if not exists council_memory_visitor_idx on council_memory (visitor_id);
  `);
}

/** Hands sessions and memory saved before visitor ids existed to this visitor. */
export async function claimUnowned(visitorId: string) {
  const a = await db().query(`update council_conversations set visitor_id = $1 where visitor_id is null`, [visitorId]);
  const b = await db().query(`update council_memory set visitor_id = $1 where visitor_id is null`, [visitorId]);
  return (a.rowCount ?? 0) + (b.rowCount ?? 0);
}

export function newId() {
  return randomUUID();
}

export function isId(id: string) {
  return UUID.test(id);
}

type ConversationRow = { id: string; title: string; voices: string[] | null; messages: StoredMessage[]; created_at: Date; updated_at: Date };

function toConversation(row: ConversationRow): Conversation {
  return {
    id: row.id,
    title: row.title,
    voices: row.voices ?? [],
    messages: row.messages,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getConversation(id: string, visitorId: string): Promise<Conversation | null> {
  if (!isId(id)) throw new Error("Invalid conversation id.");
  const { rows } = await db().query<ConversationRow>(`select * from council_conversations where id = $1 and visitor_id = $2`, [id, visitorId]);
  return rows[0] ? toConversation(rows[0]) : null;
}

export async function saveConversation(convo: Conversation, visitorId: string) {
  convo.updatedAt = new Date().toISOString();
  await db().query(
    `insert into council_conversations (id, title, messages, created_at, updated_at, visitor_id, voices)
     values ($1, $2, $3::jsonb, $4, $5, $6, $7::jsonb)
     on conflict (id) do update set title = excluded.title, messages = excluded.messages, updated_at = excluded.updated_at, voices = excluded.voices
     where council_conversations.visitor_id = excluded.visitor_id`,
    [convo.id, convo.title, JSON.stringify(convo.messages), convo.createdAt, convo.updatedAt, visitorId, JSON.stringify(convo.voices ?? [])],
  );
}

export function createConversation(firstMessage: string): Conversation {
  const now = new Date().toISOString();
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60);
  return { id: newId(), title, voices: [], createdAt: now, updatedAt: now, messages: [] };
}

export async function listConversations(visitorId: string) {
  const { rows } = await db().query<{ id: string; title: string; updated_at: Date; voices: string[] | null; preview: string | null; count: number }>(
    `select id, title, updated_at, voices,
            left(messages -> -1 ->> 'text', 90) as preview,
            jsonb_array_length(messages)::int as count
       from council_conversations
      where visitor_id = $1
      order by updated_at desc
      limit 200`,
    [visitorId],
  );
  return rows.map((r) => ({ id: r.id, title: r.title, voices: r.voices ?? [], updatedAt: r.updated_at.toISOString(), preview: r.preview ?? "", count: r.count }));
}

export async function deleteConversation(id: string, visitorId: string) {
  if (!isId(id)) throw new Error("Invalid conversation id.");
  await db().query(`delete from council_conversations where id = $1 and visitor_id = $2`, [id, visitorId]);
}

export async function getTakes(visitorId: string): Promise<Take[]> {
  const { rows } = await db().query<{ id: string; kind: Take["kind"]; text: string; created_at: Date; updated_at: Date }>(
    `select * from council_memory where visitor_id = $1 order by created_at asc`,
    [visitorId],
  );
  return rows.map((r) => ({ id: r.id, kind: r.kind, text: r.text, createdAt: r.created_at.toISOString(), updatedAt: r.updated_at.toISOString() }));
}

/** Replaces the whole profile in one transaction. */
export async function saveTakes(visitorId: string, takes: Take[]) {
  const client = await db().connect();
  try {
    await client.query("begin");
    await client.query("delete from council_memory where visitor_id = $1", [visitorId]);
    for (const t of takes) {
      await client.query(
        `insert into council_memory (id, kind, text, created_at, updated_at, visitor_id) values ($1, $2, $3, $4, $5, $6)`,
        [t.id, t.kind, t.text, t.createdAt, t.updatedAt, visitorId],
      );
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTake(id: string, visitorId: string) {
  if (!isId(id)) throw new Error("Invalid memory id.");
  await db().query(`delete from council_memory where id = $1 and visitor_id = $2`, [id, visitorId]);
}
