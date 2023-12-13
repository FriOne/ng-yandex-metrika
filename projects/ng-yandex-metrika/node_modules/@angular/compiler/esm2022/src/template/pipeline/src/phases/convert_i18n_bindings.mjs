/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Some binding instructions in the update block may actually correspond to i18n bindings. In that
 * case, they should be replaced with i18nExp instructions for the dynamic portions.
 */
export function convertI18nBindings(job) {
    const i18nAttributesByElem = new Map();
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.I18nAttributes) {
                i18nAttributesByElem.set(op.target, op);
            }
        }
        for (const op of unit.update) {
            switch (op.kind) {
                case ir.OpKind.Property:
                case ir.OpKind.Attribute:
                    if (op.i18nContext === null) {
                        continue;
                    }
                    if (!(op.expression instanceof ir.Interpolation)) {
                        continue;
                    }
                    const i18nAttributesForElem = i18nAttributesByElem.get(op.target);
                    if (i18nAttributesForElem === undefined) {
                        throw new Error('AssertionError: An i18n attribute binding instruction requires the owning element to have an I18nAttributes create instruction');
                    }
                    if (i18nAttributesForElem.target !== op.target) {
                        throw new Error('AssertionError: Expected i18nAttributes target element to match binding target element');
                    }
                    const ops = [];
                    for (let i = 0; i < op.expression.expressions.length; i++) {
                        const expr = op.expression.expressions[i];
                        if (op.expression.i18nPlaceholders.length !== op.expression.expressions.length) {
                            throw new Error(`AssertionError: An i18n attribute binding instruction requires the same number of expressions and placeholders, but found ${op.expression.i18nPlaceholders.length} placeholders and ${op.expression.expressions.length} expressions`);
                        }
                        ops.push(ir.createI18nExpressionOp(op.i18nContext, i18nAttributesForElem.target, i18nAttributesForElem.xref, i18nAttributesForElem.handle, expr, op.expression.i18nPlaceholders[i], ir.I18nParamResolutionTime.Creation, ir.I18nExpressionFor.I18nAttribute, op.name, op.sourceSpan));
                    }
                    ir.OpList.replaceWithMany(op, ops);
                    break;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29udmVydF9pMThuX2JpbmRpbmdzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvY29udmVydF9pMThuX2JpbmRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COzs7R0FHRztBQUNILE1BQU0sVUFBVSxtQkFBbUIsQ0FBQyxHQUFtQjtJQUNyRCxNQUFNLG9CQUFvQixHQUF3QyxJQUFJLEdBQUcsRUFBRSxDQUFDO0lBQzVFLEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFO2dCQUN4QyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sRUFBRSxFQUFFLENBQUMsQ0FBQzthQUN6QztTQUNGO1FBRUQsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUSxDQUFDO2dCQUN4QixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDdEIsSUFBSSxFQUFFLENBQUMsV0FBVyxLQUFLLElBQUksRUFBRTt3QkFDM0IsU0FBUztxQkFDVjtvQkFFRCxJQUFJLENBQUMsQ0FBQyxFQUFFLENBQUMsVUFBVSxZQUFZLEVBQUUsQ0FBQyxhQUFhLENBQUMsRUFBRTt3QkFDaEQsU0FBUztxQkFDVjtvQkFFRCxNQUFNLHFCQUFxQixHQUFHLG9CQUFvQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUM7b0JBQ2xFLElBQUkscUJBQXFCLEtBQUssU0FBUyxFQUFFO3dCQUN2QyxNQUFNLElBQUksS0FBSyxDQUNYLGdJQUFnSSxDQUFDLENBQUM7cUJBQ3ZJO29CQUVELElBQUkscUJBQXFCLENBQUMsTUFBTSxLQUFLLEVBQUUsQ0FBQyxNQUFNLEVBQUU7d0JBQzlDLE1BQU0sSUFBSSxLQUFLLENBQ1gsd0ZBQXdGLENBQUMsQ0FBQztxQkFDL0Y7b0JBRUQsTUFBTSxHQUFHLEdBQWtCLEVBQUUsQ0FBQztvQkFDOUIsS0FBSyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxHQUFHLEVBQUUsQ0FBQyxVQUFVLENBQUMsV0FBVyxDQUFDLE1BQU0sRUFBRSxDQUFDLEVBQUUsRUFBRTt3QkFDekQsTUFBTSxJQUFJLEdBQUcsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsQ0FBQyxDQUFDLENBQUM7d0JBRTFDLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxNQUFNLEtBQUssRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxFQUFFOzRCQUM5RSxNQUFNLElBQUksS0FBSyxDQUNYLDZIQUNJLEVBQUUsQ0FBQyxVQUFVLENBQUMsZ0JBQWdCLENBQUMsTUFBTSxxQkFDckMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxXQUFXLENBQUMsTUFBTSxjQUFjLENBQUMsQ0FBQzt5QkFDekQ7d0JBRUQsR0FBRyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsc0JBQXNCLENBQzlCLEVBQUUsQ0FBQyxXQUFXLEVBQUUscUJBQXFCLENBQUMsTUFBTSxFQUFFLHFCQUFxQixDQUFDLElBQUksRUFDeEUscUJBQXFCLENBQUMsTUFBTSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsVUFBVSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQyxFQUNyRSxFQUFFLENBQUMsdUJBQXVCLENBQUMsUUFBUSxFQUFFLEVBQUUsQ0FBQyxpQkFBaUIsQ0FBQyxhQUFhLEVBQUUsRUFBRSxDQUFDLElBQUksRUFDaEYsRUFBRSxDQUFDLFVBQVUsQ0FBQyxDQUFDLENBQUM7cUJBQ3JCO29CQUNELEVBQUUsQ0FBQyxNQUFNLENBQUMsZUFBZSxDQUFDLEVBQWlCLEVBQUUsR0FBRyxDQUFDLENBQUM7b0JBQ2xELE1BQU07YUFDVDtTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBTb21lIGJpbmRpbmcgaW5zdHJ1Y3Rpb25zIGluIHRoZSB1cGRhdGUgYmxvY2sgbWF5IGFjdHVhbGx5IGNvcnJlc3BvbmQgdG8gaTE4biBiaW5kaW5ncy4gSW4gdGhhdFxuICogY2FzZSwgdGhleSBzaG91bGQgYmUgcmVwbGFjZWQgd2l0aCBpMThuRXhwIGluc3RydWN0aW9ucyBmb3IgdGhlIGR5bmFtaWMgcG9ydGlvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjb252ZXJ0STE4bkJpbmRpbmdzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgY29uc3QgaTE4bkF0dHJpYnV0ZXNCeUVsZW06IE1hcDxpci5YcmVmSWQsIGlyLkkxOG5BdHRyaWJ1dGVzT3A+ID0gbmV3IE1hcCgpO1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgPT09IGlyLk9wS2luZC5JMThuQXR0cmlidXRlcykge1xuICAgICAgICBpMThuQXR0cmlidXRlc0J5RWxlbS5zZXQob3AudGFyZ2V0LCBvcCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LnVwZGF0ZSkge1xuICAgICAgc3dpdGNoIChvcC5raW5kKSB7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLlByb3BlcnR5OlxuICAgICAgICBjYXNlIGlyLk9wS2luZC5BdHRyaWJ1dGU6XG4gICAgICAgICAgaWYgKG9wLmkxOG5Db250ZXh0ID09PSBudWxsKSB7XG4gICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoIShvcC5leHByZXNzaW9uIGluc3RhbmNlb2YgaXIuSW50ZXJwb2xhdGlvbikpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgIH1cblxuICAgICAgICAgIGNvbnN0IGkxOG5BdHRyaWJ1dGVzRm9yRWxlbSA9IGkxOG5BdHRyaWJ1dGVzQnlFbGVtLmdldChvcC50YXJnZXQpO1xuICAgICAgICAgIGlmIChpMThuQXR0cmlidXRlc0ZvckVsZW0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgICAgICAgICdBc3NlcnRpb25FcnJvcjogQW4gaTE4biBhdHRyaWJ1dGUgYmluZGluZyBpbnN0cnVjdGlvbiByZXF1aXJlcyB0aGUgb3duaW5nIGVsZW1lbnQgdG8gaGF2ZSBhbiBJMThuQXR0cmlidXRlcyBjcmVhdGUgaW5zdHJ1Y3Rpb24nKTtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAoaTE4bkF0dHJpYnV0ZXNGb3JFbGVtLnRhcmdldCAhPT0gb3AudGFyZ2V0KSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgJ0Fzc2VydGlvbkVycm9yOiBFeHBlY3RlZCBpMThuQXR0cmlidXRlcyB0YXJnZXQgZWxlbWVudCB0byBtYXRjaCBiaW5kaW5nIHRhcmdldCBlbGVtZW50Jyk7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3Qgb3BzOiBpci5VcGRhdGVPcFtdID0gW107XG4gICAgICAgICAgZm9yIChsZXQgaSA9IDA7IGkgPCBvcC5leHByZXNzaW9uLmV4cHJlc3Npb25zLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICBjb25zdCBleHByID0gb3AuZXhwcmVzc2lvbi5leHByZXNzaW9uc1tpXTtcblxuICAgICAgICAgICAgaWYgKG9wLmV4cHJlc3Npb24uaTE4blBsYWNlaG9sZGVycy5sZW5ndGggIT09IG9wLmV4cHJlc3Npb24uZXhwcmVzc2lvbnMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgICAgIGBBc3NlcnRpb25FcnJvcjogQW4gaTE4biBhdHRyaWJ1dGUgYmluZGluZyBpbnN0cnVjdGlvbiByZXF1aXJlcyB0aGUgc2FtZSBudW1iZXIgb2YgZXhwcmVzc2lvbnMgYW5kIHBsYWNlaG9sZGVycywgYnV0IGZvdW5kICR7XG4gICAgICAgICAgICAgICAgICAgICAgb3AuZXhwcmVzc2lvbi5pMThuUGxhY2Vob2xkZXJzLmxlbmd0aH0gcGxhY2Vob2xkZXJzIGFuZCAke1xuICAgICAgICAgICAgICAgICAgICAgIG9wLmV4cHJlc3Npb24uZXhwcmVzc2lvbnMubGVuZ3RofSBleHByZXNzaW9uc2ApO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBvcHMucHVzaChpci5jcmVhdGVJMThuRXhwcmVzc2lvbk9wKFxuICAgICAgICAgICAgICAgIG9wLmkxOG5Db250ZXh0LCBpMThuQXR0cmlidXRlc0ZvckVsZW0udGFyZ2V0LCBpMThuQXR0cmlidXRlc0ZvckVsZW0ueHJlZixcbiAgICAgICAgICAgICAgICBpMThuQXR0cmlidXRlc0ZvckVsZW0uaGFuZGxlLCBleHByLCBvcC5leHByZXNzaW9uLmkxOG5QbGFjZWhvbGRlcnNbaV0sXG4gICAgICAgICAgICAgICAgaXIuSTE4blBhcmFtUmVzb2x1dGlvblRpbWUuQ3JlYXRpb24sIGlyLkkxOG5FeHByZXNzaW9uRm9yLkkxOG5BdHRyaWJ1dGUsIG9wLm5hbWUsXG4gICAgICAgICAgICAgICAgb3Auc291cmNlU3BhbikpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpci5PcExpc3QucmVwbGFjZVdpdGhNYW55KG9wIGFzIGlyLlVwZGF0ZU9wLCBvcHMpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuIl19