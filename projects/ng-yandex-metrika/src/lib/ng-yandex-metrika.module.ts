import { APP_INITIALIZER, Injector, ModuleWithProviders, NgModule } from '@angular/core';
import { PLATFORM_ID } from '@angular/core';

import { Metrika } from './ng-yandex-metrika.service';
import {
  CounterConfig,
  DEFAULT_COUNTER_ID,
  YANDEX_COUNTERS_CONFIGS,
} from './ng-yandex-metrika.config';
import { appInitializerFactory, createConfigs, defineDefaultId } from './ng-yandex-metrika-config-factories';
import { MetrikaGoalDirective } from './ng-yandex-metrika-goal.directive';

@NgModule({
  declarations: [MetrikaGoalDirective],
  exports: [MetrikaGoalDirective],
})
export class MetrikaModule {
  static forRoot(configs: CounterConfig | CounterConfig[], defaultCounterId?: number | string): ModuleWithProviders<MetrikaModule> {
    return {
      ngModule: MetrikaModule,
      providers: [
        {
          provide: DEFAULT_COUNTER_ID,
          useValue: defineDefaultId(configs, defaultCounterId),
        },
        {
          provide: YANDEX_COUNTERS_CONFIGS,
          useValue: createConfigs(configs),
        },
        {
          provide: APP_INITIALIZER,
          useFactory: appInitializerFactory,
          deps: [YANDEX_COUNTERS_CONFIGS, PLATFORM_ID],
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
