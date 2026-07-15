import os

from dotenv import load_dotenv

load_dotenv(override=True)

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:8000")
PG_HOST = os.getenv("PG_HOST", "localhost")
PG_PORT = os.getenv("PG_PORT", "5432")
PG_USER = os.getenv("PG_USER", "postgres")
PG_PASSWORD = os.getenv("PG_PASSWORD", "postgres")
PG_DATABASE = os.getenv("PG_DATABASE", "rag_chatbot")

DATABASE_URL = "postgresql+psycopg2://setharya11:arya123@localhost:5432/chatbot"

SECRET_KEY = os.getenv("SECRET_KEY", "change-me-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
X_API_KEY = os.getenv("X_API_KEY", "dev-x-api-key-change-me")
TOKEN_EXPIRY_HOURS = int(os.getenv("TOKEN_EXPIRY_HOURS", "24"))

MEDIA_PATH = os.getenv("MEDIA_PATH", "media")
APP_NAME = os.getenv("APP_NAME", "RAG Chatbot")

SMTP_HOST = os.getenv("SMTP_HOST", os.getenv("MAIL_SERVER", "smtp.gmail.com"))
SMTP_PORT = int(os.getenv("SMTP_PORT", os.getenv("MAIL_PORT", "587")))
SMTP_USER = os.getenv("SMTP_USER", os.getenv("MAIL_USERNAME", ""))
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", os.getenv("MAIL_PASSWORD", ""))
SMTP_FROM = os.getenv("SMTP_FROM", os.getenv("MAIL_FROM", "noreply@ragchatbot.com"))
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")
