/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { convertToBitFlags } from '../di/injector_compatibility';
import { EnvironmentInjector } from '../di/r3_injector';
import { RuntimeError } from '../errors';
import { retrieveHydrationInfo } from '../hydration/utils';
import { ComponentFactory as AbstractComponentFactory, ComponentRef as AbstractComponentRef } from '../linker/component_factory';
import { ComponentFactoryResolver as AbstractComponentFactoryResolver } from '../linker/component_factory_resolver';
import { createElementRef } from '../linker/element_ref';
import { RendererFactory2 } from '../render/api';
import { Sanitizer } from '../sanitization/sanitizer';
import { assertDefined, assertGreaterThan, assertIndexInRange } from '../util/assert';
import { VERSION } from '../version';
import { NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR } from '../view/provider_flags';
import { AfterRenderEventManager } from './after_render_hooks';
import { assertComponentType, assertNoDuplicateDirectives } from './assert';
import { attachPatchData } from './context_discovery';
import { getComponentDef } from './definition';
import { depsTracker } from './deps_tracker/deps_tracker';
import { getNodeInjectable, NodeInjector } from './di';
import { registerPostOrderHooks } from './hooks';
import { reportUnknownPropertyError } from './instructions/element_validation';
import { markViewDirty } from './instructions/mark_view_dirty';
import { renderView } from './instructions/render';
import { addToViewTree, createLView, createTView, executeContentQueries, getOrCreateComponentTView, getOrCreateTNode, initializeDirectives, invokeDirectivesHostBindings, locateHostElement, markAsComponentHost, setInputsForProperty } from './instructions/shared';
import { CONTEXT, HEADER_OFFSET, INJECTOR, TVIEW } from './interfaces/view';
import { MATH_ML_NAMESPACE, SVG_NAMESPACE } from './namespaces';
import { createElementNode, setupStaticAttributes, writeDirectClass } from './node_manipulation';
import { extractAttrsAndClassesFromSelector, stringifyCSSSelectorList } from './node_selector_matcher';
import { enterView, getCurrentTNode, getLView, leaveView } from './state';
import { computeStaticStyling } from './styling/static_styling';
import { mergeHostAttrs, setUpAttributes } from './util/attrs_utils';
import { debugStringifyTypeForError, stringifyForError } from './util/stringify_utils';
import { getComponentLViewByIndex, getNativeByTNode, getTNode } from './util/view_utils';
import { ViewRef } from './view_ref';
export class ComponentFactoryResolver extends AbstractComponentFactoryResolver {
    /**
     * @param ngModule The NgModuleRef to which all resolved factories are bound.
     */
    constructor(ngModule) {
        super();
        this.ngModule = ngModule;
    }
    resolveComponentFactory(component) {
        ngDevMode && assertComponentType(component);
        const componentDef = getComponentDef(component);
        return new ComponentFactory(componentDef, this.ngModule);
    }
}
function toRefArray(map) {
    const array = [];
    for (let nonMinified in map) {
        if (map.hasOwnProperty(nonMinified)) {
            const minified = map[nonMinified];
            array.push({ propName: minified, templateName: nonMinified });
        }
    }
    return array;
}
function getNamespace(elementName) {
    const name = elementName.toLowerCase();
    return name === 'svg' ? SVG_NAMESPACE : (name === 'math' ? MATH_ML_NAMESPACE : null);
}
/**
 * Injector that looks up a value using a specific injector, before falling back to the module
 * injector. Used primarily when creating components or embedded views dynamically.
 */
export class ChainedInjector {
    constructor(injector, parentInjector) {
        this.injector = injector;
        this.parentInjector = parentInjector;
    }
    get(token, notFoundValue, flags) {
        flags = convertToBitFlags(flags);
        const value = this.injector.get(token, NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR, flags);
        if (value !== NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR ||
            notFoundValue === NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR) {
            // Return the value from the root element injector when
            // - it provides it
            //   (value !== NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR)
            // - the module injector should not be checked
            //   (notFoundValue === NOT_FOUND_CHECK_ONLY_ELEMENT_INJECTOR)
            return value;
        }
        return this.parentInjector.get(token, notFoundValue, flags);
    }
}
/**
 * ComponentFactory interface implementation.
 */
export class ComponentFactory extends AbstractComponentFactory {
    get inputs() {
        const componentDef = this.componentDef;
        const inputTransforms = componentDef.inputTransforms;
        const refArray = toRefArray(componentDef.inputs);
        if (inputTransforms !== null) {
            for (const input of refArray) {
                if (inputTransforms.hasOwnProperty(input.propName)) {
                    input.transform = inputTransforms[input.propName];
                }
            }
        }
        return refArray;
    }
    get outputs() {
        return toRefArray(this.componentDef.outputs);
    }
    /**
     * @param componentDef The component definition.
     * @param ngModule The NgModuleRef to which the factory is bound.
     */
    constructor(componentDef, ngModule) {
        super();
        this.componentDef = componentDef;
        this.ngModule = ngModule;
        this.componentType = componentDef.type;
        this.selector = stringifyCSSSelectorList(componentDef.selectors);
        this.ngContentSelectors =
            componentDef.ngContentSelectors ? componentDef.ngContentSelectors : [];
        this.isBoundToModule = !!ngModule;
    }
    create(injector, projectableNodes, rootSelectorOrNode, environmentInjector) {
        // Check if the component is orphan
        if (ngDevMode && (typeof ngJitMode === 'undefined' || ngJitMode) &&
            this.componentDef.debugInfo?.forbidOrphanRendering) {
            if (depsTracker.isOrphanComponent(this.componentType)) {
                throw new RuntimeError(1001 /* RuntimeErrorCode.RUNTIME_DEPS_ORPHAN_COMPONENT */, `Orphan component found! Trying to render the component ${debugStringifyTypeForError(this.componentType)} without first loading the NgModule that declares it. It is recommended to make this component standalone in order to avoid this error. If this is not possible now, import the component's NgModule in the appropriate NgModule, or the standalone component in which you are trying to render this component. If this is a lazy import, load the NgModule lazily as well and use its module injector.`);
            }
        }
        environmentInjector = environmentInjector || this.ngModule;
        let realEnvironmentInjector = environmentInjector instanceof EnvironmentInjector ?
            environmentInjector :
            environmentInjector?.injector;
        if (realEnvironmentInjector && this.componentDef.getStandaloneInjector !== null) {
            realEnvironmentInjector = this.componentDef.getStandaloneInjector(realEnvironmentInjector) ||
                realEnvironmentInjector;
        }
        const rootViewInjector = realEnvironmentInjector ? new ChainedInjector(injector, realEnvironmentInjector) : injector;
        const rendererFactory = rootViewInjector.get(RendererFactory2, null);
        if (rendererFactory === null) {
            throw new RuntimeError(407 /* RuntimeErrorCode.RENDERER_NOT_FOUND */, ngDevMode &&
                'Angular was not able to inject a renderer (RendererFactory2). ' +
                    'Likely this is due to a broken DI hierarchy. ' +
                    'Make sure that any injector used to create this component has a correct parent.');
        }
        const sanitizer = rootViewInjector.get(Sanitizer, null);
        const afterRenderEventManager = rootViewInjector.get(AfterRenderEventManager, null);
        const environment = {
            rendererFactory,
            sanitizer,
            // We don't use inline effects (yet).
            inlineEffectRunner: null,
            afterRenderEventManager,
        };
        const hostRenderer = rendererFactory.createRenderer(null, this.componentDef);
        // Determine a tag name used for creating host elements when this component is created
        // dynamically. Default to 'div' if this component did not specify any tag name in its selector.
        const elementName = this.componentDef.selectors[0][0] || 'div';
        const hostRNode = rootSelectorOrNode ?
            locateHostElement(hostRenderer, rootSelectorOrNode, this.componentDef.encapsulation, rootViewInjector) :
            createElementNode(hostRenderer, elementName, getNamespace(elementName));
        // Signal components use the granular "RefreshView"  for change detection
        const signalFlags = (4096 /* LViewFlags.SignalView */ | 512 /* LViewFlags.IsRoot */);
        // Non-signal components use the traditional "CheckAlways or OnPush/Dirty" change detection
        const nonSignalFlags = this.componentDef.onPush ? 64 /* LViewFlags.Dirty */ | 512 /* LViewFlags.IsRoot */ :
            16 /* LViewFlags.CheckAlways */ | 512 /* LViewFlags.IsRoot */;
        const rootFlags = this.componentDef.signals ? signalFlags : nonSignalFlags;
        let hydrationInfo = null;
        if (hostRNode !== null) {
            hydrationInfo = retrieveHydrationInfo(hostRNode, rootViewInjector, true /* isRootView */);
        }
        // Create the root view. Uses empty TView and ContentTemplate.
        const rootTView = createTView(0 /* TViewType.Root */, null, null, 1, 0, null, null, null, null, null, null);
        const rootLView = createLView(null, rootTView, null, rootFlags, null, null, environment, hostRenderer, rootViewInjector, null, hydrationInfo);
        // rootView is the parent when bootstrapping
        // TODO(misko): it looks like we are entering view here but we don't really need to as
        // `renderView` does that. However as the code is written it is needed because
        // `createRootComponentView` and `createRootComponent` both read global state. Fixing those
        // issues would allow us to drop this.
        enterView(rootLView);
        let component;
        let tElementNode;
        try {
            const rootComponentDef = this.componentDef;
            let rootDirectives;
            let hostDirectiveDefs = null;
            if (rootComponentDef.findHostDirectiveDefs) {
                rootDirectives = [];
                hostDirectiveDefs = new Map();
                rootComponentDef.findHostDirectiveDefs(rootComponentDef, rootDirectives, hostDirectiveDefs);
                rootDirectives.push(rootComponentDef);
                ngDevMode && assertNoDuplicateDirectives(rootDirectives);
            }
            else {
                rootDirectives = [rootComponentDef];
            }
            const hostTNode = createRootComponentTNode(rootLView, hostRNode);
            const componentView = createRootComponentView(hostTNode, hostRNode, rootComponentDef, rootDirectives, rootLView, environment, hostRenderer);
            tElementNode = getTNode(rootTView, HEADER_OFFSET);
            // TODO(crisbeto): in practice `hostRNode` should always be defined, but there are some tests
            // where the renderer is mocked out and `undefined` is returned. We should update the tests so
            // that this check can be removed.
            if (hostRNode) {
                setRootNodeAttributes(hostRenderer, rootComponentDef, hostRNode, rootSelectorOrNode);
            }
            if (projectableNodes !== undefined) {
                projectNodes(tElementNode, this.ngContentSelectors, projectableNodes);
            }
            // TODO: should LifecycleHooksFeature and other host features be generated by the compiler and
            // executed here?
            // Angular 5 reference: https://stackblitz.com/edit/lifecycle-hooks-vcref
            component = createRootComponent(componentView, rootComponentDef, rootDirectives, hostDirectiveDefs, rootLView, [LifecycleHooksFeature]);
            renderView(rootTView, rootLView, null);
        }
        finally {
            leaveView();
        }
        return new ComponentRef(this.componentType, component, createElementRef(tElementNode, rootLView), rootLView, tElementNode);
    }
}
/**
 * Represents an instance of a Component created via a {@link ComponentFactory}.
 *
 * `ComponentRef` provides access to the Component Instance as well other objects related to this
 * Component Instance and allows you to destroy the Component Instance via the {@link #destroy}
 * method.
 *
 */
export class ComponentRef extends AbstractComponentRef {
    constructor(componentType, instance, location, _rootLView, _tNode) {
        super();
        this.location = location;
        this._rootLView = _rootLView;
        this._tNode = _tNode;
        this.previousInputValues = null;
        this.instance = instance;
        this.hostView = this.changeDetectorRef = new ViewRef(_rootLView, undefined, /* _cdRefInjectingView */ false);
        this.componentType = componentType;
    }
    setInput(name, value) {
        const inputData = this._tNode.inputs;
        let dataValue;
        if (inputData !== null && (dataValue = inputData[name])) {
            this.previousInputValues ??= new Map();
            // Do not set the input if it is the same as the last value
            // This behavior matches `bindingUpdated` when binding inputs in templates.
            if (this.previousInputValues.has(name) &&
                Object.is(this.previousInputValues.get(name), value)) {
                return;
            }
            const lView = this._rootLView;
            setInputsForProperty(lView[TVIEW], lView, dataValue, name, value);
            this.previousInputValues.set(name, value);
            const childComponentLView = getComponentLViewByIndex(this._tNode.index, lView);
            markViewDirty(childComponentLView);
        }
        else {
            if (ngDevMode) {
                const cmpNameForError = stringifyForError(this.componentType);
                let message = `Can't set value of the '${name}' input on the '${cmpNameForError}' component. `;
                message += `Make sure that the '${name}' property is annotated with @Input() or a mapped @Input('${name}') exists.`;
                reportUnknownPropertyError(message);
            }
        }
    }
    get injector() {
        return new NodeInjector(this._tNode, this._rootLView);
    }
    destroy() {
        this.hostView.destroy();
    }
    onDestroy(callback) {
        this.hostView.onDestroy(callback);
    }
}
/** Creates a TNode that can be used to instantiate a root component. */
function createRootComponentTNode(lView, rNode) {
    const tView = lView[TVIEW];
    const index = HEADER_OFFSET;
    ngDevMode && assertIndexInRange(lView, index);
    lView[index] = rNode;
    // '#host' is added here as we don't know the real host DOM name (we don't want to read it) and at
    // the same time we want to communicate the debug `TNode` that this is a special `TNode`
    // representing a host element.
    return getOrCreateTNode(tView, index, 2 /* TNodeType.Element */, '#host', null);
}
/**
 * Creates the root component view and the root component node.
 *
 * @param hostRNode Render host element.
 * @param rootComponentDef ComponentDef
 * @param rootView The parent view where the host node is stored
 * @param rendererFactory Factory to be used for creating child renderers.
 * @param hostRenderer The current renderer
 * @param sanitizer The sanitizer, if provided
 *
 * @returns Component view created
 */
function createRootComponentView(tNode, hostRNode, rootComponentDef, rootDirectives, rootView, environment, hostRenderer) {
    const tView = rootView[TVIEW];
    applyRootComponentStyling(rootDirectives, tNode, hostRNode, hostRenderer);
    // Hydration info is on the host element and needs to be retrieved
    // and passed to the component LView.
    let hydrationInfo = null;
    if (hostRNode !== null) {
        hydrationInfo = retrieveHydrationInfo(hostRNode, rootView[INJECTOR]);
    }
    const viewRenderer = environment.rendererFactory.createRenderer(hostRNode, rootComponentDef);
    let lViewFlags = 16 /* LViewFlags.CheckAlways */;
    if (rootComponentDef.signals) {
        lViewFlags = 4096 /* LViewFlags.SignalView */;
    }
    else if (rootComponentDef.onPush) {
        lViewFlags = 64 /* LViewFlags.Dirty */;
    }
    const componentView = createLView(rootView, getOrCreateComponentTView(rootComponentDef), null, lViewFlags, rootView[tNode.index], tNode, environment, viewRenderer, null, null, hydrationInfo);
    if (tView.firstCreatePass) {
        markAsComponentHost(tView, tNode, rootDirectives.length - 1);
    }
    addToViewTree(rootView, componentView);
    // Store component view at node index, with node as the HOST
    return rootView[tNode.index] = componentView;
}
/** Sets up the styling information on a root component. */
function applyRootComponentStyling(rootDirectives, tNode, rNode, hostRenderer) {
    for (const def of rootDirectives) {
        tNode.mergedAttrs = mergeHostAttrs(tNode.mergedAttrs, def.hostAttrs);
    }
    if (tNode.mergedAttrs !== null) {
        computeStaticStyling(tNode, tNode.mergedAttrs, true);
        if (rNode !== null) {
            setupStaticAttributes(hostRenderer, rNode, tNode);
        }
    }
}
/**
 * Creates a root component and sets it up with features and host bindings.Shared by
 * renderComponent() and ViewContainerRef.createComponent().
 */
function createRootComponent(componentView, rootComponentDef, rootDirectives, hostDirectiveDefs, rootLView, hostFeatures) {
    const rootTNode = getCurrentTNode();
    ngDevMode && assertDefined(rootTNode, 'tNode should have been already created');
    const tView = rootLView[TVIEW];
    const native = getNativeByTNode(rootTNode, rootLView);
    initializeDirectives(tView, rootLView, rootTNode, rootDirectives, null, hostDirectiveDefs);
    for (let i = 0; i < rootDirectives.length; i++) {
        const directiveIndex = rootTNode.directiveStart + i;
        const directiveInstance = getNodeInjectable(rootLView, tView, directiveIndex, rootTNode);
        attachPatchData(directiveInstance, rootLView);
    }
    invokeDirectivesHostBindings(tView, rootLView, rootTNode);
    if (native) {
        attachPatchData(native, rootLView);
    }
    // We're guaranteed for the `componentOffset` to be positive here
    // since a root component always matches a component def.
    ngDevMode &&
        assertGreaterThan(rootTNode.componentOffset, -1, 'componentOffset must be great than -1');
    const component = getNodeInjectable(rootLView, tView, rootTNode.directiveStart + rootTNode.componentOffset, rootTNode);
    componentView[CONTEXT] = rootLView[CONTEXT] = component;
    if (hostFeatures !== null) {
        for (const feature of hostFeatures) {
            feature(component, rootComponentDef);
        }
    }
    // We want to generate an empty QueryList for root content queries for backwards
    // compatibility with ViewEngine.
    executeContentQueries(tView, rootTNode, componentView);
    return component;
}
/** Sets the static attributes on a root component. */
function setRootNodeAttributes(hostRenderer, componentDef, hostRNode, rootSelectorOrNode) {
    if (rootSelectorOrNode) {
        setUpAttributes(hostRenderer, hostRNode, ['ng-version', VERSION.full]);
    }
    else {
        // If host element is created as a part of this function call (i.e. `rootSelectorOrNode`
        // is not defined), also apply attributes and classes extracted from component selector.
        // Extract attributes and classes from the first selector only to match VE behavior.
        const { attrs, classes } = extractAttrsAndClassesFromSelector(componentDef.selectors[0]);
        if (attrs) {
            setUpAttributes(hostRenderer, hostRNode, attrs);
        }
        if (classes && classes.length > 0) {
            writeDirectClass(hostRenderer, hostRNode, classes.join(' '));
        }
    }
}
/** Projects the `projectableNodes` that were specified when creating a root component. */
function projectNodes(tNode, ngContentSelectors, projectableNodes) {
    const projection = tNode.projection = [];
    for (let i = 0; i < ngContentSelectors.length; i++) {
        const nodesforSlot = projectableNodes[i];
        // Projectable nodes can be passed as array of arrays or an array of iterables (ngUpgrade
        // case). Here we do normalize passed data structure to be an array of arrays to avoid
        // complex checks down the line.
        // We also normalize the length of the passed in projectable nodes (to match the number of
        // <ng-container> slots defined by a component).
        projection.push(nodesforSlot != null ? Array.from(nodesforSlot) : null);
    }
}
/**
 * Used to enable lifecycle hooks on the root component.
 *
 * Include this feature when calling `renderComponent` if the root component
 * you are rendering has lifecycle hooks defined. Otherwise, the hooks won't
 * be called properly.
 *
 * Example:
 *
 * ```
 * renderComponent(AppComponent, {hostFeatures: [LifecycleHooksFeature]});
 * ```
 */
export function LifecycleHooksFeature() {
    const tNode = getCurrentTNode();
    ngDevMode && assertDefined(tNode, 'TNode is required');
    registerPostOrderHooks(getLView()[TVIEW], tNode);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29tcG9uZW50X3JlZi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvcmUvc3JjL3JlbmRlcjMvY29tcG9uZW50X3JlZi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFJSCxPQUFPLEVBQUMsaUJBQWlCLEVBQUMsTUFBTSw4QkFBOEIsQ0FBQztBQUcvRCxPQUFPLEVBQUMsbUJBQW1CLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUN0RCxPQUFPLEVBQUMsWUFBWSxFQUFtQixNQUFNLFdBQVcsQ0FBQztBQUV6RCxPQUFPLEVBQUMscUJBQXFCLEVBQUMsTUFBTSxvQkFBb0IsQ0FBQztBQUV6RCxPQUFPLEVBQUMsZ0JBQWdCLElBQUksd0JBQXdCLEVBQUUsWUFBWSxJQUFJLG9CQUFvQixFQUFDLE1BQU0sNkJBQTZCLENBQUM7QUFDL0gsT0FBTyxFQUFDLHdCQUF3QixJQUFJLGdDQUFnQyxFQUFDLE1BQU0sc0NBQXNDLENBQUM7QUFDbEgsT0FBTyxFQUFDLGdCQUFnQixFQUFhLE1BQU0sdUJBQXVCLENBQUM7QUFFbkUsT0FBTyxFQUFZLGdCQUFnQixFQUFDLE1BQU0sZUFBZSxDQUFDO0FBQzFELE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSwyQkFBMkIsQ0FBQztBQUNwRCxPQUFPLEVBQUMsYUFBYSxFQUFFLGlCQUFpQixFQUFFLGtCQUFrQixFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDcEYsT0FBTyxFQUFDLE9BQU8sRUFBQyxNQUFNLFlBQVksQ0FBQztBQUNuQyxPQUFPLEVBQUMscUNBQXFDLEVBQUMsTUFBTSx3QkFBd0IsQ0FBQztBQUU3RSxPQUFPLEVBQUMsdUJBQXVCLEVBQUMsTUFBTSxzQkFBc0IsQ0FBQztBQUM3RCxPQUFPLEVBQUMsbUJBQW1CLEVBQUUsMkJBQTJCLEVBQUMsTUFBTSxVQUFVLENBQUM7QUFDMUUsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLHFC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SSxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsQ0FBQztLQUN6RTtBQUNILENBQUM7QUFFRDs7Ozs7Ozs7Ozs7O0dBWUc7QUFDSCxNQUFNLFVBQVUscUJBQXFCO0lBQ25DLE1BQU0sS0FBSyxHQUFHLGVBQWUsRUFBRyxDQUFDO0lBQ2pDLFNBQVMsSUFBSSxhQUFhLENBQUMsS0FBSyxFQUFFLG1CQUFtQixDQUFDLENBQUM7SUFDdkQsc0JBQXNCLENBQUMsUUFBUSxFQUFFLENBQUMsS0FBSyxDQUFDLEVBQUUsS0FBSyxDQUFDLENBQUM7QUFDbkQsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge0NoYW5nZURldGVjdG9yUmVmfSBmcm9tICcuLi9jaGFuZ2VfZGV0ZWN0aW9uL2NoYW5nZV9kZXRlY3Rvcl9yZWYnO1xuaW1wb3J0IHtJbmplY3Rvcn0gZnJvbSAnLi4vZGkvaW5qZWN0b3InO1xuaW1wb3J0IHtjb252ZXJ0VG9CaXRGbGFnc30gZnJvbSAnLi4vZGkvaW5qZWN0b3JfY29tcGF0aWJpbGl0eSc7XG5pbXBvcnQge0luamVjdEZsYWdzLCBJbmplY3RPcHRpb25zfSBmcm9tICcuLi9kaS9pbnRlcmZhY2UvaW5qZWN0b3InO1xuaW1wb3J0IHtQcm92aWRlclRva2VufSBmcm9tICcuLi9kaS9wcm92aWRlcl90b2tlbic7XG5pbXBvcnQge0Vudmlyb25tZW50SW5qZWN0b3J9IGZyb20gJy4uL2RpL3IzX2luamVjdG9yJztcbmltcG9ydCB7UnVudGltZUVycm9yLCBSdW50aW1lRXJyb3JDb2RlfSBmcm9tICcuLi9lcnJvcnMnO1xuaW1wb3J0IHtEZWh5ZHJhdGVkVmlld30gZnJvbSAnLi4vaHlkcmF0aW9uL2ludGVyZmFjZXMnO1xuaW1wb3J0IHtyZXRyaWV2ZUh5ZHJhdGlvbkluZm99IGZyb20gJy4uL2h5ZHJhdGlvbi91dGlscyc7XG5pbXBvcnQge1R5cGV9IGZyb20gJy4uL2ludGVyZmFjZS90eXBlJztcbmltcG9ydCB7Q29tcG9uZW50RmFjdG9yeSBhcyBBYnN0cmFjdENvbXBvbmVudEZhY3RvcnksIENvbXBvbmVudFJlZiBhcyBBYnN0cmFjdENvbXBvbmVudFJlZn0gZnJvbSAnLi4vbGlua2VyL2NvbXBvbmVudF9mYWN0b3J5JztcbmltcG9ydCB7Q29tcG9uZW50RmFjdG9yeVJlc29sdmVyIGFzIEFic3RyYWN0Q29tcG9uZW50RmFjdG9yeVJlc29sdmVyfSBmcm9tICcuLi9saW5rZXIvY29tcG9uZW50X2ZhY3RvcnlfcmVzb2x2ZXInO1xuaW1wb3J0IHtjcmVhdGVFbGVtZW50UmVmLCBFbGVtZW50UmVmfSBmcm9tICcuLi9saW5rZXIvZWxlbWVudF9yZWYnO1xuaW1wb3J0IHtOZ01vZHVsZVJlZn0gZnJvbSAnLi4vbGlua2VyL25nX21vZHVsZV9mYWN0b3J5JztcbmltcG9ydCB7UmVuZGVyZXIyLCBSZW5kZXJlckZhY3RvcnkyfSBmcm9tICcuLi9yZW5kZXIvYXBpJztcbmltcG9ydCB7U2FuaXRpemVyfSBmcm9tICcuLi9zYW5pdGl6YXRpb24vc2FuaXRpemVyJztcbmltcG9ydCB7YXNzZXJ0RGVmaW5lZCwgYXNzZXJ0R3JlYXRlclRoYW4sIGFzc2VydEluZGV4SW5SYW5nZX0gZnJvbSAnLi4vdXRpbC9hc3NlcnQnO1xuaW1wb3J0IHtWRVJTSU9OfSBmcm9tICcuLi92ZXJzaW9uJztcbmltcG9ydCB7Tk9UX0ZPVU5EX0NIRUNLX09OTFlfRUxFTUVOVF9JTkpFQ1RPUn0gZnJvbSAnLi4vdmlldy9wcm92aWRlcl9mbGFncyc7XG5cbmltcG9ydCB7QWZ0ZXJSZW5kZXJFdmVudE1hbmFnZXJ9IGZyb20gJy4vYWZ0ZXJfcmVuZGVyX2hvb2tzJztcbmltcG9ydCB7YXNzZXJ0Q29tcG9uZW50VHlwZSwgYXNzZXJ0Tm9EdXBsaWNhdGVEaXJlY3RpdmVzfSBmcm9tICcuL2Fzc2VydCc7XG5pbXBvcnQge2F0dGFjaFBhdGNoRGF0YX0gZnJvbSAnLi9jb250ZXh0X2Rpc2NvdmVyeSc7XG5pbXBvcnQge2dldENvbXBvbmVudERlZn0gZnJvbSAnLi9kZWZpbml0aW9uJztcbmltcG9ydCB7ZGVwc1RyYWNrZXJ9IGZyb20gJy4vZGVwc190cmFja2VyL2RlcHNfdHJhY2tlcic7XG5pbXBvcnQge2dldE5vZGVJbmplY3RhYmxlLCBOb2RlSW5qZWN0b3J9IGZyb20gJy4vZGknO1xuaW1wb3J0IHtyZWdpc3RlclBvc3RPcmRlckhvb2tzfSBmcm9tICcuL2hvb2tzJztcbmltcG9ydCB7cmVwb3J0VW5rbm93blByb3BlcnR5RXJyb3J9IGZyb20gJy4vaW5zdHJ1Y3Rpb25zL2VsZW1lbnRfdmFsaWRhdGlvbic7XG5pbXBvcnQge21hcmtWaWV3RGlydHl9IGZyb20gJy4vaW5zdHJ1Y3Rpb25zL21hcmtfdmlld19kaXJ0eSc7XG5pbXBvcnQge3JlbmRlclZpZXd9IGZyb20gJy4vaW5zdHJ1Y3Rpb25zL3JlbmRlcic7XG5pbXBvcnQge2FkZFRvVmlld1RyZWUsIGNyZWF0ZUxWaWV3LCBjcmVhdGVUVmlldywgZXhlY3V0ZUNvbnRlbnRRdWVyaWVzLCBnZXRPckNyZWF0ZUNvbXBvbmVudFRWaWV3LCBnZXRPckNyZWF0ZVROb2RlLCBpbml0aWFsaXplRGlyZWN0aXZlcywgaW52b2tlRGlyZWN0aXZlc0hvc3RCaW5kaW5ncywgbG9jYXRlSG9zdEVsZW1lbnQsIG1hcmtBc0NvbXBvbmVudEhvc3QsIHNldElucHV0c0ZvclByb3BlcnR5fSBmcm9tICcuL2luc3RydWN0aW9ucy9zaGFyZWQnO1xuaW1wb3J0IHtDb21wb25lbnREZWYsIERpcmVjdGl2ZURlZiwgSG9zdERpcmVjdGl2ZURlZnN9IGZyb20gJy4vaW50ZXJmYWNlcy9kZWZpbml0aW9uJztcbmltcG9ydCB7UHJvcGVydHlBbGlhc1ZhbHVlLCBUQ29udGFpbmVyTm9kZSwgVEVsZW1lbnRDb250YWluZXJOb2RlLCBURWxlbWVudE5vZGUsIFROb2RlLCBUTm9kZVR5cGV9IGZyb20gJy4vaW50ZXJmYWNlcy9ub2RlJztcbmltcG9ydCB7UmVuZGVyZXJ9IGZyb20gJy4vaW50ZXJmYWNlcy9yZW5kZXJlcic7XG5pbXBvcnQge1JFbGVtZW50LCBSTm9kZX0gZnJvbSAnLi9pbnRlcmZhY2VzL3JlbmRlcmVyX2RvbSc7XG5pbXBvcnQge0NPTlRFWFQsIEhFQURFUl9PRkZTRVQsIElOSkVDVE9SLCBMVmlldywgTFZpZXdFbnZpcm9ubWVudCwgTFZpZXdGbGFncywgVFZJRVcsIFRWaWV3VHlwZX0gZnJvbSAnLi9pbnRlcmZhY2VzL3ZpZXcnO1xuaW1wb3J0IHtNQVRIX01MX05BTUVTUEFDRSwgU1ZHX05BTUVTUEFDRX0gZnJvbSAnLi9uYW1lc3BhY2VzJztcbmltcG9ydCB7Y3JlYXRlRWxlbWVudE5vZGUsIHNldHVwU3RhdGljQXR0cmlidXRlcywgd3JpdGVEaXJlY3RDbGFzc30gZnJvbSAnLi9ub2RlX21hbmlwdWxhdGlvbic7XG5pbXBvcnQge2V4dHJhY3RBdHRyc0FuZENsYXNzZXNGcm9tU2VsZWN0b3IsIHN0cmluZ2lmeUNTU1NlbGVjdG9yTGlzdH0gZnJvbSAnLi9ub2RlX3NlbGVjdG9yX21hdGNoZXInO1xuaW1wb3J0IHtFZmZlY3RTY2hlZHVsZXJ9IGZyb20gJy4vcmVhY3Rpdml0eS9lZmZlY3QnO1xuaW1wb3J0IHtlbnRlclZpZXcsIGdldEN1cnJlbnRUTm9kZSwgZ2V0TFZpZXcsIGxlYXZlVmlld30gZnJvbSAnLi9zdGF0ZSc7XG5pbXBvcnQge2NvbXB1dGVTdGF0aWNTdHlsaW5nfSBmcm9tICcuL3N0eWxpbmcvc3RhdGljX3N0eWxpbmcnO1xuaW1wb3J0IHttZXJnZUhvc3RBdHRycywgc2V0VXBBdHRyaWJ1dGVzfSBmcm9tICcuL3V0aWwvYXR0cnNfdXRpbHMnO1xuaW1wb3J0IHtkZWJ1Z1N0cmluZ2lmeVR5cGVGb3JFcnJvciwgc3RyaW5naWZ5Rm9yRXJyb3J9IGZyb20gJy4vdXRpbC9zdHJpbmdpZnlfdXRpbHMnO1xuaW1wb3J0IHtnZXRDb21wb25lbnRMVmlld0J5SW5kZXgsIGdldE5hdGl2ZUJ5VE5vZGUsIGdldFROb2RlfSBmcm9tICcuL3V0aWwvdmlld191dGlscyc7XG5pbXBvcnQge1ZpZXdSZWZ9IGZyb20gJy4vdmlld19yZWYnO1xuXG5leHBvcnQgY2xhc3MgQ29tcG9uZW50RmFjdG9yeVJlc29sdmVyIGV4dGVuZHMgQWJzdHJhY3RDb21wb25lbnRGYWN0b3J5UmVzb2x2ZXIge1xuICAvKipcbiAgICogQHBhcmFtIG5nTW9kdWxlIFRoZSBOZ01vZHVsZVJlZiB0byB3aGljaCBhbGwgcmVzb2x2ZWQgZmFjdG9yaWVzIGFyZSBib3VuZC5cbiAgICovXG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgbmdNb2R1bGU/OiBOZ01vZHVsZVJlZjxhbnk+KSB7XG4gICAgc3VwZXIoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIHJlc29sdmVDb21wb25lbnRGYWN0b3J5PFQ+KGNvbXBvbmVudDogVHlwZTxUPik6IEFic3RyYWN0Q29tcG9uZW50RmFjdG9yeTxUPiB7XG4gICAgbmdEZXZNb2RlICYmIGFzc2VydENvbXBvbmVudFR5cGUoY29tcG9uZW50KTtcbiAgICBjb25zdCBjb21wb25lbnREZWYgPSBnZXRDb21wb25lbnREZWYoY29tcG9uZW50KSE7XG4gICAgcmV0dXJuIG5ldyBDb21wb25lbnRGYWN0b3J5KGNvbXBvbmVudERlZiwgdGhpcy5uZ01vZHVsZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdG9SZWZBcnJheShtYXA6IHtba2V5OiBzdHJpbmddOiBzdHJpbmd9KToge3Byb3BOYW1lOiBzdHJpbmc7IHRlbXBsYXRlTmFtZTogc3RyaW5nO31bXSB7XG4gIGNvbnN0IGFycmF5OiB7cHJvcE5hbWU6IHN0cmluZzsgdGVtcGxhdGVOYW1lOiBzdHJpbmc7fVtdID0gW107XG4gIGZvciAobGV0IG5vbk1pbmlmaWVkIGluIG1hcCkge1xuICAgIGlmIChtYXAuaGFzT3duUHJvcGVydHkobm9uTWluaWZpZWQpKSB7XG4gICAgICBjb25zdCBtaW5pZmllZCA9IG1hcFtub25NaW5pZmllZF07XG4gICAgICBhcnJheS5wdXNoKHtwcm9wTmFtZTogbWluaWZpZWQsIHRlbXBsYXRlTmFtZTogbm9uTWluaWZpZWR9KTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGFycmF5O1xufVxuXG5mdW5jdGlvbiBnZXROYW1lc3BhY2UoZWxlbWVudE5hbWU6IHN0cmluZyk6IHN0cmluZ3xudWxsIHtcbiAgY29uc3QgbmFtZSA9IGVsZW1lbnROYW1lLnRvTG93ZXJDYXNlKCk7XG4gIHJldHVybiBuYW1lID09PSAnc3ZnJyA/IFNWR19OQU1FU1BBQ0UgOiAobmFtZSA9PT0gJ21hdGgnID8gTUFUSF9NTF9OQU1FU1BBQ0UgOiBudWxsKTtcbn1cblxuLyoqXG4gKiBJbmplY3RvciB0aGF0IGxvb2tzIHVwIGEgdmFsdWUgdXNpbmcgYSBzcGVjaWZpYyBpbmplY3RvciwgYmVmb3JlIGZhbGxpbmcgYmFjayB0byB0aGUgbW9kdWxlXG4gKiBpbmplY3Rvci4gVXNlZCBwcmltYXJpbHkgd2hlbiBjcmVhdGluZyBjb21wb25lbnRzIG9yIGVtYmVkZGVkIHZpZXdzIGR5bmFtaWNhbGx5LlxuICovXG5leHBvcnQgY2xhc3MgQ2hhaW5lZEluamVjdG9yIGltcGxlbWVudHMgSW5qZWN0b3Ige1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgaW5qZWN0b3I6IEluamVjdG9yLCBwdWJsaWMgcGFyZW50SW5qZWN0b3I6IEluamVjdG9yKSB7fVxuXG4gIGdldDxUPih0b2tlbjogUHJvdmlkZXJUb2tlbjxUPiwgbm90Rm91bmRWYWx1ZT86IFQsIGZsYWdzPzogSW5qZWN0RmxhZ3N8SW5qZWN0T3B0aW9ucyk6IFQge1xuICAgIGZsYWdzID0gY29udmVydFRvQml0RmxhZ3MoZmxhZ3MpO1xuICAgIGNvbnN0IHZhbHVlID0gdGhpcy5pbmplY3Rvci5nZXQ8VHx0eXBlb2YgTk9UX0ZPVU5EX0NIRUNLX09OTFlfRUxFTUVOVF9JTkpFQ1RPUj4oXG4gICAgICAgIHRva2VuLCBOT1RfRk9VTkRfQ0hFQ0tfT05MWV9FTEVNRU5UX0lOSkVDVE9SLCBmbGFncyk7XG5cbiAgICBpZiAodmFsdWUgIT09IE5PVF9GT1VORF9DSEVDS19PTkxZX0VMRU1FTlRfSU5KRUNUT1IgfHxcbiAgICAgICAgbm90Rm91bmRWYWx1ZSA9PT0gKE5PVF9GT1VORF9DSEVDS19PTkxZX0VMRU1FTlRfSU5KRUNUT1IgYXMgdW5rbm93biBhcyBUKSkge1xuICAgICAgLy8gUmV0dXJuIHRoZSB2YWx1ZSBmcm9tIHRoZSByb290IGVsZW1lbnQgaW5qZWN0b3Igd2hlblxuICAgICAgLy8gLSBpdCBwcm92aWRlcyBpdFxuICAgICAgLy8gICAodmFsdWUgIT09IE5PVF9GT1VORF9DSEVDS19PTkxZX0VMRU1FTlRfSU5KRUNUT1IpXG4gICAgICAvLyAtIHRoZSBtb2R1bGUgaW5qZWN0b3Igc2hvdWxkIG5vdCBiZSBjaGVja2VkXG4gICAgICAvLyAgIChub3RGb3VuZFZhbHVlID09PSBOT1RfRk9VTkRfQ0hFQ0tfT05MWV9FTEVNRU5UX0lOSkVDVE9SKVxuICAgICAgcmV0dXJuIHZhbHVlIGFzIFQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMucGFyZW50SW5qZWN0b3IuZ2V0KHRva2VuLCBub3RGb3VuZFZhbHVlLCBmbGFncyk7XG4gIH1cbn1cblxuLyoqXG4gKiBDb21wb25lbnRGYWN0b3J5IGludGVyZmFjZSBpbXBsZW1lbnRhdGlvbi5cbiAqL1xuZXhwb3J0IGNsYXNzIENvbXBvbmVudEZhY3Rvcnk8VD4gZXh0ZW5kcyBBYnN0cmFjdENvbXBvbmVudEZhY3Rvcnk8VD4ge1xuICBvdmVycmlkZSBzZWxlY3Rvcjogc3RyaW5nO1xuICBvdmVycmlkZSBjb21wb25lbnRUeXBlOiBUeXBlPGFueT47XG4gIG92ZXJyaWRlIG5nQ29udGVudFNlbGVjdG9yczogc3RyaW5nW107XG4gIGlzQm91bmRUb01vZHVsZTogYm9vbGVhbjtcblxuICBvdmVycmlkZSBnZXQgaW5wdXRzKCk6IHtcbiAgICBwcm9wTmFtZTogc3RyaW5nLFxuICAgIHRlbXBsYXRlTmFtZTogc3RyaW5nLFxuICAgIHRyYW5zZm9ybT86ICh2YWx1ZTogYW55KSA9PiBhbnksXG4gIH1bXSB7XG4gICAgY29uc3QgY29tcG9uZW50RGVmID0gdGhpcy5jb21wb25lbnREZWY7XG4gICAgY29uc3QgaW5wdXRUcmFuc2Zvcm1zID0gY29tcG9uZW50RGVmLmlucHV0VHJhbnNmb3JtcztcbiAgICBjb25zdCByZWZBcnJheSA9IHRvUmVmQXJyYXkoY29tcG9uZW50RGVmLmlucHV0cykgYXMge1xuICAgICAgcHJvcE5hbWU6IHN0cmluZyxcbiAgICAgIHRlbXBsYXRlTmFtZTogc3RyaW5nLFxuICAgICAgdHJhbnNmb3JtPzogKHZhbHVlOiBhbnkpID0+IGFueSxcbiAgICB9W107XG5cbiAgICBpZiAoaW5wdXRUcmFuc2Zvcm1zICE9PSBudWxsKSB7XG4gICAgICBmb3IgKGNvbnN0IGlucHV0IG9mIHJlZkFycmF5KSB7XG4gICAgICAgIGlmIChpbnB1dFRyYW5zZm9ybXMuaGFzT3duUHJvcGVydHkoaW5wdXQucHJvcE5hbWUpKSB7XG4gICAgICAgICAgaW5wdXQudHJhbnNmb3JtID0gaW5wdXRUcmFuc2Zvcm1zW2lucHV0LnByb3BOYW1lXTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiByZWZBcnJheTtcbiAgfVxuXG4gIG92ZXJyaWRlIGdldCBvdXRwdXRzKCk6IHtwcm9wTmFtZTogc3RyaW5nOyB0ZW1wbGF0ZU5hbWU6IHN0cmluZzt9W10ge1xuICAgIHJldHVybiB0b1JlZkFycmF5KHRoaXMuY29tcG9uZW50RGVmLm91dHB1dHMpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBwYXJhbSBjb21wb25lbnREZWYgVGhlIGNvbXBvbmVudCBkZWZpbml0aW9uLlxuICAgKiBAcGFyYW0gbmdNb2R1bGUgVGhlIE5nTW9kdWxlUmVmIHRvIHdoaWNoIHRoZSBmYWN0b3J5IGlzIGJvdW5kLlxuICAgKi9cbiAgY29uc3RydWN0b3IocHJpdmF0ZSBjb21wb25lbnREZWY6IENvbXBvbmVudERlZjxhbnk+LCBwcml2YXRlIG5nTW9kdWxlPzogTmdNb2R1bGVSZWY8YW55Pikge1xuICAgIHN1cGVyKCk7XG4gICAgdGhpcy5jb21wb25lbnRUeXBlID0gY29tcG9uZW50RGVmLnR5cGU7XG4gICAgdGhpcy5zZWxlY3RvciA9IHN0cmluZ2lmeUNTU1NlbGVjdG9yTGlzdChjb21wb25lbnREZWYuc2VsZWN0b3JzKTtcbiAgICB0aGlzLm5nQ29udGVudFNlbGVjdG9ycyA9XG4gICAgICAgIGNvbXBvbmVudERlZi5uZ0NvbnRlbnRTZWxlY3RvcnMgPyBjb21wb25lbnREZWYubmdDb250ZW50U2VsZWN0b3JzIDogW107XG4gICAgdGhpcy5pc0JvdW5kVG9Nb2R1bGUgPSAhIW5nTW9kdWxlO1xuICB9XG5cbiAgb3ZlcnJpZGUgY3JlYXRlKFxuICAgICAgaW5qZWN0b3I6IEluamVjdG9yLCBwcm9qZWN0YWJsZU5vZGVzPzogYW55W11bXXx1bmRlZmluZWQsIHJvb3RTZWxlY3Rvck9yTm9kZT86IGFueSxcbiAgICAgIGVudmlyb25tZW50SW5qZWN0b3I/OiBOZ01vZHVsZVJlZjxhbnk+fEVudmlyb25tZW50SW5qZWN0b3J8XG4gICAgICB1bmRlZmluZWQpOiBBYnN0cmFjdENvbXBvbmVudFJlZjxUPiB7XG4gICAgLy8gQ2hlY2sgaWYgdGhlIGNvbXBvbmVudCBpcyBvcnBoYW5cbiAgICBpZiAobmdEZXZNb2RlICYmICh0eXBlb2YgbmdKaXRNb2RlID09PSAndW5kZWZpbmVkJyB8fCBuZ0ppdE1vZGUpICYmXG4gICAgICAgIHRoaXMuY29tcG9uZW50RGVmLmRlYnVnSW5mbz8uZm9yYmlkT3JwaGFuUmVuZGVyaW5nKSB7XG4gICAgICBpZiAoZGVwc1RyYWNrZXIuaXNPcnBoYW5Db21wb25lbnQodGhpcy5jb21wb25lbnRUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUnVudGltZUVycm9yKFxuICAgICAgICAgICAgUnVudGltZUVycm9yQ29kZS5SVU5USU1FX0RFUFNfT1JQSEFOX0NPTVBPTkVOVCxcbiAgICAgICAgICAgIGBPcnBoYW4gY29tcG9uZW50IGZvdW5kISBUcnlpbmcgdG8gcmVuZGVyIHRoZSBjb21wb25lbnQgJHtcbiAgICAgICAgICAgICAgICBkZWJ1Z1N0cmluZ2lmeVR5cGVGb3JFcnJvcihcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5jb21wb25lbnRUeXBlKX0gd2l0aG91dCBmaXJzdCBsb2FkaW5nIHRoZSBOZ01vZHVsZSB0aGF0IGRlY2xhcmVzIGl0LiBJdCBpcyByZWNvbW1lbmRlZCB0byBtYWtlIHRoaXMgY29tcG9uZW50IHN0YW5kYWxvbmUgaW4gb3JkZXIgdG8gYXZvaWQgdGhpcyBlcnJvci4gSWYgdGhpcyBpcyBub3QgcG9zc2libGUgbm93LCBpbXBvcnQgdGhlIGNvbXBvbmVudCdzIE5nTW9kdWxlIGluIHRoZSBhcHByb3ByaWF0ZSBOZ01vZHVsZSwgb3IgdGhlIHN0YW5kYWxvbmUgY29tcG9uZW50IGluIHdoaWNoIHlvdSBhcmUgdHJ5aW5nIHRvIHJlbmRlciB0aGlzIGNvbXBvbmVudC4gSWYgdGhpcyBpcyBhIGxhenkgaW1wb3J0LCBsb2FkIHRoZSBOZ01vZHVsZSBsYXppbHkgYXMgd2VsbCBhbmQgdXNlIGl0cyBtb2R1bGUgaW5qZWN0b3IuYCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZW52aXJvbm1lbnRJbmplY3RvciA9IGVudmlyb25tZW50SW5qZWN0b3IgfHwgdGhpcy5uZ01vZHVsZTtcblxuICAgIGxldCByZWFsRW52aXJvbm1lbnRJbmplY3RvciA9IGVudmlyb25tZW50SW5qZWN0b3IgaW5zdGFuY2VvZiBFbnZpcm9ubWVudEluamVjdG9yID9cbiAgICAgICAgZW52aXJvbm1lbnRJbmplY3RvciA6XG4gICAgICAgIGVudmlyb25tZW50SW5qZWN0b3I/LmluamVjdG9yO1xuXG4gICAgaWYgKHJlYWxFbnZpcm9ubWVudEluamVjdG9yICYmIHRoaXMuY29tcG9uZW50RGVmLmdldFN0YW5kYWxvbmVJbmplY3RvciAhPT0gbnVsbCkge1xuICAgICAgcmVhbEVudmlyb25tZW50SW5qZWN0b3IgPSB0aGlzLmNvbXBvbmVudERlZi5nZXRTdGFuZGFsb25lSW5qZWN0b3IocmVhbEVudmlyb25tZW50SW5qZWN0b3IpIHx8XG4gICAgICAgICAgcmVhbEVudmlyb25tZW50SW5qZWN0b3I7XG4gICAgfVxuXG4gICAgY29uc3Qgcm9vdFZpZXdJbmplY3RvciA9XG4gICAgICAgIHJlYWxFbnZpcm9ubWVudEluamVjdG9yID8gbmV3IENoYWluZWRJbmplY3RvcihpbmplY3RvciwgcmVhbEVudmlyb25tZW50SW5qZWN0b3IpIDogaW5qZWN0b3I7XG5cbiAgICBjb25zdCByZW5kZXJlckZhY3RvcnkgPSByb290Vmlld0luamVjdG9yLmdldChSZW5kZXJlckZhY3RvcnkyLCBudWxsKTtcbiAgICBpZiAocmVuZGVyZXJGYWN0b3J5ID09PSBudWxsKSB7XG4gICAgICB0aHJvdyBuZXcgUnVudGltZUVycm9yKFxuICAgICAgICAgIFJ1bnRpbWVFcnJvckNvZGUuUkVOREVSRVJfTk9UX0ZPVU5ELFxuICAgICAgICAgIG5nRGV2TW9kZSAmJlxuICAgICAgICAgICAgICAnQW5ndWxhciB3YXMgbm90IGFibGUgdG8gaW5qZWN0IGEgcmVuZGVyZXIgKFJlbmRlcmVyRmFjdG9yeTIpLiAnICtcbiAgICAgICAgICAgICAgICAgICdMaWtlbHkgdGhpcyBpcyBkdWUgdG8gYSBicm9rZW4gREkgaGllcmFyY2h5LiAnICtcbiAgICAgICAgICAgICAgICAgICdNYWtlIHN1cmUgdGhhdCBhbnkgaW5qZWN0b3IgdXNlZCB0byBjcmVhdGUgdGhpcyBjb21wb25lbnQgaGFzIGEgY29ycmVjdCBwYXJlbnQuJyk7XG4gICAgfVxuICAgIGNvbnN0IHNhbml0aXplciA9IHJvb3RWaWV3SW5qZWN0b3IuZ2V0KFNhbml0aXplciwgbnVsbCk7XG5cbiAgICBjb25zdCBhZnRlclJlbmRlckV2ZW50TWFuYWdlciA9IHJvb3RWaWV3SW5qZWN0b3IuZ2V0KEFmdGVyUmVuZGVyRXZlbnRNYW5hZ2VyLCBudWxsKTtcblxuICAgIGNvbnN0IGVudmlyb25tZW50OiBMVmlld0Vudmlyb25tZW50ID0ge1xuICAgICAgcmVuZGVyZXJGYWN0b3J5LFxuICAgICAgc2FuaXRpemVyLFxuICAgICAgLy8gV2UgZG9uJ3QgdXNlIGlubGluZSBlZmZlY3RzICh5ZXQpLlxuICAgICAgaW5saW5lRWZmZWN0UnVubmVyOiBudWxsLFxuICAgICAgYWZ0ZXJSZW5kZXJFdmVudE1hbmFnZXIsXG4gICAgfTtcblxuICAgIGNvbnN0IGhvc3RSZW5kZXJlciA9IHJlbmRlcmVyRmFjdG9yeS5jcmVhdGVSZW5kZXJlcihudWxsLCB0aGlzLmNvbXBvbmVudERlZik7XG4gICAgLy8gRGV0ZXJtaW5lIGEgdGFnIG5hbWUgdXNlZCBmb3IgY3JlYXRpbmcgaG9zdCBlbGVtZW50cyB3aGVuIHRoaXMgY29tcG9uZW50IGlzIGNyZWF0ZWRcbiAgICAvLyBkeW5hbWljYWxseS4gRGVmYXVsdCB0byAnZGl2JyBpZiB0aGlzIGNvbXBvbmVudCBkaWQgbm90IHNwZWNpZnkgYW55IHRhZyBuYW1lIGluIGl0cyBzZWxlY3Rvci5cbiAgICBjb25zdCBlbGVtZW50TmFtZSA9IHRoaXMuY29tcG9uZW50RGVmLnNlbGVjdG9yc1swXVswXSBhcyBzdHJpbmcgfHwgJ2Rpdic7XG4gICAgY29uc3QgaG9zdFJOb2RlID0gcm9vdFNlbGVjdG9yT3JOb2RlID9cbiAgICAgICAgbG9jYXRlSG9zdEVsZW1lbnQoXG4gICAgICAgICAgICBob3N0UmVuZGVyZXIsIHJvb3RTZWxlY3Rvck9yTm9kZSwgdGhpcy5jb21wb25lbnREZWYuZW5jYXBzdWxhdGlvbiwgcm9vdFZpZXdJbmplY3RvcikgOlxuICAgICAgICBjcmVhdGVFbGVtZW50Tm9kZShob3N0UmVuZGVyZXIsIGVsZW1lbnROYW1lLCBnZXROYW1lc3BhY2UoZWxlbWVudE5hbWUpKTtcblxuICAgIC8vIFNpZ25hbCBjb21wb25lbnRzIHVzZSB0aGUgZ3JhbnVsYXIgXCJSZWZyZXNoVmlld1wiICBmb3IgY2hhbmdlIGRldGVjdGlvblxuICAgIGNvbnN0IHNpZ25hbEZsYWdzID0gKExWaWV3RmxhZ3MuU2lnbmFsVmlldyB8IExWaWV3RmxhZ3MuSXNSb290KTtcbiAgICAvLyBOb24tc2lnbmFsIGNvbXBvbmVudHMgdXNlIHRoZSB0cmFkaXRpb25hbCBcIkNoZWNrQWx3YXlzIG9yIE9uUHVzaC9EaXJ0eVwiIGNoYW5nZSBkZXRlY3Rpb25cbiAgICBjb25zdCBub25TaWduYWxGbGFncyA9IHRoaXMuY29tcG9uZW50RGVmLm9uUHVzaCA/IExWaWV3RmxhZ3MuRGlydHkgfCBMVmlld0ZsYWdzLklzUm9vdCA6XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBMVmlld0ZsYWdzLkNoZWNrQWx3YXlzIHwgTFZpZXdGbGFncy5Jc1Jvb3Q7XG4gICAgY29uc3Qgcm9vdEZsYWdzID0gdGhpcy5jb21wb25lbnREZWYuc2lnbmFscyA/IHNpZ25hbEZsYWdzIDogbm9uU2lnbmFsRmxhZ3M7XG5cbiAgICBsZXQgaHlkcmF0aW9uSW5mbzogRGVoeWRyYXRlZFZpZXd8bnVsbCA9IG51bGw7XG4gICAgaWYgKGhvc3RSTm9kZSAhPT0gbnVsbCkge1xuICAgICAgaHlkcmF0aW9uSW5mbyA9IHJldHJpZXZlSHlkcmF0aW9uSW5mbyhob3N0Uk5vZGUsIHJvb3RWaWV3SW5qZWN0b3IsIHRydWUgLyogaXNSb290VmlldyAqLyk7XG4gICAgfVxuXG4gICAgLy8gQ3JlYXRlIHRoZSByb290IHZpZXcuIFVzZXMgZW1wdHkgVFZpZXcgYW5kIENvbnRlbnRUZW1wbGF0ZS5cbiAgICBjb25zdCByb290VFZpZXcgPVxuICAgICAgICBjcmVhdGVUVmlldyhUVmlld1R5cGUuUm9vdCwgbnVsbCwgbnVsbCwgMSwgMCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCwgbnVsbCk7XG4gICAgY29uc3Qgcm9vdExWaWV3ID0gY3JlYXRlTFZpZXcoXG4gICAgICAgIG51bGwsIHJvb3RUVmlldywgbnVsbCwgcm9vdEZsYWdzLCBudWxsLCBudWxsLCBlbnZpcm9ubWVudCwgaG9zdFJlbmRlcmVyLCByb290Vmlld0luamVjdG9yLFxuICAgICAgICBudWxsLCBoeWRyYXRpb25JbmZvKTtcblxuICAgIC8vIHJvb3RWaWV3IGlzIHRoZSBwYXJlbnQgd2hlbiBib290c3RyYXBwaW5nXG4gICAgLy8gVE9ETyhtaXNrbyk6IGl0IGxvb2tzIGxpa2Ugd2UgYXJlIGVudGVyaW5nIHZpZXcgaGVyZSBidXQgd2UgZG9uJ3QgcmVhbGx5IG5lZWQgdG8gYXNcbiAgICAvLyBgcmVuZGVyVmlld2AgZG9lcyB0aGF0LiBIb3dldmVyIGFzIHRoZSBjb2RlIGlzIHdyaXR0ZW4gaXQgaXMgbmVlZGVkIGJlY2F1c2VcbiAgICAvLyBgY3JlYXRlUm9vdENvbXBvbmVudFZpZXdgIGFuZCBgY3JlYXRlUm9vdENvbXBvbmVudGAgYm90aCByZWFkIGdsb2JhbCBzdGF0ZS4gRml4aW5nIHRob3NlXG4gICAgLy8gaXNzdWVzIHdvdWxkIGFsbG93IHVzIHRvIGRyb3AgdGhpcy5cbiAgICBlbnRlclZpZXcocm9vdExWaWV3KTtcblxuICAgIGxldCBjb21wb25lbnQ6IFQ7XG4gICAgbGV0IHRFbGVtZW50Tm9kZTogVEVsZW1lbnROb2RlO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IHJvb3RDb21wb25lbnREZWYgPSB0aGlzLmNvbXBvbmVudERlZjtcbiAgICAgIGxldCByb290RGlyZWN0aXZlczogRGlyZWN0aXZlRGVmPHVua25vd24+W107XG4gICAgICBsZXQgaG9zdERpcmVjdGl2ZURlZnM6IEhvc3REaXJlY3RpdmVEZWZzfG51bGwgPSBudWxsO1xuXG4gICAgICBpZiAocm9vdENvbXBvbmVudERlZi5maW5kSG9zdERpcmVjdGl2ZURlZnMpIHtcbiAgICAgICAgcm9vdERpcmVjdGl2ZXMgPSBbXTtcbiAgICAgICAgaG9zdERpcmVjdGl2ZURlZnMgPSBuZXcgTWFwKCk7XG4gICAgICAgIHJvb3RDb21wb25lbnREZWYuZmluZEhvc3REaXJlY3RpdmVEZWZzKHJvb3RDb21wb25lbnREZWYsIHJvb3REaXJlY3RpdmVzLCBob3N0RGlyZWN0aXZlRGVmcyk7XG4gICAgICAgIHJvb3REaXJlY3RpdmVzLnB1c2gocm9vdENvbXBvbmVudERlZik7XG4gICAgICAgIG5nRGV2TW9kZSAmJiBhc3NlcnROb0R1cGxpY2F0ZURpcmVjdGl2ZXMocm9vdERpcmVjdGl2ZXMpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcm9vdERpcmVjdGl2ZXMgPSBbcm9vdENvbXBvbmVudERlZl07XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGhvc3RUTm9kZSA9IGNyZWF0ZVJvb3RDb21wb25lbnRUTm9kZShyb290TFZpZXcsIGhvc3RSTm9kZSk7XG4gICAgICBjb25zdCBjb21wb25lbnRWaWV3ID0gY3JlYXRlUm9vdENvbXBvbmVudFZpZXcoXG4gICAgICAgICAgaG9zdFROb2RlLCBob3N0Uk5vZGUsIHJvb3RDb21wb25lbnREZWYsIHJvb3REaXJlY3RpdmVzLCByb290TFZpZXcsIGVudmlyb25tZW50LFxuICAgICAgICAgIGhvc3RSZW5kZXJlcik7XG5cbiAgICAgIHRFbGVtZW50Tm9kZSA9IGdldFROb2RlKHJvb3RUVmlldywgSEVBREVSX09GRlNFVCkgYXMgVEVsZW1lbnROb2RlO1xuXG4gICAgICAvLyBUT0RPKGNyaXNiZXRvKTogaW4gcHJhY3RpY2UgYGhvc3RSTm9kZWAgc2hvdWxkIGFsd2F5cyBiZSBkZWZpbmVkLCBidXQgdGhlcmUgYXJlIHNvbWUgdGVzdHNcbiAgICAgIC8vIHdoZXJlIHRoZSByZW5kZXJlciBpcyBtb2NrZWQgb3V0IGFuZCBgdW5kZWZpbmVkYCBpcyByZXR1cm5lZC4gV2Ugc2hvdWxkIHVwZGF0ZSB0aGUgdGVzdHMgc29cbiAgICAgIC8vIHRoYXQgdGhpcyBjaGVjayBjYW4gYmUgcmVtb3ZlZC5cbiAgICAgIGlmIChob3N0Uk5vZGUpIHtcbiAgICAgICAgc2V0Um9vdE5vZGVBdHRyaWJ1dGVzKGhvc3RSZW5kZXJlciwgcm9vdENvbXBvbmVudERlZiwgaG9zdFJOb2RlLCByb290U2VsZWN0b3JPck5vZGUpO1xuICAgICAgfVxuXG4gICAgICBpZiAocHJvamVjdGFibGVOb2RlcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIHByb2plY3ROb2Rlcyh0RWxlbWVudE5vZGUsIHRoaXMubmdDb250ZW50U2VsZWN0b3JzLCBwcm9qZWN0YWJsZU5vZGVzKTtcbiAgICAgIH1cblxuICAgICAgLy8gVE9ETzogc2hvdWxkIExpZmVjeWNsZUhvb2tzRmVhdHVyZSBhbmQgb3RoZXIgaG9zdCBmZWF0dXJlcyBiZSBnZW5lcmF0ZWQgYnkgdGhlIGNvbXBpbGVyIGFuZFxuICAgICAgLy8gZXhlY3V0ZWQgaGVyZT9cbiAgICAgIC8vIEFuZ3VsYXIgNSByZWZlcmVuY2U6IGh0dHBzOi8vc3RhY2tibGl0ei5jb20vZWRpdC9saWZlY3ljbGUtaG9va3MtdmNyZWZcbiAgICAgIGNvbXBvbmVudCA9IGNyZWF0ZVJvb3RDb21wb25lbnQoXG4gICAgICAgICAgY29tcG9uZW50Vmlldywgcm9vdENvbXBvbmVudERlZiwgcm9vdERpcmVjdGl2ZXMsIGhvc3REaXJlY3RpdmVEZWZzLCByb290TFZpZXcsXG4gICAgICAgICAgW0xpZmVjeWNsZUhvb2tzRmVhdHVyZV0pO1xuICAgICAgcmVuZGVyVmlldyhyb290VFZpZXcsIHJvb3RMVmlldywgbnVsbCk7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGxlYXZlVmlldygpO1xuICAgIH1cblxuICAgIHJldHVybiBuZXcgQ29tcG9uZW50UmVmKFxuICAgICAgICB0aGlzLmNvbXBvbmVudFR5cGUsIGNvbXBvbmVudCwgY3JlYXRlRWxlbWVudFJlZih0RWxlbWVudE5vZGUsIHJvb3RMVmlldyksIHJvb3RMVmlldyxcbiAgICAgICAgdEVsZW1lbnROb2RlKTtcbiAgfVxufVxuXG4vKipcbiAqIFJlcHJlc2VudHMgYW4gaW5zdGFuY2Ugb2YgYSBDb21wb25lbnQgY3JlYXRlZCB2aWEgYSB7QGxpbmsgQ29tcG9uZW50RmFjdG9yeX0uXG4gKlxuICogYENvbXBvbmVudFJlZmAgcHJvdmlkZXMgYWNjZXNzIHRvIHRoZSBDb21wb25lbnQgSW5zdGFuY2UgYXMgd2VsbCBvdGhlciBvYmplY3RzIHJlbGF0ZWQgdG8gdGhpc1xuICogQ29tcG9uZW50IEluc3RhbmNlIGFuZCBhbGxvd3MgeW91IHRvIGRlc3Ryb3kgdGhlIENvbXBvbmVudCBJbnN0YW5jZSB2aWEgdGhlIHtAbGluayAjZGVzdHJveX1cbiAqIG1ldGhvZC5cbiAqXG4gKi9cbmV4cG9ydCBjbGFzcyBDb21wb25lbnRSZWY8VD4gZXh0ZW5kcyBBYnN0cmFjdENvbXBvbmVudFJlZjxUPiB7XG4gIG92ZXJyaWRlIGluc3RhbmNlOiBUO1xuICBvdmVycmlkZSBob3N0VmlldzogVmlld1JlZjxUPjtcbiAgb3ZlcnJpZGUgY2hhbmdlRGV0ZWN0b3JSZWY6IENoYW5nZURldGVjdG9yUmVmO1xuICBvdmVycmlkZSBjb21wb25lbnRUeXBlOiBUeXBlPFQ+O1xuICBwcml2YXRlIHByZXZpb3VzSW5wdXRWYWx1ZXM6IE1hcDxzdHJpbmcsIHVua25vd24+fG51bGwgPSBudWxsO1xuXG4gIGNvbnN0cnVjdG9yKFxuICAgICAgY29tcG9uZW50VHlwZTogVHlwZTxUPiwgaW5zdGFuY2U6IFQsIHB1YmxpYyBsb2NhdGlvbjogRWxlbWVudFJlZiwgcHJpdmF0ZSBfcm9vdExWaWV3OiBMVmlldyxcbiAgICAgIHByaXZhdGUgX3ROb2RlOiBURWxlbWVudE5vZGV8VENvbnRhaW5lck5vZGV8VEVsZW1lbnRDb250YWluZXJOb2RlKSB7XG4gICAgc3VwZXIoKTtcbiAgICB0aGlzLmluc3RhbmNlID0gaW5zdGFuY2U7XG4gICAgdGhpcy5ob3N0VmlldyA9IHRoaXMuY2hhbmdlRGV0ZWN0b3JSZWYgPSBuZXcgVmlld1JlZjxUPihcbiAgICAgICAgX3Jvb3RMVmlldyxcbiAgICAgICAgdW5kZWZpbmVkLCAvKiBfY2RSZWZJbmplY3RpbmdWaWV3ICovXG4gICAgICAgIGZhbHNlLCAgICAgLyogbm90aWZ5RXJyb3JIYW5kbGVyICovXG4gICAgKTtcbiAgICB0aGlzLmNvbXBvbmVudFR5cGUgPSBjb21wb25lbnRUeXBlO1xuICB9XG5cbiAgb3ZlcnJpZGUgc2V0SW5wdXQobmFtZTogc3RyaW5nLCB2YWx1ZTogdW5rbm93bik6IHZvaWQge1xuICAgIGNvbnN0IGlucHV0RGF0YSA9IHRoaXMuX3ROb2RlLmlucHV0cztcbiAgICBsZXQgZGF0YVZhbHVlOiBQcm9wZXJ0eUFsaWFzVmFsdWV8dW5kZWZpbmVkO1xuICAgIGlmIChpbnB1dERhdGEgIT09IG51bGwgJiYgKGRhdGFWYWx1ZSA9IGlucHV0RGF0YVtuYW1lXSkpIHtcbiAgICAgIHRoaXMucHJldmlvdXNJbnB1dFZhbHVlcyA/Pz0gbmV3IE1hcCgpO1xuICAgICAgLy8gRG8gbm90IHNldCB0aGUgaW5wdXQgaWYgaXQgaXMgdGhlIHNhbWUgYXMgdGhlIGxhc3QgdmFsdWVcbiAgICAgIC8vIFRoaXMgYmVoYXZpb3IgbWF0Y2hlcyBgYmluZGluZ1VwZGF0ZWRgIHdoZW4gYmluZGluZyBpbnB1dHMgaW4gdGVtcGxhdGVzLlxuICAgICAgaWYgKHRoaXMucHJldmlvdXNJbnB1dFZhbHVlcy5oYXMobmFtZSkgJiZcbiAgICAgICAgICBPYmplY3QuaXModGhpcy5wcmV2aW91c0lucHV0VmFsdWVzLmdldChuYW1lKSwgdmFsdWUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgY29uc3QgbFZpZXcgPSB0aGlzLl9yb290TFZpZXc7XG4gICAgICBzZXRJbnB1dHNGb3JQcm9wZXJ0eShsVmlld1tUVklFV10sIGxWaWV3LCBkYXRhVmFsdWUsIG5hbWUsIHZhbHVlKTtcbiAgICAgIHRoaXMucHJldmlvdXNJbnB1dFZhbHVlcy5zZXQobmFtZSwgdmFsdWUpO1xuICAgICAgY29uc3QgY2hpbGRDb21wb25lbnRMVmlldyA9IGdldENvbXBvbmVudExWaWV3QnlJbmRleCh0aGlzLl90Tm9kZS5pbmRleCwgbFZpZXcpO1xuICAgICAgbWFya1ZpZXdEaXJ0eShjaGlsZENvbXBvbmVudExWaWV3KTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKG5nRGV2TW9kZSkge1xuICAgICAgICBjb25zdCBjbXBOYW1lRm9yRXJyb3IgPSBzdHJpbmdpZnlGb3JFcnJvcih0aGlzLmNvbXBvbmVudFR5cGUpO1xuICAgICAgICBsZXQgbWVzc2FnZSA9XG4gICAgICAgICAgICBgQ2FuJ3Qgc2V0IHZhbHVlIG9mIHRoZSAnJHtuYW1lfScgaW5wdXQgb24gdGhlICcke2NtcE5hbWVGb3JFcnJvcn0nIGNvbXBvbmVudC4gYDtcbiAgICAgICAgbWVzc2FnZSArPSBgTWFrZSBzdXJlIHRoYXQgdGhlICcke1xuICAgICAgICAgICAgbmFtZX0nIHByb3BlcnR5IGlzIGFubm90YXRlZCB3aXRoIEBJbnB1dCgpIG9yIGEgbWFwcGVkIEBJbnB1dCgnJHtuYW1lfScpIGV4aXN0cy5gO1xuICAgICAgICByZXBvcnRVbmtub3duUHJvcGVydHlFcnJvcihtZXNzYWdlKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBvdmVycmlkZSBnZXQgaW5qZWN0b3IoKTogSW5qZWN0b3Ige1xuICAgIHJldHVybiBuZXcgTm9kZUluamVjdG9yKHRoaXMuX3ROb2RlLCB0aGlzLl9yb290TFZpZXcpO1xuICB9XG5cbiAgb3ZlcnJpZGUgZGVzdHJveSgpOiB2b2lkIHtcbiAgICB0aGlzLmhvc3RWaWV3LmRlc3Ryb3koKTtcbiAgfVxuXG4gIG92ZXJyaWRlIG9uRGVzdHJveShjYWxsYmFjazogKCkgPT4gdm9pZCk6IHZvaWQge1xuICAgIHRoaXMuaG9zdFZpZXcub25EZXN0cm95KGNhbGxiYWNrKTtcbiAgfVxufVxuXG4vKiogUmVwcmVzZW50cyBhIEhvc3RGZWF0dXJlIGZ1bmN0aW9uLiAqL1xudHlwZSBIb3N0RmVhdHVyZSA9ICg8VD4oY29tcG9uZW50OiBULCBjb21wb25lbnREZWY6IENvbXBvbmVudERlZjxUPikgPT4gdm9pZCk7XG5cbi8qKiBDcmVhdGVzIGEgVE5vZGUgdGhhdCBjYW4gYmUgdXNlZCB0byBpbnN0YW50aWF0ZSBhIHJvb3QgY29tcG9uZW50LiAqL1xuZnVuY3Rpb24gY3JlYXRlUm9vdENvbXBvbmVudFROb2RlKGxWaWV3OiBMVmlldywgck5vZGU6IFJOb2RlKTogVEVsZW1lbnROb2RlIHtcbiAgY29uc3QgdFZpZXcgPSBsVmlld1tUVklFV107XG4gIGNvbnN0IGluZGV4ID0gSEVBREVSX09GRlNFVDtcbiAgbmdEZXZNb2RlICYmIGFzc2VydEluZGV4SW5SYW5nZShsVmlldywgaW5kZXgpO1xuICBsVmlld1tpbmRleF0gPSByTm9kZTtcblxuICAvLyAnI2hvc3QnIGlzIGFkZGVkIGhlcmUgYXMgd2UgZG9uJ3Qga25vdyB0aGUgcmVhbCBob3N0IERPTSBuYW1lICh3ZSBkb24ndCB3YW50IHRvIHJlYWQgaXQpIGFuZCBhdFxuICAvLyB0aGUgc2FtZSB0aW1lIHdlIHdhbnQgdG8gY29tbXVuaWNhdGUgdGhlIGRlYnVnIGBUTm9kZWAgdGhhdCB0aGlzIGlzIGEgc3BlY2lhbCBgVE5vZGVgXG4gIC8vIHJlcHJlc2VudGluZyBhIGhvc3QgZWxlbWVudC5cbiAgcmV0dXJuIGdldE9yQ3JlYXRlVE5vZGUodFZpZXcsIGluZGV4LCBUTm9kZVR5cGUuRWxlbWVudCwgJyNob3N0JywgbnVsbCk7XG59XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgcm9vdCBjb21wb25lbnQgdmlldyBhbmQgdGhlIHJvb3QgY29tcG9uZW50IG5vZGUuXG4gKlxuICogQHBhcmFtIGhvc3RSTm9kZSBSZW5kZXIgaG9zdCBlbGVtZW50LlxuICogQHBhcmFtIHJvb3RDb21wb25lbnREZWYgQ29tcG9uZW50RGVmXG4gKiBAcGFyYW0gcm9vdFZpZXcgVGhlIHBhcmVudCB2aWV3IHdoZXJlIHRoZSBob3N0IG5vZGUgaXMgc3RvcmVkXG4gKiBAcGFyYW0gcmVuZGVyZXJGYWN0b3J5IEZhY3RvcnkgdG8gYmUgdXNlZCBmb3IgY3JlYXRpbmcgY2hpbGQgcmVuZGVyZXJzLlxuICogQHBhcmFtIGhvc3RSZW5kZXJlciBUaGUgY3VycmVudCByZW5kZXJlclxuICogQHBhcmFtIHNhbml0aXplciBUaGUgc2FuaXRpemVyLCBpZiBwcm92aWRlZFxuICpcbiAqIEByZXR1cm5zIENvbXBvbmVudCB2aWV3IGNyZWF0ZWRcbiAqL1xuZnVuY3Rpb24gY3JlYXRlUm9vdENvbXBvbmVudFZpZXcoXG4gICAgdE5vZGU6IFRFbGVtZW50Tm9kZSwgaG9zdFJOb2RlOiBSRWxlbWVudHxudWxsLCByb290Q29tcG9uZW50RGVmOiBDb21wb25lbnREZWY8YW55PixcbiAgICByb290RGlyZWN0aXZlczogRGlyZWN0aXZlRGVmPGFueT5bXSwgcm9vdFZpZXc6IExWaWV3LCBlbnZpcm9ubWVudDogTFZpZXdFbnZpcm9ubWVudCxcbiAgICBob3N0UmVuZGVyZXI6IFJlbmRlcmVyKTogTFZpZXcge1xuICBjb25zdCB0VmlldyA9IHJvb3RWaWV3W1RWSUVXXTtcbiAgYXBwbHlSb290Q29tcG9uZW50U3R5bGluZyhyb290RGlyZWN0aXZlcywgdE5vZGUsIGhvc3RSTm9kZSwgaG9zdFJlbmRlcmVyKTtcblxuICAvLyBIeWRyYXRpb24gaW5mbyBpcyBvbiB0aGUgaG9zdCBlbGVtZW50IGFuZCBuZWVkcyB0byBiZSByZXRyaWV2ZWRcbiAgLy8gYW5kIHBhc3NlZCB0byB0aGUgY29tcG9uZW50IExWaWV3LlxuICBsZXQgaHlkcmF0aW9uSW5mbzogRGVoeWRyYXRlZFZpZXd8bnVsbCA9IG51bGw7XG4gIGlmIChob3N0Uk5vZGUgIT09IG51bGwpIHtcbiAgICBoeWRyYXRpb25JbmZvID0gcmV0cmlldmVIeWRyYXRpb25JbmZvKGhvc3RSTm9kZSwgcm9vdFZpZXdbSU5KRUNUT1JdISk7XG4gIH1cbiAgY29uc3Qgdmlld1JlbmRlcmVyID0gZW52aXJvbm1lbnQucmVuZGVyZXJGYWN0b3J5LmNyZWF0ZVJlbmRlcmVyKGhvc3RSTm9kZSwgcm9vdENvbXBvbmVudERlZik7XG4gIGxldCBsVmlld0ZsYWdzID0gTFZpZXdGbGFncy5DaGVja0Fsd2F5cztcbiAgaWYgKHJvb3RDb21wb25lbnREZWYuc2lnbmFscykge1xuICAgIGxWaWV3RmxhZ3MgPSBMVmlld0ZsYWdzLlNpZ25hbFZpZXc7XG4gIH0gZWxzZSBpZiAocm9vdENvbXBvbmVudERlZi5vblB1c2gpIHtcbiAgICBsVmlld0ZsYWdzID0gTFZpZXdGbGFncy5EaXJ0eTtcbiAgfVxuICBjb25zdCBjb21wb25lbnRWaWV3ID0gY3JlYXRlTFZpZXcoXG4gICAgICByb290VmlldywgZ2V0T3JDcmVhdGVDb21wb25lbnRUVmlldyhyb290Q29tcG9uZW50RGVmKSwgbnVsbCwgbFZpZXdGbGFncyxcbiAgICAgIHJvb3RWaWV3W3ROb2RlLmluZGV4XSwgdE5vZGUsIGVudmlyb25tZW50LCB2aWV3UmVuZGVyZXIsIG51bGwsIG51bGwsIGh5ZHJhdGlvbkluZm8pO1xuXG4gIGlmICh0Vmlldy5maXJzdENyZWF0ZVBhc3MpIHtcbiAgICBtYXJrQXNDb21wb25lbnRIb3N0KHRWaWV3LCB0Tm9kZSwgcm9vdERpcmVjdGl2ZXMubGVuZ3RoIC0gMSk7XG4gIH1cblxuICBhZGRUb1ZpZXdUcmVlKHJvb3RWaWV3LCBjb21wb25lbnRWaWV3KTtcblxuICAvLyBTdG9yZSBjb21wb25lbnQgdmlldyBhdCBub2RlIGluZGV4LCB3aXRoIG5vZGUgYXMgdGhlIEhPU1RcbiAgcmV0dXJuIHJvb3RWaWV3W3ROb2RlLmluZGV4XSA9IGNvbXBvbmVudFZpZXc7XG59XG5cbi8qKiBTZXRzIHVwIHRoZSBzdHlsaW5nIGluZm9ybWF0aW9uIG9uIGEgcm9vdCBjb21wb25lbnQuICovXG5mdW5jdGlvbiBhcHBseVJvb3RDb21wb25lbnRTdHlsaW5nKFxuICAgIHJvb3REaXJlY3RpdmVzOiBEaXJlY3RpdmVEZWY8YW55PltdLCB0Tm9kZTogVEVsZW1lbnROb2RlLCByTm9kZTogUkVsZW1lbnR8bnVsbCxcbiAgICBob3N0UmVuZGVyZXI6IFJlbmRlcmVyKTogdm9pZCB7XG4gIGZvciAoY29uc3QgZGVmIG9mIHJvb3REaXJlY3RpdmVzKSB7XG4gICAgdE5vZGUubWVyZ2VkQXR0cnMgPSBtZXJnZUhvc3RBdHRycyh0Tm9kZS5tZXJnZWRBdHRycywgZGVmLmhvc3RBdHRycyk7XG4gIH1cblxuICBpZiAodE5vZGUubWVyZ2VkQXR0cnMgIT09IG51bGwpIHtcbiAgICBjb21wdXRlU3RhdGljU3R5bGluZyh0Tm9kZSwgdE5vZGUubWVyZ2VkQXR0cnMsIHRydWUpO1xuXG4gICAgaWYgKHJOb2RlICE9PSBudWxsKSB7XG4gICAgICBzZXR1cFN0YXRpY0F0dHJpYnV0ZXMoaG9zdFJlbmRlcmVyLCByTm9kZSwgdE5vZGUpO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENyZWF0ZXMgYSByb290IGNvbXBvbmVudCBhbmQgc2V0cyBpdCB1cCB3aXRoIGZlYXR1cmVzIGFuZCBob3N0IGJpbmRpbmdzLlNoYXJlZCBieVxuICogcmVuZGVyQ29tcG9uZW50KCkgYW5kIFZpZXdDb250YWluZXJSZWYuY3JlYXRlQ29tcG9uZW50KCkuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVJvb3RDb21wb25lbnQ8VD4oXG4gICAgY29tcG9uZW50VmlldzogTFZpZXcsIHJvb3RDb21wb25lbnREZWY6IENvbXBvbmVudERlZjxUPiwgcm9vdERpcmVjdGl2ZXM6IERpcmVjdGl2ZURlZjxhbnk+W10sXG4gICAgaG9zdERpcmVjdGl2ZURlZnM6IEhvc3REaXJlY3RpdmVEZWZzfG51bGwsIHJvb3RMVmlldzogTFZpZXcsXG4gICAgaG9zdEZlYXR1cmVzOiBIb3N0RmVhdHVyZVtdfG51bGwpOiBhbnkge1xuICBjb25zdCByb290VE5vZGUgPSBnZXRDdXJyZW50VE5vZGUoKSBhcyBURWxlbWVudE5vZGU7XG4gIG5nRGV2TW9kZSAmJiBhc3NlcnREZWZpbmVkKHJvb3RUTm9kZSwgJ3ROb2RlIHNob3VsZCBoYXZlIGJlZW4gYWxyZWFkeSBjcmVhdGVkJyk7XG4gIGNvbnN0IHRWaWV3ID0gcm9vdExWaWV3W1RWSUVXXTtcbiAgY29uc3QgbmF0aXZlID0gZ2V0TmF0aXZlQnlUTm9kZShyb290VE5vZGUsIHJvb3RMVmlldyk7XG5cbiAgaW5pdGlhbGl6ZURpcmVjdGl2ZXModFZpZXcsIHJvb3RMVmlldywgcm9vdFROb2RlLCByb290RGlyZWN0aXZlcywgbnVsbCwgaG9zdERpcmVjdGl2ZURlZnMpO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgcm9vdERpcmVjdGl2ZXMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBkaXJlY3RpdmVJbmRleCA9IHJvb3RUTm9kZS5kaXJlY3RpdmVTdGFydCArIGk7XG4gICAgY29uc3QgZGlyZWN0aXZlSW5zdGFuY2UgPSBnZXROb2RlSW5qZWN0YWJsZShyb290TFZpZXcsIHRWaWV3LCBkaXJlY3RpdmVJbmRleCwgcm9vdFROb2RlKTtcbiAgICBhdHRhY2hQYXRjaERhdGEoZGlyZWN0aXZlSW5zdGFuY2UsIHJvb3RMVmlldyk7XG4gIH1cblxuICBpbnZva2VEaXJlY3RpdmVzSG9zdEJpbmRpbmdzKHRWaWV3LCByb290TFZpZXcsIHJvb3RUTm9kZSk7XG5cbiAgaWYgKG5hdGl2ZSkge1xuICAgIGF0dGFjaFBhdGNoRGF0YShuYXRpdmUsIHJvb3RMVmlldyk7XG4gIH1cblxuICAvLyBXZSdyZSBndWFyYW50ZWVkIGZvciB0aGUgYGNvbXBvbmVudE9mZnNldGAgdG8gYmUgcG9zaXRpdmUgaGVyZVxuICAvLyBzaW5jZSBhIHJvb3QgY29tcG9uZW50IGFsd2F5cyBtYXRjaGVzIGEgY29tcG9uZW50IGRlZi5cbiAgbmdEZXZNb2RlICYmXG4gICAgICBhc3NlcnRHcmVhdGVyVGhhbihyb290VE5vZGUuY29tcG9uZW50T2Zmc2V0LCAtMSwgJ2NvbXBvbmVudE9mZnNldCBtdXN0IGJlIGdyZWF0IHRoYW4gLTEnKTtcbiAgY29uc3QgY29tcG9uZW50ID0gZ2V0Tm9kZUluamVjdGFibGUoXG4gICAgICByb290TFZpZXcsIHRWaWV3LCByb290VE5vZGUuZGlyZWN0aXZlU3RhcnQgKyByb290VE5vZGUuY29tcG9uZW50T2Zmc2V0LCByb290VE5vZGUpO1xuICBjb21wb25lbnRWaWV3W0NPTlRFWFRdID0gcm9vdExWaWV3W0NPTlRFWFRdID0gY29tcG9uZW50O1xuXG4gIGlmIChob3N0RmVhdHVyZXMgIT09IG51bGwpIHtcbiAgICBmb3IgKGNvbnN0IGZlYXR1cmUgb2YgaG9zdEZlYXR1cmVzKSB7XG4gICAgICBmZWF0dXJlKGNvbXBvbmVudCwgcm9vdENvbXBvbmVudERlZik7XG4gICAgfVxuICB9XG5cbiAgLy8gV2Ugd2FudCB0byBnZW5lcmF0ZSBhbiBlbXB0eSBRdWVyeUxpc3QgZm9yIHJvb3QgY29udGVudCBxdWVyaWVzIGZvciBiYWNrd2FyZHNcbiAgLy8gY29tcGF0aWJpbGl0eSB3aXRoIFZpZXdFbmdpbmUuXG4gIGV4ZWN1dGVDb250ZW50UXVlcmllcyh0Vmlldywgcm9vdFROb2RlLCBjb21wb25lbnRWaWV3KTtcblxuICByZXR1cm4gY29tcG9uZW50O1xufVxuXG4vKiogU2V0cyB0aGUgc3RhdGljIGF0dHJpYnV0ZXMgb24gYSByb290IGNvbXBvbmVudC4gKi9cbmZ1bmN0aW9uIHNldFJvb3ROb2RlQXR0cmlidXRlcyhcbiAgICBob3N0UmVuZGVyZXI6IFJlbmRlcmVyMiwgY29tcG9uZW50RGVmOiBDb21wb25lbnREZWY8dW5rbm93bj4sIGhvc3RSTm9kZTogUkVsZW1lbnQsXG4gICAgcm9vdFNlbGVjdG9yT3JOb2RlOiBhbnkpIHtcbiAgaWYgKHJvb3RTZWxlY3Rvck9yTm9kZSkge1xuICAgIHNldFVwQXR0cmlidXRlcyhob3N0UmVuZGVyZXIsIGhvc3RSTm9kZSwgWyduZy12ZXJzaW9uJywgVkVSU0lPTi5mdWxsXSk7XG4gIH0gZWxzZSB7XG4gICAgLy8gSWYgaG9zdCBlbGVtZW50IGlzIGNyZWF0ZWQgYXMgYSBwYXJ0IG9mIHRoaXMgZnVuY3Rpb24gY2FsbCAoaS5lLiBgcm9vdFNlbGVjdG9yT3JOb2RlYFxuICAgIC8vIGlzIG5vdCBkZWZpbmVkKSwgYWxzbyBhcHBseSBhdHRyaWJ1dGVzIGFuZCBjbGFzc2VzIGV4dHJhY3RlZCBmcm9tIGNvbXBvbmVudCBzZWxlY3Rvci5cbiAgICAvLyBFeHRyYWN0IGF0dHJpYnV0ZXMgYW5kIGNsYXNzZXMgZnJvbSB0aGUgZmlyc3Qgc2VsZWN0b3Igb25seSB0byBtYXRjaCBWRSBiZWhhdmlvci5cbiAgICBjb25zdCB7YXR0cnMsIGNsYXNzZXN9ID0gZXh0cmFjdEF0dHJzQW5kQ2xhc3Nlc0Zyb21TZWxlY3Rvcihjb21wb25lbnREZWYuc2VsZWN0b3JzWzBdKTtcbiAgICBpZiAoYXR0cnMpIHtcbiAgICAgIHNldFVwQXR0cmlidXRlcyhob3N0UmVuZGVyZXIsIGhvc3RSTm9kZSwgYXR0cnMpO1xuICAgIH1cbiAgICBpZiAoY2xhc3NlcyAmJiBjbGFzc2VzLmxlbmd0aCA+IDApIHtcbiAgICAgIHdyaXRlRGlyZWN0Q2xhc3MoaG9zdFJlbmRlcmVyLCBob3N0Uk5vZGUsIGNsYXNzZXMuam9pbignICcpKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqIFByb2plY3RzIHRoZSBgcHJvamVjdGFibGVOb2Rlc2AgdGhhdCB3ZXJlIHNwZWNpZmllZCB3aGVuIGNyZWF0aW5nIGEgcm9vdCBjb21wb25lbnQuICovXG5mdW5jdGlvbiBwcm9qZWN0Tm9kZXMoXG4gICAgdE5vZGU6IFRFbGVtZW50Tm9kZSwgbmdDb250ZW50U2VsZWN0b3JzOiBzdHJpbmdbXSwgcHJvamVjdGFibGVOb2RlczogYW55W11bXSkge1xuICBjb25zdCBwcm9qZWN0aW9uOiAoVE5vZGV8Uk5vZGVbXXxudWxsKVtdID0gdE5vZGUucHJvamVjdGlvbiA9IFtdO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IG5nQ29udGVudFNlbGVjdG9ycy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IG5vZGVzZm9yU2xvdCA9IHByb2plY3RhYmxlTm9kZXNbaV07XG4gICAgLy8gUHJvamVjdGFibGUgbm9kZXMgY2FuIGJlIHBhc3NlZCBhcyBhcnJheSBvZiBhcnJheXMgb3IgYW4gYXJyYXkgb2YgaXRlcmFibGVzIChuZ1VwZ3JhZGVcbiAgICAvLyBjYXNlKS4gSGVyZSB3ZSBkbyBub3JtYWxpemUgcGFzc2VkIGRhdGEgc3RydWN0dXJlIHRvIGJlIGFuIGFycmF5IG9mIGFycmF5cyB0byBhdm9pZFxuICAgIC8vIGNvbXBsZXggY2hlY2tzIGRvd24gdGhlIGxpbmUuXG4gICAgLy8gV2UgYWxzbyBub3JtYWxpemUgdGhlIGxlbmd0aCBvZiB0aGUgcGFzc2VkIGluIHByb2plY3RhYmxlIG5vZGVzICh0byBtYXRjaCB0aGUgbnVtYmVyIG9mXG4gICAgLy8gPG5nLWNvbnRhaW5lcj4gc2xvdHMgZGVmaW5lZCBieSBhIGNvbXBvbmVudCkuXG4gICAgcHJvamVjdGlvbi5wdXNoKG5vZGVzZm9yU2xvdCAhPSBudWxsID8gQXJyYXkuZnJvbShub2Rlc2ZvclNsb3QpIDogbnVsbCk7XG4gIH1cbn1cblxuLyoqXG4gKiBVc2VkIHRvIGVuYWJsZSBsaWZlY3ljbGUgaG9va3Mgb24gdGhlIHJvb3QgY29tcG9uZW50LlxuICpcbiAqIEluY2x1ZGUgdGhpcyBmZWF0dXJlIHdoZW4gY2FsbGluZyBgcmVuZGVyQ29tcG9uZW50YCBpZiB0aGUgcm9vdCBjb21wb25lbnRcbiAqIHlvdSBhcmUgcmVuZGVyaW5nIGhhcyBsaWZlY3ljbGUgaG9va3MgZGVmaW5lZC4gT3RoZXJ3aXNlLCB0aGUgaG9va3Mgd29uJ3RcbiAqIGJlIGNhbGxlZCBwcm9wZXJseS5cbiAqXG4gKiBFeGFtcGxlOlxuICpcbiAqIGBgYFxuICogcmVuZGVyQ29tcG9uZW50KEFwcENvbXBvbmVudCwge2hvc3RGZWF0dXJlczogW0xpZmVjeWNsZUhvb2tzRmVhdHVyZV19KTtcbiAqIGBgYFxuICovXG5leHBvcnQgZnVuY3Rpb24gTGlmZWN5Y2xlSG9va3NGZWF0dXJlKCk6IHZvaWQge1xuICBjb25zdCB0Tm9kZSA9IGdldEN1cnJlbnRUTm9kZSgpITtcbiAgbmdEZXZNb2RlICYmIGFzc2VydERlZmluZWQodE5vZGUsICdUTm9kZSBpcyByZXF1aXJlZCcpO1xuICByZWdpc3RlclBvc3RPcmRlckhvb2tzKGdldExWaWV3KClbVFZJRVddLCB0Tm9kZSk7XG59XG4iXX0=