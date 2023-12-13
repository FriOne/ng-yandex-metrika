/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Resolve the i18n expression placeholders in i18n messages.
 */
export function resolveI18nExpressionPlaceholders(job) {
    // Record all of the i18n context ops, and the sub-template index for each i18n op.
    const subTemplateIndicies = new Map();
    const i18nContexts = new Map();
    for (const unit of job.units) {
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.I18nStart:
                    subTemplateIndicies.set(op.xref, op.subTemplateIndex);
                    break;
                case ir.OpKind.I18nContext:
                    i18nContexts.set(op.xref, op);
                    break;
            }
        }
    }
    // Keep track of the next available expression index for each i18n message.
    const expressionIndices = new Map();
    // Keep track of a reference index for each expression.
    // We use different references for normal i18n expressio and attribute i18n expressions. This is
    // because child i18n blocks in templates don't get their own context, since they're rolled into
    // the translated message of the parent, but they may target a different slot.
    const referenceIndex = (op) => op.usage === ir.I18nExpressionFor.I18nText ? op.i18nOwner : op.context;
    for (const unit of job.units) {
        for (const op of unit.update) {
            if (op.kind === ir.OpKind.I18nExpression) {
                const i18nContext = i18nContexts.get(op.context);
                const index = expressionIndices.get(referenceIndex(op)) || 0;
                const subTemplateIndex = subTemplateIndicies.get(op.i18nOwner) ?? null;
                // Add the expression index in the appropriate params map.
                const params = op.resolutionTime === ir.I18nParamResolutionTime.Creation ?
                    i18nContext.params :
                    i18nContext.postprocessingParams;
                const values = params.get(op.i18nPlaceholder) || [];
                values.push({
                    value: index,
                    subTemplateIndex: subTemplateIndex,
                    flags: ir.I18nParamValueFlags.ExpressionIndex
                });
                params.set(op.i18nPlaceholder, values);
                expressionIndices.set(referenceIndex(op), index + 1);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9pMThuX2V4cHJlc3Npb25fcGxhY2Vob2xkZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvcmVzb2x2ZV9pMThuX2V4cHJlc3Npb25fcGxhY2Vob2xkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLGlDQUFpQyxDQUFDLEdBQTRCO0lBQzVFLG1GQUFtRjtJQUNuRixNQUFNLG1CQUFtQixHQUFHLElBQUksR0FBRyxFQUEwQixDQUFDO0lBQzlELE1BQU0sWUFBWSxHQUFHLElBQUksR0FBRyxFQUErQixDQUFDO0lBQzVELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsUUFBUSxFQUFFLENBQUMsSUFBSSxFQUFFO2dCQUNmLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxTQUFTO29CQUN0QixtQkFBbUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztvQkFDdEQsTUFBTTtnQkFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVztvQkFDeEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUM5QixNQUFNO2FBQ1Q7U0FDRjtLQUNGO0lBRUQsMkVBQTJFO0lBQzNFLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxHQUFHLEVBQXFCLENBQUM7SUFFdkQsdURBQXVEO0lBQ3ZELGdHQUFnRztJQUNoRyxnR0FBZ0c7SUFDaEcsOEVBQThFO0lBQzlFLE1BQU0sY0FBYyxHQUFHLENBQUMsRUFBdUIsRUFBYSxFQUFFLENBQzFELEVBQUUsQ0FBQyxLQUFLLEtBQUssRUFBRSxDQUFDLGlCQUFpQixDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQztJQUUzRSxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLGNBQWMsRUFBRTtnQkFDeEMsTUFBTSxXQUFXLEdBQUcsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsT0FBTyxDQUFFLENBQUM7Z0JBQ2xELE1BQU0sS0FBSyxHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQzdELE1BQU0sZ0JBQWdCLEdBQUcsbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxTQUFTLENBQUMsSUFBSSxJQUFJLENBQUM7Z0JBQ3ZFLDBEQUEwRDtnQkFDMUQsTUFBTSxNQUFNLEdBQUcsRUFBRSxDQUFDLGNBQWMsS0FBSyxFQUFFLENBQUMsdUJBQXVCLENBQUMsUUFBUSxDQUFDLENBQUM7b0JBQ3RFLFdBQVcsQ0FBQyxNQUFNLENBQUMsQ0FBQztvQkFDcEIsV0FBVyxDQUFDLG9CQUFvQixDQUFDO2dCQUNyQyxNQUFNLE1BQU0sR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxlQUFlLENBQUMsSUFBSSxFQUFFLENBQUM7Z0JBQ3BELE1BQU0sQ0FBQyxJQUFJLENBQUM7b0JBQ1YsS0FBSyxFQUFFLEtBQUs7b0JBQ1osZ0JBQWdCLEVBQUUsZ0JBQWdCO29CQUNsQyxLQUFLLEVBQUUsRUFBRSxDQUFDLG1CQUFtQixDQUFDLGVBQWU7aUJBQzlDLENBQUMsQ0FBQztnQkFDSCxNQUFNLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxlQUFlLEVBQUUsTUFBTSxDQUFDLENBQUM7Z0JBRXZDLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDLEVBQUUsS0FBSyxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQ3REO1NBQ0Y7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21wb25lbnRDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIFJlc29sdmUgdGhlIGkxOG4gZXhwcmVzc2lvbiBwbGFjZWhvbGRlcnMgaW4gaTE4biBtZXNzYWdlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc29sdmVJMThuRXhwcmVzc2lvblBsYWNlaG9sZGVycyhqb2I6IENvbXBvbmVudENvbXBpbGF0aW9uSm9iKSB7XG4gIC8vIFJlY29yZCBhbGwgb2YgdGhlIGkxOG4gY29udGV4dCBvcHMsIGFuZCB0aGUgc3ViLXRlbXBsYXRlIGluZGV4IGZvciBlYWNoIGkxOG4gb3AuXG4gIGNvbnN0IHN1YlRlbXBsYXRlSW5kaWNpZXMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgbnVtYmVyfG51bGw+KCk7XG4gIGNvbnN0IGkxOG5Db250ZXh0cyA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5JMThuQ29udGV4dE9wPigpO1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgc3dpdGNoIChvcC5raW5kKSB7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkkxOG5TdGFydDpcbiAgICAgICAgICBzdWJUZW1wbGF0ZUluZGljaWVzLnNldChvcC54cmVmLCBvcC5zdWJUZW1wbGF0ZUluZGV4KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkNvbnRleHQ6XG4gICAgICAgICAgaTE4bkNvbnRleHRzLnNldChvcC54cmVmLCBvcCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gS2VlcCB0cmFjayBvZiB0aGUgbmV4dCBhdmFpbGFibGUgZXhwcmVzc2lvbiBpbmRleCBmb3IgZWFjaCBpMThuIG1lc3NhZ2UuXG4gIGNvbnN0IGV4cHJlc3Npb25JbmRpY2VzID0gbmV3IE1hcDxpci5YcmVmSWQsIG51bWJlcj4oKTtcblxuICAvLyBLZWVwIHRyYWNrIG9mIGEgcmVmZXJlbmNlIGluZGV4IGZvciBlYWNoIGV4cHJlc3Npb24uXG4gIC8vIFdlIHVzZSBkaWZmZXJlbnQgcmVmZXJlbmNlcyBmb3Igbm9ybWFsIGkxOG4gZXhwcmVzc2lvIGFuZCBhdHRyaWJ1dGUgaTE4biBleHByZXNzaW9ucy4gVGhpcyBpc1xuICAvLyBiZWNhdXNlIGNoaWxkIGkxOG4gYmxvY2tzIGluIHRlbXBsYXRlcyBkb24ndCBnZXQgdGhlaXIgb3duIGNvbnRleHQsIHNpbmNlIHRoZXkncmUgcm9sbGVkIGludG9cbiAgLy8gdGhlIHRyYW5zbGF0ZWQgbWVzc2FnZSBvZiB0aGUgcGFyZW50LCBidXQgdGhleSBtYXkgdGFyZ2V0IGEgZGlmZmVyZW50IHNsb3QuXG4gIGNvbnN0IHJlZmVyZW5jZUluZGV4ID0gKG9wOiBpci5JMThuRXhwcmVzc2lvbk9wKTogaXIuWHJlZklkID0+XG4gICAgICBvcC51c2FnZSA9PT0gaXIuSTE4bkV4cHJlc3Npb25Gb3IuSTE4blRleHQgPyBvcC5pMThuT3duZXIgOiBvcC5jb250ZXh0O1xuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQudXBkYXRlKSB7XG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkkxOG5FeHByZXNzaW9uKSB7XG4gICAgICAgIGNvbnN0IGkxOG5Db250ZXh0ID0gaTE4bkNvbnRleHRzLmdldChvcC5jb250ZXh0KSE7XG4gICAgICAgIGNvbnN0IGluZGV4ID0gZXhwcmVzc2lvbkluZGljZXMuZ2V0KHJlZmVyZW5jZUluZGV4KG9wKSkgfHwgMDtcbiAgICAgICAgY29uc3Qgc3ViVGVtcGxhdGVJbmRleCA9IHN1YlRlbXBsYXRlSW5kaWNpZXMuZ2V0KG9wLmkxOG5Pd25lcikgPz8gbnVsbDtcbiAgICAgICAgLy8gQWRkIHRoZSBleHByZXNzaW9uIGluZGV4IGluIHRoZSBhcHByb3ByaWF0ZSBwYXJhbXMgbWFwLlxuICAgICAgICBjb25zdCBwYXJhbXMgPSBvcC5yZXNvbHV0aW9uVGltZSA9PT0gaXIuSTE4blBhcmFtUmVzb2x1dGlvblRpbWUuQ3JlYXRpb24gP1xuICAgICAgICAgICAgaTE4bkNvbnRleHQucGFyYW1zIDpcbiAgICAgICAgICAgIGkxOG5Db250ZXh0LnBvc3Rwcm9jZXNzaW5nUGFyYW1zO1xuICAgICAgICBjb25zdCB2YWx1ZXMgPSBwYXJhbXMuZ2V0KG9wLmkxOG5QbGFjZWhvbGRlcikgfHwgW107XG4gICAgICAgIHZhbHVlcy5wdXNoKHtcbiAgICAgICAgICB2YWx1ZTogaW5kZXgsXG4gICAgICAgICAgc3ViVGVtcGxhdGVJbmRleDogc3ViVGVtcGxhdGVJbmRleCxcbiAgICAgICAgICBmbGFnczogaXIuSTE4blBhcmFtVmFsdWVGbGFncy5FeHByZXNzaW9uSW5kZXhcbiAgICAgICAgfSk7XG4gICAgICAgIHBhcmFtcy5zZXQob3AuaTE4blBsYWNlaG9sZGVyLCB2YWx1ZXMpO1xuXG4gICAgICAgIGV4cHJlc3Npb25JbmRpY2VzLnNldChyZWZlcmVuY2VJbmRleChvcCksIGluZGV4ICsgMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=