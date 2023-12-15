declare global {
  interface Window {
    ym: YandexEvent;
  }
}

export interface YandexEvent {
  (counterId: number, eventName: "init", parameters: InitParameters): void;
  (counterId: number, eventName: "addFileExtension", extensions: string | string[]): void;
  // eslint-disable-next-line @definitelytyped/no-unnecessary-generics
  <CTX>(counterId: number, eventName: "extLink", url: string, options?: ExtLinkOptions<CTX>): void;
  // eslint-disable-next-line @definitelytyped/no-unnecessary-generics
  <CTX>(counterId: number, eventName: "file", url: string, options?: FileOptions<CTX>): void;
  (counterId: number, eventName: "getClientID", cb: (clientID: string) => void): void;
  // eslint-disable-next-line @definitelytyped/no-unnecessary-generics
  <CTX>(counterId: number, eventName: "hit", url: string, options?: HitOptions<CTX>): void;
  /** @deprecated */
  (
    counterId: number,
    eventName: "hit",
    url: string,
    title?: string,
    referer?: string,
    params?: VisitParameters,
  ): void;
  // eslint-disable-next-line @definitelytyped/no-unnecessary-generics
  <CTX>(counterId: number, eventName: "notBounce", options?: NotBounceOptions<CTX>): void;
  (counterId: number, eventName: "params", parameters: VisitParameters | VisitParameters[]): void;
  <CTX>(
    counterId: number,
    eventName: "reachGoal",
    target: string,
    params?: VisitParameters,
    callback?: (this: CTX) => void,
    ctx?: CTX,
  ): void;
  (counterId: number, eventName: "replacePhones"): void;
  (counterId: number, eventName: "setUserID", userID: string): void;
  (counterId: number, eventName: "userParams", parameters: UserParameters): void;

  l: number;
  a: unknown[];
}

export interface VisitParameters {
  order_price?: number | undefined;
  currency?: string | undefined;
  [key: string]: any;
}

export interface UserParameters {
  UserID?: number | undefined;
  [key: string]: any;
}

export interface InitParameters {
  accurateTrackBounce?: boolean | number | undefined;
  childIframe?: boolean | undefined;
  clickmap?: boolean | undefined;
  defer?: boolean | undefined;
  ecommerce?: boolean | string | any[] | undefined;
  params?: VisitParameters | VisitParameters[] | undefined;
  userParams?: UserParameters | undefined;
  trackHash?: boolean | undefined;
  trackLinks?: boolean | undefined;
  trustedDomains?: string[] | undefined;
  type?: number | undefined;
  ut?: "noindex" | undefined;
  webvisor?: boolean | undefined;
  triggerEvent?: boolean | undefined;
}

export interface CallbackOptions<CTX> {
  callback?: (this: CTX) => void;
  ctx?: CTX | undefined;
}

export interface ExtLinkOptions<CTX> extends CallbackOptions<CTX> {
  params?: VisitParameters | undefined;
  title?: string | undefined;
}

export interface FileOptions<CTX> extends CallbackOptions<CTX> {
  params?: VisitParameters | undefined;
  referer?: string | undefined;
  title?: string | undefined;
}

export interface HitOptions<CTX> extends CallbackOptions<CTX> {
  params?: VisitParameters | undefined;
  referer?: string | undefined;
  title?: string | undefined;
}

export interface NotBounceOptions<CTX> extends CallbackOptions<CTX> {}

