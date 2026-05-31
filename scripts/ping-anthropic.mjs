import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
for (const line of readFileSync(resolve(__dirname, '..', '.env.local'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

console.log('Probando claude-sonnet-4-6 (texto)…');
try {
  const r = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 50,
    messages: [{ role: 'user', content: 'Di "ok" y nada más.' }],
  });
  const text = r.content.find(b => b.type === 'text');
  console.log('OK:', text?.text);
  console.log('Stop reason:', r.stop_reason);
} catch (err) {
  console.log('FALLO:', err?.status, err?.error?.error?.type, err?.error?.error?.message ?? err?.message);
}
