import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Translation, TranslocoLoader, TranslocoService } from '@jsverse/transloco';
import { Supabase } from './supabase';

@Injectable({ providedIn: 'root' })
export class HttpTranslocoLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);
  getTranslation(lang: string) {
    return this.http.get<Translation>(`/i18n/${lang}.json`);
  }
}

const LANG_KEY = 'cl.lang';
export type Lang = 'pt' | 'en';

/** Runtime PT/EN switching; persisted locally and on the user's profile. */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly t = inject(TranslocoService);
  private readonly sb = inject(Supabase);

  initial(): Lang {
    try {
      const v = localStorage.getItem(LANG_KEY);
      if (v === 'pt' || v === 'en') return v;
    } catch { /* ignore */ }
    return 'pt';
  }

  async set(lang: Lang, persistToProfile = true): Promise<void> {
    this.t.setActiveLang(lang);
    document.documentElement.lang = lang === 'pt' ? 'pt-MZ' : 'en';
    try { localStorage.setItem(LANG_KEY, lang); } catch { /* ignore */ }
    if (persistToProfile) {
      const { data } = await this.sb.client.auth.getSession();
      const uid = data.session?.user.id;
      if (uid) await this.sb.client.from('profiles').update({ locale: lang }).eq('id', uid);
    }
  }

  current(): Lang {
    return this.t.getActiveLang() as Lang;
  }

  /** Locale id for Angular date/number pipes. */
  dateLocale(): string {
    return this.current() === 'pt' ? 'pt-PT' : 'en-GB';
  }
}
