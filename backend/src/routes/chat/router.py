from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
import os
import shutil
import json
import re
# pyrefly: ignore [missing-import]
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from pydantic import BaseModel

from db import get_db
from src.models.chat import ChatSession, Message
from config.environment import MEDIA_PATH

# RAG function import
try:
    from chatbot.rag import get_rag_answer
except Exception:
    import traceback
    traceback.print_exc()
    get_rag_answer = None


router = APIRouter(tags=["Chats"])


class AttachmentInfo(BaseModel):
    filename: str
    mime_type: str
    file_id: str | None = None


class SendMessageRequest(BaseModel):
    user_id: int
    message: str
    session_id: int | None = None
    attachments: list[AttachmentInfo] | None = None


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
    print("attachments =", data.attachments)
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

    # Serialize attachments inside content
    serialized_content = data.message
    if data.attachments:
        atts_list = [att.dict() for att in data.attachments]
        serialized_content += f"\n\n[ATTACHMENTS: {json.dumps(atts_list)}]"

    # Save user message
    user_msg = Message(
        session_id=session_id,
        role="user",
        content=serialized_content
    )

    db.add(user_msg)

    # Get RAG response
    if get_rag_answer:
        bot_reply = get_rag_answer(
            query=data.message,
            db=db,
            session_id=session_id,
            attachments=data.attachments
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
    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    
    result = []
    for msg in messages:
        content = msg.content
        attachments = []
        
        # Parse [ATTACHMENTS: ...] if it exists
        pattern = r"\n\n\[ATTACHMENTS:\s*(.*?)\]$"
        match = re.search(pattern, content)
        if match:
            try:
                attachments = json.loads(match.group(1))
                content = content[:match.start()]
            except Exception as e:
                print("Failed to parse attachments JSON:", e)
                
        result.append({
            "id": msg.id,
            "session_id": msg.session_id,
            "role": msg.role,
            "text": content,
            "created_at": msg.created_at,
            "attachments": attachments
        })
        
    return result


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
    session_id: int = Form(None),
    db: Session = Depends(get_db)
):
    pdf_dir = "chatbot/data/pdfs"
    os.makedirs(pdf_dir, exist_ok=True)
    
    file_path = os.path.join(pdf_dir, file.filename)
    
    # Save uploaded file to file system
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        from chatbot.media_processor import extract_text_from_file
        from chatbot.pdf_indexer import clean_text, chunk_text
        from chatbot.embedding_server import generate_embedding
        from chatbot.pg_vector_store import insert_chunk
        
        chunks_indexed = 0
        source_prefix = f"session_{session_id}_{file.filename}" if session_id is not None else file.filename
        
        if file.filename.lower().endswith(".pdf"):
            from pypdf import PdfReader
            reader = PdfReader(file_path)
            for page_idx, page in enumerate(reader.pages, start=1):
                page_text = page.extract_text()
                if not page_text:
                    continue
                page_text = clean_text(page_text)
                chunks = chunk_text(page_text)
                for chunk in chunks:
                    content = clean_text(f"Source: {source_prefix}, Page: {page_idx}\n\n{chunk}")
                    emb = generate_embedding(chunk)
                    insert_chunk(content, emb.tolist())
                    chunks_indexed += 1
        else:
            # 1. Parse text from the media/document file
            text = extract_text_from_file(file_path)
            text = clean_text(text)
            
            # 2. Divide text into chunks
            chunks = chunk_text(text)
            
            # 3. Generate embeddings and insert into vector db table with source prefix
            for chunk in chunks:
                content = clean_text(f"Source: {source_prefix}\n\n{chunk}")
                emb = generate_embedding(chunk)
                insert_chunk(content, emb.tolist())
                chunks_indexed += 1
            
        return {
            "success": True,
            "filename": file.filename,
            "chunks_indexed": chunks_indexed,
            "file_id": source_prefix
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
    
    supported_exts = {".pdf", ".txt", ".log", ".json", ".csv", ".docx", ".wav", ".mp3", ".m4a", ".mp4"}
    files = []
    for f in os.listdir(pdf_dir):
        ext = os.path.splitext(f)[1].lower()
        if ext in supported_exts:
            file_path = os.path.join(pdf_dir, f)
            size = os.path.getsize(file_path)
            files.append({
                "name": f,
                "size": size
            })
            
    return files


class CreateSessionRequest(BaseModel):
    user_id: int
    title: str | None = "New Chat"


@router.post("/session/create")
def create_chat_session(
    data: CreateSessionRequest,
    db: Session = Depends(get_db)
):
    chat = ChatSession(
        user_id=data.user_id,
        title=data.title
    )
    db.add(chat)
    db.commit()
    db.refresh(chat)
    return {
        "success": True,
        "session_id": chat.id
    }


class RenameSessionRequest(BaseModel):
    title: str


@router.patch("/session/{session_id}/title")
def rename_chat_session(
    session_id: int,
    data: RenameSessionRequest,
    db: Session = Depends(get_db)
):
    chat = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    chat.title = data.title
    db.commit()
    db.refresh(chat)
    return {
        "success": True,
        "session_id": session_id,
        "new_title": chat.title
    }


@router.delete("/session/{session_id}")
def delete_chat_session(
    session_id: int,
    db: Session = Depends(get_db)
):
    chat = db.query(ChatSession).filter(ChatSession.id == session_id).first()
    if not chat:
        raise HTTPException(status_code=404, detail="Chat session not found")
    
    db.delete(chat)
    db.commit()
    return {
        "success": True,
        "message": "Chat session deleted successfully"
    }


@router.post("/upload-image")
def upload_image(
    file: UploadFile = File(...)
):
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in [".png", ".jpg", ".jpeg", ".webp"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPG, JPEG, and WEBP image uploads are supported.")
        
    chat_attachments_dir = os.path.join(MEDIA_PATH, "chat_attachments")
    os.makedirs(chat_attachments_dir, exist_ok=True)
    
    file_path = os.path.join(chat_attachments_dir, file.filename)
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    return {
        "success": True,
        "filename": file.filename,
        "url": f"/media/chat_attachments/{file.filename}"
    }

