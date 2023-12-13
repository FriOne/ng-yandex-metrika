/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { GenericKeyFn } from '../../../../constant_pool';
import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
export function extractPureFunctions(job) {
    for (const view of job.units) {
        for (const op of view.ops()) {
            ir.visitExpressionsInOp(op, expr => {
                if (!(expr instanceof ir.PureFunctionExpr) || expr.body === null) {
                    return;
                }
                const constantDef = new PureFunctionConstant(expr.args.length);
                expr.fn = job.pool.getSharedConstant(constantDef, expr.body);
                expr.body = null;
            });
        }
    }
}
class PureFunctionConstant extends GenericKeyFn {
    constructor(numArgs) {
        super();
        this.numArgs = numArgs;
    }
    keyOf(expr) {
        if (expr instanceof ir.PureFunctionParameterExpr) {
            return `param(${expr.index})`;
        }
        else {
            return super.keyOf(expr);
        }
    }
    // TODO: Use the new pool method `getSharedFunctionReference`
    toSharedConstantDeclaration(declName, keyExpr) {
        const fnParams = [];
        for (let idx = 0; idx < this.numArgs; idx++) {
            fnParams.push(new o.FnParam('a' + idx));
        }
        // We will never visit `ir.PureFunctionParameterExpr`s that don't belong to us, because this
        // transform runs inside another visitor which will visit nested pure functions before this one.
        const returnExpr = ir.transformExpressionsInExpression(keyExpr, expr => {
            if (!(expr instanceof ir.PureFunctionParameterExpr)) {
                return expr;
            }
            return o.variable('a' + expr.index);
        }, ir.VisitorContextFlag.None);
        return new o.DeclareVarStmt(declName, new o.ArrowFunctionExpr(fnParams, returnExpr), undefined, o.StmtModifier.Final);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHVyZV9mdW5jdGlvbl9leHRyYWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvcHVyZV9mdW5jdGlvbl9leHRyYWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxZQUFZLEVBQTJCLE1BQU0sMkJBQTJCLENBQUM7QUFDakYsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUkvQixNQUFNLFVBQVUsb0JBQW9CLENBQUMsR0FBbUI7SUFDdEQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQzNCLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLEVBQUUsSUFBSSxDQUFDLEVBQUU7Z0JBQ2pDLElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksRUFBRTtvQkFDaEUsT0FBTztpQkFDUjtnQkFFRCxNQUFNLFdBQVcsR0FBRyxJQUFJLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7Z0JBQy9ELElBQUksQ0FBQyxFQUFFLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxXQUFXLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2dCQUM3RCxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksQ0FBQztZQUNuQixDQUFDLENBQUMsQ0FBQztTQUNKO0tBQ0Y7QUFDSCxDQUFDO0FBRUQsTUFBTSxvQkFBcUIsU0FBUSxZQUFZO0lBQzdDLFlBQW9CLE9BQWU7UUFDakMsS0FBSyxFQUFFLENBQUM7UUFEVSxZQUFPLEdBQVAsT0FBTyxDQUFRO0lBRW5DLENBQUM7SUFFUSxLQUFLLENBQUMsSUFBa0I7UUFDL0IsSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDLHlCQUF5QixFQUFFO1lBQ2hELE9BQU8sU0FBUyxJQUFJLENBQUMsS0FBSyxHQUFHLENBQUM7U0FDL0I7YUFBTTtZQUNMLE9BQU8sS0FBSyxDQUFDLEtBQUssQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUMxQjtJQUNILENBQUM7SUFFRCw2REFBNkQ7SUFDN0QsMkJBQTJCLENBQUMsUUFBZ0IsRUFBRSxPQUFxQjtRQUNqRSxNQUFNLFFBQVEsR0FBZ0IsRUFBRSxDQUFDO1FBQ2pDLEtBQUssSUFBSSxHQUFHLEdBQUcsQ0FBQyxFQUFFLEdBQUcsR0FBRyxJQUFJLENBQUMsT0FBTyxFQUFFLEdBQUcsRUFBRSxFQUFFO1lBQzNDLFFBQVEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsT0FBTyxDQUFDLEdBQUcsR0FBRyxHQUFHLENBQUMsQ0FBQyxDQUFDO1NBQ3pDO1FBRUQsNEZBQTRGO1FBQzVGLGdHQUFnRztRQUNoRyxNQUFNLFVBQVUsR0FBRyxFQUFFLENBQUMsZ0NBQWdDLENBQUMsT0FBTyxFQUFFLElBQUksQ0FBQyxFQUFFO1lBQ3JFLElBQUksQ0FBQyxDQUFDLElBQUksWUFBWSxFQUFFLENBQUMseUJBQXlCLENBQUMsRUFBRTtnQkFDbkQsT0FBTyxJQUFJLENBQUM7YUFDYjtZQUVELE9BQU8sQ0FBQyxDQUFDLFFBQVEsQ0FBQyxHQUFHLEdBQUcsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3RDLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFL0IsT0FBTyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQ3ZCLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQUUsVUFBVSxDQUFDLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLENBQUM7SUFDaEcsQ0FBQztDQUNGIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7R2VuZXJpY0tleUZuLCBTaGFyZWRDb25zdGFudERlZmluaXRpb259IGZyb20gJy4uLy4uLy4uLy4uL2NvbnN0YW50X3Bvb2wnO1xuaW1wb3J0ICogYXMgbyBmcm9tICcuLi8uLi8uLi8uLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5cbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdFB1cmVGdW5jdGlvbnMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHZpZXcgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB2aWV3Lm9wcygpKSB7XG4gICAgICBpci52aXNpdEV4cHJlc3Npb25zSW5PcChvcCwgZXhwciA9PiB7XG4gICAgICAgIGlmICghKGV4cHIgaW5zdGFuY2VvZiBpci5QdXJlRnVuY3Rpb25FeHByKSB8fCBleHByLmJvZHkgPT09IG51bGwpIHtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBjb25zdGFudERlZiA9IG5ldyBQdXJlRnVuY3Rpb25Db25zdGFudChleHByLmFyZ3MubGVuZ3RoKTtcbiAgICAgICAgZXhwci5mbiA9IGpvYi5wb29sLmdldFNoYXJlZENvbnN0YW50KGNvbnN0YW50RGVmLCBleHByLmJvZHkpO1xuICAgICAgICBleHByLmJvZHkgPSBudWxsO1xuICAgICAgfSk7XG4gICAgfVxuICB9XG59XG5cbmNsYXNzIFB1cmVGdW5jdGlvbkNvbnN0YW50IGV4dGVuZHMgR2VuZXJpY0tleUZuIGltcGxlbWVudHMgU2hhcmVkQ29uc3RhbnREZWZpbml0aW9uIHtcbiAgY29uc3RydWN0b3IocHJpdmF0ZSBudW1BcmdzOiBudW1iZXIpIHtcbiAgICBzdXBlcigpO1xuICB9XG5cbiAgb3ZlcnJpZGUga2V5T2YoZXhwcjogby5FeHByZXNzaW9uKTogc3RyaW5nIHtcbiAgICBpZiAoZXhwciBpbnN0YW5jZW9mIGlyLlB1cmVGdW5jdGlvblBhcmFtZXRlckV4cHIpIHtcbiAgICAgIHJldHVybiBgcGFyYW0oJHtleHByLmluZGV4fSlgO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gc3VwZXIua2V5T2YoZXhwcik7XG4gICAgfVxuICB9XG5cbiAgLy8gVE9ETzogVXNlIHRoZSBuZXcgcG9vbCBtZXRob2QgYGdldFNoYXJlZEZ1bmN0aW9uUmVmZXJlbmNlYFxuICB0b1NoYXJlZENvbnN0YW50RGVjbGFyYXRpb24oZGVjbE5hbWU6IHN0cmluZywga2V5RXhwcjogby5FeHByZXNzaW9uKTogby5TdGF0ZW1lbnQge1xuICAgIGNvbnN0IGZuUGFyYW1zOiBvLkZuUGFyYW1bXSA9IFtdO1xuICAgIGZvciAobGV0IGlkeCA9IDA7IGlkeCA8IHRoaXMubnVtQXJnczsgaWR4KyspIHtcbiAgICAgIGZuUGFyYW1zLnB1c2gobmV3IG8uRm5QYXJhbSgnYScgKyBpZHgpKTtcbiAgICB9XG5cbiAgICAvLyBXZSB3aWxsIG5ldmVyIHZpc2l0IGBpci5QdXJlRnVuY3Rpb25QYXJhbWV0ZXJFeHByYHMgdGhhdCBkb24ndCBiZWxvbmcgdG8gdXMsIGJlY2F1c2UgdGhpc1xuICAgIC8vIHRyYW5zZm9ybSBydW5zIGluc2lkZSBhbm90aGVyIHZpc2l0b3Igd2hpY2ggd2lsbCB2aXNpdCBuZXN0ZWQgcHVyZSBmdW5jdGlvbnMgYmVmb3JlIHRoaXMgb25lLlxuICAgIGNvbnN0IHJldHVybkV4cHIgPSBpci50cmFuc2Zvcm1FeHByZXNzaW9uc0luRXhwcmVzc2lvbihrZXlFeHByLCBleHByID0+IHtcbiAgICAgIGlmICghKGV4cHIgaW5zdGFuY2VvZiBpci5QdXJlRnVuY3Rpb25QYXJhbWV0ZXJFeHByKSkge1xuICAgICAgICByZXR1cm4gZXhwcjtcbiAgICAgIH1cblxuICAgICAgcmV0dXJuIG8udmFyaWFibGUoJ2EnICsgZXhwci5pbmRleCk7XG4gICAgfSwgaXIuVmlzaXRvckNvbnRleHRGbGFnLk5vbmUpO1xuXG4gICAgcmV0dXJuIG5ldyBvLkRlY2xhcmVWYXJTdG10KFxuICAgICAgICBkZWNsTmFtZSwgbmV3IG8uQXJyb3dGdW5jdGlvbkV4cHIoZm5QYXJhbXMsIHJldHVybkV4cHIpLCB1bmRlZmluZWQsIG8uU3RtdE1vZGlmaWVyLkZpbmFsKTtcbiAgfVxufVxuIl19