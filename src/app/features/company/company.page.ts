import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore, OrgRole } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { LocaleService } from '../../core/i18n';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { ConfirmService } from '../../shared/ui/confirm';
import { OrgFields, orgForm } from '../../shared/ui/org-fields';
import { PageHeader } from '../../shared/ui/page-header';
import { AuditTable } from '../audit/audit-table';

type Tab = 'dados' | 'utilizadores' | 'registos' | 'notificacoes';
interface Member { user_id: string; role: OrgRole; profiles: { full_name: string; email: string; phone_number: string | null; status: string; last_access_at: string | null } }
interface Invitation { id: string; email: string; role: OrgRole; created_at: string; expires_at: string }

@Component({
  selector: 'app-company',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormsModule, TranslocoPipe, DatePipe, PageHeader, OrgFields, AuditTable],
  template: `
    <app-page-header [title]="ctx.active()?.name ?? ''" [subtitle]="'company.subtitle' | transloco" />

    <div class="mb-6 flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
      @for (t of tabs(); track t) {
        <button type="button" role="tab" [attr.aria-selected]="tab() === t" (click)="go(t)"
                class="-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium"
                [class]="tab() === t ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700'">
          {{ 'company.tabs.' + t | transloco }}
        </button>
      }
    </div>

    @switch (tab()) {
      @case ('dados') {
        @if (isAdmin()) {
          <section class="card mb-6 p-5">
            <h2 class="font-semibold text-slate-900">{{ 'company.platformAccess.title' | transloco }}</h2>
            <label class="mt-3 flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-0.5" [checked]="platformAccess()" (change)="togglePlatformAccess($any($event.target).checked)" [disabled]="readOnly()" />
              <span>{{ 'company.platformAccess.label' | transloco }}
                <span class="block text-xs text-slate-500">{{ 'company.platformAccess.hint' | transloco }}</span></span>
            </label>
          </section>
        }
        <form class="card p-5" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <fieldset [disabled]="!canEdit()" class="space-y-4">
            <app-org-fields [form]="form" [extended]="true" />
            <label class="flex items-center gap-2 text-sm">
              <input type="checkbox" [formControl]="aiEnabled" /> {{ 'company.aiEnabled' | transloco }}
            </label>
            <label class="flex items-start gap-2 text-sm">
              <input type="checkbox" class="mt-0.5" [formControl]="docOtp" />
              <span>{{ 'company.docOtp' | transloco }}<span class="block text-xs text-slate-500">{{ 'company.docOtpHint' | transloco }}</span></span>
            </label>
          </fieldset>
          @if (canEdit()) {
            <div class="mt-6 flex justify-end"><button type="submit" class="btn-primary" [disabled]="busy()">{{ 'common.save' | transloco }}</button></div>
          }
        </form>
      }

      @case ('utilizadores') {
        <section class="card p-5">
          <h2 class="font-semibold text-slate-900">{{ 'company.members.title' | transloco }} <span class="text-slate-500">({{ members().length }})</span></h2>
          @if (isAdmin() && !readOnly()) {
            <form class="mt-4 flex flex-wrap gap-2" (ngSubmit)="invite()">
              <input type="email" class="input max-w-xs" name="email" [(ngModel)]="inviteEmail" placeholder="email@empresa.co.mz" required
                     [attr.aria-label]="'auth.email' | transloco" />
              <select class="input !w-40" name="role" [(ngModel)]="inviteRole" [attr.aria-label]="'company.members.role' | transloco">
                @for (r of roles; track r) { <option [value]="r">{{ 'roles.' + r | transloco }}</option> }
              </select>
              <button class="btn-primary" type="submit" [disabled]="busy() || !inviteEmail">{{ 'company.members.invite' | transloco }}</button>
            </form>
            @if (lastInviteLink()) {
              <div class="mt-3 rounded-md bg-brand-50 p-3 text-sm text-brand-800">
                {{ 'company.members.linkHint' | transloco }}
                <code class="mt-1 block break-all text-xs">{{ lastInviteLink() }}</code>
              </div>
            }
          }
          <div class="mt-4 overflow-x-auto">
            <table class="table-base">
              <thead><tr><th>{{ 'common.name' | transloco }}</th><th>{{ 'auth.email' | transloco }}</th><th>{{ 'company.members.role' | transloco }}</th>
                <th>{{ 'common.status' | transloco }}</th><th>{{ 'company.members.lastAccess' | transloco }}</th><th></th></tr></thead>
              <tbody>
                @for (m of members(); track m.user_id) {
                  <tr>
                    <td class="font-medium">{{ m.profiles.full_name }}</td>
                    <td class="text-slate-500">{{ m.profiles.email }}</td>
                    <td>
                      @if (isAdmin() && !readOnly()) {
                        <select class="input !w-36 !py-1" [ngModel]="m.role" (ngModelChange)="changeRole(m, $event)" [attr.aria-label]="'company.members.role' | transloco">
                          @for (r of roles; track r) { <option [value]="r">{{ 'roles.' + r | transloco }}</option> }
                        </select>
                      } @else { {{ 'roles.' + m.role | transloco }} }
                    </td>
                    <td><span class="chip" [class]="m.profiles.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ 'status.' + m.profiles.status | transloco }}</span></td>
                    <td class="text-slate-500">{{ m.profiles.last_access_at ? (m.profiles.last_access_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
                    <td class="text-right">
                      @if (isAdmin() && !readOnly() && m.user_id !== ctx.profile()?.id) {
                        <button type="button" class="btn-ghost !px-2 !py-1 text-red-600" (click)="removeMember(m)">{{ 'common.remove' | transloco }}</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (invitations().length) {
            <h3 class="mt-6 text-sm font-semibold text-slate-700">{{ 'company.members.pending' | transloco }}</h3>
            <ul class="mt-2 divide-y divide-slate-100 text-sm">
              @for (i of invitations(); track i.id) {
                <li class="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{{ i.email }} · {{ 'roles.' + i.role | transloco }}
                    <span class="text-xs text-slate-500">· {{ 'company.members.expires' | transloco: { date: (i.expires_at | date: 'dd/MM/yyyy') } }}</span></span>
                  @if (isAdmin()) {
                    <span class="flex gap-1">
                      <button type="button" class="btn-ghost !py-1" (click)="resend(i)">{{ 'company.members.resend' | transloco }}</button>
                      <button type="button" class="btn-ghost !py-1 text-red-600" (click)="revoke(i)">{{ 'company.members.revoke' | transloco }}</button>
                    </span>
                  }
                </li>
              }
            </ul>
          }
        </section>
      }

      @case ('registos') {
        <app-audit-table [orgId]="ctx.active()!.id" />
      }

      @case ('notificacoes') {
        <form class="card space-y-4 p-5" [formGroup]="notif" (ngSubmit)="saveNotifications()" novalidate>
          <fieldset [disabled]="!canEdit()" class="space-y-4">
            <div class="grid gap-4 sm:grid-cols-2">
              <div>
                <label class="label" for="n-att">{{ 'company.notif.attention' | transloco }}</label>
                <input id="n-att" type="number" min="1" max="365" class="input" formControlName="attention_days" />
              </div>
              <div>
                <label class="label" for="n-crit">{{ 'company.notif.critical' | transloco }}</label>
                <input id="n-crit" type="number" min="0" max="365" class="input" formControlName="critical_days" />
              </div>
            </div>
            @if (notif.hasError('thresholds')) { <p class="field-error">{{ 'company.notif.thresholdError' | transloco }}</p> }
            <div>
              <p class="label">{{ 'company.notif.intervals' | transloco }}</p>
              <div class="flex flex-wrap gap-4 text-sm">
                @for (d of allDays; track d) {
                  <label class="flex items-center gap-1.5"><input type="checkbox" [checked]="days().includes(d)" (change)="toggleDay(d)" [disabled]="!canEdit()" /> {{ d }}</label>
                }
              </div>
            </div>
            <div>
              <label class="label" for="n-emails">{{ 'company.notif.emails' | transloco }}</label>
              <textarea id="n-emails" rows="3" class="input" formControlName="notification_emails" [placeholder]="'company.notif.emailsHint' | transloco"></textarea>
            </div>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="repeat_while_critical" /> {{ 'company.notif.repeat' | transloco }}</label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="notify_admin" /> {{ 'company.notif.notifyAdmin' | transloco }}</label>
            <label class="flex items-center gap-2 text-sm"><input type="checkbox" formControlName="monthly_digest" /> {{ 'company.notif.digest' | transloco }}</label>
          </fieldset>
          @if (canEdit()) { <div class="flex justify-end"><button class="btn-primary" type="submit" [disabled]="busy()">{{ 'common.save' | transloco }}</button></div> }
        </form>
      }
    }
  `,
})
export class CompanyPage {
  readonly tabParam = input<string>('', { alias: 'tab' });
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly router = inject(Router);
  private readonly locale = inject(LocaleService);

  protected readonly roles: OrgRole[] = ['admin', 'manager', 'user'];
  protected readonly allDays = [90, 60, 30, 15, 1];
  protected readonly busy = signal(false);
  protected readonly members = signal<Member[]>([]);
  protected readonly invitations = signal<Invitation[]>([]);
  protected readonly platformAccess = signal(false);
  protected readonly days = signal<number[]>([]);
  protected readonly lastInviteLink = signal<string | null>(null);
  protected inviteEmail = '';
  protected inviteRole: OrgRole = 'user';

  protected readonly isAdmin = computed(() => this.ctx.can('admin'));
  protected readonly readOnly = computed(() => this.ctx.readOnly());
  protected readonly canEdit = computed(() => this.ctx.canWrite('admin'));
  protected readonly tabs = computed<Tab[]>(() =>
    this.ctx.can('manager') ? ['dados', 'utilizadores', 'registos', 'notificacoes'] : ['dados', 'utilizadores']);
  protected readonly tab = computed<Tab>(() => {
    const t = this.tabParam() as Tab;
    return this.tabs().includes(t) ? t : 'dados';
  });

  protected readonly form = orgForm(this.fb, true);
  protected readonly aiEnabled = this.fb.nonNullable.control(true);
  protected readonly docOtp = this.fb.nonNullable.control(false);
  protected readonly notif = this.fb.nonNullable.group({
    attention_days: [90, [Validators.required, Validators.min(1), Validators.max(365)]],
    critical_days: [15, [Validators.required, Validators.min(0), Validators.max(365)]],
    notification_emails: [''],
    repeat_while_critical: [true],
    notify_admin: [true],
    monthly_digest: [false],
  }, { validators: (g) => (Number(g.get('critical_days')!.value) < Number(g.get('attention_days')!.value) ? null : { thresholds: true }) });

  constructor() {
    effect(() => {
      const org = this.ctx.active();
      if (org) void this.load(org.id);
    });
  }

  protected go(t: Tab): void {
    void this.router.navigate([], { queryParams: { tab: t }, replaceUrl: true });
  }

  private async load(id: string): Promise<void> {
    const [org, members, invites] = await Promise.all([
      this.sb.client.from('organizations').select('*').eq('id', id).single(),
      this.sb.client.from('memberships').select('user_id, role, profiles!memberships_user_id_fkey(full_name, email, phone_number, status, last_access_at)').eq('org_id', id),
      this.ctx.can('admin', id)
        ? this.sb.client.from('invitations').select('id, email, role, created_at, expires_at').eq('org_id', id)
            .is('accepted_at', null).is('revoked_at', null).gt('expires_at', new Date().toISOString())
        : Promise.resolve({ data: [] }),
    ]);
    const o = org.data as Record<string, unknown> | null;
    if (o) {
      this.form.patchValue(o);
      this.aiEnabled.setValue(!!o['ai_enabled']);
      this.docOtp.setValue(!!o['document_otp_required']);
      this.platformAccess.set(!!o['platform_access_authorized_at']);
      this.days.set((o['notification_days'] as number[]) ?? []);
      this.notif.patchValue({ ...o, notification_emails: ((o['notification_emails'] as string[]) ?? []).join(', ') });
    }
    this.members.set((members.data ?? []) as unknown as Member[]);
    this.invitations.set((invites.data ?? []) as Invitation[]);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    await this.run(async () => {
      const v = this.form.getRawValue();
      const clean = Object.fromEntries(Object.entries(v).map(([k, val]) => [k, val === '' ? null : val]));
      const { error } = await this.sb.client.from('organizations')
        .update({ ...clean, ai_enabled: this.aiEnabled.value, document_otp_required: this.docOtp.value }).eq('id', this.ctx.active()!.id);
      if (error) throw error;
      await this.ctx.load();
    });
  }

  protected toggleDay(d: number): void {
    this.days.update((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d].sort((a, b) => b - a)));
  }

  protected async saveNotifications(): Promise<void> {
    if (this.notif.invalid) return;
    const v = this.notif.getRawValue();
    const emails = v.notification_emails.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    if (emails.some((e) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) {
      this.toast.error('validation.email');
      return;
    }
    await this.run(async () => {
      const { error } = await this.sb.client.from('organizations').update({
        attention_days: v.attention_days, critical_days: v.critical_days, notification_emails: emails,
        notification_days: this.days(), repeat_while_critical: v.repeat_while_critical, notify_admin: v.notify_admin,
        monthly_digest: v.monthly_digest,
      }).eq('id', this.ctx.active()!.id);
      if (error) throw error;
    });
  }

  protected async togglePlatformAccess(allowed: boolean): Promise<void> {
    await this.run(async () => {
      await this.sb.rpc('set_platform_access', { org: this.ctx.active()!.id, allowed });
      this.platformAccess.set(allowed);
    });
  }

  protected async invite(): Promise<void> {
    await this.run(async () => {
      const token = await this.sb.rpc<string>('invite_member', { org: this.ctx.active()!.id, p_email: this.inviteEmail, p_role: this.inviteRole });
      // The invitation is e-mailed; the link is also shown so it can be shared another way if needed.
      this.lastInviteLink.set(`${location.origin}/invite/${token}`);
      this.inviteEmail = '';
      await this.load(this.ctx.active()!.id);
    }, 'company.members.invited');
  }

  protected async changeRole(m: Member, role: OrgRole): Promise<void> {
    await this.run(async () => {
      const { error } = await this.sb.client.from('memberships').update({ role }).eq('org_id', this.ctx.active()!.id).eq('user_id', m.user_id);
      if (error) throw error;
      await this.load(this.ctx.active()!.id);
    });
  }

  protected async removeMember(m: Member): Promise<void> {
    if (!(await this.confirm.ask({ title: 'company.members.removeTitle', body: 'company.members.removeBody', danger: true,
                                   confirm: 'common.remove', params: { name: m.profiles.full_name } }))) return;
    await this.run(async () => {
      const { error } = await this.sb.client.from('memberships').delete().eq('org_id', this.ctx.active()!.id).eq('user_id', m.user_id);
      if (error) throw error;
      await this.load(this.ctx.active()!.id);
    });
  }

  protected async resend(i: Invitation): Promise<void> {
    await this.run(async () => {
      const token = await this.sb.rpc<string>('resend_invitation', { invitation: i.id });
      this.lastInviteLink.set(`${location.origin}/invite/${token}`);
      await this.load(this.ctx.active()!.id);
    }, 'company.members.invited');
  }

  protected async revoke(i: Invitation): Promise<void> {
    await this.run(async () => {
      const { error } = await this.sb.client.from('invitations').update({ revoked_at: new Date().toISOString() }).eq('id', i.id);
      if (error) throw error;
      await this.load(this.ctx.active()!.id);
    });
  }

  private async run(fn: () => Promise<void>, successKey = 'common.saved'): Promise<void> {
    this.busy.set(true);
    try {
      await fn();
      this.toast.success(successKey);
    } catch (e) {
      this.toast.error(errorKey(e));
    } finally {
      this.busy.set(false);
    }
  }
}
