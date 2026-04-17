import type { ChatMessage, RouteCandidate } from "./model-router.js";

export async function callOllamaChat(
  candidate: RouteCandidate,
  messages: ChatMessage[],
  apiKey?: string,
): Promise<string> {
  const base = candidate.endpoint.replace(/\/+$/, "");
  const requestBody = JSON.stringify({
    model: candidate.model,
    stream: false,
    messages,
  });
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (candidate.provider === "cloud") {
    if (!apiKey) {
      throw new Error("Cloud routing requires a credential. Run `preships login` first.");
    }
    headers.authorization = `Bearer ${apiKey}`;
  }

  const urls =
    candidate.provider === "cloud"
      ? [`${base}/api/v1/chat`, `${base}/api/chat`]
      : [`${base}/api/chat`];

  let lastError = "unknown error";
  for (const url of urls) {
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: requestBody,
    });

    if (!response.ok) {
      const body = await response.text();
      lastError = `Model call failed (${response.status}): ${body}`;
      if (
        candidate.provider === "cloud" &&
        response.status === 404 &&
        url.endsWith("/api/v1/chat")
      ) {
        continue;
      }
      throw new Error(lastError);
    }

    const payload = (await response.json()) as {
      message?: { content?: string };
      content?: string;
      output?: string;
    };
    const content =
      payload.message?.content?.trim() ?? payload.content?.trim() ?? payload.output?.trim();
    if (!content) {
      throw new Error("Model returned an empty response.");
    }
    return content;
  }

  throw new Error(lastError);
}
