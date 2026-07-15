"use client";

type Scenario = "missing-frontend-env" | "backend-rejected";

type Props = {
  scenario: Scenario;
  variant?: "banner" | "compact";
};

/** Shown when `NEXT_PUBLIC_X_API_KEY` is unset or backend returns 403 for bad key */
export function ApiKeySetupNotice({ scenario, variant = "banner" }: Props) {
  const wrapClass =
    variant === "banner"
      ? "api-key-notice api-key-notice--banner"
      : "api-key-notice api-key-notice--compact";

  const title =
    scenario === "missing-frontend-env"
      ? "Add the API key to the frontend"
      : "Fix the frontend API key";

  return (
    <aside className={wrapClass} role="alert" aria-labelledby="api-key-notice-title">
      <strong id="api-key-notice-title" className="api-key-notice__title">
        {title}
      </strong>
      <p className="api-key-notice__lead">
        The backend protects routes with header <code>X-API-Key</code>. The Next app must send the{" "}
        <strong>same</strong> value via <code>NEXT_PUBLIC_X_API_KEY</code>.
      </p>
      <ol className="api-key-notice__steps">
        <li>
          In <code className="api-key-notice__file">frontend/.env.local</code>, set:
          <pre className="api-key-notice__code">
            NEXT_PUBLIC_X_API_KEY=your-secret-here
          </pre>
        </li>
        <li>
          Copy <code>X_API_KEY</code> from <code className="api-key-notice__file">backend/.env</code> into{" "}
          that line (no quotes, same spelling).
        </li>
        <li>
          <strong>Restart</strong> <code>npm run dev</code>. Next.js only reads <code>.env.local</code> at
          startup.
        </li>
      </ol>
      {scenario === "backend-rejected" && (
        <p className="api-key-notice__hint">
          You still saw &quot;Invalid or missing API Key&quot;: the key in the bundle does not match the
          server. Fix typos, stray spaces, or a stale dev server process.
        </p>
      )}
    </aside>
  );
}
