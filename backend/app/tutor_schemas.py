"""Контракты Tutor и тестов. Публичные схемы не содержат ключ ответов."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

StudentLevel = Literal["beginner", "intermediate", "advanced"]
TutorAction = Literal["explain", "example", "easy_exercise", "harder_exercise", "check_answer"]
ErrorType = Literal["none", "concept", "calculation", "reading", "procedure", "other"]
ShortText = Annotated[str, Field(min_length=1, max_length=300)]
LongText = Annotated[str, Field(min_length=1, max_length=4000)]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class TopicContext(StrictModel):
    subject: Annotated[str, Field(min_length=1, max_length=120)]
    topic: ShortText
    student_level: StudentLevel = "beginner"
    task_id: Annotated[int, Field(strict=True, gt=0)] | None = None
    focus_concept: ShortText | None = None


class TutorRequest(TopicContext):
    action: TutorAction
    exercise_text: Annotated[str, Field(max_length=3000)] | None = None
    student_answer: Annotated[str, Field(max_length=3000)] | None = None

    @model_validator(mode="after")
    def check_answer_has_context(self):
        if self.action == "check_answer" and (not self.exercise_text or not self.student_answer):
            raise ValueError("Для проверки нужны полное условие и твой ответ")
        return self


class Example(StrictModel):
    problem: LongText
    explanation: LongText
    solution: LongText


class Exercise(StrictModel):
    prompt: LongText
    hint: LongText
    concept_label: ShortText


class AnswerCheck(StrictModel):
    verdict: Literal["correct", "partly_correct", "incorrect", "cannot_check"]
    feedback: LongText
    error_type: ErrorType
    next_step: LongText


class Lesson(StrictModel):
    # Все поля обязательны, nullable-поля соответствуют strict JSON Schema API.
    title: ShortText
    body: LongText
    steps: Annotated[list[LongText], Field(min_length=1, max_length=6)]
    example: Example | None
    exercise: Exercise | None
    check: AnswerCheck | None

    def validate_action(self, action: TutorAction):
        expected = "example" if action == "example" else "exercise" if action in (
            "easy_exercise", "harder_exercise"
        ) else "check" if action == "check_answer" else None
        for name in ("example", "exercise", "check"):
            if (getattr(self, name) is not None) != (name == expected):
                raise ValueError("Lesson does not match requested action")
        return self


class TutorResponse(StrictModel):
    subject: str
    topic: str
    student_level: StudentLevel
    action: TutorAction
    lesson: Lesson


class GeneratedChoice(StrictModel):
    text: Annotated[str, Field(min_length=1, max_length=800)]
    feedback: LongText
    error_type: ErrorType


class GeneratedQuestion(StrictModel):
    prompt: LongText
    concept_label: ShortText
    choices: Annotated[list[GeneratedChoice], Field(min_length=4, max_length=4)]
    correct_index: Annotated[int, Field(strict=True, ge=0, le=3)]
    explanation: LongText

    @model_validator(mode="after")
    def consistent_key(self):
        if len({choice.text.casefold() for choice in self.choices}) != 4:
            raise ValueError("Duplicate choices")
        for index, choice in enumerate(self.choices):
            if (choice.error_type == "none") != (index == self.correct_index):
                raise ValueError("Inconsistent error type")
        return self


class GeneratedTest(StrictModel):
    title: ShortText
    questions: Annotated[list[GeneratedQuestion], Field(min_length=5, max_length=5)]

    @model_validator(mode="after")
    def unique_questions(self):
        if len({question.prompt.casefold() for question in self.questions}) != 5:
            raise ValueError("Duplicate questions")
        return self


class MiniTestCreate(TopicContext):
    request_id: UUID


class SubmittedAnswer(StrictModel):
    question_id: Literal["q1", "q2", "q3", "q4", "q5"]
    choice_id: Literal["A", "B", "C", "D"]


class TestSubmission(StrictModel):
    answers: Annotated[list[SubmittedAnswer], Field(min_length=5, max_length=5)]

    @model_validator(mode="after")
    def each_question_once(self):
        if len({answer.question_id for answer in self.answers}) != 5:
            raise ValueError("Ответь на каждый вопрос ровно один раз")
        return self


class PublicChoice(StrictModel):
    id: str
    text: str


class PublicQuestion(StrictModel):
    id: str
    prompt: str
    concept_key: str
    concept_label: str
    choices: list[PublicChoice]


class TestSummary(StrictModel):
    id: str
    subject: str
    topic: str
    topic_key: str
    student_level: StudentLevel
    source_task_id: int | None
    title: str
    created_at: str
    status: Literal["in_progress", "completed"]
    correct_count: int | None
    total_count: int
    score_percent: int | None


class PublicTest(TestSummary):
    schema_version: int
    questions: list[PublicQuestion]


class AnswerEvidence(StrictModel):
    question_id: str
    prompt: str
    concept_key: str
    concept_label: str
    choices: list[PublicChoice]
    selected_choice_id: str
    correct_choice_id: str
    is_correct: bool
    error_type: ErrorType
    feedback: str
    explanation: str


class ConceptDiagnostic(StrictModel):
    concept_key: str
    concept_label: str
    total_count: int
    correct_count: int
    incorrect_count: int
    error_types: list[ErrorType]
    question_ids: list[str]


class SavedResult(StrictModel):
    schema_version: int
    test_id: str
    subject: str
    topic: str
    topic_key: str
    student_level: StudentLevel
    source_task_id: int | None
    title: str
    created_at: str
    completed_at: str
    correct_count: int
    total_count: int
    score_percent: int
    generator_model: str
    grading_version: str
    answers: list[AnswerEvidence]
    diagnostics: list[ConceptDiagnostic]
    problem_topics: list[ConceptDiagnostic]
