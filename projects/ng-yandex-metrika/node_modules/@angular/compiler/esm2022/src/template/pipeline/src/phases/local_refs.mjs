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
 * Lifts local reference declarations on element-like structures within each view into an entry in
 * the `consts` array for the whole component.
 */
export function liftLocalRefs(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.ElementStart:
                case ir.OpKind.Template:
                    if (!Array.isArray(op.localRefs)) {
                        throw new Error(`AssertionError: expected localRefs to be an array still`);
                    }
                    op.numSlotsUsed += op.localRefs.length;
                    if (op.localRefs.length > 0) {
                        const localRefs = serializeLocalRefs(op.localRefs);
                        op.localRefs = job.addConst(localRefs);
                    }
                    else {
                        op.localRefs = null;
                    }
                    break;
            }
        }
    }
}
function serializeLocalRefs(refs) {
    const constRefs = [];
    for (const ref of refs) {
        constRefs.push(o.literal(ref.name), o.literal(ref.target));
    }
    return o.literalArr(constRefs);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibG9jYWxfcmVmcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL2xvY2FsX3JlZnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUkvQjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFDLEdBQTRCO0lBQ3hELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFO2dCQUNmLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUM7Z0JBQzVCLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRO29CQUNyQixJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUU7d0JBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQUMseURBQXlELENBQUMsQ0FBQztxQkFDNUU7b0JBQ0QsRUFBRSxDQUFDLFlBQVksSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztvQkFFdkMsSUFBSSxFQUFFLENBQUMsU0FBUyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7d0JBQzNCLE1BQU0sU0FBUyxHQUFHLGtCQUFrQixDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsQ0FBQzt3QkFDbkQsRUFBRSxDQUFDLFNBQVMsR0FBRyxHQUFHLENBQUMsUUFBUSxDQUFDLFNBQVMsQ0FBQyxDQUFDO3FCQUN4Qzt5QkFBTTt3QkFDTCxFQUFFLENBQUMsU0FBUyxHQUFHLElBQUksQ0FBQztxQkFDckI7b0JBQ0QsTUFBTTthQUNUO1NBQ0Y7S0FDRjtBQUNILENBQUM7QUFFRCxTQUFTLGtCQUFrQixDQUFDLElBQW1CO0lBQzdDLE1BQU0sU0FBUyxHQUFtQixFQUFFLENBQUM7SUFDckMsS0FBSyxNQUFNLEdBQUcsSUFBSSxJQUFJLEVBQUU7UUFDdEIsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0tBQzVEO0lBQ0QsT0FBTyxDQUFDLENBQUMsVUFBVSxDQUFDLFNBQVMsQ0FBQyxDQUFDO0FBQ2pDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgbyBmcm9tICcuLi8uLi8uLi8uLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5cbmltcG9ydCB0eXBlIHtDb21wb25lbnRDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIExpZnRzIGxvY2FsIHJlZmVyZW5jZSBkZWNsYXJhdGlvbnMgb24gZWxlbWVudC1saWtlIHN0cnVjdHVyZXMgd2l0aGluIGVhY2ggdmlldyBpbnRvIGFuIGVudHJ5IGluXG4gKiB0aGUgYGNvbnN0c2AgYXJyYXkgZm9yIHRoZSB3aG9sZSBjb21wb25lbnQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBsaWZ0TG9jYWxSZWZzKGpvYjogQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5jcmVhdGUpIHtcbiAgICAgIHN3aXRjaCAob3Aua2luZCkge1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5FbGVtZW50U3RhcnQ6XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLlRlbXBsYXRlOlxuICAgICAgICAgIGlmICghQXJyYXkuaXNBcnJheShvcC5sb2NhbFJlZnMpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFzc2VydGlvbkVycm9yOiBleHBlY3RlZCBsb2NhbFJlZnMgdG8gYmUgYW4gYXJyYXkgc3RpbGxgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgb3AubnVtU2xvdHNVc2VkICs9IG9wLmxvY2FsUmVmcy5sZW5ndGg7XG5cbiAgICAgICAgICBpZiAob3AubG9jYWxSZWZzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIGNvbnN0IGxvY2FsUmVmcyA9IHNlcmlhbGl6ZUxvY2FsUmVmcyhvcC5sb2NhbFJlZnMpO1xuICAgICAgICAgICAgb3AubG9jYWxSZWZzID0gam9iLmFkZENvbnN0KGxvY2FsUmVmcyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIG9wLmxvY2FsUmVmcyA9IG51bGw7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiBzZXJpYWxpemVMb2NhbFJlZnMocmVmczogaXIuTG9jYWxSZWZbXSk6IG8uRXhwcmVzc2lvbiB7XG4gIGNvbnN0IGNvbnN0UmVmczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgZm9yIChjb25zdCByZWYgb2YgcmVmcykge1xuICAgIGNvbnN0UmVmcy5wdXNoKG8ubGl0ZXJhbChyZWYubmFtZSksIG8ubGl0ZXJhbChyZWYudGFyZ2V0KSk7XG4gIH1cbiAgcmV0dXJuIG8ubGl0ZXJhbEFycihjb25zdFJlZnMpO1xufVxuIl19