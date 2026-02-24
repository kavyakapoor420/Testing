import json
import os
from typing import Dict

from dotenv import load_dotenv

from app.models import FieldDef, RelationshipDef, SchemaDef, TableDef
from app.prompts import FOLLOW_UP_PROMPT, SYSTEM_PROMPT

load_dotenv()


def _blog_fallback_schema(prompt: str) -> SchemaDef:
    tables = [
        TableDef(
            name="users",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="email", type="text", unique=True, nullable=False),
                FieldDef(name="display_name", type="text", nullable=False),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="authors and readers",
        ),
        TableDef(
            name="posts",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="author_id", type="uuid", nullable=False),
                FieldDef(name="title", type="text", nullable=False),
                FieldDef(name="slug", type="text", nullable=False, unique=True),
                FieldDef(name="content", type="text", nullable=False),
                FieldDef(name="status", type="text", nullable=False, default="'draft'"),
                FieldDef(name="published_at", type="timestamp", nullable=True),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="main article content",
        ),
        TableDef(
            name="comments",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="post_id", type="uuid", nullable=False),
                FieldDef(name="user_id", type="uuid", nullable=False),
                FieldDef(name="body", type="text", nullable=False),
                FieldDef(name="created_at", type="timestamp", nullable=False, default="now()"),
            ],
            notes="post discussions",
        ),
        TableDef(
            name="tags",
            fields=[
                FieldDef(name="id", type="uuid", primary_key=True, unique=True, nullable=False, default="gen_random_uuid()"),
                FieldDef(name="name", type="text", nullable=False, unique=True),
            ],
            notes="post categorization",
        ),
        TableDef(
            name="post_tags",
            fields=[
                FieldDef(name="post_id", type="uuid", nullable=False),
                FieldDef(name="tag_id", type="uuid", nullable=False),
            ],
            notes="many-to-many mapping",
        ),
    ]

    rels = [
        RelationshipDef(from_table="posts", from_field="author_id", to_table="users", to_field="id"),
        RelationshipDef(from_table="comments", from_field="post_id", to_table="posts", to_field="id"),
        RelationshipDef(from_table="comments", from_field="user_id", to_table="users", to_field="id"),
        RelationshipDef(from_table="post_tags", from_field="post_id", to_table="posts", to_field="id"),
        RelationshipDef(from_table="post_tags", from_field="tag_id", to_table="tags", to_field="id"),
    ]

    return SchemaDef(
        database_type="postgres",
        tables=tables,
        relationships=rels,
        assumptions=[f"Blog-focused fallback schema used for prompt: {prompt[:80]}"],
    )


def _generic_fallback_schema(prompt: str) -> SchemaDef:
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
            "Assumed SaaS-style model with users/projects/tasks.",
        ],
    )


def _fallback_schema(prompt: str) -> SchemaDef:
    lowered = prompt.lower()
    if "blog" in lowered or "article" in lowered:
        return _blog_fallback_schema(prompt)
    return _generic_fallback_schema(prompt)


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


def _call_gemini_follow_up(prompt: str, schema: SchemaDef, message: str) -> Dict:
    api_key = os.getenv("GEMINI_API_KEY")
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    if not api_key:
        raise RuntimeError("GEMINI_API_KEY missing")

    import google.generativeai as genai

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(model_name)

    response = model.generate_content(
        [
            FOLLOW_UP_PROMPT,
            f"Original user prompt: {prompt}",
            "Existing schema JSON:",
            schema.model_dump_json(),
            f"Follow-up instruction: {message}",
        ]
    )

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

    if answers.get("blog_workflow") == "yes":
        for table in updated.tables:
            if table.name == "posts":
                has_status = any(f.name == "status" for f in table.fields)
                if not has_status:
                    table.fields.append(FieldDef(name="status", type="text", nullable=False, default="'draft'"))

    updated.assumptions.append(f"Applied answers: {answers}")
    return updated


def apply_follow_up(prompt: str, schema: SchemaDef, message: str) -> SchemaDef:
    try:
        data = _call_gemini_follow_up(prompt, schema, message)
        updated = SchemaDef.model_validate(data)
        updated.assumptions.append(f"Applied follow-up: {message}")
        return updated
    except Exception:
        updated = schema.model_copy(deep=True)
        updated.assumptions.append(f"Follow-up captured but fallback kept schema unchanged: {message}")
        return updated
