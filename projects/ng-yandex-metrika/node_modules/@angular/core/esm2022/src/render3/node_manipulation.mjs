/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { consumerDestroy } from '@angular/core/primitives/signals';
import { hasInSkipHydrationBlockFlag } from '../hydration/skip_hydration';
import { ViewEncapsulation } from '../metadata/view';
import { RendererStyleFlags2 } from '../render/api_flags';
import { addToArray, removeFromArray } from '../util/array_utils';
import { assertDefined, assertEqual, assertFunction, assertNumber, assertString } from '../util/assert';
import { escapeCommentText } from '../util/dom';
import { assertLContainer, assertLView, assertParentView, assertProjectionSlots, assertTNodeForLView } from './assert';
import { attachPatchData } from './context_discovery';
import { icuContainerIterate } from './i18n/i18n_tree_shaking';
import { CONTAINER_HEADER_OFFSET, LContainerFlags, MOVED_VIEWS, NATIVE } from './interfaces/container';
import { NodeInjectorFactory } from './interfaces/injector';
import { unregisterLView } from './interfaces/lview_tracking';
import { isLContainer, isLView } from './interfaces/type_checks';
import { CHILD_HEAD, CLEANUP, DECLARATION_COMPONENT_VIEW, DECLARATION_LCONTAINER, FLAGS, HOST, NEXT, ON_DESTROY_HOOKS, PARENT, QUERIES, REACTIVE_TEMPLATE_CONSUMER, RENDERER, T_HOST, TVIEW } from './interfaces/view';
import { assertTNodeType } from './node_assert';
import { profiler } from './profiler';
import { setUpAttributes } from './util/attrs_utils';
import { getLViewParent } from './util/view_traversal_utils';
import { getNativeByTNode, unwrapRNode, updateAncestorTraversalFlagsOnAttach } from './util/view_utils';
/**
 * NOTE: for performance reasons, the possible actions are inlined within the function instead of
 * being passed as an argument.
 */
function applyToElementOrContainer(action, renderer, parent, lNodeToHandle, beforeNode) {
    // If this slot was allocated for a text node dynamically created by i18n, the text node itself
    // won't be created until i18nApply() in the update block, so this node should be skipped.
    // For more info, see "ICU expressions should work inside an ngTemplateOutlet inside an ngFor"
    // in `i18n_spec.ts`.
    if (lNodeToHandle != null) {
        let lContainer;
        let isComponent = false;
        // We are expecting an RNode, but in the case of a component or LContainer the `RNode` is
        // wrapped in an array which needs to be unwrapped. We need to know if it is a component and if
        // it has LContainer so that we can process all of those cases appropriately.
        if (isLContainer(lNodeToHandle)) {
            lContainer = lNodeToHandle;
        }
        else if (isLView(lNodeToHandle)) {
            isComponent = true;
            ngDevMode && assertDefined(lNodeToHandle[HOST], 'HOST must be defined for a component LView');
            lNodeToHandle = lNodeToHandle[HOST];
        }
        const rNode = unwrapRNode(lNodeToHandle);
        if (action === 0 /* WalkTNodeTreeAction.Create */ && parent !== null) {
            if (beforeNode == null) {
                nativeAppendChild(renderer, parent, rNode);
            }
            else {
                nativeInsertBefore(renderer, parent, rNode, beforeNode || null, true);
            }
        }
        else if (action === 1 /* WalkTNodeTreeAction.Insert */ && parent !== null) {
            nativeInsertBefore(renderer, parent, rNode, beforeNode || null, true);
        }
        else if (action === 2 /* WalkTNodeTreeAction.Detach */) {
            nativeRemoveNode(renderer, rNode, isComponent);
        }
        else if (action === 3 /* WalkTNodeTreeAction.Destroy */) {
            ngDevMode && ngDevMode.rendererDestroyNode++;
            renderer.destroyNode(rNode);
        }
        if (lContainer != null) {
            applyContainer(renderer, action, lContainer, parent, beforeNode);
        }
    }
}
export function createTextNode(renderer, value) {
    ngDevMode && ngDevMode.rendererCreateTextNode++;
    ngDevMode && ngDevMode.rendererSetText++;
    return renderer.createText(value);
}
export function updateTextNode(renderer, rNode, value) {
    ngDevMode && ngDevMode.rendererSetText++;
    renderer.setValue(rNode, value);
}
export function createCommentNode(renderer, value) {
    ngDevMode && ngDevMode.rendererCreateComment++;
    return renderer.createComment(escapeCommentText(value));
}
/**
 * Creates a native element from a tag name, using a renderer.
 * @param renderer A renderer to use
 * @param name the tag name
 * @param namespace Optional namespace for element.
 * @returns the element created
 */
export function createElementNode(renderer, name, namespace) {
    ngDevMode && ngDevMode.rendererCreateElement++;
    return renderer.createElement(name, namespace);
}
/**
 * Removes all DOM elements associated with a view.
 *
 * Because some root nodes of the view may be containers, we sometimes need
 * to propagate deeply into the nested containers to remove all elements in the
 * views beneath it.
 *
 * @param tView The `TView' of the `LView` from which elements should be added or removed
 * @param lView The view from which elements should be added or removed
 */
export function removeViewFromDOM(tView, lView) {
    const renderer = lView[RENDERER];
    applyView(tView, lView, renderer, 2 /* WalkTNodeTreeAction.Detach */, null, null);
    lView[HOST] = null;
    lView[T_HOST] = null;
}
/**
 * Adds all DOM elements associated with a view.
 *
 * Because some root nodes of the view may be containers, we sometimes need
 * to propagate deeply into the nested containers to add all elements in the
 * views beneath it.
 *
 * @param tView The `TView' of the `LView` from which elements should be added or removed
 * @param parentTNode The `TNode` where the `LView` should be attached to.
 * @param renderer Current renderer to use for DOM manipulations.
 * @param lView The view from which elements should be added or removed
 * @param parentNativeNode The parent `RElement` where it should be inserted into.
 * @param beforeNode The node before which elements should be added, if insert mode
 */
export function addViewToDOM(tView, parentTNode, renderer, lView, parentNativeNode, beforeNode) {
    lView[HOST] = parentNativeNode;
    lView[T_HOST] = parentTNode;
    applyView(tView, lView, renderer, 1 /* WalkTNodeTreeAction.Insert */, parentNativeNode, beforeNode);
}
/**
 * Detach a `LView` from the DOM by detaching its nodes.
 *
 * @param tView The `TView' of the `LView` to be detached
 * @param lView the `LView` to be detached.
 */
export function detachViewFromDOM(tView, lView) {
    applyView(tView, lView, lView[RENDERER], 2 /* WalkTNodeTreeAction.Detach */, null, null);
}
/**
 * Traverses down and up the tree of views and containers to remove listeners and
 * call onDestroy callbacks.
 *
 * Notes:
 *  - Because it's used for onDestroy calls, it needs to be bottom-up.
 *  - Must process containers instead of their views to avoid splicing
 *  when views are destroyed and re-added.
 *  - Using a while loop because it's faster than recursion
 *  - Destroy only called on movement to sibling or movement to parent (laterally or up)
 *
 *  @param rootView The view to destroy
 */
export function destroyViewTree(rootView) {
    // If the view has no children, we can clean it up and return early.
    let lViewOrLContainer = rootView[CHILD_HEAD];
    if (!lViewOrLContainer) {
        return cleanUpView(rootView[TVIEW], rootView);
    }
    while (lViewOrLContainer) {
        let next = null;
        if (isLView(lViewOrLContainer)) {
            // If LView, traverse down to child.
            next = lViewOrLContainer[CHILD_HEAD];
        }
        else {
            ngDevMode && assertLContainer(lViewOrLContainer);
            // If container, traverse down to its first LView.
            const firstView = lViewOrLContainer[CONTAINER_HEADER_OFFSET];
            if (firstView)
                next = firstView;
        }
        if (!next) {
            // Only clean up view when moving to the side or up, as destroy hooks
            // should be called in order from the bottom up.
            while (lViewOrLContainer && !lViewOrLContainer[NEXT] && lViewOrLContainer !== rootView) {
                if (isLView(lViewOrLContainer)) {
                    cleanUpView(lViewOrLContainer[TVIEW], lViewOrLContainer);
                }
                lViewOrLContainer = lViewOrLContainer[PARENT];
            }
            if (lViewOrLContainer === null)
                lViewOrLContainer = rootView;
            if (isLView(lViewOrLContainer)) {
                cleanUpView(lViewOrLContainer[TVIEW], lViewOrLContainer);
            }
            next = lViewOrLContainer && lViewOrLContainer[NEXT];
        }
        lViewOrLContainer = next;
    }
}
/**
 * Inserts a view into a container.
 *
 * This adds the view to the container's array of active views in the correct
 * position. It also adds the view's elements to the DOM if the container isn't a
 * root node of another view (in that case, the view's elements will be added when
 * the container's parent view is added later).
 *
 * @param tView The `TView' of the `LView` to insert
 * @param lView The view to insert
 * @param lContainer The container into which the view should be inserted
 * @param index Which index in the container to insert the child view into
 */
export function insertView(tView, lView, lContainer, index) {
    ngDevMode && assertLView(lView);
    ngDevMode && assertLContainer(lContainer);
    const indexInContainer = CONTAINER_HEADER_OFFSET + index;
    const containerLength = lContainer.length;
    if (index > 0) {
        // This is a new view, we need to add it to the children.
        lContainer[indexInContainer - 1][NEXT] = lView;
    }
    if (index < containerLength - CONTAINER_HEADER_OFFSET) {
        lView[NEXT] = lContainer[indexInContainer];
        addToArray(lContainer, CONTAINER_HEADER_OFFSET + index, lView);
    }
    else {
        lContainer.push(lView);
        lView[NEXT] = null;
    }
    lView[PARENT] = lContainer;
    // track views where declaration and insertion points are different
    const declarationLContainer = lView[DECLARATION_LCONTAINER];
    if (declarationLContainer !== null && lContainer !== declarationLContainer) {
        trackMovedView(declarationLContainer, lView);
    }
    // notify query that a new view has been added
    const lQueries = lView[QUERIES];
    if (lQueries !== null) {
        lQueries.insertView(tView);
    }
    updateAncestorTraversalFlagsOnAttach(lView);
    // Sets the attached flag
    lView[FLAGS] |= 128 /* LViewFlags.Attached */;
}
/**
 * Track views created from the declaration container (TemplateRef) and inserted into a
 * different LContainer.
 */
function trackMovedView(declarationContainer, lView) {
    ngDevMode && assertDefined(lView, 'LView required');
    ngDevMode && assertLContainer(declarationContainer);
    const movedViews = declarationContainer[MOVED_VIEWS];
    const insertedLContainer = lView[PARENT];
    ngDevMode && assertLContainer(insertedLContainer);
    const insertedComponentLView = insertedLContainer[PARENT][DECLARATION_COMPONENT_VIEW];
    ngDevMode && assertDefined(insertedComponentLView, 'Missing insertedComponentLView');
    const declaredComponentLView = lView[DECLARATION_COMPONENT_VIEW];
    ngDevMode && assertDefined(declaredComponentLView, 'Missing declaredComponentLView');
    if (declaredComponentLView !== insertedComponentLView) {
        // At this point the declaration-component is not same as insertion-component; this means that
        // this is a transplanted view. Mark the declared lView as having transplanted views so that
        // those views can participate in CD.
        declarationContainer[FLAGS] |= LContainerFlags.HasTransplantedViews;
    }
    if (movedViews === null) {
        declarationContainer[MOVED_VIEWS] = [lView];
    }
    else {
        movedViews.push(lView);
    }
}
function detachMovedView(declarationContainer, lView) {
    ngDevMode && assertLContainer(declarationContainer);
    ngDevMode &&
        assertDefined(declarationContainer[MOVED_VIEWS], 'A projected view should belong to a non-empty projected views collection');
    const movedViews = declarationContainer[MOVED_VIEWS];
    const declarationViewIndex = movedViews.indexOf(lView);
    const insertionLContainer = lView[PARENT];
    ngDevMode && assertLContainer(insertionLContainer);
    movedViews.splice(declarationViewIndex, 1);
}
/**
 * Detaches a view from a container.
 *
 * This method removes the view from the container's array of active views. It also
 * removes the view's elements from the DOM.
 *
 * @param lContainer The container from which to detach a view
 * @param removeIndex The index of the view to detach
 * @returns Detached LView instance.
 */
export function detachView(lContainer, removeIndex) {
    if (lContainer.length <= CONTAINER_HEADER_OFFSET)
        return;
    const indexInContainer = CONTAINER_HEADER_OFFSET + removeIndex;
    const viewToDetach = lContainer[indexInContainer];
    if (viewToDetach) {
        const declarationLContainer = viewToDetach[DECLARATION_LCONTAINER];
        if (declarationLContainer !== null && declarationLContainer !== lContainer) {
            detachMovedView(declarationLContainer, viewToDetach);
        }
        if (removeIndex > 0) {
            lContainer[indexInContainer - 1][NEXT] = viewToDetach[NEXT];
        }
        const removedLView = removeFromArray(lContainer, CONTAINER_HEADER_OFFSET + removeIndex);
        removeViewFromDOM(viewToDetach[TVIEW], viewToDetach);
        // notify query that a view has been removed
        const lQueries = removedLView[QUERIES];
        if (lQueries !== null) {
            lQueries.detachView(removedLView[TVIEW]);
        }
        viewToDetach[PARENT] = null;
        viewToDetach[NEXT] = null;
        // Unsets the attached flag
        viewToDetach[FLAGS] &= ~128 /* LViewFlags.Attached */;
    }
    return viewToDetach;
}
/**
 * A standalone function which destroys an LView,
 * conducting clean up (e.g. removing listeners, calling onDestroys).
 *
 * @param tView The `TView' of the `LView` to be destroyed
 * @param lView The view to be destroyed.
 */
export function destroyLView(tView, lView) {
    if (!(lView[FLAGS] & 256 /* LViewFlags.Destroyed */)) {
        const renderer = lView[RENDERER];
        if (renderer.destroyNode) {
            applyView(tView, lView, renderer, 3 /* WalkTNodeTreeAction.Destroy */, null, null);
        }
        destroyViewTree(lView);
    }
}
/**
 * Calls onDestroys hooks for all directives and pipes in a given view and then removes all
 * listeners. Listeners are removed as the last step so events delivered in the onDestroys hooks
 * can be propagated to @Output listeners.
 *
 * @param tView `TView` for the `LView` to clean up.
 * @param lView The LView to clean up
 */
function cleanUpView(tView, lView) {
    if (!(lView[FLAGS] & 256 /* LViewFlags.Destroyed */)) {
        // Usually the Attached flag is removed when the view is detached from its parent, however
        // if it's a root view, the flag won't be unset hence why we're also removing on destroy.
        lView[FLAGS] &= ~128 /* LViewFlags.Attached */;
        // Mark the LView as destroyed *before* executing the onDestroy hooks. An onDestroy hook
        // runs arbitrary user code, which could include its own `viewRef.destroy()` (or similar). If
        // We don't flag the view as destroyed before the hooks, this could lead to an infinite loop.
        // This also aligns with the ViewEngine behavior. It also means that the onDestroy hook is
        // really more of an "afterDestroy" hook if you think about it.
        lView[FLAGS] |= 256 /* LViewFlags.Destroyed */;
        lView[REACTIVE_TEMPLATE_CONSUMER] && consumerDestroy(lView[REACTIVE_TEMPLATE_CONSUMER]);
        executeOnDestroys(tView, lView);
        processCleanups(tView, lView);
        // For component views only, the local renderer is destroyed at clean up time.
        if (lView[TVIEW].type === 1 /* TViewType.Component */) {
            ngDevMode && ngDevMode.rendererDestroy++;
            lView[RENDERER].destroy();
        }
        const declarationContainer = lView[DECLARATION_LCONTAINER];
        // we are dealing with an embedded view that is still inserted into a container
        if (declarationContainer !== null && isLContainer(lView[PARENT])) {
            // and this is a projected view
            if (declarationContainer !== lView[PARENT]) {
                detachMovedView(declarationContainer, lView);
            }
            // For embedded views still attached to a container: remove query result from this view.
            const lQueries = lView[QUERIES];
            if (lQueries !== null) {
                lQueries.detachView(tView);
            }
        }
        // Unregister the view once everything else has been cleaned up.
        unregisterLView(lView);
    }
}
/** Removes listeners and unsubscribes from output subscriptions */
function processCleanups(tView, lView) {
    const tCleanup = tView.cleanup;
    const lCleanup = lView[CLEANUP];
    if (tCleanup !== null) {
        for (let i = 0; i < tCleanup.length - 1; i += 2) {
            if (typeof tCleanup[i] === 'string') {
                // This is a native DOM listener. It will occupy 4 entries in the TCleanup array (hence i +=
                // 2 at the end of this block).
                const targetIdx = tCleanup[i + 3];
                ngDevMode && assertNumber(targetIdx, 'cleanup target must be a number');
                if (targetIdx >= 0) {
                    // unregister
                    lCleanup[targetIdx]();
                }
                else {
                    // Subscription
                    lCleanup[-targetIdx].unsubscribe();
                }
                i += 2;
            }
            else {
                // This is a cleanup function that is grouped with the index of its context
                const context = lCleanup[tCleanup[i + 1]];
                tCleanup[i].call(context);
            }
        }
    }
    if (lCleanup !== null) {
        lView[CLEANUP] = null;
    }
    const destroyHooks = lView[ON_DESTROY_HOOKS];
    if (destroyHooks !== null) {
        // Reset the ON_DESTROY_HOOKS array before iterating over it to prevent hooks that unregister
        // themselves from mutating the array during iteration.
        lView[ON_DESTROY_HOOKS] = null;
        for (let i = 0; i < destroyHooks.length; i++) {
            const destroyHooksFn = destroyHooks[i];
            ngDevMode && assertFunction(destroyHooksFn, 'Expecting destroy hook to be a function.');
            destroyHooksFn();
        }
    }
}
/** Calls onDestroy hooks for this view */
function executeOnDestroys(tView, lView) {
    let destroyHooks;
    if (tView != null && (destroyHooks = tView.destroyHooks) != null) {
        for (let i = 0; i < destroyHooks.length; i += 2) {
            const context = lView[destroyHooks[i]];
            // Only call the destroy hook if the context has been requested.
            if (!(context instanceof NodeInjectorFactory)) {
                const toCall = destroyHooks[i + 1];
                if (Array.isArray(toCall)) {
                    for (let j = 0; j < toCall.length; j += 2) {
                        const callContext = context[toCall[j]];
                        const hook = toCall[j + 1];
                        profiler(4 /* ProfilerEvent.LifecycleHookStart */, callContext, hook);
                        try {
                            hook.call(callContext);
                        }
                        finally {
                            profiler(5 /* ProfilerEvent.LifecycleHookEnd */, callContext, hook);
                        }
                    }
                }
                else {
                    profiler(4 /* ProfilerEvent.LifecycleHookStart */, context, toCall);
                    try {
                        toCall.call(context);
                    }
                    finally {
                        profiler(5 /* ProfilerEvent.LifecycleHookEnd */, context, toCall);
                    }
                }
            }
        }
    }
}
/**
 * Returns a native element if a node can be inserted into the given parent.
 *
 * There are two reasons why we may not be able to insert a element immediately.
 * - Projection: When creating a child content element of a component, we have to skip the
 *   insertion because the content of a component will be projected.
 *   `<component><content>delayed due to projection</content></component>`
 * - Parent container is disconnected: This can happen when we are inserting a view into
 *   parent container, which itself is disconnected. For example the parent container is part
 *   of a View which has not be inserted or is made for projection but has not been inserted
 *   into destination.
 *
 * @param tView: Current `TView`.
 * @param tNode: `TNode` for which we wish to retrieve render parent.
 * @param lView: Current `LView`.
 */
export function getParentRElement(tView, tNode, lView) {
    return getClosestRElement(tView, tNode.parent, lView);
}
/**
 * Get closest `RElement` or `null` if it can't be found.
 *
 * If `TNode` is `TNodeType.Element` => return `RElement` at `LView[tNode.index]` location.
 * If `TNode` is `TNodeType.ElementContainer|IcuContain` => return the parent (recursively).
 * If `TNode` is `null` then return host `RElement`:
 *   - return `null` if projection
 *   - return `null` if parent container is disconnected (we have no parent.)
 *
 * @param tView: Current `TView`.
 * @param tNode: `TNode` for which we wish to retrieve `RElement` (or `null` if host element is
 *     needed).
 * @param lView: Current `LView`.
 * @returns `null` if the `RElement` can't be determined at this time (no parent / projection)
 */
export function getClosestRElement(tView, tNode, lView) {
    let parentTNode = tNode;
    // Skip over element and ICU containers as those are represented by a comment node and
    // can't be used as a render parent.
    while (parentTNode !== null &&
        (parentTNode.type & (8 /* TNodeType.ElementContainer */ | 32 /* TNodeType.Icu */))) {
        tNode = parentTNode;
        parentTNode = tNode.parent;
    }
    // If the parent tNode is null, then we are inserting across views: either into an embedded view
    // or a component view.
    if (parentTNode === null) {
        // We are inserting a root element of the component view into the component host element and
        // it should always be eager.
        return lView[HOST];
    }
    else {
        ngDevMode && assertTNodeType(parentTNode, 3 /* TNodeType.AnyRNode */ | 4 /* TNodeType.Container */);
        const { componentOffset } = parentTNode;
        if (componentOffset > -1) {
            ngDevMode && assertTNodeForLView(parentTNode, lView);
            const { encapsulation } = tView.data[parentTNode.directiveStart + componentOffset];
            // We've got a parent which is an element in the current view. We just need to verify if the
            // parent element is not a component. Component's content nodes are not inserted immediately
            // because they will be projected, and so doing insert at this point would be wasteful.
            // Since the projection would then move it to its final destination. Note that we can't
            // make this assumption when using the Shadow DOM, because the native projection placeholders
            // (<content> or <slot>) have to be in place as elements are being inserted.
            if (encapsulation === ViewEncapsulation.None ||
                encapsulation === ViewEncapsulation.Emulated) {
                return null;
            }
        }
        return getNativeByTNode(parentTNode, lView);
    }
}
/**
 * Inserts a native node before another native node for a given parent.
 * This is a utility function that can be used when native nodes were determined.
 */
export function nativeInsertBefore(renderer, parent, child, beforeNode, isMove) {
    ngDevMode && ngDevMode.rendererInsertBefore++;
    renderer.insertBefore(parent, child, beforeNode, isMove);
}
function nativeAppendChild(renderer, parent, child) {
    ngDevMode && ngDevMode.rendererAppendChild++;
    ngDevMode && assertDefined(parent, 'parent node must be defined');
    renderer.appendChild(parent, child);
}
function nativeAppendOrInsertBefore(renderer, parent, child, beforeNode, isMove) {
    if (beforeNode !== null) {
        nativeInsertBefore(renderer, parent, child, beforeNode, isMove);
    }
    else {
        nativeAppendChild(renderer, parent, child);
    }
}
/** Removes a node from the DOM given its native parent. */
function nativeRemoveChild(renderer, parent, child, isHostElement) {
    renderer.removeChild(parent, child, isHostElement);
}
/** Checks if an element is a `<template>` node. */
function isTemplateNode(node) {
    return node.tagName === 'TEMPLATE' && node.content !== undefined;
}
/**
 * Returns a native parent of a given native node.
 */
export function nativeParentNode(renderer, node) {
    return renderer.parentNode(node);
}
/**
 * Returns a native sibling of a given native node.
 */
export function nativeNextSibling(renderer, node) {
    return renderer.nextSibling(node);
}
/**
 * Find a node in front of which `currentTNode` should be inserted.
 *
 * This method determines the `RNode` in front of which we should insert the `currentRNode`. This
 * takes `TNode.insertBeforeIndex` into account if i18n code has been invoked.
 *
 * @param parentTNode parent `TNode`
 * @param currentTNode current `TNode` (The node which we would like to insert into the DOM)
 * @param lView current `LView`
 */
function getInsertInFrontOfRNode(parentTNode, currentTNode, lView) {
    return _getInsertInFrontOfRNodeWithI18n(parentTNode, currentTNode, lView);
}
/**
 * Find a node in front of which `currentTNode` should be inserted. (Does not take i18n into
 * account)
 *
 * This method determines the `RNode` in front of which we should insert the `currentRNode`. This
 * does not take `TNode.insertBeforeIndex` into account.
 *
 * @param parentTNode parent `TNode`
 * @param currentTNode current `TNode` (The node which we would like to insert into the DOM)
 * @param lView current `LView`
 */
export function getInsertInFrontOfRNodeWithNoI18n(parentTNode, currentTNode, lView) {
    if (parentTNode.type & (8 /* TNodeType.ElementContainer */ | 32 /* TNodeType.Icu */)) {
        return getNativeByTNode(parentTNode, lView);
    }
    return null;
}
/**
 * Tree shakable boundary for `getInsertInFrontOfRNodeWithI18n` function.
 *
 * This function will only be set if i18n code runs.
 */
let _getInsertInFrontOfRNodeWithI18n = getInsertInFrontOfRNodeWithNoI18n;
/**
 * Tree shakable boundary for `processI18nInsertBefore` function.
 *
 * This function will only be set if i18n code runs.
 */
let _processI18nInsertBefore;
export function setI18nHandling(getInsertInFrontOfRNodeWithI18n, processI18nInsertBefore) {
    _getInsertInFrontOfRNodeWithI18n = getInsertInFrontOfRNodeWithI18n;
    _processI18nInsertBefore = processI18nInsertBefore;
}
/**
 * Appends the `child` native node (or a collection of nodes) to the `parent`.
 *
 * @param tView The `TView' to be appended
 * @param lView The current LView
 * @param childRNode The native child (or children) that should be appended
 * @param childTNode The TNode of the child element
 */
export function appendChild(tView, lView, childRNode, childTNode) {
    const parentRNode = getParentRElement(tView, childTNode, lView);
    const renderer = lView[RENDERER];
    const parentTNode = childTNode.parent || lView[T_HOST];
    const anchorNode = getInsertInFrontOfRNode(parentTNode, childTNode, lView);
    if (parentRNode != null) {
        if (Array.isArray(childRNode)) {
            for (let i = 0; i < childRNode.length; i++) {
                nativeAppendOrInsertBefore(renderer, parentRNode, childRNode[i], anchorNode, false);
            }
        }
        else {
            nativeAppendOrInsertBefore(renderer, parentRNode, childRNode, anchorNode, false);
        }
    }
    _processI18nInsertBefore !== undefined &&
        _processI18nInsertBefore(renderer, childTNode, lView, childRNode, parentRNode);
}
/**
 * Returns the first native node for a given LView, starting from the provided TNode.
 *
 * Native nodes are returned in the order in which those appear in the native tree (DOM).
 */
export function getFirstNativeNode(lView, tNode) {
    if (tNode !== null) {
        ngDevMode &&
            assertTNodeType(tNode, 3 /* TNodeType.AnyRNode */ | 12 /* TNodeType.AnyContainer */ | 32 /* TNodeType.Icu */ | 16 /* TNodeType.Projection */);
        const tNodeType = tNode.type;
        if (tNodeType & 3 /* TNodeType.AnyRNode */) {
            return getNativeByTNode(tNode, lView);
        }
        else if (tNodeType & 4 /* TNodeType.Container */) {
            return getBeforeNodeForView(-1, lView[tNode.index]);
        }
        else if (tNodeType & 8 /* TNodeType.ElementContainer */) {
            const elIcuContainerChild = tNode.child;
            if (elIcuContainerChild !== null) {
                return getFirstNativeNode(lView, elIcuContainerChild);
            }
            else {
                const rNodeOrLContainer = lView[tNode.index];
                if (isLContainer(rNodeOrLContainer)) {
                    return getBeforeNodeForView(-1, rNodeOrLContainer);
                }
                else {
                    return unwrapRNode(rNodeOrLContainer);
                }
            }
        }
        else if (tNodeType & 32 /* TNodeType.Icu */) {
            let nextRNode = icuContainerIterate(tNode, lView);
            let rNode = nextRNode();
            // If the ICU container has no nodes, than we use the ICU anchor as the node.
            return rNode || unwrapRNode(lView[tNode.index]);
        }
        else {
            const projectionNodes = getProjectionNodes(lView, tNode);
            if (projectionNodes !== null) {
                if (Array.isArray(projectionNodes)) {
                    return projectionNodes[0];
                }
                const parentView = getLViewParent(lView[DECLARATION_COMPONENT_VIEW]);
                ngDevMode && assertParentView(parentView);
                return getFirstNativeNode(parentView, projectionNodes);
            }
            else {
                return getFirstNativeNode(lView, tNode.next);
            }
        }
    }
    return null;
}
export function getProjectionNodes(lView, tNode) {
    if (tNode !== null) {
        const componentView = lView[DECLARATION_COMPONENT_VIEW];
        const componentHost = componentView[T_HOST];
        const slotIdx = tNode.projection;
        ngDevMode && assertProjectionSlots(lView);
        return componentHost.projection[slotIdx];
    }
    return null;
}
export function getBeforeNodeForView(viewIndexInContainer, lContainer) {
    const nextViewIndex = CONTAINER_HEADER_OFFSET + viewIndexInContainer + 1;
    if (nextViewIndex < lContainer.length) {
        const lView = lContainer[nextViewIndex];
        const firstTNodeOfView = lView[TVIEW].firstChild;
        if (firstTNodeOfView !== null) {
            return getFirstNativeNode(lView, firstTNodeOfView);
        }
    }
    return lContainer[NATIVE];
}
/**
 * Removes a native node itself using a given renderer. To remove the node we are looking up its
 * parent from the native tree as not all platforms / browsers support the equivalent of
 * node.remove().
 *
 * @param renderer A renderer to be used
 * @param rNode The native node that should be removed
 * @param isHostElement A flag indicating if a node to be removed is a host of a component.
 */
export function nativeRemoveNode(renderer, rNode, isHostElement) {
    ngDevMode && ngDevMode.rendererRemoveNode++;
    const nativeParent = nativeParentNode(renderer, rNode);
    if (nativeParent) {
        nativeRemoveChild(renderer, nativeParent, rNode, isHostElement);
    }
}
/**
 * Clears the contents of a given RElement.
 *
 * @param rElement the native RElement to be cleared
 */
export function clearElementContents(rElement) {
    rElement.textContent = '';
}
/**
 * Performs the operation of `action` on the node. Typically this involves inserting or removing
 * nodes on the LView or projection boundary.
 */
function applyNodes(renderer, action, tNode, lView, parentRElement, beforeNode, isProjection) {
    while (tNode != null) {
        ngDevMode && assertTNodeForLView(tNode, lView);
        ngDevMode &&
            assertTNodeType(tNode, 3 /* TNodeType.AnyRNode */ | 12 /* TNodeType.AnyContainer */ | 16 /* TNodeType.Projection */ | 32 /* TNodeType.Icu */);
        const rawSlotValue = lView[tNode.index];
        const tNodeType = tNode.type;
        if (isProjection) {
            if (action === 0 /* WalkTNodeTreeAction.Create */) {
                rawSlotValue && attachPatchData(unwrapRNode(rawSlotValue), lView);
                tNode.flags |= 2 /* TNodeFlags.isProjected */;
            }
        }
        if ((tNode.flags & 32 /* TNodeFlags.isDetached */) !== 32 /* TNodeFlags.isDetached */) {
            if (tNodeType & 8 /* TNodeType.ElementContainer */) {
                applyNodes(renderer, action, tNode.child, lView, parentRElement, beforeNode, false);
                applyToElementOrContainer(action, renderer, parentRElement, rawSlotValue, beforeNode);
            }
            else if (tNodeType & 32 /* TNodeType.Icu */) {
                const nextRNode = icuContainerIterate(tNode, lView);
                let rNode;
                while (rNode = nextRNode()) {
                    applyToElementOrContainer(action, renderer, parentRElement, rNode, beforeNode);
                }
                applyToElementOrContainer(action, renderer, parentRElement, rawSlotValue, beforeNode);
            }
            else if (tNodeType & 16 /* TNodeType.Projection */) {
                applyProjectionRecursive(renderer, action, lView, tNode, parentRElement, beforeNode);
            }
            else {
                ngDevMode && assertTNodeType(tNode, 3 /* TNodeType.AnyRNode */ | 4 /* TNodeType.Container */);
                applyToElementOrContainer(action, renderer, parentRElement, rawSlotValue, beforeNode);
            }
        }
        tNode = isProjection ? tNode.projectionNext : tNode.next;
    }
}
function applyView(tView, lView, renderer, action, parentRElement, beforeNode) {
    applyNodes(renderer, action, tView.firstChild, lView, parentRElement, beforeNode, false);
}
/**
 * `applyProjection` performs operation on the projection.
 *
 * Inserting a projection requires us to locate the projected nodes from the parent component. The
 * complication is that those nodes themselves could be re-projected from their parent component.
 *
 * @param tView The `TView` of `LView` which needs to be inserted, detached, destroyed
 * @param lView The `LView` which needs to be inserted, detached, destroyed.
 * @param tProjectionNode node to project
 */
export function applyProjection(tView, lView, tProjectionNode) {
    const renderer = lView[RENDERER];
    const parentRNode = getParentRElement(tView, tProjectionNode, lView);
    const parentTNode = tProjectionNode.parent || lView[T_HOST];
    let beforeNode = getInsertInFrontOfRNode(parentTNode, tProjectionNode, lView);
    applyProjectionRecursive(renderer, 0 /* WalkTNodeTreeAction.Create */, lView, tProjectionNode, parentRNode, beforeNode);
}
/**
 * `applyProjectionRecursive` performs operation on the projection specified by `action` (insert,
 * detach, destroy)
 *
 * Inserting a projection requires us to locate the projected nodes from the parent component. The
 * complication is that those nodes themselves could be re-projected from their parent component.
 *
 * @param renderer Render to use
 * @param action action to perform (insert, detach, destroy)
 * @param lView The LView which needs to be inserted, detached, destroyed.
 * @param tProjectionNode node to project
 * @param parentRElement parent DOM element for insertion/removal.
 * @param beforeNode Before which node the insertions should happen.
 */
function applyProjectionRecursive(renderer, action, lView, tProjectionNode, parentRElement, beforeNode) {
    const componentLView = lView[DECLARATION_COMPONENT_VIEW];
    const componentNode = componentLView[T_HOST];
    ngDevMode &&
        assertEqual(typeof tProjectionNode.projection, 'number', 'expecting projection index');
    const nodeToProjectOrRNodes = componentNode.projection[tProjectionNode.projection];
    if (Array.isArray(nodeToProjectOrRNodes)) {
        // This should not exist, it is a bit of a hack. When we bootstrap a top level node and we
        // need to support passing projectable nodes, so we cheat and put them in the TNode
        // of the Host TView. (Yes we put instance info at the T Level). We can get away with it
        // because we know that TView is not shared and therefore it will not be a problem.
        // This should be refactored and cleaned up.
        for (let i = 0; i < nodeToProjectOrRNodes.length; i++) {
            const rNode = nodeToProjectOrRNodes[i];
            applyToElementOrContainer(action, renderer, parentRElement, rNode, beforeNode);
        }
    }
    else {
        let nodeToProject = nodeToProjectOrRNodes;
        const projectedComponentLView = componentLView[PARENT];
        // If a parent <ng-content> is located within a skip hydration block,
        // annotate an actual node that is being projected with the same flag too.
        if (hasInSkipHydrationBlockFlag(tProjectionNode)) {
            nodeToProject.flags |= 128 /* TNodeFlags.inSkipHydrationBlock */;
        }
        applyNodes(renderer, action, nodeToProject, projectedComponentLView, parentRElement, beforeNode, true);
    }
}
/**
 * `applyContainer` performs an operation on the container and its views as specified by
 * `action` (insert, detach, destroy)
 *
 * Inserting a Container is complicated by the fact that the container may have Views which
 * themselves have containers or projections.
 *
 * @param renderer Renderer to use
 * @param action action to perform (insert, detach, destroy)
 * @param lContainer The LContainer which needs to be inserted, detached, destroyed.
 * @param parentRElement parent DOM element for insertion/removal.
 * @param beforeNode Before which node the insertions should happen.
 */
function applyContainer(renderer, action, lContainer, parentRElement, beforeNode) {
    ngDevMode && assertLContainer(lContainer);
    const anchor = lContainer[NATIVE]; // LContainer has its own before node.
    const native = unwrapRNode(lContainer);
    // An LContainer can be created dynamically on any node by injecting ViewContainerRef.
    // Asking for a ViewContainerRef on an element will result in a creation of a separate anchor
    // node (comment in the DOM) that will be different from the LContainer's host node. In this
    // particular case we need to execute action on 2 nodes:
    // - container's host node (this is done in the executeActionOnElementOrContainer)
    // - container's host node (this is done here)
    if (anchor !== native) {
        // This is very strange to me (Misko). I would expect that the native is same as anchor. I
        // don't see a reason why they should be different, but they are.
        //
        // If they are we need to process the second anchor as well.
        applyToElementOrContainer(action, renderer, parentRElement, anchor, beforeNode);
    }
    for (let i = CONTAINER_HEADER_OFFSET; i < lContainer.length; i++) {
        const lView = lContainer[i];
        applyView(lView[TVIEW], lView, renderer, action, parentRElement, anchor);
    }
}
/**
 * Writes class/style to element.
 *
 * @param renderer Renderer to use.
 * @param isClassBased `true` if it should be written to `class` (`false` to write to `style`)
 * @param rNode The Node to write to.
 * @param prop Property to write to. This would be the class/style name.
 * @param value Value to write. If `null`/`undefined`/`false` this is considered a remove (set/add
 *        otherwise).
 */
export function applyStyling(renderer, isClassBased, rNode, prop, value) {
    if (isClassBased) {
        // We actually want JS true/false here because any truthy value should add the class
        if (!value) {
            ngDevMode && ngDevMode.rendererRemoveClass++;
            renderer.removeClass(rNode, prop);
        }
        else {
            ngDevMode && ngDevMode.rendererAddClass++;
            renderer.addClass(rNode, prop);
        }
    }
    else {
        let flags = prop.indexOf('-') === -1 ? undefined : RendererStyleFlags2.DashCase;
        if (value == null /** || value === undefined */) {
            ngDevMode && ngDevMode.rendererRemoveStyle++;
            renderer.removeStyle(rNode, prop, flags);
        }
        else {
            // A value is important if it ends with `!important`. The style
            // parser strips any semicolons at the end of the value.
            const isImportant = typeof value === 'string' ? value.endsWith('!important') : false;
            if (isImportant) {
                // !important has to be stripped from the value for it to be valid.
                value = value.slice(0, -10);
                flags |= RendererStyleFlags2.Important;
            }
            ngDevMode && ngDevMode.rendererSetStyle++;
            renderer.setStyle(rNode, prop, value, flags);
        }
    }
}
/**
 * Write `cssText` to `RElement`.
 *
 * This function does direct write without any reconciliation. Used for writing initial values, so
 * that static styling values do not pull in the style parser.
 *
 * @param renderer Renderer to use
 * @param element The element which needs to be updated.
 * @param newValue The new class list to write.
 */
export function writeDirectStyle(renderer, element, newValue) {
    ngDevMode && assertString(newValue, '\'newValue\' should be a string');
    renderer.setAttribute(element, 'style', newValue);
    ngDevMode && ngDevMode.rendererSetStyle++;
}
/**
 * Write `className` to `RElement`.
 *
 * This function does direct write without any reconciliation. Used for writing initial values, so
 * that static styling values do not pull in the style parser.
 *
 * @param renderer Renderer to use
 * @param element The element which needs to be updated.
 * @param newValue The new class list to write.
 */
export function writeDirectClass(renderer, element, newValue) {
    ngDevMode && assertString(newValue, '\'newValue\' should be a string');
    if (newValue === '') {
        // There are tests in `google3` which expect `element.getAttribute('class')` to be `null`.
        renderer.removeAttribute(element, 'class');
    }
    else {
        renderer.setAttribute(element, 'class', newValue);
    }
    ngDevMode && ngDevMode.rendererSetClassName++;
}
/** Sets up the static DOM attributes on an `RNode`. */
export function setupStaticAttributes(renderer, element, tNode) {
    const { mergedAttrs, classes, styles } = tNode;
    if (mergedAttrs !== null) {
        setUpAttributes(renderer, element, mergedAttrs);
    }
    if (classes !== null) {
        writeDirectClass(renderer, element, classes);
    }
    if (styles !== null) {
        writeDirectStyle(renderer, element, styles);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibm9kZV9tYW5pcHVsYXRpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3NyYy9yZW5kZXIzL25vZGVfbWFuaXB1bGF0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxrQ0FBa0MsQ0FBQztBQUVqRSxPQUFPLEVBQUMsMkJBQTJCLEVBQUMsTUFBTSw2QkFBNkIsQ0FBQztBQUN4RSxPQUFPLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNuRCxPQUFPLEVBQUMsbUJBQW1CLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUN4RCxPQUFPLEVBQUMsVUFBVSxFQUFFLGVBQWUsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ2hFLE9BQU8sRUFBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsWUFBWSxFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDdEcsT0FBTyxFQUFDLGlCQUFpQixFQUFDLE1BQU0sYUFBYSxDQUFDO0FBRTlDLE9BQU8sRUFBQyxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsZ0JBQWdCLEVBQUUscUJBQXFCLEVBQUUsbUJBQW1CLEVBQUMsTUFBTSxVQUFVLENBQUM7QUFDckgsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ3BELE9BQU8sRUFBQyxtQkFBbUIsRUFBQyxNQUFNLDBCQUEwQixDQUFDO0FBQzdELE9BQU8sRUFBQyx1QkFBdUIsRUFBYyxlQUFlLEVBQUUsV0FBVyxFQUFFLE1BQU0sRUFBQyxNQUFNLHdCQUF3QixDQUFDO0FBRWpILE9BQU8sRUFBQyxtQkFBbUIsRUFBQyxNQUFNLHVCQUF1QixDQUFDO0FBQzFELE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSw2QkFBNkIsQ0FBQztBQUk1RCxPQUFPLEVBQUMsWUFBWSxFQUFFLE9BQU8sRUFBQyxNQUFNLDBCQUEwQixDQUFDO0FBQy9ELE9BQU8sRUFBQyxVQUFVLEVBQUUsT0FBTyxFQUFFLDBCQUEwQixFQUFFLHNCQUFzQixFQUFtQixLQUFLLEVBQW9CLElBQUksRUFBcUIsSUFBSSxFQUFFLGdCQUFnQixFQUFFLE1BQU0sRUFBRSxPQUFPLEVBQUUsMEJBQTBCLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQW1CLE1BQU0sbUJBQW1CLENBQUM7QUFDN1IsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLGVBQWUsQ0FBQztBQUM5QyxPQUFPLEVBQUMsUUFBUSxFQUFnQixNQUFNLFlBQVksQ0FBQztBQUNuRCxPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sb0JBQW9CLENBQUM7QUFDbkQsT0FBTyxFQUFDLGNBQWMsRUFBQyxNQUFNLDZCQUE2QixDQUFDO0FBQzNELE9BQU8sRUFBQyxnQkFBZ0IsRUFBRSxXQUFXLEVBQUUsb0NBQW9DLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQXFCdEc7OztHQUdHO0FBQ0gsU0FBUyx5QkFBeUIsQ0FDOUIsTUFBMkIsRUFBRSxRQUFrQixFQUFFLE1BQXFCLEVBQ3RFLGFBQXFDLEVBQUUsVUFBdUI7SUFDaEUsK0ZBQStGO0lBQy9GLDBGQUEwRjtJQUMxRiw4RkFBOEY7SUFDOUYscUJBQXFCO0lBQ3JCLElBQUksYUFBYSxJQUFJLElBQUksRUFBRTtRQUN6QixJQUFJLFVBQWdDLENBQUM7UUFDckMsSUFBSSxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3hCLHlGQUF5RjtRQUN6RiwrRkFBK0Y7UUFDL0YsNkVBQTZFO1FBQzdFLElBQUksWUFBWSxDQUFDLGFBQWEsQ0FBQyxFQUFFO1lBQy9CLFVBQVUsR0FBRyxhQUFhLENBQUM7U0FDNUI7YUFBTSxJQUFJLE9BQU8sQ0FBQyxhQUFhLENBQUMsRUFBRTtZQUNqQyxXQUFXLEdBQUcsSUFBSSxDQUFDO1lBQ25CLFNBQVMsSUFBSSxhQUFhLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxFQUFFLDRDQUE0QyxDQUFDLENBQUM7WUFDOUYsYUFBYSxHQUFHLGFBQWEsQ0FBQyxJQUFJLENBQUUsQ0FBQztTQUN0QztRQUNELE1BQU0sS0FBSyxHQUFVLFdBQVcsQ0FBQyxhQUFhLENBQUMsQ0FBQztRQUVoRCxJQUFJLE1BQU0sdUNBQStCLElBQUksTUFBTSxLQUFLLElBQUksRUFBRTtZQUM1RCxJQUFJLFVBQVUsSUFBSSxJQUFJLEVBQUU7Z0JBQ3RCLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7YUFDNUM7aUJBQU07Z0JBQ0wsa0JBQWtCLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxJQUFJLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzthQUN2RTtTQUNGO2FBQU0sSUFBSSxNQUFNLHVDQUErQixJQUFJLE1BQU0sS0FBSyxJQUFJLEVBQUU7WUFDbkUsa0JBQWtCLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLEVBQUUsVUFBVSxJQUFJLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztTQUN2RTthQUFNLElBQUksTUFBTSx1Q0FBK0IsRUFBRTtZQUNoRCxnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsS0FBSyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1NBQ2hEO2FBQU0sSUFBSSxNQUFNLHdDQUFnQyxFQUFFO1lBQ2pELFNBQVMsSUFBSSxTQUFTLENBQUMsbUJBQW1CLEVBQUUsQ0FBQztZQUM3QyxRQUFRLENBQUMsV0FBWSxDQUFDLEtBQUssQ0FBQyxDQUFDO1NBQzlCO1FBQ0QsSUFBSSxVQUFVLElBQUksSUFBSSxFQUFFO1lBQ3RCLGNBQWMsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7U0FDbEU7S0FDRjtBQUNILENBQUM7QUFFRCxNQUFNLFVBQVUsY0FBYyxDQUFDLFFBQWtCLEVBQUUsS0FBYTtJQUM5RCxTQUFTLElBQUksU0FBUyxDQUFDLHNCQUFzQixFQUFFLENBQUM7SUFDaEQsU0FBUyxJQUFJLFNBQVMsQ0FBQyxlQUFlLEVBQUUsQ0FBQztJQUN6QyxPQUFPLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7QUFDcEMsQ0FBQztBQUVELE1BQU0sVUFBVSxjQUFjLENBQUMsUUFBa0IsRUFBRSxLQUFZLEVBQUUsS0FBYTtJQUM1RSxTQUFTLElBQUksU0FBUyxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3pDLFFBQVEsQ0FBQyxRQUFRLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ2xDLENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsUUFBa0IsRUFBRSxLQUFhO0lBQ2pFLFNBQVMsSUFBSSxTQUFTLENBQUMscUJBQXFCLEVBQUUsQ0FBQztJQUMvQyxPQUFPLFFBQVEsQ0FBQyxhQUFhLENBQUMsaUJBQWlCLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztBQUMxRCxDQUFDO0FBRUQ7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUM3QixRQUFrQixFQUFFLElBQVksRUFBRSxTQUFzQjtJQUMxRCxTQUFTLElBQUksU0FBUyxDQUFDLHFCQUFxQixFQUFFLENBQUM7SUFDL0MsT0FBTyxRQUFRLENBQUMsYUFBYSxDQUFDLElBQUksRUFBRSxTQUFTLENBQUMsQ0FBQztBQUNqRCxDQUFDO0FBR0Q7Ozs7Ozs7OztHQVNHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEtBQVksRUFBRSxLQUFZO0lBQzFELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNqQyxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxRQUFRLHNDQUE4QixJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7SUFDMUUsS0FBSyxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztJQUNuQixLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsSUFBSSxDQUFDO0FBQ3ZCLENBQUM7QUFFRDs7Ozs7Ozs7Ozs7OztHQWFHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FDeEIsS0FBWSxFQUFFLFdBQWtCLEVBQUUsUUFBa0IsRUFBRSxLQUFZLEVBQUUsZ0JBQTBCLEVBQzlGLFVBQXNCO0lBQ3hCLEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxnQkFBZ0IsQ0FBQztJQUMvQixLQUFLLENBQUMsTUFBTSxDQUFDLEdBQUcsV0FBVyxDQUFDO0lBQzVCLFNBQVMsQ0FBQyxLQUFLLEVBQUUsS0FBSyxFQUFFLFFBQVEsc0NBQThCLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxDQUFDO0FBQzlGLENBQUM7QUFHRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxLQUFZLEVBQUUsS0FBWTtJQUMxRCxTQUFTLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsUUFBUSxDQUFDLHNDQUE4QixJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7QUFDbkYsQ0FBQztBQUVEOzs7Ozs7Ozs7Ozs7R0FZRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsUUFBZTtJQUM3QyxvRUFBb0U7SUFDcEUsSUFBSSxpQkFBaUIsR0FBRyxRQUFRLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDN0MsSUFBSSxDQUFDLGlCQUFpQixFQUFFO1FBQ3RCLE9BQU8sV0FBVyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsRUFBRSxRQUFRLENBQUMsQ0FBQztLQUMvQztJQUVELE9BQU8saUJBQWlCLEVBQUU7UUFDeEIsSUFBSSxJQUFJLEdBQTBCLElBQUksQ0FBQztRQUV2QyxJQUFJLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO1lBQzlCLG9DQUFvQztZQUNwQyxJQUFJLEdBQUcsaUJBQWlCLENBQUMsVUFBVSxDQUFDLENBQUM7U0FDdEM7YUFBTTtZQUNMLFNBQVMsSUFBSSxnQkFBZ0IsQ0FBQyxpQkFBaUIsQ0FBQyxDQUFDO1lBQ2pELGtEQUFrRDtZQUNsRCxNQUFNLFNBQVMsR0FBb0IsaUJBQWlCLENBQUMsdUJBQXVCLENBQUMsQ0FBQztZQUM5RSxJQUFJLFNBQVM7Z0JBQUUsSUFBSSxHQUFHLFNBQVMsQ0FBQztTQUNqQztRQUVELElBQUksQ0FBQyxJQUFJLEVBQUU7WUFDVCxxRUFBcUU7WUFDckUsZ0RBQWdEO1lBQ2hELE9BQU8saUJBQWlCLElBQUksQ0FBQyxpQkFBa0IsQ0FBQyxJQUFJLENBQUMsSUFBSSxpQkFBaUIsS0FBSyxRQUFRLEVBQUU7Z0JBQ3ZGLElBQUksT0FBTyxDQUFDLGlCQUFpQixDQUFDLEVBQUU7b0JBQzlCLFdBQVcsQ0FBQyxpQkFBaUIsQ0FBQyxLQUFLLENBQUMsRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO2lCQUMxRDtnQkFDRCxpQkFBaUIsR0FBRyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQzthQUMvQztZQUNELElBQUksaUJBQWlCLEtBQUssSUFBSTtnQkFBRSxpQkFBaUIsR0FBRyxRQUFRLENBQUM7WUFDN0QsSUFBSSxPQUFPLENBQUMsaUJBQWlCLENBQUMsRUFBRTtnQkFDOUIsV0FBVyxDQUFDLGlCQUFpQixDQUFDLEtBQUssQ0FBQyxFQUFFLGlCQUFpQixDQUFDLENBQUM7YUFDMUQ7WUFDRCxJQUFJLEdBQUcsaUJBQWlCLElBQUksaUJBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDdEQ7UUFDRCxpQkFBaUIsR0FBRyxJQUFJLENBQUM7S0FDMUI7QUFDSCxDQUFDO0FBRUQ7Ozs7Ozs7Ozs7OztHQVlHO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FBQyxLQUFZLEVBQUUsS0FBWSxFQUFFLFVBQXNCLEVBQUUsS0FBYTtJQUMxRixTQUFTLElBQUksV0FBVyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQ2hDLFNBQVMsSUFBSSxnQkFBZ0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztJQUMxQyxNQUFNLGdCQUFnQixHQUFHLHVCQUF1QixHQUFHLEtBQUssQ0FBQztJQUN6RCxNQUFNLGVBQWUsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDO0lBRTFDLElBQUksS0FBSyxHQUFHLENBQUMsRUFBRTtRQUNiLHlEQUF5RDtRQUN6RCxVQUFVLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsS0FBSyxDQUFDO0tBQ2hEO0lBQ0QsSUFBSSxLQUFLLEdBQUcsZUFBZSxHQUFHLHVCQUF1QixFQUFFO1FBQ3JELEtBQUssQ0FBQyxJQUFJLENBQUMsR0FBRyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMzQyxVQUFVLENBQUMsVUFBVSxFQUFFLHVCQUF1QixHQUFHLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztLQUNoRTtTQUFNO1FBQ0wsVUFBVSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN2QixLQUFLLENBQUMsSUFBSSxDQUFDLEdBQUcsSUFBSSxDQUFDO0tBQ3BCO0lBRUQsS0FBSyxDQUFDLE1BQU0sQ0FBQyxHQUFHLFVBQVUsQ0FBQztJQUUzQixtRUFBbUU7SUFDbkUsTUFBTSxxQkFBcUIsR0FBRyxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztJQUM1RCxJQUFJLHFCQUFxQixLQUFLLElBQUksSUFBSSxVQUFVLEtBQUsscUJBQXFCLEVBQUU7UUFDMUUsY0FBYyxDQUFDLHFCQUFxQixFQUFFLEtBQUssQ0FBQyxDQUFDO0tBQzlDO0lBRUQsOENBQThDO0lBQzlDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztJQUNoQyxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUU7UUFDckIsUUFBUSxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsQ0FBQztLQUM1QjtJQUVELG9DQUFvQyxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLHlCQUF5QjtJQUN6QixLQUFLLENBQUMsS0FBSyxDQUFDLGlDQUF1QixDQUFDO0FBQ3RDLENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLGNBQWMsQ0FBQyxvQkFBZ0MsRUFBRSxLQUFZO0lBQ3BFLFNBQVMsSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLGdCQUFnQixDQUFDLENBQUM7SUFDcEQsU0FBUyxJQUFJLGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDcEQsTUFBTSxVQUFVLEdBQUcsb0JBQW9CLENBQUMsV0FBVyxDQUFDLENBQUM7SUFDckQsTUFBTSxrQkFBa0IsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFlLENBQUM7SUFDdkQsU0FBUyxJQUFJLGdCQUFnQixDQUFDLGtCQUFrQixDQUFDLENBQUM7SUFDbEQsTUFBTSxzQkFBc0IsR0FBRyxrQkFBa0IsQ0FBQyxNQUFNLENBQUUsQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0lBQ3ZGLFNBQVMsSUFBSSxhQUFhLENBQUMsc0JBQXNCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztJQUNyRixNQUFNLHNCQUFzQixHQUFHLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxDQUFDO0lBQ2pFLFNBQVMsSUFBSSxhQUFhLENBQUMsc0JBQXNCLEVBQUUsZ0NBQWdDLENBQUMsQ0FBQztJQUNyRixJQUFJLHNCQUFzQixLQUFLLHNCQUFzQixFQUFFO1FBQ3JELDhGQUE4RjtRQUM5Riw0RkFBNEY7UUFDNUYscUNBQXFDO1FBQ3JDLG9CQUFvQixDQUFDLEtBQUssQ0FBQyxJQUFJLGVBQWUsQ0FBQyxvQkFBb0IsQ0FBQztLQUNyRTtJQUNELElBQUksVUFBVSxLQUFLLElBQUksRUFBRTtRQUN2QixvQkFBb0IsQ0FBQyxXQUFXLENBQUMsR0FBRyxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQzdDO1NBQU07UUFDTCxVQUFVLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3hCO0FBQ0gsQ0FBQztBQUVELFNBQVMsZUFBZSxDQUFDLG9CQUFnQyxFQUFFLEtBQVk7SUFDckUsU0FBUyxJQUFJLGdCQUFnQixDQUFDLG9CQUFvQixDQUFDLENBQUM7SUFDcEQsU0FBUztRQUNMLGFBQWEsQ0FDVCxvQkFBb0IsQ0FBQyxXQUFXLENBQUMsRUFDakMsMEVBQTBFLENBQUMsQ0FBQztJQUNwRixNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxXQUFXLENBQUUsQ0FBQztJQUN0RCxNQUFNLG9CQUFvQixHQUFHLFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDdkQsTUFBTSxtQkFBbUIsR0FBRyxLQUFLLENBQUMsTUFBTSxDQUFlLENBQUM7SUFDeEQsU0FBUyxJQUFJLGdCQUFnQixDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDbkQsVUFBVSxDQUFDLE1BQU0sQ0FBQyxvQkFBb0IsRUFBRSxDQUFDLENBQUMsQ0FBQztBQUM3QyxDQUFDO0FBRUQ7Ozs7Ozs7OztHQVNHO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FBQyxVQUFzQixFQUFFLFdBQW1CO0lBQ3BFLElBQUksVUFBVSxDQUFDLE1BQU0sSUFBSSx1QkFBdUI7UUFBRSxPQUFPO0lBRXpELE1BQU0sZ0JBQWdCLEdBQUcsdUJBQXVCLEdBQUcsV0FBVyxDQUFDO0lBQy9ELE1BQU0sWUFBWSxHQUFHLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRWxELElBQUksWUFBWSxFQUFFO1FBQ2hCLE1BQU0scUJBQXFCLEdBQUcsWUFBWSxDQUFDLHNCQUFzQixDQUFDLENBQUM7UUFDbkUsSUFBSSxxQkFBcUIsS0FBSyxJQUFJLElBQUkscUJBQXFCLEtBQUssVUFBVSxFQUFFO1lBQzFFLGVBQWUsQ0FBQyxxQkFBcUIsRUFBRSxZQUFZLENBQUMsQ0FBQztTQUN0RDtRQUdELElBQUksV0FBVyxHQUFHLENBQUMsRUFBRTtZQUNuQixVQUFVLENBQUMsZ0JBQWdCLEdBQUcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsWUFBWSxDQUFDLElBQUksQ0FBVSxDQUFDO1NBQ3RFO1FBQ0QsTUFBTSxZQUFZLEdBQUcsZUFBZSxDQUFDLFVBQVUsRUFBRSx1QkFBdUIsR0FBRyxXQUFXLENBQUMsQ0FBQztRQUN4RixpQkFBaUIsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEVBQUUsWUFBWSxDQUFDLENBQUM7UUFFckQsNENBQTRDO1FBQzVDLE1BQU0sUUFBUSxHQUFHLFlBQVksQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUN2QyxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUU7WUFDckIsUUFBUSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztTQUMxQztRQUVELFlBQVksQ0FBQyxNQUFNLENBQUMsR0FBRyxJQUFJLENBQUM7UUFDNUIsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMxQiwyQkFBMkI7UUFDM0IsWUFBWSxDQUFDLEtBQUssQ0FBQyxJQUFJLDhCQUFvQixDQUFDO0tBQzdDO0lBQ0QsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxZQUFZLENBQUMsS0FBWSxFQUFFLEtBQVk7SUFDckQsSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxpQ0FBdUIsQ0FBQyxFQUFFO1FBQzFDLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUVqQyxJQUFJLFFBQVEsQ0FBQyxXQUFXLEVBQUU7WUFDeEIsU0FBUyxDQUFDLEtBQUssRUFBRSxLQUFLLEVBQUUsUUFBUSx1Q0FBK0IsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQzVFO1FBRUQsZUFBZSxDQUFDLEtBQUssQ0FBQyxDQUFDO0tBQ3hCO0FBQ0gsQ0FBQztBQUVEOzs7Ozs7O0dBT0c7QUFDSCxTQUFTLFdBQVcsQ0FBQyxLQUFZLEVBQUUsS0FBWTtJQUM3QyxJQUFJLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLGlDQUF1QixDQUFDLEVBQUU7UUFDMUMsMEZBQTBGO1FBQzFGLHlGQUF5RjtRQUN6RixLQUFLLENBQUMsS0FBSyxDQUFDLElBQUksOEJBQW9CLENBQUM7UUFFckMsd0ZBQXdGO1FBQ3hGLDZGQUE2RjtRQUM3Riw2RkFBNkY7UUFDN0YsMEZBQTBGO1FBQzFGLCtEQUErRDtRQUMvRCxLQUFLLENBQUMsS0FBSyxDQUFDLGtDQUF3QixDQUFDO1FBRXJDLEtBQUssQ0FBQywwQkFBMEIsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO1FBRXhGLGlCQUFpQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUNoQyxlQUFlLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQzlCLDhFQUE4RTtRQUM5RSxJQUFJLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxJQUFJLGdDQUF3QixFQUFFO1lBQzdDLFNBQVMsSUFBSSxTQUFTLENBQUMsZUFBZSxFQUFFLENBQUM7WUFDekMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxDQUFDLE9BQU8sRUFBRSxDQUFDO1NBQzNCO1FBRUQsTUFBTSxvQkFBb0IsR0FBRyxLQUFLLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMzRCwrRUFBK0U7UUFDL0UsSUFBSSxvQkFBb0IsS0FBSyxJQUFJLElBQUksWUFBWSxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFO1lBQ2hFLCtCQUErQjtZQUMvQixJQUFJLG9CQUFvQixLQUFLLEtBQUssQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDMUMsZUFBZSxDQUFDLG9CQUFvQixFQUFFLEtBQUssQ0FBQyxDQUFDO2FBQzlDO1lBRUQsd0ZBQXdGO1lBQ3hGLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztZQUNoQyxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUU7Z0JBQ3JCLFFBQVEsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDNUI7U0FDRjtRQUVELGdFQUFnRTtRQUNoRSxlQUFlLENBQUMsS0FBSyxDQUFDLENBQUM7S0FDeEI7QUFDSCxDQUFDO0FBRUQsbUVBQW1FO0FBQ25FLFNBQVMsZUFBZSxDQUFDLEtBQVksRUFBRSxLQUFZO0lBQ2pELE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxPQUFPLENBQUM7SUFDL0IsTUFBTSxRQUFRLEdBQUcsS0FBSyxDQUFDLE9BQU8sQ0FBRSxDQUFDO0lBQ2pDLElBQUksUUFBUSxLQUFLLElBQUksRUFBRTtRQUNyQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUMvQyxJQUFJLE9BQU8sUUFBUSxDQUFDLENBQUMsQ0FBQyxLQUFLLFFBQVEsRUFBRTtnQkFDbkMsNEZBQTRGO2dCQUM1RiwrQkFBK0I7Z0JBQy9CLE1BQU0sU0FBUyxHQUFHLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ2xDLFNBQVMsSUFBSSxZQUFZLENBQUMsU0FBUyxFQUFFLGlDQUFpQyxDQUFDLENBQUM7Z0JBQ3hFLElBQUksU0FBUyxJQUFJLENBQUMsRUFBRTtvQkFDbEIsYUFBYTtvQkFDYixRQUFRLENBQUMsU0FBUyxDQUFDLEVBQUUsQ0FBQztpQkFDdkI7cUJBQU07b0JBQ0wsZUFBZTtvQkFDZixRQUFRLENBQUMsQ0FBQyxTQUFTLENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztpQkFDcEM7Z0JBQ0QsQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNSO2lCQUFNO2dCQUNMLDJFQUEyRTtnQkFDM0UsTUFBTSxPQUFPLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDMUMsUUFBUSxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxPQUFPLENBQUMsQ0FBQzthQUMzQjtTQUNGO0tBQ0Y7SUFDRCxJQUFJLFFBQVEsS0FBSyxJQUFJLEVBQUU7UUFDckIsS0FBSyxDQUFDLE9BQU8sQ0FBQyxHQUFHLElBQUksQ0FBQztLQUN2QjtJQUNELE1BQU0sWUFBWSxHQUFHLEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBQzdDLElBQUksWUFBWSxLQUFLLElBQUksRUFBRTtRQUN6Qiw2RkFBNkY7UUFDN0YsdURBQXVEO1FBQ3ZELEtBQUssQ0FBQyxnQkFBZ0IsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUMvQixLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTtZQUM1QyxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7WUFDdkMsU0FBUyxJQUFJLGNBQWMsQ0FBQyxjQUFjLEVBQUUsMENBQTBDLENBQUMsQ0FBQztZQUN4RixjQUFjLEVBQUUsQ0FBQztTQUNsQjtLQUNGO0FBQ0gsQ0FBQztBQUVELDBDQUEwQztBQUMxQyxTQUFTLGlCQUFpQixDQUFDLEtBQVksRUFBRSxLQUFZO0lBQ25ELElBQUksWUFBa0MsQ0FBQztJQUV2QyxJQUFJLEtBQUssSUFBSSxJQUFJLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDLFlBQVksQ0FBQyxJQUFJLElBQUksRUFBRTtRQUNoRSxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcsWUFBWSxDQUFDLE1BQU0sRUFBRSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQy9DLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFXLENBQUMsQ0FBQztZQUVqRCxnRUFBZ0U7WUFDaEUsSUFBSSxDQUFDLENBQUMsT0FBTyxZQUFZLG1CQUFtQixDQUFDLEVBQUU7Z0JBQzdDLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFzQixDQUFDO2dCQUV4RCxJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsTUFBTSxDQUFDLEVBQUU7b0JBQ3pCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxNQUFNLENBQUMsTUFBTSxFQUFFLENBQUMsSUFBSSxDQUFDLEVBQUU7d0JBQ3pDLE1BQU0sV0FBVyxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFXLENBQUMsQ0FBQzt3QkFDakQsTUFBTSxJQUFJLEdBQUcsTUFBTSxDQUFDLENBQUMsR0FBRyxDQUFDLENBQVcsQ0FBQzt3QkFDckMsUUFBUSwyQ0FBbUMsV0FBVyxFQUFFLElBQUksQ0FBQyxDQUFDO3dCQUM5RCxJQUFJOzRCQUNGLElBQUksQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7eUJBQ3hCO2dDQUFTOzRCQUNSLFFBQVEseUNBQWlDLFdBQVcsRUFBRSxJQUFJLENBQUMsQ0FBQzt5QkFDN0Q7cUJBQ0Y7aUJBQ0Y7cUJBQU07b0JBQ0wsUUFBUSwyQ0FBbUMsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO29CQUM1RCxJQUFJO3dCQUNGLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7cUJBQ3RCOzRCQUFTO3dCQUNSLFFBQVEseUNBQWlDLE9BQU8sRUFBRSxNQUFNLENBQUMsQ0FBQztxQkFDM0Q7aUJBQ0Y7YUFDRjtTQUNGO0tBQ0Y7QUFDSCxDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7OztHQWVHO0FBQ0gsTUFBTSxVQUFVLGlCQUFpQixDQUFDLEtBQVksRUFBRSxLQUFZLEVBQUUsS0FBWTtJQUN4RSxPQUFPLGtCQUFrQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLEtBQUssQ0FBQyxDQUFDO0FBQ3hELENBQUM7QUFFRDs7Ozs7Ozs7Ozs7Ozs7R0FjRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxLQUFZLEVBQUUsS0FBaUIsRUFBRSxLQUFZO0lBQzlFLElBQUksV0FBVyxHQUFlLEtBQUssQ0FBQztJQUNwQyxzRkFBc0Y7SUFDdEYsb0NBQW9DO0lBQ3BDLE9BQU8sV0FBVyxLQUFLLElBQUk7UUFDcEIsQ0FBQyxXQUFXLENBQUMsSUFBSSxHQUFHLENBQUMsMkRBQTBDLENBQUMsQ0FBQyxFQUFFO1FBQ3hFLEtBQUssR0FBRyxXQUFXLENBQUM7UUFDcEIsV0FBVyxHQUFHLEtBQUssQ0FBQyxNQUFNLENBQUM7S0FDNUI7SUFFRCxnR0FBZ0c7SUFDaEcsdUJBQXVCO0lBQ3ZCLElBQUksV0FBVyxLQUFLLElBQUksRUFBRTtRQUN4Qiw0RkFBNEY7UUFDNUYsNkJBQTZCO1FBQzdCLE9BQU8sS0FBSyxDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ3BCO1NBQU07UUFDTCxTQUFTLElBQUksZUFBZSxDQUFDLFdBQVcsRUFBRSx3REFBd0MsQ0FBQyxDQUFDO1FBQ3BGLE1BQU0sRUFBQyxlQUFlLEVBQUMsR0FBRyxXQUFXLENBQUM7UUFDdEMsSUFBSSxlQUFlLEdBQUcsQ0FBQyxDQUFDLEVBQUU7WUFDeEIsU0FBUyxJQUFJLG1CQUFtQixDQUFDLFdBQVcsRUFBRSxLQUFLLENBQUMsQ0FBQztZQUNyRCxNQUFNLEVBQUMsYUFBYSxFQUFDLEdBQ2hCLEtBQUssQ0FBQyxJQUFJLENBQUMsV0FBVyxDQUFDLGNBQWMsR0FBRyxlQUFlLENBQTJCLENBQUM7WUFDeEYsNEZBQTRGO1lBQzVGLDRGQUE0RjtZQUM1Rix1RkFBdUY7WUFDdkYsdUZBQXVGO1lBQ3ZGLDZGQUE2RjtZQUM3Riw0RUFBNEU7WUFDNUUsSUFBSSxhQUFhLEtBQUssaUJBQWlCLENBQUMsSUFBSTtnQkFDeEMsYUFBYSxLQUFLLGlCQUFpQixDQUFDLFFBQVEsRUFBRTtnQkFDaEQsT0FBTyxJQUFJLENBQUM7YUFDYjtTQUNGO1FBRUQsT0FBTyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFhLENBQUM7S0FDekQ7QUFDSCxDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUM5QixRQUFrQixFQUFFLE1BQWdCLEVBQUUsS0FBWSxFQUFFLFVBQXNCLEVBQzFFLE1BQWU7SUFDakIsU0FBUyxJQUFJLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0lBQzlDLFFBQVEsQ0FBQyxZQUFZLENBQUMsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7QUFDM0QsQ0FBQztBQUVELFNBQVMsaUJBQWlCLENBQUMsUUFBa0IsRUFBRSxNQUFnQixFQUFFLEtBQVk7SUFDM0UsU0FBUyxJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO0lBQzdDLFNBQVMsSUFBSSxhQUFhLENBQUMsTUFBTSxFQUFFLDZCQUE2QixDQUFDLENBQUM7SUFDbEUsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDdEMsQ0FBQztBQUVELFNBQVMsMEJBQTBCLENBQy9CLFFBQWtCLEVBQUUsTUFBZ0IsRUFBRSxLQUFZLEVBQUUsVUFBc0IsRUFBRSxNQUFlO0lBQzdGLElBQUksVUFBVSxLQUFLLElBQUksRUFBRTtRQUN2QixrQkFBa0IsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxVQUFVLEVBQUUsTUFBTSxDQUFDLENBQUM7S0FDakU7U0FBTTtRQUNMLGlCQUFpQixDQUFDLFFBQVEsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDNUM7QUFDSCxDQUFDO0FBRUQsMkRBQTJEO0FBQzNELFNBQVMsaUJBQWlCLENBQ3RCLFFBQWtCLEVBQUUsTUFBZ0IsRUFBRSxLQUFZLEVBQUUsYUFBdUI7SUFDN0UsUUFBUSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsS0FBSyxFQUFFLGFBQWEsQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRCxtREFBbUQ7QUFDbkQsU0FBUyxjQUFjLENBQUMsSUFBYztJQUNwQyxPQUFPLElBQUksQ0FBQyxPQUFPLEtBQUssVUFBVSxJQUFLLElBQWtCLENBQUMsT0FBTyxLQUFLLFNBQVMsQ0FBQztBQUNsRixDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBa0IsRUFBRSxJQUFXO0lBQzlELE9BQU8sUUFBUSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNuQyxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsUUFBa0IsRUFBRSxJQUFXO0lBQy9ELE9BQU8sUUFBUSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsQ0FBQztBQUNwQyxDQUFDO0FBRUQ7Ozs7Ozs7OztHQVNHO0FBQ0gsU0FBUyx1QkFBdUIsQ0FBQyxXQUFrQixFQUFFLFlBQW1CLEVBQUUsS0FBWTtJQUVwRixPQUFPLGdDQUFnQyxDQUFDLFdBQVcsRUFBRSxZQUFZLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDNUUsQ0FBQztBQUdEOzs7Ozs7Ozs7O0dBVUc7QUFDSCxNQUFNLFVBQVUsaUNBQWlDLENBQzdDLFdBQWtCLEVBQUUsWUFBbUIsRUFBRSxLQUFZO0lBQ3ZELElBQUksV0FBVyxDQUFDLElBQUksR0FBRyxDQUFDLDJEQUEwQyxDQUFDLEVBQUU7UUFDbkUsT0FBTyxnQkFBZ0IsQ0FBQyxXQUFXLEVBQUUsS0FBSyxDQUFDLENBQUM7S0FDN0M7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsSUFBSSxnQ0FBZ0MsR0FDakIsaUNBQWlDLENBQUM7QUFFckQ7Ozs7R0FJRztBQUNILElBQUksd0JBRXNDLENBQUM7QUFFM0MsTUFBTSxVQUFVLGVBQWUsQ0FDM0IsK0JBQ2dCLEVBQ2hCLHVCQUUwQztJQUM1QyxnQ0FBZ0MsR0FBRywrQkFBK0IsQ0FBQztJQUNuRSx3QkFBd0IsR0FBRyx1QkFBdUIsQ0FBQztBQUNyRCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxXQUFXLENBQ3ZCLEtBQVksRUFBRSxLQUFZLEVBQUUsVUFBeUIsRUFBRSxVQUFpQjtJQUMxRSxNQUFNLFdBQVcsR0FBRyxpQkFBaUIsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ2hFLE1BQU0sUUFBUSxHQUFHLEtBQUssQ0FBQyxRQUFRLENBQUMsQ0FBQztJQUNqQyxNQUFNLFdBQVcsR0FBVSxVQUFVLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUUsQ0FBQztJQUMvRCxNQUFNLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxXQUFXLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzNFLElBQUksV0FBVyxJQUFJLElBQUksRUFBRTtRQUN2QixJQUFJLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLEVBQUU7WUFDN0IsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7Z0JBQzFDLDBCQUEwQixDQUFDLFFBQVEsRUFBRSxXQUFXLEVBQUUsVUFBVSxDQUFDLENBQUMsQ0FBQyxFQUFFLFVBQVUsRUFBRSxLQUFLLENBQUMsQ0FBQzthQUNyRjtTQUNGO2FBQU07WUFDTCwwQkFBMEIsQ0FBQyxRQUFRLEVBQUUsV0FBVyxFQUFFLFVBQVUsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7U0FDbEY7S0FDRjtJQUVELHdCQUF3QixLQUFLLFNBQVM7UUFDbEMsd0JBQXdCLENBQUMsUUFBUSxFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsVUFBVSxFQUFFLFdBQVcsQ0FBQyxDQUFDO0FBQ3JGLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGtCQUFrQixDQUFDLEtBQVksRUFBRSxLQUFpQjtJQUNoRSxJQUFJLEtBQUssS0FBSyxJQUFJLEVBQUU7UUFDbEIsU0FBUztZQUNMLGVBQWUsQ0FDWCxLQUFLLEVBQ0wsNERBQTJDLHlCQUFnQixnQ0FBdUIsQ0FBQyxDQUFDO1FBRTVGLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxJQUFJLENBQUM7UUFDN0IsSUFBSSxTQUFTLDZCQUFxQixFQUFFO1lBQ2xDLE9BQU8sZ0JBQWdCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3ZDO2FBQU0sSUFBSSxTQUFTLDhCQUFzQixFQUFFO1lBQzFDLE9BQU8sb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEVBQUUsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO1NBQ3JEO2FBQU0sSUFBSSxTQUFTLHFDQUE2QixFQUFFO1lBQ2pELE1BQU0sbUJBQW1CLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQztZQUN4QyxJQUFJLG1CQUFtQixLQUFLLElBQUksRUFBRTtnQkFDaEMsT0FBTyxrQkFBa0IsQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLENBQUMsQ0FBQzthQUN2RDtpQkFBTTtnQkFDTCxNQUFNLGlCQUFpQixHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUM7Z0JBQzdDLElBQUksWUFBWSxDQUFDLGlCQUFpQixDQUFDLEVBQUU7b0JBQ25DLE9BQU8sb0JBQW9CLENBQUMsQ0FBQyxDQUFDLEVBQUUsaUJBQWlCLENBQUMsQ0FBQztpQkFDcEQ7cUJBQU07b0JBQ0wsT0FBTyxXQUFXLENBQUMsaUJBQWlCLENBQUMsQ0FBQztpQkFDdkM7YUFDRjtTQUNGO2FBQU0sSUFBSSxTQUFTLHlCQUFnQixFQUFFO1lBQ3BDLElBQUksU0FBUyxHQUFHLG1CQUFtQixDQUFDLEtBQTBCLEVBQUUsS0FBSyxDQUFDLENBQUM7WUFDdkUsSUFBSSxLQUFLLEdBQWUsU0FBUyxFQUFFLENBQUM7WUFDcEMsNkVBQTZFO1lBQzdFLE9BQU8sS0FBSyxJQUFJLFdBQVcsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7U0FDakQ7YUFBTTtZQUNMLE1BQU0sZUFBZSxHQUFHLGtCQUFrQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztZQUN6RCxJQUFJLGVBQWUsS0FBSyxJQUFJLEVBQUU7Z0JBQzVCLElBQUksS0FBSyxDQUFDLE9BQU8sQ0FBQyxlQUFlLENBQUMsRUFBRTtvQkFDbEMsT0FBTyxlQUFlLENBQUMsQ0FBQyxDQUFDLENBQUM7aUJBQzNCO2dCQUNELE1BQU0sVUFBVSxHQUFHLGNBQWMsQ0FBQyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQyxDQUFDO2dCQUNyRSxTQUFTLElBQUksZ0JBQWdCLENBQUMsVUFBVSxDQUFDLENBQUM7Z0JBQzFDLE9BQU8sa0JBQWtCLENBQUMsVUFBVyxFQUFFLGVBQWUsQ0FBQyxDQUFDO2FBQ3pEO2lCQUFNO2dCQUNMLE9BQU8sa0JBQWtCLENBQUMsS0FBSyxFQUFFLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUM5QztTQUNGO0tBQ0Y7SUFFRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsS0FBWSxFQUFFLEtBQWlCO0lBQ2hFLElBQUksS0FBSyxLQUFLLElBQUksRUFBRTtRQUNsQixNQUFNLGFBQWEsR0FBRyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztRQUN4RCxNQUFNLGFBQWEsR0FBRyxhQUFhLENBQUMsTUFBTSxDQUFpQixDQUFDO1FBQzVELE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxVQUFvQixDQUFDO1FBQzNDLFNBQVMsSUFBSSxxQkFBcUIsQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUMxQyxPQUFPLGFBQWEsQ0FBQyxVQUFXLENBQUMsT0FBTyxDQUFDLENBQUM7S0FDM0M7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUM7QUFFRCxNQUFNLFVBQVUsb0JBQW9CLENBQUMsb0JBQTRCLEVBQUUsVUFBc0I7SUFFdkYsTUFBTSxhQUFhLEdBQUcsdUJBQXVCLEdBQUcsb0JBQW9CLEdBQUcsQ0FBQyxDQUFDO0lBQ3pFLElBQUksYUFBYSxHQUFHLFVBQVUsQ0FBQyxNQUFNLEVBQUU7UUFDckMsTUFBTSxLQUFLLEdBQUcsVUFBVSxDQUFDLGFBQWEsQ0FBVSxDQUFDO1FBQ2pELE1BQU0sZ0JBQWdCLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxDQUFDLFVBQVUsQ0FBQztRQUNqRCxJQUFJLGdCQUFnQixLQUFLLElBQUksRUFBRTtZQUM3QixPQUFPLGtCQUFrQixDQUFDLEtBQUssRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1NBQ3BEO0tBQ0Y7SUFFRCxPQUFPLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQztBQUM1QixDQUFDO0FBRUQ7Ozs7Ozs7O0dBUUc7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBa0IsRUFBRSxLQUFZLEVBQUUsYUFBdUI7SUFDeEYsU0FBUyxJQUFJLFNBQVMsQ0FBQyxrQkFBa0IsRUFBRSxDQUFDO0lBQzVDLE1BQU0sWUFBWSxHQUFHLGdCQUFnQixDQUFDLFFBQVEsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUN2RCxJQUFJLFlBQVksRUFBRTtRQUNoQixpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxhQUFhLENBQUMsQ0FBQztLQUNqRTtBQUNILENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLG9CQUFvQixDQUFDLFFBQWtCO0lBQ3JELFFBQVEsQ0FBQyxXQUFXLEdBQUcsRUFBRSxDQUFDO0FBQzVCLENBQUM7QUFHRDs7O0dBR0c7QUFDSCxTQUFTLFVBQVUsQ0FDZixRQUFrQixFQUFFLE1BQTJCLEVBQUUsS0FBaUIsRUFBRSxLQUFZLEVBQ2hGLGNBQTZCLEVBQUUsVUFBc0IsRUFBRSxZQUFxQjtJQUM5RSxPQUFPLEtBQUssSUFBSSxJQUFJLEVBQUU7UUFDcEIsU0FBUyxJQUFJLG1CQUFtQixDQUFDLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztRQUMvQyxTQUFTO1lBQ0wsZUFBZSxDQUNYLEtBQUssRUFDTCw0REFBMkMsZ0NBQXVCLHlCQUFnQixDQUFDLENBQUM7UUFDNUYsTUFBTSxZQUFZLEdBQUcsS0FBSyxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQztRQUN4QyxNQUFNLFNBQVMsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDO1FBQzdCLElBQUksWUFBWSxFQUFFO1lBQ2hCLElBQUksTUFBTSx1Q0FBK0IsRUFBRTtnQkFDekMsWUFBWSxJQUFJLGVBQWUsQ0FBQyxXQUFXLENBQUMsWUFBWSxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7Z0JBQ2xFLEtBQUssQ0FBQyxLQUFLLGtDQUEwQixDQUFDO2FBQ3ZDO1NBQ0Y7UUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLEtBQUssaUNBQXdCLENBQUMsbUNBQTBCLEVBQUU7WUFDbkUsSUFBSSxTQUFTLHFDQUE2QixFQUFFO2dCQUMxQyxVQUFVLENBQUMsUUFBUSxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsVUFBVSxFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUNwRix5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDdkY7aUJBQU0sSUFBSSxTQUFTLHlCQUFnQixFQUFFO2dCQUNwQyxNQUFNLFNBQVMsR0FBRyxtQkFBbUIsQ0FBQyxLQUEwQixFQUFFLEtBQUssQ0FBQyxDQUFDO2dCQUN6RSxJQUFJLEtBQWlCLENBQUM7Z0JBQ3RCLE9BQU8sS0FBSyxHQUFHLFNBQVMsRUFBRSxFQUFFO29CQUMxQix5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxLQUFLLEVBQUUsVUFBVSxDQUFDLENBQUM7aUJBQ2hGO2dCQUNELHlCQUF5QixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLFlBQVksRUFBRSxVQUFVLENBQUMsQ0FBQzthQUN2RjtpQkFBTSxJQUFJLFNBQVMsZ0NBQXVCLEVBQUU7Z0JBQzNDLHdCQUF3QixDQUNwQixRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssRUFBRSxLQUF3QixFQUFFLGNBQWMsRUFBRSxVQUFVLENBQUMsQ0FBQzthQUNwRjtpQkFBTTtnQkFDTCxTQUFTLElBQUksZUFBZSxDQUFDLEtBQUssRUFBRSx3REFBd0MsQ0FBQyxDQUFDO2dCQUM5RSx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxZQUFZLEVBQUUsVUFBVSxDQUFDLENBQUM7YUFDdkY7U0FDRjtRQUNELEtBQUssR0FBRyxZQUFZLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUM7S0FDMUQ7QUFDSCxDQUFDO0FBZ0NELFNBQVMsU0FBUyxDQUNkLEtBQVksRUFBRSxLQUFZLEVBQUUsUUFBa0IsRUFBRSxNQUEyQixFQUMzRSxjQUE2QixFQUFFLFVBQXNCO0lBQ3ZELFVBQVUsQ0FBQyxRQUFRLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxVQUFVLEVBQUUsS0FBSyxFQUFFLGNBQWMsRUFBRSxVQUFVLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDM0YsQ0FBQztBQUVEOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sVUFBVSxlQUFlLENBQUMsS0FBWSxFQUFFLEtBQVksRUFBRSxlQUFnQztJQUMxRixNQUFNLFFBQVEsR0FBRyxLQUFLLENBQUMsUUFBUSxDQUFDLENBQUM7SUFDakMsTUFBTSxXQUFXLEdBQUcsaUJBQWlCLENBQUMsS0FBSyxFQUFFLGVBQWUsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUNyRSxNQUFNLFdBQVcsR0FBRyxlQUFlLENBQUMsTUFBTSxJQUFJLEtBQUssQ0FBQyxNQUFNLENBQUUsQ0FBQztJQUM3RCxJQUFJLFVBQVUsR0FBRyx1QkFBdUIsQ0FBQyxXQUFXLEVBQUUsZUFBZSxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQzlFLHdCQUF3QixDQUNwQixRQUFRLHNDQUE4QixLQUFLLEVBQUUsZUFBZSxFQUFFLFdBQVcsRUFBRSxVQUFVLENBQUMsQ0FBQztBQUM3RixDQUFDO0FBRUQ7Ozs7Ozs7Ozs7Ozs7R0FhRztBQUNILFNBQVMsd0JBQXdCLENBQzdCLFFBQWtCLEVBQUUsTUFBMkIsRUFBRSxLQUFZLEVBQUUsZUFBZ0MsRUFDL0YsY0FBNkIsRUFBRSxVQUFzQjtJQUN2RCxNQUFNLGNBQWMsR0FBRyxLQUFLLENBQUMsMEJBQTBCLENBQUMsQ0FBQztJQUN6RCxNQUFNLGFBQWEsR0FBRyxjQUFjLENBQUMsTUFBTSxDQUFpQixDQUFDO0lBQzdELFNBQVM7UUFDTCxXQUFXLENBQUMsT0FBTyxlQUFlLENBQUMsVUFBVSxFQUFFLFFBQVEsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0lBQzNGLE1BQU0scUJBQXFCLEdBQUcsYUFBYSxDQUFDLFVBQVcsQ0FBQyxlQUFlLENBQUMsVUFBVSxDQUFFLENBQUM7SUFDckYsSUFBSSxLQUFLLENBQUMsT0FBTyxDQUFDLHFCQUFxQixDQUFDLEVBQUU7UUFDeEMsMEZBQTBGO1FBQzFGLG1GQUFtRjtRQUNuRix3RkFBd0Y7UUFDeEYsbUZBQW1GO1FBQ25GLDRDQUE0QztRQUM1QyxLQUFLLElBQUksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLEdBQUcscUJBQXFCLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1lBQ3JELE1BQU0sS0FBSyxHQUFHLHFCQUFxQixDQUFDLENBQUMsQ0FBQyxDQUFDO1lBQ3ZDLHlCQUF5QixDQUFDLE1BQU0sRUFBRSxRQUFRLEVBQUUsY0FBYyxFQUFFLEtBQUssRUFBRSxVQUFVLENBQUMsQ0FBQztTQUNoRjtLQUNGO1NBQU07UUFDTCxJQUFJLGFBQWEsR0FBZSxxQkFBcUIsQ0FBQztRQUN0RCxNQUFNLHVCQUF1QixHQUFHLGNBQWMsQ0FBQyxNQUFNLENBQVUsQ0FBQztRQUNoRSxxRUFBcUU7UUFDckUsMEVBQTBFO1FBQzFFLElBQUksMkJBQTJCLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDaEQsYUFBYSxDQUFDLEtBQUssNkNBQW1DLENBQUM7U0FDeEQ7UUFDRCxVQUFVLENBQ04sUUFBUSxFQUFFLE1BQU0sRUFBRSxhQUFhLEVBQUUsdUJBQXVCLEVBQUUsY0FBYyxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztLQUNqRztBQUNILENBQUM7QUFHRDs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxTQUFTLGNBQWMsQ0FDbkIsUUFBa0IsRUFBRSxNQUEyQixFQUFFLFVBQXNCLEVBQ3ZFLGNBQTZCLEVBQUUsVUFBZ0M7SUFDakUsU0FBUyxJQUFJLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxDQUFDO0lBQzFDLE1BQU0sTUFBTSxHQUFHLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFFLHNDQUFzQztJQUMxRSxNQUFNLE1BQU0sR0FBRyxXQUFXLENBQUMsVUFBVSxDQUFDLENBQUM7SUFDdkMsc0ZBQXNGO0lBQ3RGLDZGQUE2RjtJQUM3Riw0RkFBNEY7SUFDNUYsd0RBQXdEO0lBQ3hELGtGQUFrRjtJQUNsRiw4Q0FBOEM7SUFDOUMsSUFBSSxNQUFNLEtBQUssTUFBTSxFQUFFO1FBQ3JCLDBGQUEwRjtRQUMxRixpRUFBaUU7UUFDakUsRUFBRTtRQUNGLDREQUE0RDtRQUM1RCx5QkFBeUIsQ0FBQyxNQUFNLEVBQUUsUUFBUSxFQUFFLGNBQWMsRUFBRSxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7S0FDakY7SUFDRCxLQUFLLElBQUksQ0FBQyxHQUFHLHVCQUF1QixFQUFFLENBQUMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUMsRUFBRSxFQUFFO1FBQ2hFLE1BQU0sS0FBSyxHQUFHLFVBQVUsQ0FBQyxDQUFDLENBQVUsQ0FBQztRQUNyQyxTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxFQUFFLEtBQUssRUFBRSxRQUFRLEVBQUUsTUFBTSxFQUFFLGNBQWMsRUFBRSxNQUFNLENBQUMsQ0FBQztLQUMxRTtBQUNILENBQUM7QUFFRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLFVBQVUsWUFBWSxDQUN4QixRQUFrQixFQUFFLFlBQXFCLEVBQUUsS0FBZSxFQUFFLElBQVksRUFBRSxLQUFVO0lBQ3RGLElBQUksWUFBWSxFQUFFO1FBQ2hCLG9GQUFvRjtRQUNwRixJQUFJLENBQUMsS0FBSyxFQUFFO1lBQ1YsU0FBUyxJQUFJLFNBQVMsQ0FBQyxtQkFBbUIsRUFBRSxDQUFDO1lBQzdDLFFBQVEsQ0FBQyxXQUFXLENBQUMsS0FBSyxFQUFFLElBQUksQ0FBQyxDQUFDO1NBQ25DO2FBQU07WUFDTCxTQUFTLElBQUksU0FBUyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDMUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxDQUFDLENBQUM7U0FDaEM7S0FDRjtTQUFNO1FBQ0wsSUFBSSxLQUFLLEdBQUcsSUFBSSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxRQUFrQixDQUFDO1FBQzFGLElBQUksS0FBSyxJQUFJLElBQUksQ0FBQyw2QkFBNkIsRUFBRTtZQUMvQyxTQUFTLElBQUksU0FBUyxDQUFDLG1CQUFtQixFQUFFLENBQUM7WUFDN0MsUUFBUSxDQUFDLFdBQVcsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQzFDO2FBQU07WUFDTCwrREFBK0Q7WUFDL0Qsd0RBQXdEO1lBQ3hELE1BQU0sV0FBVyxHQUFHLE9BQU8sS0FBSyxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLFFBQVEsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDO1lBRXJGLElBQUksV0FBVyxFQUFFO2dCQUNmLG1FQUFtRTtnQkFDbkUsS0FBSyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQzVCLEtBQU0sSUFBSSxtQkFBbUIsQ0FBQyxTQUFTLENBQUM7YUFDekM7WUFFRCxTQUFTLElBQUksU0FBUyxDQUFDLGdCQUFnQixFQUFFLENBQUM7WUFDMUMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxLQUFLLENBQUMsQ0FBQztTQUM5QztLQUNGO0FBQ0gsQ0FBQztBQUdEOzs7Ozs7Ozs7R0FTRztBQUNILE1BQU0sVUFBVSxnQkFBZ0IsQ0FBQyxRQUFrQixFQUFFLE9BQWlCLEVBQUUsUUFBZ0I7SUFDdEYsU0FBUyxJQUFJLFlBQVksQ0FBQyxRQUFRLEVBQUUsaUNBQWlDLENBQUMsQ0FBQztJQUN2RSxRQUFRLENBQUMsWUFBWSxDQUFDLE9BQU8sRUFBRSxPQUFPLEVBQUUsUUFBUSxDQUFDLENBQUM7SUFDbEQsU0FBUyxJQUFJLFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxDQUFDO0FBQzVDLENBQUM7QUFFRDs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLFVBQVUsZ0JBQWdCLENBQUMsUUFBa0IsRUFBRSxPQUFpQixFQUFFLFFBQWdCO0lBQ3RGLFNBQVMsSUFBSSxZQUFZLENBQUMsUUFBUSxFQUFFLGlDQUFpQyxDQUFDLENBQUM7SUFDdkUsSUFBSSxRQUFRLEtBQUssRUFBRSxFQUFFO1FBQ25CLDBGQUEwRjtRQUMxRixRQUFRLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUM1QztTQUFNO1FBQ0wsUUFBUSxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsT0FBTyxFQUFFLFFBQVEsQ0FBQyxDQUFDO0tBQ25EO0lBQ0QsU0FBUyxJQUFJLFNBQVMsQ0FBQyxvQkFBb0IsRUFBRSxDQUFDO0FBQ2hELENBQUM7QUFFRCx1REFBdUQ7QUFDdkQsTUFBTSxVQUFVLHFCQUFxQixDQUFDLFFBQWtCLEVBQUUsT0FBaUIsRUFBRSxLQUFZO0lBQ3ZGLE1BQU0sRUFBQyxXQUFXLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBQyxHQUFHLEtBQUssQ0FBQztJQUU3QyxJQUFJLFdBQVcsS0FBSyxJQUFJLEVBQUU7UUFDeEIsZUFBZSxDQUFDLFFBQVEsRUFBRSxPQUFPLEVBQUUsV0FBVyxDQUFDLENBQUM7S0FDakQ7SUFFRCxJQUFJLE9BQU8sS0FBSyxJQUFJLEVBQUU7UUFDcEIsZ0JBQWdCLENBQUMsUUFBUSxFQUFFLE9BQU8sRUFBRSxPQUFPLENBQUMsQ0FBQztLQUM5QztJQUVELElBQUksTUFBTSxLQUFLLElBQUksRUFBRTtRQUNuQixnQkFBZ0IsQ0FBQyxRQUFRLEVBQUUsT0FBTyxFQUFFLE1BQU0sQ0FBQyxDQUFDO0tBQzdDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge2NvbnN1bWVyRGVzdHJveX0gZnJvbSAnQGFuZ3VsYXIvY29yZS9wcmltaXRpdmVzL3NpZ25hbHMnO1xuXG5pbXBvcnQge2hhc0luU2tpcEh5ZHJhdGlvbkJsb2NrRmxhZ30gZnJvbSAnLi4vaHlkcmF0aW9uL3NraXBfaHlkcmF0aW9uJztcbmltcG9ydCB7Vmlld0VuY2Fwc3VsYXRpb259IGZyb20gJy4uL21ldGFkYXRhL3ZpZXcnO1xuaW1wb3J0IHtSZW5kZXJlclN0eWxlRmxhZ3MyfSBmcm9tICcuLi9yZW5kZXIvYXBpX2ZsYWdzJztcbmltcG9ydCB7YWRkVG9BcnJheSwgcmVtb3ZlRnJvbUFycmF5fSBmcm9tICcuLi91dGlsL2FycmF5X3V0aWxzJztcbmltcG9ydCB7YXNzZXJ0RGVmaW5lZCwgYXNzZXJ0RXF1YWwsIGFzc2VydEZ1bmN0aW9uLCBhc3NlcnROdW1iZXIsIGFzc2VydFN0cmluZ30gZnJvbSAnLi4vdXRpbC9hc3NlcnQnO1xuaW1wb3J0IHtlc2NhcGVDb21tZW50VGV4dH0gZnJvbSAnLi4vdXRpbC9kb20nO1xuXG5pbXBvcnQge2Fzc2VydExDb250YWluZXIsIGFzc2VydExWaWV3LCBhc3NlcnRQYXJlbnRWaWV3LCBhc3NlcnRQcm9qZWN0aW9uU2xvdHMsIGFzc2VydFROb2RlRm9yTFZpZXd9IGZyb20gJy4vYXNzZXJ0JztcbmltcG9ydCB7YXR0YWNoUGF0Y2hEYXRhfSBmcm9tICcuL2NvbnRleHRfZGlzY292ZXJ5JztcbmltcG9ydCB7aWN1Q29udGFpbmVySXRlcmF0ZX0gZnJvbSAnLi9pMThuL2kxOG5fdHJlZV9zaGFraW5nJztcbmltcG9ydCB7Q09OVEFJTkVSX0hFQURFUl9PRkZTRVQsIExDb250YWluZXIsIExDb250YWluZXJGbGFncywgTU9WRURfVklFV1MsIE5BVElWRX0gZnJvbSAnLi9pbnRlcmZhY2VzL2NvbnRhaW5lcic7XG5pbXBvcnQge0NvbXBvbmVudERlZn0gZnJvbSAnLi9pbnRlcmZhY2VzL2RlZmluaXRpb24nO1xuaW1wb3J0IHtOb2RlSW5qZWN0b3JGYWN0b3J5fSBmcm9tICcuL2ludGVyZmFjZXMvaW5qZWN0b3InO1xuaW1wb3J0IHt1bnJlZ2lzdGVyTFZpZXd9IGZyb20gJy4vaW50ZXJmYWNlcy9sdmlld190cmFja2luZyc7XG5pbXBvcnQge1RFbGVtZW50Tm9kZSwgVEljdUNvbnRhaW5lck5vZGUsIFROb2RlLCBUTm9kZUZsYWdzLCBUTm9kZVR5cGUsIFRQcm9qZWN0aW9uTm9kZX0gZnJvbSAnLi9pbnRlcmZhY2VzL25vZGUnO1xuaW1wb3J0IHtSZW5kZXJlcn0gZnJvbSAnLi9pbnRlcmZhY2VzL3JlbmRlcmVyJztcbmltcG9ydCB7UkNvbW1lbnQsIFJFbGVtZW50LCBSTm9kZSwgUlRlbXBsYXRlLCBSVGV4dH0gZnJvbSAnLi9pbnRlcmZhY2VzL3JlbmRlcmVyX2RvbSc7XG5pbXBvcnQge2lzTENvbnRhaW5lciwgaXNMVmlld30gZnJvbSAnLi9pbnRlcmZhY2VzL3R5cGVfY2hlY2tzJztcbmltcG9ydCB7Q0hJTERfSEVBRCwgQ0xFQU5VUCwgREVDTEFSQVRJT05fQ09NUE9ORU5UX1ZJRVcsIERFQ0xBUkFUSU9OX0xDT05UQUlORVIsIERlc3Ryb3lIb29rRGF0YSwgRkxBR1MsIEhvb2tEYXRhLCBIb29rRm4sIEhPU1QsIExWaWV3LCBMVmlld0ZsYWdzLCBORVhULCBPTl9ERVNUUk9ZX0hPT0tTLCBQQVJFTlQsIFFVRVJJRVMsIFJFQUNUSVZFX1RFTVBMQVRFX0NPTlNVTUVSLCBSRU5ERVJFUiwgVF9IT1NULCBUVklFVywgVFZpZXcsIFRWaWV3VHlwZX0gZnJvbSAnLi9pbnRlcmZhY2VzL3ZpZXcnO1xuaW1wb3J0IHthc3NlcnRUTm9kZVR5cGV9IGZyb20gJy4vbm9kZV9hc3NlcnQnO1xuaW1wb3J0IHtwcm9maWxlciwgUHJvZmlsZXJFdmVudH0gZnJvbSAnLi9wcm9maWxlcic7XG5pbXBvcnQge3NldFVwQXR0cmlidXRlc30gZnJvbSAnLi91dGlsL2F0dHJzX3V0aWxzJztcbmltcG9ydCB7Z2V0TFZpZXdQYXJlbnR9IGZyb20gJy4vdXRpbC92aWV3X3RyYXZlcnNhbF91dGlscyc7XG5pbXBvcnQge2dldE5hdGl2ZUJ5VE5vZGUsIHVud3JhcFJOb2RlLCB1cGRhdGVBbmNlc3RvclRyYXZlcnNhbEZsYWdzT25BdHRhY2h9IGZyb20gJy4vdXRpbC92aWV3X3V0aWxzJztcblxuY29uc3QgZW51bSBXYWxrVE5vZGVUcmVlQWN0aW9uIHtcbiAgLyoqIG5vZGUgY3JlYXRlIGluIHRoZSBuYXRpdmUgZW52aXJvbm1lbnQuIFJ1biBvbiBpbml0aWFsIGNyZWF0aW9uLiAqL1xuICBDcmVhdGUgPSAwLFxuXG4gIC8qKlxuICAgKiBub2RlIGluc2VydCBpbiB0aGUgbmF0aXZlIGVudmlyb25tZW50LlxuICAgKiBSdW4gd2hlbiBleGlzdGluZyBub2RlIGhhcyBiZWVuIGRldGFjaGVkIGFuZCBuZWVkcyB0byBiZSByZS1hdHRhY2hlZC5cbiAgICovXG4gIEluc2VydCA9IDEsXG5cbiAgLyoqIG5vZGUgZGV0YWNoIGZyb20gdGhlIG5hdGl2ZSBlbnZpcm9ubWVudCAqL1xuICBEZXRhY2ggPSAyLFxuXG4gIC8qKiBub2RlIGRlc3RydWN0aW9uIHVzaW5nIHRoZSByZW5kZXJlcidzIEFQSSAqL1xuICBEZXN0cm95ID0gMyxcbn1cblxuXG5cbi8qKlxuICogTk9URTogZm9yIHBlcmZvcm1hbmNlIHJlYXNvbnMsIHRoZSBwb3NzaWJsZSBhY3Rpb25zIGFyZSBpbmxpbmVkIHdpdGhpbiB0aGUgZnVuY3Rpb24gaW5zdGVhZCBvZlxuICogYmVpbmcgcGFzc2VkIGFzIGFuIGFyZ3VtZW50LlxuICovXG5mdW5jdGlvbiBhcHBseVRvRWxlbWVudE9yQ29udGFpbmVyKFxuICAgIGFjdGlvbjogV2Fsa1ROb2RlVHJlZUFjdGlvbiwgcmVuZGVyZXI6IFJlbmRlcmVyLCBwYXJlbnQ6IFJFbGVtZW50fG51bGwsXG4gICAgbE5vZGVUb0hhbmRsZTogUk5vZGV8TENvbnRhaW5lcnxMVmlldywgYmVmb3JlTm9kZT86IFJOb2RlfG51bGwpIHtcbiAgLy8gSWYgdGhpcyBzbG90IHdhcyBhbGxvY2F0ZWQgZm9yIGEgdGV4dCBub2RlIGR5bmFtaWNhbGx5IGNyZWF0ZWQgYnkgaTE4biwgdGhlIHRleHQgbm9kZSBpdHNlbGZcbiAgLy8gd29uJ3QgYmUgY3JlYXRlZCB1bnRpbCBpMThuQXBwbHkoKSBpbiB0aGUgdXBkYXRlIGJsb2NrLCBzbyB0aGlzIG5vZGUgc2hvdWxkIGJlIHNraXBwZWQuXG4gIC8vIEZvciBtb3JlIGluZm8sIHNlZSBcIklDVSBleHByZXNzaW9ucyBzaG91bGQgd29yayBpbnNpZGUgYW4gbmdUZW1wbGF0ZU91dGxldCBpbnNpZGUgYW4gbmdGb3JcIlxuICAvLyBpbiBgaTE4bl9zcGVjLnRzYC5cbiAgaWYgKGxOb2RlVG9IYW5kbGUgIT0gbnVsbCkge1xuICAgIGxldCBsQ29udGFpbmVyOiBMQ29udGFpbmVyfHVuZGVmaW5lZDtcbiAgICBsZXQgaXNDb21wb25lbnQgPSBmYWxzZTtcbiAgICAvLyBXZSBhcmUgZXhwZWN0aW5nIGFuIFJOb2RlLCBidXQgaW4gdGhlIGNhc2Ugb2YgYSBjb21wb25lbnQgb3IgTENvbnRhaW5lciB0aGUgYFJOb2RlYCBpc1xuICAgIC8vIHdyYXBwZWQgaW4gYW4gYXJyYXkgd2hpY2ggbmVlZHMgdG8gYmUgdW53cmFwcGVkLiBXZSBuZWVkIHRvIGtub3cgaWYgaXQgaXMgYSBjb21wb25lbnQgYW5kIGlmXG4gICAgLy8gaXQgaGFzIExDb250YWluZXIgc28gdGhhdCB3ZSBjYW4gcHJvY2VzcyBhbGwgb2YgdGhvc2UgY2FzZXMgYXBwcm9wcmlhdGVseS5cbiAgICBpZiAoaXNMQ29udGFpbmVyKGxOb2RlVG9IYW5kbGUpKSB7XG4gICAgICBsQ29udGFpbmVyID0gbE5vZGVUb0hhbmRsZTtcbiAgICB9IGVsc2UgaWYgKGlzTFZpZXcobE5vZGVUb0hhbmRsZSkpIHtcbiAgICAgIGlzQ29tcG9uZW50ID0gdHJ1ZTtcbiAgICAgIG5nRGV2TW9kZSAmJiBhc3NlcnREZWZpbmVkKGxOb2RlVG9IYW5kbGVbSE9TVF0sICdIT1NUIG11c3QgYmUgZGVmaW5lZCBmb3IgYSBjb21wb25lbnQgTFZpZXcnKTtcbiAgICAgIGxOb2RlVG9IYW5kbGUgPSBsTm9kZVRvSGFuZGxlW0hPU1RdITtcbiAgICB9XG4gICAgY29uc3Qgck5vZGU6IFJOb2RlID0gdW53cmFwUk5vZGUobE5vZGVUb0hhbmRsZSk7XG5cbiAgICBpZiAoYWN0aW9uID09PSBXYWxrVE5vZGVUcmVlQWN0aW9uLkNyZWF0ZSAmJiBwYXJlbnQgIT09IG51bGwpIHtcbiAgICAgIGlmIChiZWZvcmVOb2RlID09IG51bGwpIHtcbiAgICAgICAgbmF0aXZlQXBwZW5kQ2hpbGQocmVuZGVyZXIsIHBhcmVudCwgck5vZGUpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbmF0aXZlSW5zZXJ0QmVmb3JlKHJlbmRlcmVyLCBwYXJlbnQsIHJOb2RlLCBiZWZvcmVOb2RlIHx8IG51bGwsIHRydWUpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYWN0aW9uID09PSBXYWxrVE5vZGVUcmVlQWN0aW9uLkluc2VydCAmJiBwYXJlbnQgIT09IG51bGwpIHtcbiAgICAgIG5hdGl2ZUluc2VydEJlZm9yZShyZW5kZXJlciwgcGFyZW50LCByTm9kZSwgYmVmb3JlTm9kZSB8fCBudWxsLCB0cnVlKTtcbiAgICB9IGVsc2UgaWYgKGFjdGlvbiA9PT0gV2Fsa1ROb2RlVHJlZUFjdGlvbi5EZXRhY2gpIHtcbiAgICAgIG5hdGl2ZVJlbW92ZU5vZGUocmVuZGVyZXIsIHJOb2RlLCBpc0NvbXBvbmVudCk7XG4gICAgfSBlbHNlIGlmIChhY3Rpb24gPT09IFdhbGtUTm9kZVRyZWVBY3Rpb24uRGVzdHJveSkge1xuICAgICAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlckRlc3Ryb3lOb2RlKys7XG4gICAgICByZW5kZXJlci5kZXN0cm95Tm9kZSEock5vZGUpO1xuICAgIH1cbiAgICBpZiAobENvbnRhaW5lciAhPSBudWxsKSB7XG4gICAgICBhcHBseUNvbnRhaW5lcihyZW5kZXJlciwgYWN0aW9uLCBsQ29udGFpbmVyLCBwYXJlbnQsIGJlZm9yZU5vZGUpO1xuICAgIH1cbiAgfVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlVGV4dE5vZGUocmVuZGVyZXI6IFJlbmRlcmVyLCB2YWx1ZTogc3RyaW5nKTogUlRleHQge1xuICBuZ0Rldk1vZGUgJiYgbmdEZXZNb2RlLnJlbmRlcmVyQ3JlYXRlVGV4dE5vZGUrKztcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlclNldFRleHQrKztcbiAgcmV0dXJuIHJlbmRlcmVyLmNyZWF0ZVRleHQodmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlVGV4dE5vZGUocmVuZGVyZXI6IFJlbmRlcmVyLCByTm9kZTogUlRleHQsIHZhbHVlOiBzdHJpbmcpOiB2b2lkIHtcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlclNldFRleHQrKztcbiAgcmVuZGVyZXIuc2V0VmFsdWUock5vZGUsIHZhbHVlKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNvbW1lbnROb2RlKHJlbmRlcmVyOiBSZW5kZXJlciwgdmFsdWU6IHN0cmluZyk6IFJDb21tZW50IHtcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlckNyZWF0ZUNvbW1lbnQrKztcbiAgcmV0dXJuIHJlbmRlcmVyLmNyZWF0ZUNvbW1lbnQoZXNjYXBlQ29tbWVudFRleHQodmFsdWUpKTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbmF0aXZlIGVsZW1lbnQgZnJvbSBhIHRhZyBuYW1lLCB1c2luZyBhIHJlbmRlcmVyLlxuICogQHBhcmFtIHJlbmRlcmVyIEEgcmVuZGVyZXIgdG8gdXNlXG4gKiBAcGFyYW0gbmFtZSB0aGUgdGFnIG5hbWVcbiAqIEBwYXJhbSBuYW1lc3BhY2UgT3B0aW9uYWwgbmFtZXNwYWNlIGZvciBlbGVtZW50LlxuICogQHJldHVybnMgdGhlIGVsZW1lbnQgY3JlYXRlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlRWxlbWVudE5vZGUoXG4gICAgcmVuZGVyZXI6IFJlbmRlcmVyLCBuYW1lOiBzdHJpbmcsIG5hbWVzcGFjZTogc3RyaW5nfG51bGwpOiBSRWxlbWVudCB7XG4gIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUucmVuZGVyZXJDcmVhdGVFbGVtZW50Kys7XG4gIHJldHVybiByZW5kZXJlci5jcmVhdGVFbGVtZW50KG5hbWUsIG5hbWVzcGFjZSk7XG59XG5cblxuLyoqXG4gKiBSZW1vdmVzIGFsbCBET00gZWxlbWVudHMgYXNzb2NpYXRlZCB3aXRoIGEgdmlldy5cbiAqXG4gKiBCZWNhdXNlIHNvbWUgcm9vdCBub2RlcyBvZiB0aGUgdmlldyBtYXkgYmUgY29udGFpbmVycywgd2Ugc29tZXRpbWVzIG5lZWRcbiAqIHRvIHByb3BhZ2F0ZSBkZWVwbHkgaW50byB0aGUgbmVzdGVkIGNvbnRhaW5lcnMgdG8gcmVtb3ZlIGFsbCBlbGVtZW50cyBpbiB0aGVcbiAqIHZpZXdzIGJlbmVhdGggaXQuXG4gKlxuICogQHBhcmFtIHRWaWV3IFRoZSBgVFZpZXcnIG9mIHRoZSBgTFZpZXdgIGZyb20gd2hpY2ggZWxlbWVudHMgc2hvdWxkIGJlIGFkZGVkIG9yIHJlbW92ZWRcbiAqIEBwYXJhbSBsVmlldyBUaGUgdmlldyBmcm9tIHdoaWNoIGVsZW1lbnRzIHNob3VsZCBiZSBhZGRlZCBvciByZW1vdmVkXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW1vdmVWaWV3RnJvbURPTSh0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldyk6IHZvaWQge1xuICBjb25zdCByZW5kZXJlciA9IGxWaWV3W1JFTkRFUkVSXTtcbiAgYXBwbHlWaWV3KHRWaWV3LCBsVmlldywgcmVuZGVyZXIsIFdhbGtUTm9kZVRyZWVBY3Rpb24uRGV0YWNoLCBudWxsLCBudWxsKTtcbiAgbFZpZXdbSE9TVF0gPSBudWxsO1xuICBsVmlld1tUX0hPU1RdID0gbnVsbDtcbn1cblxuLyoqXG4gKiBBZGRzIGFsbCBET00gZWxlbWVudHMgYXNzb2NpYXRlZCB3aXRoIGEgdmlldy5cbiAqXG4gKiBCZWNhdXNlIHNvbWUgcm9vdCBub2RlcyBvZiB0aGUgdmlldyBtYXkgYmUgY29udGFpbmVycywgd2Ugc29tZXRpbWVzIG5lZWRcbiAqIHRvIHByb3BhZ2F0ZSBkZWVwbHkgaW50byB0aGUgbmVzdGVkIGNvbnRhaW5lcnMgdG8gYWRkIGFsbCBlbGVtZW50cyBpbiB0aGVcbiAqIHZpZXdzIGJlbmVhdGggaXQuXG4gKlxuICogQHBhcmFtIHRWaWV3IFRoZSBgVFZpZXcnIG9mIHRoZSBgTFZpZXdgIGZyb20gd2hpY2ggZWxlbWVudHMgc2hvdWxkIGJlIGFkZGVkIG9yIHJlbW92ZWRcbiAqIEBwYXJhbSBwYXJlbnRUTm9kZSBUaGUgYFROb2RlYCB3aGVyZSB0aGUgYExWaWV3YCBzaG91bGQgYmUgYXR0YWNoZWQgdG8uXG4gKiBAcGFyYW0gcmVuZGVyZXIgQ3VycmVudCByZW5kZXJlciB0byB1c2UgZm9yIERPTSBtYW5pcHVsYXRpb25zLlxuICogQHBhcmFtIGxWaWV3IFRoZSB2aWV3IGZyb20gd2hpY2ggZWxlbWVudHMgc2hvdWxkIGJlIGFkZGVkIG9yIHJlbW92ZWRcbiAqIEBwYXJhbSBwYXJlbnROYXRpdmVOb2RlIFRoZSBwYXJlbnQgYFJFbGVtZW50YCB3aGVyZSBpdCBzaG91bGQgYmUgaW5zZXJ0ZWQgaW50by5cbiAqIEBwYXJhbSBiZWZvcmVOb2RlIFRoZSBub2RlIGJlZm9yZSB3aGljaCBlbGVtZW50cyBzaG91bGQgYmUgYWRkZWQsIGlmIGluc2VydCBtb2RlXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhZGRWaWV3VG9ET00oXG4gICAgdFZpZXc6IFRWaWV3LCBwYXJlbnRUTm9kZTogVE5vZGUsIHJlbmRlcmVyOiBSZW5kZXJlciwgbFZpZXc6IExWaWV3LCBwYXJlbnROYXRpdmVOb2RlOiBSRWxlbWVudCxcbiAgICBiZWZvcmVOb2RlOiBSTm9kZXxudWxsKTogdm9pZCB7XG4gIGxWaWV3W0hPU1RdID0gcGFyZW50TmF0aXZlTm9kZTtcbiAgbFZpZXdbVF9IT1NUXSA9IHBhcmVudFROb2RlO1xuICBhcHBseVZpZXcodFZpZXcsIGxWaWV3LCByZW5kZXJlciwgV2Fsa1ROb2RlVHJlZUFjdGlvbi5JbnNlcnQsIHBhcmVudE5hdGl2ZU5vZGUsIGJlZm9yZU5vZGUpO1xufVxuXG5cbi8qKlxuICogRGV0YWNoIGEgYExWaWV3YCBmcm9tIHRoZSBET00gYnkgZGV0YWNoaW5nIGl0cyBub2Rlcy5cbiAqXG4gKiBAcGFyYW0gdFZpZXcgVGhlIGBUVmlldycgb2YgdGhlIGBMVmlld2AgdG8gYmUgZGV0YWNoZWRcbiAqIEBwYXJhbSBsVmlldyB0aGUgYExWaWV3YCB0byBiZSBkZXRhY2hlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRldGFjaFZpZXdGcm9tRE9NKHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3KSB7XG4gIGFwcGx5Vmlldyh0VmlldywgbFZpZXcsIGxWaWV3W1JFTkRFUkVSXSwgV2Fsa1ROb2RlVHJlZUFjdGlvbi5EZXRhY2gsIG51bGwsIG51bGwpO1xufVxuXG4vKipcbiAqIFRyYXZlcnNlcyBkb3duIGFuZCB1cCB0aGUgdHJlZSBvZiB2aWV3cyBhbmQgY29udGFpbmVycyB0byByZW1vdmUgbGlzdGVuZXJzIGFuZFxuICogY2FsbCBvbkRlc3Ryb3kgY2FsbGJhY2tzLlxuICpcbiAqIE5vdGVzOlxuICogIC0gQmVjYXVzZSBpdCdzIHVzZWQgZm9yIG9uRGVzdHJveSBjYWxscywgaXQgbmVlZHMgdG8gYmUgYm90dG9tLXVwLlxuICogIC0gTXVzdCBwcm9jZXNzIGNvbnRhaW5lcnMgaW5zdGVhZCBvZiB0aGVpciB2aWV3cyB0byBhdm9pZCBzcGxpY2luZ1xuICogIHdoZW4gdmlld3MgYXJlIGRlc3Ryb3llZCBhbmQgcmUtYWRkZWQuXG4gKiAgLSBVc2luZyBhIHdoaWxlIGxvb3AgYmVjYXVzZSBpdCdzIGZhc3RlciB0aGFuIHJlY3Vyc2lvblxuICogIC0gRGVzdHJveSBvbmx5IGNhbGxlZCBvbiBtb3ZlbWVudCB0byBzaWJsaW5nIG9yIG1vdmVtZW50IHRvIHBhcmVudCAobGF0ZXJhbGx5IG9yIHVwKVxuICpcbiAqICBAcGFyYW0gcm9vdFZpZXcgVGhlIHZpZXcgdG8gZGVzdHJveVxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVzdHJveVZpZXdUcmVlKHJvb3RWaWV3OiBMVmlldyk6IHZvaWQge1xuICAvLyBJZiB0aGUgdmlldyBoYXMgbm8gY2hpbGRyZW4sIHdlIGNhbiBjbGVhbiBpdCB1cCBhbmQgcmV0dXJuIGVhcmx5LlxuICBsZXQgbFZpZXdPckxDb250YWluZXIgPSByb290Vmlld1tDSElMRF9IRUFEXTtcbiAgaWYgKCFsVmlld09yTENvbnRhaW5lcikge1xuICAgIHJldHVybiBjbGVhblVwVmlldyhyb290Vmlld1tUVklFV10sIHJvb3RWaWV3KTtcbiAgfVxuXG4gIHdoaWxlIChsVmlld09yTENvbnRhaW5lcikge1xuICAgIGxldCBuZXh0OiBMVmlld3xMQ29udGFpbmVyfG51bGwgPSBudWxsO1xuXG4gICAgaWYgKGlzTFZpZXcobFZpZXdPckxDb250YWluZXIpKSB7XG4gICAgICAvLyBJZiBMVmlldywgdHJhdmVyc2UgZG93biB0byBjaGlsZC5cbiAgICAgIG5leHQgPSBsVmlld09yTENvbnRhaW5lcltDSElMRF9IRUFEXTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmdEZXZNb2RlICYmIGFzc2VydExDb250YWluZXIobFZpZXdPckxDb250YWluZXIpO1xuICAgICAgLy8gSWYgY29udGFpbmVyLCB0cmF2ZXJzZSBkb3duIHRvIGl0cyBmaXJzdCBMVmlldy5cbiAgICAgIGNvbnN0IGZpcnN0VmlldzogTFZpZXd8dW5kZWZpbmVkID0gbFZpZXdPckxDb250YWluZXJbQ09OVEFJTkVSX0hFQURFUl9PRkZTRVRdO1xuICAgICAgaWYgKGZpcnN0VmlldykgbmV4dCA9IGZpcnN0VmlldztcbiAgICB9XG5cbiAgICBpZiAoIW5leHQpIHtcbiAgICAgIC8vIE9ubHkgY2xlYW4gdXAgdmlldyB3aGVuIG1vdmluZyB0byB0aGUgc2lkZSBvciB1cCwgYXMgZGVzdHJveSBob29rc1xuICAgICAgLy8gc2hvdWxkIGJlIGNhbGxlZCBpbiBvcmRlciBmcm9tIHRoZSBib3R0b20gdXAuXG4gICAgICB3aGlsZSAobFZpZXdPckxDb250YWluZXIgJiYgIWxWaWV3T3JMQ29udGFpbmVyIVtORVhUXSAmJiBsVmlld09yTENvbnRhaW5lciAhPT0gcm9vdFZpZXcpIHtcbiAgICAgICAgaWYgKGlzTFZpZXcobFZpZXdPckxDb250YWluZXIpKSB7XG4gICAgICAgICAgY2xlYW5VcFZpZXcobFZpZXdPckxDb250YWluZXJbVFZJRVddLCBsVmlld09yTENvbnRhaW5lcik7XG4gICAgICAgIH1cbiAgICAgICAgbFZpZXdPckxDb250YWluZXIgPSBsVmlld09yTENvbnRhaW5lcltQQVJFTlRdO1xuICAgICAgfVxuICAgICAgaWYgKGxWaWV3T3JMQ29udGFpbmVyID09PSBudWxsKSBsVmlld09yTENvbnRhaW5lciA9IHJvb3RWaWV3O1xuICAgICAgaWYgKGlzTFZpZXcobFZpZXdPckxDb250YWluZXIpKSB7XG4gICAgICAgIGNsZWFuVXBWaWV3KGxWaWV3T3JMQ29udGFpbmVyW1RWSUVXXSwgbFZpZXdPckxDb250YWluZXIpO1xuICAgICAgfVxuICAgICAgbmV4dCA9IGxWaWV3T3JMQ29udGFpbmVyICYmIGxWaWV3T3JMQ29udGFpbmVyIVtORVhUXTtcbiAgICB9XG4gICAgbFZpZXdPckxDb250YWluZXIgPSBuZXh0O1xuICB9XG59XG5cbi8qKlxuICogSW5zZXJ0cyBhIHZpZXcgaW50byBhIGNvbnRhaW5lci5cbiAqXG4gKiBUaGlzIGFkZHMgdGhlIHZpZXcgdG8gdGhlIGNvbnRhaW5lcidzIGFycmF5IG9mIGFjdGl2ZSB2aWV3cyBpbiB0aGUgY29ycmVjdFxuICogcG9zaXRpb24uIEl0IGFsc28gYWRkcyB0aGUgdmlldydzIGVsZW1lbnRzIHRvIHRoZSBET00gaWYgdGhlIGNvbnRhaW5lciBpc24ndCBhXG4gKiByb290IG5vZGUgb2YgYW5vdGhlciB2aWV3IChpbiB0aGF0IGNhc2UsIHRoZSB2aWV3J3MgZWxlbWVudHMgd2lsbCBiZSBhZGRlZCB3aGVuXG4gKiB0aGUgY29udGFpbmVyJ3MgcGFyZW50IHZpZXcgaXMgYWRkZWQgbGF0ZXIpLlxuICpcbiAqIEBwYXJhbSB0VmlldyBUaGUgYFRWaWV3JyBvZiB0aGUgYExWaWV3YCB0byBpbnNlcnRcbiAqIEBwYXJhbSBsVmlldyBUaGUgdmlldyB0byBpbnNlcnRcbiAqIEBwYXJhbSBsQ29udGFpbmVyIFRoZSBjb250YWluZXIgaW50byB3aGljaCB0aGUgdmlldyBzaG91bGQgYmUgaW5zZXJ0ZWRcbiAqIEBwYXJhbSBpbmRleCBXaGljaCBpbmRleCBpbiB0aGUgY29udGFpbmVyIHRvIGluc2VydCB0aGUgY2hpbGQgdmlldyBpbnRvXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpbnNlcnRWaWV3KHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3LCBsQ29udGFpbmVyOiBMQ29udGFpbmVyLCBpbmRleDogbnVtYmVyKSB7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRMVmlldyhsVmlldyk7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRMQ29udGFpbmVyKGxDb250YWluZXIpO1xuICBjb25zdCBpbmRleEluQ29udGFpbmVyID0gQ09OVEFJTkVSX0hFQURFUl9PRkZTRVQgKyBpbmRleDtcbiAgY29uc3QgY29udGFpbmVyTGVuZ3RoID0gbENvbnRhaW5lci5sZW5ndGg7XG5cbiAgaWYgKGluZGV4ID4gMCkge1xuICAgIC8vIFRoaXMgaXMgYSBuZXcgdmlldywgd2UgbmVlZCB0byBhZGQgaXQgdG8gdGhlIGNoaWxkcmVuLlxuICAgIGxDb250YWluZXJbaW5kZXhJbkNvbnRhaW5lciAtIDFdW05FWFRdID0gbFZpZXc7XG4gIH1cbiAgaWYgKGluZGV4IDwgY29udGFpbmVyTGVuZ3RoIC0gQ09OVEFJTkVSX0hFQURFUl9PRkZTRVQpIHtcbiAgICBsVmlld1tORVhUXSA9IGxDb250YWluZXJbaW5kZXhJbkNvbnRhaW5lcl07XG4gICAgYWRkVG9BcnJheShsQ29udGFpbmVyLCBDT05UQUlORVJfSEVBREVSX09GRlNFVCArIGluZGV4LCBsVmlldyk7XG4gIH0gZWxzZSB7XG4gICAgbENvbnRhaW5lci5wdXNoKGxWaWV3KTtcbiAgICBsVmlld1tORVhUXSA9IG51bGw7XG4gIH1cblxuICBsVmlld1tQQVJFTlRdID0gbENvbnRhaW5lcjtcblxuICAvLyB0cmFjayB2aWV3cyB3aGVyZSBkZWNsYXJhdGlvbiBhbmQgaW5zZXJ0aW9uIHBvaW50cyBhcmUgZGlmZmVyZW50XG4gIGNvbnN0IGRlY2xhcmF0aW9uTENvbnRhaW5lciA9IGxWaWV3W0RFQ0xBUkFUSU9OX0xDT05UQUlORVJdO1xuICBpZiAoZGVjbGFyYXRpb25MQ29udGFpbmVyICE9PSBudWxsICYmIGxDb250YWluZXIgIT09IGRlY2xhcmF0aW9uTENvbnRhaW5lcikge1xuICAgIHRyYWNrTW92ZWRWaWV3KGRlY2xhcmF0aW9uTENvbnRhaW5lciwgbFZpZXcpO1xuICB9XG5cbiAgLy8gbm90aWZ5IHF1ZXJ5IHRoYXQgYSBuZXcgdmlldyBoYXMgYmVlbiBhZGRlZFxuICBjb25zdCBsUXVlcmllcyA9IGxWaWV3W1FVRVJJRVNdO1xuICBpZiAobFF1ZXJpZXMgIT09IG51bGwpIHtcbiAgICBsUXVlcmllcy5pbnNlcnRWaWV3KHRWaWV3KTtcbiAgfVxuXG4gIHVwZGF0ZUFuY2VzdG9yVHJhdmVyc2FsRmxhZ3NPbkF0dGFjaChsVmlldyk7XG4gIC8vIFNldHMgdGhlIGF0dGFjaGVkIGZsYWdcbiAgbFZpZXdbRkxBR1NdIHw9IExWaWV3RmxhZ3MuQXR0YWNoZWQ7XG59XG5cbi8qKlxuICogVHJhY2sgdmlld3MgY3JlYXRlZCBmcm9tIHRoZSBkZWNsYXJhdGlvbiBjb250YWluZXIgKFRlbXBsYXRlUmVmKSBhbmQgaW5zZXJ0ZWQgaW50byBhXG4gKiBkaWZmZXJlbnQgTENvbnRhaW5lci5cbiAqL1xuZnVuY3Rpb24gdHJhY2tNb3ZlZFZpZXcoZGVjbGFyYXRpb25Db250YWluZXI6IExDb250YWluZXIsIGxWaWV3OiBMVmlldykge1xuICBuZ0Rldk1vZGUgJiYgYXNzZXJ0RGVmaW5lZChsVmlldywgJ0xWaWV3IHJlcXVpcmVkJyk7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRMQ29udGFpbmVyKGRlY2xhcmF0aW9uQ29udGFpbmVyKTtcbiAgY29uc3QgbW92ZWRWaWV3cyA9IGRlY2xhcmF0aW9uQ29udGFpbmVyW01PVkVEX1ZJRVdTXTtcbiAgY29uc3QgaW5zZXJ0ZWRMQ29udGFpbmVyID0gbFZpZXdbUEFSRU5UXSBhcyBMQ29udGFpbmVyO1xuICBuZ0Rldk1vZGUgJiYgYXNzZXJ0TENvbnRhaW5lcihpbnNlcnRlZExDb250YWluZXIpO1xuICBjb25zdCBpbnNlcnRlZENvbXBvbmVudExWaWV3ID0gaW5zZXJ0ZWRMQ29udGFpbmVyW1BBUkVOVF0hW0RFQ0xBUkFUSU9OX0NPTVBPTkVOVF9WSUVXXTtcbiAgbmdEZXZNb2RlICYmIGFzc2VydERlZmluZWQoaW5zZXJ0ZWRDb21wb25lbnRMVmlldywgJ01pc3NpbmcgaW5zZXJ0ZWRDb21wb25lbnRMVmlldycpO1xuICBjb25zdCBkZWNsYXJlZENvbXBvbmVudExWaWV3ID0gbFZpZXdbREVDTEFSQVRJT05fQ09NUE9ORU5UX1ZJRVddO1xuICBuZ0Rldk1vZGUgJiYgYXNzZXJ0RGVmaW5lZChkZWNsYXJlZENvbXBvbmVudExWaWV3LCAnTWlzc2luZyBkZWNsYXJlZENvbXBvbmVudExWaWV3Jyk7XG4gIGlmIChkZWNsYXJlZENvbXBvbmVudExWaWV3ICE9PSBpbnNlcnRlZENvbXBvbmVudExWaWV3KSB7XG4gICAgLy8gQXQgdGhpcyBwb2ludCB0aGUgZGVjbGFyYXRpb24tY29tcG9uZW50IGlzIG5vdCBzYW1lIGFzIGluc2VydGlvbi1jb21wb25lbnQ7IHRoaXMgbWVhbnMgdGhhdFxuICAgIC8vIHRoaXMgaXMgYSB0cmFuc3BsYW50ZWQgdmlldy4gTWFyayB0aGUgZGVjbGFyZWQgbFZpZXcgYXMgaGF2aW5nIHRyYW5zcGxhbnRlZCB2aWV3cyBzbyB0aGF0XG4gICAgLy8gdGhvc2Ugdmlld3MgY2FuIHBhcnRpY2lwYXRlIGluIENELlxuICAgIGRlY2xhcmF0aW9uQ29udGFpbmVyW0ZMQUdTXSB8PSBMQ29udGFpbmVyRmxhZ3MuSGFzVHJhbnNwbGFudGVkVmlld3M7XG4gIH1cbiAgaWYgKG1vdmVkVmlld3MgPT09IG51bGwpIHtcbiAgICBkZWNsYXJhdGlvbkNvbnRhaW5lcltNT1ZFRF9WSUVXU10gPSBbbFZpZXddO1xuICB9IGVsc2Uge1xuICAgIG1vdmVkVmlld3MucHVzaChsVmlldyk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZGV0YWNoTW92ZWRWaWV3KGRlY2xhcmF0aW9uQ29udGFpbmVyOiBMQ29udGFpbmVyLCBsVmlldzogTFZpZXcpIHtcbiAgbmdEZXZNb2RlICYmIGFzc2VydExDb250YWluZXIoZGVjbGFyYXRpb25Db250YWluZXIpO1xuICBuZ0Rldk1vZGUgJiZcbiAgICAgIGFzc2VydERlZmluZWQoXG4gICAgICAgICAgZGVjbGFyYXRpb25Db250YWluZXJbTU9WRURfVklFV1NdLFxuICAgICAgICAgICdBIHByb2plY3RlZCB2aWV3IHNob3VsZCBiZWxvbmcgdG8gYSBub24tZW1wdHkgcHJvamVjdGVkIHZpZXdzIGNvbGxlY3Rpb24nKTtcbiAgY29uc3QgbW92ZWRWaWV3cyA9IGRlY2xhcmF0aW9uQ29udGFpbmVyW01PVkVEX1ZJRVdTXSE7XG4gIGNvbnN0IGRlY2xhcmF0aW9uVmlld0luZGV4ID0gbW92ZWRWaWV3cy5pbmRleE9mKGxWaWV3KTtcbiAgY29uc3QgaW5zZXJ0aW9uTENvbnRhaW5lciA9IGxWaWV3W1BBUkVOVF0gYXMgTENvbnRhaW5lcjtcbiAgbmdEZXZNb2RlICYmIGFzc2VydExDb250YWluZXIoaW5zZXJ0aW9uTENvbnRhaW5lcik7XG4gIG1vdmVkVmlld3Muc3BsaWNlKGRlY2xhcmF0aW9uVmlld0luZGV4LCAxKTtcbn1cblxuLyoqXG4gKiBEZXRhY2hlcyBhIHZpZXcgZnJvbSBhIGNvbnRhaW5lci5cbiAqXG4gKiBUaGlzIG1ldGhvZCByZW1vdmVzIHRoZSB2aWV3IGZyb20gdGhlIGNvbnRhaW5lcidzIGFycmF5IG9mIGFjdGl2ZSB2aWV3cy4gSXQgYWxzb1xuICogcmVtb3ZlcyB0aGUgdmlldydzIGVsZW1lbnRzIGZyb20gdGhlIERPTS5cbiAqXG4gKiBAcGFyYW0gbENvbnRhaW5lciBUaGUgY29udGFpbmVyIGZyb20gd2hpY2ggdG8gZGV0YWNoIGEgdmlld1xuICogQHBhcmFtIHJlbW92ZUluZGV4IFRoZSBpbmRleCBvZiB0aGUgdmlldyB0byBkZXRhY2hcbiAqIEByZXR1cm5zIERldGFjaGVkIExWaWV3IGluc3RhbmNlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGV0YWNoVmlldyhsQ29udGFpbmVyOiBMQ29udGFpbmVyLCByZW1vdmVJbmRleDogbnVtYmVyKTogTFZpZXd8dW5kZWZpbmVkIHtcbiAgaWYgKGxDb250YWluZXIubGVuZ3RoIDw9IENPTlRBSU5FUl9IRUFERVJfT0ZGU0VUKSByZXR1cm47XG5cbiAgY29uc3QgaW5kZXhJbkNvbnRhaW5lciA9IENPTlRBSU5FUl9IRUFERVJfT0ZGU0VUICsgcmVtb3ZlSW5kZXg7XG4gIGNvbnN0IHZpZXdUb0RldGFjaCA9IGxDb250YWluZXJbaW5kZXhJbkNvbnRhaW5lcl07XG5cbiAgaWYgKHZpZXdUb0RldGFjaCkge1xuICAgIGNvbnN0IGRlY2xhcmF0aW9uTENvbnRhaW5lciA9IHZpZXdUb0RldGFjaFtERUNMQVJBVElPTl9MQ09OVEFJTkVSXTtcbiAgICBpZiAoZGVjbGFyYXRpb25MQ29udGFpbmVyICE9PSBudWxsICYmIGRlY2xhcmF0aW9uTENvbnRhaW5lciAhPT0gbENvbnRhaW5lcikge1xuICAgICAgZGV0YWNoTW92ZWRWaWV3KGRlY2xhcmF0aW9uTENvbnRhaW5lciwgdmlld1RvRGV0YWNoKTtcbiAgICB9XG5cblxuICAgIGlmIChyZW1vdmVJbmRleCA+IDApIHtcbiAgICAgIGxDb250YWluZXJbaW5kZXhJbkNvbnRhaW5lciAtIDFdW05FWFRdID0gdmlld1RvRGV0YWNoW05FWFRdIGFzIExWaWV3O1xuICAgIH1cbiAgICBjb25zdCByZW1vdmVkTFZpZXcgPSByZW1vdmVGcm9tQXJyYXkobENvbnRhaW5lciwgQ09OVEFJTkVSX0hFQURFUl9PRkZTRVQgKyByZW1vdmVJbmRleCk7XG4gICAgcmVtb3ZlVmlld0Zyb21ET00odmlld1RvRGV0YWNoW1RWSUVXXSwgdmlld1RvRGV0YWNoKTtcblxuICAgIC8vIG5vdGlmeSBxdWVyeSB0aGF0IGEgdmlldyBoYXMgYmVlbiByZW1vdmVkXG4gICAgY29uc3QgbFF1ZXJpZXMgPSByZW1vdmVkTFZpZXdbUVVFUklFU107XG4gICAgaWYgKGxRdWVyaWVzICE9PSBudWxsKSB7XG4gICAgICBsUXVlcmllcy5kZXRhY2hWaWV3KHJlbW92ZWRMVmlld1tUVklFV10pO1xuICAgIH1cblxuICAgIHZpZXdUb0RldGFjaFtQQVJFTlRdID0gbnVsbDtcbiAgICB2aWV3VG9EZXRhY2hbTkVYVF0gPSBudWxsO1xuICAgIC8vIFVuc2V0cyB0aGUgYXR0YWNoZWQgZmxhZ1xuICAgIHZpZXdUb0RldGFjaFtGTEFHU10gJj0gfkxWaWV3RmxhZ3MuQXR0YWNoZWQ7XG4gIH1cbiAgcmV0dXJuIHZpZXdUb0RldGFjaDtcbn1cblxuLyoqXG4gKiBBIHN0YW5kYWxvbmUgZnVuY3Rpb24gd2hpY2ggZGVzdHJveXMgYW4gTFZpZXcsXG4gKiBjb25kdWN0aW5nIGNsZWFuIHVwIChlLmcuIHJlbW92aW5nIGxpc3RlbmVycywgY2FsbGluZyBvbkRlc3Ryb3lzKS5cbiAqXG4gKiBAcGFyYW0gdFZpZXcgVGhlIGBUVmlldycgb2YgdGhlIGBMVmlld2AgdG8gYmUgZGVzdHJveWVkXG4gKiBAcGFyYW0gbFZpZXcgVGhlIHZpZXcgdG8gYmUgZGVzdHJveWVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZGVzdHJveUxWaWV3KHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3KSB7XG4gIGlmICghKGxWaWV3W0ZMQUdTXSAmIExWaWV3RmxhZ3MuRGVzdHJveWVkKSkge1xuICAgIGNvbnN0IHJlbmRlcmVyID0gbFZpZXdbUkVOREVSRVJdO1xuXG4gICAgaWYgKHJlbmRlcmVyLmRlc3Ryb3lOb2RlKSB7XG4gICAgICBhcHBseVZpZXcodFZpZXcsIGxWaWV3LCByZW5kZXJlciwgV2Fsa1ROb2RlVHJlZUFjdGlvbi5EZXN0cm95LCBudWxsLCBudWxsKTtcbiAgICB9XG5cbiAgICBkZXN0cm95Vmlld1RyZWUobFZpZXcpO1xuICB9XG59XG5cbi8qKlxuICogQ2FsbHMgb25EZXN0cm95cyBob29rcyBmb3IgYWxsIGRpcmVjdGl2ZXMgYW5kIHBpcGVzIGluIGEgZ2l2ZW4gdmlldyBhbmQgdGhlbiByZW1vdmVzIGFsbFxuICogbGlzdGVuZXJzLiBMaXN0ZW5lcnMgYXJlIHJlbW92ZWQgYXMgdGhlIGxhc3Qgc3RlcCBzbyBldmVudHMgZGVsaXZlcmVkIGluIHRoZSBvbkRlc3Ryb3lzIGhvb2tzXG4gKiBjYW4gYmUgcHJvcGFnYXRlZCB0byBAT3V0cHV0IGxpc3RlbmVycy5cbiAqXG4gKiBAcGFyYW0gdFZpZXcgYFRWaWV3YCBmb3IgdGhlIGBMVmlld2AgdG8gY2xlYW4gdXAuXG4gKiBAcGFyYW0gbFZpZXcgVGhlIExWaWV3IHRvIGNsZWFuIHVwXG4gKi9cbmZ1bmN0aW9uIGNsZWFuVXBWaWV3KHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3KTogdm9pZCB7XG4gIGlmICghKGxWaWV3W0ZMQUdTXSAmIExWaWV3RmxhZ3MuRGVzdHJveWVkKSkge1xuICAgIC8vIFVzdWFsbHkgdGhlIEF0dGFjaGVkIGZsYWcgaXMgcmVtb3ZlZCB3aGVuIHRoZSB2aWV3IGlzIGRldGFjaGVkIGZyb20gaXRzIHBhcmVudCwgaG93ZXZlclxuICAgIC8vIGlmIGl0J3MgYSByb290IHZpZXcsIHRoZSBmbGFnIHdvbid0IGJlIHVuc2V0IGhlbmNlIHdoeSB3ZSdyZSBhbHNvIHJlbW92aW5nIG9uIGRlc3Ryb3kuXG4gICAgbFZpZXdbRkxBR1NdICY9IH5MVmlld0ZsYWdzLkF0dGFjaGVkO1xuXG4gICAgLy8gTWFyayB0aGUgTFZpZXcgYXMgZGVzdHJveWVkICpiZWZvcmUqIGV4ZWN1dGluZyB0aGUgb25EZXN0cm95IGhvb2tzLiBBbiBvbkRlc3Ryb3kgaG9va1xuICAgIC8vIHJ1bnMgYXJiaXRyYXJ5IHVzZXIgY29kZSwgd2hpY2ggY291bGQgaW5jbHVkZSBpdHMgb3duIGB2aWV3UmVmLmRlc3Ryb3koKWAgKG9yIHNpbWlsYXIpLiBJZlxuICAgIC8vIFdlIGRvbid0IGZsYWcgdGhlIHZpZXcgYXMgZGVzdHJveWVkIGJlZm9yZSB0aGUgaG9va3MsIHRoaXMgY291bGQgbGVhZCB0byBhbiBpbmZpbml0ZSBsb29wLlxuICAgIC8vIFRoaXMgYWxzbyBhbGlnbnMgd2l0aCB0aGUgVmlld0VuZ2luZSBiZWhhdmlvci4gSXQgYWxzbyBtZWFucyB0aGF0IHRoZSBvbkRlc3Ryb3kgaG9vayBpc1xuICAgIC8vIHJlYWxseSBtb3JlIG9mIGFuIFwiYWZ0ZXJEZXN0cm95XCIgaG9vayBpZiB5b3UgdGhpbmsgYWJvdXQgaXQuXG4gICAgbFZpZXdbRkxBR1NdIHw9IExWaWV3RmxhZ3MuRGVzdHJveWVkO1xuXG4gICAgbFZpZXdbUkVBQ1RJVkVfVEVNUExBVEVfQ09OU1VNRVJdICYmIGNvbnN1bWVyRGVzdHJveShsVmlld1tSRUFDVElWRV9URU1QTEFURV9DT05TVU1FUl0pO1xuXG4gICAgZXhlY3V0ZU9uRGVzdHJveXModFZpZXcsIGxWaWV3KTtcbiAgICBwcm9jZXNzQ2xlYW51cHModFZpZXcsIGxWaWV3KTtcbiAgICAvLyBGb3IgY29tcG9uZW50IHZpZXdzIG9ubHksIHRoZSBsb2NhbCByZW5kZXJlciBpcyBkZXN0cm95ZWQgYXQgY2xlYW4gdXAgdGltZS5cbiAgICBpZiAobFZpZXdbVFZJRVddLnR5cGUgPT09IFRWaWV3VHlwZS5Db21wb25lbnQpIHtcbiAgICAgIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUucmVuZGVyZXJEZXN0cm95Kys7XG4gICAgICBsVmlld1tSRU5ERVJFUl0uZGVzdHJveSgpO1xuICAgIH1cblxuICAgIGNvbnN0IGRlY2xhcmF0aW9uQ29udGFpbmVyID0gbFZpZXdbREVDTEFSQVRJT05fTENPTlRBSU5FUl07XG4gICAgLy8gd2UgYXJlIGRlYWxpbmcgd2l0aCBhbiBlbWJlZGRlZCB2aWV3IHRoYXQgaXMgc3RpbGwgaW5zZXJ0ZWQgaW50byBhIGNvbnRhaW5lclxuICAgIGlmIChkZWNsYXJhdGlvbkNvbnRhaW5lciAhPT0gbnVsbCAmJiBpc0xDb250YWluZXIobFZpZXdbUEFSRU5UXSkpIHtcbiAgICAgIC8vIGFuZCB0aGlzIGlzIGEgcHJvamVjdGVkIHZpZXdcbiAgICAgIGlmIChkZWNsYXJhdGlvbkNvbnRhaW5lciAhPT0gbFZpZXdbUEFSRU5UXSkge1xuICAgICAgICBkZXRhY2hNb3ZlZFZpZXcoZGVjbGFyYXRpb25Db250YWluZXIsIGxWaWV3KTtcbiAgICAgIH1cblxuICAgICAgLy8gRm9yIGVtYmVkZGVkIHZpZXdzIHN0aWxsIGF0dGFjaGVkIHRvIGEgY29udGFpbmVyOiByZW1vdmUgcXVlcnkgcmVzdWx0IGZyb20gdGhpcyB2aWV3LlxuICAgICAgY29uc3QgbFF1ZXJpZXMgPSBsVmlld1tRVUVSSUVTXTtcbiAgICAgIGlmIChsUXVlcmllcyAhPT0gbnVsbCkge1xuICAgICAgICBsUXVlcmllcy5kZXRhY2hWaWV3KHRWaWV3KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBVbnJlZ2lzdGVyIHRoZSB2aWV3IG9uY2UgZXZlcnl0aGluZyBlbHNlIGhhcyBiZWVuIGNsZWFuZWQgdXAuXG4gICAgdW5yZWdpc3RlckxWaWV3KGxWaWV3KTtcbiAgfVxufVxuXG4vKiogUmVtb3ZlcyBsaXN0ZW5lcnMgYW5kIHVuc3Vic2NyaWJlcyBmcm9tIG91dHB1dCBzdWJzY3JpcHRpb25zICovXG5mdW5jdGlvbiBwcm9jZXNzQ2xlYW51cHModFZpZXc6IFRWaWV3LCBsVmlldzogTFZpZXcpOiB2b2lkIHtcbiAgY29uc3QgdENsZWFudXAgPSB0Vmlldy5jbGVhbnVwO1xuICBjb25zdCBsQ2xlYW51cCA9IGxWaWV3W0NMRUFOVVBdITtcbiAgaWYgKHRDbGVhbnVwICE9PSBudWxsKSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCB0Q2xlYW51cC5sZW5ndGggLSAxOyBpICs9IDIpIHtcbiAgICAgIGlmICh0eXBlb2YgdENsZWFudXBbaV0gPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIC8vIFRoaXMgaXMgYSBuYXRpdmUgRE9NIGxpc3RlbmVyLiBJdCB3aWxsIG9jY3VweSA0IGVudHJpZXMgaW4gdGhlIFRDbGVhbnVwIGFycmF5IChoZW5jZSBpICs9XG4gICAgICAgIC8vIDIgYXQgdGhlIGVuZCBvZiB0aGlzIGJsb2NrKS5cbiAgICAgICAgY29uc3QgdGFyZ2V0SWR4ID0gdENsZWFudXBbaSArIDNdO1xuICAgICAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0TnVtYmVyKHRhcmdldElkeCwgJ2NsZWFudXAgdGFyZ2V0IG11c3QgYmUgYSBudW1iZXInKTtcbiAgICAgICAgaWYgKHRhcmdldElkeCA+PSAwKSB7XG4gICAgICAgICAgLy8gdW5yZWdpc3RlclxuICAgICAgICAgIGxDbGVhbnVwW3RhcmdldElkeF0oKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAvLyBTdWJzY3JpcHRpb25cbiAgICAgICAgICBsQ2xlYW51cFstdGFyZ2V0SWR4XS51bnN1YnNjcmliZSgpO1xuICAgICAgICB9XG4gICAgICAgIGkgKz0gMjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIFRoaXMgaXMgYSBjbGVhbnVwIGZ1bmN0aW9uIHRoYXQgaXMgZ3JvdXBlZCB3aXRoIHRoZSBpbmRleCBvZiBpdHMgY29udGV4dFxuICAgICAgICBjb25zdCBjb250ZXh0ID0gbENsZWFudXBbdENsZWFudXBbaSArIDFdXTtcbiAgICAgICAgdENsZWFudXBbaV0uY2FsbChjb250ZXh0KTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgaWYgKGxDbGVhbnVwICE9PSBudWxsKSB7XG4gICAgbFZpZXdbQ0xFQU5VUF0gPSBudWxsO1xuICB9XG4gIGNvbnN0IGRlc3Ryb3lIb29rcyA9IGxWaWV3W09OX0RFU1RST1lfSE9PS1NdO1xuICBpZiAoZGVzdHJveUhvb2tzICE9PSBudWxsKSB7XG4gICAgLy8gUmVzZXQgdGhlIE9OX0RFU1RST1lfSE9PS1MgYXJyYXkgYmVmb3JlIGl0ZXJhdGluZyBvdmVyIGl0IHRvIHByZXZlbnQgaG9va3MgdGhhdCB1bnJlZ2lzdGVyXG4gICAgLy8gdGhlbXNlbHZlcyBmcm9tIG11dGF0aW5nIHRoZSBhcnJheSBkdXJpbmcgaXRlcmF0aW9uLlxuICAgIGxWaWV3W09OX0RFU1RST1lfSE9PS1NdID0gbnVsbDtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlc3Ryb3lIb29rcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3QgZGVzdHJveUhvb2tzRm4gPSBkZXN0cm95SG9va3NbaV07XG4gICAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0RnVuY3Rpb24oZGVzdHJveUhvb2tzRm4sICdFeHBlY3RpbmcgZGVzdHJveSBob29rIHRvIGJlIGEgZnVuY3Rpb24uJyk7XG4gICAgICBkZXN0cm95SG9va3NGbigpO1xuICAgIH1cbiAgfVxufVxuXG4vKiogQ2FsbHMgb25EZXN0cm95IGhvb2tzIGZvciB0aGlzIHZpZXcgKi9cbmZ1bmN0aW9uIGV4ZWN1dGVPbkRlc3Ryb3lzKHRWaWV3OiBUVmlldywgbFZpZXc6IExWaWV3KTogdm9pZCB7XG4gIGxldCBkZXN0cm95SG9va3M6IERlc3Ryb3lIb29rRGF0YXxudWxsO1xuXG4gIGlmICh0VmlldyAhPSBudWxsICYmIChkZXN0cm95SG9va3MgPSB0Vmlldy5kZXN0cm95SG9va3MpICE9IG51bGwpIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGRlc3Ryb3lIb29rcy5sZW5ndGg7IGkgKz0gMikge1xuICAgICAgY29uc3QgY29udGV4dCA9IGxWaWV3W2Rlc3Ryb3lIb29rc1tpXSBhcyBudW1iZXJdO1xuXG4gICAgICAvLyBPbmx5IGNhbGwgdGhlIGRlc3Ryb3kgaG9vayBpZiB0aGUgY29udGV4dCBoYXMgYmVlbiByZXF1ZXN0ZWQuXG4gICAgICBpZiAoIShjb250ZXh0IGluc3RhbmNlb2YgTm9kZUluamVjdG9yRmFjdG9yeSkpIHtcbiAgICAgICAgY29uc3QgdG9DYWxsID0gZGVzdHJveUhvb2tzW2kgKyAxXSBhcyBIb29rRm4gfCBIb29rRGF0YTtcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheSh0b0NhbGwpKSB7XG4gICAgICAgICAgZm9yIChsZXQgaiA9IDA7IGogPCB0b0NhbGwubGVuZ3RoOyBqICs9IDIpIHtcbiAgICAgICAgICAgIGNvbnN0IGNhbGxDb250ZXh0ID0gY29udGV4dFt0b0NhbGxbal0gYXMgbnVtYmVyXTtcbiAgICAgICAgICAgIGNvbnN0IGhvb2sgPSB0b0NhbGxbaiArIDFdIGFzIEhvb2tGbjtcbiAgICAgICAgICAgIHByb2ZpbGVyKFByb2ZpbGVyRXZlbnQuTGlmZWN5Y2xlSG9va1N0YXJ0LCBjYWxsQ29udGV4dCwgaG9vayk7XG4gICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICBob29rLmNhbGwoY2FsbENvbnRleHQpO1xuICAgICAgICAgICAgfSBmaW5hbGx5IHtcbiAgICAgICAgICAgICAgcHJvZmlsZXIoUHJvZmlsZXJFdmVudC5MaWZlY3ljbGVIb29rRW5kLCBjYWxsQ29udGV4dCwgaG9vayk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHByb2ZpbGVyKFByb2ZpbGVyRXZlbnQuTGlmZWN5Y2xlSG9va1N0YXJ0LCBjb250ZXh0LCB0b0NhbGwpO1xuICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0b0NhbGwuY2FsbChjb250ZXh0KTtcbiAgICAgICAgICB9IGZpbmFsbHkge1xuICAgICAgICAgICAgcHJvZmlsZXIoUHJvZmlsZXJFdmVudC5MaWZlY3ljbGVIb29rRW5kLCBjb250ZXh0LCB0b0NhbGwpO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFJldHVybnMgYSBuYXRpdmUgZWxlbWVudCBpZiBhIG5vZGUgY2FuIGJlIGluc2VydGVkIGludG8gdGhlIGdpdmVuIHBhcmVudC5cbiAqXG4gKiBUaGVyZSBhcmUgdHdvIHJlYXNvbnMgd2h5IHdlIG1heSBub3QgYmUgYWJsZSB0byBpbnNlcnQgYSBlbGVtZW50IGltbWVkaWF0ZWx5LlxuICogLSBQcm9qZWN0aW9uOiBXaGVuIGNyZWF0aW5nIGEgY2hpbGQgY29udGVudCBlbGVtZW50IG9mIGEgY29tcG9uZW50LCB3ZSBoYXZlIHRvIHNraXAgdGhlXG4gKiAgIGluc2VydGlvbiBiZWNhdXNlIHRoZSBjb250ZW50IG9mIGEgY29tcG9uZW50IHdpbGwgYmUgcHJvamVjdGVkLlxuICogICBgPGNvbXBvbmVudD48Y29udGVudD5kZWxheWVkIGR1ZSB0byBwcm9qZWN0aW9uPC9jb250ZW50PjwvY29tcG9uZW50PmBcbiAqIC0gUGFyZW50IGNvbnRhaW5lciBpcyBkaXNjb25uZWN0ZWQ6IFRoaXMgY2FuIGhhcHBlbiB3aGVuIHdlIGFyZSBpbnNlcnRpbmcgYSB2aWV3IGludG9cbiAqICAgcGFyZW50IGNvbnRhaW5lciwgd2hpY2ggaXRzZWxmIGlzIGRpc2Nvbm5lY3RlZC4gRm9yIGV4YW1wbGUgdGhlIHBhcmVudCBjb250YWluZXIgaXMgcGFydFxuICogICBvZiBhIFZpZXcgd2hpY2ggaGFzIG5vdCBiZSBpbnNlcnRlZCBvciBpcyBtYWRlIGZvciBwcm9qZWN0aW9uIGJ1dCBoYXMgbm90IGJlZW4gaW5zZXJ0ZWRcbiAqICAgaW50byBkZXN0aW5hdGlvbi5cbiAqXG4gKiBAcGFyYW0gdFZpZXc6IEN1cnJlbnQgYFRWaWV3YC5cbiAqIEBwYXJhbSB0Tm9kZTogYFROb2RlYCBmb3Igd2hpY2ggd2Ugd2lzaCB0byByZXRyaWV2ZSByZW5kZXIgcGFyZW50LlxuICogQHBhcmFtIGxWaWV3OiBDdXJyZW50IGBMVmlld2AuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRQYXJlbnRSRWxlbWVudCh0VmlldzogVFZpZXcsIHROb2RlOiBUTm9kZSwgbFZpZXc6IExWaWV3KTogUkVsZW1lbnR8bnVsbCB7XG4gIHJldHVybiBnZXRDbG9zZXN0UkVsZW1lbnQodFZpZXcsIHROb2RlLnBhcmVudCwgbFZpZXcpO1xufVxuXG4vKipcbiAqIEdldCBjbG9zZXN0IGBSRWxlbWVudGAgb3IgYG51bGxgIGlmIGl0IGNhbid0IGJlIGZvdW5kLlxuICpcbiAqIElmIGBUTm9kZWAgaXMgYFROb2RlVHlwZS5FbGVtZW50YCA9PiByZXR1cm4gYFJFbGVtZW50YCBhdCBgTFZpZXdbdE5vZGUuaW5kZXhdYCBsb2NhdGlvbi5cbiAqIElmIGBUTm9kZWAgaXMgYFROb2RlVHlwZS5FbGVtZW50Q29udGFpbmVyfEljdUNvbnRhaW5gID0+IHJldHVybiB0aGUgcGFyZW50IChyZWN1cnNpdmVseSkuXG4gKiBJZiBgVE5vZGVgIGlzIGBudWxsYCB0aGVuIHJldHVybiBob3N0IGBSRWxlbWVudGA6XG4gKiAgIC0gcmV0dXJuIGBudWxsYCBpZiBwcm9qZWN0aW9uXG4gKiAgIC0gcmV0dXJuIGBudWxsYCBpZiBwYXJlbnQgY29udGFpbmVyIGlzIGRpc2Nvbm5lY3RlZCAod2UgaGF2ZSBubyBwYXJlbnQuKVxuICpcbiAqIEBwYXJhbSB0VmlldzogQ3VycmVudCBgVFZpZXdgLlxuICogQHBhcmFtIHROb2RlOiBgVE5vZGVgIGZvciB3aGljaCB3ZSB3aXNoIHRvIHJldHJpZXZlIGBSRWxlbWVudGAgKG9yIGBudWxsYCBpZiBob3N0IGVsZW1lbnQgaXNcbiAqICAgICBuZWVkZWQpLlxuICogQHBhcmFtIGxWaWV3OiBDdXJyZW50IGBMVmlld2AuXG4gKiBAcmV0dXJucyBgbnVsbGAgaWYgdGhlIGBSRWxlbWVudGAgY2FuJ3QgYmUgZGV0ZXJtaW5lZCBhdCB0aGlzIHRpbWUgKG5vIHBhcmVudCAvIHByb2plY3Rpb24pXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRDbG9zZXN0UkVsZW1lbnQodFZpZXc6IFRWaWV3LCB0Tm9kZTogVE5vZGV8bnVsbCwgbFZpZXc6IExWaWV3KTogUkVsZW1lbnR8bnVsbCB7XG4gIGxldCBwYXJlbnRUTm9kZTogVE5vZGV8bnVsbCA9IHROb2RlO1xuICAvLyBTa2lwIG92ZXIgZWxlbWVudCBhbmQgSUNVIGNvbnRhaW5lcnMgYXMgdGhvc2UgYXJlIHJlcHJlc2VudGVkIGJ5IGEgY29tbWVudCBub2RlIGFuZFxuICAvLyBjYW4ndCBiZSB1c2VkIGFzIGEgcmVuZGVyIHBhcmVudC5cbiAgd2hpbGUgKHBhcmVudFROb2RlICE9PSBudWxsICYmXG4gICAgICAgICAocGFyZW50VE5vZGUudHlwZSAmIChUTm9kZVR5cGUuRWxlbWVudENvbnRhaW5lciB8IFROb2RlVHlwZS5JY3UpKSkge1xuICAgIHROb2RlID0gcGFyZW50VE5vZGU7XG4gICAgcGFyZW50VE5vZGUgPSB0Tm9kZS5wYXJlbnQ7XG4gIH1cblxuICAvLyBJZiB0aGUgcGFyZW50IHROb2RlIGlzIG51bGwsIHRoZW4gd2UgYXJlIGluc2VydGluZyBhY3Jvc3Mgdmlld3M6IGVpdGhlciBpbnRvIGFuIGVtYmVkZGVkIHZpZXdcbiAgLy8gb3IgYSBjb21wb25lbnQgdmlldy5cbiAgaWYgKHBhcmVudFROb2RlID09PSBudWxsKSB7XG4gICAgLy8gV2UgYXJlIGluc2VydGluZyBhIHJvb3QgZWxlbWVudCBvZiB0aGUgY29tcG9uZW50IHZpZXcgaW50byB0aGUgY29tcG9uZW50IGhvc3QgZWxlbWVudCBhbmRcbiAgICAvLyBpdCBzaG91bGQgYWx3YXlzIGJlIGVhZ2VyLlxuICAgIHJldHVybiBsVmlld1tIT1NUXTtcbiAgfSBlbHNlIHtcbiAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0VE5vZGVUeXBlKHBhcmVudFROb2RlLCBUTm9kZVR5cGUuQW55Uk5vZGUgfCBUTm9kZVR5cGUuQ29udGFpbmVyKTtcbiAgICBjb25zdCB7Y29tcG9uZW50T2Zmc2V0fSA9IHBhcmVudFROb2RlO1xuICAgIGlmIChjb21wb25lbnRPZmZzZXQgPiAtMSkge1xuICAgICAgbmdEZXZNb2RlICYmIGFzc2VydFROb2RlRm9yTFZpZXcocGFyZW50VE5vZGUsIGxWaWV3KTtcbiAgICAgIGNvbnN0IHtlbmNhcHN1bGF0aW9ufSA9XG4gICAgICAgICAgKHRWaWV3LmRhdGFbcGFyZW50VE5vZGUuZGlyZWN0aXZlU3RhcnQgKyBjb21wb25lbnRPZmZzZXRdIGFzIENvbXBvbmVudERlZjx1bmtub3duPik7XG4gICAgICAvLyBXZSd2ZSBnb3QgYSBwYXJlbnQgd2hpY2ggaXMgYW4gZWxlbWVudCBpbiB0aGUgY3VycmVudCB2aWV3LiBXZSBqdXN0IG5lZWQgdG8gdmVyaWZ5IGlmIHRoZVxuICAgICAgLy8gcGFyZW50IGVsZW1lbnQgaXMgbm90IGEgY29tcG9uZW50LiBDb21wb25lbnQncyBjb250ZW50IG5vZGVzIGFyZSBub3QgaW5zZXJ0ZWQgaW1tZWRpYXRlbHlcbiAgICAgIC8vIGJlY2F1c2UgdGhleSB3aWxsIGJlIHByb2plY3RlZCwgYW5kIHNvIGRvaW5nIGluc2VydCBhdCB0aGlzIHBvaW50IHdvdWxkIGJlIHdhc3RlZnVsLlxuICAgICAgLy8gU2luY2UgdGhlIHByb2plY3Rpb24gd291bGQgdGhlbiBtb3ZlIGl0IHRvIGl0cyBmaW5hbCBkZXN0aW5hdGlvbi4gTm90ZSB0aGF0IHdlIGNhbid0XG4gICAgICAvLyBtYWtlIHRoaXMgYXNzdW1wdGlvbiB3aGVuIHVzaW5nIHRoZSBTaGFkb3cgRE9NLCBiZWNhdXNlIHRoZSBuYXRpdmUgcHJvamVjdGlvbiBwbGFjZWhvbGRlcnNcbiAgICAgIC8vICg8Y29udGVudD4gb3IgPHNsb3Q+KSBoYXZlIHRvIGJlIGluIHBsYWNlIGFzIGVsZW1lbnRzIGFyZSBiZWluZyBpbnNlcnRlZC5cbiAgICAgIGlmIChlbmNhcHN1bGF0aW9uID09PSBWaWV3RW5jYXBzdWxhdGlvbi5Ob25lIHx8XG4gICAgICAgICAgZW5jYXBzdWxhdGlvbiA9PT0gVmlld0VuY2Fwc3VsYXRpb24uRW11bGF0ZWQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG4gICAgfVxuXG4gICAgcmV0dXJuIGdldE5hdGl2ZUJ5VE5vZGUocGFyZW50VE5vZGUsIGxWaWV3KSBhcyBSRWxlbWVudDtcbiAgfVxufVxuXG4vKipcbiAqIEluc2VydHMgYSBuYXRpdmUgbm9kZSBiZWZvcmUgYW5vdGhlciBuYXRpdmUgbm9kZSBmb3IgYSBnaXZlbiBwYXJlbnQuXG4gKiBUaGlzIGlzIGEgdXRpbGl0eSBmdW5jdGlvbiB0aGF0IGNhbiBiZSB1c2VkIHdoZW4gbmF0aXZlIG5vZGVzIHdlcmUgZGV0ZXJtaW5lZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG5hdGl2ZUluc2VydEJlZm9yZShcbiAgICByZW5kZXJlcjogUmVuZGVyZXIsIHBhcmVudDogUkVsZW1lbnQsIGNoaWxkOiBSTm9kZSwgYmVmb3JlTm9kZTogUk5vZGV8bnVsbCxcbiAgICBpc01vdmU6IGJvb2xlYW4pOiB2b2lkIHtcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlckluc2VydEJlZm9yZSsrO1xuICByZW5kZXJlci5pbnNlcnRCZWZvcmUocGFyZW50LCBjaGlsZCwgYmVmb3JlTm9kZSwgaXNNb3ZlKTtcbn1cblxuZnVuY3Rpb24gbmF0aXZlQXBwZW5kQ2hpbGQocmVuZGVyZXI6IFJlbmRlcmVyLCBwYXJlbnQ6IFJFbGVtZW50LCBjaGlsZDogUk5vZGUpOiB2b2lkIHtcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlckFwcGVuZENoaWxkKys7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnREZWZpbmVkKHBhcmVudCwgJ3BhcmVudCBub2RlIG11c3QgYmUgZGVmaW5lZCcpO1xuICByZW5kZXJlci5hcHBlbmRDaGlsZChwYXJlbnQsIGNoaWxkKTtcbn1cblxuZnVuY3Rpb24gbmF0aXZlQXBwZW5kT3JJbnNlcnRCZWZvcmUoXG4gICAgcmVuZGVyZXI6IFJlbmRlcmVyLCBwYXJlbnQ6IFJFbGVtZW50LCBjaGlsZDogUk5vZGUsIGJlZm9yZU5vZGU6IFJOb2RlfG51bGwsIGlzTW92ZTogYm9vbGVhbikge1xuICBpZiAoYmVmb3JlTm9kZSAhPT0gbnVsbCkge1xuICAgIG5hdGl2ZUluc2VydEJlZm9yZShyZW5kZXJlciwgcGFyZW50LCBjaGlsZCwgYmVmb3JlTm9kZSwgaXNNb3ZlKTtcbiAgfSBlbHNlIHtcbiAgICBuYXRpdmVBcHBlbmRDaGlsZChyZW5kZXJlciwgcGFyZW50LCBjaGlsZCk7XG4gIH1cbn1cblxuLyoqIFJlbW92ZXMgYSBub2RlIGZyb20gdGhlIERPTSBnaXZlbiBpdHMgbmF0aXZlIHBhcmVudC4gKi9cbmZ1bmN0aW9uIG5hdGl2ZVJlbW92ZUNoaWxkKFxuICAgIHJlbmRlcmVyOiBSZW5kZXJlciwgcGFyZW50OiBSRWxlbWVudCwgY2hpbGQ6IFJOb2RlLCBpc0hvc3RFbGVtZW50PzogYm9vbGVhbik6IHZvaWQge1xuICByZW5kZXJlci5yZW1vdmVDaGlsZChwYXJlbnQsIGNoaWxkLCBpc0hvc3RFbGVtZW50KTtcbn1cblxuLyoqIENoZWNrcyBpZiBhbiBlbGVtZW50IGlzIGEgYDx0ZW1wbGF0ZT5gIG5vZGUuICovXG5mdW5jdGlvbiBpc1RlbXBsYXRlTm9kZShub2RlOiBSRWxlbWVudCk6IG5vZGUgaXMgUlRlbXBsYXRlIHtcbiAgcmV0dXJuIG5vZGUudGFnTmFtZSA9PT0gJ1RFTVBMQVRFJyAmJiAobm9kZSBhcyBSVGVtcGxhdGUpLmNvbnRlbnQgIT09IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmF0aXZlIHBhcmVudCBvZiBhIGdpdmVuIG5hdGl2ZSBub2RlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbmF0aXZlUGFyZW50Tm9kZShyZW5kZXJlcjogUmVuZGVyZXIsIG5vZGU6IFJOb2RlKTogUkVsZW1lbnR8bnVsbCB7XG4gIHJldHVybiByZW5kZXJlci5wYXJlbnROb2RlKG5vZGUpO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuYXRpdmUgc2libGluZyBvZiBhIGdpdmVuIG5hdGl2ZSBub2RlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbmF0aXZlTmV4dFNpYmxpbmcocmVuZGVyZXI6IFJlbmRlcmVyLCBub2RlOiBSTm9kZSk6IFJOb2RlfG51bGwge1xuICByZXR1cm4gcmVuZGVyZXIubmV4dFNpYmxpbmcobm9kZSk7XG59XG5cbi8qKlxuICogRmluZCBhIG5vZGUgaW4gZnJvbnQgb2Ygd2hpY2ggYGN1cnJlbnRUTm9kZWAgc2hvdWxkIGJlIGluc2VydGVkLlxuICpcbiAqIFRoaXMgbWV0aG9kIGRldGVybWluZXMgdGhlIGBSTm9kZWAgaW4gZnJvbnQgb2Ygd2hpY2ggd2Ugc2hvdWxkIGluc2VydCB0aGUgYGN1cnJlbnRSTm9kZWAuIFRoaXNcbiAqIHRha2VzIGBUTm9kZS5pbnNlcnRCZWZvcmVJbmRleGAgaW50byBhY2NvdW50IGlmIGkxOG4gY29kZSBoYXMgYmVlbiBpbnZva2VkLlxuICpcbiAqIEBwYXJhbSBwYXJlbnRUTm9kZSBwYXJlbnQgYFROb2RlYFxuICogQHBhcmFtIGN1cnJlbnRUTm9kZSBjdXJyZW50IGBUTm9kZWAgKFRoZSBub2RlIHdoaWNoIHdlIHdvdWxkIGxpa2UgdG8gaW5zZXJ0IGludG8gdGhlIERPTSlcbiAqIEBwYXJhbSBsVmlldyBjdXJyZW50IGBMVmlld2BcbiAqL1xuZnVuY3Rpb24gZ2V0SW5zZXJ0SW5Gcm9udE9mUk5vZGUocGFyZW50VE5vZGU6IFROb2RlLCBjdXJyZW50VE5vZGU6IFROb2RlLCBsVmlldzogTFZpZXcpOiBSTm9kZXxcbiAgICBudWxsIHtcbiAgcmV0dXJuIF9nZXRJbnNlcnRJbkZyb250T2ZSTm9kZVdpdGhJMThuKHBhcmVudFROb2RlLCBjdXJyZW50VE5vZGUsIGxWaWV3KTtcbn1cblxuXG4vKipcbiAqIEZpbmQgYSBub2RlIGluIGZyb250IG9mIHdoaWNoIGBjdXJyZW50VE5vZGVgIHNob3VsZCBiZSBpbnNlcnRlZC4gKERvZXMgbm90IHRha2UgaTE4biBpbnRvXG4gKiBhY2NvdW50KVxuICpcbiAqIFRoaXMgbWV0aG9kIGRldGVybWluZXMgdGhlIGBSTm9kZWAgaW4gZnJvbnQgb2Ygd2hpY2ggd2Ugc2hvdWxkIGluc2VydCB0aGUgYGN1cnJlbnRSTm9kZWAuIFRoaXNcbiAqIGRvZXMgbm90IHRha2UgYFROb2RlLmluc2VydEJlZm9yZUluZGV4YCBpbnRvIGFjY291bnQuXG4gKlxuICogQHBhcmFtIHBhcmVudFROb2RlIHBhcmVudCBgVE5vZGVgXG4gKiBAcGFyYW0gY3VycmVudFROb2RlIGN1cnJlbnQgYFROb2RlYCAoVGhlIG5vZGUgd2hpY2ggd2Ugd291bGQgbGlrZSB0byBpbnNlcnQgaW50byB0aGUgRE9NKVxuICogQHBhcmFtIGxWaWV3IGN1cnJlbnQgYExWaWV3YFxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0SW5zZXJ0SW5Gcm9udE9mUk5vZGVXaXRoTm9JMThuKFxuICAgIHBhcmVudFROb2RlOiBUTm9kZSwgY3VycmVudFROb2RlOiBUTm9kZSwgbFZpZXc6IExWaWV3KTogUk5vZGV8bnVsbCB7XG4gIGlmIChwYXJlbnRUTm9kZS50eXBlICYgKFROb2RlVHlwZS5FbGVtZW50Q29udGFpbmVyIHwgVE5vZGVUeXBlLkljdSkpIHtcbiAgICByZXR1cm4gZ2V0TmF0aXZlQnlUTm9kZShwYXJlbnRUTm9kZSwgbFZpZXcpO1xuICB9XG4gIHJldHVybiBudWxsO1xufVxuXG4vKipcbiAqIFRyZWUgc2hha2FibGUgYm91bmRhcnkgZm9yIGBnZXRJbnNlcnRJbkZyb250T2ZSTm9kZVdpdGhJMThuYCBmdW5jdGlvbi5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIHdpbGwgb25seSBiZSBzZXQgaWYgaTE4biBjb2RlIHJ1bnMuXG4gKi9cbmxldCBfZ2V0SW5zZXJ0SW5Gcm9udE9mUk5vZGVXaXRoSTE4bjogKHBhcmVudFROb2RlOiBUTm9kZSwgY3VycmVudFROb2RlOiBUTm9kZSwgbFZpZXc6IExWaWV3KSA9PlxuICAgIFJOb2RlIHwgbnVsbCA9IGdldEluc2VydEluRnJvbnRPZlJOb2RlV2l0aE5vSTE4bjtcblxuLyoqXG4gKiBUcmVlIHNoYWthYmxlIGJvdW5kYXJ5IGZvciBgcHJvY2Vzc0kxOG5JbnNlcnRCZWZvcmVgIGZ1bmN0aW9uLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gd2lsbCBvbmx5IGJlIHNldCBpZiBpMThuIGNvZGUgcnVucy5cbiAqL1xubGV0IF9wcm9jZXNzSTE4bkluc2VydEJlZm9yZTogKFxuICAgIHJlbmRlcmVyOiBSZW5kZXJlciwgY2hpbGRUTm9kZTogVE5vZGUsIGxWaWV3OiBMVmlldywgY2hpbGRSTm9kZTogUk5vZGV8Uk5vZGVbXSxcbiAgICBwYXJlbnRSRWxlbWVudDogUkVsZW1lbnR8bnVsbCkgPT4gdm9pZDtcblxuZXhwb3J0IGZ1bmN0aW9uIHNldEkxOG5IYW5kbGluZyhcbiAgICBnZXRJbnNlcnRJbkZyb250T2ZSTm9kZVdpdGhJMThuOiAocGFyZW50VE5vZGU6IFROb2RlLCBjdXJyZW50VE5vZGU6IFROb2RlLCBsVmlldzogTFZpZXcpID0+XG4gICAgICAgIFJOb2RlIHwgbnVsbCxcbiAgICBwcm9jZXNzSTE4bkluc2VydEJlZm9yZTogKFxuICAgICAgICByZW5kZXJlcjogUmVuZGVyZXIsIGNoaWxkVE5vZGU6IFROb2RlLCBsVmlldzogTFZpZXcsIGNoaWxkUk5vZGU6IFJOb2RlfFJOb2RlW10sXG4gICAgICAgIHBhcmVudFJFbGVtZW50OiBSRWxlbWVudHxudWxsKSA9PiB2b2lkKSB7XG4gIF9nZXRJbnNlcnRJbkZyb250T2ZSTm9kZVdpdGhJMThuID0gZ2V0SW5zZXJ0SW5Gcm9udE9mUk5vZGVXaXRoSTE4bjtcbiAgX3Byb2Nlc3NJMThuSW5zZXJ0QmVmb3JlID0gcHJvY2Vzc0kxOG5JbnNlcnRCZWZvcmU7XG59XG5cbi8qKlxuICogQXBwZW5kcyB0aGUgYGNoaWxkYCBuYXRpdmUgbm9kZSAob3IgYSBjb2xsZWN0aW9uIG9mIG5vZGVzKSB0byB0aGUgYHBhcmVudGAuXG4gKlxuICogQHBhcmFtIHRWaWV3IFRoZSBgVFZpZXcnIHRvIGJlIGFwcGVuZGVkXG4gKiBAcGFyYW0gbFZpZXcgVGhlIGN1cnJlbnQgTFZpZXdcbiAqIEBwYXJhbSBjaGlsZFJOb2RlIFRoZSBuYXRpdmUgY2hpbGQgKG9yIGNoaWxkcmVuKSB0aGF0IHNob3VsZCBiZSBhcHBlbmRlZFxuICogQHBhcmFtIGNoaWxkVE5vZGUgVGhlIFROb2RlIG9mIHRoZSBjaGlsZCBlbGVtZW50XG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhcHBlbmRDaGlsZChcbiAgICB0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgY2hpbGRSTm9kZTogUk5vZGV8Uk5vZGVbXSwgY2hpbGRUTm9kZTogVE5vZGUpOiB2b2lkIHtcbiAgY29uc3QgcGFyZW50Uk5vZGUgPSBnZXRQYXJlbnRSRWxlbWVudCh0VmlldywgY2hpbGRUTm9kZSwgbFZpZXcpO1xuICBjb25zdCByZW5kZXJlciA9IGxWaWV3W1JFTkRFUkVSXTtcbiAgY29uc3QgcGFyZW50VE5vZGU6IFROb2RlID0gY2hpbGRUTm9kZS5wYXJlbnQgfHwgbFZpZXdbVF9IT1NUXSE7XG4gIGNvbnN0IGFuY2hvck5vZGUgPSBnZXRJbnNlcnRJbkZyb250T2ZSTm9kZShwYXJlbnRUTm9kZSwgY2hpbGRUTm9kZSwgbFZpZXcpO1xuICBpZiAocGFyZW50Uk5vZGUgIT0gbnVsbCkge1xuICAgIGlmIChBcnJheS5pc0FycmF5KGNoaWxkUk5vZGUpKSB7XG4gICAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoaWxkUk5vZGUubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgbmF0aXZlQXBwZW5kT3JJbnNlcnRCZWZvcmUocmVuZGVyZXIsIHBhcmVudFJOb2RlLCBjaGlsZFJOb2RlW2ldLCBhbmNob3JOb2RlLCBmYWxzZSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIG5hdGl2ZUFwcGVuZE9ySW5zZXJ0QmVmb3JlKHJlbmRlcmVyLCBwYXJlbnRSTm9kZSwgY2hpbGRSTm9kZSwgYW5jaG9yTm9kZSwgZmFsc2UpO1xuICAgIH1cbiAgfVxuXG4gIF9wcm9jZXNzSTE4bkluc2VydEJlZm9yZSAhPT0gdW5kZWZpbmVkICYmXG4gICAgICBfcHJvY2Vzc0kxOG5JbnNlcnRCZWZvcmUocmVuZGVyZXIsIGNoaWxkVE5vZGUsIGxWaWV3LCBjaGlsZFJOb2RlLCBwYXJlbnRSTm9kZSk7XG59XG5cbi8qKlxuICogUmV0dXJucyB0aGUgZmlyc3QgbmF0aXZlIG5vZGUgZm9yIGEgZ2l2ZW4gTFZpZXcsIHN0YXJ0aW5nIGZyb20gdGhlIHByb3ZpZGVkIFROb2RlLlxuICpcbiAqIE5hdGl2ZSBub2RlcyBhcmUgcmV0dXJuZWQgaW4gdGhlIG9yZGVyIGluIHdoaWNoIHRob3NlIGFwcGVhciBpbiB0aGUgbmF0aXZlIHRyZWUgKERPTSkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaXJzdE5hdGl2ZU5vZGUobFZpZXc6IExWaWV3LCB0Tm9kZTogVE5vZGV8bnVsbCk6IFJOb2RlfG51bGwge1xuICBpZiAodE5vZGUgIT09IG51bGwpIHtcbiAgICBuZ0Rldk1vZGUgJiZcbiAgICAgICAgYXNzZXJ0VE5vZGVUeXBlKFxuICAgICAgICAgICAgdE5vZGUsXG4gICAgICAgICAgICBUTm9kZVR5cGUuQW55Uk5vZGUgfCBUTm9kZVR5cGUuQW55Q29udGFpbmVyIHwgVE5vZGVUeXBlLkljdSB8IFROb2RlVHlwZS5Qcm9qZWN0aW9uKTtcblxuICAgIGNvbnN0IHROb2RlVHlwZSA9IHROb2RlLnR5cGU7XG4gICAgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5BbnlSTm9kZSkge1xuICAgICAgcmV0dXJuIGdldE5hdGl2ZUJ5VE5vZGUodE5vZGUsIGxWaWV3KTtcbiAgICB9IGVsc2UgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5Db250YWluZXIpIHtcbiAgICAgIHJldHVybiBnZXRCZWZvcmVOb2RlRm9yVmlldygtMSwgbFZpZXdbdE5vZGUuaW5kZXhdKTtcbiAgICB9IGVsc2UgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5FbGVtZW50Q29udGFpbmVyKSB7XG4gICAgICBjb25zdCBlbEljdUNvbnRhaW5lckNoaWxkID0gdE5vZGUuY2hpbGQ7XG4gICAgICBpZiAoZWxJY3VDb250YWluZXJDaGlsZCAhPT0gbnVsbCkge1xuICAgICAgICByZXR1cm4gZ2V0Rmlyc3ROYXRpdmVOb2RlKGxWaWV3LCBlbEljdUNvbnRhaW5lckNoaWxkKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IHJOb2RlT3JMQ29udGFpbmVyID0gbFZpZXdbdE5vZGUuaW5kZXhdO1xuICAgICAgICBpZiAoaXNMQ29udGFpbmVyKHJOb2RlT3JMQ29udGFpbmVyKSkge1xuICAgICAgICAgIHJldHVybiBnZXRCZWZvcmVOb2RlRm9yVmlldygtMSwgck5vZGVPckxDb250YWluZXIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiB1bndyYXBSTm9kZShyTm9kZU9yTENvbnRhaW5lcik7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9IGVsc2UgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5JY3UpIHtcbiAgICAgIGxldCBuZXh0Uk5vZGUgPSBpY3VDb250YWluZXJJdGVyYXRlKHROb2RlIGFzIFRJY3VDb250YWluZXJOb2RlLCBsVmlldyk7XG4gICAgICBsZXQgck5vZGU6IFJOb2RlfG51bGwgPSBuZXh0Uk5vZGUoKTtcbiAgICAgIC8vIElmIHRoZSBJQ1UgY29udGFpbmVyIGhhcyBubyBub2RlcywgdGhhbiB3ZSB1c2UgdGhlIElDVSBhbmNob3IgYXMgdGhlIG5vZGUuXG4gICAgICByZXR1cm4gck5vZGUgfHwgdW53cmFwUk5vZGUobFZpZXdbdE5vZGUuaW5kZXhdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgcHJvamVjdGlvbk5vZGVzID0gZ2V0UHJvamVjdGlvbk5vZGVzKGxWaWV3LCB0Tm9kZSk7XG4gICAgICBpZiAocHJvamVjdGlvbk5vZGVzICE9PSBudWxsKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHByb2plY3Rpb25Ob2RlcykpIHtcbiAgICAgICAgICByZXR1cm4gcHJvamVjdGlvbk5vZGVzWzBdO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IHBhcmVudFZpZXcgPSBnZXRMVmlld1BhcmVudChsVmlld1tERUNMQVJBVElPTl9DT01QT05FTlRfVklFV10pO1xuICAgICAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0UGFyZW50VmlldyhwYXJlbnRWaWV3KTtcbiAgICAgICAgcmV0dXJuIGdldEZpcnN0TmF0aXZlTm9kZShwYXJlbnRWaWV3ISwgcHJvamVjdGlvbk5vZGVzKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBnZXRGaXJzdE5hdGl2ZU5vZGUobFZpZXcsIHROb2RlLm5leHQpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJldHVybiBudWxsO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0UHJvamVjdGlvbk5vZGVzKGxWaWV3OiBMVmlldywgdE5vZGU6IFROb2RlfG51bGwpOiBUTm9kZXxSTm9kZVtdfG51bGwge1xuICBpZiAodE5vZGUgIT09IG51bGwpIHtcbiAgICBjb25zdCBjb21wb25lbnRWaWV3ID0gbFZpZXdbREVDTEFSQVRJT05fQ09NUE9ORU5UX1ZJRVddO1xuICAgIGNvbnN0IGNvbXBvbmVudEhvc3QgPSBjb21wb25lbnRWaWV3W1RfSE9TVF0gYXMgVEVsZW1lbnROb2RlO1xuICAgIGNvbnN0IHNsb3RJZHggPSB0Tm9kZS5wcm9qZWN0aW9uIGFzIG51bWJlcjtcbiAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0UHJvamVjdGlvblNsb3RzKGxWaWV3KTtcbiAgICByZXR1cm4gY29tcG9uZW50SG9zdC5wcm9qZWN0aW9uIVtzbG90SWR4XTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEJlZm9yZU5vZGVGb3JWaWV3KHZpZXdJbmRleEluQ29udGFpbmVyOiBudW1iZXIsIGxDb250YWluZXI6IExDb250YWluZXIpOiBSTm9kZXxcbiAgICBudWxsIHtcbiAgY29uc3QgbmV4dFZpZXdJbmRleCA9IENPTlRBSU5FUl9IRUFERVJfT0ZGU0VUICsgdmlld0luZGV4SW5Db250YWluZXIgKyAxO1xuICBpZiAobmV4dFZpZXdJbmRleCA8IGxDb250YWluZXIubGVuZ3RoKSB7XG4gICAgY29uc3QgbFZpZXcgPSBsQ29udGFpbmVyW25leHRWaWV3SW5kZXhdIGFzIExWaWV3O1xuICAgIGNvbnN0IGZpcnN0VE5vZGVPZlZpZXcgPSBsVmlld1tUVklFV10uZmlyc3RDaGlsZDtcbiAgICBpZiAoZmlyc3RUTm9kZU9mVmlldyAhPT0gbnVsbCkge1xuICAgICAgcmV0dXJuIGdldEZpcnN0TmF0aXZlTm9kZShsVmlldywgZmlyc3RUTm9kZU9mVmlldyk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGxDb250YWluZXJbTkFUSVZFXTtcbn1cblxuLyoqXG4gKiBSZW1vdmVzIGEgbmF0aXZlIG5vZGUgaXRzZWxmIHVzaW5nIGEgZ2l2ZW4gcmVuZGVyZXIuIFRvIHJlbW92ZSB0aGUgbm9kZSB3ZSBhcmUgbG9va2luZyB1cCBpdHNcbiAqIHBhcmVudCBmcm9tIHRoZSBuYXRpdmUgdHJlZSBhcyBub3QgYWxsIHBsYXRmb3JtcyAvIGJyb3dzZXJzIHN1cHBvcnQgdGhlIGVxdWl2YWxlbnQgb2ZcbiAqIG5vZGUucmVtb3ZlKCkuXG4gKlxuICogQHBhcmFtIHJlbmRlcmVyIEEgcmVuZGVyZXIgdG8gYmUgdXNlZFxuICogQHBhcmFtIHJOb2RlIFRoZSBuYXRpdmUgbm9kZSB0aGF0IHNob3VsZCBiZSByZW1vdmVkXG4gKiBAcGFyYW0gaXNIb3N0RWxlbWVudCBBIGZsYWcgaW5kaWNhdGluZyBpZiBhIG5vZGUgdG8gYmUgcmVtb3ZlZCBpcyBhIGhvc3Qgb2YgYSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuYXRpdmVSZW1vdmVOb2RlKHJlbmRlcmVyOiBSZW5kZXJlciwgck5vZGU6IFJOb2RlLCBpc0hvc3RFbGVtZW50PzogYm9vbGVhbik6IHZvaWQge1xuICBuZ0Rldk1vZGUgJiYgbmdEZXZNb2RlLnJlbmRlcmVyUmVtb3ZlTm9kZSsrO1xuICBjb25zdCBuYXRpdmVQYXJlbnQgPSBuYXRpdmVQYXJlbnROb2RlKHJlbmRlcmVyLCByTm9kZSk7XG4gIGlmIChuYXRpdmVQYXJlbnQpIHtcbiAgICBuYXRpdmVSZW1vdmVDaGlsZChyZW5kZXJlciwgbmF0aXZlUGFyZW50LCByTm9kZSwgaXNIb3N0RWxlbWVudCk7XG4gIH1cbn1cblxuLyoqXG4gKiBDbGVhcnMgdGhlIGNvbnRlbnRzIG9mIGEgZ2l2ZW4gUkVsZW1lbnQuXG4gKlxuICogQHBhcmFtIHJFbGVtZW50IHRoZSBuYXRpdmUgUkVsZW1lbnQgdG8gYmUgY2xlYXJlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJFbGVtZW50Q29udGVudHMockVsZW1lbnQ6IFJFbGVtZW50KTogdm9pZCB7XG4gIHJFbGVtZW50LnRleHRDb250ZW50ID0gJyc7XG59XG5cblxuLyoqXG4gKiBQZXJmb3JtcyB0aGUgb3BlcmF0aW9uIG9mIGBhY3Rpb25gIG9uIHRoZSBub2RlLiBUeXBpY2FsbHkgdGhpcyBpbnZvbHZlcyBpbnNlcnRpbmcgb3IgcmVtb3ZpbmdcbiAqIG5vZGVzIG9uIHRoZSBMVmlldyBvciBwcm9qZWN0aW9uIGJvdW5kYXJ5LlxuICovXG5mdW5jdGlvbiBhcHBseU5vZGVzKFxuICAgIHJlbmRlcmVyOiBSZW5kZXJlciwgYWN0aW9uOiBXYWxrVE5vZGVUcmVlQWN0aW9uLCB0Tm9kZTogVE5vZGV8bnVsbCwgbFZpZXc6IExWaWV3LFxuICAgIHBhcmVudFJFbGVtZW50OiBSRWxlbWVudHxudWxsLCBiZWZvcmVOb2RlOiBSTm9kZXxudWxsLCBpc1Byb2plY3Rpb246IGJvb2xlYW4pIHtcbiAgd2hpbGUgKHROb2RlICE9IG51bGwpIHtcbiAgICBuZ0Rldk1vZGUgJiYgYXNzZXJ0VE5vZGVGb3JMVmlldyh0Tm9kZSwgbFZpZXcpO1xuICAgIG5nRGV2TW9kZSAmJlxuICAgICAgICBhc3NlcnRUTm9kZVR5cGUoXG4gICAgICAgICAgICB0Tm9kZSxcbiAgICAgICAgICAgIFROb2RlVHlwZS5BbnlSTm9kZSB8IFROb2RlVHlwZS5BbnlDb250YWluZXIgfCBUTm9kZVR5cGUuUHJvamVjdGlvbiB8IFROb2RlVHlwZS5JY3UpO1xuICAgIGNvbnN0IHJhd1Nsb3RWYWx1ZSA9IGxWaWV3W3ROb2RlLmluZGV4XTtcbiAgICBjb25zdCB0Tm9kZVR5cGUgPSB0Tm9kZS50eXBlO1xuICAgIGlmIChpc1Byb2plY3Rpb24pIHtcbiAgICAgIGlmIChhY3Rpb24gPT09IFdhbGtUTm9kZVRyZWVBY3Rpb24uQ3JlYXRlKSB7XG4gICAgICAgIHJhd1Nsb3RWYWx1ZSAmJiBhdHRhY2hQYXRjaERhdGEodW53cmFwUk5vZGUocmF3U2xvdFZhbHVlKSwgbFZpZXcpO1xuICAgICAgICB0Tm9kZS5mbGFncyB8PSBUTm9kZUZsYWdzLmlzUHJvamVjdGVkO1xuICAgICAgfVxuICAgIH1cbiAgICBpZiAoKHROb2RlLmZsYWdzICYgVE5vZGVGbGFncy5pc0RldGFjaGVkKSAhPT0gVE5vZGVGbGFncy5pc0RldGFjaGVkKSB7XG4gICAgICBpZiAodE5vZGVUeXBlICYgVE5vZGVUeXBlLkVsZW1lbnRDb250YWluZXIpIHtcbiAgICAgICAgYXBwbHlOb2RlcyhyZW5kZXJlciwgYWN0aW9uLCB0Tm9kZS5jaGlsZCwgbFZpZXcsIHBhcmVudFJFbGVtZW50LCBiZWZvcmVOb2RlLCBmYWxzZSk7XG4gICAgICAgIGFwcGx5VG9FbGVtZW50T3JDb250YWluZXIoYWN0aW9uLCByZW5kZXJlciwgcGFyZW50UkVsZW1lbnQsIHJhd1Nsb3RWYWx1ZSwgYmVmb3JlTm9kZSk7XG4gICAgICB9IGVsc2UgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5JY3UpIHtcbiAgICAgICAgY29uc3QgbmV4dFJOb2RlID0gaWN1Q29udGFpbmVySXRlcmF0ZSh0Tm9kZSBhcyBUSWN1Q29udGFpbmVyTm9kZSwgbFZpZXcpO1xuICAgICAgICBsZXQgck5vZGU6IFJOb2RlfG51bGw7XG4gICAgICAgIHdoaWxlIChyTm9kZSA9IG5leHRSTm9kZSgpKSB7XG4gICAgICAgICAgYXBwbHlUb0VsZW1lbnRPckNvbnRhaW5lcihhY3Rpb24sIHJlbmRlcmVyLCBwYXJlbnRSRWxlbWVudCwgck5vZGUsIGJlZm9yZU5vZGUpO1xuICAgICAgICB9XG4gICAgICAgIGFwcGx5VG9FbGVtZW50T3JDb250YWluZXIoYWN0aW9uLCByZW5kZXJlciwgcGFyZW50UkVsZW1lbnQsIHJhd1Nsb3RWYWx1ZSwgYmVmb3JlTm9kZSk7XG4gICAgICB9IGVsc2UgaWYgKHROb2RlVHlwZSAmIFROb2RlVHlwZS5Qcm9qZWN0aW9uKSB7XG4gICAgICAgIGFwcGx5UHJvamVjdGlvblJlY3Vyc2l2ZShcbiAgICAgICAgICAgIHJlbmRlcmVyLCBhY3Rpb24sIGxWaWV3LCB0Tm9kZSBhcyBUUHJvamVjdGlvbk5vZGUsIHBhcmVudFJFbGVtZW50LCBiZWZvcmVOb2RlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIG5nRGV2TW9kZSAmJiBhc3NlcnRUTm9kZVR5cGUodE5vZGUsIFROb2RlVHlwZS5BbnlSTm9kZSB8IFROb2RlVHlwZS5Db250YWluZXIpO1xuICAgICAgICBhcHBseVRvRWxlbWVudE9yQ29udGFpbmVyKGFjdGlvbiwgcmVuZGVyZXIsIHBhcmVudFJFbGVtZW50LCByYXdTbG90VmFsdWUsIGJlZm9yZU5vZGUpO1xuICAgICAgfVxuICAgIH1cbiAgICB0Tm9kZSA9IGlzUHJvamVjdGlvbiA/IHROb2RlLnByb2plY3Rpb25OZXh0IDogdE5vZGUubmV4dDtcbiAgfVxufVxuXG5cbi8qKlxuICogYGFwcGx5Vmlld2AgcGVyZm9ybXMgb3BlcmF0aW9uIG9uIHRoZSB2aWV3IGFzIHNwZWNpZmllZCBpbiBgYWN0aW9uYCAoaW5zZXJ0LCBkZXRhY2gsIGRlc3Ryb3kpXG4gKlxuICogSW5zZXJ0aW5nIGEgdmlldyB3aXRob3V0IHByb2plY3Rpb24gb3IgY29udGFpbmVycyBhdCB0b3AgbGV2ZWwgaXMgc2ltcGxlLiBKdXN0IGl0ZXJhdGUgb3ZlciB0aGVcbiAqIHJvb3Qgbm9kZXMgb2YgdGhlIFZpZXcsIGFuZCBmb3IgZWFjaCBub2RlIHBlcmZvcm0gdGhlIGBhY3Rpb25gLlxuICpcbiAqIFRoaW5ncyBnZXQgbW9yZSBjb21wbGljYXRlZCB3aXRoIGNvbnRhaW5lcnMgYW5kIHByb2plY3Rpb25zLiBUaGF0IGlzIGJlY2F1c2UgY29taW5nIGFjcm9zczpcbiAqIC0gQ29udGFpbmVyOiBpbXBsaWVzIHRoYXQgd2UgaGF2ZSB0byBpbnNlcnQvcmVtb3ZlL2Rlc3Ryb3kgdGhlIHZpZXdzIG9mIHRoYXQgY29udGFpbmVyIGFzIHdlbGxcbiAqICAgICAgICAgICAgICB3aGljaCBpbiB0dXJuIGNhbiBoYXZlIHRoZWlyIG93biBDb250YWluZXJzIGF0IHRoZSBWaWV3IHJvb3RzLlxuICogLSBQcm9qZWN0aW9uOiBpbXBsaWVzIHRoYXQgd2UgaGF2ZSB0byBpbnNlcnQvcmVtb3ZlL2Rlc3Ryb3kgdGhlIG5vZGVzIG9mIHRoZSBwcm9qZWN0aW9uLiBUaGVcbiAqICAgICAgICAgICAgICAgY29tcGxpY2F0aW9uIGlzIHRoYXQgdGhlIG5vZGVzIHdlIGFyZSBwcm9qZWN0aW5nIGNhbiB0aGVtc2VsdmVzIGhhdmUgQ29udGFpbmVyc1xuICogICAgICAgICAgICAgICBvciBvdGhlciBQcm9qZWN0aW9ucy5cbiAqXG4gKiBBcyB5b3UgY2FuIHNlZSB0aGlzIGlzIGEgdmVyeSByZWN1cnNpdmUgcHJvYmxlbS4gWWVzIHJlY3Vyc2lvbiBpcyBub3QgbW9zdCBlZmZpY2llbnQgYnV0IHRoZVxuICogY29kZSBpcyBjb21wbGljYXRlZCBlbm91Z2ggdGhhdCB0cnlpbmcgdG8gaW1wbGVtZW50ZWQgd2l0aCByZWN1cnNpb24gYmVjb21lcyB1bm1haW50YWluYWJsZS5cbiAqXG4gKiBAcGFyYW0gdFZpZXcgVGhlIGBUVmlldycgd2hpY2ggbmVlZHMgdG8gYmUgaW5zZXJ0ZWQsIGRldGFjaGVkLCBkZXN0cm95ZWRcbiAqIEBwYXJhbSBsVmlldyBUaGUgTFZpZXcgd2hpY2ggbmVlZHMgdG8gYmUgaW5zZXJ0ZWQsIGRldGFjaGVkLCBkZXN0cm95ZWQuXG4gKiBAcGFyYW0gcmVuZGVyZXIgUmVuZGVyZXIgdG8gdXNlXG4gKiBAcGFyYW0gYWN0aW9uIGFjdGlvbiB0byBwZXJmb3JtIChpbnNlcnQsIGRldGFjaCwgZGVzdHJveSlcbiAqIEBwYXJhbSBwYXJlbnRSRWxlbWVudCBwYXJlbnQgRE9NIGVsZW1lbnQgZm9yIGluc2VydGlvbiAoUmVtb3ZhbCBkb2VzIG5vdCBuZWVkIGl0KS5cbiAqIEBwYXJhbSBiZWZvcmVOb2RlIEJlZm9yZSB3aGljaCBub2RlIHRoZSBpbnNlcnRpb25zIHNob3VsZCBoYXBwZW4uXG4gKi9cbmZ1bmN0aW9uIGFwcGx5VmlldyhcbiAgICB0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgcmVuZGVyZXI6IFJlbmRlcmVyLCBhY3Rpb246IFdhbGtUTm9kZVRyZWVBY3Rpb24uRGVzdHJveSxcbiAgICBwYXJlbnRSRWxlbWVudDogbnVsbCwgYmVmb3JlTm9kZTogbnVsbCk6IHZvaWQ7XG5mdW5jdGlvbiBhcHBseVZpZXcoXG4gICAgdFZpZXc6IFRWaWV3LCBsVmlldzogTFZpZXcsIHJlbmRlcmVyOiBSZW5kZXJlciwgYWN0aW9uOiBXYWxrVE5vZGVUcmVlQWN0aW9uLFxuICAgIHBhcmVudFJFbGVtZW50OiBSRWxlbWVudHxudWxsLCBiZWZvcmVOb2RlOiBSTm9kZXxudWxsKTogdm9pZDtcbmZ1bmN0aW9uIGFwcGx5VmlldyhcbiAgICB0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgcmVuZGVyZXI6IFJlbmRlcmVyLCBhY3Rpb246IFdhbGtUTm9kZVRyZWVBY3Rpb24sXG4gICAgcGFyZW50UkVsZW1lbnQ6IFJFbGVtZW50fG51bGwsIGJlZm9yZU5vZGU6IFJOb2RlfG51bGwpOiB2b2lkIHtcbiAgYXBwbHlOb2RlcyhyZW5kZXJlciwgYWN0aW9uLCB0Vmlldy5maXJzdENoaWxkLCBsVmlldywgcGFyZW50UkVsZW1lbnQsIGJlZm9yZU5vZGUsIGZhbHNlKTtcbn1cblxuLyoqXG4gKiBgYXBwbHlQcm9qZWN0aW9uYCBwZXJmb3JtcyBvcGVyYXRpb24gb24gdGhlIHByb2plY3Rpb24uXG4gKlxuICogSW5zZXJ0aW5nIGEgcHJvamVjdGlvbiByZXF1aXJlcyB1cyB0byBsb2NhdGUgdGhlIHByb2plY3RlZCBub2RlcyBmcm9tIHRoZSBwYXJlbnQgY29tcG9uZW50LiBUaGVcbiAqIGNvbXBsaWNhdGlvbiBpcyB0aGF0IHRob3NlIG5vZGVzIHRoZW1zZWx2ZXMgY291bGQgYmUgcmUtcHJvamVjdGVkIGZyb20gdGhlaXIgcGFyZW50IGNvbXBvbmVudC5cbiAqXG4gKiBAcGFyYW0gdFZpZXcgVGhlIGBUVmlld2Agb2YgYExWaWV3YCB3aGljaCBuZWVkcyB0byBiZSBpbnNlcnRlZCwgZGV0YWNoZWQsIGRlc3Ryb3llZFxuICogQHBhcmFtIGxWaWV3IFRoZSBgTFZpZXdgIHdoaWNoIG5lZWRzIHRvIGJlIGluc2VydGVkLCBkZXRhY2hlZCwgZGVzdHJveWVkLlxuICogQHBhcmFtIHRQcm9qZWN0aW9uTm9kZSBub2RlIHRvIHByb2plY3RcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5UHJvamVjdGlvbih0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgdFByb2plY3Rpb25Ob2RlOiBUUHJvamVjdGlvbk5vZGUpIHtcbiAgY29uc3QgcmVuZGVyZXIgPSBsVmlld1tSRU5ERVJFUl07XG4gIGNvbnN0IHBhcmVudFJOb2RlID0gZ2V0UGFyZW50UkVsZW1lbnQodFZpZXcsIHRQcm9qZWN0aW9uTm9kZSwgbFZpZXcpO1xuICBjb25zdCBwYXJlbnRUTm9kZSA9IHRQcm9qZWN0aW9uTm9kZS5wYXJlbnQgfHwgbFZpZXdbVF9IT1NUXSE7XG4gIGxldCBiZWZvcmVOb2RlID0gZ2V0SW5zZXJ0SW5Gcm9udE9mUk5vZGUocGFyZW50VE5vZGUsIHRQcm9qZWN0aW9uTm9kZSwgbFZpZXcpO1xuICBhcHBseVByb2plY3Rpb25SZWN1cnNpdmUoXG4gICAgICByZW5kZXJlciwgV2Fsa1ROb2RlVHJlZUFjdGlvbi5DcmVhdGUsIGxWaWV3LCB0UHJvamVjdGlvbk5vZGUsIHBhcmVudFJOb2RlLCBiZWZvcmVOb2RlKTtcbn1cblxuLyoqXG4gKiBgYXBwbHlQcm9qZWN0aW9uUmVjdXJzaXZlYCBwZXJmb3JtcyBvcGVyYXRpb24gb24gdGhlIHByb2plY3Rpb24gc3BlY2lmaWVkIGJ5IGBhY3Rpb25gIChpbnNlcnQsXG4gKiBkZXRhY2gsIGRlc3Ryb3kpXG4gKlxuICogSW5zZXJ0aW5nIGEgcHJvamVjdGlvbiByZXF1aXJlcyB1cyB0byBsb2NhdGUgdGhlIHByb2plY3RlZCBub2RlcyBmcm9tIHRoZSBwYXJlbnQgY29tcG9uZW50LiBUaGVcbiAqIGNvbXBsaWNhdGlvbiBpcyB0aGF0IHRob3NlIG5vZGVzIHRoZW1zZWx2ZXMgY291bGQgYmUgcmUtcHJvamVjdGVkIGZyb20gdGhlaXIgcGFyZW50IGNvbXBvbmVudC5cbiAqXG4gKiBAcGFyYW0gcmVuZGVyZXIgUmVuZGVyIHRvIHVzZVxuICogQHBhcmFtIGFjdGlvbiBhY3Rpb24gdG8gcGVyZm9ybSAoaW5zZXJ0LCBkZXRhY2gsIGRlc3Ryb3kpXG4gKiBAcGFyYW0gbFZpZXcgVGhlIExWaWV3IHdoaWNoIG5lZWRzIHRvIGJlIGluc2VydGVkLCBkZXRhY2hlZCwgZGVzdHJveWVkLlxuICogQHBhcmFtIHRQcm9qZWN0aW9uTm9kZSBub2RlIHRvIHByb2plY3RcbiAqIEBwYXJhbSBwYXJlbnRSRWxlbWVudCBwYXJlbnQgRE9NIGVsZW1lbnQgZm9yIGluc2VydGlvbi9yZW1vdmFsLlxuICogQHBhcmFtIGJlZm9yZU5vZGUgQmVmb3JlIHdoaWNoIG5vZGUgdGhlIGluc2VydGlvbnMgc2hvdWxkIGhhcHBlbi5cbiAqL1xuZnVuY3Rpb24gYXBwbHlQcm9qZWN0aW9uUmVjdXJzaXZlKFxuICAgIHJlbmRlcmVyOiBSZW5kZXJlciwgYWN0aW9uOiBXYWxrVE5vZGVUcmVlQWN0aW9uLCBsVmlldzogTFZpZXcsIHRQcm9qZWN0aW9uTm9kZTogVFByb2plY3Rpb25Ob2RlLFxuICAgIHBhcmVudFJFbGVtZW50OiBSRWxlbWVudHxudWxsLCBiZWZvcmVOb2RlOiBSTm9kZXxudWxsKSB7XG4gIGNvbnN0IGNvbXBvbmVudExWaWV3ID0gbFZpZXdbREVDTEFSQVRJT05fQ09NUE9ORU5UX1ZJRVddO1xuICBjb25zdCBjb21wb25lbnROb2RlID0gY29tcG9uZW50TFZpZXdbVF9IT1NUXSBhcyBURWxlbWVudE5vZGU7XG4gIG5nRGV2TW9kZSAmJlxuICAgICAgYXNzZXJ0RXF1YWwodHlwZW9mIHRQcm9qZWN0aW9uTm9kZS5wcm9qZWN0aW9uLCAnbnVtYmVyJywgJ2V4cGVjdGluZyBwcm9qZWN0aW9uIGluZGV4Jyk7XG4gIGNvbnN0IG5vZGVUb1Byb2plY3RPclJOb2RlcyA9IGNvbXBvbmVudE5vZGUucHJvamVjdGlvbiFbdFByb2plY3Rpb25Ob2RlLnByb2plY3Rpb25dITtcbiAgaWYgKEFycmF5LmlzQXJyYXkobm9kZVRvUHJvamVjdE9yUk5vZGVzKSkge1xuICAgIC8vIFRoaXMgc2hvdWxkIG5vdCBleGlzdCwgaXQgaXMgYSBiaXQgb2YgYSBoYWNrLiBXaGVuIHdlIGJvb3RzdHJhcCBhIHRvcCBsZXZlbCBub2RlIGFuZCB3ZVxuICAgIC8vIG5lZWQgdG8gc3VwcG9ydCBwYXNzaW5nIHByb2plY3RhYmxlIG5vZGVzLCBzbyB3ZSBjaGVhdCBhbmQgcHV0IHRoZW0gaW4gdGhlIFROb2RlXG4gICAgLy8gb2YgdGhlIEhvc3QgVFZpZXcuIChZZXMgd2UgcHV0IGluc3RhbmNlIGluZm8gYXQgdGhlIFQgTGV2ZWwpLiBXZSBjYW4gZ2V0IGF3YXkgd2l0aCBpdFxuICAgIC8vIGJlY2F1c2Ugd2Uga25vdyB0aGF0IFRWaWV3IGlzIG5vdCBzaGFyZWQgYW5kIHRoZXJlZm9yZSBpdCB3aWxsIG5vdCBiZSBhIHByb2JsZW0uXG4gICAgLy8gVGhpcyBzaG91bGQgYmUgcmVmYWN0b3JlZCBhbmQgY2xlYW5lZCB1cC5cbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IG5vZGVUb1Byb2plY3RPclJOb2Rlcy5sZW5ndGg7IGkrKykge1xuICAgICAgY29uc3Qgck5vZGUgPSBub2RlVG9Qcm9qZWN0T3JSTm9kZXNbaV07XG4gICAgICBhcHBseVRvRWxlbWVudE9yQ29udGFpbmVyKGFjdGlvbiwgcmVuZGVyZXIsIHBhcmVudFJFbGVtZW50LCByTm9kZSwgYmVmb3JlTm9kZSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGxldCBub2RlVG9Qcm9qZWN0OiBUTm9kZXxudWxsID0gbm9kZVRvUHJvamVjdE9yUk5vZGVzO1xuICAgIGNvbnN0IHByb2plY3RlZENvbXBvbmVudExWaWV3ID0gY29tcG9uZW50TFZpZXdbUEFSRU5UXSBhcyBMVmlldztcbiAgICAvLyBJZiBhIHBhcmVudCA8bmctY29udGVudD4gaXMgbG9jYXRlZCB3aXRoaW4gYSBza2lwIGh5ZHJhdGlvbiBibG9jayxcbiAgICAvLyBhbm5vdGF0ZSBhbiBhY3R1YWwgbm9kZSB0aGF0IGlzIGJlaW5nIHByb2plY3RlZCB3aXRoIHRoZSBzYW1lIGZsYWcgdG9vLlxuICAgIGlmIChoYXNJblNraXBIeWRyYXRpb25CbG9ja0ZsYWcodFByb2plY3Rpb25Ob2RlKSkge1xuICAgICAgbm9kZVRvUHJvamVjdC5mbGFncyB8PSBUTm9kZUZsYWdzLmluU2tpcEh5ZHJhdGlvbkJsb2NrO1xuICAgIH1cbiAgICBhcHBseU5vZGVzKFxuICAgICAgICByZW5kZXJlciwgYWN0aW9uLCBub2RlVG9Qcm9qZWN0LCBwcm9qZWN0ZWRDb21wb25lbnRMVmlldywgcGFyZW50UkVsZW1lbnQsIGJlZm9yZU5vZGUsIHRydWUpO1xuICB9XG59XG5cblxuLyoqXG4gKiBgYXBwbHlDb250YWluZXJgIHBlcmZvcm1zIGFuIG9wZXJhdGlvbiBvbiB0aGUgY29udGFpbmVyIGFuZCBpdHMgdmlld3MgYXMgc3BlY2lmaWVkIGJ5XG4gKiBgYWN0aW9uYCAoaW5zZXJ0LCBkZXRhY2gsIGRlc3Ryb3kpXG4gKlxuICogSW5zZXJ0aW5nIGEgQ29udGFpbmVyIGlzIGNvbXBsaWNhdGVkIGJ5IHRoZSBmYWN0IHRoYXQgdGhlIGNvbnRhaW5lciBtYXkgaGF2ZSBWaWV3cyB3aGljaFxuICogdGhlbXNlbHZlcyBoYXZlIGNvbnRhaW5lcnMgb3IgcHJvamVjdGlvbnMuXG4gKlxuICogQHBhcmFtIHJlbmRlcmVyIFJlbmRlcmVyIHRvIHVzZVxuICogQHBhcmFtIGFjdGlvbiBhY3Rpb24gdG8gcGVyZm9ybSAoaW5zZXJ0LCBkZXRhY2gsIGRlc3Ryb3kpXG4gKiBAcGFyYW0gbENvbnRhaW5lciBUaGUgTENvbnRhaW5lciB3aGljaCBuZWVkcyB0byBiZSBpbnNlcnRlZCwgZGV0YWNoZWQsIGRlc3Ryb3llZC5cbiAqIEBwYXJhbSBwYXJlbnRSRWxlbWVudCBwYXJlbnQgRE9NIGVsZW1lbnQgZm9yIGluc2VydGlvbi9yZW1vdmFsLlxuICogQHBhcmFtIGJlZm9yZU5vZGUgQmVmb3JlIHdoaWNoIG5vZGUgdGhlIGluc2VydGlvbnMgc2hvdWxkIGhhcHBlbi5cbiAqL1xuZnVuY3Rpb24gYXBwbHlDb250YWluZXIoXG4gICAgcmVuZGVyZXI6IFJlbmRlcmVyLCBhY3Rpb246IFdhbGtUTm9kZVRyZWVBY3Rpb24sIGxDb250YWluZXI6IExDb250YWluZXIsXG4gICAgcGFyZW50UkVsZW1lbnQ6IFJFbGVtZW50fG51bGwsIGJlZm9yZU5vZGU6IFJOb2RlfG51bGx8dW5kZWZpbmVkKSB7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRMQ29udGFpbmVyKGxDb250YWluZXIpO1xuICBjb25zdCBhbmNob3IgPSBsQ29udGFpbmVyW05BVElWRV07ICAvLyBMQ29udGFpbmVyIGhhcyBpdHMgb3duIGJlZm9yZSBub2RlLlxuICBjb25zdCBuYXRpdmUgPSB1bndyYXBSTm9kZShsQ29udGFpbmVyKTtcbiAgLy8gQW4gTENvbnRhaW5lciBjYW4gYmUgY3JlYXRlZCBkeW5hbWljYWxseSBvbiBhbnkgbm9kZSBieSBpbmplY3RpbmcgVmlld0NvbnRhaW5lclJlZi5cbiAgLy8gQXNraW5nIGZvciBhIFZpZXdDb250YWluZXJSZWYgb24gYW4gZWxlbWVudCB3aWxsIHJlc3VsdCBpbiBhIGNyZWF0aW9uIG9mIGEgc2VwYXJhdGUgYW5jaG9yXG4gIC8vIG5vZGUgKGNvbW1lbnQgaW4gdGhlIERPTSkgdGhhdCB3aWxsIGJlIGRpZmZlcmVudCBmcm9tIHRoZSBMQ29udGFpbmVyJ3MgaG9zdCBub2RlLiBJbiB0aGlzXG4gIC8vIHBhcnRpY3VsYXIgY2FzZSB3ZSBuZWVkIHRvIGV4ZWN1dGUgYWN0aW9uIG9uIDIgbm9kZXM6XG4gIC8vIC0gY29udGFpbmVyJ3MgaG9zdCBub2RlICh0aGlzIGlzIGRvbmUgaW4gdGhlIGV4ZWN1dGVBY3Rpb25PbkVsZW1lbnRPckNvbnRhaW5lcilcbiAgLy8gLSBjb250YWluZXIncyBob3N0IG5vZGUgKHRoaXMgaXMgZG9uZSBoZXJlKVxuICBpZiAoYW5jaG9yICE9PSBuYXRpdmUpIHtcbiAgICAvLyBUaGlzIGlzIHZlcnkgc3RyYW5nZSB0byBtZSAoTWlza28pLiBJIHdvdWxkIGV4cGVjdCB0aGF0IHRoZSBuYXRpdmUgaXMgc2FtZSBhcyBhbmNob3IuIElcbiAgICAvLyBkb24ndCBzZWUgYSByZWFzb24gd2h5IHRoZXkgc2hvdWxkIGJlIGRpZmZlcmVudCwgYnV0IHRoZXkgYXJlLlxuICAgIC8vXG4gICAgLy8gSWYgdGhleSBhcmUgd2UgbmVlZCB0byBwcm9jZXNzIHRoZSBzZWNvbmQgYW5jaG9yIGFzIHdlbGwuXG4gICAgYXBwbHlUb0VsZW1lbnRPckNvbnRhaW5lcihhY3Rpb24sIHJlbmRlcmVyLCBwYXJlbnRSRWxlbWVudCwgYW5jaG9yLCBiZWZvcmVOb2RlKTtcbiAgfVxuICBmb3IgKGxldCBpID0gQ09OVEFJTkVSX0hFQURFUl9PRkZTRVQ7IGkgPCBsQ29udGFpbmVyLmxlbmd0aDsgaSsrKSB7XG4gICAgY29uc3QgbFZpZXcgPSBsQ29udGFpbmVyW2ldIGFzIExWaWV3O1xuICAgIGFwcGx5VmlldyhsVmlld1tUVklFV10sIGxWaWV3LCByZW5kZXJlciwgYWN0aW9uLCBwYXJlbnRSRWxlbWVudCwgYW5jaG9yKTtcbiAgfVxufVxuXG4vKipcbiAqIFdyaXRlcyBjbGFzcy9zdHlsZSB0byBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSByZW5kZXJlciBSZW5kZXJlciB0byB1c2UuXG4gKiBAcGFyYW0gaXNDbGFzc0Jhc2VkIGB0cnVlYCBpZiBpdCBzaG91bGQgYmUgd3JpdHRlbiB0byBgY2xhc3NgIChgZmFsc2VgIHRvIHdyaXRlIHRvIGBzdHlsZWApXG4gKiBAcGFyYW0gck5vZGUgVGhlIE5vZGUgdG8gd3JpdGUgdG8uXG4gKiBAcGFyYW0gcHJvcCBQcm9wZXJ0eSB0byB3cml0ZSB0by4gVGhpcyB3b3VsZCBiZSB0aGUgY2xhc3Mvc3R5bGUgbmFtZS5cbiAqIEBwYXJhbSB2YWx1ZSBWYWx1ZSB0byB3cml0ZS4gSWYgYG51bGxgL2B1bmRlZmluZWRgL2BmYWxzZWAgdGhpcyBpcyBjb25zaWRlcmVkIGEgcmVtb3ZlIChzZXQvYWRkXG4gKiAgICAgICAgb3RoZXJ3aXNlKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFwcGx5U3R5bGluZyhcbiAgICByZW5kZXJlcjogUmVuZGVyZXIsIGlzQ2xhc3NCYXNlZDogYm9vbGVhbiwgck5vZGU6IFJFbGVtZW50LCBwcm9wOiBzdHJpbmcsIHZhbHVlOiBhbnkpIHtcbiAgaWYgKGlzQ2xhc3NCYXNlZCkge1xuICAgIC8vIFdlIGFjdHVhbGx5IHdhbnQgSlMgdHJ1ZS9mYWxzZSBoZXJlIGJlY2F1c2UgYW55IHRydXRoeSB2YWx1ZSBzaG91bGQgYWRkIHRoZSBjbGFzc1xuICAgIGlmICghdmFsdWUpIHtcbiAgICAgIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUucmVuZGVyZXJSZW1vdmVDbGFzcysrO1xuICAgICAgcmVuZGVyZXIucmVtb3ZlQ2xhc3Mock5vZGUsIHByb3ApO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZ0Rldk1vZGUgJiYgbmdEZXZNb2RlLnJlbmRlcmVyQWRkQ2xhc3MrKztcbiAgICAgIHJlbmRlcmVyLmFkZENsYXNzKHJOb2RlLCBwcm9wKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgbGV0IGZsYWdzID0gcHJvcC5pbmRleE9mKCctJykgPT09IC0xID8gdW5kZWZpbmVkIDogUmVuZGVyZXJTdHlsZUZsYWdzMi5EYXNoQ2FzZSBhcyBudW1iZXI7XG4gICAgaWYgKHZhbHVlID09IG51bGwgLyoqIHx8IHZhbHVlID09PSB1bmRlZmluZWQgKi8pIHtcbiAgICAgIG5nRGV2TW9kZSAmJiBuZ0Rldk1vZGUucmVuZGVyZXJSZW1vdmVTdHlsZSsrO1xuICAgICAgcmVuZGVyZXIucmVtb3ZlU3R5bGUock5vZGUsIHByb3AsIGZsYWdzKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gQSB2YWx1ZSBpcyBpbXBvcnRhbnQgaWYgaXQgZW5kcyB3aXRoIGAhaW1wb3J0YW50YC4gVGhlIHN0eWxlXG4gICAgICAvLyBwYXJzZXIgc3RyaXBzIGFueSBzZW1pY29sb25zIGF0IHRoZSBlbmQgb2YgdGhlIHZhbHVlLlxuICAgICAgY29uc3QgaXNJbXBvcnRhbnQgPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUuZW5kc1dpdGgoJyFpbXBvcnRhbnQnKSA6IGZhbHNlO1xuXG4gICAgICBpZiAoaXNJbXBvcnRhbnQpIHtcbiAgICAgICAgLy8gIWltcG9ydGFudCBoYXMgdG8gYmUgc3RyaXBwZWQgZnJvbSB0aGUgdmFsdWUgZm9yIGl0IHRvIGJlIHZhbGlkLlxuICAgICAgICB2YWx1ZSA9IHZhbHVlLnNsaWNlKDAsIC0xMCk7XG4gICAgICAgIGZsYWdzISB8PSBSZW5kZXJlclN0eWxlRmxhZ3MyLkltcG9ydGFudDtcbiAgICAgIH1cblxuICAgICAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlclNldFN0eWxlKys7XG4gICAgICByZW5kZXJlci5zZXRTdHlsZShyTm9kZSwgcHJvcCwgdmFsdWUsIGZsYWdzKTtcbiAgICB9XG4gIH1cbn1cblxuXG4vKipcbiAqIFdyaXRlIGBjc3NUZXh0YCB0byBgUkVsZW1lbnRgLlxuICpcbiAqIFRoaXMgZnVuY3Rpb24gZG9lcyBkaXJlY3Qgd3JpdGUgd2l0aG91dCBhbnkgcmVjb25jaWxpYXRpb24uIFVzZWQgZm9yIHdyaXRpbmcgaW5pdGlhbCB2YWx1ZXMsIHNvXG4gKiB0aGF0IHN0YXRpYyBzdHlsaW5nIHZhbHVlcyBkbyBub3QgcHVsbCBpbiB0aGUgc3R5bGUgcGFyc2VyLlxuICpcbiAqIEBwYXJhbSByZW5kZXJlciBSZW5kZXJlciB0byB1c2VcbiAqIEBwYXJhbSBlbGVtZW50IFRoZSBlbGVtZW50IHdoaWNoIG5lZWRzIHRvIGJlIHVwZGF0ZWQuXG4gKiBAcGFyYW0gbmV3VmFsdWUgVGhlIG5ldyBjbGFzcyBsaXN0IHRvIHdyaXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gd3JpdGVEaXJlY3RTdHlsZShyZW5kZXJlcjogUmVuZGVyZXIsIGVsZW1lbnQ6IFJFbGVtZW50LCBuZXdWYWx1ZTogc3RyaW5nKSB7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnRTdHJpbmcobmV3VmFsdWUsICdcXCduZXdWYWx1ZVxcJyBzaG91bGQgYmUgYSBzdHJpbmcnKTtcbiAgcmVuZGVyZXIuc2V0QXR0cmlidXRlKGVsZW1lbnQsICdzdHlsZScsIG5ld1ZhbHVlKTtcbiAgbmdEZXZNb2RlICYmIG5nRGV2TW9kZS5yZW5kZXJlclNldFN0eWxlKys7XG59XG5cbi8qKlxuICogV3JpdGUgYGNsYXNzTmFtZWAgdG8gYFJFbGVtZW50YC5cbiAqXG4gKiBUaGlzIGZ1bmN0aW9uIGRvZXMgZGlyZWN0IHdyaXRlIHdpdGhvdXQgYW55IHJlY29uY2lsaWF0aW9uLiBVc2VkIGZvciB3cml0aW5nIGluaXRpYWwgdmFsdWVzLCBzb1xuICogdGhhdCBzdGF0aWMgc3R5bGluZyB2YWx1ZXMgZG8gbm90IHB1bGwgaW4gdGhlIHN0eWxlIHBhcnNlci5cbiAqXG4gKiBAcGFyYW0gcmVuZGVyZXIgUmVuZGVyZXIgdG8gdXNlXG4gKiBAcGFyYW0gZWxlbWVudCBUaGUgZWxlbWVudCB3aGljaCBuZWVkcyB0byBiZSB1cGRhdGVkLlxuICogQHBhcmFtIG5ld1ZhbHVlIFRoZSBuZXcgY2xhc3MgbGlzdCB0byB3cml0ZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdyaXRlRGlyZWN0Q2xhc3MocmVuZGVyZXI6IFJlbmRlcmVyLCBlbGVtZW50OiBSRWxlbWVudCwgbmV3VmFsdWU6IHN0cmluZykge1xuICBuZ0Rldk1vZGUgJiYgYXNzZXJ0U3RyaW5nKG5ld1ZhbHVlLCAnXFwnbmV3VmFsdWVcXCcgc2hvdWxkIGJlIGEgc3RyaW5nJyk7XG4gIGlmIChuZXdWYWx1ZSA9PT0gJycpIHtcbiAgICAvLyBUaGVyZSBhcmUgdGVzdHMgaW4gYGdvb2dsZTNgIHdoaWNoIGV4cGVjdCBgZWxlbWVudC5nZXRBdHRyaWJ1dGUoJ2NsYXNzJylgIHRvIGJlIGBudWxsYC5cbiAgICByZW5kZXJlci5yZW1vdmVBdHRyaWJ1dGUoZWxlbWVudCwgJ2NsYXNzJyk7XG4gIH0gZWxzZSB7XG4gICAgcmVuZGVyZXIuc2V0QXR0cmlidXRlKGVsZW1lbnQsICdjbGFzcycsIG5ld1ZhbHVlKTtcbiAgfVxuICBuZ0Rldk1vZGUgJiYgbmdEZXZNb2RlLnJlbmRlcmVyU2V0Q2xhc3NOYW1lKys7XG59XG5cbi8qKiBTZXRzIHVwIHRoZSBzdGF0aWMgRE9NIGF0dHJpYnV0ZXMgb24gYW4gYFJOb2RlYC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXR1cFN0YXRpY0F0dHJpYnV0ZXMocmVuZGVyZXI6IFJlbmRlcmVyLCBlbGVtZW50OiBSRWxlbWVudCwgdE5vZGU6IFROb2RlKSB7XG4gIGNvbnN0IHttZXJnZWRBdHRycywgY2xhc3Nlcywgc3R5bGVzfSA9IHROb2RlO1xuXG4gIGlmIChtZXJnZWRBdHRycyAhPT0gbnVsbCkge1xuICAgIHNldFVwQXR0cmlidXRlcyhyZW5kZXJlciwgZWxlbWVudCwgbWVyZ2VkQXR0cnMpO1xuICB9XG5cbiAgaWYgKGNsYXNzZXMgIT09IG51bGwpIHtcbiAgICB3cml0ZURpcmVjdENsYXNzKHJlbmRlcmVyLCBlbGVtZW50LCBjbGFzc2VzKTtcbiAgfVxuXG4gIGlmIChzdHlsZXMgIT09IG51bGwpIHtcbiAgICB3cml0ZURpcmVjdFN0eWxlKHJlbmRlcmVyLCBlbGVtZW50LCBzdHlsZXMpO1xuICB9XG59XG4iXX0=