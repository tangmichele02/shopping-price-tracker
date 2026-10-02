export const SESSION_COOKIE = "session";

// Single-user app: the session cookie is an HMAC of a fixed message, keyed by
// the password and SESSION_SECRET. Changing either signs everyone out.
// Uses Web Crypto so it works in both the proxy and server actions.
async function hmacHex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(key),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(message));
  return [...new Uint8Array(signature)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && process.env.SESSION_SECRET);
}

// Outside production, a missing password means the app is open (local dev).
// In production it means nobody gets in.
export function authDisabled(): boolean {
  return !authConfigured() && process.env.NODE_ENV !== "production";
}

export async function sessionToken(): Promise<string> {
  return hmacHex(
    `${process.env.SESSION_SECRET}:${process.env.APP_PASSWORD}`,
    "shopping-price-tracker-session",
  );
}

export async function isValidSession(cookieValue: string | undefined): Promise<boolean> {
  if (authDisabled()) return true;
  if (!authConfigured() || !cookieValue) return false;
  return timingSafeEqual(cookieValue, await sessionToken());
}

export async function isCorrectPassword(password: string): Promise<boolean> {
  if (!authConfigured()) return false;
  // Compare digests so the comparison does not leak the password length.
  const secret = process.env.SESSION_SECRET!;
  const [given, expected] = await Promise.all([
    hmacHex(secret, password),
    hmacHex(secret, process.env.APP_PASSWORD!),
  ]);
  return timingSafeEqual(given, expected);
}
