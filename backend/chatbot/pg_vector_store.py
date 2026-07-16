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


def search_chunks_with_scores(query_embedding, top_k=5, allowed_sources=None, exclude_user_uploads=False):
    conn = get_connection()
    cur = conn.cursor()

    try:
        sql = """
            SELECT content, embedding <=> %s::vector AS distance
            FROM document_chunks
        """
        conditions = []
        params = [query_embedding]
        
        if allowed_sources:
            or_conds = []
            for src in allowed_sources:
                or_conds.append("content LIKE %s")
                params.append(f"Source: {src}%")
            conditions.append("(" + " OR ".join(or_conds) + ")")
        elif exclude_user_uploads:
            conditions.append("content NOT LIKE 'Source: session_%'")
            
        if conditions:
            sql += " WHERE " + " AND ".join(conditions)
            
        sql += """
            ORDER BY distance ASC
            LIMIT %s
        """
        params.append(top_k)

        cur.execute(sql, tuple(params))

        results = [
            (row[0], float(row[1]))
            for row in cur.fetchall()
        ]

        return results

    finally:
        cur.close()
        conn.close()