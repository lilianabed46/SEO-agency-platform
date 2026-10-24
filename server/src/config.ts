function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optionalInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Environment variable ${name} must be a positive number, got: ${raw}`);
  }
  return parsed;
}

export type LlmProvider = "gemini" | "groq" | "anthropic";

const LLM_PROVIDERS: LlmProvider[] = ["gemini", "groq", "anthropic"];

// Verify these against each provider's current model list before a demo — they move.
const DEFAULT_LLM_MODELS: Record<LlmProvider, string> = {
  gemini: "gemini-2.0-flash",
  groq: "llama-3.3-70b-versatile",
  anthropic: "claude-haiku-4-5-20251001",
};

function llmProviderFromEnv(): LlmProvider {
  const raw = (process.env.LLM_PROVIDER ?? "gemini").toLowerCase();
  if (!LLM_PROVIDERS.includes(raw as LlmProvider)) {
    throw new Error(`LLM_PROVIDER must be one of ${LLM_PROVIDERS.join("/")}, got: ${raw}`);
  }
  return raw as LlmProvider;
}

const tokenEncryptionKeyB64 = requireEnv("TOKEN_ENCRYPTION_KEY");
const tokenEncryptionKey = Buffer.from(tokenEncryptionKeyB64, "base64");
if (tokenEncryptionKey.length !== 32) {
  throw new Error(
    `TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${tokenEncryptionKey.length}). ` +
      `Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
  );
}

const llmProvider = llmProviderFromEnv();

export const config = {
  port: process.env.PORT ? Number(process.env.PORT) : 4000,
  clientOrigin: process.env.CLIENT_ORIGIN ?? "http://localhost:5173",

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    redirectUri: process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:4000/api/google/oauth/callback",
  },

  tokenEncryptionKey,

  // Provider is deliberately not hard-coded anywhere else: the demo runs on Gemini's
  // free tier, Groq is the fallback, and Claude stays a one-env-var switch.
  llm: {
    provider: llmProvider,
    apiKey: process.env.LLM_API_KEY ?? "",
    model: process.env.LLM_MODEL || DEFAULT_LLM_MODELS[llmProvider],
    timeoutMs: optionalInt("LLM_TIMEOUT_MS", 45000),
  },

  pageSpeedApiKey: process.env.PAGESPEED_API_KEY ?? "",

  crawler: {
    maxPages: optionalInt("CRAWLER_MAX_PAGES", 50),
    concurrency: optionalInt("CRAWLER_CONCURRENCY", 5),
    requestTimeoutMs: optionalInt("CRAWLER_REQUEST_TIMEOUT_MS", 8000),
    totalTimeoutMs: optionalInt("CRAWLER_TOTAL_TIMEOUT_MS", 120000),
  },
};
