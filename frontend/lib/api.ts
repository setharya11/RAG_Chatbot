const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";
const X_API_KEY = process.env.NEXT_PUBLIC_X_API_KEY || "";

export function isPublicApiKeyConfigured(): boolean {
  return (
    typeof process.env.NEXT_PUBLIC_X_API_KEY === "string" &&
    process.env.NEXT_PUBLIC_X_API_KEY.trim().length > 0
  );
}

export type ApiSuccessEnvelope<T> = {
  success?: boolean;
  status?: number;
  message?: string;
  data?: T;
};

export function apiHeaders(auth?: string): Record<string, string> {
  const h: Record<string, string> = {
    "X-API-Key": X_API_KEY,
  };
  if (auth) {
    h.Authorization = `Bearer ${auth}`;
  }
  return h;
}

function stringifyDetail(detail: unknown): string | undefined {
  if (detail == null) return undefined;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg: unknown }).msg);
        }
        return JSON.stringify(item);
      })
      .filter(Boolean)
      .join("; ");
  }
  return undefined;
}

/** Maps backend error bodies: custom_error_response, HTTPException, validation */
export function apiErrorMessage(ex: unknown): string {
  const body = (ex as Error & { body?: unknown }).body;
  if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const m = typeof b.message === "string" ? b.message : undefined;
    const d = stringifyDetail(b.detail);
    const e = typeof b.error === "string" && b.error !== m ? b.error : undefined;
    return (
      [m, d, e].filter(Boolean).join(" — ") || (ex as Error).message
    );
  }
  return (ex as Error).message;
}

/** Backend x_api_auth returns 403 `detail`: "Invalid or missing API Key" */
export function isForbiddenApiKeyError(ex: unknown): boolean {
  const status = (ex as Error & { status?: number }).status;
  if (status !== 403) return false;
  const msg = apiErrorMessage(ex).toLowerCase();
  return (
    msg.includes("api key") ||
    msg.includes("invalid or missing") ||
    msg.includes("missing api")
  );
}

export function looksLikeApiKeyErrorMessage(text: string | null): boolean {
  if (!text) return false;
  const m = text.toLowerCase();
  return m.includes("api key") || m.includes("invalid or missing");
}

/** Returns `response.data` for wrapped `{ success, data }` payloads (login/signup). */
export function unwrapApiData<T>(raw: unknown): T | undefined {
  if (raw != null && typeof raw === "object" && "data" in raw) {
    const d = (raw as { data: unknown }).data;
    return d !== undefined ? (d as T) : undefined;
  }
  return undefined;
}

export async function apiJson(
  path: string,
  init: RequestInit & { auth?: string } = {}
): Promise<unknown> {
  const { auth, headers: extra, ...rest } = init;
  const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
  const baseHeaders: Record<string, string> = {
    ...apiHeaders(auth),
    ...((extra as Record<string, string>) || {}),
  };
  if (rest.body instanceof FormData) {
    delete baseHeaders["Content-Type"];
  }

  const res = await fetch(url, {
    ...rest,
    cache: "no-store",
    credentials: "same-origin",
    headers: baseHeaders,
  });

  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`);
    (err as Error & { body: unknown; status: number }).body = body;
    (err as Error & { status: number }).status = res.status;
    throw err;
  }

  return body;
}
