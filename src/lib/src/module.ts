import { APP_INITIALIZER, ModuleWithProviders, NgModule } from '@angular/core';

import { Metrika } from './service/metrika.service';
import { CounterConfig, DEFAULT_COUNTER_ID, YandexCounterConfig } from './service/metrika.config';

@NgModule()
export class MetrikaModule {

  static forRoot(
    configs: CounterConfig | CounterConfig[],
    defaultCounterId?: number | string
  ): ModuleWithProviders {

    if (!(configs instanceof Array)) {
      configs = [configs as CounterConfig];
    }

    const {defaultId, counterConfigs} = MetrikaModule.configurateMetrika(
      configs as CounterConfig[],
      defaultCounterId
    );
    const castedConfigProviders = counterConfigs.map((config: YandexCounterConfig) => ({
      provide: YandexCounterConfig,
      useValue: config,
      multi: true,
    }));

    return {
      ngModule: MetrikaModule,
      providers: [
        {
          provide: DEFAULT_COUNTER_ID,
          useValue: defaultId,
        },
        ...castedConfigProviders,
        {
          provide: APP_INITIALIZER,
          useFactory: (configs: YandexCounterConfig[]) => function() {
            return MetrikaModule.insertMetrika(configs);
          },
          deps: [YandexCounterConfig],
          multi: true,
        },
        {
          provide: Metrika,
          useClass: Metrika,
          deps: [DEFAULT_COUNTER_ID, YandexCounterConfig],
        }
      ],
    };
  }

  static configurateMetrika(
    configs: CounterConfig[],
    defaultCounter?: number | string
  ): {
    defaultId:  number | string,
    counterConfigs: YandexCounterConfig[]
  } {
    const counterConfigs: YandexCounterConfig[] = [];
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
      counterConfigs.push(Object.assign(new YandexCounterConfig(), config));
    }

    if (!defaultCounterExists) {
      console.warn('You provided wrong counter id as a default:', defaultCounter);
    }
    return {
      counterConfigs,
      defaultId,
    };
  }

  static insertMetrika(counterConfigs: YandexCounterConfig[]) {
    let name = 'yandex_metrika_callbacks';
    window[name] = window[name] || [];
    window[name].push(() => {
      try {
        counterConfigs.map((config: YandexCounterConfig) => MetrikaModule.createCounter(config));
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

  static createCounter(config: YandexCounterConfig) {
    window[MetrikaModule.getCounterNameById(config.id)] = new Ya.Metrika(config);
  }

  static getCounterNameById(id: string | number) {
    return `yaCounter${id}`;
  }
}
