import { config } from "../config";

/**
 * One call site for every model provider. Nothing outside this file may name a
 * provider: the demo runs on Gemini's free tier, Groq is the fallback if we hit a
 * rate limit, and Claude is a one-env-var switch if we ever decide to pay.
 *
 * Uses global fetch (Node 18+) on purpose — no new dependency, same style as the
 * hand-rolled fetch wrapper on the client.
 */

export class LlmError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "LlmError";
  }
}

export class LlmNotConfiguredError extends LlmError {
  constructor() {
    // Shared by every LLM caller (diagnosis, content generation, ...) — kept generic
    // rather than naming one feature that happens to be the first to hit this.
    super("LLM_API_KEY is not set");
    this.name = "LlmNotConfiguredError";
  }
}

interface GenerateOptions {
  /** Steers the model without polluting the user prompt. */
  system?: string;
  maxTokens?: number;
  temperature?: number;
}

/** Models like to wrap JSON in ```json fences even when asked not to. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) return trimmed;
  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

async function postJson(url: string, headers: Record<string, string>, body: unknown): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      // 429 is the one every free tier hits — name it so callers can fall back to cache.
      throw new LlmError(
        `${config.llm.provider} returned ${response.status}: ${detail.slice(0, 400)}`,
        response.status
      );
    }
    return await response.json();
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new LlmError(`${config.llm.provider} timed out after ${config.llm.timeoutMs}ms`);
    }
    throw new LlmError(`${config.llm.provider} request failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(prompt: string, options: GenerateOptions): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${encodeURIComponent(config.llm.model)}:generateContent?key=${encodeURIComponent(config.llm.apiKey)}`;

  const data = await postJson(url, {}, {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    ...(options.system ? { systemInstruction: { parts: [{ text: options.system }] } } : {}),
    generationConfig: {
      responseMimeType: "application/json",
      temperature: options.temperature ?? 0.2,
      maxOutputTokens: options.maxTokens ?? 4096,
    },
  });

  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new LlmError("Gemini returned no text part");
  }
  return text;
}

async function callGroq(prompt: string, options: GenerateOptions): Promise<string> {
  const data = await postJson(
    "https://api.groq.com/openai/v1/chat/completions",
    { authorization: `Bearer ${config.llm.apiKey}` },
    {
      model: config.llm.model,
      messages: [
        ...(options.system ? [{ role: "system", content: options.system }] : []),
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 4096,
    }
  );

  const text = data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new LlmError("Groq returned no message content");
  }
  return text;
}

async function callAnthropic(prompt: string, options: GenerateOptions): Promise<string> {
  const data = await postJson(
    "https://api.anthropic.com/v1/messages",
    { "x-api-key": config.llm.apiKey, "anthropic-version": "2023-06-01" },
    {
      model: config.llm.model,
      max_tokens: options.maxTokens ?? 4096,
      temperature: options.temperature ?? 0.2,
      ...(options.system ? { system: options.system } : {}),
      messages: [{ role: "user", content: prompt }],
    }
  );

  const text = data?.content?.find((block: { type: string }) => block.type === "text")?.text;
  if (typeof text !== "string") {
    throw new LlmError("Anthropic returned no text block");
  }
  return text;
}

export function isLlmConfigured(): boolean {
  return config.llm.apiKey.length > 0;
}

/** Which model produced a given row — stored on diagnoses so results stay traceable. */
export function currentModelLabel(): string {
  return `${config.llm.provider}:${config.llm.model}`;
}

export async function generateText(prompt: string, options: GenerateOptions = {}): Promise<string> {
  if (!isLlmConfigured()) throw new LlmNotConfiguredError();

  switch (config.llm.provider) {
    case "gemini":
      return callGemini(prompt, options);
    case "groq":
      return callGroq(prompt, options);
    case "anthropic":
      return callAnthropic(prompt, options);
  }
}

export async function generateJson<T>(prompt: string, options: GenerateOptions = {}): Promise<T> {
  const raw = await generateText(prompt, options);
  const cleaned = stripCodeFence(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new LlmError(`${config.llm.provider} did not return valid JSON: ${cleaned.slice(0, 300)}`);
  }
}
