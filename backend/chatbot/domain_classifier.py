import os
import json
from openai import OpenAI

client = OpenAI(
    api_key=os.getenv("OPENROUTER_API_KEY"),
    base_url="https://openrouter.ai/api/v1",
)

CLASSIFICATION_PROMPT = """
You are a domain-aware classifier for a specialized History AI Tutor.
Your task is to analyze the provided extracted text content and determine if it is primarily History-related.

Valid History content includes:
- History textbook pages / chapters
- Historical question papers / exams / MCQs
- Historical maps description / text
- Timelines
- Historical figures / personalities / biographies
- Empires / dynasties / kingdoms
- Revolutions / wars / treaties / conflicts
- Civilizations / ancient cultures
- Freedom movements / political history
- Historical photographs / archaeological descriptions
- Political cartoons related to historical events
- Handwritten history notes

Unrelated content includes:
- Programming code / code snippets / markup / scripting / software instructions
- Software screenshots / terminal outputs / developer tools text
- Mathematics / algebra / calculus / formulas
- Physics / engineering / mechanics
- Chemistry / molecular structures / reactions
- Biology / anatomy / genetics
- Modern movies / pop music / TV shows (unrelated to history)
- Sports / athletics / modern games
- Internet memes / general jokes
- Technical diagrams / network architecture / flowcharts
- Random screenshots / personal social media text

Respond ONLY with "history" if the content is primarily History-related, or "not_history" if it is unrelated.
If you are unsure or confidence is low, respond with "history" to be safe.
Do not add any other text, markdown formatting, or explanation.
"""

def is_history_document(extracted_text: str) -> str:
    """
    Classifies the extracted text using Gemini 2.5 Flash as a lightweight classification model.
    Returns only "history" or "not_history".
    """
    if not extracted_text or not extracted_text.strip():
        # Empty text is return UNKNOWN. Never reject empty text as Programming.
        return "history"
        
    text_preview = extracted_text[:2000].strip()
    
    try:
        messages = [
            {
                "role": "user",
                "content": CLASSIFICATION_PROMPT + f"\n\nINPUT CONTENT PREVIEW:\n{text_preview}"
            }
        ]
        
        response = client.chat.completions.create(
            model="google/gemini-2.5-flash",
            messages=messages,
            temperature=0.1,
            max_tokens=10
        )
        ans = response.choices[0].message.content.strip().lower()
        if "not_history" in ans:
            return "not_history"
        return "history"
    except Exception as err:
        print("lightweight classification failed, defaulting to history:", err)
        return "history"

def validate_attachment_domain(extracted_text: str, file_path: str, mime_type: str = "") -> dict:
    meta_path = f"{file_path}.meta.json"
    
    # Load cached classification if it exists
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print("Failed to read cached meta file:", e)
            
    # Default fallback object
    result = {
        "filename": os.path.basename(file_path),
        "is_history": True,
        "detected_domain": "History",
        "validation_message": ""
    }
    
    subj = is_history_document(extracted_text)
    if subj == "not_history":
        result["is_history"] = False
        result["detected_domain"] = "Programming or unrelated topic"
        result["validation_message"] = (
            "This uploaded document is not related to History. "
            "This assistant is specialized for History textbooks, historical events, historical figures, maps, timelines, and History question papers."
        )
    else:
        result["is_history"] = True
        result["detected_domain"] = "History"
        
    # Write companion meta.json file
    try:
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2)
    except Exception as save_err:
        print("Failed to save companion meta file:", save_err)
        
    return result
