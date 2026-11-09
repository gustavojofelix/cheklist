import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslocoService } from '@jsverse/transloco';

/** Route `title` values are i18n keys; the browser title is "<page> · Checklist Legal". */
@Injectable()
export class I18nTitleStrategy extends TitleStrategy {
  private readonly title = inject(Title);
  private readonly t = inject(TranslocoService);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const key = this.buildTitle(snapshot);
    const app = 'Checklist Legal';
    this.title.setTitle(key ? `${this.t.translate(key)} · ${app}` : app);
  }
}
