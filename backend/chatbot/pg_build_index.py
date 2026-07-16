from chatbot.embedding_server import generate_embedding
from chatbot.pg_vector_store import insert_chunk



from chatbot.pg_vector_store import (
    clear_chunks,
    insert_chunk,
)

CHUNKS_FILE = "data/chunks/chunks.txt"
CHUNK_SEPARATOR = "<<<CHUNK_END>>>"


def load_chunks() -> list[str]:
    print("Loading chunks...")

    with open(
        CHUNKS_FILE,
        "r",
        encoding="utf-8",
    ) as file:
        content = file.read()

    chunks = [
        chunk.strip()
        for chunk in content.split(CHUNK_SEPARATOR)
        if chunk.strip()
    ]

    return chunks

def main():
    chunks = load_chunks()

    print(f"Total chunks: {len(chunks)}")

    if not chunks:
        print("No chunks found.")
        return

    print("\nClearing old vector chunks...")

    clear_chunks()

    print("\nCreating new vector index...")

    for index, chunk in enumerate(
        chunks,
        start=1,
    ):
        embedding = generate_embedding(
            chunk
        ).tolist()

        insert_chunk(
            chunk,
            embedding,
        )

        if index % 100 == 0:
            print(
                f"Inserted "
                f"{index}/{len(chunks)} chunks"
            )

    print(
        "\nPostgreSQL vector index "
        "created successfully."
    )

    print(
        f"Inserted {len(chunks)} chunks."
    )


if __name__ == "__main__":
    main()