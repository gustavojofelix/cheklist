import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { PageHeader } from '../../shared/ui/page-header';

interface Person { id: string; full_name: string; email: string; platform_role: 'operator' | 'superadmin' | null;
                   status: 'active' | 'suspended'; last_access_at: string | null }

/** Back office: platform staff (superadmins / operators) and user suspension. */
@Component({
  selector: 'app-admin-staff',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, DatePipe, PageHeader],
  template: `
    <app-page-header [title]="'admin.nav.staff' | transloco" [subtitle]="'admin.staff.subtitle' | transloco" />
    <form class="card mb-4 flex flex-wrap items-end gap-2 p-4" (ngSubmit)="grant()">
      <label class="flex-1 text-sm">{{ 'auth.email' | transloco }}<input type="email" class="input mt-1" name="e" [(ngModel)]="email" required /></label>
      <select class="input !w-44" name="r" [(ngModel)]="role" [attr.aria-label]="'company.members.role' | transloco">
        <option value="operator">{{ 'admin.staff.operator' | transloco }}</option><option value="superadmin">Superadmin</option></select>
      <button class="btn-primary" type="submit" [disabled]="!email.trim()">{{ 'admin.staff.grant' | transloco }}</button>
    </form>
    <p class="mb-2 text-xs text-slate-600">{{ 'admin.staff.grantHint' | transloco }}</p>
    <div class="card overflow-x-auto">
      <table class="table-base">
        <thead><tr><th>{{ 'common.name' | transloco }}</th><th>{{ 'auth.email' | transloco }}</th><th>{{ 'company.members.role' | transloco }}</th>
          <th>{{ 'common.status' | transloco }}</th><th>{{ 'company.members.lastAccess' | transloco }}</th><th></th></tr></thead>
        <tbody>
          @for (p of people(); track p.id) {
            <tr>
              <td class="font-medium">{{ p.full_name }}</td><td class="text-slate-600">{{ p.email }}</td>
              <td>{{ p.platform_role === 'superadmin' ? 'Superadmin' : ('admin.staff.operator' | transloco) }}</td>
              <td><span class="chip" [class]="p.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'">{{ 'status.' + p.status | transloco }}</span></td>
              <td class="text-slate-600">{{ p.last_access_at ? (p.last_access_at | date: 'dd/MM/yyyy HH:mm') : '—' }}</td>
              <td class="whitespace-nowrap text-right">
                @if (p.id !== me()) {
                  <button type="button" class="btn-ghost !py-1" (click)="setStatus(p, p.status === 'active' ? 'suspended' : 'active')">
                    {{ (p.status === 'active' ? 'admin.staff.suspend' : 'admin.staff.reactivate') | transloco }}</button>
                  <button type="button" class="btn-ghost !py-1 text-red-600" (click)="revoke(p)">{{ 'admin.staff.revoke' | transloco }}</button>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminStaffPage implements OnInit {
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly ctx = inject(ContextStore);
  protected readonly people = signal<Person[]>([]);
  protected readonly me = () => this.ctx.profile()?.id;
  protected email = '';
  protected role: 'operator' | 'superadmin' = 'operator';

  async ngOnInit(): Promise<void> {
    const { data } = await this.sb.client.from('profiles').select('id, full_name, email, platform_role, status, last_access_at')
      .not('platform_role', 'is', null).order('full_name');
    this.people.set((data ?? []) as Person[]);
  }

  protected async grant(): Promise<void> {
    await this.run(() => this.sb.rpc('set_platform_role', { p_email: this.email, p_role: this.role }));
    this.email = '';
  }
  protected revoke(p: Person): Promise<void> {
    return this.run(() => this.sb.rpc('set_platform_role', { p_email: p.email, p_role: null }));
  }
  protected setStatus(p: Person, status: 'active' | 'suspended'): Promise<void> {
    return this.run(() => this.sb.rpc('set_user_status', { p_user: p.id, p_status: status }));
  }

  private async run(fn: () => Promise<unknown>): Promise<void> {
    try { await fn(); this.toast.success('common.saved'); await this.ngOnInit(); } catch (e) { this.toast.error(errorKey(e)); }
  }
}
