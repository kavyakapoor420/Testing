def _contains_table(schema, name):
    return any(t.name == name for t in schema.tables)


def build_guided_questions(schema, prompt: str = ""):
    db_options = ["postgres", "mongodb"]
    scale_options = ["<10k users", "10k-1M users", ">1M users"]
    mode_options = ["Simple", "Pro"]
    multi_tenant_options = ["single-tenant", "multi-tenant"]
    soft_delete_options = ["yes", "no"]

    questions = [
        {
            "id": "database_type",
            "question": "Which database style do you want?",
            "options": db_options,
        },
        {
            "id": "product_mode",
            "question": "Do you want fast/simple output or production/pro output?",
            "options": mode_options,
        },
        {
            "id": "scale_expectation",
            "question": "Expected scale for the next 12 months?",
            "options": scale_options,
        },
        {
            "id": "tenant_model",
            "question": "Is this single-tenant or multi-tenant?",
            "options": multi_tenant_options,
        },
        {
            "id": "soft_delete",
            "question": "Add soft delete fields (`deleted_at`) by default?",
            "options": soft_delete_options,
        },
    ]

    lowered = prompt.lower()
    if "blog" in lowered or (_contains_table(schema, "posts") and _contains_table(schema, "comments")):
        questions.append(
            {
                "id": "blog_workflow",
                "question": "Need draft/published scheduling workflow for posts?",
                "options": ["yes", "no"],
            }
        )

    if _contains_table(schema, "orders") or _contains_table(schema, "payments"):
        questions.append(
            {
                "id": "money_precision",
                "question": "Store currency as integer cents for precision?",
                "options": ["yes", "no"],
            }
        )

    return questions[:6]
