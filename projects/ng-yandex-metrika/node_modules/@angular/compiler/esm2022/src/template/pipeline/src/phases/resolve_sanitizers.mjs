/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { SecurityContext } from '../../../../core';
import { isIframeSecuritySensitiveAttr } from '../../../../schema/dom_security_schema';
import * as ir from '../../ir';
import { createOpXrefMap } from '../util/elements';
/**
 * Mapping of security contexts to sanitizer function for that context.
 */
const sanitizers = new Map([
    [SecurityContext.HTML, ir.SanitizerFn.Html], [SecurityContext.SCRIPT, ir.SanitizerFn.Script],
    [SecurityContext.STYLE, ir.SanitizerFn.Style], [SecurityContext.URL, ir.SanitizerFn.Url],
    [SecurityContext.RESOURCE_URL, ir.SanitizerFn.ResourceUrl]
]);
/**
 * Resolves sanitization functions for ops that need them.
 */
export function resolveSanitizers(job) {
    for (const unit of job.units) {
        const elements = createOpXrefMap(unit);
        let sanitizerFn;
        for (const op of unit.update) {
            switch (op.kind) {
                case ir.OpKind.Property:
                case ir.OpKind.Attribute:
                    sanitizerFn = sanitizers.get(op.securityContext) || null;
                    op.sanitizer = sanitizerFn ? new ir.SanitizerExpr(sanitizerFn) : null;
                    // If there was no sanitization function found based on the security context of an
                    // attribute/property, check whether this attribute/property is one of the
                    // security-sensitive <iframe> attributes (and that the current element is actually an
                    // <iframe>).
                    if (op.sanitizer === null) {
                        const ownerOp = elements.get(op.target);
                        if (ownerOp === undefined || !ir.isElementOrContainerOp(ownerOp)) {
                            throw Error('Property should have an element-like owner');
                        }
                        if (isIframeElement(ownerOp) && isIframeSecuritySensitiveAttr(op.name)) {
                            op.sanitizer = new ir.SanitizerExpr(ir.SanitizerFn.IframeAttribute);
                        }
                    }
                    break;
            }
        }
    }
}
/**
 * Checks whether the given op represents an iframe element.
 */
function isIframeElement(op) {
    return op.kind === ir.OpKind.ElementStart && op.tag?.toLowerCase() === 'iframe';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9zYW5pdGl6ZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvcmVzb2x2ZV9zYW5pdGl6ZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxlQUFlLEVBQUMsTUFBTSxrQkFBa0IsQ0FBQztBQUNqRCxPQUFPLEVBQUMsNkJBQTZCLEVBQUMsTUFBTSx3Q0FBd0MsQ0FBQztBQUNyRixPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUUvQixPQUFPLEVBQUMsZUFBZSxFQUFDLE1BQU0sa0JBQWtCLENBQUM7QUFFakQ7O0dBRUc7QUFDSCxNQUFNLFVBQVUsR0FBRyxJQUFJLEdBQUcsQ0FBdUM7SUFDL0QsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDO0lBQzVGLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsZUFBZSxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQztJQUN4RixDQUFDLGVBQWUsQ0FBQyxZQUFZLEVBQUUsRUFBRSxDQUFDLFdBQVcsQ0FBQyxXQUFXLENBQUM7Q0FDM0QsQ0FBQyxDQUFDO0FBRUg7O0dBRUc7QUFDSCxNQUFNLFVBQVUsaUJBQWlCLENBQUMsR0FBNEI7SUFDNUQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLE1BQU0sUUFBUSxHQUFHLGVBQWUsQ0FBQyxJQUFJLENBQUMsQ0FBQztRQUN2QyxJQUFJLFdBQWdDLENBQUM7UUFDckMsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDdEIsV0FBVyxHQUFHLFVBQVUsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxJQUFJLElBQUksQ0FBQztvQkFDekQsRUFBRSxDQUFDLFNBQVMsR0FBRyxXQUFXLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFDLGFBQWEsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDO29CQUN0RSxrRkFBa0Y7b0JBQ2xGLDBFQUEwRTtvQkFDMUUsc0ZBQXNGO29CQUN0RixhQUFhO29CQUNiLElBQUksRUFBRSxDQUFDLFNBQVMsS0FBSyxJQUFJLEVBQUU7d0JBQ3pCLE1BQU0sT0FBTyxHQUFHLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDO3dCQUN4QyxJQUFJLE9BQU8sS0FBSyxTQUFTLElBQUksQ0FBQyxFQUFFLENBQUMsc0JBQXNCLENBQUMsT0FBTyxDQUFDLEVBQUU7NEJBQ2hFLE1BQU0sS0FBSyxDQUFDLDRDQUE0QyxDQUFDLENBQUM7eUJBQzNEO3dCQUNELElBQUksZUFBZSxDQUFDLE9BQU8sQ0FBQyxJQUFJLDZCQUE2QixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTs0QkFDdEUsRUFBRSxDQUFDLFNBQVMsR0FBRyxJQUFJLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRSxDQUFDLFdBQVcsQ0FBQyxlQUFlLENBQUMsQ0FBQzt5QkFDckU7cUJBQ0Y7b0JBQ0QsTUFBTTthQUNUO1NBQ0Y7S0FDRjtBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsZUFBZSxDQUFDLEVBQTRCO0lBQ25ELE9BQU8sRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUMsR0FBRyxFQUFFLFdBQVcsRUFBRSxLQUFLLFFBQVEsQ0FBQztBQUNsRixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7U2VjdXJpdHlDb250ZXh0fSBmcm9tICcuLi8uLi8uLi8uLi9jb3JlJztcbmltcG9ydCB7aXNJZnJhbWVTZWN1cml0eVNlbnNpdGl2ZUF0dHJ9IGZyb20gJy4uLy4uLy4uLy4uL3NjaGVtYS9kb21fc2VjdXJpdHlfc2NoZW1hJztcbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcG9uZW50Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcbmltcG9ydCB7Y3JlYXRlT3BYcmVmTWFwfSBmcm9tICcuLi91dGlsL2VsZW1lbnRzJztcblxuLyoqXG4gKiBNYXBwaW5nIG9mIHNlY3VyaXR5IGNvbnRleHRzIHRvIHNhbml0aXplciBmdW5jdGlvbiBmb3IgdGhhdCBjb250ZXh0LlxuICovXG5jb25zdCBzYW5pdGl6ZXJzID0gbmV3IE1hcDxTZWN1cml0eUNvbnRleHQsIGlyLlNhbml0aXplckZufG51bGw+KFtcbiAgW1NlY3VyaXR5Q29udGV4dC5IVE1MLCBpci5TYW5pdGl6ZXJGbi5IdG1sXSwgW1NlY3VyaXR5Q29udGV4dC5TQ1JJUFQsIGlyLlNhbml0aXplckZuLlNjcmlwdF0sXG4gIFtTZWN1cml0eUNvbnRleHQuU1RZTEUsIGlyLlNhbml0aXplckZuLlN0eWxlXSwgW1NlY3VyaXR5Q29udGV4dC5VUkwsIGlyLlNhbml0aXplckZuLlVybF0sXG4gIFtTZWN1cml0eUNvbnRleHQuUkVTT1VSQ0VfVVJMLCBpci5TYW5pdGl6ZXJGbi5SZXNvdXJjZVVybF1cbl0pO1xuXG4vKipcbiAqIFJlc29sdmVzIHNhbml0aXphdGlvbiBmdW5jdGlvbnMgZm9yIG9wcyB0aGF0IG5lZWQgdGhlbS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVTYW5pdGl6ZXJzKGpvYjogQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGNvbnN0IGVsZW1lbnRzID0gY3JlYXRlT3BYcmVmTWFwKHVuaXQpO1xuICAgIGxldCBzYW5pdGl6ZXJGbjogaXIuU2FuaXRpemVyRm58bnVsbDtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQudXBkYXRlKSB7XG4gICAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuUHJvcGVydHk6XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkF0dHJpYnV0ZTpcbiAgICAgICAgICBzYW5pdGl6ZXJGbiA9IHNhbml0aXplcnMuZ2V0KG9wLnNlY3VyaXR5Q29udGV4dCkgfHwgbnVsbDtcbiAgICAgICAgICBvcC5zYW5pdGl6ZXIgPSBzYW5pdGl6ZXJGbiA/IG5ldyBpci5TYW5pdGl6ZXJFeHByKHNhbml0aXplckZuKSA6IG51bGw7XG4gICAgICAgICAgLy8gSWYgdGhlcmUgd2FzIG5vIHNhbml0aXphdGlvbiBmdW5jdGlvbiBmb3VuZCBiYXNlZCBvbiB0aGUgc2VjdXJpdHkgY29udGV4dCBvZiBhblxuICAgICAgICAgIC8vIGF0dHJpYnV0ZS9wcm9wZXJ0eSwgY2hlY2sgd2hldGhlciB0aGlzIGF0dHJpYnV0ZS9wcm9wZXJ0eSBpcyBvbmUgb2YgdGhlXG4gICAgICAgICAgLy8gc2VjdXJpdHktc2Vuc2l0aXZlIDxpZnJhbWU+IGF0dHJpYnV0ZXMgKGFuZCB0aGF0IHRoZSBjdXJyZW50IGVsZW1lbnQgaXMgYWN0dWFsbHkgYW5cbiAgICAgICAgICAvLyA8aWZyYW1lPikuXG4gICAgICAgICAgaWYgKG9wLnNhbml0aXplciA9PT0gbnVsbCkge1xuICAgICAgICAgICAgY29uc3Qgb3duZXJPcCA9IGVsZW1lbnRzLmdldChvcC50YXJnZXQpO1xuICAgICAgICAgICAgaWYgKG93bmVyT3AgPT09IHVuZGVmaW5lZCB8fCAhaXIuaXNFbGVtZW50T3JDb250YWluZXJPcChvd25lck9wKSkge1xuICAgICAgICAgICAgICB0aHJvdyBFcnJvcignUHJvcGVydHkgc2hvdWxkIGhhdmUgYW4gZWxlbWVudC1saWtlIG93bmVyJyk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICBpZiAoaXNJZnJhbWVFbGVtZW50KG93bmVyT3ApICYmIGlzSWZyYW1lU2VjdXJpdHlTZW5zaXRpdmVBdHRyKG9wLm5hbWUpKSB7XG4gICAgICAgICAgICAgIG9wLnNhbml0aXplciA9IG5ldyBpci5TYW5pdGl6ZXJFeHByKGlyLlNhbml0aXplckZuLklmcmFtZUF0dHJpYnV0ZSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBvcCByZXByZXNlbnRzIGFuIGlmcmFtZSBlbGVtZW50LlxuICovXG5mdW5jdGlvbiBpc0lmcmFtZUVsZW1lbnQob3A6IGlyLkVsZW1lbnRPckNvbnRhaW5lck9wcyk6IGJvb2xlYW4ge1xuICByZXR1cm4gb3Aua2luZCA9PT0gaXIuT3BLaW5kLkVsZW1lbnRTdGFydCAmJiBvcC50YWc/LnRvTG93ZXJDYXNlKCkgPT09ICdpZnJhbWUnO1xufVxuIl19