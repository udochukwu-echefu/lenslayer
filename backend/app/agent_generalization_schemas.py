"""Closed bounded context/graph inputs. No expression or executable-code surface."""
from datetime import datetime

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from .agent_schemas import ContextTaskCondition, FactualPredicate, Identifier, IdempotencyKey, StrictInput


class ContextRecordCreate(StrictInput):
    title: str = Field(min_length=1, max_length=255)
    text: str = Field(min_length=1, max_length=100000)
    expires_at: AwareDatetime


class ContextVersionCreate(StrictInput):
    expected_version: int = Field(ge=1)
    text: str = Field(min_length=1, max_length=100000)


class ContextScope(StrictInput):
    context_ids: list[Identifier] = Field(max_length=100)

    @model_validator(mode="after")
    def unique(self):
        if len(set(self.context_ids)) != len(self.context_ids):
            raise ValueError("Context IDs must be unique.")
        return self


class ContextSearch(ContextScope):
    context_ids: list[Identifier] = Field(min_length=1, max_length=100)
    query: str = Field(min_length=1, max_length=200)
    max_results: int = Field(default=5, ge=1, le=10)


class ContextRecordResponse(BaseModel):
    id: str
    organization_id: str
    title: str
    current_version: int
    expires_at: datetime
    deleted_at: datetime | None
    created_at: datetime


class ContextVersionResponse(BaseModel):
    id: str
    record_id: str
    version_number: int
    source_sha256: str
    text: str
    created_at: datetime


class ContextSearchHit(BaseModel):
    context_id: str
    version_id: str
    source_sha256: str
    start_offset: int
    end_offset: int
    excerpt: str


class ContextEvidenceResponse(ContextSearchHit):
    id: str
    created_at: datetime


class GraphTask(ContextTaskCondition):
    query: str = Field(min_length=1, max_length=200)


class GraphNodeCreate(StrictInput):
    id: Identifier
    depends_on: list[Identifier] = Field(default_factory=list, max_length=19)
    not_before_at: AwareDatetime | None = None
    when: FactualPredicate | None = None
    task: GraphTask


class WorkflowGraphCreate(ContextScope):
    idempotency_key: IdempotencyKey
    goal: str = Field(min_length=1, max_length=4000)
    context_ids: list[Identifier] = Field(min_length=1, max_length=100)
    deadline_at: AwareDatetime
    nodes: list[GraphNodeCreate] = Field(min_length=1, max_length=20)

    @model_validator(mode="after")
    def valid_graph(self):
        nodes = {node.id: node for node in self.nodes}
        if len(nodes) != len(self.nodes):
            raise ValueError("Node IDs must be unique.")
        facts = {}
        for node in self.nodes:
            if (len(set(node.depends_on)) != len(node.depends_on)
                    or node.id in node.depends_on or not set(node.depends_on) <= nodes.keys()):
                raise ValueError("Dependencies must be unique, known and not self-references.")
            if node.when:
                if node.when.fact in facts and facts[node.when.fact] != node.when.value:
                    raise ValueError("A factual input must have one immutable value throughout the graph.")
                facts[node.when.fact] = node.when.value
        visited, visiting = set(), set()

        def visit(key):
            if key in visiting:
                raise ValueError("Workflow graphs must be acyclic.")
            if key in visited:
                return
            visiting.add(key)
            for dep in nodes[key].depends_on:
                visit(dep)
            visiting.remove(key)
            visited.add(key)

        for key in nodes:
            visit(key)
        return self


class GraphNodeResponse(BaseModel):
    id: str
    action_id: str
    depends_on: list[str]
    not_before_at: datetime
    status: str


class GraphResponse(BaseModel):
    run_id: str
    plan_sha256: str
    nodes: list[GraphNodeResponse]
