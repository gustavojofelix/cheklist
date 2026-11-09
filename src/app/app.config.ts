import { ApplicationConfig, inject, isDevMode, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, TitleStrategy, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { I18nTitleStrategy } from './core/title.strategy';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt-PT';
import localeEnGb from '@angular/common/locales/en-GB';
import { provideTransloco, TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { HttpTranslocoLoader, LocaleService } from './core/i18n';
import { ReferenceService } from './core/reference.service';

registerLocaleData(localePt, 'pt-PT');
registerLocaleData(localeEnGb, 'en-GB');

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withFetch()),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'top' })),
    { provide: TitleStrategy, useClass: I18nTitleStrategy },
    provideTransloco({
      config: {
        availableLangs: ['pt', 'en'],
        defaultLang: 'pt',
        fallbackLang: 'pt',
        missingHandler: { useFallbackTranslation: true, logMissingKey: isDevMode() },
        reRenderOnLangChange: true,
        prodMode: !isDevMode(),
      },
      loader: HttpTranslocoLoader,
    }),
    provideAppInitializer(async () => {
      const locale = inject(LocaleService);
      const t = inject(TranslocoService);
      const refs = inject(ReferenceService);
      const lang = locale.initial();
      t.setActiveLang(lang);
      document.documentElement.lang = lang === 'pt' ? 'pt-MZ' : 'en';
      await Promise.all([firstValueFrom(t.load(lang)), refs.load().catch(() => undefined)]);
    }),
  ],
};
