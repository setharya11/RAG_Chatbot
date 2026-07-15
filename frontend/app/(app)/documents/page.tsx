"use client";

import { useEffect, useState, useCallback } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";

type IndexedDocument = {
  name: string;
  size: number;
};

const API_BASE = "http://127.0.0.1:8000";

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<IndexedDocument[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/chats/documents`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDocuments(data);
        }
      }
    } catch (e) {
      console.error("Could not fetch documents", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchDocs();
  }, [fetchDocs]);

  const handleUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setStatusMsg({ type: "error", text: "Please upload a valid PDF document." });
      return;
    }

    setUploading(true);
    setStatusMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/chats/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();

      if (data.success) {
        setStatusMsg({
          type: "success",
          text: `"${file.name}" uploaded and successfully indexed into vector DB (${data.chunks_indexed} chunks generated).`,
        });
        void fetchDocs();
      } else {
        setStatusMsg({ type: "error", text: data.error || "Could not process PDF." });
      }
    } catch (err) {
      setStatusMsg({ type: "error", text: "Failed to upload file. Make sure backend is running." });
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const onDragLeave = () => {
    setDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void handleUpload(file);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  return (
    <PageTransition>
      <div className="documents-page" style={{ padding: "2.5rem 2rem", maxWidth: "1000px", margin: "0 auto" }}>
        <div style={{ marginBottom: "2rem" }}>
          <span
            style={{
              fontSize: "0.85rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.15em",
              color: "var(--accent)",
            }}
          >
            Knowledge Base
          </span>
          <h1 style={{ marginTop: "0.5rem", marginBottom: "0.5rem" }}>
            <RevealText>Document Management</RevealText>
          </h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.95rem" }}>
            Upload PDFs to index them dynamically in your vector database. The chat AI will search and retrieve answers from these files.
          </p>
        </div>

        {statusMsg && (
          <div
            style={{
              padding: "1rem",
              borderRadius: "var(--radius-sm)",
              marginBottom: "1.5rem",
              backgroundColor: statusMsg.type === "success" ? "rgba(16, 185, 129, 0.08)" : "rgba(239, 68, 68, 0.08)",
              border: `1px solid ${statusMsg.type === "success" ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`,
              color: statusMsg.type === "success" ? "#34d399" : "#f87171",
              fontSize: "0.9rem",
            }}
          >
            {statusMsg.text}
          </div>
        )}

        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? "var(--accent)" : "rgba(255, 255, 255, 0.08)"}`,
            borderRadius: "var(--radius-lg)",
            padding: "3.5rem 2rem",
            textAlign: "center",
            background: dragOver ? "rgba(59, 130, 246, 0.04)" : "var(--bg-card)",
            transition: "all 0.3s ease",
            position: "relative",
            cursor: "pointer",
            marginBottom: "2.5rem",
          }}
        >
          <input
            type="file"
            accept=".pdf"
            onChange={onFileSelect}
            style={{
              position: "absolute",
              inset: 0,
              opacity: 0,
              cursor: "pointer",
            }}
            disabled={uploading}
          />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
            <svg
              width="44"
              height="44"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--accent)"
              strokeWidth="1.5"
              style={{ opacity: uploading ? 0.3 : 1, transition: "opacity 0.2s" }}
            >
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            {uploading ? (
              <div>
                <p style={{ fontWeight: 600, color: "var(--text)" }}>Indexing Document...</p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-soft)", marginTop: "4px" }}>
                  Extracting text, generating embeddings, and storing in Postgres vector database.
                </p>
              </div>
            ) : (
              <div>
                <p style={{ fontWeight: 600, color: "var(--text)" }}>
                  {dragOver ? "Drop your PDF here" : "Drag & drop PDF here, or click to browse"}
                </p>
                <p style={{ fontSize: "0.85rem", color: "var(--text-soft)", marginTop: "4px" }}>
                  Supports PDF format up to 50MB
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "1rem" }}>
            Indexed Documents ({documents.length})
          </h2>

          {loading && documents.length === 0 ? (
            <p style={{ color: "var(--text-soft)" }}>Loading files...</p>
          ) : documents.length === 0 ? (
            <div
              style={{
                padding: "2rem",
                textAlign: "center",
                background: "rgba(255, 255, 255, 0.01)",
                borderRadius: "var(--radius-md)",
                border: "1px solid rgba(255, 255, 255, 0.03)",
                color: "var(--text-soft)",
              }}
            >
              No documents indexed yet. Upload a PDF above to get started.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              {documents.map((doc, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "1rem 1.25rem",
                    background: "var(--bg-card)",
                    borderRadius: "var(--radius-md)",
                    border: "1px solid rgba(255, 255, 255, 0.04)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-soft)" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                    <span style={{ fontWeight: 500, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {doc.name}
                    </span>
                  </div>
                  <span style={{ color: "var(--text-soft)", fontSize: "0.85rem", flexShrink: 0 }}>
                    {formatSize(doc.size)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
