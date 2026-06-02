/**
 * Live-test inference env mapping.
 *
 * When a DeepSeek key is present (injected by `doppler run`), map it onto the
 * OpenAI-compatible client's env contract so the live inference test can call
 * DeepSeek v4 Flash. No-op if OPENAI_BASE_URL is already set (explicit override)
 * or no DEEPSEEK_API_KEY is present (the inference test then skips loudly).
 */
if (!process.env.OPENAI_BASE_URL && process.env.DEEPSEEK_API_KEY) {
  process.env.OPENAI_BASE_URL = 'https://api.deepseek.com';
  process.env.OPENAI_API_KEY = process.env.DEEPSEEK_API_KEY;
  if (!process.env.SHADOW_INFERENCE_MODEL) {
    process.env.SHADOW_INFERENCE_MODEL = 'deepseek-v4-flash';
  }
}
