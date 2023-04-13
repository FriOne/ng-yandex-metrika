import { Injectable, Injector } from '@angular/core';

import { DEFAULT_COUNTER_ID, YANDEX_COUNTERS_CONFIGS, YandexCounterConfig } from './ng-yandex-metrika.config';

export interface CallbackOptions {
  callback?: () => void;
  ctx?: Record<string, any>;
}

export interface CommonOptions extends CallbackOptions {
  params?: Record<string, any>;
  title?: string;
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

  static getCounterNameById(id: string | number) {
    return `yaCounter${id}`;
  }

  static getCounterById(id: any) {
    return window[Metrika.getCounterNameById(id)];
  }

  constructor(injector: Injector) {
    this.defaultCounterId = injector.get<string>(DEFAULT_COUNTER_ID);
    this.counterConfigs = injector.get<YandexCounterConfig[]>(YANDEX_COUNTERS_CONFIGS);
  }

  async addFileExtension(extensions: string | string[], counterId?: number) {
    try {
      const counter = await this.counterIsLoaded(counterId);
      counter.addFileExtension(extensions);
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async extLink(url: string, options: CommonOptions = {}, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      const promise = this.getCallbackPromise(options, url);
      counter.extLink(url, options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async file(url: string, options: HitOptions = {}, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      const promise = this.getCallbackPromise(options, url);
      counter.file(url, options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  getClientID(counterId?: number): string {
    const counter = counterId ? Metrika.getCounterById(counterId) : this.defaultCounterId;
    if (counter && counter.reachGoal) {
      return counter.getClientID();
    }
    console.warn('Counter is still loading');
  }

  async setUserID(userId: string, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      counter.setUserID(userId);
      return {userId, counterId};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async userParams(params: any, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      counter.userParams(params);
      return {params, counterId};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async params(params: any, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      counter.params(params);
      return {params, counterId};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async replacePhones(counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      counter.replacePhones();
      return {counterId};
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  async notBounce(options: CallbackOptions = {}, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      const promise = this.getCallbackPromise(options, options);
      counter.notBounce(options);
      return promise;
    } catch (error) {
      console.warn('Counter is still loading');
    }
  }

  fireEvent = this.reachGoal;
  async reachGoal(type: string, options: CommonOptions = {}, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      const promise = this.getCallbackPromise(options, options);
      counter.reachGoal(type, options.params, options.callback, options.ctx);
      return promise;
    } catch (error) {
      console.error('error', error);
      console.warn(`'Event with type [${type}] can\'t be fired because counter is still loading'`)
    }
  }

  async hit(url: string, options: HitOptions = {}, counterId?: number): Promise<any> {
    try {
      const counter = await this.counterIsLoaded(counterId);
      const promise = this.getCallbackPromise(options, options);
      counter.hit(url, options);
      return promise;
    } catch (error) {
      console.warn(`'Hit for page [${url}] can\'t be fired because counter is still loading'`)
    }
  }

  private getCallbackPromise(options: any, resolveWith: any) {
    return new Promise((resolve) => {
      const optionsCallback = options.callback;
      options.callback = function() {
        if (optionsCallback) {
          optionsCallback.call(this);
        }
        resolve(resolveWith);
      };
    });
  }

  private counterIsLoaded(counterId?: number): Promise<any> {
    const counter = counterId ? Metrika.getCounterById(counterId) : this.defaultCounterId;
    if (counter && counter.reachGoal) {
      return Promise.resolve(counter);
    } else {
      return Promise.reject(counter);
    }
  }
}
