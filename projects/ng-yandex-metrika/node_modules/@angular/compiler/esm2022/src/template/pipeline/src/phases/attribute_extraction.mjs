/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
import { CompilationJobKind } from '../compilation';
import { createOpXrefMap } from '../util/elements';
/**
 * Find all extractable attribute and binding ops, and create ExtractedAttributeOps for them.
 * In cases where no instruction needs to be generated for the attribute or binding, it is removed.
 */
export function extractAttributes(job) {
    for (const unit of job.units) {
        const elements = createOpXrefMap(unit);
        for (const op of unit.ops()) {
            switch (op.kind) {
                case ir.OpKind.Attribute:
                    extractAttributeOp(unit, op, elements);
                    break;
                case ir.OpKind.Property:
                    if (!op.isAnimationTrigger) {
                        let bindingKind;
                        if (op.i18nContext !== null) {
                            // If the binding has an i18n context, it is an i18n attribute, and should have that
                            // kind in the consts array.
                            bindingKind = ir.BindingKind.I18n;
                        }
                        else if (op.isStructuralTemplate) {
                            // TODO: How do i18n attributes on templates work?!
                            bindingKind = ir.BindingKind.Template;
                        }
                        else {
                            bindingKind = ir.BindingKind.Property;
                        }
                        ir.OpList.insertBefore(ir.createExtractedAttributeOp(op.target, bindingKind, op.name, null, null), lookupElement(elements, op.target));
                    }
                    break;
                case ir.OpKind.StyleProp:
                case ir.OpKind.ClassProp:
                    // TODO: Can style or class bindings be i18n attributes?
                    // The old compiler treated empty style bindings as regular bindings for the purpose of
                    // directive matching. That behavior is incorrect, but we emulate it in compatibility
                    // mode.
                    if (unit.job.compatibility === ir.CompatibilityMode.TemplateDefinitionBuilder &&
                        op.expression instanceof ir.EmptyExpr) {
                        ir.OpList.insertBefore(ir.createExtractedAttributeOp(op.target, ir.BindingKind.Property, op.name, null, null), lookupElement(elements, op.target));
                    }
                    break;
                case ir.OpKind.Listener:
                    if (!op.isAnimationListener) {
                        const extractedAttributeOp = ir.createExtractedAttributeOp(op.target, ir.BindingKind.Property, op.name, null, null);
                        if (job.kind === CompilationJobKind.Host) {
                            // This attribute will apply to the enclosing host binding compilation unit, so order
                            // doesn't matter.
                            unit.create.push(extractedAttributeOp);
                        }
                        else {
                            ir.OpList.insertBefore(extractedAttributeOp, lookupElement(elements, op.target));
                        }
                    }
                    break;
            }
        }
    }
}
/**
 * Looks up an element in the given map by xref ID.
 */
function lookupElement(elements, xref) {
    const el = elements.get(xref);
    if (el === undefined) {
        throw new Error('All attributes should have an element-like target.');
    }
    return el;
}
/**
 * Extracts an attribute binding.
 */
function extractAttributeOp(unit, op, elements) {
    if (op.expression instanceof ir.Interpolation) {
        return;
    }
    let extractable = op.expression.isConstant();
    if (unit.job.compatibility === ir.CompatibilityMode.TemplateDefinitionBuilder) {
        // TemplateDefinitionBuilder only extracted attributes that were string literals.
        extractable = ir.isStringLiteral(op.expression);
        if (op.name === 'style' || op.name === 'class') {
            // For style and class attributes, TemplateDefinitionBuilder only extracted them if they were
            // text attributes. For example, `[attr.class]="'my-class'"` was not extracted despite being a
            // string literal, because it is not a text attribute.
            extractable &&= op.isTextAttribute;
        }
        if (unit.job.kind === CompilationJobKind.Host) {
            // TemplateDefinitionBuilder also does not seem to extract string literals if they are part of
            // a host attribute.
            extractable &&= op.isTextAttribute;
        }
    }
    if (extractable) {
        const extractedAttributeOp = ir.createExtractedAttributeOp(op.target, op.isStructuralTemplate ? ir.BindingKind.Template : ir.BindingKind.Attribute, op.name, op.expression, op.i18nContext);
        if (unit.job.kind === CompilationJobKind.Host) {
            // This attribute will apply to the enclosing host binding compilation unit, so order doesn't
            // matter.
            unit.create.push(extractedAttributeOp);
        }
        else {
            const ownerOp = lookupElement(elements, op.target);
            ir.OpList.insertBefore(extractedAttributeOp, ownerOp);
        }
        ir.OpList.remove(op);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXR0cmlidXRlX2V4dHJhY3Rpb24uanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9hdHRyaWJ1dGVfZXh0cmFjdGlvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFHSCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUMsa0JBQWtCLEVBQTRDLE1BQU0sZ0JBQWdCLENBQUM7QUFDN0YsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLGtCQUFrQixDQUFDO0FBRWpEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxHQUFtQjtJQUNuRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsTUFBTSxRQUFRLEdBQUcsZUFBZSxDQUFDLElBQUksQ0FBQyxDQUFDO1FBQ3ZDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQzNCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDdEIsa0JBQWtCLENBQUMsSUFBSSxFQUFFLEVBQUUsRUFBRSxRQUFRLENBQUMsQ0FBQztvQkFDdkMsTUFBTTtnQkFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUTtvQkFDckIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRTt3QkFDMUIsSUFBSSxXQUEyQixDQUFDO3dCQUNoQyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEtBQUssSUFBSSxFQUFFOzRCQUMzQixvRkFBb0Y7NEJBQ3BGLDRCQUE0Qjs0QkFDNUIsV0FBVyxHQUFHLEVBQUUsQ0FBQyxXQUFXLENBQUMsSUFBSSxDQUFDO3lCQUNuQzs2QkFBTSxJQUFJLEVB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Q0FBQztTQUNwRTtRQUNELEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFjLEVBQUUsQ0FBQyxDQUFDO0tBQ25DO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcGlsYXRpb25Kb2JLaW5kLCB0eXBlIENvbXBpbGF0aW9uSm9iLCB0eXBlIENvbXBpbGF0aW9uVW5pdH0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuaW1wb3J0IHtjcmVhdGVPcFhyZWZNYXB9IGZyb20gJy4uL3V0aWwvZWxlbWVudHMnO1xuXG4vKipcbiAqIEZpbmQgYWxsIGV4dHJhY3RhYmxlIGF0dHJpYnV0ZSBhbmQgYmluZGluZyBvcHMsIGFuZCBjcmVhdGUgRXh0cmFjdGVkQXR0cmlidXRlT3BzIGZvciB0aGVtLlxuICogSW4gY2FzZXMgd2hlcmUgbm8gaW5zdHJ1Y3Rpb24gbmVlZHMgdG8gYmUgZ2VuZXJhdGVkIGZvciB0aGUgYXR0cmlidXRlIG9yIGJpbmRpbmcsIGl0IGlzIHJlbW92ZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBleHRyYWN0QXR0cmlidXRlcyhqb2I6IENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBjb25zdCBlbGVtZW50cyA9IGNyZWF0ZU9wWHJlZk1hcCh1bml0KTtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQub3BzKCkpIHtcbiAgICAgIHN3aXRjaCAob3Aua2luZCkge1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5BdHRyaWJ1dGU6XG4gICAgICAgICAgZXh0cmFjdEF0dHJpYnV0ZU9wKHVuaXQsIG9wLCBlbGVtZW50cyk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLlByb3BlcnR5OlxuICAgICAgICAgIGlmICghb3AuaXNBbmltYXRpb25UcmlnZ2VyKSB7XG4gICAgICAgICAgICBsZXQgYmluZGluZ0tpbmQ6IGlyLkJpbmRpbmdLaW5kO1xuICAgICAgICAgICAgaWYgKG9wLmkxOG5Db250ZXh0ICE9PSBudWxsKSB7XG4gICAgICAgICAgICAgIC8vIElmIHRoZSBiaW5kaW5nIGhhcyBhbiBpMThuIGNvbnRleHQsIGl0IGlzIGFuIGkxOG4gYXR0cmlidXRlLCBhbmQgc2hvdWxkIGhhdmUgdGhhdFxuICAgICAgICAgICAgICAvLyBraW5kIGluIHRoZSBjb25zdHMgYXJyYXkuXG4gICAgICAgICAgICAgIGJpbmRpbmdLaW5kID0gaXIuQmluZGluZ0tpbmQuSTE4bjtcbiAgICAgICAgICAgIH0gZWxzZSBpZiAob3AuaXNTdHJ1Y3R1cmFsVGVtcGxhdGUpIHtcbiAgICAgICAgICAgICAgLy8gVE9ETzogSG93IGRvIGkxOG4gYXR0cmlidXRlcyBvbiB0ZW1wbGF0ZXMgd29yaz8hXG4gICAgICAgICAgICAgIGJpbmRpbmdLaW5kID0gaXIuQmluZGluZ0tpbmQuVGVtcGxhdGU7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICBiaW5kaW5nS2luZCA9IGlyLkJpbmRpbmdLaW5kLlByb3BlcnR5O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpci5PcExpc3QuaW5zZXJ0QmVmb3JlPGlyLkNyZWF0ZU9wPihcbiAgICAgICAgICAgICAgICBpci5jcmVhdGVFeHRyYWN0ZWRBdHRyaWJ1dGVPcChvcC50YXJnZXQsIGJpbmRpbmdLaW5kLCBvcC5uYW1lLCBudWxsLCBudWxsKSxcbiAgICAgICAgICAgICAgICBsb29rdXBFbGVtZW50KGVsZW1lbnRzLCBvcC50YXJnZXQpKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLlN0eWxlUHJvcDpcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuQ2xhc3NQcm9wOlxuICAgICAgICAgIC8vIFRPRE86IENhbiBzdHlsZSBvciBjbGFzcyBiaW5kaW5ncyBiZSBpMThuIGF0dHJpYnV0ZXM/XG5cbiAgICAgICAgICAvLyBUaGUgb2xkIGNvbXBpbGVyIHRyZWF0ZWQgZW1wdHkgc3R5bGUgYmluZGluZ3MgYXMgcmVndWxhciBiaW5kaW5ncyBmb3IgdGhlIHB1cnBvc2Ugb2ZcbiAgICAgICAgICAvLyBkaXJlY3RpdmUgbWF0Y2hpbmcuIFRoYXQgYmVoYXZpb3IgaXMgaW5jb3JyZWN0LCBidXQgd2UgZW11bGF0ZSBpdCBpbiBjb21wYXRpYmlsaXR5XG4gICAgICAgICAgLy8gbW9kZS5cbiAgICAgICAgICBpZiAodW5pdC5qb2IuY29tcGF0aWJpbGl0eSA9PT0gaXIuQ29tcGF0aWJpbGl0eU1vZGUuVGVtcGxhdGVEZWZpbml0aW9uQnVpbGRlciAmJlxuICAgICAgICAgICAgICBvcC5leHByZXNzaW9uIGluc3RhbmNlb2YgaXIuRW1wdHlFeHByKSB7XG4gICAgICAgICAgICBpci5PcExpc3QuaW5zZXJ0QmVmb3JlPGlyLkNyZWF0ZU9wPihcbiAgICAgICAgICAgICAgICBpci5jcmVhdGVFeHRyYWN0ZWRBdHRyaWJ1dGVPcChcbiAgICAgICAgICAgICAgICAgICAgb3AudGFyZ2V0LCBpci5CaW5kaW5nS2luZC5Qcm9wZXJ0eSwgb3AubmFtZSwgbnVsbCwgbnVsbCksXG4gICAgICAgICAgICAgICAgbG9va3VwRWxlbWVudChlbGVtZW50cywgb3AudGFyZ2V0KSk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5MaXN0ZW5lcjpcbiAgICAgICAgICBpZiAoIW9wLmlzQW5pbWF0aW9uTGlzdGVuZXIpIHtcbiAgICAgICAgICAgIGNvbnN0IGV4dHJhY3RlZEF0dHJpYnV0ZU9wID0gaXIuY3JlYXRlRXh0cmFjdGVkQXR0cmlidXRlT3AoXG4gICAgICAgICAgICAgICAgb3AudGFyZ2V0LCBpci5CaW5kaW5nS2luZC5Qcm9wZXJ0eSwgb3AubmFtZSwgbnVsbCwgbnVsbCk7XG4gICAgICAgICAgICBpZiAoam9iLmtpbmQgPT09IENvbXBpbGF0aW9uSm9iS2luZC5Ib3N0KSB7XG4gICAgICAgICAgICAgIC8vIFRoaXMgYXR0cmlidXRlIHdpbGwgYXBwbHkgdG8gdGhlIGVuY2xvc2luZyBob3N0IGJpbmRpbmcgY29tcGlsYXRpb24gdW5pdCwgc28gb3JkZXJcbiAgICAgICAgICAgICAgLy8gZG9lc24ndCBtYXR0ZXIuXG4gICAgICAgICAgICAgIHVuaXQuY3JlYXRlLnB1c2goZXh0cmFjdGVkQXR0cmlidXRlT3ApO1xuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgaXIuT3BMaXN0Lmluc2VydEJlZm9yZTxpci5DcmVhdGVPcD4oXG4gICAgICAgICAgICAgICAgICBleHRyYWN0ZWRBdHRyaWJ1dGVPcCwgbG9va3VwRWxlbWVudChlbGVtZW50cywgb3AudGFyZ2V0KSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIExvb2tzIHVwIGFuIGVsZW1lbnQgaW4gdGhlIGdpdmVuIG1hcCBieSB4cmVmIElELlxuICovXG5mdW5jdGlvbiBsb29rdXBFbGVtZW50KFxuICAgIGVsZW1lbnRzOiBNYXA8aXIuWHJlZklkLCBpci5Db25zdW1lc1Nsb3RPcFRyYWl0JmlyLkNyZWF0ZU9wPixcbiAgICB4cmVmOiBpci5YcmVmSWQpOiBpci5Db25zdW1lc1Nsb3RPcFRyYWl0JmlyLkNyZWF0ZU9wIHtcbiAgY29uc3QgZWwgPSBlbGVtZW50cy5nZXQoeHJlZik7XG4gIGlmIChlbCA9PT0gdW5kZWZpbmVkKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdBbGwgYXR0cmlidXRlcyBzaG91bGQgaGF2ZSBhbiBlbGVtZW50LWxpa2UgdGFyZ2V0LicpO1xuICB9XG4gIHJldHVybiBlbDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyBhbiBhdHRyaWJ1dGUgYmluZGluZy5cbiAqL1xuZnVuY3Rpb24gZXh0cmFjdEF0dHJpYnV0ZU9wKFxuICAgIHVuaXQ6IENvbXBpbGF0aW9uVW5pdCwgb3A6IGlyLkF0dHJpYnV0ZU9wLFxuICAgIGVsZW1lbnRzOiBNYXA8aXIuWHJlZklkLCBpci5Db25zdW1lc1Nsb3RPcFRyYWl0JmlyLkNyZWF0ZU9wPikge1xuICBpZiAob3AuZXhwcmVzc2lvbiBpbnN0YW5jZW9mIGlyLkludGVycG9sYXRpb24pIHtcbiAgICByZXR1cm47XG4gIH1cblxuICBsZXQgZXh0cmFjdGFibGUgPSBvcC5leHByZXNzaW9uLmlzQ29uc3RhbnQoKTtcbiAgaWYgKHVuaXQuam9iLmNvbXBhdGliaWxpdHkgPT09IGlyLkNvbXBhdGliaWxpdHlNb2RlLlRlbXBsYXRlRGVmaW5pdGlvbkJ1aWxkZXIpIHtcbiAgICAvLyBUZW1wbGF0ZURlZmluaXRpb25CdWlsZGVyIG9ubHkgZXh0cmFjdGVkIGF0dHJpYnV0ZXMgdGhhdCB3ZXJlIHN0cmluZyBsaXRlcmFscy5cbiAgICBleHRyYWN0YWJsZSA9IGlyLmlzU3RyaW5nTGl0ZXJhbChvcC5leHByZXNzaW9uKTtcbiAgICBpZiAob3AubmFtZSA9PT0gJ3N0eWxlJyB8fCBvcC5uYW1lID09PSAnY2xhc3MnKSB7XG4gICAgICAvLyBGb3Igc3R5bGUgYW5kIGNsYXNzIGF0dHJpYnV0ZXMsIFRlbXBsYXRlRGVmaW5pdGlvbkJ1aWxkZXIgb25seSBleHRyYWN0ZWQgdGhlbSBpZiB0aGV5IHdlcmVcbiAgICAgIC8vIHRleHQgYXR0cmlidXRlcy4gRm9yIGV4YW1wbGUsIGBbYXR0ci5jbGFzc109XCInbXktY2xhc3MnXCJgIHdhcyBub3QgZXh0cmFjdGVkIGRlc3BpdGUgYmVpbmcgYVxuICAgICAgLy8gc3RyaW5nIGxpdGVyYWwsIGJlY2F1c2UgaXQgaXMgbm90IGEgdGV4dCBhdHRyaWJ1dGUuXG4gICAgICBleHRyYWN0YWJsZSAmJj0gb3AuaXNUZXh0QXR0cmlidXRlO1xuICAgIH1cbiAgICBpZiAodW5pdC5qb2Iua2luZCA9PT0gQ29tcGlsYXRpb25Kb2JLaW5kLkhvc3QpIHtcbiAgICAgIC8vIFRlbXBsYXRlRGVmaW5pdGlvbkJ1aWxkZXIgYWxzbyBkb2VzIG5vdCBzZWVtIHRvIGV4dHJhY3Qgc3RyaW5nIGxpdGVyYWxzIGlmIHRoZXkgYXJlIHBhcnQgb2ZcbiAgICAgIC8vIGEgaG9zdCBhdHRyaWJ1dGUuXG4gICAgICBleHRyYWN0YWJsZSAmJj0gb3AuaXNUZXh0QXR0cmlidXRlO1xuICAgIH1cbiAgfVxuXG4gIGlmIChleHRyYWN0YWJsZSkge1xuICAgIGNvbnN0IGV4dHJhY3RlZEF0dHJpYnV0ZU9wID0gaXIuY3JlYXRlRXh0cmFjdGVkQXR0cmlidXRlT3AoXG4gICAgICAgIG9wLnRhcmdldCwgb3AuaXNTdHJ1Y3R1cmFsVGVtcGxhdGUgPyBpci5CaW5kaW5nS2luZC5UZW1wbGF0ZSA6IGlyLkJpbmRpbmdLaW5kLkF0dHJpYnV0ZSxcbiAgICAgICAgb3AubmFtZSwgb3AuZXhwcmVzc2lvbiwgb3AuaTE4bkNvbnRleHQpO1xuICAgIGlmICh1bml0LmpvYi5raW5kID09PSBDb21waWxhdGlvbkpvYktpbmQuSG9zdCkge1xuICAgICAgLy8gVGhpcyBhdHRyaWJ1dGUgd2lsbCBhcHBseSB0byB0aGUgZW5jbG9zaW5nIGhvc3QgYmluZGluZyBjb21waWxhdGlvbiB1bml0LCBzbyBvcmRlciBkb2Vzbid0XG4gICAgICAvLyBtYXR0ZXIuXG4gICAgICB1bml0LmNyZWF0ZS5wdXNoKGV4dHJhY3RlZEF0dHJpYnV0ZU9wKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3Qgb3duZXJPcCA9IGxvb2t1cEVsZW1lbnQoZWxlbWVudHMsIG9wLnRhcmdldCk7XG4gICAgICBpci5PcExpc3QuaW5zZXJ0QmVmb3JlPGlyLkNyZWF0ZU9wPihleHRyYWN0ZWRBdHRyaWJ1dGVPcCwgb3duZXJPcCk7XG4gICAgfVxuICAgIGlyLk9wTGlzdC5yZW1vdmU8aXIuVXBkYXRlT3A+KG9wKTtcbiAgfVxufVxuIl19