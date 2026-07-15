from fastapi import APIRouter, Depends, UploadFile, File
import os
import shutil
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from pydantic import BaseModel
# pyrefly: ignore [missing-import]
from sqlalchemy.sql import func

from db import get_db
from src.models.chat import ChatSession, Message

# RAG function import
try:
    from chatbot.rag import get_rag_answer
# except Exception as e:
#     print("RAG import error:", e)
#     get_rag_answer = None

except Exception:
    import traceback
    traceback.print_exc()
    get_rag_answer = None


router = APIRouter(tags=["Chats"])


class SendMessageRequest(BaseModel):
    user_id: int
    message: str
    session_id: int | None = None


@router.post("/send")
def send_message(
    data: SendMessageRequest,
    db: Session = Depends(get_db)
):

    print("=" * 40)
    print("Received:")
    print("session_id =", data.session_id)
    print("user_id =", data.user_id)
    print("message =", data.message)
    print("=" * 40)

    # Create new chat only if session_id is absent
    if data.session_id is None:

        chat = ChatSession(
            user_id=data.user_id,
            title=data.message[:40]
        )

        db.add(chat)
        db.commit()
        db.refresh(chat)

        session_id = chat.id

    else:
        session_id = data.session_id

    # Save user message
    user_msg = Message(
        session_id=session_id,
        role="user",
        content=data.message
    )

    db.add(user_msg)


   # Get RAG response
    if get_rag_answer:
        bot_reply = get_rag_answer(
            query=data.message,
            db=db,
            session_id=session_id
        )
    else:
        bot_reply = "RAG function is not connected yet."

    bot_msg = Message(
        session_id=session_id,
        role="assistant",
        content=bot_reply
    )

    db.add(bot_msg)

    chat = (
        db.query(ChatSession)
        .filter(ChatSession.id == session_id)
        .first()
    )

    if chat:
        chat.updated_at = func.now()

    db.commit()

    return {
        "session_id": session_id,
        "user_message": data.message,
        "assistant_message": bot_reply
    }


@router.get("/user/{user_id}")
def get_user_chats(user_id: int, db: Session = Depends(get_db)):
    return (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .order_by(ChatSession.updated_at.desc())
        .all()
    )


@router.get("/session/{session_id}/messages")
def get_chat_messages(session_id: int, db: Session = Depends(get_db)):
    return (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )


@router.get("/stats/{user_id}")
def get_user_stats(user_id: int, db: Session = Depends(get_db)):
    import os
    
    chat_count = (
        db.query(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .count()
    )
    
    message_count = (
        db.query(Message)
        .join(ChatSession)
        .filter(ChatSession.user_id == user_id)
        .count()
    )
    
    pdf_dir = "chatbot/data/pdfs"
    pdf_count = 0
    if os.path.exists(pdf_dir):
        pdf_count = len([f for f in os.listdir(pdf_dir) if f.lower().endswith(".pdf")])
    else:
        pdf_dir_alt = "data/pdfs"
        if os.path.exists(pdf_dir_alt):
            pdf_count = len([f for f in os.listdir(pdf_dir_alt) if f.lower().endswith(".pdf")])
            
    return {
        "total_chats": chat_count,
        "total_messages": message_count,
        "total_pdfs": pdf_count,
        "total_favorites": 0,
    }


@router.post("/upload")
def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    pdf_dir = "chatbot/data/pdfs"
    os.makedirs(pdf_dir, exist_ok=True)
    
    file_path = os.path.join(pdf_dir, file.filename)
    
    # Save uploaded PDF to file system
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        from chatbot.pdf_indexer import extract_text_from_pdf, clean_text, chunk_text
        from chatbot.embedding_server import generate_embedding
        from chatbot.pg_vector_store import insert_chunk
        
        # 1. Parse text from PDF
        text = extract_text_from_pdf(file_path)
        text = clean_text(text)
        
        # 2. Divide text into chunks
        chunks = chunk_text(text)
        
        # 3. Generate embeddings and insert into vector db table
        for chunk in chunks:
            emb = generate_embedding(chunk)
            insert_chunk(chunk, emb.tolist())
            
        return {
            "success": True,
            "filename": file.filename,
            "chunks_indexed": len(chunks)
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }


@router.get("/documents")
def list_documents():
    pdf_dir = "chatbot/data/pdfs"
    if not os.path.exists(pdf_dir):
        return []
    
    files = []
    for f in os.listdir(pdf_dir):
        if f.lower().endswith(".pdf"):
            file_path = os.path.join(pdf_dir, f)
            size = os.path.getsize(file_path)
            files.append({
                "name": f,
                "size": size
            })
            
    return files

