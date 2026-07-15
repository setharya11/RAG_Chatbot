"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import {
  apiJson,
  apiErrorMessage,
  isForbiddenApiKeyError,
  isPublicApiKeyConfigured,
} from "@/lib/api";

export default function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [backendRejectedApiKey, setBackendRejectedApiKey] = useState(false);
  const hasKey = useMemo(() => isPublicApiKeyConfigured(), []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setSuccessMsg(null);
    setBackendRejectedApiKey(false);
    setBusy(true);

    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;

    try {
      const raw = await apiJson("/users/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      }) as { message?: string };

      setSuccessMsg(raw.message || "A password reset link has been sent to your email.");
    } catch (ex) {
      setBackendRejectedApiKey(isForbiddenApiKeyError(ex));
      setErr(apiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageTransition>
      <main className="auth-page">
        <div className="auth-inner">
          {!hasKey && <ApiKeySetupNotice scenario="missing-frontend-env" />}

          <div className="auth-logo">
            <span className="auth-logo-mark" aria-hidden="true">
              ◆
            </span>
            <span>RAG Chatbot</span>
          </div>

          <article className="auth-card" aria-labelledby="forgot-title">
            <header>
              <h1 id="forgot-title">
                <RevealText>Forgot Password</RevealText>
              </h1>
              <p className="muted">
                <RevealText delay={0.15}>Enter your email address to receive a password reset link.</RevealText>
              </p>
            </header>

            {successMsg ? (
              <div className="success-container" style={{ padding: "1rem 0", textAlign: "center" }}>
                <p className="notice" role="status" style={{ marginBottom: "1.5rem" }}>
                  {successMsg}
                </p>
                <Link href="/login" className="button primary" style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}>
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={onSubmit} action="#" method="post" noValidate>
                <fieldset className="form-fieldset">
                  <legend className="sr-only">Password Reset Email</legend>

                  <label htmlFor="forgot-email">Email</label>
                  <input id="forgot-email" name="email" type="email" autoComplete="email" required />

                  <button type="submit" className="primary" disabled={busy || !hasKey} style={{ marginTop: "1rem" }}>
                    {busy ? "Sending link…" : "Send Reset Link"}
                  </button>
                </fieldset>
              </form>
            )}

            <footer>
              <p className="auth-switch">
                Remembered your password? <Link href="/login">Log in</Link>
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
      </main>
    </PageTransition>
  );
}
