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
 * Pipes that accept more than 4 arguments are variadic, and are handled with a different runtime
 * instruction.
 */
export function createVariadicPipes(job) {
    for (const unit of job.units) {
        for (const op of unit.update) {
            ir.transformExpressionsInOp(op, expr => {
                if (!(expr instanceof ir.PipeBindingExpr)) {
                    return expr;
                }
                // Pipes are variadic if they have more than 4 arguments.
                if (expr.args.length <= 4) {
                    return expr;
                }
                return new ir.PipeBindingVariadicExpr(expr.target, expr.targetSlot, expr.name, o.literalArr(expr.args), expr.args.length);
            }, ir.VisitorContextFlag.None);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZV92YXJpYWRpYy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL3BpcGVfdmFyaWFkaWMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUkvQjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsbUJBQW1CLENBQUMsR0FBbUI7SUFDckQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixFQUFFLENBQUMsd0JBQXdCLENBQUMsRUFBRSxFQUFFLElBQUksQ0FBQyxFQUFFO2dCQUNyQyxJQUFJLENBQUMsQ0FBQyxJQUFJLFlBQVksRUFBRSxDQUFDLGVBQWUsQ0FBQyxFQUFFO29CQUN6QyxPQUFPLElBQUksQ0FBQztpQkFDYjtnQkFFRCx5REFBeUQ7Z0JBQ3pELElBQUksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxFQUFFO29CQUN6QixPQUFPLElBQUksQ0FBQztpQkFDYjtnQkFFRCxPQUFPLElBQUksRUFBRSxDQUFDLHVCQUF1QixDQUNqQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDLENBQUMsVUFBVSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1lBQzFGLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDaEM7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgbyBmcm9tICcuLi8uLi8uLi8uLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5cbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYiwgQ29tcG9uZW50Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBQaXBlcyB0aGF0IGFjY2VwdCBtb3JlIHRoYW4gNCBhcmd1bWVudHMgYXJlIHZhcmlhZGljLCBhbmQgYXJlIGhhbmRsZWQgd2l0aCBhIGRpZmZlcmVudCBydW50aW1lXG4gKiBpbnN0cnVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVZhcmlhZGljUGlwZXMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LnVwZGF0ZSkge1xuICAgICAgaXIudHJhbnNmb3JtRXhwcmVzc2lvbnNJbk9wKG9wLCBleHByID0+IHtcbiAgICAgICAgaWYgKCEoZXhwciBpbnN0YW5jZW9mIGlyLlBpcGVCaW5kaW5nRXhwcikpIHtcbiAgICAgICAgICByZXR1cm4gZXhwcjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIFBpcGVzIGFyZSB2YXJpYWRpYyBpZiB0aGV5IGhhdmUgbW9yZSB0aGFuIDQgYXJndW1lbnRzLlxuICAgICAgICBpZiAoZXhwci5hcmdzLmxlbmd0aCA8PSA0KSB7XG4gICAgICAgICAgcmV0dXJuIGV4cHI7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gbmV3IGlyLlBpcGVCaW5kaW5nVmFyaWFkaWNFeHByKFxuICAgICAgICAgICAgZXhwci50YXJnZXQsIGV4cHIudGFyZ2V0U2xvdCwgZXhwci5uYW1lLCBvLmxpdGVyYWxBcnIoZXhwci5hcmdzKSwgZXhwci5hcmdzLmxlbmd0aCk7XG4gICAgICB9LCBpci5WaXNpdG9yQ29udGV4dEZsYWcuTm9uZSk7XG4gICAgfVxuICB9XG59XG4iXX0=