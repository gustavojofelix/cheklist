import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TranslocoPipe } from '@jsverse/transloco';
import { ToastService } from './core/toast.service';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TranslocoPipe],
  template: `
    <router-outlet />
    <div class="pointer-events-none fixed right-4 bottom-4 z-[2000] flex w-80 flex-col gap-2" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div role="status"
             class="pointer-events-auto flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg"
             [class]="t.kind === 'error' ? 'border-red-200 bg-red-50 text-red-800'
                    : t.kind === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                    : 'border-slate-200 bg-white text-slate-700'">
          <span class="flex-1">{{ t.key | transloco: t.params }}</span>
          <button type="button" class="text-xs opacity-60 hover:opacity-100" (click)="toasts.dismiss(t.id)"
                  [attr.aria-label]="'common.close' | transloco">✕</button>
        </div>
      }
    </div>
  `,
})
export class App {
  protected readonly toasts = inject(ToastService);
}
