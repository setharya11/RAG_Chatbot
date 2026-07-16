"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import { PasswordInput } from "@/components/PasswordInput";
import DotField from "@/components/DotField";
import {
  apiJson,
  apiErrorMessage,
  isForbiddenApiKeyError,
  isPublicApiKeyConfigured,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth-storage";

const SIGNUP_NOTICE_KEY = "rag_chatbot_signup_notice";

export default function SignupPage() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [backendRejectedApiKey, setBackendRejectedApiKey] = useState(false);
  const hasKey = useMemo(() => isPublicApiKeyConfigured(), []);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace("/dashboard");
    }
  }, [router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBackendRejectedApiKey(false);
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const raw = (await apiJson("/users/api/signup", {
        method: "POST",
        body: fd,
      })) as { message?: string };
      sessionStorage.setItem(
        SIGNUP_NOTICE_KEY,
        raw.message || "Account created. You can log in now.",
      );
      router.push("/login");
    } catch (ex) {
      setBackendRejectedApiKey(isForbiddenApiKeyError(ex));
      setErr(apiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageTransition>
      <main className="auth-page" style={{ overflow: "hidden" }}>
        {/* Background Dot Grid */}
        <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 0, opacity: 0.75, overflow: "hidden" }}>
          <DotField
            dotRadius={2.0}
            dotSpacing={26}
            bulgeStrength={80}
            glowRadius={220}
            sparkle={false}
            waveAmplitude={0}
            gradientFrom="rgba(59, 130, 246, 0.65)"
            gradientTo="rgba(99, 102, 241, 0.35)"
            glowColor="rgba(59, 130, 246, 0.3)"
          />
        </div>

        <div className="auth-split-container">
          {/* Welcome Panel */}
          <div className="auth-welcome-panel">
            <div className="auth-welcome-content">
              <div className="auth-logo" style={{ marginBottom: "2rem" }}>
                <span className="auth-logo-mark" aria-hidden="true">
                  ◆
                </span>
                <span>RAG Chatbot</span>
              </div>
              <h1 className="auth-welcome-title">
                Welcome to <br />
                <span style={{ background: "linear-gradient(135deg, #3b82f6, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                  AI History Tutor
                </span>
              </h1>
              <p className="auth-welcome-text">
                Your dedicated History teacher. Grounded directly in textbooks to guide you through civilizations, timelines, key battles, and historical causes.
              </p>
              <div className="auth-welcome-features">
                <div className="auth-feature-item">
                  <span className="auth-feature-icon" style={{ color: "#3b82f6" }}>✓</span>
                  <span>Strictly grounded textbook facts (no hallucinations)</span>
                </div>
                <div className="auth-feature-item">
                  <span className="auth-feature-icon" style={{ color: "#3b82f6" }}>✓</span>
                  <span>Vertical timeline & Markdown comparison generators</span>
                </div>
                <div className="auth-feature-item">
                  <span className="auth-feature-icon" style={{ color: "#3b82f6" }}>✓</span>
                  <span>Audio transcription and PDF vector indexing</span>
                </div>
              </div>
            </div>
          </div>

          {/* Form Panel */}
          <div className="auth-form-panel">
            <div className="auth-inner">
              {!hasKey && <ApiKeySetupNotice scenario="missing-frontend-env" />}

              <article className="auth-card" aria-labelledby="signup-title">
                <header>
                  <h1 id="signup-title">
                    <RevealText>Create account</RevealText>
                  </h1>
                  <p className="muted">
                    <RevealText delay={0.15}>Join with your name, email, and password.</RevealText>
                  </p>
                </header>

                <form onSubmit={onSubmit} action="#" method="post" noValidate>
                  <fieldset className="form-fieldset">
                    <legend className="sr-only">Account details</legend>

                    <label htmlFor="display_name">Full name</label>
                    <input
                      id="display_name"
                      name="display_name"
                      type="text"
                      autoComplete="name"
                      required
                    />

                    <label htmlFor="email">Email</label>
                    <input id="email" name="email" type="email" autoComplete="email" required />

                    <label htmlFor="password">Password</label>
                    <PasswordInput
                      id="password"
                      name="password"
                      autoComplete="new-password"
                      required
                      minLength={8}
                      aria-describedby="pwd-hint"
                    />
                    <p id="pwd-hint" className="hint">
                      8+ characters, uppercase, lowercase, digit, special (<code>@$!%*?&amp;</code>)
                    </p>

                    <button type="submit" className="primary" disabled={busy || !hasKey}>
                      {busy ? "Creating account…" : "Sign up"}
                    </button>
                  </fieldset>
                </form>

                <footer>
                  <p className="auth-switch">
                    Already have an account? <Link href="/login">Log in</Link>
                  </p>
                  {err && (
                    <p className="error" role="alert">
                      {err}
                    </p>
                  )}
                  {backendRejectedApiKey && (
                    <ApiKeySetupNotice scenario="backend-rejected" variant="compact" />
                  )}
                </footer>
              </article>
            </div>
          </div>
        </div>
      </main>
    </PageTransition>
  );
}
