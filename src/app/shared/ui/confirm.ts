import { ChangeDetectionStrategy, Component, Injectable, inject } from '@angular/core';
import { Dialog, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { TranslocoPipe } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

interface ConfirmData { title: string; body?: string; confirm?: string; danger?: boolean; params?: Record<string, unknown> }

@Component({
  selector: 'app-confirm-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslocoPipe],
  template: `
    <div class="w-[min(28rem,calc(100vw-2rem))] rounded-xl bg-white p-6 shadow-xl" role="alertdialog" aria-modal="true">
      <h2 class="text-lg font-semibold text-slate-900">{{ data.title | transloco: data.params }}</h2>
      @if (data.body) { <p class="mt-2 text-sm text-slate-600">{{ data.body | transloco: data.params }}</p> }
      <div class="mt-6 flex justify-end gap-2">
        <button type="button" class="btn-secondary" (click)="ref.close(false)">{{ 'common.cancel' | transloco }}</button>
        <button type="button" [class]="data.danger ? 'btn-danger' : 'btn-primary'" (click)="ref.close(true)" cdkFocusInitial>
          {{ (data.confirm ?? 'common.confirm') | transloco }}
        </button>
      </div>
    </div>
  `,
})
export class ConfirmDialog {
  protected readonly data = inject<ConfirmData>(DIALOG_DATA);
  protected readonly ref = inject<DialogRef<boolean>>(DialogRef);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(Dialog);
  async ask(data: ConfirmData): Promise<boolean> {
    const ref = this.dialog.open<boolean>(ConfirmDialog, { data });
    return (await firstValueFrom(ref.closed)) === true;
  }
}
