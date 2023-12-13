import { Injectable, Injector } from '@angular/core';

import { DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS, CounterConfig } from './ng-yandex-metrika.config';

interface CallbackOptions<CTX> {
  callback?: (this: CTX) => void;
  ctx?: CTX | undefined;
}

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
    ym(counterId ?? this.defaultCounterId, 'addFileExtension', extensions);
  }

  extLink<CTX>(url: string, options: ym.ExtLinkOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    ym(counterId ?? this.defaultCounterId, 'extLink', url, options);

    return promise;
  }

  file<CTX>(url: string, options: ym.FileOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    ym(counterId ?? this.defaultCounterId, 'file', url, options);

    return promise;
  }

  getClientID(counterId?: number) {
    return new Promise((resolve) => {
      ym(counterId ?? this.defaultCounterId, 'getClientID', resolve);
    });
  }

  setUserID(userId: string, counterId?: number) {
    ym(counterId ?? this.defaultCounterId, 'setUserID', userId);
  }

  userParams(parameters: ym.UserParameters, counterId?: number) {
    ym(counterId ?? this.defaultCounterId, 'userParams', parameters);
  }

  params(parameters: ym.VisitParameters | ym.VisitParameters[], counterId?: number) {
    ym(counterId ?? this.defaultCounterId, 'params', parameters);
  }

  replacePhones(counterId?: number) {
    ym(counterId ?? this.defaultCounterId, 'replacePhones');
  }

  async notBounce<CTX>(options: ym.NotBounceOptions<CTX>, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    ym(counterId ?? this.defaultCounterId, 'notBounce');

    return promise;
  }

  fireEvent = this.reachGoal;
  reachGoal<CTX>(
    target: string,
    params: ym.VisitParameters | undefined = undefined,
    callback: (this: CTX) => void = () => {},
    ctx: CTX | undefined = undefined,
    counterId?: number
  ) {
    const options = { callback, ctx };
    const promise = this.getCallbackPromise(options);

    ym(
      counterId ?? this.defaultCounterId,
      'reachGoal',
      target,
      params,
      options.callback,
      options.ctx
    );

    return promise;
  }

  hit<CTX>(url: string, options: ym.HitOptions<CTX> = {}, counterId?: number) {
    const promise = this.getCallbackPromise(options);

    ym(counterId ?? this.defaultCounterId, 'hit', url, options);

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
