from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, UniqueConstraint
from .database import Base


class Task(Base):
    # New private tables keep the previous shared demo records separate.
    __tablename__ = "assignments"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(String(64), nullable=False, index=True)
    subject = Column(String, nullable=False)
    topic = Column(String, nullable=False)
    description = Column(String, nullable=True)
    deadline = Column(DateTime, nullable=False)
    difficulty = Column(Integer, nullable=False)
    estimated_time = Column(Integer, nullable=False)
    completed = Column(Boolean, default=False, nullable=False)


class MiniTest(Base):
    __tablename__ = "practice_tests"
    __table_args__ = (UniqueConstraint("owner_id", "request_id"),)

    id = Column(String(36), primary_key=True)
    owner_id = Column(String(64), nullable=False, index=True)
    request_id = Column(String(36), nullable=False)
    request_fingerprint = Column(String(64), nullable=False)
    subject = Column(String, nullable=False)
    topic = Column(String, nullable=False)
    topic_key = Column(String(40), nullable=False, index=True)
    student_level = Column(String(20), nullable=False)
    # Историческая ссылка, не FK: удаление задания не удаляет историю обучения.
    source_task_id = Column(Integer, nullable=True)
    task_description = Column(Text, nullable=True)
    title = Column(String, nullable=False)
    questions_json = Column(Text, nullable=False)  # Ключ ответов остаётся на сервере.
    model = Column(String, nullable=False)
    schema_version = Column(Integer, nullable=False, default=1)
    created_at = Column(DateTime, nullable=False)


class TaskCreateRequest(Base):
    """Техническая защита повтора POST; существующая таблица tasks не меняется."""

    __tablename__ = "task_request_keys"

    request_id = Column(String(36), primary_key=True)
    owner_id = Column(String(64), primary_key=True)
    fingerprint = Column(String(64), nullable=False)
    task_id = Column(Integer, ForeignKey("assignments.id", ondelete="SET NULL"), nullable=True)


class TestResult(Base):
    __tablename__ = "practice_results"

    test_id = Column(String(36), ForeignKey("practice_tests.id", ondelete="CASCADE"), primary_key=True)
    correct_count = Column(Integer, nullable=False)
    total_count = Column(Integer, nullable=False)
    score_percent = Column(Integer, nullable=False)
    grading_version = Column(String, nullable=False)
    completed_at = Column(DateTime, nullable=False)


class TestAnswer(Base):
    __tablename__ = "practice_answers"

    test_id = Column(String(36), ForeignKey("practice_results.test_id", ondelete="CASCADE"), primary_key=True)
    question_id = Column(String(10), primary_key=True)
    selected_choice_id = Column(String(1), nullable=False)
    is_correct = Column(Boolean, nullable=False)
    error_type = Column(String(20), nullable=False)
    concept_key = Column(String(40), nullable=False, index=True)
    concept_label = Column(String, nullable=False)
    feedback = Column(Text, nullable=False)


class UsageCounter(Base):
    __tablename__ = "usage_counters"

    key = Column(String(64), primary_key=True)
    count = Column(Integer, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
