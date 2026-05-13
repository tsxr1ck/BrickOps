/**
 * Robust JSON parser for LLM output.
 *
 * LLMs often wrap JSON in markdown code fences or add trailing text.
 * This parser handles common patterns gracefully.
 */

/**
 * Extract and parse JSON from an LLM response string.
 * Handles:
 *  - Raw JSON
 *  - JSON wrapped in ```json ... ```
 *  - JSON wrapped in ``` ... ```
 *  - JSON embedded in surrounding text
 *  - JSON arrays
 */
export function parseJsonFromLLM<T = any>(text: string): T | null {
  // Try 1: Direct parse
  try {
    return JSON.parse(text) as T;
  } catch {}

  // Try 2: Extract from markdown code fence
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1].trim()) as T;
    } catch {}
  }

  // Try 3: Find the first { ... } or [ ... ] block
  const jsonMatch = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[1]) as T;
    } catch {}
  }

  // Try 4: Aggressive cleanup — strip common LLM artifacts
  const cleaned = text
    .replace(/^[^[{]*/, '') // Strip leading non-JSON text
    .replace(/[^}\]]*$/, '') // Strip trailing non-JSON text
    .trim();

  if (cleaned) {
    try {
      return JSON.parse(cleaned) as T;
    } catch {}
  }

  return null;
}

/**
 * Strict version that throws on failure.
 */
export function parseJsonFromLLMStrict<T = any>(text: string): T {
  const result = parseJsonFromLLM<T>(text);
  if (result === null) {
    throw new Error(`Failed to parse JSON from LLM output:\n${text.slice(0, 500)}`);
  }
  return result;
}
