# rag.py

import os

from dotenv import load_dotenv
# pyrefly: ignore [missing-import]
from openai import OpenAI

from src.models.chat import Message
from chatbot.embedding_server import generate_embedding
from chatbot.pg_vector_store import search_chunks
from chatbot.prompts import get_prompt


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

    messages.extend(history)

    messages.append(
        {
            "role": "user",
            "content": query,
        }
    )

    try:
        response = client.chat.completions.create(
            model="openai/gpt-oss-20b:free",
            messages=messages,
            temperature=0.1,
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
def get_rag_answer(query, db, session_id):
    query_embedding = generate_embedding(query)

    results = search_chunks(
        query_embedding.tolist(),
        top_k=6
    )

    # DEBUG: Print retrieved textbook chunks
    print("\n===== RETRIEVED CONTEXT =====")

    for index, result in enumerate(results, start=1):
        print(f"\nCHUNK {index}:")
        print(result)

    print("\n=============================\n")

    context = build_context(results)

    history = get_recent_history(
        db=db,
        session_id=session_id
    )

    answer, mode = ask_llm(
        query=query,
        context=context,
        # history=[]
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