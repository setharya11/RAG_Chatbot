# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import declarative_base, sessionmaker
from config.environment import DATABASE_URL
from shared.logging import get_logger

logger = get_logger(__name__)

engine = create_engine(DATABASE_URL,pool_size=5,max_overflow=10,pool_pre_ping=True,)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try: yield db
    finally: db.close()
