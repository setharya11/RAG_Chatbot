import os

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse

import src  # noqa: F401 — register ORM models

from config.environment import MEDIA_PATH
from shared import get_logger, log_error
from src.routes.users.router import router as users_router
from src.routes.chat.router import router as chat_router

# Auto-migration script for new columns
try:
    from db.db_session import engine
    from sqlalchemy import text
    with engine.connect() as connection:
        connection.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP WITH TIME ZONE;"))
        connection.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN DEFAULT FALSE;"))
        connection.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS retry_count INTEGER DEFAULT 0;"))
        connection.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS parent_message_id INTEGER REFERENCES messages(id) ON DELETE SET NULL;"))
        connection.execute(text("ALTER TABLE messages ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;"))
        
        # Add columns to document_chunks
        connection.execute(text("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS source_type VARCHAR(50) DEFAULT 'textbook';"))
        connection.execute(text("ALTER TABLE document_chunks ADD COLUMN IF NOT EXISTS session_id INTEGER DEFAULT 0;"))
        connection.commit()
except Exception as e:
    print("Database auto-migration warning:", e)

logger = get_logger(__name__)

app = FastAPI(title="RAG Chatbot API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def root():
    return {
        "message": "RAG Chatbot backend running",
        "status": "ok",
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
    }


# Routers
app.include_router(users_router, prefix="/users")
app.include_router(chat_router, prefix="/chats")


# Media files
os.makedirs(MEDIA_PATH, exist_ok=True)

app.mount(
    "/media",
    StaticFiles(directory=MEDIA_PATH),
    name="media",
)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log_error(logger, "Unhandled exception", exception=str(exc))

    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "status": 500,
            "message": "Internal Server Error",
            "error": str(exc),
        },
    )