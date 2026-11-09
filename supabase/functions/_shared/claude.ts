// Shared Claude client for the OCR and assistant functions.
// Model comes from platform_settings.claude_model (default Claude Opus 5.5).
// Server-side refusal fallbacks are enabled ("default" routing by refusal category).
import Anthropic from 'npm:@anthropic-ai/sdk@1.2.0';
import { SupabaseClient } from 'npm:@supabase/supabase-js@2.119.0';

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function claudeClient(): Anthropic | null {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  return key ? new Anthropic({ apiKey: key, timeout: 120_000, maxRetries: 2 }) : null;
}

export async function claudeModel(admin: SupabaseClient): Promise<string> {
  const { data } = await admin.from('platform_settings').select('value').eq('key', 'claude_model').maybeSingle();
  return typeof data?.value === 'string' && data.value ? data.value : 'claude-opus-5-5';
}

export function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
}

export { Anthropic };
