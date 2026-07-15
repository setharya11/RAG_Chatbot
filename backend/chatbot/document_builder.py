import os
import re

# pyrefly: ignore [missing-import]
from langchain_text_splitters import RecursiveCharacterTextSplitter

from settings import RAW_DATA_PATH,CHUNK_DATA_PATH,CHUNK_SIZE,CHUNK_OVERLAP


def clean_text(text: str) -> str:
    """
    Clean extracted textbook text while preserving paragraph structure.
    """

    text = str(text)

    # Remove known dataset tokens
    text = text.replace("NULL", "")
    text = text.replace("-LRB-", "(")
    text = text.replace("-RRB-", ")")

    # Normalize line endings
    text = text.replace("\r\n", "\n")
    text = text.replace("\r", "\n")

    # Remove tabs
    text = text.replace("\t", " ")

    # Fix words broken across lines:
    # "Initiall\ny" -> "Initially"
    text = re.sub(
        r"(?<=[A-Za-z])\n(?=[a-z])",
        "",
        text,
    )

    # Convert remaining single line breaks to spaces
    text = re.sub(
        r"(?<!\n)\n(?!\n)",
        " ",
        text,
    )

    # Normalize spaces
    text = re.sub(
        r"[ ]+",
        " ",
        text,
    )

    # Normalize excessive blank lines
    text = re.sub(
        r"\n{3,}",
        "\n\n",
        text,
    )

    return text.strip()


def create_text_splitter():
    """
    Create a paragraph and sentence-aware text splitter.
    """

    return RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        length_function=len,
        separators=[
            "\n\n",
            "\n",
            ". ",
            "? ",
            "! ",
            "; ",
            ", ",
            " ",
            "",
        ],
    )


def chunk_text(text: str) -> list[str]:
    """
    Split textbook text into semantically cleaner chunks.
    """

    if not text:
        return []

    splitter = create_text_splitter()

    chunks = splitter.split_text(text)

    cleaned_chunks = []

    for chunk in chunks:
        chunk = chunk.strip()

        if len(chunk) < 100:
            continue

        cleaned_chunks.append(chunk)

    return cleaned_chunks


def process_txt_file(file_path: str) -> list[str]:
    """
    Read and process the complete textbook text file.
    """

    with open(
        file_path,
        "r",
        encoding="utf-8",
        errors="ignore",
    ) as file:
        text = file.read()

    cleaned_text = clean_text(text)

    chunks = chunk_text(cleaned_text)

    # Remove duplicate chunks while preserving order
    unique_chunks = []
    seen = set()

    for chunk in chunks:
        normalized_chunk = chunk.lower().strip()

        if normalized_chunk in seen:
            continue

        seen.add(normalized_chunk)
        unique_chunks.append(chunk)

    return unique_chunks


def save_chunks(chunks: list[str]) -> None:
    """
    Save generated textbook chunks.
    """

    os.makedirs(
        CHUNK_DATA_PATH,
        exist_ok=True,
    )

    output_path = os.path.join(
        CHUNK_DATA_PATH,
        "chunks.txt",
    )

    with open(
        output_path,
        "w",
        encoding="utf-8",
    ) as file:
        for chunk in chunks:
            file.write(chunk)
            file.write("\n\n<<<CHUNK_END>>>\n\n")

    print(f"Chunks saved to: {output_path}")


def main():
    raw_files = os.listdir(RAW_DATA_PATH)

    all_chunks = []

    for file_name in raw_files:
        if not file_name.endswith(".txt"):
            continue

        file_path = os.path.join(
            RAW_DATA_PATH,
            file_name,
        )

        print(f"Processing: {file_name}")

        chunks = process_txt_file(file_path)

        print(
            f"Created {len(chunks)} chunks "
            f"from {file_name}"
        )

        all_chunks.extend(chunks)

    print(
        f"\nTotal chunks created: "
        f"{len(all_chunks)}"
    )

    save_chunks(all_chunks)

    print("\nChunks saved successfully")


if __name__ == "__main__":
    main()