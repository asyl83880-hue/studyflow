import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

# Путь не зависит от того, из какой папки запустили сервер.
DATABASE_PATH = Path(__file__).resolve().parent.parent / "studyflow.db"
DATABASE_URL = os.getenv("STUDYFLOW_POSTGRES_URL") or os.getenv("STUDYFLOW_DATABASE_URL") or os.getenv("DATABASE_URL") or f"sqlite:///{DATABASE_PATH.as_posix()}"
if DATABASE_URL.startswith(("postgres://", "postgresql://")):
    DATABASE_URL = "postgresql+psycopg://" + DATABASE_URL.split("://", 1)[1]

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite:") else {"connect_timeout": 10},
    pool_pre_ping=True,
    **({"pool_size": 3, "max_overflow": 2, "pool_recycle": 300} if not DATABASE_URL.startswith("sqlite:") else {}),
)


def configure_sqlite(connection, _record):
    cursor = connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.execute("PRAGMA busy_timeout=5000")
    cursor.close()


if engine.dialect.name == "sqlite":
    event.listen(engine, "connect", configure_sqlite)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
