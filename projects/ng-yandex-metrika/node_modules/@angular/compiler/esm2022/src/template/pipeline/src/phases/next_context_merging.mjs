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
 * Merges logically sequential `NextContextExpr` operations.
 *
 * `NextContextExpr` can be referenced repeatedly, "popping" the runtime's context stack each time.
 * When two such expressions appear back-to-back, it's possible to merge them together into a single
 * `NextContextExpr` that steps multiple contexts. This merging is possible if all conditions are
 * met:
 *
 *   * The result of the `NextContextExpr` that's folded into the subsequent one is not stored (that
 *     is, the call is purely side-effectful).
 *   * No operations in between them uses the implicit context.
 */
export function mergeNextContextExpressions(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.Listener) {
                mergeNextContextsInOps(op.handlerOps);
            }
        }
        mergeNextContextsInOps(unit.update);
    }
}
function mergeNextContextsInOps(ops) {
    for (const op of ops) {
        // Look for a candidate operation to maybe merge.
        if (op.kind !== ir.OpKind.Statement || !(op.statement instanceof o.ExpressionStatement) ||
            !(op.statement.expr instanceof ir.NextContextExpr)) {
            continue;
        }
        const mergeSteps = op.statement.expr.steps;
        // Try to merge this `ir.NextContextExpr`.
        let tryToMerge = true;
        for (let candidate = op.next; candidate.kind !== ir.OpKind.ListEnd && tryToMerge; candidate = candidate.next) {
            ir.visitExpressionsInOp(candidate, (expr, flags) => {
                if (!ir.isIrExpression(expr)) {
                    return expr;
                }
                if (!tryToMerge) {
                    // Either we've already merged, or failed to merge.
                    return;
                }
                if (flags & ir.VisitorContextFlag.InChildOperation) {
                    // We cannot merge into child operations.
                    return;
                }
                switch (expr.kind) {
                    case ir.ExpressionKind.NextContext:
                        // Merge the previous `ir.NextContextExpr` into this one.
                        expr.steps += mergeSteps;
                        ir.OpList.remove(op);
                        tryToMerge = false;
                        break;
                    case ir.ExpressionKind.GetCurrentView:
                    case ir.ExpressionKind.Reference:
                        // Can't merge past a dependency on the context.
                        tryToMerge = false;
                        break;
                }
                return;
            });
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmV4dF9jb250ZXh0X21lcmdpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9uZXh0X2NvbnRleHRfbWVyZ2luZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssQ0FBQyxNQUFNLCtCQUErQixDQUFDO0FBQ25ELE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBSS9COzs7Ozs7Ozs7OztHQVdHO0FBQ0gsTUFBTSxVQUFVLDJCQUEyQixDQUFDLEdBQW1CO0lBQzdELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFO2dCQUNsQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLENBQUM7YUFDdkM7U0FDRjtRQUNELHNCQUFzQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztLQUNyQztBQUNILENBQUM7QUFFRCxTQUFTLHNCQUFzQixDQUFDLEdBQTJCO0lBQ3pELEtBQUssTUFBTSxFQUFFLElBQUksR0FBRyxFQUFFO1FBQ3BCLGlEQUFpRDtRQUNqRCxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTLElBQUksQ0FBQyxDQUFDLEVBQUUsQ0FBQyxTQUFTLFlBQVksQ0FBQyxDQUFDLG1CQUFtQixDQUFDO1lBQ25GLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksWUFBWSxFQUFFLENBQUMsZUFBZSxDQUFDLEVBQUU7WUFDdEQsU0FBUztTQUNWO1FBRUQsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDO1FBRTNDLDBDQUEwQztRQUMxQyxJQUFJLFVBQVUsR0FBRyxJQUFJLENBQUM7UUFDdEIsS0FBSyxJQUFJLFNBQVMsR0FBRyxFQUFFLENBQUMsSUFBSyxFQUFFLFNBQVMsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPLElBQUksVUFBVSxFQUM1RSxTQUFTLEdBQUcsU0FBUyxDQUFDLElBQUssRUFBRTtZQUNoQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsU0FBUyxFQUFFLENBQUMsSUFBSSxFQUFFLEtBQUssRUFBRSxFQUFFO2dCQUNqRCxJQUFJLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDNUIsT0FBTyxJQUFJLENBQUM7aUJBQ2I7Z0JBRUQsSUFBSSxDQUFDLFVBQVUsRUFBRTtvQkFDZixtREFBbUQ7b0JBQ25ELE9BQU87aUJBQ1I7Z0JBRUQsSUFBSSxLQUFLLEdBQUcsRUFBRSxDQUFDLGtCQUFrQixDQUFDLGdCQUFnQixFQUFFO29CQUNsRCx5Q0FBeUM7b0JBQ3pDLE9BQU87aUJBQ1I7Z0JBRUQsUUFBUSxJQUFJLENBQUMsSUFBSSxFQUFFO29CQUNqQixLQUFLLEVBQUUsQ0FBQyxjQUFjLENBQUMsV0FBVzt3QkFDaEMseURBQXlEO3dCQUN6RCxJQUFJLENBQUMsS0FBSyxJQUFJLFVBQVUsQ0FBQzt3QkFDekIsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBaUIsQ0FBQyxDQUFDO3dCQUNwQyxVQUFVLEdBQUcsS0FBSyxDQUFDO3dCQUNuQixNQUFNO29CQUNSLEtBQUssRUFBRSxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUM7b0JBQ3RDLEtBQUssRUFBRSxDQUFDLGNBQWMsQ0FBQyxTQUFTO3dCQUM5QixnREFBZ0Q7d0JBQ2hELFVBQVUsR0FBRyxLQUFLLENBQUM7d0JBQ25CLE1BQU07aUJBQ1Q7Z0JBQ0QsT0FBTztZQUNULENBQUMsQ0FBQyxDQUFDO1NBQ0o7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgbyBmcm9tICcuLi8uLi8uLi8uLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5cbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIE1lcmdlcyBsb2dpY2FsbHkgc2VxdWVudGlhbCBgTmV4dENvbnRleHRFeHByYCBvcGVyYXRpb25zLlxuICpcbiAqIGBOZXh0Q29udGV4dEV4cHJgIGNhbiBiZSByZWZlcmVuY2VkIHJlcGVhdGVkbHksIFwicG9wcGluZ1wiIHRoZSBydW50aW1lJ3MgY29udGV4dCBzdGFjayBlYWNoIHRpbWUuXG4gKiBXaGVuIHR3byBzdWNoIGV4cHJlc3Npb25zIGFwcGVhciBiYWNrLXRvLWJhY2ssIGl0J3MgcG9zc2libGUgdG8gbWVyZ2UgdGhlbSB0b2dldGhlciBpbnRvIGEgc2luZ2xlXG4gKiBgTmV4dENvbnRleHRFeHByYCB0aGF0IHN0ZXBzIG11bHRpcGxlIGNvbnRleHRzLiBUaGlzIG1lcmdpbmcgaXMgcG9zc2libGUgaWYgYWxsIGNvbmRpdGlvbnMgYXJlXG4gKiBtZXQ6XG4gKlxuICogICAqIFRoZSByZXN1bHQgb2YgdGhlIGBOZXh0Q29udGV4dEV4cHJgIHRoYXQncyBmb2xkZWQgaW50byB0aGUgc3Vic2VxdWVudCBvbmUgaXMgbm90IHN0b3JlZCAodGhhdFxuICogICAgIGlzLCB0aGUgY2FsbCBpcyBwdXJlbHkgc2lkZS1lZmZlY3RmdWwpLlxuICogICAqIE5vIG9wZXJhdGlvbnMgaW4gYmV0d2VlbiB0aGVtIHVzZXMgdGhlIGltcGxpY2l0IGNvbnRleHQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXJnZU5leHRDb250ZXh0RXhwcmVzc2lvbnMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgPT09IGlyLk9wS2luZC5MaXN0ZW5lcikge1xuICAgICAgICBtZXJnZU5leHRDb250ZXh0c0luT3BzKG9wLmhhbmRsZXJPcHMpO1xuICAgICAgfVxuICAgIH1cbiAgICBtZXJnZU5leHRDb250ZXh0c0luT3BzKHVuaXQudXBkYXRlKTtcbiAgfVxufVxuXG5mdW5jdGlvbiBtZXJnZU5leHRDb250ZXh0c0luT3BzKG9wczogaXIuT3BMaXN0PGlyLlVwZGF0ZU9wPik6IHZvaWQge1xuICBmb3IgKGNvbnN0IG9wIG9mIG9wcykge1xuICAgIC8vIExvb2sgZm9yIGEgY2FuZGlkYXRlIG9wZXJhdGlvbiB0byBtYXliZSBtZXJnZS5cbiAgICBpZiAob3Aua2luZCAhPT0gaXIuT3BLaW5kLlN0YXRlbWVudCB8fCAhKG9wLnN0YXRlbWVudCBpbnN0YW5jZW9mIG8uRXhwcmVzc2lvblN0YXRlbWVudCkgfHxcbiAgICAgICAgIShvcC5zdGF0ZW1lbnQuZXhwciBpbnN0YW5jZW9mIGlyLk5leHRDb250ZXh0RXhwcikpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IG1lcmdlU3RlcHMgPSBvcC5zdGF0ZW1lbnQuZXhwci5zdGVwcztcblxuICAgIC8vIFRyeSB0byBtZXJnZSB0aGlzIGBpci5OZXh0Q29udGV4dEV4cHJgLlxuICAgIGxldCB0cnlUb01lcmdlID0gdHJ1ZTtcbiAgICBmb3IgKGxldCBjYW5kaWRhdGUgPSBvcC5uZXh0ITsgY2FuZGlkYXRlLmtpbmQgIT09IGlyLk9wS2luZC5MaXN0RW5kICYmIHRyeVRvTWVyZ2U7XG4gICAgICAgICBjYW5kaWRhdGUgPSBjYW5kaWRhdGUubmV4dCEpIHtcbiAgICAgIGlyLnZpc2l0RXhwcmVzc2lvbnNJbk9wKGNhbmRpZGF0ZSwgKGV4cHIsIGZsYWdzKSA9PiB7XG4gICAgICAgIGlmICghaXIuaXNJckV4cHJlc3Npb24oZXhwcikpIHtcbiAgICAgICAgICByZXR1cm4gZXhwcjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdHJ5VG9NZXJnZSkge1xuICAgICAgICAgIC8vIEVpdGhlciB3ZSd2ZSBhbHJlYWR5IG1lcmdlZCwgb3IgZmFpbGVkIHRvIG1lcmdlLlxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChmbGFncyAmIGlyLlZpc2l0b3JDb250ZXh0RmxhZy5JbkNoaWxkT3BlcmF0aW9uKSB7XG4gICAgICAgICAgLy8gV2UgY2Fubm90IG1lcmdlIGludG8gY2hpbGQgb3BlcmF0aW9ucy5cbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzd2l0Y2ggKGV4cHIua2luZCkge1xuICAgICAgICAgIGNhc2UgaXIuRXhwcmVzc2lvbktpbmQuTmV4dENvbnRleHQ6XG4gICAgICAgICAgICAvLyBNZXJnZSB0aGUgcHJldmlvdXMgYGlyLk5leHRDb250ZXh0RXhwcmAgaW50byB0aGlzIG9uZS5cbiAgICAgICAgICAgIGV4cHIuc3RlcHMgKz0gbWVyZ2VTdGVwcztcbiAgICAgICAgICAgIGlyLk9wTGlzdC5yZW1vdmUob3AgYXMgaXIuVXBkYXRlT3ApO1xuICAgICAgICAgICAgdHJ5VG9NZXJnZSA9IGZhbHNlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgICAgY2FzZSBpci5FeHByZXNzaW9uS2luZC5HZXRDdXJyZW50VmlldzpcbiAgICAgICAgICBjYXNlIGlyLkV4cHJlc3Npb25LaW5kLlJlZmVyZW5jZTpcbiAgICAgICAgICAgIC8vIENhbid0IG1lcmdlIHBhc3QgYSBkZXBlbmRlbmN5IG9uIHRoZSBjb250ZXh0LlxuICAgICAgICAgICAgdHJ5VG9NZXJnZSA9IGZhbHNlO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG4iXX0=