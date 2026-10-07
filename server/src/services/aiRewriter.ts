import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod/v4';
import { env } from '../config/env.js';
import { checkFabrication, type GuardResult } from '../lib/fabricationGuard.js';
import { logger, timed } from '../observability/logger.js';

/**
 * Optional AI wording layer for "Fix My Resume". Disabled unless ANTHROPIC_API_KEY is set (server-side only;
 * the key is never sent to the browser). The model may only reword; every rewrite is checked by the
 * deterministic fabrication guard, and rewrites that introduce skills, numbers or organisations are rejected.
 * The AI never produces or changes a score.
 */
export const AI_MODEL = 'claude-opus-5-5';

export class AiUnavailableError extends Error {}

export const isAiRewriteEnabled = () => Boolean(env.anthropicApiKey);

const RewriteSchema = z.object({
  rewrites: z.array(z.object({ index: z.number().int(), text: z.string() })),
});

const SYSTEM = `You rewrite resume bullet points for clarity and impact.
Rules you must follow:
- Use only facts present in the original bullet and the resume context. Never add technologies, tools, companies, numbers, metrics, outcomes, certifications or responsibilities that are not stated.
- Start with a strong past-tense action verb. Keep each bullet to one sentence of 8-28 words.
- If a bullet cannot be improved without inventing facts, return it unchanged.`;

export type AiRewrite = { original: string; text: string; guard: GuardResult; accepted: boolean };

export const rewriteBullets = async (bullets: string[], resumeText: string, targetRole: string): Promise<AiRewrite[]> => {
  if (!isAiRewriteEnabled()) throw new AiUnavailableError('AI rewriting is not configured.');
  const client = new Anthropic({ apiKey: env.anthropicApiKey, timeout: 60_000, maxRetries: 1 });
  let response;
  try {
    response = await timed(
      'ai.rewrite',
      () =>
        client.messages.parse({
          model: AI_MODEL,
          max_tokens: 16000,
          output_config: { effort: 'low', format: zodOutputFormat(RewriteSchema) },
          system: SYSTEM,
          messages: [
            {
              role: 'user',
              content: `Target role: ${targetRole}\n\nResume context:\n${resumeText}\n\nRewrite these bullets (return one entry per index):\n${bullets.map((bullet, index) => `${index}. ${bullet}`).join('\n')}`,
            },
          ],
        }),
      { bullets: bullets.length, model: AI_MODEL },
    );
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new AiUnavailableError('The AI service is busy. Please try again in a minute.');
    if (error instanceof Anthropic.APIError) throw new AiUnavailableError('The AI service is unavailable right now. Deterministic suggestions are still available.');
    throw new AiUnavailableError('The AI service could not be reached. Deterministic suggestions are still available.');
  }
  // Refusals and malformed output are treated as "no suggestions", never as errors in the user's resume.
  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    logger.warn('ai.rewrite_unusable', { stopReason: response.stop_reason });
    return [];
  }
  return response.parsed_output.rewrites
    .filter((item) => Number.isInteger(item.index) && item.index >= 0 && item.index < bullets.length && item.text.trim().length > 0 && item.text.length < 600)
    .map((item) => {
      const guard = checkFabrication(resumeText, item.text, [targetRole]);
      return { original: bullets[item.index], text: item.text.trim(), guard, accepted: guard.ok && item.text.trim() !== bullets[item.index] };
    });
};
