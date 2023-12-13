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
 * Any variable inside a listener with the name `$event` will be transformed into a output lexical
 * read immediately, and does not participate in any of the normal logic for handling variables.
 */
export function resolveDollarEvent(job) {
    for (const unit of job.units) {
        transformDollarEvent(unit, unit.create);
        transformDollarEvent(unit, unit.update);
    }
}
function transformDollarEvent(unit, ops) {
    for (const op of ops) {
        if (op.kind === ir.OpKind.Listener) {
            ir.transformExpressionsInOp(op, (expr) => {
                if (expr instanceof ir.LexicalReadExpr && expr.name === '$event') {
                    op.consumesDollarEvent = true;
                    return new o.ReadVarExpr(expr.name);
                }
                return expr;
            }, ir.VisitorContextFlag.InChildOperation);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9kb2xsYXJfZXZlbnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9yZXNvbHZlX2RvbGxhcl9ldmVudC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssQ0FBQyxNQUFNLCtCQUErQixDQUFDO0FBQ25ELE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COzs7R0FHRztBQUNILE1BQU0sVUFBVSxrQkFBa0IsQ0FBQyxHQUFtQjtJQUNwRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsb0JBQW9CLENBQUMsSUFBSSxFQUFFLElBQUksQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUN4QyxvQkFBb0IsQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLE1BQU0sQ0FBQyxDQUFDO0tBQ3pDO0FBQ0gsQ0FBQztBQUVELFNBQVMsb0JBQW9CLENBQ3pCLElBQXFCLEVBQUUsR0FBa0Q7SUFDM0UsS0FBSyxNQUFNLEVBQUUsSUFBSSxHQUFHLEVBQUU7UUFDcEIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxFQUFFO1lBQ2xDLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtnQkFDdkMsSUFBSSxJQUFJLFlBQVksRUFBRSxDQUFDLGVBQWUsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFFBQVEsRUFBRTtvQkFDaEUsRUFBRSxDQUFDLG1CQUFtQixHQUFHLElBQUksQ0FBQztvQkFDOUIsT0FBTyxJQUFJLENBQUMsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUNyQztnQkFDRCxPQUFPLElBQUksQ0FBQztZQUNkLENBQUMsRUFBRSxFQUFFLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztTQUM1QztLQUNGO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYiwgQ29tcGlsYXRpb25Vbml0fSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5cbi8qKlxuICogQW55IHZhcmlhYmxlIGluc2lkZSBhIGxpc3RlbmVyIHdpdGggdGhlIG5hbWUgYCRldmVudGAgd2lsbCBiZSB0cmFuc2Zvcm1lZCBpbnRvIGEgb3V0cHV0IGxleGljYWxcbiAqIHJlYWQgaW1tZWRpYXRlbHksIGFuZCBkb2VzIG5vdCBwYXJ0aWNpcGF0ZSBpbiBhbnkgb2YgdGhlIG5vcm1hbCBsb2dpYyBmb3IgaGFuZGxpbmcgdmFyaWFibGVzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZURvbGxhckV2ZW50KGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIHRyYW5zZm9ybURvbGxhckV2ZW50KHVuaXQsIHVuaXQuY3JlYXRlKTtcbiAgICB0cmFuc2Zvcm1Eb2xsYXJFdmVudCh1bml0LCB1bml0LnVwZGF0ZSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdHJhbnNmb3JtRG9sbGFyRXZlbnQoXG4gICAgdW5pdDogQ29tcGlsYXRpb25Vbml0LCBvcHM6IGlyLk9wTGlzdDxpci5DcmVhdGVPcD58aXIuT3BMaXN0PGlyLlVwZGF0ZU9wPik6IHZvaWQge1xuICBmb3IgKGNvbnN0IG9wIG9mIG9wcykge1xuICAgIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuTGlzdGVuZXIpIHtcbiAgICAgIGlyLnRyYW5zZm9ybUV4cHJlc3Npb25zSW5PcChvcCwgKGV4cHIpID0+IHtcbiAgICAgICAgaWYgKGV4cHIgaW5zdGFuY2VvZiBpci5MZXhpY2FsUmVhZEV4cHIgJiYgZXhwci5uYW1lID09PSAnJGV2ZW50Jykge1xuICAgICAgICAgIG9wLmNvbnN1bWVzRG9sbGFyRXZlbnQgPSB0cnVlO1xuICAgICAgICAgIHJldHVybiBuZXcgby5SZWFkVmFyRXhwcihleHByLm5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiBleHByO1xuICAgICAgfSwgaXIuVmlzaXRvckNvbnRleHRGbGFnLkluQ2hpbGRPcGVyYXRpb24pO1xuICAgIH1cbiAgfVxufVxuIl19