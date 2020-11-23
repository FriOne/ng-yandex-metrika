import { Injectable, Injector } from '@angular/core';

import { DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS, YandexCounterConfig } from './ng-yandex-metrika.config';

export interface CallbackOptions {
  callback?: () => any;
  ctx?: any;
}

export interface CommonOptions extends CallbackOptions {
  params?: any;
  title?: any;
}

export interface HitOptions extends CommonOptions {
  referer?: string;
}

@Injectable({
  providedIn: 'root'
})
export class Metrika {
  private defaultCounterId: string;
  private counterConfigs: YandexCounterConfig[];
  private positionToId: any[];

  static getCounterNameById(id: string | number) {
    return `yaCounter${id}`;
  }

  static getCounterById(id: any) {
    return window[Metrika.getCounterNameById(id)];
  }

  constructor(injector: Injector) {
    this.defaultCounterId = injector.get<string>(DEFAULT_COUNTER_ID);
    this.counterConfigs = injector.get<YandexCounterConfig[]>(YANDEX_COUNTERS_CONFIGS);
    this.positionToId = this.counterConfigs.map(config => config.id);
  }

  async addFileExtension(extensions: string | string[], counterPosition?: number) {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      counter.addFileExtension(extensions);
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async extLink(url: string, options: CommonOptions = {}, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      const promise = this.getCallbackPromise(options, url);
      counter.extLink(url, options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async file(url: string, options: HitOptions = {}, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      const promise = this.getCallbackPromise(options, url);
      counter.file(url, options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  getClientID(counterPosition?: number): string {
    const counter = this.getCounterByPosition(counterPosition);
    if (counter && counter.reachGoal) {
      return counter.getClientID();
    }
    console.warn('Counter is still loading');
  }

  async setUserID(userId: string, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      counter.setUserID(userId);
      return {userId, counterPosition};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async userParams(params: any, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      counter.userParams(params);
      return {params, counterPosition};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async params(params: any, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      counter.params(params);
      return {params, counterPosition};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async replacePhones(counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      counter.replacePhones();
      return {counterPosition};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async notBounce(options: CallbackOptions = {}, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      const promise = this.getCallbackPromise(options, options);
      counter.notBounce(options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async fireEvent(type: string, options: CommonOptions = {}, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      const promise = this.getCallbackPromise(options, options);
      counter.reachGoal(type, options.params, options.callback, options.ctx);
      return promise;
    } catch (error) {
      console.error('error', error);
      console.warn(`'Event with type [${type}] can\'t be fired because counter is still loading'`)
    }
  }

  async hit(url: string, options: HitOptions = {}, counterPosition?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterPosition);
      const promise = this.getCallbackPromise(options, options);
      counter.hit(url, options);
      return promise;
    } catch (error) {
      console.warn(`'Hit for page [${url}] can\'t be fired because counter is still loading'`)
    }
  }

  private getCallbackPromise(options: any, resolveWith: any) {
    return new Promise((resolve, reject) => {
      const optionsCallback = options.callback;
      options.callback = function() {
        if (optionsCallback) {
          optionsCallback.call(this);
        }
        resolve(resolveWith);
      };
    });
  }

  private counterIsLoaded(counterPosition?: number): Promise<any> {
    const counter = this.getCounterByPosition(counterPosition);
    if (counter && counter.reachGoal) {
      return Promise.resolve(counter);
    } else {
      return Promise.reject(counter);
    }
  }

  private getCounterByPosition(counterPosition?: number) {
    const counterId = this.getCounterIdByPosition(counterPosition);
    return Metrika.getCounterById(counterId);
  }

  private getCounterIdByPosition(counterPosition: number) {
    return (counterPosition === undefined)
      ? this.defaultCounterId
      : this.positionToId[counterPosition];
  }
}
