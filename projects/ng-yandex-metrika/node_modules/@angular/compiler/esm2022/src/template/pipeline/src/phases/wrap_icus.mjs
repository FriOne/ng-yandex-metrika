/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Wraps ICUs that do not already belong to an i18n block in a new i18n block.
 */
export function wrapI18nIcus(job) {
    for (const unit of job.units) {
        let currentI18nOp = null;
        let addedI18nId = null;
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.I18nStart:
                    currentI18nOp = op;
                    break;
                case ir.OpKind.I18nEnd:
                    currentI18nOp = null;
                    break;
                case ir.OpKind.IcuStart:
                    if (currentI18nOp === null) {
                        addedI18nId = job.allocateXrefId();
                        ir.OpList.insertBefore(ir.createI18nStartOp(addedI18nId, op.message), op);
                    }
                    break;
                case ir.OpKind.IcuEnd:
                    if (addedI18nId !== null) {
                        ir.OpList.insertAfter(ir.createI18nEndOp(addedI18nId), op);
                        addedI18nId = null;
                    }
                    break;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid3JhcF9pY3VzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvd3JhcF9pY3VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLFlBQVksQ0FBQyxHQUFtQjtJQUM5QyxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsSUFBSSxhQUFhLEdBQXdCLElBQUksQ0FBQztRQUM5QyxJQUFJLFdBQVcsR0FBbUIsSUFBSSxDQUFDO1FBQ3ZDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixRQUFRLEVBQUUsQ0FBQyxJQUFJLEVBQUU7Z0JBQ2YsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLFNBQVM7b0JBQ3RCLGFBQWEsR0FBRyxFQUFFLENBQUM7b0JBQ25CLE1BQU07Z0JBQ1IsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU87b0JBQ3BCLGFBQWEsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07Z0JBQ1IsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVE7b0JBQ3JCLElBQUksYUFBYSxLQUFLLElBQUksRUFBRTt3QkFDMUIsV0FBVyxHQUFHLEdBQUcsQ0FBQyxjQUFjLEVBQUUsQ0FBQzt3QkFDbkMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQWMsRUFBRSxDQUFDLGlCQUFpQixDQUFDLFdBQVcsRUFBRSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUM7cUJBQ3hGO29CQUNELE1BQU07Z0JBQ1IsS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLE1BQU07b0JBQ25CLElBQUksV0FBVyxLQUFLLElBQUksRUFBRTt3QkFDeEIsRUFBRSxDQUFDLE1BQU0sQ0FBQyxXQUFXLENBQWMsRUFBRSxDQUFDLGVBQWUsQ0FBQyxXQUFXLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQzt3QkFDeEUsV0FBVyxHQUFHLElBQUksQ0FBQztxQkFDcEI7b0JBQ0QsTUFBTTthQUNUO1NBQ0Y7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIFdyYXBzIElDVXMgdGhhdCBkbyBub3QgYWxyZWFkeSBiZWxvbmcgdG8gYW4gaTE4biBibG9jayBpbiBhIG5ldyBpMThuIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gd3JhcEkxOG5JY3VzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGxldCBjdXJyZW50STE4bk9wOiBpci5JMThuU3RhcnRPcHxudWxsID0gbnVsbDtcbiAgICBsZXQgYWRkZWRJMThuSWQ6IGlyLlhyZWZJZHxudWxsID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4blN0YXJ0OlxuICAgICAgICAgIGN1cnJlbnRJMThuT3AgPSBvcDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkVuZDpcbiAgICAgICAgICBjdXJyZW50STE4bk9wID0gbnVsbDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSWN1U3RhcnQ6XG4gICAgICAgICAgaWYgKGN1cnJlbnRJMThuT3AgPT09IG51bGwpIHtcbiAgICAgICAgICAgIGFkZGVkSTE4bklkID0gam9iLmFsbG9jYXRlWHJlZklkKCk7XG4gICAgICAgICAgICBpci5PcExpc3QuaW5zZXJ0QmVmb3JlPGlyLkNyZWF0ZU9wPihpci5jcmVhdGVJMThuU3RhcnRPcChhZGRlZEkxOG5JZCwgb3AubWVzc2FnZSksIG9wKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkljdUVuZDpcbiAgICAgICAgICBpZiAoYWRkZWRJMThuSWQgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGlyLk9wTGlzdC5pbnNlcnRBZnRlcjxpci5DcmVhdGVPcD4oaXIuY3JlYXRlSTE4bkVuZE9wKGFkZGVkSTE4bklkKSwgb3ApO1xuICAgICAgICAgICAgYWRkZWRJMThuSWQgPSBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==