import json
import os
from typing import Dict

from dotenv import load_dotenv

from app.models import FieldDef, RelationshipDef, SchemaDef, TableDef
from app.prompts import SYSTEM_PROMPT

load_dotenv()


def _fallback_schema(prompt: str) -> SchemaDef:
    base_tables = [
        TableDef(
            name="users",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="email", type="text", unique=True, nullable=False),
                FieldDef(name="full_name", type="text", nullable=False),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="Core account table",
        ),
        TableDef(
            name="projects",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="name", type="text", nullable=False),
                FieldDef(name="owner_id", type="uuid", nullable=False),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="Main business object placeholder",
        ),
        TableDef(
            name="tasks",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="project_id", type="uuid", nullable=False),
                FieldDef(name="title", type="text", nullable=False),
                FieldDef(name="status", type="text", nullable=False, default="'todo'"),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="Work item placeholder",
        ),
    ]

    rels = [
        RelationshipDef(from_table="projects", from_field="owner_id", to_table="users", to_field="id", cardinality="one-to-many"),
        RelationshipDef(from_table="tasks", from_field="project_id", to_table="projects", to_field="id", cardinality="one-to-many"),
    ]

    return SchemaDef(
        database_type="postgres",
        tables=base_tables,
        relationships=rels,
        assumptions=[
            f"Fallback schema generated because Gemini key missing or failed. Prompt: {prompt[:80]}",
            "Assumed SaaS-style multi-entity model with users/projects/tasks.",
        ],
    )


def _call_gemini(prompt: str) -> Dict:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY missing")

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)
    response = model.generate_content([
        SYSTEM_PROMPT,
        f"User prompt: {prompt}",
    ])

    raw = response.text.strip()
    return json.loads(raw)


def generate_initial_schema(prompt: str) -> SchemaDef:
    try:
        data = _call_gemini(prompt)
        return SchemaDef.model_validate(data)
    except Exception:
        return _fallback_schema(prompt)


def refine_schema(schema: SchemaDef, answers: Dict[str, str]) -> SchemaDef:
    updated = schema.model_copy(deep=True)

    database_type = answers.get("database_type")
    if database_type in {"postgres", "mongodb"}:
        updated.database_type = database_type

    if answers.get("tenant_model") == "multi-tenant":
        for table in updated.tables:
            has_tenant = any(f.name == "tenant_id" for f in table.fields)
            if not has_tenant:
                table.fields.append(FieldDef(name="tenant_id", type="uuid", nullable=False))

    if answers.get("soft_delete") == "yes":
        for table in updated.tables:
            has_deleted = any(f.name == "deleted_at" for f in table.fields)
            if not has_deleted:
                table.fields.append(FieldDef(name="deleted_at", type="timestamp", nullable=True))

    if answers.get("product_mode") == "Pro":
        for table in updated.tables:
            has_updated = any(f.name == "updated_at" for f in table.fields)
            if not has_updated:
                table.fields.append(FieldDef(name="updated_at", type="timestamp", nullable=False, default="now()"))

    updated.assumptions.append(f"Applied answers: {answers}")
    return updated
