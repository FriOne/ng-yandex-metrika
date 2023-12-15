import { Injectable, Injector } from '@angular/core';

import { DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS, CounterConfig } from './ng-yandex-metrika.config';
import {
  CallbackOptions,
  ExtLinkOptions,
  FileOptions,
  HitOptions,
  NotBounceOptions,
  UserParameters,
  VisitParameters
} from './yandex-mterika-tag';

@Injectable({
  providedIn: 'root'
})
export class Metrika {
  private defaultCounterId: number;
  private counterConfigs: CounterConfig[];

  constructor(injector: Injector) {
    this.defaultCounterId = injector.get<number>(DEFAULT_COUNTER_ID);
    this.counterConfigs = injector.get<CounterConfig[]>(YANDEX_COUNTERS_CONFIGS);
  }

  addFileExtension(extensions: string | string[], counterId?: number) {
    window.ym(counterId ?? this.defaultCounterId, 'addFileExtension', extensions);
  }

  extLink<CTX>(url: string, options: ExtLinkOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    window.ym(counterId ?? this.defaultCounterId, 'extLink', url, options);

    return promise;
  }

  file<CTX>(url: string, options: FileOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    window.ym(counterId ?? this.defaultCounterId, 'file', url, options);

    return promise;
  }

  getClientID(counterId?: number) {
    return new Promise((resolve) => {
      window.ym(counterId ?? this.defaultCounterId, 'getClientID', resolve);
    });
  }

  setUserID(userId: string, counterId?: number) {
    window.ym(counterId ?? this.defaultCounterId, 'setUserID', userId);
  }

  userParams(parameters: UserParameters, counterId?: number) {
    window.ym(counterId ?? this.defaultCounterId, 'userParams', parameters);
  }

  params(parameters: VisitParameters | VisitParameters[], counterId?: number) {
    window.ym(counterId ?? this.defaultCounterId, 'params', parameters);
  }

  replacePhones(counterId?: number) {
    window.ym(counterId ?? this.defaultCounterId, 'replacePhones');
  }

  async notBounce<CTX>(options: NotBounceOptions<CTX>, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    window.ym(counterId ?? this.defaultCounterId, 'notBounce');

    return promise;
  }

  fireEvent = this.reachGoal;
  reachGoal<CTX>(
    target: string,
    params: VisitParameters | undefined = undefined,
    callback: (this: CTX) => void = () => {},
    ctx: CTX | undefined = undefined,
    counterId?: number
  ) {
    const options = { callback, ctx };
    const promise = this.getCallbackPromise(options);

    window.ym(
      counterId ?? this.defaultCounterId,
      'reachGoal',
      target,
      params,
      options.callback,
      options.ctx
    );

    return promise;
  }

  hit<CTX>(url: string, options: HitOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    window.ym(counterId ?? this.defaultCounterId, 'hit', url, options);

    return promise;
  }

  private getCallbackPromise<CTX>(options: CallbackOptions<CTX>) {
    return new Promise((resolve) => {
      const optionsCallback = options.callback;
      options.callback = function() {
        if (optionsCallback) {
          optionsCallback.call(this);
        }
        resolve(this);
      };
    });
  }
}
