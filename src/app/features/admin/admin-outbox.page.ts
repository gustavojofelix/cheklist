import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { Supabase } from '../../core/supabase';
import { PageHeader } from '../../shared/ui/page-header';

interface Mail { id: string; to_email: string; template: string; subject: string; body_text: string; status: string;
                 attempts: number; last_error: string | null; created_at: string; sent_at: string | null }

/** Back office: outgoing e-mail queue (one-time codes are never shown). */
@Component({
  selector: 'app-admin-outbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe, DatePipe, PageHeader],
  template: `
    <app-page-header [title]="'admin.nav.emails' | transloco" [subtitle]="'admin.emails.subtitle' | transloco" />
    <div class="card overflow-x-auto">
      <table class="table-base">
        <thead><tr><th>{{ 'admin.emails.created' | transloco }}</th><th>{{ 'admin.emails.to' | transloco }}</th><th>{{ 'admin.emails.subject' | transloco }}</th>
          <th>{{ 'common.status' | transloco }}</th><th>{{ 'admin.emails.attempts' | transloco }}</th></tr></thead>
        <tbody>
          @for (m of mails(); track m.id) {
            <tr class="cursor-pointer hover:bg-slate-50" (click)="open.set(open() === m.id ? null : m.id)">
              <td class="whitespace-nowrap text-slate-500">{{ m.created_at | date: 'dd/MM/yyyy HH:mm' }}</td>
              <td>{{ m.to_email }}</td>
              <td>{{ m.subject }}</td>
              <td><span class="chip" [class]="m.status === 'sent' ? 'bg-emerald-100 text-emerald-800' : m.status === 'failed' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'">
                {{ 'admin.emails.status.' + m.status | transloco }}</span></td>
              <td>{{ m.attempts }} @if (m.last_error) { <span class="block text-xs text-red-600">{{ m.last_error }}</span> }</td>
            </tr>
            @if (open() === m.id) {
              <tr><td colspan="5"><pre class="whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">{{ m.body_text }}</pre></td></tr>
            }
          } @empty {
            <tr><td colspan="5" class="py-8 text-center text-slate-400">{{ 'admin.emails.empty' | transloco }}</td></tr>
          }
        </tbody>
      </table>
    </div>
  `,
})
export class AdminOutboxPage implements OnInit {
  private readonly sb = inject(Supabase);
  protected readonly mails = signal<Mail[]>([]);
  protected readonly open = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const { data } = await this.sb.client.from('email_outbox').select('*').order('created_at', { ascending: false }).limit(200);
    this.mails.set((data ?? []) as Mail[]);
  }
}
