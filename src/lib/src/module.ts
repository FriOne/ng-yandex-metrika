import { APP_INITIALIZER, ModuleWithProviders, NgModule } from '@angular/core';

import { Metrika } from './service/metrika.service';
import { CounterConfig, DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS, YandexCounterConfig } from './service/metrika.config';

@NgModule()
export class MetrikaModule {

  static forRoot(configs: CounterConfig | CounterConfig[], defaultCounterId?: number | string): ModuleWithProviders {
    return {
      ngModule: MetrikaModule,
      providers: [
        {
          provide: DEFAULT_COUNTER_ID,
          useFactory: () => defaultCounterIdFactory(configs, defaultCounterId),
        },
        {
          provide: YANDEX_COUNTERS_CONFIGS,
          useFactory: () => countersFactory(configs),
        },
        {
          provide: APP_INITIALIZER,
          useFactory: (configs: YandexCounterConfig[]) => function() { return insertMetrika(configs)},
          deps: [YANDEX_COUNTERS_CONFIGS],
          multi: true,
        },
        {
          provide: Metrika,
          useClass: Metrika,
          deps: [DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS],
        }
      ],
    };
  }
}

export function defaultCounterIdFactory(
  counterConfigs: CounterConfig | CounterConfig[],
  defaultCounter?: number | string
) {
  let configs: CounterConfig[];
  if (counterConfigs instanceof Array) {
    configs = counterConfigs;
  } else {
    configs = [counterConfigs as CounterConfig];
  }
  let defaultId: number | string;

  if (!defaultCounter) {
    defaultId = configs[0].id;
  }
  else if (typeof defaultCounter === 'number' && defaultCounter < configs.length) {
    defaultId = configs[defaultCounter].id;
  }
  else {
    defaultId = defaultCounter;
  }

  if (!defaultId) {
    console.warn('You provided wrong counter id as a default:', defaultCounter);
    return;
  }

  let defaultCounterExists = false;
  let config;
  for (let i = 0; i < configs.length; i++) {
    config = configs[i];
    if (!config.id) {
      console.warn('You should provide counter id to use Yandex metrika counter', config);
      continue;
    }
    if (config.id === defaultId) {
      defaultCounterExists = true;
    }
  }

  if (!defaultCounterExists) {
    console.warn('You provided wrong counter id as a default:', defaultCounter);
  }
  return defaultId;
}

export function countersFactory(configs: CounterConfig | CounterConfig[]) {
  let counterConfigs: CounterConfig[];
  if (configs instanceof Array) {
    counterConfigs = configs;
  } else {
    counterConfigs = [configs as CounterConfig];
  }
  return counterConfigs.map((config: CounterConfig) => Object.assign(new YandexCounterConfig(), config));
}

export function insertMetrika(counterConfigs: YandexCounterConfig[]) {
  let name = 'yandex_metrika_callbacks';
  window[name] = window[name] || [];
  window[name].push(() => {
    try {
      counterConfigs.map((config: YandexCounterConfig) => createCounter(config));
    } catch(e) {}
  });

  let n = document.getElementsByTagName('script')[0],
    s = document.createElement('script'),
    f = () => { n.parentNode.insertBefore(s, n); };
  s.type = 'text/javascript';
  s.async = true;
  s.src = 'https://mc.yandex.ru/metrika/watch.js';

  f();
  return name;
}

export function createCounter(config: YandexCounterConfig) {
  window[getCounterNameById(config.id)] = new Ya.Metrika(config);
}

export function getCounterNameById(id: string | number) {
  return `yaCounter${id}`;
}
