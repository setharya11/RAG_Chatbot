# rag.py

import os
import re
import base64

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


def ask_llm(query, context, history=None):
    mode = detect_mode(query)

    if history is None:
        history = []

    system_prompt = get_prompt(mode)

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

Answer the current user question using ONLY facts supported by
<PROVIDED_CONTEXT>.

Return only the final textbook answer.
"""
        }
    ]

    # Process history messages to format text / image attachments
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
            "content": format_message_content(query),
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
def process_retrieved_context(chunks_with_scores):
    # 1. Filter by score (distance < 0.58)
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
        
    # 4. Return top 4-6 chunks (limit to 5)
    return merged[:5]


def get_rag_answer(query, db, session_id, attachments=None):
    query_embedding = generate_embedding(query)

    # Resolve search constraints based on user query attachments
    allowed_sources = None
    exclude_user_uploads = False
    
    if attachments:
        allowed_sources = [f"session_{session_id}_{att.filename}" for att in attachments]
    else:
        exclude_user_uploads = True

    # Search top 12 chunks to extract a rich candidate pool
    results_with_scores = search_chunks_with_scores(
        query_embedding.tolist(),
        top_k=12,
        allowed_sources=allowed_sources,
        exclude_user_uploads=exclude_user_uploads
    )

    # Filter, deduplicate, merge, and slice candidate context
    processed_chunks = process_retrieved_context(results_with_scores)

    # DEBUG: Print processed textbook context blocks
    print("\n===== PROCESSED CONTEXT BLOCKS =====")
    for index, result in enumerate(processed_chunks, start=1):
        print(f"\nBLOCK {index}:")
        print(result)
    print("\n===================================\n")

    context = build_context(processed_chunks)

    history = get_recent_history(
        db=db,
        session_id=session_id
    )

    # Pass the history array to maintain conversational memory
    answer, mode = ask_llm(
        query=query,
        context=context,
        history=history
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