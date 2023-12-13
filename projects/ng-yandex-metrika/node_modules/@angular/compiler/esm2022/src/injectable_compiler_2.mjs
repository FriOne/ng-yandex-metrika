/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as o from './output/output_ast';
import { compileFactoryFunction, FactoryTarget, R3FactoryDelegateType } from './render3/r3_factory';
import { Identifiers } from './render3/r3_identifiers';
import { convertFromMaybeForwardRefExpression, typeWithParameters } from './render3/util';
import { DefinitionMap } from './render3/view/util';
export function compileInjectable(meta, resolveForwardRefs) {
    let result = null;
    const factoryMeta = {
        name: meta.name,
        type: meta.type,
        typeArgumentCount: meta.typeArgumentCount,
        deps: [],
        target: FactoryTarget.Injectable,
    };
    if (meta.useClass !== undefined) {
        // meta.useClass has two modes of operation. Either deps are specified, in which case `new` is
        // used to instantiate the class with dependencies injected, or deps are not specified and
        // the factory of the class is used to instantiate it.
        //
        // A special case exists for useClass: Type where Type is the injectable type itself and no
        // deps are specified, in which case 'useClass' is effectively ignored.
        const useClassOnSelf = meta.useClass.expression.isEquivalent(meta.type.value);
        let deps = undefined;
        if (meta.deps !== undefined) {
            deps = meta.deps;
        }
        if (deps !== undefined) {
            // factory: () => new meta.useClass(...deps)
            result = compileFactoryFunction({
                ...factoryMeta,
                delegate: meta.useClass.expression,
                delegateDeps: deps,
                delegateType: R3FactoryDelegateType.Class,
            });
        }
        else if (useClassOnSelf) {
            result = compileFactoryFunction(factoryMeta);
        }
        else {
            result = {
                statements: [],
                expression: delegateToFactory(meta.type.value, meta.useClass.expression, resolveForwardRefs)
            };
        }
    }
    else if (meta.useFactory !== undefined) {
        if (meta.deps !== undefined) {
            result = compileFactoryFunction({
                ...factoryMeta,
                delegate: meta.useFactory,
                delegateDeps: meta.deps || [],
                delegateType: R3FactoryDelegateType.Function,
            });
        }
        else {
            result = { statements: [], expression: o.arrowFn([], meta.useFactory.callFn([])) };
        }
    }
    else if (meta.useValue !== undefined) {
        // Note: it's safe to use `meta.useValue` instead of the `USE_VALUE in meta` check used for
        // client code because meta.useValue is an Expression which will be defined even if the actual
        // value is undefined.
        result = compileFactoryFunction({
            ...factoryMeta,
            expression: meta.useValue.expression,
        });
    }
    else if (meta.useExisting !== undefined) {
        // useExisting is an `inject` call on the existing token.
        result = compileFactoryFunction({
            ...factoryMeta,
            expression: o.importExpr(Identifiers.inject).callFn([meta.useExisting.expression]),
        });
    }
    else {
        result = {
            statements: [],
            expression: delegateToFactory(meta.type.value, meta.type.value, resolveForwardRefs)
        };
    }
    const token = meta.type.value;
    const injectableProps = new DefinitionMap();
    injectableProps.set('token', token);
    injectableProps.set('factory', result.expression);
    // Only generate providedIn property if it has a non-null value
    if (meta.providedIn.expression.value !== null) {
        injectableProps.set('providedIn', convertFromMaybeForwardRefExpression(meta.providedIn));
    }
    const expression = o.importExpr(Identifiers.ɵɵdefineInjectable)
        .callFn([injectableProps.toLiteralMap()], undefined, true);
    return {
        expression,
        type: createInjectableType(meta),
        statements: result.statements,
    };
}
export function createInjectableType(meta) {
    return new o.ExpressionType(o.importExpr(Identifiers.InjectableDeclaration, [typeWithParameters(meta.type.type, meta.typeArgumentCount)]));
}
function delegateToFactory(type, useType, unwrapForwardRefs) {
    if (type.node === useType.node) {
        // The types are the same, so we can simply delegate directly to the type's factory.
        // ```
        // factory: type.ɵfac
        // ```
        return useType.prop('ɵfac');
    }
    if (!unwrapForwardRefs) {
        // The type is not wrapped in a `forwardRef()`, so we create a simple factory function that
        // accepts a sub-type as an argument.
        // ```
        // factory: function(t) { return useType.ɵfac(t); }
        // ```
        return createFactoryFunction(useType);
    }
    // The useType is actually wrapped in a `forwardRef()` so we need to resolve that before
    // calling its factory.
    // ```
    // factory: function(t) { return core.resolveForwardRef(type).ɵfac(t); }
    // ```
    const unwrappedType = o.importExpr(Identifiers.resolveForwardRef).callFn([useType]);
    return createFactoryFunction(unwrappedType);
}
function createFactoryFunction(type) {
    return o.arrowFn([new o.FnParam('t', o.DYNAMIC_TYPE)], type.prop('ɵfac').callFn([o.variable('t')]));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5qZWN0YWJsZV9jb21waWxlcl8yLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL2luamVjdGFibGVfY29tcGlsZXJfMi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssQ0FBQyxNQUFNLHFCQUFxQixDQUFDO0FBQ3pDLE9BQU8sRUFBQyxzQkFBc0IsRUFBRSxhQUFhLEVBQXdCLHFCQUFxQixFQUFvQixNQUFNLHNCQUFzQixDQUFDO0FBQzNJLE9BQU8sRUFBQyxXQUFXLEVBQUMsTUFBTSwwQkFBMEIsQ0FBQztBQUNyRCxPQUFPLEVBQUMsb0NBQW9DLEVBQXdHLGtCQUFrQixFQUFDLE1BQU0sZ0JBQWdCLENBQUM7QUFDOUwsT0FBTyxFQUFDLGFBQWEsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBY2xELE1BQU0sVUFBVSxpQkFBaUIsQ0FDN0IsSUFBMEIsRUFBRSxrQkFBMkI7SUFDekQsSUFBSSxNQUFNLEdBQStELElBQUksQ0FBQztJQUU5RSxNQUFNLFdBQVcsR0FBc0I7UUFDckMsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1FBQ2YsSUFBSSxFQUFFLElBQUksQ0FBQyxJQUFJO1FBQ2YsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtRQUN6QyxJQUFJLEVBQUUsRUFBRTtRQUNSLE1BQU0sRUFBRSxhQUFhLENBQUMsVUFBVTtLQUNqQyxDQUFDO0lBRUYsSUFBSSxJQUFJLENBQUMsUUFBUSxLQUFLLFNBQVMsRUFBRTtRQUMvQiw4RkFBOEY7UUFDOUYsMEZBQTBGO1FBQzFGLHNEQUFzRDtRQUN0RCxFQUFFO1FBQ0YsMkZBQTJGO1FBQzNGLHVFQUF1RTtRQUV2RSxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLFVBQVUsQ0FBQyxZQUFZLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQztR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SUFDeEYsdUJBQXVCO0lBQ3ZCLE1BQU07SUFDTix3RUFBd0U7SUFDeEUsTUFBTTtJQUNOLE1BQU0sYUFBYSxHQUFHLENBQUMsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLGlCQUFpQixDQUFDLENBQUMsTUFBTSxDQUFDLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztJQUNwRixPQUFPLHFCQUFxQixDQUFDLGFBQWEsQ0FBQyxDQUFDO0FBQzlDLENBQUM7QUFFRCxTQUFTLHFCQUFxQixDQUFDLElBQWtCO0lBQy9DLE9BQU8sQ0FBQyxDQUFDLE9BQU8sQ0FDWixDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLEVBQUUsQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgbyBmcm9tICcuL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCB7Y29tcGlsZUZhY3RvcnlGdW5jdGlvbiwgRmFjdG9yeVRhcmdldCwgUjNEZXBlbmRlbmN5TWV0YWRhdGEsIFIzRmFjdG9yeURlbGVnYXRlVHlwZSwgUjNGYWN0b3J5TWV0YWRhdGF9IGZyb20gJy4vcmVuZGVyMy9yM19mYWN0b3J5JztcbmltcG9ydCB7SWRlbnRpZmllcnN9IGZyb20gJy4vcmVuZGVyMy9yM19pZGVudGlmaWVycyc7XG5pbXBvcnQge2NvbnZlcnRGcm9tTWF5YmVGb3J3YXJkUmVmRXhwcmVzc2lvbiwgRm9yd2FyZFJlZkhhbmRsaW5nLCBnZW5lcmF0ZUZvcndhcmRSZWYsIE1heWJlRm9yd2FyZFJlZkV4cHJlc3Npb24sIFIzQ29tcGlsZWRFeHByZXNzaW9uLCBSM1JlZmVyZW5jZSwgdHlwZVdpdGhQYXJhbWV0ZXJzfSBmcm9tICcuL3JlbmRlcjMvdXRpbCc7XG5pbXBvcnQge0RlZmluaXRpb25NYXB9IGZyb20gJy4vcmVuZGVyMy92aWV3L3V0aWwnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFIzSW5qZWN0YWJsZU1ldGFkYXRhIHtcbiAgbmFtZTogc3RyaW5nO1xuICB0eXBlOiBSM1JlZmVyZW5jZTtcbiAgdHlwZUFyZ3VtZW50Q291bnQ6IG51bWJlcjtcbiAgcHJvdmlkZWRJbjogTWF5YmVGb3J3YXJkUmVmRXhwcmVzc2lvbjtcbiAgdXNlQ2xhc3M/OiBNYXliZUZvcndhcmRSZWZFeHByZXNzaW9uO1xuICB1c2VGYWN0b3J5Pzogby5FeHByZXNzaW9uO1xuICB1c2VFeGlzdGluZz86IE1heWJlRm9yd2FyZFJlZkV4cHJlc3Npb247XG4gIHVzZVZhbHVlPzogTWF5YmVGb3J3YXJkUmVmRXhwcmVzc2lvbjtcbiAgZGVwcz86IFIzRGVwZW5kZW5jeU1ldGFkYXRhW107XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb21waWxlSW5qZWN0YWJsZShcbiAgICBtZXRhOiBSM0luamVjdGFibGVNZXRhZGF0YSwgcmVzb2x2ZUZvcndhcmRSZWZzOiBib29sZWFuKTogUjNDb21waWxlZEV4cHJlc3Npb24ge1xuICBsZXQgcmVzdWx0OiB7ZXhwcmVzc2lvbjogby5FeHByZXNzaW9uLCBzdGF0ZW1lbnRzOiBvLlN0YXRlbWVudFtdfXxudWxsID0gbnVsbDtcblxuICBjb25zdCBmYWN0b3J5TWV0YTogUjNGYWN0b3J5TWV0YWRhdGEgPSB7XG4gICAgbmFtZTogbWV0YS5uYW1lLFxuICAgIHR5cGU6IG1ldGEudHlwZSxcbiAgICB0eXBlQXJndW1lbnRDb3VudDogbWV0YS50eXBlQXJndW1lbnRDb3VudCxcbiAgICBkZXBzOiBbXSxcbiAgICB0YXJnZXQ6IEZhY3RvcnlUYXJnZXQuSW5qZWN0YWJsZSxcbiAgfTtcblxuICBpZiAobWV0YS51c2VDbGFzcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gbWV0YS51c2VDbGFzcyBoYXMgdHdvIG1vZGVzIG9mIG9wZXJhdGlvbi4gRWl0aGVyIGRlcHMgYXJlIHNwZWNpZmllZCwgaW4gd2hpY2ggY2FzZSBgbmV3YCBpc1xuICAgIC8vIHVzZWQgdG8gaW5zdGFudGlhdGUgdGhlIGNsYXNzIHdpdGggZGVwZW5kZW5jaWVzIGluamVjdGVkLCBvciBkZXBzIGFyZSBub3Qgc3BlY2lmaWVkIGFuZFxuICAgIC8vIHRoZSBmYWN0b3J5IG9mIHRoZSBjbGFzcyBpcyB1c2VkIHRvIGluc3RhbnRpYXRlIGl0LlxuICAgIC8vXG4gICAgLy8gQSBzcGVjaWFsIGNhc2UgZXhpc3RzIGZvciB1c2VDbGFzczogVHlwZSB3aGVyZSBUeXBlIGlzIHRoZSBpbmplY3RhYmxlIHR5cGUgaXRzZWxmIGFuZCBub1xuICAgIC8vIGRlcHMgYXJlIHNwZWNpZmllZCwgaW4gd2hpY2ggY2FzZSAndXNlQ2xhc3MnIGlzIGVmZmVjdGl2ZWx5IGlnbm9yZWQuXG5cbiAgICBjb25zdCB1c2VDbGFzc09uU2VsZiA9IG1ldGEudXNlQ2xhc3MuZXhwcmVzc2lvbi5pc0VxdWl2YWxlbnQobWV0YS50eXBlLnZhbHVlKTtcbiAgICBsZXQgZGVwczogUjNEZXBlbmRlbmN5TWV0YWRhdGFbXXx1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgaWYgKG1ldGEuZGVwcyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBkZXBzID0gbWV0YS5kZXBzO1xuICAgIH1cblxuICAgIGlmIChkZXBzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIC8vIGZhY3Rvcnk6ICgpID0+IG5ldyBtZXRhLnVzZUNsYXNzKC4uLmRlcHMpXG4gICAgICByZXN1bHQgPSBjb21waWxlRmFjdG9yeUZ1bmN0aW9uKHtcbiAgICAgICAgLi4uZmFjdG9yeU1ldGEsXG4gICAgICAgIGRlbGVnYXRlOiBtZXRhLnVzZUNsYXNzLmV4cHJlc3Npb24sXG4gICAgICAgIGRlbGVnYXRlRGVwczogZGVwcyxcbiAgICAgICAgZGVsZWdhdGVUeXBlOiBSM0ZhY3RvcnlEZWxlZ2F0ZVR5cGUuQ2xhc3MsXG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHVzZUNsYXNzT25TZWxmKSB7XG4gICAgICByZXN1bHQgPSBjb21waWxlRmFjdG9yeUZ1bmN0aW9uKGZhY3RvcnlNZXRhKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0ge1xuICAgICAgICBzdGF0ZW1lbnRzOiBbXSxcbiAgICAgICAgZXhwcmVzc2lvbjogZGVsZWdhdGVUb0ZhY3RvcnkoXG4gICAgICAgICAgICBtZXRhLnR5cGUudmFsdWUgYXMgby5XcmFwcGVkTm9kZUV4cHI8YW55PixcbiAgICAgICAgICAgIG1ldGEudXNlQ2xhc3MuZXhwcmVzc2lvbiBhcyBvLldyYXBwZWROb2RlRXhwcjxhbnk+LCByZXNvbHZlRm9yd2FyZFJlZnMpXG4gICAgICB9O1xuICAgIH1cbiAgfSBlbHNlIGlmIChtZXRhLnVzZUZhY3RvcnkgIT09IHVuZGVmaW5lZCkge1xuICAgIGlmIChtZXRhLmRlcHMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgcmVzdWx0ID0gY29tcGlsZUZhY3RvcnlGdW5jdGlvbih7XG4gICAgICAgIC4uLmZhY3RvcnlNZXRhLFxuICAgICAgICBkZWxlZ2F0ZTogbWV0YS51c2VGYWN0b3J5LFxuICAgICAgICBkZWxlZ2F0ZURlcHM6IG1ldGEuZGVwcyB8fCBbXSxcbiAgICAgICAgZGVsZWdhdGVUeXBlOiBSM0ZhY3RvcnlEZWxlZ2F0ZVR5cGUuRnVuY3Rpb24sXG4gICAgICB9KTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmVzdWx0ID0ge3N0YXRlbWVudHM6IFtdLCBleHByZXNzaW9uOiBvLmFycm93Rm4oW10sIG1ldGEudXNlRmFjdG9yeS5jYWxsRm4oW10pKX07XG4gICAgfVxuICB9IGVsc2UgaWYgKG1ldGEudXNlVmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgIC8vIE5vdGU6IGl0J3Mgc2FmZSB0byB1c2UgYG1ldGEudXNlVmFsdWVgIGluc3RlYWQgb2YgdGhlIGBVU0VfVkFMVUUgaW4gbWV0YWAgY2hlY2sgdXNlZCBmb3JcbiAgICAvLyBjbGllbnQgY29kZSBiZWNhdXNlIG1ldGEudXNlVmFsdWUgaXMgYW4gRXhwcmVzc2lvbiB3aGljaCB3aWxsIGJlIGRlZmluZWQgZXZlbiBpZiB0aGUgYWN0dWFsXG4gICAgLy8gdmFsdWUgaXMgdW5kZWZpbmVkLlxuICAgIHJlc3VsdCA9IGNvbXBpbGVGYWN0b3J5RnVuY3Rpb24oe1xuICAgICAgLi4uZmFjdG9yeU1ldGEsXG4gICAgICBleHByZXNzaW9uOiBtZXRhLnVzZVZhbHVlLmV4cHJlc3Npb24sXG4gICAgfSk7XG4gIH0gZWxzZSBpZiAobWV0YS51c2VFeGlzdGluZyAhPT0gdW5kZWZpbmVkKSB7XG4gICAgLy8gdXNlRXhpc3RpbmcgaXMgYW4gYGluamVjdGAgY2FsbCBvbiB0aGUgZXhpc3RpbmcgdG9rZW4uXG4gICAgcmVzdWx0ID0gY29tcGlsZUZhY3RvcnlGdW5jdGlvbih7XG4gICAgICAuLi5mYWN0b3J5TWV0YSxcbiAgICAgIGV4cHJlc3Npb246IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5pbmplY3QpLmNhbGxGbihbbWV0YS51c2VFeGlzdGluZy5leHByZXNzaW9uXSksXG4gICAgfSk7XG4gIH0gZWxzZSB7XG4gICAgcmVzdWx0ID0ge1xuICAgICAgc3RhdGVtZW50czogW10sXG4gICAgICBleHByZXNzaW9uOiBkZWxlZ2F0ZVRvRmFjdG9yeShcbiAgICAgICAgICBtZXRhLnR5cGUudmFsdWUgYXMgby5XcmFwcGVkTm9kZUV4cHI8YW55PiwgbWV0YS50eXBlLnZhbHVlIGFzIG8uV3JhcHBlZE5vZGVFeHByPGFueT4sXG4gICAgICAgICAgcmVzb2x2ZUZvcndhcmRSZWZzKVxuICAgIH07XG4gIH1cblxuICBjb25zdCB0b2tlbiA9IG1ldGEudHlwZS52YWx1ZTtcblxuICBjb25zdCBpbmplY3RhYmxlUHJvcHMgPVxuICAgICAgbmV3IERlZmluaXRpb25NYXA8e3Rva2VuOiBvLkV4cHJlc3Npb24sIGZhY3Rvcnk6IG8uRXhwcmVzc2lvbiwgcHJvdmlkZWRJbjogby5FeHByZXNzaW9ufT4oKTtcbiAgaW5qZWN0YWJsZVByb3BzLnNldCgndG9rZW4nLCB0b2tlbik7XG4gIGluamVjdGFibGVQcm9wcy5zZXQoJ2ZhY3RvcnknLCByZXN1bHQuZXhwcmVzc2lvbik7XG5cbiAgLy8gT25seSBnZW5lcmF0ZSBwcm92aWRlZEluIHByb3BlcnR5IGlmIGl0IGhhcyBhIG5vbi1udWxsIHZhbHVlXG4gIGlmICgobWV0YS5wcm92aWRlZEluLmV4cHJlc3Npb24gYXMgby5MaXRlcmFsRXhwcikudmFsdWUgIT09IG51bGwpIHtcbiAgICBpbmplY3RhYmxlUHJvcHMuc2V0KCdwcm92aWRlZEluJywgY29udmVydEZyb21NYXliZUZvcndhcmRSZWZFeHByZXNzaW9uKG1ldGEucHJvdmlkZWRJbikpO1xuICB9XG5cbiAgY29uc3QgZXhwcmVzc2lvbiA9IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy7Jtcm1ZGVmaW5lSW5qZWN0YWJsZSlcbiAgICAgICAgICAgICAgICAgICAgICAgICAuY2FsbEZuKFtpbmplY3RhYmxlUHJvcHMudG9MaXRlcmFsTWFwKCldLCB1bmRlZmluZWQsIHRydWUpO1xuICByZXR1cm4ge1xuICAgIGV4cHJlc3Npb24sXG4gICAgdHlwZTogY3JlYXRlSW5qZWN0YWJsZVR5cGUobWV0YSksXG4gICAgc3RhdGVtZW50czogcmVzdWx0LnN0YXRlbWVudHMsXG4gIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbmplY3RhYmxlVHlwZShtZXRhOiBSM0luamVjdGFibGVNZXRhZGF0YSkge1xuICByZXR1cm4gbmV3IG8uRXhwcmVzc2lvblR5cGUoby5pbXBvcnRFeHByKFxuICAgICAgSWRlbnRpZmllcnMuSW5qZWN0YWJsZURlY2xhcmF0aW9uLFxuICAgICAgW3R5cGVXaXRoUGFyYW1ldGVycyhtZXRhLnR5cGUudHlwZSwgbWV0YS50eXBlQXJndW1lbnRDb3VudCldKSk7XG59XG5cbmZ1bmN0aW9uIGRlbGVnYXRlVG9GYWN0b3J5KFxuICAgIHR5cGU6IG8uV3JhcHBlZE5vZGVFeHByPGFueT4sIHVzZVR5cGU6IG8uV3JhcHBlZE5vZGVFeHByPGFueT4sXG4gICAgdW53cmFwRm9yd2FyZFJlZnM6IGJvb2xlYW4pOiBvLkV4cHJlc3Npb24ge1xuICBpZiAodHlwZS5ub2RlID09PSB1c2VUeXBlLm5vZGUpIHtcbiAgICAvLyBUaGUgdHlwZXMgYXJlIHRoZSBzYW1lLCBzbyB3ZSBjYW4gc2ltcGx5IGRlbGVnYXRlIGRpcmVjdGx5IHRvIHRoZSB0eXBlJ3MgZmFjdG9yeS5cbiAgICAvLyBgYGBcbiAgICAvLyBmYWN0b3J5OiB0eXBlLsm1ZmFjXG4gICAgLy8gYGBgXG4gICAgcmV0dXJuIHVzZVR5cGUucHJvcCgnybVmYWMnKTtcbiAgfVxuXG4gIGlmICghdW53cmFwRm9yd2FyZFJlZnMpIHtcbiAgICAvLyBUaGUgdHlwZSBpcyBub3Qgd3JhcHBlZCBpbiBhIGBmb3J3YXJkUmVmKClgLCBzbyB3ZSBjcmVhdGUgYSBzaW1wbGUgZmFjdG9yeSBmdW5jdGlvbiB0aGF0XG4gICAgLy8gYWNjZXB0cyBhIHN1Yi10eXBlIGFzIGFuIGFyZ3VtZW50LlxuICAgIC8vIGBgYFxuICAgIC8vIGZhY3Rvcnk6IGZ1bmN0aW9uKHQpIHsgcmV0dXJuIHVzZVR5cGUuybVmYWModCk7IH1cbiAgICAvLyBgYGBcbiAgICByZXR1cm4gY3JlYXRlRmFjdG9yeUZ1bmN0aW9uKHVzZVR5cGUpO1xuICB9XG5cbiAgLy8gVGhlIHVzZVR5cGUgaXMgYWN0dWFsbHkgd3JhcHBlZCBpbiBhIGBmb3J3YXJkUmVmKClgIHNvIHdlIG5lZWQgdG8gcmVzb2x2ZSB0aGF0IGJlZm9yZVxuICAvLyBjYWxsaW5nIGl0cyBmYWN0b3J5LlxuICAvLyBgYGBcbiAgLy8gZmFjdG9yeTogZnVuY3Rpb24odCkgeyByZXR1cm4gY29yZS5yZXNvbHZlRm9yd2FyZFJlZih0eXBlKS7JtWZhYyh0KTsgfVxuICAvLyBgYGBcbiAgY29uc3QgdW53cmFwcGVkVHlwZSA9IG8uaW1wb3J0RXhwcihJZGVudGlmaWVycy5yZXNvbHZlRm9yd2FyZFJlZikuY2FsbEZuKFt1c2VUeXBlXSk7XG4gIHJldHVybiBjcmVhdGVGYWN0b3J5RnVuY3Rpb24odW53cmFwcGVkVHlwZSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUZhY3RvcnlGdW5jdGlvbih0eXBlOiBvLkV4cHJlc3Npb24pOiBvLkFycm93RnVuY3Rpb25FeHByIHtcbiAgcmV0dXJuIG8uYXJyb3dGbihcbiAgICAgIFtuZXcgby5GblBhcmFtKCd0Jywgby5EWU5BTUlDX1RZUEUpXSwgdHlwZS5wcm9wKCfJtWZhYycpLmNhbGxGbihbby52YXJpYWJsZSgndCcpXSkpO1xufVxuIl19