import { CounterConfig, YandexCounterConfig } from './metrika.config';

export function defaultCounterIdFactory() {
  return function(counterConfigs: CounterConfig | CounterConfig[], defaultCounter?: number | string) {
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
      // console.warn('You provided wrong counter id as a default:', defaultCounter);
      return;
    }

    let defaultCounterExists = false;
    let config;
    for (let i = 0; i < configs.length; i++) {
      config = configs[i];
      if (!config.id) {
        // console.warn('You should provide counter id to use Yandex metrika counter', config);
        continue;
      }
      if (config.id === defaultId) {
        defaultCounterExists = true;
      }
    }

    if (!defaultCounterExists) {
      // console.warn('You provided wrong counter id as a default:', defaultCounter);
    }
    return defaultId;
  };
}

export function countersFactory() {
  return function(configs: CounterConfig | CounterConfig[]) {
    let counterConfigs: CounterConfig[];
    if (configs instanceof Array) {
      counterConfigs = configs;
    } else {
      counterConfigs = [configs as CounterConfig];
    }
    const providerConfigs: YandexCounterConfig[] = [];
    for (const config of counterConfigs) {
      let providerConfig = new YandexCounterConfig();
      providerConfig.id = config.id;
      providerConfig.clickmap = config.clickmap;
      providerConfig.trackLinks = config.trackLinks;
      providerConfig.accurateTrackBounce = config.accurateTrackBounce;
      providerConfig.webvisor = config.webvisor;
      providerConfig.trackHash = config.trackHash;
      providerConfig.ut = config.ut;
      providerConfigs.push(providerConfig);
    }
    return providerConfigs;
  }
}

export function insertMetrika() {
  return function(counterConfigs: YandexCounterConfig[]) {
    let name = 'yandex_metrika_callbacks';
    window[name] = window[name] || [];
    window[name].push(() => {
      try {
        for (const config of counterConfigs) {
          createCounter(config);
        }
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
}

export function createCounter(config: YandexCounterConfig) {
  window[getCounterNameById(config.id)] = new Ya.Metrika(config);
}

export function getCounterNameById(id: string | number) {
  return `yaCounter${id}`;
}
