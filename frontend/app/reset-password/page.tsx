"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, Suspense } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import { PasswordInput } from "@/components/PasswordInput";
import {
  apiJson,
  apiErrorMessage,
  isForbiddenApiKeyError,
  isPublicApiKeyConfigured,
} from "@/lib/api";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") || "";

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
    const password = (form.elements.namedItem("password") as HTMLInputElement).value;
    const confirmPassword = (form.elements.namedItem("confirm_password") as HTMLInputElement).value;

    if (password !== confirmPassword) {
      setErr("Passwords do not match");
      setBusy(false);
      return;
    }

    if (!token) {
      setErr("Password reset token is missing or invalid. Please check your email link.");
      setBusy(false);
      return;
    }

    try {
      const raw = await apiJson("/users/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      }) as { message?: string };

      setSuccessMsg(raw.message || "Your password has been successfully reset.");
    } catch (ex) {
      setBackendRejectedApiKey(isForbiddenApiKeyError(ex));
      setErr(apiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card" aria-labelledby="reset-title">
      <header>
        <h1 id="reset-title">
          <RevealText>Reset Password</RevealText>
        </h1>
        <p className="muted">
          <RevealText delay={0.15}>Enter your new password to secure your account.</RevealText>
        </p>
      </header>

      {successMsg ? (
        <div className="success-container" style={{ padding: "1rem 0", textAlign: "center" }}>
          <p className="notice" role="status" style={{ marginBottom: "1.5rem" }}>
            {successMsg}
          </p>
          <Link href="/login" className="button primary" style={{ display: "inline-block", textDecoration: "none", textAlign: "center" }}>
            Proceed to Login
          </Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} action="#" method="post" noValidate>
          <fieldset className="form-fieldset">
            <legend className="sr-only">New Password Credentials</legend>

            <label htmlFor="reset-password">New Password</label>
            <PasswordInput
              id="reset-password"
              name="password"
              autoComplete="new-password"
              required
            />

            <label htmlFor="confirm-password">Confirm Password</label>
            <PasswordInput
              id="confirm-password"
              name="confirm_password"
              autoComplete="new-password"
              required
            />

            <button type="submit" className="primary" disabled={busy || !hasKey} style={{ marginTop: "1rem" }}>
              {busy ? "Resetting password…" : "Reset Password"}
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
  );
}

export default function ResetPasswordPage() {
  const hasKey = useMemo(() => isPublicApiKeyConfigured(), []);

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

          <Suspense fallback={<div className="auth-card">Loading reset form…</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>
    </PageTransition>
  );
}
