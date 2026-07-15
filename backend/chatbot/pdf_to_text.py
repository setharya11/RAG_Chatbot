import os

from pypdf import PdfReader

from settings import PDF_DATA_PATH, RAW_DATA_PATH


def clean_text(text: str) -> str:
    return text.replace("\x00", "").strip()


def pdf_to_txt(
    pdf_path: str,
    txt_path: str,
) -> None:
    reader = PdfReader(pdf_path)

    pages = []

    for page_no, page in enumerate(
        reader.pages,
        start=1,
    ):
        page_text = page.extract_text()

        if not page_text:
            continue

        page_text = clean_text(page_text)

        pages.append(
            f"""
===== Page {page_no} =====

{page_text}
""".strip()
        )

    full_text = "\n\n".join(pages)

    with open(
        txt_path,
        "w",
        encoding="utf-8",
    ) as file:
        file.write(full_text)

    print(
        f"Converted: {os.path.basename(pdf_path)}"
    )

    print(
        f"Pages extracted: {len(pages)}"
    )

    print(
        f"Saved at: {txt_path}"
    )


def process_all_pdfs() -> None:
    os.makedirs(
        RAW_DATA_PATH,
        exist_ok=True,
    )

    pdf_files = [
        file_name
        for file_name in os.listdir(PDF_DATA_PATH)
        if file_name.lower().endswith(".pdf")
    ]

    if not pdf_files:
        print("No PDF files found.")
        return

    pdf_files.sort()

    print(
        f"\nFound {len(pdf_files)} PDF files.\n"
    )

    for file_name in pdf_files:
        pdf_path = os.path.join(
            PDF_DATA_PATH,
            file_name,
        )

        txt_file_name = (
            os.path.splitext(file_name)[0]
            + ".txt"
        )

        txt_path = os.path.join(
            RAW_DATA_PATH,
            txt_file_name,
        )

        print("=" * 60)

        pdf_to_txt(
            pdf_path,
            txt_path,
        )

    print("\n" + "=" * 60)

    print(
        f"Successfully processed "
        f"{len(pdf_files)} PDF files."
    )


if __name__ == "__main__":
    process_all_pdfs()