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
 * Resolves `ir.ContextExpr` expressions (which represent embedded view or component contexts) to
 * either the `ctx` parameter to component functions (for the current view context) or to variables
 * that store those contexts (for contexts accessed via the `nextContext()` instruction).
 */
export function resolveContexts(job) {
    for (const unit of job.units) {
        processLexicalScope(unit, unit.create);
        processLexicalScope(unit, unit.update);
    }
}
function processLexicalScope(view, ops) {
    // Track the expressions used to access all available contexts within the current view, by the
    // view `ir.XrefId`.
    const scope = new Map();
    // The current view's context is accessible via the `ctx` parameter.
    scope.set(view.xref, o.variable('ctx'));
    for (const op of ops) {
        switch (op.kind) {
            case ir.OpKind.Variable:
                switch (op.variable.kind) {
                    case ir.SemanticVariableKind.Context:
                        scope.set(op.variable.view, new ir.ReadVariableExpr(op.xref));
                        break;
                }
                break;
            case ir.OpKind.Listener:
                processLexicalScope(view, op.handlerOps);
                break;
        }
    }
    if (view === view.job.root) {
        // Prefer `ctx` of the root view to any variables which happen to contain the root context.
        scope.set(view.xref, o.variable('ctx'));
    }
    for (const op of ops) {
        ir.transformExpressionsInOp(op, expr => {
            if (expr instanceof ir.ContextExpr) {
                if (!scope.has(expr.view)) {
                    throw new Error(`No context found for reference to view ${expr.view} from view ${view.xref}`);
                }
                return scope.get(expr.view);
            }
            else {
                return expr;
            }
        }, ir.VisitorContextFlag.None);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9jb250ZXh0cy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL3Jlc29sdmVfY29udGV4dHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQjs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FBQyxHQUFtQjtJQUNqRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsbUJBQW1CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN2QyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3hDO0FBQ0gsQ0FBQztBQUVELFNBQVMsbUJBQW1CLENBQUMsSUFBcUIsRUFBRSxHQUF1QztJQUN6Riw4RkFBOEY7SUFDOUYsb0JBQW9CO0lBQ3BCLE1BQU0sS0FBSyxHQUFHLElBQUksR0FBRyxFQUEyQixDQUFDO0lBRWpELG9FQUFvRTtJQUNwRSxLQUFLLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxLQUFLLENBQUMsQ0FBQyxDQUFDO0lBRXhDLEtBQUssTUFBTSxFQUFFLElBQUksR0FBRyxFQUFFO1FBQ3BCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtZQUNmLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRO2dCQUNyQixRQUFRLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFO29CQUN4QixLQUFLLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxPQUFPO3dCQUNsQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLGdCQUFnQixDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO3dCQUM5RCxNQUFNO2lCQUNUO2dCQUNELE1BQU07WUFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUTtnQkFDckIsbUJBQW1CLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQztnQkFDekMsTUFBTTtTQUNUO0tBQ0Y7SUFFRCxJQUFJLElBQUksS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLElBQUksRUFBRTtRQUMxQiwyRkFBMkY7UUFDM0YsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQztLQUN6QztJQUVELEtBQUssTUFBTSxFQUFFLElBQUksR0FBRyxFQUFFO1FBQ3BCLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7WUFDckMsSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDLFdBQVcsRUFBRTtnQkFDbEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO29CQUN6QixNQUFNLElBQUksS0FBSyxDQUNYLDBDQUEwQyxJQUFJLENBQUMsSUFBSSxjQUFjLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO2lCQUNuRjtnQkFDRCxPQUFPLEtBQUssQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBRSxDQUFDO2FBQzlCO2lCQUFNO2dCQUNMLE9BQU8sSUFBSSxDQUFDO2FBQ2I7UUFDSCxDQUFDLEVBQUUsRUFBRSxDQUFDLGtCQUFrQixDQUFDLElBQUksQ0FBQyxDQUFDO0tBQ2hDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcGlsYXRpb25Kb2IsIENvbXBpbGF0aW9uVW5pdCwgQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IsIFZpZXdDb21waWxhdGlvblVuaXR9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBSZXNvbHZlcyBgaXIuQ29udGV4dEV4cHJgIGV4cHJlc3Npb25zICh3aGljaCByZXByZXNlbnQgZW1iZWRkZWQgdmlldyBvciBjb21wb25lbnQgY29udGV4dHMpIHRvXG4gKiBlaXRoZXIgdGhlIGBjdHhgIHBhcmFtZXRlciB0byBjb21wb25lbnQgZnVuY3Rpb25zIChmb3IgdGhlIGN1cnJlbnQgdmlldyBjb250ZXh0KSBvciB0byB2YXJpYWJsZXNcbiAqIHRoYXQgc3RvcmUgdGhvc2UgY29udGV4dHMgKGZvciBjb250ZXh0cyBhY2Nlc3NlZCB2aWEgdGhlIGBuZXh0Q29udGV4dCgpYCBpbnN0cnVjdGlvbikuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlQ29udGV4dHMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgcHJvY2Vzc0xleGljYWxTY29wZSh1bml0LCB1bml0LmNyZWF0ZSk7XG4gICAgcHJvY2Vzc0xleGljYWxTY29wZSh1bml0LCB1bml0LnVwZGF0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJvY2Vzc0xleGljYWxTY29wZSh2aWV3OiBDb21waWxhdGlvblVuaXQsIG9wczogaXIuT3BMaXN0PGlyLkNyZWF0ZU9wfGlyLlVwZGF0ZU9wPik6IHZvaWQge1xuICAvLyBUcmFjayB0aGUgZXhwcmVzc2lvbnMgdXNlZCB0byBhY2Nlc3MgYWxsIGF2YWlsYWJsZSBjb250ZXh0cyB3aXRoaW4gdGhlIGN1cnJlbnQgdmlldywgYnkgdGhlXG4gIC8vIHZpZXcgYGlyLlhyZWZJZGAuXG4gIGNvbnN0IHNjb3BlID0gbmV3IE1hcDxpci5YcmVmSWQsIG8uRXhwcmVzc2lvbj4oKTtcblxuICAvLyBUaGUgY3VycmVudCB2aWV3J3MgY29udGV4dCBpcyBhY2Nlc3NpYmxlIHZpYSB0aGUgYGN0eGAgcGFyYW1ldGVyLlxuICBzY29wZS5zZXQodmlldy54cmVmLCBvLnZhcmlhYmxlKCdjdHgnKSk7XG5cbiAgZm9yIChjb25zdCBvcCBvZiBvcHMpIHtcbiAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgIGNhc2UgaXIuT3BLaW5kLlZhcmlhYmxlOlxuICAgICAgICBzd2l0Y2ggKG9wLnZhcmlhYmxlLmtpbmQpIHtcbiAgICAgICAgICBjYXNlIGlyLlNlbWFudGljVmFyaWFibGVLaW5kLkNvbnRleHQ6XG4gICAgICAgICAgICBzY29wZS5zZXQob3AudmFyaWFibGUudmlldywgbmV3IGlyLlJlYWRWYXJpYWJsZUV4cHIob3AueHJlZikpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5MaXN0ZW5lcjpcbiAgICAgICAgcHJvY2Vzc0xleGljYWxTY29wZSh2aWV3LCBvcC5oYW5kbGVyT3BzKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKHZpZXcgPT09IHZpZXcuam9iLnJvb3QpIHtcbiAgICAvLyBQcmVmZXIgYGN0eGAgb2YgdGhlIHJvb3QgdmlldyB0byBhbnkgdmFyaWFibGVzIHdoaWNoIGhhcHBlbiB0byBjb250YWluIHRoZSByb290IGNvbnRleHQuXG4gICAgc2NvcGUuc2V0KHZpZXcueHJlZiwgby52YXJpYWJsZSgnY3R4JykpO1xuICB9XG5cbiAgZm9yIChjb25zdCBvcCBvZiBvcHMpIHtcbiAgICBpci50cmFuc2Zvcm1FeHByZXNzaW9uc0luT3Aob3AsIGV4cHIgPT4ge1xuICAgICAgaWYgKGV4cHIgaW5zdGFuY2VvZiBpci5Db250ZXh0RXhwcikge1xuICAgICAgICBpZiAoIXNjb3BlLmhhcyhleHByLnZpZXcpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICBgTm8gY29udGV4dCBmb3VuZCBmb3IgcmVmZXJlbmNlIHRvIHZpZXcgJHtleHByLnZpZXd9IGZyb20gdmlldyAke3ZpZXcueHJlZn1gKTtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gc2NvcGUuZ2V0KGV4cHIudmlldykhO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIGV4cHI7XG4gICAgICB9XG4gICAgfSwgaXIuVmlzaXRvckNvbnRleHRGbGFnLk5vbmUpO1xuICB9XG59XG4iXX0=