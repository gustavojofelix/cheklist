import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';

export interface AuditRow {
  id: number; occurred_at: string; organization_name: string | null; actor_name: string | null; event: string;
  table_name: string | null; record_title: string | null; changed_fields: string[] | null;
  old_data: Record<string, unknown> | null; new_data: Record<string, unknown> | null; ip: string | null;
}
const EVENTS = ['auth.login', 'auth.logout', 'insert', 'update', 'delete', 'document.download', 'report.generate',
  'audit.export', 'otp.verified', 'operator.access_start', 'operator.access_end', 'template.upgrade', 'admin.company_created'];
const PAGE = 50;

/** Filterable, keyset-paginated audit log with CSV export. */
@Component({
  selector: 'app-audit-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslocoPipe, DatePipe, Icon],
  template: `
    <div class="card p-4">
      <div class="flex flex-wrap items-end gap-2">
        <select class="input !w-44" [(ngModel)]="event" (ngModelChange)="reload()" [attr.aria-label]="'audit.event.label' | transloco">
          <option value="">{{ 'audit.allEvents' | transloco }}</option>
          @for (e of events; track e) { <option [value]="e">{{ 'audit.event.' + e | transloco }}</option> }
        </select>
        <input class="input !w-40" [(ngModel)]="ip" (change)="reload()" [placeholder]="'audit.ip' | transloco" [attr.aria-label]="'audit.ip' | transloco" />
        <label class="text-xs text-slate-500">{{ 'audit.from' | transloco }}
          <input type="date" class="input !w-40" [(ngModel)]="from" (change)="reload()" /></label>
        <label class="text-xs text-slate-500">{{ 'audit.to' | transloco }}
          <input type="date" class="input !w-40" [(ngModel)]="to" (change)="reload()" /></label>
        <button type="button" class="btn-ghost" (click)="clear()">{{ 'common.clearFilters' | transloco }}</button>
        <span class="flex-1"></span>
        <button type="button" class="btn-secondary" (click)="exportCsv()" [disabled]="!rows().length">
          <app-icon name="download" [size]="16" /> {{ 'audit.export' | transloco }}</button>
      </div>
      <div class="mt-4 overflow-x-auto">
        <table class="table-base">
          <thead><tr><th>{{ 'audit.when' | transloco }}</th><th>{{ 'audit.user' | transloco }}</th><th>{{ 'audit.org' | transloco }}</th>
            <th>{{ 'audit.event.label' | transloco }}</th><th>{{ 'audit.detail' | transloco }}</th><th>IP</th></tr></thead>
          <tbody>
            @for (r of rows(); track r.id) {
              <tr>
                <td class="whitespace-nowrap text-slate-500">{{ r.occurred_at | date: 'dd/MM/yyyy HH:mm:ss' }}</td>
                <td class="font-medium">{{ r.actor_name || ('audit.system' | transloco) }}</td>
                <td class="text-slate-500">{{ r.organization_name }}</td>
                <td><span class="chip bg-slate-100 text-slate-700">{{ 'audit.event.' + r.event | transloco }}</span></td>
                <td class="max-w-md">
                  <p>{{ ('audit.table.' + r.table_name) | transloco }} {{ r.record_title ? '«' + r.record_title + '»' : '' }}</p>
                  @for (c of changes(r); track c.field) {
                    <p class="text-xs text-slate-500"><span class="font-mono">{{ c.field }}</span>: {{ c.from }} → {{ c.to }}</p>
                  }
                </td>
                <td class="font-mono text-xs text-slate-500">{{ r.ip }}</td>
              </tr>
            } @empty {
              <tr><td colspan="6" class="py-8 text-center text-slate-500">{{ (loading() ? 'common.loading' : 'audit.empty') | transloco }}</td></tr>
            }
          </tbody>
        </table>
      </div>
      @if (hasMore()) {
        <div class="mt-4 text-center"><button type="button" class="btn-secondary" (click)="more()" [disabled]="loading()">{{ 'common.loadMore' | transloco }}</button></div>
      }
    </div>
  `,
})
export class AuditTable {
  /** Organization scope; omit together with platform=true for the platform-wide log. */
  readonly orgId = input<string | null>(null);
  readonly platform = input(false);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  protected readonly events = EVENTS;
  protected readonly rows = signal<AuditRow[]>([]);
  protected readonly loading = signal(false);
  protected readonly hasMore = signal(false);
  protected event = '';
  protected ip = '';
  protected from = '';
  protected to = '';

  constructor() {
    effect(() => { if (this.orgId() || this.platform()) void this.reload(); });
  }

  protected changes(r: AuditRow): { field: string; from: string; to: string }[] {
    if (r.event !== 'update' || !r.changed_fields) return [];
    const fmt = (v: unknown) => (v === null || v === undefined || v === '' ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v));
    return r.changed_fields.slice(0, 6).map((f) => ({ field: f, from: fmt(r.old_data?.[f]), to: fmt(r.new_data?.[f]) }));
  }

  protected clear(): void {
    this.event = this.ip = this.from = this.to = '';
    void this.reload();
  }

  protected async reload(): Promise<void> {
    this.rows.set([]);
    await this.fetch(null);
  }

  protected async more(): Promise<void> {
    const last = this.rows().at(-1);
    await this.fetch(last ? last.id : null);
  }

  private async fetch(before: number | null, limit = PAGE): Promise<AuditRow[]> {
    this.loading.set(true);
    try {
      const range = {
        p_event: this.event || null,
        p_from: this.from ? new Date(this.from).toISOString() : null,
        p_to: this.to ? new Date(new Date(this.to).getTime() + 86400000).toISOString() : null,
        p_before: before, p_limit: limit,
      };
      const data = this.platform()
        ? await this.sb.rpc<AuditRow[]>('audit_feed_platform', { p_org: this.orgId(), ...range })
        : await this.sb.rpc<AuditRow[]>('audit_feed', { org: this.orgId(), p_ip: this.ip.trim() || null, ...range });
      if (limit === PAGE) {
        this.rows.update((l) => [...l, ...data]);
        this.hasMore.set(data.length === PAGE);
      }
      return data;
    } catch (e) {
      this.toast.error(errorKey(e));
      return [];
    } finally {
      this.loading.set(false);
    }
  }

  /** Exports what the current filters match (up to 5 000 rows) as CSV. */
  protected async exportCsv(): Promise<void> {
    const all: AuditRow[] = [];
    let before: number | null = null;
    for (let i = 0; i < 25; i++) {
      const page = await this.fetch(before, 200);
      all.push(...page);
      if (page.length < 200) break;
      before = page[page.length - 1].id;
    }
    const head = ['timestamp', 'user', 'organization', 'event', 'table', 'record', 'changed_fields', 'ip'];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = all.map((r) => [r.occurred_at, r.actor_name, r.organization_name, this.t.translate('audit.event.' + r.event),
      r.table_name, r.record_title, (r.changed_fields ?? []).join(' '), r.ip].map(esc).join(','));
    try {
      await this.sb.rpc('log_audit_export', { org: this.orgId(), p_rows: all.length });   // no export without a log entry
    } catch (e) {
      this.toast.error(errorKey(e));
      return;
    }
    const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
}
