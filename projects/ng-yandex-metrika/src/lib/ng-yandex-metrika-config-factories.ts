import { isPlatformBrowser } from '@angular/common';

import { CounterConfig } from './ng-yandex-metrika.config';

export function defineDefaultId(counterConfigs: CounterConfig | CounterConfig[], defaultCounter?: number) {
  let configs: CounterConfig[];
  if (counterConfigs instanceof Array) {
    configs = counterConfigs;
  } else {
    configs = [counterConfigs as CounterConfig];
  }
  let defaultId: number;

  if (!defaultCounter) {
    defaultId = configs[0].id;
  } else if (defaultCounter < configs.length) {
    defaultId = configs[defaultCounter].id;
  } else {
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

export function appInitializerFactory(counterConfigs: CounterConfig[], platformId: Object, alternativeUrl?: string) {
  if (isPlatformBrowser(platformId)) {
    return insertMetrika.bind(null, counterConfigs, alternativeUrl);
  }

  return () => 'none';
}

function insertMetrika(counterConfigs: CounterConfig[], alternativeUrl?: string) {
  window.ym = window.ym || function() {
    (window.ym.a = window.ym.a || []).push(arguments)
  };
  window.ym.l = new Date().getTime();

  const lastScript = document.getElementsByTagName('script')[0];
  const metrikaScript = document.createElement('script');
  metrikaScript.type = 'text/javascript';
  metrikaScript.src = alternativeUrl ?? 'https://mc.yandex.ru/metrika/tag.js';
  metrikaScript.async = true;
  lastScript.parentNode!.insertBefore(metrikaScript, lastScript);

  for (const { id, ...counterConfig } of counterConfigs) {
    window.ym(id, 'init', counterConfig);
  }
}
