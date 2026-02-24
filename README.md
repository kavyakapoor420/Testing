# DB Canvas Agent (MVP)

Turn natural-language business ideas into an editable whiteboard-style database design, then generate Postgres DDL.

## Product Direction (refined)

- Audience:
  - Non-tech founders: describe idea, get clear visual schema + safe defaults.
  - Developers: export SQL with PK/FK/constraints, iterate quickly.
- UX modes:
  - Simple Mode: fast schema + minimal questions.
  - Pro Mode: adds audit fields, stronger constraints, scale-aware structure.
- Core flow:
  1. User writes plain-English business plan.
  2. AI returns structured schema JSON.
  3. Frontend maps JSON to editable tldraw diagram.
  4. Guided Q&A asks key missing decisions (SQL/NoSQL, tenant model, soft delete).
  5. Refined schema regenerates on canvas.
  6. Generate Postgres SQL from the same schema JSON.

## Monorepo Structure

- `frontend/`: React + Tailwind + tldraw SDK
- `backend/`: FastAPI + schema generation + SQL generator

## Run Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

## Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Set `VITE_API_BASE` if backend is not `http://localhost:8000/api/v1`.

## Current MVP Features

- Plain English prompt -> initial schema
- Auto-render schema as table cards on tldraw canvas
- Editable canvas (move/rename tables and fields)
- Sync canvas text edits back into schema model
- Guided clarification questions
- Postgres DDL generation with FK constraints

## Known Gaps (next)

1. MongoDB output generator and tradeoff reasoning (embed vs reference)
2. Robust tldraw binding arrows to table anchors
3. Schema versioning (v1/v2/v3 compare + rollback)
4. Export PNG/SVG + SQL download button
5. Auth + project persistence (workspace + history)
6. Better Gemini JSON control via function-calling/tool mode
