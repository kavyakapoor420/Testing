from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.ai_service import apply_follow_up, generate_initial_schema, refine_schema
from app.models import (
    FollowUpRequest,
    GenerateInitialRequest,
    GenerateInitialResponse,
    GenerateSqlRequest,
    GenerateSqlResponse,
    RefineRequest,
)
from app.questionnaire import build_guided_questions
from app.sql_generator import generate_postgres_sql

app = FastAPI(title="DB Canvas Agent API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/v1/generate-initial", response_model=GenerateInitialResponse)
def generate_initial(payload: GenerateInitialRequest):
    schema = generate_initial_schema(payload.prompt)
    questions = build_guided_questions(schema, payload.prompt)
    return GenerateInitialResponse(schema=schema, questions=questions)


@app.post("/api/v1/refine")
def refine(payload: RefineRequest):
    schema = refine_schema(payload.schema, payload.answers)
    return {"schema": schema, "questions": build_guided_questions(schema, payload.prompt)}


@app.post("/api/v1/follow-up")
def follow_up(payload: FollowUpRequest):
    schema = apply_follow_up(payload.prompt, payload.schema, payload.message)
    return {"schema": schema}


@app.post("/api/v1/generate-sql", response_model=GenerateSqlResponse)
def generate_sql(payload: GenerateSqlRequest):
    if payload.schema.database_type == "mongodb":
        return GenerateSqlResponse(
            sql="-- You selected MongoDB. In v1 this endpoint generates Postgres only."
        )

    sql = generate_postgres_sql(payload.schema)
    return GenerateSqlResponse(sql=sql)
