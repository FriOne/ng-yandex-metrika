/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as o from '../../../../output/output_ast';
import { Identifiers as R3 } from '../../../../render3/r3_identifiers';
import * as ir from '../../ir';
const CHAINABLE = new Set([
    R3.attribute,
    R3.classProp,
    R3.element,
    R3.elementContainer,
    R3.elementContainerEnd,
    R3.elementContainerStart,
    R3.elementEnd,
    R3.elementStart,
    R3.hostProperty,
    R3.i18nExp,
    R3.listener,
    R3.listener,
    R3.property,
    R3.styleProp,
    R3.stylePropInterpolate1,
    R3.stylePropInterpolate2,
    R3.stylePropInterpolate3,
    R3.stylePropInterpolate4,
    R3.stylePropInterpolate5,
    R3.stylePropInterpolate6,
    R3.stylePropInterpolate7,
    R3.stylePropInterpolate8,
    R3.stylePropInterpolateV,
    R3.syntheticHostListener,
    R3.syntheticHostProperty,
    R3.templateCreate,
]);
/**
 * Post-process a reified view compilation and convert sequential calls to chainable instructions
 * into chain calls.
 *
 * For example, two `elementStart` operations in sequence:
 *
 * ```typescript
 * elementStart(0, 'div');
 * elementStart(1, 'span');
 * ```
 *
 * Can be called as a chain instead:
 *
 * ```typescript
 * elementStart(0, 'div')(1, 'span');
 * ```
 */
export function chain(job) {
    for (const unit of job.units) {
        chainOperationsInList(unit.create);
        chainOperationsInList(unit.update);
    }
}
function chainOperationsInList(opList) {
    let chain = null;
    for (const op of opList) {
        if (op.kind !== ir.OpKind.Statement || !(op.statement instanceof o.ExpressionStatement)) {
            // This type of statement isn't chainable.
            chain = null;
            continue;
        }
        if (!(op.statement.expr instanceof o.InvokeFunctionExpr) ||
            !(op.statement.expr.fn instanceof o.ExternalExpr)) {
            // This is a statement, but not an instruction-type call, so not chainable.
            chain = null;
            continue;
        }
        const instruction = op.statement.expr.fn.value;
        if (!CHAINABLE.has(instruction)) {
            // This instruction isn't chainable.
            chain = null;
            continue;
        }
        // This instruction can be chained. It can either be added on to the previous chain (if
        // compatible) or it can be the start of a new chain.
        if (chain !== null && chain.instruction === instruction) {
            // This instruction can be added onto the previous chain.
            const expression = chain.expression.callFn(op.statement.expr.args, op.statement.expr.sourceSpan, op.statement.expr.pure);
            chain.expression = expression;
            chain.op.statement = expression.toStmt();
            ir.OpList.remove(op);
        }
        else {
            // Leave this instruction alone for now, but consider it the start of a new chain.
            chain = {
                op,
                instruction,
                expression: op.statement.expr,
            };
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY2hhaW5pbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9jaGFpbmluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssQ0FBQyxNQUFNLCtCQUErQixDQUFDO0FBQ25ELE9BQU8sRUFBQyxXQUFXLElBQUksRUFBRSxFQUFDLE1BQU0sb0NBQW9DLENBQUM7QUFDckUsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHL0IsTUFBTSxTQUFTLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDeEIsRUFBRSxDQUFDLFNBQVM7SUFDWixFQUFFLENBQUMsU0FBUztJQUNaLEVBQUUsQ0FBQyxPQUFPO0lBQ1YsRUFBRSxDQUFDLGdCQUFnQjtJQUNuQixFQUFFLENBQUMsbUJBQW1CO0lBQ3RCLEVBQUUsQ0FBQyxxQkFBcUI7SUFDeEIsRUFBRSxDQUFDLFVBQVU7SUFDYixFQUFFLENBQUMsWUFBWTtJQUNmLEVBQUUsQ0FBQyxZQUFZO0lBQ2YsRUFBRSxDQUFDLE9BQU87SUFDVixFQUFFLENBQUMsUUFBUTtJQUNYLEVBQUUsQ0FBQyxRQUFRO0lBQ1gsRUFBRSxDQUFDLFFBQVE7SUFDWCxFQUFFLENBQUMsU0FBUztJQUNaLEVBQUUsQ0FBQyxxQkFBcUI7SUFDeEIsRUFBRSxDQUFDLHFCQUFxQjtJQUN4QixFQUFFLENBQUMscUJBQXFCO0lBQ3hCLEVBQUUsQ0FBQyxxQkFBcUI7SUFDeEIsRUFBRSxDQUFDLHFCQUFxQjtJQUN4QixFQUFFLENBQUMscUJBQXFCO0lBQ3hCLEVBQUUsQ0FBQyxxQkFBcUI7SUFDeEIsRUFBRSxDQUFDLHFCQUFxQjtJQUN4QixFQUFFLENBQUMscUJBQXFCO0lBQ3hCLEVBQUUsQ0FBQyxxQkFBcUI7SUFDeEIsRUFBRSxDQUFDLHFCQUFxQjtJQUN4QixFQUFFLENBQUMsY0FBYztDQUNsQixDQUFDLENBQUM7QUFFSDs7Ozs7Ozs7Ozs7Ozs7OztHQWdCRztBQUNILE1BQU0sVUFBVSxLQUFLLENBQUMsR0FBbUI7SUFDdkMsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLHFCQUFxQixDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNuQyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDcEM7QUFDSCxDQUFDO0FBRUQsU0FBUyxxQkFBcUIsQ0FBQyxNQUEwQztJQUN2RSxJQUFJLEtBQUssR0FBZSxJQUFJLENBQUM7SUFDN0IsS0FBSyxNQUFNLEVBQUUsSUFBSSxNQUFNLEVBQUU7UUFDdkIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxZQUFZLENBQUMsQ0FBQyxtQkFBbUIsQ0FBQyxFQUFFO1lBQ3ZGLDBDQUEwQztZQUMxQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2IsU0FBUztTQUNWO1FBQ0QsSUFBSSxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLFlBQVksQ0FBQyxDQUFDLGtCQUFrQixDQUFDO1lBQ3BELENBQUMsQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxFQUFFLFlBQVksQ0FBQyxDQUFDLFlBQVksQ0FBQyxFQUFFO1lBQ3JELDJFQUEyRTtZQUMzRSxLQUFLLEdBQUcsSUFBSSxDQUFDO1lBQ2IsU0FBUztTQUNWO1FBRUQsTUFBTSxXQUFXLEdBQUcsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLEtBQUssQ0FBQztRQUMvQyxJQUFJLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsRUFBRTtZQUMvQixvQ0FBb0M7WUFDcEMsS0FBSyxHQUFHLElBQUksQ0FBQztZQUNiLFNBQVM7U0FDVjtRQUVELHVGQUF1RjtRQUN2RixxREFBcUQ7UUFDckQsSUFBSSxLQUFLLEtBQUssSUFBSSxJQUFJLEtBQUssQ0FBQyxXQUFXLEtBQUssV0FBVyxFQUFFO1lBQ3ZELHlEQUF5RDtZQUN6RCxNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FDdEMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLFVBQVUsRUFBRSxFQUFFLENBQUMsU0FBUyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNsRixLQUFLLENBQUMsVUFBVSxHQUFHLFVBQVUsQ0FBQztZQUM5QixLQUFLLENBQUMsRUFBRSxDQUFDLFNBQVMsR0FBRyxVQUFVLENBQUMsTUFBTSxFQUFFLENBQUM7WUFDekMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNLENBQUMsRUFBb0MsQ0FBQyxDQUFDO1NBQ3hEO2FBQU07WUFDTCxrRkFBa0Y7WUFDbEYsS0FBSyxHQUFHO2dCQUNOLEVBQUU7Z0JBQ0YsV0FBVztnQkFDWCxVQUFVLEVBQUUsRUFBRSxDQUFDLFNBQVMsQ0FBQyxJQUFJO2FBQzlCLENBQUM7U0FDSDtLQUNGO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCB7SWRlbnRpZmllcnMgYXMgUjN9IGZyb20gJy4uLy4uLy4uLy4uL3JlbmRlcjMvcjNfaWRlbnRpZmllcnMnO1xuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG5jb25zdCBDSEFJTkFCTEUgPSBuZXcgU2V0KFtcbiAgUjMuYXR0cmlidXRlLFxuICBSMy5jbGFzc1Byb3AsXG4gIFIzLmVsZW1lbnQsXG4gIFIzLmVsZW1lbnRDb250YWluZXIsXG4gIFIzLmVsZW1lbnRDb250YWluZXJFbmQsXG4gIFIzLmVsZW1lbnRDb250YWluZXJTdGFydCxcbiAgUjMuZWxlbWVudEVuZCxcbiAgUjMuZWxlbWVudFN0YXJ0LFxuICBSMy5ob3N0UHJvcGVydHksXG4gIFIzLmkxOG5FeHAsXG4gIFIzLmxpc3RlbmVyLFxuICBSMy5saXN0ZW5lcixcbiAgUjMucHJvcGVydHksXG4gIFIzLnN0eWxlUHJvcCxcbiAgUjMuc3R5bGVQcm9wSW50ZXJwb2xhdGUxLFxuICBSMy5zdHlsZVByb3BJbnRlcnBvbGF0ZTIsXG4gIFIzLnN0eWxlUHJvcEludGVycG9sYXRlMyxcbiAgUjMuc3R5bGVQcm9wSW50ZXJwb2xhdGU0LFxuICBSMy5zdHlsZVByb3BJbnRlcnBvbGF0ZTUsXG4gIFIzLnN0eWxlUHJvcEludGVycG9sYXRlNixcbiAgUjMuc3R5bGVQcm9wSW50ZXJwb2xhdGU3LFxuICBSMy5zdHlsZVByb3BJbnRlcnBvbGF0ZTgsXG4gIFIzLnN0eWxlUHJvcEludGVycG9sYXRlVixcbiAgUjMuc3ludGhldGljSG9zdExpc3RlbmVyLFxuICBSMy5zeW50aGV0aWNIb3N0UHJvcGVydHksXG4gIFIzLnRlbXBsYXRlQ3JlYXRlLFxuXSk7XG5cbi8qKlxuICogUG9zdC1wcm9jZXNzIGEgcmVpZmllZCB2aWV3IGNvbXBpbGF0aW9uIGFuZCBjb252ZXJ0IHNlcXVlbnRpYWwgY2FsbHMgdG8gY2hhaW5hYmxlIGluc3RydWN0aW9uc1xuICogaW50byBjaGFpbiBjYWxscy5cbiAqXG4gKiBGb3IgZXhhbXBsZSwgdHdvIGBlbGVtZW50U3RhcnRgIG9wZXJhdGlvbnMgaW4gc2VxdWVuY2U6XG4gKlxuICogYGBgdHlwZXNjcmlwdFxuICogZWxlbWVudFN0YXJ0KDAsICdkaXYnKTtcbiAqIGVsZW1lbnRTdGFydCgxLCAnc3BhbicpO1xuICogYGBgXG4gKlxuICogQ2FuIGJlIGNhbGxlZCBhcyBhIGNoYWluIGluc3RlYWQ6XG4gKlxuICogYGBgdHlwZXNjcmlwdFxuICogZWxlbWVudFN0YXJ0KDAsICdkaXYnKSgxLCAnc3BhbicpO1xuICogYGBgXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGFpbihqb2I6IENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBjaGFpbk9wZXJhdGlvbnNJbkxpc3QodW5pdC5jcmVhdGUpO1xuICAgIGNoYWluT3BlcmF0aW9uc0luTGlzdCh1bml0LnVwZGF0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY2hhaW5PcGVyYXRpb25zSW5MaXN0KG9wTGlzdDogaXIuT3BMaXN0PGlyLkNyZWF0ZU9wfGlyLlVwZGF0ZU9wPik6IHZvaWQge1xuICBsZXQgY2hhaW46IENoYWlufG51bGwgPSBudWxsO1xuICBmb3IgKGNvbnN0IG9wIG9mIG9wTGlzdCkge1xuICAgIGlmIChvcC5raW5kICE9PSBpci5PcEtpbmQuU3RhdGVtZW50IHx8ICEob3Auc3RhdGVtZW50IGluc3RhbmNlb2Ygby5FeHByZXNzaW9uU3RhdGVtZW50KSkge1xuICAgICAgLy8gVGhpcyB0eXBlIG9mIHN0YXRlbWVudCBpc24ndCBjaGFpbmFibGUuXG4gICAgICBjaGFpbiA9IG51bGw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG4gICAgaWYgKCEob3Auc3RhdGVtZW50LmV4cHIgaW5zdGFuY2VvZiBvLkludm9rZUZ1bmN0aW9uRXhwcikgfHxcbiAgICAgICAgIShvcC5zdGF0ZW1lbnQuZXhwci5mbiBpbnN0YW5jZW9mIG8uRXh0ZXJuYWxFeHByKSkge1xuICAgICAgLy8gVGhpcyBpcyBhIHN0YXRlbWVudCwgYnV0IG5vdCBhbiBpbnN0cnVjdGlvbi10eXBlIGNhbGwsIHNvIG5vdCBjaGFpbmFibGUuXG4gICAgICBjaGFpbiA9IG51bGw7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBjb25zdCBpbnN0cnVjdGlvbiA9IG9wLnN0YXRlbWVudC5leHByLmZuLnZhbHVlO1xuICAgIGlmICghQ0hBSU5BQkxFLmhhcyhpbnN0cnVjdGlvbikpIHtcbiAgICAgIC8vIFRoaXMgaW5zdHJ1Y3Rpb24gaXNuJ3QgY2hhaW5hYmxlLlxuICAgICAgY2hhaW4gPSBudWxsO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gVGhpcyBpbnN0cnVjdGlvbiBjYW4gYmUgY2hhaW5lZC4gSXQgY2FuIGVpdGhlciBiZSBhZGRlZCBvbiB0byB0aGUgcHJldmlvdXMgY2hhaW4gKGlmXG4gICAgLy8gY29tcGF0aWJsZSkgb3IgaXQgY2FuIGJlIHRoZSBzdGFydCBvZiBhIG5ldyBjaGFpbi5cbiAgICBpZiAoY2hhaW4gIT09IG51bGwgJiYgY2hhaW4uaW5zdHJ1Y3Rpb24gPT09IGluc3RydWN0aW9uKSB7XG4gICAgICAvLyBUaGlzIGluc3RydWN0aW9uIGNhbiBiZSBhZGRlZCBvbnRvIHRoZSBwcmV2aW91cyBjaGFpbi5cbiAgICAgIGNvbnN0IGV4cHJlc3Npb24gPSBjaGFpbi5leHByZXNzaW9uLmNhbGxGbihcbiAgICAgICAgICBvcC5zdGF0ZW1lbnQuZXhwci5hcmdzLCBvcC5zdGF0ZW1lbnQuZXhwci5zb3VyY2VTcGFuLCBvcC5zdGF0ZW1lbnQuZXhwci5wdXJlKTtcbiAgICAgIGNoYWluLmV4cHJlc3Npb24gPSBleHByZXNzaW9uO1xuICAgICAgY2hhaW4ub3Auc3RhdGVtZW50ID0gZXhwcmVzc2lvbi50b1N0bXQoKTtcbiAgICAgIGlyLk9wTGlzdC5yZW1vdmUob3AgYXMgaXIuT3A8aXIuQ3JlYXRlT3B8aXIuVXBkYXRlT3A+KTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gTGVhdmUgdGhpcyBpbnN0cnVjdGlvbiBhbG9uZSBmb3Igbm93LCBidXQgY29uc2lkZXIgaXQgdGhlIHN0YXJ0IG9mIGEgbmV3IGNoYWluLlxuICAgICAgY2hhaW4gPSB7XG4gICAgICAgIG9wLFxuICAgICAgICBpbnN0cnVjdGlvbixcbiAgICAgICAgZXhwcmVzc2lvbjogb3Auc3RhdGVtZW50LmV4cHIsXG4gICAgICB9O1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFN0cnVjdHVyZSByZXByZXNlbnRpbmcgYW4gaW4tcHJvZ3Jlc3MgY2hhaW4uXG4gKi9cbmludGVyZmFjZSBDaGFpbiB7XG4gIC8qKlxuICAgKiBUaGUgc3RhdGVtZW50IHdoaWNoIGhvbGRzIHRoZSBlbnRpcmUgY2hhaW4uXG4gICAqL1xuICBvcDogaXIuU3RhdGVtZW50T3A8aXIuQ3JlYXRlT3B8aXIuVXBkYXRlT3A+O1xuXG4gIC8qKlxuICAgKiBUaGUgZXhwcmVzc2lvbiByZXByZXNlbnRpbmcgdGhlIHdob2xlIGN1cnJlbnQgY2hhaW5lZCBjYWxsLlxuICAgKlxuICAgKiBUaGlzIHNob3VsZCBiZSB0aGUgc2FtZSBhcyBgb3Auc3RhdGVtZW50LmV4cHJlc3Npb25gLCBidXQgaXMgZXh0cmFjdGVkIGhlcmUgZm9yIGNvbnZlbmllbmNlXG4gICAqIHNpbmNlIHRoZSBgb3BgIHR5cGUgZG9lc24ndCBjYXB0dXJlIHRoZSBmYWN0IHRoYXQgYG9wLnN0YXRlbWVudGAgaXMgYW4gYG8uRXhwcmVzc2lvblN0YXRlbWVudGAuXG4gICAqL1xuICBleHByZXNzaW9uOiBvLkV4cHJlc3Npb247XG5cbiAgLyoqXG4gICAqIFRoZSBpbnN0cnVjdGlvbiB0aGF0IGlzIGJlaW5nIGNoYWluZWQuXG4gICAqL1xuICBpbnN0cnVjdGlvbjogby5FeHRlcm5hbFJlZmVyZW5jZTtcbn1cbiJdfQ==