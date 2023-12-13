/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ViewEncapsulation } from '../metadata';
import { collectNativeNodes, collectNativeNodesInLContainer } from '../render3/collect_native_nodes';
import { getComponentDef } from '../render3/definition';
import { CONTAINER_HEADER_OFFSET } from '../render3/interfaces/container';
import { isTNodeShape } from '../render3/interfaces/node';
import { hasI18n, isComponentHost, isLContainer, isProjectionTNode, isRootView } from '../render3/interfaces/type_checks';
import { CONTEXT, HEADER_OFFSET, HOST, PARENT, RENDERER, TVIEW } from '../render3/interfaces/view';
import { unwrapLView, unwrapRNode } from '../render3/util/view_utils';
import { TransferState } from '../transfer_state';
import { unsupportedProjectionOfDomNodes } from './error_handling';
import { CONTAINERS, DISCONNECTED_NODES, ELEMENT_CONTAINERS, MULTIPLIER, NODES, NUM_ROOT_NODES, TEMPLATE_ID, TEMPLATES } from './interfaces';
import { calcPathForNode, isDisconnectedNode } from './node_lookup_utils';
import { isInSkipHydrationBlock, SKIP_HYDRATION_ATTR_NAME } from './skip_hydration';
import { getLNodeForHydration, NGH_ATTR_NAME, NGH_DATA_KEY } from './utils';
/**
 * A collection that tracks all serialized views (`ngh` DOM annotations)
 * to avoid duplication. An attempt to add a duplicate view results in the
 * collection returning the index of the previously collected serialized view.
 * This reduces the number of annotations needed for a given page.
 */
class SerializedViewCollection {
    constructor() {
        this.views = [];
        this.indexByContent = new Map();
    }
    add(serializedView) {
        const viewAsString = JSON.stringify(serializedView);
        if (!this.indexByContent.has(viewAsString)) {
            const index = this.views.length;
            this.views.push(serializedView);
            this.indexByContent.set(viewAsString, index);
            return index;
        }
        return this.indexByContent.get(viewAsString);
    }
    getAll() {
        return this.views;
    }
}
/**
 * Global counter that is used to generate a unique id for TViews
 * during the serialization process.
 */
let tViewSsrId = 0;
/**
 * Generates a unique id for a given TView and returns this id.
 * The id is also stored on this instance of a TView and reused in
 * subsequent calls.
 *
 * This id is needed to uniquely identify and pick up dehydrated views
 * at runtime.
 */
function getSsrId(tView) {
    if (!tView.ssrId) {
        tView.ssrId = `t${tViewSsrId++}`;
    }
    return tView.ssrId;
}
/**
 * Computes the number of root nodes in a given view
 * (or child nodes in a given container if a tNode is provided).
 */
function calcNumRootNodes(tView, lView, tNode) {
    const rootNodes = [];
    collectNativeNodes(tView, lView, tNode, rootNodes);
    return rootNodes.length;
}
/**
 * Computes the number of root nodes in all views in a given LContainer.
 */
function calcNumRootNodesInLContainer(lContainer) {
    const rootNodes = [];
    collectNativeNodesInLContainer(lContainer, rootNodes);
    return rootNodes.length;
}
/**
 * Annotates root level component's LView for hydration,
 * see `annotateHostElementForHydration` for additional information.
 */
function annotateComponentLViewForHydration(lView, context) {
    const hostElement = lView[HOST];
    // Root elements might also be annotated with the `ngSkipHydration` attribute,
    // check if it's present before starting the serialization process.
    if (hostElement && !hostElement.hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
        return annotateHostElementForHydration(hostElement, lView, context);
    }
    return null;
}
/**
 * Annotates root level LContainer for hydration. This happens when a root component
 * injects ViewContainerRef, thus making the component an anchor for a view container.
 * This function serializes the component itself as well as all views from the view
 * container.
 */
function annotateLContainerForHydration(lContainer, context) {
    const componentLView = unwrapLView(lContainer[HOST]);
    // Serialize the root component itself.
    const componentLViewNghIndex = annotateComponentLViewForHydration(componentLView, context);
    const hostElement = unwrapRNode(componentLView[HOST]);
    // Serialize all views within this view container.
    const rootLView = lContainer[PARENT];
    const rootLViewNghIndex = annotateHostElementForHydration(hostElement, rootLView, context);
    const renderer = componentLView[RENDERER];
    // For cases when a root component also acts as an anchor node for a ViewContainerRef
    // (for example, when ViewContainerRef is injected in a root component), there is a need
    // to serialize information about the component itself, as well as an LContainer that
    // represents this ViewContainerRef. Effectively, we need to serialize 2 pieces of info:
    // (1) hydration info for the root component itself and (2) hydration info for the
    // ViewContainerRef instance (an LContainer). Each piece of information is included into
    // the hydration data (in the TransferState object) separately, thus we end up with 2 ids.
    // Since we only have 1 root element, we encode both bits of info into a single string:
    // ids are separated by the `|` char (e.g. `10|25`, where `10` is the ngh for a component view
    // and 25 is the `ngh` for a root view which holds LContainer).
    const finalIndex = `${componentLViewNghIndex}|${rootLViewNghIndex}`;
    renderer.setAttribute(hostElement, NGH_ATTR_NAME, finalIndex);
}
/**
 * Annotates all components bootstrapped in a given ApplicationRef
 * with info needed for hydration.
 *
 * @param appRef An instance of an ApplicationRef.
 * @param doc A reference to the current Document instance.
 */
export function annotateForHydration(appRef, doc) {
    const serializedViewCollection = new SerializedViewCollection();
    const corruptedTextNodes = new Map();
    const viewRefs = appRef._views;
    for (const viewRef of viewRefs) {
        const lNode = getLNodeForHydration(viewRef);
        // An `lView` might be `null` if a `ViewRef` represents
        // an embedded view (not a component view).
        if (lNode !== null) {
            const context = {
                serializedViewCollection,
                corruptedTextNodes,
            };
            if (isLContainer(lNode)) {
                annotateLContainerForHydration(lNode, context);
            }
            else {
                annotateComponentLViewForHydration(lNode, context);
            }
            insertCorruptedTextNodeMarkers(corruptedTextNodes, doc);
        }
    }
    // Note: we *always* include hydration info key and a corresponding value
    // into the TransferState, even if the list of serialized views is empty.
    // This is needed as a signal to the client that the server part of the
    // hydration logic was setup and enabled correctly. Otherwise, if a client
    // hydration doesn't find a key in the transfer state - an error is produced.
    const serializedViews = serializedViewCollection.getAll();
    const transferState = appRef.injector.get(TransferState);
    transferState.set(NGH_DATA_KEY, serializedViews);
}
/**
 * Serializes the lContainer data into a list of SerializedView objects,
 * that represent views within this lContainer.
 *
 * @param lContainer the lContainer we are serializing
 * @param context the hydration context
 * @returns an array of the `SerializedView` objects
 */
function serializeLContainer(lContainer, context) {
    const views = [];
    let lastViewAsString = '';
    for (let i = CONTAINER_HEADER_OFFSET; i < lContainer.length; i++) {
        let childLView = lContainer[i];
        let template;
        let numRootNodes;
        let serializedView;
        if (isRootView(childLView)) {
            // If this is a root view, get an LView for the underlying component,
            // because it contains information about the view to serialize.
            childLView = childLView[HEADER_OFFSET];
            // If we have an LContainer at this position, this indicates that the
            // host element was used as a ViewContainerRef anchor (e.g. a `ViewContainerRef`
            // was injected within the component class). This case requires special handling.
            if (isLContainer(childLView)) {
                // Calculate the number of root nodes in all views in a given container
                // and increment by one to account for an anchor node itself, i.e. in this
                // scenario we'll have a layout that would look like this:
                // `<app-root /><#VIEW1><#VIEW2>...<!--container-->`
                // The `+1` is to capture the `<app-root />` element.
                numRootNodes = calcNumRootNodesInLContainer(childLView) + 1;
                annotateLContainerForHydration(childLView, context);
                const componentLView = unwrapLView(childLView[HOST]);
                serializedView = {
                    [TEMPLATE_ID]: componentLView[TVIEW].ssrId,
                    [NUM_ROOT_NODES]: numRootNodes,
                };
            }
        }
        if (!serializedView) {
            const childTView = childLView[TVIEW];
            if (childTView.type === 1 /* TViewType.Component */) {
                template = childTView.ssrId;
                // This is a component view, thus it has only 1 root node: the component
                // host node itself (other nodes would be inside that host node).
                numRootNodes = 1;
            }
            else {
                template = getSsrId(childTView);
                numRootNodes = calcNumRootNodes(childTView, childLView, childTView.firstChild);
            }
            serializedView = {
                [TEMPLATE_ID]: template,
                [NUM_ROOT_NODES]: numRootNodes,
                ...serializeLView(lContainer[i], context),
            };
        }
        // Check if the previous view has the same shape (for example, it was
        // produced by the *ngFor), in which case bump the counter on the previous
        // view instead of including the same information again.
        const currentViewAsString = JSON.stringify(serializedView);
        if (views.length > 0 && currentViewAsString === lastViewAsString) {
            const previousView = views[views.length - 1];
            previousView[MULTIPLIER] ??= 1;
            previousView[MULTIPLIER]++;
        }
        else {
            // Record this view as most recently added.
            lastViewAsString = currentViewAsString;
            views.push(serializedView);
        }
    }
    return views;
}
/**
 * Helper function to produce a node path (which navigation steps runtime logic
 * needs to take to locate a node) and stores it in the `NODES` section of the
 * current serialized view.
 */
function appendSerializedNodePath(ngh, tNode, lView) {
    const noOffsetIndex = tNode.index - HEADER_OFFSET;
    ngh[NODES] ??= {};
    ngh[NODES][noOffsetIndex] = calcPathForNode(tNode, lView);
}
/**
 * Helper function to append information about a disconnected node.
 * This info is needed at runtime to avoid DOM lookups for this element
 * and instead, the element would be created from scratch.
 */
function appendDisconnectedNodeIndex(ngh, tNode) {
    const noOffsetIndex = tNode.index - HEADER_OFFSET;
    ngh[DISCONNECTED_NODES] ??= [];
    if (!ngh[DISCONNECTED_NODES].includes(noOffsetIndex)) {
        ngh[DISCONNECTED_NODES].push(noOffsetIndex);
    }
}
/**
 * Serializes the lView data into a SerializedView object that will later be added
 * to the TransferState storage and referenced using the `ngh` attribute on a host
 * element.
 *
 * @param lView the lView we are serializing
 * @param context the hydration context
 * @returns the `SerializedView` object containing the data to be added to the host node
 */
function serializeLView(lView, context) {
    const ngh = {};
    const tView = lView[TVIEW];
    // Iterate over DOM element references in an LView.
    for (let i = HEADER_OFFSET; i < tView.bindingStartIndex; i++) {
        const tNode = tView.data[i];
        const noOffsetIndex = i - HEADER_OFFSET;
        // Skip processing of a given slot in the following cases:
        // - Local refs (e.g. <div #localRef>) take up an extra slot in LViews
        //   to store the same element. In this case, there is no information in
        //   a corresponding slot in TNode data structure.
        // - When a slot contains something other than a TNode. For example, there
        //   might be some metadata information about a defer block or a control flow block.
        if (!isTNodeShape(tNode)) {
            continue;
        }
        // Check if a native node that represents a given TNode is disconnected from the DOM tree.
        // Such nodes must be excluded from the hydration (since the hydration won't be able to
        // find them), so the TNode ids are collected and used at runtime to skip the hydration.
        //
        // This situation may happen during the content projection, when some nodes don't make it
        // into one of the content projection slots (for example, when there is no default
        // <ng-content /> slot in projector component's template).
        if (isDisconnectedNode(tNode, lView) && isContentProjectedNode(tNode)) {
            appendDisconnectedNodeIndex(ngh, tNode);
            continue;
        }
        if (Array.isArray(tNode.projection)) {
            for (const projectionHeadTNode of tNode.projection) {
                // We may have `null`s in slots with no projected content.
                if (!projectionHeadTNode)
                    continue;
                if (!Array.isArray(projectionHeadTNode)) {
                    // If we process re-projected content (i.e. `<ng-content>`
                    // appears at projection location), skip annotations for this content
                    // since all DOM nodes in this projection were handled while processing
                    // a parent lView, which contains those nodes.
                    if (!isProjectionTNode(projectionHeadTNode) &&
                        !isInSkipHydrationBlock(projectionHeadTNode)) {
                        if (isDisconnectedNode(projectionHeadTNode, lView)) {
                            // Check whether this node is connected, since we may have a TNode
                            // in the data structure as a projection segment head, but the
                            // content projection slot might be disabled (e.g.
                            // <ng-content *ngIf="false" />).
                            appendDisconnectedNodeIndex(ngh, projectionHeadTNode);
                        }
                        else {
                            appendSerializedNodePath(ngh, projectionHeadTNode, lView);
                        }
                    }
                }
                else {
                    // If a value is an array, it means that we are processing a projection
                    // where projectable nodes were passed in as DOM nodes (for example, when
                    // calling `ViewContainerRef.createComponent(CmpA, {projectableNodes: [...]})`).
                    //
                    // In this scenario, nodes can come from anywhere (either created manually,
                    // accessed via `document.querySelector`, etc) and may be in any state
                    // (attached or detached from the DOM tree). As a result, we can not reliably
                    // restore the state for such cases during hydration.
                    throw unsupportedProjectionOfDomNodes(unwrapRNode(lView[i]));
                }
            }
        }
        conditionallyAnnotateNodePath(ngh, tNode, lView);
        if (isLContainer(lView[i])) {
            // Serialize information about a template.
            const embeddedTView = tNode.tView;
            if (embeddedTView !== null) {
                ngh[TEMPLATES] ??= {};
                ngh[TEMPLATES][noOffsetIndex] = getSsrId(embeddedTView);
            }
            // Serialize views within this LContainer.
            const hostNode = lView[i][HOST]; // host node of this container
            // LView[i][HOST] can be of 2 different types:
            // - either a DOM node
            // - or an array that represents an LView of a component
            if (Array.isArray(hostNode)) {
                // This is a component, serialize info about it.
                const targetNode = unwrapRNode(hostNode);
                if (!targetNode.hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
                    annotateHostElementForHydration(targetNode, hostNode, context);
                }
            }
            ngh[CONTAINERS] ??= {};
            ngh[CONTAINERS][noOffsetIndex] = serializeLContainer(lView[i], context);
        }
        else if (Array.isArray(lView[i])) {
            // This is a component, annotate the host node with an `ngh` attribute.
            const targetNode = unwrapRNode(lView[i][HOST]);
            if (!targetNode.hasAttribute(SKIP_HYDRATION_ATTR_NAME)) {
                annotateHostElementForHydration(targetNode, lView[i], context);
            }
        }
        else {
            // <ng-container> case
            if (tNode.type & 8 /* TNodeType.ElementContainer */) {
                // An <ng-container> is represented by the number of
                // top-level nodes. This information is needed to skip over
                // those nodes to reach a corresponding anchor node (comment node).
                ngh[ELEMENT_CONTAINERS] ??= {};
                ngh[ELEMENT_CONTAINERS][noOffsetIndex] = calcNumRootNodes(tView, lView, tNode.child);
            }
            else if (tNode.type & 16 /* TNodeType.Projection */) {
                // Current TNode represents an `<ng-content>` slot, thus it has no
                // DOM elements associated with it, so the **next sibling** node would
                // not be able to find an anchor. In this case, use full path instead.
                let nextTNode = tNode.next;
                // Skip over all `<ng-content>` slots in a row.
                while (nextTNode !== null && (nextTNode.type & 16 /* TNodeType.Projection */)) {
                    nextTNode = nextTNode.next;
                }
                if (nextTNode && !isInSkipHydrationBlock(nextTNode)) {
                    // Handle a tNode after the `<ng-content>` slot.
                    appendSerializedNodePath(ngh, nextTNode, lView);
                }
            }
            else {
                // Handle cases where text nodes can be lost after DOM serialization:
                //  1. When there is an *empty text node* in DOM: in this case, this
                //     node would not make it into the serialized string and as a result,
                //     this node wouldn't be created in a browser. This would result in
                //     a mismatch during the hydration, where the runtime logic would expect
                //     a text node to be present in live DOM, but no text node would exist.
                //     Example: `<span>{{ name }}</span>` when the `name` is an empty string.
                //     This would result in `<span></span>` string after serialization and
                //     in a browser only the `span` element would be created. To resolve that,
                //     an extra comment node is appended in place of an empty text node and
                //     that special comment node is replaced with an empty text node *before*
                //     hydration.
                //  2. When there are 2 consecutive text nodes present in the DOM.
                //     Example: `<div>Hello <ng-container *ngIf="true">world</ng-container></div>`.
                //     In this scenario, the live DOM would look like this:
                //       <div>#text('Hello ') #text('world') #comment('container')</div>
                //     Serialized string would look like this: `<div>Hello world<!--container--></div>`.
                //     The live DOM in a browser after that would be:
                //       <div>#text('Hello world') #comment('container')</div>
                //     Notice how 2 text nodes are now "merged" into one. This would cause hydration
                //     logic to fail, since it'd expect 2 text nodes being present, not one.
                //     To fix this, we insert a special comment node in between those text nodes, so
                //     serialized representation is: `<div>Hello <!--ngtns-->world<!--container--></div>`.
                //     This forces browser to create 2 text nodes separated by a comment node.
                //     Before running a hydration process, this special comment node is removed, so the
                //     live DOM has exactly the same state as it was before serialization.
                if (tNode.type & 1 /* TNodeType.Text */) {
                    const rNode = unwrapRNode(lView[i]);
                    // Collect this node as required special annotation only when its
                    // contents is empty. Otherwise, such text node would be present on
                    // the client after server-side rendering and no special handling needed.
                    if (rNode.textContent === '') {
                        context.corruptedTextNodes.set(rNode, "ngetn" /* TextNodeMarker.EmptyNode */);
                    }
                    else if (rNode.nextSibling?.nodeType === Node.TEXT_NODE) {
                        context.corruptedTextNodes.set(rNode, "ngtns" /* TextNodeMarker.Separator */);
                    }
                }
            }
        }
    }
    return ngh;
}
/**
 * Serializes node location in cases when it's needed, specifically:
 *
 *  1. If `tNode.projectionNext` is different from `tNode.next` - it means that
 *     the next `tNode` after projection is different from the one in the original
 *     template. Since hydration relies on `tNode.next`, this serialized info
 *     if required to help runtime code find the node at the correct location.
 *  2. In certain content projection-based use-cases, it's possible that only
 *     a content of a projected element is rendered. In this case, content nodes
 *     require an extra annotation, since runtime logic can't rely on parent-child
 *     connection to identify the location of a node.
 */
function conditionallyAnnotateNodePath(ngh, tNode, lView) {
    // Handle case #1 described above.
    if (tNode.projectionNext && tNode.projectionNext !== tNode.next &&
        !isInSkipHydrationBlock(tNode.projectionNext)) {
        appendSerializedNodePath(ngh, tNode.projectionNext, lView);
    }
    // Handle case #2 described above.
    // Note: we only do that for the first node (i.e. when `tNode.prev === null`),
    // the rest of the nodes would rely on the current node location, so no extra
    // annotation is needed.
    if (tNode.prev === null && tNode.parent !== null && isDisconnectedNode(tNode.parent, lView) &&
        !isDisconnectedNode(tNode, lView)) {
        appendSerializedNodePath(ngh, tNode, lView);
    }
}
/**
 * Determines whether a component instance that is represented
 * by a given LView uses `ViewEncapsulation.ShadowDom`.
 */
function componentUsesShadowDomEncapsulation(lView) {
    const instance = lView[CONTEXT];
    return instance?.constructor ?
        getComponentDef(instance.constructor)?.encapsulation === ViewEncapsulation.ShadowDom :
        false;
}
/**
 * Annotates component host element for hydration:
 * - by either adding the `ngh` attribute and collecting hydration-related info
 *   for the serialization and transferring to the client
 * - or by adding the `ngSkipHydration` attribute in case Angular detects that
 *   component contents is not compatible with hydration.
 *
 * @param element The Host element to be annotated
 * @param lView The associated LView
 * @param context The hydration context
 * @returns An index of serialized view from the transfer state object
 *          or `null` when a given component can not be serialized.
 */
function annotateHostElementForHydration(element, lView, context) {
    const renderer = lView[RENDERER];
    if (hasI18n(lView) || componentUsesShadowDomEncapsulation(lView)) {
        // Attach the skip hydration attribute if this component:
        // - either has i18n blocks, since hydrating such blocks is not yet supported
        // - or uses ShadowDom view encapsulation, since Domino doesn't support
        //   shadow DOM, so we can not guarantee that client and server representations
        //   would exactly match
        renderer.setAttribute(element, SKIP_HYDRATION_ATTR_NAME, '');
        return null;
    }
    else {
        const ngh = serializeLView(lView, context);
        const index = context.serializedViewCollection.add(ngh);
        renderer.setAttribute(element, NGH_ATTR_NAME, index.toString());
        return index;
    }
}
/**
 * Physically inserts the comment nodes to ensure empty text nodes and adjacent
 * text node separators are preserved after server serialization of the DOM.
 * These get swapped back for empty text nodes or separators once hydration happens
 * on the client.
 *
 * @param corruptedTextNodes The Map of text nodes to be replaced with comments
 * @param doc The document
 */
function insertCorruptedTextNodeMarkers(corruptedTextNodes, doc) {
    for (const [textNode, marker] of corruptedTextNodes) {
        textNode.after(doc.createComment(marker));
    }
}
/**
 * Detects whether a given TNode represents a node that
 * is being content projected.
 */
function isContentProjectedNode(tNode) {
    let currentTNode = tNode;
    while (currentTNode != null) {
        // If we come across a component host node in parent nodes -
        // this TNode is in the content projection section.
        if (isComponentHost(currentTNode)) {
            return true;
        }
        currentTNode = currentTNode.parent;
    }
    return false;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW5ub3RhdGUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3NyYy9oeWRyYXRpb24vYW5ub3RhdGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBR0gsT0FBTyxFQUFDLGlCQUFpQixFQUFDLE1BQU0sYUFBYSxDQUFDO0FBRTlDLE9BQU8sRUFBQyxrQkFBa0IsRUFBRSw4QkFBOEIsRUFBQyxNQUFNLGlDQUFpQyxDQUFDO0FBQ25HLE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSx1QkFBdUIsQ0FBQztBQUN0RCxPQUFPLEVBQUMsdUJBQXVCLEVBQWEsTUFBTSxpQ0FBaUMsQ0FBQztBQUNwRixPQUFPLEVBQUMsWUFBWSxFQUFtQixNQUFNLDRCQUE0QixDQUFDO0FBRTFFLE9BQU8sRUFBQyxPQUFPLEVBQUUsZUFBZSxFQUFFLFlBQVksRUFBRSxpQkFBaUIsRUFBRSxVQUFVLEVBQUMsTUFBTSxtQ0FBbUMsQ0FBQztBQUN4SCxPQUFPLEVBQUMsT0FBTyxFQUFFLGFBQWEsRUFBRSxJQUFJLEVBQVMsTUFBTSxFQUFFLFFBQVEsRUFBUyxLQUFLLEVBQVksTUFBTSw0QkFBNEIsQ0FBQztBQUMxSCxPQUFPLEVBQUMsV0FBVyxFQUFFLFdBQVcsRUFBQyxNQUFNLDRCQUE0QixDQUFDO0FBQ3BFLE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUVoRCxPQUFPLEVBQUMsK0JBQStCLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRSxPQUFPLEVBQUMsVUFBVSxFQUFFLGtCQUFrQixFQUFFLGtCQUFrQixFQUFFLFVBQVUsRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUEyQyxXQUFXLEVBQUUsU0FBUyxFQUFDLE1BQU0sY0FBYyxDQUFDO0FBQ3BMLE9BQU8sRUFBQyxlQUFlLEVBQUUsa0JBQWtCLEVBQUMsTUFBTSxxQkFBcUIsQ0FBQztBQUN4RSxPQUFPLEVBQUMs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LEdBQUcsQ0FBQyxhQUFhLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztLQUMzQztBQUNILENBQUM7QUFFRDs7O0dBR0c7QUFDSCxTQUFTLHNCQUFzQixDQUFDLEtBQVk7SUFDMUMsSUFBSSxZQUFZLEdBQUcsS0FBSyxDQUFDO0lBQ3pCLE9BQU8sWUFBWSxJQUFJLElBQUksRUFBRTtRQUMzQiw0REFBNEQ7UUFDNUQsbURBQW1EO1FBQ25ELElBQUksZUFBZSxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ2pDLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFDRCxZQUFZLEdBQUcsWUFBWSxDQUFDLE1BQWUsQ0FBQztLQUM3QztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0FwcGxpY2F0aW9uUmVmfSBmcm9tICcuLi9hcHBsaWNhdGlvbl9yZWYnO1xuaW1wb3J0IHtWaWV3RW5jYXBzdWxhdGlvbn0gZnJvbSAnLi4vbWV0YWRhdGEnO1xuaW1wb3J0IHtSZW5kZXJlcjJ9IGZyb20gJy4uL3JlbmRlcic7XG5pbXBvcnQge2NvbGxlY3ROYXRpdmVOb2RlcywgY29sbGVjdE5hdGl2ZU5vZGVzSW5MQ29udGFpbmVyfSBmcm9tICcuLi9yZW5kZXIzL2NvbGxlY3RfbmF0aXZlX25vZGVzJztcbmltcG9ydCB7Z2V0Q29tcG9uZW50RGVmfSBmcm9tICcuLi9yZW5kZXIzL2RlZmluaXRpb24nO1xuaW1wb3J0IHtDT05UQUlORVJfSEVBREVSX09GRlNFVCwgTENvbnRhaW5lcn0gZnJvbSAnLi4vcmVuZGVyMy9pbnRlcmZhY2VzL2NvbnRhaW5lcic7XG5pbXBvcnQge2lzVE5vZGVTaGFwZSwgVE5vZGUsIFROb2RlVHlwZX0gZnJvbSAnLi4vcmVuZGVyMy9pbnRlcmZhY2VzL25vZGUnO1xuaW1wb3J0IHtSRWxlbWVudH0gZnJvbSAnLi4vcmVuZGVyMy9pbnRlcmZhY2VzL3JlbmRlcmVyX2RvbSc7XG5pbXBvcnQge2hhc0kxOG4sIGlzQ29tcG9uZW50SG9zdCwgaXNMQ29udGFpbmVyLCBpc1Byb2plY3Rpb25UTm9kZSwgaXNSb290Vmlld30gZnJvbSAnLi4vcmVuZGVyMy9pbnRlcmZhY2VzL3R5cGVfY2hlY2tzJztcbmltcG9ydCB7Q09OVEVYVCwgSEVBREVSX09GRlNFVCwgSE9TVCwgTFZpZXcsIFBBUkVOVCwgUkVOREVSRVIsIFRWaWV3LCBUVklFVywgVFZpZXdUeXBlfSBmcm9tICcuLi9yZW5kZXIzL2ludGVyZmFjZXMvdmlldyc7XG5pbXBvcnQge3Vud3JhcExWaWV3LCB1bndyYXBSTm9kZX0gZnJvbSAnLi4vcmVuZGVyMy91dGlsL3ZpZXdfdXRpbHMnO1xuaW1wb3J0IHtUcmFuc2ZlclN0YXRlfSBmcm9tICcuLi90cmFuc2Zlcl9zdGF0ZSc7XG5cbmltcG9ydCB7dW5zdXBwb3J0ZWRQcm9qZWN0aW9uT2ZEb21Ob2Rlc30gZnJvbSAnLi9lcnJvcl9oYW5kbGluZyc7XG5pbXBvcnQge0NPTlRBSU5FUlMsIERJU0NPTk5FQ1RFRF9OT0RFUywgRUxFTUVOVF9DT05UQUlORVJTLCBNVUxUSVBMSUVSLCBOT0RFUywgTlVNX1JPT1RfTk9ERVMsIFNlcmlhbGl6ZWRDb250YWluZXJWaWV3LCBTZXJpYWxpemVkVmlldywgVEVNUExBVEVfSUQsIFRFTVBMQVRFU30gZnJvbSAnLi9pbnRlcmZhY2VzJztcbmltcG9ydCB7Y2FsY1BhdGhGb3JOb2RlLCBpc0Rpc2Nvbm5lY3RlZE5vZGV9IGZyb20gJy4vbm9kZV9sb29rdXBfdXRpbHMnO1xuaW1wb3J0IHtpc0luU2tpcEh5ZHJhdGlvbkJsb2NrLCBTS0lQX0hZRFJBVElPTl9BVFRSX05BTUV9IGZyb20gJy4vc2tpcF9oeWRyYXRpb24nO1xuaW1wb3J0IHtnZXRMTm9kZUZvckh5ZHJhdGlvbiwgTkdIX0FUVFJfTkFNRSwgTkdIX0RBVEFfS0VZLCBUZXh0Tm9kZU1hcmtlcn0gZnJvbSAnLi91dGlscyc7XG5cbi8qKlxuICogQSBjb2xsZWN0aW9uIHRoYXQgdHJhY2tzIGFsbCBzZXJpYWxpemVkIHZpZXdzIChgbmdoYCBET00gYW5ub3RhdGlvbnMpXG4gKiB0byBhdm9pZCBkdXBsaWNhdGlvbi4gQW4gYXR0ZW1wdCB0byBhZGQgYSBkdXBsaWNhdGUgdmlldyByZXN1bHRzIGluIHRoZVxuICogY29sbGVjdGlvbiByZXR1cm5pbmcgdGhlIGluZGV4IG9mIHRoZSBwcmV2aW91c2x5IGNvbGxlY3RlZCBzZXJpYWxpemVkIHZpZXcuXG4gKiBUaGlzIHJlZHVjZXMgdGhlIG51bWJlciBvZiBhbm5vdGF0aW9ucyBuZWVkZWQgZm9yIGEgZ2l2ZW4gcGFnZS5cbiAqL1xuY2xhc3MgU2VyaWFsaXplZFZpZXdDb2xsZWN0aW9uIHtcbiAgcHJpdmF0ZSB2aWV3czogU2VyaWFsaXplZFZpZXdbXSA9IFtdO1xuICBwcml2YXRlIGluZGV4QnlDb250ZW50ID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuICBhZGQoc2VyaWFsaXplZFZpZXc6IFNlcmlhbGl6ZWRWaWV3KTogbnVtYmVyIHtcbiAgICBjb25zdCB2aWV3QXNTdHJpbmcgPSBKU09OLnN0cmluZ2lmeShzZXJpYWxpemVkVmlldyk7XG4gICAgaWYgKCF0aGlzLmluZGV4QnlDb250ZW50Lmhhcyh2aWV3QXNTdHJpbmcpKSB7XG4gICAgICBjb25zdCBpbmRleCA9IHRoaXMudmlld3MubGVuZ3RoO1xuICAgICAgdGhpcy52aWV3cy5wdXNoKHNlcmlhbGl6ZWRWaWV3KTtcbiAgICAgIHRoaXMuaW5kZXhCeUNvbnRlbnQuc2V0KHZpZXdBc1N0cmluZywgaW5kZXgpO1xuICAgICAgcmV0dXJuIGluZGV4O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5pbmRleEJ5Q29udGVudC5nZXQodmlld0FzU3RyaW5nKSE7XG4gIH1cblxuICBnZXRBbGwoKTogU2VyaWFsaXplZFZpZXdbXSB7XG4gICAgcmV0dXJuIHRoaXMudmlld3M7XG4gIH1cbn1cblxuLyoqXG4gKiBHbG9iYWwgY291bnRlciB0aGF0IGlzIHVzZWQgdG8gZ2VuZXJhdGUgYSB1bmlxdWUgaWQgZm9yIFRWaWV3c1xuICogZHVyaW5nIHRoZSBzZXJpYWxpemF0aW9uIHByb2Nlc3MuXG4gKi9cbmxldCB0Vmlld1NzcklkID0gMDtcblxuLyoqXG4gKiBHZW5lcmF0ZXMgYSB1bmlxdWUgaWQgZm9yIGEgZ2l2ZW4gVFZpZXcgYW5kIHJldHVybnMgdGhpcyBpZC5cbiAqIFRoZSBpZCBpcyBhbHNvIHN0b3JlZCBvbiB0aGlzIGluc3RhbmNlIG9mIGEgVFZpZXcgYW5kIHJldXNlZCBpblxuICogc3Vic2VxdWVudCBjYWxscy5cbiAqXG4gKiBUaGlzIGlkIGlzIG5lZWRlZCB0byB1bmlxdWVseSBpZGVudGlmeSBhbmQgcGljayB1cCBkZWh5ZHJhdGVkIHZpZXdzXG4gKiBhdCBydW50aW1lLlxuICovXG5mdW5jdGlvbiBnZXRTc3JJZCh0VmlldzogVFZpZXcpOiBzdHJpbmcge1xuICBpZiAoIXRWaWV3LnNzcklkKSB7XG4gICAgdFZpZXcuc3NySWQgPSBgdCR7dFZpZXdTc3JJZCsrfWA7XG4gIH1cbiAgcmV0dXJuIHRWaWV3LnNzcklkO1xufVxuXG4vKipcbiAqIERlc2NyaWJlcyBhIGNvbnRleHQgYXZhaWxhYmxlIGR1cmluZyB0aGUgc2VyaWFsaXphdGlvblxuICogcHJvY2Vzcy4gVGhlIGNvbnRleHQgaXMgdXNlZCB0byBzaGFyZSBhbmQgY29sbGVjdCBpbmZvcm1hdGlvblxuICogZHVyaW5nIHRoZSBzZXJpYWxpemF0aW9uLlxuICovXG5pbnRlcmZhY2UgSHlkcmF0aW9uQ29udGV4dCB7XG4gIHNlcmlhbGl6ZWRWaWV3Q29sbGVjdGlvbjogU2VyaWFsaXplZFZpZXdDb2xsZWN0aW9uO1xuICBjb3JydXB0ZWRUZXh0Tm9kZXM6IE1hcDxIVE1MRWxlbWVudCwgVGV4dE5vZGVNYXJrZXI+O1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSBudW1iZXIgb2Ygcm9vdCBub2RlcyBpbiBhIGdpdmVuIHZpZXdcbiAqIChvciBjaGlsZCBub2RlcyBpbiBhIGdpdmVuIGNvbnRhaW5lciBpZiBhIHROb2RlIGlzIHByb3ZpZGVkKS5cbiAqL1xuZnVuY3Rpb24gY2FsY051bVJvb3ROb2Rlcyh0VmlldzogVFZpZXcsIGxWaWV3OiBMVmlldywgdE5vZGU6IFROb2RlfG51bGwpOiBudW1iZXIge1xuICBjb25zdCByb290Tm9kZXM6IHVua25vd25bXSA9IFtdO1xuICBjb2xsZWN0TmF0aXZlTm9kZXModFZpZXcsIGxWaWV3LCB0Tm9kZSwgcm9vdE5vZGVzKTtcbiAgcmV0dXJuIHJvb3ROb2Rlcy5sZW5ndGg7XG59XG5cbi8qKlxuICogQ29tcHV0ZXMgdGhlIG51bWJlciBvZiByb290IG5vZGVzIGluIGFsbCB2aWV3cyBpbiBhIGdpdmVuIExDb250YWluZXIuXG4gKi9cbmZ1bmN0aW9uIGNhbGNOdW1Sb290Tm9kZXNJbkxDb250YWluZXIobENvbnRhaW5lcjogTENvbnRhaW5lcik6IG51bWJlciB7XG4gIGNvbnN0IHJvb3ROb2RlczogdW5rbm93bltdID0gW107XG4gIGNvbGxlY3ROYXRpdmVOb2Rlc0luTENvbnRhaW5lcihsQ29udGFpbmVyLCByb290Tm9kZXMpO1xuICByZXR1cm4gcm9vdE5vZGVzLmxlbmd0aDtcbn1cblxuXG4vKipcbiAqIEFubm90YXRlcyByb290IGxldmVsIGNvbXBvbmVudCdzIExWaWV3IGZvciBoeWRyYXRpb24sXG4gKiBzZWUgYGFubm90YXRlSG9zdEVsZW1lbnRGb3JIeWRyYXRpb25gIGZvciBhZGRpdGlvbmFsIGluZm9ybWF0aW9uLlxuICovXG5mdW5jdGlvbiBhbm5vdGF0ZUNvbXBvbmVudExWaWV3Rm9ySHlkcmF0aW9uKGxWaWV3OiBMVmlldywgY29udGV4dDogSHlkcmF0aW9uQ29udGV4dCk6IG51bWJlcnxudWxsIHtcbiAgY29uc3QgaG9zdEVsZW1lbnQgPSBsVmlld1tIT1NUXTtcbiAgLy8gUm9vdCBlbGVtZW50cyBtaWdodCBhbHNvIGJlIGFubm90YXRlZCB3aXRoIHRoZSBgbmdTa2lwSHlkcmF0aW9uYCBhdHRyaWJ1dGUsXG4gIC8vIGNoZWNrIGlmIGl0J3MgcHJlc2VudCBiZWZvcmUgc3RhcnRpbmcgdGhlIHNlcmlhbGl6YXRpb24gcHJvY2Vzcy5cbiAgaWYgKGhvc3RFbGVtZW50ICYmICEoaG9zdEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQpLmhhc0F0dHJpYnV0ZShTS0lQX0hZRFJBVElPTl9BVFRSX05BTUUpKSB7XG4gICAgcmV0dXJuIGFubm90YXRlSG9zdEVsZW1lbnRGb3JIeWRyYXRpb24oaG9zdEVsZW1lbnQgYXMgSFRNTEVsZW1lbnQsIGxWaWV3LCBjb250ZXh0KTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn1cblxuLyoqXG4gKiBBbm5vdGF0ZXMgcm9vdCBsZXZlbCBMQ29udGFpbmVyIGZvciBoeWRyYXRpb24uIFRoaXMgaGFwcGVucyB3aGVuIGEgcm9vdCBjb21wb25lbnRcbiAqIGluamVjdHMgVmlld0NvbnRhaW5lclJlZiwgdGh1cyBtYWtpbmcgdGhlIGNvbXBvbmVudCBhbiBhbmNob3IgZm9yIGEgdmlldyBjb250YWluZXIuXG4gKiBUaGlzIGZ1bmN0aW9uIHNlcmlhbGl6ZXMgdGhlIGNvbXBvbmVudCBpdHNlbGYgYXMgd2VsbCBhcyBhbGwgdmlld3MgZnJvbSB0aGUgdmlld1xuICogY29udGFpbmVyLlxuICovXG5mdW5jdGlvbiBhbm5vdGF0ZUxDb250YWluZXJGb3JIeWRyYXRpb24obENvbnRhaW5lcjogTENvbnRhaW5lciwgY29udGV4dDogSHlkcmF0aW9uQ29udGV4dCkge1xuICBjb25zdCBjb21wb25lbnRMVmlldyA9IHVud3JhcExWaWV3KGxDb250YWluZXJbSE9TVF0pIGFzIExWaWV3PHVua25vd24+O1xuXG4gIC8vIFNlcmlhbGl6ZSB0aGUgcm9vdCBjb21wb25lbnQgaXRzZWxmLlxuICBjb25zdCBjb21wb25lbnRMVmlld05naEluZGV4ID0gYW5ub3RhdGVDb21wb25lbnRMVmlld0Zvckh5ZHJhdGlvbihjb21wb25lbnRMVmlldywgY29udGV4dCk7XG5cbiAgY29uc3QgaG9zdEVsZW1lbnQgPSB1bndyYXBSTm9kZShjb21wb25lbnRMVmlld1tIT1NUXSEpIGFzIEhUTUxFbGVtZW50O1xuXG4gIC8vIFNlcmlhbGl6ZSBhbGwgdmlld3Mgd2l0aGluIHRoaXMgdmlldyBjb250YWluZXIuXG4gIGNvbnN0IHJvb3RMVmlldyA9IGxDb250YWluZXJbUEFSRU5UXTtcbiAgY29uc3Qgcm9vdExWaWV3TmdoSW5kZXggPSBhbm5vdGF0ZUhvc3RFbGVtZW50Rm9ySHlkcmF0aW9uKGhvc3RFbGVtZW50LCByb290TFZpZXcsIGNvbnRleHQpO1xuXG4gIGNvbnN0IHJlbmRlcmVyID0gY29tcG9uZW50TFZpZXdbUkVOREVSRVJdIGFzIFJlbmRlcmVyMjtcblxuICAvLyBGb3IgY2FzZXMgd2hlbiBhIHJvb3QgY29tcG9uZW50IGFsc28gYWN0cyBhcyBhbiBhbmNob3Igbm9kZSBmb3IgYSBWaWV3Q29udGFpbmVyUmVmXG4gIC8vIChmb3IgZXhhbXBsZSwgd2hlbiBWaWV3Q29udGFpbmVyUmVmIGlzIGluamVjdGVkIGluIGEgcm9vdCBjb21wb25lbnQpLCB0aGVyZSBpcyBhIG5lZWRcbiAgLy8gdG8gc2VyaWFsaXplIGluZm9ybWF0aW9uIGFib3V0IHRoZSBjb21wb25lbnQgaXRzZWxmLCBhcyB3ZWxsIGFzIGFuIExDb250YWluZXIgdGhhdFxuICAvLyByZXByZXNlbnRzIHRoaXMgVmlld0NvbnRhaW5lclJlZi4gRWZmZWN0aXZlbHksIHdlIG5lZWQgdG8gc2VyaWFsaXplIDIgcGllY2VzIG9mIGluZm86XG4gIC8vICgxKSBoeWRyYXRpb24gaW5mbyBmb3IgdGhlIHJvb3QgY29tcG9uZW50IGl0c2VsZiBhbmQgKDIpIGh5ZHJhdGlvbiBpbmZvIGZvciB0aGVcbiAgLy8gVmlld0NvbnRhaW5lclJlZiBpbnN0YW5jZSAoYW4gTENvbnRhaW5lcikuIEVhY2ggcGllY2Ugb2YgaW5mb3JtYXRpb24gaXMgaW5jbHVkZWQgaW50b1xuICAvLyB0aGUgaHlkcmF0aW9uIGRhdGEgKGluIHRoZSBUcmFuc2ZlclN0YXRlIG9iamVjdCkgc2VwYXJhdGVseSwgdGh1cyB3ZSBlbmQgdXAgd2l0aCAyIGlkcy5cbiAgLy8gU2luY2Ugd2Ugb25seSBoYXZlIDEgcm9vdCBlbGVtZW50LCB3ZSBlbmNvZGUgYm90aCBiaXRzIG9mIGluZm8gaW50byBhIHNpbmdsZSBzdHJpbmc6XG4gIC8vIGlkcyBhcmUgc2VwYXJhdGVkIGJ5IHRoZSBgfGAgY2hhciAoZS5nLiBgMTB8MjVgLCB3aGVyZSBgMTBgIGlzIHRoZSBuZ2ggZm9yIGEgY29tcG9uZW50IHZpZXdcbiAgLy8gYW5kIDI1IGlzIHRoZSBgbmdoYCBmb3IgYSByb290IHZpZXcgd2hpY2ggaG9sZHMgTENvbnRhaW5lcikuXG4gIGNvbnN0IGZpbmFsSW5kZXggPSBgJHtjb21wb25lbnRMVmlld05naEluZGV4fXwke3Jvb3RMVmlld05naEluZGV4fWA7XG4gIHJlbmRlcmVyLnNldEF0dHJpYnV0ZShob3N0RWxlbWVudCwgTkdIX0FUVFJfTkFNRSwgZmluYWxJbmRleCk7XG59XG5cbi8qKlxuICogQW5ub3RhdGVzIGFsbCBjb21wb25lbnRzIGJvb3RzdHJhcHBlZCBpbiBhIGdpdmVuIEFwcGxpY2F0aW9uUmVmXG4gKiB3aXRoIGluZm8gbmVlZGVkIGZvciBoeWRyYXRpb24uXG4gKlxuICogQHBhcmFtIGFwcFJlZiBBbiBpbnN0YW5jZSBvZiBhbiBBcHBsaWNhdGlvblJlZi5cbiAqIEBwYXJhbSBkb2MgQSByZWZlcmVuY2UgdG8gdGhlIGN1cnJlbnQgRG9jdW1lbnQgaW5zdGFuY2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhbm5vdGF0ZUZvckh5ZHJhdGlvbihhcHBSZWY6IEFwcGxpY2F0aW9uUmVmLCBkb2M6IERvY3VtZW50KSB7XG4gIGNvbnN0IHNlcmlhbGl6ZWRWaWV3Q29sbGVjdGlvbiA9IG5ldyBTZXJpYWxpemVkVmlld0NvbGxlY3Rpb24oKTtcbiAgY29uc3QgY29ycnVwdGVkVGV4dE5vZGVzID0gbmV3IE1hcDxIVE1MRWxlbWVudCwgVGV4dE5vZGVNYXJrZXI+KCk7XG4gIGNvbnN0IHZpZXdSZWZzID0gYXBwUmVmLl92aWV3cztcbiAgZm9yIChjb25zdCB2aWV3UmVmIG9mIHZpZXdSZWZzKSB7XG4gICAgY29uc3QgbE5vZGUgPSBnZXRMTm9kZUZvckh5ZHJhdGlvbih2aWV3UmVmKTtcblxuICAgIC8vIEFuIGBsVmlld2AgbWlnaHQgYmUgYG51bGxgIGlmIGEgYFZpZXdSZWZgIHJlcHJlc2VudHNcbiAgICAvLyBhbiBlbWJlZGRlZCB2aWV3IChub3QgYSBjb21wb25lbnQgdmlldykuXG4gICAgaWYgKGxOb2RlICE9PSBudWxsKSB7XG4gICAgICBjb25zdCBjb250ZXh0OiBIeWRyYXRpb25Db250ZXh0ID0ge1xuICAgICAgICBzZXJpYWxpemVkVmlld0NvbGxlY3Rpb24sXG4gICAgICAgIGNvcnJ1cHRlZFRleHROb2RlcyxcbiAgICAgIH07XG4gICAgICBpZiAoaXNMQ29udGFpbmVyKGxOb2RlKSkge1xuICAgICAgICBhbm5vdGF0ZUxDb250YWluZXJGb3JIeWRyYXRpb24obE5vZGUsIGNvbnRleHQpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgYW5ub3RhdGVDb21wb25lbnRMVmlld0Zvckh5ZHJhdGlvbihsTm9kZSwgY29udGV4dCk7XG4gICAgICB9XG4gICAgICBpbnNlcnRDb3JydXB0ZWRUZXh0Tm9kZU1hcmtlcnMoY29ycnVwdGVkVGV4dE5vZGVzLCBkb2MpO1xuICAgIH1cbiAgfVxuXG4gIC8vIE5vdGU6IHdlICphbHdheXMqIGluY2x1ZGUgaHlkcmF0aW9uIGluZm8ga2V5IGFuZCBhIGNvcnJlc3BvbmRpbmcgdmFsdWVcbiAgLy8gaW50byB0aGUgVHJhbnNmZXJTdGF0ZSwgZXZlbiBpZiB0aGUgbGlzdCBvZiBzZXJpYWxpemVkIHZpZXdzIGlzIGVtcHR5LlxuICAvLyBUaGlzIGlzIG5lZWRlZCBhcyBhIHNpZ25hbCB0byB0aGUgY2xpZW50IHRoYXQgdGhlIHNlcnZlciBwYXJ0IG9mIHRoZVxuICAvLyBoeWRyYXRpb24gbG9naWMgd2FzIHNldHVwIGFuZCBlbmFibGVkIGNvcnJlY3RseS4gT3RoZXJ3aXNlLCBpZiBhIGNsaWVudFxuICAvLyBoeWRyYXRpb24gZG9lc24ndCBmaW5kIGEga2V5IGluIHRoZSB0cmFuc2ZlciBzdGF0ZSAtIGFuIGVycm9yIGlzIHByb2R1Y2VkLlxuICBjb25zdCBzZXJpYWxpemVkVmlld3MgPSBzZXJpYWxpemVkVmlld0NvbGxlY3Rpb24uZ2V0QWxsKCk7XG4gIGNvbnN0IHRyYW5zZmVyU3RhdGUgPSBhcHBSZWYuaW5qZWN0b3IuZ2V0KFRyYW5zZmVyU3RhdGUpO1xuICB0cmFuc2ZlclN0YXRlLnNldChOR0hfREFUQV9LRVksIHNlcmlhbGl6ZWRWaWV3cyk7XG59XG5cbi8qKlxuICogU2VyaWFsaXplcyB0aGUgbENvbnRhaW5lciBkYXRhIGludG8gYSBsaXN0IG9mIFNlcmlhbGl6ZWRWaWV3IG9iamVjdHMsXG4gKiB0aGF0IHJlcHJlc2VudCB2aWV3cyB3aXRoaW4gdGhpcyBsQ29udGFpbmVyLlxuICpcbiAqIEBwYXJhbSBsQ29udGFpbmVyIHRoZSBsQ29udGFpbmVyIHdlIGFyZSBzZXJpYWxpemluZ1xuICogQHBhcmFtIGNvbnRleHQgdGhlIGh5ZHJhdGlvbiBjb250ZXh0XG4gKiBAcmV0dXJucyBhbiBhcnJheSBvZiB0aGUgYFNlcmlhbGl6ZWRWaWV3YCBvYmplY3RzXG4gKi9cbmZ1bmN0aW9uIHNlcmlhbGl6ZUxDb250YWluZXIoXG4gICAgbENvbnRhaW5lcjogTENvbnRhaW5lciwgY29udGV4dDogSHlkcmF0aW9uQ29udGV4dCk6IFNlcmlhbGl6ZWRDb250YWluZXJWaWV3W10ge1xuICBjb25zdCB2aWV3czogU2VyaWFsaXplZENvbnRhaW5lclZpZXdbXSA9IFtdO1xuICBsZXQgbGFzdFZpZXdBc1N0cmluZyA9ICcnO1xuXG4gIGZvciAobGV0IGkgPSBDT05UQUlORVJfSEVBREVSX09GRlNFVDsgaSA8IGxDb250YWluZXIubGVuZ3RoOyBpKyspIHtcbiAgICBsZXQgY2hpbGRMVmlldyA9IGxDb250YWluZXJbaV0gYXMgTFZpZXc7XG5cbiAgICBsZXQgdGVtcGxhdGU6IHN0cmluZztcbiAgICBsZXQgbnVtUm9vdE5vZGVzOiBudW1iZXI7XG4gICAgbGV0IHNlcmlhbGl6ZWRWaWV3OiBTZXJpYWxpemVkQ29udGFpbmVyVmlld3x1bmRlZmluZWQ7XG5cbiAgICBpZiAoaXNSb290VmlldyhjaGlsZExWaWV3KSkge1xuICAgICAgLy8gSWYgdGhpcyBpcyBhIHJvb3QgdmlldywgZ2V0IGFuIExWaWV3IGZvciB0aGUgdW5kZXJseWluZyBjb21wb25lbnQsXG4gICAgICAvLyBiZWNhdXNlIGl0IGNvbnRhaW5zIGluZm9ybWF0aW9uIGFib3V0IHRoZSB2aWV3IHRvIHNlcmlhbGl6ZS5cbiAgICAgIGNoaWxkTFZpZXcgPSBjaGlsZExWaWV3W0hFQURFUl9PRkZTRVRdO1xuXG4gICAgICAvLyBJZiB3ZSBoYXZlIGFuIExDb250YWluZXIgYXQgdGhpcyBwb3NpdGlvbiwgdGhpcyBpbmRpY2F0ZXMgdGhhdCB0aGVcbiAgICAgIC8vIGhvc3QgZWxlbWVudCB3YXMgdXNlZCBhcyBhIFZpZXdDb250YWluZXJSZWYgYW5jaG9yIChlLmcuIGEgYFZpZXdDb250YWluZXJSZWZgXG4gICAgICAvLyB3YXMgaW5qZWN0ZWQgd2l0aGluIHRoZSBjb21wb25lbnQgY2xhc3MpLiBUaGlzIGNhc2UgcmVxdWlyZXMgc3BlY2lhbCBoYW5kbGluZy5cbiAgICAgIGlmIChpc0xDb250YWluZXIoY2hpbGRMVmlldykpIHtcbiAgICAgICAgLy8gQ2FsY3VsYXRlIHRoZSBudW1iZXIgb2Ygcm9vdCBub2RlcyBpbiBhbGwgdmlld3MgaW4gYSBnaXZlbiBjb250YWluZXJcbiAgICAgICAgLy8gYW5kIGluY3JlbWVudCBieSBvbmUgdG8gYWNjb3VudCBmb3IgYW4gYW5jaG9yIG5vZGUgaXRzZWxmLCBpLmUuIGluIHRoaXNcbiAgICAgICAgLy8gc2NlbmFyaW8gd2UnbGwgaGF2ZSBhIGxheW91dCB0aGF0IHdvdWxkIGxvb2sgbGlrZSB0aGlzOlxuICAgICAgICAvLyBgPGFwcC1yb290IC8+PCNWSUVXMT48I1ZJRVcyPi4uLjwhLS1jb250YWluZXItLT5gXG4gICAgICAgIC8vIFRoZSBgKzFgIGlzIHRvIGNhcHR1cmUgdGhlIGA8YXBwLXJvb3QgLz5gIGVsZW1lbnQuXG4gICAgICAgIG51bVJvb3ROb2RlcyA9IGNhbGNOdW1Sb290Tm9kZXNJbkxDb250YWluZXIoY2hpbGRMVmlldykgKyAxO1xuXG4gICAgICAgIGFubm90YXRlTENvbnRhaW5lckZvckh5ZHJhdGlvbihjaGlsZExWaWV3LCBjb250ZXh0KTtcblxuICAgICAgICBjb25zdCBjb21wb25lbnRMVmlldyA9IHVud3JhcExWaWV3KGNoaWxkTFZpZXdbSE9TVF0pIGFzIExWaWV3PHVua25vd24+O1xuXG4gICAgICAgIHNlcmlhbGl6ZWRWaWV3ID0ge1xuICAgICAgICAgIFtURU1QTEFURV9JRF06IGNvbXBvbmVudExWaWV3W1RWSUVXXS5zc3JJZCEsXG4gICAgICAgICAgW05VTV9ST09UX05PREVTXTogbnVtUm9vdE5vZGVzLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghc2VyaWFsaXplZFZpZXcpIHtcbiAgICAgIGNvbnN0IGNoaWxkVFZpZXcgPSBjaGlsZExWaWV3W1RWSUVXXTtcblxuICAgICAgaWYgKGNoaWxkVFZpZXcudHlwZSA9PT0gVFZpZXdUeXBlLkNvbXBvbmVudCkge1xuICAgICAgICB0ZW1wbGF0ZSA9IGNoaWxkVFZpZXcuc3NySWQhO1xuXG4gICAgICAgIC8vIFRoaXMgaXMgYSBjb21wb25lbnQgdmlldywgdGh1cyBpdCBoYXMgb25seSAxIHJvb3Qgbm9kZTogdGhlIGNvbXBvbmVudFxuICAgICAgICAvLyBob3N0IG5vZGUgaXRzZWxmIChvdGhlciBub2RlcyB3b3VsZCBiZSBpbnNpZGUgdGhhdCBob3N0IG5vZGUpLlxuICAgICAgICBudW1Sb290Tm9kZXMgPSAxO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGVtcGxhdGUgPSBnZXRTc3JJZChjaGlsZFRWaWV3KTtcbiAgICAgICAgbnVtUm9vdE5vZGVzID0gY2FsY051bVJvb3ROb2RlcyhjaGlsZFRWaWV3LCBjaGlsZExWaWV3LCBjaGlsZFRWaWV3LmZpcnN0Q2hpbGQpO1xuICAgICAgfVxuXG4gICAgICBzZXJpYWxpemVkVmlldyA9IHtcbiAgICAgICAgW1RFTVBMQVRFX0lEXTogdGVtcGxhdGUsXG4gICAgICAgIFtOVU1fUk9PVF9OT0RFU106IG51bVJvb3ROb2RlcyxcbiAgICAgICAgLi4uc2VyaWFsaXplTFZpZXcobENvbnRhaW5lcltpXSBhcyBMVmlldywgY29udGV4dCksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHRoZSBwcmV2aW91cyB2aWV3IGhhcyB0aGUgc2FtZSBzaGFwZSAoZm9yIGV4YW1wbGUsIGl0IHdhc1xuICAgIC8vIHByb2R1Y2VkIGJ5IHRoZSAqbmdGb3IpLCBpbiB3aGljaCBjYXNlIGJ1bXAgdGhlIGNvdW50ZXIgb24gdGhlIHByZXZpb3VzXG4gICAgLy8gdmlldyBpbnN0ZWFkIG9mIGluY2x1ZGluZyB0aGUgc2FtZSBpbmZvcm1hdGlvbiBhZ2Fpbi5cbiAgICBjb25zdCBjdXJyZW50Vmlld0FzU3RyaW5nID0gSlNPTi5zdHJpbmdpZnkoc2VyaWFsaXplZFZpZXcpO1xuICAgIGlmICh2aWV3cy5sZW5ndGggPiAwICYmIGN1cnJlbnRWaWV3QXNTdHJpbmcgPT09IGxhc3RWaWV3QXNTdHJpbmcpIHtcbiAgICAgIGNvbnN0IHByZXZpb3VzVmlldyA9IHZpZXdzW3ZpZXdzLmxlbmd0aCAtIDFdO1xuICAgICAgcHJldmlvdXNWaWV3W01VTFRJUExJRVJdID8/PSAxO1xuICAgICAgcHJldmlvdXNWaWV3W01VTFRJUExJRVJdKys7XG4gICAgfSBlbHNlIHtcbiAgICAgIC8vIFJlY29yZCB0aGlzIHZpZXcgYXMgbW9zdCByZWNlbnRseSBhZGRlZC5cbiAgICAgIGxhc3RWaWV3QXNTdHJpbmcgPSBjdXJyZW50Vmlld0FzU3RyaW5nO1xuICAgICAgdmlld3MucHVzaChzZXJpYWxpemVkVmlldyk7XG4gICAgfVxuICB9XG4gIHJldHVybiB2aWV3cztcbn1cblxuLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gcHJvZHVjZSBhIG5vZGUgcGF0aCAod2hpY2ggbmF2aWdhdGlvbiBzdGVwcyBydW50aW1lIGxvZ2ljXG4gKiBuZWVkcyB0byB0YWtlIHRvIGxvY2F0ZSBhIG5vZGUpIGFuZCBzdG9yZXMgaXQgaW4gdGhlIGBOT0RFU2Agc2VjdGlvbiBvZiB0aGVcbiAqIGN1cnJlbnQgc2VyaWFsaXplZCB2aWV3LlxuICovXG5mdW5jdGlvbiBhcHBlbmRTZXJpYWxpemVkTm9kZVBhdGgobmdoOiBTZXJpYWxpemVkVmlldywgdE5vZGU6IFROb2RlLCBsVmlldzogTFZpZXcpIHtcbiAgY29uc3Qgbm9PZmZzZXRJbmRleCA9IHROb2RlLmluZGV4IC0gSEVBREVSX09GRlNFVDtcbiAgbmdoW05PREVTXSA/Pz0ge307XG4gIG5naFtOT0RFU11bbm9PZmZzZXRJbmRleF0gPSBjYWxjUGF0aEZvck5vZGUodE5vZGUsIGxWaWV3KTtcbn1cblxuLyoqXG4gKiBIZWxwZXIgZnVuY3Rpb24gdG8gYXBwZW5kIGluZm9ybWF0aW9uIGFib3V0IGEgZGlzY29ubmVjdGVkIG5vZGUuXG4gKiBUaGlzIGluZm8gaXMgbmVlZGVkIGF0IHJ1bnRpbWUgdG8gYXZvaWQgRE9NIGxvb2t1cHMgZm9yIHRoaXMgZWxlbWVudFxuICogYW5kIGluc3RlYWQsIHRoZSBlbGVtZW50IHdvdWxkIGJlIGNyZWF0ZWQgZnJvbSBzY3JhdGNoLlxuICovXG5mdW5jdGlvbiBhcHBlbmREaXNjb25uZWN0ZWROb2RlSW5kZXgobmdoOiBTZXJpYWxpemVkVmlldywgdE5vZGU6IFROb2RlKSB7XG4gIGNvbnN0IG5vT2Zmc2V0SW5kZXggPSB0Tm9kZS5pbmRleCAtIEhFQURFUl9PRkZTRVQ7XG4gIG5naFtESVNDT05ORUNURURfTk9ERVNdID8/PSBbXTtcbiAgaWYgKCFuZ2hbRElTQ09OTkVDVEVEX05PREVTXS5pbmNsdWRlcyhub09mZnNldEluZGV4KSkge1xuICAgIG5naFtESVNDT05ORUNURURfTk9ERVNdLnB1c2gobm9PZmZzZXRJbmRleCk7XG4gIH1cbn1cblxuLyoqXG4gKiBTZXJpYWxpemVzIHRoZSBsVmlldyBkYXRhIGludG8gYSBTZXJpYWxpemVkVmlldyBvYmplY3QgdGhhdCB3aWxsIGxhdGVyIGJlIGFkZGVkXG4gKiB0byB0aGUgVHJhbnNmZXJTdGF0ZSBzdG9yYWdlIGFuZCByZWZlcmVuY2VkIHVzaW5nIHRoZSBgbmdoYCBhdHRyaWJ1dGUgb24gYSBob3N0XG4gKiBlbGVtZW50LlxuICpcbiAqIEBwYXJhbSBsVmlldyB0aGUgbFZpZXcgd2UgYXJlIHNlcmlhbGl6aW5nXG4gKiBAcGFyYW0gY29udGV4dCB0aGUgaHlkcmF0aW9uIGNvbnRleHRcbiAqIEByZXR1cm5zIHRoZSBgU2VyaWFsaXplZFZpZXdgIG9iamVjdCBjb250YWluaW5nIHRoZSBkYXRhIHRvIGJlIGFkZGVkIHRvIHRoZSBob3N0IG5vZGVcbiAqL1xuZnVuY3Rpb24gc2VyaWFsaXplTFZpZXcobFZpZXc6IExWaWV3LCBjb250ZXh0OiBIeWRyYXRpb25Db250ZXh0KTogU2VyaWFsaXplZFZpZXcge1xuICBjb25zdCBuZ2g6IFNlcmlhbGl6ZWRWaWV3ID0ge307XG4gIGNvbnN0IHRWaWV3ID0gbFZpZXdbVFZJRVddO1xuICAvLyBJdGVyYXRlIG92ZXIgRE9NIGVsZW1lbnQgcmVmZXJlbmNlcyBpbiBhbiBMVmlldy5cbiAgZm9yIChsZXQgaSA9IEhFQURFUl9PRkZTRVQ7IGkgPCB0Vmlldy5iaW5kaW5nU3RhcnRJbmRleDsgaSsrKSB7XG4gICAgY29uc3QgdE5vZGUgPSB0Vmlldy5kYXRhW2ldIGFzIFROb2RlO1xuICAgIGNvbnN0IG5vT2Zmc2V0SW5kZXggPSBpIC0gSEVBREVSX09GRlNFVDtcbiAgICAvLyBTa2lwIHByb2Nlc3Npbmcgb2YgYSBnaXZlbiBzbG90IGluIHRoZSBmb2xsb3dpbmcgY2FzZXM6XG4gICAgLy8gLSBMb2NhbCByZWZzIChlLmcuIDxkaXYgI2xvY2FsUmVmPikgdGFrZSB1cCBhbiBleHRyYSBzbG90IGluIExWaWV3c1xuICAgIC8vICAgdG8gc3RvcmUgdGhlIHNhbWUgZWxlbWVudC4gSW4gdGhpcyBjYXNlLCB0aGVyZSBpcyBubyBpbmZvcm1hdGlvbiBpblxuICAgIC8vICAgYSBjb3JyZXNwb25kaW5nIHNsb3QgaW4gVE5vZGUgZGF0YSBzdHJ1Y3R1cmUuXG4gICAgLy8gLSBXaGVuIGEgc2xvdCBjb250YWlucyBzb21ldGhpbmcgb3RoZXIgdGhhbiBhIFROb2RlLiBGb3IgZXhhbXBsZSwgdGhlcmVcbiAgICAvLyAgIG1pZ2h0IGJlIHNvbWUgbWV0YWRhdGEgaW5mb3JtYXRpb24gYWJvdXQgYSBkZWZlciBibG9jayBvciBhIGNvbnRyb2wgZmxvdyBibG9jay5cbiAgICBpZiAoIWlzVE5vZGVTaGFwZSh0Tm9kZSkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIGEgbmF0aXZlIG5vZGUgdGhhdCByZXByZXNlbnRzIGEgZ2l2ZW4gVE5vZGUgaXMgZGlzY29ubmVjdGVkIGZyb20gdGhlIERPTSB0cmVlLlxuICAgIC8vIFN1Y2ggbm9kZXMgbXVzdCBiZSBleGNsdWRlZCBmcm9tIHRoZSBoeWRyYXRpb24gKHNpbmNlIHRoZSBoeWRyYXRpb24gd29uJ3QgYmUgYWJsZSB0b1xuICAgIC8vIGZpbmQgdGhlbSksIHNvIHRoZSBUTm9kZSBpZHMgYXJlIGNvbGxlY3RlZCBhbmQgdXNlZCBhdCBydW50aW1lIHRvIHNraXAgdGhlIGh5ZHJhdGlvbi5cbiAgICAvL1xuICAgIC8vIFRoaXMgc2l0dWF0aW9uIG1heSBoYXBwZW4gZHVyaW5nIHRoZSBjb250ZW50IHByb2plY3Rpb24sIHdoZW4gc29tZSBub2RlcyBkb24ndCBtYWtlIGl0XG4gICAgLy8gaW50byBvbmUgb2YgdGhlIGNvbnRlbnQgcHJvamVjdGlvbiBzbG90cyAoZm9yIGV4YW1wbGUsIHdoZW4gdGhlcmUgaXMgbm8gZGVmYXVsdFxuICAgIC8vIDxuZy1jb250ZW50IC8+IHNsb3QgaW4gcHJvamVjdG9yIGNvbXBvbmVudCdzIHRlbXBsYXRlKS5cbiAgICBpZiAoaXNEaXNjb25uZWN0ZWROb2RlKHROb2RlLCBsVmlldykgJiYgaXNDb250ZW50UHJvamVjdGVkTm9kZSh0Tm9kZSkpIHtcbiAgICAgIGFwcGVuZERpc2Nvbm5lY3RlZE5vZGVJbmRleChuZ2gsIHROb2RlKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheSh0Tm9kZS5wcm9qZWN0aW9uKSkge1xuICAgICAgZm9yIChjb25zdCBwcm9qZWN0aW9uSGVhZFROb2RlIG9mIHROb2RlLnByb2plY3Rpb24pIHtcbiAgICAgICAgLy8gV2UgbWF5IGhhdmUgYG51bGxgcyBpbiBzbG90cyB3aXRoIG5vIHByb2plY3RlZCBjb250ZW50LlxuICAgICAgICBpZiAoIXByb2plY3Rpb25IZWFkVE5vZGUpIGNvbnRpbnVlO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm9qZWN0aW9uSGVhZFROb2RlKSkge1xuICAgICAgICAgIC8vIElmIHdlIHByb2Nlc3MgcmUtcHJvamVjdGVkIGNvbnRlbnQgKGkuZS4gYDxuZy1jb250ZW50PmBcbiAgICAgICAgICAvLyBhcHBlYXJzIGF0IHByb2plY3Rpb24gbG9jYXRpb24pLCBza2lwIGFubm90YXRpb25zIGZvciB0aGlzIGNvbnRlbnRcbiAgICAgICAgICAvLyBzaW5jZSBhbGwgRE9NIG5vZGVzIGluIHRoaXMgcHJvamVjdGlvbiB3ZXJlIGhhbmRsZWQgd2hpbGUgcHJvY2Vzc2luZ1xuICAgICAgICAgIC8vIGEgcGFyZW50IGxWaWV3LCB3aGljaCBjb250YWlucyB0aG9zZSBub2Rlcy5cbiAgICAgICAgICBpZiAoIWlzUHJvamVjdGlvblROb2RlKHByb2plY3Rpb25IZWFkVE5vZGUpICYmXG4gICAgICAgICAgICAgICFpc0luU2tpcEh5ZHJhdGlvbkJsb2NrKHByb2plY3Rpb25IZWFkVE5vZGUpKSB7XG4gICAgICAgICAgICBpZiAoaXNEaXNjb25uZWN0ZWROb2RlKHByb2plY3Rpb25IZWFkVE5vZGUsIGxWaWV3KSkge1xuICAgICAgICAgICAgICAvLyBDaGVjayB3aGV0aGVyIHRoaXMgbm9kZSBpcyBjb25uZWN0ZWQsIHNpbmNlIHdlIG1heSBoYXZlIGEgVE5vZGVcbiAgICAgICAgICAgICAgLy8gaW4gdGhlIGRhdGEgc3RydWN0dXJlIGFzIGEgcHJvamVjdGlvbiBzZWdtZW50IGhlYWQsIGJ1dCB0aGVcbiAgICAgICAgICAgICAgLy8gY29udGVudCBwcm9qZWN0aW9uIHNsb3QgbWlnaHQgYmUgZGlzYWJsZWQgKGUuZy5cbiAgICAgICAgICAgICAgLy8gPG5nLWNvbnRlbnQgKm5nSWY9XCJmYWxzZVwiIC8+KS5cbiAgICAgICAgICAgICAgYXBwZW5kRGlzY29ubmVjdGVkTm9kZUluZGV4KG5naCwgcHJvamVjdGlvbkhlYWRUTm9kZSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBhcHBlbmRTZXJpYWxpemVkTm9kZVBhdGgobmdoLCBwcm9qZWN0aW9uSGVhZFROb2RlLCBsVmlldyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIElmIGEgdmFsdWUgaXMgYW4gYXJyYXksIGl0IG1lYW5zIHRoYXQgd2UgYXJlIHByb2Nlc3NpbmcgYSBwcm9qZWN0aW9uXG4gICAgICAgICAgLy8gd2hlcmUgcHJvamVjdGFibGUgbm9kZXMgd2VyZSBwYXNzZWQgaW4gYXMgRE9NIG5vZGVzIChmb3IgZXhhbXBsZSwgd2hlblxuICAgICAgICAgIC8vIGNhbGxpbmcgYFZpZXdDb250YWluZXJSZWYuY3JlYXRlQ29tcG9uZW50KENtcEEsIHtwcm9qZWN0YWJsZU5vZGVzOiBbLi4uXX0pYCkuXG4gICAgICAgICAgLy9cbiAgICAgICAgICAvLyBJbiB0aGlzIHNjZW5hcmlvLCBub2RlcyBjYW4gY29tZSBmcm9tIGFueXdoZXJlIChlaXRoZXIgY3JlYXRlZCBtYW51YWxseSxcbiAgICAgICAgICAvLyBhY2Nlc3NlZCB2aWEgYGRvY3VtZW50LnF1ZXJ5U2VsZWN0b3JgLCBldGMpIGFuZCBtYXkgYmUgaW4gYW55IHN0YXRlXG4gICAgICAgICAgLy8gKGF0dGFjaGVkIG9yIGRldGFjaGVkIGZyb20gdGhlIERPTSB0cmVlKS4gQXMgYSByZXN1bHQsIHdlIGNhbiBub3QgcmVsaWFibHlcbiAgICAgICAgICAvLyByZXN0b3JlIHRoZSBzdGF0ZSBmb3Igc3VjaCBjYXNlcyBkdXJpbmcgaHlkcmF0aW9uLlxuXG4gICAgICAgICAgdGhyb3cgdW5zdXBwb3J0ZWRQcm9qZWN0aW9uT2ZEb21Ob2Rlcyh1bndyYXBSTm9kZShsVmlld1tpXSkpO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uZGl0aW9uYWxseUFubm90YXRlTm9kZVBhdGgobmdoLCB0Tm9kZSwgbFZpZXcpO1xuXG4gICAgaWYgKGlzTENvbnRhaW5lcihsVmlld1tpXSkpIHtcbiAgICAgIC8vIFNlcmlhbGl6ZSBpbmZvcm1hdGlvbiBhYm91dCBhIHRlbXBsYXRlLlxuICAgICAgY29uc3QgZW1iZWRkZWRUVmlldyA9IHROb2RlLnRWaWV3O1xuICAgICAgaWYgKGVtYmVkZGVkVFZpZXcgIT09IG51bGwpIHtcbiAgICAgICAgbmdoW1RFTVBMQVRFU10gPz89IHt9O1xuICAgICAgICBuZ2hbVEVNUExBVEVTXVtub09mZnNldEluZGV4XSA9IGdldFNzcklkKGVtYmVkZGVkVFZpZXcpO1xuICAgICAgfVxuXG4gICAgICAvLyBTZXJpYWxpemUgdmlld3Mgd2l0aGluIHRoaXMgTENvbnRhaW5lci5cbiAgICAgIGNvbnN0IGhvc3ROb2RlID0gbFZpZXdbaV1bSE9TVF0hOyAgLy8gaG9zdCBub2RlIG9mIHRoaXMgY29udGFpbmVyXG5cbiAgICAgIC8vIExWaWV3W2ldW0hPU1RdIGNhbiBiZSBvZiAyIGRpZmZlcmVudCB0eXBlczpcbiAgICAgIC8vIC0gZWl0aGVyIGEgRE9NIG5vZGVcbiAgICAgIC8vIC0gb3IgYW4gYXJyYXkgdGhhdCByZXByZXNlbnRzIGFuIExWaWV3IG9mIGEgY29tcG9uZW50XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheShob3N0Tm9kZSkpIHtcbiAgICAgICAgLy8gVGhpcyBpcyBhIGNvbXBvbmVudCwgc2VyaWFsaXplIGluZm8gYWJvdXQgaXQuXG4gICAgICAgIGNvbnN0IHRhcmdldE5vZGUgPSB1bndyYXBSTm9kZShob3N0Tm9kZSBhcyBMVmlldykgYXMgUkVsZW1lbnQ7XG4gICAgICAgIGlmICghKHRhcmdldE5vZGUgYXMgSFRNTEVsZW1lbnQpLmhhc0F0dHJpYnV0ZShTS0lQX0hZRFJBVElPTl9BVFRSX05BTUUpKSB7XG4gICAgICAgICAgYW5ub3RhdGVIb3N0RWxlbWVudEZvckh5ZHJhdGlvbih0YXJnZXROb2RlLCBob3N0Tm9kZSBhcyBMVmlldywgY29udGV4dCk7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgbmdoW0NPTlRBSU5FUlNdID8/PSB7fTtcbiAgICAgIG5naFtDT05UQUlORVJTXVtub09mZnNldEluZGV4XSA9IHNlcmlhbGl6ZUxDb250YWluZXIobFZpZXdbaV0sIGNvbnRleHQpO1xuICAgIH0gZWxzZSBpZiAoQXJyYXkuaXNBcnJheShsVmlld1tpXSkpIHtcbiAgICAgIC8vIFRoaXMgaXMgYSBjb21wb25lbnQsIGFubm90YXRlIHRoZSBob3N0IG5vZGUgd2l0aCBhbiBgbmdoYCBhdHRyaWJ1dGUuXG4gICAgICBjb25zdCB0YXJnZXROb2RlID0gdW53cmFwUk5vZGUobFZpZXdbaV1bSE9TVF0hKTtcbiAgICAgIGlmICghKHRhcmdldE5vZGUgYXMgSFRNTEVsZW1lbnQpLmhhc0F0dHJpYnV0ZShTS0lQX0hZRFJBVElPTl9BVFRSX05BTUUpKSB7XG4gICAgICAgIGFubm90YXRlSG9zdEVsZW1lbnRGb3JIeWRyYXRpb24odGFyZ2V0Tm9kZSBhcyBSRWxlbWVudCwgbFZpZXdbaV0sIGNvbnRleHQpO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAvLyA8bmctY29udGFpbmVyPiBjYXNlXG4gICAgICBpZiAodE5vZGUudHlwZSAmIFROb2RlVHlwZS5FbGVtZW50Q29udGFpbmVyKSB7XG4gICAgICAgIC8vIEFuIDxuZy1jb250YWluZXI+IGlzIHJlcHJlc2VudGVkIGJ5IHRoZSBudW1iZXIgb2ZcbiAgICAgICAgLy8gdG9wLWxldmVsIG5vZGVzLiBUaGlzIGluZm9ybWF0aW9uIGlzIG5lZWRlZCB0byBza2lwIG92ZXJcbiAgICAgICAgLy8gdGhvc2Ugbm9kZXMgdG8gcmVhY2ggYSBjb3JyZXNwb25kaW5nIGFuY2hvciBub2RlIChjb21tZW50IG5vZGUpLlxuICAgICAgICBuZ2hbRUxFTUVOVF9DT05UQUlORVJTXSA/Pz0ge307XG4gICAgICAgIG5naFtFTEVNRU5UX0NPTlRBSU5FUlNdW25vT2Zmc2V0SW5kZXhdID0gY2FsY051bVJvb3ROb2Rlcyh0VmlldywgbFZpZXcsIHROb2RlLmNoaWxkKTtcbiAgICAgIH0gZWxzZSBpZiAodE5vZGUudHlwZSAmIFROb2RlVHlwZS5Qcm9qZWN0aW9uKSB7XG4gICAgICAgIC8vIEN1cnJlbnQgVE5vZGUgcmVwcmVzZW50cyBhbiBgPG5nLWNvbnRlbnQ+YCBzbG90LCB0aHVzIGl0IGhhcyBub1xuICAgICAgICAvLyBET00gZWxlbWVudHMgYXNzb2NpYXRlZCB3aXRoIGl0LCBzbyB0aGUgKipuZXh0IHNpYmxpbmcqKiBub2RlIHdvdWxkXG4gICAgICAgIC8vIG5vdCBiZSBhYmxlIHRvIGZpbmQgYW4gYW5jaG9yLiBJbiB0aGlzIGNhc2UsIHVzZSBmdWxsIHBhdGggaW5zdGVhZC5cbiAgICAgICAgbGV0IG5leHRUTm9kZSA9IHROb2RlLm5leHQ7XG4gICAgICAgIC8vIFNraXAgb3ZlciBhbGwgYDxuZy1jb250ZW50PmAgc2xvdHMgaW4gYSByb3cuXG4gICAgICAgIHdoaWxlIChuZXh0VE5vZGUgIT09IG51bGwgJiYgKG5leHRUTm9kZS50eXBlICYgVE5vZGVUeXBlLlByb2plY3Rpb24pKSB7XG4gICAgICAgICAgbmV4dFROb2RlID0gbmV4dFROb2RlLm5leHQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYgKG5leHRUTm9kZSAmJiAhaXNJblNraXBIeWRyYXRpb25CbG9jayhuZXh0VE5vZGUpKSB7XG4gICAgICAgICAgLy8gSGFuZGxlIGEgdE5vZGUgYWZ0ZXIgdGhlIGA8bmctY29udGVudD5gIHNsb3QuXG4gICAgICAgICAgYXBwZW5kU2VyaWFsaXplZE5vZGVQYXRoKG5naCwgbmV4dFROb2RlLCBsVmlldyk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIC8vIEhhbmRsZSBjYXNlcyB3aGVyZSB0ZXh0IG5vZGVzIGNhbiBiZSBsb3N0IGFmdGVyIERPTSBzZXJpYWxpemF0aW9uOlxuICAgICAgICAvLyAgMS4gV2hlbiB0aGVyZSBpcyBhbiAqZW1wdHkgdGV4dCBub2RlKiBpbiBET006IGluIHRoaXMgY2FzZSwgdGhpc1xuICAgICAgICAvLyAgICAgbm9kZSB3b3VsZCBub3QgbWFrZSBpdCBpbnRvIHRoZSBzZXJpYWxpemVkIHN0cmluZyBhbmQgYXMgYSByZXN1bHQsXG4gICAgICAgIC8vICAgICB0aGlzIG5vZGUgd291bGRuJ3QgYmUgY3JlYXRlZCBpbiBhIGJyb3dzZXIuIFRoaXMgd291bGQgcmVzdWx0IGluXG4gICAgICAgIC8vICAgICBhIG1pc21hdGNoIGR1cmluZyB0aGUgaHlkcmF0aW9uLCB3aGVyZSB0aGUgcnVudGltZSBsb2dpYyB3b3VsZCBleHBlY3RcbiAgICAgICAgLy8gICAgIGEgdGV4dCBub2RlIHRvIGJlIHByZXNlbnQgaW4gbGl2ZSBET00sIGJ1dCBubyB0ZXh0IG5vZGUgd291bGQgZXhpc3QuXG4gICAgICAgIC8vICAgICBFeGFtcGxlOiBgPHNwYW4+e3sgbmFtZSB9fTwvc3Bhbj5gIHdoZW4gdGhlIGBuYW1lYCBpcyBhbiBlbXB0eSBzdHJpbmcuXG4gICAgICAgIC8vICAgICBUaGlzIHdvdWxkIHJlc3VsdCBpbiBgPHNwYW4+PC9zcGFuPmAgc3RyaW5nIGFmdGVyIHNlcmlhbGl6YXRpb24gYW5kXG4gICAgICAgIC8vICAgICBpbiBhIGJyb3dzZXIgb25seSB0aGUgYHNwYW5gIGVsZW1lbnQgd291bGQgYmUgY3JlYXRlZC4gVG8gcmVzb2x2ZSB0aGF0LFxuICAgICAgICAvLyAgICAgYW4gZXh0cmEgY29tbWVudCBub2RlIGlzIGFwcGVuZGVkIGluIHBsYWNlIG9mIGFuIGVtcHR5IHRleHQgbm9kZSBhbmRcbiAgICAgICAgLy8gICAgIHRoYXQgc3BlY2lhbCBjb21tZW50IG5vZGUgaXMgcmVwbGFjZWQgd2l0aCBhbiBlbXB0eSB0ZXh0IG5vZGUgKmJlZm9yZSpcbiAgICAgICAgLy8gICAgIGh5ZHJhdGlvbi5cbiAgICAgICAgLy8gIDIuIFdoZW4gdGhlcmUgYXJlIDIgY29uc2VjdXRpdmUgdGV4dCBub2RlcyBwcmVzZW50IGluIHRoZSBET00uXG4gICAgICAgIC8vICAgICBFeGFtcGxlOiBgPGRpdj5IZWxsbyA8bmctY29udGFpbmVyICpuZ0lmPVwidHJ1ZVwiPndvcmxkPC9uZy1jb250YWluZXI+PC9kaXY+YC5cbiAgICAgICAgLy8gICAgIEluIHRoaXMgc2NlbmFyaW8sIHRoZSBsaXZlIERPTSB3b3VsZCBsb29rIGxpa2UgdGhpczpcbiAgICAgICAgLy8gICAgICAgPGRpdj4jdGV4dCgnSGVsbG8gJykgI3RleHQoJ3dvcmxkJykgI2NvbW1lbnQoJ2NvbnRhaW5lcicpPC9kaXY+XG4gICAgICAgIC8vICAgICBTZXJpYWxpemVkIHN0cmluZyB3b3VsZCBsb29rIGxpa2UgdGhpczogYDxkaXY+SGVsbG8gd29ybGQ8IS0tY29udGFpbmVyLS0+PC9kaXY+YC5cbiAgICAgICAgLy8gICAgIFRoZSBsaXZlIERPTSBpbiBhIGJyb3dzZXIgYWZ0ZXIgdGhhdCB3b3VsZCBiZTpcbiAgICAgICAgLy8gICAgICAgPGRpdj4jdGV4dCgnSGVsbG8gd29ybGQnKSAjY29tbWVudCgnY29udGFpbmVyJyk8L2Rpdj5cbiAgICAgICAgLy8gICAgIE5vdGljZSBob3cgMiB0ZXh0IG5vZGVzIGFyZSBub3cgXCJtZXJnZWRcIiBpbnRvIG9uZS4gVGhpcyB3b3VsZCBjYXVzZSBoeWRyYXRpb25cbiAgICAgICAgLy8gICAgIGxvZ2ljIHRvIGZhaWwsIHNpbmNlIGl0J2QgZXhwZWN0IDIgdGV4dCBub2RlcyBiZWluZyBwcmVzZW50LCBub3Qgb25lLlxuICAgICAgICAvLyAgICAgVG8gZml4IHRoaXMsIHdlIGluc2VydCBhIHNwZWNpYWwgY29tbWVudCBub2RlIGluIGJldHdlZW4gdGhvc2UgdGV4dCBub2Rlcywgc29cbiAgICAgICAgLy8gICAgIHNlcmlhbGl6ZWQgcmVwcmVzZW50YXRpb24gaXM6IGA8ZGl2PkhlbGxvIDwhLS1uZ3Rucy0tPndvcmxkPCEtLWNvbnRhaW5lci0tPjwvZGl2PmAuXG4gICAgICAgIC8vICAgICBUaGlzIGZvcmNlcyBicm93c2VyIHRvIGNyZWF0ZSAyIHRleHQgbm9kZXMgc2VwYXJhdGVkIGJ5IGEgY29tbWVudCBub2RlLlxuICAgICAgICAvLyAgICAgQmVmb3JlIHJ1bm5pbmcgYSBoeWRyYXRpb24gcHJvY2VzcywgdGhpcyBzcGVjaWFsIGNvbW1lbnQgbm9kZSBpcyByZW1vdmVkLCBzbyB0aGVcbiAgICAgICAgLy8gICAgIGxpdmUgRE9NIGhhcyBleGFjdGx5IHRoZSBzYW1lIHN0YXRlIGFzIGl0IHdhcyBiZWZvcmUgc2VyaWFsaXphdGlvbi5cbiAgICAgICAgaWYgKHROb2RlLnR5cGUgJiBUTm9kZVR5cGUuVGV4dCkge1xuICAgICAgICAgIGNvbnN0IHJOb2RlID0gdW53cmFwUk5vZGUobFZpZXdbaV0pIGFzIEhUTUxFbGVtZW50O1xuICAgICAgICAgIC8vIENvbGxlY3QgdGhpcyBub2RlIGFzIHJlcXVpcmVkIHNwZWNpYWwgYW5ub3RhdGlvbiBvbmx5IHdoZW4gaXRzXG4gICAgICAgICAgLy8gY29udGVudHMgaXMgZW1wdHkuIE90aGVyd2lzZSwgc3VjaCB0ZXh0IG5vZGUgd291bGQgYmUgcHJlc2VudCBvblxuICAgICAgICAgIC8vIHRoZSBjbGllbnQgYWZ0ZXIgc2VydmVyLXNpZGUgcmVuZGVyaW5nIGFuZCBubyBzcGVjaWFsIGhhbmRsaW5nIG5lZWRlZC5cbiAgICAgICAgICBpZiAock5vZGUudGV4dENvbnRlbnQgPT09ICcnKSB7XG4gICAgICAgICAgICBjb250ZXh0LmNvcnJ1cHRlZFRleHROb2Rlcy5zZXQock5vZGUsIFRleHROb2RlTWFya2VyLkVtcHR5Tm9kZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChyTm9kZS5uZXh0U2libGluZz8ubm9kZVR5cGUgPT09IE5vZGUuVEVYVF9OT0RFKSB7XG4gICAgICAgICAgICBjb250ZXh0LmNvcnJ1cHRlZFRleHROb2Rlcy5zZXQock5vZGUsIFRleHROb2RlTWFya2VyLlNlcGFyYXRvcik7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiBuZ2g7XG59XG5cbi8qKlxuICogU2VyaWFsaXplcyBub2RlIGxvY2F0aW9uIGluIGNhc2VzIHdoZW4gaXQncyBuZWVkZWQsIHNwZWNpZmljYWxseTpcbiAqXG4gKiAgMS4gSWYgYHROb2RlLnByb2plY3Rpb25OZXh0YCBpcyBkaWZmZXJlbnQgZnJvbSBgdE5vZGUubmV4dGAgLSBpdCBtZWFucyB0aGF0XG4gKiAgICAgdGhlIG5leHQgYHROb2RlYCBhZnRlciBwcm9qZWN0aW9uIGlzIGRpZmZlcmVudCBmcm9tIHRoZSBvbmUgaW4gdGhlIG9yaWdpbmFsXG4gKiAgICAgdGVtcGxhdGUuIFNpbmNlIGh5ZHJhdGlvbiByZWxpZXMgb24gYHROb2RlLm5leHRgLCB0aGlzIHNlcmlhbGl6ZWQgaW5mb1xuICogICAgIGlmIHJlcXVpcmVkIHRvIGhlbHAgcnVudGltZSBjb2RlIGZpbmQgdGhlIG5vZGUgYXQgdGhlIGNvcnJlY3QgbG9jYXRpb24uXG4gKiAgMi4gSW4gY2VydGFpbiBjb250ZW50IHByb2plY3Rpb24tYmFzZWQgdXNlLWNhc2VzLCBpdCdzIHBvc3NpYmxlIHRoYXQgb25seVxuICogICAgIGEgY29udGVudCBvZiBhIHByb2plY3RlZCBlbGVtZW50IGlzIHJlbmRlcmVkLiBJbiB0aGlzIGNhc2UsIGNvbnRlbnQgbm9kZXNcbiAqICAgICByZXF1aXJlIGFuIGV4dHJhIGFubm90YXRpb24sIHNpbmNlIHJ1bnRpbWUgbG9naWMgY2FuJ3QgcmVseSBvbiBwYXJlbnQtY2hpbGRcbiAqICAgICBjb25uZWN0aW9uIHRvIGlkZW50aWZ5IHRoZSBsb2NhdGlvbiBvZiBhIG5vZGUuXG4gKi9cbmZ1bmN0aW9uIGNvbmRpdGlvbmFsbHlBbm5vdGF0ZU5vZGVQYXRoKG5naDogU2VyaWFsaXplZFZpZXcsIHROb2RlOiBUTm9kZSwgbFZpZXc6IExWaWV3PHVua25vd24+KSB7XG4gIC8vIEhhbmRsZSBjYXNlICMxIGRlc2NyaWJlZCBhYm92ZS5cbiAgaWYgKHROb2RlLnByb2plY3Rpb25OZXh0ICYmIHROb2RlLnByb2plY3Rpb25OZXh0ICE9PSB0Tm9kZS5uZXh0ICYmXG4gICAgICAhaXNJblNraXBIeWRyYXRpb25CbG9jayh0Tm9kZS5wcm9qZWN0aW9uTmV4dCkpIHtcbiAgICBhcHBlbmRTZXJpYWxpemVkTm9kZVBhdGgobmdoLCB0Tm9kZS5wcm9qZWN0aW9uTmV4dCwgbFZpZXcpO1xuICB9XG5cbiAgLy8gSGFuZGxlIGNhc2UgIzIgZGVzY3JpYmVkIGFib3ZlLlxuICAvLyBOb3RlOiB3ZSBvbmx5IGRvIHRoYXQgZm9yIHRoZSBmaXJzdCBub2RlIChpLmUuIHdoZW4gYHROb2RlLnByZXYgPT09IG51bGxgKSxcbiAgLy8gdGhlIHJlc3Qgb2YgdGhlIG5vZGVzIHdvdWxkIHJlbHkgb24gdGhlIGN1cnJlbnQgbm9kZSBsb2NhdGlvbiwgc28gbm8gZXh0cmFcbiAgLy8gYW5ub3RhdGlvbiBpcyBuZWVkZWQuXG4gIGlmICh0Tm9kZS5wcmV2ID09PSBudWxsICYmIHROb2RlLnBhcmVudCAhPT0gbnVsbCAmJiBpc0Rpc2Nvbm5lY3RlZE5vZGUodE5vZGUucGFyZW50LCBsVmlldykgJiZcbiAgICAgICFpc0Rpc2Nvbm5lY3RlZE5vZGUodE5vZGUsIGxWaWV3KSkge1xuICAgIGFwcGVuZFNlcmlhbGl6ZWROb2RlUGF0aChuZ2gsIHROb2RlLCBsVmlldyk7XG4gIH1cbn1cblxuLyoqXG4gKiBEZXRlcm1pbmVzIHdoZXRoZXIgYSBjb21wb25lbnQgaW5zdGFuY2UgdGhhdCBpcyByZXByZXNlbnRlZFxuICogYnkgYSBnaXZlbiBMVmlldyB1c2VzIGBWaWV3RW5jYXBzdWxhdGlvbi5TaGFkb3dEb21gLlxuICovXG5mdW5jdGlvbiBjb21wb25lbnRVc2VzU2hhZG93RG9tRW5jYXBzdWxhdGlvbihsVmlldzogTFZpZXcpOiBib29sZWFuIHtcbiAgY29uc3QgaW5zdGFuY2UgPSBsVmlld1tDT05URVhUXTtcbiAgcmV0dXJuIGluc3RhbmNlPy5jb25zdHJ1Y3RvciA/XG4gICAgICBnZXRDb21wb25lbnREZWYoaW5zdGFuY2UuY29uc3RydWN0b3IpPy5lbmNhcHN1bGF0aW9uID09PSBWaWV3RW5jYXBzdWxhdGlvbi5TaGFkb3dEb20gOlxuICAgICAgZmFsc2U7XG59XG5cbi8qKlxuICogQW5ub3RhdGVzIGNvbXBvbmVudCBob3N0IGVsZW1lbnQgZm9yIGh5ZHJhdGlvbjpcbiAqIC0gYnkgZWl0aGVyIGFkZGluZyB0aGUgYG5naGAgYXR0cmlidXRlIGFuZCBjb2xsZWN0aW5nIGh5ZHJhdGlvbi1yZWxhdGVkIGluZm9cbiAqICAgZm9yIHRoZSBzZXJpYWxpemF0aW9uIGFuZCB0cmFuc2ZlcnJpbmcgdG8gdGhlIGNsaWVudFxuICogLSBvciBieSBhZGRpbmcgdGhlIGBuZ1NraXBIeWRyYXRpb25gIGF0dHJpYnV0ZSBpbiBjYXNlIEFuZ3VsYXIgZGV0ZWN0cyB0aGF0XG4gKiAgIGNvbXBvbmVudCBjb250ZW50cyBpcyBub3QgY29tcGF0aWJsZSB3aXRoIGh5ZHJhdGlvbi5cbiAqXG4gKiBAcGFyYW0gZWxlbWVudCBUaGUgSG9zdCBlbGVtZW50IHRvIGJlIGFubm90YXRlZFxuICogQHBhcmFtIGxWaWV3IFRoZSBhc3NvY2lhdGVkIExWaWV3XG4gKiBAcGFyYW0gY29udGV4dCBUaGUgaHlkcmF0aW9uIGNvbnRleHRcbiAqIEByZXR1cm5zIEFuIGluZGV4IG9mIHNlcmlhbGl6ZWQgdmlldyBmcm9tIHRoZSB0cmFuc2ZlciBzdGF0ZSBvYmplY3RcbiAqICAgICAgICAgIG9yIGBudWxsYCB3aGVuIGEgZ2l2ZW4gY29tcG9uZW50IGNhbiBub3QgYmUgc2VyaWFsaXplZC5cbiAqL1xuZnVuY3Rpb24gYW5ub3RhdGVIb3N0RWxlbWVudEZvckh5ZHJhdGlvbihcbiAgICBlbGVtZW50OiBSRWxlbWVudCwgbFZpZXc6IExWaWV3LCBjb250ZXh0OiBIeWRyYXRpb25Db250ZXh0KTogbnVtYmVyfG51bGwge1xuICBjb25zdCByZW5kZXJlciA9IGxWaWV3W1JFTkRFUkVSXTtcbiAgaWYgKGhhc0kxOG4obFZpZXcpIHx8IGNvbXBvbmVudFVzZXNTaGFkb3dEb21FbmNhcHN1bGF0aW9uKGxWaWV3KSkge1xuICAgIC8vIEF0dGFjaCB0aGUgc2tpcCBoeWRyYXRpb24gYXR0cmlidXRlIGlmIHRoaXMgY29tcG9uZW50OlxuICAgIC8vIC0gZWl0aGVyIGhhcyBpMThuIGJsb2Nrcywgc2luY2UgaHlkcmF0aW5nIHN1Y2ggYmxvY2tzIGlzIG5vdCB5ZXQgc3VwcG9ydGVkXG4gICAgLy8gLSBvciB1c2VzIFNoYWRvd0RvbSB2aWV3IGVuY2Fwc3VsYXRpb24sIHNpbmNlIERvbWlubyBkb2Vzbid0IHN1cHBvcnRcbiAgICAvLyAgIHNoYWRvdyBET00sIHNvIHdlIGNhbiBub3QgZ3VhcmFudGVlIHRoYXQgY2xpZW50IGFuZCBzZXJ2ZXIgcmVwcmVzZW50YXRpb25zXG4gICAgLy8gICB3b3VsZCBleGFjdGx5IG1hdGNoXG4gICAgcmVuZGVyZXIuc2V0QXR0cmlidXRlKGVsZW1lbnQsIFNLSVBfSFlEUkFUSU9OX0FUVFJfTkFNRSwgJycpO1xuICAgIHJldHVybiBudWxsO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IG5naCA9IHNlcmlhbGl6ZUxWaWV3KGxWaWV3LCBjb250ZXh0KTtcbiAgICBjb25zdCBpbmRleCA9IGNvbnRleHQuc2VyaWFsaXplZFZpZXdDb2xsZWN0aW9uLmFkZChuZ2gpO1xuICAgIHJlbmRlcmVyLnNldEF0dHJpYnV0ZShlbGVtZW50LCBOR0hfQVRUUl9OQU1FLCBpbmRleC50b1N0cmluZygpKTtcbiAgICByZXR1cm4gaW5kZXg7XG4gIH1cbn1cblxuLyoqXG4gKiBQaHlzaWNhbGx5IGluc2VydHMgdGhlIGNvbW1lbnQgbm9kZXMgdG8gZW5zdXJlIGVtcHR5IHRleHQgbm9kZXMgYW5kIGFkamFjZW50XG4gKiB0ZXh0IG5vZGUgc2VwYXJhdG9ycyBhcmUgcHJlc2VydmVkIGFmdGVyIHNlcnZlciBzZXJpYWxpemF0aW9uIG9mIHRoZSBET00uXG4gKiBUaGVzZSBnZXQgc3dhcHBlZCBiYWNrIGZvciBlbXB0eSB0ZXh0IG5vZGVzIG9yIHNlcGFyYXRvcnMgb25jZSBoeWRyYXRpb24gaGFwcGVuc1xuICogb24gdGhlIGNsaWVudC5cbiAqXG4gKiBAcGFyYW0gY29ycnVwdGVkVGV4dE5vZGVzIFRoZSBNYXAgb2YgdGV4dCBub2RlcyB0byBiZSByZXBsYWNlZCB3aXRoIGNvbW1lbnRzXG4gKiBAcGFyYW0gZG9jIFRoZSBkb2N1bWVudFxuICovXG5mdW5jdGlvbiBpbnNlcnRDb3JydXB0ZWRUZXh0Tm9kZU1hcmtlcnMoXG4gICAgY29ycnVwdGVkVGV4dE5vZGVzOiBNYXA8SFRNTEVsZW1lbnQsIHN0cmluZz4sIGRvYzogRG9jdW1lbnQpIHtcbiAgZm9yIChjb25zdCBbdGV4dE5vZGUsIG1hcmtlcl0gb2YgY29ycnVwdGVkVGV4dE5vZGVzKSB7XG4gICAgdGV4dE5vZGUuYWZ0ZXIoZG9jLmNyZWF0ZUNvbW1lbnQobWFya2VyKSk7XG4gIH1cbn1cblxuLyoqXG4gKiBEZXRlY3RzIHdoZXRoZXIgYSBnaXZlbiBUTm9kZSByZXByZXNlbnRzIGEgbm9kZSB0aGF0XG4gKiBpcyBiZWluZyBjb250ZW50IHByb2plY3RlZC5cbiAqL1xuZnVuY3Rpb24gaXNDb250ZW50UHJvamVjdGVkTm9kZSh0Tm9kZTogVE5vZGUpOiBib29sZWFuIHtcbiAgbGV0IGN1cnJlbnRUTm9kZSA9IHROb2RlO1xuICB3aGlsZSAoY3VycmVudFROb2RlICE9IG51bGwpIHtcbiAgICAvLyBJZiB3ZSBjb21lIGFjcm9zcyBhIGNvbXBvbmVudCBob3N0IG5vZGUgaW4gcGFyZW50IG5vZGVzIC1cbiAgICAvLyB0aGlzIFROb2RlIGlzIGluIHRoZSBjb250ZW50IHByb2plY3Rpb24gc2VjdGlvbi5cbiAgICBpZiAoaXNDb21wb25lbnRIb3N0KGN1cnJlbnRUTm9kZSkpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjdXJyZW50VE5vZGUgPSBjdXJyZW50VE5vZGUucGFyZW50IGFzIFROb2RlO1xuICB9XG4gIHJldHVybiBmYWxzZTtcbn1cbiJdfQ==