"""Публичная карта одного локального ученика: только оценка и доказательства."""

from typing import Literal

from pydantic import Field

from .tutor_schemas import StrictModel, StudentLevel

KnowledgeStatus = Literal["mastered", "good", "needs_practice", "weak", "not_studied"]


class RecentResult(StrictModel):
    test_id: str
    completed_at: str
    correct_count: int
    total_count: int
    score_percent: float


class ErrorCount(StrictModel):
    error_type: str
    count: int


class RecommendationStep(StrictModel):
    action: Literal["explain", "practice", "mini_test"]
    label: str
    exercise_count: int | None = None


class Recommendation(StrictModel):
    message: str
    steps: list[RecommendationStep]


class KnowledgeAssessment(StrictModel):
    status: KnowledgeStatus
    score_percent: float | None
    attempts: int
    answered_count: int
    correct_count: int
    incorrect_count: int
    recent_errors: int
    recent_error_types: list[ErrorCount]
    recent_results: list[RecentResult]
    last_test_at: str | None
    student_level: StudentLevel
    provisional: bool
    reason: str
    recommendation: Recommendation


class ConceptNode(KnowledgeAssessment):
    concept_key: str
    label: str


class TopicNode(KnowledgeAssessment):
    topic_key: str
    label: str
    concepts: list[ConceptNode]


class SubjectNode(StrictModel):
    subject_key: str
    label: str
    topics: list[TopicNode]


class KnowledgeSummary(StrictModel):
    topics_total: int
    concepts_total: int
    completed_tests: int
    statuses: dict[KnowledgeStatus, int]


class KnowledgeMapResponse(StrictModel):
    schema_version: int = 1
    calculation_version: str
    generated_at: str
    summary: KnowledgeSummary
    subjects: list[SubjectNode] = Field(default_factory=list)
