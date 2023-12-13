/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
// Prevents deletion of `Event` from `globalThis` during module loading.
const Event = globalThis.Event;
/**
 * Fake implementation of user agent history and navigation behavior. This is a
 * high-fidelity implementation of browser behavior that attempts to emulate
 * things like traversal delay.
 */
export class FakeNavigation {
    /** Equivalent to `navigation.currentEntry`. */
    get currentEntry() {
        return this.entriesArr[this.currentEntryIndex];
    }
    get canGoBack() {
        return this.currentEntryIndex > 0;
    }
    get canGoForward() {
        return this.currentEntryIndex < this.entriesArr.length - 1;
    }
    constructor(window, baseURI) {
        this.window = window;
        this.baseURI = baseURI;
        /**
         * The fake implementation of an entries array. Only same-document entries
         * allowed.
         */
        this.entriesArr = [];
        /**
         * The current active entry index into `entriesArr`.
         */
        this.currentEntryIndex = 0;
        /**
         * The current navigate event.
         */
        this.navigateEvent = undefined;
        /**
         * A Map of pending traversals, so that traversals to the same entry can be
         * re-used.
         */
        this.traversalQueue = new Map();
        /**
         * A Promise that resolves when the previous traversals have finished. Used to
         * simulate the cross-process communication necessary for traversals.
         */
        this.nextTraversal = Promise.resolve();
        /**
         * A prospective current active entry index, which includes unresolved
         * traversals. Used by `go` to determine where navigations are intended to go.
         */
        this.prospectiveEntryIndex = 0;
        /**
         * A test-only option to make traversals synchronous, rather than emulate
         * cross-process communication.
         */
        this.synchronousTraversals = false;
        /** Whether to allow a call to setInitialEntryForTesting. */
        this.canSetInitialEntry = true;
        /** `EventTarget` to dispatch events. */
        this.eventTarget = this.window.document.createElement('div');
        /** The next unique id for created entries. Replace recreates this id. */
        this.nextId = 0;
        /** The next unique key for created entries. Replace inherits this id. */
        this.nextKey = 0;
        /** Whether this fake is disposed. */
        this.disposed = false;
        // First entry.
        this.setInitialEntryForTesting('.');
    }
    /**
     * Sets the initial entry.
     */
    setInitialEntryForTesting(url, options = { historyState: null }) {
        if (!this.canSetInitialEntry) {
            throw new Error('setInitialEntryForTesting can only be called before any ' +
                'navigation has occurred');
        }
        const currentInitialEntry = this.entriesArr[0];
        this.entriesArr[0] = new FakeNavigationHistoryEntry(options.absoluteUrl ? url : new URL(url, this.baseURI).toString(), {
            index: 0,
            key: currentInitialEntry?.key ?? String(this.nextKey++),
            id: currentInitialEntry?.id ?? String(this.nextId++),
            sameDocument: true,
            historyState: options?.historyState,
            state: options.state,
        });
    }
    /** Returns whether the initial entry is still eligible to be set. */
    canSetInitialEntryForTesting() {
        return this.canSetInitialEntry;
    }
    /**
     * Sets whether to emulate traversals as synchronous rather than
     * asynchronous.
     */
    setSynchronousTraversalsForTesting(synchronousTraversals) {
        this.synchronousTraversals = synchronousTraversals;
    }
    /** Equivalent to `navigation.entries()`. */
    entries() {
        return this.entriesArr.slice();
    }
    /** Equivalent to `navigation.navigate()`. */
    navigate(url, options) {
        const fromUrl = new URL(this.currentEntry.url, this.baseURI);
        const toUrl = new URL(url, this.baseURI);
        let navigationType;
        if (!options?.history || options.history === 'auto') {
            // Auto defaults to push, but if the URLs are the same, is a replace.
            if (fromUrl.toString() === toUrl.toString()) {
                navigationType = 'replace';
            }
            else {
                navigationType = 'push';
            }
        }
        else {
            navigationType = options.history;
        }
        const hashChange = isHashChange(fromUrl, toUrl);
        const destination = new FakeNavigationDestination({
            url: toUrl.toString(),
            state: options?.state,
            sameDocument: hashChange,
            historyState: null,
        });
        const result = new InternalNavigationResult();
        this.userAgentNavigate(destination, result, {
            navigationType,
            cancelable: true,
            canIntercept: true,
            // Always false for navigate().
            userInitiated: false,
            hashChange,
            info: options?.info,
        });
        return {
            committed: result.committed,
            finished: result.finished,
        };
    }
    /** Equivalent to `history.pushState()`. */
    pushState(data, title, url) {
        this.pushOrReplaceState('push', data, title, url);
    }
    /** Equivalent to `history.replaceState()`. */
    replaceState(data, title, url) {
        this.pushOrReplaceState('replace', data, title, url);
    }
    pushOrReplaceState(navigationType, data, _title, url) {
        const fromUrl = new URL(this.currentEntry.url, this.baseURI);
        const toUrl = url ? new URL(url, this.baseURI) : fromUrl;
        const hashChange = isHashChange(fromUrl, toUrl);
        const destination = new FakeNavigationDestination({
            url: toUrl.toString(),
            sameDocument: true,
            historyState: data,
        });
        const result = new InternalNavigationResult();
        this.userAgentNavigate(destination, result, {
            navigationType,
            cancelable: true,
            canIntercept: true,
            // Always false for pushState() or replaceState().
            userInitiated: false,
            hashChange,
            skipPopState: true,
        });
    }
    /** Equivalent to `navigation.traverseTo()`. */
    traverseTo(key, options) {
        const fromUrl = new URL(this.currentEntry.url, this.baseURI);
        const entry = this.findEntry(key);
        if (!entry) {
            const domException = new DOMException('Invalid key', 'InvalidStateError');
            const committed = Promise.reject(domException);
            const finished = Promise.reject(domException);
            committed.catch(() => { });
            finished.catch(() => { });
            return {
                committed,
                finished,
            };
        }
        if (entry === this.currentEntry) {
            return {
                committed: Promise.resolve(this.currentEntry),
                finished: Promise.resolve(this.currentEntry),
            };
        }
        if (this.traversalQueue.has(entry.key)) {
            const existingResult = this.traversalQueue.get(entry.key);
            return {
                committed: existingResult.committed,
                finished: existingResult.finished,
            };
        }
        const hashChange = isHashChange(fromUrl, new URL(entry.url, this.baseURI));
        const destination = new FakeNavigationDestination({
            url: entry.url,
            state: entry.getState(),
            historyState: entry.getHistoryState(),
            key: entry.key,
            id: entry.id,
            index: entry.index,
            sameDocument: entry.sameDocument,
        });
        this.prospectiveEntryIndex = entry.index;
        const result = new InternalNavigationResult();
        this.traversalQueue.set(entry.key, result);
        this.runTraversal(() => {
            this.traversalQueue.delete(entry.key);
            this.userAgentNavigate(destination, result, {
                navigationType: 'traverse',
                cancelable: true,
                canIntercept: true,
                // Always false for traverseTo().
                userInitiated: false,
                hashChange,
                info: options?.info,
            });
        });
        return {
            committed: result.committed,
            finished: result.finished,
        };
    }
    /** Equivalent to `navigation.back()`. */
    back(options) {
        if (this.currentEntryIndex === 0) {
            const domException = new DOMException('Cannot go back', 'InvalidStateError');
            const committed = Promise.reject(domException);
            const finished = Promise.reject(domException);
            committed.catch(() => { });
            finished.catch(() => { });
            return {
                committed,
                finished,
            };
        }
        const entry = this.entriesArr[this.currentEntryIndex - 1];
        return this.traverseTo(entry.key, options);
    }
    /** Equivalent to `navigation.forward()`. */
    forward(options) {
        if (this.currentEntryIndex === this.entriesArr.length - 1) {
            const domException = new DOMException('Cannot go forward', 'InvalidStateError');
            const committed = Promise.reject(domException);
            const finished = Promise.reject(domException);
            committed.catch(() => { });
            finished.catch(() => { });
            return {
                committed,
                finished,
            };
        }
        const entry = this.entriesArr[this.currentEntryIndex + 1];
        return this.traverseTo(entry.key, options);
    }
    /**
     * Equivalent to `history.go()`.
     * Note that this method does not actually work precisely to how Chrome
     * does, instead choosing a simpler model with less unexpected behavior.
     * Chrome has a few edge case optimizations, for instance with repeated
     * `back(); forward()` chains it collapses certain traversals.
     */
    go(direction) {
        const targetIndex = this.prospectiveEntryIndex + direction;
        if (targetIndex >= this.entriesArr.length || targetIndex < 0) {
            return;
        }
        this.prospectiveEntryIndex = targetIndex;
        this.runTraversal(() => {
            // Check again that destination is in the entries array.
            if (targetIndex >= this.entriesArr.length || targetIndex < 0) {
                return;
            }
            const fromUrl = new URL(this.currentEntry.url, this.baseURI);
            const entry = this.entriesArr[targetIndex];
            const hashChange = isHashChange(fromUrl, new URL(entry.url, this.baseURI));
            const destination = new FakeNavigationDestination({
                url: entry.url,
                state: entry.getState(),
                historyState: entry.getHistoryState(),
                key: entry.key,
                id: entry.id,
                index: entry.index,
                sameDocument: entry.sameDocument,
            });
            const result = new InternalNavigationResult();
            this.userAgentNavigate(destination, result, {
                navigationType: 'traverse',
                cancelable: true,
                canIntercept: true,
                // Always false for go().
                userInitiated: false,
                hashChange,
            });
        });
    }
    /** Runs a traversal synchronously or asynchronously */
    runTraversal(traversal) {
        if (this.synchronousTraversals) {
            traversal();
            return;
        }
        // Each traversal occupies a single timeout resolution.
        // This means that Promises added to commit and finish should resolve
        // before the next traversal.
        this.nextTraversal = this.nextTraversal.then(() => {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve();
                    traversal();
                });
            });
        });
    }
    /** Equivalent to `navigation.addEventListener()`. */
    addEventListener(type, callback, options) {
        this.eventTarget.addEventListener(type, callback, options);
    }
    /** Equivalent to `navigation.removeEventListener()`. */
    removeEventListener(type, callback, options) {
        this.eventTarget.removeEventListener(type, callback, options);
    }
    /** Equivalent to `navigation.dispatchEvent()` */
    dispatchEvent(event) {
        return this.eventTarget.dispatchEvent(event);
    }
    /** Cleans up resources. */
    dispose() {
        // Recreate eventTarget to release current listeners.
        // `document.createElement` because NodeJS `EventTarget` is incompatible with Domino's `Event`.
        this.eventTarget = this.window.document.createElement('div');
        this.disposed = true;
    }
    /** Returns whether this fake is disposed. */
    isDisposed() {
        return this.disposed;
    }
    /** Implementation for all navigations and traversals. */
    userAgentNavigate(destination, result, options) {
        // The first navigation should disallow any future calls to set the initial
        // entry.
        this.canSetInitialEntry = false;
        if (this.navigateEvent) {
            this.navigateEvent.cancel(new DOMException('Navigation was aborted', 'AbortError'));
            this.navigateEvent = undefined;
        }
        const navigateEvent = createFakeNavigateEvent({
            navigationType: options.navigationType,
            cancelable: options.cancelable,
            canIntercept: options.canIntercept,
            userInitiated: options.userInitiated,
            hashChange: options.hashChange,
            signal: result.signal,
            destination,
            info: options.info,
            sameDocument: destination.sameDocument,
            skipPopState: options.skipPopState,
            result,
            userAgentCommit: () => {
                this.userAgentCommit();
            },
        });
        this.navigateEvent = navigateEvent;
        this.eventTarget.dispatchEvent(navigateEvent);
        navigateEvent.dispatchedNavigateEvent();
        if (navigateEvent.commitOption === 'immediate') {
            navigateEvent.commit(/* internal= */ true);
        }
    }
    /** Implementation to commit a navigation. */
    userAgentCommit() {
        if (!this.navigateEvent) {
            return;
        }
        const from = this.currentEntry;
        if (!this.navigateEvent.sameDocument) {
            const error = new Error('Cannot navigate to a non-same-document URL.');
            this.navigateEvent.cancel(error);
            throw error;
        }
        if (this.navigateEvent.navigationType === 'push' ||
            this.navigateEvent.navigationType === 'replace') {
            this.userAgentPushOrReplace(this.navigateEvent.destination, {
                navigationType: this.navigateEvent.navigationType,
            });
        }
        else if (this.navigateEvent.navigationType === 'traverse') {
            this.userAgentTraverse(this.navigateEvent.destination);
        }
        this.navigateEvent.userAgentNavigated(this.currentEntry);
        const currentEntryChangeEvent = createFakeNavigationCurrentEntryChangeEvent({ from, navigationType: this.navigateEvent.navigationType });
        this.eventTarget.dispatchEvent(currentEntryChangeEvent);
        if (!this.navigateEvent.skipPopState) {
            const popStateEvent = createPopStateEvent({
                state: this.navigateEvent.destination.getHistoryState(),
            });
            this.window.dispatchEvent(popStateEvent);
        }
    }
    /** Implementation for a push or replace navigation. */
    userAgentPushOrReplace(destination, { navigationType }) {
        if (navigationType === 'push') {
            this.currentEntryIndex++;
            this.prospectiveEntryIndex = this.currentEntryIndex;
        }
        const index = this.currentEntryIndex;
        const key = navigationType === 'push' ? String(this.nextKey++) : this.currentEntry.key;
        const entry = new FakeNavigationHistoryEntry(destination.url, {
            id: String(this.nextId++),
            key,
            index,
            sameDocument: true,
            state: destination.getState(),
            historyState: destination.getHistoryState(),
        });
        if (navigationType === 'push') {
            this.entriesArr.splice(index, Infinity, entry);
        }
        else {
            this.entriesArr[index] = entry;
        }
    }
    /** Implementation for a traverse navigation. */
    userAgentTraverse(destination) {
        this.currentEntryIndex = destination.index;
    }
    /** Utility method for finding entries with the given `key`. */
    findEntry(key) {
        for (const entry of this.entriesArr) {
            if (entry.key === key)
                return entry;
        }
        return undefined;
    }
    set onnavigate(_handler) {
        throw new Error('unimplemented');
    }
    get onnavigate() {
        throw new Error('unimplemented');
    }
    set oncurrententrychange(_handler) {
        throw new Error('unimplemented');
    }
    get oncurrententrychange() {
        throw new Error('unimplemented');
    }
    set onnavigatesuccess(_handler) {
        throw new Error('unimplemented');
    }
    get onnavigatesuccess() {
        throw new Error('unimplemented');
    }
    set onnavigateerror(_handler) {
        throw new Error('unimplemented');
    }
    get onnavigateerror() {
        throw new Error('unimplemented');
    }
    get transition() {
        throw new Error('unimplemented');
    }
    updateCurrentEntry(_options) {
        throw new Error('unimplemented');
    }
    reload(_options) {
        throw new Error('unimplemented');
    }
}
/**
 * Fake equivalent of `NavigationHistoryEntry`.
 */
export class FakeNavigationHistoryEntry {
    constructor(url, { id, key, index, sameDocument, state, historyState, }) {
        this.url = url;
        // tslint:disable-next-line:no-any
        this.ondispose = null;
        this.id = id;
        this.key = key;
        this.index = index;
        this.sameDocument = sameDocument;
        this.state = state;
        this.historyState = historyState;
    }
    getState() {
        // Budget copy.
        return this.state ? JSON.parse(JSON.stringify(this.state)) : this.state;
    }
    getHistoryState() {
        // Budget copy.
        return this.historyState ? JSON.parse(JSON.stringify(this.historyState)) : this.historyState;
    }
    addEventListener(type, callback, options) {
        throw new Error('unimplemented');
    }
    removeEventListener(type, callback, options) {
        throw new Error('unimplemented');
    }
    dispatchEvent(event) {
        throw new Error('unimplemented');
    }
}
/**
 * Create a fake equivalent of `NavigateEvent`. This is not a class because ES5
 * transpiled JavaScript cannot extend native Event.
 */
function createFakeNavigateEvent({ cancelable, canIntercept, userInitiated, hashChange, navigationType, signal, destination, info, sameDocument, skipPopState, result, userAgentCommit, }) {
    const event = new Event('navigate', { bubbles: false, cancelable });
    event.canIntercept = canIntercept;
    event.userInitiated = userInitiated;
    event.hashChange = hashChange;
    event.navigationType = navigationType;
    event.signal = signal;
    event.destination = destination;
    event.info = info;
    event.downloadRequest = null;
    event.formData = null;
    event.sameDocument = sameDocument;
    event.skipPopState = skipPopState;
    event.commitOption = 'immediate';
    let handlerFinished = undefined;
    let interceptCalled = false;
    let dispatchedNavigateEvent = false;
    let commitCalled = false;
    event.intercept = function (options) {
        interceptCalled = true;
        event.sameDocument = true;
        const handler = options?.handler;
        if (handler) {
            handlerFinished = handler();
        }
        if (options?.commit) {
            event.commitOption = options.commit;
        }
        if (options?.focusReset !== undefined || options?.scroll !== undefined) {
            throw new Error('unimplemented');
        }
    };
    event.scroll = function () {
        throw new Error('unimplemented');
    };
    event.commit = function (internal = false) {
        if (!internal && !interceptCalled) {
            throw new DOMException(`Failed to execute 'commit' on 'NavigateEvent': intercept() must be ` +
                `called before commit().`, 'InvalidStateError');
        }
        if (!dispatchedNavigateEvent) {
            throw new DOMException(`Failed to execute 'commit' on 'NavigateEvent': commit() may not be ` +
                `called during event dispatch.`, 'InvalidStateError');
        }
        if (commitCalled) {
            throw new DOMException(`Failed to execute 'commit' on 'NavigateEvent': commit() already ` +
                `called.`, 'InvalidStateError');
        }
        commitCalled = true;
        userAgentCommit();
    };
    // Internal only.
    event.cancel = function (reason) {
        result.committedReject(reason);
        result.finishedReject(reason);
    };
    // Internal only.
    event.dispatchedNavigateEvent = function () {
        dispatchedNavigateEvent = true;
        if (event.commitOption === 'after-transition') {
            // If handler finishes before commit, call commit.
            handlerFinished?.then(() => {
                if (!commitCalled) {
                    event.commit(/* internal */ true);
                }
            }, () => { });
        }
        Promise.all([result.committed, handlerFinished])
            .then(([entry]) => {
            result.finishedResolve(entry);
        }, (reason) => {
            result.finishedReject(reason);
        });
    };
    // Internal only.
    event.userAgentNavigated = function (entry) {
        result.committedResolve(entry);
    };
    return event;
}
/**
 * Create a fake equivalent of `NavigationCurrentEntryChange`. This does not use
 * a class because ES5 transpiled JavaScript cannot extend native Event.
 */
function createFakeNavigationCurrentEntryChangeEvent({ from, navigationType, }) {
    const event = new Event('currententrychange', {
        bubbles: false,
        cancelable: false,
    });
    event.from = from;
    event.navigationType = navigationType;
    return event;
}
/**
 * Create a fake equivalent of `PopStateEvent`. This does not use a class
 * because ES5 transpiled JavaScript cannot extend native Event.
 */
function createPopStateEvent({ state }) {
    const event = new Event('popstate', {
        bubbles: false,
        cancelable: false,
    });
    event.state = state;
    return event;
}
/**
 * Fake equivalent of `NavigationDestination`.
 */
export class FakeNavigationDestination {
    constructor({ url, sameDocument, historyState, state, key = null, id = null, index = -1, }) {
        this.url = url;
        this.sameDocument = sameDocument;
        this.state = state;
        this.historyState = historyState;
        this.key = key;
        this.id = id;
        this.index = index;
    }
    getState() {
        return this.state;
    }
    getHistoryState() {
        return this.historyState;
    }
}
/** Utility function to determine whether two UrlLike have the same hash. */
function isHashChange(from, to) {
    return (to.hash !== from.hash && to.hostname === from.hostname && to.pathname === from.pathname &&
        to.search === from.search);
}
/** Internal utility class for representing the result of a navigation.  */
class InternalNavigationResult {
    get signal() {
        return this.abortController.signal;
    }
    constructor() {
        this.abortController = new AbortController();
        this.committed = new Promise((resolve, reject) => {
            this.committedResolve = resolve;
            this.committedReject = reject;
        });
        this.finished = new Promise(async (resolve, reject) => {
            this.finishedResolve = resolve;
            this.finishedReject = (reason) => {
                reject(reason);
                this.abortController.abort(reason);
            };
        });
        // All rejections are handled.
        this.committed.catch(() => { });
        this.finished.catch(() => { });
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZmFrZV9uYXZpZ2F0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tbW9uL3Rlc3Rpbmcvc3JjL25hdmlnYXRpb24vZmFrZV9uYXZpZ2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILHdFQUF3RTtBQUN4RSxNQUFNLEtBQUssR0FBRyxVQUFVLENBQUMsS0FBSyxDQUFDO0FBRS9COzs7O0dBSUc7QUFDSCxNQUFNLE9BQU8sY0FBYztJQXdEekIsK0NBQStDO0lBQy9DLElBQUksWUFBWTtRQUNkLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNqRCxDQUFDO0lBRUQsSUFBSSxTQUFTO1FBQ1gsT0FBTyxJQUFJLENBQUMsaUJBQWlCLEdBQUcsQ0FBQyxDQUFDO0lBQ3BDLENBQUM7SUFFRCxJQUFJLFlBQVk7UUFDZCxPQUFPLElBQUksQ0FBQyxpQkFBaUIsR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUM7SUFDN0QsQ0FBQztJQUVELFlBQTZCLE1BQWMsRUFBbUIsT0FBZTtRQUFoRCxXQUFNLEdBQU4sTUFBTSxDQUFRO1FBQW1CLFlBQU8sR0FBUCxPQUFPLENBQVE7UUFwRTdFOzs7V0FHRztRQUNjLGVBQVUsR0FBaUMsRUFBRSxDQUFDO1FBRS9EOztXQUVHO1FBQ0ssc0JBQWlCLEdBQUcsQ0FBQyxDQUFDO1FBRTlCOztXQUVHO1FBQ0ssa0JBQWEsR0FBd0MsU0FBUyxDQUFDO1FBRXZFOzs7V0FHRztRQUNjLG1CQUFjLEdBQUcsSUFBSSxHQUFHLEVBQW9DLENBQUM7UUFFOUU7OztXQUdHO1FBQ0ssa0JBQWEsR0FBRyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7UUFFMUM7OztXQUdHO1FBQ0ssMEJBQXFCLEdBQUcsQ0FBQyxDQUFDO1FBRWxDOzs7V0FHRztRQUNL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QyxNQUFNLEtBQUssSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0FBQ2pDLENBQUM7QUFFRCwyRUFBMkU7QUFDM0UsTUFBTSx3QkFBd0I7SUFPNUIsSUFBSSxNQUFNO1FBQ1IsT0FBTyxJQUFJLENBQUMsZUFBZSxDQUFDLE1BQU0sQ0FBQztJQUNyQyxDQUFDO0lBR0Q7UUFGaUIsb0JBQWUsR0FBRyxJQUFJLGVBQWUsRUFBRSxDQUFDO1FBR3ZELElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxPQUFPLENBQ3hCLENBQUMsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ2xCLElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxPQUFPLENBQUM7WUFDaEMsSUFBSSxDQUFDLGVBQWUsR0FBRyxNQUFNLENBQUM7UUFDaEMsQ0FBQyxDQUNKLENBQUM7UUFFRixJQUFJLENBQUMsUUFBUSxHQUFHLElBQUksT0FBTyxDQUN2QixLQUFLLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxFQUFFO1lBQ3hCLElBQUksQ0FBQyxlQUFlLEdBQUcsT0FBTyxDQUFDO1lBQy9CLElBQUksQ0FBQyxjQUFjLEdBQUcsQ0FBQyxNQUFhLEVBQUUsRUFBRTtnQkFDdEMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxDQUFDO2dCQUNmLElBQUksQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQ3JDLENBQUMsQ0FBQztRQUNKLENBQUMsQ0FDSixDQUFDO1FBQ0YsOEJBQThCO1FBQzlCLElBQUksQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDO1FBQy9CLElBQUksQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxHQUFFLENBQUMsQ0FBQyxDQUFDO0lBQ2hDLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG4vLyBQcmV2ZW50cyBkZWxldGlvbiBvZiBgRXZlbnRgIGZyb20gYGdsb2JhbFRoaXNgIGR1cmluZyBtb2R1bGUgbG9hZGluZy5cbmNvbnN0IEV2ZW50ID0gZ2xvYmFsVGhpcy5FdmVudDtcblxuLyoqXG4gKiBGYWtlIGltcGxlbWVudGF0aW9uIG9mIHVzZXIgYWdlbnQgaGlzdG9yeSBhbmQgbmF2aWdhdGlvbiBiZWhhdmlvci4gVGhpcyBpcyBhXG4gKiBoaWdoLWZpZGVsaXR5IGltcGxlbWVudGF0aW9uIG9mIGJyb3dzZXIgYmVoYXZpb3IgdGhhdCBhdHRlbXB0cyB0byBlbXVsYXRlXG4gKiB0aGluZ3MgbGlrZSB0cmF2ZXJzYWwgZGVsYXkuXG4gKi9cbmV4cG9ydCBjbGFzcyBGYWtlTmF2aWdhdGlvbiBpbXBsZW1lbnRzIE5hdmlnYXRpb24ge1xuICAvKipcbiAgICogVGhlIGZha2UgaW1wbGVtZW50YXRpb24gb2YgYW4gZW50cmllcyBhcnJheS4gT25seSBzYW1lLWRvY3VtZW50IGVudHJpZXNcbiAgICogYWxsb3dlZC5cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgZW50cmllc0FycjogRmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnlbXSA9IFtdO1xuXG4gIC8qKlxuICAgKiBUaGUgY3VycmVudCBhY3RpdmUgZW50cnkgaW5kZXggaW50byBgZW50cmllc0FycmAuXG4gICAqL1xuICBwcml2YXRlIGN1cnJlbnRFbnRyeUluZGV4ID0gMDtcblxuICAvKipcbiAgICogVGhlIGN1cnJlbnQgbmF2aWdhdGUgZXZlbnQuXG4gICAqL1xuICBwcml2YXRlIG5hdmlnYXRlRXZlbnQ6IEludGVybmFsRmFrZU5hdmlnYXRlRXZlbnR8dW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXG4gIC8qKlxuICAgKiBBIE1hcCBvZiBwZW5kaW5nIHRyYXZlcnNhbHMsIHNvIHRoYXQgdHJhdmVyc2FscyB0byB0aGUgc2FtZSBlbnRyeSBjYW4gYmVcbiAgICogcmUtdXNlZC5cbiAgICovXG4gIHByaXZhdGUgcmVhZG9ubHkgdHJhdmVyc2FsUXVldWUgPSBuZXcgTWFwPHN0cmluZywgSW50ZXJuYWxOYXZpZ2F0aW9uUmVzdWx0PigpO1xuXG4gIC8qKlxuICAgKiBBIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aGVuIHRoZSBwcmV2aW91cyB0cmF2ZXJzYWxzIGhhdmUgZmluaXNoZWQuIFVzZWQgdG9cbiAgICogc2ltdWxhdGUgdGhlIGNyb3NzLXByb2Nlc3MgY29tbXVuaWNhdGlvbiBuZWNlc3NhcnkgZm9yIHRyYXZlcnNhbHMuXG4gICAqL1xuICBwcml2YXRlIG5leHRUcmF2ZXJzYWwgPSBQcm9taXNlLnJlc29sdmUoKTtcblxuICAvKipcbiAgICogQSBwcm9zcGVjdGl2ZSBjdXJyZW50IGFjdGl2ZSBlbnRyeSBpbmRleCwgd2hpY2ggaW5jbHVkZXMgdW5yZXNvbHZlZFxuICAgKiB0cmF2ZXJzYWxzLiBVc2VkIGJ5IGBnb2AgdG8gZGV0ZXJtaW5lIHdoZXJlIG5hdmlnYXRpb25zIGFyZSBpbnRlbmRlZCB0byBnby5cbiAgICovXG4gIHByaXZhdGUgcHJvc3BlY3RpdmVFbnRyeUluZGV4ID0gMDtcblxuICAvKipcbiAgICogQSB0ZXN0LW9ubHkgb3B0aW9uIHRvIG1ha2UgdHJhdmVyc2FscyBzeW5jaHJvbm91cywgcmF0aGVyIHRoYW4gZW11bGF0ZVxuICAgKiBjcm9zcy1wcm9jZXNzIGNvbW11bmljYXRpb24uXG4gICAqL1xuICBwcml2YXRlIHN5bmNocm9ub3VzVHJhdmVyc2FscyA9IGZhbHNlO1xuXG4gIC8qKiBXaGV0aGVyIHRvIGFsbG93IGEgY2FsbCB0byBzZXRJbml0aWFsRW50cnlGb3JUZXN0aW5nLiAqL1xuICBwcml2YXRlIGNhblNldEluaXRpYWxFbnRyeSA9IHRydWU7XG5cbiAgLyoqIGBFdmVudFRhcmdldGAgdG8gZGlzcGF0Y2ggZXZlbnRzLiAqL1xuICBwcml2YXRlIGV2ZW50VGFyZ2V0OiBFdmVudFRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXG4gIC8qKiBUaGUgbmV4dCB1bmlxdWUgaWQgZm9yIGNyZWF0ZWQgZW50cmllcy4gUmVwbGFjZSByZWNyZWF0ZXMgdGhpcyBpZC4gKi9cbiAgcHJpdmF0ZSBuZXh0SWQgPSAwO1xuXG4gIC8qKiBUaGUgbmV4dCB1bmlxdWUga2V5IGZvciBjcmVhdGVkIGVudHJpZXMuIFJlcGxhY2UgaW5oZXJpdHMgdGhpcyBpZC4gKi9cbiAgcHJpdmF0ZSBuZXh0S2V5ID0gMDtcblxuICAvKiogV2hldGhlciB0aGlzIGZha2UgaXMgZGlzcG9zZWQuICovXG4gIHByaXZhdGUgZGlzcG9zZWQgPSBmYWxzZTtcblxuICAvKiogRXF1aXZhbGVudCB0byBgbmF2aWdhdGlvbi5jdXJyZW50RW50cnlgLiAqL1xuICBnZXQgY3VycmVudEVudHJ5KCk6IEZha2VOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5IHtcbiAgICByZXR1cm4gdGhpcy5lbnRyaWVzQXJyW3RoaXMuY3VycmVudEVudHJ5SW5kZXhdO1xuICB9XG5cbiAgZ2V0IGNhbkdvQmFjaygpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5jdXJyZW50RW50cnlJbmRleCA+IDA7XG4gIH1cblxuICBnZXQgY2FuR29Gb3J3YXJkKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLmN1cnJlbnRFbnRyeUluZGV4IDwgdGhpcy5lbnRyaWVzQXJyLmxlbmd0aCAtIDE7XG4gIH1cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IHdpbmRvdzogV2luZG93LCBwcml2YXRlIHJlYWRvbmx5IGJhc2VVUkk6IHN0cmluZykge1xuICAgIC8vIEZpcnN0IGVudHJ5LlxuICAgIHRoaXMuc2V0SW5pdGlhbEVudHJ5Rm9yVGVzdGluZygnLicpO1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgdGhlIGluaXRpYWwgZW50cnkuXG4gICAqL1xuICBzZXRJbml0aWFsRW50cnlGb3JUZXN0aW5nKFxuICAgICAgdXJsOiBzdHJpbmcsXG4gICAgICBvcHRpb25zOiB7XG4gICAgICAgIGhpc3RvcnlTdGF0ZTogdW5rbm93bjtcbiAgICAgICAgLy8gQWxsb3dzIHNldHRpbmcgdGhlIFVSTCB3aXRob3V0IHJlc29sdmluZyBpdCBhZ2FpbnN0IHRoZSBiYXNlLlxuICAgICAgICBhYnNvbHV0ZVVybD86IGJvb2xlYW47XG4gICAgICAgIHN0YXRlPzogdW5rbm93bjtcbiAgICAgIH0gPSB7aGlzdG9yeVN0YXRlOiBudWxsfSxcbiAgKSB7XG4gICAgaWYgKCF0aGlzLmNhblNldEluaXRpYWxFbnRyeSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICdzZXRJbml0aWFsRW50cnlGb3JUZXN0aW5nIGNhbiBvbmx5IGJlIGNhbGxlZCBiZWZvcmUgYW55ICcgK1xuICAgICAgICAgICAgICAnbmF2aWdhdGlvbiBoYXMgb2NjdXJyZWQnLFxuICAgICAgKTtcbiAgICB9XG4gICAgY29uc3QgY3VycmVudEluaXRpYWxFbnRyeSA9IHRoaXMuZW50cmllc0FyclswXTtcbiAgICB0aGlzLmVudHJpZXNBcnJbMF0gPSBuZXcgRmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnkoXG4gICAgICAgIG9wdGlvbnMuYWJzb2x1dGVVcmwgPyB1cmwgOiBuZXcgVVJMKHVybCwgdGhpcy5iYXNlVVJJKS50b1N0cmluZygpLFxuICAgICAgICB7XG4gICAgICAgICAgaW5kZXg6IDAsXG4gICAgICAgICAga2V5OiBjdXJyZW50SW5pdGlhbEVudHJ5Py5rZXkgPz8gU3RyaW5nKHRoaXMubmV4dEtleSsrKSxcbiAgICAgICAgICBpZDogY3VycmVudEluaXRpYWxFbnRyeT8uaWQgPz8gU3RyaW5nKHRoaXMubmV4dElkKyspLFxuICAgICAgICAgIHNhbWVEb2N1bWVudDogdHJ1ZSxcbiAgICAgICAgICBoaXN0b3J5U3RhdGU6IG9wdGlvbnM/Lmhpc3RvcnlTdGF0ZSxcbiAgICAgICAgICBzdGF0ZTogb3B0aW9ucy5zdGF0ZSxcbiAgICAgICAgfSxcbiAgICApO1xuICB9XG5cbiAgLyoqIFJldHVybnMgd2hldGhlciB0aGUgaW5pdGlhbCBlbnRyeSBpcyBzdGlsbCBlbGlnaWJsZSB0byBiZSBzZXQuICovXG4gIGNhblNldEluaXRpYWxFbnRyeUZvclRlc3RpbmcoKTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuY2FuU2V0SW5pdGlhbEVudHJ5O1xuICB9XG5cbiAgLyoqXG4gICAqIFNldHMgd2hldGhlciB0byBlbXVsYXRlIHRyYXZlcnNhbHMgYXMgc3luY2hyb25vdXMgcmF0aGVyIHRoYW5cbiAgICogYXN5bmNocm9ub3VzLlxuICAgKi9cbiAgc2V0U3luY2hyb25vdXNUcmF2ZXJzYWxzRm9yVGVzdGluZyhzeW5jaHJvbm91c1RyYXZlcnNhbHM6IGJvb2xlYW4pIHtcbiAgICB0aGlzLnN5bmNocm9ub3VzVHJhdmVyc2FscyA9IHN5bmNocm9ub3VzVHJhdmVyc2FscztcbiAgfVxuXG4gIC8qKiBFcXVpdmFsZW50IHRvIGBuYXZpZ2F0aW9uLmVudHJpZXMoKWAuICovXG4gIGVudHJpZXMoKTogRmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnlbXSB7XG4gICAgcmV0dXJuIHRoaXMuZW50cmllc0Fyci5zbGljZSgpO1xuICB9XG5cbiAgLyoqIEVxdWl2YWxlbnQgdG8gYG5hdmlnYXRpb24ubmF2aWdhdGUoKWAuICovXG4gIG5hdmlnYXRlKFxuICAgICAgdXJsOiBzdHJpbmcsXG4gICAgICBvcHRpb25zPzogTmF2aWdhdGlvbk5hdmlnYXRlT3B0aW9ucyxcbiAgICAgICk6IEZha2VOYXZpZ2F0aW9uUmVzdWx0IHtcbiAgICBjb25zdCBmcm9tVXJsID0gbmV3IFVSTCh0aGlzLmN1cnJlbnRFbnRyeS51cmwhLCB0aGlzLmJhc2VVUkkpO1xuICAgIGNvbnN0IHRvVXJsID0gbmV3IFVSTCh1cmwsIHRoaXMuYmFzZVVSSSk7XG5cbiAgICBsZXQgbmF2aWdhdGlvblR5cGU6IE5hdmlnYXRpb25UeXBlU3RyaW5nO1xuICAgIGlmICghb3B0aW9ucz8uaGlzdG9yeSB8fCBvcHRpb25zLmhpc3RvcnkgPT09ICdhdXRvJykge1xuICAgICAgLy8gQXV0byBkZWZhdWx0cyB0byBwdXNoLCBidXQgaWYgdGhlIFVSTHMgYXJlIHRoZSBzYW1lLCBpcyBhIHJlcGxhY2UuXG4gICAgICBpZiAoZnJvbVVybC50b1N0cmluZygpID09PSB0b1VybC50b1N0cmluZygpKSB7XG4gICAgICAgIG5hdmlnYXRpb25UeXBlID0gJ3JlcGxhY2UnO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmF2aWdhdGlvblR5cGUgPSAncHVzaCc7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hdmlnYXRpb25UeXBlID0gb3B0aW9ucy5oaXN0b3J5O1xuICAgIH1cblxuICAgIGNvbnN0IGhhc2hDaGFuZ2UgPSBpc0hhc2hDaGFuZ2UoZnJvbVVybCwgdG9VcmwpO1xuXG4gICAgY29uc3QgZGVzdGluYXRpb24gPSBuZXcgRmFrZU5hdmlnYXRpb25EZXN0aW5hdGlvbih7XG4gICAgICB1cmw6IHRvVXJsLnRvU3RyaW5nKCksXG4gICAgICBzdGF0ZTogb3B0aW9ucz8uc3RhdGUsXG4gICAgICBzYW1lRG9jdW1lbnQ6IGhhc2hDaGFuZ2UsXG4gICAgICBoaXN0b3J5U3RhdGU6IG51bGwsXG4gICAgfSk7XG4gICAgY29uc3QgcmVzdWx0ID0gbmV3IEludGVybmFsTmF2aWdhdGlvblJlc3VsdCgpO1xuXG4gICAgdGhpcy51c2VyQWdlbnROYXZpZ2F0ZShkZXN0aW5hdGlvbiwgcmVzdWx0LCB7XG4gICAgICBuYXZpZ2F0aW9uVHlwZSxcbiAgICAgIGNhbmNlbGFibGU6IHRydWUsXG4gICAgICBjYW5JbnRlcmNlcHQ6IHRydWUsXG4gICAgICAvLyBBbHdheXMgZmFsc2UgZm9yIG5hdmlnYXRlKCkuXG4gICAgICB1c2VySW5pdGlhdGVkOiBmYWxzZSxcbiAgICAgIGhhc2hDaGFuZ2UsXG4gICAgICBpbmZvOiBvcHRpb25zPy5pbmZvLFxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIGNvbW1pdHRlZDogcmVzdWx0LmNvbW1pdHRlZCxcbiAgICAgIGZpbmlzaGVkOiByZXN1bHQuZmluaXNoZWQsXG4gICAgfTtcbiAgfVxuXG4gIC8qKiBFcXVpdmFsZW50IHRvIGBoaXN0b3J5LnB1c2hTdGF0ZSgpYC4gKi9cbiAgcHVzaFN0YXRlKGRhdGE6IHVua25vd24sIHRpdGxlOiBzdHJpbmcsIHVybD86IHN0cmluZyk6IHZvaWQge1xuICAgIHRoaXMucHVzaE9yUmVwbGFjZVN0YXRlKCdwdXNoJywgZGF0YSwgdGl0bGUsIHVybCk7XG4gIH1cblxuICAvKiogRXF1aXZhbGVudCB0byBgaGlzdG9yeS5yZXBsYWNlU3RhdGUoKWAuICovXG4gIHJlcGxhY2VTdGF0ZShkYXRhOiB1bmtub3duLCB0aXRsZTogc3RyaW5nLCB1cmw/OiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLnB1c2hPclJlcGxhY2VTdGF0ZSgncmVwbGFjZScsIGRhdGEsIHRpdGxlLCB1cmwpO1xuICB9XG5cbiAgcHJpdmF0ZSBwdXNoT3JSZXBsYWNlU3RhdGUoXG4gICAgICBuYXZpZ2F0aW9uVHlwZTogTmF2aWdhdGlvblR5cGVTdHJpbmcsXG4gICAgICBkYXRhOiB1bmtub3duLFxuICAgICAgX3RpdGxlOiBzdHJpbmcsXG4gICAgICB1cmw/OiBzdHJpbmcsXG4gICAgICApOiB2b2lkIHtcbiAgICBjb25zdCBmcm9tVXJsID0gbmV3IFVSTCh0aGlzLmN1cnJlbnRFbnRyeS51cmwhLCB0aGlzLmJhc2VVUkkpO1xuICAgIGNvbnN0IHRvVXJsID0gdXJsID8gbmV3IFVSTCh1cmwsIHRoaXMuYmFzZVVSSSkgOiBmcm9tVXJsO1xuXG4gICAgY29uc3QgaGFzaENoYW5nZSA9IGlzSGFzaENoYW5nZShmcm9tVXJsLCB0b1VybCk7XG5cbiAgICBjb25zdCBkZXN0aW5hdGlvbiA9IG5ldyBGYWtlTmF2aWdhdGlvbkRlc3RpbmF0aW9uKHtcbiAgICAgIHVybDogdG9VcmwudG9TdHJpbmcoKSxcbiAgICAgIHNhbWVEb2N1bWVudDogdHJ1ZSxcbiAgICAgIGhpc3RvcnlTdGF0ZTogZGF0YSxcbiAgICB9KTtcbiAgICBjb25zdCByZXN1bHQgPSBuZXcgSW50ZXJuYWxOYXZpZ2F0aW9uUmVzdWx0KCk7XG5cbiAgICB0aGlzLnVzZXJBZ2VudE5hdmlnYXRlKGRlc3RpbmF0aW9uLCByZXN1bHQsIHtcbiAgICAgIG5hdmlnYXRpb25UeXBlLFxuICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcbiAgICAgIGNhbkludGVyY2VwdDogdHJ1ZSxcbiAgICAgIC8vIEFsd2F5cyBmYWxzZSBmb3IgcHVzaFN0YXRlKCkgb3IgcmVwbGFjZVN0YXRlKCkuXG4gICAgICB1c2VySW5pdGlhdGVkOiBmYWxzZSxcbiAgICAgIGhhc2hDaGFuZ2UsXG4gICAgICBza2lwUG9wU3RhdGU6IHRydWUsXG4gICAgfSk7XG4gIH1cblxuICAvKiogRXF1aXZhbGVudCB0byBgbmF2aWdhdGlvbi50cmF2ZXJzZVRvKClgLiAqL1xuICB0cmF2ZXJzZVRvKGtleTogc3RyaW5nLCBvcHRpb25zPzogTmF2aWdhdGlvbk9wdGlvbnMpOiBGYWtlTmF2aWdhdGlvblJlc3VsdCB7XG4gICAgY29uc3QgZnJvbVVybCA9IG5ldyBVUkwodGhpcy5jdXJyZW50RW50cnkudXJsISwgdGhpcy5iYXNlVVJJKTtcbiAgICBjb25zdCBlbnRyeSA9IHRoaXMuZmluZEVudHJ5KGtleSk7XG4gICAgaWYgKCFlbnRyeSkge1xuICAgICAgY29uc3QgZG9tRXhjZXB0aW9uID0gbmV3IERPTUV4Y2VwdGlvbihcbiAgICAgICAgICAnSW52YWxpZCBrZXknLFxuICAgICAgICAgICdJbnZhbGlkU3RhdGVFcnJvcicsXG4gICAgICApO1xuICAgICAgY29uc3QgY29tbWl0dGVkID0gUHJvbWlzZS5yZWplY3QoZG9tRXhjZXB0aW9uKTtcbiAgICAgIGNvbnN0IGZpbmlzaGVkID0gUHJvbWlzZS5yZWplY3QoZG9tRXhjZXB0aW9uKTtcbiAgICAgIGNvbW1pdHRlZC5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICBmaW5pc2hlZC5jYXRjaCgoKSA9PiB7fSk7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb21taXR0ZWQsXG4gICAgICAgIGZpbmlzaGVkLFxuICAgICAgfTtcbiAgICB9XG4gICAgaWYgKGVudHJ5ID09PSB0aGlzLmN1cnJlbnRFbnRyeSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWl0dGVkOiBQcm9taXNlLnJlc29sdmUodGhpcy5jdXJyZW50RW50cnkpLFxuICAgICAgICBmaW5pc2hlZDogUHJvbWlzZS5yZXNvbHZlKHRoaXMuY3VycmVudEVudHJ5KSxcbiAgICAgIH07XG4gICAgfVxuICAgIGlmICh0aGlzLnRyYXZlcnNhbFF1ZXVlLmhhcyhlbnRyeS5rZXkpKSB7XG4gICAgICBjb25zdCBleGlzdGluZ1Jlc3VsdCA9IHRoaXMudHJhdmVyc2FsUXVldWUuZ2V0KGVudHJ5LmtleSkhO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWl0dGVkOiBleGlzdGluZ1Jlc3VsdC5jb21taXR0ZWQsXG4gICAgICAgIGZpbmlzaGVkOiBleGlzdGluZ1Jlc3VsdC5maW5pc2hlZCxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgaGFzaENoYW5nZSA9IGlzSGFzaENoYW5nZShmcm9tVXJsLCBuZXcgVVJMKGVudHJ5LnVybCEsIHRoaXMuYmFzZVVSSSkpO1xuICAgIGNvbnN0IGRlc3RpbmF0aW9uID0gbmV3IEZha2VOYXZpZ2F0aW9uRGVzdGluYXRpb24oe1xuICAgICAgdXJsOiBlbnRyeS51cmwhLFxuICAgICAgc3RhdGU6IGVudHJ5LmdldFN0YXRlKCksXG4gICAgICBoaXN0b3J5U3RhdGU6IGVudHJ5LmdldEhpc3RvcnlTdGF0ZSgpLFxuICAgICAga2V5OiBlbnRyeS5rZXksXG4gICAgICBpZDogZW50cnkuaWQsXG4gICAgICBpbmRleDogZW50cnkuaW5kZXgsXG4gICAgICBzYW1lRG9jdW1lbnQ6IGVudHJ5LnNhbWVEb2N1bWVudCxcbiAgICB9KTtcbiAgICB0aGlzLnByb3NwZWN0aXZlRW50cnlJbmRleCA9IGVudHJ5LmluZGV4O1xuICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBJbnRlcm5hbE5hdmlnYXRpb25SZXN1bHQoKTtcbiAgICB0aGlzLnRyYXZlcnNhbFF1ZXVlLnNldChlbnRyeS5rZXksIHJlc3VsdCk7XG4gICAgdGhpcy5ydW5UcmF2ZXJzYWwoKCkgPT4ge1xuICAgICAgdGhpcy50cmF2ZXJzYWxRdWV1ZS5kZWxldGUoZW50cnkua2V5KTtcbiAgICAgIHRoaXMudXNlckFnZW50TmF2aWdhdGUoZGVzdGluYXRpb24sIHJlc3VsdCwge1xuICAgICAgICBuYXZpZ2F0aW9uVHlwZTogJ3RyYXZlcnNlJyxcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcbiAgICAgICAgY2FuSW50ZXJjZXB0OiB0cnVlLFxuICAgICAgICAvLyBBbHdheXMgZmFsc2UgZm9yIHRyYXZlcnNlVG8oKS5cbiAgICAgICAgdXNlckluaXRpYXRlZDogZmFsc2UsXG4gICAgICAgIGhhc2hDaGFuZ2UsXG4gICAgICAgIGluZm86IG9wdGlvbnM/LmluZm8sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgICByZXR1cm4ge1xuICAgICAgY29tbWl0dGVkOiByZXN1bHQuY29tbWl0dGVkLFxuICAgICAgZmluaXNoZWQ6IHJlc3VsdC5maW5pc2hlZCxcbiAgICB9O1xuICB9XG5cbiAgLyoqIEVxdWl2YWxlbnQgdG8gYG5hdmlnYXRpb24uYmFjaygpYC4gKi9cbiAgYmFjayhvcHRpb25zPzogTmF2aWdhdGlvbk9wdGlvbnMpOiBGYWtlTmF2aWdhdGlvblJlc3VsdCB7XG4gICAgaWYgKHRoaXMuY3VycmVudEVudHJ5SW5kZXggPT09IDApIHtcbiAgICAgIGNvbnN0IGRvbUV4Y2VwdGlvbiA9IG5ldyBET01FeGNlcHRpb24oXG4gICAgICAgICAgJ0Nhbm5vdCBnbyBiYWNrJyxcbiAgICAgICAgICAnSW52YWxpZFN0YXRlRXJyb3InLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGNvbW1pdHRlZCA9IFByb21pc2UucmVqZWN0KGRvbUV4Y2VwdGlvbik7XG4gICAgICBjb25zdCBmaW5pc2hlZCA9IFByb21pc2UucmVqZWN0KGRvbUV4Y2VwdGlvbik7XG4gICAgICBjb21taXR0ZWQuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgZmluaXNoZWQuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWl0dGVkLFxuICAgICAgICBmaW5pc2hlZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5lbnRyaWVzQXJyW3RoaXMuY3VycmVudEVudHJ5SW5kZXggLSAxXTtcbiAgICByZXR1cm4gdGhpcy50cmF2ZXJzZVRvKGVudHJ5LmtleSwgb3B0aW9ucyk7XG4gIH1cblxuICAvKiogRXF1aXZhbGVudCB0byBgbmF2aWdhdGlvbi5mb3J3YXJkKClgLiAqL1xuICBmb3J3YXJkKG9wdGlvbnM/OiBOYXZpZ2F0aW9uT3B0aW9ucyk6IEZha2VOYXZpZ2F0aW9uUmVzdWx0IHtcbiAgICBpZiAodGhpcy5jdXJyZW50RW50cnlJbmRleCA9PT0gdGhpcy5lbnRyaWVzQXJyLmxlbmd0aCAtIDEpIHtcbiAgICAgIGNvbnN0IGRvbUV4Y2VwdGlvbiA9IG5ldyBET01FeGNlcHRpb24oXG4gICAgICAgICAgJ0Nhbm5vdCBnbyBmb3J3YXJkJyxcbiAgICAgICAgICAnSW52YWxpZFN0YXRlRXJyb3InLFxuICAgICAgKTtcbiAgICAgIGNvbnN0IGNvbW1pdHRlZCA9IFByb21pc2UucmVqZWN0KGRvbUV4Y2VwdGlvbik7XG4gICAgICBjb25zdCBmaW5pc2hlZCA9IFByb21pc2UucmVqZWN0KGRvbUV4Y2VwdGlvbik7XG4gICAgICBjb21taXR0ZWQuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgZmluaXNoZWQuY2F0Y2goKCkgPT4ge30pO1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29tbWl0dGVkLFxuICAgICAgICBmaW5pc2hlZCxcbiAgICAgIH07XG4gICAgfVxuICAgIGNvbnN0IGVudHJ5ID0gdGhpcy5lbnRyaWVzQXJyW3RoaXMuY3VycmVudEVudHJ5SW5kZXggKyAxXTtcbiAgICByZXR1cm4gdGhpcy50cmF2ZXJzZVRvKGVudHJ5LmtleSwgb3B0aW9ucyk7XG4gIH1cblxuICAvKipcbiAgICogRXF1aXZhbGVudCB0byBgaGlzdG9yeS5nbygpYC5cbiAgICogTm90ZSB0aGF0IHRoaXMgbWV0aG9kIGRvZXMgbm90IGFjdHVhbGx5IHdvcmsgcHJlY2lzZWx5IHRvIGhvdyBDaHJvbWVcbiAgICogZG9lcywgaW5zdGVhZCBjaG9vc2luZyBhIHNpbXBsZXIgbW9kZWwgd2l0aCBsZXNzIHVuZXhwZWN0ZWQgYmVoYXZpb3IuXG4gICAqIENocm9tZSBoYXMgYSBmZXcgZWRnZSBjYXNlIG9wdGltaXphdGlvbnMsIGZvciBpbnN0YW5jZSB3aXRoIHJlcGVhdGVkXG4gICAqIGBiYWNrKCk7IGZvcndhcmQoKWAgY2hhaW5zIGl0IGNvbGxhcHNlcyBjZXJ0YWluIHRyYXZlcnNhbHMuXG4gICAqL1xuICBnbyhkaXJlY3Rpb246IG51bWJlcik6IHZvaWQge1xuICAgIGNvbnN0IHRhcmdldEluZGV4ID0gdGhpcy5wcm9zcGVjdGl2ZUVudHJ5SW5kZXggKyBkaXJlY3Rpb247XG4gICAgaWYgKHRhcmdldEluZGV4ID49IHRoaXMuZW50cmllc0Fyci5sZW5ndGggfHwgdGFyZ2V0SW5kZXggPCAwKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMucHJvc3BlY3RpdmVFbnRyeUluZGV4ID0gdGFyZ2V0SW5kZXg7XG4gICAgdGhpcy5ydW5UcmF2ZXJzYWwoKCkgPT4ge1xuICAgICAgLy8gQ2hlY2sgYWdhaW4gdGhhdCBkZXN0aW5hdGlvbiBpcyBpbiB0aGUgZW50cmllcyBhcnJheS5cbiAgICAgIGlmICh0YXJnZXRJbmRleCA+PSB0aGlzLmVudHJpZXNBcnIubGVuZ3RoIHx8IHRhcmdldEluZGV4IDwgMCkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBjb25zdCBmcm9tVXJsID0gbmV3IFVSTCh0aGlzLmN1cnJlbnRFbnRyeS51cmwhLCB0aGlzLmJhc2VVUkkpO1xuICAgICAgY29uc3QgZW50cnkgPSB0aGlzLmVudHJpZXNBcnJbdGFyZ2V0SW5kZXhdO1xuICAgICAgY29uc3QgaGFzaENoYW5nZSA9IGlzSGFzaENoYW5nZShmcm9tVXJsLCBuZXcgVVJMKGVudHJ5LnVybCEsIHRoaXMuYmFzZVVSSSkpO1xuICAgICAgY29uc3QgZGVzdGluYXRpb24gPSBuZXcgRmFrZU5hdmlnYXRpb25EZXN0aW5hdGlvbih7XG4gICAgICAgIHVybDogZW50cnkudXJsISxcbiAgICAgICAgc3RhdGU6IGVudHJ5LmdldFN0YXRlKCksXG4gICAgICAgIGhpc3RvcnlTdGF0ZTogZW50cnkuZ2V0SGlzdG9yeVN0YXRlKCksXG4gICAgICAgIGtleTogZW50cnkua2V5LFxuICAgICAgICBpZDogZW50cnkuaWQsXG4gICAgICAgIGluZGV4OiBlbnRyeS5pbmRleCxcbiAgICAgICAgc2FtZURvY3VtZW50OiBlbnRyeS5zYW1lRG9jdW1lbnQsXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHJlc3VsdCA9IG5ldyBJbnRlcm5hbE5hdmlnYXRpb25SZXN1bHQoKTtcbiAgICAgIHRoaXMudXNlckFnZW50TmF2aWdhdGUoZGVzdGluYXRpb24sIHJlc3VsdCwge1xuICAgICAgICBuYXZpZ2F0aW9uVHlwZTogJ3RyYXZlcnNlJyxcbiAgICAgICAgY2FuY2VsYWJsZTogdHJ1ZSxcbiAgICAgICAgY2FuSW50ZXJjZXB0OiB0cnVlLFxuICAgICAgICAvLyBBbHdheXMgZmFsc2UgZm9yIGdvKCkuXG4gICAgICAgIHVzZXJJbml0aWF0ZWQ6IGZhbHNlLFxuICAgICAgICBoYXNoQ2hhbmdlLFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cblxuICAvKiogUnVucyBhIHRyYXZlcnNhbCBzeW5jaHJvbm91c2x5IG9yIGFzeW5jaHJvbm91c2x5ICovXG4gIHByaXZhdGUgcnVuVHJhdmVyc2FsKHRyYXZlcnNhbDogKCkgPT4gdm9pZCkge1xuICAgIGlmICh0aGlzLnN5bmNocm9ub3VzVHJhdmVyc2Fscykge1xuICAgICAgdHJhdmVyc2FsKCk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy8gRWFjaCB0cmF2ZXJzYWwgb2NjdXBpZXMgYSBzaW5nbGUgdGltZW91dCByZXNvbHV0aW9uLlxuICAgIC8vIFRoaXMgbWVhbnMgdGhhdCBQcm9taXNlcyBhZGRlZCB0byBjb21taXQgYW5kIGZpbmlzaCBzaG91bGQgcmVzb2x2ZVxuICAgIC8vIGJlZm9yZSB0aGUgbmV4dCB0cmF2ZXJzYWwuXG4gICAgdGhpcy5uZXh0VHJhdmVyc2FsID0gdGhpcy5uZXh0VHJhdmVyc2FsLnRoZW4oKCkgPT4ge1xuICAgICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KChyZXNvbHZlKSA9PiB7XG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICB0cmF2ZXJzYWwoKTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8qKiBFcXVpdmFsZW50IHRvIGBuYXZpZ2F0aW9uLmFkZEV2ZW50TGlzdGVuZXIoKWAuICovXG4gIGFkZEV2ZW50TGlzdGVuZXIoXG4gICAgICB0eXBlOiBzdHJpbmcsXG4gICAgICBjYWxsYmFjazogRXZlbnRMaXN0ZW5lck9yRXZlbnRMaXN0ZW5lck9iamVjdCxcbiAgICAgIG9wdGlvbnM/OiBBZGRFdmVudExpc3RlbmVyT3B0aW9uc3xib29sZWFuLFxuICApIHtcbiAgICB0aGlzLmV2ZW50VGFyZ2V0LmFkZEV2ZW50TGlzdGVuZXIodHlwZSwgY2FsbGJhY2ssIG9wdGlvbnMpO1xuICB9XG5cbiAgLyoqIEVxdWl2YWxlbnQgdG8gYG5hdmlnYXRpb24ucmVtb3ZlRXZlbnRMaXN0ZW5lcigpYC4gKi9cbiAgcmVtb3ZlRXZlbnRMaXN0ZW5lcihcbiAgICAgIHR5cGU6IHN0cmluZyxcbiAgICAgIGNhbGxiYWNrOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0LFxuICAgICAgb3B0aW9ucz86IEV2ZW50TGlzdGVuZXJPcHRpb25zfGJvb2xlYW4sXG4gICkge1xuICAgIHRoaXMuZXZlbnRUYXJnZXQucmVtb3ZlRXZlbnRMaXN0ZW5lcih0eXBlLCBjYWxsYmFjaywgb3B0aW9ucyk7XG4gIH1cblxuICAvKiogRXF1aXZhbGVudCB0byBgbmF2aWdhdGlvbi5kaXNwYXRjaEV2ZW50KClgICovXG4gIGRpc3BhdGNoRXZlbnQoZXZlbnQ6IEV2ZW50KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuZXZlbnRUYXJnZXQuZGlzcGF0Y2hFdmVudChldmVudCk7XG4gIH1cblxuICAvKiogQ2xlYW5zIHVwIHJlc291cmNlcy4gKi9cbiAgZGlzcG9zZSgpIHtcbiAgICAvLyBSZWNyZWF0ZSBldmVudFRhcmdldCB0byByZWxlYXNlIGN1cnJlbnQgbGlzdGVuZXJzLlxuICAgIC8vIGBkb2N1bWVudC5jcmVhdGVFbGVtZW50YCBiZWNhdXNlIE5vZGVKUyBgRXZlbnRUYXJnZXRgIGlzIGluY29tcGF0aWJsZSB3aXRoIERvbWlubydzIGBFdmVudGAuXG4gICAgdGhpcy5ldmVudFRhcmdldCA9IHRoaXMud2luZG93LmRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgIHRoaXMuZGlzcG9zZWQgPSB0cnVlO1xuICB9XG5cbiAgLyoqIFJldHVybnMgd2hldGhlciB0aGlzIGZha2UgaXMgZGlzcG9zZWQuICovXG4gIGlzRGlzcG9zZWQoKSB7XG4gICAgcmV0dXJuIHRoaXMuZGlzcG9zZWQ7XG4gIH1cblxuICAvKiogSW1wbGVtZW50YXRpb24gZm9yIGFsbCBuYXZpZ2F0aW9ucyBhbmQgdHJhdmVyc2Fscy4gKi9cbiAgcHJpdmF0ZSB1c2VyQWdlbnROYXZpZ2F0ZShcbiAgICAgIGRlc3RpbmF0aW9uOiBGYWtlTmF2aWdhdGlvbkRlc3RpbmF0aW9uLFxuICAgICAgcmVzdWx0OiBJbnRlcm5hbE5hdmlnYXRpb25SZXN1bHQsXG4gICAgICBvcHRpb25zOiBJbnRlcm5hbE5hdmlnYXRlT3B0aW9ucyxcbiAgKSB7XG4gICAgLy8gVGhlIGZpcnN0IG5hdmlnYXRpb24gc2hvdWxkIGRpc2FsbG93IGFueSBmdXR1cmUgY2FsbHMgdG8gc2V0IHRoZSBpbml0aWFsXG4gICAgLy8gZW50cnkuXG4gICAgdGhpcy5jYW5TZXRJbml0aWFsRW50cnkgPSBmYWxzZTtcbiAgICBpZiAodGhpcy5uYXZpZ2F0ZUV2ZW50KSB7XG4gICAgICB0aGlzLm5hdmlnYXRlRXZlbnQuY2FuY2VsKFxuICAgICAgICAgIG5ldyBET01FeGNlcHRpb24oJ05hdmlnYXRpb24gd2FzIGFib3J0ZWQnLCAnQWJvcnRFcnJvcicpLFxuICAgICAgKTtcbiAgICAgIHRoaXMubmF2aWdhdGVFdmVudCA9IHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBuYXZpZ2F0ZUV2ZW50ID0gY3JlYXRlRmFrZU5hdmlnYXRlRXZlbnQoe1xuICAgICAgbmF2aWdhdGlvblR5cGU6IG9wdGlvbnMubmF2aWdhdGlvblR5cGUsXG4gICAgICBjYW5jZWxhYmxlOiBvcHRpb25zLmNhbmNlbGFibGUsXG4gICAgICBjYW5JbnRlcmNlcHQ6IG9wdGlvbnMuY2FuSW50ZXJjZXB0LFxuICAgICAgdXNlckluaXRpYXRlZDogb3B0aW9ucy51c2VySW5pdGlhdGVkLFxuICAgICAgaGFzaENoYW5nZTogb3B0aW9ucy5oYXNoQ2hhbmdlLFxuICAgICAgc2lnbmFsOiByZXN1bHQuc2lnbmFsLFxuICAgICAgZGVzdGluYXRpb24sXG4gICAgICBpbmZvOiBvcHRpb25zLmluZm8sXG4gICAgICBzYW1lRG9jdW1lbnQ6IGRlc3RpbmF0aW9uLnNhbWVEb2N1bWVudCxcbiAgICAgIHNraXBQb3BTdGF0ZTogb3B0aW9ucy5za2lwUG9wU3RhdGUsXG4gICAgICByZXN1bHQsXG4gICAgICB1c2VyQWdlbnRDb21taXQ6ICgpID0+IHtcbiAgICAgICAgdGhpcy51c2VyQWdlbnRDb21taXQoKTtcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLm5hdmlnYXRlRXZlbnQgPSBuYXZpZ2F0ZUV2ZW50O1xuICAgIHRoaXMuZXZlbnRUYXJnZXQuZGlzcGF0Y2hFdmVudChuYXZpZ2F0ZUV2ZW50KTtcbiAgICBuYXZpZ2F0ZUV2ZW50LmRpc3BhdGNoZWROYXZpZ2F0ZUV2ZW50KCk7XG4gICAgaWYgKG5hdmlnYXRlRXZlbnQuY29tbWl0T3B0aW9uID09PSAnaW1tZWRpYXRlJykge1xuICAgICAgbmF2aWdhdGVFdmVudC5jb21taXQoLyogaW50ZXJuYWw9ICovIHRydWUpO1xuICAgIH1cbiAgfVxuXG4gIC8qKiBJbXBsZW1lbnRhdGlvbiB0byBjb21taXQgYSBuYXZpZ2F0aW9uLiAqL1xuICBwcml2YXRlIHVzZXJBZ2VudENvbW1pdCgpIHtcbiAgICBpZiAoIXRoaXMubmF2aWdhdGVFdmVudCkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBmcm9tID0gdGhpcy5jdXJyZW50RW50cnk7XG4gICAgaWYgKCF0aGlzLm5hdmlnYXRlRXZlbnQuc2FtZURvY3VtZW50KSB7XG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignQ2Fubm90IG5hdmlnYXRlIHRvIGEgbm9uLXNhbWUtZG9jdW1lbnQgVVJMLicpO1xuICAgICAgdGhpcy5uYXZpZ2F0ZUV2ZW50LmNhbmNlbChlcnJvcik7XG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gICAgaWYgKHRoaXMubmF2aWdhdGVFdmVudC5uYXZpZ2F0aW9uVHlwZSA9PT0gJ3B1c2gnIHx8XG4gICAgICAgIHRoaXMubmF2aWdhdGVFdmVudC5uYXZpZ2F0aW9uVHlwZSA9PT0gJ3JlcGxhY2UnKSB7XG4gICAgICB0aGlzLnVzZXJBZ2VudFB1c2hPclJlcGxhY2UodGhpcy5uYXZpZ2F0ZUV2ZW50LmRlc3RpbmF0aW9uLCB7XG4gICAgICAgIG5hdmlnYXRpb25UeXBlOiB0aGlzLm5hdmlnYXRlRXZlbnQubmF2aWdhdGlvblR5cGUsXG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHRoaXMubmF2aWdhdGVFdmVudC5uYXZpZ2F0aW9uVHlwZSA9PT0gJ3RyYXZlcnNlJykge1xuICAgICAgdGhpcy51c2VyQWdlbnRUcmF2ZXJzZSh0aGlzLm5hdmlnYXRlRXZlbnQuZGVzdGluYXRpb24pO1xuICAgIH1cbiAgICB0aGlzLm5hdmlnYXRlRXZlbnQudXNlckFnZW50TmF2aWdhdGVkKHRoaXMuY3VycmVudEVudHJ5KTtcbiAgICBjb25zdCBjdXJyZW50RW50cnlDaGFuZ2VFdmVudCA9IGNyZWF0ZUZha2VOYXZpZ2F0aW9uQ3VycmVudEVudHJ5Q2hhbmdlRXZlbnQoXG4gICAgICAgIHtmcm9tLCBuYXZpZ2F0aW9uVHlwZTogdGhpcy5uYXZpZ2F0ZUV2ZW50Lm5hdmlnYXRpb25UeXBlfSxcbiAgICApO1xuICAgIHRoaXMuZXZlbnRUYXJnZXQuZGlzcGF0Y2hFdmVudChjdXJyZW50RW50cnlDaGFuZ2VFdmVudCk7XG4gICAgaWYgKCF0aGlzLm5hdmlnYXRlRXZlbnQuc2tpcFBvcFN0YXRlKSB7XG4gICAgICBjb25zdCBwb3BTdGF0ZUV2ZW50ID0gY3JlYXRlUG9wU3RhdGVFdmVudCh7XG4gICAgICAgIHN0YXRlOiB0aGlzLm5hdmlnYXRlRXZlbnQuZGVzdGluYXRpb24uZ2V0SGlzdG9yeVN0YXRlKCksXG4gICAgICB9KTtcbiAgICAgIHRoaXMud2luZG93LmRpc3BhdGNoRXZlbnQocG9wU3RhdGVFdmVudCk7XG4gICAgfVxuICB9XG5cbiAgLyoqIEltcGxlbWVudGF0aW9uIGZvciBhIHB1c2ggb3IgcmVwbGFjZSBuYXZpZ2F0aW9uLiAqL1xuICBwcml2YXRlIHVzZXJBZ2VudFB1c2hPclJlcGxhY2UoXG4gICAgICBkZXN0aW5hdGlvbjogRmFrZU5hdmlnYXRpb25EZXN0aW5hdGlvbixcbiAgICAgIHtuYXZpZ2F0aW9uVHlwZX06IHtuYXZpZ2F0aW9uVHlwZTogTmF2aWdhdGlvblR5cGVTdHJpbmd9LFxuICApIHtcbiAgICBpZiAobmF2aWdhdGlvblR5cGUgPT09ICdwdXNoJykge1xuICAgICAgdGhpcy5jdXJyZW50RW50cnlJbmRleCsrO1xuICAgICAgdGhpcy5wcm9zcGVjdGl2ZUVudHJ5SW5kZXggPSB0aGlzLmN1cnJlbnRFbnRyeUluZGV4O1xuICAgIH1cbiAgICBjb25zdCBpbmRleCA9IHRoaXMuY3VycmVudEVudHJ5SW5kZXg7XG4gICAgY29uc3Qga2V5ID0gbmF2aWdhdGlvblR5cGUgPT09ICdwdXNoJyA/IFN0cmluZyh0aGlzLm5leHRLZXkrKykgOiB0aGlzLmN1cnJlbnRFbnRyeS5rZXk7XG4gICAgY29uc3QgZW50cnkgPSBuZXcgRmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnkoZGVzdGluYXRpb24udXJsLCB7XG4gICAgICBpZDogU3RyaW5nKHRoaXMubmV4dElkKyspLFxuICAgICAga2V5LFxuICAgICAgaW5kZXgsXG4gICAgICBzYW1lRG9jdW1lbnQ6IHRydWUsXG4gICAgICBzdGF0ZTogZGVzdGluYXRpb24uZ2V0U3RhdGUoKSxcbiAgICAgIGhpc3RvcnlTdGF0ZTogZGVzdGluYXRpb24uZ2V0SGlzdG9yeVN0YXRlKCksXG4gICAgfSk7XG4gICAgaWYgKG5hdmlnYXRpb25UeXBlID09PSAncHVzaCcpIHtcbiAgICAgIHRoaXMuZW50cmllc0Fyci5zcGxpY2UoaW5kZXgsIEluZmluaXR5LCBlbnRyeSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuZW50cmllc0FycltpbmRleF0gPSBlbnRyeTtcbiAgICB9XG4gIH1cblxuICAvKiogSW1wbGVtZW50YXRpb24gZm9yIGEgdHJhdmVyc2UgbmF2aWdhdGlvbi4gKi9cbiAgcHJpdmF0ZSB1c2VyQWdlbnRUcmF2ZXJzZShkZXN0aW5hdGlvbjogRmFrZU5hdmlnYXRpb25EZXN0aW5hdGlvbikge1xuICAgIHRoaXMuY3VycmVudEVudHJ5SW5kZXggPSBkZXN0aW5hdGlvbi5pbmRleDtcbiAgfVxuXG4gIC8qKiBVdGlsaXR5IG1ldGhvZCBmb3IgZmluZGluZyBlbnRyaWVzIHdpdGggdGhlIGdpdmVuIGBrZXlgLiAqL1xuICBwcml2YXRlIGZpbmRFbnRyeShrZXk6IHN0cmluZykge1xuICAgIGZvciAoY29uc3QgZW50cnkgb2YgdGhpcy5lbnRyaWVzQXJyKSB7XG4gICAgICBpZiAoZW50cnkua2V5ID09PSBrZXkpIHJldHVybiBlbnRyeTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIHNldCBvbm5hdmlnYXRlKF9oYW5kbGVyOiAoKHRoaXM6IE5hdmlnYXRpb24sIGV2OiBOYXZpZ2F0ZUV2ZW50KSA9PiBhbnkpfG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaW1wbGVtZW50ZWQnKTtcbiAgfVxuXG4gIGdldCBvbm5hdmlnYXRlKCk6ICgodGhpczogTmF2aWdhdGlvbiwgZXY6IE5hdmlnYXRlRXZlbnQpID0+IGFueSl8bnVsbCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bmltcGxlbWVudGVkJyk7XG4gIH1cblxuICBzZXQgb25jdXJyZW50ZW50cnljaGFuZ2UoX2hhbmRsZXI6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgKCh0aGlzOiBOYXZpZ2F0aW9uLCBldjogTmF2aWdhdGlvbkN1cnJlbnRFbnRyeUNoYW5nZUV2ZW50KSA9PiBhbnkpfFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG5cbiAgZ2V0IG9uY3VycmVudGVudHJ5Y2hhbmdlKCk6XG4gICAgICAoKHRoaXM6IE5hdmlnYXRpb24sIGV2OiBOYXZpZ2F0aW9uQ3VycmVudEVudHJ5Q2hhbmdlRXZlbnQpID0+IGFueSl8bnVsbCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bmltcGxlbWVudGVkJyk7XG4gIH1cblxuICBzZXQgb25uYXZpZ2F0ZXN1Y2Nlc3MoX2hhbmRsZXI6ICgodGhpczogTmF2aWdhdGlvbiwgZXY6IEV2ZW50KSA9PiBhbnkpfG51bGwpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaW1wbGVtZW50ZWQnKTtcbiAgfVxuXG4gIGdldCBvbm5hdmlnYXRlc3VjY2VzcygpOiAoKHRoaXM6IE5hdmlnYXRpb24sIGV2OiBFdmVudCkgPT4gYW55KXxudWxsIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaW1wbGVtZW50ZWQnKTtcbiAgfVxuXG4gIHNldCBvbm5hdmlnYXRlZXJyb3IoX2hhbmRsZXI6ICgodGhpczogTmF2aWdhdGlvbiwgZXY6IEVycm9yRXZlbnQpID0+IGFueSl8bnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG5cbiAgZ2V0IG9ubmF2aWdhdGVlcnJvcigpOiAoKHRoaXM6IE5hdmlnYXRpb24sIGV2OiBFcnJvckV2ZW50KSA9PiBhbnkpfG51bGwge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG5cbiAgZ2V0IHRyYW5zaXRpb24oKTogTmF2aWdhdGlvblRyYW5zaXRpb258bnVsbCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bmltcGxlbWVudGVkJyk7XG4gIH1cblxuICB1cGRhdGVDdXJyZW50RW50cnkoX29wdGlvbnM6IE5hdmlnYXRpb25VcGRhdGVDdXJyZW50RW50cnlPcHRpb25zKTogdm9pZCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bmltcGxlbWVudGVkJyk7XG4gIH1cblxuICByZWxvYWQoX29wdGlvbnM/OiBOYXZpZ2F0aW9uUmVsb2FkT3B0aW9ucyk6IE5hdmlnYXRpb25SZXN1bHQge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG59XG5cbi8qKlxuICogRmFrZSBlcXVpdmFsZW50IG9mIHRoZSBgTmF2aWdhdGlvblJlc3VsdGAgaW50ZXJmYWNlIHdpdGhcbiAqIGBGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeWAuXG4gKi9cbmludGVyZmFjZSBGYWtlTmF2aWdhdGlvblJlc3VsdCBleHRlbmRzIE5hdmlnYXRpb25SZXN1bHQge1xuICByZWFkb25seSBjb21taXR0ZWQ6IFByb21pc2U8RmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnk+O1xuICByZWFkb25seSBmaW5pc2hlZDogUHJvbWlzZTxGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeT47XG59XG5cbi8qKlxuICogRmFrZSBlcXVpdmFsZW50IG9mIGBOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5YC5cbiAqL1xuZXhwb3J0IGNsYXNzIEZha2VOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5IGltcGxlbWVudHMgTmF2aWdhdGlvbkhpc3RvcnlFbnRyeSB7XG4gIHJlYWRvbmx5IHNhbWVEb2N1bWVudDtcblxuICByZWFkb25seSBpZDogc3RyaW5nO1xuICByZWFkb25seSBrZXk6IHN0cmluZztcbiAgcmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcbiAgcHJpdmF0ZSByZWFkb25seSBzdGF0ZTogdW5rbm93bjtcbiAgcHJpdmF0ZSByZWFkb25seSBoaXN0b3J5U3RhdGU6IHVua25vd247XG5cbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOm5vLWFueVxuICBvbmRpc3Bvc2U6ICgodGhpczogTmF2aWdhdGlvbkhpc3RvcnlFbnRyeSwgZXY6IEV2ZW50KSA9PiBhbnkpfG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcmVhZG9ubHkgdXJsOiBzdHJpbmd8bnVsbCxcbiAgICAgIHtcbiAgICAgICAgaWQsXG4gICAgICAgIGtleSxcbiAgICAgICAgaW5kZXgsXG4gICAgICAgIHNhbWVEb2N1bWVudCxcbiAgICAgICAgc3RhdGUsXG4gICAgICAgIGhpc3RvcnlTdGF0ZSxcbiAgICAgIH06IHtcbiAgICAgICAgaWQ6IHN0cmluZzsga2V5OiBzdHJpbmc7IGluZGV4OiBudW1iZXI7IHNhbWVEb2N1bWVudDogYm9vbGVhbjsgaGlzdG9yeVN0YXRlOiB1bmtub3duO1xuICAgICAgICBzdGF0ZT86IHVua25vd247XG4gICAgICB9LFxuICApIHtcbiAgICB0aGlzLmlkID0gaWQ7XG4gICAgdGhpcy5rZXkgPSBrZXk7XG4gICAgdGhpcy5pbmRleCA9IGluZGV4O1xuICAgIHRoaXMuc2FtZURvY3VtZW50ID0gc2FtZURvY3VtZW50O1xuICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcbiAgICB0aGlzLmhpc3RvcnlTdGF0ZSA9IGhpc3RvcnlTdGF0ZTtcbiAgfVxuXG4gIGdldFN0YXRlKCk6IHVua25vd24ge1xuICAgIC8vIEJ1ZGdldCBjb3B5LlxuICAgIHJldHVybiB0aGlzLnN0YXRlID8gSlNPTi5wYXJzZShKU09OLnN0cmluZ2lmeSh0aGlzLnN0YXRlKSkgOiB0aGlzLnN0YXRlO1xuICB9XG5cbiAgZ2V0SGlzdG9yeVN0YXRlKCk6IHVua25vd24ge1xuICAgIC8vIEJ1ZGdldCBjb3B5LlxuICAgIHJldHVybiB0aGlzLmhpc3RvcnlTdGF0ZSA/IEpTT04ucGFyc2UoSlNPTi5zdHJpbmdpZnkodGhpcy5oaXN0b3J5U3RhdGUpKSA6IHRoaXMuaGlzdG9yeVN0YXRlO1xuICB9XG5cbiAgYWRkRXZlbnRMaXN0ZW5lcihcbiAgICAgIHR5cGU6IHN0cmluZyxcbiAgICAgIGNhbGxiYWNrOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0LFxuICAgICAgb3B0aW9ucz86IEFkZEV2ZW50TGlzdGVuZXJPcHRpb25zfGJvb2xlYW4sXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG5cbiAgcmVtb3ZlRXZlbnRMaXN0ZW5lcihcbiAgICAgIHR5cGU6IHN0cmluZyxcbiAgICAgIGNhbGxiYWNrOiBFdmVudExpc3RlbmVyT3JFdmVudExpc3RlbmVyT2JqZWN0LFxuICAgICAgb3B0aW9ucz86IEV2ZW50TGlzdGVuZXJPcHRpb25zfGJvb2xlYW4sXG4gICkge1xuICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICB9XG5cbiAgZGlzcGF0Y2hFdmVudChldmVudDogRXZlbnQpOiBib29sZWFuIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3VuaW1wbGVtZW50ZWQnKTtcbiAgfVxufVxuXG4vKiogYE5hdmlnYXRpb25JbnRlcmNlcHRPcHRpb25zYCB3aXRoIGV4cGVyaW1lbnRhbCBjb21taXQgb3B0aW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBFeHBlcmltZW50YWxOYXZpZ2F0aW9uSW50ZXJjZXB0T3B0aW9ucyBleHRlbmRzIE5hdmlnYXRpb25JbnRlcmNlcHRPcHRpb25zIHtcbiAgY29tbWl0PzogJ2ltbWVkaWF0ZSd8J2FmdGVyLXRyYW5zaXRpb24nO1xufVxuXG4vKiogYE5hdmlnYXRlRXZlbnRgIHdpdGggZXhwZXJpbWVudGFsIGNvbW1pdCBmdW5jdGlvbi4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgRXhwZXJpbWVudGFsTmF2aWdhdGVFdmVudCBleHRlbmRzIE5hdmlnYXRlRXZlbnQge1xuICBpbnRlcmNlcHQob3B0aW9ucz86IEV4cGVyaW1lbnRhbE5hdmlnYXRpb25JbnRlcmNlcHRPcHRpb25zKTogdm9pZDtcblxuICBjb21taXQoKTogdm9pZDtcbn1cblxuLyoqXG4gKiBGYWtlIGVxdWl2YWxlbnQgb2YgYE5hdmlnYXRlRXZlbnRgLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIEZha2VOYXZpZ2F0ZUV2ZW50IGV4dGVuZHMgRXhwZXJpbWVudGFsTmF2aWdhdGVFdmVudCB7XG4gIHJlYWRvbmx5IGRlc3RpbmF0aW9uOiBGYWtlTmF2aWdhdGlvbkRlc3RpbmF0aW9uO1xufVxuXG5pbnRlcmZhY2UgSW50ZXJuYWxGYWtlTmF2aWdhdGVFdmVudCBleHRlbmRzIEZha2VOYXZpZ2F0ZUV2ZW50IHtcbiAgcmVhZG9ubHkgc2FtZURvY3VtZW50OiBib29sZWFuO1xuICByZWFkb25seSBza2lwUG9wU3RhdGU/OiBib29sZWFuO1xuICByZWFkb25seSBjb21taXRPcHRpb246ICdhZnRlci10cmFuc2l0aW9uJ3wnaW1tZWRpYXRlJztcbiAgcmVhZG9ubHkgcmVzdWx0OiBJbnRlcm5hbE5hdmlnYXRpb25SZXN1bHQ7XG5cbiAgY29tbWl0KGludGVybmFsPzogYm9vbGVhbik6IHZvaWQ7XG4gIGNhbmNlbChyZWFzb246IEVycm9yKTogdm9pZDtcbiAgZGlzcGF0Y2hlZE5hdmlnYXRlRXZlbnQoKTogdm9pZDtcbiAgdXNlckFnZW50TmF2aWdhdGVkKGVudHJ5OiBGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeSk6IHZvaWQ7XG59XG5cbi8qKlxuICogQ3JlYXRlIGEgZmFrZSBlcXVpdmFsZW50IG9mIGBOYXZpZ2F0ZUV2ZW50YC4gVGhpcyBpcyBub3QgYSBjbGFzcyBiZWNhdXNlIEVTNVxuICogdHJhbnNwaWxlZCBKYXZhU2NyaXB0IGNhbm5vdCBleHRlbmQgbmF0aXZlIEV2ZW50LlxuICovXG5mdW5jdGlvbiBjcmVhdGVGYWtlTmF2aWdhdGVFdmVudCh7XG4gIGNhbmNlbGFibGUsXG4gIGNhbkludGVyY2VwdCxcbiAgdXNlckluaXRpYXRlZCxcbiAgaGFzaENoYW5nZSxcbiAgbmF2aWdhdGlvblR5cGUsXG4gIHNpZ25hbCxcbiAgZGVzdGluYXRpb24sXG4gIGluZm8sXG4gIHNhbWVEb2N1bWVudCxcbiAgc2tpcFBvcFN0YXRlLFxuICByZXN1bHQsXG4gIHVzZXJBZ2VudENvbW1pdCxcbn06IHtcbiAgY2FuY2VsYWJsZTogYm9vbGVhbjsgY2FuSW50ZXJjZXB0OiBib29sZWFuOyB1c2VySW5pdGlhdGVkOiBib29sZWFuOyBoYXNoQ2hhbmdlOiBib29sZWFuO1xuICBuYXZpZ2F0aW9uVHlwZTogTmF2aWdhdGlvblR5cGVTdHJpbmc7XG4gIHNpZ25hbDogQWJvcnRTaWduYWw7XG4gIGRlc3RpbmF0aW9uOiBGYWtlTmF2aWdhdGlvbkRlc3RpbmF0aW9uO1xuICBpbmZvOiB1bmtub3duO1xuICBzYW1lRG9jdW1lbnQ6IGJvb2xlYW47XG4gIHNraXBQb3BTdGF0ZT86IGJvb2xlYW47IHJlc3VsdDogSW50ZXJuYWxOYXZpZ2F0aW9uUmVzdWx0OyB1c2VyQWdlbnRDb21taXQ6ICgpID0+IHZvaWQ7XG59KSB7XG4gIGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50KCduYXZpZ2F0ZScsIHtidWJibGVzOiBmYWxzZSwgY2FuY2VsYWJsZX0pIGFzIHtcbiAgICAtcmVhZG9ubHlbUCBpbiBrZXlvZiBJbnRlcm5hbEZha2VOYXZpZ2F0ZUV2ZW50XTogSW50ZXJuYWxGYWtlTmF2aWdhdGVFdmVudFtQXTtcbiAgfTtcbiAgZXZlbnQuY2FuSW50ZXJjZXB0ID0gY2FuSW50ZXJjZXB0O1xuICBldmVudC51c2VySW5pdGlhdGVkID0gdXNlckluaXRpYXRlZDtcbiAgZXZlbnQuaGFzaENoYW5nZSA9IGhhc2hDaGFuZ2U7XG4gIGV2ZW50Lm5hdmlnYXRpb25UeXBlID0gbmF2aWdhdGlvblR5cGU7XG4gIGV2ZW50LnNpZ25hbCA9IHNpZ25hbDtcbiAgZXZlbnQuZGVzdGluYXRpb24gPSBkZXN0aW5hdGlvbjtcbiAgZXZlbnQuaW5mbyA9IGluZm87XG4gIGV2ZW50LmRvd25sb2FkUmVxdWVzdCA9IG51bGw7XG4gIGV2ZW50LmZvcm1EYXRhID0gbnVsbDtcblxuICBldmVudC5zYW1lRG9jdW1lbnQgPSBzYW1lRG9jdW1lbnQ7XG4gIGV2ZW50LnNraXBQb3BTdGF0ZSA9IHNraXBQb3BTdGF0ZTtcbiAgZXZlbnQuY29tbWl0T3B0aW9uID0gJ2ltbWVkaWF0ZSc7XG5cbiAgbGV0IGhhbmRsZXJGaW5pc2hlZDogUHJvbWlzZTx2b2lkPnx1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gIGxldCBpbnRlcmNlcHRDYWxsZWQgPSBmYWxzZTtcbiAgbGV0IGRpc3BhdGNoZWROYXZpZ2F0ZUV2ZW50ID0gZmFsc2U7XG4gIGxldCBjb21taXRDYWxsZWQgPSBmYWxzZTtcblxuICBldmVudC5pbnRlcmNlcHQgPSBmdW5jdGlvbihcbiAgICAgIHRoaXM6IEludGVybmFsRmFrZU5hdmlnYXRlRXZlbnQsXG4gICAgICBvcHRpb25zPzogRXhwZXJpbWVudGFsTmF2aWdhdGlvbkludGVyY2VwdE9wdGlvbnMsXG4gICAgICApOiB2b2lkIHtcbiAgICBpbnRlcmNlcHRDYWxsZWQgPSB0cnVlO1xuICAgIGV2ZW50LnNhbWVEb2N1bWVudCA9IHRydWU7XG4gICAgY29uc3QgaGFuZGxlciA9IG9wdGlvbnM/LmhhbmRsZXI7XG4gICAgaWYgKGhhbmRsZXIpIHtcbiAgICAgIGhhbmRsZXJGaW5pc2hlZCA9IGhhbmRsZXIoKTtcbiAgICB9XG4gICAgaWYgKG9wdGlvbnM/LmNvbW1pdCkge1xuICAgICAgZXZlbnQuY29tbWl0T3B0aW9uID0gb3B0aW9ucy5jb21taXQ7XG4gICAgfVxuICAgIGlmIChvcHRpb25zPy5mb2N1c1Jlc2V0ICE9PSB1bmRlZmluZWQgfHwgb3B0aW9ucz8uc2Nyb2xsICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcigndW5pbXBsZW1lbnRlZCcpO1xuICAgIH1cbiAgfTtcblxuICBldmVudC5zY3JvbGwgPSBmdW5jdGlvbih0aGlzOiBJbnRlcm5hbEZha2VOYXZpZ2F0ZUV2ZW50KTogdm9pZCB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bmltcGxlbWVudGVkJyk7XG4gIH07XG5cbiAgZXZlbnQuY29tbWl0ID0gZnVuY3Rpb24odGhpczogSW50ZXJuYWxGYWtlTmF2aWdhdGVFdmVudCwgaW50ZXJuYWwgPSBmYWxzZSkge1xuICAgIGlmICghaW50ZXJuYWwgJiYgIWludGVyY2VwdENhbGxlZCkge1xuICAgICAgdGhyb3cgbmV3IERPTUV4Y2VwdGlvbihcbiAgICAgICAgICBgRmFpbGVkIHRvIGV4ZWN1dGUgJ2NvbW1pdCcgb24gJ05hdmlnYXRlRXZlbnQnOiBpbnRlcmNlcHQoKSBtdXN0IGJlIGAgK1xuICAgICAgICAgICAgICBgY2FsbGVkIGJlZm9yZSBjb21taXQoKS5gLFxuICAgICAgICAgICdJbnZhbGlkU3RhdGVFcnJvcicsXG4gICAgICApO1xuICAgIH1cbiAgICBpZiAoIWRpc3BhdGNoZWROYXZpZ2F0ZUV2ZW50KSB7XG4gICAgICB0aHJvdyBuZXcgRE9NRXhjZXB0aW9uKFxuICAgICAgICAgIGBGYWlsZWQgdG8gZXhlY3V0ZSAnY29tbWl0JyBvbiAnTmF2aWdhdGVFdmVudCc6IGNvbW1pdCgpIG1heSBub3QgYmUgYCArXG4gICAgICAgICAgICAgIGBjYWxsZWQgZHVyaW5nIGV2ZW50IGRpc3BhdGNoLmAsXG4gICAgICAgICAgJ0ludmFsaWRTdGF0ZUVycm9yJyxcbiAgICAgICk7XG4gICAgfVxuICAgIGlmIChjb21taXRDYWxsZWQpIHtcbiAgICAgIHRocm93IG5ldyBET01FeGNlcHRpb24oXG4gICAgICAgICAgYEZhaWxlZCB0byBleGVjdXRlICdjb21taXQnIG9uICdOYXZpZ2F0ZUV2ZW50JzogY29tbWl0KCkgYWxyZWFkeSBgICtcbiAgICAgICAgICAgICAgYGNhbGxlZC5gLFxuICAgICAgICAgICdJbnZhbGlkU3RhdGVFcnJvcicsXG4gICAgICApO1xuICAgIH1cbiAgICBjb21taXRDYWxsZWQgPSB0cnVlO1xuXG4gICAgdXNlckFnZW50Q29tbWl0KCk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgb25seS5cbiAgZXZlbnQuY2FuY2VsID0gZnVuY3Rpb24odGhpczogSW50ZXJuYWxGYWtlTmF2aWdhdGVFdmVudCwgcmVhc29uOiBFcnJvcikge1xuICAgIHJlc3VsdC5jb21taXR0ZWRSZWplY3QocmVhc29uKTtcbiAgICByZXN1bHQuZmluaXNoZWRSZWplY3QocmVhc29uKTtcbiAgfTtcblxuICAvLyBJbnRlcm5hbCBvbmx5LlxuICBldmVudC5kaXNwYXRjaGVkTmF2aWdhdGVFdmVudCA9IGZ1bmN0aW9uKHRoaXM6IEludGVybmFsRmFrZU5hdmlnYXRlRXZlbnQpIHtcbiAgICBkaXNwYXRjaGVkTmF2aWdhdGVFdmVudCA9IHRydWU7XG4gICAgaWYgKGV2ZW50LmNvbW1pdE9wdGlvbiA9PT0gJ2FmdGVyLXRyYW5zaXRpb24nKSB7XG4gICAgICAvLyBJZiBoYW5kbGVyIGZpbmlzaGVzIGJlZm9yZSBjb21taXQsIGNhbGwgY29tbWl0LlxuICAgICAgaGFuZGxlckZpbmlzaGVkPy50aGVuKFxuICAgICAgICAgICgpID0+IHtcbiAgICAgICAgICAgIGlmICghY29tbWl0Q2FsbGVkKSB7XG4gICAgICAgICAgICAgIGV2ZW50LmNvbW1pdCgvKiBpbnRlcm5hbCAqLyB0cnVlKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9LFxuICAgICAgICAgICgpID0+IHt9LFxuICAgICAgKTtcbiAgICB9XG4gICAgUHJvbWlzZS5hbGwoW3Jlc3VsdC5jb21taXR0ZWQsIGhhbmRsZXJGaW5pc2hlZF0pXG4gICAgICAgIC50aGVuKFxuICAgICAgICAgICAgKFtlbnRyeV0pID0+IHtcbiAgICAgICAgICAgICAgcmVzdWx0LmZpbmlzaGVkUmVzb2x2ZShlbnRyeSk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgKHJlYXNvbikgPT4ge1xuICAgICAgICAgICAgICByZXN1bHQuZmluaXNoZWRSZWplY3QocmVhc29uKTtcbiAgICAgICAgICAgIH0sXG4gICAgICAgICk7XG4gIH07XG5cbiAgLy8gSW50ZXJuYWwgb25seS5cbiAgZXZlbnQudXNlckFnZW50TmF2aWdhdGVkID0gZnVuY3Rpb24oXG4gICAgICB0aGlzOiBJbnRlcm5hbEZha2VOYXZpZ2F0ZUV2ZW50LFxuICAgICAgZW50cnk6IEZha2VOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5LFxuICApIHtcbiAgICByZXN1bHQuY29tbWl0dGVkUmVzb2x2ZShlbnRyeSk7XG4gIH07XG5cbiAgcmV0dXJuIGV2ZW50IGFzIEludGVybmFsRmFrZU5hdmlnYXRlRXZlbnQ7XG59XG5cbi8qKiBGYWtlIGVxdWl2YWxlbnQgb2YgYE5hdmlnYXRpb25DdXJyZW50RW50cnlDaGFuZ2VFdmVudGAuICovXG5leHBvcnQgaW50ZXJmYWNlIEZha2VOYXZpZ2F0aW9uQ3VycmVudEVudHJ5Q2hhbmdlRXZlbnQgZXh0ZW5kcyBOYXZpZ2F0aW9uQ3VycmVudEVudHJ5Q2hhbmdlRXZlbnQge1xuICByZWFkb25seSBmcm9tOiBGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeTtcbn1cblxuLyoqXG4gKiBDcmVhdGUgYSBmYWtlIGVxdWl2YWxlbnQgb2YgYE5hdmlnYXRpb25DdXJyZW50RW50cnlDaGFuZ2VgLiBUaGlzIGRvZXMgbm90IHVzZVxuICogYSBjbGFzcyBiZWNhdXNlIEVTNSB0cmFuc3BpbGVkIEphdmFTY3JpcHQgY2Fubm90IGV4dGVuZCBuYXRpdmUgRXZlbnQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZUZha2VOYXZpZ2F0aW9uQ3VycmVudEVudHJ5Q2hhbmdlRXZlbnQoe1xuICBmcm9tLFxuICBuYXZpZ2F0aW9uVHlwZSxcbn06IHtmcm9tOiBGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeTsgbmF2aWdhdGlvblR5cGU6IE5hdmlnYXRpb25UeXBlU3RyaW5nO30pIHtcbiAgY29uc3QgZXZlbnQgPSBuZXcgRXZlbnQoJ2N1cnJlbnRlbnRyeWNoYW5nZScsIHtcbiAgICAgICAgICAgICAgICAgIGJ1YmJsZXM6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgY2FuY2VsYWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgfSkgYXMge1xuICAgIC1yZWFkb25seVtQIGluIGtleW9mIE5hdmlnYXRpb25DdXJyZW50RW50cnlDaGFuZ2VFdmVudF06IE5hdmlnYXRpb25DdXJyZW50RW50cnlDaGFuZ2VFdmVudFtQXTtcbiAgfTtcbiAgZXZlbnQuZnJvbSA9IGZyb207XG4gIGV2ZW50Lm5hdmlnYXRpb25UeXBlID0gbmF2aWdhdGlvblR5cGU7XG4gIHJldHVybiBldmVudCBhcyBGYWtlTmF2aWdhdGlvbkN1cnJlbnRFbnRyeUNoYW5nZUV2ZW50O1xufVxuXG4vKipcbiAqIENyZWF0ZSBhIGZha2UgZXF1aXZhbGVudCBvZiBgUG9wU3RhdGVFdmVudGAuIFRoaXMgZG9lcyBub3QgdXNlIGEgY2xhc3NcbiAqIGJlY2F1c2UgRVM1IHRyYW5zcGlsZWQgSmF2YVNjcmlwdCBjYW5ub3QgZXh0ZW5kIG5hdGl2ZSBFdmVudC5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlUG9wU3RhdGVFdmVudCh7c3RhdGV9OiB7c3RhdGU6IHVua25vd259KSB7XG4gIGNvbnN0IGV2ZW50ID0gbmV3IEV2ZW50KCdwb3BzdGF0ZScsIHtcbiAgICAgICAgICAgICAgICAgIGJ1YmJsZXM6IGZhbHNlLFxuICAgICAgICAgICAgICAgICAgY2FuY2VsYWJsZTogZmFsc2UsXG4gICAgICAgICAgICAgICAgfSkgYXMgey1yZWFkb25seVtQIGluIGtleW9mIFBvcFN0YXRlRXZlbnRdOiBQb3BTdGF0ZUV2ZW50W1BdfTtcbiAgZXZlbnQuc3RhdGUgPSBzdGF0ZTtcbiAgcmV0dXJuIGV2ZW50IGFzIFBvcFN0YXRlRXZlbnQ7XG59XG5cbi8qKlxuICogRmFrZSBlcXVpdmFsZW50IG9mIGBOYXZpZ2F0aW9uRGVzdGluYXRpb25gLlxuICovXG5leHBvcnQgY2xhc3MgRmFrZU5hdmlnYXRpb25EZXN0aW5hdGlvbiBpbXBsZW1lbnRzIE5hdmlnYXRpb25EZXN0aW5hdGlvbiB7XG4gIHJlYWRvbmx5IHVybDogc3RyaW5nO1xuICByZWFkb25seSBzYW1lRG9jdW1lbnQ6IGJvb2xlYW47XG4gIHJlYWRvbmx5IGtleTogc3RyaW5nfG51bGw7XG4gIHJlYWRvbmx5IGlkOiBzdHJpbmd8bnVsbDtcbiAgcmVhZG9ubHkgaW5kZXg6IG51bWJlcjtcblxuICBwcml2YXRlIHJlYWRvbmx5IHN0YXRlPzogdW5rbm93bjtcbiAgcHJpdmF0ZSByZWFkb25seSBoaXN0b3J5U3RhdGU6IHVua25vd247XG5cbiAgY29uc3RydWN0b3Ioe1xuICAgIHVybCxcbiAgICBzYW1lRG9jdW1lbnQsXG4gICAgaGlzdG9yeVN0YXRlLFxuICAgIHN0YXRlLFxuICAgIGtleSA9IG51bGwsXG4gICAgaWQgPSBudWxsLFxuICAgIGluZGV4ID0gLTEsXG4gIH06IHtcbiAgICB1cmw6IHN0cmluZzsgc2FtZURvY3VtZW50OiBib29sZWFuOyBoaXN0b3J5U3RhdGU6IHVua25vd247XG4gICAgc3RhdGU/OiB1bmtub3duO1xuICAgIGtleT86IHN0cmluZyB8IG51bGw7XG4gICAgaWQ/OiBzdHJpbmcgfCBudWxsO1xuICAgIGluZGV4PzogbnVtYmVyO1xuICB9KSB7XG4gICAgdGhpcy51cmwgPSB1cmw7XG4gICAgdGhpcy5zYW1lRG9jdW1lbnQgPSBzYW1lRG9jdW1lbnQ7XG4gICAgdGhpcy5zdGF0ZSA9IHN0YXRlO1xuICAgIHRoaXMuaGlzdG9yeVN0YXRlID0gaGlzdG9yeVN0YXRlO1xuICAgIHRoaXMua2V5ID0ga2V5O1xuICAgIHRoaXMuaWQgPSBpZDtcbiAgICB0aGlzLmluZGV4ID0gaW5kZXg7XG4gIH1cblxuICBnZXRTdGF0ZSgpOiB1bmtub3duIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZTtcbiAgfVxuXG4gIGdldEhpc3RvcnlTdGF0ZSgpOiB1bmtub3duIHtcbiAgICByZXR1cm4gdGhpcy5oaXN0b3J5U3RhdGU7XG4gIH1cbn1cblxuLyoqIFV0aWxpdHkgZnVuY3Rpb24gdG8gZGV0ZXJtaW5lIHdoZXRoZXIgdHdvIFVybExpa2UgaGF2ZSB0aGUgc2FtZSBoYXNoLiAqL1xuZnVuY3Rpb24gaXNIYXNoQ2hhbmdlKGZyb206IFVSTCwgdG86IFVSTCk6IGJvb2xlYW4ge1xuICByZXR1cm4gKFxuICAgICAgdG8uaGFzaCAhPT0gZnJvbS5oYXNoICYmIHRvLmhvc3RuYW1lID09PSBmcm9tLmhvc3RuYW1lICYmIHRvLnBhdGhuYW1lID09PSBmcm9tLnBhdGhuYW1lICYmXG4gICAgICB0by5zZWFyY2ggPT09IGZyb20uc2VhcmNoKTtcbn1cblxuLyoqIEludGVybmFsIHV0aWxpdHkgY2xhc3MgZm9yIHJlcHJlc2VudGluZyB0aGUgcmVzdWx0IG9mIGEgbmF2aWdhdGlvbi4gICovXG5jbGFzcyBJbnRlcm5hbE5hdmlnYXRpb25SZXN1bHQge1xuICBjb21taXR0ZWRSZXNvbHZlITogKGVudHJ5OiBGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeSkgPT4gdm9pZDtcbiAgY29tbWl0dGVkUmVqZWN0ITogKHJlYXNvbjogRXJyb3IpID0+IHZvaWQ7XG4gIGZpbmlzaGVkUmVzb2x2ZSE6IChlbnRyeTogRmFrZU5hdmlnYXRpb25IaXN0b3J5RW50cnkpID0+IHZvaWQ7XG4gIGZpbmlzaGVkUmVqZWN0ITogKHJlYXNvbjogRXJyb3IpID0+IHZvaWQ7XG4gIHJlYWRvbmx5IGNvbW1pdHRlZDogUHJvbWlzZTxGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeT47XG4gIHJlYWRvbmx5IGZpbmlzaGVkOiBQcm9taXNlPEZha2VOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5PjtcbiAgZ2V0IHNpZ25hbCgpOiBBYm9ydFNpZ25hbCB7XG4gICAgcmV0dXJuIHRoaXMuYWJvcnRDb250cm9sbGVyLnNpZ25hbDtcbiAgfVxuICBwcml2YXRlIHJlYWRvbmx5IGFib3J0Q29udHJvbGxlciA9IG5ldyBBYm9ydENvbnRyb2xsZXIoKTtcblxuICBjb25zdHJ1Y3RvcigpIHtcbiAgICB0aGlzLmNvbW1pdHRlZCA9IG5ldyBQcm9taXNlPEZha2VOYXZpZ2F0aW9uSGlzdG9yeUVudHJ5PihcbiAgICAgICAgKHJlc29sdmUsIHJlamVjdCkgPT4ge1xuICAgICAgICAgIHRoaXMuY29tbWl0dGVkUmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgICAgdGhpcy5jb21taXR0ZWRSZWplY3QgPSByZWplY3Q7XG4gICAgICAgIH0sXG4gICAgKTtcblxuICAgIHRoaXMuZmluaXNoZWQgPSBuZXcgUHJvbWlzZTxGYWtlTmF2aWdhdGlvbkhpc3RvcnlFbnRyeT4oXG4gICAgICAgIGFzeW5jIChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgICB0aGlzLmZpbmlzaGVkUmVzb2x2ZSA9IHJlc29sdmU7XG4gICAgICAgICAgdGhpcy5maW5pc2hlZFJlamVjdCA9IChyZWFzb246IEVycm9yKSA9PiB7XG4gICAgICAgICAgICByZWplY3QocmVhc29uKTtcbiAgICAgICAgICAgIHRoaXMuYWJvcnRDb250cm9sbGVyLmFib3J0KHJlYXNvbik7XG4gICAgICAgICAgfTtcbiAgICAgICAgfSxcbiAgICApO1xuICAgIC8vIEFsbCByZWplY3Rpb25zIGFyZSBoYW5kbGVkLlxuICAgIHRoaXMuY29tbWl0dGVkLmNhdGNoKCgpID0+IHt9KTtcbiAgICB0aGlzLmZpbmlzaGVkLmNhdGNoKCgpID0+IHt9KTtcbiAgfVxufVxuXG4vKiogSW50ZXJuYWwgb3B0aW9ucyBmb3IgcGVyZm9ybWluZyBhIG5hdmlnYXRlLiAqL1xuaW50ZXJmYWNlIEludGVybmFsTmF2aWdhdGVPcHRpb25zIHtcbiAgbmF2aWdhdGlvblR5cGU6IE5hdmlnYXRpb25UeXBlU3RyaW5nO1xuICBjYW5jZWxhYmxlOiBib29sZWFuO1xuICBjYW5JbnRlcmNlcHQ6IGJvb2xlYW47XG4gIHVzZXJJbml0aWF0ZWQ6IGJvb2xlYW47XG4gIGhhc2hDaGFuZ2U6IGJvb2xlYW47XG4gIGluZm8/OiB1bmtub3duO1xuICBza2lwUG9wU3RhdGU/OiBib29sZWFuO1xufVxuIl19