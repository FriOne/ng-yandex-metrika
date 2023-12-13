/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Resolve the element placeholders in i18n messages.
 */
export function resolveI18nElementPlaceholders(job) {
    // Record all of the element and i18n context ops for use later.
    const i18nContexts = new Map();
    const elements = new Map();
    for (const unit of job.units) {
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.I18nContext:
                    i18nContexts.set(op.xref, op);
                    break;
                case ir.OpKind.ElementStart:
                    elements.set(op.xref, op);
                    break;
            }
        }
    }
    resolvePlaceholdersForView(job, job.root, i18nContexts, elements);
}
/**
 * Recursively resolves element and template tag placeholders in the given view.
 */
function resolvePlaceholdersForView(job, unit, i18nContexts, elements, pendingStructuralDirective) {
    // Track the current i18n op and corresponding i18n context op as we step through the creation
    // IR.
    let currentOps = null;
    let pendingStructuralDirectiveCloses = new Map();
    for (const op of unit.create) {
        switch (op.kind) {
            case ir.OpKind.I18nStart:
                if (!op.context) {
                    throw Error('Could not find i18n context for i18n op');
                }
                currentOps = { i18nBlock: op, i18nContext: i18nContexts.get(op.context) };
                break;
            case ir.OpKind.I18nEnd:
                currentOps = null;
                break;
            case ir.OpKind.ElementStart:
                // For elements with i18n placeholders, record its slot value in the params map under the
                // corresponding tag start placeholder.
                if (op.i18nPlaceholder !== undefined) {
                    if (currentOps === null) {
                        throw Error('i18n tag placeholder should only occur inside an i18n block');
                    }
                    recordElementStart(op, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirective);
                    // If there is a separate close tag placeholder for this element, save the pending
                    // structural directive so we can pass it to the closing tag as well.
                    if (pendingStructuralDirective && op.i18nPlaceholder.closeName) {
                        pendingStructuralDirectiveCloses.set(op.xref, pendingStructuralDirective);
                    }
                    // Clear out the pending structural directive now that its been accounted for.
                    pendingStructuralDirective = undefined;
                }
                break;
            case ir.OpKind.ElementEnd:
                // For elements with i18n placeholders, record its slot value in the params map under the
                // corresponding tag close placeholder.
                const startOp = elements.get(op.xref);
                if (startOp && startOp.i18nPlaceholder !== undefined) {
                    if (currentOps === null) {
                        throw Error('AssertionError: i18n tag placeholder should only occur inside an i18n block');
                    }
                    recordElementClose(startOp, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirectiveCloses.get(op.xref));
                    // Clear out the pending structural directive close that was accounted for.
                    pendingStructuralDirectiveCloses.delete(op.xref);
                }
                break;
            case ir.OpKind.Projection:
                // For content projections with i18n placeholders, record its slot value in the params map
                // under the corresponding tag start and close placeholders.
                if (op.i18nPlaceholder !== undefined) {
                    if (currentOps === null) {
                        throw Error('i18n tag placeholder should only occur inside an i18n block');
                    }
                    recordElementStart(op, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirective);
                    recordElementClose(op, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirective);
                    // Clear out the pending structural directive now that its been accounted for.
                    pendingStructuralDirective = undefined;
                }
                break;
            case ir.OpKind.Template:
                if (op.i18nPlaceholder === undefined) {
                    // If there is no i18n placeholder, just recurse into the view in case it contains i18n
                    // blocks.
                    resolvePlaceholdersForView(job, job.views.get(op.xref), i18nContexts, elements);
                }
                else {
                    if (currentOps === null) {
                        throw Error('i18n tag placeholder should only occur inside an i18n block');
                    }
                    if (op.templateKind === ir.TemplateKind.Structural) {
                        // If this is a structural directive template, don't record anything yet. Instead pass
                        // the current template as a pending structural directive to be recorded when we find
                        // the element, content, or template it belongs to. This allows us to create combined
                        // values that represent, e.g. the start of a template and element at the same time.
                        resolvePlaceholdersForView(job, job.views.get(op.xref), i18nContexts, elements, op);
                    }
                    else {
                        // If this is some other kind of template, we can record its start, recurse into its
                        // view, and then record its end.
                        recordTemplateStart(job, op, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirective);
                        resolvePlaceholdersForView(job, job.views.get(op.xref), i18nContexts, elements);
                        recordTemplateClose(job, op, currentOps.i18nContext, currentOps.i18nBlock, pendingStructuralDirective);
                        pendingStructuralDirective = undefined;
                    }
                }
                break;
        }
    }
}
/**
 * Records an i18n param value for the start of an element.
 */
function recordElementStart(op, i18nContext, i18nBlock, structuralDirective) {
    const { startName, closeName } = op.i18nPlaceholder;
    let flags = ir.I18nParamValueFlags.ElementTag | ir.I18nParamValueFlags.OpenTag;
    let value = op.handle.slot;
    // If the element is associated with a structural directive, start it as well.
    if (structuralDirective !== undefined) {
        flags |= ir.I18nParamValueFlags.TemplateTag;
        value = { element: value, template: structuralDirective.handle.slot };
    }
    // For self-closing tags, there is no close tag placeholder. Instead, the start tag
    // placeholder accounts for the start and close of the element.
    if (!closeName) {
        flags |= ir.I18nParamValueFlags.CloseTag;
    }
    addParam(i18nContext.params, startName, value, i18nBlock.subTemplateIndex, flags);
}
/**
 * Records an i18n param value for the closing of an element.
 */
function recordElementClose(op, i18nContext, i18nBlock, structuralDirective) {
    const { closeName } = op.i18nPlaceholder;
    // Self-closing tags don't have a closing tag placeholder, instead the element closing is
    // recorded via an additional flag on the element start value.
    if (closeName) {
        let flags = ir.I18nParamValueFlags.ElementTag | ir.I18nParamValueFlags.CloseTag;
        let value = op.handle.slot;
        // If the element is associated with a structural directive, close it as well.
        if (structuralDirective !== undefined) {
            flags |= ir.I18nParamValueFlags.TemplateTag;
            value = { element: value, template: structuralDirective.handle.slot };
        }
        addParam(i18nContext.params, closeName, value, i18nBlock.subTemplateIndex, flags);
    }
}
/**
 * Records an i18n param value for the start of a template.
 */
function recordTemplateStart(job, op, i18nContext, i18nBlock, structuralDirective) {
    let { startName, closeName } = op.i18nPlaceholder;
    let flags = ir.I18nParamValueFlags.TemplateTag | ir.I18nParamValueFlags.OpenTag;
    // For self-closing tags, there is no close tag placeholder. Instead, the start tag
    // placeholder accounts for the start and close of the element.
    if (!closeName) {
        flags |= ir.I18nParamValueFlags.CloseTag;
    }
    // If the template is associated with a structural directive, record the structural directive's
    // start first. Since this template must be in the structural directive's view, we can just
    // directly use the current i18n block's sub-template index.
    if (structuralDirective !== undefined) {
        addParam(i18nContext.params, startName, structuralDirective.handle.slot, i18nBlock.subTemplateIndex, flags);
    }
    // Record the start of the template. For the sub-template index, pass the index for the template's
    // view, rather than the current i18n block's index.
    addParam(i18nContext.params, startName, op.handle.slot, getSubTemplateIndexForTemplateTag(job, i18nBlock, op), flags);
}
/**
 * Records an i18n param value for the closing of a template.
 */
function recordTemplateClose(job, op, i18nContext, i18nBlock, structuralDirective) {
    const { startName, closeName } = op.i18nPlaceholder;
    const flags = ir.I18nParamValueFlags.TemplateTag | ir.I18nParamValueFlags.CloseTag;
    // Self-closing tags don't have a closing tag placeholder, instead the template's closing is
    // recorded via an additional flag on the template start value.
    if (closeName) {
        // Record the closing of the template. For the sub-template index, pass the index for the
        // template's view, rather than the current i18n block's index.
        addParam(i18nContext.params, closeName, op.handle.slot, getSubTemplateIndexForTemplateTag(job, i18nBlock, op), flags);
        // If the template is associated with a structural directive, record the structural directive's
        // closing after. Since this template must be in the structural directive's view, we can just
        // directly use the current i18n block's sub-template index.
        if (structuralDirective !== undefined) {
            addParam(i18nContext.params, closeName, structuralDirective.handle.slot, i18nBlock.subTemplateIndex, flags);
        }
    }
}
/**
 * Get the subTemplateIndex for the given template op. For template ops, use the subTemplateIndex of
 * the child i18n block inside the template.
 */
function getSubTemplateIndexForTemplateTag(job, i18nOp, op) {
    for (const childOp of job.views.get(op.xref).create) {
        if (childOp.kind === ir.OpKind.I18nStart) {
            return childOp.subTemplateIndex;
        }
    }
    return i18nOp.subTemplateIndex;
}
/**
 * Add a param value to the given params map.
 */
function addParam(params, placeholder, value, subTemplateIndex, flags) {
    const values = params.get(placeholder) ?? [];
    values.push({ value, subTemplateIndex, flags });
    params.set(placeholder, values);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9pMThuX2VsZW1lbnRfcGxhY2Vob2xkZXJzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvcmVzb2x2ZV9pMThuX2VsZW1lbnRfcGxhY2Vob2xkZXJzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLDhCQUE4QixDQUFDLEdBQTRCO0lBQ3pFLGdFQUFnRTtJQUNoRSxNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsRUFBK0IsQ0FBQztJQUM1RCxNQUFNLFFBQVEsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztJQUN6RCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVztvQkFDeEIsWUFBWSxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO29CQUM5QixNQUFNO2dCQUNSLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZO29CQUN6QixRQUFRLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLENBQUM7b0JBQzFCLE1BQU07YUFDVDtTQUNGO0tBQ0Y7SUFFRCwwQkFBMEIsQ0FBQyxHQUFHLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxZQUFZLEVBQUUsUUFBUSxDQUFDLENBQUM7QUFDcEUsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUywwQkFBMEIsQ0FDL0IsR0FB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LE1BQU0sQ0FBQyxJQUFLLEVBQy9ELFNBQVMsQ0FBQyxnQkFBZ0IsRUFBRSxLQUFLLENBQUMsQ0FBQztTQUN4QztLQUNGO0FBQ0gsQ0FBQztBQUVEOzs7R0FHRztBQUNILFNBQVMsaUNBQWlDLENBQ3RDLEdBQTRCLEVBQUUsTUFBc0IsRUFBRSxFQUFpQjtJQUN6RSxLQUFLLE1BQU0sT0FBTyxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUUsQ0FBQyxNQUFNLEVBQUU7UUFDcEQsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFO1lBQ3hDLE9BQU8sT0FBTyxDQUFDLGdCQUFnQixDQUFDO1NBQ2pDO0tBQ0Y7SUFDRCxPQUFPLE1BQU0sQ0FBQyxnQkFBZ0IsQ0FBQztBQUNqQyxDQUFDO0FBRUQ7O0dBRUc7QUFDSCxTQUFTLFFBQVEsQ0FDYixNQUF3QyxFQUFFLFdBQW1CLEVBQzdELEtBQXdELEVBQUUsZ0JBQTZCLEVBQ3ZGLEtBQTZCO0lBQy9CLE1BQU0sTUFBTSxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsV0FBVyxDQUFDLElBQUksRUFBRSxDQUFDO0lBQzdDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBQyxLQUFLLEVBQUUsZ0JBQWdCLEVBQUUsS0FBSyxFQUFDLENBQUMsQ0FBQztJQUM5QyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsRUFBRSxNQUFNLENBQUMsQ0FBQztBQUNsQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcG9uZW50Q29tcGlsYXRpb25Kb2IsIFZpZXdDb21waWxhdGlvblVuaXR9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBSZXNvbHZlIHRoZSBlbGVtZW50IHBsYWNlaG9sZGVycyBpbiBpMThuIG1lc3NhZ2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUkxOG5FbGVtZW50UGxhY2Vob2xkZXJzKGpvYjogQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IpIHtcbiAgLy8gUmVjb3JkIGFsbCBvZiB0aGUgZWxlbWVudCBhbmQgaTE4biBjb250ZXh0IG9wcyBmb3IgdXNlIGxhdGVyLlxuICBjb25zdCBpMThuQ29udGV4dHMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuSTE4bkNvbnRleHRPcD4oKTtcbiAgY29uc3QgZWxlbWVudHMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuRWxlbWVudFN0YXJ0T3A+KCk7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkNvbnRleHQ6XG4gICAgICAgICAgaTE4bkNvbnRleHRzLnNldChvcC54cmVmLCBvcCk7XG4gICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkVsZW1lbnRTdGFydDpcbiAgICAgICAgICBlbGVtZW50cy5zZXQob3AueHJlZiwgb3ApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHJlc29sdmVQbGFjZWhvbGRlcnNGb3JWaWV3KGpvYiwgam9iLnJvb3QsIGkxOG5Db250ZXh0cywgZWxlbWVudHMpO1xufVxuXG4vKipcbiAqIFJlY3Vyc2l2ZWx5IHJlc29sdmVzIGVsZW1lbnQgYW5kIHRlbXBsYXRlIHRhZyBwbGFjZWhvbGRlcnMgaW4gdGhlIGdpdmVuIHZpZXcuXG4gKi9cbmZ1bmN0aW9uIHJlc29sdmVQbGFjZWhvbGRlcnNGb3JWaWV3KFxuICAgIGpvYjogQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IsIHVuaXQ6IFZpZXdDb21waWxhdGlvblVuaXQsXG4gICAgaTE4bkNvbnRleHRzOiBNYXA8aXIuWHJlZklkLCBpci5JMThuQ29udGV4dE9wPiwgZWxlbWVudHM6IE1hcDxpci5YcmVmSWQsIGlyLkVsZW1lbnRTdGFydE9wPixcbiAgICBwZW5kaW5nU3RydWN0dXJhbERpcmVjdGl2ZT86IGlyLlRlbXBsYXRlT3ApIHtcbiAgLy8gVHJhY2sgdGhlIGN1cnJlbnQgaTE4biBvcCBhbmQgY29ycmVzcG9uZGluZyBpMThuIGNvbnRleHQgb3AgYXMgd2Ugc3RlcCB0aHJvdWdoIHRoZSBjcmVhdGlvblxuICAvLyBJUi5cbiAgbGV0IGN1cnJlbnRPcHM6IHtpMThuQmxvY2s6IGlyLkkxOG5TdGFydE9wLCBpMThuQ29udGV4dDogaXIuSTE4bkNvbnRleHRPcH18bnVsbCA9IG51bGw7XG4gIGxldCBwZW5kaW5nU3RydWN0dXJhbERpcmVjdGl2ZUNsb3NlcyA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5UZW1wbGF0ZU9wPigpO1xuICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgc3dpdGNoIChvcC5raW5kKSB7XG4gICAgICBjYXNlIGlyLk9wS2luZC5JMThuU3RhcnQ6XG4gICAgICAgIGlmICghb3AuY29udGV4dCkge1xuICAgICAgICAgIHRocm93IEVycm9yKCdDb3VsZCBub3QgZmluZCBpMThuIGNvbnRleHQgZm9yIGkxOG4gb3AnKTtcbiAgICAgICAgfVxuICAgICAgICBjdXJyZW50T3BzID0ge2kxOG5CbG9jazogb3AsIGkxOG5Db250ZXh0OiBpMThuQ29udGV4dHMuZ2V0KG9wLmNvbnRleHQpIX07XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkVuZDpcbiAgICAgICAgY3VycmVudE9wcyA9IG51bGw7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBpci5PcEtpbmQuRWxlbWVudFN0YXJ0OlxuICAgICAgICAvLyBGb3IgZWxlbWVudHMgd2l0aCBpMThuIHBsYWNlaG9sZGVycywgcmVjb3JkIGl0cyBzbG90IHZhbHVlIGluIHRoZSBwYXJhbXMgbWFwIHVuZGVyIHRoZVxuICAgICAgICAvLyBjb3JyZXNwb25kaW5nIHRhZyBzdGFydCBwbGFjZWhvbGRlci5cbiAgICAgICAgaWYgKG9wLmkxOG5QbGFjZWhvbGRlciAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgaWYgKGN1cnJlbnRPcHMgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdpMThuIHRhZyBwbGFjZWhvbGRlciBzaG91bGQgb25seSBvY2N1ciBpbnNpZGUgYW4gaTE4biBibG9jaycpO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZWNvcmRFbGVtZW50U3RhcnQoXG4gICAgICAgICAgICAgIG9wLCBjdXJyZW50T3BzLmkxOG5Db250ZXh0LCBjdXJyZW50T3BzLmkxOG5CbG9jaywgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUpO1xuICAgICAgICAgIC8vIElmIHRoZXJlIGlzIGEgc2VwYXJhdGUgY2xvc2UgdGFnIHBsYWNlaG9sZGVyIGZvciB0aGlzIGVsZW1lbnQsIHNhdmUgdGhlIHBlbmRpbmdcbiAgICAgICAgICAvLyBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSBzbyB3ZSBjYW4gcGFzcyBpdCB0byB0aGUgY2xvc2luZyB0YWcgYXMgd2VsbC5cbiAgICAgICAgICBpZiAocGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUgJiYgb3AuaTE4blBsYWNlaG9sZGVyLmNsb3NlTmFtZSkge1xuICAgICAgICAgICAgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmVDbG9zZXMuc2V0KG9wLnhyZWYsIHBlbmRpbmdTdHJ1Y3R1cmFsRGlyZWN0aXZlKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gQ2xlYXIgb3V0IHRoZSBwZW5kaW5nIHN0cnVjdHVyYWwgZGlyZWN0aXZlIG5vdyB0aGF0IGl0cyBiZWVuIGFjY291bnRlZCBmb3IuXG4gICAgICAgICAgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUgPSB1bmRlZmluZWQ7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5FbGVtZW50RW5kOlxuICAgICAgICAvLyBGb3IgZWxlbWVudHMgd2l0aCBpMThuIHBsYWNlaG9sZGVycywgcmVjb3JkIGl0cyBzbG90IHZhbHVlIGluIHRoZSBwYXJhbXMgbWFwIHVuZGVyIHRoZVxuICAgICAgICAvLyBjb3JyZXNwb25kaW5nIHRhZyBjbG9zZSBwbGFjZWhvbGRlci5cbiAgICAgICAgY29uc3Qgc3RhcnRPcCA9IGVsZW1lbnRzLmdldChvcC54cmVmKTtcbiAgICAgICAgaWYgKHN0YXJ0T3AgJiYgc3RhcnRPcC5pMThuUGxhY2Vob2xkZXIgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGlmIChjdXJyZW50T3BzID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBFcnJvcihcbiAgICAgICAgICAgICAgICAnQXNzZXJ0aW9uRXJyb3I6IGkxOG4gdGFnIHBsYWNlaG9sZGVyIHNob3VsZCBvbmx5IG9jY3VyIGluc2lkZSBhbiBpMThuIGJsb2NrJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlY29yZEVsZW1lbnRDbG9zZShcbiAgICAgICAgICAgICAgc3RhcnRPcCwgY3VycmVudE9wcy5pMThuQ29udGV4dCwgY3VycmVudE9wcy5pMThuQmxvY2ssXG4gICAgICAgICAgICAgIHBlbmRpbmdTdHJ1Y3R1cmFsRGlyZWN0aXZlQ2xvc2VzLmdldChvcC54cmVmKSk7XG4gICAgICAgICAgLy8gQ2xlYXIgb3V0IHRoZSBwZW5kaW5nIHN0cnVjdHVyYWwgZGlyZWN0aXZlIGNsb3NlIHRoYXQgd2FzIGFjY291bnRlZCBmb3IuXG4gICAgICAgICAgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmVDbG9zZXMuZGVsZXRlKG9wLnhyZWYpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBpci5PcEtpbmQuUHJvamVjdGlvbjpcbiAgICAgICAgLy8gRm9yIGNvbnRlbnQgcHJvamVjdGlvbnMgd2l0aCBpMThuIHBsYWNlaG9sZGVycywgcmVjb3JkIGl0cyBzbG90IHZhbHVlIGluIHRoZSBwYXJhbXMgbWFwXG4gICAgICAgIC8vIHVuZGVyIHRoZSBjb3JyZXNwb25kaW5nIHRhZyBzdGFydCBhbmQgY2xvc2UgcGxhY2Vob2xkZXJzLlxuICAgICAgICBpZiAob3AuaTE4blBsYWNlaG9sZGVyICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBpZiAoY3VycmVudE9wcyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgRXJyb3IoJ2kxOG4gdGFnIHBsYWNlaG9sZGVyIHNob3VsZCBvbmx5IG9jY3VyIGluc2lkZSBhbiBpMThuIGJsb2NrJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJlY29yZEVsZW1lbnRTdGFydChcbiAgICAgICAgICAgICAgb3AsIGN1cnJlbnRPcHMuaTE4bkNvbnRleHQsIGN1cnJlbnRPcHMuaTE4bkJsb2NrLCBwZW5kaW5nU3RydWN0dXJhbERpcmVjdGl2ZSk7XG4gICAgICAgICAgcmVjb3JkRWxlbWVudENsb3NlKFxuICAgICAgICAgICAgICBvcCwgY3VycmVudE9wcy5pMThuQ29udGV4dCwgY3VycmVudE9wcy5pMThuQmxvY2ssIHBlbmRpbmdTdHJ1Y3R1cmFsRGlyZWN0aXZlKTtcbiAgICAgICAgICAvLyBDbGVhciBvdXQgdGhlIHBlbmRpbmcgc3RydWN0dXJhbCBkaXJlY3RpdmUgbm93IHRoYXQgaXRzIGJlZW4gYWNjb3VudGVkIGZvci5cbiAgICAgICAgICBwZW5kaW5nU3RydWN0dXJhbERpcmVjdGl2ZSA9IHVuZGVmaW5lZDtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgaXIuT3BLaW5kLlRlbXBsYXRlOlxuICAgICAgICBpZiAob3AuaTE4blBsYWNlaG9sZGVyID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAvLyBJZiB0aGVyZSBpcyBubyBpMThuIHBsYWNlaG9sZGVyLCBqdXN0IHJlY3Vyc2UgaW50byB0aGUgdmlldyBpbiBjYXNlIGl0IGNvbnRhaW5zIGkxOG5cbiAgICAgICAgICAvLyBibG9ja3MuXG4gICAgICAgICAgcmVzb2x2ZVBsYWNlaG9sZGVyc0ZvclZpZXcoam9iLCBqb2Iudmlld3MuZ2V0KG9wLnhyZWYpISwgaTE4bkNvbnRleHRzLCBlbGVtZW50cyk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgaWYgKGN1cnJlbnRPcHMgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdpMThuIHRhZyBwbGFjZWhvbGRlciBzaG91bGQgb25seSBvY2N1ciBpbnNpZGUgYW4gaTE4biBibG9jaycpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAob3AudGVtcGxhdGVLaW5kID09PSBpci5UZW1wbGF0ZUtpbmQuU3RydWN0dXJhbCkge1xuICAgICAgICAgICAgLy8gSWYgdGhpcyBpcyBhIHN0cnVjdHVyYWwgZGlyZWN0aXZlIHRlbXBsYXRlLCBkb24ndCByZWNvcmQgYW55dGhpbmcgeWV0LiBJbnN0ZWFkIHBhc3NcbiAgICAgICAgICAgIC8vIHRoZSBjdXJyZW50IHRlbXBsYXRlIGFzIGEgcGVuZGluZyBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSB0byBiZSByZWNvcmRlZCB3aGVuIHdlIGZpbmRcbiAgICAgICAgICAgIC8vIHRoZSBlbGVtZW50LCBjb250ZW50LCBvciB0ZW1wbGF0ZSBpdCBiZWxvbmdzIHRvLiBUaGlzIGFsbG93cyB1cyB0byBjcmVhdGUgY29tYmluZWRcbiAgICAgICAgICAgIC8vIHZhbHVlcyB0aGF0IHJlcHJlc2VudCwgZS5nLiB0aGUgc3RhcnQgb2YgYSB0ZW1wbGF0ZSBhbmQgZWxlbWVudCBhdCB0aGUgc2FtZSB0aW1lLlxuICAgICAgICAgICAgcmVzb2x2ZVBsYWNlaG9sZGVyc0ZvclZpZXcoam9iLCBqb2Iudmlld3MuZ2V0KG9wLnhyZWYpISwgaTE4bkNvbnRleHRzLCBlbGVtZW50cywgb3ApO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBJZiB0aGlzIGlzIHNvbWUgb3RoZXIga2luZCBvZiB0ZW1wbGF0ZSwgd2UgY2FuIHJlY29yZCBpdHMgc3RhcnQsIHJlY3Vyc2UgaW50byBpdHNcbiAgICAgICAgICAgIC8vIHZpZXcsIGFuZCB0aGVuIHJlY29yZCBpdHMgZW5kLlxuICAgICAgICAgICAgcmVjb3JkVGVtcGxhdGVTdGFydChcbiAgICAgICAgICAgICAgICBqb2IsIG9wLCBjdXJyZW50T3BzLmkxOG5Db250ZXh0LCBjdXJyZW50T3BzLmkxOG5CbG9jaywgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUpO1xuICAgICAgICAgICAgcmVzb2x2ZVBsYWNlaG9sZGVyc0ZvclZpZXcoam9iLCBqb2Iudmlld3MuZ2V0KG9wLnhyZWYpISwgaTE4bkNvbnRleHRzLCBlbGVtZW50cyk7XG4gICAgICAgICAgICByZWNvcmRUZW1wbGF0ZUNsb3NlKFxuICAgICAgICAgICAgICAgIGpvYiwgb3AsIGN1cnJlbnRPcHMhLmkxOG5Db250ZXh0LCBjdXJyZW50T3BzIS5pMThuQmxvY2ssXG4gICAgICAgICAgICAgICAgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUpO1xuICAgICAgICAgICAgcGVuZGluZ1N0cnVjdHVyYWxEaXJlY3RpdmUgPSB1bmRlZmluZWQ7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFJlY29yZHMgYW4gaTE4biBwYXJhbSB2YWx1ZSBmb3IgdGhlIHN0YXJ0IG9mIGFuIGVsZW1lbnQuXG4gKi9cbmZ1bmN0aW9uIHJlY29yZEVsZW1lbnRTdGFydChcbiAgICBvcDogaXIuRWxlbWVudFN0YXJ0T3B8aXIuUHJvamVjdGlvbk9wLCBpMThuQ29udGV4dDogaXIuSTE4bkNvbnRleHRPcCwgaTE4bkJsb2NrOiBpci5JMThuU3RhcnRPcCxcbiAgICBzdHJ1Y3R1cmFsRGlyZWN0aXZlPzogaXIuVGVtcGxhdGVPcCkge1xuICBjb25zdCB7c3RhcnROYW1lLCBjbG9zZU5hbWV9ID0gb3AuaTE4blBsYWNlaG9sZGVyITtcbiAgbGV0IGZsYWdzID0gaXIuSTE4blBhcmFtVmFsdWVGbGFncy5FbGVtZW50VGFnIHwgaXIuSTE4blBhcmFtVmFsdWVGbGFncy5PcGVuVGFnO1xuICBsZXQgdmFsdWU6IGlyLkkxOG5QYXJhbVZhbHVlWyd2YWx1ZSddID0gb3AuaGFuZGxlLnNsb3QhO1xuICAvLyBJZiB0aGUgZWxlbWVudCBpcyBhc3NvY2lhdGVkIHdpdGggYSBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSwgc3RhcnQgaXQgYXMgd2VsbC5cbiAgaWYgKHN0cnVjdHVyYWxEaXJlY3RpdmUgIT09IHVuZGVmaW5lZCkge1xuICAgIGZsYWdzIHw9IGlyLkkxOG5QYXJhbVZhbHVlRmxhZ3MuVGVtcGxhdGVUYWc7XG4gICAgdmFsdWUgPSB7ZWxlbWVudDogdmFsdWUsIHRlbXBsYXRlOiBzdHJ1Y3R1cmFsRGlyZWN0aXZlLmhhbmRsZS5zbG90IX07XG4gIH1cbiAgLy8gRm9yIHNlbGYtY2xvc2luZyB0YWdzLCB0aGVyZSBpcyBubyBjbG9zZSB0YWcgcGxhY2Vob2xkZXIuIEluc3RlYWQsIHRoZSBzdGFydCB0YWdcbiAgLy8gcGxhY2Vob2xkZXIgYWNjb3VudHMgZm9yIHRoZSBzdGFydCBhbmQgY2xvc2Ugb2YgdGhlIGVsZW1lbnQuXG4gIGlmICghY2xvc2VOYW1lKSB7XG4gICAgZmxhZ3MgfD0gaXIuSTE4blBhcmFtVmFsdWVGbGFncy5DbG9zZVRhZztcbiAgfVxuICBhZGRQYXJhbShpMThuQ29udGV4dC5wYXJhbXMsIHN0YXJ0TmFtZSwgdmFsdWUsIGkxOG5CbG9jay5zdWJUZW1wbGF0ZUluZGV4LCBmbGFncyk7XG59XG5cbi8qKlxuICogUmVjb3JkcyBhbiBpMThuIHBhcmFtIHZhbHVlIGZvciB0aGUgY2xvc2luZyBvZiBhbiBlbGVtZW50LlxuICovXG5mdW5jdGlvbiByZWNvcmRFbGVtZW50Q2xvc2UoXG4gICAgb3A6IGlyLkVsZW1lbnRTdGFydE9wfGlyLlByb2plY3Rpb25PcCwgaTE4bkNvbnRleHQ6IGlyLkkxOG5Db250ZXh0T3AsIGkxOG5CbG9jazogaXIuSTE4blN0YXJ0T3AsXG4gICAgc3RydWN0dXJhbERpcmVjdGl2ZT86IGlyLlRlbXBsYXRlT3ApIHtcbiAgY29uc3Qge2Nsb3NlTmFtZX0gPSBvcC5pMThuUGxhY2Vob2xkZXIhO1xuICAvLyBTZWxmLWNsb3NpbmcgdGFncyBkb24ndCBoYXZlIGEgY2xvc2luZyB0YWcgcGxhY2Vob2xkZXIsIGluc3RlYWQgdGhlIGVsZW1lbnQgY2xvc2luZyBpc1xuICAvLyByZWNvcmRlZCB2aWEgYW4gYWRkaXRpb25hbCBmbGFnIG9uIHRoZSBlbGVtZW50IHN0YXJ0IHZhbHVlLlxuICBpZiAoY2xvc2VOYW1lKSB7XG4gICAgbGV0IGZsYWdzID0gaXIuSTE4blBhcmFtVmFsdWVGbGFncy5FbGVtZW50VGFnIHwgaXIuSTE4blBhcmFtVmFsdWVGbGFncy5DbG9zZVRhZztcbiAgICBsZXQgdmFsdWU6IGlyLkkxOG5QYXJhbVZhbHVlWyd2YWx1ZSddID0gb3AuaGFuZGxlLnNsb3QhO1xuICAgIC8vIElmIHRoZSBlbGVtZW50IGlzIGFzc29jaWF0ZWQgd2l0aCBhIHN0cnVjdHVyYWwgZGlyZWN0aXZlLCBjbG9zZSBpdCBhcyB3ZWxsLlxuICAgIGlmIChzdHJ1Y3R1cmFsRGlyZWN0aXZlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGZsYWdzIHw9IGlyLkkxOG5QYXJhbVZhbHVlRmxhZ3MuVGVtcGxhdGVUYWc7XG4gICAgICB2YWx1ZSA9IHtlbGVtZW50OiB2YWx1ZSwgdGVtcGxhdGU6IHN0cnVjdHVyYWxEaXJlY3RpdmUuaGFuZGxlLnNsb3QhfTtcbiAgICB9XG4gICAgYWRkUGFyYW0oaTE4bkNvbnRleHQucGFyYW1zLCBjbG9zZU5hbWUsIHZhbHVlLCBpMThuQmxvY2suc3ViVGVtcGxhdGVJbmRleCwgZmxhZ3MpO1xuICB9XG59XG5cbi8qKlxuICogUmVjb3JkcyBhbiBpMThuIHBhcmFtIHZhbHVlIGZvciB0aGUgc3RhcnQgb2YgYSB0ZW1wbGF0ZS5cbiAqL1xuZnVuY3Rpb24gcmVjb3JkVGVtcGxhdGVTdGFydChcbiAgICBqb2I6IENvbXBvbmVudENvbXBpbGF0aW9uSm9iLCBvcDogaXIuVGVtcGxhdGVPcCwgaTE4bkNvbnRleHQ6IGlyLkkxOG5Db250ZXh0T3AsXG4gICAgaTE4bkJsb2NrOiBpci5JMThuU3RhcnRPcCwgc3RydWN0dXJhbERpcmVjdGl2ZT86IGlyLlRlbXBsYXRlT3ApIHtcbiAgbGV0IHtzdGFydE5hbWUsIGNsb3NlTmFtZX0gPSBvcC5pMThuUGxhY2Vob2xkZXIhO1xuICBsZXQgZmxhZ3MgPSBpci5JMThuUGFyYW1WYWx1ZUZsYWdzLlRlbXBsYXRlVGFnIHwgaXIuSTE4blBhcmFtVmFsdWVGbGFncy5PcGVuVGFnO1xuICAvLyBGb3Igc2VsZi1jbG9zaW5nIHRhZ3MsIHRoZXJlIGlzIG5vIGNsb3NlIHRhZyBwbGFjZWhvbGRlci4gSW5zdGVhZCwgdGhlIHN0YXJ0IHRhZ1xuICAvLyBwbGFjZWhvbGRlciBhY2NvdW50cyBmb3IgdGhlIHN0YXJ0IGFuZCBjbG9zZSBvZiB0aGUgZWxlbWVudC5cbiAgaWYgKCFjbG9zZU5hbWUpIHtcbiAgICBmbGFncyB8PSBpci5JMThuUGFyYW1WYWx1ZUZsYWdzLkNsb3NlVGFnO1xuICB9XG4gIC8vIElmIHRoZSB0ZW1wbGF0ZSBpcyBhc3NvY2lhdGVkIHdpdGggYSBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSwgcmVjb3JkIHRoZSBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSdzXG4gIC8vIHN0YXJ0IGZpcnN0LiBTaW5jZSB0aGlzIHRlbXBsYXRlIG11c3QgYmUgaW4gdGhlIHN0cnVjdHVyYWwgZGlyZWN0aXZlJ3Mgdmlldywgd2UgY2FuIGp1c3RcbiAgLy8gZGlyZWN0bHkgdXNlIHRoZSBjdXJyZW50IGkxOG4gYmxvY2sncyBzdWItdGVtcGxhdGUgaW5kZXguXG4gIGlmIChzdHJ1Y3R1cmFsRGlyZWN0aXZlICE9PSB1bmRlZmluZWQpIHtcbiAgICBhZGRQYXJhbShcbiAgICAgICAgaTE4bkNvbnRleHQucGFyYW1zLCBzdGFydE5hbWUsIHN0cnVjdHVyYWxEaXJlY3RpdmUuaGFuZGxlLnNsb3QhLCBpMThuQmxvY2suc3ViVGVtcGxhdGVJbmRleCxcbiAgICAgICAgZmxhZ3MpO1xuICB9XG4gIC8vIFJlY29yZCB0aGUgc3RhcnQgb2YgdGhlIHRlbXBsYXRlLiBGb3IgdGhlIHN1Yi10ZW1wbGF0ZSBpbmRleCwgcGFzcyB0aGUgaW5kZXggZm9yIHRoZSB0ZW1wbGF0ZSdzXG4gIC8vIHZpZXcsIHJhdGhlciB0aGFuIHRoZSBjdXJyZW50IGkxOG4gYmxvY2sncyBpbmRleC5cbiAgYWRkUGFyYW0oXG4gICAgICBpMThuQ29udGV4dC5wYXJhbXMsIHN0YXJ0TmFtZSwgb3AuaGFuZGxlLnNsb3QhLFxuICAgICAgZ2V0U3ViVGVtcGxhdGVJbmRleEZvclRlbXBsYXRlVGFnKGpvYiwgaTE4bkJsb2NrLCBvcCksIGZsYWdzKTtcbn1cblxuLyoqXG4gKiBSZWNvcmRzIGFuIGkxOG4gcGFyYW0gdmFsdWUgZm9yIHRoZSBjbG9zaW5nIG9mIGEgdGVtcGxhdGUuXG4gKi9cbmZ1bmN0aW9uIHJlY29yZFRlbXBsYXRlQ2xvc2UoXG4gICAgam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYiwgb3A6IGlyLlRlbXBsYXRlT3AsIGkxOG5Db250ZXh0OiBpci5JMThuQ29udGV4dE9wLFxuICAgIGkxOG5CbG9jazogaXIuSTE4blN0YXJ0T3AsIHN0cnVjdHVyYWxEaXJlY3RpdmU/OiBpci5UZW1wbGF0ZU9wKSB7XG4gIGNvbnN0IHtzdGFydE5hbWUsIGNsb3NlTmFtZX0gPSBvcC5pMThuUGxhY2Vob2xkZXIhO1xuICBjb25zdCBmbGFncyA9IGlyLkkxOG5QYXJhbVZhbHVlRmxhZ3MuVGVtcGxhdGVUYWcgfCBpci5JMThuUGFyYW1WYWx1ZUZsYWdzLkNsb3NlVGFnO1xuICAvLyBTZWxmLWNsb3NpbmcgdGFncyBkb24ndCBoYXZlIGEgY2xvc2luZyB0YWcgcGxhY2Vob2xkZXIsIGluc3RlYWQgdGhlIHRlbXBsYXRlJ3MgY2xvc2luZyBpc1xuICAvLyByZWNvcmRlZCB2aWEgYW4gYWRkaXRpb25hbCBmbGFnIG9uIHRoZSB0ZW1wbGF0ZSBzdGFydCB2YWx1ZS5cbiAgaWYgKGNsb3NlTmFtZSkge1xuICAgIC8vIFJlY29yZCB0aGUgY2xvc2luZyBvZiB0aGUgdGVtcGxhdGUuIEZvciB0aGUgc3ViLXRlbXBsYXRlIGluZGV4LCBwYXNzIHRoZSBpbmRleCBmb3IgdGhlXG4gICAgLy8gdGVtcGxhdGUncyB2aWV3LCByYXRoZXIgdGhhbiB0aGUgY3VycmVudCBpMThuIGJsb2NrJ3MgaW5kZXguXG4gICAgYWRkUGFyYW0oXG4gICAgICAgIGkxOG5Db250ZXh0LnBhcmFtcywgY2xvc2VOYW1lLCBvcC5oYW5kbGUuc2xvdCEsXG4gICAgICAgIGdldFN1YlRlbXBsYXRlSW5kZXhGb3JUZW1wbGF0ZVRhZyhqb2IsIGkxOG5CbG9jaywgb3ApLCBmbGFncyk7XG4gICAgLy8gSWYgdGhlIHRlbXBsYXRlIGlzIGFzc29jaWF0ZWQgd2l0aCBhIHN0cnVjdHVyYWwgZGlyZWN0aXZlLCByZWNvcmQgdGhlIHN0cnVjdHVyYWwgZGlyZWN0aXZlJ3NcbiAgICAvLyBjbG9zaW5nIGFmdGVyLiBTaW5jZSB0aGlzIHRlbXBsYXRlIG11c3QgYmUgaW4gdGhlIHN0cnVjdHVyYWwgZGlyZWN0aXZlJ3Mgdmlldywgd2UgY2FuIGp1c3RcbiAgICAvLyBkaXJlY3RseSB1c2UgdGhlIGN1cnJlbnQgaTE4biBibG9jaydzIHN1Yi10ZW1wbGF0ZSBpbmRleC5cbiAgICBpZiAoc3RydWN0dXJhbERpcmVjdGl2ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBhZGRQYXJhbShcbiAgICAgICAgICBpMThuQ29udGV4dC5wYXJhbXMsIGNsb3NlTmFtZSwgc3RydWN0dXJhbERpcmVjdGl2ZS5oYW5kbGUuc2xvdCEsXG4gICAgICAgICAgaTE4bkJsb2NrLnN1YlRlbXBsYXRlSW5kZXgsIGZsYWdzKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBHZXQgdGhlIHN1YlRlbXBsYXRlSW5kZXggZm9yIHRoZSBnaXZlbiB0ZW1wbGF0ZSBvcC4gRm9yIHRlbXBsYXRlIG9wcywgdXNlIHRoZSBzdWJUZW1wbGF0ZUluZGV4IG9mXG4gKiB0aGUgY2hpbGQgaTE4biBibG9jayBpbnNpZGUgdGhlIHRlbXBsYXRlLlxuICovXG5mdW5jdGlvbiBnZXRTdWJUZW1wbGF0ZUluZGV4Rm9yVGVtcGxhdGVUYWcoXG4gICAgam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYiwgaTE4bk9wOiBpci5JMThuU3RhcnRPcCwgb3A6IGlyLlRlbXBsYXRlT3ApOiBudW1iZXJ8bnVsbCB7XG4gIGZvciAoY29uc3QgY2hpbGRPcCBvZiBqb2Iudmlld3MuZ2V0KG9wLnhyZWYpIS5jcmVhdGUpIHtcbiAgICBpZiAoY2hpbGRPcC5raW5kID09PSBpci5PcEtpbmQuSTE4blN0YXJ0KSB7XG4gICAgICByZXR1cm4gY2hpbGRPcC5zdWJUZW1wbGF0ZUluZGV4O1xuICAgIH1cbiAgfVxuICByZXR1cm4gaTE4bk9wLnN1YlRlbXBsYXRlSW5kZXg7XG59XG5cbi8qKlxuICogQWRkIGEgcGFyYW0gdmFsdWUgdG8gdGhlIGdpdmVuIHBhcmFtcyBtYXAuXG4gKi9cbmZ1bmN0aW9uIGFkZFBhcmFtKFxuICAgIHBhcmFtczogTWFwPHN0cmluZywgaXIuSTE4blBhcmFtVmFsdWVbXT4sIHBsYWNlaG9sZGVyOiBzdHJpbmcsXG4gICAgdmFsdWU6IHN0cmluZ3xudW1iZXJ8e2VsZW1lbnQ6IG51bWJlciwgdGVtcGxhdGU6IG51bWJlcn0sIHN1YlRlbXBsYXRlSW5kZXg6IG51bWJlcnxudWxsLFxuICAgIGZsYWdzOiBpci5JMThuUGFyYW1WYWx1ZUZsYWdzKSB7XG4gIGNvbnN0IHZhbHVlcyA9IHBhcmFtcy5nZXQocGxhY2Vob2xkZXIpID8/IFtdO1xuICB2YWx1ZXMucHVzaCh7dmFsdWUsIHN1YlRlbXBsYXRlSW5kZXgsIGZsYWdzfSk7XG4gIHBhcmFtcy5zZXQocGxhY2Vob2xkZXIsIHZhbHVlcyk7XG59XG4iXX0=