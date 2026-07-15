"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { PageTransition, RevealText } from "@/components/motion/MotionSystem";
import { ApiKeySetupNotice } from "@/components/ApiKeySetupNotice";
import { PasswordInput } from "@/components/PasswordInput";
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
      <main className="auth-page">
        <div className="auth-inner">
          {!hasKey && <ApiKeySetupNotice scenario="missing-frontend-env" />}

          <div className="auth-logo">
            <span className="auth-logo-mark" aria-hidden="true">
              ◆
            </span>
            <span>RAG Chatbot</span>
          </div>

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
      </main>
    </PageTransition>
  );
}
