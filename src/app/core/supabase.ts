import { Injectable } from '@angular/core';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';

/** Single Supabase client for the app (anon/publishable key only — RLS is the security boundary). */
@Injectable({ providedIn: 'root' })
export class Supabase {
  readonly client: SupabaseClient = createClient(environment.supabaseUrl, environment.supabaseKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });

  /** Throws on PostgREST/RPC errors so callers can use try/catch. */
  async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await this.client.rpc(fn, args);
    if (error) throw error;
    return data as T;
  }

  /** Calls an Edge Function with the user's JWT. */
  async fn<T>(name: string, body: unknown): Promise<T> {
    const { data, error } = await this.client.functions.invoke(name, { body: body as Record<string, unknown> });
    if (error) {
      const ctx = (error as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') {
        const payload = await ctx.json().catch(() => null);
        if (payload?.error) throw new Error(payload.error);
      }
      throw error;
    }
    return data as T;
  }
}
