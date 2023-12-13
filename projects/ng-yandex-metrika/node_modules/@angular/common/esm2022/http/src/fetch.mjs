/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { inject, Injectable, NgZone } from '@angular/core';
import { Observable } from 'rxjs';
import { HttpHeaders } from './headers';
import { HttpErrorResponse, HttpEventType, HttpHeaderResponse, HttpResponse } from './response';
import * as i0 from "@angular/core";
const XSSI_PREFIX = /^\)\]\}',?\n/;
const REQUEST_URL_HEADER = `X-Request-URL`;
/**
 * Determine an appropriate URL for the response, by checking either
 * response url or the X-Request-URL header.
 */
function getResponseUrl(response) {
    if (response.url) {
        return response.url;
    }
    // stored as lowercase in the map
    const xRequestUrl = REQUEST_URL_HEADER.toLocaleLowerCase();
    return response.headers.get(xRequestUrl);
}
/**
 * Uses `fetch` to send requests to a backend server.
 *
 * This `FetchBackend` requires the support of the
 * [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) which is available on all
 * supported browsers and on Node.js v18 or later.
 *
 * @see {@link HttpHandler}
 *
 * @publicApi
 */
export class FetchBackend {
    constructor() {
        // We need to bind the native fetch to its context or it will throw an "illegal invocation"
        this.fetchImpl = inject(FetchFactory, { optional: true })?.fetch ?? fetch.bind(globalThis);
        this.ngZone = inject(NgZone);
    }
    handle(request) {
        return new Observable(observer => {
            const aborter = new AbortController();
            this.doRequest(request, aborter.signal, observer)
                .then(noop, error => observer.error(new HttpErrorResponse({ error })));
            return () => aborter.abort();
        });
    }
    async doRequest(request, signal, observer) {
        const init = this.createRequestInit(request);
        let response;
        try {
            const fetchPromise = this.fetchImpl(request.urlWithParams, { signal, ...init });
            // Make sure Zone.js doesn't trigger false-positive unhandled promise
            // error in case the Promise is rejected synchronously. See function
            // description for additional information.
            silenceSuperfluousUnhandledPromiseRejection(fetchPromise);
            // Send the `Sent` event before awaiting the response.
            observer.next({ type: HttpEventType.Sent });
            response = await fetchPromise;
        }
        catch (error) {
            observer.error(new HttpErrorResponse({
                error,
                status: error.status ?? 0,
                statusText: error.statusText,
                url: request.urlWithParams,
                headers: error.headers,
            }));
            return;
        }
        const headers = new HttpHeaders(response.headers);
        const statusText = response.statusText;
        const url = getResponseUrl(response) ?? request.urlWithParams;
        let status = response.status;
        let body = null;
        if (request.reportProgress) {
            observer.next(new HttpHeaderResponse({ headers, status, statusText, url }));
        }
        if (response.body) {
            // Read Progress
            const contentLength = response.headers.get('content-length');
            const chunks = [];
            const reader = response.body.getReader();
            let receivedLength = 0;
            let decoder;
            let partialText;
            // We have to check whether the Zone is defined in the global scope because this may be called
            // when the zone is nooped.
            const reqZone = typeof Zone !== 'undefined' && Zone.current;
            // Perform response processing outside of Angular zone to
            // ensure no excessive change detection runs are executed
            // Here calling the async ReadableStreamDefaultReader.read() is responsible for triggering CD
            await this.ngZone.runOutsideAngular(async () => {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) {
                        break;
                    }
                    chunks.push(value);
                    receivedLength += value.length;
                    if (request.reportProgress) {
                        partialText = request.responseType === 'text' ?
                            (partialText ?? '') + (decoder ??= new TextDecoder).decode(value, { stream: true }) :
                            undefined;
                        const reportProgress = () => observer.next({
                            type: HttpEventType.DownloadProgress,
                            total: contentLength ? +contentLength : undefined,
                            loaded: receivedLength,
                            partialText,
                        });
                        reqZone ? reqZone.run(reportProgress) : reportProgress();
                    }
                }
            });
            // Combine all chunks.
            const chunksAll = this.concatChunks(chunks, receivedLength);
            try {
                const contentType = response.headers.get('Content-Type') ?? '';
                body = this.parseBody(request, chunksAll, contentType);
            }
            catch (error) {
                // Body loading or parsing failed
                observer.error(new HttpErrorResponse({
                    error,
                    headers: new HttpHeaders(response.headers),
                    status: response.status,
                    statusText: response.statusText,
                    url: getResponseUrl(response) ?? request.urlWithParams,
                }));
                return;
            }
        }
        // Same behavior as the XhrBackend
        if (status === 0) {
            status = body ? 200 /* HttpStatusCode.Ok */ : 0;
        }
        // ok determines whether the response will be transmitted on the event or
        // error channel. Unsuccessful status codes (not 2xx) will always be errors,
        // but a successful status code can still result in an error if the user
        // asked for JSON data and the body cannot be parsed as such.
        const ok = status >= 200 && status < 300;
        if (ok) {
            observer.next(new HttpResponse({
                body,
                headers,
                status,
                statusText,
                url,
            }));
            // The full body has been received and delivered, no further events
            // are possible. This request is complete.
            observer.complete();
        }
        else {
            observer.error(new HttpErrorResponse({
                error: body,
                headers,
                status,
                statusText,
                url,
            }));
        }
    }
    parseBody(request, binContent, contentType) {
        switch (request.responseType) {
            case 'json':
                // stripping the XSSI when present
                const text = new TextDecoder().decode(binContent).replace(XSSI_PREFIX, '');
                return text === '' ? null : JSON.parse(text);
            case 'text':
                return new TextDecoder().decode(binContent);
            case 'blob':
                return new Blob([binContent], { type: contentType });
            case 'arraybuffer':
                return binContent.buffer;
        }
    }
    createRequestInit(req) {
        // We could share some of this logic with the XhrBackend
        const headers = {};
        const credentials = req.withCredentials ? 'include' : undefined;
        // Setting all the requested headers.
        req.headers.forEach((name, values) => (headers[name] = values.join(',')));
        // Add an Accept header if one isn't present already.
        headers['Accept'] ??= 'application/json, text/plain, */*';
        // Auto-detect the Content-Type header if one isn't present already.
        if (!headers['Content-Type']) {
            const detectedType = req.detectContentTypeHeader();
            // Sometimes Content-Type detection fails.
            if (detectedType !== null) {
                headers['Content-Type'] = detectedType;
            }
        }
        return {
            body: req.serializeBody(),
            method: req.method,
            headers,
            credentials,
        };
    }
    concatChunks(chunks, totalLength) {
        const chunksAll = new Uint8Array(totalLength);
        let position = 0;
        for (const chunk of chunks) {
            chunksAll.set(chunk, position);
            position += chunk.length;
        }
        return chunksAll;
    }
    static { this.ɵfac = i0.ɵɵngDeclareFactory({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FetchBackend, deps: [], target: i0.ɵɵFactoryTarget.Injectable }); }
    static { this.ɵprov = i0.ɵɵngDeclareInjectable({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FetchBackend }); }
}
i0.ɵɵngDeclareClassMetadata({ minVersion: "12.0.0", version: "17.0.6", ngImport: i0, type: FetchBackend, decorators: [{
            type: Injectable
        }] });
/**
 * Abstract class to provide a mocked implementation of `fetch()`
 */
export class FetchFactory {
}
function noop() { }
/**
 * Zone.js treats a rejected promise that has not yet been awaited
 * as an unhandled error. This function adds a noop `.then` to make
 * sure that Zone.js doesn't throw an error if the Promise is rejected
 * synchronously.
 */
function silenceSuperfluousUnhandledPromiseRejection(promise) {
    promise.then(noop, noop);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmV0Y2guanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21tb24vaHR0cC9zcmMvZmV0Y2gudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxFQUFDLE1BQU0sRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQ3pELE9BQU8sRUFBQyxVQUFVLEVBQVcsTUFBTSxNQUFNLENBQUM7QUFHMUMsT0FBTyxFQUFDLFdBQVcsRUFBQyxNQUFNLFdBQVcsQ0FBQztBQUV0QyxPQUFPLEVBQTRCLGlCQUFpQixFQUFhLGFBQWEsRUFBRSxrQkFBa0IsRUFBRSxZQUFZLEVBQWlCLE1BQU0sWUFBWSxDQUFDOztBQUVwSixNQUFNLFdBQVcsR0FBRyxjQUFjLENBQUM7QUFFbkMsTUFBTSxrQkFBa0IsR0FBRyxlQUFlLENBQUM7QUFFM0M7OztHQUdHO0FBQ0gsU0FBUyxjQUFjLENBQUMsUUFBa0I7SUFDeEMsSUFBSSxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ2hCLE9BQU8sUUFBUSxDQUFDLEdBQUcsQ0FBQztLQUNyQjtJQUNELGlDQUFpQztJQUNqQyxNQUFNLFdBQVcsR0FBRyxrQkFBa0IsQ0FBQyxpQkFBaUIsRUFBRSxDQUFDO0lBQzNELE9BQU8sUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLENBQUM7QUFDM0MsQ0FBQztBQUVEOzs7Ozs7Ozs7O0dBVUc7QUFFSCxNQUFNLE9BQU8sWUFBWTtJQUR6QjtRQUVFLDJGQUEyRjtRQUMxRSxjQUFTLEdBQ3RCLE1BQU0sQ0FBQyxZQUFZLEVBQUUsRUFBQyxRQUFRLEVBQUUsSUFBSSxFQUFDLENBQUMsRUFBRSxLQUFLLElBQUksS0FBSyxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUMzRCxXQUFNLEdBQUcsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBME0xQztJQXhN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LFNBQVMsMkNBQTJDLENBQUMsT0FBeUI7SUFDNUUsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDM0IsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge2luamVjdCwgSW5qZWN0YWJsZSwgTmdab25lfSBmcm9tICdAYW5ndWxhci9jb3JlJztcbmltcG9ydCB7T2JzZXJ2YWJsZSwgT2JzZXJ2ZXJ9IGZyb20gJ3J4anMnO1xuXG5pbXBvcnQge0h0dHBCYWNrZW5kfSBmcm9tICcuL2JhY2tlbmQnO1xuaW1wb3J0IHtIdHRwSGVhZGVyc30gZnJvbSAnLi9oZWFkZXJzJztcbmltcG9ydCB7SHR0cFJlcXVlc3R9IGZyb20gJy4vcmVxdWVzdCc7XG5pbXBvcnQge0h0dHBEb3dubG9hZFByb2dyZXNzRXZlbnQsIEh0dHBFcnJvclJlc3BvbnNlLCBIdHRwRXZlbnQsIEh0dHBFdmVudFR5cGUsIEh0dHBIZWFkZXJSZXNwb25zZSwgSHR0cFJlc3BvbnNlLCBIdHRwU3RhdHVzQ29kZX0gZnJvbSAnLi9yZXNwb25zZSc7XG5cbmNvbnN0IFhTU0lfUFJFRklYID0gL15cXClcXF1cXH0nLD9cXG4vO1xuXG5jb25zdCBSRVFVRVNUX1VSTF9IRUFERVIgPSBgWC1SZXF1ZXN0LVVSTGA7XG5cbi8qKlxuICogRGV0ZXJtaW5lIGFuIGFwcHJvcHJpYXRlIFVSTCBmb3IgdGhlIHJlc3BvbnNlLCBieSBjaGVja2luZyBlaXRoZXJcbiAqIHJlc3BvbnNlIHVybCBvciB0aGUgWC1SZXF1ZXN0LVVSTCBoZWFkZXIuXG4gKi9cbmZ1bmN0aW9uIGdldFJlc3BvbnNlVXJsKHJlc3BvbnNlOiBSZXNwb25zZSk6IHN0cmluZ3xudWxsIHtcbiAgaWYgKHJlc3BvbnNlLnVybCkge1xuICAgIHJldHVybiByZXNwb25zZS51cmw7XG4gIH1cbiAgLy8gc3RvcmVkIGFzIGxvd2VyY2FzZSBpbiB0aGUgbWFwXG4gIGNvbnN0IHhSZXF1ZXN0VXJsID0gUkVRVUVTVF9VUkxfSEVBREVSLnRvTG9jYWxlTG93ZXJDYXNlKCk7XG4gIHJldHVybiByZXNwb25zZS5oZWFkZXJzLmdldCh4UmVxdWVzdFVybCk7XG59XG5cbi8qKlxuICogVXNlcyBgZmV0Y2hgIHRvIHNlbmQgcmVxdWVzdHMgdG8gYSBiYWNrZW5kIHNlcnZlci5cbiAqXG4gKiBUaGlzIGBGZXRjaEJhY2tlbmRgIHJlcXVpcmVzIHRoZSBzdXBwb3J0IG9mIHRoZVxuICogW0ZldGNoIEFQSV0oaHR0cHM6Ly9kZXZlbG9wZXIubW96aWxsYS5vcmcvZW4tVVMvZG9jcy9XZWIvQVBJL0ZldGNoX0FQSSkgd2hpY2ggaXMgYXZhaWxhYmxlIG9uIGFsbFxuICogc3VwcG9ydGVkIGJyb3dzZXJzIGFuZCBvbiBOb2RlLmpzIHYxOCBvciBsYXRlci5cbiAqXG4gKiBAc2VlIHtAbGluayBIdHRwSGFuZGxlcn1cbiAqXG4gKiBAcHVibGljQXBpXG4gKi9cbkBJbmplY3RhYmxlKClcbmV4cG9ydCBjbGFzcyBGZXRjaEJhY2tlbmQgaW1wbGVtZW50cyBIdHRwQmFja2VuZCB7XG4gIC8vIFdlIG5lZWQgdG8gYmluZCB0aGUgbmF0aXZlIGZldGNoIHRvIGl0cyBjb250ZXh0IG9yIGl0IHdpbGwgdGhyb3cgYW4gXCJpbGxlZ2FsIGludm9jYXRpb25cIlxuICBwcml2YXRlIHJlYWRvbmx5IGZldGNoSW1wbCA9XG4gICAgICBpbmplY3QoRmV0Y2hGYWN0b3J5LCB7b3B0aW9uYWw6IHRydWV9KT8uZmV0Y2ggPz8gZmV0Y2guYmluZChnbG9iYWxUaGlzKTtcbiAgcHJpdmF0ZSByZWFkb25seSBuZ1pvbmUgPSBpbmplY3QoTmdab25lKTtcblxuICBoYW5kbGUocmVxdWVzdDogSHR0cFJlcXVlc3Q8YW55Pik6IE9ic2VydmFibGU8SHR0cEV2ZW50PGFueT4+IHtcbiAgICByZXR1cm4gbmV3IE9ic2VydmFibGUob2JzZXJ2ZXIgPT4ge1xuICAgICAgY29uc3QgYWJvcnRlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcbiAgICAgIHRoaXMuZG9SZXF1ZXN0KHJlcXVlc3QsIGFib3J0ZXIuc2lnbmFsLCBvYnNlcnZlcilcbiAgICAgICAgICAudGhlbihub29wLCBlcnJvciA9PiBvYnNlcnZlci5lcnJvcihuZXcgSHR0cEVycm9yUmVzcG9uc2Uoe2Vycm9yfSkpKTtcbiAgICAgIHJldHVybiAoKSA9PiBhYm9ydGVyLmFib3J0KCk7XG4gICAgfSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIGRvUmVxdWVzdChcbiAgICAgIHJlcXVlc3Q6IEh0dHBSZXF1ZXN0PGFueT4sIHNpZ25hbDogQWJvcnRTaWduYWwsXG4gICAgICBvYnNlcnZlcjogT2JzZXJ2ZXI8SHR0cEV2ZW50PGFueT4+KTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgaW5pdCA9IHRoaXMuY3JlYXRlUmVxdWVzdEluaXQocmVxdWVzdCk7XG4gICAgbGV0IHJlc3BvbnNlO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGZldGNoUHJvbWlzZSA9IHRoaXMuZmV0Y2hJbXBsKHJlcXVlc3QudXJsV2l0aFBhcmFtcywge3NpZ25hbCwgLi4uaW5pdH0pO1xuXG4gICAgICAvLyBNYWtlIHN1cmUgWm9uZS5qcyBkb2Vzbid0IHRyaWdnZXIgZmFsc2UtcG9zaXRpdmUgdW5oYW5kbGVkIHByb21pc2VcbiAgICAgIC8vIGVycm9yIGluIGNhc2UgdGhlIFByb21pc2UgaXMgcmVqZWN0ZWQgc3luY2hyb25vdXNseS4gU2VlIGZ1bmN0aW9uXG4gICAgICAvLyBkZXNjcmlwdGlvbiBmb3IgYWRkaXRpb25hbCBpbmZvcm1hdGlvbi5cbiAgICAgIHNpbGVuY2VTdXBlcmZsdW91c1VuaGFuZGxlZFByb21pc2VSZWplY3Rpb24oZmV0Y2hQcm9taXNlKTtcblxuICAgICAgLy8gU2VuZCB0aGUgYFNlbnRgIGV2ZW50IGJlZm9yZSBhd2FpdGluZyB0aGUgcmVzcG9uc2UuXG4gICAgICBvYnNlcnZlci5uZXh0KHt0eXBlOiBIdHRwRXZlbnRUeXBlLlNlbnR9KTtcblxuICAgICAgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaFByb21pc2U7XG4gICAgfSBjYXRjaCAoZXJyb3I6IGFueSkge1xuICAgICAgb2JzZXJ2ZXIuZXJyb3IobmV3IEh0dHBFcnJvclJlc3BvbnNlKHtcbiAgICAgICAgZXJyb3IsXG4gICAgICAgIHN0YXR1czogZXJyb3Iuc3RhdHVzID8/IDAsXG4gICAgICAgIHN0YXR1c1RleHQ6IGVycm9yLnN0YXR1c1RleHQsXG4gICAgICAgIHVybDogcmVxdWVzdC51cmxXaXRoUGFyYW1zLFxuICAgICAgICBoZWFkZXJzOiBlcnJvci5oZWFkZXJzLFxuICAgICAgfSkpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGhlYWRlcnMgPSBuZXcgSHR0cEhlYWRlcnMocmVzcG9uc2UuaGVhZGVycyk7XG4gICAgY29uc3Qgc3RhdHVzVGV4dCA9IHJlc3BvbnNlLnN0YXR1c1RleHQ7XG4gICAgY29uc3QgdXJsID0gZ2V0UmVzcG9uc2VVcmwocmVzcG9uc2UpID8/IHJlcXVlc3QudXJsV2l0aFBhcmFtcztcblxuICAgIGxldCBzdGF0dXMgPSByZXNwb25zZS5zdGF0dXM7XG4gICAgbGV0IGJvZHk6IHN0cmluZ3xBcnJheUJ1ZmZlcnxCbG9ifG9iamVjdHxudWxsID0gbnVsbDtcblxuICAgIGlmIChyZXF1ZXN0LnJlcG9ydFByb2dyZXNzKSB7XG4gICAgICBvYnNlcnZlci5uZXh0KG5ldyBIdHRwSGVhZGVyUmVzcG9uc2Uoe2hlYWRlcnMsIHN0YXR1cywgc3RhdHVzVGV4dCwgdXJsfSkpO1xuICAgIH1cblxuICAgIGlmIChyZXNwb25zZS5ib2R5KSB7XG4gICAgICAvLyBSZWFkIFByb2dyZXNzXG4gICAgICBjb25zdCBjb250ZW50TGVuZ3RoID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ2NvbnRlbnQtbGVuZ3RoJyk7XG4gICAgICBjb25zdCBjaHVua3M6IFVpbnQ4QXJyYXlbXSA9IFtdO1xuICAgICAgY29uc3QgcmVhZGVyID0gcmVzcG9uc2UuYm9keS5nZXRSZWFkZXIoKTtcbiAgICAgIGxldCByZWNlaXZlZExlbmd0aCA9IDA7XG5cbiAgICAgIGxldCBkZWNvZGVyOiBUZXh0RGVjb2RlcjtcbiAgICAgIGxldCBwYXJ0aWFsVGV4dDogc3RyaW5nfHVuZGVmaW5lZDtcblxuICAgICAgLy8gV2UgaGF2ZSB0byBjaGVjayB3aGV0aGVyIHRoZSBab25lIGlzIGRlZmluZWQgaW4gdGhlIGdsb2JhbCBzY29wZSBiZWNhdXNlIHRoaXMgbWF5IGJlIGNhbGxlZFxuICAgICAgLy8gd2hlbiB0aGUgem9uZSBpcyBub29wZWQuXG4gICAgICBjb25zdCByZXFab25lID0gdHlwZW9mIFpvbmUgIT09ICd1bmRlZmluZWQnICYmIFpvbmUuY3VycmVudDtcblxuICAgICAgLy8gUGVyZm9ybSByZXNwb25zZSBwcm9jZXNzaW5nIG91dHNpZGUgb2YgQW5ndWxhciB6b25lIHRvXG4gICAgICAvLyBlbnN1cmUgbm8gZXhjZXNzaXZlIGNoYW5nZSBkZXRlY3Rpb24gcnVucyBhcmUgZXhlY3V0ZWRcbiAgICAgIC8vIEhlcmUgY2FsbGluZyB0aGUgYXN5bmMgUmVhZGFibGVTdHJlYW1EZWZhdWx0UmVhZGVyLnJlYWQoKSBpcyByZXNwb25zaWJsZSBmb3IgdHJpZ2dlcmluZyBDRFxuICAgICAgYXdhaXQgdGhpcy5uZ1pvbmUucnVuT3V0c2lkZUFuZ3VsYXIoYXN5bmMgKCkgPT4ge1xuICAgICAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgICAgIGNvbnN0IHtkb25lLCB2YWx1ZX0gPSBhd2FpdCByZWFkZXIucmVhZCgpO1xuXG4gICAgICAgICAgaWYgKGRvbmUpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNodW5rcy5wdXNoKHZhbHVlKTtcbiAgICAgICAgICByZWNlaXZlZExlbmd0aCArPSB2YWx1ZS5sZW5ndGg7XG5cbiAgICAgICAgICBpZiAocmVxdWVzdC5yZXBvcnRQcm9ncmVzcykge1xuICAgICAgICAgICAgcGFydGlhbFRleHQgPSByZXF1ZXN0LnJlc3BvbnNlVHlwZSA9PT0gJ3RleHQnID9cbiAgICAgICAgICAgICAgICAocGFydGlhbFRleHQgPz8gJycpICsgKGRlY29kZXIgPz89IG5ldyBUZXh0RGVjb2RlcikuZGVjb2RlKHZhbHVlLCB7c3RyZWFtOiB0cnVlfSkgOlxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZDtcblxuICAgICAgICAgICAgY29uc3QgcmVwb3J0UHJvZ3Jlc3MgPSAoKSA9PiBvYnNlcnZlci5uZXh0KHtcbiAgICAgICAgICAgICAgdHlwZTogSHR0cEV2ZW50VHlwZS5Eb3dubG9hZFByb2dyZXNzLFxuICAgICAgICAgICAgICB0b3RhbDogY29udGVudExlbmd0aCA/ICtjb250ZW50TGVuZ3RoIDogdW5kZWZpbmVkLFxuICAgICAgICAgICAgICBsb2FkZWQ6IHJlY2VpdmVkTGVuZ3RoLFxuICAgICAgICAgICAgICBwYXJ0aWFsVGV4dCxcbiAgICAgICAgICAgIH0gYXMgSHR0cERvd25sb2FkUHJvZ3Jlc3NFdmVudCk7XG4gICAgICAgICAgICByZXFab25lID8gcmVxWm9uZS5ydW4ocmVwb3J0UHJvZ3Jlc3MpIDogcmVwb3J0UHJvZ3Jlc3MoKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgICAvLyBDb21iaW5lIGFsbCBjaHVua3MuXG4gICAgICBjb25zdCBjaHVua3NBbGwgPSB0aGlzLmNvbmNhdENodW5rcyhjaHVua3MsIHJlY2VpdmVkTGVuZ3RoKTtcbiAgICAgIHRyeSB7XG4gICAgICAgIGNvbnN0IGNvbnRlbnRUeXBlID0gcmVzcG9uc2UuaGVhZGVycy5nZXQoJ0NvbnRlbnQtVHlwZScpID8/ICcnO1xuICAgICAgICBib2R5ID0gdGhpcy5wYXJzZUJvZHkocmVxdWVzdCwgY2h1bmtzQWxsLCBjb250ZW50VHlwZSk7XG4gICAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgICAvLyBCb2R5IGxvYWRpbmcgb3IgcGFyc2luZyBmYWlsZWRcbiAgICAgICAgb2JzZXJ2ZXIuZXJyb3IobmV3IEh0dHBFcnJvclJlc3BvbnNlKHtcbiAgICAgICAgICBlcnJvcixcbiAgICAgICAgICBoZWFkZXJzOiBuZXcgSHR0cEhlYWRlcnMocmVzcG9uc2UuaGVhZGVycyksXG4gICAgICAgICAgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMsXG4gICAgICAgICAgc3RhdHVzVGV4dDogcmVzcG9uc2Uuc3RhdHVzVGV4dCxcbiAgICAgICAgICB1cmw6IGdldFJlc3BvbnNlVXJsKHJlc3BvbnNlKSA/PyByZXF1ZXN0LnVybFdpdGhQYXJhbXMsXG4gICAgICAgIH0pKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFNhbWUgYmVoYXZpb3IgYXMgdGhlIFhockJhY2tlbmRcbiAgICBpZiAoc3RhdHVzID09PSAwKSB7XG4gICAgICBzdGF0dXMgPSBib2R5ID8gSHR0cFN0YXR1c0NvZGUuT2sgOiAwO1xuICAgIH1cblxuICAgIC8vIG9rIGRldGVybWluZXMgd2hldGhlciB0aGUgcmVzcG9uc2Ugd2lsbCBiZSB0cmFuc21pdHRlZCBvbiB0aGUgZXZlbnQgb3JcbiAgICAvLyBlcnJvciBjaGFubmVsLiBVbnN1Y2Nlc3NmdWwgc3RhdHVzIGNvZGVzIChub3QgMnh4KSB3aWxsIGFsd2F5cyBiZSBlcnJvcnMsXG4gICAgLy8gYnV0IGEgc3VjY2Vzc2Z1bCBzdGF0dXMgY29kZSBjYW4gc3RpbGwgcmVzdWx0IGluIGFuIGVycm9yIGlmIHRoZSB1c2VyXG4gICAgLy8gYXNrZWQgZm9yIEpTT04gZGF0YSBhbmQgdGhlIGJvZHkgY2Fubm90IGJlIHBhcnNlZCBhcyBzdWNoLlxuICAgIGNvbnN0IG9rID0gc3RhdHVzID49IDIwMCAmJiBzdGF0dXMgPCAzMDA7XG5cbiAgICBpZiAob2spIHtcbiAgICAgIG9ic2VydmVyLm5leHQobmV3IEh0dHBSZXNwb25zZSh7XG4gICAgICAgIGJvZHksXG4gICAgICAgIGhlYWRlcnMsXG4gICAgICAgIHN0YXR1cyxcbiAgICAgICAgc3RhdHVzVGV4dCxcbiAgICAgICAgdXJsLFxuICAgICAgfSkpO1xuXG4gICAgICAvLyBUaGUgZnVsbCBib2R5IGhhcyBiZWVuIHJlY2VpdmVkIGFuZCBkZWxpdmVyZWQsIG5vIGZ1cnRoZXIgZXZlbnRzXG4gICAgICAvLyBhcmUgcG9zc2libGUuIFRoaXMgcmVxdWVzdCBpcyBjb21wbGV0ZS5cbiAgICAgIG9ic2VydmVyLmNvbXBsZXRlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG9ic2VydmVyLmVycm9yKG5ldyBIdHRwRXJyb3JSZXNwb25zZSh7XG4gICAgICAgIGVycm9yOiBib2R5LFxuICAgICAgICBoZWFkZXJzLFxuICAgICAgICBzdGF0dXMsXG4gICAgICAgIHN0YXR1c1RleHQsXG4gICAgICAgIHVybCxcbiAgICAgIH0pKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIHBhcnNlQm9keShyZXF1ZXN0OiBIdHRwUmVxdWVzdDxhbnk+LCBiaW5Db250ZW50OiBVaW50OEFycmF5LCBjb250ZW50VHlwZTogc3RyaW5nKTogc3RyaW5nXG4gICAgICB8QXJyYXlCdWZmZXJ8QmxvYnxvYmplY3R8bnVsbCB7XG4gICAgc3dpdGNoIChyZXF1ZXN0LnJlc3BvbnNlVHlwZSkge1xuICAgICAgY2FzZSAnanNvbic6XG4gICAgICAgIC8vIHN0cmlwcGluZyB0aGUgWFNTSSB3aGVuIHByZXNlbnRcbiAgICAgICAgY29uc3QgdGV4dCA9IG5ldyBUZXh0RGVjb2RlcigpLmRlY29kZShiaW5Db250ZW50KS5yZXBsYWNlKFhTU0lfUFJFRklYLCAnJyk7XG4gICAgICAgIHJldHVybiB0ZXh0ID09PSAnJyA/IG51bGwgOiBKU09OLnBhcnNlKHRleHQpIGFzIG9iamVjdDtcbiAgICAgIGNhc2UgJ3RleHQnOlxuICAgICAgICByZXR1cm4gbmV3IFRleHREZWNvZGVyKCkuZGVjb2RlKGJpbkNvbnRlbnQpO1xuICAgICAgY2FzZSAnYmxvYic6XG4gICAgICAgIHJldHVybiBuZXcgQmxvYihbYmluQ29udGVudF0sIHt0eXBlOiBjb250ZW50VHlwZX0pO1xuICAgICAgY2FzZSAnYXJyYXlidWZmZXInOlxuICAgICAgICByZXR1cm4gYmluQ29udGVudC5idWZmZXI7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBjcmVhdGVSZXF1ZXN0SW5pdChyZXE6IEh0dHBSZXF1ZXN0PGFueT4pOiBSZXF1ZXN0SW5pdCB7XG4gICAgLy8gV2UgY291bGQgc2hhcmUgc29tZSBvZiB0aGlzIGxvZ2ljIHdpdGggdGhlIFhockJhY2tlbmRcblxuICAgIGNvbnN0IGhlYWRlcnM6IFJlY29yZDxzdHJpbmcsIHN0cmluZz4gPSB7fTtcbiAgICBjb25zdCBjcmVkZW50aWFsczogUmVxdWVzdENyZWRlbnRpYWxzfHVuZGVmaW5lZCA9IHJlcS53aXRoQ3JlZGVudGlhbHMgPyAnaW5jbHVkZScgOiB1bmRlZmluZWQ7XG5cbiAgICAvLyBTZXR0aW5nIGFsbCB0aGUgcmVxdWVzdGVkIGhlYWRlcnMuXG4gICAgcmVxLmhlYWRlcnMuZm9yRWFjaCgobmFtZSwgdmFsdWVzKSA9PiAoaGVhZGVyc1tuYW1lXSA9IHZhbHVlcy5qb2luKCcsJykpKTtcblxuICAgIC8vIEFkZCBhbiBBY2NlcHQgaGVhZGVyIGlmIG9uZSBpc24ndCBwcmVzZW50IGFscmVhZHkuXG4gICAgaGVhZGVyc1snQWNjZXB0J10gPz89ICdhcHBsaWNhdGlvbi9qc29uLCB0ZXh0L3BsYWluLCAqLyonO1xuXG4gICAgLy8gQXV0by1kZXRlY3QgdGhlIENvbnRlbnQtVHlwZSBoZWFkZXIgaWYgb25lIGlzbid0IHByZXNlbnQgYWxyZWFkeS5cbiAgICBpZiAoIWhlYWRlcnNbJ0NvbnRlbnQtVHlwZSddKSB7XG4gICAgICBjb25zdCBkZXRlY3RlZFR5cGUgPSByZXEuZGV0ZWN0Q29udGVudFR5cGVIZWFkZXIoKTtcbiAgICAgIC8vIFNvbWV0aW1lcyBDb250ZW50LVR5cGUgZGV0ZWN0aW9uIGZhaWxzLlxuICAgICAgaWYgKGRldGVjdGVkVHlwZSAhPT0gbnVsbCkge1xuICAgICAgICBoZWFkZXJzWydDb250ZW50LVR5cGUnXSA9IGRldGVjdGVkVHlwZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgYm9keTogcmVxLnNlcmlhbGl6ZUJvZHkoKSxcbiAgICAgIG1ldGhvZDogcmVxLm1ldGhvZCxcbiAgICAgIGhlYWRlcnMsXG4gICAgICBjcmVkZW50aWFscyxcbiAgICB9O1xuICB9XG5cbiAgcHJpdmF0ZSBjb25jYXRDaHVua3MoY2h1bmtzOiBVaW50OEFycmF5W10sIHRvdGFsTGVuZ3RoOiBudW1iZXIpOiBVaW50OEFycmF5IHtcbiAgICBjb25zdCBjaHVua3NBbGwgPSBuZXcgVWludDhBcnJheSh0b3RhbExlbmd0aCk7XG4gICAgbGV0IHBvc2l0aW9uID0gMDtcbiAgICBmb3IgKGNvbnN0IGNodW5rIG9mIGNodW5rcykge1xuICAgICAgY2h1bmtzQWxsLnNldChjaHVuaywgcG9zaXRpb24pO1xuICAgICAgcG9zaXRpb24gKz0gY2h1bmsubGVuZ3RoO1xuICAgIH1cblxuICAgIHJldHVybiBjaHVua3NBbGw7XG4gIH1cbn1cblxuLyoqXG4gKiBBYnN0cmFjdCBjbGFzcyB0byBwcm92aWRlIGEgbW9ja2VkIGltcGxlbWVudGF0aW9uIG9mIGBmZXRjaCgpYFxuICovXG5leHBvcnQgYWJzdHJhY3QgY2xhc3MgRmV0Y2hGYWN0b3J5IHtcbiAgYWJzdHJhY3QgZmV0Y2g6IHR5cGVvZiBmZXRjaDtcbn1cblxuZnVuY3Rpb24gbm9vcCgpOiB2b2lkIHt9XG5cbi8qKlxuICogWm9uZS5qcyB0cmVhdHMgYSByZWplY3RlZCBwcm9taXNlIHRoYXQgaGFzIG5vdCB5ZXQgYmVlbiBhd2FpdGVkXG4gKiBhcyBhbiB1bmhhbmRsZWQgZXJyb3IuIFRoaXMgZnVuY3Rpb24gYWRkcyBhIG5vb3AgYC50aGVuYCB0byBtYWtlXG4gKiBzdXJlIHRoYXQgWm9uZS5qcyBkb2Vzbid0IHRocm93IGFuIGVycm9yIGlmIHRoZSBQcm9taXNlIGlzIHJlamVjdGVkXG4gKiBzeW5jaHJvbm91c2x5LlxuICovXG5mdW5jdGlvbiBzaWxlbmNlU3VwZXJmbHVvdXNVbmhhbmRsZWRQcm9taXNlUmVqZWN0aW9uKHByb21pc2U6IFByb21pc2U8dW5rbm93bj4pIHtcbiAgcHJvbWlzZS50aGVuKG5vb3AsIG5vb3ApO1xufVxuIl19