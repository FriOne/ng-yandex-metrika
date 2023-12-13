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
 * Find any function calls to `$any`, excluding `this.$any`, and delete them, since they have no
 * runtime effects.
 */
export function deleteAnyCasts(job) {
    for (const unit of job.units) {
        for (const op of unit.ops()) {
            ir.transformExpressionsInOp(op, removeAnys, ir.VisitorContextFlag.None);
        }
    }
}
function removeAnys(e) {
    if (e instanceof o.InvokeFunctionExpr && e.fn instanceof ir.LexicalReadExpr &&
        e.fn.name === '$any') {
        if (e.args.length !== 1) {
            throw new Error('The $any builtin function expects exactly one argument.');
        }
        return e.args[0];
    }
    return e;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYW55X2Nhc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9hbnlfY2FzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssQ0FBQyxNQUFNLCtCQUErQixDQUFDO0FBQ25ELE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COzs7R0FHRztBQUNILE1BQU0sVUFBVSxjQUFjLENBQUMsR0FBbUI7SUFDaEQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQzNCLEVBQUUsQ0FBQyx3QkFBd0IsQ0FBQyxFQUFFLEVBQUUsVUFBVSxFQUFFLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxJQUFJLENBQUMsQ0FBQztTQUN6RTtLQUNGO0FBQ0gsQ0FBQztBQUVELFNBQVMsVUFBVSxDQUFDLENBQWU7SUFDakMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDLGtCQUFrQixJQUFJLENBQUMsQ0FBQyxFQUFFLFlBQVksRUFBRSxDQUFDLGVBQWU7UUFDdkUsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEtBQUssTUFBTSxFQUFFO1FBQ3hCLElBQUksQ0FBQyxDQUFDLElBQUksQ0FBQyxNQUFNLEtBQUssQ0FBQyxFQUFFO1lBQ3ZCLE1BQU0sSUFBSSxLQUFLLENBQUMseURBQXlELENBQUMsQ0FBQztTQUM1RTtRQUNELE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztLQUNsQjtJQUNELE9BQU8sQ0FBQyxDQUFDO0FBQ1gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBGaW5kIGFueSBmdW5jdGlvbiBjYWxscyB0byBgJGFueWAsIGV4Y2x1ZGluZyBgdGhpcy4kYW55YCwgYW5kIGRlbGV0ZSB0aGVtLCBzaW5jZSB0aGV5IGhhdmUgbm9cbiAqIHJ1bnRpbWUgZWZmZWN0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGRlbGV0ZUFueUNhc3RzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5vcHMoKSkge1xuICAgICAgaXIudHJhbnNmb3JtRXhwcmVzc2lvbnNJbk9wKG9wLCByZW1vdmVBbnlzLCBpci5WaXNpdG9yQ29udGV4dEZsYWcuTm9uZSk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHJlbW92ZUFueXMoZTogby5FeHByZXNzaW9uKTogby5FeHByZXNzaW9uIHtcbiAgaWYgKGUgaW5zdGFuY2VvZiBvLkludm9rZUZ1bmN0aW9uRXhwciAmJiBlLmZuIGluc3RhbmNlb2YgaXIuTGV4aWNhbFJlYWRFeHByICYmXG4gICAgICBlLmZuLm5hbWUgPT09ICckYW55Jykge1xuICAgIGlmIChlLmFyZ3MubGVuZ3RoICE9PSAxKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ1RoZSAkYW55IGJ1aWx0aW4gZnVuY3Rpb24gZXhwZWN0cyBleGFjdGx5IG9uZSBhcmd1bWVudC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIGUuYXJnc1swXTtcbiAgfVxuICByZXR1cm4gZTtcbn1cbiJdfQ==