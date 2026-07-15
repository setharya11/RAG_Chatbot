# embedding_server.py

# pyrefly: ignore [missing-import]
from sentence_transformers import SentenceTransformer

# Load embedding model once
model = SentenceTransformer("all-MiniLM-L6-v2")


def generate_embedding(text):

    embedding = model.encode(text)

    return embedding