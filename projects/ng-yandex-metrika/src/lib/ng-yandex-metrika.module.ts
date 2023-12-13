import { APP_INITIALIZER, Injector, ModuleWithProviders, NgModule } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';

import { Metrika } from './ng-yandex-metrika.service';
import {
  ALTERNATIVE_URL,
  CounterConfig,
  DEFAULT_COUNTER_ID,
  YANDEX_COUNTERS_CONFIGS,
} from './ng-yandex-metrika.config';
import { appInitializerFactory, defineDefaultId } from './ng-yandex-metrika-config-factories';

type Options = {
  defaultCounter?: number;
  alternativeUrl?: string;
};

@NgModule()
export class MetrikaModule {
  static forRoot(configs: CounterConfig | CounterConfig[], options: Options = {}): ModuleWithProviders<MetrikaModule> {
    const { defaultCounter, alternativeUrl } = options;

    return {
      ngModule: MetrikaModule,
      providers: [
        {
          provide: DEFAULT_COUNTER_ID,
          useValue: defineDefaultId(configs, defaultCounter),
        },
        {
          provide: YANDEX_COUNTERS_CONFIGS,
          useValue: configs,
        },
        {
          provide: ALTERNATIVE_URL,
          useValue: alternativeUrl,
        },
        {
          provide: APP_INITIALIZER,
          useFactory: appInitializerFactory,
          deps: [YANDEX_COUNTERS_CONFIGS, PLATFORM_ID, ALTERNATIVE_URL],
          multi: true,
        },
        {
          provide: Metrika,
          useClass: Metrika,
          deps: [Injector, PLATFORM_ID],
        },
      ],
    };
  }
}
