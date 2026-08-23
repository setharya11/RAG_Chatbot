import os
# pyrefly: ignore [missing-import]
from pypdf import PdfReader

from chatbot.embedding_server import generate_embedding
from chatbot.pg_vector_store import insert_chunk


PDF_DIR = "data/pdfs"


def extract_text_from_pdf(pdf_path):
    reader = PdfReader(pdf_path)
    text = ""

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text and len(page_text.strip()) > 50:
            text += page_text + "\n"
        else:
            # Scanned page - extract images and run OCR
            from PIL import Image
            import io
            import pytesseract
            ocr_text = ""
            try:
                for img_file_object in page.images:
                    image = Image.open(io.BytesIO(img_file_object.data))
                    ocr_text += pytesseract.image_to_string(image) + "\n"
            except Exception as e:
                print("OCR PDF Page failed:", e)
            
            if ocr_text.strip():
                text += ocr_text + "\n"
            else:
                text += (page_text or "") + "\n"

    return text


def chunk_text(text, chunk_size=800, overlap=150):
    chunks = []
    start = 0

    while start < len(text):
        end = start + chunk_size
        chunk = text[start:end].strip()

        if chunk:
            chunks.append(chunk)

        start += chunk_size - overlap

    return chunks


def clean_text(text):
    return text.replace("\x00", "").strip()


def index_pdfs():
    pdf_files = [
        f for f in os.listdir(PDF_DIR)
        if f.lower().endswith(".pdf")
    ]

    print(f"PDF files found: {len(pdf_files)}")

    for pdf_file in pdf_files:
        pdf_path = os.path.join(PDF_DIR, pdf_file)

        print(f"\nProcessing PDF: {pdf_file}")

        text = extract_text_from_pdf(pdf_path)
        text = clean_text(text)

        chunks = chunk_text(text)

        print(f"Chunks created: {len(chunks)}")

        for i, chunk in enumerate(chunks):
            embedding = generate_embedding(chunk).tolist()

            content = clean_text(f"Source: {pdf_file}\n\n{chunk}")
            insert_chunk(content, embedding)

            if i % 20 == 0:
                print(f"Inserted {i} chunks")

    print("\nPDF vectorization completed successfully")


if __name__ == "__main__":
    index_pdfs()