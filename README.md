# Founders Council

An honest advisor built from the full transcripts of every Founders and David Senra episode (740 episodes, ~38,000 searchable passages). It checks your ideas and takes against what founders actually did, asks questions when it needs more, grills you on request, and ends with a next move and a daily rep.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5180. The API runs on port 8790.

For a single production server: `npm run build && npm start`, then open http://localhost:8790.

## How it works

- **Transcripts:** every passage lives in the Founders Brain Supabase database (pgvector). Each message runs a semantic search first, and the Council can run up to three more searches while it answers, for example to find a counterexample.
- **Patterns:** `server/knowledge/patterns.md` (the Founder Patterns document) and `cheat-sheet.md` are in the Council's instructions on every turn, so answers tie back to the validated patterns, the graveyard, and the contradiction map.
- **Memory:** after each exchange, a small model updates `server/data/memory.json` with durable facts about you: takes, goals, ventures, tendencies. The Council reads it every turn. You can review and delete items under **Memory**.
- **Sessions:** conversations are saved in `server/data/conversations/`.
- **Modes:** Counsel, Grill me, Ask me first, Action plan. Pick one from the button at the left of the bar.

Models: `claude-opus-5-5` for the Council, `claude-haiku-5-5` for memory, `text-embedding-3-small` for search. You can change them in `.env.local`.

## Configuration (`.env.local`)

`ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (search embeddings), `DATABASE_URL` (Founders Brain Supabase), `COUNCIL_MODEL`, `MEMORY_MODEL`, `EMBEDDING_MODEL`, `PORT`.

The Supabase project is on the free plan and pauses after about a week without use. If search stops working, resume the project in the Supabase dashboard.

## Fonts

The hero uses Helvetica Neue Roman. On a Mac it loads from the system font. To use the exact web font on other devices, put `HelveticaNeue-Roman.woff2` and `HelveticaNeue-Roman.woff` in `public/fonts/`.
