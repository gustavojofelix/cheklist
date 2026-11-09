import { ChangeDetectionStrategy, Component, effect, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';
import { PageHeader } from '../../shared/ui/page-header';

interface Deleted { id: string; original_name: string; deleted_at: string; purge_after: string | null; organization_id: string; size_bytes: number }

@Component({
  selector: 'app-recycle-bin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DatePipe, PageHeader, Icon],
  template: `
    <app-page-header [title]="'nav.recycle' | transloco" [subtitle]="'recycle.subtitle' | transloco" />
    <div class="card overflow-x-auto">
      <table class="table-base">
        <thead><tr><th>{{ 'recycle.file' | transloco }}</th><th>{{ 'recycle.deletedAt' | transloco }}</th><th>{{ 'recycle.daysLeft' | transloco }}</th><th></th></tr></thead>
        <tbody>
          @for (d of docs(); track d.id) {
            <tr>
              <td class="font-medium"><app-icon name="file" [size]="14" /> {{ d.original_name }}</td>
              <td class="text-slate-500">{{ d.deleted_at | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ daysLeft(d) }}</td>
              <td class="text-right">
                @if (ctx.canWrite('user')) {
                  <button type="button" class="btn-secondary !py-1" (click)="restore(d)"><app-icon name="restore" [size]="14" /> {{ 'recycle.restore' | transloco }}</button>
                }
              </td>
            </tr>
          } @empty {
            <tr><td colspan="4" class="py-10 text-center text-slate-400">{{ 'recycle.empty' | transloco }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <p class="mt-3 text-xs text-slate-500">{{ 'recycle.note' | transloco }}</p>
  `,
})
export class RecycleBinPage {
  protected readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  protected readonly docs = signal<Deleted[]>([]);

  constructor() {
    effect(() => { if (this.ctx.active()) void this.load(); });
  }

  protected daysLeft(d: Deleted): number {
    return d.purge_after ? Math.max(0, Math.ceil((new Date(d.purge_after).getTime() - Date.now()) / 86400000)) : 0;
  }

  private async load(): Promise<void> {
    const ids = this.ctx.entities().map((e) => e.id);
    const { data } = await this.sb.client.from('documents')
      .select('id, original_name, deleted_at, purge_after, organization_id, size_bytes')
      .in('organization_id', ids).not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    this.docs.set((data ?? []) as Deleted[]);
  }

  protected async restore(d: Deleted): Promise<void> {
    try {
      await this.sb.rpc('restore_document', { doc: d.id });
      this.toast.success('recycle.restored');
      await this.load();
    } catch (e) {
      this.toast.error(errorKey(e));
    }
  }
}
