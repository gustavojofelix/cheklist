import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { Supabase } from './supabase';

export type OrgRole = 'user' | 'manager' | 'admin';
export interface Profile {
  id: string; email: string; full_name: string; phone_country: string; phone_number: string | null;
  status: 'active' | 'suspended'; platform_role: 'operator' | 'superadmin' | null; locale: 'pt' | 'en';
  last_access_at: string | null;
}
export interface OrgSummary {
  id: string; name: string; parent_id: string | null; role: OrgRole; logo_path: string | null;
  ai_enabled: boolean; access_mode: 'full' | 'read_only'; operator?: boolean;
}
export interface SubscriptionSummary {
  organization_id: string; status: string; plan: string; plan_slug: string;
  trial_ends_at: string | null; current_period_end: string;
}
export interface OperatorSession { organization_id: string; started_at: string; reason: string }
interface Context { profile: Profile | null; organizations: OrgSummary[]; subscriptions: SubscriptionSummary[]; operator_session: OperatorSession | null }

const ACTIVE_KEY = 'cl.activeOrg';
const RANK: Record<OrgRole, number> = { user: 1, manager: 2, admin: 3 };

/** Who am I, which organizations can I see, and which account is active. */
@Injectable({ providedIn: 'root' })
export class ContextStore {
  private readonly sb = inject(Supabase);
  private readonly auth = inject(AuthService);

  readonly loaded = signal(false);
  readonly profile = signal<Profile | null>(null);
  readonly organizations = signal<OrgSummary[]>([]);
  readonly subscriptions = signal<SubscriptionSummary[]>([]);
  readonly operatorSession = signal<OperatorSession | null>(null);
  private readonly activeId = signal<string | null>(readLocal(ACTIVE_KEY));

  /** Parent entities the user can reach (the "accounts"). */
  readonly accounts = computed(() => {
    const orgs = this.organizations();
    const roots = new Map<string, OrgSummary>();
    for (const o of orgs) {
      const root = orgs.find((x) => x.id === (o.parent_id ?? o.id)) ?? o;
      if (!roots.has(root.id)) roots.set(root.id, root);
    }
    return [...roots.values()];
  });
  readonly active = computed<OrgSummary | null>(() => {
    const accounts = this.accounts();
    return accounts.find((o) => o.id === this.activeId()) ?? accounts[0] ?? null;
  });
  readonly role = computed<OrgRole | null>(() => this.active()?.role ?? null);
  readonly isPlatform = computed(() => !!this.profile()?.platform_role);
  readonly readOnly = computed(() => this.active()?.access_mode === 'read_only');
  readonly subscription = computed(() =>
    this.subscriptions().find((s) => s.organization_id === this.active()?.id) ?? null);
  /** Entities (parent + branches) of the active account the user can open. */
  readonly entities = computed(() => {
    const a = this.active();
    if (!a) return [];
    return this.organizations().filter((o) => o.id === a.id || o.parent_id === a.id);
  });

  constructor() {
    effect(() => {
      const id = this.active()?.id;
      if (id) writeLocal(ACTIVE_KEY, id);
    });
  }

  can(min: OrgRole, orgId?: string): boolean {
    const org = orgId ? this.organizations().find((o) => o.id === orgId) : this.active();
    return !!org && RANK[org.role] >= RANK[min];
  }

  canWrite(min: OrgRole = 'user', orgId?: string): boolean {
    return this.can(min, orgId) && !this.readOnly();
  }

  setActive(id: string): void {
    this.activeId.set(id);
  }

  async load(): Promise<void> {
    if (!this.auth.session()) {
      this.reset();
      return;
    }
    const ctx = await this.sb.rpc<Context>('my_context');
    this.profile.set(ctx.profile);
    this.organizations.set(ctx.organizations ?? []);
    this.subscriptions.set(ctx.subscriptions ?? []);
    this.operatorSession.set(ctx.operator_session ?? null);
    this.loaded.set(true);
  }

  reset(): void {
    this.profile.set(null);
    this.organizations.set([]);
    this.subscriptions.set([]);
    this.operatorSession.set(null);
    this.loaded.set(false);
  }
}

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* storage unavailable */ }
}
