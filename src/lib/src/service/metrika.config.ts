import { Injectable, InjectionToken } from '@angular/core';

export const DEFAULT_COUNTER_ID = new InjectionToken< number | string>('DEFAULT_COUNTER_ID');

export interface CounterConfig {
  id: string | number;
  clickmap?: boolean;
  trackLinks?: boolean;
  accurateTrackBounce?: boolean;
  webvisor?: boolean;
  trackHash?: boolean;
  ut?: string;
}

@Injectable()
export class YandexCounterConfig  implements CounterConfig {
  id: string;
  clickmap = true;
  trackLinks = true;
  accurateTrackBounce = true;
  webvisor = false;
  trackHash = true;
  ut = 'noindex';
}
