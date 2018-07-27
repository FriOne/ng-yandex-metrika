import { InjectionToken } from '@angular/core';

export const DEFAULT_COUNTER_ID_AOT = new InjectionToken<number | string>('DEFAULT_COUNTER_ID_AOT');
export const DEFAULT_COUNTER_ID = new InjectionToken<number | string>('DEFAULT_COUNTER_ID');
export const YANDEX_COUNTERS_CONFIGS_AOT = new InjectionToken<YandexCounterConfig[]>('YANDEX_COUNTERS_CONFIGS_AOT');
export const YANDEX_COUNTERS_CONFIGS = new InjectionToken<YandexCounterConfig[]>('YANDEX_COUNTERS_CONFIGS');

export interface CounterConfig {
  id: string | number;
  params?: any;
  clickmap?: boolean;
  trackLinks?: boolean;
  accurateTrackBounce?: boolean;
  webvisor?: boolean;
  trackHash?: boolean;
  ut?: string;
  ecommerce?: string;
  triggerEvent?: boolean;
}

export class YandexCounterConfig  implements CounterConfig {
  id: string | number;
  params: any;
  clickmap = true;
  trackLinks = true;
  accurateTrackBounce = true;
  webvisor = false;
  trackHash = true;
  ut = 'noindex';
  ecommerce?: string;
  triggerEvent?: boolean;
}
