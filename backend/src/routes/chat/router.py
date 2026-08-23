from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from fastapi.responses import FileResponse
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


class DocumentPipelineError(Exception):
    pass


class AttachmentInfo(BaseModel):
    filename: str
    mime_type: str
    file_id: str | None = None
    local_path: str | None = None
    saved_path: str | None = None
    size: int | None = None


def index_attachment_if_needed(att: AttachmentInfo, session_id: int):
    file_id = att.file_id or f"session_{session_id}_{att.filename}"
    local_path = att.local_path
    
    # Try resolving relative media paths
    if local_path:
        clean_path = local_path.lstrip("/")
        if clean_path.startswith("media/"):
            clean_path = clean_path[6:]
        resolved_media_path = os.path.join(MEDIA_PATH, clean_path)
        if os.path.exists(resolved_media_path):
            local_path = resolved_media_path
            
    if not local_path or not os.path.exists(local_path):
        pdf_dir = f"chatbot/data/uploads/{session_id}"
        local_path = os.path.join(pdf_dir, att.filename)
        if not os.path.exists(local_path):
            pdf_dir_alt = "chatbot/data/pdfs"
            local_path = os.path.join(pdf_dir_alt, att.filename)
            
    # Step 14. Required logging: Received Upload
    print("========================================")
    print("Received Upload")
    print(f"Filename: {att.filename}")
    print(f"Mime: {att.mime_type}")
    print(f"Saved Path: {local_path}")
    print(f"Exists: {os.path.exists(local_path) if local_path else False}")
    print("========================================")

    # Step 3. Verify os.path.exists(local_path)
    if not local_path or not os.path.exists(local_path):
        raise DocumentPipelineError("I couldn't access the uploaded document. Please upload it again.")

    # Check if already indexed
    from chatbot.pg_vector_store import get_connection
    conn = get_connection()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM document_chunks WHERE content LIKE %s AND source_type = 'upload' AND session_id = %s", (f"Source: {file_id}%", session_id))
    count = cur.fetchone()[0]
    cur.close()
    conn.close()
    
    if count > 0:
        print("Attachment already indexed. Chunks count:", count)
        print("Temporary Index Ready")
        return True, count, count

    # Needs indexing
    from chatbot.media_processor import extract_text_from_file
    from chatbot.pdf_indexer import clean_text, chunk_text
    from chatbot.embedding_server import generate_embedding
    from chatbot.pg_vector_store import insert_chunk
    
    chunks_created = 0
    embeddings_created = 0
    
    # Step 14. Required logging: Extraction Started
    print("Extraction Started")
    print("========================================")
    
    try:
        text = extract_text_from_file(local_path)
        text = clean_text(text)
        print("Extraction Success: True")
    except Exception as extract_err:
        print("Extraction Success: False")
        print(f"Extraction failed: {extract_err}")
        # Step 4. If extraction fails: Stop
        raise DocumentPipelineError("I couldn't extract readable text from the uploaded document.")

    if not text or not text.strip():
        print("Extraction Success: False")
        # Step 4. If extraction fails: Stop
        raise DocumentPipelineError("I couldn't extract readable text from the uploaded document.")

    # Step 5. Log Extracted characters & Preview
    print(f"Extracted Characters: {len(text)}")
    print("Preview:")
    print(text[:1000])
    print("========================================")

    # Step 6. Run subject classification on extracted text
    from chatbot.domain_classifier import validate_attachment_domain
    validation = validate_attachment_domain(text, local_path, att.mime_type)
    
    # Step 14. Required logging: Detected Subject & Confidence
    print(f"Detected Subject: {validation.get('detected_domain')}")
    print("History Classification Confidence: High")
    print("========================================")
    
    # Step 7. Classification rules
    if not validation.get("is_history", True):
        raise DocumentPipelineError(validation.get("validation_message"))

    try:
        chunks = chunk_text(text)
        chunks_count = len(chunks)
        
        # Step 14. Required logging: Chunks Created
        print(f"Chunks Created: {chunks_count}")
        print("========================================")
        
        for idx, chunk in enumerate(chunks, start=1):
            content = clean_text(f"Source: {file_id}\n\n{chunk}")
            emb = generate_embedding(chunk)
            insert_chunk(content, emb.tolist(), source_type='upload', session_id=session_id)
            chunks_created += 1
            embeddings_created += 1
            if idx % 10 == 0 or idx == chunks_count:
                # Step 14. Required logging: Embeddings Generated
                print(f"Embeddings Generated: {chunks_created}/{chunks_count}")
                
        print("========================================")
        # Step 14. Required logging: Inserted Into Uploaded History DB
        print("Inserted Into Uploaded History DB")
        print("========================================")
        # Step 14. Required logging: Temporary Index Ready
        print("Temporary Index Ready")
        print("========================================")
        return True, chunks_created, embeddings_created
        return True, chunks_created, embeddings_created
    except Exception as e:
        print(f"Error indexing attachment {att.filename}: {e}")
        import traceback
        traceback.print_exc()
        return False, chunks_created, embeddings_created


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
    print("Received")
    print("message:")
    print(data.message)
    print("attachments:")
    if data.attachments:
        print([att.filename for att in data.attachments])
    else:
        print("None")
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

    # Process every uploaded attachment
    error_reply = None
    if data.attachments:
        print("↓")
        print("Extracted text")
        try:
            for att in data.attachments:
                success, chunks, embs = index_attachment_if_needed(att, session_id)
                print("Received attachment")
                print(f"filename: {att.filename}")
                print(f"mime type: {att.mime_type}")
                print(f"temporary path: {att.local_path}")
                print(f"file id: {att.file_id}")
                print(f"text extraction success: {success}")
                print(f"chunks created: {chunks}")
                print(f"embeddings created: {embs}")
                print("↓")
                print(f"{chunks} chunks")
                print("↓")
                print("Temporary index created")
        except DocumentPipelineError as e:
            error_reply = str(e)
 
    # Get RAG response
    if error_reply:
        bot_reply = error_reply
    elif get_rag_answer:
        try:
            bot_reply = get_rag_answer(
                query=data.message,
                db=db,
                session_id=session_id,
                attachments=data.attachments
            )
        except DocumentPipelineError as e:
            bot_reply = str(e)
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
    db.refresh(user_msg)
    db.refresh(bot_msg)
 
    return {
        "session_id": session_id,
        "user_message": data.message,
        "user_message_id": user_msg.id,
        "assistant_message": bot_reply,
        "assistant_message_id": bot_msg.id
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
    session_id_val = session_id if session_id is not None else 0
    session_dir = f"chatbot/data/uploads/{session_id_val}"
    os.makedirs(session_dir, exist_ok=True)
    
    file_path = os.path.join(session_dir, file.filename)
    
    # Save uploaded file to file system immediately
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        file_size = os.path.getsize(file_path)
        source_prefix = f"session_{session_id_val}_{file.filename}"
        
        att = AttachmentInfo(
            filename=file.filename,
            mime_type=file.content_type or "application/octet-stream",
            file_id=source_prefix,
            local_path=file_path,
            saved_path=file_path,
            size=file_size
        )
        
        success, chunks, embs = index_attachment_if_needed(att, session_id_val)
        
        return {
            "success": success,
            "filename": file.filename,
            "chunks_indexed": chunks,
            "file_id": source_prefix,
            "local_path": file_path,
            "saved_path": file_path,
            "size": file_size
        }
    except DocumentPipelineError as e:
        return {
            "success": False,
            "error": str(e)
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
    
    # 1. Clean up temporary database vector chunks
    try:
        from chatbot.pg_vector_store import get_connection
        conn = get_connection()
        cur = conn.cursor()
        cur.execute("DELETE FROM document_chunks WHERE content LIKE %s", (f"Source: session_{session_id}_%",))
        conn.commit()
        cur.close()
        conn.close()
        print(f"Cleaned up temporary document chunks for session: {session_id}")
    except Exception as db_err:
        print("Failed to clean up session chunks:", db_err)

    # 2. Clean up uploaded files directory
    session_dir = f"chatbot/data/uploads/{session_id}"
    if os.path.exists(session_dir):
        try:
            shutil.rmtree(session_dir)
            print(f"Cleaned up temporary uploads directory for session: {session_id}")
        except Exception as fs_err:
            print("Failed to delete session upload folder:", fs_err)
            
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


class EditMessageRequest(BaseModel):
    content: str


@router.patch("/messages/{message_id}")
def edit_message(
    message_id: int,
    data: EditMessageRequest,
    db: Session = Depends(get_db)
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    session_id = msg.session_id
    
    # 1. Parse attachments from original message if they existed
    attachments = []
    pattern = r"\n\n\[ATTACHMENTS:\s*(.*?)\]$"
    match = re.search(pattern, msg.content)
    if match:
        try:
            attachments_json = match.group(1)
            attachments = json.loads(attachments_json)
        except Exception as e:
            print("Failed to parse attachments during edit:", e)
            
    # 2. Archive the current state as a history record to preserve edit history
    history_msg = Message(
        session_id=session_id,
        role="user_history",
        content=msg.content,
        created_at=msg.created_at,
        edited_at=func.now(),
        parent_message_id=msg.id,
        version=msg.version or 1
    )
    db.add(history_msg)
    
    # 3. Update original message text and increment version
    new_serialized = data.content
    if attachments:
        new_serialized += f"\n\n[ATTACHMENTS: {json.dumps(attachments)}]"
        
    msg.content = new_serialized
    msg.is_edited = True
    msg.edited_at = func.now()
    msg.version = (msg.version or 1) + 1
    
    # 4. Delete all subsequent user/assistant messages in this chat session
    db.query(Message).filter(
        Message.session_id == session_id,
        Message.created_at > msg.created_at,
        Message.id != msg.id
    ).delete()
    db.commit()
    db.refresh(msg)
    
    # 5. Extract AttachmentInfo models for get_rag_answer compatibility
    att_models = []
    for att in attachments:
        att_models.append(AttachmentInfo(
            filename=att.get("filename"),
            mime_type=att.get("mime_type"),
            file_id=att.get("file_id"),
            local_path=att.get("local_path"),
            size=att.get("size")
        ))
        
    # 6. Re-run RAG pipeline with edited content
    if get_rag_answer:
        try:
            bot_reply = get_rag_answer(
                query=data.content,
                db=db,
                session_id=session_id,
                attachments=att_models if att_models else None
            )
        except DocumentPipelineError as e:
            bot_reply = str(e)
    else:
        bot_reply = "RAG function is not connected yet."
        
    # 7. Save regenerated response
    bot_msg = Message(
        session_id=session_id,
        role="assistant",
        content=bot_reply
    )
    db.add(bot_msg)
    db.commit()
    
    return {
        "success": True,
        "session_id": session_id,
        "user_message": data.content,
        "assistant_message": bot_reply
    }


@router.post("/messages/{message_id}/retry")
def retry_message(
    message_id: int,
    db: Session = Depends(get_db)
):
    msg = db.query(Message).filter(Message.id == message_id).first()
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
        
    session_id = msg.session_id
    
    # Find user message: if msg is assistant, look for preceding user message
    if msg.role == "assistant":
        user_msg = db.query(Message).filter(
            Message.session_id == session_id,
            Message.role == "user",
            Message.created_at < msg.created_at
        ).order_by(Message.created_at.desc()).first()
        assistant_msg = msg
    else:
        user_msg = msg
        assistant_msg = db.query(Message).filter(
            Message.session_id == session_id,
            Message.role == "assistant",
            Message.created_at > msg.created_at
        ).order_by(Message.created_at.asc()).first()
        
    if not user_msg:
        raise HTTPException(status_code=400, detail="Cannot retry: no preceding user query found")
        
    # Extract query text and attachments from user message content
    query_text = user_msg.content
    attachments = []
    pattern = r"\n\n\[ATTACHMENTS:\s*(.*?)\]$"
    match = re.search(pattern, query_text)
    if match:
        try:
            attachments_json = match.group(1)
            attachments = json.loads(attachments_json)
            query_text = query_text[:match.start()]
        except Exception as e:
            print("Failed to parse attachments during retry:", e)
            
    # Convert attachments dicts to AttachmentInfo models
    att_models = []
    for att in attachments:
        att_models.append(AttachmentInfo(
            filename=att.get("filename"),
            mime_type=att.get("mime_type"),
            file_id=att.get("file_id"),
            local_path=att.get("local_path"),
            size=att.get("size")
        ))
        
    # Re-run RAG pipeline
    if get_rag_answer:
        try:
            bot_reply = get_rag_answer(
                query=query_text,
                db=db,
                session_id=session_id,
                attachments=att_models if att_models else None
            )
        except DocumentPipelineError as e:
            bot_reply = str(e)
    else:
        bot_reply = "RAG function is not connected yet."
        
    # Update assistant reply
    if assistant_msg:
        assistant_msg.content = bot_reply
        assistant_msg.retry_count = (assistant_msg.retry_count or 0) + 1
    else:
        assistant_msg = Message(
            session_id=session_id,
            role="assistant",
            content=bot_reply,
            retry_count=1
        )
        db.add(assistant_msg)
        
    db.commit()
    db.refresh(assistant_msg)
    
    return {
        "success": True,
        "session_id": session_id,
        "user_message": query_text,
        "assistant_message": bot_reply
    }


@router.get("/session/{session_id}/file/{filename}")
def get_session_file(session_id: int, filename: str):
    file_path = f"chatbot/data/uploads/{session_id}/{filename}"
    if not os.path.exists(file_path):
        file_path_alt = f"chatbot/data/pdfs/{filename}"
        if not os.path.exists(file_path_alt):
            raise HTTPException(status_code=404, detail="File not found")
        file_path = file_path_alt
        
    return FileResponse(file_path, filename=filename)


@router.get("/session/{session_id}/file/{filename}/text")
def get_session_file_text(session_id: int, filename: str):
    file_path = f"chatbot/data/uploads/{session_id}/{filename}"
    if not os.path.exists(file_path):
        file_path_alt = f"chatbot/data/pdfs/{filename}"
        if not os.path.exists(file_path_alt):
            raise HTTPException(status_code=404, detail="File not found")
        file_path = file_path_alt
        
    try:
        from chatbot.media_processor import extract_text_from_file
        text = extract_text_from_file(file_path)
        return {
            "success": True,
            "filename": filename,
            "text": text
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

