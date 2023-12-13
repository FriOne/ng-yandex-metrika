/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { DOCUMENT, ɵparseCookieValue as parseCookieValue } from '@angular/common';
import { EnvironmentInjector, Inject, inject, Injectable, InjectionToken, PLATFORM_ID, runInInjectionContext } from '@angular/core';
import * as i0 from "@angular/core";
export const XSRF_ENABLED = new InjectionToken('XSRF_ENABLED');
export const XSRF_DEFAULT_COOKIE_NAME = 'XSRF-TOKEN';
export const XSRF_COOKIE_NAME = new InjectionToken('XSRF_COOKIE_NAME', {
    providedIn: 'root',
    factory: () => XSRF_DEFAULT_COOKIE_NAME,
});
export const XSRF_DEFAULT_HEADER_NAME = 'X-XSRF-TOKEN';
export const XSRF_HEADER_NAME = new InjectionToken('XSRF_HEADER_NAME', {
    providedIn: 'root',
    factory: () => XSRF_DEFAULT_HEADER_NAME,
});
/**
 * Retrieves the current XSRF token to use with the next outgoing request.
 *
 * @publicApi
 */
export class HttpXsrfTokenExtractor {
}
/**
 * `HttpXsrfTokenExtractor` which retrieves the token from a cookie.
 */
export class HttpXsrfCookieExtractor {
    constructor(doc, platform, cookieName) {
        this.doc = doc;
        this.platform = platform;
        this.cookieName = cookieName;
        this.lastCookieString = '';
        this.lastToken = null;
        /**
         * @internal for testing
         */
        this.parseCount = 0;
    }
    getToken() {
        if (this.platform === 'server') {
            return null;
        }
        const cookieString = this.doc.cookie || '';
        if (cookieString !== this.lastCookieString) {
            this.parseCount++;
            this.lastToken = parseCookieValue(cookieString, this.cookieName);
            this.lastCookieString = cookieString;
        }
        return this.lastToken;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfCookieExtractor, deps: [{ token: DOCUMENT }, { token: PLATFORM_ID }, { token: XSRF_COOKIE_NAME }], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfCookieExtractor }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfCookieExtractor, decorators: [{
            type: Injectable
        }], ctorParameters: () => [{ type: undefined, decorators: [{
                    type: Inject,
                    args: [DOCUMENT]
                }] }, { type: undefined, decorators: [{
                    type: Inject,
                    args: [PLATFORM_ID]
                }] }, { type: undefined, decorators: [{
                    type: Inject,
                    args: [XSRF_COOKIE_NAME]
                }] }] });
export function xsrfInterceptorFn(req, next) {
    const lcUrl = req.url.toLowerCase();
    // Skip both non-mutating requests and absolute URLs.
    // Non-mutating requests don't require a token, and absolute URLs require special handling
    // anyway as the cookie set
    // on our origin is not the same as the token expected by another origin.
    if (!inject(XSRF_ENABLED) || req.method === 'GET' || req.method === 'HEAD' ||
        lcUrl.startsWith('http://') || lcUrl.startsWith('https://')) {
        return next(req);
    }
    const token = inject(HttpXsrfTokenExtractor).getToken();
    const headerName = inject(XSRF_HEADER_NAME);
    // Be careful not to overwrite an existing header of the same name.
    if (token != null && !req.headers.has(headerName)) {
        req = req.clone({ headers: req.headers.set(headerName, token) });
    }
    return next(req);
}
/**
 * `HttpInterceptor` which adds an XSRF token to eligible outgoing requests.
 */
export class HttpXsrfInterceptor {
    constructor(injector) {
        this.injector = injector;
    }
    intercept(initialRequest, next) {
        return runInInjectionContext(this.injector, () => xsrfInterceptorFn(initialRequest, downstreamRequest => next.handle(downstreamRequest)));
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfInterceptor, deps: [{ token: i0.EnvironmentInjector }], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfInterceptor }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: HttpXsrfInterceptor, decorators: [{
            type: Injectable
        }], ctorParameters: () => [{ type: i0.EnvironmentInjector }] });
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoieHNyZi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbW1vbi9odHRwL3NyYy94c3JmLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxRQUFRLEVBQUUsaUJBQWlCLElBQUksZ0JBQWdCLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQUNoRixPQUFPLEVBQUMsbUJBQW1CLEVBQUUsTUFBTSxFQUFFLE1BQU0sRUFBRSxVQUFVLEVBQUUsY0FBYyxFQUFFLFdBQVcsRUFBRSxxQkFBcUIsRUFBQyxNQUFNLGVBQWUsQ0FBQzs7QUFRbEksTUFBTSxDQUFDLE1BQU0sWUFBWSxHQUFHLElBQUksY0FBYyxDQUFVLGNBQWMsQ0FBQyxDQUFDO0FBRXhFLE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLFlBQVksQ0FBQztBQUNyRCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGNBQWMsQ0FBUyxrQkFBa0IsRUFBRTtJQUM3RSxVQUFVLEVBQUUsTUFBTTtJQUNsQixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsd0JBQXdCO0NBQ3hDLENBQUMsQ0FBQztBQUVILE1BQU0sQ0FBQyxNQUFNLHdCQUF3QixHQUFHLGNBQWMsQ0FBQztBQUN2RCxNQUFNLENBQUMsTUFBTSxnQkFBZ0IsR0FBRyxJQUFJLGNBQWMsQ0FBUyxrQkFBa0IsRUFBRTtJQUM3RSxVQUFVLEVBQUUsTUFBTTtJQUNsQixPQUFPLEVBQUUsR0FBRyxFQUFFLENBQUMsd0JBQXdCO0NBQ3hDLENBQUMsQ0FBQztBQUVIOzs7O0dBSUc7QUFDSCxNQUFNLE9BQWdCLHNCQUFzQjtDQU8zQztBQUVEOztHQUVHO0FBRUgsTUFBTSxPQUFPLHVCQUF1QjtJQVNsQyxZQUM4QixHQUFRLEVBQStCLFFBQWdCLEVBQy9DLFVBQWtCO1FBRDFCLFFBQUcsR0FBSCxHQUFHLENBQUs7UUFBK0IsYUFBUSxHQUFSLFFB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b29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0RPQ1VNRU5ULCDJtXBhcnNlQ29va2llVmFsdWUgYXMgcGFyc2VDb29raWVWYWx1ZX0gZnJvbSAnQGFuZ3VsYXIvY29tbW9uJztcbmltcG9ydCB7RW52aXJvbm1lbnRJbmplY3RvciwgSW5qZWN0LCBpbmplY3QsIEluamVjdGFibGUsIEluamVjdGlvblRva2VuLCBQTEFURk9STV9JRCwgcnVuSW5JbmplY3Rpb25Db250ZXh0fSBmcm9tICdAYW5ndWxhci9jb3JlJztcbmltcG9ydCB7T2JzZXJ2YWJsZX0gZnJvbSAncnhqcyc7XG5cbmltcG9ydCB7SHR0cEhhbmRsZXJ9IGZyb20gJy4vYmFja2VuZCc7XG5pbXBvcnQge0h0dHBIYW5kbGVyRm4sIEh0dHBJbnRlcmNlcHRvcn0gZnJvbSAnLi9pbnRlcmNlcHRvcic7XG5pbXBvcnQge0h0dHBSZXF1ZXN0fSBmcm9tICcuL3JlcXVlc3QnO1xuaW1wb3J0IHtIdHRwRXZlbnR9IGZyb20gJy4vcmVzcG9uc2UnO1xuXG5leHBvcnQgY29uc3QgWFNSRl9FTkFCTEVEID0gbmV3IEluamVjdGlvblRva2VuPGJvb2xlYW4+KCdYU1JGX0VOQUJMRUQnKTtcblxuZXhwb3J0IGNvbnN0IFhTUkZfREVGQVVMVF9DT09LSUVfTkFNRSA9ICdYU1JGLVRPS0VOJztcbmV4cG9ydCBjb25zdCBYU1JGX0NPT0tJRV9OQU1FID0gbmV3IEluamVjdGlvblRva2VuPHN0cmluZz4oJ1hTUkZfQ09PS0lFX05BTUUnLCB7XG4gIHByb3ZpZGVkSW46ICdyb290JyxcbiAgZmFjdG9yeTogKCkgPT4gWFNSRl9ERUZBVUxUX0NPT0tJRV9OQU1FLFxufSk7XG5cbmV4cG9ydCBjb25zdCBYU1JGX0RFRkFVTFRfSEVBREVSX05BTUUgPSAnWC1YU1JGLVRPS0VOJztcbmV4cG9ydCBjb25zdCBYU1JGX0hFQURFUl9OQU1FID0gbmV3IEluamVjdGlvblRva2VuPHN0cmluZz4oJ1hTUkZfSEVBREVSX05BTUUnLCB7XG4gIHByb3ZpZGVkSW46ICdyb290JyxcbiAgZmFjdG9yeTogKCkgPT4gWFNSRl9ERUZBVUxUX0hFQURFUl9OQU1FLFxufSk7XG5cbi8qKlxuICogUmV0cmlldmVzIHRoZSBjdXJyZW50IFhTUkYgdG9rZW4gdG8gdXNlIHdpdGggdGhlIG5leHQgb3V0Z29pbmcgcmVxdWVzdC5cbiAqXG4gKiBAcHVibGljQXBpXG4gKi9cbmV4cG9ydCBhYnN0cmFjdCBjbGFzcyBIdHRwWHNyZlRva2VuRXh0cmFjdG9yIHtcbiAgLyoqXG4gICAqIEdldCB0aGUgWFNSRiB0b2tlbiB0byB1c2Ugd2l0aCBhbiBvdXRnb2luZyByZXF1ZXN0LlxuICAgKlxuICAgKiBXaWxsIGJlIGNhbGxlZCBmb3IgZXZlcnkgcmVxdWVzdCwgc28gdGhlIHRva2VuIG1heSBjaGFuZ2UgYmV0d2VlbiByZXF1ZXN0cy5cbiAgICovXG4gIGFic3RyYWN0IGdldFRva2VuKCk6IHN0cmluZ3xudWxsO1xufVxuXG4vKipcbiAqIGBIdHRwWHNyZlRva2VuRXh0cmFjdG9yYCB3aGljaCByZXRyaWV2ZXMgdGhlIHRva2VuIGZyb20gYSBjb29raWUuXG4gKi9cbkBJbmplY3RhYmxlKClcbmV4cG9ydCBjbGFzcyBIdHRwWHNyZkNvb2tpZUV4dHJhY3RvciBpbXBsZW1lbnRzIEh0dHBYc3JmVG9rZW5FeHRyYWN0b3Ige1xuICBwcml2YXRlIGxhc3RDb29raWVTdHJpbmc6IHN0cmluZyA9ICcnO1xuICBwcml2YXRlIGxhc3RUb2tlbjogc3RyaW5nfG51bGwgPSBudWxsO1xuXG4gIC8qKlxuICAgKiBAaW50ZXJuYWwgZm9yIHRlc3RpbmdcbiAgICovXG4gIHBhcnNlQ291bnQ6IG51bWJlciA9IDA7XG5cbiAgY29uc3RydWN0b3IoXG4gICAgICBASW5qZWN0KERPQ1VNRU5UKSBwcml2YXRlIGRvYzogYW55LCBASW5qZWN0KFBMQVRGT1JNX0lEKSBwcml2YXRlIHBsYXRmb3JtOiBzdHJpbmcsXG4gICAgICBASW5qZWN0KFhTUkZfQ09PS0lFX05BTUUpIHByaXZhdGUgY29va2llTmFtZTogc3RyaW5nKSB7fVxuXG4gIGdldFRva2VuKCk6IHN0cmluZ3xudWxsIHtcbiAgICBpZiAodGhpcy5wbGF0Zm9ybSA9PT0gJ3NlcnZlcicpIHtcbiAgICAgIHJldHVybiBudWxsO1xuICAgIH1cbiAgICBjb25zdCBjb29raWVTdHJpbmcgPSB0aGlzLmRvYy5jb29raWUgfHwgJyc7XG4gICAgaWYgKGNvb2tpZVN0cmluZyAhPT0gdGhpcy5sYXN0Q29va2llU3RyaW5nKSB7XG4gICAgICB0aGlzLnBhcnNlQ291bnQrKztcbiAgICAgIHRoaXMubGFzdFRva2VuID0gcGFyc2VDb29raWVWYWx1ZShjb29raWVTdHJpbmcsIHRoaXMuY29va2llTmFtZSk7XG4gICAgICB0aGlzLmxhc3RDb29raWVTdHJpbmcgPSBjb29raWVTdHJpbmc7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLmxhc3RUb2tlbjtcbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24geHNyZkludGVyY2VwdG9yRm4oXG4gICAgcmVxOiBIdHRwUmVxdWVzdDx1bmtub3duPiwgbmV4dDogSHR0cEhhbmRsZXJGbik6IE9ic2VydmFibGU8SHR0cEV2ZW50PHVua25vd24+PiB7XG4gIGNvbnN0IGxjVXJsID0gcmVxLnVybC50b0xvd2VyQ2FzZSgpO1xuICAvLyBTa2lwIGJvdGggbm9uLW11dGF0aW5nIHJlcXVlc3RzIGFuZCBhYnNvbHV0ZSBVUkxzLlxuICAvLyBOb24tbXV0YXRpbmcgcmVxdWVzdHMgZG9uJ3QgcmVxdWlyZSBhIHRva2VuLCBhbmQgYWJzb2x1dGUgVVJMcyByZXF1aXJlIHNwZWNpYWwgaGFuZGxpbmdcbiAgLy8gYW55d2F5IGFzIHRoZSBjb29raWUgc2V0XG4gIC8vIG9uIG91ciBvcmlnaW4gaXMgbm90IHRoZSBzYW1lIGFzIHRoZSB0b2tlbiBleHBlY3RlZCBieSBhbm90aGVyIG9yaWdpbi5cbiAgaWYgKCFpbmplY3QoWFNSRl9FTkFCTEVEKSB8fCByZXEubWV0aG9kID09PSAnR0VUJyB8fCByZXEubWV0aG9kID09PSAnSEVBRCcgfHxcbiAgICAgIGxjVXJsLnN0YXJ0c1dpdGgoJ2h0dHA6Ly8nKSB8fCBsY1VybC5zdGFydHNXaXRoKCdodHRwczovLycpKSB7XG4gICAgcmV0dXJuIG5leHQocmVxKTtcbiAgfVxuXG4gIGNvbnN0IHRva2VuID0gaW5qZWN0KEh0dHBYc3JmVG9rZW5FeHRyYWN0b3IpLmdldFRva2VuKCk7XG4gIGNvbnN0IGhlYWRlck5hbWUgPSBpbmplY3QoWFNSRl9IRUFERVJfTkFNRSk7XG5cbiAgLy8gQmUgY2FyZWZ1bCBub3QgdG8gb3ZlcndyaXRlIGFuIGV4aXN0aW5nIGhlYWRlciBvZiB0aGUgc2FtZSBuYW1lLlxuICBpZiAodG9rZW4gIT0gbnVsbCAmJiAhcmVxLmhlYWRlcnMuaGFzKGhlYWRlck5hbWUpKSB7XG4gICAgcmVxID0gcmVxLmNsb25lKHtoZWFkZXJzOiByZXEuaGVhZGVycy5zZXQoaGVhZGVyTmFtZSwgdG9rZW4pfSk7XG4gIH1cbiAgcmV0dXJuIG5leHQocmVxKTtcbn1cblxuLyoqXG4gKiBgSHR0cEludGVyY2VwdG9yYCB3aGljaCBhZGRzIGFuIFhTUkYgdG9rZW4gdG8gZWxpZ2libGUgb3V0Z29pbmcgcmVxdWVzdHMuXG4gKi9cbkBJbmplY3RhYmxlKClcbmV4cG9ydCBjbGFzcyBIdHRwWHNyZkludGVyY2VwdG9yIGltcGxlbWVudHMgSHR0cEludGVyY2VwdG9yIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBpbmplY3RvcjogRW52aXJvbm1lbnRJbmplY3Rvcikge31cblxuICBpbnRlcmNlcHQoaW5pdGlhbFJlcXVlc3Q6IEh0dHBSZXF1ZXN0PGFueT4sIG5leHQ6IEh0dHBIYW5kbGVyKTogT2JzZXJ2YWJsZTxIdHRwRXZlbnQ8YW55Pj4ge1xuICAgIHJldHVybiBydW5JbkluamVjdGlvbkNvbnRleHQoXG4gICAgICAgIHRoaXMuaW5qZWN0b3IsXG4gICAgICAgICgpID0+XG4gICAgICAgICAgICB4c3JmSW50ZXJjZXB0b3JGbihpbml0aWFsUmVxdWVzdCwgZG93bnN0cmVhbVJlcXVlc3QgPT4gbmV4dC5oYW5kbGUoZG93bnN0cmVhbVJlcXVlc3QpKSk7XG4gIH1cbn1cbiJdfQ==