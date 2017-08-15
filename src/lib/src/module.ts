import { ModuleWithProviders, NgModule } from '@angular/core';

import { Metrika, YandexCounterConfig } from './service/metrika.service';

export const DEFAULT_CONFIG: any = {
  id: null,
  clickmap: true,
  trackLinks: true,
  accurateTrackBounce: true,
  webvisor: false,
  trackHash: true,
  ut: 'noindex'
};

@NgModule()
export class MetrikaModule {

  static forRoot(
    configs: YandexCounterConfig | YandexCounterConfig[],
    defaultCounterId?: number | string
  ): ModuleWithProviders {

    const metrika = MetrikaModule.configurateMetrika(configs, defaultCounterId);
    if (metrika) {
      metrika.insertMetrika();
    }
    return {
      ngModule: MetrikaModule,
      providers: [{provide: Metrika, useFactory: () => metrika}],
    };
  }

  static configurateMetrika(
    configs: YandexCounterConfig | YandexCounterConfig[],
    defaultCounter?: number | string
  ): Metrika {
    const counterConfigs: YandexCounterConfig[] = [];
    let defaultCounterId: number | string;

    if (!Array.isArray(configs)) {
      configs = [configs as YandexCounterConfig];
    }

    if (!defaultCounter) {
      defaultCounterId = configs[0].id;
    }
    else if (typeof defaultCounter === 'number' && defaultCounter < configs.length) {
      defaultCounterId = configs[defaultCounter].id;
    }
    else {
      defaultCounterId = defaultCounter;
    }

    if (!defaultCounterId) {
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
      if (config.id === defaultCounterId) {
        defaultCounterExists = true;
      }
      counterConfigs.push({...DEFAULT_CONFIG, ...config} as YandexCounterConfig);
    }

    if (!defaultCounterExists) {
      console.warn('You provided wrong counter id as a default:', defaultCounter);
    }

    const metrika = new Metrika();
    Metrika.counterConfigs = counterConfigs;
    Metrika.defaultCounterId = defaultCounterId;
    return metrika;
  }
}
