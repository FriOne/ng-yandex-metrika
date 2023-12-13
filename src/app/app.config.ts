import { ApplicationConfig, importProvidersFrom } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideClientHydration } from '@angular/platform-browser';
import { MetrikaModule } from 'ng-yandex-metrika';

import { METRIKA_ID_1, METRIKA_ID_2 } from './constants';
import { routes } from './app.routes';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideClientHydration(),
    importProvidersFrom(
      MetrikaModule.forRoot([
        { id: METRIKA_ID_1, webvisor: true },
        { id: METRIKA_ID_2 },
      ], {
        defaultCounter: 1,
        alternativeUrl: 'https://cdn.jsdelivr.net/npm/yandex-metrica-watch/tag.js'
      })
    ),
  ]
};
