// Purpose: call OpenRouter for user-requested email drafting without persisting prompts.

import { config } from './config.js';

/** Keep language choices bounded and consistent across AI endpoints. */
export const AI_LANGUAGES = Object.freeze([
  'Arabic', 'Bengali', 'English', 'French', 'German', 'Gujarati', 'Hindi',
  'Japanese', 'Kannada', 'Malayalam', 'Marathi', 'Punjabi', 'Spanish', 'Tamil', 'Telugu', 'Urdu',
]);

/** Report whether the OpenRouter credential is present without revealing it. */
export function getAiStatus() {
  return { configured: Boolean(config.openRouterApiKey), model: config.openRouterModel };
}

/** Request one completion and avoid logging private user text or upstream response details. */
async function requestOpenRouter(messages, maxTokens) {
  if (!config.openRouterApiKey) {
    const error = new Error('Add OPENROUTER_API_KEY to the local .env file to enable AI tools.');
    error.statusCode = 503;
    throw error;
  }

  let response;
  try {
    response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openRouterApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': config.publicBaseUrl,
        'X-OpenRouter-Title': 'ईMAIL',
      },
      body: JSON.stringify({
        model: config.openRouterModel,
        messages,
        max_tokens: maxTokens,
        temperature: 0.35,
      }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    const error = new Error('The AI service could not be reached. Please try again shortly.');
    error.statusCode = 502;
    throw error;
  }

  if (!response.ok) {
    const error = new Error(response.status === 429
      ? 'The free AI model is busy or its request limit has been reached. Try again later.'
      : 'The AI service could not complete this request. Please try again.');
    error.statusCode = response.status === 429 ? 429 : 502;
    throw error;
  }

  const completion = await response.json().catch(() => null);
  const content = completion?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    const error = new Error('The AI service returned an empty response. Please try again.');
    error.statusCode = 502;
    throw error;
  }
  return content.trim();
}

/** Suggest three short, factual reply options for a message the user opened. */
export async function suggestEmailReplies(text, language = 'English') {
  const content = await requestOpenRouter([
    {
      role: 'system',
      content: 'Suggest three distinct, concise, professional replies to the email. Do not invent facts or claim actions have been taken. Return only a valid JSON array of three strings, in the requested language.',
    },
    {
      role: 'user',
      content: `Email to reply to:\n${text}\n\nReply language: ${language}`,
    },
  ], 700);
  const jsonText = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    const replies = JSON.parse(jsonText);
    if (Array.isArray(replies)) return replies.filter((reply) => typeof reply === 'string').slice(0, 3);
  } catch {
    // Keep the UI usable with models that return a short list instead of strict JSON.
  }
  return content.split('\n').map((line) => line.replace(/^[sd.)*-]+/, '').trim()).filter(Boolean).slice(0, 3);
}
