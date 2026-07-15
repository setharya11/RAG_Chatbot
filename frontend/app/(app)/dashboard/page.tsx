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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
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
              text: m.content,
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


  async function sendQuestion(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `u-${crypto.randomUUID()}`,
      role: "user",
      text: q,
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    // scrollToBottom();

    try {
      const userSnapshot = getUserSnapshot();
      const currentUserId = userSnapshot?.user_id || 1;

      const res = await fetch(`${API_BASE}/chats/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: currentUserId,
          message: q,
          session_id: urlSessionId && urlSessionId !== "new"
            ? Number(urlSessionId)
            : null,
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

      const reply: ChatMessage = {
        id: `a-${crypto.randomUUID()}`,
        role: "assistant",
        text: data.assistant_message || "No response from backend",
      };

      setMessages((prev) => [...prev, reply]);
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
      // scrollToBottom();
    }
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
                    <div className="chat-bubble__text markdown-content">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.text}
                      </ReactMarkdown>
                    </div>
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
                      Thinking...
                    </p>
                  </motion.li>
                )}
              </ul>
            )}
          </div>

          {urlSessionId !== null && (
            <form className="chat-composer" onSubmit={sendQuestion}>
              <label htmlFor={inputId} className="sr-only">
                Your question
              </label>

              <div className="chat-composer__field">
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
                      sendQuestion();
                    }
                  }}
                />

                <button
                  type="submit"
                  className="chat-composer__send primary"
                >
                  ↑
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </PageTransition>
  );
}