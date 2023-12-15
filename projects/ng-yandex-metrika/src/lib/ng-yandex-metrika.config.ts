import { InjectionToken } from '@angular/core';

import { InitParameters } from './yandex-mterika-tag';

export interface CounterConfig extends InitParameters {
  id: number;
}

export const DEFAULT_COUNTER_ID = new InjectionToken<number>('DEFAULT_COUNTER_ID');
export const YANDEX_COUNTERS_CONFIGS = new InjectionToken<CounterConfig[]>('YANDEX_COUNTERS_CONFIGS');
export const ALTERNATIVE_URL = new InjectionToken<string>('ALTERNATIVE_URL');
