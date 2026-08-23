"use client";


import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { motion } from "motion/react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import MagicBento from "@/components/MagicBento";
import DotField from "@/components/DotField";
import { getUserSnapshot } from "@/lib/auth-storage";

type ChatAttachment = {
  filename: string;
  mime_type: string;
  file_id: string;
  local_path?: string;
  size?: number;
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  attachments?: ChatAttachment[];
};

const API_BASE = "http://127.0.0.1:8000";

export default function DashboardPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlSessionId = searchParams?.get("session_id");

  const inputId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    const prompt = searchParams?.get("prompt");
    if (prompt && urlSessionId === "new") {
      setInput(prompt);
      const params = new URLSearchParams(window.location.search);
      params.delete("prompt");
      router.replace(`/dashboard?${params.toString()}`);
    }
  }, [searchParams, urlSessionId, router]);

  useEffect(() => {
    if (messages.length > 0) {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [messages]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [currentSessionId, setCurrentSessionId] = useState<number | null>(null);
  const skipFetchRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [attachedPreviews, setAttachedPreviews] = useState<{ 
    id: string; 
    name: string; 
    type: "image" | "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "text" | "csv" | "audio" | "video" | "archive" | "code"; 
    url: string;
    sizeStr: string;
  }[]>([]);
  const [uploadingStatus, setUploadingStatus] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [reactions, setReactions] = useState<Record<string, "like" | "dislike" | null>>({});
  const [activeViewFile, setActiveViewFile] = useState<ChatAttachment | null>(null);
  const [viewFileText, setViewFileText] = useState<string | null>(null);
  const [viewFileLoading, setViewFileLoading] = useState(false);

  function handleToggleReaction(messageId: string, type: "like" | "dislike") {
    setReactions((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === type ? null : type
    }));
  }

  useEffect(() => {
    return () => {
      attachedPreviews.forEach((preview) => {
        if (preview.type === "image" && preview.url) {
          URL.revokeObjectURL(preview.url);
        }
      });
    };
  }, [attachedPreviews]);

  function formatBytes(bytes: number, decimals = 1) {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  }

  const handleAttachmentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const fileList = Array.from(files);
    const newFiles = [...attachedFiles];
    const newPreviews = [...attachedPreviews];

    fileList.forEach((file) => {
      if (newFiles.some((f) => f.name === file.name && f.size === file.size)) return;

      const type = file.type;
      const isImage = type.startsWith("image/") || file.name.toLowerCase().endsWith(".webp");
      const nameLower = file.name.toLowerCase();
      const sizeStr = formatBytes(file.size);

      if (isImage) {
        newFiles.push(file);
        const url = URL.createObjectURL(file);
        newPreviews.push({
          id: `${file.name}-${file.size}`,
          name: file.name,
          type: "image",
          url,
          sizeStr,
        });
      } else {
        let docType: "pdf" | "doc" | "docx" | "xls" | "xlsx" | "ppt" | "pptx" | "text" | "csv" | "audio" | "video" | "archive" | "code" | null = null;
        if (nameLower.endsWith(".pdf")) docType = "pdf";
        else if (nameLower.endsWith(".doc")) docType = "doc";
        else if (nameLower.endsWith(".docx")) docType = "docx";
        else if (nameLower.endsWith(".xls")) docType = "xls";
        else if (nameLower.endsWith(".xlsx")) docType = "xlsx";
        else if (nameLower.endsWith(".ppt")) docType = "ppt";
        else if (nameLower.endsWith(".pptx")) docType = "pptx";
        else if (nameLower.endsWith(".csv")) docType = "csv";
        else if (nameLower.endsWith(".zip") || nameLower.endsWith(".tar") || nameLower.endsWith(".gz")) docType = "archive";
        else if (nameLower.endsWith(".json") || nameLower.endsWith(".xml") || nameLower.endsWith(".html") || nameLower.endsWith(".js") || nameLower.endsWith(".ts")) docType = "code";
        else if (nameLower.endsWith(".txt") || nameLower.endsWith(".log") || nameLower.endsWith(".md") || nameLower.endsWith(".rtf")) docType = "text";
        else if (nameLower.endsWith(".wav") || nameLower.endsWith(".mp3") || nameLower.endsWith(".m4a")) docType = "audio";
        else if (nameLower.endsWith(".mp4")) docType = "video";

        if (docType) {
          newFiles.push(file);
          newPreviews.push({
            id: `${file.name}-${file.size}`,
            name: file.name,
            type: docType,
            url: "",
            sizeStr,
          });
        } else {
          alert(`Unsupported file format: ${file.name}. Supported formats: PDF, Word, Excel, PowerPoint, Text, CSV, code files, archives, images, and audio/video.`);
        }
      }
    });

    setAttachedFiles(newFiles);
    setAttachedPreviews(newPreviews);

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (id: string, index: number) => {
    const preview = attachedPreviews[index];
    if (preview && preview.type === "image" && preview.url) {
      URL.revokeObjectURL(preview.url);
    }
    setAttachedFiles((prev) => prev.filter((_, i) => i !== index));
    setAttachedPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  // const scrollToBottom = useCallback(() => {
  //   queueMicrotask(() => {
  //     listRef.current?.scrollTo({
  //       top: listRef.current.scrollHeight,
  //       behavior: "smooth",
  //     });
  //   });
  // }, []);

  useEffect(() => {
    async function loadChat() {
      if (skipFetchRef.current) {
        skipFetchRef.current = false;
        if (urlSessionId) {
          setCurrentSessionId(Number(urlSessionId));
        }
        return;
      }

      try {
        if (!urlSessionId || urlSessionId === "new") {
          setCurrentSessionId(null);
          setMessages([]);
          return;
        }

        const activeSessionId = Number(urlSessionId);
        if (currentSessionId !== activeSessionId) {
          setCurrentSessionId(activeSessionId);
        }

        const msgRes = await fetch(
          `${API_BASE}/chats/session/${activeSessionId}/messages`
        );

        const oldMessages = await msgRes.json();

        setMessages([]);

        if (Array.isArray(oldMessages)) {
          setMessages(
            oldMessages.map((m: any) => ({
              id: String(m.id),
              role: m.role,
              text: m.text || "",
              attachments: m.attachments || [],
            }))
          );
        }
        // scrollToBottom();
      } catch (error) {
        console.log("Could not load chat", error);
      }
    }

    loadChat();
  }, [urlSessionId]);

  useEffect(() => {
    console.log("URL Session:", urlSessionId);
    console.log("Current Session:", currentSessionId);
  }, [urlSessionId, currentSessionId]);


  async function handleEditMessage(messageId: string, newContent: string) {
    if (loading || !newContent.trim()) return;
    setLoading(true);
    setUploadingStatus("Searching history...");
    
    try {
      const res = await fetch(`${API_BASE}/chats/messages/${messageId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: newContent }),
      });
      
      if (!res.ok) throw new Error("Failed to edit message");
      const data = await res.json();
      
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === messageId);
        if (idx === -1) return prev;
        
        // Update user message text
        const updatedUser = { ...prev[idx], text: newContent };
        
        // Keep messages up to edited message, and append assistant reply
        return prev.slice(0, idx).concat(updatedUser, {
          id: String(data.assistant_message_id || `a-${crypto.randomUUID()}`),
          role: "assistant",
          text: data.assistant_message || "No response from backend"
        });
      });
      
      setEditingMessageId(null);
      setEditText("");
    } catch (err) {
      console.error(err);
      alert("Could not update message");
    } finally {
      setLoading(false);
      setUploadingStatus(null);
    }
  }

  async function handleRetryMessage(messageId: string) {
    if (loading) return;
    setLoading(true);
    setUploadingStatus("Retrieving context...");
    
    try {
      const res = await fetch(`${API_BASE}/chats/messages/${messageId}/retry`, {
        method: "POST",
      });
      
      if (!res.ok) throw new Error("Failed to retry message");
      const data = await res.json();
      
      setMessages((prev) => {
        return prev.map((m) => {
          if (m.id === messageId) {
            return {
              ...m,
              text: data.assistant_message || "No response from backend"
            };
          }
          return m;
        });
      });
    } catch (err) {
      console.error(err);
      alert("Could not regenerate response");
    } finally {
      setLoading(false);
      setUploadingStatus(null);
    }
  }

  function handleCopyMessage(text: string) {
    void navigator.clipboard.writeText(text);
    alert("Copied to clipboard!");
  }

  async function handleOpenDocumentViewer(att: ChatAttachment, sessionId: number | string | null) {
    setActiveViewFile(att);
    setViewFileText("");
    setViewFileLoading(true);
    
    const sId = sessionId || currentSessionId || urlSessionId || 0;
    
    try {
      const res = await fetch(`${API_BASE}/chats/session/${sId}/file/${encodeURIComponent(att.filename)}/text`);
      if (!res.ok) throw new Error("Failed to load text");
      const data = await res.json();
      if (data.success) {
        setViewFileText(data.text || "Document text is empty.");
      } else {
        setViewFileText("Failed to retrieve text content.");
      }
    } catch (err: any) {
      console.error(err);
      setViewFileText("Could not load document content. Try downloading the file instead.");
    } finally {
      setViewFileLoading(false);
    }
  }


  async function sendQuestion(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const q = input.trim();
    if ((!q && attachedFiles.length === 0) || loading) return;

    setLoading(true);
    setInput("");

    const filesToUpload = [...attachedFiles];
    const previewsToClear = [...attachedPreviews];

    // Create temporary attachments list to display immediately in the chat bubble
    const tempAttachments = previewsToClear.map((preview) => ({
      filename: preview.name,
      mime_type: preview.type === "image" ? "image/png" : "application/octet-stream",
      file_id: preview.id,
      size: filesToUpload.find((f) => f.name === preview.name)?.size || 0
    }));

    const userMsgId = `u-${crypto.randomUUID()}`;
    const userMsg: ChatMessage = {
      id: userMsgId,
      role: "user",
      text: q || (tempAttachments.length > 0 ? `Sent ${tempAttachments.length} attachment(s)` : ""),
      attachments: tempAttachments,
    };

    // Add user message to UI immediately
    setMessages((prev) => [...prev, userMsg]);

    // Clear composer box and uploads list instantly to remove latency
    setAttachedFiles([]);
    setAttachedPreviews([]);

    let uploadErrors: string[] = [];
    let activeSessionId = urlSessionId && urlSessionId !== "new"
      ? Number(urlSessionId)
      : null;

    const userSnapshot = getUserSnapshot();
    const currentUserId = userSnapshot?.user_id || 1;

    // 1. Initialize chat session if new and files are attached
    if (!activeSessionId && filesToUpload.length > 0) {
      setUploadingStatus("Initializing chat...");
      try {
        const initRes = await fetch(`${API_BASE}/chats/session/create`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: currentUserId,
            title: q.substring(0, 40) || "New Chat",
          }),
        });
        if (!initRes.ok) throw new Error("Failed to initialize chat session");
        const initData = await initRes.json();
        if (initData.session_id) {
          activeSessionId = initData.session_id;
          setCurrentSessionId(activeSessionId);
          skipFetchRef.current = true;
          router.replace(`/dashboard?session_id=${activeSessionId}`);
        }
      } catch (err: any) {
        console.error(err);
        alert(`Could not start chat: ${err.message}`);
        setLoading(false);
        setUploadingStatus(null);
        return;
      }
    }

    const attachmentPayloads: ChatAttachment[] = [];

    // 2. Upload attachments sequentially
    try {
      if (filesToUpload.length > 0) {
        setUploadingStatus("Uploading files...");
        for (const file of filesToUpload) {
          const isImage = file.type.startsWith("image/") || file.name.toLowerCase().endsWith(".webp");
          
          try {
            const formData = new FormData();
            formData.append("file", file);
            if (activeSessionId) {
              formData.append("session_id", String(activeSessionId));
            }
            
            if (!isImage) {
              setUploadingStatus(`Indexing file: ${file.name}...`);
              const res = await fetch(`${API_BASE}/chats/upload`, {
                method: "POST",
                body: formData,
              });
              if (!res.ok) throw new Error(`Failed to index ${file.name}`);
              const data = await res.json();
              if (!data.success) {
                throw new Error(data.error || `Could not index file: ${file.name}`);
              }
              attachmentPayloads.push({
                filename: file.name,
                mime_type: file.type || "application/octet-stream",
                file_id: data.file_id || `session_${activeSessionId}_${file.name}`,
                local_path: data.local_path || "",
                size: data.size || file.size
              });
            } else {
              setUploadingStatus(`Uploading image: ${file.name}...`);
              const res = await fetch(`${API_BASE}/chats/upload-image`, {
                method: "POST",
                body: formData,
              });
              if (!res.ok) throw new Error(`Failed to upload ${file.name}`);
              const data = await res.json();
              if (data.success && data.url) {
                attachmentPayloads.push({
                  filename: file.name,
                  mime_type: file.type || "image/png",
                  file_id: data.url,
                  local_path: data.url,
                  size: file.size
                });
              } else {
                throw new Error(`Could not upload image: ${file.name}`);
              }
            }
          } catch (err: any) {
            console.error(err);
            uploadErrors.push(err.message || String(err));
          }
        }
        
        previewsToClear.forEach((preview) => {
          if (preview.type === "image" && preview.url) {
            URL.revokeObjectURL(preview.url);
          }
        });
        setUploadingStatus(null);
      }

      if (uploadErrors.length > 0) {
        alert(`Some files failed to process:\n${uploadErrors.join("\n")}`);
      }

      const promptText = q || (attachmentPayloads.length > 0 ? `Sent ${attachmentPayloads.length} attachment(s)` : "");

      // 3. Submit instruction and attachment mappings separately
      const res = await fetch(`${API_BASE}/chats/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: currentUserId,
          message: promptText,
          session_id: activeSessionId,
          attachments: attachmentPayloads,
        }),
      });

      if (!res.ok) throw new Error("Backend error");

      const data = await res.json();

      if (data.session_id) {
        setCurrentSessionId(data.session_id);

        if (!urlSessionId) {
          skipFetchRef.current = true;
          router.replace(`/dashboard?session_id=${data.session_id}`);
        }
      }

      // Replace temporary userMsgId with the actual database ID, and append assistant reply with its actual database ID
      setMessages((prev) => {
        return prev.map((m) => {
          if (m.id === userMsgId && data.user_message_id) {
            return { ...m, id: String(data.user_message_id) };
          }
          return m;
        }).concat({
          id: String(data.assistant_message_id || `a-${crypto.randomUUID()}`),
          role: "assistant",
          text: data.assistant_message || "No response from backend"
        });
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${crypto.randomUUID()}`,
          role: "assistant",
          text: "Error: backend is not connected or API failed.",
        },
      ]);
    } finally {
      setLoading(false);
      setUploadingStatus(null);
    }
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      const mockEvent = {
        target: { files }
      } as unknown as React.ChangeEvent<HTMLInputElement>;
      handleAttachmentChange(mockEvent);
    }
  };

  function renderFileIcon(filename: string, size = 18) {
    const nameLower = filename.toLowerCase();
    if (nameLower.endsWith(".pdf")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (nameLower.endsWith(".doc") || nameLower.endsWith(".docx") || nameLower.endsWith(".rtf")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (nameLower.endsWith(".xls") || nameLower.endsWith(".xlsx") || nameLower.endsWith(".csv")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (nameLower.endsWith(".ppt") || nameLower.endsWith(".pptx")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#f97316" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (nameLower.endsWith(".zip") || nameLower.endsWith(".tar") || nameLower.endsWith(".gz")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#a855f7" strokeWidth="2.5">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    }
    if (nameLower.endsWith(".png") || nameLower.endsWith(".jpg") || nameLower.endsWith(".jpeg") || nameLower.endsWith(".webp")) {
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#ec4899" strokeWidth="2.5">
          <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <polyline points="21 15 16 10 5 21" />
        </svg>
      );
    }
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2.5">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </svg>
    );
  }

  function getFileTypeLabel(filename: string) {
    const ext = filename.split('.').pop()?.toUpperCase() || "";
    return ext ? `${ext} Document` : "Document";
  }

  function renderMessageText(content: string) {
    const regex = /\[(IMAGE|Indexed):\s*([^\]]+)\]/g;
    const parts = [];
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(content)) !== null) {
      const textPart = content.substring(lastIndex, match.index);
      if (textPart) {
        parts.push(
          <ReactMarkdown key={`text-${lastIndex}`} remarkPlugins={[remarkGfm]}>
            {textPart}
          </ReactMarkdown>
        );
      }
      const type = match[1];
      const val = match[2];

      if (type === "IMAGE") {
        const fullUrl = val.startsWith("http") ? val : `${API_BASE}${val}`;
        parts.push(
          <div key={`img-${match.index}`} className="chat-bubble__image-container">
            <img
              src={fullUrl}
              alt="Attached image"
              className="chat-bubble__img"
              onClick={() => window.open(fullUrl, "_blank")}
            />
          </div>
        );
      } else if (type === "Indexed") {
        parts.push(
          <div key={`file-${match.index}`} style={{ display: "block", marginTop: "6px", marginBottom: "4px" }}>
            <div className="chat-bubble__file-chip" style={{ display: "inline-flex", background: "rgba(255, 255, 255, 0.05)", padding: "6px 12px", borderRadius: "8px", border: "1px solid rgba(255, 255, 255, 0.08)", gap: "8px", alignItems: "center" }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
              </svg>
              <span style={{ fontSize: "0.82rem", color: "rgba(255,255,255,0.85)" }}>{val}</span>
            </div>
          </div>
        );
      }
      lastIndex = regex.lastIndex;
    }

    const remainingText = content.substring(lastIndex);
    if (remainingText) {
      parts.push(
        <ReactMarkdown key={`text-${lastIndex}`} remarkPlugins={[remarkGfm]}>
          {remainingText}
        </ReactMarkdown>
      );
    }

    if (parts.length === 0) {
      return (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {content}
        </ReactMarkdown>
      );
    }

    return <div className="chat-bubble__content-wrapper">{parts}</div>;
  }

  return (
    <PageTransition>
      <div className="chat-page" style={{ position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: 0, right: 0, width: "100vw", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.8, overflow: "hidden" }}>
          <DotField
            dotRadius={5}
            dotSpacing={14}
            bulgeStrength={67}
            glowRadius={180}
            sparkle={false}

            waveAmplitude={0}
            gradientFrom="rgba(59, 130, 246, 0.4)"
            gradientTo="rgba(59, 130, 246, 0.15)"
            glowColor="rgba(59, 130, 246, 0.25)"
          />
        </div>
        <div className="chat-container" style={{ position: "relative", zIndex: 1 }}>
          <div className="chat-thread" ref={listRef}>
            {messages.length === 0 ? (
              <div className="chat-empty" style={{ padding: "4rem 1rem 2rem", flexDirection: "column", height: "auto", minHeight: "100%", justifyContent: "flex-start" }}>
                <div className="chat-empty__content" style={{ marginBottom: "1.5rem" }}>
                  <h1 className="chat-empty__headline">
                    <RevealText>What can I help with?</RevealText>
                  </h1>
                  <p className="chat-empty__subtitle" style={{ marginTop: "0.5rem" }}>
                    <RevealText delay={0.15}>
                      Ask questions about history, files, or analyze documents.
                    </RevealText>
                  </p>
                </div>
                <MagicBento />
              </div>
            ) : (
              <ul className="chat-messages">
                {messages.map((m) => (
                  <motion.li
                    key={m.id}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className={
                      m.role === "user"
                        ? "chat-bubble chat-bubble--user"
                        : "chat-bubble chat-bubble--assistant"
                    }
                  >
                    {editingMessageId === m.id ? (
                      <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "10px", minWidth: "300px" }}>
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          style={{
                            width: "100%",
                            minHeight: "100px",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: "10px",
                            color: "var(--text-main)",
                            padding: "10px",
                            fontFamily: "inherit",
                            fontSize: "0.95rem",
                            resize: "vertical",
                            outline: "none"
                          }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                          <button
                            onClick={() => {
                              setEditingMessageId(null);
                              setEditText("");
                            }}
                            style={{
                              padding: "6px 14px",
                              background: "rgba(255,255,255,0.08)",
                              border: "1px solid rgba(255,255,255,0.1)",
                              borderRadius: "8px",
                              color: "var(--text-soft)",
                              fontSize: "0.85rem",
                              cursor: "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => void handleEditMessage(m.id, editText)}
                            style={{
                              padding: "6px 14px",
                              background: "var(--accent)",
                              border: "none",
                              borderRadius: "8px",
                              color: "#fff",
                              fontSize: "0.85rem",
                              fontWeight: 500,
                              cursor: "pointer",
                              transition: "all 0.2s"
                            }}
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {m.role === "user" && m.attachments && m.attachments.length > 0 && (
                          <div className="chat-bubble__attachments-row" style={{ display: "flex", flexWrap: "wrap", gap: "10px", marginBottom: "8px", justifyContent: "flex-end" }}>
                            {m.attachments.map((att) => (
                              <div 
                                key={att.file_id} 
                                className="chat-bubble__attachment-card" 
                                onClick={() => void handleOpenDocumentViewer(att, urlSessionId)}
                                style={{ 
                                  display: "inline-flex", 
                                  background: "rgba(255, 255, 255, 0.05)", 
                                  padding: "8px 12px", 
                                  borderRadius: "10px", 
                                  border: "1px solid rgba(255, 255, 255, 0.08)", 
                                  gap: "10px", 
                                  alignItems: "center", 
                                  minWidth: "150px",
                                  cursor: "pointer",
                                  transition: "background 0.2s, border-color 0.2s"
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
                                  e.currentTarget.style.borderColor = "var(--accent)";
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
                                  e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.08)";
                                }}
                              >
                                {renderFileIcon(att.filename)}
                                <div style={{ display: "flex", flexDirection: "column" }}>
                                  <span style={{ fontSize: "0.85rem", color: "var(--text-soft)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "160px" }}>{att.filename}</span>
                                  <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{getFileTypeLabel(att.filename)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        <div className="chat-bubble__text markdown-content">
                          {renderMessageText(m.text)}
                        </div>
                        <div className="chat-bubble__actions">
                          {m.role === "user" ? (
                            <button
                              onClick={() => {
                                setEditingMessageId(m.id);
                                setEditText(m.text);
                              }}
                              disabled={loading}
                              title="Edit message"
                              style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", padding: "4px" }}
                            >
                              <span style={{ fontSize: "0.85rem", marginRight: "4px" }}>✏️</span>
                              <span style={{ fontSize: "0.78rem" }}>Edit</span>
                            </button>
                          ) : (
                            <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                              <button
                                onClick={() => void handleRetryMessage(m.id)}
                                disabled={loading}
                                title="Retry regeneration"
                                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                              >
                                <span style={{ fontSize: "0.85rem", marginRight: "4px" }}>↻</span>
                                <span style={{ fontSize: "0.78rem" }}>Retry</span>
                              </button>
                              <button
                                onClick={() => handleCopyMessage(m.text)}
                                title="Copy content"
                                style={{ background: "none", border: "none", color: "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                              >
                                <span style={{ fontSize: "0.85rem", marginRight: "4px" }}>📋</span>
                                <span style={{ fontSize: "0.78rem" }}>Copy</span>
                              </button>
                              <button
                                onClick={() => handleToggleReaction(m.id, "like")}
                                title="Like"
                                style={{ background: "none", border: "none", color: reactions[m.id] === "like" ? "var(--accent)" : "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                              >
                                <span style={{ fontSize: "0.85rem" }}>👍</span>
                              </button>
                              <button
                                onClick={() => handleToggleReaction(m.id, "dislike")}
                                title="Dislike"
                                style={{ background: "none", border: "none", color: reactions[m.id] === "dislike" ? "#ef4444" : "rgba(255,255,255,0.6)", cursor: "pointer", display: "flex", alignItems: "center", padding: "2px" }}
                              >
                                <span style={{ fontSize: "0.85rem" }}>👎</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </motion.li>
                ))}

                {loading && (
                  <motion.li
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, repeat: Infinity, repeatType: "reverse" }}
                    className="chat-bubble chat-bubble--assistant"
                  >
                    <span className="chat-bubble__role">
                      Assistant
                    </span>
                    <p className="chat-bubble__text">
                      {uploadingStatus || "Thinking..."}
                    </p>
                  </motion.li>
                )}
              </ul>
            )}
          </div>

          {urlSessionId !== null && (
            <form 
              className={`chat-composer ${isDragging ? "chat-composer--dragging" : ""}`}
              onSubmit={(e) => { e.preventDefault(); void sendQuestion(); }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              style={{ position: "relative" }}
            >
              {isDragging && (
                <div className="chat-composer__dropzone-overlay" style={{ position: "absolute", inset: 0, background: "rgba(59, 130, 246, 0.12)", border: "2px dashed var(--accent)", borderRadius: "14px", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10, backdropFilter: "blur(4px)", pointerEvents: "none" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "8px", color: "var(--accent)" }}>
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>Drop your files here</span>
                  </div>
                </div>
              )}

              <label htmlFor={inputId} className="sr-only">
                Your question
              </label>

              {/* ATTACHMENT PREVIEWS DRAWER */}
              {attachedPreviews.length > 0 && (
                <div className="chat-composer__previews" style={{ display: "flex", flexWrap: "nowrap", overflowX: "auto", gap: "12px", padding: "8px 12px", background: "rgba(0,0,0,0.15)", borderTopLeftRadius: "14px", borderTopRightRadius: "14px", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  {attachedPreviews.map((preview, idx) => (
                    <div key={preview.id} className="chat-composer__preview-chip" style={{ display: "flex", flexShrink: 0, alignItems: "center", gap: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: "10px", padding: "8px 12px", position: "relative", minWidth: "180px", maxWidth: "240px" }}>
                      {preview.type === "image" ? (
                        <div style={{ width: "32px", height: "32px", borderRadius: "6px", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,0.02)" }}>
                          <img src={preview.url} alt={preview.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ) : (
                        <div style={{ width: "32px", height: "32px", borderRadius: "6px", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {renderFileIcon(preview.name, 22)}
                        </div>
                      )}
                      <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-soft)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{preview.name}</span>
                        <span style={{ fontSize: "0.72rem", color: "rgba(255,255,255,0.4)" }}>{preview.sizeStr}</span>
                      </div>
                      <button
                        type="button"
                        className="chat-composer__preview-remove"
                        onClick={() => removeAttachment(preview.id, idx)}
                        title="Remove attachment"
                        style={{ background: "none", border: "none", color: "rgba(255,255,255,0.4)", cursor: "pointer", fontSize: "0.8rem", padding: "2px" }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="chat-composer__field">
                {/* ATTACHMENT BUTTON */}
                <button
                  type="button"
                  className="chat-composer__attachment-btn"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach files (PDF, images, DOCX, TXT, CSV, Audio)"
                  disabled={loading}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                </button>

                <input
                  type="file"
                  ref={fileInputRef}
                  style={{ display: "none" }}
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.wav,.mp3,.mp4,.zip,.doc,.xls,.xlsx,.ppt,.pptx,.rtf,.md,.json,.xml,.html"
                  onChange={handleAttachmentChange}
                />

                <textarea
                  id={inputId}
                  className="chat-composer__input"
                  placeholder="Ask anything..."
                  value={input}
                  rows={1}
                  disabled={loading}
                  onChange={(e) => {
                    setInput(e.target.value);

                    e.target.style.height = "auto";
                    e.target.style.height =
                      Math.min(e.target.scrollHeight, 180) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void sendQuestion();
                    }
                  }}
                />

                <button
                  type="submit"
                  className="chat-composer__send primary"
                  disabled={loading || (!input.trim() && attachedFiles.length === 0)}
                >
                  ↑
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      
      {/* DOCUMENT VIEWER DRAWER PANEL */}
      {activeViewFile && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", justifyContent: "flex-end", background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }} onClick={() => setActiveViewFile(null)}>
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "480px",
              height: "100%",
              background: "rgba(18, 20, 24, 0.95)",
              borderLeft: "1px solid rgba(255, 255, 255, 0.08)",
              boxShadow: "-10px 0 30px rgba(0,0,0,0.6)",
              display: "flex",
              flexDirection: "column",
              padding: "24px"
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "12px", overflow: "hidden" }}>
                <div style={{ width: "40px", height: "40px", borderRadius: "8px", background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {renderFileIcon(activeViewFile.filename, 24)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                  <span style={{ fontSize: "1.05rem", fontWeight: 600, color: "var(--text-main)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {activeViewFile.filename}
                  </span>
                  <span style={{ fontSize: "0.8rem", color: "var(--text-soft)" }}>
                    {getFileTypeLabel(activeViewFile.filename)} {activeViewFile.size ? `• ${(activeViewFile.size / 1024 / 1024).toFixed(2)} MB` : ""}
                  </span>
                </div>
              </div>
              
              <button
                onClick={() => setActiveViewFile(null)}
                style={{
                  width: "32px",
                  height: "32px",
                  borderRadius: "50%",
                  border: "none",
                  background: "rgba(255,255,255,0.05)",
                  color: "var(--text-soft)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "background 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.1)"}
                onMouseLeave={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}
              >
                ✕
              </button>
            </div>
            
            {/* Quick Actions */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
              <a
                href={`${API_BASE}/chats/session/${urlSessionId || currentSessionId || 0}/file/${encodeURIComponent(activeViewFile.filename)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  flex: 1,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  padding: "10px",
                  borderRadius: "8px",
                  background: "var(--accent)",
                  color: "#fff",
                  fontSize: "0.9rem",
                  fontWeight: 500,
                  textDecoration: "none",
                  transition: "opacity 0.2s"
                }}
                onMouseEnter={(e) => e.currentTarget.style.opacity = "0.9"}
                onMouseLeave={(e) => e.currentTarget.style.opacity = "1"}
              >
                <span>📥</span> Open / Download File
              </a>
            </div>
            
            {/* Extracted Content Viewer */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>
              <span style={{ fontSize: "0.85rem", textTransform: "uppercase", fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em", marginBottom: "10px" }}>
                Extracted Content
              </span>
              
              <div style={{ flex: 1, overflowY: "auto", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: "10px", padding: "16px", minHeight: 0 }}>
                {viewFileLoading ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: "12px", color: "var(--text-soft)" }}>
                    <div className="viewer-spinner" style={{ width: "30px", height: "30px", border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "var(--accent)", borderRadius: "50%", animation: "viewer-spin 1s linear infinite" }} />
                    <style>{`
                      @keyframes viewer-spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                      }
                    `}</style>
                    <span style={{ fontSize: "0.9rem" }}>Parsing content...</span>
                  </div>
                ) : (
                  <div style={{ fontSize: "0.92rem", lineHeight: "1.6", color: "var(--text-soft)", whiteSpace: "pre-wrap", fontFamily: "monospace" }}>
                    {viewFileText || "No content extracted."}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </PageTransition>
  );
}