"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, Suspense } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import { PasswordInput } from "@/components/PasswordInput";
import {
  apiJson,
  apiErrorMessage,
  isForbiddenApiKeyError,
  isPublicApiKeyConfigured,
  unwrapApiData,
} from "@/lib/api";
import { getAccessToken, setAuthSession, UserSnapshot } from "@/lib/auth-storage";

const SIGNUP_NOTICE_KEY = "rag_chatbot_signup_notice";

type LoginData = {
  access_token: string;
  user_id: number;
  email: string;
  display_name: string | null;
  roles?: string[];
  profile_image_url?: string | null;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [signupNotice, setSignupNotice] = useState<string | null>(null);
  const [backendRejectedApiKey, setBackendRejectedApiKey] = useState(false);
  const hasKey = useMemo(() => isPublicApiKeyConfigured(), []);

  const rawNext = searchParams?.get("next");
  const safeNext =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/dashboard";

  useEffect(() => {
    const m = sessionStorage.getItem(SIGNUP_NOTICE_KEY);
    if (m) {
      setSignupNotice(m);
      sessionStorage.removeItem(SIGNUP_NOTICE_KEY);
    }
  }, []);

  useEffect(() => {
    if (getAccessToken()) {
      router.replace(safeNext);
    }
  }, [router, safeNext]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setBackendRejectedApiKey(false);
    setBusy(true);
    const form = e.currentTarget;
    const email = (form.elements.namedItem("email") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;
    const remember_me = (
      form.elements.namedItem("remember_me") as HTMLInputElement
    ).checked;

    try {
      const raw = await apiJson("/users/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, remember_me }),
      });

      const data = unwrapApiData<LoginData>(raw);
      if (!data?.access_token || data.user_id == null || !data.email) {
        setErr("Login succeeded but response was incomplete. Try again.");
        return;
      }

      const snapshot: UserSnapshot = {
        user_id: data.user_id,
        email: data.email,
        display_name: data.display_name ?? null,
        roles: data.roles,
        profile_image_url: data.profile_image_url ?? null,
      };
      setAuthSession(data.access_token, snapshot);
      router.replace(safeNext);
    } catch (ex) {
      setBackendRejectedApiKey(isForbiddenApiKeyError(ex));
      setErr(apiErrorMessage(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="auth-card" aria-labelledby="login-title">
      <header>
        <h1 id="login-title">
          <RevealText>Log in</RevealText>
        </h1>
        <p className="muted">
          <RevealText delay={0.15}>Use your email and password to continue.</RevealText>
        </p>

        {signupNotice && (
          <p className="notice" role="status">
            {signupNotice}
          </p>
        )}
      </header>

      <form onSubmit={onSubmit} action="#" method="post" noValidate>
        <fieldset className="form-fieldset">
          <legend className="sr-only">Credentials</legend>

          <label htmlFor="login-email">Email</label>
          <input id="login-email" name="email" type="email" autoComplete="email" required />

          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            name="password"
            autoComplete="current-password"
            required
          />

          <label className="row-check">
            <input name="remember_me" type="checkbox" /> Remember me (longer session)
          </label>

          <div style={{ marginBottom: "1rem", textAlign: "right" }}>
            <Link href="/forgot-password" style={{ fontSize: "0.85rem", color: "var(--primary-color, #3b82f6)", textDecoration: "none" }}>
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="primary" disabled={busy || !hasKey}>
            {busy ? "Signing in…" : "Log in"}
          </button>
        </fieldset>
      </form>

      <footer>
        <p className="auth-switch">
          New here? <Link href="/signup">Create an account</Link>
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

export default function LoginPage() {
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

          <Suspense fallback={<div className="auth-card">Loading login…</div>}>
            <LoginForm />
          </Suspense>
        </div>
      </main>
    </PageTransition>
  );
}
