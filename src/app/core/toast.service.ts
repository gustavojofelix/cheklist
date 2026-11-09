import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'success' | 'error' | 'info'; key: string; params?: Record<string, unknown> }

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  show(kind: Toast['kind'], key: string, params?: Record<string, unknown>): void {
    const t: Toast = { id: ++this.seq, kind, key, params };
    this.toasts.update((l) => [...l, t]);
    setTimeout(() => this.dismiss(t.id), kind === 'error' ? 7000 : 3500);
  }
  success(key: string, params?: Record<string, unknown>): void { this.show('success', key, params); }
  error(key: string, params?: Record<string, unknown>): void { this.show('error', key, params); }
  dismiss(id: number): void { this.toasts.update((l) => l.filter((t) => t.id !== id)); }
}
