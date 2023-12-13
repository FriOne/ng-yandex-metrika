/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ResourceLoader } from '@angular/compiler';
import { ApplicationInitStatus, Compiler, COMPILER_OPTIONS, Injector, LOCALE_ID, ModuleWithComponentFactories, provideZoneChangeDetection, resolveForwardRef, ɵclearResolutionOfComponentResourcesQueue, ɵcompileComponent as compileComponent, ɵcompileDirective as compileDirective, ɵcompileNgModuleDefs as compileNgModuleDefs, ɵcompilePipe as compilePipe, ɵDEFAULT_LOCALE_ID as DEFAULT_LOCALE_ID, ɵDEFER_BLOCK_CONFIG as DEFER_BLOCK_CONFIG, ɵDeferBlockBehavior as DeferBlockBehavior, ɵdepsTracker as depsTracker, ɵgenerateStandaloneInDeclarationsError, ɵgetAsyncClassMetadataFn as getAsyncClassMetadataFn, ɵgetInjectableDef as getInjectableDef, ɵisComponentDefPendingResolution, ɵisEnvironmentProviders as isEnvironmentProviders, ɵNG_COMP_DEF as NG_COMP_DEF, ɵNG_DIR_DEF as NG_DIR_DEF, ɵNG_INJ_DEF as NG_INJ_DEF, ɵNG_MOD_DEF as NG_MOD_DEF, ɵNG_PIPE_DEF as NG_PIPE_DEF, ɵNgModuleFactory as R3NgModuleFactory, ɵpatchComponentDefWithScope as patchComponentDefWithScope, ɵRender3ComponentFactory as ComponentFactory, ɵRender3NgModuleRef as NgModuleRef, ɵresolveComponentResources, ɵrestoreComponentResolutionQueue, ɵsetLocaleId as setLocaleId, ɵtransitiveScopesFor as transitiveScopesFor, ɵUSE_RUNTIME_DEPS_TRACKER_FOR_JIT as USE_RUNTIME_DEPS_TRACKER_FOR_JIT } from '@angular/core';
import { ComponentResolver, DirectiveResolver, NgModuleResolver, PipeResolver } from './resolvers';
var TestingModuleOverride;
(function (TestingModuleOverride) {
    TestingModuleOverride[TestingModuleOverride["DECLARATION"] = 0] = "DECLARATION";
    TestingModuleOverride[TestingModuleOverride["OVERRIDE_TEMPLATE"] = 1] = "OVERRIDE_TEMPLATE";
})(TestingModuleOverride || (TestingModuleOverride = {}));
function isTestingModuleOverride(value) {
    return value === TestingModuleOverride.DECLARATION ||
        value === TestingModuleOverride.OVERRIDE_TEMPLATE;
}
function assertNoStandaloneComponents(types, resolver, location) {
    types.forEach(type => {
        if (!getAsyncClassMetadataFn(type)) {
            const component = resolver.resolve(type);
            if (component && component.standalone) {
                throw new Error(ɵgenerateStandaloneInDeclarationsError(type, location));
            }
        }
    });
}
export class TestBedCompiler {
    constructor(platform, additionalModuleTypes) {
        this.platform = platform;
        this.additionalModuleTypes = additionalModuleTypes;
        this.originalComponentResolutionQueue = null;
        // Testing module configuration
        this.declarations = [];
        this.imports = [];
        this.providers = [];
        this.schemas = [];
        // Queues of components/directives/pipes that should be recompiled.
        this.pendingComponents = new Set();
        this.pendingDirectives = new Set();
        this.pendingPipes = new Set();
        // Keep track of all components and directives, so we can patch Providers onto defs later.
        this.seenComponents = new Set();
        this.seenDirectives = new Set();
        // Keep track of overridden modules, so that we can collect all affected ones in the module tree.
        this.overriddenModules = new Set();
        // Store resolved styles for Components that have template overrides present and `styleUrls`
        // defined at the same time.
        this.existingComponentStyles = new Map();
        this.resolvers = initResolvers();
        // Map of component type to an NgModule that declares it.
        //
        // There are a couple special cases:
        // - for standalone components, the module scope value is `null`
        // - when a component is declared in `TestBed.configureTestingModule()` call or
        //   a component's template is overridden via `TestBed.overrideTemplateUsingTestingModule()`.
        //   we use a special value from the `TestingModuleOverride` enum.
        this.componentToModuleScope = new Map();
        // Map that keeps initial version of component/directive/pipe defs in case
        // we compile a Type again, thus overriding respective static fields. This is
        // required to make sure we restore defs to their initial states between test runs.
        // Note: one class may have multiple defs (for example: ɵmod and ɵinj in case of an
        // NgModule), store all of them in a map.
        this.initialNgDefs = new Map();
        // Array that keeps cleanup operations for initial versions of component/directive/pipe/module
        // defs in case TestBed makes changes to the originals.
        this.defCleanupOps = [];
        this._injector = null;
        this.compilerProviders = null;
        this.providerOverrides = [];
        this.rootProviderOverrides = [];
        // Overrides for injectables with `{providedIn: SomeModule}` need to be tracked and added to that
        // module's provider list.
        this.providerOverridesByModule = new Map();
        this.providerOverridesByToken = new Map();
        this.scopesWithOverriddenProviders = new Set();
        this.testModuleRef = null;
        this.deferBlockBehavior = DeferBlockBehavior.Manual;
        class DynamicTestModule {
        }
        this.testModuleType = DynamicTestModule;
    }
    setCompilerProviders(providers) {
        this.compilerProviders = providers;
        this._injector = null;
    }
    configureTestingModule(moduleDef) {
        // Enqueue any compilation tasks for the directly declared component.
        if (moduleDef.declarations !== undefined) {
            // Verify that there are no standalone components
            assertNoStandaloneComponents(moduleDef.declarations, this.resolvers.component, '"TestBed.configureTestingModule" call');
            this.queueTypeArray(moduleDef.declarations, TestingModuleOverride.DECLARATION);
            this.declarations.push(...moduleDef.declarations);
        }
        // Enqueue any compilation tasks for imported modules.
        if (moduleDef.imports !== undefined) {
            this.queueTypesFromModulesArray(moduleDef.imports);
            this.imports.push(...moduleDef.imports);
        }
        if (moduleDef.providers !== undefined) {
            this.providers.push(...moduleDef.providers);
        }
        if (moduleDef.schemas !== undefined) {
            this.schemas.push(...moduleDef.schemas);
        }
        this.deferBlockBehavior = moduleDef.deferBlockBehavior ?? DeferBlockBehavior.Manual;
    }
    overrideModule(ngModule, override) {
        if (USE_RUNTIME_DEPS_TRACKER_FOR_JIT) {
            depsTracker.clearScopeCacheFor(ngModule);
        }
        this.overriddenModules.add(ngModule);
        // Compile the module right away.
        this.resolvers.module.addOverride(ngModule, override);
        const metadata = this.resolvers.module.resolve(ngModule);
        if (metadata === null) {
            throw invalidTypeError(ngModule.name, 'NgModule');
        }
        this.recompileNgModule(ngModule, metadata);
        // At this point, the module has a valid module def (ɵmod), but the override may have introduced
        // new declarations or imported modules. Ingest any possible new types and add them to the
        // current queue.
        this.queueTypesFromModulesArray([ngModule]);
    }
    overrideComponent(component, override) {
        this.verifyNoStandaloneFlagOverrides(component, override);
        this.resolvers.component.addOverride(component, override);
        this.pendingComponents.add(component);
    }
    overrideDirective(directive, override) {
        this.verifyNoStandaloneFlagOverrides(directive, override);
        this.resolvers.directive.addOverride(directive, override);
        this.pendingDirectives.add(directive);
    }
    overridePipe(pipe, override) {
        this.verifyNoStandaloneFlagOverrides(pipe, override);
        this.resolvers.pipe.addOverride(pipe, override);
        this.pendingPipes.add(pipe);
    }
    verifyNoStandaloneFlagOverrides(type, override) {
        if (override.add?.hasOwnProperty('standalone') || override.set?.hasOwnProperty('standalone') ||
            override.remove?.hasOwnProperty('standalone')) {
            throw new Error(`An override for the ${type.name} class has the \`standalone\` flag. ` +
                `Changing the \`standalone\` flag via TestBed overrides is not supported.`);
        }
    }
    overrideProvider(token, provider) {
        let providerDef;
        if (provider.useFactory !== undefined) {
            providerDef = {
                provide: token,
                useFactory: provider.useFactory,
                deps: provider.deps || [],
                multi: provider.multi
            };
        }
        else if (provider.useValue !== undefined) {
            providerDef = { provide: token, useValue: provider.useValue, multi: provider.multi };
        }
        else {
            providerDef = { provide: token };
        }
        const injectableDef = typeof token !== 'string' ? getInjectableDef(token) : null;
        const providedIn = injectableDef === null ? null : resolveForwardRef(injectableDef.providedIn);
        const overridesBucket = providedIn === 'root' ? this.rootProviderOverrides : this.providerOverrides;
        overridesBucket.push(providerDef);
        // Keep overrides grouped by token as well for fast lookups using token
        this.providerOverridesByToken.set(token, providerDef);
        if (injectableDef !== null && providedIn !== null && typeof providedIn !== 'string') {
            const existingOverrides = this.providerOverridesByModule.get(providedIn);
            if (existingOverrides !== undefined) {
                existingOverrides.push(providerDef);
            }
            else {
                this.providerOverridesByModule.set(providedIn, [providerDef]);
            }
        }
    }
    overrideTemplateUsingTestingModule(type, template) {
        const def = type[NG_COMP_DEF];
        const hasStyleUrls = () => {
            const metadata = this.resolvers.component.resolve(type);
            return !!metadata.styleUrl || !!metadata.styleUrls?.length;
        };
        const overrideStyleUrls = !!def && !ɵisComponentDefPendingResolution(type) && hasStyleUrls();
        // In Ivy, compiling a component does not require knowing the module providing the
        // component's scope, so overrideTemplateUsingTestingModule can be implemented purely via
        // overrideComponent. Important: overriding template requires full Component re-compilation,
        // which may fail in case styleUrls are also present (thus Component is considered as required
        // resolution). In order to avoid this, we preemptively set styleUrls to an empty array,
        // preserve current styles available on Component def and restore styles back once compilation
        // is complete.
        const override = overrideStyleUrls ? { template, styles: [], styleUrls: [], styleUrl: undefined } : { template };
        this.overrideComponent(type, { set: override });
        if (overrideStyleUrls && def.styles && def.styles.length > 0) {
            this.existingComponentStyles.set(type, def.styles);
        }
        // Set the component's scope to be the testing module.
        this.componentToModuleScope.set(type, TestingModuleOverride.OVERRIDE_TEMPLATE);
    }
    async resolvePendingComponentsWithAsyncMetadata() {
        if (this.pendingComponents.size === 0)
            return;
        const promises = [];
        for (const component of this.pendingComponents) {
            const asyncMetadataFn = getAsyncClassMetadataFn(component);
            if (asyncMetadataFn) {
                promises.push(asyncMetadataFn());
            }
        }
        const resolvedDeps = await Promise.all(promises);
        this.queueTypesFromModulesArray(resolvedDeps.flat(2));
    }
    async compileComponents() {
        this.clearComponentResolutionQueue();
        // Wait for all async metadata for components that were
        // overridden, we need resolved metadata to perform an override
        // and re-compile a component.
        await this.resolvePendingComponentsWithAsyncMetadata();
        // Verify that there were no standalone components present in the `declarations` field
        // during the `TestBed.configureTestingModule` call. We perform this check here in addition
        // to the logic in the `configureTestingModule` function, since at this point we have
        // all async metadata resolved.
        assertNoStandaloneComponents(this.declarations, this.resolvers.component, '"TestBed.configureTestingModule" call');
        // Run compilers for all queued types.
        let needsAsyncResources = this.compileTypesSync();
        // compileComponents() should not be async unless it needs to be.
        if (needsAsyncResources) {
            let resourceLoader;
            let resolver = (url) => {
                if (!resourceLoader) {
                    resourceLoader = this.injector.get(ResourceLoader);
                }
                return Promise.resolve(resourceLoader.get(url));
            };
            await ɵresolveComponentResources(resolver);
        }
    }
    finalize() {
        // One last compile
        this.compileTypesSync();
        // Create the testing module itself.
        this.compileTestModule();
        this.applyTransitiveScopes();
        this.applyProviderOverrides();
        // Patch previously stored `styles` Component values (taken from ɵcmp), in case these
        // Components have `styleUrls` fields defined and template override was requested.
        this.patchComponentsWithExistingStyles();
        // Clear the componentToModuleScope map, so that future compilations don't reset the scope of
        // every component.
        this.componentToModuleScope.clear();
        const parentInjector = this.platform.injector;
        this.testModuleRef = new NgModuleRef(this.testModuleType, parentInjector, []);
        // ApplicationInitStatus.runInitializers() is marked @internal to core.
        // Cast it to any before accessing it.
        this.testModuleRef.injector.get(ApplicationInitStatus).runInitializers();
        // Set locale ID after running app initializers, since locale information might be updated while
        // running initializers. This is also consistent with the execution order while bootstrapping an
        // app (see `packages/core/src/application_ref.ts` file).
        const localeId = this.testModuleRef.injector.get(LOCALE_ID, DEFAULT_LOCALE_ID);
        setLocaleId(localeId);
        return this.testModuleRef;
    }
    /**
     * @internal
     */
    _compileNgModuleSync(moduleType) {
        this.queueTypesFromModulesArray([moduleType]);
        this.compileTypesSync();
        this.applyProviderOverrides();
        this.applyProviderOverridesInScope(moduleType);
        this.applyTransitiveScopes();
    }
    /**
     * @internal
     */
    async _compileNgModuleAsync(moduleType) {
        this.queueTypesFromModulesArray([moduleType]);
        await this.compileComponents();
        this.applyProviderOverrides();
        this.applyProviderOverridesInScope(moduleType);
        this.applyTransitiveScopes();
    }
    /**
     * @internal
     */
    _getModuleResolver() {
        return this.resolvers.module;
    }
    /**
     * @internal
     */
    _getComponentFactories(moduleType) {
        return maybeUnwrapFn(moduleType.ɵmod.declarations).reduce((factories, declaration) => {
            const componentDef = declaration.ɵcmp;
            componentDef && factories.push(new ComponentFactory(componentDef, this.testModuleRef));
            return factories;
        }, []);
    }
    compileTypesSync() {
        // Compile all queued components, directives, pipes.
        let needsAsyncResources = false;
        this.pendingComponents.forEach(declaration => {
            if (getAsyncClassMetadataFn(declaration)) {
                throw new Error(`Component '${declaration.name}' has unresolved metadata. ` +
                    `Please call \`await TestBed.compileComponents()\` before running this test.`);
            }
            needsAsyncResources = needsAsyncResources || ɵisComponentDefPendingResolution(declaration);
            const metadata = this.resolvers.component.resolve(declaration);
            if (metadata === null) {
                throw invalidTypeError(declaration.name, 'Component');
            }
            this.maybeStoreNgDef(NG_COMP_DEF, declaration);
            if (USE_RUNTIME_DEPS_TRACKER_FOR_JIT) {
                depsTracker.clearScopeCacheFor(declaration);
            }
            compileComponent(declaration, metadata);
        });
        this.pendingComponents.clear();
        this.pendingDirectives.forEach(declaration => {
            const metadata = this.resolvers.directive.resolve(declaration);
            if (metadata === null) {
                throw invalidTypeError(declaration.name, 'Directive');
            }
            this.maybeStoreNgDef(NG_DIR_DEF, declaration);
            compileDirective(declaration, metadata);
        });
        this.pendingDirectives.clear();
        this.pendingPipes.forEach(declaration => {
            const metadata = this.resolvers.pipe.resolve(declaration);
            if (metadata === null) {
                throw invalidTypeError(declaration.name, 'Pipe');
            }
            this.maybeStoreNgDef(NG_PIPE_DEF, declaration);
            compilePipe(declaration, metadata);
        });
        this.pendingPipes.clear();
        return needsAsyncResources;
    }
    applyTransitiveScopes() {
        if (this.overriddenModules.size > 0) {
            // Module overrides (via `TestBed.overrideModule`) might affect scopes that were previously
            // calculated and stored in `transitiveCompileScopes`. If module overrides are present,
            // collect all affected modules and reset scopes to force their re-calculation.
            const testingModuleDef = this.testModuleType[NG_MOD_DEF];
            const affectedModules = this.collectModulesAffectedByOverrides(testingModuleDef.imports);
            if (affectedModules.size > 0) {
                affectedModules.forEach(moduleType => {
                    if (!USE_RUNTIME_DEPS_TRACKER_FOR_JIT) {
                        this.storeFieldOfDefOnType(moduleType, NG_MOD_DEF, 'transitiveCompileScopes');
                        moduleType[NG_MOD_DEF].transitiveCompileScopes = null;
                    }
                    else {
                        depsTracker.clearScopeCacheFor(moduleType);
                    }
                });
            }
        }
        const moduleToScope = new Map();
        const getScopeOfModule = (moduleType) => {
            if (!moduleToScope.has(moduleType)) {
                const isTestingModule = isTestingModuleOverride(moduleType);
                const realType = isTestingModule ? this.testModuleType : moduleType;
                moduleToScope.set(moduleType, transitiveScopesFor(realType));
            }
            return moduleToScope.get(moduleType);
        };
        this.componentToModuleScope.forEach((moduleType, componentType) => {
            if (moduleType !== null) {
                const moduleScope = getScopeOfModule(moduleType);
                this.storeFieldOfDefOnType(componentType, NG_COMP_DEF, 'directiveDefs');
                this.storeFieldOfDefOnType(componentType, NG_COMP_DEF, 'pipeDefs');
                patchComponentDefWithScope(getComponentDef(componentType), moduleScope);
            }
            // `tView` that is stored on component def contains information about directives and pipes
            // that are in the scope of this component. Patching component scope will cause `tView` to be
            // changed. Store original `tView` before patching scope, so the `tView` (including scope
            // information) is restored back to its previous/original state before running next test.
            // Resetting `tView` is also needed for cases when we apply provider overrides and those
            // providers are defined on component's level, in which case they may end up included into
            // `tView.blueprint`.
            this.storeFieldOfDefOnType(componentType, NG_COMP_DEF, 'tView');
        });
        this.componentToModuleScope.clear();
    }
    applyProviderOverrides() {
        const maybeApplyOverrides = (field) => (type) => {
            const resolver = field === NG_COMP_DEF ? this.resolvers.component : this.resolvers.directive;
            const metadata = resolver.resolve(type);
            if (this.hasProviderOverrides(metadata.providers)) {
                this.patchDefWithProviderOverrides(type, field);
            }
        };
        this.seenComponents.forEach(maybeApplyOverrides(NG_COMP_DEF));
        this.seenDirectives.forEach(maybeApplyOverrides(NG_DIR_DEF));
        this.seenComponents.clear();
        this.seenDirectives.clear();
    }
    /**
     * Applies provider overrides to a given type (either an NgModule or a standalone component)
     * and all imported NgModules and standalone components recursively.
     */
    applyProviderOverridesInScope(type) {
        const hasScope = isStandaloneComponent(type) || isNgModule(type);
        // The function can be re-entered recursively while inspecting dependencies
        // of an NgModule or a standalone component. Exit early if we come across a
        // type that can not have a scope (directive or pipe) or the type is already
        // processed earlier.
        if (!hasScope || this.scopesWithOverriddenProviders.has(type)) {
            return;
        }
        this.scopesWithOverriddenProviders.add(type);
        // NOTE: the line below triggers JIT compilation of the module injector,
        // which also invokes verification of the NgModule semantics, which produces
        // detailed error messages. The fact that the code relies on this line being
        // present here is suspicious and should be refactored in a way that the line
        // below can be moved (for ex. after an early exit check below).
        const injectorDef = type[NG_INJ_DEF];
        // No provider overrides, exit early.
        if (this.providerOverridesByToken.size === 0)
            return;
        if (isStandaloneComponent(type)) {
            // Visit all component dependencies and override providers there.
            const def = getComponentDef(type);
            const dependencies = maybeUnwrapFn(def.dependencies ?? []);
            for (const dependency of dependencies) {
                this.applyProviderOverridesInScope(dependency);
            }
        }
        else {
            const providers = [
                ...injectorDef.providers,
                ...(this.providerOverridesByModule.get(type) || [])
            ];
            if (this.hasProviderOverrides(providers)) {
                this.maybeStoreNgDef(NG_INJ_DEF, type);
                this.storeFieldOfDefOnType(type, NG_INJ_DEF, 'providers');
                injectorDef.providers = this.getOverriddenProviders(providers);
            }
            // Apply provider overrides to imported modules recursively
            const moduleDef = type[NG_MOD_DEF];
            const imports = maybeUnwrapFn(moduleDef.imports);
            for (const importedModule of imports) {
                this.applyProviderOverridesInScope(importedModule);
            }
            // Also override the providers on any ModuleWithProviders imports since those don't appear in
            // the moduleDef.
            for (const importedModule of flatten(injectorDef.imports)) {
                if (isModuleWithProviders(importedModule)) {
                    this.defCleanupOps.push({
                        object: importedModule,
                        fieldName: 'providers',
                        originalValue: importedModule.providers
                    });
                    importedModule.providers = this.getOverriddenProviders(importedModule.providers);
                }
            }
        }
    }
    patchComponentsWithExistingStyles() {
        this.existingComponentStyles.forEach((styles, type) => type[NG_COMP_DEF].styles = styles);
        this.existingComponentStyles.clear();
    }
    queueTypeArray(arr, moduleType) {
        for (const value of arr) {
            if (Array.isArray(value)) {
                this.queueTypeArray(value, moduleType);
            }
            else {
                this.queueType(value, moduleType);
            }
        }
    }
    recompileNgModule(ngModule, metadata) {
        // Cache the initial ngModuleDef as it will be overwritten.
        this.maybeStoreNgDef(NG_MOD_DEF, ngModule);
        this.maybeStoreNgDef(NG_INJ_DEF, ngModule);
        compileNgModuleDefs(ngModule, metadata);
    }
    queueType(type, moduleType) {
        const component = this.resolvers.component.resolve(type);
        if (component) {
            // Check whether a give Type has respective NG def (ɵcmp) and compile if def is
            // missing. That might happen in case a class without any Angular decorators extends another
            // class where Component/Directive/Pipe decorator is defined.
            if (ɵisComponentDefPendingResolution(type) || !type.hasOwnProperty(NG_COMP_DEF)) {
                this.pendingComponents.add(type);
            }
            this.seenComponents.add(type);
            // Keep track of the module which declares this component, so later the component's scope
            // can be set correctly. If the component has already been recorded here, then one of several
            // cases is true:
            // * the module containing the component was imported multiple times (common).
            // * the component is declared in multiple modules (which is an error).
            // * the component was in 'declarations' of the testing module, and also in an imported module
            //   in which case the module scope will be TestingModuleOverride.DECLARATION.
            // * overrideTemplateUsingTestingModule was called for the component in which case the module
            //   scope will be TestingModuleOverride.OVERRIDE_TEMPLATE.
            //
            // If the component was previously in the testing module's 'declarations' (meaning the
            // current value is TestingModuleOverride.DECLARATION), then `moduleType` is the component's
            // real module, which was imported. This pattern is understood to mean that the component
            // should use its original scope, but that the testing module should also contain the
            // component in its scope.
            if ((!this.componentToModuleScope.has(type) ||
                this.componentToModuleScope.get(type) === TestingModuleOverride.DECLARATION)) {
                this.componentToModuleScope.set(type, moduleType);
            }
            return;
        }
        const directive = this.resolvers.directive.resolve(type);
        if (directive) {
            if (!type.hasOwnProperty(NG_DIR_DEF)) {
                this.pendingDirectives.add(type);
            }
            this.seenDirectives.add(type);
            return;
        }
        const pipe = this.resolvers.pipe.resolve(type);
        if (pipe && !type.hasOwnProperty(NG_PIPE_DEF)) {
            this.pendingPipes.add(type);
            return;
        }
    }
    queueTypesFromModulesArray(arr) {
        // Because we may encounter the same NgModule or a standalone Component while processing
        // the dependencies of an NgModule or a standalone Component, we cache them in this set so we
        // can skip ones that have already been seen encountered. In some test setups, this caching
        // resulted in 10X runtime improvement.
        const processedDefs = new Set();
        const queueTypesFromModulesArrayRecur = (arr) => {
            for (const value of arr) {
                if (Array.isArray(value)) {
                    queueTypesFromModulesArrayRecur(value);
                }
                else if (hasNgModuleDef(value)) {
                    const def = value.ɵmod;
                    if (processedDefs.has(def)) {
                        continue;
                    }
                    processedDefs.add(def);
                    // Look through declarations, imports, and exports, and queue
                    // everything found there.
                    this.queueTypeArray(maybeUnwrapFn(def.declarations), value);
                    queueTypesFromModulesArrayRecur(maybeUnwrapFn(def.imports));
                    queueTypesFromModulesArrayRecur(maybeUnwrapFn(def.exports));
                }
                else if (isModuleWithProviders(value)) {
                    queueTypesFromModulesArrayRecur([value.ngModule]);
                }
                else if (isStandaloneComponent(value)) {
                    this.queueType(value, null);
                    const def = getComponentDef(value);
                    if (processedDefs.has(def)) {
                        continue;
                    }
                    processedDefs.add(def);
                    const dependencies = maybeUnwrapFn(def.dependencies ?? []);
                    dependencies.forEach((dependency) => {
                        // Note: in AOT, the `dependencies` might also contain regular
                        // (NgModule-based) Component, Directive and Pipes, so we handle
                        // them separately and proceed with recursive process for standalone
                        // Components and NgModules only.
                        if (isStandaloneComponent(dependency) || hasNgModuleDef(dependency)) {
                            queueTypesFromModulesArrayRecur([dependency]);
                        }
                        else {
                            this.queueType(dependency, null);
                        }
                    });
                }
            }
        };
        queueTypesFromModulesArrayRecur(arr);
    }
    // When module overrides (via `TestBed.overrideModule`) are present, it might affect all modules
    // that import (even transitively) an overridden one. For all affected modules we need to
    // recalculate their scopes for a given test run and restore original scopes at the end. The goal
    // of this function is to collect all affected modules in a set for further processing. Example:
    // if we have the following module hierarchy: A -> B -> C (where `->` means `imports`) and module
    // `C` is overridden, we consider `A` and `B` as affected, since their scopes might become
    // invalidated with the override.
    collectModulesAffectedByOverrides(arr) {
        const seenModules = new Set();
        const affectedModules = new Set();
        const calcAffectedModulesRecur = (arr, path) => {
            for (const value of arr) {
                if (Array.isArray(value)) {
                    // If the value is an array, just flatten it (by invoking this function recursively),
                    // keeping "path" the same.
                    calcAffectedModulesRecur(value, path);
                }
                else if (hasNgModuleDef(value)) {
                    if (seenModules.has(value)) {
                        // If we've seen this module before and it's included into "affected modules" list, mark
                        // the whole path that leads to that module as affected, but do not descend into its
                        // imports, since we already examined them before.
                        if (affectedModules.has(value)) {
                            path.forEach(item => affectedModules.add(item));
                        }
                        continue;
                    }
                    seenModules.add(value);
                    if (this.overriddenModules.has(value)) {
                        path.forEach(item => affectedModules.add(item));
                    }
                    // Examine module imports recursively to look for overridden modules.
                    const moduleDef = value[NG_MOD_DEF];
                    calcAffectedModulesRecur(maybeUnwrapFn(moduleDef.imports), path.concat(value));
                }
            }
        };
        calcAffectedModulesRecur(arr, []);
        return affectedModules;
    }
    /**
     * Preserve an original def (such as ɵmod, ɵinj, etc) before applying an override.
     * Note: one class may have multiple defs (for example: ɵmod and ɵinj in case of
     * an NgModule). If there is a def in a set already, don't override it, since
     * an original one should be restored at the end of a test.
     */
    maybeStoreNgDef(prop, type) {
        if (!this.initialNgDefs.has(type)) {
            this.initialNgDefs.set(type, new Map());
        }
        const currentDefs = this.initialNgDefs.get(type);
        if (!currentDefs.has(prop)) {
            const currentDef = Object.getOwnPropertyDescriptor(type, prop);
            currentDefs.set(prop, currentDef);
        }
    }
    storeFieldOfDefOnType(type, defField, fieldName) {
        const def = type[defField];
        const originalValue = def[fieldName];
        this.defCleanupOps.push({ object: def, fieldName, originalValue });
    }
    /**
     * Clears current components resolution queue, but stores the state of the queue, so we can
     * restore it later. Clearing the queue is required before we try to compile components (via
     * `TestBed.compileComponents`), so that component defs are in sync with the resolution queue.
     */
    clearComponentResolutionQueue() {
        if (this.originalComponentResolutionQueue === null) {
            this.originalComponentResolutionQueue = new Map();
        }
        ɵclearResolutionOfComponentResourcesQueue().forEach((value, key) => this.originalComponentResolutionQueue.set(key, value));
    }
    /*
     * Restores component resolution queue to the previously saved state. This operation is performed
     * as a part of restoring the state after completion of the current set of tests (that might
     * potentially mutate the state).
     */
    restoreComponentResolutionQueue() {
        if (this.originalComponentResolutionQueue !== null) {
            ɵrestoreComponentResolutionQueue(this.originalComponentResolutionQueue);
            this.originalComponentResolutionQueue = null;
        }
    }
    restoreOriginalState() {
        // Process cleanup ops in reverse order so the field's original value is restored correctly (in
        // case there were multiple overrides for the same field).
        forEachRight(this.defCleanupOps, (op) => {
            op.object[op.fieldName] = op.originalValue;
        });
        // Restore initial component/directive/pipe defs
        this.initialNgDefs.forEach((defs, type) => {
            if (USE_RUNTIME_DEPS_TRACKER_FOR_JIT) {
                depsTracker.clearScopeCacheFor(type);
            }
            defs.forEach((descriptor, prop) => {
                if (!descriptor) {
                    // Delete operations are generally undesirable since they have performance
                    // implications on objects they were applied to. In this particular case, situations
                    // where this code is invoked should be quite rare to cause any noticeable impact,
                    // since it's applied only to some test cases (for example when class with no
                    // annotations extends some @Component) when we need to clear 'ɵcmp' field on a given
                    // class to restore its original state (before applying overrides and running tests).
                    delete type[prop];
                }
                else {
                    Object.defineProperty(type, prop, descriptor);
                }
            });
        });
        this.initialNgDefs.clear();
        this.scopesWithOverriddenProviders.clear();
        this.restoreComponentResolutionQueue();
        // Restore the locale ID to the default value, this shouldn't be necessary but we never know
        setLocaleId(DEFAULT_LOCALE_ID);
    }
    compileTestModule() {
        class RootScopeModule {
        }
        compileNgModuleDefs(RootScopeModule, {
            providers: [...this.rootProviderOverrides],
        });
        const providers = [
            provideZoneChangeDetection(),
            { provide: Compiler, useFactory: () => new R3TestCompiler(this) },
            { provide: DEFER_BLOCK_CONFIG, useValue: { behavior: this.deferBlockBehavior } },
            ...this.providers,
            ...this.providerOverrides,
        ];
        const imports = [RootScopeModule, this.additionalModuleTypes, this.imports || []];
        // clang-format off
        compileNgModuleDefs(this.testModuleType, {
            declarations: this.declarations,
            imports,
            schemas: this.schemas,
            providers,
        }, /* allowDuplicateDeclarationsInRoot */ true);
        // clang-format on
        this.applyProviderOverridesInScope(this.testModuleType);
    }
    get injector() {
        if (this._injector !== null) {
            return this._injector;
        }
        const providers = [];
        const compilerOptions = this.platform.injector.get(COMPILER_OPTIONS);
        compilerOptions.forEach(opts => {
            if (opts.providers) {
                providers.push(opts.providers);
            }
        });
        if (this.compilerProviders !== null) {
            providers.push(...this.compilerProviders);
        }
        this._injector = Injector.create({ providers, parent: this.platform.injector });
        return this._injector;
    }
    // get overrides for a specific provider (if any)
    getSingleProviderOverrides(provider) {
        const token = getProviderToken(provider);
        return this.providerOverridesByToken.get(token) || null;
    }
    getProviderOverrides(providers) {
        if (!providers || !providers.length || this.providerOverridesByToken.size === 0)
            return [];
        // There are two flattening operations here. The inner flattenProviders() operates on the
        // metadata's providers and applies a mapping function which retrieves overrides for each
        // incoming provider. The outer flatten() then flattens the produced overrides array. If this is
        // not done, the array can contain other empty arrays (e.g. `[[], []]`) which leak into the
        // providers array and contaminate any error messages that might be generated.
        return flatten(flattenProviders(providers, (provider) => this.getSingleProviderOverrides(provider) || []));
    }
    getOverriddenProviders(providers) {
        if (!providers || !providers.length || this.providerOverridesByToken.size === 0)
            return [];
        const flattenedProviders = flattenProviders(providers);
        const overrides = this.getProviderOverrides(flattenedProviders);
        const overriddenProviders = [...flattenedProviders, ...overrides];
        const final = [];
        const seenOverriddenProviders = new Set();
        // We iterate through the list of providers in reverse order to make sure provider overrides
        // take precedence over the values defined in provider list. We also filter out all providers
        // that have overrides, keeping overridden values only. This is needed, since presence of a
        // provider with `ngOnDestroy` hook will cause this hook to be registered and invoked later.
        forEachRight(overriddenProviders, (provider) => {
            const token = getProviderToken(provider);
            if (this.providerOverridesByToken.has(token)) {
                if (!seenOverriddenProviders.has(token)) {
                    seenOverriddenProviders.add(token);
                    // Treat all overridden providers as `{multi: false}` (even if it's a multi-provider) to
                    // make sure that provided override takes highest precedence and is not combined with
                    // other instances of the same multi provider.
                    final.unshift({ ...provider, multi: false });
                }
            }
            else {
                final.unshift(provider);
            }
        });
        return final;
    }
    hasProviderOverrides(providers) {
        return this.getProviderOverrides(providers).length > 0;
    }
    patchDefWithProviderOverrides(declaration, field) {
        const def = declaration[field];
        if (def && def.providersResolver) {
            this.maybeStoreNgDef(field, declaration);
            const resolver = def.providersResolver;
            const processProvidersFn = (providers) => this.getOverriddenProviders(providers);
            this.storeFieldOfDefOnType(declaration, field, 'providersResolver');
            def.providersResolver = (ngDef) => resolver(ngDef, processProvidersFn);
        }
    }
}
function initResolvers() {
    return {
        module: new NgModuleResolver(),
        component: new ComponentResolver(),
        directive: new DirectiveResolver(),
        pipe: new PipeResolver()
    };
}
function isStandaloneComponent(value) {
    const def = getComponentDef(value);
    return !!def?.standalone;
}
function getComponentDef(value) {
    return value.ɵcmp ?? null;
}
function hasNgModuleDef(value) {
    return value.hasOwnProperty('ɵmod');
}
function isNgModule(value) {
    return hasNgModuleDef(value);
}
function maybeUnwrapFn(maybeFn) {
    return maybeFn instanceof Function ? maybeFn() : maybeFn;
}
function flatten(values) {
    const out = [];
    values.forEach(value => {
        if (Array.isArray(value)) {
            out.push(...flatten(value));
        }
        else {
            out.push(value);
        }
    });
    return out;
}
function identityFn(value) {
    return value;
}
function flattenProviders(providers, mapFn = identityFn) {
    const out = [];
    for (let provider of providers) {
        if (isEnvironmentProviders(provider)) {
            provider = provider.ɵproviders;
        }
        if (Array.isArray(provider)) {
            out.push(...flattenProviders(provider, mapFn));
        }
        else {
            out.push(mapFn(provider));
        }
    }
    return out;
}
function getProviderField(provider, field) {
    return provider && typeof provider === 'object' && provider[field];
}
function getProviderToken(provider) {
    return getProviderField(provider, 'provide') || provider;
}
function isModuleWithProviders(value) {
    return value.hasOwnProperty('ngModule');
}
function forEachRight(values, fn) {
    for (let idx = values.length - 1; idx >= 0; idx--) {
        fn(values[idx], idx);
    }
}
function invalidTypeError(name, expectedType) {
    return new Error(`${name} class doesn't have @${expectedType} decorator or is missing metadata.`);
}
class R3TestCompiler {
    constructor(testBed) {
        this.testBed = testBed;
    }
    compileModuleSync(moduleType) {
        this.testBed._compileNgModuleSync(moduleType);
        return new R3NgModuleFactory(moduleType);
    }
    async compileModuleAsync(moduleType) {
        await this.testBed._compileNgModuleAsync(moduleType);
        return new R3NgModuleFactory(moduleType);
    }
    compileModuleAndAllComponentsSync(moduleType) {
        const ngModuleFactory = this.compileModuleSync(moduleType);
        const componentFactories = this.testBed._getComponentFactories(moduleType);
        return new ModuleWithComponentFactories(ngModuleFactory, componentFactories);
    }
    async compileModuleAndAllComponentsAsync(moduleType) {
        const ngModuleFactory = await this.compileModuleAsync(moduleType);
        const componentFactories = this.testBed._getComponentFactories(moduleType);
        return new ModuleWithComponentFactories(ngModuleFactory, componentFactories);
    }
    clearCache() { }
    clearCacheFor(type) { }
    getModuleId(moduleType) {
        const meta = this.testBed._getModuleResolver().resolve(moduleType);
        return meta && meta.id || undefined;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVzdF9iZWRfY29tcGlsZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3Rlc3Rpbmcvc3JjL3Rlc3RfYmVkX2NvbXBpbGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxjQUFjLEVBQUMsTUFBTSxtQkFBbUIsQ0FBQztBQUNqRCxPQUFPLEVBQUMscUJBQXFCLEVBQUUsUUFBUSxFQUFFLGdCQUFnQixFQUF3QixRQUFRLEVBQWdCLFNBQVMsRUFBRSw0QkFBNEIsRUFBdUYsMEJBQTBCLEVBQUUsaUJBQWlCLEVBQXdCLHlDQUF5QyxFQUFFLGlCQUFpQixJQUFJLGdCQUFnQixFQUFFLGlCQUFpQixJQUFJLGdCQUFnQixFQUFFLG9CQUFvQixJQUFJLG1CQUFtQixFQUFFLFlBQVksSUFBSSxXQUFXLEVBQUUsa0JBQWtCLElBQUksaUJBQWlCLEVBQUUsbUJBQW1CLElBQUksa0JBQWtCLEVBQUUsbUJBQW1CLElBQUksa0JBQWtCLEVBQUUsWUFBWSxJQUFJLFdBQVcsRUFBaUMsc0NBQXNDLEVBQUUsd0JBQXdCLElBQUksdUJBQXVCLEVBQUUsaUJBQWlCLElBQUksZ0JBQWdCLEVBQWlFLGdDQUFnQyxFQUFFLHVCQUF1QixJQUFJLHNCQUFzQixFQUFFLFlBQVksSUFBSSxXQUFXLEVBQUUsV0FBVyxJQUFJLFVBQVUsRUFBRSxXQUFXLElBQUksVUFBVSxFQUFFLFdBQVcsSUFBSSxVQUFVLEVBQUUsWUFBWSxJQUFJLFdBQVcsRUFBRSxnQkFBZ0IsSUFBSSxpQkFBaUIsRUFBd0YsMkJBQTJCLElBQUksMEJBQTBCLEVBQUUsd0JBQXdCLElBQUksZ0JBQWdCLEVBQUUsbUJBQW1CLElBQUksV0FBVyxFQUFFLDBCQUEwQixFQUFFLGdDQUFnQyxFQUFFLFlBQVksSUFBSSxXQUFXLEVBQUUsb0JBQW9CLElBQUksbUJBQW1CLEVBQUUsaUNBQWlDLElBQUks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Q0FBQztJQUVELEtBQUssQ0FBQyxrQ0FBa0MsQ0FBSSxVQUFtQjtRQUU3RCxNQUFNLGVBQWUsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUNsRSxNQUFNLGtCQUFrQixHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsc0JBQXNCLENBQUMsVUFBNkIsQ0FBQyxDQUFDO1FBQzlGLE9BQU8sSUFBSSw0QkFBNEIsQ0FBQyxlQUFlLEVBQUUsa0JBQWtCLENBQUMsQ0FBQztJQUMvRSxDQUFDO0lBRUQsVUFBVSxLQUFVLENBQUM7SUFFckIsYUFBYSxDQUFDLElBQWUsSUFBUyxDQUFDO0lBRXZDLFdBQVcsQ0FBQyxVQUFxQjtRQUMvQixNQUFNLElBQUksR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLGtCQUFrQixFQUFFLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ25FLE9BQU8sSUFBSSxJQUFJLElBQUksQ0FBQyxFQUFFLElBQUksU0FBUyxDQUFDO0lBQ3RDLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge1Jlc291cmNlTG9hZGVyfSBmcm9tICdAYW5ndWxhci9jb21waWxlcic7XG5pbXBvcnQge0FwcGxpY2F0aW9uSW5pdFN0YXR1cywgQ29tcGlsZXIsIENPTVBJTEVSX09QVElPTlMsIENvbXBvbmVudCwgRGlyZWN0aXZlLCBJbmplY3RvciwgSW5qZWN0b3JUeXBlLCBMT0NBTEVfSUQsIE1vZHVsZVdpdGhDb21wb25lbnRGYWN0b3JpZXMsIE1vZHVsZVdpdGhQcm92aWRlcnMsIE5nTW9kdWxlLCBOZ01vZHVsZUZhY3RvcnksIE5nWm9uZSwgUGlwZSwgUGxhdGZvcm1SZWYsIFByb3ZpZGVyLCBwcm92aWRlWm9uZUNoYW5nZURldGVjdGlvbiwgcmVzb2x2ZUZvcndhcmRSZWYsIFN0YXRpY1Byb3ZpZGVyLCBUeXBlLCDJtWNsZWFyUmVzb2x1dGlvbk9mQ29tcG9uZW50UmVzb3VyY2VzUXVldWUsIMm1Y29tcGlsZUNvbXBvbmVudCBhcyBjb21waWxlQ29tcG9uZW50LCDJtWNvbXBpbGVEaXJlY3RpdmUgYXMgY29tcGlsZURpcmVjdGl2ZSwgybVjb21waWxlTmdNb2R1bGVEZWZzIGFzIGNvbXBpbGVOZ01vZHVsZURlZnMsIMm1Y29tcGlsZVBpcGUgYXMgY29tcGlsZVBpcGUsIMm1REVGQVVMVF9MT0NBTEVfSUQgYXMgREVGQVVMVF9MT0NBTEVfSUQsIMm1REVGRVJfQkxPQ0tfQ09ORklHIGFzIERFRkVSX0JMT0NLX0NPTkZJRywgybVEZWZlckJsb2NrQmVoYXZpb3IgYXMgRGVmZXJCbG9ja0JlaGF2aW9yLCDJtWRlcHNUcmFja2VyIGFzIGRlcHNUcmFja2VyLCDJtURpcmVjdGl2ZURlZiBhcyBEaXJlY3RpdmVEZWYsIMm1Z2VuZXJhdGVTdGFuZGFsb25lSW5EZWNsYXJhdGlvbnNFcnJvciwgybVnZXRBc3luY0NsYXNzTWV0YWRhdGFGbiBhcyBnZXRBc3luY0NsYXNzTWV0YWRhdGFGbiwgybVnZXRJbmplY3RhYmxlRGVmIGFzIGdldEluamVjdGFibGVEZWYsIMm1SW50ZXJuYWxFbnZpcm9ubWVudFByb3ZpZGVycyBhcyBJbnRlcm5hbEVudmlyb25tZW50UHJvdmlkZXJzLCDJtWlzQ29tcG9uZW50RGVmUGVuZGluZ1Jlc29sdXRpb24sIMm1aXNFbnZpcm9ubWVudFByb3ZpZGVycyBhcyBpc0Vudmlyb25tZW50UHJvdmlkZXJzLCDJtU5HX0NPTVBfREVGIGFzIE5HX0NPTVBfREVGLCDJtU5HX0RJUl9ERUYgYXMgTkdfRElSX0RFRiwgybVOR19JTkpfREVGIGFzIE5HX0lOSl9ERUYsIMm1TkdfTU9EX0RFRiBhcyBOR19NT0RfREVGLCDJtU5HX1BJUEVfREVGIGFzIE5HX1BJUEVfREVGLCDJtU5nTW9kdWxlRmFjdG9yeSBhcyBSM05nTW9kdWxlRmFjdG9yeSwgybVOZ01vZHVsZVRyYW5zaXRpdmVTY29wZXMgYXMgTmdNb2R1bGVUcmFuc2l0aXZlU2NvcGVzLCDJtU5nTW9kdWxlVHlwZSBhcyBOZ01vZHVsZVR5cGUsIMm1cGF0Y2hDb21wb25lbnREZWZXaXRoU2NvcGUgYXMgcGF0Y2hDb21wb25lbnREZWZXaXRoU2NvcGUsIMm1UmVuZGVyM0NvbXBvbmVudEZhY3RvcnkgYXMgQ29tcG9uZW50RmFjdG9yeSwgybVSZW5kZXIzTmdNb2R1bGVSZWYgYXMgTmdNb2R1bGVSZWYsIMm1cmVzb2x2ZUNvbXBvbmVudFJlc291cmNlcywgybVyZXN0b3JlQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlLCDJtXNldExvY2FsZUlkIGFzIHNldExvY2FsZUlkLCDJtXRyYW5zaXRpdmVTY29wZXNGb3IgYXMgdHJhbnNpdGl2ZVNjb3Blc0ZvciwgybVVU0VfUlVOVElNRV9ERVBTX1RSQUNLRVJfRk9SX0pJVCBhcyBVU0VfUlVOVElNRV9ERVBTX1RSQUNLRVJfRk9SX0pJVCwgybXJtUluamVjdGFibGVEZWNsYXJhdGlvbiBhcyBJbmplY3RhYmxlRGVjbGFyYXRpb259IGZyb20gJ0Bhbmd1bGFyL2NvcmUnO1xuXG5pbXBvcnQge0NvbXBvbmVudERlZiwgQ29tcG9uZW50VHlwZX0gZnJvbSAnLi4vLi4vc3JjL3JlbmRlcjMnO1xuXG5pbXBvcnQge01ldGFkYXRhT3ZlcnJpZGV9IGZyb20gJy4vbWV0YWRhdGFfb3ZlcnJpZGUnO1xuaW1wb3J0IHtDb21wb25lbnRSZXNvbHZlciwgRGlyZWN0aXZlUmVzb2x2ZXIsIE5nTW9kdWxlUmVzb2x2ZXIsIFBpcGVSZXNvbHZlciwgUmVzb2x2ZXJ9IGZyb20gJy4vcmVzb2x2ZXJzJztcbmltcG9ydCB7VGVzdE1vZHVsZU1ldGFkYXRhfSBmcm9tICcuL3Rlc3RfYmVkX2NvbW1vbic7XG5cbmVudW0gVGVzdGluZ01vZHVsZU92ZXJyaWRlIHtcbiAgREVDTEFSQVRJT04sXG4gIE9WRVJSSURFX1RFTVBMQVRFLFxufVxuXG5mdW5jdGlvbiBpc1Rlc3RpbmdNb2R1bGVPdmVycmlkZSh2YWx1ZTogdW5rbm93bik6IHZhbHVlIGlzIFRlc3RpbmdNb2R1bGVPdmVycmlkZSB7XG4gIHJldHVybiB2YWx1ZSA9PT0gVGVzdGluZ01vZHVsZU92ZXJyaWRlLkRFQ0xBUkFUSU9OIHx8XG4gICAgICB2YWx1ZSA9PT0gVGVzdGluZ01vZHVsZU92ZXJyaWRlLk9WRVJSSURFX1RFTVBMQVRFO1xufVxuXG5mdW5jdGlvbiBhc3NlcnROb1N0YW5kYWxvbmVDb21wb25lbnRzKFxuICAgIHR5cGVzOiBUeXBlPGFueT5bXSwgcmVzb2x2ZXI6IFJlc29sdmVyPGFueT4sIGxvY2F0aW9uOiBzdHJpbmcpIHtcbiAgdHlwZXMuZm9yRWFjaCh0eXBlID0+IHtcbiAgICBpZiAoIWdldEFzeW5jQ2xhc3NNZXRhZGF0YUZuKHR5cGUpKSB7XG4gICAgICBjb25zdCBjb21wb25lbnQgPSByZXNvbHZlci5yZXNvbHZlKHR5cGUpO1xuICAgICAgaWYgKGNvbXBvbmVudCAmJiBjb21wb25lbnQuc3RhbmRhbG9uZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoybVnZW5lcmF0ZVN0YW5kYWxvbmVJbkRlY2xhcmF0aW9uc0Vycm9yKHR5cGUsIGxvY2F0aW9uKSk7XG4gICAgICB9XG4gICAgfVxuICB9KTtcbn1cblxuLy8gUmVzb2x2ZXJzIGZvciBBbmd1bGFyIGRlY29yYXRvcnNcbnR5cGUgUmVzb2x2ZXJzID0ge1xuICBtb2R1bGU6IFJlc29sdmVyPE5nTW9kdWxlPixcbiAgY29tcG9uZW50OiBSZXNvbHZlcjxEaXJlY3RpdmU+LFxuICBkaXJlY3RpdmU6IFJlc29sdmVyPENvbXBvbmVudD4sXG4gIHBpcGU6IFJlc29sdmVyPFBpcGU+LFxufTtcblxuaW50ZXJmYWNlIENsZWFudXBPcGVyYXRpb24ge1xuICBmaWVsZE5hbWU6IHN0cmluZztcbiAgb2JqZWN0OiBhbnk7XG4gIG9yaWdpbmFsVmFsdWU6IHVua25vd247XG59XG5cbmV4cG9ydCBjbGFzcyBUZXN0QmVkQ29tcGlsZXIge1xuICBwcml2YXRlIG9yaWdpbmFsQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlOiBNYXA8VHlwZTxhbnk+LCBDb21wb25lbnQ+fG51bGwgPSBudWxsO1xuXG4gIC8vIFRlc3RpbmcgbW9kdWxlIGNvbmZpZ3VyYXRpb25cbiAgcHJpdmF0ZSBkZWNsYXJhdGlvbnM6IFR5cGU8YW55PltdID0gW107XG4gIHByaXZhdGUgaW1wb3J0czogVHlwZTxhbnk+W10gPSBbXTtcbiAgcHJpdmF0ZSBwcm92aWRlcnM6IFByb3ZpZGVyW10gPSBbXTtcbiAgcHJpdmF0ZSBzY2hlbWFzOiBhbnlbXSA9IFtdO1xuXG4gIC8vIFF1ZXVlcyBvZiBjb21wb25lbnRzL2RpcmVjdGl2ZXMvcGlwZXMgdGhhdCBzaG91bGQgYmUgcmVjb21waWxlZC5cbiAgcHJpdmF0ZSBwZW5kaW5nQ29tcG9uZW50cyA9IG5ldyBTZXQ8VHlwZTxhbnk+PigpO1xuICBwcml2YXRlIHBlbmRpbmdEaXJlY3RpdmVzID0gbmV3IFNldDxUeXBlPGFueT4+KCk7XG4gIHByaXZhdGUgcGVuZGluZ1BpcGVzID0gbmV3IFNldDxUeXBlPGFueT4+KCk7XG5cbiAgLy8gS2VlcCB0cmFjayBvZiBhbGwgY29tcG9uZW50cyBhbmQgZGlyZWN0aXZlcywgc28gd2UgY2FuIHBhdGNoIFByb3ZpZGVycyBvbnRvIGRlZnMgbGF0ZXIuXG4gIHByaXZhdGUgc2VlbkNvbXBvbmVudHMgPSBuZXcgU2V0PFR5cGU8YW55Pj4oKTtcbiAgcHJpdmF0ZSBzZWVuRGlyZWN0aXZlcyA9IG5ldyBTZXQ8VHlwZTxhbnk+PigpO1xuXG4gIC8vIEtlZXAgdHJhY2sgb2Ygb3ZlcnJpZGRlbiBtb2R1bGVzLCBzbyB0aGF0IHdlIGNhbiBjb2xsZWN0IGFsbCBhZmZlY3RlZCBvbmVzIGluIHRoZSBtb2R1bGUgdHJlZS5cbiAgcHJpdmF0ZSBvdmVycmlkZGVuTW9kdWxlcyA9IG5ldyBTZXQ8TmdNb2R1bGVUeXBlPGFueT4+KCk7XG5cbiAgLy8gU3RvcmUgcmVzb2x2ZWQgc3R5bGVzIGZvciBDb21wb25lbnRzIHRoYXQgaGF2ZSB0ZW1wbGF0ZSBvdmVycmlkZXMgcHJlc2VudCBhbmQgYHN0eWxlVXJsc2BcbiAgLy8gZGVmaW5lZCBhdCB0aGUgc2FtZSB0aW1lLlxuICBwcml2YXRlIGV4aXN0aW5nQ29tcG9uZW50U3R5bGVzID0gbmV3IE1hcDxUeXBlPGFueT4sIHN0cmluZ1tdPigpO1xuXG4gIHByaXZhdGUgcmVzb2x2ZXJzOiBSZXNvbHZlcnMgPSBpbml0UmVzb2x2ZXJzKCk7XG5cbiAgLy8gTWFwIG9mIGNvbXBvbmVudCB0eXBlIHRvIGFuIE5nTW9kdWxlIHRoYXQgZGVjbGFyZXMgaXQuXG4gIC8vXG4gIC8vIFRoZXJlIGFyZSBhIGNvdXBsZSBzcGVjaWFsIGNhc2VzOlxuICAvLyAtIGZvciBzdGFuZGFsb25lIGNvbXBvbmVudHMsIHRoZSBtb2R1bGUgc2NvcGUgdmFsdWUgaXMgYG51bGxgXG4gIC8vIC0gd2hlbiBhIGNvbXBvbmVudCBpcyBkZWNsYXJlZCBpbiBgVGVzdEJlZC5jb25maWd1cmVUZXN0aW5nTW9kdWxlKClgIGNhbGwgb3JcbiAgLy8gICBhIGNvbXBvbmVudCdzIHRlbXBsYXRlIGlzIG92ZXJyaWRkZW4gdmlhIGBUZXN0QmVkLm92ZXJyaWRlVGVtcGxhdGVVc2luZ1Rlc3RpbmdNb2R1bGUoKWAuXG4gIC8vICAgd2UgdXNlIGEgc3BlY2lhbCB2YWx1ZSBmcm9tIHRoZSBgVGVzdGluZ01vZHVsZU92ZXJyaWRlYCBlbnVtLlxuICBwcml2YXRlIGNvbXBvbmVudFRvTW9kdWxlU2NvcGUgPSBuZXcgTWFwPFR5cGU8YW55PiwgVHlwZTxhbnk+fFRlc3RpbmdNb2R1bGVPdmVycmlkZXxudWxsPigpO1xuXG4gIC8vIE1hcCB0aGF0IGtlZXBzIGluaXRpYWwgdmVyc2lvbiBvZiBjb21wb25lbnQvZGlyZWN0aXZlL3BpcGUgZGVmcyBpbiBjYXNlXG4gIC8vIHdlIGNvbXBpbGUgYSBUeXBlIGFnYWluLCB0aHVzIG92ZXJyaWRpbmcgcmVzcGVjdGl2ZSBzdGF0aWMgZmllbGRzLiBUaGlzIGlzXG4gIC8vIHJlcXVpcmVkIHRvIG1ha2Ugc3VyZSB3ZSByZXN0b3JlIGRlZnMgdG8gdGhlaXIgaW5pdGlhbCBzdGF0ZXMgYmV0d2VlbiB0ZXN0IHJ1bnMuXG4gIC8vIE5vdGU6IG9uZSBjbGFzcyBtYXkgaGF2ZSBtdWx0aXBsZSBkZWZzIChmb3IgZXhhbXBsZTogybVtb2QgYW5kIMm1aW5qIGluIGNhc2Ugb2YgYW5cbiAgLy8gTmdNb2R1bGUpLCBzdG9yZSBhbGwgb2YgdGhlbSBpbiBhIG1hcC5cbiAgcHJpdmF0ZSBpbml0aWFsTmdEZWZzID0gbmV3IE1hcDxUeXBlPGFueT4sIE1hcDxzdHJpbmcsIFByb3BlcnR5RGVzY3JpcHRvcnx1bmRlZmluZWQ+PigpO1xuXG4gIC8vIEFycmF5IHRoYXQga2VlcHMgY2xlYW51cCBvcGVyYXRpb25zIGZvciBpbml0aWFsIHZlcnNpb25zIG9mIGNvbXBvbmVudC9kaXJlY3RpdmUvcGlwZS9tb2R1bGVcbiAgLy8gZGVmcyBpbiBjYXNlIFRlc3RCZWQgbWFrZXMgY2hhbmdlcyB0byB0aGUgb3JpZ2luYWxzLlxuICBwcml2YXRlIGRlZkNsZWFudXBPcHM6IENsZWFudXBPcGVyYXRpb25bXSA9IFtdO1xuXG4gIHByaXZhdGUgX2luamVjdG9yOiBJbmplY3RvcnxudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBjb21waWxlclByb3ZpZGVyczogUHJvdmlkZXJbXXxudWxsID0gbnVsbDtcblxuICBwcml2YXRlIHByb3ZpZGVyT3ZlcnJpZGVzOiBQcm92aWRlcltdID0gW107XG4gIHByaXZhdGUgcm9vdFByb3ZpZGVyT3ZlcnJpZGVzOiBQcm92aWRlcltdID0gW107XG4gIC8vIE92ZXJyaWRlcyBmb3IgaW5qZWN0YWJsZXMgd2l0aCBge3Byb3ZpZGVkSW46IFNvbWVNb2R1bGV9YCBuZWVkIHRvIGJlIHRyYWNrZWQgYW5kIGFkZGVkIHRvIHRoYXRcbiAgLy8gbW9kdWxlJ3MgcHJvdmlkZXIgbGlzdC5cbiAgcHJpdmF0ZSBwcm92aWRlck92ZXJyaWRlc0J5TW9kdWxlID0gbmV3IE1hcDxJbmplY3RvclR5cGU8YW55PiwgUHJvdmlkZXJbXT4oKTtcbiAgcHJpdmF0ZSBwcm92aWRlck92ZXJyaWRlc0J5VG9rZW4gPSBuZXcgTWFwPGFueSwgUHJvdmlkZXI+KCk7XG4gIHByaXZhdGUgc2NvcGVzV2l0aE92ZXJyaWRkZW5Qcm92aWRlcnMgPSBuZXcgU2V0PFR5cGU8YW55Pj4oKTtcblxuICBwcml2YXRlIHRlc3RNb2R1bGVUeXBlOiBOZ01vZHVsZVR5cGU8YW55PjtcbiAgcHJpdmF0ZSB0ZXN0TW9kdWxlUmVmOiBOZ01vZHVsZVJlZjxhbnk+fG51bGwgPSBudWxsO1xuXG4gIHByaXZhdGUgZGVmZXJCbG9ja0JlaGF2aW9yID0gRGVmZXJCbG9ja0JlaGF2aW9yLk1hbnVhbDtcblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHBsYXRmb3JtOiBQbGF0Zm9ybVJlZiwgcHJpdmF0ZSBhZGRpdGlvbmFsTW9kdWxlVHlwZXM6IFR5cGU8YW55PnxUeXBlPGFueT5bXSkge1xuICAgIGNsYXNzIER5bmFtaWNUZXN0TW9kdWxlIHt9XG4gICAgdGhpcy50ZXN0TW9kdWxlVHlwZSA9IER5bmFtaWNUZXN0TW9kdWxlIGFzIGFueTtcbiAgfVxuXG4gIHNldENvbXBpbGVyUHJvdmlkZXJzKHByb3ZpZGVyczogUHJvdmlkZXJbXXxudWxsKTogdm9pZCB7XG4gICAgdGhpcy5jb21waWxlclByb3ZpZGVycyA9IHByb3ZpZGVycztcbiAgICB0aGlzLl9pbmplY3RvciA9IG51bGw7XG4gIH1cblxuICBjb25maWd1cmVUZXN0aW5nTW9kdWxlKG1vZHVsZURlZjogVGVzdE1vZHVsZU1ldGFkYXRhKTogdm9pZCB7XG4gICAgLy8gRW5xdWV1ZSBhbnkgY29tcGlsYXRpb24gdGFza3MgZm9yIHRoZSBkaXJlY3RseSBkZWNsYXJlZCBjb21wb25lbnQuXG4gICAgaWYgKG1vZHVsZURlZi5kZWNsYXJhdGlvbnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgLy8gVmVyaWZ5IHRoYXQgdGhlcmUgYXJlIG5vIHN0YW5kYWxvbmUgY29tcG9uZW50c1xuICAgICAgYXNzZXJ0Tm9TdGFuZGFsb25lQ29tcG9uZW50cyhcbiAgICAgICAgICBtb2R1bGVEZWYuZGVjbGFyYXRpb25zLCB0aGlzLnJlc29sdmVycy5jb21wb25lbnQsXG4gICAgICAgICAgJ1wiVGVzdEJlZC5jb25maWd1cmVUZXN0aW5nTW9kdWxlXCIgY2FsbCcpO1xuICAgICAgdGhpcy5xdWV1ZVR5cGVBcnJheShtb2R1bGVEZWYuZGVjbGFyYXRpb25zLCBUZXN0aW5nTW9kdWxlT3ZlcnJpZGUuREVDTEFSQVRJT04pO1xuICAgICAgdGhpcy5kZWNsYXJhdGlvbnMucHVzaCguLi5tb2R1bGVEZWYuZGVjbGFyYXRpb25zKTtcbiAgICB9XG5cbiAgICAvLyBFbnF1ZXVlIGFueSBjb21waWxhdGlvbiB0YXNrcyBmb3IgaW1wb3J0ZWQgbW9kdWxlcy5cbiAgICBpZiAobW9kdWxlRGVmLmltcG9ydHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5xdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheShtb2R1bGVEZWYuaW1wb3J0cyk7XG4gICAgICB0aGlzLmltcG9ydHMucHVzaCguLi5tb2R1bGVEZWYuaW1wb3J0cyk7XG4gICAgfVxuXG4gICAgaWYgKG1vZHVsZURlZi5wcm92aWRlcnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5wcm92aWRlcnMucHVzaCguLi5tb2R1bGVEZWYucHJvdmlkZXJzKTtcbiAgICB9XG5cbiAgICBpZiAobW9kdWxlRGVmLnNjaGVtYXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhpcy5zY2hlbWFzLnB1c2goLi4ubW9kdWxlRGVmLnNjaGVtYXMpO1xuICAgIH1cblxuICAgIHRoaXMuZGVmZXJCbG9ja0JlaGF2aW9yID0gbW9kdWxlRGVmLmRlZmVyQmxvY2tCZWhhdmlvciA/PyBEZWZlckJsb2NrQmVoYXZpb3IuTWFudWFsO1xuICB9XG5cbiAgb3ZlcnJpZGVNb2R1bGUobmdNb2R1bGU6IFR5cGU8YW55Piwgb3ZlcnJpZGU6IE1ldGFkYXRhT3ZlcnJpZGU8TmdNb2R1bGU+KTogdm9pZCB7XG4gICAgaWYgKFVTRV9SVU5USU1FX0RFUFNfVFJBQ0tFUl9GT1JfSklUKSB7XG4gICAgICBkZXBzVHJhY2tlci5jbGVhclNjb3BlQ2FjaGVGb3IobmdNb2R1bGUpO1xuICAgIH1cbiAgICB0aGlzLm92ZXJyaWRkZW5Nb2R1bGVzLmFkZChuZ01vZHVsZSBhcyBOZ01vZHVsZVR5cGU8YW55Pik7XG5cbiAgICAvLyBDb21waWxlIHRoZSBtb2R1bGUgcmlnaHQgYXdheS5cbiAgICB0aGlzLnJlc29sdmVycy5tb2R1bGUuYWRkT3ZlcnJpZGUobmdNb2R1bGUsIG92ZXJyaWRlKTtcbiAgICBjb25zdCBtZXRhZGF0YSA9IHRoaXMucmVzb2x2ZXJzLm1vZHVsZS5yZXNvbHZlKG5nTW9kdWxlKTtcbiAgICBpZiAobWV0YWRhdGEgPT09IG51bGwpIHtcbiAgICAgIHRocm93IGludmFsaWRUeXBlRXJyb3IobmdNb2R1bGUubmFtZSwgJ05nTW9kdWxlJyk7XG4gICAgfVxuXG4gICAgdGhpcy5yZWNvbXBpbGVOZ01vZHVsZShuZ01vZHVsZSwgbWV0YWRhdGEpO1xuXG4gICAgLy8gQXQgdGhpcyBwb2ludCwgdGhlIG1vZHVsZSBoYXMgYSB2YWxpZCBtb2R1bGUgZGVmICjJtW1vZCksIGJ1dCB0aGUgb3ZlcnJpZGUgbWF5IGhhdmUgaW50cm9kdWNlZFxuICAgIC8vIG5ldyBkZWNsYXJhdGlvbnMgb3IgaW1wb3J0ZWQgbW9kdWxlcy4gSW5nZXN0IGFueSBwb3NzaWJsZSBuZXcgdHlwZXMgYW5kIGFkZCB0aGVtIHRvIHRoZVxuICAgIC8vIGN1cnJlbnQgcXVldWUuXG4gICAgdGhpcy5xdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheShbbmdNb2R1bGVdKTtcbiAgfVxuXG4gIG92ZXJyaWRlQ29tcG9uZW50KGNvbXBvbmVudDogVHlwZTxhbnk+LCBvdmVycmlkZTogTWV0YWRhdGFPdmVycmlkZTxDb21wb25lbnQ+KTogdm9pZCB7XG4gICAgdGhpcy52ZXJpZnlOb1N0YW5kYWxvbmVGbGFnT3ZlcnJpZGVzKGNvbXBvbmVudCwgb3ZlcnJpZGUpO1xuICAgIHRoaXMucmVzb2x2ZXJzLmNvbXBvbmVudC5hZGRPdmVycmlkZShjb21wb25lbnQsIG92ZXJyaWRlKTtcbiAgICB0aGlzLnBlbmRpbmdDb21wb25lbnRzLmFkZChjb21wb25lbnQpO1xuICB9XG5cbiAgb3ZlcnJpZGVEaXJlY3RpdmUoZGlyZWN0aXZlOiBUeXBlPGFueT4sIG92ZXJyaWRlOiBNZXRhZGF0YU92ZXJyaWRlPERpcmVjdGl2ZT4pOiB2b2lkIHtcbiAgICB0aGlzLnZlcmlmeU5vU3RhbmRhbG9uZUZsYWdPdmVycmlkZXMoZGlyZWN0aXZlLCBvdmVycmlkZSk7XG4gICAgdGhpcy5yZXNvbHZlcnMuZGlyZWN0aXZlLmFkZE92ZXJyaWRlKGRpcmVjdGl2ZSwgb3ZlcnJpZGUpO1xuICAgIHRoaXMucGVuZGluZ0RpcmVjdGl2ZXMuYWRkKGRpcmVjdGl2ZSk7XG4gIH1cblxuICBvdmVycmlkZVBpcGUocGlwZTogVHlwZTxhbnk+LCBvdmVycmlkZTogTWV0YWRhdGFPdmVycmlkZTxQaXBlPik6IHZvaWQge1xuICAgIHRoaXMudmVyaWZ5Tm9TdGFuZGFsb25lRmxhZ092ZXJyaWRlcyhwaXBlLCBvdmVycmlkZSk7XG4gICAgdGhpcy5yZXNvbHZlcnMucGlwZS5hZGRPdmVycmlkZShwaXBlLCBvdmVycmlkZSk7XG4gICAgdGhpcy5wZW5kaW5nUGlwZXMuYWRkKHBpcGUpO1xuICB9XG5cbiAgcHJpdmF0ZSB2ZXJpZnlOb1N0YW5kYWxvbmVGbGFnT3ZlcnJpZGVzKFxuICAgICAgdHlwZTogVHlwZTxhbnk+LCBvdmVycmlkZTogTWV0YWRhdGFPdmVycmlkZTxDb21wb25lbnR8RGlyZWN0aXZlfFBpcGU+KSB7XG4gICAgaWYgKG92ZXJyaWRlLmFkZD8uaGFzT3duUHJvcGVydHkoJ3N0YW5kYWxvbmUnKSB8fCBvdmVycmlkZS5zZXQ/Lmhhc093blByb3BlcnR5KCdzdGFuZGFsb25lJykgfHxcbiAgICAgICAgb3ZlcnJpZGUucmVtb3ZlPy5oYXNPd25Qcm9wZXJ0eSgnc3RhbmRhbG9uZScpKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYEFuIG92ZXJyaWRlIGZvciB0aGUgJHt0eXBlLm5hbWV9IGNsYXNzIGhhcyB0aGUgXFxgc3RhbmRhbG9uZVxcYCBmbGFnLiBgICtcbiAgICAgICAgICBgQ2hhbmdpbmcgdGhlIFxcYHN0YW5kYWxvbmVcXGAgZmxhZyB2aWEgVGVzdEJlZCBvdmVycmlkZXMgaXMgbm90IHN1cHBvcnRlZC5gKTtcbiAgICB9XG4gIH1cblxuICBvdmVycmlkZVByb3ZpZGVyKFxuICAgICAgdG9rZW46IGFueSxcbiAgICAgIHByb3ZpZGVyOiB7dXNlRmFjdG9yeT86IEZ1bmN0aW9uLCB1c2VWYWx1ZT86IGFueSwgZGVwcz86IGFueVtdLCBtdWx0aT86IGJvb2xlYW59KTogdm9pZCB7XG4gICAgbGV0IHByb3ZpZGVyRGVmOiBQcm92aWRlcjtcbiAgICBpZiAocHJvdmlkZXIudXNlRmFjdG9yeSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcm92aWRlckRlZiA9IHtcbiAgICAgICAgcHJvdmlkZTogdG9rZW4sXG4gICAgICAgIHVzZUZhY3Rvcnk6IHByb3ZpZGVyLnVzZUZhY3RvcnksXG4gICAgICAgIGRlcHM6IHByb3ZpZGVyLmRlcHMgfHwgW10sXG4gICAgICAgIG11bHRpOiBwcm92aWRlci5tdWx0aVxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHByb3ZpZGVyLnVzZVZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb3ZpZGVyRGVmID0ge3Byb3ZpZGU6IHRva2VuLCB1c2VWYWx1ZTogcHJvdmlkZXIudXNlVmFsdWUsIG11bHRpOiBwcm92aWRlci5tdWx0aX07XG4gICAgfSBlbHNlIHtcbiAgICAgIHByb3ZpZGVyRGVmID0ge3Byb3ZpZGU6IHRva2VufTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmplY3RhYmxlRGVmOiBJbmplY3RhYmxlRGVjbGFyYXRpb248YW55PnxudWxsID1cbiAgICAgICAgdHlwZW9mIHRva2VuICE9PSAnc3RyaW5nJyA/IGdldEluamVjdGFibGVEZWYodG9rZW4pIDogbnVsbDtcbiAgICBjb25zdCBwcm92aWRlZEluID0gaW5qZWN0YWJsZURlZiA9PT0gbnVsbCA/IG51bGwgOiByZXNvbHZlRm9yd2FyZFJlZihpbmplY3RhYmxlRGVmLnByb3ZpZGVkSW4pO1xuICAgIGNvbnN0IG92ZXJyaWRlc0J1Y2tldCA9XG4gICAgICAgIHByb3ZpZGVkSW4gPT09ICdyb290JyA/IHRoaXMucm9vdFByb3ZpZGVyT3ZlcnJpZGVzIDogdGhpcy5wcm92aWRlck92ZXJyaWRlcztcbiAgICBvdmVycmlkZXNCdWNrZXQucHVzaChwcm92aWRlckRlZik7XG5cbiAgICAvLyBLZWVwIG92ZXJyaWRlcyBncm91cGVkIGJ5IHRva2VuIGFzIHdlbGwgZm9yIGZhc3QgbG9va3VwcyB1c2luZyB0b2tlblxuICAgIHRoaXMucHJvdmlkZXJPdmVycmlkZXNCeVRva2VuLnNldCh0b2tlbiwgcHJvdmlkZXJEZWYpO1xuICAgIGlmIChpbmplY3RhYmxlRGVmICE9PSBudWxsICYmIHByb3ZpZGVkSW4gIT09IG51bGwgJiYgdHlwZW9mIHByb3ZpZGVkSW4gIT09ICdzdHJpbmcnKSB7XG4gICAgICBjb25zdCBleGlzdGluZ092ZXJyaWRlcyA9IHRoaXMucHJvdmlkZXJPdmVycmlkZXNCeU1vZHVsZS5nZXQocHJvdmlkZWRJbik7XG4gICAgICBpZiAoZXhpc3RpbmdPdmVycmlkZXMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBleGlzdGluZ092ZXJyaWRlcy5wdXNoKHByb3ZpZGVyRGVmKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMucHJvdmlkZXJPdmVycmlkZXNCeU1vZHVsZS5zZXQocHJvdmlkZWRJbiwgW3Byb3ZpZGVyRGVmXSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgb3ZlcnJpZGVUZW1wbGF0ZVVzaW5nVGVzdGluZ01vZHVsZSh0eXBlOiBUeXBlPGFueT4sIHRlbXBsYXRlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBkZWYgPSAodHlwZSBhcyBhbnkpW05HX0NPTVBfREVGXTtcbiAgICBjb25zdCBoYXNTdHlsZVVybHMgPSAoKTogYm9vbGVhbiA9PiB7XG4gICAgICBjb25zdCBtZXRhZGF0YSA9IHRoaXMucmVzb2x2ZXJzLmNvbXBvbmVudC5yZXNvbHZlKHR5cGUpISBhcyBDb21wb25lbnQ7XG4gICAgICByZXR1cm4gISFtZXRhZGF0YS5zdHlsZVVybCB8fCAhIW1ldGFkYXRhLnN0eWxlVXJscz8ubGVuZ3RoO1xuICAgIH07XG4gICAgY29uc3Qgb3ZlcnJpZGVTdHlsZVVybHMgPSAhIWRlZiAmJiAhybVpc0NvbXBvbmVudERlZlBlbmRpbmdSZXNvbHV0aW9uKHR5cGUpICYmIGhhc1N0eWxlVXJscygpO1xuXG4gICAgLy8gSW4gSXZ5LCBjb21waWxpbmcgYSBjb21wb25lbnQgZG9lcyBub3QgcmVxdWlyZSBrbm93aW5nIHRoZSBtb2R1bGUgcHJvdmlkaW5nIHRoZVxuICAgIC8vIGNvbXBvbmVudCdzIHNjb3BlLCBzbyBvdmVycmlkZVRlbXBsYXRlVXNpbmdUZXN0aW5nTW9kdWxlIGNhbiBiZSBpbXBsZW1lbnRlZCBwdXJlbHkgdmlhXG4gICAgLy8gb3ZlcnJpZGVDb21wb25lbnQuIEltcG9ydGFudDogb3ZlcnJpZGluZyB0ZW1wbGF0ZSByZXF1aXJlcyBmdWxsIENvbXBvbmVudCByZS1jb21waWxhdGlvbixcbiAgICAvLyB3aGljaCBtYXkgZmFpbCBpbiBjYXNlIHN0eWxlVXJscyBhcmUgYWxzbyBwcmVzZW50ICh0aHVzIENvbXBvbmVudCBpcyBjb25zaWRlcmVkIGFzIHJlcXVpcmVkXG4gICAgLy8gcmVzb2x1dGlvbikuIEluIG9yZGVyIHRvIGF2b2lkIHRoaXMsIHdlIHByZWVtcHRpdmVseSBzZXQgc3R5bGVVcmxzIHRvIGFuIGVtcHR5IGFycmF5LFxuICAgIC8vIHByZXNlcnZlIGN1cnJlbnQgc3R5bGVzIGF2YWlsYWJsZSBvbiBDb21wb25lbnQgZGVmIGFuZCByZXN0b3JlIHN0eWxlcyBiYWNrIG9uY2UgY29tcGlsYXRpb25cbiAgICAvLyBpcyBjb21wbGV0ZS5cbiAgICBjb25zdCBvdmVycmlkZSA9XG4gICAgICAgIG92ZXJyaWRlU3R5bGVVcmxzID8ge3RlbXBsYXRlLCBzdHlsZXM6IFtdLCBzdHlsZVVybHM6IFtdLCBzdHlsZVVybDogdW5kZWZpbmVkfSA6IHt0ZW1wbGF0ZX07XG4gICAgdGhpcy5vdmVycmlkZUNvbXBvbmVudCh0eXBlLCB7c2V0OiBvdmVycmlkZX0pO1xuXG4gICAgaWYgKG92ZXJyaWRlU3R5bGVVcmxzICYmIGRlZi5zdHlsZXMgJiYgZGVmLnN0eWxlcy5sZW5ndGggPiAwKSB7XG4gICAgICB0aGlzLmV4aXN0aW5nQ29tcG9uZW50U3R5bGVzLnNldCh0eXBlLCBkZWYuc3R5bGVzKTtcbiAgICB9XG5cbiAgICAvLyBTZXQgdGhlIGNvbXBvbmVudCdzIHNjb3BlIHRvIGJlIHRoZSB0ZXN0aW5nIG1vZHVsZS5cbiAgICB0aGlzLmNvbXBvbmVudFRvTW9kdWxlU2NvcGUuc2V0KHR5cGUsIFRlc3RpbmdNb2R1bGVPdmVycmlkZS5PVkVSUklERV9URU1QTEFURSk7XG4gIH1cblxuICBwcml2YXRlIGFzeW5jIHJlc29sdmVQZW5kaW5nQ29tcG9uZW50c1dpdGhBc3luY01ldGFkYXRhKCkge1xuICAgIGlmICh0aGlzLnBlbmRpbmdDb21wb25lbnRzLnNpemUgPT09IDApIHJldHVybjtcblxuICAgIGNvbnN0IHByb21pc2VzID0gW107XG4gICAgZm9yIChjb25zdCBjb21wb25lbnQgb2YgdGhpcy5wZW5kaW5nQ29tcG9uZW50cykge1xuICAgICAgY29uc3QgYXN5bmNNZXRhZGF0YUZuID0gZ2V0QXN5bmNDbGFzc01ldGFkYXRhRm4oY29tcG9uZW50KTtcbiAgICAgIGlmIChhc3luY01ldGFkYXRhRm4pIHtcbiAgICAgICAgcHJvbWlzZXMucHVzaChhc3luY01ldGFkYXRhRm4oKSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgY29uc3QgcmVzb2x2ZWREZXBzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIHRoaXMucXVldWVUeXBlc0Zyb21Nb2R1bGVzQXJyYXkocmVzb2x2ZWREZXBzLmZsYXQoMikpO1xuICB9XG5cbiAgYXN5bmMgY29tcGlsZUNvbXBvbmVudHMoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgdGhpcy5jbGVhckNvbXBvbmVudFJlc29sdXRpb25RdWV1ZSgpO1xuXG4gICAgLy8gV2FpdCBmb3IgYWxsIGFzeW5jIG1ldGFkYXRhIGZvciBjb21wb25lbnRzIHRoYXQgd2VyZVxuICAgIC8vIG92ZXJyaWRkZW4sIHdlIG5lZWQgcmVzb2x2ZWQgbWV0YWRhdGEgdG8gcGVyZm9ybSBhbiBvdmVycmlkZVxuICAgIC8vIGFuZCByZS1jb21waWxlIGEgY29tcG9uZW50LlxuICAgIGF3YWl0IHRoaXMucmVzb2x2ZVBlbmRpbmdDb21wb25lbnRzV2l0aEFzeW5jTWV0YWRhdGEoKTtcblxuICAgIC8vIFZlcmlmeSB0aGF0IHRoZXJlIHdlcmUgbm8gc3RhbmRhbG9uZSBjb21wb25lbnRzIHByZXNlbnQgaW4gdGhlIGBkZWNsYXJhdGlvbnNgIGZpZWxkXG4gICAgLy8gZHVyaW5nIHRoZSBgVGVzdEJlZC5jb25maWd1cmVUZXN0aW5nTW9kdWxlYCBjYWxsLiBXZSBwZXJmb3JtIHRoaXMgY2hlY2sgaGVyZSBpbiBhZGRpdGlvblxuICAgIC8vIHRvIHRoZSBsb2dpYyBpbiB0aGUgYGNvbmZpZ3VyZVRlc3RpbmdNb2R1bGVgIGZ1bmN0aW9uLCBzaW5jZSBhdCB0aGlzIHBvaW50IHdlIGhhdmVcbiAgICAvLyBhbGwgYXN5bmMgbWV0YWRhdGEgcmVzb2x2ZWQuXG4gICAgYXNzZXJ0Tm9TdGFuZGFsb25lQ29tcG9uZW50cyhcbiAgICAgICAgdGhpcy5kZWNsYXJhdGlvbnMsIHRoaXMucmVzb2x2ZXJzLmNvbXBvbmVudCwgJ1wiVGVzdEJlZC5jb25maWd1cmVUZXN0aW5nTW9kdWxlXCIgY2FsbCcpO1xuXG4gICAgLy8gUnVuIGNvbXBpbGVycyBmb3IgYWxsIHF1ZXVlZCB0eXBlcy5cbiAgICBsZXQgbmVlZHNBc3luY1Jlc291cmNlcyA9IHRoaXMuY29tcGlsZVR5cGVzU3luYygpO1xuXG4gICAgLy8gY29tcGlsZUNvbXBvbmVudHMoKSBzaG91bGQgbm90IGJlIGFzeW5jIHVubGVzcyBpdCBuZWVkcyB0byBiZS5cbiAgICBpZiAobmVlZHNBc3luY1Jlc291cmNlcykge1xuICAgICAgbGV0IHJlc291cmNlTG9hZGVyOiBSZXNvdXJjZUxvYWRlcjtcbiAgICAgIGxldCByZXNvbHZlciA9ICh1cmw6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiA9PiB7XG4gICAgICAgIGlmICghcmVzb3VyY2VMb2FkZXIpIHtcbiAgICAgICAgICByZXNvdXJjZUxvYWRlciA9IHRoaXMuaW5qZWN0b3IuZ2V0KFJlc291cmNlTG9hZGVyKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHJlc291cmNlTG9hZGVyLmdldCh1cmwpKTtcbiAgICAgIH07XG4gICAgICBhd2FpdCDJtXJlc29sdmVDb21wb25lbnRSZXNvdXJjZXMocmVzb2x2ZXIpO1xuICAgIH1cbiAgfVxuXG4gIGZpbmFsaXplKCk6IE5nTW9kdWxlUmVmPGFueT4ge1xuICAgIC8vIE9uZSBsYXN0IGNvbXBpbGVcbiAgICB0aGlzLmNvbXBpbGVUeXBlc1N5bmMoKTtcblxuICAgIC8vIENyZWF0ZSB0aGUgdGVzdGluZyBtb2R1bGUgaXRzZWxmLlxuICAgIHRoaXMuY29tcGlsZVRlc3RNb2R1bGUoKTtcblxuICAgIHRoaXMuYXBwbHlUcmFuc2l0aXZlU2NvcGVzKCk7XG5cbiAgICB0aGlzLmFwcGx5UHJvdmlkZXJPdmVycmlkZXMoKTtcblxuICAgIC8vIFBhdGNoIHByZXZpb3VzbHkgc3RvcmVkIGBzdHlsZXNgIENvbXBvbmVudCB2YWx1ZXMgKHRha2VuIGZyb20gybVjbXApLCBpbiBjYXNlIHRoZXNlXG4gICAgLy8gQ29tcG9uZW50cyBoYXZlIGBzdHlsZVVybHNgIGZpZWxkcyBkZWZpbmVkIGFuZCB0ZW1wbGF0ZSBvdmVycmlkZSB3YXMgcmVxdWVzdGVkLlxuICAgIHRoaXMucGF0Y2hDb21wb25lbnRzV2l0aEV4aXN0aW5nU3R5bGVzKCk7XG5cbiAgICAvLyBDbGVhciB0aGUgY29tcG9uZW50VG9Nb2R1bGVTY29wZSBtYXAsIHNvIHRoYXQgZnV0dXJlIGNvbXBpbGF0aW9ucyBkb24ndCByZXNldCB0aGUgc2NvcGUgb2ZcbiAgICAvLyBldmVyeSBjb21wb25lbnQuXG4gICAgdGhpcy5jb21wb25lbnRUb01vZHVsZVNjb3BlLmNsZWFyKCk7XG5cbiAgICBjb25zdCBwYXJlbnRJbmplY3RvciA9IHRoaXMucGxhdGZvcm0uaW5qZWN0b3I7XG4gICAgdGhpcy50ZXN0TW9kdWxlUmVmID0gbmV3IE5nTW9kdWxlUmVmKHRoaXMudGVzdE1vZHVsZVR5cGUsIHBhcmVudEluamVjdG9yLCBbXSk7XG5cbiAgICAvLyBBcHBsaWNhdGlvbkluaXRTdGF0dXMucnVuSW5pdGlhbGl6ZXJzKCkgaXMgbWFya2VkIEBpbnRlcm5hbCB0byBjb3JlLlxuICAgIC8vIENhc3QgaXQgdG8gYW55IGJlZm9yZSBhY2Nlc3NpbmcgaXQuXG4gICAgKHRoaXMudGVzdE1vZHVsZVJlZi5pbmplY3Rvci5nZXQoQXBwbGljYXRpb25Jbml0U3RhdHVzKSBhcyBhbnkpLnJ1bkluaXRpYWxpemVycygpO1xuXG4gICAgLy8gU2V0IGxvY2FsZSBJRCBhZnRlciBydW5uaW5nIGFwcCBpbml0aWFsaXplcnMsIHNpbmNlIGxvY2FsZSBpbmZvcm1hdGlvbiBtaWdodCBiZSB1cGRhdGVkIHdoaWxlXG4gICAgLy8gcnVubmluZyBpbml0aWFsaXplcnMuIFRoaXMgaXMgYWxzbyBjb25zaXN0ZW50IHdpdGggdGhlIGV4ZWN1dGlvbiBvcmRlciB3aGlsZSBib290c3RyYXBwaW5nIGFuXG4gICAgLy8gYXBwIChzZWUgYHBhY2thZ2VzL2NvcmUvc3JjL2FwcGxpY2F0aW9uX3JlZi50c2AgZmlsZSkuXG4gICAgY29uc3QgbG9jYWxlSWQgPSB0aGlzLnRlc3RNb2R1bGVSZWYuaW5qZWN0b3IuZ2V0KExPQ0FMRV9JRCwgREVGQVVMVF9MT0NBTEVfSUQpO1xuICAgIHNldExvY2FsZUlkKGxvY2FsZUlkKTtcblxuICAgIHJldHVybiB0aGlzLnRlc3RNb2R1bGVSZWY7XG4gIH1cblxuICAvKipcbiAgICogQGludGVybmFsXG4gICAqL1xuICBfY29tcGlsZU5nTW9kdWxlU3luYyhtb2R1bGVUeXBlOiBUeXBlPGFueT4pOiB2b2lkIHtcbiAgICB0aGlzLnF1ZXVlVHlwZXNGcm9tTW9kdWxlc0FycmF5KFttb2R1bGVUeXBlXSk7XG4gICAgdGhpcy5jb21waWxlVHlwZXNTeW5jKCk7XG4gICAgdGhpcy5hcHBseVByb3ZpZGVyT3ZlcnJpZGVzKCk7XG4gICAgdGhpcy5hcHBseVByb3ZpZGVyT3ZlcnJpZGVzSW5TY29wZShtb2R1bGVUeXBlKTtcbiAgICB0aGlzLmFwcGx5VHJhbnNpdGl2ZVNjb3BlcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKi9cbiAgYXN5bmMgX2NvbXBpbGVOZ01vZHVsZUFzeW5jKG1vZHVsZVR5cGU6IFR5cGU8YW55Pik6IFByb21pc2U8dm9pZD4ge1xuICAgIHRoaXMucXVldWVUeXBlc0Zyb21Nb2R1bGVzQXJyYXkoW21vZHVsZVR5cGVdKTtcbiAgICBhd2FpdCB0aGlzLmNvbXBpbGVDb21wb25lbnRzKCk7XG4gICAgdGhpcy5hcHBseVByb3ZpZGVyT3ZlcnJpZGVzKCk7XG4gICAgdGhpcy5hcHBseVByb3ZpZGVyT3ZlcnJpZGVzSW5TY29wZShtb2R1bGVUeXBlKTtcbiAgICB0aGlzLmFwcGx5VHJhbnNpdGl2ZVNjb3BlcygpO1xuICB9XG5cbiAgLyoqXG4gICAqIEBpbnRlcm5hbFxuICAgKi9cbiAgX2dldE1vZHVsZVJlc29sdmVyKCk6IFJlc29sdmVyPE5nTW9kdWxlPiB7XG4gICAgcmV0dXJuIHRoaXMucmVzb2x2ZXJzLm1vZHVsZTtcbiAgfVxuXG4gIC8qKlxuICAgKiBAaW50ZXJuYWxcbiAgICovXG4gIF9nZXRDb21wb25lbnRGYWN0b3JpZXMobW9kdWxlVHlwZTogTmdNb2R1bGVUeXBlKTogQ29tcG9uZW50RmFjdG9yeTxhbnk+W10ge1xuICAgIHJldHVybiBtYXliZVVud3JhcEZuKG1vZHVsZVR5cGUuybVtb2QuZGVjbGFyYXRpb25zKS5yZWR1Y2UoKGZhY3RvcmllcywgZGVjbGFyYXRpb24pID0+IHtcbiAgICAgIGNvbnN0IGNvbXBvbmVudERlZiA9IChkZWNsYXJhdGlvbiBhcyBhbnkpLsm1Y21wO1xuICAgICAgY29tcG9uZW50RGVmICYmIGZhY3Rvcmllcy5wdXNoKG5ldyBDb21wb25lbnRGYWN0b3J5KGNvbXBvbmVudERlZiwgdGhpcy50ZXN0TW9kdWxlUmVmISkpO1xuICAgICAgcmV0dXJuIGZhY3RvcmllcztcbiAgICB9LCBbXSBhcyBDb21wb25lbnRGYWN0b3J5PGFueT5bXSk7XG4gIH1cblxuICBwcml2YXRlIGNvbXBpbGVUeXBlc1N5bmMoKTogYm9vbGVhbiB7XG4gICAgLy8gQ29tcGlsZSBhbGwgcXVldWVkIGNvbXBvbmVudHMsIGRpcmVjdGl2ZXMsIHBpcGVzLlxuICAgIGxldCBuZWVkc0FzeW5jUmVzb3VyY2VzID0gZmFsc2U7XG4gICAgdGhpcy5wZW5kaW5nQ29tcG9uZW50cy5mb3JFYWNoKGRlY2xhcmF0aW9uID0+IHtcbiAgICAgIGlmIChnZXRBc3luY0NsYXNzTWV0YWRhdGFGbihkZWNsYXJhdGlvbikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgYENvbXBvbmVudCAnJHtkZWNsYXJhdGlvbi5uYW1lfScgaGFzIHVucmVzb2x2ZWQgbWV0YWRhdGEuIGAgK1xuICAgICAgICAgICAgYFBsZWFzZSBjYWxsIFxcYGF3YWl0IFRlc3RCZWQuY29tcGlsZUNvbXBvbmVudHMoKVxcYCBiZWZvcmUgcnVubmluZyB0aGlzIHRlc3QuYCk7XG4gICAgICB9XG5cbiAgICAgIG5lZWRzQXN5bmNSZXNvdXJjZXMgPSBuZWVkc0FzeW5jUmVzb3VyY2VzIHx8IMm1aXNDb21wb25lbnREZWZQZW5kaW5nUmVzb2x1dGlvbihkZWNsYXJhdGlvbik7XG5cbiAgICAgIGNvbnN0IG1ldGFkYXRhID0gdGhpcy5yZXNvbHZlcnMuY29tcG9uZW50LnJlc29sdmUoZGVjbGFyYXRpb24pO1xuICAgICAgaWYgKG1ldGFkYXRhID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IGludmFsaWRUeXBlRXJyb3IoZGVjbGFyYXRpb24ubmFtZSwgJ0NvbXBvbmVudCcpO1xuICAgICAgfVxuXG4gICAgICB0aGlzLm1heWJlU3RvcmVOZ0RlZihOR19DT01QX0RFRiwgZGVjbGFyYXRpb24pO1xuICAgICAgaWYgKFVTRV9SVU5USU1FX0RFUFNfVFJBQ0tFUl9GT1JfSklUKSB7XG4gICAgICAgIGRlcHNUcmFja2VyLmNsZWFyU2NvcGVDYWNoZUZvcihkZWNsYXJhdGlvbik7XG4gICAgICB9XG4gICAgICBjb21waWxlQ29tcG9uZW50KGRlY2xhcmF0aW9uLCBtZXRhZGF0YSk7XG4gICAgfSk7XG4gICAgdGhpcy5wZW5kaW5nQ29tcG9uZW50cy5jbGVhcigpO1xuXG4gICAgdGhpcy5wZW5kaW5nRGlyZWN0aXZlcy5mb3JFYWNoKGRlY2xhcmF0aW9uID0+IHtcbiAgICAgIGNvbnN0IG1ldGFkYXRhID0gdGhpcy5yZXNvbHZlcnMuZGlyZWN0aXZlLnJlc29sdmUoZGVjbGFyYXRpb24pO1xuICAgICAgaWYgKG1ldGFkYXRhID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IGludmFsaWRUeXBlRXJyb3IoZGVjbGFyYXRpb24ubmFtZSwgJ0RpcmVjdGl2ZScpO1xuICAgICAgfVxuICAgICAgdGhpcy5tYXliZVN0b3JlTmdEZWYoTkdfRElSX0RFRiwgZGVjbGFyYXRpb24pO1xuICAgICAgY29tcGlsZURpcmVjdGl2ZShkZWNsYXJhdGlvbiwgbWV0YWRhdGEpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ0RpcmVjdGl2ZXMuY2xlYXIoKTtcblxuICAgIHRoaXMucGVuZGluZ1BpcGVzLmZvckVhY2goZGVjbGFyYXRpb24gPT4ge1xuICAgICAgY29uc3QgbWV0YWRhdGEgPSB0aGlzLnJlc29sdmVycy5waXBlLnJlc29sdmUoZGVjbGFyYXRpb24pO1xuICAgICAgaWYgKG1ldGFkYXRhID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IGludmFsaWRUeXBlRXJyb3IoZGVjbGFyYXRpb24ubmFtZSwgJ1BpcGUnKTtcbiAgICAgIH1cbiAgICAgIHRoaXMubWF5YmVTdG9yZU5nRGVmKE5HX1BJUEVfREVGLCBkZWNsYXJhdGlvbik7XG4gICAgICBjb21waWxlUGlwZShkZWNsYXJhdGlvbiwgbWV0YWRhdGEpO1xuICAgIH0pO1xuICAgIHRoaXMucGVuZGluZ1BpcGVzLmNsZWFyKCk7XG5cbiAgICByZXR1cm4gbmVlZHNBc3luY1Jlc291cmNlcztcbiAgfVxuXG4gIHByaXZhdGUgYXBwbHlUcmFuc2l0aXZlU2NvcGVzKCk6IHZvaWQge1xuICAgIGlmICh0aGlzLm92ZXJyaWRkZW5Nb2R1bGVzLnNpemUgPiAwKSB7XG4gICAgICAvLyBNb2R1bGUgb3ZlcnJpZGVzICh2aWEgYFRlc3RCZWQub3ZlcnJpZGVNb2R1bGVgKSBtaWdodCBhZmZlY3Qgc2NvcGVzIHRoYXQgd2VyZSBwcmV2aW91c2x5XG4gICAgICAvLyBjYWxjdWxhdGVkIGFuZCBzdG9yZWQgaW4gYHRyYW5zaXRpdmVDb21waWxlU2NvcGVzYC4gSWYgbW9kdWxlIG92ZXJyaWRlcyBhcmUgcHJlc2VudCxcbiAgICAgIC8vIGNvbGxlY3QgYWxsIGFmZmVjdGVkIG1vZHVsZXMgYW5kIHJlc2V0IHNjb3BlcyB0byBmb3JjZSB0aGVpciByZS1jYWxjdWxhdGlvbi5cbiAgICAgIGNvbnN0IHRlc3RpbmdNb2R1bGVEZWYgPSAodGhpcy50ZXN0TW9kdWxlVHlwZSBhcyBhbnkpW05HX01PRF9ERUZdO1xuICAgICAgY29uc3QgYWZmZWN0ZWRNb2R1bGVzID0gdGhpcy5jb2xsZWN0TW9kdWxlc0FmZmVjdGVkQnlPdmVycmlkZXModGVzdGluZ01vZHVsZURlZi5pbXBvcnRzKTtcbiAgICAgIGlmIChhZmZlY3RlZE1vZHVsZXMuc2l6ZSA+IDApIHtcbiAgICAgICAgYWZmZWN0ZWRNb2R1bGVzLmZvckVhY2gobW9kdWxlVHlwZSA9PiB7XG4gICAgICAgICAgaWYgKCFVU0VfUlVOVElNRV9ERVBTX1RSQUNLRVJfRk9SX0pJVCkge1xuICAgICAgICAgICAgdGhpcy5zdG9yZUZpZWxkT2ZEZWZPblR5cGUobW9kdWxlVHlwZSBhcyBhbnksIE5HX01PRF9ERUYsICd0cmFuc2l0aXZlQ29tcGlsZVNjb3BlcycpO1xuICAgICAgICAgICAgKG1vZHVsZVR5cGUgYXMgYW55KVtOR19NT0RfREVGXS50cmFuc2l0aXZlQ29tcGlsZVNjb3BlcyA9IG51bGw7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlcHNUcmFja2VyLmNsZWFyU2NvcGVDYWNoZUZvcihtb2R1bGVUeXBlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIGNvbnN0IG1vZHVsZVRvU2NvcGUgPSBuZXcgTWFwPFR5cGU8YW55PnxUZXN0aW5nTW9kdWxlT3ZlcnJpZGUsIE5nTW9kdWxlVHJhbnNpdGl2ZVNjb3Blcz4oKTtcbiAgICBjb25zdCBnZXRTY29wZU9mTW9kdWxlID1cbiAgICAgICAgKG1vZHVsZVR5cGU6IFR5cGU8YW55PnxUZXN0aW5nTW9kdWxlT3ZlcnJpZGUpOiBOZ01vZHVsZVRyYW5zaXRpdmVTY29wZXMgPT4ge1xuICAgICAgICAgIGlmICghbW9kdWxlVG9TY29wZS5oYXMobW9kdWxlVHlwZSkpIHtcbiAgICAgICAgICAgIGNvbnN0IGlzVGVzdGluZ01vZHVsZSA9IGlzVGVzdGluZ01vZHVsZU92ZXJyaWRlKG1vZHVsZVR5cGUpO1xuICAgICAgICAgICAgY29uc3QgcmVhbFR5cGUgPSBpc1Rlc3RpbmdNb2R1bGUgPyB0aGlzLnRlc3RNb2R1bGVUeXBlIDogbW9kdWxlVHlwZSBhcyBUeXBlPGFueT47XG4gICAgICAgICAgICBtb2R1bGVUb1Njb3BlLnNldChtb2R1bGVUeXBlLCB0cmFuc2l0aXZlU2NvcGVzRm9yKHJlYWxUeXBlKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiBtb2R1bGVUb1Njb3BlLmdldChtb2R1bGVUeXBlKSE7XG4gICAgICAgIH07XG5cbiAgICB0aGlzLmNvbXBvbmVudFRvTW9kdWxlU2NvcGUuZm9yRWFjaCgobW9kdWxlVHlwZSwgY29tcG9uZW50VHlwZSkgPT4ge1xuICAgICAgaWYgKG1vZHVsZVR5cGUgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgbW9kdWxlU2NvcGUgPSBnZXRTY29wZU9mTW9kdWxlKG1vZHVsZVR5cGUpO1xuICAgICAgICB0aGlzLnN0b3JlRmllbGRPZkRlZk9uVHlwZShjb21wb25lbnRUeXBlLCBOR19DT01QX0RFRiwgJ2RpcmVjdGl2ZURlZnMnKTtcbiAgICAgICAgdGhpcy5zdG9yZUZpZWxkT2ZEZWZPblR5cGUoY29tcG9uZW50VHlwZSwgTkdfQ09NUF9ERUYsICdwaXBlRGVmcycpO1xuICAgICAgICBwYXRjaENvbXBvbmVudERlZldpdGhTY29wZShnZXRDb21wb25lbnREZWYoY29tcG9uZW50VHlwZSkhLCBtb2R1bGVTY29wZSk7XG4gICAgICB9XG4gICAgICAvLyBgdFZpZXdgIHRoYXQgaXMgc3RvcmVkIG9uIGNvbXBvbmVudCBkZWYgY29udGFpbnMgaW5mb3JtYXRpb24gYWJvdXQgZGlyZWN0aXZlcyBhbmQgcGlwZXNcbiAgICAgIC8vIHRoYXQgYXJlIGluIHRoZSBzY29wZSBvZiB0aGlzIGNvbXBvbmVudC4gUGF0Y2hpbmcgY29tcG9uZW50IHNjb3BlIHdpbGwgY2F1c2UgYHRWaWV3YCB0byBiZVxuICAgICAgLy8gY2hhbmdlZC4gU3RvcmUgb3JpZ2luYWwgYHRWaWV3YCBiZWZvcmUgcGF0Y2hpbmcgc2NvcGUsIHNvIHRoZSBgdFZpZXdgIChpbmNsdWRpbmcgc2NvcGVcbiAgICAgIC8vIGluZm9ybWF0aW9uKSBpcyByZXN0b3JlZCBiYWNrIHRvIGl0cyBwcmV2aW91cy9vcmlnaW5hbCBzdGF0ZSBiZWZvcmUgcnVubmluZyBuZXh0IHRlc3QuXG4gICAgICAvLyBSZXNldHRpbmcgYHRWaWV3YCBpcyBhbHNvIG5lZWRlZCBmb3IgY2FzZXMgd2hlbiB3ZSBhcHBseSBwcm92aWRlciBvdmVycmlkZXMgYW5kIHRob3NlXG4gICAgICAvLyBwcm92aWRlcnMgYXJlIGRlZmluZWQgb24gY29tcG9uZW50J3MgbGV2ZWwsIGluIHdoaWNoIGNhc2UgdGhleSBtYXkgZW5kIHVwIGluY2x1ZGVkIGludG9cbiAgICAgIC8vIGB0Vmlldy5ibHVlcHJpbnRgLlxuICAgICAgdGhpcy5zdG9yZUZpZWxkT2ZEZWZPblR5cGUoY29tcG9uZW50VHlwZSwgTkdfQ09NUF9ERUYsICd0VmlldycpO1xuICAgIH0pO1xuXG4gICAgdGhpcy5jb21wb25lbnRUb01vZHVsZVNjb3BlLmNsZWFyKCk7XG4gIH1cblxuICBwcml2YXRlIGFwcGx5UHJvdmlkZXJPdmVycmlkZXMoKTogdm9pZCB7XG4gICAgY29uc3QgbWF5YmVBcHBseU92ZXJyaWRlcyA9IChmaWVsZDogc3RyaW5nKSA9PiAodHlwZTogVHlwZTxhbnk+KSA9PiB7XG4gICAgICBjb25zdCByZXNvbHZlciA9IGZpZWxkID09PSBOR19DT01QX0RFRiA/IHRoaXMucmVzb2x2ZXJzLmNvbXBvbmVudCA6IHRoaXMucmVzb2x2ZXJzLmRpcmVjdGl2ZTtcbiAgICAgIGNvbnN0IG1ldGFkYXRhID0gcmVzb2x2ZXIucmVzb2x2ZSh0eXBlKSE7XG4gICAgICBpZiAodGhpcy5oYXNQcm92aWRlck92ZXJyaWRlcyhtZXRhZGF0YS5wcm92aWRlcnMpKSB7XG4gICAgICAgIHRoaXMucGF0Y2hEZWZXaXRoUHJvdmlkZXJPdmVycmlkZXModHlwZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH07XG4gICAgdGhpcy5zZWVuQ29tcG9uZW50cy5mb3JFYWNoKG1heWJlQXBwbHlPdmVycmlkZXMoTkdfQ09NUF9ERUYpKTtcbiAgICB0aGlzLnNlZW5EaXJlY3RpdmVzLmZvckVhY2gobWF5YmVBcHBseU92ZXJyaWRlcyhOR19ESVJfREVGKSk7XG5cbiAgICB0aGlzLnNlZW5Db21wb25lbnRzLmNsZWFyKCk7XG4gICAgdGhpcy5zZWVuRGlyZWN0aXZlcy5jbGVhcigpO1xuICB9XG5cblxuICAvKipcbiAgICogQXBwbGllcyBwcm92aWRlciBvdmVycmlkZXMgdG8gYSBnaXZlbiB0eXBlIChlaXRoZXIgYW4gTmdNb2R1bGUgb3IgYSBzdGFuZGFsb25lIGNvbXBvbmVudClcbiAgICogYW5kIGFsbCBpbXBvcnRlZCBOZ01vZHVsZXMgYW5kIHN0YW5kYWxvbmUgY29tcG9uZW50cyByZWN1cnNpdmVseS5cbiAgICovXG4gIHByaXZhdGUgYXBwbHlQcm92aWRlck92ZXJyaWRlc0luU2NvcGUodHlwZTogVHlwZTxhbnk+KTogdm9pZCB7XG4gICAgY29uc3QgaGFzU2NvcGUgPSBpc1N0YW5kYWxvbmVDb21wb25lbnQodHlwZSkgfHwgaXNOZ01vZHVsZSh0eXBlKTtcblxuICAgIC8vIFRoZSBmdW5jdGlvbiBjYW4gYmUgcmUtZW50ZXJlZCByZWN1cnNpdmVseSB3aGlsZSBpbnNwZWN0aW5nIGRlcGVuZGVuY2llc1xuICAgIC8vIG9mIGFuIE5nTW9kdWxlIG9yIGEgc3RhbmRhbG9uZSBjb21wb25lbnQuIEV4aXQgZWFybHkgaWYgd2UgY29tZSBhY3Jvc3MgYVxuICAgIC8vIHR5cGUgdGhhdCBjYW4gbm90IGhhdmUgYSBzY29wZSAoZGlyZWN0aXZlIG9yIHBpcGUpIG9yIHRoZSB0eXBlIGlzIGFscmVhZHlcbiAgICAvLyBwcm9jZXNzZWQgZWFybGllci5cbiAgICBpZiAoIWhhc1Njb3BlIHx8IHRoaXMuc2NvcGVzV2l0aE92ZXJyaWRkZW5Qcm92aWRlcnMuaGFzKHR5cGUpKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIHRoaXMuc2NvcGVzV2l0aE92ZXJyaWRkZW5Qcm92aWRlcnMuYWRkKHR5cGUpO1xuXG4gICAgLy8gTk9URTogdGhlIGxpbmUgYmVsb3cgdHJpZ2dlcnMgSklUIGNvbXBpbGF0aW9uIG9mIHRoZSBtb2R1bGUgaW5qZWN0b3IsXG4gICAgLy8gd2hpY2ggYWxzbyBpbnZva2VzIHZlcmlmaWNhdGlvbiBvZiB0aGUgTmdNb2R1bGUgc2VtYW50aWNzLCB3aGljaCBwcm9kdWNlc1xuICAgIC8vIGRldGFpbGVkIGVycm9yIG1lc3NhZ2VzLiBUaGUgZmFjdCB0aGF0IHRoZSBjb2RlIHJlbGllcyBvbiB0aGlzIGxpbmUgYmVpbmdcbiAgICAvLyBwcmVzZW50IGhlcmUgaXMgc3VzcGljaW91cyBhbmQgc2hvdWxkIGJlIHJlZmFjdG9yZWQgaW4gYSB3YXkgdGhhdCB0aGUgbGluZVxuICAgIC8vIGJlbG93IGNhbiBiZSBtb3ZlZCAoZm9yIGV4LiBhZnRlciBhbiBlYXJseSBleGl0IGNoZWNrIGJlbG93KS5cbiAgICBjb25zdCBpbmplY3RvckRlZjogYW55ID0gKHR5cGUgYXMgYW55KVtOR19JTkpfREVGXTtcblxuICAgIC8vIE5vIHByb3ZpZGVyIG92ZXJyaWRlcywgZXhpdCBlYXJseS5cbiAgICBpZiAodGhpcy5wcm92aWRlck92ZXJyaWRlc0J5VG9rZW4uc2l6ZSA9PT0gMCkgcmV0dXJuO1xuXG4gICAgaWYgKGlzU3RhbmRhbG9uZUNvbXBvbmVudCh0eXBlKSkge1xuICAgICAgLy8gVmlzaXQgYWxsIGNvbXBvbmVudCBkZXBlbmRlbmNpZXMgYW5kIG92ZXJyaWRlIHByb3ZpZGVycyB0aGVyZS5cbiAgICAgIGNvbnN0IGRlZiA9IGdldENvbXBvbmVudERlZih0eXBlKTtcbiAgICAgIGNvbnN0IGRlcGVuZGVuY2llcyA9IG1heWJlVW53cmFwRm4oZGVmLmRlcGVuZGVuY2llcyA/PyBbXSk7XG4gICAgICBmb3IgKGNvbnN0IGRlcGVuZGVuY3kgb2YgZGVwZW5kZW5jaWVzKSB7XG4gICAgICAgIHRoaXMuYXBwbHlQcm92aWRlck92ZXJyaWRlc0luU2NvcGUoZGVwZW5kZW5jeSk7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IHByb3ZpZGVyczogQXJyYXk8UHJvdmlkZXJ8SW50ZXJuYWxFbnZpcm9ubWVudFByb3ZpZGVycz4gPSBbXG4gICAgICAgIC4uLmluamVjdG9yRGVmLnByb3ZpZGVycyxcbiAgICAgICAgLi4uKHRoaXMucHJvdmlkZXJPdmVycmlkZXNCeU1vZHVsZS5nZXQodHlwZSBhcyBJbmplY3RvclR5cGU8YW55PikgfHwgW10pXG4gICAgICBdO1xuICAgICAgaWYgKHRoaXMuaGFzUHJvdmlkZXJPdmVycmlkZXMocHJvdmlkZXJzKSkge1xuICAgICAgICB0aGlzLm1heWJlU3RvcmVOZ0RlZihOR19JTkpfREVGLCB0eXBlKTtcblxuICAgICAgICB0aGlzLnN0b3JlRmllbGRPZkRlZk9uVHlwZSh0eXBlLCBOR19JTkpfREVGLCAncHJvdmlkZXJzJyk7XG4gICAgICAgIGluamVjdG9yRGVmLnByb3ZpZGVycyA9IHRoaXMuZ2V0T3ZlcnJpZGRlblByb3ZpZGVycyhwcm92aWRlcnMpO1xuICAgICAgfVxuXG4gICAgICAvLyBBcHBseSBwcm92aWRlciBvdmVycmlkZXMgdG8gaW1wb3J0ZWQgbW9kdWxlcyByZWN1cnNpdmVseVxuICAgICAgY29uc3QgbW9kdWxlRGVmID0gKHR5cGUgYXMgYW55KVtOR19NT0RfREVGXTtcbiAgICAgIGNvbnN0IGltcG9ydHMgPSBtYXliZVVud3JhcEZuKG1vZHVsZURlZi5pbXBvcnRzKTtcbiAgICAgIGZvciAoY29uc3QgaW1wb3J0ZWRNb2R1bGUgb2YgaW1wb3J0cykge1xuICAgICAgICB0aGlzLmFwcGx5UHJvdmlkZXJPdmVycmlkZXNJblNjb3BlKGltcG9ydGVkTW9kdWxlKTtcbiAgICAgIH1cbiAgICAgIC8vIEFsc28gb3ZlcnJpZGUgdGhlIHByb3ZpZGVycyBvbiBhbnkgTW9kdWxlV2l0aFByb3ZpZGVycyBpbXBvcnRzIHNpbmNlIHRob3NlIGRvbid0IGFwcGVhciBpblxuICAgICAgLy8gdGhlIG1vZHVsZURlZi5cbiAgICAgIGZvciAoY29uc3QgaW1wb3J0ZWRNb2R1bGUgb2YgZmxhdHRlbihpbmplY3RvckRlZi5pbXBvcnRzKSkge1xuICAgICAgICBpZiAoaXNNb2R1bGVXaXRoUHJvdmlkZXJzKGltcG9ydGVkTW9kdWxlKSkge1xuICAgICAgICAgIHRoaXMuZGVmQ2xlYW51cE9wcy5wdXNoKHtcbiAgICAgICAgICAgIG9iamVjdDogaW1wb3J0ZWRNb2R1bGUsXG4gICAgICAgICAgICBmaWVsZE5hbWU6ICdwcm92aWRlcnMnLFxuICAgICAgICAgICAgb3JpZ2luYWxWYWx1ZTogaW1wb3J0ZWRNb2R1bGUucHJvdmlkZXJzXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgaW1wb3J0ZWRNb2R1bGUucHJvdmlkZXJzID0gdGhpcy5nZXRPdmVycmlkZGVuUHJvdmlkZXJzKFxuICAgICAgICAgICAgICBpbXBvcnRlZE1vZHVsZS5wcm92aWRlcnMgYXMgQXJyYXk8UHJvdmlkZXJ8SW50ZXJuYWxFbnZpcm9ubWVudFByb3ZpZGVycz4pO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBwYXRjaENvbXBvbmVudHNXaXRoRXhpc3RpbmdTdHlsZXMoKTogdm9pZCB7XG4gICAgdGhpcy5leGlzdGluZ0NvbXBvbmVudFN0eWxlcy5mb3JFYWNoKFxuICAgICAgICAoc3R5bGVzLCB0eXBlKSA9PiAodHlwZSBhcyBhbnkpW05HX0NPTVBfREVGXS5zdHlsZXMgPSBzdHlsZXMpO1xuICAgIHRoaXMuZXhpc3RpbmdDb21wb25lbnRTdHlsZXMuY2xlYXIoKTtcbiAgfVxuXG4gIHByaXZhdGUgcXVldWVUeXBlQXJyYXkoYXJyOiBhbnlbXSwgbW9kdWxlVHlwZTogVHlwZTxhbnk+fFRlc3RpbmdNb2R1bGVPdmVycmlkZSk6IHZvaWQge1xuICAgIGZvciAoY29uc3QgdmFsdWUgb2YgYXJyKSB7XG4gICAgICBpZiAoQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcbiAgICAgICAgdGhpcy5xdWV1ZVR5cGVBcnJheSh2YWx1ZSwgbW9kdWxlVHlwZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnF1ZXVlVHlwZSh2YWx1ZSwgbW9kdWxlVHlwZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSByZWNvbXBpbGVOZ01vZHVsZShuZ01vZHVsZTogVHlwZTxhbnk+LCBtZXRhZGF0YTogTmdNb2R1bGUpOiB2b2lkIHtcbiAgICAvLyBDYWNoZSB0aGUgaW5pdGlhbCBuZ01vZHVsZURlZiBhcyBpdCB3aWxsIGJlIG92ZXJ3cml0dGVuLlxuICAgIHRoaXMubWF5YmVTdG9yZU5nRGVmKE5HX01PRF9ERUYsIG5nTW9kdWxlKTtcbiAgICB0aGlzLm1heWJlU3RvcmVOZ0RlZihOR19JTkpfREVGLCBuZ01vZHVsZSk7XG5cbiAgICBjb21waWxlTmdNb2R1bGVEZWZzKG5nTW9kdWxlIGFzIE5nTW9kdWxlVHlwZTxhbnk+LCBtZXRhZGF0YSk7XG4gIH1cblxuICBwcml2YXRlIHF1ZXVlVHlwZSh0eXBlOiBUeXBlPGFueT4sIG1vZHVsZVR5cGU6IFR5cGU8YW55PnxUZXN0aW5nTW9kdWxlT3ZlcnJpZGV8bnVsbCk6IHZvaWQge1xuICAgIGNvbnN0IGNvbXBvbmVudCA9IHRoaXMucmVzb2x2ZXJzLmNvbXBvbmVudC5yZXNvbHZlKHR5cGUpO1xuICAgIGlmIChjb21wb25lbnQpIHtcbiAgICAgIC8vIENoZWNrIHdoZXRoZXIgYSBnaXZlIFR5cGUgaGFzIHJlc3BlY3RpdmUgTkcgZGVmICjJtWNtcCkgYW5kIGNvbXBpbGUgaWYgZGVmIGlzXG4gICAgICAvLyBtaXNzaW5nLiBUaGF0IG1pZ2h0IGhhcHBlbiBpbiBjYXNlIGEgY2xhc3Mgd2l0aG91dCBhbnkgQW5ndWxhciBkZWNvcmF0b3JzIGV4dGVuZHMgYW5vdGhlclxuICAgICAgLy8gY2xhc3Mgd2hlcmUgQ29tcG9uZW50L0RpcmVjdGl2ZS9QaXBlIGRlY29yYXRvciBpcyBkZWZpbmVkLlxuICAgICAgaWYgKMm1aXNDb21wb25lbnREZWZQZW5kaW5nUmVzb2x1dGlvbih0eXBlKSB8fCAhdHlwZS5oYXNPd25Qcm9wZXJ0eShOR19DT01QX0RFRikpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nQ29tcG9uZW50cy5hZGQodHlwZSk7XG4gICAgICB9XG4gICAgICB0aGlzLnNlZW5Db21wb25lbnRzLmFkZCh0eXBlKTtcblxuICAgICAgLy8gS2VlcCB0cmFjayBvZiB0aGUgbW9kdWxlIHdoaWNoIGRlY2xhcmVzIHRoaXMgY29tcG9uZW50LCBzbyBsYXRlciB0aGUgY29tcG9uZW50J3Mgc2NvcGVcbiAgICAgIC8vIGNhbiBiZSBzZXQgY29ycmVjdGx5LiBJZiB0aGUgY29tcG9uZW50IGhhcyBhbHJlYWR5IGJlZW4gcmVjb3JkZWQgaGVyZSwgdGhlbiBvbmUgb2Ygc2V2ZXJhbFxuICAgICAgLy8gY2FzZXMgaXMgdHJ1ZTpcbiAgICAgIC8vICogdGhlIG1vZHVsZSBjb250YWluaW5nIHRoZSBjb21wb25lbnQgd2FzIGltcG9ydGVkIG11bHRpcGxlIHRpbWVzIChjb21tb24pLlxuICAgICAgLy8gKiB0aGUgY29tcG9uZW50IGlzIGRlY2xhcmVkIGluIG11bHRpcGxlIG1vZHVsZXMgKHdoaWNoIGlzIGFuIGVycm9yKS5cbiAgICAgIC8vICogdGhlIGNvbXBvbmVudCB3YXMgaW4gJ2RlY2xhcmF0aW9ucycgb2YgdGhlIHRlc3RpbmcgbW9kdWxlLCBhbmQgYWxzbyBpbiBhbiBpbXBvcnRlZCBtb2R1bGVcbiAgICAgIC8vICAgaW4gd2hpY2ggY2FzZSB0aGUgbW9kdWxlIHNjb3BlIHdpbGwgYmUgVGVzdGluZ01vZHVsZU92ZXJyaWRlLkRFQ0xBUkFUSU9OLlxuICAgICAgLy8gKiBvdmVycmlkZVRlbXBsYXRlVXNpbmdUZXN0aW5nTW9kdWxlIHdhcyBjYWxsZWQgZm9yIHRoZSBjb21wb25lbnQgaW4gd2hpY2ggY2FzZSB0aGUgbW9kdWxlXG4gICAgICAvLyAgIHNjb3BlIHdpbGwgYmUgVGVzdGluZ01vZHVsZU92ZXJyaWRlLk9WRVJSSURFX1RFTVBMQVRFLlxuICAgICAgLy9cbiAgICAgIC8vIElmIHRoZSBjb21wb25lbnQgd2FzIHByZXZpb3VzbHkgaW4gdGhlIHRlc3RpbmcgbW9kdWxlJ3MgJ2RlY2xhcmF0aW9ucycgKG1lYW5pbmcgdGhlXG4gICAgICAvLyBjdXJyZW50IHZhbHVlIGlzIFRlc3RpbmdNb2R1bGVPdmVycmlkZS5ERUNMQVJBVElPTiksIHRoZW4gYG1vZHVsZVR5cGVgIGlzIHRoZSBjb21wb25lbnQnc1xuICAgICAgLy8gcmVhbCBtb2R1bGUsIHdoaWNoIHdhcyBpbXBvcnRlZC4gVGhpcyBwYXR0ZXJuIGlzIHVuZGVyc3Rvb2QgdG8gbWVhbiB0aGF0IHRoZSBjb21wb25lbnRcbiAgICAgIC8vIHNob3VsZCB1c2UgaXRzIG9yaWdpbmFsIHNjb3BlLCBidXQgdGhhdCB0aGUgdGVzdGluZyBtb2R1bGUgc2hvdWxkIGFsc28gY29udGFpbiB0aGVcbiAgICAgIC8vIGNvbXBvbmVudCBpbiBpdHMgc2NvcGUuXG4gICAgICBpZiAoKCF0aGlzLmNvbXBvbmVudFRvTW9kdWxlU2NvcGUuaGFzKHR5cGUpIHx8XG4gICAgICAgICAgIHRoaXMuY29tcG9uZW50VG9Nb2R1bGVTY29wZS5nZXQodHlwZSkgPT09IFRlc3RpbmdNb2R1bGVPdmVycmlkZS5ERUNMQVJBVElPTikpIHtcbiAgICAgICAgdGhpcy5jb21wb25lbnRUb01vZHVsZVNjb3BlLnNldCh0eXBlLCBtb2R1bGVUeXBlKTtcbiAgICAgIH1cbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBkaXJlY3RpdmUgPSB0aGlzLnJlc29sdmVycy5kaXJlY3RpdmUucmVzb2x2ZSh0eXBlKTtcbiAgICBpZiAoZGlyZWN0aXZlKSB7XG4gICAgICBpZiAoIXR5cGUuaGFzT3duUHJvcGVydHkoTkdfRElSX0RFRikpIHtcbiAgICAgICAgdGhpcy5wZW5kaW5nRGlyZWN0aXZlcy5hZGQodHlwZSk7XG4gICAgICB9XG4gICAgICB0aGlzLnNlZW5EaXJlY3RpdmVzLmFkZCh0eXBlKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBwaXBlID0gdGhpcy5yZXNvbHZlcnMucGlwZS5yZXNvbHZlKHR5cGUpO1xuICAgIGlmIChwaXBlICYmICF0eXBlLmhhc093blByb3BlcnR5KE5HX1BJUEVfREVGKSkge1xuICAgICAgdGhpcy5wZW5kaW5nUGlwZXMuYWRkKHR5cGUpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgcXVldWVUeXBlc0Zyb21Nb2R1bGVzQXJyYXkoYXJyOiBhbnlbXSk6IHZvaWQge1xuICAgIC8vIEJlY2F1c2Ugd2UgbWF5IGVuY291bnRlciB0aGUgc2FtZSBOZ01vZHVsZSBvciBhIHN0YW5kYWxvbmUgQ29tcG9uZW50IHdoaWxlIHByb2Nlc3NpbmdcbiAgICAvLyB0aGUgZGVwZW5kZW5jaWVzIG9mIGFuIE5nTW9kdWxlIG9yIGEgc3RhbmRhbG9uZSBDb21wb25lbnQsIHdlIGNhY2hlIHRoZW0gaW4gdGhpcyBzZXQgc28gd2VcbiAgICAvLyBjYW4gc2tpcCBvbmVzIHRoYXQgaGF2ZSBhbHJlYWR5IGJlZW4gc2VlbiBlbmNvdW50ZXJlZC4gSW4gc29tZSB0ZXN0IHNldHVwcywgdGhpcyBjYWNoaW5nXG4gICAgLy8gcmVzdWx0ZWQgaW4gMTBYIHJ1bnRpbWUgaW1wcm92ZW1lbnQuXG4gICAgY29uc3QgcHJvY2Vzc2VkRGVmcyA9IG5ldyBTZXQoKTtcbiAgICBjb25zdCBxdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheVJlY3VyID0gKGFycjogYW55W10pOiB2b2lkID0+IHtcbiAgICAgIGZvciAoY29uc3QgdmFsdWUgb2YgYXJyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgIHF1ZXVlVHlwZXNGcm9tTW9kdWxlc0FycmF5UmVjdXIodmFsdWUpO1xuICAgICAgICB9IGVsc2UgaWYgKGhhc05nTW9kdWxlRGVmKHZhbHVlKSkge1xuICAgICAgICAgIGNvbnN0IGRlZiA9IHZhbHVlLsm1bW9kO1xuICAgICAgICAgIGlmIChwcm9jZXNzZWREZWZzLmhhcyhkZWYpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcHJvY2Vzc2VkRGVmcy5hZGQoZGVmKTtcbiAgICAgICAgICAvLyBMb29rIHRocm91Z2ggZGVjbGFyYXRpb25zLCBpbXBvcnRzLCBhbmQgZXhwb3J0cywgYW5kIHF1ZXVlXG4gICAgICAgICAgLy8gZXZlcnl0aGluZyBmb3VuZCB0aGVyZS5cbiAgICAgICAgICB0aGlzLnF1ZXVlVHlwZUFycmF5KG1heWJlVW53cmFwRm4oZGVmLmRlY2xhcmF0aW9ucyksIHZhbHVlKTtcbiAgICAgICAgICBxdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheVJlY3VyKG1heWJlVW53cmFwRm4oZGVmLmltcG9ydHMpKTtcbiAgICAgICAgICBxdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheVJlY3VyKG1heWJlVW53cmFwRm4oZGVmLmV4cG9ydHMpKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc01vZHVsZVdpdGhQcm92aWRlcnModmFsdWUpKSB7XG4gICAgICAgICAgcXVldWVUeXBlc0Zyb21Nb2R1bGVzQXJyYXlSZWN1cihbdmFsdWUubmdNb2R1bGVdKTtcbiAgICAgICAgfSBlbHNlIGlmIChpc1N0YW5kYWxvbmVDb21wb25lbnQodmFsdWUpKSB7XG4gICAgICAgICAgdGhpcy5xdWV1ZVR5cGUodmFsdWUsIG51bGwpO1xuICAgICAgICAgIGNvbnN0IGRlZiA9IGdldENvbXBvbmVudERlZih2YWx1ZSk7XG5cbiAgICAgICAgICBpZiAocHJvY2Vzc2VkRGVmcy5oYXMoZGVmKSkge1xuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHByb2Nlc3NlZERlZnMuYWRkKGRlZik7XG5cbiAgICAgICAgICBjb25zdCBkZXBlbmRlbmNpZXMgPSBtYXliZVVud3JhcEZuKGRlZi5kZXBlbmRlbmNpZXMgPz8gW10pO1xuICAgICAgICAgIGRlcGVuZGVuY2llcy5mb3JFYWNoKChkZXBlbmRlbmN5KSA9PiB7XG4gICAgICAgICAgICAvLyBOb3RlOiBpbiBBT1QsIHRoZSBgZGVwZW5kZW5jaWVzYCBtaWdodCBhbHNvIGNvbnRhaW4gcmVndWxhclxuICAgICAgICAgICAgLy8gKE5nTW9kdWxlLWJhc2VkKSBDb21wb25lbnQsIERpcmVjdGl2ZSBhbmQgUGlwZXMsIHNvIHdlIGhhbmRsZVxuICAgICAgICAgICAgLy8gdGhlbSBzZXBhcmF0ZWx5IGFuZCBwcm9jZWVkIHdpdGggcmVjdXJzaXZlIHByb2Nlc3MgZm9yIHN0YW5kYWxvbmVcbiAgICAgICAgICAgIC8vIENvbXBvbmVudHMgYW5kIE5nTW9kdWxlcyBvbmx5LlxuICAgICAgICAgICAgaWYgKGlzU3RhbmRhbG9uZUNvbXBvbmVudChkZXBlbmRlbmN5KSB8fCBoYXNOZ01vZHVsZURlZihkZXBlbmRlbmN5KSkge1xuICAgICAgICAgICAgICBxdWV1ZVR5cGVzRnJvbU1vZHVsZXNBcnJheVJlY3VyKFtkZXBlbmRlbmN5XSk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLnF1ZXVlVHlwZShkZXBlbmRlbmN5LCBudWxsKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9KTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgcXVldWVUeXBlc0Zyb21Nb2R1bGVzQXJyYXlSZWN1cihhcnIpO1xuICB9XG5cbiAgLy8gV2hlbiBtb2R1bGUgb3ZlcnJpZGVzICh2aWEgYFRlc3RCZWQub3ZlcnJpZGVNb2R1bGVgKSBhcmUgcHJlc2VudCwgaXQgbWlnaHQgYWZmZWN0IGFsbCBtb2R1bGVzXG4gIC8vIHRoYXQgaW1wb3J0IChldmVuIHRyYW5zaXRpdmVseSkgYW4gb3ZlcnJpZGRlbiBvbmUuIEZvciBhbGwgYWZmZWN0ZWQgbW9kdWxlcyB3ZSBuZWVkIHRvXG4gIC8vIHJlY2FsY3VsYXRlIHRoZWlyIHNjb3BlcyBmb3IgYSBnaXZlbiB0ZXN0IHJ1biBhbmQgcmVzdG9yZSBvcmlnaW5hbCBzY29wZXMgYXQgdGhlIGVuZC4gVGhlIGdvYWxcbiAgLy8gb2YgdGhpcyBmdW5jdGlvbiBpcyB0byBjb2xsZWN0IGFsbCBhZmZlY3RlZCBtb2R1bGVzIGluIGEgc2V0IGZvciBmdXJ0aGVyIHByb2Nlc3NpbmcuIEV4YW1wbGU6XG4gIC8vIGlmIHdlIGhhdmUgdGhlIGZvbGxvd2luZyBtb2R1bGUgaGllcmFyY2h5OiBBIC0+IEIgLT4gQyAod2hlcmUgYC0+YCBtZWFucyBgaW1wb3J0c2ApIGFuZCBtb2R1bGVcbiAgLy8gYENgIGlzIG92ZXJyaWRkZW4sIHdlIGNvbnNpZGVyIGBBYCBhbmQgYEJgIGFzIGFmZmVjdGVkLCBzaW5jZSB0aGVpciBzY29wZXMgbWlnaHQgYmVjb21lXG4gIC8vIGludmFsaWRhdGVkIHdpdGggdGhlIG92ZXJyaWRlLlxuICBwcml2YXRlIGNvbGxlY3RNb2R1bGVzQWZmZWN0ZWRCeU92ZXJyaWRlcyhhcnI6IGFueVtdKTogU2V0PE5nTW9kdWxlVHlwZTxhbnk+PiB7XG4gICAgY29uc3Qgc2Vlbk1vZHVsZXMgPSBuZXcgU2V0PE5nTW9kdWxlVHlwZTxhbnk+PigpO1xuICAgIGNvbnN0IGFmZmVjdGVkTW9kdWxlcyA9IG5ldyBTZXQ8TmdNb2R1bGVUeXBlPGFueT4+KCk7XG4gICAgY29uc3QgY2FsY0FmZmVjdGVkTW9kdWxlc1JlY3VyID0gKGFycjogYW55W10sIHBhdGg6IE5nTW9kdWxlVHlwZTxhbnk+W10pOiB2b2lkID0+IHtcbiAgICAgIGZvciAoY29uc3QgdmFsdWUgb2YgYXJyKSB7XG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuICAgICAgICAgIC8vIElmIHRoZSB2YWx1ZSBpcyBhbiBhcnJheSwganVzdCBmbGF0dGVuIGl0IChieSBpbnZva2luZyB0aGlzIGZ1bmN0aW9uIHJlY3Vyc2l2ZWx5KSxcbiAgICAgICAgICAvLyBrZWVwaW5nIFwicGF0aFwiIHRoZSBzYW1lLlxuICAgICAgICAgIGNhbGNBZmZlY3RlZE1vZHVsZXNSZWN1cih2YWx1ZSwgcGF0aCk7XG4gICAgICAgIH0gZWxzZSBpZiAoaGFzTmdNb2R1bGVEZWYodmFsdWUpKSB7XG4gICAgICAgICAgaWYgKHNlZW5Nb2R1bGVzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICAgIC8vIElmIHdlJ3ZlIHNlZW4gdGhpcyBtb2R1bGUgYmVmb3JlIGFuZCBpdCdzIGluY2x1ZGVkIGludG8gXCJhZmZlY3RlZCBtb2R1bGVzXCIgbGlzdCwgbWFya1xuICAgICAgICAgICAgLy8gdGhlIHdob2xlIHBhdGggdGhhdCBsZWFkcyB0byB0aGF0IG1vZHVsZSBhcyBhZmZlY3RlZCwgYnV0IGRvIG5vdCBkZXNjZW5kIGludG8gaXRzXG4gICAgICAgICAgICAvLyBpbXBvcnRzLCBzaW5jZSB3ZSBhbHJlYWR5IGV4YW1pbmVkIHRoZW0gYmVmb3JlLlxuICAgICAgICAgICAgaWYgKGFmZmVjdGVkTW9kdWxlcy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgICAgIHBhdGguZm9yRWFjaChpdGVtID0+IGFmZmVjdGVkTW9kdWxlcy5hZGQoaXRlbSkpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgfVxuICAgICAgICAgIHNlZW5Nb2R1bGVzLmFkZCh2YWx1ZSk7XG4gICAgICAgICAgaWYgKHRoaXMub3ZlcnJpZGRlbk1vZHVsZXMuaGFzKHZhbHVlKSkge1xuICAgICAgICAgICAgcGF0aC5mb3JFYWNoKGl0ZW0gPT4gYWZmZWN0ZWRNb2R1bGVzLmFkZChpdGVtKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIEV4YW1pbmUgbW9kdWxlIGltcG9ydHMgcmVjdXJzaXZlbHkgdG8gbG9vayBmb3Igb3ZlcnJpZGRlbiBtb2R1bGVzLlxuICAgICAgICAgIGNvbnN0IG1vZHVsZURlZiA9ICh2YWx1ZSBhcyBhbnkpW05HX01PRF9ERUZdO1xuICAgICAgICAgIGNhbGNBZmZlY3RlZE1vZHVsZXNSZWN1cihtYXliZVVud3JhcEZuKG1vZHVsZURlZi5pbXBvcnRzKSwgcGF0aC5jb25jYXQodmFsdWUpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH07XG4gICAgY2FsY0FmZmVjdGVkTW9kdWxlc1JlY3VyKGFyciwgW10pO1xuICAgIHJldHVybiBhZmZlY3RlZE1vZHVsZXM7XG4gIH1cblxuICAvKipcbiAgICogUHJlc2VydmUgYW4gb3JpZ2luYWwgZGVmIChzdWNoIGFzIMm1bW9kLCDJtWluaiwgZXRjKSBiZWZvcmUgYXBwbHlpbmcgYW4gb3ZlcnJpZGUuXG4gICAqIE5vdGU6IG9uZSBjbGFzcyBtYXkgaGF2ZSBtdWx0aXBsZSBkZWZzIChmb3IgZXhhbXBsZTogybVtb2QgYW5kIMm1aW5qIGluIGNhc2Ugb2ZcbiAgICogYW4gTmdNb2R1bGUpLiBJZiB0aGVyZSBpcyBhIGRlZiBpbiBhIHNldCBhbHJlYWR5LCBkb24ndCBvdmVycmlkZSBpdCwgc2luY2VcbiAgICogYW4gb3JpZ2luYWwgb25lIHNob3VsZCBiZSByZXN0b3JlZCBhdCB0aGUgZW5kIG9mIGEgdGVzdC5cbiAgICovXG4gIHByaXZhdGUgbWF5YmVTdG9yZU5nRGVmKHByb3A6IHN0cmluZywgdHlwZTogVHlwZTxhbnk+KSB7XG4gICAgaWYgKCF0aGlzLmluaXRpYWxOZ0RlZnMuaGFzKHR5cGUpKSB7XG4gICAgICB0aGlzLmluaXRpYWxOZ0RlZnMuc2V0KHR5cGUsIG5ldyBNYXAoKSk7XG4gICAgfVxuICAgIGNvbnN0IGN1cnJlbnREZWZzID0gdGhpcy5pbml0aWFsTmdEZWZzLmdldCh0eXBlKSE7XG4gICAgaWYgKCFjdXJyZW50RGVmcy5oYXMocHJvcCkpIHtcbiAgICAgIGNvbnN0IGN1cnJlbnREZWYgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHR5cGUsIHByb3ApO1xuICAgICAgY3VycmVudERlZnMuc2V0KHByb3AsIGN1cnJlbnREZWYpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgc3RvcmVGaWVsZE9mRGVmT25UeXBlKHR5cGU6IFR5cGU8YW55PiwgZGVmRmllbGQ6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBkZWY6IGFueSA9ICh0eXBlIGFzIGFueSlbZGVmRmllbGRdO1xuICAgIGNvbnN0IG9yaWdpbmFsVmFsdWU6IGFueSA9IGRlZltmaWVsZE5hbWVdO1xuICAgIHRoaXMuZGVmQ2xlYW51cE9wcy5wdXNoKHtvYmplY3Q6IGRlZiwgZmllbGROYW1lLCBvcmlnaW5hbFZhbHVlfSk7XG4gIH1cblxuICAvKipcbiAgICogQ2xlYXJzIGN1cnJlbnQgY29tcG9uZW50cyByZXNvbHV0aW9uIHF1ZXVlLCBidXQgc3RvcmVzIHRoZSBzdGF0ZSBvZiB0aGUgcXVldWUsIHNvIHdlIGNhblxuICAgKiByZXN0b3JlIGl0IGxhdGVyLiBDbGVhcmluZyB0aGUgcXVldWUgaXMgcmVxdWlyZWQgYmVmb3JlIHdlIHRyeSB0byBjb21waWxlIGNvbXBvbmVudHMgKHZpYVxuICAgKiBgVGVzdEJlZC5jb21waWxlQ29tcG9uZW50c2ApLCBzbyB0aGF0IGNvbXBvbmVudCBkZWZzIGFyZSBpbiBzeW5jIHdpdGggdGhlIHJlc29sdXRpb24gcXVldWUuXG4gICAqL1xuICBwcml2YXRlIGNsZWFyQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlKCkge1xuICAgIGlmICh0aGlzLm9yaWdpbmFsQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlID09PSBudWxsKSB7XG4gICAgICB0aGlzLm9yaWdpbmFsQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlID0gbmV3IE1hcCgpO1xuICAgIH1cbiAgICDJtWNsZWFyUmVzb2x1dGlvbk9mQ29tcG9uZW50UmVzb3VyY2VzUXVldWUoKS5mb3JFYWNoKFxuICAgICAgICAodmFsdWUsIGtleSkgPT4gdGhpcy5vcmlnaW5hbENvbXBvbmVudFJlc29sdXRpb25RdWV1ZSEuc2V0KGtleSwgdmFsdWUpKTtcbiAgfVxuXG4gIC8qXG4gICAqIFJlc3RvcmVzIGNvbXBvbmVudCByZXNvbHV0aW9uIHF1ZXVlIHRvIHRoZSBwcmV2aW91c2x5IHNhdmVkIHN0YXRlLiBUaGlzIG9wZXJhdGlvbiBpcyBwZXJmb3JtZWRcbiAgICogYXMgYSBwYXJ0IG9mIHJlc3RvcmluZyB0aGUgc3RhdGUgYWZ0ZXIgY29tcGxldGlvbiBvZiB0aGUgY3VycmVudCBzZXQgb2YgdGVzdHMgKHRoYXQgbWlnaHRcbiAgICogcG90ZW50aWFsbHkgbXV0YXRlIHRoZSBzdGF0ZSkuXG4gICAqL1xuICBwcml2YXRlIHJlc3RvcmVDb21wb25lbnRSZXNvbHV0aW9uUXVldWUoKSB7XG4gICAgaWYgKHRoaXMub3JpZ2luYWxDb21wb25lbnRSZXNvbHV0aW9uUXVldWUgIT09IG51bGwpIHtcbiAgICAgIMm1cmVzdG9yZUNvbXBvbmVudFJlc29sdXRpb25RdWV1ZSh0aGlzLm9yaWdpbmFsQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlKTtcbiAgICAgIHRoaXMub3JpZ2luYWxDb21wb25lbnRSZXNvbHV0aW9uUXVldWUgPSBudWxsO1xuICAgIH1cbiAgfVxuXG4gIHJlc3RvcmVPcmlnaW5hbFN0YXRlKCk6IHZvaWQge1xuICAgIC8vIFByb2Nlc3MgY2xlYW51cCBvcHMgaW4gcmV2ZXJzZSBvcmRlciBzbyB0aGUgZmllbGQncyBvcmlnaW5hbCB2YWx1ZSBpcyByZXN0b3JlZCBjb3JyZWN0bHkgKGluXG4gICAgLy8gY2FzZSB0aGVyZSB3ZXJlIG11bHRpcGxlIG92ZXJyaWRlcyBmb3IgdGhlIHNhbWUgZmllbGQpLlxuICAgIGZvckVhY2hSaWdodCh0aGlzLmRlZkNsZWFudXBPcHMsIChvcDogQ2xlYW51cE9wZXJhdGlvbikgPT4ge1xuICAgICAgb3Aub2JqZWN0W29wLmZpZWxkTmFtZV0gPSBvcC5vcmlnaW5hbFZhbHVlO1xuICAgIH0pO1xuICAgIC8vIFJlc3RvcmUgaW5pdGlhbCBjb21wb25lbnQvZGlyZWN0aXZlL3BpcGUgZGVmc1xuICAgIHRoaXMuaW5pdGlhbE5nRGVmcy5mb3JFYWNoKFxuICAgICAgICAoZGVmczogTWFwPHN0cmluZywgUHJvcGVydHlEZXNjcmlwdG9yfHVuZGVmaW5lZD4sIHR5cGU6IFR5cGU8YW55PikgPT4ge1xuICAgICAgICAgIGlmIChVU0VfUlVOVElNRV9ERVBTX1RSQUNLRVJfRk9SX0pJVCkge1xuICAgICAgICAgICAgZGVwc1RyYWNrZXIuY2xlYXJTY29wZUNhY2hlRm9yKHR5cGUpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBkZWZzLmZvckVhY2goKGRlc2NyaXB0b3IsIHByb3ApID0+IHtcbiAgICAgICAgICAgIGlmICghZGVzY3JpcHRvcikge1xuICAgICAgICAgICAgICAvLyBEZWxldGUgb3BlcmF0aW9ucyBhcmUgZ2VuZXJhbGx5IHVuZGVzaXJhYmxlIHNpbmNlIHRoZXkgaGF2ZSBwZXJmb3JtYW5jZVxuICAgICAgICAgICAgICAvLyBpbXBsaWNhdGlvbnMgb24gb2JqZWN0cyB0aGV5IHdlcmUgYXBwbGllZCB0by4gSW4gdGhpcyBwYXJ0aWN1bGFyIGNhc2UsIHNpdHVhdGlvbnNcbiAgICAgICAgICAgICAgLy8gd2hlcmUgdGhpcyBjb2RlIGlzIGludm9rZWQgc2hvdWxkIGJlIHF1aXRlIHJhcmUgdG8gY2F1c2UgYW55IG5vdGljZWFibGUgaW1wYWN0LFxuICAgICAgICAgICAgICAvLyBzaW5jZSBpdCdzIGFwcGxpZWQgb25seSB0byBzb21lIHRlc3QgY2FzZXMgKGZvciBleGFtcGxlIHdoZW4gY2xhc3Mgd2l0aCBub1xuICAgICAgICAgICAgICAvLyBhbm5vdGF0aW9ucyBleHRlbmRzIHNvbWUgQENvbXBvbmVudCkgd2hlbiB3ZSBuZWVkIHRvIGNsZWFyICfJtWNtcCcgZmllbGQgb24gYSBnaXZlblxuICAgICAgICAgICAgICAvLyBjbGFzcyB0byByZXN0b3JlIGl0cyBvcmlnaW5hbCBzdGF0ZSAoYmVmb3JlIGFwcGx5aW5nIG92ZXJyaWRlcyBhbmQgcnVubmluZyB0ZXN0cykuXG4gICAgICAgICAgICAgIGRlbGV0ZSAodHlwZSBhcyBhbnkpW3Byb3BdO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHR5cGUsIHByb3AsIGRlc2NyaXB0b3IpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH0pO1xuICAgICAgICB9KTtcbiAgICB0aGlzLmluaXRpYWxOZ0RlZnMuY2xlYXIoKTtcbiAgICB0aGlzLnNjb3Blc1dpdGhPdmVycmlkZGVuUHJvdmlkZXJzLmNsZWFyKCk7XG4gICAgdGhpcy5yZXN0b3JlQ29tcG9uZW50UmVzb2x1dGlvblF1ZXVlKCk7XG4gICAgLy8gUmVzdG9yZSB0aGUgbG9jYWxlIElEIHRvIHRoZSBkZWZhdWx0IHZhbHVlLCB0aGlzIHNob3VsZG4ndCBiZSBuZWNlc3NhcnkgYnV0IHdlIG5ldmVyIGtub3dcbiAgICBzZXRMb2NhbGVJZChERUZBVUxUX0xPQ0FMRV9JRCk7XG4gIH1cblxuICBwcml2YXRlIGNvbXBpbGVUZXN0TW9kdWxlKCk6IHZvaWQge1xuICAgIGNsYXNzIFJvb3RTY29wZU1vZHVsZSB7fVxuICAgIGNvbXBpbGVOZ01vZHVsZURlZnMoUm9vdFNjb3BlTW9kdWxlIGFzIE5nTW9kdWxlVHlwZTxhbnk+LCB7XG4gICAgICBwcm92aWRlcnM6IFsuLi50aGlzLnJvb3RQcm92aWRlck92ZXJyaWRlc10sXG4gICAgfSk7XG5cbiAgICBjb25zdCBwcm92aWRlcnMgPSBbXG4gICAgICBwcm92aWRlWm9uZUNoYW5nZURldGVjdGlvbigpLFxuICAgICAge3Byb3ZpZGU6IENvbXBpbGVyLCB1c2VGYWN0b3J5OiAoKSA9PiBuZXcgUjNUZXN0Q29tcGlsZXIodGhpcyl9LFxuICAgICAge3Byb3ZpZGU6IERFRkVSX0JMT0NLX0NPTkZJRywgdXNlVmFsdWU6IHtiZWhhdmlvcjogdGhpcy5kZWZlckJsb2NrQmVoYXZpb3J9fSxcbiAgICAgIC4uLnRoaXMucHJvdmlkZXJzLFxuICAgICAgLi4udGhpcy5wcm92aWRlck92ZXJyaWRlcyxcbiAgICBdO1xuICAgIGNvbnN0IGltcG9ydHMgPSBbUm9vdFNjb3BlTW9kdWxlLCB0aGlzLmFkZGl0aW9uYWxNb2R1bGVUeXBlcywgdGhpcy5pbXBvcnRzIHx8IFtdXTtcblxuICAgIC8vIGNsYW5nLWZvcm1hdCBvZmZcbiAgICBjb21waWxlTmdNb2R1bGVEZWZzKHRoaXMudGVzdE1vZHVsZVR5cGUsIHtcbiAgICAgIGRlY2xhcmF0aW9uczogdGhpcy5kZWNsYXJhdGlvbnMsXG4gICAgICBpbXBvcnRzLFxuICAgICAgc2NoZW1hczogdGhpcy5zY2hlbWFzLFxuICAgICAgcHJvdmlkZXJzLFxuICAgIH0sIC8qIGFsbG93RHVwbGljYXRlRGVjbGFyYXRpb25zSW5Sb290ICovIHRydWUpO1xuICAgIC8vIGNsYW5nLWZvcm1hdCBvblxuXG4gICAgdGhpcy5hcHBseVByb3ZpZGVyT3ZlcnJpZGVzSW5TY29wZSh0aGlzLnRlc3RNb2R1bGVUeXBlKTtcbiAgfVxuXG4gIGdldCBpbmplY3RvcigpOiBJbmplY3RvciB7XG4gICAgaWYgKHRoaXMuX2luamVjdG9yICE9PSBudWxsKSB7XG4gICAgICByZXR1cm4gdGhpcy5faW5qZWN0b3I7XG4gICAgfVxuXG4gICAgY29uc3QgcHJvdmlkZXJzOiBTdGF0aWNQcm92aWRlcltdID0gW107XG4gICAgY29uc3QgY29tcGlsZXJPcHRpb25zID0gdGhpcy5wbGF0Zm9ybS5pbmplY3Rvci5nZXQoQ09NUElMRVJfT1BUSU9OUyk7XG4gICAgY29tcGlsZXJPcHRpb25zLmZvckVhY2gob3B0cyA9PiB7XG4gICAgICBpZiAob3B0cy5wcm92aWRlcnMpIHtcbiAgICAgICAgcHJvdmlkZXJzLnB1c2gob3B0cy5wcm92aWRlcnMpO1xuICAgICAgfVxuICAgIH0pO1xuICAgIGlmICh0aGlzLmNvbXBpbGVyUHJvdmlkZXJzICE9PSBudWxsKSB7XG4gICAgICBwcm92aWRlcnMucHVzaCguLi50aGlzLmNvbXBpbGVyUHJvdmlkZXJzIGFzIFN0YXRpY1Byb3ZpZGVyW10pO1xuICAgIH1cblxuICAgIHRoaXMuX2luamVjdG9yID0gSW5qZWN0b3IuY3JlYXRlKHtwcm92aWRlcnMsIHBhcmVudDogdGhpcy5wbGF0Zm9ybS5pbmplY3Rvcn0pO1xuICAgIHJldHVybiB0aGlzLl9pbmplY3RvcjtcbiAgfVxuXG4gIC8vIGdldCBvdmVycmlkZXMgZm9yIGEgc3BlY2lmaWMgcHJvdmlkZXIgKGlmIGFueSlcbiAgcHJpdmF0ZSBnZXRTaW5nbGVQcm92aWRlck92ZXJyaWRlcyhwcm92aWRlcjogUHJvdmlkZXIpOiBQcm92aWRlcnxudWxsIHtcbiAgICBjb25zdCB0b2tlbiA9IGdldFByb3ZpZGVyVG9rZW4ocHJvdmlkZXIpO1xuICAgIHJldHVybiB0aGlzLnByb3ZpZGVyT3ZlcnJpZGVzQnlUb2tlbi5nZXQodG9rZW4pIHx8IG51bGw7XG4gIH1cblxuICBwcml2YXRlIGdldFByb3ZpZGVyT3ZlcnJpZGVzKHByb3ZpZGVycz86IEFycmF5PFByb3ZpZGVyfEludGVybmFsRW52aXJvbm1lbnRQcm92aWRlcnM+KTpcbiAgICAgIFByb3ZpZGVyW10ge1xuICAgIGlmICghcHJvdmlkZXJzIHx8ICFwcm92aWRlcnMubGVuZ3RoIHx8IHRoaXMucHJvdmlkZXJPdmVycmlkZXNCeVRva2VuLnNpemUgPT09IDApIHJldHVybiBbXTtcbiAgICAvLyBUaGVyZSBhcmUgdHdvIGZsYXR0ZW5pbmcgb3BlcmF0aW9ucyBoZXJlLiBUaGUgaW5uZXIgZmxhdHRlblByb3ZpZGVycygpIG9wZXJhdGVzIG9uIHRoZVxuICAgIC8vIG1ldGFkYXRhJ3MgcHJvdmlkZXJzIGFuZCBhcHBsaWVzIGEgbWFwcGluZyBmdW5jdGlvbiB3aGljaCByZXRyaWV2ZXMgb3ZlcnJpZGVzIGZvciBlYWNoXG4gICAgLy8gaW5jb21pbmcgcHJvdmlkZXIuIFRoZSBvdXRlciBmbGF0dGVuKCkgdGhlbiBmbGF0dGVucyB0aGUgcHJvZHVjZWQgb3ZlcnJpZGVzIGFycmF5LiBJZiB0aGlzIGlzXG4gICAgLy8gbm90IGRvbmUsIHRoZSBhcnJheSBjYW4gY29udGFpbiBvdGhlciBlbXB0eSBhcnJheXMgKGUuZy4gYFtbXSwgW11dYCkgd2hpY2ggbGVhayBpbnRvIHRoZVxuICAgIC8vIHByb3ZpZGVycyBhcnJheSBhbmQgY29udGFtaW5hdGUgYW55IGVycm9yIG1lc3NhZ2VzIHRoYXQgbWlnaHQgYmUgZ2VuZXJhdGVkLlxuICAgIHJldHVybiBmbGF0dGVuKGZsYXR0ZW5Qcm92aWRlcnMoXG4gICAgICAgIHByb3ZpZGVycywgKHByb3ZpZGVyOiBQcm92aWRlcikgPT4gdGhpcy5nZXRTaW5nbGVQcm92aWRlck92ZXJyaWRlcyhwcm92aWRlcikgfHwgW10pKTtcbiAgfVxuXG4gIHByaXZhdGUgZ2V0T3ZlcnJpZGRlblByb3ZpZGVycyhwcm92aWRlcnM/OiBBcnJheTxQcm92aWRlcnxJbnRlcm5hbEVudmlyb25tZW50UHJvdmlkZXJzPik6XG4gICAgICBQcm92aWRlcltdIHtcbiAgICBpZiAoIXByb3ZpZGVycyB8fCAhcHJvdmlkZXJzLmxlbmd0aCB8fCB0aGlzLnByb3ZpZGVyT3ZlcnJpZGVzQnlUb2tlbi5zaXplID09PSAwKSByZXR1cm4gW107XG5cbiAgICBjb25zdCBmbGF0dGVuZWRQcm92aWRlcnMgPSBmbGF0dGVuUHJvdmlkZXJzKHByb3ZpZGVycyk7XG4gICAgY29uc3Qgb3ZlcnJpZGVzID0gdGhpcy5nZXRQcm92aWRlck92ZXJyaWRlcyhmbGF0dGVuZWRQcm92aWRlcnMpO1xuICAgIGNvbnN0IG92ZXJyaWRkZW5Qcm92aWRlcnMgPSBbLi4uZmxhdHRlbmVkUHJvdmlkZXJzLCAuLi5vdmVycmlkZXNdO1xuICAgIGNvbnN0IGZpbmFsOiBQcm92aWRlcltdID0gW107XG4gICAgY29uc3Qgc2Vlbk92ZXJyaWRkZW5Qcm92aWRlcnMgPSBuZXcgU2V0PFByb3ZpZGVyPigpO1xuXG4gICAgLy8gV2UgaXRlcmF0ZSB0aHJvdWdoIHRoZSBsaXN0IG9mIHByb3ZpZGVycyBpbiByZXZlcnNlIG9yZGVyIHRvIG1ha2Ugc3VyZSBwcm92aWRlciBvdmVycmlkZXNcbiAgICAvLyB0YWtlIHByZWNlZGVuY2Ugb3ZlciB0aGUgdmFsdWVzIGRlZmluZWQgaW4gcHJvdmlkZXIgbGlzdC4gV2UgYWxzbyBmaWx0ZXIgb3V0IGFsbCBwcm92aWRlcnNcbiAgICAvLyB0aGF0IGhhdmUgb3ZlcnJpZGVzLCBrZWVwaW5nIG92ZXJyaWRkZW4gdmFsdWVzIG9ubHkuIFRoaXMgaXMgbmVlZGVkLCBzaW5jZSBwcmVzZW5jZSBvZiBhXG4gICAgLy8gcHJvdmlkZXIgd2l0aCBgbmdPbkRlc3Ryb3lgIGhvb2sgd2lsbCBjYXVzZSB0aGlzIGhvb2sgdG8gYmUgcmVnaXN0ZXJlZCBhbmQgaW52b2tlZCBsYXRlci5cbiAgICBmb3JFYWNoUmlnaHQob3ZlcnJpZGRlblByb3ZpZGVycywgKHByb3ZpZGVyOiBhbnkpID0+IHtcbiAgICAgIGNvbnN0IHRva2VuOiBhbnkgPSBnZXRQcm92aWRlclRva2VuKHByb3ZpZGVyKTtcbiAgICAgIGlmICh0aGlzLnByb3ZpZGVyT3ZlcnJpZGVzQnlUb2tlbi5oYXModG9rZW4pKSB7XG4gICAgICAgIGlmICghc2Vlbk92ZXJyaWRkZW5Qcm92aWRlcnMuaGFzKHRva2VuKSkge1xuICAgICAgICAgIHNlZW5PdmVycmlkZGVuUHJvdmlkZXJzLmFkZCh0b2tlbik7XG4gICAgICAgICAgLy8gVHJlYXQgYWxsIG92ZXJyaWRkZW4gcHJvdmlkZXJzIGFzIGB7bXVsdGk6IGZhbHNlfWAgKGV2ZW4gaWYgaXQncyBhIG11bHRpLXByb3ZpZGVyKSB0b1xuICAgICAgICAgIC8vIG1ha2Ugc3VyZSB0aGF0IHByb3ZpZGVkIG92ZXJyaWRlIHRha2VzIGhpZ2hlc3QgcHJlY2VkZW5jZSBhbmQgaXMgbm90IGNvbWJpbmVkIHdpdGhcbiAgICAgICAgICAvLyBvdGhlciBpbnN0YW5jZXMgb2YgdGhlIHNhbWUgbXVsdGkgcHJvdmlkZXIuXG4gICAgICAgICAgZmluYWwudW5zaGlmdCh7Li4ucHJvdmlkZXIsIG11bHRpOiBmYWxzZX0pO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBmaW5hbC51bnNoaWZ0KHByb3ZpZGVyKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gZmluYWw7XG4gIH1cblxuICBwcml2YXRlIGhhc1Byb3ZpZGVyT3ZlcnJpZGVzKHByb3ZpZGVycz86IEFycmF5PFByb3ZpZGVyfEludGVybmFsRW52aXJvbm1lbnRQcm92aWRlcnM+KTogYm9vbGVhbiB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0UHJvdmlkZXJPdmVycmlkZXMocHJvdmlkZXJzKS5sZW5ndGggPiAwO1xuICB9XG5cbiAgcHJpdmF0ZSBwYXRjaERlZldpdGhQcm92aWRlck92ZXJyaWRlcyhkZWNsYXJhdGlvbjogVHlwZTxhbnk+LCBmaWVsZDogc3RyaW5nKTogdm9pZCB7XG4gICAgY29uc3QgZGVmID0gKGRlY2xhcmF0aW9uIGFzIGFueSlbZmllbGRdO1xuICAgIGlmIChkZWYgJiYgZGVmLnByb3ZpZGVyc1Jlc29sdmVyKSB7XG4gICAgICB0aGlzLm1heWJlU3RvcmVOZ0RlZihmaWVsZCwgZGVjbGFyYXRpb24pO1xuXG4gICAgICBjb25zdCByZXNvbHZlciA9IGRlZi5wcm92aWRlcnNSZXNvbHZlcjtcbiAgICAgIGNvbnN0IHByb2Nlc3NQcm92aWRlcnNGbiA9IChwcm92aWRlcnM6IFByb3ZpZGVyW10pID0+IHRoaXMuZ2V0T3ZlcnJpZGRlblByb3ZpZGVycyhwcm92aWRlcnMpO1xuICAgICAgdGhpcy5zdG9yZUZpZWxkT2ZEZWZPblR5cGUoZGVjbGFyYXRpb24sIGZpZWxkLCAncHJvdmlkZXJzUmVzb2x2ZXInKTtcbiAgICAgIGRlZi5wcm92aWRlcnNSZXNvbHZlciA9IChuZ0RlZjogRGlyZWN0aXZlRGVmPGFueT4pID0+IHJlc29sdmVyKG5nRGVmLCBwcm9jZXNzUHJvdmlkZXJzRm4pO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBpbml0UmVzb2x2ZXJzKCk6IFJlc29sdmVycyB7XG4gIHJldHVybiB7XG4gICAgbW9kdWxlOiBuZXcgTmdNb2R1bGVSZXNvbHZlcigpLFxuICAgIGNvbXBvbmVudDogbmV3IENvbXBvbmVudFJlc29sdmVyKCksXG4gICAgZGlyZWN0aXZlOiBuZXcgRGlyZWN0aXZlUmVzb2x2ZXIoKSxcbiAgICBwaXBlOiBuZXcgUGlwZVJlc29sdmVyKClcbiAgfTtcbn1cblxuZnVuY3Rpb24gaXNTdGFuZGFsb25lQ29tcG9uZW50PFQ+KHZhbHVlOiBUeXBlPFQ+KTogdmFsdWUgaXMgQ29tcG9uZW50VHlwZTxUPiB7XG4gIGNvbnN0IGRlZiA9IGdldENvbXBvbmVudERlZih2YWx1ZSk7XG4gIHJldHVybiAhIWRlZj8uc3RhbmRhbG9uZTtcbn1cblxuZnVuY3Rpb24gZ2V0Q29tcG9uZW50RGVmKHZhbHVlOiBDb21wb25lbnRUeXBlPHVua25vd24+KTogQ29tcG9uZW50RGVmPHVua25vd24+O1xuZnVuY3Rpb24gZ2V0Q29tcG9uZW50RGVmKHZhbHVlOiBUeXBlPHVua25vd24+KTogQ29tcG9uZW50RGVmPHVua25vd24+fG51bGw7XG5mdW5jdGlvbiBnZXRDb21wb25lbnREZWYodmFsdWU6IFR5cGU8dW5rbm93bj4pOiBDb21wb25lbnREZWY8dW5rbm93bj58bnVsbCB7XG4gIHJldHVybiAodmFsdWUgYXMgYW55KS7JtWNtcCA/PyBudWxsO1xufVxuXG5mdW5jdGlvbiBoYXNOZ01vZHVsZURlZjxUPih2YWx1ZTogVHlwZTxUPik6IHZhbHVlIGlzIE5nTW9kdWxlVHlwZTxUPiB7XG4gIHJldHVybiB2YWx1ZS5oYXNPd25Qcm9wZXJ0eSgnybVtb2QnKTtcbn1cblxuZnVuY3Rpb24gaXNOZ01vZHVsZTxUPih2YWx1ZTogVHlwZTxUPik6IGJvb2xlYW4ge1xuICByZXR1cm4gaGFzTmdNb2R1bGVEZWYodmFsdWUpO1xufVxuXG5mdW5jdGlvbiBtYXliZVVud3JhcEZuPFQ+KG1heWJlRm46ICgoKSA9PiBUKXxUKTogVCB7XG4gIHJldHVybiBtYXliZUZuIGluc3RhbmNlb2YgRnVuY3Rpb24gPyBtYXliZUZuKCkgOiBtYXliZUZuO1xufVxuXG5mdW5jdGlvbiBmbGF0dGVuPFQ+KHZhbHVlczogYW55W10pOiBUW10ge1xuICBjb25zdCBvdXQ6IFRbXSA9IFtdO1xuICB2YWx1ZXMuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICBvdXQucHVzaCguLi5mbGF0dGVuPFQ+KHZhbHVlKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dC5wdXNoKHZhbHVlKTtcbiAgICB9XG4gIH0pO1xuICByZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiBpZGVudGl0eUZuPFQ+KHZhbHVlOiBUKTogVCB7XG4gIHJldHVybiB2YWx1ZTtcbn1cblxuZnVuY3Rpb24gZmxhdHRlblByb3ZpZGVyczxUPihcbiAgICBwcm92aWRlcnM6IEFycmF5PFByb3ZpZGVyfEludGVybmFsRW52aXJvbm1lbnRQcm92aWRlcnM+LCBtYXBGbjogKHByb3ZpZGVyOiBQcm92aWRlcikgPT4gVCk6IFRbXTtcbmZ1bmN0aW9uIGZsYXR0ZW5Qcm92aWRlcnMocHJvdmlkZXJzOiBBcnJheTxQcm92aWRlcnxJbnRlcm5hbEVudmlyb25tZW50UHJvdmlkZXJzPik6IFByb3ZpZGVyW107XG5mdW5jdGlvbiBmbGF0dGVuUHJvdmlkZXJzKFxuICAgIHByb3ZpZGVyczogQXJyYXk8UHJvdmlkZXJ8SW50ZXJuYWxFbnZpcm9ubWVudFByb3ZpZGVycz4sXG4gICAgbWFwRm46IChwcm92aWRlcjogUHJvdmlkZXIpID0+IGFueSA9IGlkZW50aXR5Rm4pOiBhbnlbXSB7XG4gIGNvbnN0IG91dDogYW55W10gPSBbXTtcbiAgZm9yIChsZXQgcHJvdmlkZXIgb2YgcHJvdmlkZXJzKSB7XG4gICAgaWYgKGlzRW52aXJvbm1lbnRQcm92aWRlcnMocHJvdmlkZXIpKSB7XG4gICAgICBwcm92aWRlciA9IHByb3ZpZGVyLsm1cHJvdmlkZXJzO1xuICAgIH1cbiAgICBpZiAoQXJyYXkuaXNBcnJheShwcm92aWRlcikpIHtcbiAgICAgIG91dC5wdXNoKC4uLmZsYXR0ZW5Qcm92aWRlcnMocHJvdmlkZXIsIG1hcEZuKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIG91dC5wdXNoKG1hcEZuKHByb3ZpZGVyKSk7XG4gICAgfVxuICB9XG4gIHJldHVybiBvdXQ7XG59XG5cbmZ1bmN0aW9uIGdldFByb3ZpZGVyRmllbGQocHJvdmlkZXI6IFByb3ZpZGVyLCBmaWVsZDogc3RyaW5nKSB7XG4gIHJldHVybiBwcm92aWRlciAmJiB0eXBlb2YgcHJvdmlkZXIgPT09ICdvYmplY3QnICYmIChwcm92aWRlciBhcyBhbnkpW2ZpZWxkXTtcbn1cblxuZnVuY3Rpb24gZ2V0UHJvdmlkZXJUb2tlbihwcm92aWRlcjogUHJvdmlkZXIpIHtcbiAgcmV0dXJuIGdldFByb3ZpZGVyRmllbGQocHJvdmlkZXIsICdwcm92aWRlJykgfHwgcHJvdmlkZXI7XG59XG5cbmZ1bmN0aW9uIGlzTW9kdWxlV2l0aFByb3ZpZGVycyh2YWx1ZTogYW55KTogdmFsdWUgaXMgTW9kdWxlV2l0aFByb3ZpZGVyczxhbnk+IHtcbiAgcmV0dXJuIHZhbHVlLmhhc093blByb3BlcnR5KCduZ01vZHVsZScpO1xufVxuXG5mdW5jdGlvbiBmb3JFYWNoUmlnaHQ8VD4odmFsdWVzOiBUW10sIGZuOiAodmFsdWU6IFQsIGlkeDogbnVtYmVyKSA9PiB2b2lkKTogdm9pZCB7XG4gIGZvciAobGV0IGlkeCA9IHZhbHVlcy5sZW5ndGggLSAxOyBpZHggPj0gMDsgaWR4LS0pIHtcbiAgICBmbih2YWx1ZXNbaWR4XSwgaWR4KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBpbnZhbGlkVHlwZUVycm9yKG5hbWU6IHN0cmluZywgZXhwZWN0ZWRUeXBlOiBzdHJpbmcpOiBFcnJvciB7XG4gIHJldHVybiBuZXcgRXJyb3IoYCR7bmFtZX0gY2xhc3MgZG9lc24ndCBoYXZlIEAke2V4cGVjdGVkVHlwZX0gZGVjb3JhdG9yIG9yIGlzIG1pc3NpbmcgbWV0YWRhdGEuYCk7XG59XG5cbmNsYXNzIFIzVGVzdENvbXBpbGVyIGltcGxlbWVudHMgQ29tcGlsZXIge1xuICBjb25zdHJ1Y3Rvcihwcml2YXRlIHRlc3RCZWQ6IFRlc3RCZWRDb21waWxlcikge31cblxuICBjb21waWxlTW9kdWxlU3luYzxUPihtb2R1bGVUeXBlOiBUeXBlPFQ+KTogTmdNb2R1bGVGYWN0b3J5PFQ+IHtcbiAgICB0aGlzLnRlc3RCZWQuX2NvbXBpbGVOZ01vZHVsZVN5bmMobW9kdWxlVHlwZSk7XG4gICAgcmV0dXJuIG5ldyBSM05nTW9kdWxlRmFjdG9yeShtb2R1bGVUeXBlKTtcbiAgfVxuXG4gIGFzeW5jIGNvbXBpbGVNb2R1bGVBc3luYzxUPihtb2R1bGVUeXBlOiBUeXBlPFQ+KTogUHJvbWlzZTxOZ01vZHVsZUZhY3Rvcnk8VD4+IHtcbiAgICBhd2FpdCB0aGlzLnRlc3RCZWQuX2NvbXBpbGVOZ01vZHVsZUFzeW5jKG1vZHVsZVR5cGUpO1xuICAgIHJldHVybiBuZXcgUjNOZ01vZHVsZUZhY3RvcnkobW9kdWxlVHlwZSk7XG4gIH1cblxuICBjb21waWxlTW9kdWxlQW5kQWxsQ29tcG9uZW50c1N5bmM8VD4obW9kdWxlVHlwZTogVHlwZTxUPik6IE1vZHVsZVdpdGhDb21wb25lbnRGYWN0b3JpZXM8VD4ge1xuICAgIGNvbnN0IG5nTW9kdWxlRmFjdG9yeSA9IHRoaXMuY29tcGlsZU1vZHVsZVN5bmMobW9kdWxlVHlwZSk7XG4gICAgY29uc3QgY29tcG9uZW50RmFjdG9yaWVzID0gdGhpcy50ZXN0QmVkLl9nZXRDb21wb25lbnRGYWN0b3JpZXMobW9kdWxlVHlwZSBhcyBOZ01vZHVsZVR5cGU8VD4pO1xuICAgIHJldHVybiBuZXcgTW9kdWxlV2l0aENvbXBvbmVudEZhY3RvcmllcyhuZ01vZHVsZUZhY3RvcnksIGNvbXBvbmVudEZhY3Rvcmllcyk7XG4gIH1cblxuICBhc3luYyBjb21waWxlTW9kdWxlQW5kQWxsQ29tcG9uZW50c0FzeW5jPFQ+KG1vZHVsZVR5cGU6IFR5cGU8VD4pOlxuICAgICAgUHJvbWlzZTxNb2R1bGVXaXRoQ29tcG9uZW50RmFjdG9yaWVzPFQ+PiB7XG4gICAgY29uc3QgbmdNb2R1bGVGYWN0b3J5ID0gYXdhaXQgdGhpcy5jb21waWxlTW9kdWxlQXN5bmMobW9kdWxlVHlwZSk7XG4gICAgY29uc3QgY29tcG9uZW50RmFjdG9yaWVzID0gdGhpcy50ZXN0QmVkLl9nZXRDb21wb25lbnRGYWN0b3JpZXMobW9kdWxlVHlwZSBhcyBOZ01vZHVsZVR5cGU8VD4pO1xuICAgIHJldHVybiBuZXcgTW9kdWxlV2l0aENvbXBvbmVudEZhY3RvcmllcyhuZ01vZHVsZUZhY3RvcnksIGNvbXBvbmVudEZhY3Rvcmllcyk7XG4gIH1cblxuICBjbGVhckNhY2hlKCk6IHZvaWQge31cblxuICBjbGVhckNhY2hlRm9yKHR5cGU6IFR5cGU8YW55Pik6IHZvaWQge31cblxuICBnZXRNb2R1bGVJZChtb2R1bGVUeXBlOiBUeXBlPGFueT4pOiBzdHJpbmd8dW5kZWZpbmVkIHtcbiAgICBjb25zdCBtZXRhID0gdGhpcy50ZXN0QmVkLl9nZXRNb2R1bGVSZXNvbHZlcigpLnJlc29sdmUobW9kdWxlVHlwZSk7XG4gICAgcmV0dXJuIG1ldGEgJiYgbWV0YS5pZCB8fCB1bmRlZmluZWQ7XG4gIH1cbn1cbiJdfQ==