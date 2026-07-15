export const ACCESS_TOKEN_KEY = "access_token";
export const USER_SNAPSHOT_KEY = "rag_chatbot_user";

export type UserSnapshot = {
  user_id: number;
  email: string;
  display_name: string | null;
  roles?: string[];
  profile_image_url?: string | null;
};

export const LAST_ACTIVE_KEY = "rag_chatbot_last_active";

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  if (!token) return "";

  const lastActiveStr = localStorage.getItem(LAST_ACTIVE_KEY);
  if (lastActiveStr) {
    const lastActive = parseInt(lastActiveStr, 10);
    const now = Date.now();
    const twelveHoursInMs = 12 * 60 * 60 * 1000;
    if (now - lastActive > twelveHoursInMs) {
      clearAuthSession();
      return "";
    }
  }

  localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
  return token;
}

export function setAuthSession(token: string, user: UserSnapshot): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, token);
  localStorage.setItem(USER_SNAPSHOT_KEY, JSON.stringify(user));
  localStorage.setItem(LAST_ACTIVE_KEY, Date.now().toString());
}

export function clearAuthSession(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(USER_SNAPSHOT_KEY);
  localStorage.removeItem(LAST_ACTIVE_KEY);
}

export function getUserSnapshot(): UserSnapshot | null {
  const raw = localStorage.getItem(USER_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UserSnapshot;
  } catch {
    return null;
  }
}

/** Patch fields on the cached user (e.g. after profile refresh or update). */
export function mergeUserSnapshot(patch: Partial<UserSnapshot>): void {
  const cur = getUserSnapshot();
  if (!cur) return;
  localStorage.setItem(
    USER_SNAPSHOT_KEY,
    JSON.stringify({ ...cur, ...patch }),
  );
}
