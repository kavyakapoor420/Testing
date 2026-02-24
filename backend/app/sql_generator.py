from app.models import SchemaDef


def _field_sql(field):
    chunks = [field.name, field.type.upper()]
    if field.primary_key:
        chunks.append("PRIMARY KEY")
    if not field.nullable:
        chunks.append("NOT NULL")
    if field.unique and not field.primary_key:
        chunks.append("UNIQUE")
    if field.default:
        chunks.append(f"DEFAULT {field.default}")
    return " ".join(chunks)


def generate_postgres_sql(schema: SchemaDef) -> str:
    statements = []

    for table in schema.tables:
        fields_sql = ",\n  ".join(_field_sql(field) for field in table.fields)
        create_sql = f"CREATE TABLE IF NOT EXISTS {table.name} (\n  {fields_sql}\n);"
        statements.append(create_sql)

    for rel in schema.relationships:
        fk_name = f"fk_{rel.from_table}_{rel.from_field}_{rel.to_table}_{rel.to_field}"
        fk_sql = (
            f"ALTER TABLE {rel.from_table} "
            f"ADD CONSTRAINT {fk_name} "
            f"FOREIGN KEY ({rel.from_field}) REFERENCES {rel.to_table}({rel.to_field});"
        )
        statements.append(fk_sql)

    return "\n\n".join(statements)
