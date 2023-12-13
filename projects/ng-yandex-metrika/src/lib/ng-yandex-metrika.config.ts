/// <reference path="../../../../node_modules/@types/yandex-metrika-tag/index.d.ts" />

import { InjectionToken } from '@angular/core';

export interface CounterConfig extends ym.InitParameters {
  id: number;
}

export const DEFAULT_COUNTER_ID = new InjectionToken<number>('DEFAULT_COUNTER_ID');
export const YANDEX_COUNTERS_CONFIGS = new InjectionToken<CounterConfig[]>('YANDEX_COUNTERS_CONFIGS');
export const ALTERNATIVE_URL = new InjectionToken<string>('ALTERNATIVE_URL');
