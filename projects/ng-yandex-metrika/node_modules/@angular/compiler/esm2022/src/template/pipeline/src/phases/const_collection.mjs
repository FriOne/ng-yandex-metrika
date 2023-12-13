/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as core from '../../../../core';
import { splitNsName } from '../../../../ml_parser/tags';
import * as o from '../../../../output/output_ast';
import * as ir from '../../ir';
import { ComponentCompilationJob, HostBindingCompilationJob } from '../compilation';
import { literalOrArrayLiteral } from '../conversion';
/**
 * Converts the semantic attributes of element-like operations (elements, templates) into constant
 * array expressions, and lifts them into the overall component `consts`.
 */
export function collectElementConsts(job) {
    // Collect all extracted attributes.
    const allElementAttributes = new Map();
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.ExtractedAttribute) {
                const attributes = allElementAttributes.get(op.target) || new ElementAttributes();
                allElementAttributes.set(op.target, attributes);
                attributes.add(op.bindingKind, op.name, op.expression);
                ir.OpList.remove(op);
            }
        }
    }
    // Serialize the extracted attributes into the const array.
    if (job instanceof ComponentCompilationJob) {
        for (const unit of job.units) {
            for (const op of unit.create) {
                if (ir.isElementOrContainerOp(op)) {
                    const attributes = allElementAttributes.get(op.xref);
                    if (attributes !== undefined) {
                        const attrArray = serializeAttributes(attributes);
                        if (attrArray.entries.length > 0) {
                            op.attributes = job.addConst(attrArray);
                        }
                    }
                }
            }
        }
    }
    else if (job instanceof HostBindingCompilationJob) {
        // TODO: If the host binding case further diverges, we may want to split it into its own
        // phase.
        for (const [xref, attributes] of allElementAttributes.entries()) {
            if (xref !== job.root.xref) {
                throw new Error(`An attribute would be const collected into the host binding's template function, but is not associated with the root xref.`);
            }
            const attrArray = serializeAttributes(attributes);
            if (attrArray.entries.length > 0) {
                job.root.attributes = attrArray;
            }
        }
    }
}
/**
 * Shared instance of an empty array to avoid unnecessary array allocations.
 */
const FLYWEIGHT_ARRAY = Object.freeze([]);
/**
 * Container for all of the various kinds of attributes which are applied on an element.
 */
class ElementAttributes {
    constructor() {
        this.known = new Set();
        this.byKind = new Map;
        this.projectAs = null;
    }
    get attributes() {
        return this.byKind.get(ir.BindingKind.Attribute) ?? FLYWEIGHT_ARRAY;
    }
    get classes() {
        return this.byKind.get(ir.BindingKind.ClassName) ?? FLYWEIGHT_ARRAY;
    }
    get styles() {
        return this.byKind.get(ir.BindingKind.StyleProperty) ?? FLYWEIGHT_ARRAY;
    }
    get bindings() {
        return this.byKind.get(ir.BindingKind.Property) ?? FLYWEIGHT_ARRAY;
    }
    get template() {
        return this.byKind.get(ir.BindingKind.Template) ?? FLYWEIGHT_ARRAY;
    }
    get i18n() {
        return this.byKind.get(ir.BindingKind.I18n) ?? FLYWEIGHT_ARRAY;
    }
    add(kind, name, value) {
        if (this.known.has(name)) {
            return;
        }
        this.known.add(name);
        if (name === 'ngProjectAs') {
            if (value === null || !(value instanceof o.LiteralExpr) || (value.value == null) ||
                (typeof value.value?.toString() !== 'string')) {
                throw Error('ngProjectAs must have a string literal value');
            }
            this.projectAs = value.value.toString();
            // TODO: TemplateDefinitionBuilder allows `ngProjectAs` to also be assigned as a literal
            // attribute. Is this sane?
        }
        const array = this.arrayFor(kind);
        array.push(...getAttributeNameLiterals(name));
        if (kind === ir.BindingKind.Attribute || kind === ir.BindingKind.StyleProperty) {
            if (value === null) {
                throw Error('Attribute, i18n attribute, & style element attributes must have a value');
            }
            array.push(value);
        }
    }
    arrayFor(kind) {
        if (!this.byKind.has(kind)) {
            this.byKind.set(kind, []);
        }
        return this.byKind.get(kind);
    }
}
/**
 * Gets an array of literal expressions representing the attribute's namespaced name.
 */
function getAttributeNameLiterals(name) {
    const [attributeNamespace, attributeName] = splitNsName(name);
    const nameLiteral = o.literal(attributeName);
    if (attributeNamespace) {
        return [
            o.literal(0 /* core.AttributeMarker.NamespaceURI */), o.literal(attributeNamespace), nameLiteral
        ];
    }
    return [nameLiteral];
}
/**
 * Serializes an ElementAttributes object into an array expression.
 */
function serializeAttributes({ attributes, bindings, classes, i18n, projectAs, styles, template }) {
    const attrArray = [...attributes];
    if (projectAs !== null) {
        // Parse the attribute value into a CssSelectorList. Note that we only take the
        // first selector, because we don't support multiple selectors in ngProjectAs.
        const parsedR3Selector = core.parseSelectorToR3Selector(projectAs)[0];
        attrArray.push(o.literal(5 /* core.AttributeMarker.ProjectAs */), literalOrArrayLiteral(parsedR3Selector));
    }
    if (classes.length > 0) {
        attrArray.push(o.literal(1 /* core.AttributeMarker.Classes */), ...classes);
    }
    if (styles.length > 0) {
        attrArray.push(o.literal(2 /* core.AttributeMarker.Styles */), ...styles);
    }
    if (bindings.length > 0) {
        attrArray.push(o.literal(3 /* core.AttributeMarker.Bindings */), ...bindings);
    }
    if (template.length > 0) {
        attrArray.push(o.literal(4 /* core.AttributeMarker.Template */), ...template);
    }
    if (i18n.length > 0) {
        attrArray.push(o.literal(6 /* core.AttributeMarker.I18n */), ...i18n);
    }
    return o.literalArr(attrArray);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29uc3RfY29sbGVjdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL2NvbnN0X2NvbGxlY3Rpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLElBQUksTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUMsV0FBVyxFQUFDLE1BQU0sNEJBQTRCLENBQUM7QUFDdkQsT0FBTyxLQUFLLENBQUMsTUFBTSwrQkFBK0IsQ0FBQztBQUNuRCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUMsdUJBQXVCLEVBQUUseUJBQXlCLEVBQXNCLE1BQU0sZ0JBQWdCLENBQUM7QUFDdkcsT0FBTyxFQUFDLHFCQUFxQixFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRXBEOzs7R0FHRztBQUNILE1BQU0sVUFBVSxvQkFBb0IsQ0FBQyxHQUFtQjtJQUN0RCxvQ0FBb0M7SUFDcEMsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLEdBQUcsRUFBZ0MsQ0FBQztJQUNyRSxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLGtCQUFrQixFQUFFO2dCQUM1QyxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLElBQUksaUJBQWlCLEVBQUUsQ0FBQztnQkFDbEYsb0JBQW9CLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsVUFBVSxDQUFDLENBQUM7Z0JBQ2hELFVBQVUsQ0FBQyxHQUFH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SUFBSSxDQUNWLENBQUMsQ0FBQyxPQUFPLHdDQUFnQyxFQUFFLHFCQUFxQixDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztLQUN6RjtJQUNELElBQUksT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDdEIsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyxzQ0FBOEIsRUFBRSxHQUFHLE9BQU8sQ0FBQyxDQUFDO0tBQ3JFO0lBQ0QsSUFBSSxNQUFNLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUNyQixTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLHFDQUE2QixFQUFFLEdBQUcsTUFBTSxDQUFDLENBQUM7S0FDbkU7SUFDRCxJQUFJLFFBQVEsQ0FBQyxNQUFNLEdBQUcsQ0FBQyxFQUFFO1FBQ3ZCLFNBQVMsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLE9BQU8sdUNBQStCLEVBQUUsR0FBRyxRQUFRLENBQUMsQ0FBQztLQUN2RTtJQUNELElBQUksUUFBUSxDQUFDLE1BQU0sR0FBRyxDQUFDLEVBQUU7UUFDdkIsU0FBUyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsT0FBTyx1Q0FBK0IsRUFBRSxHQUFHLFFBQVEsQ0FBQyxDQUFDO0tBQ3ZFO0lBQ0QsSUFBSSxJQUFJLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRTtRQUNuQixTQUFTLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxPQUFPLG1DQUEyQixFQUFFLEdBQUcsSUFBSSxDQUFDLENBQUM7S0FDL0Q7SUFDRCxPQUFPLENBQUMsQ0FBQyxVQUFVLENBQUMsU0FBUyxDQUFDLENBQUM7QUFDakMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBjb3JlIGZyb20gJy4uLy4uLy4uLy4uL2NvcmUnO1xuaW1wb3J0IHtzcGxpdE5zTmFtZX0gZnJvbSAnLi4vLi4vLi4vLi4vbWxfcGFyc2VyL3RhZ3MnO1xuaW1wb3J0ICogYXMgbyBmcm9tICcuLi8uLi8uLi8uLi9vdXRwdXQvb3V0cHV0X2FzdCc7XG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5pbXBvcnQge0NvbXBvbmVudENvbXBpbGF0aW9uSm9iLCBIb3N0QmluZGluZ0NvbXBpbGF0aW9uSm9iLCB0eXBlIENvbXBpbGF0aW9uSm9ifSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5pbXBvcnQge2xpdGVyYWxPckFycmF5TGl0ZXJhbH0gZnJvbSAnLi4vY29udmVyc2lvbic7XG5cbi8qKlxuICogQ29udmVydHMgdGhlIHNlbWFudGljIGF0dHJpYnV0ZXMgb2YgZWxlbWVudC1saWtlIG9wZXJhdGlvbnMgKGVsZW1lbnRzLCB0ZW1wbGF0ZXMpIGludG8gY29uc3RhbnRcbiAqIGFycmF5IGV4cHJlc3Npb25zLCBhbmQgbGlmdHMgdGhlbSBpbnRvIHRoZSBvdmVyYWxsIGNvbXBvbmVudCBgY29uc3RzYC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbGxlY3RFbGVtZW50Q29uc3RzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgLy8gQ29sbGVjdCBhbGwgZXh0cmFjdGVkIGF0dHJpYnV0ZXMuXG4gIGNvbnN0IGFsbEVsZW1lbnRBdHRyaWJ1dGVzID0gbmV3IE1hcDxpci5YcmVmSWQsIEVsZW1lbnRBdHRyaWJ1dGVzPigpO1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgPT09IGlyLk9wS2luZC5FeHRyYWN0ZWRBdHRyaWJ1dGUpIHtcbiAgICAgICAgY29uc3QgYXR0cmlidXRlcyA9IGFsbEVsZW1lbnRBdHRyaWJ1dGVzLmdldChvcC50YXJnZXQpIHx8IG5ldyBFbGVtZW50QXR0cmlidXRlcygpO1xuICAgICAgICBhbGxFbGVtZW50QXR0cmlidXRlcy5zZXQob3AudGFyZ2V0LCBhdHRyaWJ1dGVzKTtcbiAgICAgICAgYXR0cmlidXRlcy5hZGQob3AuYmluZGluZ0tpbmQsIG9wLm5hbWUsIG9wLmV4cHJlc3Npb24pO1xuICAgICAgICBpci5PcExpc3QucmVtb3ZlPGlyLkNyZWF0ZU9wPihvcCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gU2VyaWFsaXplIHRoZSBleHRyYWN0ZWQgYXR0cmlidXRlcyBpbnRvIHRoZSBjb25zdCBhcnJheS5cbiAgaWYgKGpvYiBpbnN0YW5jZW9mIENvbXBvbmVudENvbXBpbGF0aW9uSm9iKSB7XG4gICAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgICBpZiAoaXIuaXNFbGVtZW50T3JDb250YWluZXJPcChvcCkpIHtcbiAgICAgICAgICBjb25zdCBhdHRyaWJ1dGVzID0gYWxsRWxlbWVudEF0dHJpYnV0ZXMuZ2V0KG9wLnhyZWYpO1xuICAgICAgICAgIGlmIChhdHRyaWJ1dGVzICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIGNvbnN0IGF0dHJBcnJheSA9IHNlcmlhbGl6ZUF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICAgICAgICBpZiAoYXR0ckFycmF5LmVudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgICAgICAgICBvcC5hdHRyaWJ1dGVzID0gam9iLmFkZENvbnN0KGF0dHJBcnJheSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICB9IGVsc2UgaWYgKGpvYiBpbnN0YW5jZW9mIEhvc3RCaW5kaW5nQ29tcGlsYXRpb25Kb2IpIHtcbiAgICAvLyBUT0RPOiBJZiB0aGUgaG9zdCBiaW5kaW5nIGNhc2UgZnVydGhlciBkaXZlcmdlcywgd2UgbWF5IHdhbnQgdG8gc3BsaXQgaXQgaW50byBpdHMgb3duXG4gICAgLy8gcGhhc2UuXG4gICAgZm9yIChjb25zdCBbeHJlZiwgYXR0cmlidXRlc10gb2YgYWxsRWxlbWVudEF0dHJpYnV0ZXMuZW50cmllcygpKSB7XG4gICAgICBpZiAoeHJlZiAhPT0gam9iLnJvb3QueHJlZikge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICBgQW4gYXR0cmlidXRlIHdvdWxkIGJlIGNvbnN0IGNvbGxlY3RlZCBpbnRvIHRoZSBob3N0IGJpbmRpbmcncyB0ZW1wbGF0ZSBmdW5jdGlvbiwgYnV0IGlzIG5vdCBhc3NvY2lhdGVkIHdpdGggdGhlIHJvb3QgeHJlZi5gKTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGF0dHJBcnJheSA9IHNlcmlhbGl6ZUF0dHJpYnV0ZXMoYXR0cmlidXRlcyk7XG4gICAgICBpZiAoYXR0ckFycmF5LmVudHJpZXMubGVuZ3RoID4gMCkge1xuICAgICAgICBqb2Iucm9vdC5hdHRyaWJ1dGVzID0gYXR0ckFycmF5O1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFNoYXJlZCBpbnN0YW5jZSBvZiBhbiBlbXB0eSBhcnJheSB0byBhdm9pZCB1bm5lY2Vzc2FyeSBhcnJheSBhbGxvY2F0aW9ucy5cbiAqL1xuY29uc3QgRkxZV0VJR0hUX0FSUkFZOiBSZWFkb25seUFycmF5PG8uRXhwcmVzc2lvbj4gPSBPYmplY3QuZnJlZXplPG8uRXhwcmVzc2lvbltdPihbXSk7XG5cbi8qKlxuICogQ29udGFpbmVyIGZvciBhbGwgb2YgdGhlIHZhcmlvdXMga2luZHMgb2YgYXR0cmlidXRlcyB3aGljaCBhcmUgYXBwbGllZCBvbiBhbiBlbGVtZW50LlxuICovXG5jbGFzcyBFbGVtZW50QXR0cmlidXRlcyB7XG4gIHByaXZhdGUga25vd24gPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgcHJpdmF0ZSBieUtpbmQgPSBuZXcgTWFwPGlyLkJpbmRpbmdLaW5kLCBvLkV4cHJlc3Npb25bXT47XG5cbiAgcHJvamVjdEFzOiBzdHJpbmd8bnVsbCA9IG51bGw7XG5cbiAgZ2V0IGF0dHJpYnV0ZXMoKTogUmVhZG9ubHlBcnJheTxvLkV4cHJlc3Npb24+IHtcbiAgICByZXR1cm4gdGhpcy5ieUtpbmQuZ2V0KGlyLkJpbmRpbmdLaW5kLkF0dHJpYnV0ZSkgPz8gRkxZV0VJR0hUX0FSUkFZO1xuICB9XG5cbiAgZ2V0IGNsYXNzZXMoKTogUmVhZG9ubHlBcnJheTxvLkV4cHJlc3Npb24+IHtcbiAgICByZXR1cm4gdGhpcy5ieUtpbmQuZ2V0KGlyLkJpbmRpbmdLaW5kLkNsYXNzTmFtZSkgPz8gRkxZV0VJR0hUX0FSUkFZO1xuICB9XG5cbiAgZ2V0IHN0eWxlcygpOiBSZWFkb25seUFycmF5PG8uRXhwcmVzc2lvbj4ge1xuICAgIHJldHVybiB0aGlzLmJ5S2luZC5nZXQoaXIuQmluZGluZ0tpbmQuU3R5bGVQcm9wZXJ0eSkgPz8gRkxZV0VJR0hUX0FSUkFZO1xuICB9XG5cbiAgZ2V0IGJpbmRpbmdzKCk6IFJlYWRvbmx5QXJyYXk8by5FeHByZXNzaW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuYnlLaW5kLmdldChpci5CaW5kaW5nS2luZC5Qcm9wZXJ0eSkgPz8gRkxZV0VJR0hUX0FSUkFZO1xuICB9XG5cbiAgZ2V0IHRlbXBsYXRlKCk6IFJlYWRvbmx5QXJyYXk8by5FeHByZXNzaW9uPiB7XG4gICAgcmV0dXJuIHRoaXMuYnlLaW5kLmdldChpci5CaW5kaW5nS2luZC5UZW1wbGF0ZSkgPz8gRkxZV0VJR0hUX0FSUkFZO1xuICB9XG5cbiAgZ2V0IGkxOG4oKTogUmVhZG9ubHlBcnJheTxvLkV4cHJlc3Npb24+IHtcbiAgICByZXR1cm4gdGhpcy5ieUtpbmQuZ2V0KGlyLkJpbmRpbmdLaW5kLkkxOG4pID8/IEZMWVdFSUdIVF9BUlJBWTtcbiAgfVxuXG4gIGFkZChraW5kOiBpci5CaW5kaW5nS2luZCwgbmFtZTogc3RyaW5nLCB2YWx1ZTogby5FeHByZXNzaW9ufG51bGwpOiB2b2lkIHtcbiAgICBpZiAodGhpcy5rbm93bi5oYXMobmFtZSkpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdGhpcy5rbm93bi5hZGQobmFtZSk7XG4gICAgaWYgKG5hbWUgPT09ICduZ1Byb2plY3RBcycpIHtcbiAgICAgIGlmICh2YWx1ZSA9PT0gbnVsbCB8fCAhKHZhbHVlIGluc3RhbmNlb2Ygby5MaXRlcmFsRXhwcikgfHwgKHZhbHVlLnZhbHVlID09IG51bGwpIHx8XG4gICAgICAgICAgKHR5cGVvZiB2YWx1ZS52YWx1ZT8udG9TdHJpbmcoKSAhPT0gJ3N0cmluZycpKSB7XG4gICAgICAgIHRocm93IEVycm9yKCduZ1Byb2plY3RBcyBtdXN0IGhhdmUgYSBzdHJpbmcgbGl0ZXJhbCB2YWx1ZScpO1xuICAgICAgfVxuICAgICAgdGhpcy5wcm9qZWN0QXMgPSB2YWx1ZS52YWx1ZS50b1N0cmluZygpO1xuICAgICAgLy8gVE9ETzogVGVtcGxhdGVEZWZpbml0aW9uQnVpbGRlciBhbGxvd3MgYG5nUHJvamVjdEFzYCB0byBhbHNvIGJlIGFzc2lnbmVkIGFzIGEgbGl0ZXJhbFxuICAgICAgLy8gYXR0cmlidXRlLiBJcyB0aGlzIHNhbmU/XG4gICAgfVxuXG5cbiAgICBjb25zdCBhcnJheSA9IHRoaXMuYXJyYXlGb3Ioa2luZCk7XG4gICAgYXJyYXkucHVzaCguLi5nZXRBdHRyaWJ1dGVOYW1lTGl0ZXJhbHMobmFtZSkpO1xuICAgIGlmIChraW5kID09PSBpci5CaW5kaW5nS2luZC5BdHRyaWJ1dGUgfHwga2luZCA9PT0gaXIuQmluZGluZ0tpbmQuU3R5bGVQcm9wZXJ0eSkge1xuICAgICAgaWYgKHZhbHVlID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IEVycm9yKCdBdHRyaWJ1dGUsIGkxOG4gYXR0cmlidXRlLCAmIHN0eWxlIGVsZW1lbnQgYXR0cmlidXRlcyBtdXN0IGhhdmUgYSB2YWx1ZScpO1xuICAgICAgfVxuICAgICAgYXJyYXkucHVzaCh2YWx1ZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBhcnJheUZvcihraW5kOiBpci5CaW5kaW5nS2luZCk6IG8uRXhwcmVzc2lvbltdIHtcbiAgICBpZiAoIXRoaXMuYnlLaW5kLmhhcyhraW5kKSkge1xuICAgICAgdGhpcy5ieUtpbmQuc2V0KGtpbmQsIFtdKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuYnlLaW5kLmdldChraW5kKSE7XG4gIH1cbn1cblxuLyoqXG4gKiBHZXRzIGFuIGFycmF5IG9mIGxpdGVyYWwgZXhwcmVzc2lvbnMgcmVwcmVzZW50aW5nIHRoZSBhdHRyaWJ1dGUncyBuYW1lc3BhY2VkIG5hbWUuXG4gKi9cbmZ1bmN0aW9uIGdldEF0dHJpYnV0ZU5hbWVMaXRlcmFscyhuYW1lOiBzdHJpbmcpOiBvLkxpdGVyYWxFeHByW10ge1xuICBjb25zdCBbYXR0cmlidXRlTmFtZXNwYWNlLCBhdHRyaWJ1dGVOYW1lXSA9IHNwbGl0TnNOYW1lKG5hbWUpO1xuICBjb25zdCBuYW1lTGl0ZXJhbCA9IG8ubGl0ZXJhbChhdHRyaWJ1dGVOYW1lKTtcblxuICBpZiAoYXR0cmlidXRlTmFtZXNwYWNlKSB7XG4gICAgcmV0dXJuIFtcbiAgICAgIG8ubGl0ZXJhbChjb3JlLkF0dHJpYnV0ZU1hcmtlci5OYW1lc3BhY2VVUkkpLCBvLmxpdGVyYWwoYXR0cmlidXRlTmFtZXNwYWNlKSwgbmFtZUxpdGVyYWxcbiAgICBdO1xuICB9XG5cbiAgcmV0dXJuIFtuYW1lTGl0ZXJhbF07XG59XG5cbi8qKlxuICogU2VyaWFsaXplcyBhbiBFbGVtZW50QXR0cmlidXRlcyBvYmplY3QgaW50byBhbiBhcnJheSBleHByZXNzaW9uLlxuICovXG5mdW5jdGlvbiBzZXJpYWxpemVBdHRyaWJ1dGVzKHthdHRyaWJ1dGVzLCBiaW5kaW5ncywgY2xhc3NlcywgaTE4biwgcHJvamVjdEFzLCBzdHlsZXMsIHRlbXBsYXRlfTpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIEVsZW1lbnRBdHRyaWJ1dGVzKTogby5MaXRlcmFsQXJyYXlFeHByIHtcbiAgY29uc3QgYXR0ckFycmF5ID0gWy4uLmF0dHJpYnV0ZXNdO1xuXG4gIGlmIChwcm9qZWN0QXMgIT09IG51bGwpIHtcbiAgICAvLyBQYXJzZSB0aGUgYXR0cmlidXRlIHZhbHVlIGludG8gYSBDc3NTZWxlY3Rvckxpc3QuIE5vdGUgdGhhdCB3ZSBvbmx5IHRha2UgdGhlXG4gICAgLy8gZmlyc3Qgc2VsZWN0b3IsIGJlY2F1c2Ugd2UgZG9uJ3Qgc3VwcG9ydCBtdWx0aXBsZSBzZWxlY3RvcnMgaW4gbmdQcm9qZWN0QXMuXG4gICAgY29uc3QgcGFyc2VkUjNTZWxlY3RvciA9IGNvcmUucGFyc2VTZWxlY3RvclRvUjNTZWxlY3Rvcihwcm9qZWN0QXMpWzBdO1xuICAgIGF0dHJBcnJheS5wdXNoKFxuICAgICAgICBvLmxpdGVyYWwoY29yZS5BdHRyaWJ1dGVNYXJrZXIuUHJvamVjdEFzKSwgbGl0ZXJhbE9yQXJyYXlMaXRlcmFsKHBhcnNlZFIzU2VsZWN0b3IpKTtcbiAgfVxuICBpZiAoY2xhc3Nlcy5sZW5ndGggPiAwKSB7XG4gICAgYXR0ckFycmF5LnB1c2goby5saXRlcmFsKGNvcmUuQXR0cmlidXRlTWFya2VyLkNsYXNzZXMpLCAuLi5jbGFzc2VzKTtcbiAgfVxuICBpZiAoc3R5bGVzLmxlbmd0aCA+IDApIHtcbiAgICBhdHRyQXJyYXkucHVzaChvLmxpdGVyYWwoY29yZS5BdHRyaWJ1dGVNYXJrZXIuU3R5bGVzKSwgLi4uc3R5bGVzKTtcbiAgfVxuICBpZiAoYmluZGluZ3MubGVuZ3RoID4gMCkge1xuICAgIGF0dHJBcnJheS5wdXNoKG8ubGl0ZXJhbChjb3JlLkF0dHJpYnV0ZU1hcmtlci5CaW5kaW5ncyksIC4uLmJpbmRpbmdzKTtcbiAgfVxuICBpZiAodGVtcGxhdGUubGVuZ3RoID4gMCkge1xuICAgIGF0dHJBcnJheS5wdXNoKG8ubGl0ZXJhbChjb3JlLkF0dHJpYnV0ZU1hcmtlci5UZW1wbGF0ZSksIC4uLnRlbXBsYXRlKTtcbiAgfVxuICBpZiAoaTE4bi5sZW5ndGggPiAwKSB7XG4gICAgYXR0ckFycmF5LnB1c2goby5saXRlcmFsKGNvcmUuQXR0cmlidXRlTWFya2VyLkkxOG4pLCAuLi5pMThuKTtcbiAgfVxuICByZXR1cm4gby5saXRlcmFsQXJyKGF0dHJBcnJheSk7XG59XG4iXX0=