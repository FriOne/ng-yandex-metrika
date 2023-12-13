/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Change namespaces between HTML, SVG and MathML, depending on the next element.
 */
export function emitNamespaceChanges(job) {
    for (const unit of job.units) {
        let activeNamespace = ir.Namespace.HTML;
        for (const op of unit.create) {
            if (op.kind !== ir.OpKind.ElementStart) {
                continue;
            }
            if (op.namespace !== activeNamespace) {
                ir.OpList.insertBefore(ir.createNamespaceOp(op.namespace), op);
                activeNamespace = op.namespace;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFtZXNwYWNlLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvbmFtZXNwYWNlLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLG9CQUFvQixDQUFDLEdBQW1CO0lBQ3RELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixJQUFJLGVBQWUsR0FBRyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQztRQUV4QyxLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFO2dCQUN0QyxTQUFTO2FBQ1Y7WUFDRCxJQUFJLEVBQUUsQ0FBQyxTQUFTLEtBQUssZUFBZSxFQUFFO2dCQUNwQyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBYyxFQUFFLENBQUMsaUJBQWlCLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUM1RSxlQUFlLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQzthQUNoQztTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIENoYW5nZSBuYW1lc3BhY2VzIGJldHdlZW4gSFRNTCwgU1ZHIGFuZCBNYXRoTUwsIGRlcGVuZGluZyBvbiB0aGUgbmV4dCBlbGVtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZW1pdE5hbWVzcGFjZUNoYW5nZXMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgbGV0IGFjdGl2ZU5hbWVzcGFjZSA9IGlyLk5hbWVzcGFjZS5IVE1MO1xuXG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgIT09IGlyLk9wS2luZC5FbGVtZW50U3RhcnQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAob3AubmFtZXNwYWNlICE9PSBhY3RpdmVOYW1lc3BhY2UpIHtcbiAgICAgICAgaXIuT3BMaXN0Lmluc2VydEJlZm9yZTxpci5DcmVhdGVPcD4oaXIuY3JlYXRlTmFtZXNwYWNlT3Aob3AubmFtZXNwYWNlKSwgb3ApO1xuICAgICAgICBhY3RpdmVOYW1lc3BhY2UgPSBvcC5uYW1lc3BhY2U7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=