import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ContextStore } from '../../core/context.store';
import { errorKey } from '../../core/errors';
import { Supabase } from '../../core/supabase';
import { ToastService } from '../../core/toast.service';
import { Icon } from '../../shared/ui/icon';

interface Conversation { id: string; title: string | null; last_message_at: string | null; organization_id: string }
interface Source { code: string; title: string; item_id: string }
interface Action { id: string; status: 'pending' | 'accepted' | 'rejected'; action: { field: string; value: string; reason: string; code: string; title: string } }
interface Msg { id?: string; role: 'user' | 'assistant'; content: string; sources?: Source[]; created_at?: string; actions?: Action[] }

/** AI assistant over the account's checklists and documents. Information only — never legal advice. */
@Component({
  selector: 'app-ai',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, TranslocoPipe, Icon],
  template: `
    <div class="grid h-[calc(100vh-8rem)] gap-4 lg:grid-cols-[18rem_1fr]">
      <aside class="card flex min-h-0 flex-col p-3">
        <button type="button" class="btn-primary mb-3" (click)="newConversation()"><app-icon name="plus" [size]="16" /> {{ 'ai.new' | transloco }}</button>
        <p class="px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">{{ 'ai.history' | transloco }}</p>
        <ul class="mt-2 flex-1 space-y-1 overflow-y-auto text-sm">
          @for (c of conversations(); track c.id) {
            <li><button type="button" class="w-full truncate rounded px-2 py-1.5 text-left hover:bg-slate-100" [class.bg-brand-50]="c.id === active()"
                        (click)="open(c.id)">{{ c.title || ('ai.untitled' | transloco) }}</button></li>
          } @empty { <li class="px-2 py-4 text-center text-slate-600">{{ 'ai.noConversations' | transloco }}</li> }
        </ul>
      </aside>

      <section class="card flex min-h-0 flex-col">
        <p class="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800" role="note">{{ 'ai.disclaimer' | transloco }}</p>
        <div #scroller class="flex-1 space-y-4 overflow-y-auto p-4">
          @if (!messages().length) {
            <div class="mx-auto max-w-lg py-10 text-center">
              <span class="mx-auto grid size-12 place-items-center rounded-full bg-brand-50 text-brand-600"><app-icon name="sparkles" [size]="22" /></span>
              <h1 class="mt-3 text-lg font-semibold">{{ 'nav.ai' | transloco }}</h1>
              <p class="mt-1 text-sm text-slate-600">{{ welcome() || ('ai.welcome' | transloco) }}</p>
              <div class="mt-4 flex flex-wrap justify-center gap-2">
                @for (s of suggestions(); track s) {
                  <button type="button" class="rounded-full border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50" (click)="question = s; ask()">{{ s }}</button>
                }
              </div>
            </div>
          }
          @for (m of messages(); track $index) {
            <div class="flex" [class.justify-end]="m.role === 'user'">
              <div class="max-w-[85%] rounded-xl px-4 py-2.5 text-sm" [class]="m.role === 'user' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-800'">
                <p class="whitespace-pre-wrap">{{ m.content }}</p>
                @if (m.sources?.length) {
                  <div class="mt-2 flex flex-wrap gap-1">
                    @for (s of m.sources; track s.item_id) {
                      <a class="chip bg-white text-brand-700 hover:underline" [routerLink]="['/entities', org(), 'ficha']" [title]="s.title">{{ s.code }}</a>
                    }
                  </div>
                }
                @for (a of m.actions ?? []; track a.id) {
                  <div class="mt-2 rounded-lg border border-violet-200 bg-white p-2 text-slate-700">
                    <p class="text-xs font-semibold uppercase text-violet-700">{{ 'ai.proposal' | transloco }}</p>
                    <p><span class="font-mono text-xs">{{ a.action.code }}</span> {{ a.action.title }} — {{ ('ai.field.' + a.action.field) | transloco }}:
                      <strong>{{ a.action.value }}</strong></p>
                    <p class="text-xs text-slate-600">{{ a.action.reason }}</p>
                    @if (a.status === 'pending') {
                      <div class="mt-2 flex gap-2">
                        <button type="button" class="btn-primary !py-1" (click)="decide(m, a, true)">{{ 'common.confirm' | transloco }}</button>
                        <button type="button" class="btn-secondary !py-1" (click)="decide(m, a, false)">{{ 'ai.reject' | transloco }}</button>
                      </div>
                    } @else {
                      <p class="mt-1 text-xs font-medium">{{ ('ai.status.' + a.status) | transloco }}</p>
                    }
                  </div>
                }
              </div>
            </div>
          }
          @if (busy()) { <p class="text-sm text-slate-600">{{ 'ai.thinking' | transloco }}</p> }
        </div>
        <form class="flex gap-2 border-t border-slate-100 p-3" (ngSubmit)="ask()">
          <textarea class="input flex-1 resize-none" rows="2" name="q" [(ngModel)]="question" (keydown.enter)="$event.preventDefault(); ask()"
                    [placeholder]="'ai.ask' | transloco" [attr.aria-label]="'ai.ask' | transloco" [disabled]="busy()"></textarea>
          <button type="submit" class="btn-primary" [disabled]="busy() || !question.trim()">{{ 'ai.send' | transloco }}</button>
        </form>
      </section>
    </div>
  `,
})
export class AiPage {
  private readonly ctx = inject(ContextStore);
  private readonly sb = inject(Supabase);
  private readonly toast = inject(ToastService);
  private readonly t = inject(TranslocoService);
  private readonly lang = toSignal(this.t.langChanges$, { initialValue: this.t.getActiveLang() });
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');
  protected readonly conversations = signal<Conversation[]>([]);
  protected readonly messages = signal<Msg[]>([]);
  protected readonly active = signal<string | null>(null);
  protected readonly busy = signal(false);
  protected readonly welcome = signal('');
  protected readonly suggestions = signal<string[]>([]);
  protected question = '';
  protected readonly org = () => this.ctx.active()?.id;

  constructor() {
    effect(() => { if (this.ctx.active()) void this.load(); });
  }

  private async load(): Promise<void> {
    const [c, s] = await Promise.all([
      this.sb.client.from('ai_conversations').select('id, title, last_message_at, organization_id')
        .eq('organization_id', this.org()!).order('last_message_at', { ascending: false, nullsFirst: false }),
      this.sb.client.from('platform_settings').select('key, value').in('key', ['ai_welcome', 'ai_suggestions']),
    ]);
    this.conversations.set((c.data ?? []) as Conversation[]);
    const lang = this.lang() as 'pt' | 'en';
    for (const row of (s.data ?? []) as { key: string; value: Record<string, unknown> }[]) {
      if (row.key === 'ai_welcome') this.welcome.set(String(row.value?.[lang] ?? row.value?.['pt'] ?? ''));
      if (row.key === 'ai_suggestions') this.suggestions.set(((row.value?.[lang] ?? row.value?.['pt']) as string[]) ?? []);
    }
  }

  protected newConversation(): void {
    this.active.set(null);
    this.messages.set([]);
  }

  protected async open(id: string): Promise<void> {
    this.active.set(id);
    const { data } = await this.sb.client.from('ai_messages').select('id, role, content, sources, created_at').eq('conversation_id', id).order('created_at');
    const msgs = (data ?? []) as Msg[];
    const ids = msgs.filter((m) => m.role === 'assistant').map((m) => m.id!);
    if (ids.length) {
      const { data: acts } = await this.sb.client.from('ai_proposed_actions').select('id, message_id, action, status').in('message_id', ids);
      for (const a of (acts ?? []) as (Action & { message_id: string })[]) {
        const m = msgs.find((x) => x.id === a.message_id);
        if (m) m.actions = [...(m.actions ?? []), a];
      }
    }
    this.messages.set(msgs);
    this.scrollDown();
  }

  protected async ask(): Promise<void> {
    const q = this.question.trim();
    if (!q || this.busy()) return;
    this.question = '';
    this.messages.update((l) => [...l, { role: 'user', content: q }]);
    this.busy.set(true);
    this.scrollDown();
    try {
      const res = await this.sb.fn<{ conversation_id: string; message: Msg; actions: Action[] }>('ai-chat', {
        org: this.org(), question: q, conversation_id: this.active(), lang: this.lang() });
      this.messages.update((l) => [...l, { ...res.message, actions: res.actions }]);
      if (!this.active()) { this.active.set(res.conversation_id); await this.load(); }
    } catch (e) {
      this.toast.error(errorKey(e));
      this.messages.update((l) => l.slice(0, -1));
      this.question = q;
    } finally {
      this.busy.set(false);
      this.scrollDown();
    }
  }

  protected async decide(m: Msg, a: Action, accept: boolean): Promise<void> {
    try {
      await this.sb.rpc('ai_action_decide', { p_action: a.id, p_accept: accept });
      a.status = accept ? 'accepted' : 'rejected';
      this.messages.update((l) => [...l]);
      if (accept) this.toast.success('ai.applied');
    } catch (e) { this.toast.error(errorKey(e)); }
    void m;
  }

  private scrollDown(): void {
    setTimeout(() => { const el = this.scroller()?.nativeElement; if (el) el.scrollTop = el.scrollHeight; });
  }
}
