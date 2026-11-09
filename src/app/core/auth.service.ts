import { Injectable, computed, inject, signal } from '@angular/core';
import { Session } from '@supabase/supabase-js';
import { Supabase } from './supabase';

export interface SignUpData {
  email: string;
  password: string;
  fullName: string;
  phoneCountry: string;
  phoneNumber: string;
  locale: string;
  organization?: Record<string, unknown>;
  invitationToken?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly sb = inject(Supabase);
  readonly session = signal<Session | null>(null);
  readonly ready = signal(false);
  readonly userId = computed(() => this.session()?.user.id ?? null);
  /** Set when the user arrives from a password-recovery e-mail. */
  readonly recovering = signal(false);

  private readyPromise: Promise<void>;

  constructor() {
    this.readyPromise = this.sb.client.auth.getSession().then(({ data }) => {
      this.session.set(data.session);
      this.ready.set(true);
    });
    this.sb.client.auth.onAuthStateChange((event, session) => {
      this.session.set(session);
      if (event === 'PASSWORD_RECOVERY') this.recovering.set(true);
    });
  }

  whenReady(): Promise<void> {
    return this.readyPromise;
  }

  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.sb.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  async signUp(d: SignUpData): Promise<{ needsConfirmation: boolean }> {
    const redirect = d.invitationToken
      ? `${location.origin}/invite/${d.invitationToken}`
      : `${location.origin}/dashboard`;
    const { data, error } = await this.sb.client.auth.signUp({
      email: d.email,
      password: d.password,
      options: {
        emailRedirectTo: redirect,
        data: {
          full_name: d.fullName,
          phone_country: d.phoneCountry,
          phone_number: d.phoneNumber,
          locale: d.locale,
          accepted_terms: true,
          ...(d.organization ? { organization: d.organization } : {}),
        },
      },
    });
    if (error) throw error;
    return { needsConfirmation: !data.session };
  }

  async signOut(): Promise<void> {
    await this.sb.client.auth.signOut();
  }

  async requestPasswordReset(email: string): Promise<void> {
    const { error } = await this.sb.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${location.origin}/reset-password`,
    });
    if (error) throw error;
  }

  async updatePassword(password: string): Promise<void> {
    const { error } = await this.sb.client.auth.updateUser({ password });
    if (error) throw error;
    this.recovering.set(false);
  }

  async updateEmail(email: string): Promise<void> {
    const { error } = await this.sb.client.auth.updateUser({ email });
    if (error) throw error;
  }
}
