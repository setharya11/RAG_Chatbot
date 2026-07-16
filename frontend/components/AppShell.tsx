
"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, useCallback, useRef } from "react";

import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import LineSidebar from "@/components/LineSidebar";
import { isPublicApiKeyConfigured } from "@/lib/api";
import {
  clearAuthSession,
  getAccessToken,
  getUserSnapshot,
  UserSnapshot,
} from "@/lib/auth-storage";

type NavKey = "dashboard" | "profile" | "history" | "documents";

type ChatSession = {
  id: number;
  title: string;
};

const API_BASE = "http://127.0.0.1:8000";

const navItems = [
  { href: "/dashboard", label: "Dashboard", key: "dashboard" as const },
  { href: "/documents", label: "Documents", key: "documents" as const },
  { href: "/profile", label: "Profile", key: "profile" as const },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlSessionId = searchParams?.get("session_id");

  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);
  const [history, setHistory] = useState<ChatSession[]>([]);

  // Sidebar drag width and collapse states
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isHistoryExpanded, setIsHistoryExpanded] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setSidebarWidth(window.innerWidth / 5);
    }
  }, []);

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      // Allow resizing between 160px and 450px
      const newWidth = Math.max(160, Math.min(e.clientX, 450));
      setSidebarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  useEffect(() => {
    const t = getAccessToken();

    const next =
      pathname && pathname.startsWith("/")
        ? pathname
        : "/dashboard";

    if (!t) {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }

    const userSnapshot = getUserSnapshot();
    setSnapshot(userSnapshot);

    if (userSnapshot?.user_id) {
      fetch(`${API_BASE}/chats/user/${userSnapshot.user_id}`)
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) {
            setHistory(data);
          }
        })
        .catch(console.error);
    }

    setReady(true);
  }, [router, pathname, urlSessionId]);

  const handleRenameItem = async (index: number, newTitle: string) => {
    const chat = history[index];
    if (!chat) return;

    try {
      const res = await fetch(`${API_BASE}/chats/session/${chat.id}/title`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: newTitle }),
      });

      if (!res.ok) {
        throw new Error("Failed to rename chat session");
      }

      setHistory((prev) =>
        prev.map((c, i) => (i === index ? { ...c, title: newTitle } : c))
      );
    } catch (err) {
      console.error(err);
      alert("Error: Could not rename chat history");
    }
  };

  const handleDeleteItem = async (index: number) => {
    const chat = history[index];
    if (!chat) return;

    const confirmed = window.confirm(`Are you sure you want to delete "${chat.title}"?`);
    if (!confirmed) return;

    try {
      const res = await fetch(`${API_BASE}/chats/session/${chat.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        throw new Error("Failed to delete chat session");
      }

      setHistory((prev) => prev.filter((_, i) => i !== index));

      if (String(chat.id) === String(urlSessionId)) {
        router.replace("/dashboard?session_id=new");
      }
    } catch (err) {
      console.error(err);
      alert("Error: Could not delete chat history");
    }
  };

  function logout() {
    clearAuthSession();
    router.replace("/login");
  }

  if (!ready) {
    return (
      <div className="loading-screen">
        <p>Loading...</p>
      </div>
    );
  }

  const needsKeyBanner = !isPublicApiKeyConfigured();
  const activeIndex = history.findIndex((chat) => String(chat.id) === String(urlSessionId));
  const defaultActive = activeIndex !== -1 ? activeIndex : null;

  return (
    <div className="app-shell">
      <aside
        className={`app-sidebar ${isCollapsed ? "app-sidebar--collapsed" : ""}`}
        style={{
          width: isCollapsed ? 0 : sidebarWidth,
          padding: isCollapsed ? 0 : undefined,
          borderRight: isCollapsed ? "none" : undefined,
          position: "relative",
          transition: isResizing ? "none" : "width 0.2s ease, padding 0.2s ease",
          overflow: "visible", // Ensure resize handle is visible outside layout boundaries
        }}
        aria-label="Main navigation"
      >
        {!isCollapsed && (
          <div className="app-sidebar__inner" style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%", overflow: "hidden" }}>
            <div className="app-sidebar__brand" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <Link href="/dashboard" className="app-sidebar__logo">
                <span className="app-sidebar__logo-mark">◆</span>
                <span className="app-sidebar__logo-text">
                  RAG Chatbot
                </span>
              </Link>
              <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={() => setIsCollapsed(true)}
                aria-label="Collapse sidebar"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-soft)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: "4px 8px",
                  borderRadius: "4px",
                  transition: "background 0.2s ease",
                }}
              >
                ◀
              </button>
            </div>

            {(snapshot?.display_name || snapshot?.email) && (
              <p className="app-sidebar__user">
                {snapshot.display_name || snapshot.email}
              </p>
            )}

            <nav className="app-sidebar__nav">
              {navItems.map((item) => {
                const active =
                  item.href === "/dashboard"
                    ? pathname === "/dashboard"
                    : pathname?.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      active
                        ? "app-sidebar__link app-sidebar__link--active"
                        : "app-sidebar__link"
                    }
                  >
                    <SidebarIcon tab={item.key} />
                    {item.label}
                  </Link>
                );
              })}

              <button
                type="button"
                className="app-sidebar__link"
                onClick={() => {
                  router.replace("/dashboard?session_id=new");
                }}
              >
                + New Chat
              </button>

              <button
                type="button"
                className="app-sidebar__link app-sidebar__link--history-header"
                onClick={() => setIsHistoryExpanded(!isHistoryExpanded)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <SidebarIcon tab="history" />
                  <span>History</span>
                </div>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  style={{
                    transform: isHistoryExpanded ? "rotate(0deg)" : "rotate(-90deg)",
                    transition: "transform 0.2s ease",
                  }}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {isHistoryExpanded && (
                <div className="sidebar-history" style={{ paddingLeft: '8px' }}>
                  <LineSidebar
                    items={history.map((chat) => chat.title)}
                    defaultActive={defaultActive}
                    onItemClick={(index) => {
                      const selectedChat = history[index];
                      if (selectedChat) {
                        router.replace(`/dashboard?session_id=${selectedChat.id}`);
                      }
                    }}
                    onRenameItem={handleRenameItem}
                    onDeleteItem={handleDeleteItem}
                    accentColor="var(--accent)"
                    textColor="rgba(255, 255, 255, 0.45)"
                    markerColor="rgba(255, 255, 255, 0.15)"
                    fontSize={0.88}
                    itemGap={8}
                  />
                </div>
              )}
            </nav>

            <div className="app-sidebar__footer">
              <button
                type="button"
                className="app-sidebar__logout"
                onClick={logout}
              >
                <SidebarLogoutIcon />
                <span>Logout</span>
              </button>
            </div>
          </div>
        )}

        {!isCollapsed && (
          <div
            className={`sidebar-resize-handle ${isResizing ? "active" : ""}`}
            onMouseDown={startResizing}
          />
        )}
      </aside>

      <div className="app-shell__main" style={{ position: "relative" }}>
        {isCollapsed && (
          <button
            type="button"
            className="sidebar-toggle-floating"
            onClick={() => setIsCollapsed(false)}
            aria-label="Expand sidebar"
            style={{
              position: "absolute",
              top: "16px",
              left: "16px",
              zIndex: 99,
              background: "rgba(255, 255, 255, 0.05)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "8px",
              color: "var(--text-soft)",
              padding: "8px 12px",
              cursor: "pointer",
              backdropFilter: "blur(10px)",
              fontSize: "1.1rem",
              transition: "background 0.2s ease, color 0.2s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.1)";
              e.currentTarget.style.color = "var(--text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "rgba(255, 255, 255, 0.05)";
              e.currentTarget.style.color = "var(--text-soft)";
            }}
          >
            ☰
          </button>
        )}

        {needsKeyBanner && (
          <div className="app-shell__banner">
            <ApiKeySetupNotice scenario="missing-frontend-env" />
          </div>
        )}

        <main
          id="main-content"
          className="app-shell__content"
          tabIndex={-1}
        >
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarIcon({ tab }: { tab: NavKey }) {
  switch (tab) {
    case "dashboard":
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M4.5 6.5a1.25 1.25 0 0 1 1.25-1.25h6.2l3.05 3.05V18a1.25 1.25 0 0 1-1.25 1.25H5.75A1.25 1.25 0 0 1 4.5 18z" />
          <path d="M11.75 5.25V8.8h3.05" />
          <path d="M7 11.5h7M7 14h7M7 16.5h4.5" />
          <path d="M12.85 10.85h6.15a2.4 2.4 0 0 1 2.4 2.4v3.15a2.4 2.4 0 0 1-2.4 2.4h-2.95l-2 2.6v-2.6h-1.2a2.4 2.4 0 0 1-2.4-2.4v-3.15a2.4 2.4 0 0 1 2.4-2.4z" />
        </svg>
      );

    case "profile":
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
      );

    case "history":
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      );

    case "documents":
      return (
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      );

    default:
      return null;
  }
}

function SidebarLogoutIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

