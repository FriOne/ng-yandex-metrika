import { CounterConfig, YandexCounterConfig } from './metrika.config';

export function defaultCounterIdFactory(counterConfigs: CounterConfig | CounterConfig[], defaultCounter?: number | string) {
  return defineDefaultId(counterConfigs, defaultCounter);
}

export function defineDefaultId(counterConfigs: CounterConfig | CounterConfig[], defaultCounter?: number | string) {
  let configs: CounterConfig[];
  if (counterConfigs instanceof Array) {
    configs = counterConfigs;
  } else {
    configs = [counterConfigs as CounterConfig];
  }
  let defaultId: number | string;

  if (!defaultCounter) {
    defaultId = configs[0].id;
  } else if (typeof defaultCounter === 'number' && defaultCounter < configs.length) {
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

export function countersFactory(configs: CounterConfig | CounterConfig[]) {
  return createConfigs(configs);
}

export function createConfigs(configs: CounterConfig | CounterConfig[]) {
  let counterConfigs: CounterConfig[];
  if (configs instanceof Array) {
    counterConfigs = configs;
  } else {
    counterConfigs = [configs as CounterConfig];
  }
  return counterConfigs.map((config: CounterConfig) => Object.assign(new YandexCounterConfig(), config));
}

export function appInitializerFactory(counterConfigs: YandexCounterConfig[]) {
  return insertMetrika.bind(null, counterConfigs);
}

export function insertMetrika(counterConfigs: YandexCounterConfig[]) {
  const name = 'yandex_metrika_callbacks2';
  window[name] = window[name] || [];
  window[name].push(function() {
    try {
      for (const config of counterConfigs) {
        createCounter(config);
      }
    } catch (e) {}
  });

  const n = document.getElementsByTagName('script')[0];
  const s = document.createElement('script');
  s.type = 'text/javascript';
  s.async = true;

  const alternative = counterConfigs.find(config => config.alternative);

  if (alternative) {
    s.src = 'https://cdn.jsdelivr.net/npm/yandex-metrica-watch/tag.js';
  } else {
    s.src = 'https://mc.yandex.ru/metrika/tag.js';
  }

  const insetScriptTag = () => n.parentNode.insertBefore(s, n);

  if ((window as any).opera === '[object Opera]') {
    document.addEventListener('DOMContentLoaded', insetScriptTag, false);
  } else {
    insetScriptTag();
  }
  return name;
}

export function createCounter(config: YandexCounterConfig) {
  window[getCounterNameById(config.id)] = new Ya.Metrika2(config);
}

export function getCounterNameById(id: string | number) {
  return `yaCounter${id}`;
}
