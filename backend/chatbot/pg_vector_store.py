import os
import psycopg2
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from pgvector.psycopg2 import register_vector

load_dotenv()

DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    DB_URL = "postgresql://setharya11:arya123@localhost:5432/chatbot"

print("Using DB:", DB_URL)

import os

import psycopg2
from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from pgvector.psycopg2 import register_vector


load_dotenv()


DB_URL = os.getenv("DATABASE_URL")

if not DB_URL:
    DB_URL = (
        "postgresql://setharya11:"
        "arya123@localhost:5432/chatbot"
    )


def get_connection():
    conn = psycopg2.connect(DB_URL)

    register_vector(conn)

    return conn


def insert_chunk(content, embedding):
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            INSERT INTO document_chunks (
                content,
                embedding
            )
            VALUES (%s, %s)
            """,
            (
                content,
                embedding,
            ),
        )

        conn.commit()

    except Exception:
        conn.rollback()
        raise

    finally:
        cur.close()
        conn.close()


def clear_chunks():
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            TRUNCATE TABLE document_chunks
            RESTART IDENTITY
            """
        )

        conn.commit()

        print("Old document chunks cleared.")

    except Exception:
        conn.rollback()
        raise

    finally:
        cur.close()
        conn.close()


def search_chunks(query_embedding, top_k=5):
    conn = get_connection()
    cur = conn.cursor()

    try:
        cur.execute(
            """
            SELECT content
            FROM document_chunks
            ORDER BY embedding <=> %s::vector
            LIMIT %s
            """,
            (
                query_embedding,
                top_k,
            ),
        )

        results = [
            row[0]
            for row in cur.fetchall()
        ]

        return results

    finally:
        cur.close()
        conn.close()
def get_connection():
    conn = psycopg2.connect(DB_URL)
    register_vector(conn)
    return conn


def insert_chunk(content, embedding):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        INSERT INTO document_chunks (content, embedding)
        VALUES (%s, %s)
        """,
        (content, embedding)
    )

    conn.commit()
    cur.close()
    conn.close()


def search_chunks(query_embedding, top_k=5):
    conn = get_connection()
    cur = conn.cursor()

    cur.execute(
        """
        SELECT content
        FROM document_chunks
        ORDER BY embedding <=> %s::vector
        LIMIT %s
        """,
        (query_embedding, top_k)
    )

    results = [row[0] for row in cur.fetchall()]

    cur.close()
    conn.close()

    return results