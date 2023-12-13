/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Removes text nodes within i18n blocks since they are already hardcoded into the i18n message.
 * Also, replaces interpolations on these text nodes with i18n expressions of the non-text portions,
 * which will be applied later.
 */
export function convertI18nText(job) {
    for (const unit of job.units) {
        // Remove all text nodes within i18n blocks, their content is already captured in the i18n
        // message.
        let currentI18n = null;
        let currentIcu = null;
        const textNodeI18nBlocks = new Map();
        const textNodeIcus = new Map();
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.I18nStart:
                    if (op.context === null) {
                        throw Error('I18n op should have its context set.');
                    }
                    currentI18n = op;
                    break;
                case ir.OpKind.I18nEnd:
                    currentI18n = null;
                    break;
                case ir.OpKind.IcuStart:
                    if (op.context === null) {
                        throw Error('Icu op should have its context set.');
                    }
                    currentIcu = op;
                    break;
                case ir.OpKind.IcuEnd:
                    currentIcu = null;
                    break;
                case ir.OpKind.Text:
                    if (currentI18n !== null) {
                        textNodeI18nBlocks.set(op.xref, currentI18n);
                        textNodeIcus.set(op.xref, currentIcu);
                        ir.OpList.remove(op);
                    }
                    break;
            }
        }
        // Update any interpolations to the removed text, and instead represent them as a series of i18n
        // expressions that we then apply.
        for (const op of unit.update) {
            switch (op.kind) {
                case ir.OpKind.InterpolateText:
                    if (!textNodeI18nBlocks.has(op.target)) {
                        continue;
                    }
                    const i18nOp = textNodeI18nBlocks.get(op.target);
                    const icuOp = textNodeIcus.get(op.target);
                    const contextId = icuOp ? icuOp.context : i18nOp.context;
                    const resolutionTime = icuOp ? ir.I18nParamResolutionTime.Postproccessing :
                        ir.I18nParamResolutionTime.Creation;
                    const ops = [];
                    for (let i = 0; i < op.interpolation.expressions.length; i++) {
                        const expr = op.interpolation.expressions[i];
                        // For now, this i18nExpression depends on the slot context of the enclosing i18n block.
                        // Later, we will modify this, and advance to a different point.
                        ops.push(ir.createI18nExpressionOp(contextId, i18nOp.xref, i18nOp.xref, i18nOp.handle, expr, op.interpolation.i18nPlaceholders[i], resolutionTime, ir.I18nExpressionFor.I18nText, '', expr.sourceSpan ?? op.sourceSpan));
                    }
                    ir.OpList.replaceWithMany(op, ops);
                    break;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bl90ZXh0X2V4dHJhY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9pMThuX3RleHRfZXh0cmFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQjs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FBQyxHQUFtQjtJQUNqRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsMEZBQTBGO1FBQzFGLFdBQVc7UUFDWCxJQUFJLFdBQVcsR0FBd0IsSUFBSSxDQUFDO1FBQzVDLElBQUksVUFBVSxHQUF1QixJQUFJLENBQUM7UUFDMUMsTUFBTSxrQkFBa0IsR0FBRyxJQUFJLEdBQUcsRUFBNkIsQ0FBQztRQUNoRSxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBaUMsQ0FBQztRQUM5RCxLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFO2dCQUNmLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTO29CQUN0QixJQUFJLEVBQUUsQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFO3dCQUN2QixNQUFNLEtBQUssQ0FBQyxzQ0FBc0MsQ0FBQyxDQUFDO3FCQUNyRDtvQkFDRCxXQUFXLEdBQUcsRUFBRSxDQUFDO29CQUNqQixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxPQUFPO29CQUNwQixXQUFXLEdBQUcsSUFBSSxDQUFDO29CQUNuQixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxRQUFRO29CQUNyQixJQUFJLEVBQUUsQ0FBQyxPQUFPLEtBQUssSUFBSSxFQUFFO3dCQUN2QixNQUFNLEtBQUssQ0FBQyxxQ0FBcUMsQ0FBQyxDQUFDO3FCQUNwRDtvQkFDRCxVQUFVLEdBQUcsRUFBRSxDQUFDO29CQUNoQixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxNQUFNO29CQUNuQixVQUFVLEdBQUcsSUFBSSxDQUFDO29CQUNsQixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJO29CQUNqQixJQUFJLFdBQVcsS0FBSyxJQUFJLEVBQUU7d0JBQ3hCLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLFdBQVcsQ0FBQyxDQUFDO3dCQUM3QyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsVUFBVSxDQUFDLENBQUM7d0JBQ3RDLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFjLEVBQUUsQ0FBQyxDQUFDO3FCQUNuQztvQkFDRCxNQUFNO2FBQ1Q7U0FDRjtRQUVELGdHQUFnRztRQUNoRyxrQ0FBa0M7UUFDbEMsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsZUFBZTtvQkFDNUIsSUFBSSxDQUFDLGtCQUFrQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLEVBQUU7d0JBQ3RDLFNBQVM7cUJBQ1Y7b0JBRUQsTUFBTSxNQUFNLEdBQUcsa0JBQWtCLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUUsQ0FBQztvQkFDbEQsTUFBTSxLQUFLLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQzFDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQztvQkFDekQsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsdUJBQXVCLENBQUMsZUFBZSxDQUFDLENBQUM7d0JBQzVDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxRQUFRLENBQUM7b0JBQ25FLE1BQU0sR0FBRyxHQUFrQixFQUFFLENBQUM7b0JBQzlCLEtBQUssSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsR0FBRyxFQUFFLENBQUMsYUFBYSxDQUFDLFdBQVcsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxFQUFFLEVBQUU7d0JBQzVELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxhQUFhLENBQUMsV0FBVyxDQUFDLENBQUMsQ0FBQyxDQUFDO3dCQUM3Qyx3RkFBd0Y7d0JBQ3hGLGdFQUFnRTt3QkFDaEUsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsc0JBQXNCLENBQzlCLFNBQVUsRUFBRSxNQUFNLENBQUMsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLEVBQUUsTUFBTSxDQUFDLE1BQU0sRUFBRSxJQUFJLEVBQ3pELEVBQUUsQ0FBQyxhQUFhLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxRQUFRLEVBQ25GLEVBQUUsRUFBRSxJQUFJLENBQUMsVUFBVSxJQUFJLEVBQUUsQ0FBQyxVQUFVLENBQUMsQ0FBQyxDQUFDO3FCQUM1QztvQkFDRCxFQUFFLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxFQUFpQixFQUFFLEdBQUcsQ0FBQyxDQUFDO29CQUNsRCxNQUFNO2FBQ1Q7U0FDRjtLQUNGO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5pbXBvcnQge0NvbXBpbGF0aW9uSm9ifSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5cbi8qKlxuICogUmVtb3ZlcyB0ZXh0IG5vZGVzIHdpdGhpbiBpMThuIGJsb2NrcyBzaW5jZSB0aGV5IGFyZSBhbHJlYWR5IGhhcmRjb2RlZCBpbnRvIHRoZSBpMThuIG1lc3NhZ2UuXG4gKiBBbHNvLCByZXBsYWNlcyBpbnRlcnBvbGF0aW9ucyBvbiB0aGVzZSB0ZXh0IG5vZGVzIHdpdGggaTE4biBleHByZXNzaW9ucyBvZiB0aGUgbm9uLXRleHQgcG9ydGlvbnMsXG4gKiB3aGljaCB3aWxsIGJlIGFwcGxpZWQgbGF0ZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0STE4blRleHQoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgLy8gUmVtb3ZlIGFsbCB0ZXh0IG5vZGVzIHdpdGhpbiBpMThuIGJsb2NrcywgdGhlaXIgY29udGVudCBpcyBhbHJlYWR5IGNhcHR1cmVkIGluIHRoZSBpMThuXG4gICAgLy8gbWVzc2FnZS5cbiAgICBsZXQgY3VycmVudEkxOG46IGlyLkkxOG5TdGFydE9wfG51bGwgPSBudWxsO1xuICAgIGxldCBjdXJyZW50SWN1OiBpci5JY3VTdGFydE9wfG51bGwgPSBudWxsO1xuICAgIGNvbnN0IHRleHROb2RlSTE4bkJsb2NrcyA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5JMThuU3RhcnRPcD4oKTtcbiAgICBjb25zdCB0ZXh0Tm9kZUljdXMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuSWN1U3RhcnRPcHxudWxsPigpO1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5jcmVhdGUpIHtcbiAgICAgIHN3aXRjaCAob3Aua2luZCkge1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5JMThuU3RhcnQ6XG4gICAgICAgICAgaWYgKG9wLmNvbnRleHQgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdJMThuIG9wIHNob3VsZCBoYXZlIGl0cyBjb250ZXh0IHNldC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3VycmVudEkxOG4gPSBvcDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkVuZDpcbiAgICAgICAgICBjdXJyZW50STE4biA9IG51bGw7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkljdVN0YXJ0OlxuICAgICAgICAgIGlmIChvcC5jb250ZXh0ID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcignSWN1IG9wIHNob3VsZCBoYXZlIGl0cyBjb250ZXh0IHNldC4nKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY3VycmVudEljdSA9IG9wO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5JY3VFbmQ6XG4gICAgICAgICAgY3VycmVudEljdSA9IG51bGw7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLlRleHQ6XG4gICAgICAgICAgaWYgKGN1cnJlbnRJMThuICE9PSBudWxsKSB7XG4gICAgICAgICAgICB0ZXh0Tm9kZUkxOG5CbG9ja3Muc2V0KG9wLnhyZWYsIGN1cnJlbnRJMThuKTtcbiAgICAgICAgICAgIHRleHROb2RlSWN1cy5zZXQob3AueHJlZiwgY3VycmVudEljdSk7XG4gICAgICAgICAgICBpci5PcExpc3QucmVtb3ZlPGlyLkNyZWF0ZU9wPihvcCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIFVwZGF0ZSBhbnkgaW50ZXJwb2xhdGlvbnMgdG8gdGhlIHJlbW92ZWQgdGV4dCwgYW5kIGluc3RlYWQgcmVwcmVzZW50IHRoZW0gYXMgYSBzZXJpZXMgb2YgaTE4blxuICAgIC8vIGV4cHJlc3Npb25zIHRoYXQgd2UgdGhlbiBhcHBseS5cbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQudXBkYXRlKSB7XG4gICAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSW50ZXJwb2xhdGVUZXh0OlxuICAgICAgICAgIGlmICghdGV4dE5vZGVJMThuQmxvY2tzLmhhcyhvcC50YXJnZXQpKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBjb25zdCBpMThuT3AgPSB0ZXh0Tm9kZUkxOG5CbG9ja3MuZ2V0KG9wLnRhcmdldCkhO1xuICAgICAgICAgIGNvbnN0IGljdU9wID0gdGV4dE5vZGVJY3VzLmdldChvcC50YXJnZXQpO1xuICAgICAgICAgIGNvbnN0IGNvbnRleHRJZCA9IGljdU9wID8gaWN1T3AuY29udGV4dCA6IGkxOG5PcC5jb250ZXh0O1xuICAgICAgICAgIGNvbnN0IHJlc29sdXRpb25UaW1lID0gaWN1T3AgPyBpci5JMThuUGFyYW1SZXNvbHV0aW9uVGltZS5Qb3N0cHJvY2Nlc3NpbmcgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpci5JMThuUGFyYW1SZXNvbHV0aW9uVGltZS5DcmVhdGlvbjtcbiAgICAgICAgICBjb25zdCBvcHM6IGlyLlVwZGF0ZU9wW10gPSBbXTtcbiAgICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IG9wLmludGVycG9sYXRpb24uZXhwcmVzc2lvbnMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGNvbnN0IGV4cHIgPSBvcC5pbnRlcnBvbGF0aW9uLmV4cHJlc3Npb25zW2ldO1xuICAgICAgICAgICAgLy8gRm9yIG5vdywgdGhpcyBpMThuRXhwcmVzc2lvbiBkZXBlbmRzIG9uIHRoZSBzbG90IGNvbnRleHQgb2YgdGhlIGVuY2xvc2luZyBpMThuIGJsb2NrLlxuICAgICAgICAgICAgLy8gTGF0ZXIsIHdlIHdpbGwgbW9kaWZ5IHRoaXMsIGFuZCBhZHZhbmNlIHRvIGEgZGlmZmVyZW50IHBvaW50LlxuICAgICAgICAgICAgb3BzLnB1c2goaXIuY3JlYXRlSTE4bkV4cHJlc3Npb25PcChcbiAgICAgICAgICAgICAgICBjb250ZXh0SWQhLCBpMThuT3AueHJlZiwgaTE4bk9wLnhyZWYsIGkxOG5PcC5oYW5kbGUsIGV4cHIsXG4gICAgICAgICAgICAgICAgb3AuaW50ZXJwb2xhdGlvbi5pMThuUGxhY2Vob2xkZXJzW2ldLCByZXNvbHV0aW9uVGltZSwgaXIuSTE4bkV4cHJlc3Npb25Gb3IuSTE4blRleHQsXG4gICAgICAgICAgICAgICAgJycsIGV4cHIuc291cmNlU3BhbiA/PyBvcC5zb3VyY2VTcGFuKSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlyLk9wTGlzdC5yZXBsYWNlV2l0aE1hbnkob3AgYXMgaXIuVXBkYXRlT3AsIG9wcyk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=