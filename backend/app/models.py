from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


class FieldDef(BaseModel):
    name: str
    type: str
    nullable: bool = True
    unique: bool = False
    primary_key: bool = False
    default: Optional[str] = None


class TableDef(BaseModel):
    name: str
    fields: List[FieldDef]
    notes: Optional[str] = None


class RelationshipDef(BaseModel):
    from_table: str
    from_field: str
    to_table: str
    to_field: str
    cardinality: Literal["one-to-one", "one-to-many", "many-to-many"] = "one-to-many"


class SchemaDef(BaseModel):
    database_type: Literal["postgres", "mongodb"] = "postgres"
    tables: List[TableDef] = Field(default_factory=list)
    relationships: List[RelationshipDef] = Field(default_factory=list)
    assumptions: List[str] = Field(default_factory=list)


class GenerateInitialRequest(BaseModel):
    prompt: str


class GenerateInitialResponse(BaseModel):
    schema: SchemaDef
    questions: List[Dict]


class RefineRequest(BaseModel):
    prompt: str
    schema: SchemaDef
    answers: Dict[str, str]


class FollowUpRequest(BaseModel):
    prompt: str
    schema: SchemaDef
    message: str


class GenerateSqlRequest(BaseModel):
    schema: SchemaDef


class GenerateSqlResponse(BaseModel):
    sql: str
