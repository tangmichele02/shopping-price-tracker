export type Push = {
  title: string;
  message: string;
  // Path within the app to open when the notification is tapped.
  path?: string;
  urgent?: boolean;
};

function appUrl(path: string): string | undefined {
  const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return host ? `https://${host}${path}` : undefined;
}

// Sends a phone push through ntfy. Returns false if it was not delivered.
export async function sendPush(push: Push): Promise<boolean> {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) {
    console.warn("NTFY_TOPIC is not set; push not sent:", push.title);
    return false;
  }
  try {
    const res = await fetch("https://ntfy.sh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        topic,
        title: push.title,
        message: push.message,
        click: push.path ? appUrl(push.path) : undefined,
        priority: push.urgent ? 4 : 3,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) console.error(`ntfy returned HTTP ${res.status}`);
    return res.ok;
  } catch (err) {
    console.error("ntfy request failed", err);
    return false;
  }
}
