import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const envFile = path.resolve(process.cwd(), ".env.local");
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, raw] = match;
    if (process.env[key] === undefined || key.startsWith("COUNCIL_") || key === "ANTHROPIC_API_KEY") {
      process.env[key] = raw.replace(/^['"]|['"]$/g, "");
    }
  }
}

export const config = {
  port: Number(process.env.PORT ?? 8790),
  councilModel: process.env.COUNCIL_MODEL ?? "claude-opus-5-5",
  memoryModel: process.env.MEMORY_MODEL ?? "claude-haiku-5-5",
  embeddingModel: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
  // The council talks to the public Anthropic API directly, regardless of any
  // ANTHROPIC_BASE_URL inherited from the shell.
  anthropicBaseURL: process.env.COUNCIL_ANTHROPIC_BASE_URL ?? "https://api.anthropic.com",
};
