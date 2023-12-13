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
 * Find all assignments and usages of temporary variables, which are linked to each other with cross
 * references. Generate names for each cross-reference, and add a `DeclareVarStmt` to initialize
 * them at the beginning of the update block.
 *
 * TODO: Sometimes, it will be possible to reuse names across different subexpressions. For example,
 * in the double keyed read `a?.[f()]?.[f()]`, the two function calls have non-overlapping scopes.
 * Implement an algorithm for reuse.
 */
export function generateTemporaryVariables(job) {
    for (const unit of job.units) {
        unit.create.prepend(generateTemporaries(unit.create));
        unit.update.prepend(generateTemporaries(unit.update));
    }
}
function generateTemporaries(ops) {
    let opCount = 0;
    let generatedStatements = [];
    // For each op, search for any variables that are assigned or read. For each variable, generate a
    // name and produce a `DeclareVarStmt` to the beginning of the block.
    for (const op of ops) {
        // Identify the final time each temp var is read.
        const finalReads = new Map();
        ir.visitExpressionsInOp(op, (expr, flag) => {
            if (flag & ir.VisitorContextFlag.InChildOperation) {
                return;
            }
            if (expr instanceof ir.ReadTemporaryExpr) {
                finalReads.set(expr.xref, expr);
            }
        });
        // Name the temp vars, accounting for the fact that a name can be reused after it has been
        // read for the final time.
        let count = 0;
        const assigned = new Set();
        const released = new Set();
        const defs = new Map();
        ir.visitExpressionsInOp(op, (expr, flag) => {
            if (flag & ir.VisitorContextFlag.InChildOperation) {
                return;
            }
            if (expr instanceof ir.AssignTemporaryExpr) {
                if (!assigned.has(expr.xref)) {
                    assigned.add(expr.xref);
                    // TODO: Exactly replicate the naming scheme used by `TemplateDefinitionBuilder`.
                    // It seems to rely on an expression index instead of an op index.
                    defs.set(expr.xref, `tmp_${opCount}_${count++}`);
                }
                assignName(defs, expr);
            }
            else if (expr instanceof ir.ReadTemporaryExpr) {
                if (finalReads.get(expr.xref) === expr) {
                    released.add(expr.xref);
                    count--;
                }
                assignName(defs, expr);
            }
        });
        // Add declarations for the temp vars.
        generatedStatements.push(...Array.from(new Set(defs.values()))
            .map(name => ir.createStatementOp(new o.DeclareVarStmt(name))));
        opCount++;
        if (op.kind === ir.OpKind.Listener) {
            op.handlerOps.prepend(generateTemporaries(op.handlerOps));
        }
    }
    return generatedStatements;
}
/**
 * Assigns a name to the temporary variable in the given temporary variable expression.
 */
function assignName(names, expr) {
    const name = names.get(expr.xref);
    if (name === undefined) {
        throw new Error(`Found xref with unassigned name: ${expr.xref}`);
    }
    expr.name = name;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcG9yYXJ5X3ZhcmlhYmxlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL3RlbXBvcmFyeV92YXJpYWJsZXMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQjs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxHQUFtQjtJQUM1RCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBdUMsQ0FBQyxDQUFDO1FBQzVGLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLG1CQUFtQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQXVDLENBQUMsQ0FBQztLQUM3RjtBQUNILENBQUM7QUFFRCxTQUFTLG1CQUFtQixDQUFDLEdBQXVDO0lBRWxFLElBQUksT0FBTyxHQUFHLENBQUMsQ0FBQztJQUNoQixJQUFJLG1CQUFtQixHQUF1QyxFQUFFLENBQUM7SUFFakUsaUdBQWlHO0lBQ2pHLHFFQUFxRTtJQUNyRSxLQUFLLE1BQU0sRUFBRSxJQUFJLEdBQUcsRUFBRTtRQUNwQixpREFBaUQ7UUFDakQsTUFBTSxVQUFVLEdBQUcsSUFBSSxHQUFHLEVBQW1DLENBQUM7UUFDOUQsRUFBRSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLEVBQUUsRUFBRTtZQUN6QyxJQUFJLElBQUksR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ2pELE9BQU87YUFDUjtZQUNELElBQUksSUFBSSxZQUFZLEVBQUUsQ0FBQyxpQkFBaUIsRUFBRTtnQkFDeEMsVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxDQUFDO2FBQ2pDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCwwRkFBMEY7UUFDMUYsMkJBQTJCO1FBQzNCLElBQUksS0FBSyxHQUFHLENBQUMsQ0FBQztRQUNkLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxFQUFhLENBQUM7UUFDdEMsTUFBTSxRQUFRLEdBQUcsSUFBSSxHQUFHLEVBQWEsQ0FBQztRQUN0QyxNQUFNLElBQUksR0FBRyxJQUFJLEdBQUcsRUFBcUIsQ0FBQztRQUMxQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsRUFBRSxFQUFFLENBQUMsSUFBSSxFQUFFLElBQUksRUFBRSxFQUFFO1lBQ3pDLElBQUksSUFBSSxHQUFHLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxnQkFBZ0IsRUFBRTtnQkFDakQsT0FBTzthQUNSO1lBQ0QsSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDLG1CQUFtQixFQUFFO2dCQUMxQyxJQUFJLENBQUMsUUFBUSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7b0JBQzVCLFFBQVEsQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO29CQUN4QixpRkFBaUY7b0JBQ2pGLGtFQUFrRTtvQkFDbEUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLE9BQU8sT0FBTyxJQUFJLEtBQUssRUFBRSxFQUFFLENBQUMsQ0FBQztpQkFDbEQ7Z0JBQ0QsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzthQUN4QjtpQkFBTSxJQUFJLElBQUksWUFBWSxFQUFFLENBQUMsaUJBQWlCLEVBQUU7Z0JBQy9DLElBQUksVUFBVSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssSUFBSSxFQUFFO29CQUN0QyxRQUFRLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztvQkFDeEIsS0FBSyxFQUFFLENBQUM7aUJBQ1Q7Z0JBQ0QsVUFBVSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQzthQUN4QjtRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsc0NBQXNDO1FBQ3RDLG1CQUFtQixDQUFDLElBQUksQ0FDcEIsR0FBRyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2FBQ2hDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBYyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDckYsT0FBTyxFQUFFLENBQUM7UUFFVixJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUU7WUFDbEMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxPQUFPLENBQUMsbUJBQW1CLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBa0IsQ0FBQyxDQUFDO1NBQzVFO0tBQ0Y7SUFFRCxPQUFPLG1CQUFtQixDQUFDO0FBQzdCLENBQUM7QUFFRDs7R0FFRztBQUNILFNBQVMsVUFBVSxDQUNmLEtBQTZCLEVBQUUsSUFBaUQ7SUFDbEYsTUFBTSxJQUFJLEdBQUcsS0FBSyxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDbEMsSUFBSSxJQUFJLEtBQUssU0FBUyxFQUFFO1FBQ3RCLE1BQU0sSUFBSSxLQUFLLENBQUMsb0NBQW9DLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0tBQ2xFO0lBQ0QsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLENBQUM7QUFDbkIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYiwgQ29tcGlsYXRpb25Vbml0fSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5cbi8qKlxuICogRmluZCBhbGwgYXNzaWdubWVudHMgYW5kIHVzYWdlcyBvZiB0ZW1wb3JhcnkgdmFyaWFibGVzLCB3aGljaCBhcmUgbGlua2VkIHRvIGVhY2ggb3RoZXIgd2l0aCBjcm9zc1xuICogcmVmZXJlbmNlcy4gR2VuZXJhdGUgbmFtZXMgZm9yIGVhY2ggY3Jvc3MtcmVmZXJlbmNlLCBhbmQgYWRkIGEgYERlY2xhcmVWYXJTdG10YCB0byBpbml0aWFsaXplXG4gKiB0aGVtIGF0IHRoZSBiZWdpbm5pbmcgb2YgdGhlIHVwZGF0ZSBibG9jay5cbiAqXG4gKiBUT0RPOiBTb21ldGltZXMsIGl0IHdpbGwgYmUgcG9zc2libGUgdG8gcmV1c2UgbmFtZXMgYWNyb3NzIGRpZmZlcmVudCBzdWJleHByZXNzaW9ucy4gRm9yIGV4YW1wbGUsXG4gKiBpbiB0aGUgZG91YmxlIGtleWVkIHJlYWQgYGE/LltmKCldPy5bZigpXWAsIHRoZSB0d28gZnVuY3Rpb24gY2FsbHMgaGF2ZSBub24tb3ZlcmxhcHBpbmcgc2NvcGVzLlxuICogSW1wbGVtZW50IGFuIGFsZ29yaXRobSBmb3IgcmV1c2UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZW5lcmF0ZVRlbXBvcmFyeVZhcmlhYmxlcyhqb2I6IENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICB1bml0LmNyZWF0ZS5wcmVwZW5kKGdlbmVyYXRlVGVtcG9yYXJpZXModW5pdC5jcmVhdGUpIGFzIEFycmF5PGlyLlN0YXRlbWVudE9wPGlyLkNyZWF0ZU9wPj4pO1xuICAgIHVuaXQudXBkYXRlLnByZXBlbmQoZ2VuZXJhdGVUZW1wb3Jhcmllcyh1bml0LnVwZGF0ZSkgYXMgQXJyYXk8aXIuU3RhdGVtZW50T3A8aXIuVXBkYXRlT3A+Pik7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2VuZXJhdGVUZW1wb3JhcmllcyhvcHM6IGlyLk9wTGlzdDxpci5DcmVhdGVPcHxpci5VcGRhdGVPcD4pOlxuICAgIEFycmF5PGlyLlN0YXRlbWVudE9wPGlyLkNyZWF0ZU9wfGlyLlVwZGF0ZU9wPj4ge1xuICBsZXQgb3BDb3VudCA9IDA7XG4gIGxldCBnZW5lcmF0ZWRTdGF0ZW1lbnRzOiBBcnJheTxpci5TdGF0ZW1lbnRPcDxpci5VcGRhdGVPcD4+ID0gW107XG5cbiAgLy8gRm9yIGVhY2ggb3AsIHNlYXJjaCBmb3IgYW55IHZhcmlhYmxlcyB0aGF0IGFyZSBhc3NpZ25lZCBvciByZWFkLiBGb3IgZWFjaCB2YXJpYWJsZSwgZ2VuZXJhdGUgYVxuICAvLyBuYW1lIGFuZCBwcm9kdWNlIGEgYERlY2xhcmVWYXJTdG10YCB0byB0aGUgYmVnaW5uaW5nIG9mIHRoZSBibG9jay5cbiAgZm9yIChjb25zdCBvcCBvZiBvcHMpIHtcbiAgICAvLyBJZGVudGlmeSB0aGUgZmluYWwgdGltZSBlYWNoIHRlbXAgdmFyIGlzIHJlYWQuXG4gICAgY29uc3QgZmluYWxSZWFkcyA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5SZWFkVGVtcG9yYXJ5RXhwcj4oKTtcbiAgICBpci52aXNpdEV4cHJlc3Npb25zSW5PcChvcCwgKGV4cHIsIGZsYWcpID0+IHtcbiAgICAgIGlmIChmbGFnICYgaXIuVmlzaXRvckNvbnRleHRGbGFnLkluQ2hpbGRPcGVyYXRpb24pIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgaWYgKGV4cHIgaW5zdGFuY2VvZiBpci5SZWFkVGVtcG9yYXJ5RXhwcikge1xuICAgICAgICBmaW5hbFJlYWRzLnNldChleHByLnhyZWYsIGV4cHIpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gTmFtZSB0aGUgdGVtcCB2YXJzLCBhY2NvdW50aW5nIGZvciB0aGUgZmFjdCB0aGF0IGEgbmFtZSBjYW4gYmUgcmV1c2VkIGFmdGVyIGl0IGhhcyBiZWVuXG4gICAgLy8gcmVhZCBmb3IgdGhlIGZpbmFsIHRpbWUuXG4gICAgbGV0IGNvdW50ID0gMDtcbiAgICBjb25zdCBhc3NpZ25lZCA9IG5ldyBTZXQ8aXIuWHJlZklkPigpO1xuICAgIGNvbnN0IHJlbGVhc2VkID0gbmV3IFNldDxpci5YcmVmSWQ+KCk7XG4gICAgY29uc3QgZGVmcyA9IG5ldyBNYXA8aXIuWHJlZklkLCBzdHJpbmc+KCk7XG4gICAgaXIudmlzaXRFeHByZXNzaW9uc0luT3Aob3AsIChleHByLCBmbGFnKSA9PiB7XG4gICAgICBpZiAoZmxhZyAmIGlyLlZpc2l0b3JDb250ZXh0RmxhZy5JbkNoaWxkT3BlcmF0aW9uKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmIChleHByIGluc3RhbmNlb2YgaXIuQXNzaWduVGVtcG9yYXJ5RXhwcikge1xuICAgICAgICBpZiAoIWFzc2lnbmVkLmhhcyhleHByLnhyZWYpKSB7XG4gICAgICAgICAgYXNzaWduZWQuYWRkKGV4cHIueHJlZik7XG4gICAgICAgICAgLy8gVE9ETzogRXhhY3RseSByZXBsaWNhdGUgdGhlIG5hbWluZyBzY2hlbWUgdXNlZCBieSBgVGVtcGxhdGVEZWZpbml0aW9uQnVpbGRlcmAuXG4gICAgICAgICAgLy8gSXQgc2VlbXMgdG8gcmVseSBvbiBhbiBleHByZXNzaW9uIGluZGV4IGluc3RlYWQgb2YgYW4gb3AgaW5kZXguXG4gICAgICAgICAgZGVmcy5zZXQoZXhwci54cmVmLCBgdG1wXyR7b3BDb3VudH1fJHtjb3VudCsrfWApO1xuICAgICAgICB9XG4gICAgICAgIGFzc2lnbk5hbWUoZGVmcywgZXhwcik7XG4gICAgICB9IGVsc2UgaWYgKGV4cHIgaW5zdGFuY2VvZiBpci5SZWFkVGVtcG9yYXJ5RXhwcikge1xuICAgICAgICBpZiAoZmluYWxSZWFkcy5nZXQoZXhwci54cmVmKSA9PT0gZXhwcikge1xuICAgICAgICAgIHJlbGVhc2VkLmFkZChleHByLnhyZWYpO1xuICAgICAgICAgIGNvdW50LS07XG4gICAgICAgIH1cbiAgICAgICAgYXNzaWduTmFtZShkZWZzLCBleHByKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEFkZCBkZWNsYXJhdGlvbnMgZm9yIHRoZSB0ZW1wIHZhcnMuXG4gICAgZ2VuZXJhdGVkU3RhdGVtZW50cy5wdXNoKFxuICAgICAgICAuLi5BcnJheS5mcm9tKG5ldyBTZXQoZGVmcy52YWx1ZXMoKSkpXG4gICAgICAgICAgICAubWFwKG5hbWUgPT4gaXIuY3JlYXRlU3RhdGVtZW50T3A8aXIuVXBkYXRlT3A+KG5ldyBvLkRlY2xhcmVWYXJTdG10KG5hbWUpKSkpO1xuICAgIG9wQ291bnQrKztcblxuICAgIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuTGlzdGVuZXIpIHtcbiAgICAgIG9wLmhhbmRsZXJPcHMucHJlcGVuZChnZW5lcmF0ZVRlbXBvcmFyaWVzKG9wLmhhbmRsZXJPcHMpIGFzIGlyLlVwZGF0ZU9wW10pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBnZW5lcmF0ZWRTdGF0ZW1lbnRzO1xufVxuXG4vKipcbiAqIEFzc2lnbnMgYSBuYW1lIHRvIHRoZSB0ZW1wb3JhcnkgdmFyaWFibGUgaW4gdGhlIGdpdmVuIHRlbXBvcmFyeSB2YXJpYWJsZSBleHByZXNzaW9uLlxuICovXG5mdW5jdGlvbiBhc3NpZ25OYW1lKFxuICAgIG5hbWVzOiBNYXA8aXIuWHJlZklkLCBzdHJpbmc+LCBleHByOiBpci5Bc3NpZ25UZW1wb3JhcnlFeHByfGlyLlJlYWRUZW1wb3JhcnlFeHByKSB7XG4gIGNvbnN0IG5hbWUgPSBuYW1lcy5nZXQoZXhwci54cmVmKTtcbiAgaWYgKG5hbWUgPT09IHVuZGVmaW5lZCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgRm91bmQgeHJlZiB3aXRoIHVuYXNzaWduZWQgbmFtZTogJHtleHByLnhyZWZ9YCk7XG4gIH1cbiAgZXhwci5uYW1lID0gbmFtZTtcbn1cbiJdfQ==