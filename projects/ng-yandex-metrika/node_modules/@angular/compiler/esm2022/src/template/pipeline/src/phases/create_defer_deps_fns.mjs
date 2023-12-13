/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
/**
 * Create extracted deps functions for defer ops.
 */
export function createDeferDepsFns(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.Defer) {
                if (op.metadata.deps.length === 0) {
                    continue;
                }
                const dependencies = [];
                for (const dep of op.metadata.deps) {
                    if (dep.isDeferrable) {
                        // Callback function, e.g. `m () => m.MyCmp;`.
                        const innerFn = o.arrowFn([new o.FnParam('m', o.DYNAMIC_TYPE)], o.variable('m').prop(dep.symbolName));
                        // Dynamic import, e.g. `import('./a').then(...)`.
                        const importExpr = (new o.DynamicImportExpr(dep.importPath)).prop('then').callFn([innerFn]);
                        dependencies.push(importExpr);
                    }
                    else {
                        // Non-deferrable symbol, just use a reference to the type.
                        dependencies.push(dep.type);
                    }
                }
                const depsFnExpr = o.arrowFn([], o.literalArr(dependencies));
                if (op.handle.slot === null) {
                    throw new Error('AssertionError: slot must be assigned bfore extracting defer deps functions');
                }
                op.resolverFn = job.pool.getSharedFunctionReference(depsFnExpr, `${job.componentName}_Defer_${op.handle.slot}_DepsFn`);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlX2RlZmVyX2RlcHNfZm5zLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvY3JlYXRlX2RlZmVyX2RlcHNfZm5zLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxDQUFDLE1BQU0sK0JBQStCLENBQUM7QUFDbkQsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHL0I7O0dBRUc7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsR0FBNEI7SUFDN0QsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxLQUFLLEVBQUU7Z0JBQy9CLElBQUksRUFBRSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsTUFBTSxLQUFLLENBQUMsRUFBRTtvQkFDakMsU0FBUztpQkFDVjtnQkFDRCxNQUFNLFlBQVksR0FBbUIsRUFBRSxDQUFDO2dCQUN4QyxLQUFLLE1BQU0sR0FBRyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO29CQUNsQyxJQUFJLEdBQUcsQ0FBQyxZQUFZLEVBQUU7d0JBQ3BCLDhDQUE4Qzt3QkFDOUMsTUFBTSxPQUFPLEdBQUcsQ0FBQyxDQUFDLE9BQU8sQ0FDckIsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3dCQUVoRixrREFBa0Q7d0JBQ2xELE1BQU0sVUFBVSxHQUNaLENBQUMsSUFBSSxDQUFDLENBQUMsaUJBQWlCLENBQUMsR0FBRyxDQUFDLFVBQVcsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDLE1BQU0sQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7d0JBQzlFLFlBQVksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLENBQUM7cUJBQy9CO3lCQUFNO3dCQUNMLDJEQUEyRDt3QkFDM0QsWUFBWSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUM7cUJBQzdCO2lCQUNGO2dCQUNELE1BQU0sVUFBVSxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQztnQkFDN0QsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUU7b0JBQzNCLE1BQU0sSUFBSSxLQUFLLENBQ1gsNkVBQTZFLENBQUMsQ0FBQztpQkFDcEY7Z0JBQ0QsRUFBRSxDQUFDLFVBQVUsR0FBRyxHQUFHLENBQUMsSUFBSSxDQUFDLDBCQUEwQixDQUMvQyxVQUFVLEVBQUUsR0FBRyxHQUFHLENBQUMsYUFBYSxVQUFVLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxTQUFTLENBQUMsQ0FBQzthQUN4RTtTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIG8gZnJvbSAnLi4vLi4vLi4vLi4vb3V0cHV0L291dHB1dF9hc3QnO1xuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21wb25lbnRDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIENyZWF0ZSBleHRyYWN0ZWQgZGVwcyBmdW5jdGlvbnMgZm9yIGRlZmVyIG9wcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURlZmVyRGVwc0Zucyhqb2I6IENvbXBvbmVudENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkRlZmVyKSB7XG4gICAgICAgIGlmIChvcC5tZXRhZGF0YS5kZXBzLmxlbmd0aCA9PT0gMCkge1xuICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGRlcGVuZGVuY2llczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgICAgICAgZm9yIChjb25zdCBkZXAgb2Ygb3AubWV0YWRhdGEuZGVwcykge1xuICAgICAgICAgIGlmIChkZXAuaXNEZWZlcnJhYmxlKSB7XG4gICAgICAgICAgICAvLyBDYWxsYmFjayBmdW5jdGlvbiwgZS5nLiBgbSAoKSA9PiBtLk15Q21wO2AuXG4gICAgICAgICAgICBjb25zdCBpbm5lckZuID0gby5hcnJvd0ZuKFxuICAgICAgICAgICAgICAgIFtuZXcgby5GblBhcmFtKCdtJywgby5EWU5BTUlDX1RZUEUpXSwgby52YXJpYWJsZSgnbScpLnByb3AoZGVwLnN5bWJvbE5hbWUpKTtcblxuICAgICAgICAgICAgLy8gRHluYW1pYyBpbXBvcnQsIGUuZy4gYGltcG9ydCgnLi9hJykudGhlbiguLi4pYC5cbiAgICAgICAgICAgIGNvbnN0IGltcG9ydEV4cHIgPVxuICAgICAgICAgICAgICAgIChuZXcgby5EeW5hbWljSW1wb3J0RXhwcihkZXAuaW1wb3J0UGF0aCEpKS5wcm9wKCd0aGVuJykuY2FsbEZuKFtpbm5lckZuXSk7XG4gICAgICAgICAgICBkZXBlbmRlbmNpZXMucHVzaChpbXBvcnRFeHByKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gTm9uLWRlZmVycmFibGUgc3ltYm9sLCBqdXN0IHVzZSBhIHJlZmVyZW5jZSB0byB0aGUgdHlwZS5cbiAgICAgICAgICAgIGRlcGVuZGVuY2llcy5wdXNoKGRlcC50eXBlKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZGVwc0ZuRXhwciA9IG8uYXJyb3dGbihbXSwgby5saXRlcmFsQXJyKGRlcGVuZGVuY2llcykpO1xuICAgICAgICBpZiAob3AuaGFuZGxlLnNsb3QgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdBc3NlcnRpb25FcnJvcjogc2xvdCBtdXN0IGJlIGFzc2lnbmVkIGJmb3JlIGV4dHJhY3RpbmcgZGVmZXIgZGVwcyBmdW5jdGlvbnMnKTtcbiAgICAgICAgfVxuICAgICAgICBvcC5yZXNvbHZlckZuID0gam9iLnBvb2wuZ2V0U2hhcmVkRnVuY3Rpb25SZWZlcmVuY2UoXG4gICAgICAgICAgICBkZXBzRm5FeHByLCBgJHtqb2IuY29tcG9uZW50TmFtZX1fRGVmZXJfJHtvcC5oYW5kbGUuc2xvdH1fRGVwc0ZuYCk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=