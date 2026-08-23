# rag.py

import os,re,base64,json

from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from openai import OpenAI

from src.models.chat import Message
from chatbot.embedding_server import generate_embedding
from chatbot.pg_vector_store import search_chunks, search_chunks_with_scores
from chatbot.prompts import get_prompt
from config.environment import MEDIA_PATH


load_dotenv()


client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)


def detect_mode(query: str) -> str:
    query_lower = query.lower()

    concise_keywords = [
        "short",
        "brief",
        "concise",
        "quick",
        "summarize",
        "summarise",
        "in short",
    ]

    professor_keywords = [
        "detailed",
        "deep",
        "professional",
        "expert",
        "professor",
        "complete explanation",
        "advanced",
        "in detail",
        "explain deeply",
    ]

    if any(keyword in query_lower for keyword in concise_keywords):
        return "concise"

    if any(keyword in query_lower for keyword in professor_keywords):
        return "professor"

    return "moderate"


def build_context(results) -> str:
    if not results:
        return "NO RELEVANT CONTEXT RETRIEVED."

    formatted_chunks = []

    for index, result in enumerate(results, start=1):
        cleaned_result = str(result).strip()

        if not cleaned_result:
            continue

        formatted_chunks.append(
            f"[TEXTBOOK CHUNK {index}]\n"
            f"{cleaned_result}\n"
            f"[END TEXTBOOK CHUNK {index}]"
        )

    if not formatted_chunks:
        return "NO RELEVANT CONTEXT RETRIEVED."

    return "\n\n".join(formatted_chunks)


def get_recent_history(db, session_id, limit: int = 6):
    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.desc())
        .limit(limit)
        .all()
    )

    messages.reverse()

    history = []

    for msg in messages:
        role = str(msg.role).lower()

        if role not in {"user", "assistant"}: continue

        content = str(msg.content).strip()

        if not content: continue

        history.append(
            {
                "role": role,
                "content": content,
            }
        )

    print("\n===== HISTORY SENT TO LLM =====")

    for msg in history:
        print(f"{msg['role']}: {msg['content']}")

    print("================================\n")

    return history


def format_message_content(content_str):
    image_paths = re.findall(r'\[IMAGE:\s*([^\]]+)\]', content_str)
    if not image_paths:
        return content_str
        
    clean_text = re.sub(r'\[IMAGE:\s*([^\]]+)\]', '', content_str).strip()
    
    content_list = []
    if clean_text:
        content_list.append({"type": "text", "text": clean_text})
        
    for path in image_paths:
        local_filename = os.path.basename(path)
        local_path = os.path.join(MEDIA_PATH, "chat_attachments", local_filename)
        
        if not os.path.exists(local_path):
            local_path = path.lstrip("/")
            
        if os.path.exists(local_path):
            mime_type = "image/jpeg"
            if path.lower().endswith(".png"):
                mime_type = "image/png"
            elif path.lower().endswith(".webp"):
                mime_type = "image/webp"
                
            try:
                with open(local_path, "rb") as img_file:
                    encoded = base64.b64encode(img_file.read()).decode("utf-8")
                content_list.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime_type};base64,{encoded}"
                    }
                })
            except Exception as e:
                print(f"Error base64 encoding image {local_path}: {e}")
                
    if not content_list:
        return content_str
        
    return content_list


def ask_llm(query, context, history=None, attachments=None):
    mode = detect_mode(query)

    if history is None:
        history = []

    system_prompt = get_prompt(mode)

    query_lower = query.lower().strip().rstrip(".?!")
    solve_paper_phrases = ["answer these questions", "solve this paper", "give answers", "answer all", "solve paper", "solve the paper"]
    is_solve_paper = any(phrase in query_lower for phrase in solve_paper_phrases)

    instruction = """Answer the current user question using ONLY facts supported by
<PROVIDED_CONTEXT>."""
    if attachments:
        if is_solve_paper:
            instruction = """The user has uploaded a History document (such as a question paper or worksheet) and wants you to solve it.
Your task is to:
1. Carefully detect all the questions present in the <PROVIDED_CONTEXT> extracted from the uploaded document.
2. Answer each question sequentially and completely using clear, numbered formatting (e.g., '1. Question: ... \nAnswer: ...').
3. Utilize the historical details in the retrieved context to provide accurate, high-quality, exam-oriented responses.
Do not ask the user to specify a question number. Answer all detected questions sequentially."""
        else:
            instruction = """Answer the current user question (e.g. solve or answer the questions from the document) using your historical expertise and the context provided in <PROVIDED_CONTEXT>."""

    messages = [
        {
            "role": "system",
            "content": f"""
{system_prompt}

==================================================
RETRIEVED TEXTBOOK CONTEXT
==================================================

<PROVIDED_CONTEXT>

{context}

</PROVIDED_CONTEXT>

==================================================
CURRENT ANSWER INSTRUCTION
==================================================

{instruction}

Return only the final textbook answer.
"""
        }
    ]

    # For uploaded document analysis, send ONLY System Prompt, Context, and current Query
    # Omit conversation history to prevent old logs/warnings/incorrect answers from polluting
    if not attachments:
        formatted_history = []
        for msg in history:
            formatted_history.append({
                "role": msg["role"],
                "content": format_message_content(msg["content"])
            })
        messages.extend(formatted_history)

    # Process current user query
    messages.append(
        {
            "role": "user",
            "content": format_message_content(query)
        }
    )

    try:
        response = client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=messages,
            temperature=0.1,
            max_tokens=2048,
        )

        answer = response.choices[0].message.content

        return answer, mode

    except Exception as e:
        print("LLM ERROR:", e)

        if "429" in str(e):
            return (
                "The AI service is currently busy due to rate limits. "
                "Please try again in a few moments.",
                mode,
            )

        return (
            "Sorry, I couldn't generate a response right now.",
            mode,
        )
def process_retrieved_context(chunks_with_scores, skip_score_filter=False, limit=5):
    # 1. Filter by score (distance < 0.58)
    if skip_score_filter:
        filtered = chunks_with_scores
    else:
        filtered = [item for item in chunks_with_scores if item[1] < 0.58]
    
    # 2. Deduplicate
    seen_text = set()
    unique_chunks = []
    for content, score in filtered:
        normalized = content.strip()
        if normalized not in seen_text:
            seen_text.add(normalized)
            unique_chunks.append(content)
            
    # 3. Merge adjacent/similar source chunks
    merged = []
    grouped_bodies = {}
    for chunk in unique_chunks:
        parts = chunk.split("\n\n", 1)
        if len(parts) == 2:
            header, body = parts[0].strip(), parts[1].strip()
        else:
            header, body = "General Context", chunk.strip()
            
        if header in grouped_bodies:
            if body not in grouped_bodies[header]:
                grouped_bodies[header].append(body)
        else:
            grouped_bodies[header] = [body]
            
    for header, bodies in grouped_bodies.items():
        merged.append(f"{header}\n\n" + "\n... ".join(bodies))
        
    # 4. Return top chunks
    if limit is None:
        return merged
    return merged[:limit]


def get_session_attachments(db, session_id: int) -> list:
    from src.models.chat import Message
    import json
    import re
    from config.environment import MEDIA_PATH
    
    attachments = []
    seen_ids = set()
    
    if not session_id:
        return attachments
        
    messages = db.query(Message).filter(
        Message.session_id == session_id,
        Message.role == "user"
    ).all()
    
    pattern = r"\n\n\[ATTACHMENTS:\s*(.*?)\]$"
    for msg in messages:
        match = re.search(pattern, msg.content)
        if match:
            try:
                atts = json.loads(match.group(1))
                for att in atts:
                    fid = att.get("file_id")
                    if fid and fid not in seen_ids:
                        # Resolve path of the attachment
                        local_path = att.get("local_path")
                        filename = att.get("filename")
                        
                        path_to_check = None
                        if local_path:
                            clean_path = local_path.lstrip("/")
                            if clean_path.startswith("media/"):
                                clean_path = clean_path[6:]
                            resolved_media_path = os.path.join(MEDIA_PATH, clean_path)
                            if os.path.exists(resolved_media_path):
                                path_to_check = resolved_media_path
                                
                        if not path_to_check:
                            pdf_dir = f"chatbot/data/uploads/{session_id}"
                            check_path = os.path.join(pdf_dir, filename)
                            if os.path.exists(check_path):
                                path_to_check = check_path
                            else:
                                check_path_alt = os.path.join("chatbot/data/pdfs", filename)
                                if os.path.exists(check_path_alt):
                                    path_to_check = check_path_alt
                                    
                        # Check if it was previously classified as non-History
                        if path_to_check:
                            meta_path = f"{path_to_check}.meta.json"
                            if os.path.exists(meta_path):
                                with open(meta_path, "r", encoding="utf-8") as f:
                                    meta_data = json.load(f)
                                if not meta_data.get("is_history", True):
                                    # Skip non-History attachments from previous turns
                                    continue
                                    
                        seen_ids.add(fid)
                        attachments.append(att)
            except Exception as e:
                print("Error parsing session attachments:", e)
                
    return attachments


def get_rag_answer(query, db, session_id, attachments=None):
    query_embedding = generate_embedding(query)

    # Resolve search constraints based on user query attachments or session history
    resolved_attachments = attachments
    if not resolved_attachments and session_id:
        resolved_attachments = get_session_attachments(db, session_id)
        
    # Domain-aware validation for resolved attachments
    if resolved_attachments:
        from src.routes.chat.router import DocumentPipelineError
        for att in resolved_attachments:
            path_to_check = None
            if isinstance(att, dict):
                local_path = att.get("local_path")
                filename = att.get("filename")
                mime_type = att.get("mime_type") or ""
            else:
                local_path = att.local_path
                filename = att.filename
                mime_type = att.mime_type or ""
                
            # Resolve path under MEDIA_PATH if it is a media URL
            if local_path:
                clean_path = local_path.lstrip("/")
                if clean_path.startswith("media/"):
                    clean_path = clean_path[6:]
                resolved_media_path = os.path.join(MEDIA_PATH, clean_path)
                if os.path.exists(resolved_media_path):
                    local_path = resolved_media_path
                    
            if local_path and os.path.exists(local_path):
                path_to_check = local_path
            else:
                pdf_dir = f"chatbot/data/uploads/{session_id}"
                check_path = os.path.join(pdf_dir, filename)
                if os.path.exists(check_path):
                    path_to_check = check_path
                else:
                    check_path_alt = os.path.join("chatbot/data/pdfs", filename)
                    if os.path.exists(check_path_alt):
                        path_to_check = check_path_alt
                        
            if path_to_check:
                meta_path = f"{path_to_check}.meta.json"
                if os.path.exists(meta_path):
                    with open(meta_path, "r", encoding="utf-8") as f:
                        meta_data = json.load(f)
                    if not meta_data.get("is_history", True):
                        if attachments is not None:
                            raise DocumentPipelineError(meta_data.get("validation_message"))
                        else:
                            continue
                else:
                    # Dynamically run extraction and validation
                    if not os.path.exists(path_to_check):
                        if attachments is not None:
                            raise DocumentPipelineError("I couldn't access the uploaded document. Please upload it again.")
                        else:
                            continue
                    try:
                        from chatbot.media_processor import extract_text_from_file
                        text = extract_text_from_file(path_to_check)
                    except Exception:
                        if attachments is not None:
                            raise DocumentPipelineError("I couldn't extract readable text from the uploaded document.")
                        else:
                            continue
                    if not text or not text.strip():
                        if attachments is not None:
                            raise DocumentPipelineError("I couldn't extract readable text from the uploaded document.")
                        else:
                            continue
                    
                    from chatbot.domain_classifier import validate_attachment_domain
                    validation = validate_attachment_domain(text, path_to_check, mime_type)
                    if not validation.get("is_history", True):
                        if attachments is not None:
                            raise DocumentPipelineError(validation.get("validation_message"))
                        else:
                            continue

    allowed_sources = None
    exclude_user_uploads = False
    
    if resolved_attachments:
        allowed_sources = []
        for att in resolved_attachments:
            if isinstance(att, dict):
                allowed_sources.append(att.get("file_id") or f"session_{session_id}_{att.get('filename')}")
            else:
                allowed_sources.append(att.file_id or f"session_{session_id}_{att.filename}")
        top_k = 60
        limit = None
    else:
        exclude_user_uploads = True
        top_k = 12
        limit = 5

    # 9. Retrieval Priority: Uploaded document temporary index first, then fallback to History DB
    results_with_scores = []
    if allowed_sources:
        results_with_scores = search_chunks_with_scores(
            query_embedding.tolist(),
            top_k=top_k,
            allowed_sources=allowed_sources,
            exclude_user_uploads=False,
            source_type='upload',
            session_id=session_id
        )
        
    # If no chunks were retrieved or no uploaded documents exist, fall back to permanent textbook KB
    if not results_with_scores:
        results_with_scores = search_chunks_with_scores(
            query_embedding.tolist(),
            top_k=12,
            allowed_sources=None,
            exclude_user_uploads=True,
            source_type='textbook',
            session_id=0
        )

    # Step 14. Required logging: Retrieved Chunks & Sending Context to LLM
    print("========================================")
    print("Retrieved Chunks:")
    for content, score in results_with_scores[:5]:
        header = content.split("\n\n")[0] if "\n\n" in content else "Chunk"
        print(f"- Source: {header} | Score (Distance): {score:.4f}")
    print("========================================")
    print("Sending Context to LLM")
    print("========================================")

    # Filter, deduplicate, merge, and slice candidate context
    processed_chunks = process_retrieved_context(
        results_with_scores,
        skip_score_filter=(allowed_sources is not None),
        limit=limit
    )

    context = build_context(processed_chunks)

    history = get_recent_history(
        db=db,
        session_id=session_id
    )

    # Pass the history array to maintain conversational memory
    answer, mode = ask_llm(
        query=query,
        context=context,
        history=history,
        attachments=resolved_attachments
    )

    return answer

def save_chat(db, session_id, query, answer):
    user_message = Message(
        session_id=session_id,
        role="user",
        content=query,
    )

    assistant_message = Message(
        session_id=session_id,
        role="assistant",
        content=answer,
    )

    db.add(user_message)
    db.add(assistant_message)

    db.commit()

# def main():
#     print("\nRAG Chatbot Ready")
#     print("Type 'exit' to quit\n")

#     while True:
#         query = input("Ask Question: ")

#         if query.lower() == "exit":
#             print("\nExiting chatbot...\n")
#             break


#         answer = get_rag_answer(query,db, session_id)

#         print("\nFinal Answer:\n")
#         print(answer)
#         print("\n" + "=" * 80 + "\n")


# if __name__ == "__main__":
#     main()