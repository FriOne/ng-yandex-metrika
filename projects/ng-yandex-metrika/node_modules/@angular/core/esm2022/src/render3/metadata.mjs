/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { noSideEffects } from '../util/closure';
/**
 * The name of a field that Angular monkey-patches onto a component
 * class to store a function that loads defer-loadable dependencies
 * and applies metadata to a class.
 */
const ASYNC_COMPONENT_METADATA_FN = '__ngAsyncComponentMetadataFn__';
/**
 * If a given component has unresolved async metadata - returns a reference
 * to a function that applies component metadata after resolving defer-loadable
 * dependencies. Otherwise - this function returns `null`.
 */
export function getAsyncClassMetadataFn(type) {
    const componentClass = type; // cast to `any`, so that we can read a monkey-patched field
    return componentClass[ASYNC_COMPONENT_METADATA_FN] ?? null;
}
/**
 * Handles the process of applying metadata info to a component class in case
 * component template has defer blocks (thus some dependencies became deferrable).
 *
 * @param type Component class where metadata should be added
 * @param dependencyLoaderFn Function that loads dependencies
 * @param metadataSetterFn Function that forms a scope in which the `setClassMetadata` is invoked
 */
export function setClassMetadataAsync(type, dependencyLoaderFn, metadataSetterFn) {
    const componentClass = type; // cast to `any`, so that we can monkey-patch it
    componentClass[ASYNC_COMPONENT_METADATA_FN] = () => Promise.all(dependencyLoaderFn()).then(dependencies => {
        metadataSetterFn(...dependencies);
        // Metadata is now set, reset field value to indicate that this component
        // can by used/compiled synchronously.
        componentClass[ASYNC_COMPONENT_METADATA_FN] = null;
        return dependencies;
    });
    return componentClass[ASYNC_COMPONENT_METADATA_FN];
}
/**
 * Adds decorator, constructor, and property metadata to a given type via static metadata fields
 * on the type.
 *
 * These metadata fields can later be read with Angular's `ReflectionCapabilities` API.
 *
 * Calls to `setClassMetadata` can be guarded by ngDevMode, resulting in the metadata assignments
 * being tree-shaken away during production builds.
 */
export function setClassMetadata(type, decorators, ctorParameters, propDecorators) {
    return noSideEffects(() => {
        const clazz = type;
        if (decorators !== null) {
            if (clazz.hasOwnProperty('decorators') && clazz.decorators !== undefined) {
                clazz.decorators.push(...decorators);
            }
            else {
                clazz.decorators = decorators;
            }
        }
        if (ctorParameters !== null) {
            // Rather than merging, clobber the existing parameters. If other projects exist which
            // use tsickle-style annotations and reflect over them in the same way, this could
            // cause issues, but that is vanishingly unlikely.
            clazz.ctorParameters = ctorParameters;
        }
        if (propDecorators !== null) {
            // The property decorator objects are merged as it is possible different fields have
            // different decorator types. Decorators on individual fields are not merged, as it's
            // also incredibly unlikely that a field will be decorated both with an Angular
            // decorator and a non-Angular decorator that's also been downleveled.
            if (clazz.hasOwnProperty('propDecorators') && clazz.propDecorators !== undefined) {
                clazz.propDecorators = { ...clazz.propDecorators, ...propDecorators };
            }
            else {
                clazz.propDecorators = propDecorators;
            }
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWV0YWRhdGEuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb3JlL3NyYy9yZW5kZXIzL21ldGFkYXRhLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUdILE9BQU8sRUFBQyxhQUFhLEVBQUMsTUFBTSxpQkFBaUIsQ0FBQztBQVE5Qzs7OztHQUlHO0FBQ0gsTUFBTSwyQkFBMkIsR0FBRyxnQ0FBZ0MsQ0FBQztBQUVyRTs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUFDLElBQW1CO0lBRXpELE1BQU0sY0FBYyxHQUFHLElBQVcsQ0FBQyxDQUFFLDREQUE0RDtJQUNqRyxPQUFPLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxJQUFJLElBQUksQ0FBQztBQUM3RCxDQUFDO0FBRUQ7Ozs7Ozs7R0FPRztBQUNILE1BQU0sVUFBVSxxQkFBcUIsQ0FDakMsSUFBZSxFQUFFLGtCQUF1RCxFQUN4RSxnQkFBcUQ7SUFDdkQsTUFBTSxjQUFjLEdBQUcsSUFBVyxDQUFDLENBQUUsZ0RBQWdEO0lBQ3JGLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLEdBQUcsRUFBRSxDQUMvQyxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLEVBQUU7UUFDcEQsZ0JBQWdCLENBQUMsR0FBRyxZQUFZLENBQUMsQ0FBQztRQUNsQyx5RUFBeUU7UUFDekUsc0NBQXNDO1FBQ3RDLGNBQWMsQ0FBQywyQkFBMkIsQ0FBQyxHQUFHLElBQUksQ0FBQztRQUVuRCxPQUFPLFlBQVksQ0FBQztJQUN0QixDQUFDLENBQUMsQ0FBQztJQUNQLE9BQU8sY0FBYyxDQUFDLDJCQUEyQixDQUFDLENBQUM7QUFDckQsQ0FBQztBQUVEOzs7Ozs7OztHQVFHO0FBQ0gsTUFBTSxVQUFVLGdCQUFnQixDQUM1QixJQUFlLEVBQUUsVUFBc0IsRUFBRSxjQUFrQyxFQUMzRSxjQUEyQztJQUM3QyxPQUFPLGFBQWEsQ0FBQyxHQUFHLEVBQUU7UUFDakIsTUFBTSxLQUFLLEdBQUcsSUFBd0IsQ0FBQztRQUV2QyxJQUFJLFVBQVUsS0FBSyxJQUFJLEVBQUU7WUFDdkIsSUFBSSxLQUFLLENBQUMsY0FBYyxDQUFDLFlBQVksQ0FBQyxJQUFJLEtBQUssQ0FBQyxVQUFVLEtBQUssU0FBUyxFQUFFO2dCQUN4RSxLQUFLLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxHQUFHLFVBQVUsQ0FBQyxDQUFDO2FBQ3RDO2lCQUFNO2dCQUNMLEtBQUssQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO2FBQy9CO1NBQ0Y7UUFDRCxJQUFJLGNBQWMsS0FBSyxJQUFJLEVBQUU7WUFDM0Isc0ZBQXNGO1lBQ3RGLGtGQUFrRjtZQUNsRixrREFBa0Q7WUFDbEQsS0FBSyxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7U0FDdkM7UUFDRCxJQUFJLGNBQWMsS0FBSyxJQUFJLEVBQUU7WUFDM0Isb0ZBQW9GO1lBQ3BGLHFGQUFxRjtZQUNyRiwrRUFBK0U7WUFDL0Usc0VBQXNFO1lBQ3RFLElBQUksS0FBSyxDQUFDLGNBQWMsQ0FBQyxnQkFBZ0IsQ0FBQyxJQUFJLEtBQUssQ0FBQyxjQUFjLEtBQUssU0FBUyxFQUFFO2dCQUNoRixLQUFLLENBQUMsY0FBYyxHQUFHLEVBQUMsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLEdBQUcsY0FBYyxFQUFDLENBQUM7YUFDckU7aUJBQU07Z0JBQ0wsS0FBSyxDQUFDLGNBQWMsR0FBRyxjQUFjLENBQUM7YUFDdkM7U0FDRjtJQUNILENBQUMsQ0FBVSxDQUFDO0FBQ3JCLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHtUeXBlfSBmcm9tICcuLi9pbnRlcmZhY2UvdHlwZSc7XG5pbXBvcnQge25vU2lkZUVmZmVjdHN9IGZyb20gJy4uL3V0aWwvY2xvc3VyZSc7XG5cbmludGVyZmFjZSBUeXBlV2l0aE1ldGFkYXRhIGV4dGVuZHMgVHlwZTxhbnk+IHtcbiAgZGVjb3JhdG9ycz86IGFueVtdO1xuICBjdG9yUGFyYW1ldGVycz86ICgpID0+IGFueVtdO1xuICBwcm9wRGVjb3JhdG9ycz86IHtbZmllbGQ6IHN0cmluZ106IGFueX07XG59XG5cbi8qKlxuICogVGhlIG5hbWUgb2YgYSBmaWVsZCB0aGF0IEFuZ3VsYXIgbW9ua2V5LXBhdGNoZXMgb250byBhIGNvbXBvbmVudFxuICogY2xhc3MgdG8gc3RvcmUgYSBmdW5jdGlvbiB0aGF0IGxvYWRzIGRlZmVyLWxvYWRhYmxlIGRlcGVuZGVuY2llc1xuICogYW5kIGFwcGxpZXMgbWV0YWRhdGEgdG8gYSBjbGFzcy5cbiAqL1xuY29uc3QgQVNZTkNfQ09NUE9ORU5UX01FVEFEQVRBX0ZOID0gJ19fbmdBc3luY0NvbXBvbmVudE1ldGFkYXRhRm5fXyc7XG5cbi8qKlxuICogSWYgYSBnaXZlbiBjb21wb25lbnQgaGFzIHVucmVzb2x2ZWQgYXN5bmMgbWV0YWRhdGEgLSByZXR1cm5zIGEgcmVmZXJlbmNlXG4gKiB0byBhIGZ1bmN0aW9uIHRoYXQgYXBwbGllcyBjb21wb25lbnQgbWV0YWRhdGEgYWZ0ZXIgcmVzb2x2aW5nIGRlZmVyLWxvYWRhYmxlXG4gKiBkZXBlbmRlbmNpZXMuIE90aGVyd2lzZSAtIHRoaXMgZnVuY3Rpb24gcmV0dXJucyBgbnVsbGAuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRBc3luY0NsYXNzTWV0YWRhdGFGbih0eXBlOiBUeXBlPHVua25vd24+KTogKCgpID0+IFByb21pc2U8QXJyYXk8VHlwZTx1bmtub3duPj4+KXxcbiAgICBudWxsIHtcbiAgY29uc3QgY29tcG9uZW50Q2xhc3MgPSB0eXBlIGFzIGFueTsgIC8vIGNhc3QgdG8gYGFueWAsIHNvIHRoYXQgd2UgY2FuIHJlYWQgYSBtb25rZXktcGF0Y2hlZCBmaWVsZFxuICByZXR1cm4gY29tcG9uZW50Q2xhc3NbQVNZTkNfQ09NUE9ORU5UX01FVEFEQVRBX0ZOXSA/PyBudWxsO1xufVxuXG4vKipcbiAqIEhhbmRsZXMgdGhlIHByb2Nlc3Mgb2YgYXBwbHlpbmcgbWV0YWRhdGEgaW5mbyB0byBhIGNvbXBvbmVudCBjbGFzcyBpbiBjYXNlXG4gKiBjb21wb25lbnQgdGVtcGxhdGUgaGFzIGRlZmVyIGJsb2NrcyAodGh1cyBzb21lIGRlcGVuZGVuY2llcyBiZWNhbWUgZGVmZXJyYWJsZSkuXG4gKlxuICogQHBhcmFtIHR5cGUgQ29tcG9uZW50IGNsYXNzIHdoZXJlIG1ldGFkYXRhIHNob3VsZCBiZSBhZGRlZFxuICogQHBhcmFtIGRlcGVuZGVuY3lMb2FkZXJGbiBGdW5jdGlvbiB0aGF0IGxvYWRzIGRlcGVuZGVuY2llc1xuICogQHBhcmFtIG1ldGFkYXRhU2V0dGVyRm4gRnVuY3Rpb24gdGhhdCBmb3JtcyBhIHNjb3BlIGluIHdoaWNoIHRoZSBgc2V0Q2xhc3NNZXRhZGF0YWAgaXMgaW52b2tlZFxuICovXG5leHBvcnQgZnVuY3Rpb24gc2V0Q2xhc3NNZXRhZGF0YUFzeW5jKFxuICAgIHR5cGU6IFR5cGU8YW55PiwgZGVwZW5kZW5jeUxvYWRlckZuOiAoKSA9PiBBcnJheTxQcm9taXNlPFR5cGU8dW5rbm93bj4+PixcbiAgICBtZXRhZGF0YVNldHRlckZuOiAoLi4udHlwZXM6IFR5cGU8dW5rbm93bj5bXSkgPT4gdm9pZCk6ICgpID0+IFByb21pc2U8QXJyYXk8VHlwZTx1bmtub3duPj4+IHtcbiAgY29uc3QgY29tcG9uZW50Q2xhc3MgPSB0eXBlIGFzIGFueTsgIC8vIGNhc3QgdG8gYGFueWAsIHNvIHRoYXQgd2UgY2FuIG1vbmtleS1wYXRjaCBpdFxuICBjb21wb25lbnRDbGFzc1tBU1lOQ19DT01QT05FTlRfTUVUQURBVEFfRk5dID0gKCkgPT5cbiAgICAgIFByb21pc2UuYWxsKGRlcGVuZGVuY3lMb2FkZXJGbigpKS50aGVuKGRlcGVuZGVuY2llcyA9PiB7XG4gICAgICAgIG1ldGFkYXRhU2V0dGVyRm4oLi4uZGVwZW5kZW5jaWVzKTtcbiAgICAgICAgLy8gTWV0YWRhdGEgaXMgbm93IHNldCwgcmVzZXQgZmllbGQgdmFsdWUgdG8gaW5kaWNhdGUgdGhhdCB0aGlzIGNvbXBvbmVudFxuICAgICAgICAvLyBjYW4gYnkgdXNlZC9jb21waWxlZCBzeW5jaHJvbm91c2x5LlxuICAgICAgICBjb21wb25lbnRDbGFzc1tBU1lOQ19DT01QT05FTlRfTUVUQURBVEFfRk5dID0gbnVsbDtcblxuICAgICAgICByZXR1cm4gZGVwZW5kZW5jaWVzO1xuICAgICAgfSk7XG4gIHJldHVybiBjb21wb25lbnRDbGFzc1tBU1lOQ19DT01QT05FTlRfTUVUQURBVEFfRk5dO1xufVxuXG4vKipcbiAqIEFkZHMgZGVjb3JhdG9yLCBjb25zdHJ1Y3RvciwgYW5kIHByb3BlcnR5IG1ldGFkYXRhIHRvIGEgZ2l2ZW4gdHlwZSB2aWEgc3RhdGljIG1ldGFkYXRhIGZpZWxkc1xuICogb24gdGhlIHR5cGUuXG4gKlxuICogVGhlc2UgbWV0YWRhdGEgZmllbGRzIGNhbiBsYXRlciBiZSByZWFkIHdpdGggQW5ndWxhcidzIGBSZWZsZWN0aW9uQ2FwYWJpbGl0aWVzYCBBUEkuXG4gKlxuICogQ2FsbHMgdG8gYHNldENsYXNzTWV0YWRhdGFgIGNhbiBiZSBndWFyZGVkIGJ5IG5nRGV2TW9kZSwgcmVzdWx0aW5nIGluIHRoZSBtZXRhZGF0YSBhc3NpZ25tZW50c1xuICogYmVpbmcgdHJlZS1zaGFrZW4gYXdheSBkdXJpbmcgcHJvZHVjdGlvbiBidWlsZHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzZXRDbGFzc01ldGFkYXRhKFxuICAgIHR5cGU6IFR5cGU8YW55PiwgZGVjb3JhdG9yczogYW55W118bnVsbCwgY3RvclBhcmFtZXRlcnM6ICgoKSA9PiBhbnlbXSl8bnVsbCxcbiAgICBwcm9wRGVjb3JhdG9yczoge1tmaWVsZDogc3RyaW5nXTogYW55fXxudWxsKTogdm9pZCB7XG4gIHJldHVybiBub1NpZGVFZmZlY3RzKCgpID0+IHtcbiAgICAgICAgICAgY29uc3QgY2xhenogPSB0eXBlIGFzIFR5cGVXaXRoTWV0YWRhdGE7XG5cbiAgICAgICAgICAgaWYgKGRlY29yYXRvcnMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICBpZiAoY2xhenouaGFzT3duUHJvcGVydHkoJ2RlY29yYXRvcnMnKSAmJiBjbGF6ei5kZWNvcmF0b3JzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgIGNsYXp6LmRlY29yYXRvcnMucHVzaCguLi5kZWNvcmF0b3JzKTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgY2xhenouZGVjb3JhdG9ycyA9IGRlY29yYXRvcnM7XG4gICAgICAgICAgICAgfVxuICAgICAgICAgICB9XG4gICAgICAgICAgIGlmIChjdG9yUGFyYW1ldGVycyAhPT0gbnVsbCkge1xuICAgICAgICAgICAgIC8vIFJhdGhlciB0aGFuIG1lcmdpbmcsIGNsb2JiZXIgdGhlIGV4aXN0aW5nIHBhcmFtZXRlcnMuIElmIG90aGVyIHByb2plY3RzIGV4aXN0IHdoaWNoXG4gICAgICAgICAgICAgLy8gdXNlIHRzaWNrbGUtc3R5bGUgYW5ub3RhdGlvbnMgYW5kIHJlZmxlY3Qgb3ZlciB0aGVtIGluIHRoZSBzYW1lIHdheSwgdGhpcyBjb3VsZFxuICAgICAgICAgICAgIC8vIGNhdXNlIGlzc3VlcywgYnV0IHRoYXQgaXMgdmFuaXNoaW5nbHkgdW5saWtlbHkuXG4gICAgICAgICAgICAgY2xhenouY3RvclBhcmFtZXRlcnMgPSBjdG9yUGFyYW1ldGVycztcbiAgICAgICAgICAgfVxuICAgICAgICAgICBpZiAocHJvcERlY29yYXRvcnMgIT09IG51bGwpIHtcbiAgICAgICAgICAgICAvLyBUaGUgcHJvcGVydHkgZGVjb3JhdG9yIG9iamVjdHMgYXJlIG1lcmdlZCBhcyBpdCBpcyBwb3NzaWJsZSBkaWZmZXJlbnQgZmllbGRzIGhhdmVcbiAgICAgICAgICAgICAvLyBkaWZmZXJlbnQgZGVjb3JhdG9yIHR5cGVzLiBEZWNvcmF0b3JzIG9uIGluZGl2aWR1YWwgZmllbGRzIGFyZSBub3QgbWVyZ2VkLCBhcyBpdCdzXG4gICAgICAgICAgICAgLy8gYWxzbyBpbmNyZWRpYmx5IHVubGlrZWx5IHRoYXQgYSBmaWVsZCB3aWxsIGJlIGRlY29yYXRlZCBib3RoIHdpdGggYW4gQW5ndWxhclxuICAgICAgICAgICAgIC8vIGRlY29yYXRvciBhbmQgYSBub24tQW5ndWxhciBkZWNvcmF0b3IgdGhhdCdzIGFsc28gYmVlbiBkb3dubGV2ZWxlZC5cbiAgICAgICAgICAgICBpZiAoY2xhenouaGFzT3duUHJvcGVydHkoJ3Byb3BEZWNvcmF0b3JzJykgJiYgY2xhenoucHJvcERlY29yYXRvcnMgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgICAgY2xhenoucHJvcERlY29yYXRvcnMgPSB7Li4uY2xhenoucHJvcERlY29yYXRvcnMsIC4uLnByb3BEZWNvcmF0b3JzfTtcbiAgICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICAgY2xhenoucHJvcERlY29yYXRvcnMgPSBwcm9wRGVjb3JhdG9ycztcbiAgICAgICAgICAgICB9XG4gICAgICAgICAgIH1cbiAgICAgICAgIH0pIGFzIG5ldmVyO1xufVxuIl19