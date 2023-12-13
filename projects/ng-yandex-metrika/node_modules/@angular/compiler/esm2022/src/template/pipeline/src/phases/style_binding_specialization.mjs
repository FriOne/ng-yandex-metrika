/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Transforms special-case bindings with 'style' or 'class' in their names. Must run before the
 * main binding specialization pass.
 */
export function specializeStyleBindings(job) {
    for (const unit of job.units) {
        for (const op of unit.update) {
            if (op.kind !== ir.OpKind.Binding) {
                continue;
            }
            switch (op.bindingKind) {
                case ir.BindingKind.ClassName:
                    if (op.expression instanceof ir.Interpolation) {
                        throw new Error(`Unexpected interpolation in ClassName binding`);
                    }
                    ir.OpList.replace(op, ir.createClassPropOp(op.target, op.name, op.expression, op.sourceSpan));
                    break;
                case ir.BindingKind.StyleProperty:
                    ir.OpList.replace(op, ir.createStylePropOp(op.target, op.name, op.expression, op.unit, op.sourceSpan));
                    break;
                case ir.BindingKind.Property:
                case ir.BindingKind.Template:
                    if (op.name === 'style') {
                        ir.OpList.replace(op, ir.createStyleMapOp(op.target, op.expression, op.sourceSpan));
                    }
                    else if (op.name === 'class') {
                        ir.OpList.replace(op, ir.createClassMapOp(op.target, op.expression, op.sourceSpan));
                    }
                    break;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3R5bGVfYmluZGluZ19zcGVjaWFsaXphdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL3N0eWxlX2JpbmRpbmdfc3BlY2lhbGl6YXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHL0I7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUFDLEdBQW1CO0lBQ3pELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFO2dCQUNqQyxTQUFTO2FBQ1Y7WUFFRCxRQUFRLEVBQUUsQ0FBQyxXQUFXLEVBQUU7Z0JBQ3RCLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxTQUFTO29CQUMzQixJQUFJLEVBQUUsQ0FBQyxVQUFVLFlBQVksRUFBRSxDQUFDLGFBQWEsRUFBRTt3QkFDN0MsTUFBTSxJQUFJLEtBQUssQ0FBQywrQ0FBK0MsQ0FBQyxDQUFDO3FCQUNsRTtvQkFDRCxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FDYixFQUFFLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO29CQUNoRixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLFdBQVcsQ0FBQyxhQUFhO29CQUMvQixFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FDYixFQUFFLEVBQUUsRUFBRSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7b0JBQ3pGLE1BQU07Z0JBQ1IsS0FBSyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQztnQkFDN0IsS0FBSyxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVE7b0JBQzFCLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxPQUFPLEVBQUU7d0JBQ3ZCLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUNiLEVBQUUsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3FCQUN2RTt5QkFBTSxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssT0FBTyxFQUFFO3dCQUM5QixFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FDYixFQUFFLEVBQUUsRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsRUFBRSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztxQkFDdkU7b0JBQ0QsTUFBTTthQUNUO1NBQ0Y7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHR5cGUge0NvbXBpbGF0aW9uSm9ifSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5cbi8qKlxuICogVHJhbnNmb3JtcyBzcGVjaWFsLWNhc2UgYmluZGluZ3Mgd2l0aCAnc3R5bGUnIG9yICdjbGFzcycgaW4gdGhlaXIgbmFtZXMuIE11c3QgcnVuIGJlZm9yZSB0aGVcbiAqIG1haW4gYmluZGluZyBzcGVjaWFsaXphdGlvbiBwYXNzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3BlY2lhbGl6ZVN0eWxlQmluZGluZ3Moam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LnVwZGF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgIT09IGlyLk9wS2luZC5CaW5kaW5nKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICBzd2l0Y2ggKG9wLmJpbmRpbmdLaW5kKSB7XG4gICAgICAgIGNhc2UgaXIuQmluZGluZ0tpbmQuQ2xhc3NOYW1lOlxuICAgICAgICAgIGlmIChvcC5leHByZXNzaW9uIGluc3RhbmNlb2YgaXIuSW50ZXJwb2xhdGlvbikge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIGludGVycG9sYXRpb24gaW4gQ2xhc3NOYW1lIGJpbmRpbmdgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaXIuT3BMaXN0LnJlcGxhY2U8aXIuVXBkYXRlT3A+KFxuICAgICAgICAgICAgICBvcCwgaXIuY3JlYXRlQ2xhc3NQcm9wT3Aob3AudGFyZ2V0LCBvcC5uYW1lLCBvcC5leHByZXNzaW9uLCBvcC5zb3VyY2VTcGFuKSk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuQmluZGluZ0tpbmQuU3R5bGVQcm9wZXJ0eTpcbiAgICAgICAgICBpci5PcExpc3QucmVwbGFjZTxpci5VcGRhdGVPcD4oXG4gICAgICAgICAgICAgIG9wLCBpci5jcmVhdGVTdHlsZVByb3BPcChvcC50YXJnZXQsIG9wLm5hbWUsIG9wLmV4cHJlc3Npb24sIG9wLnVuaXQsIG9wLnNvdXJjZVNwYW4pKTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5CaW5kaW5nS2luZC5Qcm9wZXJ0eTpcbiAgICAgICAgY2FzZSBpci5CaW5kaW5nS2luZC5UZW1wbGF0ZTpcbiAgICAgICAgICBpZiAob3AubmFtZSA9PT0gJ3N0eWxlJykge1xuICAgICAgICAgICAgaXIuT3BMaXN0LnJlcGxhY2U8aXIuVXBkYXRlT3A+KFxuICAgICAgICAgICAgICAgIG9wLCBpci5jcmVhdGVTdHlsZU1hcE9wKG9wLnRhcmdldCwgb3AuZXhwcmVzc2lvbiwgb3Auc291cmNlU3BhbikpO1xuICAgICAgICAgIH0gZWxzZSBpZiAob3AubmFtZSA9PT0gJ2NsYXNzJykge1xuICAgICAgICAgICAgaXIuT3BMaXN0LnJlcGxhY2U8aXIuVXBkYXRlT3A+KFxuICAgICAgICAgICAgICAgIG9wLCBpci5jcmVhdGVDbGFzc01hcE9wKG9wLnRhcmdldCwgb3AuZXhwcmVzc2lvbiwgb3Auc291cmNlU3BhbikpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==