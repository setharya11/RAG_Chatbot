import os
import csv
import zipfile
import xml.etree.ElementTree as ET

from config.environment import MEDIA_PATH

def extract_text_from_txt(file_path: str) -> str:
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        return f.read()

def extract_text_from_csv(file_path: str) -> str:
    text_lines = []
    with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
        reader = csv.reader(f)
        headers = next(reader, None)
        for i, row in enumerate(reader, start=1):
            row_str = f"Row {i}: "
            if headers:
                row_str += ", ".join(f"{h}: {val}" for h, val in zip(headers, row))
            else:
                row_str += ", ".join(row)
            text_lines.append(row_str)
    return "\n".join(text_lines)

def extract_text_from_docx(file_path: str) -> str:
    try:
        with zipfile.ZipFile(file_path) as docx:
            xml_content = docx.read('word/document.xml')
            root = ET.fromstring(xml_content)
            namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
            paragraphs = []
            for p in root.findall('.//w:p', namespaces):
                texts = [t.text for t in p.findall('.//w:t', namespaces) if t.text]
                if texts:
                    paragraphs.append("".join(texts))
            return "\n".join(paragraphs)
    except Exception as e:
        print(f"Error parsing DOCX {file_path}: {e}")
        return ""

def extract_text_from_audio(file_path: str) -> str:
    try:
        import speech_recognition as sr
        r = sr.Recognizer()
        
        ext = os.path.splitext(file_path)[1].lower()
        target_wav = file_path
        temp_wav = None
        
        # If it is not a WAV file, try converting it to WAV via pydub
        if ext != ".wav":
            try:
                from pydub import AudioSegment
                sound = AudioSegment.from_file(file_path)
                temp_wav = file_path + ".temp.wav"
                sound.export(temp_wav, format="wav")
                target_wav = temp_wav
            except Exception as conv_err:
                print(f"Audio conversion failed (requires pydub + ffmpeg): {conv_err}")
                return f"[Audio File: {os.path.basename(file_path)} - Conversion to WAV failed: {conv_err}]"
        
        with sr.AudioFile(target_wav) as source:
            audio_data = r.record(source)
            text = r.recognize_google(audio_data)
            
        if temp_wav and os.path.exists(temp_wav):
            try:
                os.remove(temp_wav)
            except Exception:
                pass
                
        return f"[Audio Transcription of {os.path.basename(file_path)}]\n{text}"
    except Exception as e:
        print(f"Audio transcription error {file_path}: {e}")
        return f"[Audio File: {os.path.basename(file_path)} - Transcription failed: {e}]"

def extract_text_from_file(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    
    if ext == ".pdf":
        from chatbot.pdf_indexer import extract_text_from_pdf
        return extract_text_from_pdf(file_path)
    elif ext in [".txt", ".log", ".json"]:
        return extract_text_from_txt(file_path)
    elif ext == ".csv":
        return extract_text_from_csv(file_path)
    elif ext == ".docx":
        return extract_text_from_docx(file_path)
    elif ext in [".wav", ".mp3", ".m4a", ".mp4"]:
        return extract_text_from_audio(file_path)
    else:
        raise ValueError(f"Unsupported file format: {ext}")
