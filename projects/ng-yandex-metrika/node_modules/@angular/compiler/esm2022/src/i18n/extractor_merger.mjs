/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as html from '../ml_parser/ast';
import { DEFAULT_CONTAINER_BLOCKS } from '../ml_parser/defaults';
import { ParseTreeResult } from '../ml_parser/parser';
import * as i18n from './i18n_ast';
import { createI18nMessageFactory } from './i18n_parser';
import { I18nError } from './parse_util';
const _I18N_ATTR = 'i18n';
const _I18N_ATTR_PREFIX = 'i18n-';
const _I18N_COMMENT_PREFIX_REGEXP = /^i18n:?/;
const MEANING_SEPARATOR = '|';
const ID_SEPARATOR = '@@';
let i18nCommentsWarned = false;
/**
 * Extract translatable messages from an html AST
 */
export function extractMessages(nodes, interpolationConfig, implicitTags, implicitAttrs) {
    const visitor = new _Visitor(implicitTags, implicitAttrs);
    return visitor.extract(nodes, interpolationConfig);
}
export function mergeTranslations(nodes, translations, interpolationConfig, implicitTags, implicitAttrs) {
    const visitor = new _Visitor(implicitTags, implicitAttrs);
    return visitor.merge(nodes, translations, interpolationConfig);
}
export class ExtractionResult {
    constructor(messages, errors) {
        this.messages = messages;
        this.errors = errors;
    }
}
var _VisitorMode;
(function (_VisitorMode) {
    _VisitorMode[_VisitorMode["Extract"] = 0] = "Extract";
    _VisitorMode[_VisitorMode["Merge"] = 1] = "Merge";
})(_VisitorMode || (_VisitorMode = {}));
/**
 * This Visitor is used:
 * 1. to extract all the translatable strings from an html AST (see `extract()`),
 * 2. to replace the translatable strings with the actual translations (see `merge()`)
 *
 * @internal
 */
class _Visitor {
    constructor(_implicitTags, _implicitAttrs) {
        this._implicitTags = _implicitTags;
        this._implicitAttrs = _implicitAttrs;
    }
    /**
     * Extracts the messages from the tree
     */
    extract(nodes, interpolationConfig) {
        this._init(_VisitorMode.Extract, interpolationConfig);
        nodes.forEach(node => node.visit(this, null));
        if (this._inI18nBlock) {
            this._reportError(nodes[nodes.length - 1], 'Unclosed block');
        }
        return new ExtractionResult(this._messages, this._errors);
    }
    /**
     * Returns a tree where all translatable nodes are translated
     */
    merge(nodes, translations, interpolationConfig) {
        this._init(_VisitorMode.Merge, interpolationConfig);
        this._translations = translations;
        // Construct a single fake root element
        const wrapper = new html.Element('wrapper', [], nodes, undefined, undefined, undefined);
        const translatedNode = wrapper.visit(this, null);
        if (this._inI18nBlock) {
            this._reportError(nodes[nodes.length - 1], 'Unclosed block');
        }
        return new ParseTreeResult(translatedNode.children, this._errors);
    }
    visitExpansionCase(icuCase, context) {
        // Parse cases for translatable html attributes
        const expression = html.visitAll(this, icuCase.expression, context);
        if (this._mode === _VisitorMode.Merge) {
            return new html.ExpansionCase(icuCase.value, expression, icuCase.sourceSpan, icuCase.valueSourceSpan, icuCase.expSourceSpan);
        }
    }
    visitExpansion(icu, context) {
        this._mayBeAddBlockChildren(icu);
        const wasInIcu = this._inIcu;
        if (!this._inIcu) {
            // nested ICU messages should not be extracted but top-level translated as a whole
            if (this._isInTranslatableSection) {
                this._addMessage([icu]);
            }
            this._inIcu = true;
        }
        const cases = html.visitAll(this, icu.cases, context);
        if (this._mode === _VisitorMode.Merge) {
            icu = new html.Expansion(icu.switchValue, icu.type, cases, icu.sourceSpan, icu.switchValueSourceSpan);
        }
        this._inIcu = wasInIcu;
        return icu;
    }
    visitComment(comment, context) {
        const isOpening = _isOpeningComment(comment);
        if (isOpening && this._isInTranslatableSection) {
            this._reportError(comment, 'Could not start a block inside a translatable section');
            return;
        }
        const isClosing = _isClosingComment(comment);
        if (isClosing && !this._inI18nBlock) {
            this._reportError(comment, 'Trying to close an unopened block');
            return;
        }
        if (!this._inI18nNode && !this._inIcu) {
            if (!this._inI18nBlock) {
                if (isOpening) {
                    // deprecated from v5 you should use <ng-container i18n> instead of i18n comments
                    if (!i18nCommentsWarned && console && console.warn) {
                        i18nCommentsWarned = true;
                        const details = comment.sourceSpan.details ? `, ${comment.sourceSpan.details}` : '';
                        // TODO(ocombe): use a log service once there is a public one available
                        console.warn(`I18n comments are deprecated, use an <ng-container> element instead (${comment.sourceSpan.start}${details})`);
                    }
                    this._inI18nBlock = true;
                    this._blockStartDepth = this._depth;
                    this._blockChildren = [];
                    this._blockMeaningAndDesc =
                        comment.value.replace(_I18N_COMMENT_PREFIX_REGEXP, '').trim();
                    this._openTranslatableSection(comment);
                }
            }
            else {
                if (isClosing) {
                    if (this._depth == this._blockStartDepth) {
                        this._closeTranslatableSection(comment, this._blockChildren);
                        this._inI18nBlock = false;
                        const message = this._addMessage(this._blockChildren, this._blockMeaningAndDesc);
                        // merge attributes in sections
                        const nodes = this._translateMessage(comment, message);
                        return html.visitAll(this, nodes);
                    }
                    else {
                        this._reportError(comment, 'I18N blocks should not cross element boundaries');
                        return;
                    }
                }
            }
        }
    }
    visitText(text, context) {
        if (this._isInTranslatableSection) {
            this._mayBeAddBlockChildren(text);
        }
        return text;
    }
    visitElement(el, context) {
        this._mayBeAddBlockChildren(el);
        this._depth++;
        const wasInI18nNode = this._inI18nNode;
        const wasInImplicitNode = this._inImplicitNode;
        let childNodes = [];
        let translatedChildNodes = undefined;
        // Extract:
        // - top level nodes with the (implicit) "i18n" attribute if not already in a section
        // - ICU messages
        const i18nAttr = _getI18nAttr(el);
        const i18nMeta = i18nAttr ? i18nAttr.value : '';
        const isImplicit = this._implicitTags.some(tag => el.name === tag) && !this._inIcu &&
            !this._isInTranslatableSection;
        const isTopLevelImplicit = !wasInImplicitNode && isImplicit;
        this._inImplicitNode = wasInImplicitNode || isImplicit;
        if (!this._isInTranslatableSection && !this._inIcu) {
            if (i18nAttr || isTopLevelImplicit) {
                this._inI18nNode = true;
                const message = this._addMessage(el.children, i18nMeta);
                translatedChildNodes = this._translateMessage(el, message);
            }
            if (this._mode == _VisitorMode.Extract) {
                const isTranslatable = i18nAttr || isTopLevelImplicit;
                if (isTranslatable)
                    this._openTranslatableSection(el);
                html.visitAll(this, el.children);
                if (isTranslatable)
                    this._closeTranslatableSection(el, el.children);
            }
        }
        else {
            if (i18nAttr || isTopLevelImplicit) {
                this._reportError(el, 'Could not mark an element as translatable inside a translatable section');
            }
            if (this._mode == _VisitorMode.Extract) {
                // Descend into child nodes for extraction
                html.visitAll(this, el.children);
            }
        }
        if (this._mode === _VisitorMode.Merge) {
            const visitNodes = translatedChildNodes || el.children;
            visitNodes.forEach(child => {
                const visited = child.visit(this, context);
                if (visited && !this._isInTranslatableSection) {
                    // Do not add the children from translatable sections (= i18n blocks here)
                    // They will be added later in this loop when the block closes (i.e. on `<!-- /i18n -->`)
                    childNodes = childNodes.concat(visited);
                }
            });
        }
        this._visitAttributesOf(el);
        this._depth--;
        this._inI18nNode = wasInI18nNode;
        this._inImplicitNode = wasInImplicitNode;
        if (this._mode === _VisitorMode.Merge) {
            const translatedAttrs = this._translateAttributes(el);
            return new html.Element(el.name, translatedAttrs, childNodes, el.sourceSpan, el.startSourceSpan, el.endSourceSpan);
        }
        return null;
    }
    visitAttribute(attribute, context) {
        throw new Error('unreachable code');
    }
    visitBlock(block, context) {
        html.visitAll(this, block.children, context);
    }
    visitBlockParameter(parameter, context) { }
    _init(mode, interpolationConfig) {
        this._mode = mode;
        this._inI18nBlock = false;
        this._inI18nNode = false;
        this._depth = 0;
        this._inIcu = false;
        this._msgCountAtSectionStart = undefined;
        this._errors = [];
        this._messages = [];
        this._inImplicitNode = false;
        this._createI18nMessage =
            createI18nMessageFactory(interpolationConfig, DEFAULT_CONTAINER_BLOCKS);
    }
    // looks for translatable attributes
    _visitAttributesOf(el) {
        const explicitAttrNameToValue = {};
        const implicitAttrNames = this._implicitAttrs[el.name] || [];
        el.attrs.filter(attr => attr.name.startsWith(_I18N_ATTR_PREFIX))
            .forEach(attr => explicitAttrNameToValue[attr.name.slice(_I18N_ATTR_PREFIX.length)] =
            attr.value);
        el.attrs.forEach(attr => {
            if (attr.name in explicitAttrNameToValue) {
                this._addMessage([attr], explicitAttrNameToValue[attr.name]);
            }
            else if (implicitAttrNames.some(name => attr.name === name)) {
                this._addMessage([attr]);
            }
        });
    }
    // add a translatable message
    _addMessage(ast, msgMeta) {
        if (ast.length == 0 ||
            ast.length == 1 && ast[0] instanceof html.Attribute && !ast[0].value) {
            // Do not create empty messages
            return null;
        }
        const { meaning, description, id } = _parseMessageMeta(msgMeta);
        const message = this._createI18nMessage(ast, meaning, description, id);
        this._messages.push(message);
        return message;
    }
    // Translates the given message given the `TranslationBundle`
    // This is used for translating elements / blocks - see `_translateAttributes` for attributes
    // no-op when called in extraction mode (returns [])
    _translateMessage(el, message) {
        if (message && this._mode === _VisitorMode.Merge) {
            const nodes = this._translations.get(message);
            if (nodes) {
                return nodes;
            }
            this._reportError(el, `Translation unavailable for message id="${this._translations.digest(message)}"`);
        }
        return [];
    }
    // translate the attributes of an element and remove i18n specific attributes
    _translateAttributes(el) {
        const attributes = el.attrs;
        const i18nParsedMessageMeta = {};
        attributes.forEach(attr => {
            if (attr.name.startsWith(_I18N_ATTR_PREFIX)) {
                i18nParsedMessageMeta[attr.name.slice(_I18N_ATTR_PREFIX.length)] =
                    _parseMessageMeta(attr.value);
            }
        });
        const translatedAttributes = [];
        attributes.forEach((attr) => {
            if (attr.name === _I18N_ATTR || attr.name.startsWith(_I18N_ATTR_PREFIX)) {
                // strip i18n specific attributes
                return;
            }
            if (attr.value && attr.value != '' && i18nParsedMessageMeta.hasOwnProperty(attr.name)) {
                const { meaning, description, id } = i18nParsedMessageMeta[attr.name];
                const message = this._createI18nMessage([attr], meaning, description, id);
                const nodes = this._translations.get(message);
                if (nodes) {
                    if (nodes.length == 0) {
                        translatedAttributes.push(new html.Attribute(attr.name, '', attr.sourceSpan, undefined /* keySpan */, undefined /* valueSpan */, undefined /* valueTokens */, undefined /* i18n */));
                    }
                    else if (nodes[0] instanceof html.Text) {
                        const value = nodes[0].value;
                        translatedAttributes.push(new html.Attribute(attr.name, value, attr.sourceSpan, undefined /* keySpan */, undefined /* valueSpan */, undefined /* valueTokens */, undefined /* i18n */));
                    }
                    else {
                        this._reportError(el, `Unexpected translation for attribute "${attr.name}" (id="${id || this._translations.digest(message)}")`);
                    }
                }
                else {
                    this._reportError(el, `Translation unavailable for attribute "${attr.name}" (id="${id || this._translations.digest(message)}")`);
                }
            }
            else {
                translatedAttributes.push(attr);
            }
        });
        return translatedAttributes;
    }
    /**
     * Add the node as a child of the block when:
     * - we are in a block,
     * - we are not inside a ICU message (those are handled separately),
     * - the node is a "direct child" of the block
     */
    _mayBeAddBlockChildren(node) {
        if (this._inI18nBlock && !this._inIcu && this._depth == this._blockStartDepth) {
            this._blockChildren.push(node);
        }
    }
    /**
     * Marks the start of a section, see `_closeTranslatableSection`
     */
    _openTranslatableSection(node) {
        if (this._isInTranslatableSection) {
            this._reportError(node, 'Unexpected section start');
        }
        else {
            this._msgCountAtSectionStart = this._messages.length;
        }
    }
    /**
     * A translatable section could be:
     * - the content of translatable element,
     * - nodes between `<!-- i18n -->` and `<!-- /i18n -->` comments
     */
    get _isInTranslatableSection() {
        return this._msgCountAtSectionStart !== void 0;
    }
    /**
     * Terminates a section.
     *
     * If a section has only one significant children (comments not significant) then we should not
     * keep the message from this children:
     *
     * `<p i18n="meaning|description">{ICU message}</p>` would produce two messages:
     * - one for the <p> content with meaning and description,
     * - another one for the ICU message.
     *
     * In this case the last message is discarded as it contains less information (the AST is
     * otherwise identical).
     *
     * Note that we should still keep messages extracted from attributes inside the section (ie in the
     * ICU message here)
     */
    _closeTranslatableSection(node, directChildren) {
        if (!this._isInTranslatableSection) {
            this._reportError(node, 'Unexpected section end');
            return;
        }
        const startIndex = this._msgCountAtSectionStart;
        const significantChildren = directChildren.reduce((count, node) => count + (node instanceof html.Comment ? 0 : 1), 0);
        if (significantChildren == 1) {
            for (let i = this._messages.length - 1; i >= startIndex; i--) {
                const ast = this._messages[i].nodes;
                if (!(ast.length == 1 && ast[0] instanceof i18n.Text)) {
                    this._messages.splice(i, 1);
                    break;
                }
            }
        }
        this._msgCountAtSectionStart = undefined;
    }
    _reportError(node, msg) {
        this._errors.push(new I18nError(node.sourceSpan, msg));
    }
}
function _isOpeningComment(n) {
    return !!(n instanceof html.Comment && n.value && n.value.startsWith('i18n'));
}
function _isClosingComment(n) {
    return !!(n instanceof html.Comment && n.value && n.value === '/i18n');
}
function _getI18nAttr(p) {
    return p.attrs.find(attr => attr.name === _I18N_ATTR) || null;
}
function _parseMessageMeta(i18n) {
    if (!i18n)
        return { meaning: '', description: '', id: '' };
    const idIndex = i18n.indexOf(ID_SEPARATOR);
    const descIndex = i18n.indexOf(MEANING_SEPARATOR);
    const [meaningAndDesc, id] = (idIndex > -1) ? [i18n.slice(0, idIndex), i18n.slice(idIndex + 2)] : [i18n, ''];
    const [meaning, description] = (descIndex > -1) ?
        [meaningAndDesc.slice(0, descIndex), meaningAndDesc.slice(descIndex + 1)] :
        ['', meaningAndDesc];
    return { meaning, description, id: id.trim() };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZXh0cmFjdG9yX21lcmdlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy9pMThuL2V4dHJhY3Rvcl9tZXJnZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLElBQUksTUFBTSxrQkFBa0IsQ0FBQztBQUN6QyxPQUFPLEVBQUMsd0JBQXdCLEVBQXNCLE1BQU0sdUJBQXVCLENBQUM7QUFDcEYsT0FBTyxFQUFDLGVBQWUsRUFBQyxNQUFNLHFCQUFxQixDQUFDO0FBRXBELE9BQU8sS0FBSyxJQUFJLE1BQU0sWUFBWSxDQUFDO0FBQ25DLE9BQU8sRUFBQyx3QkFBd0IsRUFBcUIsTUFBTSxlQUFlLENBQUM7QUFDM0UsT0FBTyxFQUFDLFNBQVMsRUFBQyxNQUFNLGNBQWMsQ0FBQztBQUd2QyxNQUFNLFVBQVUsR0FBRyxNQUFNLENBQUM7QUFDMUIsTUFBTSxpQkFBaUIsR0FBRyxPQUFPLENBQUM7QUFDbEMsTUFBTSwyQkFBMkIsR0FBRyxTQUFTLENBQUM7QUFDOUMsTUFBTSxpQkFBaUIsR0FBRyxHQUFHLENBQUM7QUFDOUIsTUFBTSxZQUFZLEdBQUcsSUFBSSxDQUFDO0FBQzFCLElBQUksa0JBQWtCLEdBQUcsS0FBSyxDQUFDO0FBRS9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FDM0IsS0FBa0IsRUFBRSxtQkFBd0MsRUFBRSxZQUFzQixFQUNwRixhQUFzQztJQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLFFBQVEsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDMUQsT0FBTyxPQUFPLENBQUMsT0FBTyxDQUFDLEtBQUssRUFBRSxtQkFBbUIsQ0FBQyxDQUFDO0FBQ3JELENBQUM7QUFFRCxNQUFNLFVBQVUsaUJBQWlCLENBQzdCLEtBQWtCLEVBQUUsWUFBK0IsRUFBRSxtQkFBd0MsRUFDN0YsWUFBc0IsRUFBRSxhQUFzQztJQUNoRSxNQUFNLE9BQU8sR0FBRyxJQUFJLFFBQVEsQ0FBQyxZQUFZLEVBQUUsYUFBYSxDQUFDLENBQUM7SUFDMUQsT0FBTyxPQUFPLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxZQUFZLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztBQUNqRSxDQUFDO0FBRUQsTUFBTSxPQUFPLGdCQUFnQjtJQUMzQixZQUFtQixRQUF3QixFQUFTLE1BQW1CO1FBQXBELGFBQVEsR0FBUixRQUFRLENBQWdCO1FBQVMsV0FBTSxHQUFOLE1BQU0sQ0FBYTtJQUFHLENBQUM7Q0FDNUU7QUFFRCxJQUFLLFlBR0o7QUFIRCxXQUFLLFlBQVk7SUFDZixxREFBTyxDQUFBO0lBQ1AsaURBQUssQ0FBQTtBQUNQLENBQUMsRUFISSxZQUFZLEtBQVosWUFBWSxRQUdoQjtBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sUUFBUTtJQStCWixZQUFvQixhQUF1QixFQUFVLGNBQXVDO1FBQXhFLGtCQUFhLEdBQWIsYUFBYSxDQUFVO1FBQVUsbUJBQWMsR0FBZCxjQUFjLENBQXlCO0lBQUcsQ0FBQztJQUVoRzs7T0FFRztJQUNILE9BQU8sQ0FBQyxLQUFrQixFQUFFLG1CQUF3QztRQUNsRSxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxPQUFPLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUV0RCxLQUFLLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUMsQ0FBQztRQUU5QyxJQUFJLElBQUksQ0FBQyxZQUFZLEVBQUU7WUFDckIsSUFBSSxDQUFDLFlBQVksQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRSxnQkFBZ0IsQ0FBQyxDQUFDO1NBQzlEO1FBRUQsT0FBTyxJQUFJLGdCQUFnQixDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO0lBQzVELENBQUM7SUFFRDs7T0FFRztJQUNILEtBQUssQ0FDRCxLQUFrQixFQUFFLFlBQStCLEVBQ25ELG1CQUF3QztRQUMxQyxJQUFJLENBQUMsS0FBSyxDQUFDLFlBQVksQ0FBQyxLQUFLLEVBQUUsbUJBQW1CLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsYUFBYSxHQUFHLFlBQVksQ0FBQztRQUVsQyx1Q0FBdUM7UUFDdkMsTUFBTSxPQUFPLEdBQUcsSUFBSSxJQUFJLENBQUMsT0FBTyxDQUFDLFNBQVMsRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLFNBQVUsRUFBRSxTQUFVLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFMUYsTUFBTSxjQUFjLEdBQUcsT0FBTyxDQUFDLEtBQUssQ0FBQyxJQUFJLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFakQsSUFBSSxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ3JCLElBQUksQ0FBQyxZQUFZLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEVBQUUsZ0JBQWdCLENBQUMsQ0FBQztTQUM5RDtRQUVELE9BQU8sSUFBSSxlQUFlLENBQUMsY0FBYyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDcEUsQ0FBQztJQUVELGtCQUFrQixDQUFDLE9BQTJCLEVBQUUsT0FBWTtRQUMxRCwrQ0FBK0M7UUFDL0MsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUVwRSxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssWUFBWSxDQUFDLEtBQUssRUFBRTtZQUNyQyxPQUFPLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FDekIsT0FBTyxDQUFDLEtBQUssRUFBRSxVQUFVLEVBQUUsT0FBTyxDQUFDLFVBQVUsRUFBRSxPQUFPLENBQUMsZUFBZSxFQUN0RSxPQUFPLENBQUMsYUFBYSxDQUFDLENBQUM7U0FDNUI7SUFDSCxDQUFDO0lBRUQsY0FBYyxDQUFDLEdBQW1CLEVBQUUsT0FBWTtRQUM5QyxJQUFJLENBQUMsc0JBQXNCLENBQUMsR0FBRyxDQUFDLENBQUM7UUFFakMsTUFBTSxRQUFRLEdBQUcsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUU3QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNoQixrRkFBa0Y7WUFDbEYsSUFBSSxJQUFJLENBQUMsd0JBQXdCLEVBQUU7Z0JBQ2pDLElBQUksQ0FBQyxXQUFXLENBQUMsQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDO2FBQ3pCO1lBQ0QsSUFBSSxDQUFDLE1BQU0sR0FBRyxJQUFJLENBQUM7U0FDcEI7UUFFRCxNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsUUFBUSxDQUFDLElBQUksRUFBRSxHQUFHLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFDO1FBRXRELElBQUksSUFBSSxDQUFDLEtBQUssS0FBSyxZQUFZLENBQUMsS0FBSyxFQUFFO1lBQ3JDLEdBQUcsR0FBRyxJQUFJLElBQUksQ0FBQyxTQUFTLENBQ3BCLEdBQUcsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsR0FBRyxDQUFDLFVBQVUsRUFBRSxHQUFHLENBQUMscUJBQXFCLENBQUMsQ0FBQztTQUNsRjtRQUVELElBQUksQ0FBQyxNQUFNLEdBQUcsUUFBUSxDQUFDO1FBRXZCLE9BQU8sR0FBRyxDQUFDO0lBQ2IsQ0FBQztJQUVELFlBQVksQ0FBQyxPQUFxQixFQUFFLE9BQVk7UUFDOUMsTUFBTSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFN0MsSUFBSSxTQUFTLElBQUksSUFBSSxDQUFDLHdCQUF3QixFQUFFO1lBQzlDLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLHVEQUF1RCxDQUFDLENBQUM7WUFDcEYsT0FBTztTQUNSO1FBRUQsTUFBTSxTQUFTLEdBQUcsaUJBQWlCLENBQUMsT0FBTyxDQUFDLENBQUM7UUFFN0MsSUFBSSxTQUFTLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFO1lBQ25DLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLG1DQUFtQyxDQUFDLENBQUM7WUFDaEUsT0FBTztTQUNSO1FBRUQsSUFBSSxDQUFDLElBQUksQ0FBQyxXQUFXLElBQUksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQ3JDLElBQUksQ0FBQyxJQUFJLENBQUMsWUFBWSxFQUFFO2dCQUN0QixJQUFJLFNBQVMsRUFBRTtvQkFDYixpRkFBaUY7b0JBQ2pGLElBQUksQ0FBQyxrQkFBa0IsSUFBUyxPQUFPLElBQVMsT0FBTyxDQUFDLElBQUksRUFBRTt3QkFDNUQsa0JBQWtCLEdBQUcsSUFBSSxDQUFDO3dCQUMxQixNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsS0FBSyxPQUFPLENBQUMsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7d0JBQ3BGLHVFQUF1RTt3QkFDdkUsT0FBTyxDQUFDLElBQUksQ0FBQyx3RUFDVCxPQUFPLENBQUMsVUFBVSxDQUFDLEtBQUssR0FBRyxPQUFPLEdBQUcsQ0FBQyxDQUFDO3FCQUM1QztvQkFDRCxJQUFJLENBQUMsWUFBWSxHQUFHLElBQUksQ0FBQztvQkFDekIsSUFBSSxDQUFDLGdCQUFnQixHQUFHLElBQUksQ0FBQyxNQUFNLENBQUM7b0JBQ3BDLElBQUksQ0FBQyxjQUFjLEdBQUcsRUFBRSxDQUFDO29CQUN6QixJQUFJLENBQUMsb0JBQW9CO3dCQUNyQixPQUFPLENBQUMsS0FBTSxDQUFDLE9BQU8sQ0FBQywyQkFBMkIsRUFBRSxFQUFFLENBQUMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztvQkFDbkUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUN4QzthQUNGO2lCQUFNO2dCQUNMLElBQUksU0FBUyxFQUFFO29CQUNiLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7d0JBQ3hDLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxPQUFPLEVBQUUsSUFBSSxDQUFDLGNBQWMsQ0FBQyxDQUFDO3dCQUM3RCxJQUFJLENBQUMsWUFBWSxHQUFHLEtBQUssQ0FBQzt3QkFDMUIsTUFBTSxPQUFPLEdBQUcsSUFBSSxDQUFDLFdBQVcsQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLElBQUksQ0FBQyxvQkFBb0IsQ0FBRSxDQUFDO3dCQUNsRiwrQkFBK0I7d0JBQy9CLE1BQU0sS0FBSyxHQUFHLElBQUksQ0FBQyxpQkFBaUIsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLENBQUM7d0JBQ3ZELE9BQU8sSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsS0FBSyxDQUFDLENBQUM7cUJBQ25DO3lCQUFNO3dCQUNMLElBQUksQ0FBQyxZQUFZLENBQUMsT0FBTyxFQUFFLGlEQUFpRCxDQUFDLENBQUM7d0JBQzlFLE9BQU87cUJBQ1I7aUJBQ0Y7YUFDRjtTQUNGO0lBQ0gsQ0FBQztJQUVELFNBQVMsQ0FBQyxJQUFlLEVBQUUsT0FBWTtRQUNyQyxJQUFJLElBQUksQ0FBQyx3QkFBd0IsRUFBRTtZQUNqQyxJQUFJLENBQUMsc0JBQXNCLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDbkM7UUFDRCxPQUFPLElBQUksQ0FBQztJQUNkLENBQUM7SUFFRCxZQUFZLENBQUMsRUFBZ0IsRUFBRSxPQUFZO1FBQ3pDLElBQUksQ0FBQyxzQkFBc0IsQ0FBQyxFQUFFLENBQUMsQ0FBQztRQUNoQyxJQUFJLENBQUMsTUFBTSxFQUFFLENBQUM7UUFDZCxNQUFNLGFBQWEsR0FBRyxJQUFJLENBQUMsV0FBVyxDQUFDO1FBQ3ZDLE1BQU0saUJBQWlCLEdBQUcsSUFBSSxDQUFDLGVBQWUsQ0FBQztRQUMvQyxJQUFJLFVBQVUsR0FBZ0IsRUFBRSxDQUFDO1FBQ2pDLElBQUksb0JBQW9CLEdBQWdCLFNBQVUsQ0FBQztRQUVuRCxXQUFXO1FBQ1gscUZBQXFGO1FBQ3JGLGlCQUFpQjtRQUNqQixNQUFNLFFBQVEsR0FBRyxZQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7UUFDbEMsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUM7UUFDaEQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsSUFBSSxLQUFLLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU07WUFDOUUsQ0FBQyxJQUFJLENBQUMsd0JBQXdCLENBQUM7UUFDbkMsTUFBTSxrQkFBa0IsR0FBRyxDQUFDLGlCQUFpQixJQUFJLFVBQVUsQ0FBQztRQUM1RCxJQUFJLENBQUMsZUFBZSxHQUFHLGlCQUFpQixJQUFJLFVBQVUsQ0FBQztRQUV2RCxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixJQUFJLENBQUMsSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUNsRCxJQUFJLFFBQVEsSUFBSSxrQkFBa0IsRUFBRTtnQkFDbEMsSUFBSSxDQUFDLFdBQVcsR0FBRyxJQUFJLENBQUM7Z0JBQ3hCLE1BQU0sT0FBTyxHQUFHLElBQUksQ0FBQyxXQUFXLENBQUMsRUFBRSxDQUFDLFFBQVEsRUFBRSxRQUFRLENBQUUsQ0FBQztnQkFDekQsb0JBQW9CLEdBQUcsSUFBSSxDQUFDLGlCQUFpQixDQUFDLEVBQUUsRUFBRSxPQUFPLENBQUMsQ0FBQzthQUM1RDtZQUVELElBQUksSUFBSSxDQUFDLEtBQUssSUFBSSxZQUFZLENBQUMsT0FBTyxFQUFFO2dCQUN0QyxNQUFNLGNBQWMsR0FBRyxRQUFRLElBQUksa0JBQWtCLENBQUM7Z0JBQ3RELElBQUksY0FBYztvQkFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3RELElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxRQUFRLENBQUMsQ0FBQztnQkFDakMsSUFBSSxjQUFjO29CQUFFLElBQUksQ0FBQyx5QkFBeUIsQ0FBQyxFQUFFLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQ3JFO1NBQ0Y7YUFBTTtZQUNMLElBQUksUUFBUSxJQUFJLGtCQUFrQixFQUFFO2dCQUNsQyxJQUFJLENBQUMsWUFBWSxDQUNiLEVBQUUsRUFBRSx5RUFBeUUsQ0FBQyxDQUFDO2FBQ3BGO1lBRUQsSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLFlBQVksQ0FBQyxPQUFPLEVBQUU7Z0JBQ3RDLDBDQUEwQztnQkFDMUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLFFBQVEsQ0FBQyxDQUFDO2FBQ2xDO1NBQ0Y7UUFFRCxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssWUFBWSxDQUFDLEtBQUssRUFBRTtZQUNyQyxNQUFNLFVBQVUsR0FBRyxvQkFBb0IsSUFBSSxFQUFFLENBQUMsUUFBUSxDQUFDO1lBQ3ZELFVBQVUsQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLEVBQUU7Z0JBQ3pCLE1BQU0sT0FBTyxHQUFHLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxDQUFDO2dCQUMzQyxJQUFJLE9BQU8sSUFBSSxDQUFDLElBQUksQ0FBQyx3QkFBd0IsRUFBRTtvQkFDN0MsMEVBQTBFO29CQUMxRSx5RkFBeUY7b0JBQ3pGLFVBQVUsR0FBRyxVQUFVLENBQUMsTUFBTSxDQUFDLE9BQU8sQ0FBQyxDQUFDO2lCQUN6QztZQUNILENBQUMsQ0FBQyxDQUFDO1NBQ0o7UUFFRCxJQUFJLENBQUMsa0JBQWtCLENBQUMsRUFBRSxDQUFDLENBQUM7UUFFNUIsSUFBSSxDQUFDLE1BQU0sRUFBRSxDQUFDO1FBQ2QsSUFBSSxDQUFDLFdBQVcsR0FBRyxhQUFhLENBQUM7UUFDakMsSUFBSSxDQUFDLGVBQWUsR0FBRyxpQkFBaUIsQ0FBQztRQUV6QyxJQUFJLElBQUksQ0FBQyxLQUFLLEtBQUssWUFBWSxDQUFDLEtBQUssRUFBRTtZQUNyQyxNQUFNLGVBQWUsR0FBRyxJQUFJLENBQUMsb0JBQW9CLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDdEQsT0FBTyxJQUFJLElBQUksQ0FBQyxPQUFPLENBQ25CLEVBQUUsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsVUFBVSxFQUFFLEVBQUUsQ0FBQyxlQUFlLEVBQ3ZFLEVBQUUsQ0FBQyxhQUFhLENBQUMsQ0FBQztTQUN2QjtRQUNELE9BQU8sSUFBSSxDQUFDO0lBQ2QsQ0FBQztJQUVELGNBQWMsQ0FBQyxTQUF5QixFQUFFLE9BQVk7UUFDcEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFFRCxVQUFVLENBQUMsS0FBaUIsRUFBRSxPQUFZO1FBQ3hDLElBQUksQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLEtBQUssQ0FBQyxRQUFRLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELG1CQUFtQixDQUFDLFNBQThCLEVBQUUsT0FBWSxJQUFHLENBQUM7SUFFNUQsS0FBSyxDQUFDLElBQWtCLEVBQUUsbUJBQXdDO1FBQ3hFLElBQUksQ0FBQyxLQUFLLEdBQUcsSUFBSSxDQUFDO1FBQ2xCLElBQUksQ0FBQyxZQUFZLEdBQUcsS0FBSyxDQUFDO1FBQzFCLElBQUksQ0FBQyxXQUFXLEdBQUcsS0FBSyxDQUFDO1FBQ3pCLElBQUksQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDO1FBQ2hCLElBQUksQ0FBQyxNQUFNLEdBQUcsS0FBSyxDQUFDO1FBQ3BCLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxTQUFTLENBQUM7UUFDekMsSUFBSSxDQUFDLE9BQU8sR0FBRyxFQUFFLENBQUM7UUFDbEIsSUFBSSxDQUFDLFNBQVMsR0FBRyxFQUFFLENBQUM7UUFDcEIsSUFBSSxDQUFDLGVBQWUsR0FBRyxLQUFLLENBQUM7UUFDN0IsSUFBSSxDQUFDLGtCQUFrQjtZQUNuQix3QkFBd0IsQ0FBQyxtQkFBbUIsRUFBRSx3QkFBd0IsQ0FBQyxDQUFDO0lBQzlFLENBQUM7SUFFRCxvQ0FBb0M7SUFDNUIsa0JBQWtCLENBQUMsRUFBZ0I7UUFDekMsTUFBTSx1QkFBdUIsR0FBMEIsRUFBRSxDQUFDO1FBQzFELE1BQU0saUJBQWlCLEdBQWEsSUFBSSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO1FBRXZFLEVBQUUsQ0FBQyxLQUFLLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxVQUFVLENBQUMsaUJBQWlCLENBQUMsQ0FBQzthQUMzRCxPQUFPLENBQ0osSUFBSSxDQUFDLEVBQUUsQ0FBQyx1QkFBdUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxpQkFBaUIsQ0FBQyxNQUFNLENBQUMsQ0FBQztZQUN0RSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7UUFFeEIsRUFBRSxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDdEIsSUFBSSxJQUFJLENBQUMsSUFBSSxJQUFJLHVCQUF1QixFQUFFO2dCQUN4QyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsdUJBQXVCLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDOUQ7aUJBQU0sSUFBSSxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsSUFBSSxLQUFLLElBQUksQ0FBQyxFQUFFO2dCQUM3RCxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQzthQUMxQjtRQUNILENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztJQUVELDZCQUE2QjtJQUNyQixXQUFXLENBQUMsR0FBZ0IsRUFBRSxPQUFnQjtRQUNwRCxJQUFJLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQztZQUNmLEdBQUcsQ0FBQyxNQUFNLElBQUksQ0FBQyxJQUFJLEdBQUcsQ0FBQyxDQUFDLENBQUMsWUFBWSxJQUFJLENBQUMsU0FBUyxJQUFJLENBQWtCLEdBQUcsQ0FBQyxDQUFDLENBQUUsQ0FBQyxLQUFLLEVBQUU7WUFDMUYsK0JBQStCO1lBQy9CLE9BQU8sSUFBSSxDQUFDO1NBQ2I7UUFFRCxNQUFNLEVBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUMsR0FBRyxpQkFBaUIsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUM5RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsa0JBQWtCLENBQUMsR0FBRyxFQUFFLE9BQU8sRUFBRSxXQUFXLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFDdkUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDN0IsT0FBTyxPQUFPLENBQUM7SUFDakIsQ0FBQztJQUVELDZEQUE2RDtJQUM3RCw2RkFBNkY7SUFDN0Ysb0RBQW9EO0lBQzVDLGlCQUFpQixDQUFDLEVBQWEsRUFBRSxPQUFxQjtRQUM1RCxJQUFJLE9BQU8sSUFBSSxJQUFJLENBQUMsS0FBSyxLQUFLLFlBQVksQ0FBQyxLQUFLLEVBQUU7WUFDaEQsTUFBTSxLQUFLLEdBQUcsSUFBSSxDQUFDLGFBQWEsQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUM7WUFFOUMsSUFBSSxLQUFLLEVBQUU7Z0JBQ1QsT0FBTyxLQUFLLENBQUM7YUFDZDtZQUVELElBQUksQ0FBQyxZQUFZLENBQ2IsRUFBRSxFQUFFLDJDQUEyQyxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUM7U0FDM0Y7UUFFRCxPQUFPLEVBQUUsQ0FBQztJQUNaLENBQUM7SUFFRCw2RUFBNkU7SUFDckUsb0JBQW9CLENBQUMsRUFBZ0I7UUFDM0MsTUFBTSxVQUFVLEdBQUcsRUFBRSxDQUFDLEtBQUssQ0FBQztRQUM1QixNQUFNLHFCQUFxQixHQUNnRCxFQUFFLENBQUM7UUFFOUUsVUFBVSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRTtZQUN4QixJQUFJLElBQUksQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDLGlCQUFpQixDQUFDLEVBQUU7Z0JBQzNDLHFCQUFxQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLGlCQUFpQixDQUFDLE1BQU0sQ0FBQyxDQUFDO29CQUM1RCxpQkFBaUIsQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUM7YUFDbkM7UUFDSCxDQUFDLENBQUMsQ0FBQztRQUVILE1BQU0sb0JBQW9CLEdBQXFCLEVBQUUsQ0FBQztRQUVsRCxVQUFVLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUU7WUFDMUIsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLFVBQVUsSUFBSSxJQUFJLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxpQkFBaUIsQ0FBQyxFQUFFO2dCQUN2RSxpQ0FBaUM7Z0JBQ2pDLE9BQU87YUFDUjtZQUVELElBQUksSUFBSSxDQUFDLEtBQUssSUFBSSxJQUFJLENBQUMsS0FBSyxJQUFJLEVBQUUsSUFBSSxxQkFBcUIsQ0FBQyxjQUFjLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO2dCQUNyRixNQUFNLEVBQUMsT0FBTyxFQUFFLFdBQVcsRUFBRSxFQUFFLEVBQUMsR0FBRyxxQkFBcUIsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7Z0JBQ3BFLE1BQU0sT0FBTyxHQUFpQixJQUFJLENBQUMsa0JBQWtCLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxPQUFPLEVBQUUsV0FBVyxFQUFFLEVBQUUsQ0FBQyxDQUFDO2dCQUN4RixNQUFNLEtBQUssR0FBRyxJQUFJLENBQUMsYUFBYSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQztnQkFDOUMsSUFBSSxLQUFLLEVBQUU7b0JBQ1QsSUFBSSxLQUFLLENBQUMsTUFBTSxJQUFJLENBQUMsRUFBRTt3QkFDckIsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FDeEMsSUFBSSxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsYUFBYSxFQUFFLFNBQVMsQ0FBQyxlQUFlLEVBQ2xGLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztxQkFDekQ7eUJBQU0sSUFBSSxLQUFLLENBQUMsQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksRUFBRTt3QkFDeEMsTUFBTSxLQUFLLEdBQUksS0FBSyxDQUFDLENBQUMsQ0FBZSxDQUFDLEtBQUssQ0FBQzt3QkFDNUMsb0JBQW9CLENBQUMsSUFBSSxDQUFDLElBQUksSUFBSSxDQUFDLFNBQVMsQ0FDeEMsSUFBSSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxDQUFDLFVBQVUsRUFBRSxTQUFTLENBQUMsYUFBYSxFQUMxRCxTQUFTLENBQUMsZUFBZSxFQUFFLFNBQVMsQ0FBQyxpQkFBaUIsRUFBRSxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUMsQ0FBQztxQkFDcEY7eUJBQU07d0JBQ0wsSUFBSSxDQUFDLFlBQVksQ0FDYixFQUFFLEVBQ0YseUNBQXlDLElBQUksQ0FBQyxJQUFJLFVBQzlDLEVBQUUsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUM7cUJBQ3ZEO2lCQUNGO3FCQUFNO29CQUNMLElBQUksQ0FBQyxZQUFZLENBQ2IsRUFBRSxFQUNGLDBDQUEwQyxJQUFJLENBQUMsSUFBSSxVQUMvQyxFQUFFLElBQUksSUFBSSxDQUFDLGFBQWEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDO2lCQUN2RDthQUNGO2lCQUFNO2dCQUNMLG9CQUFvQixDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsQ0FBQzthQUNqQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsT0FBTyxvQkFBb0IsQ0FBQztJQUM5QixDQUFDO0lBR0Q7Ozs7O09BS0c7SUFDSyxzQkFBc0IsQ0FBQyxJQUFlO1FBQzVDLElBQUksSUFBSSxDQUFDLFlBQVksSUFBSSxDQUFDLElBQUksQ0FBQyxNQUFNLElBQUksSUFBSSxDQUFDLE1BQU0sSUFBSSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7WUFDN0UsSUFBSSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7U0FDaEM7SUFDSCxDQUFDO0lBRUQ7O09BRUc7SUFDSyx3QkFBd0IsQ0FBQyxJQUFlO1FBQzlDLElBQUksSUFBSSxDQUFDLHdCQUF3QixFQUFFO1lBQ2pDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLDBCQUEwQixDQUFDLENBQUM7U0FDckQ7YUFBTTtZQUNMLElBQUksQ0FBQyx1QkFBdUIsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLE1BQU0sQ0FBQztTQUN0RDtJQUNILENBQUM7SUFFRDs7OztPQUlHO0lBQ0gsSUFBWSx3QkFBd0I7UUFDbEMsT0FBTyxJQUFJLENBQUMsdUJBQXVCLEtBQUssS0FBSyxDQUFDLENBQUM7SUFDakQsQ0FBQztJQUVEOzs7Ozs7Ozs7Ozs7Ozs7T0FlRztJQUNLLHlCQUF5QixDQUFDLElBQWUsRUFBRSxjQUEyQjtRQUM1RSxJQUFJLENBQUMsSUFBSSxDQUFDLHdCQUF3QixFQUFFO1lBQ2xDLElBQUksQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLHdCQUF3QixDQUFDLENBQUM7WUFDbEQsT0FBTztTQUNSO1FBRUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxDQUFDLHVCQUF1QixDQUFDO1FBQ2hELE1BQU0sbUJBQW1CLEdBQVcsY0FBYyxDQUFDLE1BQU0sQ0FDckQsQ0FBQyxLQUFhLEVBQUUsSUFBZSxFQUFVLEVBQUUsQ0FBQyxLQUFLLEdBQUcsQ0FBQyxJQUFJLFlBQVksSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFDMUYsQ0FBQyxDQUFDLENBQUM7UUFFUCxJQUFJLG1CQUFtQixJQUFJLENBQUMsRUFBRTtZQUM1QixLQUFLLElBQUksQ0FBQyxHQUFHLElBQUksQ0FBQyxTQUFTLENBQUMsTUFBTSxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksVUFBVyxFQUFFLENBQUMsRUFBRSxFQUFFO2dCQUM3RCxNQUFNLEdBQUcsR0FBRyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxDQUFDLEtBQUssQ0FBQztnQkFDcEMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLE1BQU0sSUFBSSxDQUFDLElBQUksR0FBRyxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRTtvQkFDckQsSUFBSSxDQUFDLFNBQVMsQ0FBQyxNQUFNLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDO29CQUM1QixNQUFNO2lCQUNQO2FBQ0Y7U0FDRjtRQUVELElBQUksQ0FBQyx1QkFBdUIsR0FBRyxTQUFTLENBQUM7SUFDM0MsQ0FBQztJQUVPLFlBQVksQ0FBQyxJQUFlLEVBQUUsR0FBVztRQUMvQyxJQUFJLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxJQUFJLFNBQVMsQ0FBQyxJQUFJLENBQUMsVUFBVSxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7SUFDekQsQ0FBQztDQUNGO0FBRUQsU0FBUyxpQkFBaUIsQ0FBQyxDQUFZO0lBQ3JDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxZQUFZLElBQUksQ0FBQyxPQUFPLElBQUksQ0FBQyxDQUFDLEtBQUssSUFBSSxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO0FBQ2hGLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLENBQVk7SUFDckMsT0FBTyxDQUFDLENBQUMsQ0FBQyxDQUFDLFlBQVksSUFBSSxDQUFDLE9BQU8sSUFBSSxDQUFDLENBQUMsS0FBSyxJQUFJLENBQUMsQ0FBQyxLQUFLLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDekUsQ0FBQztBQUVELFNBQVMsWUFBWSxDQUFDLENBQWU7SUFDbkMsT0FBTyxDQUFDLENBQUMsS0FBSyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEtBQUssVUFBVSxDQUFDLElBQUksSUFBSSxDQUFDO0FBQ2hFLENBQUM7QUFFRCxTQUFTLGlCQUFpQixDQUFDLElBQWE7SUFDdEMsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLEVBQUMsT0FBTyxFQUFFLEVBQUUsRUFBRSxXQUFXLEVBQUUsRUFBRSxFQUFFLEVBQUUsRUFBRSxFQUFFLEVBQUMsQ0FBQztJQUV6RCxNQUFNLE9BQU8sR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQzNDLE1BQU0sU0FBUyxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsaUJBQWlCLENBQUMsQ0FBQztJQUNsRCxNQUFNLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxHQUN0QixDQUFDLE9BQU8sR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLE9BQU8sQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxHQUFHLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO0lBQ3BGLE1BQU0sQ0FBQyxPQUFPLEVBQUUsV0FBVyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzdDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDLEVBQUUsU0FBUyxDQUFDLEVBQUUsY0FBYyxDQUFDLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNFLENBQUMsRUFBRSxFQUFFLGNBQWMsQ0FBQyxDQUFDO0lBRXpCLE9BQU8sRUFBQyxPQUFPLEVBQUUsV0FBVyxFQUFFLEVBQUUsRUFBRSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUMsQ0FBQztBQUMvQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGh0bWwgZnJvbSAnLi4vbWxfcGFyc2VyL2FzdCc7XG5pbXBvcnQge0RFRkFVTFRfQ09OVEFJTkVSX0JMT0NLUywgSW50ZXJwb2xhdGlvbkNvbmZpZ30gZnJvbSAnLi4vbWxfcGFyc2VyL2RlZmF1bHRzJztcbmltcG9ydCB7UGFyc2VUcmVlUmVzdWx0fSBmcm9tICcuLi9tbF9wYXJzZXIvcGFyc2VyJztcblxuaW1wb3J0ICogYXMgaTE4biBmcm9tICcuL2kxOG5fYXN0JztcbmltcG9ydCB7Y3JlYXRlSTE4bk1lc3NhZ2VGYWN0b3J5LCBJMThuTWVzc2FnZUZhY3Rvcnl9IGZyb20gJy4vaTE4bl9wYXJzZXInO1xuaW1wb3J0IHtJMThuRXJyb3J9IGZyb20gJy4vcGFyc2VfdXRpbCc7XG5pbXBvcnQge1RyYW5zbGF0aW9uQnVuZGxlfSBmcm9tICcuL3RyYW5zbGF0aW9uX2J1bmRsZSc7XG5cbmNvbnN0IF9JMThOX0FUVFIgPSAnaTE4bic7XG5jb25zdCBfSTE4Tl9BVFRSX1BSRUZJWCA9ICdpMThuLSc7XG5jb25zdCBfSTE4Tl9DT01NRU5UX1BSRUZJWF9SRUdFWFAgPSAvXmkxOG46Py87XG5jb25zdCBNRUFOSU5HX1NFUEFSQVRPUiA9ICd8JztcbmNvbnN0IElEX1NFUEFSQVRPUiA9ICdAQCc7XG5sZXQgaTE4bkNvbW1lbnRzV2FybmVkID0gZmFsc2U7XG5cbi8qKlxuICogRXh0cmFjdCB0cmFuc2xhdGFibGUgbWVzc2FnZXMgZnJvbSBhbiBodG1sIEFTVFxuICovXG5leHBvcnQgZnVuY3Rpb24gZXh0cmFjdE1lc3NhZ2VzKFxuICAgIG5vZGVzOiBodG1sLk5vZGVbXSwgaW50ZXJwb2xhdGlvbkNvbmZpZzogSW50ZXJwb2xhdGlvbkNvbmZpZywgaW1wbGljaXRUYWdzOiBzdHJpbmdbXSxcbiAgICBpbXBsaWNpdEF0dHJzOiB7W2s6IHN0cmluZ106IHN0cmluZ1tdfSk6IEV4dHJhY3Rpb25SZXN1bHQge1xuICBjb25zdCB2aXNpdG9yID0gbmV3IF9WaXNpdG9yKGltcGxpY2l0VGFncywgaW1wbGljaXRBdHRycyk7XG4gIHJldHVybiB2aXNpdG9yLmV4dHJhY3Qobm9kZXMsIGludGVycG9sYXRpb25Db25maWcpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVyZ2VUcmFuc2xhdGlvbnMoXG4gICAgbm9kZXM6IGh0bWwuTm9kZVtdLCB0cmFuc2xhdGlvbnM6IFRyYW5zbGF0aW9uQnVuZGxlLCBpbnRlcnBvbGF0aW9uQ29uZmlnOiBJbnRlcnBvbGF0aW9uQ29uZmlnLFxuICAgIGltcGxpY2l0VGFnczogc3RyaW5nW10sIGltcGxpY2l0QXR0cnM6IHtbazogc3RyaW5nXTogc3RyaW5nW119KTogUGFyc2VUcmVlUmVzdWx0IHtcbiAgY29uc3QgdmlzaXRvciA9IG5ldyBfVmlzaXRvcihpbXBsaWNpdFRhZ3MsIGltcGxpY2l0QXR0cnMpO1xuICByZXR1cm4gdmlzaXRvci5tZXJnZShub2RlcywgdHJhbnNsYXRpb25zLCBpbnRlcnBvbGF0aW9uQ29uZmlnKTtcbn1cblxuZXhwb3J0IGNsYXNzIEV4dHJhY3Rpb25SZXN1bHQge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgbWVzc2FnZXM6IGkxOG4uTWVzc2FnZVtdLCBwdWJsaWMgZXJyb3JzOiBJMThuRXJyb3JbXSkge31cbn1cblxuZW51bSBfVmlzaXRvck1vZGUge1xuICBFeHRyYWN0LFxuICBNZXJnZVxufVxuXG4vKipcbiAqIFRoaXMgVmlzaXRvciBpcyB1c2VkOlxuICogMS4gdG8gZXh0cmFjdCBhbGwgdGhlIHRyYW5zbGF0YWJsZSBzdHJpbmdzIGZyb20gYW4gaHRtbCBBU1QgKHNlZSBgZXh0cmFjdCgpYCksXG4gKiAyLiB0byByZXBsYWNlIHRoZSB0cmFuc2xhdGFibGUgc3RyaW5ncyB3aXRoIHRoZSBhY3R1YWwgdHJhbnNsYXRpb25zIChzZWUgYG1lcmdlKClgKVxuICpcbiAqIEBpbnRlcm5hbFxuICovXG5jbGFzcyBfVmlzaXRvciBpbXBsZW1lbnRzIGh0bWwuVmlzaXRvciB7XG4gIC8vIFVzaW5nIG5vbi1udWxsIGFzc2VydGlvbnMgYmVjYXVzZSBhbGwgdmFyaWFibGVzIGFyZSAocmUpc2V0IGluIGluaXQoKVxuXG4gIHByaXZhdGUgX2RlcHRoITogbnVtYmVyO1xuXG4gIC8vIDxlbCBpMThuPi4uLjwvZWw+XG4gIHByaXZhdGUgX2luSTE4bk5vZGUhOiBib29sZWFuO1xuICBwcml2YXRlIF9pbkltcGxpY2l0Tm9kZSE6IGJvb2xlYW47XG5cbiAgLy8gPCEtLWkxOG4tLT4uLi48IS0tL2kxOG4tLT5cbiAgcHJpdmF0ZSBfaW5JMThuQmxvY2shOiBib29sZWFuO1xuICBwcml2YXRlIF9ibG9ja01lYW5pbmdBbmREZXNjITogc3RyaW5nO1xuICBwcml2YXRlIF9ibG9ja0NoaWxkcmVuITogaHRtbC5Ob2RlW107XG4gIHByaXZhdGUgX2Jsb2NrU3RhcnREZXB0aCE6IG51bWJlcjtcblxuICAvLyB7PGljdSBtZXNzYWdlPn1cbiAgcHJpdmF0ZSBfaW5JY3UhOiBib29sZWFuO1xuXG4gIC8vIHNldCB0byB2b2lkIDAgd2hlbiBub3QgaW4gYSBzZWN0aW9uXG4gIHByaXZhdGUgX21zZ0NvdW50QXRTZWN0aW9uU3RhcnQ6IG51bWJlcnx1bmRlZmluZWQ7XG4gIHByaXZhdGUgX2Vycm9ycyE6IEkxOG5FcnJvcltdO1xuICBwcml2YXRlIF9tb2RlITogX1Zpc2l0b3JNb2RlO1xuXG4gIC8vIF9WaXNpdG9yTW9kZS5FeHRyYWN0IG9ubHlcbiAgcHJpdmF0ZSBfbWVzc2FnZXMhOiBpMThuLk1lc3NhZ2VbXTtcblxuICAvLyBfVmlzaXRvck1vZGUuTWVyZ2Ugb25seVxuICBwcml2YXRlIF90cmFuc2xhdGlvbnMhOiBUcmFuc2xhdGlvbkJ1bmRsZTtcbiAgcHJpdmF0ZSBfY3JlYXRlSTE4bk1lc3NhZ2UhOiBJMThuTWVzc2FnZUZhY3Rvcnk7XG5cblxuICBjb25zdHJ1Y3Rvcihwcml2YXRlIF9pbXBsaWNpdFRhZ3M6IHN0cmluZ1tdLCBwcml2YXRlIF9pbXBsaWNpdEF0dHJzOiB7W2s6IHN0cmluZ106IHN0cmluZ1tdfSkge31cblxuICAvKipcbiAgICogRXh0cmFjdHMgdGhlIG1lc3NhZ2VzIGZyb20gdGhlIHRyZWVcbiAgICovXG4gIGV4dHJhY3Qobm9kZXM6IGh0bWwuTm9kZVtdLCBpbnRlcnBvbGF0aW9uQ29uZmlnOiBJbnRlcnBvbGF0aW9uQ29uZmlnKTogRXh0cmFjdGlvblJlc3VsdCB7XG4gICAgdGhpcy5faW5pdChfVmlzaXRvck1vZGUuRXh0cmFjdCwgaW50ZXJwb2xhdGlvbkNvbmZpZyk7XG5cbiAgICBub2Rlcy5mb3JFYWNoKG5vZGUgPT4gbm9kZS52aXNpdCh0aGlzLCBudWxsKSk7XG5cbiAgICBpZiAodGhpcy5faW5JMThuQmxvY2spIHtcbiAgICAgIHRoaXMuX3JlcG9ydEVycm9yKG5vZGVzW25vZGVzLmxlbmd0aCAtIDFdLCAnVW5jbG9zZWQgYmxvY2snKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IEV4dHJhY3Rpb25SZXN1bHQodGhpcy5fbWVzc2FnZXMsIHRoaXMuX2Vycm9ycyk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhIHRyZWUgd2hlcmUgYWxsIHRyYW5zbGF0YWJsZSBub2RlcyBhcmUgdHJhbnNsYXRlZFxuICAgKi9cbiAgbWVyZ2UoXG4gICAgICBub2RlczogaHRtbC5Ob2RlW10sIHRyYW5zbGF0aW9uczogVHJhbnNsYXRpb25CdW5kbGUsXG4gICAgICBpbnRlcnBvbGF0aW9uQ29uZmlnOiBJbnRlcnBvbGF0aW9uQ29uZmlnKTogUGFyc2VUcmVlUmVzdWx0IHtcbiAgICB0aGlzLl9pbml0KF9WaXNpdG9yTW9kZS5NZXJnZSwgaW50ZXJwb2xhdGlvbkNvbmZpZyk7XG4gICAgdGhpcy5fdHJhbnNsYXRpb25zID0gdHJhbnNsYXRpb25zO1xuXG4gICAgLy8gQ29uc3RydWN0IGEgc2luZ2xlIGZha2Ugcm9vdCBlbGVtZW50XG4gICAgY29uc3Qgd3JhcHBlciA9IG5ldyBodG1sLkVsZW1lbnQoJ3dyYXBwZXInLCBbXSwgbm9kZXMsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCEsIHVuZGVmaW5lZCk7XG5cbiAgICBjb25zdCB0cmFuc2xhdGVkTm9kZSA9IHdyYXBwZXIudmlzaXQodGhpcywgbnVsbCk7XG5cbiAgICBpZiAodGhpcy5faW5JMThuQmxvY2spIHtcbiAgICAgIHRoaXMuX3JlcG9ydEVycm9yKG5vZGVzW25vZGVzLmxlbmd0aCAtIDFdLCAnVW5jbG9zZWQgYmxvY2snKTtcbiAgICB9XG5cbiAgICByZXR1cm4gbmV3IFBhcnNlVHJlZVJlc3VsdCh0cmFuc2xhdGVkTm9kZS5jaGlsZHJlbiwgdGhpcy5fZXJyb3JzKTtcbiAgfVxuXG4gIHZpc2l0RXhwYW5zaW9uQ2FzZShpY3VDYXNlOiBodG1sLkV4cGFuc2lvbkNhc2UsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgLy8gUGFyc2UgY2FzZXMgZm9yIHRyYW5zbGF0YWJsZSBodG1sIGF0dHJpYnV0ZXNcbiAgICBjb25zdCBleHByZXNzaW9uID0gaHRtbC52aXNpdEFsbCh0aGlzLCBpY3VDYXNlLmV4cHJlc3Npb24sIGNvbnRleHQpO1xuXG4gICAgaWYgKHRoaXMuX21vZGUgPT09IF9WaXNpdG9yTW9kZS5NZXJnZSkge1xuICAgICAgcmV0dXJuIG5ldyBodG1sLkV4cGFuc2lvbkNhc2UoXG4gICAgICAgICAgaWN1Q2FzZS52YWx1ZSwgZXhwcmVzc2lvbiwgaWN1Q2FzZS5zb3VyY2VTcGFuLCBpY3VDYXNlLnZhbHVlU291cmNlU3BhbixcbiAgICAgICAgICBpY3VDYXNlLmV4cFNvdXJjZVNwYW4pO1xuICAgIH1cbiAgfVxuXG4gIHZpc2l0RXhwYW5zaW9uKGljdTogaHRtbC5FeHBhbnNpb24sIGNvbnRleHQ6IGFueSk6IGh0bWwuRXhwYW5zaW9uIHtcbiAgICB0aGlzLl9tYXlCZUFkZEJsb2NrQ2hpbGRyZW4oaWN1KTtcblxuICAgIGNvbnN0IHdhc0luSWN1ID0gdGhpcy5faW5JY3U7XG5cbiAgICBpZiAoIXRoaXMuX2luSWN1KSB7XG4gICAgICAvLyBuZXN0ZWQgSUNVIG1lc3NhZ2VzIHNob3VsZCBub3QgYmUgZXh0cmFjdGVkIGJ1dCB0b3AtbGV2ZWwgdHJhbnNsYXRlZCBhcyBhIHdob2xlXG4gICAgICBpZiAodGhpcy5faXNJblRyYW5zbGF0YWJsZVNlY3Rpb24pIHtcbiAgICAgICAgdGhpcy5fYWRkTWVzc2FnZShbaWN1XSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9pbkljdSA9IHRydWU7XG4gICAgfVxuXG4gICAgY29uc3QgY2FzZXMgPSBodG1sLnZpc2l0QWxsKHRoaXMsIGljdS5jYXNlcywgY29udGV4dCk7XG5cbiAgICBpZiAodGhpcy5fbW9kZSA9PT0gX1Zpc2l0b3JNb2RlLk1lcmdlKSB7XG4gICAgICBpY3UgPSBuZXcgaHRtbC5FeHBhbnNpb24oXG4gICAgICAgICAgaWN1LnN3aXRjaFZhbHVlLCBpY3UudHlwZSwgY2FzZXMsIGljdS5zb3VyY2VTcGFuLCBpY3Uuc3dpdGNoVmFsdWVTb3VyY2VTcGFuKTtcbiAgICB9XG5cbiAgICB0aGlzLl9pbkljdSA9IHdhc0luSWN1O1xuXG4gICAgcmV0dXJuIGljdTtcbiAgfVxuXG4gIHZpc2l0Q29tbWVudChjb21tZW50OiBodG1sLkNvbW1lbnQsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgY29uc3QgaXNPcGVuaW5nID0gX2lzT3BlbmluZ0NvbW1lbnQoY29tbWVudCk7XG5cbiAgICBpZiAoaXNPcGVuaW5nICYmIHRoaXMuX2lzSW5UcmFuc2xhdGFibGVTZWN0aW9uKSB7XG4gICAgICB0aGlzLl9yZXBvcnRFcnJvcihjb21tZW50LCAnQ291bGQgbm90IHN0YXJ0IGEgYmxvY2sgaW5zaWRlIGEgdHJhbnNsYXRhYmxlIHNlY3Rpb24nKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBpc0Nsb3NpbmcgPSBfaXNDbG9zaW5nQ29tbWVudChjb21tZW50KTtcblxuICAgIGlmIChpc0Nsb3NpbmcgJiYgIXRoaXMuX2luSTE4bkJsb2NrKSB7XG4gICAgICB0aGlzLl9yZXBvcnRFcnJvcihjb21tZW50LCAnVHJ5aW5nIHRvIGNsb3NlIGFuIHVub3BlbmVkIGJsb2NrJyk7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLl9pbkkxOG5Ob2RlICYmICF0aGlzLl9pbkljdSkge1xuICAgICAgaWYgKCF0aGlzLl9pbkkxOG5CbG9jaykge1xuICAgICAgICBpZiAoaXNPcGVuaW5nKSB7XG4gICAgICAgICAgLy8gZGVwcmVjYXRlZCBmcm9tIHY1IHlvdSBzaG91bGQgdXNlIDxuZy1jb250YWluZXIgaTE4bj4gaW5zdGVhZCBvZiBpMThuIGNvbW1lbnRzXG4gICAgICAgICAgaWYgKCFpMThuQ29tbWVudHNXYXJuZWQgJiYgPGFueT5jb25zb2xlICYmIDxhbnk+Y29uc29sZS53YXJuKSB7XG4gICAgICAgICAgICBpMThuQ29tbWVudHNXYXJuZWQgPSB0cnVlO1xuICAgICAgICAgICAgY29uc3QgZGV0YWlscyA9IGNvbW1lbnQuc291cmNlU3Bhbi5kZXRhaWxzID8gYCwgJHtjb21tZW50LnNvdXJjZVNwYW4uZGV0YWlsc31gIDogJyc7XG4gICAgICAgICAgICAvLyBUT0RPKG9jb21iZSk6IHVzZSBhIGxvZyBzZXJ2aWNlIG9uY2UgdGhlcmUgaXMgYSBwdWJsaWMgb25lIGF2YWlsYWJsZVxuICAgICAgICAgICAgY29uc29sZS53YXJuKGBJMThuIGNvbW1lbnRzIGFyZSBkZXByZWNhdGVkLCB1c2UgYW4gPG5nLWNvbnRhaW5lcj4gZWxlbWVudCBpbnN0ZWFkICgke1xuICAgICAgICAgICAgICAgIGNvbW1lbnQuc291cmNlU3Bhbi5zdGFydH0ke2RldGFpbHN9KWApO1xuICAgICAgICAgIH1cbiAgICAgICAgICB0aGlzLl9pbkkxOG5CbG9jayA9IHRydWU7XG4gICAgICAgICAgdGhpcy5fYmxvY2tTdGFydERlcHRoID0gdGhpcy5fZGVwdGg7XG4gICAgICAgICAgdGhpcy5fYmxvY2tDaGlsZHJlbiA9IFtdO1xuICAgICAgICAgIHRoaXMuX2Jsb2NrTWVhbmluZ0FuZERlc2MgPVxuICAgICAgICAgICAgICBjb21tZW50LnZhbHVlIS5yZXBsYWNlKF9JMThOX0NPTU1FTlRfUFJFRklYX1JFR0VYUCwgJycpLnRyaW0oKTtcbiAgICAgICAgICB0aGlzLl9vcGVuVHJhbnNsYXRhYmxlU2VjdGlvbihjb21tZW50KTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgaWYgKGlzQ2xvc2luZykge1xuICAgICAgICAgIGlmICh0aGlzLl9kZXB0aCA9PSB0aGlzLl9ibG9ja1N0YXJ0RGVwdGgpIHtcbiAgICAgICAgICAgIHRoaXMuX2Nsb3NlVHJhbnNsYXRhYmxlU2VjdGlvbihjb21tZW50LCB0aGlzLl9ibG9ja0NoaWxkcmVuKTtcbiAgICAgICAgICAgIHRoaXMuX2luSTE4bkJsb2NrID0gZmFsc2U7XG4gICAgICAgICAgICBjb25zdCBtZXNzYWdlID0gdGhpcy5fYWRkTWVzc2FnZSh0aGlzLl9ibG9ja0NoaWxkcmVuLCB0aGlzLl9ibG9ja01lYW5pbmdBbmREZXNjKSE7XG4gICAgICAgICAgICAvLyBtZXJnZSBhdHRyaWJ1dGVzIGluIHNlY3Rpb25zXG4gICAgICAgICAgICBjb25zdCBub2RlcyA9IHRoaXMuX3RyYW5zbGF0ZU1lc3NhZ2UoY29tbWVudCwgbWVzc2FnZSk7XG4gICAgICAgICAgICByZXR1cm4gaHRtbC52aXNpdEFsbCh0aGlzLCBub2Rlcyk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3JlcG9ydEVycm9yKGNvbW1lbnQsICdJMThOIGJsb2NrcyBzaG91bGQgbm90IGNyb3NzIGVsZW1lbnQgYm91bmRhcmllcycpO1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHZpc2l0VGV4dCh0ZXh0OiBodG1sLlRleHQsIGNvbnRleHQ6IGFueSk6IGh0bWwuVGV4dCB7XG4gICAgaWYgKHRoaXMuX2lzSW5UcmFuc2xhdGFibGVTZWN0aW9uKSB7XG4gICAgICB0aGlzLl9tYXlCZUFkZEJsb2NrQ2hpbGRyZW4odGV4dCk7XG4gICAgfVxuICAgIHJldHVybiB0ZXh0O1xuICB9XG5cbiAgdmlzaXRFbGVtZW50KGVsOiBodG1sLkVsZW1lbnQsIGNvbnRleHQ6IGFueSk6IGh0bWwuRWxlbWVudHxudWxsIHtcbiAgICB0aGlzLl9tYXlCZUFkZEJsb2NrQ2hpbGRyZW4oZWwpO1xuICAgIHRoaXMuX2RlcHRoKys7XG4gICAgY29uc3Qgd2FzSW5JMThuTm9kZSA9IHRoaXMuX2luSTE4bk5vZGU7XG4gICAgY29uc3Qgd2FzSW5JbXBsaWNpdE5vZGUgPSB0aGlzLl9pbkltcGxpY2l0Tm9kZTtcbiAgICBsZXQgY2hpbGROb2RlczogaHRtbC5Ob2RlW10gPSBbXTtcbiAgICBsZXQgdHJhbnNsYXRlZENoaWxkTm9kZXM6IGh0bWwuTm9kZVtdID0gdW5kZWZpbmVkITtcblxuICAgIC8vIEV4dHJhY3Q6XG4gICAgLy8gLSB0b3AgbGV2ZWwgbm9kZXMgd2l0aCB0aGUgKGltcGxpY2l0KSBcImkxOG5cIiBhdHRyaWJ1dGUgaWYgbm90IGFscmVhZHkgaW4gYSBzZWN0aW9uXG4gICAgLy8gLSBJQ1UgbWVzc2FnZXNcbiAgICBjb25zdCBpMThuQXR0ciA9IF9nZXRJMThuQXR0cihlbCk7XG4gICAgY29uc3QgaTE4bk1ldGEgPSBpMThuQXR0ciA/IGkxOG5BdHRyLnZhbHVlIDogJyc7XG4gICAgY29uc3QgaXNJbXBsaWNpdCA9IHRoaXMuX2ltcGxpY2l0VGFncy5zb21lKHRhZyA9PiBlbC5uYW1lID09PSB0YWcpICYmICF0aGlzLl9pbkljdSAmJlxuICAgICAgICAhdGhpcy5faXNJblRyYW5zbGF0YWJsZVNlY3Rpb247XG4gICAgY29uc3QgaXNUb3BMZXZlbEltcGxpY2l0ID0gIXdhc0luSW1wbGljaXROb2RlICYmIGlzSW1wbGljaXQ7XG4gICAgdGhpcy5faW5JbXBsaWNpdE5vZGUgPSB3YXNJbkltcGxpY2l0Tm9kZSB8fCBpc0ltcGxpY2l0O1xuXG4gICAgaWYgKCF0aGlzLl9pc0luVHJhbnNsYXRhYmxlU2VjdGlvbiAmJiAhdGhpcy5faW5JY3UpIHtcbiAgICAgIGlmIChpMThuQXR0ciB8fCBpc1RvcExldmVsSW1wbGljaXQpIHtcbiAgICAgICAgdGhpcy5faW5JMThuTm9kZSA9IHRydWU7XG4gICAgICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl9hZGRNZXNzYWdlKGVsLmNoaWxkcmVuLCBpMThuTWV0YSkhO1xuICAgICAgICB0cmFuc2xhdGVkQ2hpbGROb2RlcyA9IHRoaXMuX3RyYW5zbGF0ZU1lc3NhZ2UoZWwsIG1lc3NhZ2UpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fbW9kZSA9PSBfVmlzaXRvck1vZGUuRXh0cmFjdCkge1xuICAgICAgICBjb25zdCBpc1RyYW5zbGF0YWJsZSA9IGkxOG5BdHRyIHx8IGlzVG9wTGV2ZWxJbXBsaWNpdDtcbiAgICAgICAgaWYgKGlzVHJhbnNsYXRhYmxlKSB0aGlzLl9vcGVuVHJhbnNsYXRhYmxlU2VjdGlvbihlbCk7XG4gICAgICAgIGh0bWwudmlzaXRBbGwodGhpcywgZWwuY2hpbGRyZW4pO1xuICAgICAgICBpZiAoaXNUcmFuc2xhdGFibGUpIHRoaXMuX2Nsb3NlVHJhbnNsYXRhYmxlU2VjdGlvbihlbCwgZWwuY2hpbGRyZW4pO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICBpZiAoaTE4bkF0dHIgfHwgaXNUb3BMZXZlbEltcGxpY2l0KSB7XG4gICAgICAgIHRoaXMuX3JlcG9ydEVycm9yKFxuICAgICAgICAgICAgZWwsICdDb3VsZCBub3QgbWFyayBhbiBlbGVtZW50IGFzIHRyYW5zbGF0YWJsZSBpbnNpZGUgYSB0cmFuc2xhdGFibGUgc2VjdGlvbicpO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fbW9kZSA9PSBfVmlzaXRvck1vZGUuRXh0cmFjdCkge1xuICAgICAgICAvLyBEZXNjZW5kIGludG8gY2hpbGQgbm9kZXMgZm9yIGV4dHJhY3Rpb25cbiAgICAgICAgaHRtbC52aXNpdEFsbCh0aGlzLCBlbC5jaGlsZHJlbik7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX21vZGUgPT09IF9WaXNpdG9yTW9kZS5NZXJnZSkge1xuICAgICAgY29uc3QgdmlzaXROb2RlcyA9IHRyYW5zbGF0ZWRDaGlsZE5vZGVzIHx8IGVsLmNoaWxkcmVuO1xuICAgICAgdmlzaXROb2Rlcy5mb3JFYWNoKGNoaWxkID0+IHtcbiAgICAgICAgY29uc3QgdmlzaXRlZCA9IGNoaWxkLnZpc2l0KHRoaXMsIGNvbnRleHQpO1xuICAgICAgICBpZiAodmlzaXRlZCAmJiAhdGhpcy5faXNJblRyYW5zbGF0YWJsZVNlY3Rpb24pIHtcbiAgICAgICAgICAvLyBEbyBub3QgYWRkIHRoZSBjaGlsZHJlbiBmcm9tIHRyYW5zbGF0YWJsZSBzZWN0aW9ucyAoPSBpMThuIGJsb2NrcyBoZXJlKVxuICAgICAgICAgIC8vIFRoZXkgd2lsbCBiZSBhZGRlZCBsYXRlciBpbiB0aGlzIGxvb3Agd2hlbiB0aGUgYmxvY2sgY2xvc2VzIChpLmUuIG9uIGA8IS0tIC9pMThuIC0tPmApXG4gICAgICAgICAgY2hpbGROb2RlcyA9IGNoaWxkTm9kZXMuY29uY2F0KHZpc2l0ZWQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLl92aXNpdEF0dHJpYnV0ZXNPZihlbCk7XG5cbiAgICB0aGlzLl9kZXB0aC0tO1xuICAgIHRoaXMuX2luSTE4bk5vZGUgPSB3YXNJbkkxOG5Ob2RlO1xuICAgIHRoaXMuX2luSW1wbGljaXROb2RlID0gd2FzSW5JbXBsaWNpdE5vZGU7XG5cbiAgICBpZiAodGhpcy5fbW9kZSA9PT0gX1Zpc2l0b3JNb2RlLk1lcmdlKSB7XG4gICAgICBjb25zdCB0cmFuc2xhdGVkQXR0cnMgPSB0aGlzLl90cmFuc2xhdGVBdHRyaWJ1dGVzKGVsKTtcbiAgICAgIHJldHVybiBuZXcgaHRtbC5FbGVtZW50KFxuICAgICAgICAgIGVsLm5hbWUsIHRyYW5zbGF0ZWRBdHRycywgY2hpbGROb2RlcywgZWwuc291cmNlU3BhbiwgZWwuc3RhcnRTb3VyY2VTcGFuLFxuICAgICAgICAgIGVsLmVuZFNvdXJjZVNwYW4pO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHZpc2l0QXR0cmlidXRlKGF0dHJpYnV0ZTogaHRtbC5BdHRyaWJ1dGUsIGNvbnRleHQ6IGFueSk6IGFueSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCd1bnJlYWNoYWJsZSBjb2RlJyk7XG4gIH1cblxuICB2aXNpdEJsb2NrKGJsb2NrOiBodG1sLkJsb2NrLCBjb250ZXh0OiBhbnkpIHtcbiAgICBodG1sLnZpc2l0QWxsKHRoaXMsIGJsb2NrLmNoaWxkcmVuLCBjb250ZXh0KTtcbiAgfVxuXG4gIHZpc2l0QmxvY2tQYXJhbWV0ZXIocGFyYW1ldGVyOiBodG1sLkJsb2NrUGFyYW1ldGVyLCBjb250ZXh0OiBhbnkpIHt9XG5cbiAgcHJpdmF0ZSBfaW5pdChtb2RlOiBfVmlzaXRvck1vZGUsIGludGVycG9sYXRpb25Db25maWc6IEludGVycG9sYXRpb25Db25maWcpOiB2b2lkIHtcbiAgICB0aGlzLl9tb2RlID0gbW9kZTtcbiAgICB0aGlzLl9pbkkxOG5CbG9jayA9IGZhbHNlO1xuICAgIHRoaXMuX2luSTE4bk5vZGUgPSBmYWxzZTtcbiAgICB0aGlzLl9kZXB0aCA9IDA7XG4gICAgdGhpcy5faW5JY3UgPSBmYWxzZTtcbiAgICB0aGlzLl9tc2dDb3VudEF0U2VjdGlvblN0YXJ0ID0gdW5kZWZpbmVkO1xuICAgIHRoaXMuX2Vycm9ycyA9IFtdO1xuICAgIHRoaXMuX21lc3NhZ2VzID0gW107XG4gICAgdGhpcy5faW5JbXBsaWNpdE5vZGUgPSBmYWxzZTtcbiAgICB0aGlzLl9jcmVhdGVJMThuTWVzc2FnZSA9XG4gICAgICAgIGNyZWF0ZUkxOG5NZXNzYWdlRmFjdG9yeShpbnRlcnBvbGF0aW9uQ29uZmlnLCBERUZBVUxUX0NPTlRBSU5FUl9CTE9DS1MpO1xuICB9XG5cbiAgLy8gbG9va3MgZm9yIHRyYW5zbGF0YWJsZSBhdHRyaWJ1dGVzXG4gIHByaXZhdGUgX3Zpc2l0QXR0cmlidXRlc09mKGVsOiBodG1sLkVsZW1lbnQpOiB2b2lkIHtcbiAgICBjb25zdCBleHBsaWNpdEF0dHJOYW1lVG9WYWx1ZToge1trOiBzdHJpbmddOiBzdHJpbmd9ID0ge307XG4gICAgY29uc3QgaW1wbGljaXRBdHRyTmFtZXM6IHN0cmluZ1tdID0gdGhpcy5faW1wbGljaXRBdHRyc1tlbC5uYW1lXSB8fCBbXTtcblxuICAgIGVsLmF0dHJzLmZpbHRlcihhdHRyID0+IGF0dHIubmFtZS5zdGFydHNXaXRoKF9JMThOX0FUVFJfUFJFRklYKSlcbiAgICAgICAgLmZvckVhY2goXG4gICAgICAgICAgICBhdHRyID0+IGV4cGxpY2l0QXR0ck5hbWVUb1ZhbHVlW2F0dHIubmFtZS5zbGljZShfSTE4Tl9BVFRSX1BSRUZJWC5sZW5ndGgpXSA9XG4gICAgICAgICAgICAgICAgYXR0ci52YWx1ZSk7XG5cbiAgICBlbC5hdHRycy5mb3JFYWNoKGF0dHIgPT4ge1xuICAgICAgaWYgKGF0dHIubmFtZSBpbiBleHBsaWNpdEF0dHJOYW1lVG9WYWx1ZSkge1xuICAgICAgICB0aGlzLl9hZGRNZXNzYWdlKFthdHRyXSwgZXhwbGljaXRBdHRyTmFtZVRvVmFsdWVbYXR0ci5uYW1lXSk7XG4gICAgICB9IGVsc2UgaWYgKGltcGxpY2l0QXR0ck5hbWVzLnNvbWUobmFtZSA9PiBhdHRyLm5hbWUgPT09IG5hbWUpKSB7XG4gICAgICAgIHRoaXMuX2FkZE1lc3NhZ2UoW2F0dHJdKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxuXG4gIC8vIGFkZCBhIHRyYW5zbGF0YWJsZSBtZXNzYWdlXG4gIHByaXZhdGUgX2FkZE1lc3NhZ2UoYXN0OiBodG1sLk5vZGVbXSwgbXNnTWV0YT86IHN0cmluZyk6IGkxOG4uTWVzc2FnZXxudWxsIHtcbiAgICBpZiAoYXN0Lmxlbmd0aCA9PSAwIHx8XG4gICAgICAgIGFzdC5sZW5ndGggPT0gMSAmJiBhc3RbMF0gaW5zdGFuY2VvZiBodG1sLkF0dHJpYnV0ZSAmJiAhKDxodG1sLkF0dHJpYnV0ZT5hc3RbMF0pLnZhbHVlKSB7XG4gICAgICAvLyBEbyBub3QgY3JlYXRlIGVtcHR5IG1lc3NhZ2VzXG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCB7bWVhbmluZywgZGVzY3JpcHRpb24sIGlkfSA9IF9wYXJzZU1lc3NhZ2VNZXRhKG1zZ01ldGEpO1xuICAgIGNvbnN0IG1lc3NhZ2UgPSB0aGlzLl9jcmVhdGVJMThuTWVzc2FnZShhc3QsIG1lYW5pbmcsIGRlc2NyaXB0aW9uLCBpZCk7XG4gICAgdGhpcy5fbWVzc2FnZXMucHVzaChtZXNzYWdlKTtcbiAgICByZXR1cm4gbWVzc2FnZTtcbiAgfVxuXG4gIC8vIFRyYW5zbGF0ZXMgdGhlIGdpdmVuIG1lc3NhZ2UgZ2l2ZW4gdGhlIGBUcmFuc2xhdGlvbkJ1bmRsZWBcbiAgLy8gVGhpcyBpcyB1c2VkIGZvciB0cmFuc2xhdGluZyBlbGVtZW50cyAvIGJsb2NrcyAtIHNlZSBgX3RyYW5zbGF0ZUF0dHJpYnV0ZXNgIGZvciBhdHRyaWJ1dGVzXG4gIC8vIG5vLW9wIHdoZW4gY2FsbGVkIGluIGV4dHJhY3Rpb24gbW9kZSAocmV0dXJucyBbXSlcbiAgcHJpdmF0ZSBfdHJhbnNsYXRlTWVzc2FnZShlbDogaHRtbC5Ob2RlLCBtZXNzYWdlOiBpMThuLk1lc3NhZ2UpOiBodG1sLk5vZGVbXSB7XG4gICAgaWYgKG1lc3NhZ2UgJiYgdGhpcy5fbW9kZSA9PT0gX1Zpc2l0b3JNb2RlLk1lcmdlKSB7XG4gICAgICBjb25zdCBub2RlcyA9IHRoaXMuX3RyYW5zbGF0aW9ucy5nZXQobWVzc2FnZSk7XG5cbiAgICAgIGlmIChub2Rlcykge1xuICAgICAgICByZXR1cm4gbm9kZXM7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuX3JlcG9ydEVycm9yKFxuICAgICAgICAgIGVsLCBgVHJhbnNsYXRpb24gdW5hdmFpbGFibGUgZm9yIG1lc3NhZ2UgaWQ9XCIke3RoaXMuX3RyYW5zbGF0aW9ucy5kaWdlc3QobWVzc2FnZSl9XCJgKTtcbiAgICB9XG5cbiAgICByZXR1cm4gW107XG4gIH1cblxuICAvLyB0cmFuc2xhdGUgdGhlIGF0dHJpYnV0ZXMgb2YgYW4gZWxlbWVudCBhbmQgcmVtb3ZlIGkxOG4gc3BlY2lmaWMgYXR0cmlidXRlc1xuICBwcml2YXRlIF90cmFuc2xhdGVBdHRyaWJ1dGVzKGVsOiBodG1sLkVsZW1lbnQpOiBodG1sLkF0dHJpYnV0ZVtdIHtcbiAgICBjb25zdCBhdHRyaWJ1dGVzID0gZWwuYXR0cnM7XG4gICAgY29uc3QgaTE4blBhcnNlZE1lc3NhZ2VNZXRhOlxuICAgICAgICB7W25hbWU6IHN0cmluZ106IHttZWFuaW5nOiBzdHJpbmcsIGRlc2NyaXB0aW9uOiBzdHJpbmcsIGlkOiBzdHJpbmd9fSA9IHt9O1xuXG4gICAgYXR0cmlidXRlcy5mb3JFYWNoKGF0dHIgPT4ge1xuICAgICAgaWYgKGF0dHIubmFtZS5zdGFydHNXaXRoKF9JMThOX0FUVFJfUFJFRklYKSkge1xuICAgICAgICBpMThuUGFyc2VkTWVzc2FnZU1ldGFbYXR0ci5uYW1lLnNsaWNlKF9JMThOX0FUVFJfUFJFRklYLmxlbmd0aCldID1cbiAgICAgICAgICAgIF9wYXJzZU1lc3NhZ2VNZXRhKGF0dHIudmFsdWUpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgY29uc3QgdHJhbnNsYXRlZEF0dHJpYnV0ZXM6IGh0bWwuQXR0cmlidXRlW10gPSBbXTtcblxuICAgIGF0dHJpYnV0ZXMuZm9yRWFjaCgoYXR0cikgPT4ge1xuICAgICAgaWYgKGF0dHIubmFtZSA9PT0gX0kxOE5fQVRUUiB8fCBhdHRyLm5hbWUuc3RhcnRzV2l0aChfSTE4Tl9BVFRSX1BSRUZJWCkpIHtcbiAgICAgICAgLy8gc3RyaXAgaTE4biBzcGVjaWZpYyBhdHRyaWJ1dGVzXG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgaWYgKGF0dHIudmFsdWUgJiYgYXR0ci52YWx1ZSAhPSAnJyAmJiBpMThuUGFyc2VkTWVzc2FnZU1ldGEuaGFzT3duUHJvcGVydHkoYXR0ci5uYW1lKSkge1xuICAgICAgICBjb25zdCB7bWVhbmluZywgZGVzY3JpcHRpb24sIGlkfSA9IGkxOG5QYXJzZWRNZXNzYWdlTWV0YVthdHRyLm5hbWVdO1xuICAgICAgICBjb25zdCBtZXNzYWdlOiBpMThuLk1lc3NhZ2UgPSB0aGlzLl9jcmVhdGVJMThuTWVzc2FnZShbYXR0cl0sIG1lYW5pbmcsIGRlc2NyaXB0aW9uLCBpZCk7XG4gICAgICAgIGNvbnN0IG5vZGVzID0gdGhpcy5fdHJhbnNsYXRpb25zLmdldChtZXNzYWdlKTtcbiAgICAgICAgaWYgKG5vZGVzKSB7XG4gICAgICAgICAgaWYgKG5vZGVzLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICB0cmFuc2xhdGVkQXR0cmlidXRlcy5wdXNoKG5ldyBodG1sLkF0dHJpYnV0ZShcbiAgICAgICAgICAgICAgICBhdHRyLm5hbWUsICcnLCBhdHRyLnNvdXJjZVNwYW4sIHVuZGVmaW5lZCAvKiBrZXlTcGFuICovLCB1bmRlZmluZWQgLyogdmFsdWVTcGFuICovLFxuICAgICAgICAgICAgICAgIHVuZGVmaW5lZCAvKiB2YWx1ZVRva2VucyAqLywgdW5kZWZpbmVkIC8qIGkxOG4gKi8pKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKG5vZGVzWzBdIGluc3RhbmNlb2YgaHRtbC5UZXh0KSB7XG4gICAgICAgICAgICBjb25zdCB2YWx1ZSA9IChub2Rlc1swXSBhcyBodG1sLlRleHQpLnZhbHVlO1xuICAgICAgICAgICAgdHJhbnNsYXRlZEF0dHJpYnV0ZXMucHVzaChuZXcgaHRtbC5BdHRyaWJ1dGUoXG4gICAgICAgICAgICAgICAgYXR0ci5uYW1lLCB2YWx1ZSwgYXR0ci5zb3VyY2VTcGFuLCB1bmRlZmluZWQgLyoga2V5U3BhbiAqLyxcbiAgICAgICAgICAgICAgICB1bmRlZmluZWQgLyogdmFsdWVTcGFuICovLCB1bmRlZmluZWQgLyogdmFsdWVUb2tlbnMgKi8sIHVuZGVmaW5lZCAvKiBpMThuICovKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3JlcG9ydEVycm9yKFxuICAgICAgICAgICAgICAgIGVsLFxuICAgICAgICAgICAgICAgIGBVbmV4cGVjdGVkIHRyYW5zbGF0aW9uIGZvciBhdHRyaWJ1dGUgXCIke2F0dHIubmFtZX1cIiAoaWQ9XCIke1xuICAgICAgICAgICAgICAgICAgICBpZCB8fCB0aGlzLl90cmFuc2xhdGlvbnMuZGlnZXN0KG1lc3NhZ2UpfVwiKWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLl9yZXBvcnRFcnJvcihcbiAgICAgICAgICAgICAgZWwsXG4gICAgICAgICAgICAgIGBUcmFuc2xhdGlvbiB1bmF2YWlsYWJsZSBmb3IgYXR0cmlidXRlIFwiJHthdHRyLm5hbWV9XCIgKGlkPVwiJHtcbiAgICAgICAgICAgICAgICAgIGlkIHx8IHRoaXMuX3RyYW5zbGF0aW9ucy5kaWdlc3QobWVzc2FnZSl9XCIpYCk7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRyYW5zbGF0ZWRBdHRyaWJ1dGVzLnB1c2goYXR0cik7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdHJhbnNsYXRlZEF0dHJpYnV0ZXM7XG4gIH1cblxuXG4gIC8qKlxuICAgKiBBZGQgdGhlIG5vZGUgYXMgYSBjaGlsZCBvZiB0aGUgYmxvY2sgd2hlbjpcbiAgICogLSB3ZSBhcmUgaW4gYSBibG9jayxcbiAgICogLSB3ZSBhcmUgbm90IGluc2lkZSBhIElDVSBtZXNzYWdlICh0aG9zZSBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5KSxcbiAgICogLSB0aGUgbm9kZSBpcyBhIFwiZGlyZWN0IGNoaWxkXCIgb2YgdGhlIGJsb2NrXG4gICAqL1xuICBwcml2YXRlIF9tYXlCZUFkZEJsb2NrQ2hpbGRyZW4obm9kZTogaHRtbC5Ob2RlKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuX2luSTE4bkJsb2NrICYmICF0aGlzLl9pbkljdSAmJiB0aGlzLl9kZXB0aCA9PSB0aGlzLl9ibG9ja1N0YXJ0RGVwdGgpIHtcbiAgICAgIHRoaXMuX2Jsb2NrQ2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogTWFya3MgdGhlIHN0YXJ0IG9mIGEgc2VjdGlvbiwgc2VlIGBfY2xvc2VUcmFuc2xhdGFibGVTZWN0aW9uYFxuICAgKi9cbiAgcHJpdmF0ZSBfb3BlblRyYW5zbGF0YWJsZVNlY3Rpb24obm9kZTogaHRtbC5Ob2RlKTogdm9pZCB7XG4gICAgaWYgKHRoaXMuX2lzSW5UcmFuc2xhdGFibGVTZWN0aW9uKSB7XG4gICAgICB0aGlzLl9yZXBvcnRFcnJvcihub2RlLCAnVW5leHBlY3RlZCBzZWN0aW9uIHN0YXJ0Jyk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHRoaXMuX21zZ0NvdW50QXRTZWN0aW9uU3RhcnQgPSB0aGlzLl9tZXNzYWdlcy5sZW5ndGg7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIEEgdHJhbnNsYXRhYmxlIHNlY3Rpb24gY291bGQgYmU6XG4gICAqIC0gdGhlIGNvbnRlbnQgb2YgdHJhbnNsYXRhYmxlIGVsZW1lbnQsXG4gICAqIC0gbm9kZXMgYmV0d2VlbiBgPCEtLSBpMThuIC0tPmAgYW5kIGA8IS0tIC9pMThuIC0tPmAgY29tbWVudHNcbiAgICovXG4gIHByaXZhdGUgZ2V0IF9pc0luVHJhbnNsYXRhYmxlU2VjdGlvbigpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fbXNnQ291bnRBdFNlY3Rpb25TdGFydCAhPT0gdm9pZCAwO1xuICB9XG5cbiAgLyoqXG4gICAqIFRlcm1pbmF0ZXMgYSBzZWN0aW9uLlxuICAgKlxuICAgKiBJZiBhIHNlY3Rpb24gaGFzIG9ubHkgb25lIHNpZ25pZmljYW50IGNoaWxkcmVuIChjb21tZW50cyBub3Qgc2lnbmlmaWNhbnQpIHRoZW4gd2Ugc2hvdWxkIG5vdFxuICAgKiBrZWVwIHRoZSBtZXNzYWdlIGZyb20gdGhpcyBjaGlsZHJlbjpcbiAgICpcbiAgICogYDxwIGkxOG49XCJtZWFuaW5nfGRlc2NyaXB0aW9uXCI+e0lDVSBtZXNzYWdlfTwvcD5gIHdvdWxkIHByb2R1Y2UgdHdvIG1lc3NhZ2VzOlxuICAgKiAtIG9uZSBmb3IgdGhlIDxwPiBjb250ZW50IHdpdGggbWVhbmluZyBhbmQgZGVzY3JpcHRpb24sXG4gICAqIC0gYW5vdGhlciBvbmUgZm9yIHRoZSBJQ1UgbWVzc2FnZS5cbiAgICpcbiAgICogSW4gdGhpcyBjYXNlIHRoZSBsYXN0IG1lc3NhZ2UgaXMgZGlzY2FyZGVkIGFzIGl0IGNvbnRhaW5zIGxlc3MgaW5mb3JtYXRpb24gKHRoZSBBU1QgaXNcbiAgICogb3RoZXJ3aXNlIGlkZW50aWNhbCkuXG4gICAqXG4gICAqIE5vdGUgdGhhdCB3ZSBzaG91bGQgc3RpbGwga2VlcCBtZXNzYWdlcyBleHRyYWN0ZWQgZnJvbSBhdHRyaWJ1dGVzIGluc2lkZSB0aGUgc2VjdGlvbiAoaWUgaW4gdGhlXG4gICAqIElDVSBtZXNzYWdlIGhlcmUpXG4gICAqL1xuICBwcml2YXRlIF9jbG9zZVRyYW5zbGF0YWJsZVNlY3Rpb24obm9kZTogaHRtbC5Ob2RlLCBkaXJlY3RDaGlsZHJlbjogaHRtbC5Ob2RlW10pOiB2b2lkIHtcbiAgICBpZiAoIXRoaXMuX2lzSW5UcmFuc2xhdGFibGVTZWN0aW9uKSB7XG4gICAgICB0aGlzLl9yZXBvcnRFcnJvcihub2RlLCAnVW5leHBlY3RlZCBzZWN0aW9uIGVuZCcpO1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IHN0YXJ0SW5kZXggPSB0aGlzLl9tc2dDb3VudEF0U2VjdGlvblN0YXJ0O1xuICAgIGNvbnN0IHNpZ25pZmljYW50Q2hpbGRyZW46IG51bWJlciA9IGRpcmVjdENoaWxkcmVuLnJlZHVjZShcbiAgICAgICAgKGNvdW50OiBudW1iZXIsIG5vZGU6IGh0bWwuTm9kZSk6IG51bWJlciA9PiBjb3VudCArIChub2RlIGluc3RhbmNlb2YgaHRtbC5Db21tZW50ID8gMCA6IDEpLFxuICAgICAgICAwKTtcblxuICAgIGlmIChzaWduaWZpY2FudENoaWxkcmVuID09IDEpIHtcbiAgICAgIGZvciAobGV0IGkgPSB0aGlzLl9tZXNzYWdlcy5sZW5ndGggLSAxOyBpID49IHN0YXJ0SW5kZXghOyBpLS0pIHtcbiAgICAgICAgY29uc3QgYXN0ID0gdGhpcy5fbWVzc2FnZXNbaV0ubm9kZXM7XG4gICAgICAgIGlmICghKGFzdC5sZW5ndGggPT0gMSAmJiBhc3RbMF0gaW5zdGFuY2VvZiBpMThuLlRleHQpKSB7XG4gICAgICAgICAgdGhpcy5fbWVzc2FnZXMuc3BsaWNlKGksIDEpO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhpcy5fbXNnQ291bnRBdFNlY3Rpb25TdGFydCA9IHVuZGVmaW5lZDtcbiAgfVxuXG4gIHByaXZhdGUgX3JlcG9ydEVycm9yKG5vZGU6IGh0bWwuTm9kZSwgbXNnOiBzdHJpbmcpOiB2b2lkIHtcbiAgICB0aGlzLl9lcnJvcnMucHVzaChuZXcgSTE4bkVycm9yKG5vZGUuc291cmNlU3BhbiwgbXNnKSk7XG4gIH1cbn1cblxuZnVuY3Rpb24gX2lzT3BlbmluZ0NvbW1lbnQobjogaHRtbC5Ob2RlKTogYm9vbGVhbiB7XG4gIHJldHVybiAhIShuIGluc3RhbmNlb2YgaHRtbC5Db21tZW50ICYmIG4udmFsdWUgJiYgbi52YWx1ZS5zdGFydHNXaXRoKCdpMThuJykpO1xufVxuXG5mdW5jdGlvbiBfaXNDbG9zaW5nQ29tbWVudChuOiBodG1sLk5vZGUpOiBib29sZWFuIHtcbiAgcmV0dXJuICEhKG4gaW5zdGFuY2VvZiBodG1sLkNvbW1lbnQgJiYgbi52YWx1ZSAmJiBuLnZhbHVlID09PSAnL2kxOG4nKTtcbn1cblxuZnVuY3Rpb24gX2dldEkxOG5BdHRyKHA6IGh0bWwuRWxlbWVudCk6IGh0bWwuQXR0cmlidXRlfG51bGwge1xuICByZXR1cm4gcC5hdHRycy5maW5kKGF0dHIgPT4gYXR0ci5uYW1lID09PSBfSTE4Tl9BVFRSKSB8fCBudWxsO1xufVxuXG5mdW5jdGlvbiBfcGFyc2VNZXNzYWdlTWV0YShpMThuPzogc3RyaW5nKToge21lYW5pbmc6IHN0cmluZywgZGVzY3JpcHRpb246IHN0cmluZywgaWQ6IHN0cmluZ30ge1xuICBpZiAoIWkxOG4pIHJldHVybiB7bWVhbmluZzogJycsIGRlc2NyaXB0aW9uOiAnJywgaWQ6ICcnfTtcblxuICBjb25zdCBpZEluZGV4ID0gaTE4bi5pbmRleE9mKElEX1NFUEFSQVRPUik7XG4gIGNvbnN0IGRlc2NJbmRleCA9IGkxOG4uaW5kZXhPZihNRUFOSU5HX1NFUEFSQVRPUik7XG4gIGNvbnN0IFttZWFuaW5nQW5kRGVzYywgaWRdID1cbiAgICAgIChpZEluZGV4ID4gLTEpID8gW2kxOG4uc2xpY2UoMCwgaWRJbmRleCksIGkxOG4uc2xpY2UoaWRJbmRleCArIDIpXSA6IFtpMThuLCAnJ107XG4gIGNvbnN0IFttZWFuaW5nLCBkZXNjcmlwdGlvbl0gPSAoZGVzY0luZGV4ID4gLTEpID9cbiAgICAgIFttZWFuaW5nQW5kRGVzYy5zbGljZSgwLCBkZXNjSW5kZXgpLCBtZWFuaW5nQW5kRGVzYy5zbGljZShkZXNjSW5kZXggKyAxKV0gOlxuICAgICAgWycnLCBtZWFuaW5nQW5kRGVzY107XG5cbiAgcmV0dXJuIHttZWFuaW5nLCBkZXNjcmlwdGlvbiwgaWQ6IGlkLnRyaW0oKX07XG59XG4iXX0=