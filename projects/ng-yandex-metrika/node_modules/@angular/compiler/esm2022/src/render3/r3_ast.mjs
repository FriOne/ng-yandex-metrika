/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
/**
 * This is an R3 `Node`-like wrapper for a raw `html.Comment` node. We do not currently
 * require the implementation of a visitor for Comments as they are only collected at
 * the top-level of the R3 AST, and only if `Render3ParseOptions['collectCommentNodes']`
 * is true.
 */
export class Comment {
    constructor(value, sourceSpan) {
        this.value = value;
        this.sourceSpan = sourceSpan;
    }
    visit(_visitor) {
        throw new Error('visit() not implemented for Comment');
    }
}
export class Text {
    constructor(value, sourceSpan) {
        this.value = value;
        this.sourceSpan = sourceSpan;
    }
    visit(visitor) {
        return visitor.visitText(this);
    }
}
export class BoundText {
    constructor(value, sourceSpan, i18n) {
        this.value = value;
        this.sourceSpan = sourceSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitBoundText(this);
    }
}
/**
 * Represents a text attribute in the template.
 *
 * `valueSpan` may not be present in cases where there is no value `<div a></div>`.
 * `keySpan` may also not be present for synthetic attributes from ICU expansions.
 */
export class TextAttribute {
    constructor(name, value, sourceSpan, keySpan, valueSpan, i18n) {
        this.name = name;
        this.value = value;
        this.sourceSpan = sourceSpan;
        this.keySpan = keySpan;
        this.valueSpan = valueSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitTextAttribute(this);
    }
}
export class BoundAttribute {
    constructor(name, type, securityContext, value, unit, sourceSpan, keySpan, valueSpan, i18n) {
        this.name = name;
        this.type = type;
        this.securityContext = securityContext;
        this.value = value;
        this.unit = unit;
        this.sourceSpan = sourceSpan;
        this.keySpan = keySpan;
        this.valueSpan = valueSpan;
        this.i18n = i18n;
    }
    static fromBoundElementProperty(prop, i18n) {
        if (prop.keySpan === undefined) {
            throw new Error(`Unexpected state: keySpan must be defined for bound attributes but was not for ${prop.name}: ${prop.sourceSpan}`);
        }
        return new BoundAttribute(prop.name, prop.type, prop.securityContext, prop.value, prop.unit, prop.sourceSpan, prop.keySpan, prop.valueSpan, i18n);
    }
    visit(visitor) {
        return visitor.visitBoundAttribute(this);
    }
}
export class BoundEvent {
    constructor(name, type, handler, target, phase, sourceSpan, handlerSpan, keySpan) {
        this.name = name;
        this.type = type;
        this.handler = handler;
        this.target = target;
        this.phase = phase;
        this.sourceSpan = sourceSpan;
        this.handlerSpan = handlerSpan;
        this.keySpan = keySpan;
    }
    static fromParsedEvent(event) {
        const target = event.type === 0 /* ParsedEventType.Regular */ ? event.targetOrPhase : null;
        const phase = event.type === 1 /* ParsedEventType.Animation */ ? event.targetOrPhase : null;
        if (event.keySpan === undefined) {
            throw new Error(`Unexpected state: keySpan must be defined for bound event but was not for ${event.name}: ${event.sourceSpan}`);
        }
        return new BoundEvent(event.name, event.type, event.handler, target, phase, event.sourceSpan, event.handlerSpan, event.keySpan);
    }
    visit(visitor) {
        return visitor.visitBoundEvent(this);
    }
}
export class Element {
    constructor(name, attributes, inputs, outputs, children, references, sourceSpan, startSourceSpan, endSourceSpan, i18n) {
        this.name = name;
        this.attributes = attributes;
        this.inputs = inputs;
        this.outputs = outputs;
        this.children = children;
        this.references = references;
        this.sourceSpan = sourceSpan;
        this.startSourceSpan = startSourceSpan;
        this.endSourceSpan = endSourceSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitElement(this);
    }
}
export class DeferredTrigger {
    constructor(nameSpan, sourceSpan, prefetchSpan, whenOrOnSourceSpan) {
        this.nameSpan = nameSpan;
        this.sourceSpan = sourceSpan;
        this.prefetchSpan = prefetchSpan;
        this.whenOrOnSourceSpan = whenOrOnSourceSpan;
    }
    visit(visitor) {
        return visitor.visitDeferredTrigger(this);
    }
}
export class BoundDeferredTrigger extends DeferredTrigger {
    constructor(value, sourceSpan, prefetchSpan, whenSourceSpan) {
        // BoundDeferredTrigger is for 'when' triggers. These aren't really "triggers" and don't have a
        // nameSpan. Trigger names are the built in event triggers like hover, interaction, etc.
        super(/** nameSpan */ null, sourceSpan, prefetchSpan, whenSourceSpan);
        this.value = value;
    }
}
export class IdleDeferredTrigger extends DeferredTrigger {
}
export class ImmediateDeferredTrigger extends DeferredTrigger {
}
export class HoverDeferredTrigger extends DeferredTrigger {
    constructor(reference, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
        super(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
        this.reference = reference;
    }
}
export class TimerDeferredTrigger extends DeferredTrigger {
    constructor(delay, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
        super(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
        this.delay = delay;
    }
}
export class InteractionDeferredTrigger extends DeferredTrigger {
    constructor(reference, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
        super(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
        this.reference = reference;
    }
}
export class ViewportDeferredTrigger extends DeferredTrigger {
    constructor(reference, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
        super(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
        this.reference = reference;
    }
}
export class BlockNode {
    constructor(nameSpan, sourceSpan, startSourceSpan, endSourceSpan) {
        this.nameSpan = nameSpan;
        this.sourceSpan = sourceSpan;
        this.startSourceSpan = startSourceSpan;
        this.endSourceSpan = endSourceSpan;
    }
}
export class DeferredBlockPlaceholder extends BlockNode {
    constructor(children, minimumTime, nameSpan, sourceSpan, startSourceSpan, endSourceSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.children = children;
        this.minimumTime = minimumTime;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitDeferredBlockPlaceholder(this);
    }
}
export class DeferredBlockLoading extends BlockNode {
    constructor(children, afterTime, minimumTime, nameSpan, sourceSpan, startSourceSpan, endSourceSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.children = children;
        this.afterTime = afterTime;
        this.minimumTime = minimumTime;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitDeferredBlockLoading(this);
    }
}
export class DeferredBlockError extends BlockNode {
    constructor(children, nameSpan, sourceSpan, startSourceSpan, endSourceSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.children = children;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitDeferredBlockError(this);
    }
}
export class DeferredBlock extends BlockNode {
    constructor(children, triggers, prefetchTriggers, placeholder, loading, error, nameSpan, sourceSpan, mainBlockSpan, startSourceSpan, endSourceSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.children = children;
        this.placeholder = placeholder;
        this.loading = loading;
        this.error = error;
        this.mainBlockSpan = mainBlockSpan;
        this.i18n = i18n;
        this.triggers = triggers;
        this.prefetchTriggers = prefetchTriggers;
        // We cache the keys since we know that they won't change and we
        // don't want to enumarate them every time we're traversing the AST.
        this.definedTriggers = Object.keys(triggers);
        this.definedPrefetchTriggers = Object.keys(prefetchTriggers);
    }
    visit(visitor) {
        return visitor.visitDeferredBlock(this);
    }
    visitAll(visitor) {
        this.visitTriggers(this.definedTriggers, this.triggers, visitor);
        this.visitTriggers(this.definedPrefetchTriggers, this.prefetchTriggers, visitor);
        visitAll(visitor, this.children);
        const remainingBlocks = [this.placeholder, this.loading, this.error].filter(x => x !== null);
        visitAll(visitor, remainingBlocks);
    }
    visitTriggers(keys, triggers, visitor) {
        visitAll(visitor, keys.map(k => triggers[k]));
    }
}
export class SwitchBlock extends BlockNode {
    constructor(expression, cases, 
    /**
     * These blocks are only captured to allow for autocompletion in the language service. They
     * aren't meant to be processed in any other way.
     */
    unknownBlocks, sourceSpan, startSourceSpan, endSourceSpan, nameSpan) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.expression = expression;
        this.cases = cases;
        this.unknownBlocks = unknownBlocks;
    }
    visit(visitor) {
        return visitor.visitSwitchBlock(this);
    }
}
export class SwitchBlockCase extends BlockNode {
    constructor(expression, children, sourceSpan, startSourceSpan, endSourceSpan, nameSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.expression = expression;
        this.children = children;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitSwitchBlockCase(this);
    }
}
export class ForLoopBlock extends BlockNode {
    constructor(item, expression, trackBy, trackKeywordSpan, contextVariables, children, empty, sourceSpan, mainBlockSpan, startSourceSpan, endSourceSpan, nameSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.item = item;
        this.expression = expression;
        this.trackBy = trackBy;
        this.trackKeywordSpan = trackKeywordSpan;
        this.contextVariables = contextVariables;
        this.children = children;
        this.empty = empty;
        this.mainBlockSpan = mainBlockSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitForLoopBlock(this);
    }
}
export class ForLoopBlockEmpty extends BlockNode {
    constructor(children, sourceSpan, startSourceSpan, endSourceSpan, nameSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.children = children;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitForLoopBlockEmpty(this);
    }
}
export class IfBlock extends BlockNode {
    constructor(branches, sourceSpan, startSourceSpan, endSourceSpan, nameSpan) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.branches = branches;
    }
    visit(visitor) {
        return visitor.visitIfBlock(this);
    }
}
export class IfBlockBranch extends BlockNode {
    constructor(expression, children, expressionAlias, sourceSpan, startSourceSpan, endSourceSpan, nameSpan, i18n) {
        super(nameSpan, sourceSpan, startSourceSpan, endSourceSpan);
        this.expression = expression;
        this.children = children;
        this.expressionAlias = expressionAlias;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitIfBlockBranch(this);
    }
}
export class UnknownBlock {
    constructor(name, sourceSpan, nameSpan) {
        this.name = name;
        this.sourceSpan = sourceSpan;
        this.nameSpan = nameSpan;
    }
    visit(visitor) {
        return visitor.visitUnknownBlock(this);
    }
}
export class Template {
    constructor(
    // tagName is the name of the container element, if applicable.
    // `null` is a special case for when there is a structural directive on an `ng-template` so
    // the renderer can differentiate between the synthetic template and the one written in the
    // file.
    tagName, attributes, inputs, outputs, templateAttrs, children, references, variables, sourceSpan, startSourceSpan, endSourceSpan, i18n) {
        this.tagName = tagName;
        this.attributes = attributes;
        this.inputs = inputs;
        this.outputs = outputs;
        this.templateAttrs = templateAttrs;
        this.children = children;
        this.references = references;
        this.variables = variables;
        this.sourceSpan = sourceSpan;
        this.startSourceSpan = startSourceSpan;
        this.endSourceSpan = endSourceSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitTemplate(this);
    }
}
export class Content {
    constructor(selector, attributes, sourceSpan, i18n) {
        this.selector = selector;
        this.attributes = attributes;
        this.sourceSpan = sourceSpan;
        this.i18n = i18n;
        this.name = 'ng-content';
    }
    visit(visitor) {
        return visitor.visitContent(this);
    }
}
export class Variable {
    constructor(name, value, sourceSpan, keySpan, valueSpan) {
        this.name = name;
        this.value = value;
        this.sourceSpan = sourceSpan;
        this.keySpan = keySpan;
        this.valueSpan = valueSpan;
    }
    visit(visitor) {
        return visitor.visitVariable(this);
    }
}
export class Reference {
    constructor(name, value, sourceSpan, keySpan, valueSpan) {
        this.name = name;
        this.value = value;
        this.sourceSpan = sourceSpan;
        this.keySpan = keySpan;
        this.valueSpan = valueSpan;
    }
    visit(visitor) {
        return visitor.visitReference(this);
    }
}
export class Icu {
    constructor(vars, placeholders, sourceSpan, i18n) {
        this.vars = vars;
        this.placeholders = placeholders;
        this.sourceSpan = sourceSpan;
        this.i18n = i18n;
    }
    visit(visitor) {
        return visitor.visitIcu(this);
    }
}
export class RecursiveVisitor {
    visitElement(element) {
        visitAll(this, element.attributes);
        visitAll(this, element.inputs);
        visitAll(this, element.outputs);
        visitAll(this, element.children);
        visitAll(this, element.references);
    }
    visitTemplate(template) {
        visitAll(this, template.attributes);
        visitAll(this, template.inputs);
        visitAll(this, template.outputs);
        visitAll(this, template.children);
        visitAll(this, template.references);
        visitAll(this, template.variables);
    }
    visitDeferredBlock(deferred) {
        deferred.visitAll(this);
    }
    visitDeferredBlockPlaceholder(block) {
        visitAll(this, block.children);
    }
    visitDeferredBlockError(block) {
        visitAll(this, block.children);
    }
    visitDeferredBlockLoading(block) {
        visitAll(this, block.children);
    }
    visitSwitchBlock(block) {
        visitAll(this, block.cases);
    }
    visitSwitchBlockCase(block) {
        visitAll(this, block.children);
    }
    visitForLoopBlock(block) {
        const blockItems = [block.item, ...Object.values(block.contextVariables), ...block.children];
        block.empty && blockItems.push(block.empty);
        visitAll(this, blockItems);
    }
    visitForLoopBlockEmpty(block) {
        visitAll(this, block.children);
    }
    visitIfBlock(block) {
        visitAll(this, block.branches);
    }
    visitIfBlockBranch(block) {
        const blockItems = block.children;
        block.expressionAlias && blockItems.push(block.expressionAlias);
        visitAll(this, blockItems);
    }
    visitContent(content) { }
    visitVariable(variable) { }
    visitReference(reference) { }
    visitTextAttribute(attribute) { }
    visitBoundAttribute(attribute) { }
    visitBoundEvent(attribute) { }
    visitText(text) { }
    visitBoundText(text) { }
    visitIcu(icu) { }
    visitDeferredTrigger(trigger) { }
    visitUnknownBlock(block) { }
}
export function visitAll(visitor, nodes) {
    const result = [];
    if (visitor.visit) {
        for (const node of nodes) {
            visitor.visit(node) || node.visit(visitor);
        }
    }
    else {
        for (const node of nodes) {
            const newNode = node.visit(visitor);
            if (newNode) {
                result.push(newNode);
            }
        }
    }
    return result;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicjNfYXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3JlbmRlcjMvcjNfYXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQVlIOzs7OztHQUtHO0FBQ0gsTUFBTSxPQUFPLE9BQU87SUFDbEIsWUFBbUIsS0FBYSxFQUFTLFVBQTJCO1FBQWpELFVBQUssR0FBTCxLQUFLLENBQVE7UUFBUyxlQUFVLEdBQVYsVUFBVSxDQUFpQjtJQUFHLENBQUM7SUFDeEUsS0FBSyxDQUFTLFFBQXlCO1FBQ3JDLE1BQU0sSUFBSSxLQUFLLENBQUMscUNBQXFDLENBQUMsQ0FBQztJQUN6RCxDQUFDO0NBQ0Y7QUFFRCxNQUFNLE9BQU8sSUFBSTtJQUNmLFlBQW1CLEtBQWEsRUFBUyxVQUEyQjtRQUFqRCxVQUFLLEdBQUwsS0FBSyxDQUFRO1FBQVMsZUFBVSxHQUFWLFVBQVUsQ0FBaUI7SUFBRyxDQUFDO0lBQ3hFLEtBQUssQ0FBUyxPQUF3QjtRQUNwQyxPQUFPLE9BQU8sQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7SUFDakMsQ0FBQztDQUNGO0FBRUQsTUFBTSxPQUFPLFNBQVM7SUFDcEIsWUFBbUIsS0FBVSxFQUFTLFVBQTJCLEVBQVMsSUFBZTtRQUF0RSxVQUFLLEdBQUwsS0FBSyxDQUFLO1FBQVMsZUFBVSxHQUFWLFVBQVUsQ0FBaUI7UUFBUyxTQUFJLEdBQUosSUFBSSxDQUFXO0lBQUcsQ0FBQztJQUM3RixLQUFLLENBQVMsT0FBd0I7UUFDcEMsT0FBTyxPQUFPLENBQUMsY0FBYyxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3RDLENBQUM7Q0FDRjtBQUVEOzs7OztHQUtHO0FBQ0gsTUFBTSxPQUFPLGFBQWE7SUFDeEIsWUFDVyxJQUFZLEVBQVMsS0FBYSxFQUFTLFVBQTJCLEVBQ3BFLE9BQWtDLEVBQVMsU0FBMkIsRUFDeEUsSUFBZTtRQUZmLFNB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UyxDQUFDO0lBQzFDLGNBQWMsQ0FBQyxTQUFvQixJQUFTLENBQUM7SUFDN0Msa0JBQWtCLENBQUMsU0FBd0IsSUFBUyxDQUFDO0lBQ3JELG1CQUFtQixDQUFDLFNBQXlCLElBQVMsQ0FBQztJQUN2RCxlQUFlLENBQUMsU0FBcUIsSUFBUyxDQUFDO0lBQy9DLFNBQVMsQ0FBQyxJQUFVLElBQVMsQ0FBQztJQUM5QixjQUFjLENBQUMsSUFBZSxJQUFTLENBQUM7SUFDeEMsUUFBUSxDQUFDLEdBQVEsSUFBUyxDQUFDO0lBQzNCLG9CQUFvQixDQUFDLE9BQXdCLElBQVMsQ0FBQztJQUN2RCxpQkFBaUIsQ0FBQyxLQUFtQixJQUFTLENBQUM7Q0FDaEQ7QUFHRCxNQUFNLFVBQVUsUUFBUSxDQUFTLE9BQXdCLEVBQUUsS0FBYTtJQUN0RSxNQUFNLE1BQU0sR0FBYSxFQUFFLENBQUM7SUFDNUIsSUFBSSxPQUFPLENBQUMsS0FBSyxFQUFFO1FBQ2pCLEtBQUssTUFBTSxJQUFJLElBQUksS0FBSyxFQUFFO1lBQ3hCLE9BQU8sQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsQ0FBQztTQUM1QztLQUNGO1NBQU07UUFDTCxLQUFLLE1BQU0sSUFBSSxJQUFJLEtBQUssRUFBRTtZQUN4QixNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBQ3BDLElBQUksT0FBTyxFQUFFO2dCQUNYLE1BQU0sQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7YUFDdEI7U0FDRjtLQUNGO0lBQ0QsT0FBTyxNQUFNLENBQUM7QUFDaEIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge1NlY3VyaXR5Q29udGV4dH0gZnJvbSAnLi4vY29yZSc7XG5pbXBvcnQge0FTVCwgQVNUV2l0aFNvdXJjZSwgQmluZGluZ1R5cGUsIEJvdW5kRWxlbWVudFByb3BlcnR5LCBQYXJzZWRFdmVudCwgUGFyc2VkRXZlbnRUeXBlfSBmcm9tICcuLi9leHByZXNzaW9uX3BhcnNlci9hc3QnO1xuaW1wb3J0IHtJMThuTWV0YX0gZnJvbSAnLi4vaTE4bi9pMThuX2FzdCc7XG5pbXBvcnQge1BhcnNlU291cmNlU3Bhbn0gZnJvbSAnLi4vcGFyc2VfdXRpbCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgTm9kZSB7XG4gIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbjtcbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQ7XG59XG5cbi8qKlxuICogVGhpcyBpcyBhbiBSMyBgTm9kZWAtbGlrZSB3cmFwcGVyIGZvciBhIHJhdyBgaHRtbC5Db21tZW50YCBub2RlLiBXZSBkbyBub3QgY3VycmVudGx5XG4gKiByZXF1aXJlIHRoZSBpbXBsZW1lbnRhdGlvbiBvZiBhIHZpc2l0b3IgZm9yIENvbW1lbnRzIGFzIHRoZXkgYXJlIG9ubHkgY29sbGVjdGVkIGF0XG4gKiB0aGUgdG9wLWxldmVsIG9mIHRoZSBSMyBBU1QsIGFuZCBvbmx5IGlmIGBSZW5kZXIzUGFyc2VPcHRpb25zWydjb2xsZWN0Q29tbWVudE5vZGVzJ11gXG4gKiBpcyB0cnVlLlxuICovXG5leHBvcnQgY2xhc3MgQ29tbWVudCBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IHN0cmluZywgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3Bhbikge31cbiAgdmlzaXQ8UmVzdWx0PihfdmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ3Zpc2l0KCkgbm90IGltcGxlbWVudGVkIGZvciBDb21tZW50Jyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRleHQgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IocHVibGljIHZhbHVlOiBzdHJpbmcsIHB1YmxpYyBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHt9XG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdFRleHQodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEJvdW5kVGV4dCBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgdmFsdWU6IEFTVCwgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgcHVibGljIGkxOG4/OiBJMThuTWV0YSkge31cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0Qm91bmRUZXh0KHRoaXMpO1xuICB9XG59XG5cbi8qKlxuICogUmVwcmVzZW50cyBhIHRleHQgYXR0cmlidXRlIGluIHRoZSB0ZW1wbGF0ZS5cbiAqXG4gKiBgdmFsdWVTcGFuYCBtYXkgbm90IGJlIHByZXNlbnQgaW4gY2FzZXMgd2hlcmUgdGhlcmUgaXMgbm8gdmFsdWUgYDxkaXYgYT48L2Rpdj5gLlxuICogYGtleVNwYW5gIG1heSBhbHNvIG5vdCBiZSBwcmVzZW50IGZvciBzeW50aGV0aWMgYXR0cmlidXRlcyBmcm9tIElDVSBleHBhbnNpb25zLlxuICovXG5leHBvcnQgY2xhc3MgVGV4dEF0dHJpYnV0ZSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogc3RyaW5nLCBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgcmVhZG9ubHkga2V5U3BhbjogUGFyc2VTb3VyY2VTcGFufHVuZGVmaW5lZCwgcHVibGljIHZhbHVlU3Bhbj86IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHB1YmxpYyBpMThuPzogSTE4bk1ldGEpIHt9XG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdFRleHRBdHRyaWJ1dGUodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEJvdW5kQXR0cmlidXRlIGltcGxlbWVudHMgTm9kZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIG5hbWU6IHN0cmluZywgcHVibGljIHR5cGU6IEJpbmRpbmdUeXBlLCBwdWJsaWMgc2VjdXJpdHlDb250ZXh0OiBTZWN1cml0eUNvbnRleHQsXG4gICAgICBwdWJsaWMgdmFsdWU6IEFTVCwgcHVibGljIHVuaXQ6IHN0cmluZ3xudWxsLCBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgcmVhZG9ubHkga2V5U3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgdmFsdWVTcGFuOiBQYXJzZVNvdXJjZVNwYW58dW5kZWZpbmVkLFxuICAgICAgcHVibGljIGkxOG46IEkxOG5NZXRhfHVuZGVmaW5lZCkge31cblxuICBzdGF0aWMgZnJvbUJvdW5kRWxlbWVudFByb3BlcnR5KHByb3A6IEJvdW5kRWxlbWVudFByb3BlcnR5LCBpMThuPzogSTE4bk1ldGEpOiBCb3VuZEF0dHJpYnV0ZSB7XG4gICAgaWYgKHByb3Aua2V5U3BhbiA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYFVuZXhwZWN0ZWQgc3RhdGU6IGtleVNwYW4gbXVzdCBiZSBkZWZpbmVkIGZvciBib3VuZCBhdHRyaWJ1dGVzIGJ1dCB3YXMgbm90IGZvciAke1xuICAgICAgICAgICAgICBwcm9wLm5hbWV9OiAke3Byb3Auc291cmNlU3Bhbn1gKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBCb3VuZEF0dHJpYnV0ZShcbiAgICAgICAgcHJvcC5uYW1lLCBwcm9wLnR5cGUsIHByb3Auc2VjdXJpdHlDb250ZXh0LCBwcm9wLnZhbHVlLCBwcm9wLnVuaXQsIHByb3Auc291cmNlU3BhbixcbiAgICAgICAgcHJvcC5rZXlTcGFuLCBwcm9wLnZhbHVlU3BhbiwgaTE4bik7XG4gIH1cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRCb3VuZEF0dHJpYnV0ZSh0aGlzKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgQm91bmRFdmVudCBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB0eXBlOiBQYXJzZWRFdmVudFR5cGUsIHB1YmxpYyBoYW5kbGVyOiBBU1QsXG4gICAgICBwdWJsaWMgdGFyZ2V0OiBzdHJpbmd8bnVsbCwgcHVibGljIHBoYXNlOiBzdHJpbmd8bnVsbCwgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHB1YmxpYyBoYW5kbGVyU3BhbjogUGFyc2VTb3VyY2VTcGFuLCByZWFkb25seSBrZXlTcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHt9XG5cbiAgc3RhdGljIGZyb21QYXJzZWRFdmVudChldmVudDogUGFyc2VkRXZlbnQpIHtcbiAgICBjb25zdCB0YXJnZXQ6IHN0cmluZ3xudWxsID0gZXZlbnQudHlwZSA9PT0gUGFyc2VkRXZlbnRUeXBlLlJlZ3VsYXIgPyBldmVudC50YXJnZXRPclBoYXNlIDogbnVsbDtcbiAgICBjb25zdCBwaGFzZTogc3RyaW5nfG51bGwgPVxuICAgICAgICBldmVudC50eXBlID09PSBQYXJzZWRFdmVudFR5cGUuQW5pbWF0aW9uID8gZXZlbnQudGFyZ2V0T3JQaGFzZSA6IG51bGw7XG4gICAgaWYgKGV2ZW50LmtleVNwYW4gPT09IHVuZGVmaW5lZCkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbmV4cGVjdGVkIHN0YXRlOiBrZXlTcGFuIG11c3QgYmUgZGVmaW5lZCBmb3IgYm91bmQgZXZlbnQgYnV0IHdhcyBub3QgZm9yICR7XG4gICAgICAgICAgZXZlbnQubmFtZX06ICR7ZXZlbnQuc291cmNlU3Bhbn1gKTtcbiAgICB9XG4gICAgcmV0dXJuIG5ldyBCb3VuZEV2ZW50KFxuICAgICAgICBldmVudC5uYW1lLCBldmVudC50eXBlLCBldmVudC5oYW5kbGVyLCB0YXJnZXQsIHBoYXNlLCBldmVudC5zb3VyY2VTcGFuLCBldmVudC5oYW5kbGVyU3BhbixcbiAgICAgICAgZXZlbnQua2V5U3Bhbik7XG4gIH1cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRCb3VuZEV2ZW50KHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBFbGVtZW50IGltcGxlbWVudHMgTm9kZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIG5hbWU6IHN0cmluZywgcHVibGljIGF0dHJpYnV0ZXM6IFRleHRBdHRyaWJ1dGVbXSwgcHVibGljIGlucHV0czogQm91bmRBdHRyaWJ1dGVbXSxcbiAgICAgIHB1YmxpYyBvdXRwdXRzOiBCb3VuZEV2ZW50W10sIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBwdWJsaWMgcmVmZXJlbmNlczogUmVmZXJlbmNlW10sXG4gICAgICBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgc3RhcnRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBwdWJsaWMgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIHB1YmxpYyBpMThuPzogSTE4bk1ldGEpIHt9XG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdEVsZW1lbnQodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGFic3RyYWN0IGNsYXNzIERlZmVycmVkVHJpZ2dlciBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIHB1YmxpYyBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBwdWJsaWMgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgcHVibGljIHdoZW5Pck9uU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHt9XG5cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0RGVmZXJyZWRUcmlnZ2VyKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBCb3VuZERlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIHZhbHVlOiBBU1QsIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICAgIHdoZW5Tb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHtcbiAgICAvLyBCb3VuZERlZmVycmVkVHJpZ2dlciBpcyBmb3IgJ3doZW4nIHRyaWdnZXJzLiBUaGVzZSBhcmVuJ3QgcmVhbGx5IFwidHJpZ2dlcnNcIiBhbmQgZG9uJ3QgaGF2ZSBhXG4gICAgLy8gbmFtZVNwYW4uIFRyaWdnZXIgbmFtZXMgYXJlIHRoZSBidWlsdCBpbiBldmVudCB0cmlnZ2VycyBsaWtlIGhvdmVyLCBpbnRlcmFjdGlvbiwgZXRjLlxuICAgIHN1cGVyKC8qKiBuYW1lU3BhbiAqLyBudWxsLCBzb3VyY2VTcGFuLCBwcmVmZXRjaFNwYW4sIHdoZW5Tb3VyY2VTcGFuKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgSWRsZURlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7fVxuXG5leHBvcnQgY2xhc3MgSW1tZWRpYXRlRGVmZXJyZWRUcmlnZ2VyIGV4dGVuZHMgRGVmZXJyZWRUcmlnZ2VyIHt9XG5cbmV4cG9ydCBjbGFzcyBIb3ZlckRlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIHJlZmVyZW5jZTogc3RyaW5nfG51bGwsIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHByZWZldGNoU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIG9uU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBUaW1lckRlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIGRlbGF5OiBudW1iZXIsIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHByZWZldGNoU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIG9uU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBJbnRlcmFjdGlvbkRlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIHJlZmVyZW5jZTogc3RyaW5nfG51bGwsIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHByZWZldGNoU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIG9uU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBWaWV3cG9ydERlZmVycmVkVHJpZ2dlciBleHRlbmRzIERlZmVycmVkVHJpZ2dlciB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIHJlZmVyZW5jZTogc3RyaW5nfG51bGwsIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHByZWZldGNoU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIG9uU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBCbG9ja05vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgcHVibGljIHN0YXJ0U291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwpIHt9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXIgZXh0ZW5kcyBCbG9ja05vZGUgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgY2hpbGRyZW46IE5vZGVbXSwgcHVibGljIG1pbmltdW1UaW1lOiBudW1iZXJ8bnVsbCwgbmFtZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgcHVibGljIGkxOG4/OiBJMThuTWV0YSkge1xuICAgIHN1cGVyKG5hbWVTcGFuLCBzb3VyY2VTcGFuLCBzdGFydFNvdXJjZVNwYW4sIGVuZFNvdXJjZVNwYW4pO1xuICB9XG5cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0RGVmZXJyZWRCbG9ja1BsYWNlaG9sZGVyKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZlcnJlZEJsb2NrTG9hZGluZyBleHRlbmRzIEJsb2NrTm9kZSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBwdWJsaWMgYWZ0ZXJUaW1lOiBudW1iZXJ8bnVsbCwgcHVibGljIG1pbmltdW1UaW1lOiBudW1iZXJ8bnVsbCxcbiAgICAgIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgcHVibGljIGkxOG4/OiBJMThuTWV0YSkge1xuICAgIHN1cGVyKG5hbWVTcGFuLCBzb3VyY2VTcGFuLCBzdGFydFNvdXJjZVNwYW4sIGVuZFNvdXJjZVNwYW4pO1xuICB9XG5cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0RGVmZXJyZWRCbG9ja0xvYWRpbmcodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIERlZmVycmVkQmxvY2tFcnJvciBleHRlbmRzIEJsb2NrTm9kZSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBzdGFydFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsXG4gICAgICBwdWJsaWMgaTE4bj86IEkxOG5NZXRhKSB7XG4gICAgc3VwZXIobmFtZVNwYW4sIHNvdXJjZVNwYW4sIHN0YXJ0U291cmNlU3BhbiwgZW5kU291cmNlU3Bhbik7XG4gIH1cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXREZWZlcnJlZEJsb2NrRXJyb3IodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGludGVyZmFjZSBEZWZlcnJlZEJsb2NrVHJpZ2dlcnMge1xuICB3aGVuPzogQm91bmREZWZlcnJlZFRyaWdnZXI7XG4gIGlkbGU/OiBJZGxlRGVmZXJyZWRUcmlnZ2VyO1xuICBpbW1lZGlhdGU/OiBJbW1lZGlhdGVEZWZlcnJlZFRyaWdnZXI7XG4gIGhvdmVyPzogSG92ZXJEZWZlcnJlZFRyaWdnZXI7XG4gIHRpbWVyPzogVGltZXJEZWZlcnJlZFRyaWdnZXI7XG4gIGludGVyYWN0aW9uPzogSW50ZXJhY3Rpb25EZWZlcnJlZFRyaWdnZXI7XG4gIHZpZXdwb3J0PzogVmlld3BvcnREZWZlcnJlZFRyaWdnZXI7XG59XG5cbmV4cG9ydCBjbGFzcyBEZWZlcnJlZEJsb2NrIGV4dGVuZHMgQmxvY2tOb2RlIGltcGxlbWVudHMgTm9kZSB7XG4gIHJlYWRvbmx5IHRyaWdnZXJzOiBSZWFkb25seTxEZWZlcnJlZEJsb2NrVHJpZ2dlcnM+O1xuICByZWFkb25seSBwcmVmZXRjaFRyaWdnZXJzOiBSZWFkb25seTxEZWZlcnJlZEJsb2NrVHJpZ2dlcnM+O1xuICBwcml2YXRlIHJlYWRvbmx5IGRlZmluZWRUcmlnZ2VyczogKGtleW9mIERlZmVycmVkQmxvY2tUcmlnZ2VycylbXTtcbiAgcHJpdmF0ZSByZWFkb25seSBkZWZpbmVkUHJlZmV0Y2hUcmlnZ2VyczogKGtleW9mIERlZmVycmVkQmxvY2tUcmlnZ2VycylbXTtcblxuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCB0cmlnZ2VyczogRGVmZXJyZWRCbG9ja1RyaWdnZXJzLFxuICAgICAgcHJlZmV0Y2hUcmlnZ2VyczogRGVmZXJyZWRCbG9ja1RyaWdnZXJzLCBwdWJsaWMgcGxhY2Vob2xkZXI6IERlZmVycmVkQmxvY2tQbGFjZWhvbGRlcnxudWxsLFxuICAgICAgcHVibGljIGxvYWRpbmc6IERlZmVycmVkQmxvY2tMb2FkaW5nfG51bGwsIHB1YmxpYyBlcnJvcjogRGVmZXJyZWRCbG9ja0Vycm9yfG51bGwsXG4gICAgICBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHB1YmxpYyBtYWluQmxvY2tTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBzdGFydFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsXG4gICAgICBwdWJsaWMgaTE4bj86IEkxOG5NZXRhKSB7XG4gICAgc3VwZXIobmFtZVNwYW4sIHNvdXJjZVNwYW4sIHN0YXJ0U291cmNlU3BhbiwgZW5kU291cmNlU3Bhbik7XG4gICAgdGhpcy50cmlnZ2VycyA9IHRyaWdnZXJzO1xuICAgIHRoaXMucHJlZmV0Y2hUcmlnZ2VycyA9IHByZWZldGNoVHJpZ2dlcnM7XG4gICAgLy8gV2UgY2FjaGUgdGhlIGtleXMgc2luY2Ugd2Uga25vdyB0aGF0IHRoZXkgd29uJ3QgY2hhbmdlIGFuZCB3ZVxuICAgIC8vIGRvbid0IHdhbnQgdG8gZW51bWFyYXRlIHRoZW0gZXZlcnkgdGltZSB3ZSdyZSB0cmF2ZXJzaW5nIHRoZSBBU1QuXG4gICAgdGhpcy5kZWZpbmVkVHJpZ2dlcnMgPSBPYmplY3Qua2V5cyh0cmlnZ2VycykgYXMgKGtleW9mIERlZmVycmVkQmxvY2tUcmlnZ2VycylbXTtcbiAgICB0aGlzLmRlZmluZWRQcmVmZXRjaFRyaWdnZXJzID0gT2JqZWN0LmtleXMocHJlZmV0Y2hUcmlnZ2VycykgYXMgKGtleW9mIERlZmVycmVkQmxvY2tUcmlnZ2VycylbXTtcbiAgfVxuXG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdERlZmVycmVkQmxvY2sodGhpcyk7XG4gIH1cblxuICB2aXNpdEFsbCh2aXNpdG9yOiBWaXNpdG9yPHVua25vd24+KTogdm9pZCB7XG4gICAgdGhpcy52aXNpdFRyaWdnZXJzKHRoaXMuZGVmaW5lZFRyaWdnZXJzLCB0aGlzLnRyaWdnZXJzLCB2aXNpdG9yKTtcbiAgICB0aGlzLnZpc2l0VHJpZ2dlcnModGhpcy5kZWZpbmVkUHJlZmV0Y2hUcmlnZ2VycywgdGhpcy5wcmVmZXRjaFRyaWdnZXJzLCB2aXNpdG9yKTtcbiAgICB2aXNpdEFsbCh2aXNpdG9yLCB0aGlzLmNoaWxkcmVuKTtcbiAgICBjb25zdCByZW1haW5pbmdCbG9ja3MgPVxuICAgICAgICBbdGhpcy5wbGFjZWhvbGRlciwgdGhpcy5sb2FkaW5nLCB0aGlzLmVycm9yXS5maWx0ZXIoeCA9PiB4ICE9PSBudWxsKSBhcyBBcnJheTxOb2RlPjtcbiAgICB2aXNpdEFsbCh2aXNpdG9yLCByZW1haW5pbmdCbG9ja3MpO1xuICB9XG5cbiAgcHJpdmF0ZSB2aXNpdFRyaWdnZXJzKFxuICAgICAga2V5czogKGtleW9mIERlZmVycmVkQmxvY2tUcmlnZ2VycylbXSwgdHJpZ2dlcnM6IERlZmVycmVkQmxvY2tUcmlnZ2VycywgdmlzaXRvcjogVmlzaXRvcikge1xuICAgIHZpc2l0QWxsKHZpc2l0b3IsIGtleXMubWFwKGsgPT4gdHJpZ2dlcnNba10hKSk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFN3aXRjaEJsb2NrIGV4dGVuZHMgQmxvY2tOb2RlIGltcGxlbWVudHMgTm9kZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIGV4cHJlc3Npb246IEFTVCwgcHVibGljIGNhc2VzOiBTd2l0Y2hCbG9ja0Nhc2VbXSxcbiAgICAgIC8qKlxuICAgICAgICogVGhlc2UgYmxvY2tzIGFyZSBvbmx5IGNhcHR1cmVkIHRvIGFsbG93IGZvciBhdXRvY29tcGxldGlvbiBpbiB0aGUgbGFuZ3VhZ2Ugc2VydmljZS4gVGhleVxuICAgICAgICogYXJlbid0IG1lYW50IHRvIGJlIHByb2Nlc3NlZCBpbiBhbnkgb3RoZXIgd2F5LlxuICAgICAgICovXG4gICAgICBwdWJsaWMgdW5rbm93bkJsb2NrczogVW5rbm93bkJsb2NrW10sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHN0YXJ0U291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICAgIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuLCBlbmRTb3VyY2VTcGFuKTtcbiAgfVxuXG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdFN3aXRjaEJsb2NrKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBTd2l0Y2hCbG9ja0Nhc2UgZXh0ZW5kcyBCbG9ja05vZGUgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgZXhwcmVzc2lvbjogQVNUfG51bGwsIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBzdGFydFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsXG4gICAgICBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgaTE4bj86IEkxOG5NZXRhKSB7XG4gICAgc3VwZXIobmFtZVNwYW4sIHNvdXJjZVNwYW4sIHN0YXJ0U291cmNlU3BhbiwgZW5kU291cmNlU3Bhbik7XG4gIH1cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRTd2l0Y2hCbG9ja0Nhc2UodGhpcyk7XG4gIH1cbn1cblxuLy8gTm90ZTogdGhpcyBpcyBhIHdlaXJkIHdheSB0byBkZWZpbmUgdGhlIHByb3BlcnRpZXMsIGJ1dCB3ZSBkbyBpdCBzbyB0aGF0IHdlIGNhblxuLy8gZ2V0IHN0cm9uZyB0eXBpbmcgd2hlbiB0aGUgY29udGV4dCBpcyBwYXNzZWQgdGhyb3VnaCBgT2JqZWN0LnZhbHVlc2AuXG4vKiogQ29udGV4dCB2YXJpYWJsZXMgdGhhdCBjYW4gYmUgdXNlZCBpbnNpZGUgYSBgRm9yTG9vcEJsb2NrYC4gKi9cbmV4cG9ydCB0eXBlIEZvckxvb3BCbG9ja0NvbnRleHQgPVxuICAgIFJlY29yZDwnJGluZGV4J3wnJGZpcnN0J3wnJGxhc3QnfCckZXZlbid8JyRvZGQnfCckY291bnQnLCBWYXJpYWJsZT47XG5cbmV4cG9ydCBjbGFzcyBGb3JMb29wQmxvY2sgZXh0ZW5kcyBCbG9ja05vZGUgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgaXRlbTogVmFyaWFibGUsIHB1YmxpYyBleHByZXNzaW9uOiBBU1RXaXRoU291cmNlLCBwdWJsaWMgdHJhY2tCeTogQVNUV2l0aFNvdXJjZSxcbiAgICAgIHB1YmxpYyB0cmFja0tleXdvcmRTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHB1YmxpYyBjb250ZXh0VmFyaWFibGVzOiBGb3JMb29wQmxvY2tDb250ZXh0LFxuICAgICAgcHVibGljIGNoaWxkcmVuOiBOb2RlW10sIHB1YmxpYyBlbXB0eTogRm9yTG9vcEJsb2NrRW1wdHl8bnVsbCwgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgcHVibGljIG1haW5CbG9ja1NwYW46IFBhcnNlU291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgICBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgbmFtZVNwYW46IFBhcnNlU291cmNlU3BhbiwgcHVibGljIGkxOG4/OiBJMThuTWV0YSkge1xuICAgIHN1cGVyKG5hbWVTcGFuLCBzb3VyY2VTcGFuLCBzdGFydFNvdXJjZVNwYW4sIGVuZFNvdXJjZVNwYW4pO1xuICB9XG5cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0Rm9yTG9vcEJsb2NrKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBGb3JMb29wQmxvY2tFbXB0eSBleHRlbmRzIEJsb2NrTm9kZSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHN0YXJ0U291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgZW5kU291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sIHB1YmxpYyBpMThuPzogSTE4bk1ldGEpIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuLCBlbmRTb3VyY2VTcGFuKTtcbiAgfVxuXG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdEZvckxvb3BCbG9ja0VtcHR5KHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBJZkJsb2NrIGV4dGVuZHMgQmxvY2tOb2RlIGltcGxlbWVudHMgTm9kZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgcHVibGljIGJyYW5jaGVzOiBJZkJsb2NrQnJhbmNoW10sIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHN0YXJ0U291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICAgIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHtcbiAgICBzdXBlcihuYW1lU3Bhbiwgc291cmNlU3Bhbiwgc3RhcnRTb3VyY2VTcGFuLCBlbmRTb3VyY2VTcGFuKTtcbiAgfVxuXG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdElmQmxvY2sodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIElmQmxvY2tCcmFuY2ggZXh0ZW5kcyBCbG9ja05vZGUgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgZXhwcmVzc2lvbjogQVNUfG51bGwsIHB1YmxpYyBjaGlsZHJlbjogTm9kZVtdLCBwdWJsaWMgZXhwcmVzc2lvbkFsaWFzOiBWYXJpYWJsZXxudWxsLFxuICAgICAgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzdGFydFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIGVuZFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbnxudWxsLCBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgaTE4bj86IEkxOG5NZXRhKSB7XG4gICAgc3VwZXIobmFtZVNwYW4sIHNvdXJjZVNwYW4sIHN0YXJ0U291cmNlU3BhbiwgZW5kU291cmNlU3Bhbik7XG4gIH1cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRJZkJsb2NrQnJhbmNoKHRoaXMpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBVbmtub3duQmxvY2sgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgbmFtZTogc3RyaW5nLCBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgbmFtZVNwYW46IFBhcnNlU291cmNlU3Bhbikge31cblxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRVbmtub3duQmxvY2sodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRlbXBsYXRlIGltcGxlbWVudHMgTm9kZSB7XG4gIGNvbnN0cnVjdG9yKFxuICAgICAgLy8gdGFnTmFtZSBpcyB0aGUgbmFtZSBvZiB0aGUgY29udGFpbmVyIGVsZW1lbnQsIGlmIGFwcGxpY2FibGUuXG4gICAgICAvLyBgbnVsbGAgaXMgYSBzcGVjaWFsIGNhc2UgZm9yIHdoZW4gdGhlcmUgaXMgYSBzdHJ1Y3R1cmFsIGRpcmVjdGl2ZSBvbiBhbiBgbmctdGVtcGxhdGVgIHNvXG4gICAgICAvLyB0aGUgcmVuZGVyZXIgY2FuIGRpZmZlcmVudGlhdGUgYmV0d2VlbiB0aGUgc3ludGhldGljIHRlbXBsYXRlIGFuZCB0aGUgb25lIHdyaXR0ZW4gaW4gdGhlXG4gICAgICAvLyBmaWxlLlxuICAgICAgcHVibGljIHRhZ05hbWU6IHN0cmluZ3xudWxsLFxuICAgICAgcHVibGljIGF0dHJpYnV0ZXM6IFRleHRBdHRyaWJ1dGVbXSxcbiAgICAgIHB1YmxpYyBpbnB1dHM6IEJvdW5kQXR0cmlidXRlW10sXG4gICAgICBwdWJsaWMgb3V0cHV0czogQm91bmRFdmVudFtdLFxuICAgICAgcHVibGljIHRlbXBsYXRlQXR0cnM6IChCb3VuZEF0dHJpYnV0ZXxUZXh0QXR0cmlidXRlKVtdLFxuICAgICAgcHVibGljIGNoaWxkcmVuOiBOb2RlW10sXG4gICAgICBwdWJsaWMgcmVmZXJlbmNlczogUmVmZXJlbmNlW10sXG4gICAgICBwdWJsaWMgdmFyaWFibGVzOiBWYXJpYWJsZVtdLFxuICAgICAgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHB1YmxpYyBzdGFydFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHB1YmxpYyBlbmRTb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICAgIHB1YmxpYyBpMThuPzogSTE4bk1ldGEsXG4gICkge31cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0VGVtcGxhdGUodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIENvbnRlbnQgaW1wbGVtZW50cyBOb2RlIHtcbiAgcmVhZG9ubHkgbmFtZSA9ICduZy1jb250ZW50JztcblxuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBzZWxlY3Rvcjogc3RyaW5nLCBwdWJsaWMgYXR0cmlidXRlczogVGV4dEF0dHJpYnV0ZVtdLFxuICAgICAgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgcHVibGljIGkxOG4/OiBJMThuTWV0YSkge31cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0Q29udGVudCh0aGlzKTtcbiAgfVxufVxuXG5leHBvcnQgY2xhc3MgVmFyaWFibGUgaW1wbGVtZW50cyBOb2RlIHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgbmFtZTogc3RyaW5nLCBwdWJsaWMgdmFsdWU6IHN0cmluZywgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHJlYWRvbmx5IGtleVNwYW46IFBhcnNlU291cmNlU3BhbiwgcHVibGljIHZhbHVlU3Bhbj86IFBhcnNlU291cmNlU3Bhbikge31cbiAgdmlzaXQ8UmVzdWx0Pih2aXNpdG9yOiBWaXNpdG9yPFJlc3VsdD4pOiBSZXN1bHQge1xuICAgIHJldHVybiB2aXNpdG9yLnZpc2l0VmFyaWFibGUodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFJlZmVyZW5jZSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyBuYW1lOiBzdHJpbmcsIHB1YmxpYyB2YWx1ZTogc3RyaW5nLCBwdWJsaWMgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgICAgcmVhZG9ubHkga2V5U3BhbjogUGFyc2VTb3VyY2VTcGFuLCBwdWJsaWMgdmFsdWVTcGFuPzogUGFyc2VTb3VyY2VTcGFuKSB7fVxuICB2aXNpdDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Pik6IFJlc3VsdCB7XG4gICAgcmV0dXJuIHZpc2l0b3IudmlzaXRSZWZlcmVuY2UodGhpcyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEljdSBpbXBsZW1lbnRzIE5vZGUge1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIHB1YmxpYyB2YXJzOiB7W25hbWU6IHN0cmluZ106IEJvdW5kVGV4dH0sXG4gICAgICBwdWJsaWMgcGxhY2Vob2xkZXJzOiB7W25hbWU6IHN0cmluZ106IFRleHR8Qm91bmRUZXh0fSwgcHVibGljIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHB1YmxpYyBpMThuPzogSTE4bk1ldGEpIHt9XG4gIHZpc2l0PFJlc3VsdD4odmlzaXRvcjogVmlzaXRvcjxSZXN1bHQ+KTogUmVzdWx0IHtcbiAgICByZXR1cm4gdmlzaXRvci52aXNpdEljdSh0aGlzKTtcbiAgfVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIFZpc2l0b3I8UmVzdWx0ID0gYW55PiB7XG4gIC8vIFJldHVybmluZyBhIHRydXRoeSB2YWx1ZSBmcm9tIGB2aXNpdCgpYCB3aWxsIHByZXZlbnQgYHZpc2l0QWxsKClgIGZyb20gdGhlIGNhbGwgdG8gdGhlIHR5cGVkXG4gIC8vIG1ldGhvZCBhbmQgcmVzdWx0IHJldHVybmVkIHdpbGwgYmVjb21lIHRoZSByZXN1bHQgaW5jbHVkZWQgaW4gYHZpc2l0QWxsKClgcyByZXN1bHQgYXJyYXkuXG4gIHZpc2l0Pyhub2RlOiBOb2RlKTogUmVzdWx0O1xuXG4gIHZpc2l0RWxlbWVudChlbGVtZW50OiBFbGVtZW50KTogUmVzdWx0O1xuICB2aXNpdFRlbXBsYXRlKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IFJlc3VsdDtcbiAgdmlzaXRDb250ZW50KGNvbnRlbnQ6IENvbnRlbnQpOiBSZXN1bHQ7XG4gIHZpc2l0VmFyaWFibGUodmFyaWFibGU6IFZhcmlhYmxlKTogUmVzdWx0O1xuICB2aXNpdFJlZmVyZW5jZShyZWZlcmVuY2U6IFJlZmVyZW5jZSk6IFJlc3VsdDtcbiAgdmlzaXRUZXh0QXR0cmlidXRlKGF0dHJpYnV0ZTogVGV4dEF0dHJpYnV0ZSk6IFJlc3VsdDtcbiAgdmlzaXRCb3VuZEF0dHJpYnV0ZShhdHRyaWJ1dGU6IEJvdW5kQXR0cmlidXRlKTogUmVzdWx0O1xuICB2aXNpdEJvdW5kRXZlbnQoYXR0cmlidXRlOiBCb3VuZEV2ZW50KTogUmVzdWx0O1xuICB2aXNpdFRleHQodGV4dDogVGV4dCk6IFJlc3VsdDtcbiAgdmlzaXRCb3VuZFRleHQodGV4dDogQm91bmRUZXh0KTogUmVzdWx0O1xuICB2aXNpdEljdShpY3U6IEljdSk6IFJlc3VsdDtcbiAgdmlzaXREZWZlcnJlZEJsb2NrKGRlZmVycmVkOiBEZWZlcnJlZEJsb2NrKTogUmVzdWx0O1xuICB2aXNpdERlZmVycmVkQmxvY2tQbGFjZWhvbGRlcihibG9jazogRGVmZXJyZWRCbG9ja1BsYWNlaG9sZGVyKTogUmVzdWx0O1xuICB2aXNpdERlZmVycmVkQmxvY2tFcnJvcihibG9jazogRGVmZXJyZWRCbG9ja0Vycm9yKTogUmVzdWx0O1xuICB2aXNpdERlZmVycmVkQmxvY2tMb2FkaW5nKGJsb2NrOiBEZWZlcnJlZEJsb2NrTG9hZGluZyk6IFJlc3VsdDtcbiAgdmlzaXREZWZlcnJlZFRyaWdnZXIodHJpZ2dlcjogRGVmZXJyZWRUcmlnZ2VyKTogUmVzdWx0O1xuICB2aXNpdFN3aXRjaEJsb2NrKGJsb2NrOiBTd2l0Y2hCbG9jayk6IFJlc3VsdDtcbiAgdmlzaXRTd2l0Y2hCbG9ja0Nhc2UoYmxvY2s6IFN3aXRjaEJsb2NrQ2FzZSk6IFJlc3VsdDtcbiAgdmlzaXRGb3JMb29wQmxvY2soYmxvY2s6IEZvckxvb3BCbG9jayk6IFJlc3VsdDtcbiAgdmlzaXRGb3JMb29wQmxvY2tFbXB0eShibG9jazogRm9yTG9vcEJsb2NrRW1wdHkpOiBSZXN1bHQ7XG4gIHZpc2l0SWZCbG9jayhibG9jazogSWZCbG9jayk6IFJlc3VsdDtcbiAgdmlzaXRJZkJsb2NrQnJhbmNoKGJsb2NrOiBJZkJsb2NrQnJhbmNoKTogUmVzdWx0O1xuICB2aXNpdFVua25vd25CbG9jayhibG9jazogVW5rbm93bkJsb2NrKTogUmVzdWx0O1xufVxuXG5leHBvcnQgY2xhc3MgUmVjdXJzaXZlVmlzaXRvciBpbXBsZW1lbnRzIFZpc2l0b3I8dm9pZD4ge1xuICB2aXNpdEVsZW1lbnQoZWxlbWVudDogRWxlbWVudCk6IHZvaWQge1xuICAgIHZpc2l0QWxsKHRoaXMsIGVsZW1lbnQuYXR0cmlidXRlcyk7XG4gICAgdmlzaXRBbGwodGhpcywgZWxlbWVudC5pbnB1dHMpO1xuICAgIHZpc2l0QWxsKHRoaXMsIGVsZW1lbnQub3V0cHV0cyk7XG4gICAgdmlzaXRBbGwodGhpcywgZWxlbWVudC5jaGlsZHJlbik7XG4gICAgdmlzaXRBbGwodGhpcywgZWxlbWVudC5yZWZlcmVuY2VzKTtcbiAgfVxuICB2aXNpdFRlbXBsYXRlKHRlbXBsYXRlOiBUZW1wbGF0ZSk6IHZvaWQge1xuICAgIHZpc2l0QWxsKHRoaXMsIHRlbXBsYXRlLmF0dHJpYnV0ZXMpO1xuICAgIHZpc2l0QWxsKHRoaXMsIHRlbXBsYXRlLmlucHV0cyk7XG4gICAgdmlzaXRBbGwodGhpcywgdGVtcGxhdGUub3V0cHV0cyk7XG4gICAgdmlzaXRBbGwodGhpcywgdGVtcGxhdGUuY2hpbGRyZW4pO1xuICAgIHZpc2l0QWxsKHRoaXMsIHRlbXBsYXRlLnJlZmVyZW5jZXMpO1xuICAgIHZpc2l0QWxsKHRoaXMsIHRlbXBsYXRlLnZhcmlhYmxlcyk7XG4gIH1cbiAgdmlzaXREZWZlcnJlZEJsb2NrKGRlZmVycmVkOiBEZWZlcnJlZEJsb2NrKTogdm9pZCB7XG4gICAgZGVmZXJyZWQudmlzaXRBbGwodGhpcyk7XG4gIH1cbiAgdmlzaXREZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXIoYmxvY2s6IERlZmVycmVkQmxvY2tQbGFjZWhvbGRlcik6IHZvaWQge1xuICAgIHZpc2l0QWxsKHRoaXMsIGJsb2NrLmNoaWxkcmVuKTtcbiAgfVxuICB2aXNpdERlZmVycmVkQmxvY2tFcnJvcihibG9jazogRGVmZXJyZWRCbG9ja0Vycm9yKTogdm9pZCB7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2suY2hpbGRyZW4pO1xuICB9XG4gIHZpc2l0RGVmZXJyZWRCbG9ja0xvYWRpbmcoYmxvY2s6IERlZmVycmVkQmxvY2tMb2FkaW5nKTogdm9pZCB7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2suY2hpbGRyZW4pO1xuICB9XG4gIHZpc2l0U3dpdGNoQmxvY2soYmxvY2s6IFN3aXRjaEJsb2NrKTogdm9pZCB7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2suY2FzZXMpO1xuICB9XG4gIHZpc2l0U3dpdGNoQmxvY2tDYXNlKGJsb2NrOiBTd2l0Y2hCbG9ja0Nhc2UpOiB2b2lkIHtcbiAgICB2aXNpdEFsbCh0aGlzLCBibG9jay5jaGlsZHJlbik7XG4gIH1cbiAgdmlzaXRGb3JMb29wQmxvY2soYmxvY2s6IEZvckxvb3BCbG9jayk6IHZvaWQge1xuICAgIGNvbnN0IGJsb2NrSXRlbXMgPSBbYmxvY2suaXRlbSwgLi4uT2JqZWN0LnZhbHVlcyhibG9jay5jb250ZXh0VmFyaWFibGVzKSwgLi4uYmxvY2suY2hpbGRyZW5dO1xuICAgIGJsb2NrLmVtcHR5ICYmIGJsb2NrSXRlbXMucHVzaChibG9jay5lbXB0eSk7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2tJdGVtcyk7XG4gIH1cbiAgdmlzaXRGb3JMb29wQmxvY2tFbXB0eShibG9jazogRm9yTG9vcEJsb2NrRW1wdHkpOiB2b2lkIHtcbiAgICB2aXNpdEFsbCh0aGlzLCBibG9jay5jaGlsZHJlbik7XG4gIH1cbiAgdmlzaXRJZkJsb2NrKGJsb2NrOiBJZkJsb2NrKTogdm9pZCB7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2suYnJhbmNoZXMpO1xuICB9XG4gIHZpc2l0SWZCbG9ja0JyYW5jaChibG9jazogSWZCbG9ja0JyYW5jaCk6IHZvaWQge1xuICAgIGNvbnN0IGJsb2NrSXRlbXMgPSBibG9jay5jaGlsZHJlbjtcbiAgICBibG9jay5leHByZXNzaW9uQWxpYXMgJiYgYmxvY2tJdGVtcy5wdXNoKGJsb2NrLmV4cHJlc3Npb25BbGlhcyk7XG4gICAgdmlzaXRBbGwodGhpcywgYmxvY2tJdGVtcyk7XG4gIH1cbiAgdmlzaXRDb250ZW50KGNvbnRlbnQ6IENvbnRlbnQpOiB2b2lkIHt9XG4gIHZpc2l0VmFyaWFibGUodmFyaWFibGU6IFZhcmlhYmxlKTogdm9pZCB7fVxuICB2aXNpdFJlZmVyZW5jZShyZWZlcmVuY2U6IFJlZmVyZW5jZSk6IHZvaWQge31cbiAgdmlzaXRUZXh0QXR0cmlidXRlKGF0dHJpYnV0ZTogVGV4dEF0dHJpYnV0ZSk6IHZvaWQge31cbiAgdmlzaXRCb3VuZEF0dHJpYnV0ZShhdHRyaWJ1dGU6IEJvdW5kQXR0cmlidXRlKTogdm9pZCB7fVxuICB2aXNpdEJvdW5kRXZlbnQoYXR0cmlidXRlOiBCb3VuZEV2ZW50KTogdm9pZCB7fVxuICB2aXNpdFRleHQodGV4dDogVGV4dCk6IHZvaWQge31cbiAgdmlzaXRCb3VuZFRleHQodGV4dDogQm91bmRUZXh0KTogdm9pZCB7fVxuICB2aXNpdEljdShpY3U6IEljdSk6IHZvaWQge31cbiAgdmlzaXREZWZlcnJlZFRyaWdnZXIodHJpZ2dlcjogRGVmZXJyZWRUcmlnZ2VyKTogdm9pZCB7fVxuICB2aXNpdFVua25vd25CbG9jayhibG9jazogVW5rbm93bkJsb2NrKTogdm9pZCB7fVxufVxuXG5cbmV4cG9ydCBmdW5jdGlvbiB2aXNpdEFsbDxSZXN1bHQ+KHZpc2l0b3I6IFZpc2l0b3I8UmVzdWx0Piwgbm9kZXM6IE5vZGVbXSk6IFJlc3VsdFtdIHtcbiAgY29uc3QgcmVzdWx0OiBSZXN1bHRbXSA9IFtdO1xuICBpZiAodmlzaXRvci52aXNpdCkge1xuICAgIGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuICAgICAgdmlzaXRvci52aXNpdChub2RlKSB8fCBub2RlLnZpc2l0KHZpc2l0b3IpO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBmb3IgKGNvbnN0IG5vZGUgb2Ygbm9kZXMpIHtcbiAgICAgIGNvbnN0IG5ld05vZGUgPSBub2RlLnZpc2l0KHZpc2l0b3IpO1xuICAgICAgaWYgKG5ld05vZGUpIHtcbiAgICAgICAgcmVzdWx0LnB1c2gobmV3Tm9kZSk7XG4gICAgICB9XG4gICAgfVxuICB9XG4gIHJldHVybiByZXN1bHQ7XG59XG4iXX0=