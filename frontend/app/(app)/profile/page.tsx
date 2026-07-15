"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageTransition, RevealText, ScrollScaleCard } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import {
  apiJson,
  apiErrorMessage,
  looksLikeApiKeyErrorMessage,
} from "@/lib/api";
import {
  clearAuthSession,
  getAccessToken,
  getUserSnapshot,
  mergeUserSnapshot,
  UserSnapshot,
} from "@/lib/auth-storage";

type ProfilePayload = {
  email?: string;
  display_name?: string | null;
  dob?: string | null;
  profile_picture_url?: string | null;
  email_verified?: boolean;
};

const API_BASE = "http://127.0.0.1:8000";

function isUnauthorized(ex: unknown): boolean {
  return (ex as Error & { status?: number }).status === 401;
}

export default function ProfilePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [sessionOk, setSessionOk] = useState(false);
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);

  const [profile, setProfile] = useState<ProfilePayload | null>(null);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [chatCount, setChatCount] = useState<number>(0);
  const [messageCount, setMessageCount] = useState<number>(0);
  const [pdfCount, setPdfCount] = useState<number>(0);
  const [favoriteCount, setFavoriteCount] = useState<number>(0);

  const [editName, setEditName] = useState("");
  const [editDob, setEditDob] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [saveBusy, setSaveBusy] = useState(false);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  useEffect(() => {
    const t = getAccessToken();
    if (!t) {
      router.replace(`/login?next=${encodeURIComponent("/profile")}`);
      return;
    }
    setSessionOk(true);
    setSnapshot(getUserSnapshot());
  }, [router]);

  const handleAuthFailure = useCallback(() => {
    clearAuthSession();
    router.replace(`/login?next=${encodeURIComponent("/profile")}`);
  }, [router]);

  const loadProfile = useCallback(async () => {
    const t = getAccessToken();
    if (!t) {
      handleAuthFailure();
      return;
    }
    setProfileErr(null);
    setLoadingProfile(true);
    try {
      // Load user profile details
      const res = (await apiJson("/users/profile-data", {
        method: "GET",
        auth: t,
      })) as ProfilePayload;
      setProfile(res);
      setEditName(res.display_name?.trim() || "");
      setEditDob(res.dob ? String(res.dob).slice(0, 10) : "");
      setAvatarPreview(null);
      setSelectedFile(null);
      setFileName("");

      mergeUserSnapshot({
        display_name: res.display_name ?? null,
        profile_image_url: res.profile_picture_url ?? null,
      });
      const userSnapshot = getUserSnapshot();
      setSnapshot(userSnapshot);

      const currentUserId = userSnapshot?.user_id || 1;

      // Fetch user's chats stats dynamically
      const statsRes = await fetch(`${API_BASE}/chats/stats/${currentUserId}`);
      const stats = await statsRes.json();
      if (stats && typeof stats === "object") {
        setChatCount(stats.total_chats || 0);
        setMessageCount(stats.total_messages || 0);
        setPdfCount(stats.total_pdfs || 0);
        setFavoriteCount(stats.total_favorites || 0);
      }
    } catch (ex) {
      if (isUnauthorized(ex)) {
        handleAuthFailure();
        return;
      }
      setProfileErr(apiErrorMessage(ex));
    } finally {
      setLoadingProfile(false);
    }
  }, [handleAuthFailure]);

  useEffect(() => {
    if (sessionOk) {
      void loadProfile();
    }
  }, [sessionOk, loadProfile]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
    }
  };

  async function onSaveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveErr(null);
    setSaveOk(null);
    const t = getAccessToken();
    if (!t) {
      handleAuthFailure();
      return;
    }

    const fd = new FormData();
    if (editName.trim()) {
      fd.append("display_name", editName.trim());
    }
    if (editDob) {
      fd.append("dob", editDob);
    }
    if (selectedFile) {
      fd.append("profile_picture", selectedFile);
    }

    setSaveBusy(true);
    try {
      const res = (await apiJson("/users/update-profile", {
        method: "PATCH",
        body: fd,
        auth: t,
      })) as ProfilePayload;
      setProfile(res);
      setEditName(res.display_name?.trim() || "");
      setEditDob(res.dob ? String(res.dob).slice(0, 10) : "");
      mergeUserSnapshot({
        display_name: res.display_name ?? null,
        profile_image_url: res.profile_picture_url ?? null,
      });
      setSnapshot(getUserSnapshot());
      setSaveOk("Profile settings updated successfully.");
      setSelectedFile(null);
      setFileName("");
      setAvatarPreview(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    } catch (ex) {
      if (isUnauthorized(ex)) {
        handleAuthFailure();
        return;
      }
      setSaveErr(apiErrorMessage(ex));
    } finally {
      setSaveBusy(false);
    }
  }

  if (!sessionOk) {
    return (
      <div className="loading-screen">
        <p>Loading…</p>
      </div>
    );
  }

  const displayNameVal =
    profile?.display_name ||
    snapshot?.display_name ||
    snapshot?.email?.split("@")[0] ||
    "User";

  // Initials for avatar fallback
  const getInitials = () => {
    const name = profile?.display_name || snapshot?.display_name || snapshot?.email || "U";
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <PageTransition>
      <div className="profile-page-container" ref={containerRef}>
        {/* Dynamic Header */}
        <header className="profile-header">
          <h1 className="profile-header-title">
            <RevealText>{"👋 Welcome back, " + displayNameVal}</RevealText>
          </h1>
          <p className="profile-header-subtitle">
            <RevealText delay={0.15}>
              Manage your account preferences, configurations, statistics, and platform security.
            </RevealText>
          </p>
        </header>

      {/* Grid Container */}
      <div className="profile-grid-container">
        {/* Row 1: Profile Summary Card & Account Settings Card */}
        <div className="profile-grid-row-1">

          {/* Profile Summary Card (Left Column) */}
          <ScrollScaleCard containerRef={containerRef} className="card profile-summary-card">
            <div className="profile-summary-banner"></div>

            {/* 96px Avatar Container */}
            <div
              className="profile-summary-avatar-container"
              onClick={() => fileInputRef.current?.click()}
              title="Click to upload profile photo"
            >
              {avatarPreview || profile?.profile_picture_url ? (
                <img
                  src={avatarPreview || profile?.profile_picture_url || ""}
                  alt="Profile Avatar"
                  className="profile-summary-avatar-img"
                />
              ) : (
                <span className="profile-summary-avatar-placeholder">{getInitials()}</span>
              )}
              <div className="profile-summary-avatar-overlay">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Upload</span>
              </div>
            </div>

            <div className="profile-summary-info">
              <h2 id="profile-heading" className="profile-summary-name">
                {displayNameVal}
              </h2>

              {/* Green Verified Badge */}
              <div className="profile-verified-badge">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Verified User
              </div>

              <p className="profile-summary-email">{profile?.email || snapshot?.email || "—"}</p>

              {/* Detailed Summary Metadata list */}
              <div className="profile-details-list">
                <div className="profile-detail-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span className="profile-detail-label">Email</span>
                  <span className="profile-detail-value">{profile?.email || "—"}</span>
                </div>

                <div className="profile-detail-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                  <span className="profile-detail-label">Joined</span>
                  <span className="profile-detail-value">June 2026</span>
                </div>

                <div className="profile-detail-item">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                  <span className="profile-detail-label">Last Login</span>
                  <span className="profile-detail-value">Today (Active)</span>
                </div>
              </div>

              {/* Sync Action Button */}
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => void loadProfile()}
                disabled={loadingProfile}
                style={{ width: "100%", marginTop: "1rem", display: "inline-flex", gap: "6px" }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ animation: loadingProfile ? "spin 2s linear infinite" : "none" }}>
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                </svg>
                {loadingProfile ? "Syncing Account..." : "Sync Google Account"}
              </button>

              {profileErr && (
                <div className="alert-box alert-box--error" style={{ textAlign: "left" }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <p style={{ margin: 0, fontWeight: 600 }}>Sync Failed</p>
                    <p style={{ margin: 0, fontSize: "0.82rem" }}>{profileErr}</p>
                  </div>
                </div>
              )}
            </div>
          </ScrollScaleCard>

          {/* Account Settings Form Card (Right Column) */}
          <ScrollScaleCard containerRef={containerRef} className="card profile-edit-card">
            <h2 id="edit-heading" className="profile-edit-title">Profile Settings</h2>
            <p className="profile-edit-subtitle">
              Modify your public credentials and upload your account representation.
            </p>

            <form className="profile-edit-form" onSubmit={onSaveProfile}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
                <div>
                  <label htmlFor="edit-display_name">Display name</label>
                  <input
                    id="edit-display_name"
                    name="display_name"
                    type="text"
                    placeholder="Arya Seth"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    autoComplete="name"
                    style={{ marginTop: "0.35rem" }}
                  />
                </div>
                <div>
                  <label htmlFor="profile-email-readonly">Email Address</label>
                  <input
                    id="profile-email-readonly"
                    type="text"
                    value={profile?.email || snapshot?.email || ""}
                    disabled
                    style={{ marginTop: "0.35rem", opacity: 0.7, cursor: "not-allowed" }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "1.25rem" }}>
                <label htmlFor="edit-dob">Birthday</label>
                <input
                  id="edit-dob"
                  name="dob"
                  type="date"
                  value={editDob}
                  onChange={(e) => setEditDob(e.target.value)}
                  style={{ marginTop: "0.35rem" }}
                />
              </div>

              <div style={{ marginBottom: "1.5rem" }}>
                <label>Profile Picture</label>
                <div className="custom-file-upload" onClick={() => fileInputRef.current?.click()}>
                  <svg className="custom-file-upload-icon" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span className="custom-file-upload-text">
                    Drag & drop or click to upload image
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-soft)" }}>PNG, JPEG or WebP up to 5MB</span>
                </div>
                {fileName && <span className="custom-file-name">Selected: {fileName}</span>}
              </div>

              {/* Hidden file input */}
              <input
                id="edit-photo"
                ref={fileInputRef}
                name="profile_picture"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              <button
                type="submit"
                className="primary"
                disabled={saveBusy}
                style={{
                  width: "100%",
                  padding: "0.85rem",
                  fontWeight: 700,
                  borderRadius: "var(--radius-sm)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px"
                }}
              >
                {saveBusy && (
                  <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ animation: "spin 1s linear infinite" }}>
                    <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="8" />
                  </svg>
                )}
                {saveBusy ? "Saving changes..." : "Save Changes"}
              </button>
            </form>

            {saveOk && (
              <div className="alert-box alert-box--success">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Changes Saved</p>
                  <p style={{ margin: 0, fontSize: "0.82rem" }}>{saveOk}</p>
                </div>
              </div>
            )}

            {saveErr && (
              <div className="alert-box alert-box--error">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>Error Saving Settings</p>
                  <p style={{ margin: 0, fontSize: "0.82rem" }}>{saveErr}</p>
                </div>
              </div>
            )}

            {saveErr && looksLikeApiKeyErrorMessage(saveErr) && (
              <ApiKeySetupNotice scenario="backend-rejected" variant="compact" />
            )}
          </ScrollScaleCard>
        </div>

        {/* Row 2: Chat Statistics Card & Security Settings Card */}
        <div className="profile-grid-row-2">

          {/* AI Activity Statistics Card */}
          <ScrollScaleCard containerRef={containerRef} className="card" style={{ padding: "2rem" }}>
            <h2 id="stats-heading" className="profile-edit-title">AI Activity Statistics</h2>
            <p className="profile-edit-subtitle" style={{ marginBottom: "1.25rem" }}>
              A summary of your interaction and document storage history.
            </p>

            <div className="profile-stat-grid">
              {/* Stat 1: Chats count */}
              <div className="profile-stat-card">
                <div className="profile-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <div>
                  <div className="profile-stat-num">{chatCount}</div>
                  <div className="profile-stat-label">Total Chats</div>
                </div>
              </div>

              {/* Stat 2: Messages */}
              <div className="profile-stat-card">
                <div className="profile-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </div>
                <div>
                  <div className="profile-stat-num">{messageCount}</div>
                  <div className="profile-stat-label">AI Messages</div>
                </div>
              </div>

              {/* Stat 3: Documents count */}
              <div className="profile-stat-card">
                <div className="profile-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                    <polyline points="10 9 9 9 8 9" />
                  </svg>
                </div>
                <div>
                  <div className="profile-stat-num">{pdfCount}</div>
                  <div className="profile-stat-label">PDFs Uploaded</div>
                </div>
              </div>

              {/* Stat 4: Favorites */}
              <div className="profile-stat-card">
                <div className="profile-stat-icon">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                </div>
                <div>
                  <div className="profile-stat-num">{favoriteCount}</div>
                  <div className="profile-stat-label">Favorites</div>
                </div>
              </div>
            </div>
          </ScrollScaleCard>

          {/* Security Card */}
          <ScrollScaleCard containerRef={containerRef} className="card" style={{ padding: "2rem" }}>
            <h2 id="security-heading" className="profile-edit-title">Security & Preferences</h2>
            <p className="profile-edit-subtitle" style={{ marginBottom: "1.25rem" }}>
              Keep your credentials and authorization systems secure.
            </p>

            <div className="security-checklist">
              <div className="security-check-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: "#10b981" }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Email & Password Auth Active</span>
              </div>
              <div className="security-check-item">
                {profile?.email_verified ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ color: "#10b981" }}>
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Email Address Verified</span>
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "#f59e0b" }}>
                      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                      <line x1="12" y1="9" x2="12" y2="13" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    <span>Email Address Unverified</span>
                  </>
                )}
              </div>
              <div className="security-check-item">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ color: "#94a3b8" }}>
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>Two-Factor Authentication: Disabled</span>
              </div>
            </div>

            <div className="security-actions">
              <button type="button" className="btn-secondary" onClick={() => alert("Change Password flow triggered.")}>
                Change Password
              </button>
              <button type="button" className="btn-danger-outline" onClick={() => alert("Delete Account request sent.")}>
                Delete Account
              </button>
            </div>
          </ScrollScaleCard>

        </div>
      </div>
    </div>
    </PageTransition>
  );
}
