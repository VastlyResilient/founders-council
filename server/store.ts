import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, renameSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Source } from "./retrieve.js";

const DATA_DIR = path.resolve(process.cwd(), "server/data");
const CONVO_DIR = path.join(DATA_DIR, "conversations");
const MEMORY_FILE = path.join(DATA_DIR, "memory.json");
mkdirSync(CONVO_DIR, { recursive: true });

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

function writeJson(file: string, value: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2));
  renameSync(tmp, file);
}

const convoPath = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid conversation id.");
  return path.join(CONVO_DIR, `${id}.json`);
};

export function newId() {
  return randomUUID();
}

export function getConversation(id: string): Conversation | null {
  const file = convoPath(id);
  return existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Conversation) : null;
}

export function saveConversation(convo: Conversation) {
  convo.updatedAt = new Date().toISOString();
  writeJson(convoPath(convo.id), convo);
}

export function createConversation(firstMessage: string): Conversation {
  const now = new Date().toISOString();
  const title = firstMessage.replace(/\s+/g, " ").trim().slice(0, 60);
  return { id: newId(), title, createdAt: now, updatedAt: now, messages: [] };
}

export function listConversations() {
  return readdirSync(CONVO_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(path.join(CONVO_DIR, f), "utf8")) as Conversation)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(({ id, title, updatedAt, messages }) => ({
      id,
      title,
      updatedAt,
      preview: messages.at(-1)?.text.slice(0, 90) ?? "",
      count: messages.length,
    }));
}

export function deleteConversation(id: string) {
  const file = convoPath(id);
  if (existsSync(file)) rmSync(file);
}

export function getTakes(): Take[] {
  return existsSync(MEMORY_FILE) ? (JSON.parse(readFileSync(MEMORY_FILE, "utf8")) as Take[]) : [];
}

export function saveTakes(takes: Take[]) {
  writeJson(MEMORY_FILE, takes);
}

export function deleteTake(id: string) {
  saveTakes(getTakes().filter((t) => t.id !== id));
}
