import Anthropic from '@anthropic-ai/sdk';

// NOTA: modificado respecto a docx sec 2 (stack).
// El docx fija `claude-sonnet-4-20250514`, deprecado y con retirada el
// 15-jun-2026. Usamos su sucesor directo del mismo tier. Detalles en README.
export const ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export function createAnthropicClient() {
  return new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });
}
