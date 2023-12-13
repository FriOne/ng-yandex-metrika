/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { ParseError, ParseSourceSpan } from '../parse_util';
import * as html from './ast';
import { NAMED_ENTITIES } from './entities';
import { tokenize } from './lexer';
import { getNsPrefix, mergeNsAndName, splitNsName } from './tags';
export class TreeError extends ParseError {
    static create(elementName, span, msg) {
        return new TreeError(elementName, span, msg);
    }
    constructor(elementName, span, msg) {
        super(span, msg);
        this.elementName = elementName;
    }
}
export class ParseTreeResult {
    constructor(rootNodes, errors) {
        this.rootNodes = rootNodes;
        this.errors = errors;
    }
}
export class Parser {
    constructor(getTagDefinition) {
        this.getTagDefinition = getTagDefinition;
    }
    parse(source, url, options) {
        const tokenizeResult = tokenize(source, url, this.getTagDefinition, options);
        const parser = new _TreeBuilder(tokenizeResult.tokens, this.getTagDefinition);
        parser.build();
        return new ParseTreeResult(parser.rootNodes, tokenizeResult.errors.concat(parser.errors));
    }
}
class _TreeBuilder {
    constructor(tokens, getTagDefinition) {
        this.tokens = tokens;
        this.getTagDefinition = getTagDefinition;
        this._index = -1;
        this._containerStack = [];
        this.rootNodes = [];
        this.errors = [];
        this._advance();
    }
    build() {
        while (this._peek.type !== 29 /* TokenType.EOF */) {
            if (this._peek.type === 0 /* TokenType.TAG_OPEN_START */ ||
                this._peek.type === 4 /* TokenType.INCOMPLETE_TAG_OPEN */) {
                this._consumeStartTag(this._advance());
            }
            else if (this._peek.type === 3 /* TokenType.TAG_CLOSE */) {
                this._consumeEndTag(this._advance());
            }
            else if (this._peek.type === 12 /* TokenType.CDATA_START */) {
                this._closeVoidElement();
                this._consumeCdata(this._advance());
            }
            else if (this._peek.type === 10 /* TokenType.COMMENT_START */) {
                this._closeVoidElement();
                this._consumeComment(this._advance());
            }
            else if (this._peek.type === 5 /* TokenType.TEXT */ || this._peek.type === 7 /* TokenType.RAW_TEXT */ ||
                this._peek.type === 6 /* TokenType.ESCAPABLE_RAW_TEXT */) {
                this._closeVoidElement();
                this._consumeText(this._advance());
            }
            else if (this._peek.type === 19 /* TokenType.EXPANSION_FORM_START */) {
                this._consumeExpansion(this._advance());
            }
            else if (this._peek.type === 24 /* TokenType.BLOCK_OPEN_START */) {
                this._closeVoidElement();
                this._consumeBlockOpen(this._advance());
            }
            else if (this._peek.type === 26 /* TokenType.BLOCK_CLOSE */) {
                this._closeVoidElement();
                this._consumeBlockClose(this._advance());
            }
            else if (this._peek.type === 28 /* TokenType.INCOMPLETE_BLOCK_OPEN */) {
                this._closeVoidElement();
                this._consumeIncompleteBlock(this._advance());
            }
            else {
                // Skip all other tokens...
                this._advance();
            }
        }
        for (const leftoverContainer of this._containerStack) {
            // Unlike HTML elements, blocks aren't closed implicitly by the end of the file.
            if (leftoverContainer instanceof html.Block) {
                this.errors.push(TreeError.create(leftoverContainer.name, leftoverContainer.sourceSpan, `Unclosed block "${leftoverContainer.name}"`));
            }
        }
    }
    _advance() {
        const prev = this._peek;
        if (this._index < this.tokens.length - 1) {
            // Note: there is always an EOF token at the end
            this._index++;
        }
        this._peek = this.tokens[this._index];
        return prev;
    }
    _advanceIf(type) {
        if (this._peek.type === type) {
            return this._advance();
        }
        return null;
    }
    _consumeCdata(_startToken) {
        this._consumeText(this._advance());
        this._advanceIf(13 /* TokenType.CDATA_END */);
    }
    _consumeComment(token) {
        const text = this._advanceIf(7 /* TokenType.RAW_TEXT */);
        const endToken = this._advanceIf(11 /* TokenType.COMMENT_END */);
        const value = text != null ? text.parts[0].trim() : null;
        const sourceSpan = endToken == null ?
            token.sourceSpan :
            new ParseSourceSpan(token.sourceSpan.start, endToken.sourceSpan.end, token.sourceSpan.fullStart);
        this._addToParent(new html.Comment(value, sourceSpan));
    }
    _consumeExpansion(token) {
        const switchValue = this._advance();
        const type = this._advance();
        const cases = [];
        // read =
        while (this._peek.type === 20 /* TokenType.EXPANSION_CASE_VALUE */) {
            const expCase = this._parseExpansionCase();
            if (!expCase)
                return; // error
            cases.push(expCase);
        }
        // read the final }
        if (this._peek.type !== 23 /* TokenType.EXPANSION_FORM_END */) {
            this.errors.push(TreeError.create(null, this._peek.sourceSpan, `Invalid ICU message. Missing '}'.`));
            return;
        }
        const sourceSpan = new ParseSourceSpan(token.sourceSpan.start, this._peek.sourceSpan.end, token.sourceSpan.fullStart);
        this._addToParent(new html.Expansion(switchValue.parts[0], type.parts[0], cases, sourceSpan, switchValue.sourceSpan));
        this._advance();
    }
    _parseExpansionCase() {
        const value = this._advance();
        // read {
        if (this._peek.type !== 21 /* TokenType.EXPANSION_CASE_EXP_START */) {
            this.errors.push(TreeError.create(null, this._peek.sourceSpan, `Invalid ICU message. Missing '{'.`));
            return null;
        }
        // read until }
        const start = this._advance();
        const exp = this._collectExpansionExpTokens(start);
        if (!exp)
            return null;
        const end = this._advance();
        exp.push({ type: 29 /* TokenType.EOF */, parts: [], sourceSpan: end.sourceSpan });
        // parse everything in between { and }
        const expansionCaseParser = new _TreeBuilder(exp, this.getTagDefinition);
        expansionCaseParser.build();
        if (expansionCaseParser.errors.length > 0) {
            this.errors = this.errors.concat(expansionCaseParser.errors);
            return null;
        }
        const sourceSpan = new ParseSourceSpan(value.sourceSpan.start, end.sourceSpan.end, value.sourceSpan.fullStart);
        const expSourceSpan = new ParseSourceSpan(start.sourceSpan.start, end.sourceSpan.end, start.sourceSpan.fullStart);
        return new html.ExpansionCase(value.parts[0], expansionCaseParser.rootNodes, sourceSpan, value.sourceSpan, expSourceSpan);
    }
    _collectExpansionExpTokens(start) {
        const exp = [];
        const expansionFormStack = [21 /* TokenType.EXPANSION_CASE_EXP_START */];
        while (true) {
            if (this._peek.type === 19 /* TokenType.EXPANSION_FORM_START */ ||
                this._peek.type === 21 /* TokenType.EXPANSION_CASE_EXP_START */) {
                expansionFormStack.push(this._peek.type);
            }
            if (this._peek.type === 22 /* TokenType.EXPANSION_CASE_EXP_END */) {
                if (lastOnStack(expansionFormStack, 21 /* TokenType.EXPANSION_CASE_EXP_START */)) {
                    expansionFormStack.pop();
                    if (expansionFormStack.length === 0)
                        return exp;
                }
                else {
                    this.errors.push(TreeError.create(null, start.sourceSpan, `Invalid ICU message. Missing '}'.`));
                    return null;
                }
            }
            if (this._peek.type === 23 /* TokenType.EXPANSION_FORM_END */) {
                if (lastOnStack(expansionFormStack, 19 /* TokenType.EXPANSION_FORM_START */)) {
                    expansionFormStack.pop();
                }
                else {
                    this.errors.push(TreeError.create(null, start.sourceSpan, `Invalid ICU message. Missing '}'.`));
                    return null;
                }
            }
            if (this._peek.type === 29 /* TokenType.EOF */) {
                this.errors.push(TreeError.create(null, start.sourceSpan, `Invalid ICU message. Missing '}'.`));
                return null;
            }
            exp.push(this._advance());
        }
    }
    _consumeText(token) {
        const tokens = [token];
        const startSpan = token.sourceSpan;
        let text = token.parts[0];
        if (text.length > 0 && text[0] === '\n') {
            const parent = this._getContainer();
            if (parent != null && parent.children.length === 0 &&
                this.getTagDefinition(parent.name).ignoreFirstLf) {
                text = text.substring(1);
                tokens[0] = { type: token.type, sourceSpan: token.sourceSpan, parts: [text] };
            }
        }
        while (this._peek.type === 8 /* TokenType.INTERPOLATION */ || this._peek.type === 5 /* TokenType.TEXT */ ||
            this._peek.type === 9 /* TokenType.ENCODED_ENTITY */) {
            token = this._advance();
            tokens.push(token);
            if (token.type === 8 /* TokenType.INTERPOLATION */) {
                // For backward compatibility we decode HTML entities that appear in interpolation
                // expressions. This is arguably a bug, but it could be a considerable breaking change to
                // fix it. It should be addressed in a larger project to refactor the entire parser/lexer
                // chain after View Engine has been removed.
                text += token.parts.join('').replace(/&([^;]+);/g, decodeEntity);
            }
            else if (token.type === 9 /* TokenType.ENCODED_ENTITY */) {
                text += token.parts[0];
            }
            else {
                text += token.parts.join('');
            }
        }
        if (text.length > 0) {
            const endSpan = token.sourceSpan;
            this._addToParent(new html.Text(text, new ParseSourceSpan(startSpan.start, endSpan.end, startSpan.fullStart, startSpan.details), tokens));
        }
    }
    _closeVoidElement() {
        const el = this._getContainer();
        if (el instanceof html.Element && this.getTagDefinition(el.name).isVoid) {
            this._containerStack.pop();
        }
    }
    _consumeStartTag(startTagToken) {
        const [prefix, name] = startTagToken.parts;
        const attrs = [];
        while (this._peek.type === 14 /* TokenType.ATTR_NAME */) {
            attrs.push(this._consumeAttr(this._advance()));
        }
        const fullName = this._getElementFullName(prefix, name, this._getClosestParentElement());
        let selfClosing = false;
        // Note: There could have been a tokenizer error
        // so that we don't get a token for the end tag...
        if (this._peek.type === 2 /* TokenType.TAG_OPEN_END_VOID */) {
            this._advance();
            selfClosing = true;
            const tagDef = this.getTagDefinition(fullName);
            if (!(tagDef.canSelfClose || getNsPrefix(fullName) !== null || tagDef.isVoid)) {
                this.errors.push(TreeError.create(fullName, startTagToken.sourceSpan, `Only void, custom and foreign elements can be self closed "${startTagToken.parts[1]}"`));
            }
        }
        else if (this._peek.type === 1 /* TokenType.TAG_OPEN_END */) {
            this._advance();
            selfClosing = false;
        }
        const end = this._peek.sourceSpan.fullStart;
        const span = new ParseSourceSpan(startTagToken.sourceSpan.start, end, startTagToken.sourceSpan.fullStart);
        // Create a separate `startSpan` because `span` will be modified when there is an `end` span.
        const startSpan = new ParseSourceSpan(startTagToken.sourceSpan.start, end, startTagToken.sourceSpan.fullStart);
        const el = new html.Element(fullName, attrs, [], span, startSpan, undefined);
        const parentEl = this._getContainer();
        this._pushContainer(el, parentEl instanceof html.Element &&
            this.getTagDefinition(parentEl.name).isClosedByChild(el.name));
        if (selfClosing) {
            // Elements that are self-closed have their `endSourceSpan` set to the full span, as the
            // element start tag also represents the end tag.
            this._popContainer(fullName, html.Element, span);
        }
        else if (startTagToken.type === 4 /* TokenType.INCOMPLETE_TAG_OPEN */) {
            // We already know the opening tag is not complete, so it is unlikely it has a corresponding
            // close tag. Let's optimistically parse it as a full element and emit an error.
            this._popContainer(fullName, html.Element, null);
            this.errors.push(TreeError.create(fullName, span, `Opening tag "${fullName}" not terminated.`));
        }
    }
    _pushContainer(node, isClosedByChild) {
        if (isClosedByChild) {
            this._containerStack.pop();
        }
        this._addToParent(node);
        this._containerStack.push(node);
    }
    _consumeEndTag(endTagToken) {
        const fullName = this._getElementFullName(endTagToken.parts[0], endTagToken.parts[1], this._getClosestParentElement());
        if (this.getTagDefinition(fullName).isVoid) {
            this.errors.push(TreeError.create(fullName, endTagToken.sourceSpan, `Void elements do not have end tags "${endTagToken.parts[1]}"`));
        }
        else if (!this._popContainer(fullName, html.Element, endTagToken.sourceSpan)) {
            const errMsg = `Unexpected closing tag "${fullName}". It may happen when the tag has already been closed by another tag. For more info see https://www.w3.org/TR/html5/syntax.html#closing-elements-that-have-implied-end-tags`;
            this.errors.push(TreeError.create(fullName, endTagToken.sourceSpan, errMsg));
        }
    }
    /**
     * Closes the nearest element with the tag name `fullName` in the parse tree.
     * `endSourceSpan` is the span of the closing tag, or null if the element does
     * not have a closing tag (for example, this happens when an incomplete
     * opening tag is recovered).
     */
    _popContainer(expectedName, expectedType, endSourceSpan) {
        let unexpectedCloseTagDetected = false;
        for (let stackIndex = this._containerStack.length - 1; stackIndex >= 0; stackIndex--) {
            const node = this._containerStack[stackIndex];
            if ((node.name === expectedName || expectedName === null) && node instanceof expectedType) {
                // Record the parse span with the element that is being closed. Any elements that are
                // removed from the element stack at this point are closed implicitly, so they won't get
                // an end source span (as there is no explicit closing element).
                node.endSourceSpan = endSourceSpan;
                node.sourceSpan.end = endSourceSpan !== null ? endSourceSpan.end : node.sourceSpan.end;
                this._containerStack.splice(stackIndex, this._containerStack.length - stackIndex);
                return !unexpectedCloseTagDetected;
            }
            // Blocks and most elements are not self closing.
            if (node instanceof html.Block ||
                node instanceof html.Element && !this.getTagDefinition(node.name).closedByParent) {
                // Note that we encountered an unexpected close tag but continue processing the element
                // stack so we can assign an `endSourceSpan` if there is a corresponding start tag for this
                // end tag in the stack.
                unexpectedCloseTagDetected = true;
            }
        }
        return false;
    }
    _consumeAttr(attrName) {
        const fullName = mergeNsAndName(attrName.parts[0], attrName.parts[1]);
        let attrEnd = attrName.sourceSpan.end;
        // Consume any quote
        if (this._peek.type === 15 /* TokenType.ATTR_QUOTE */) {
            this._advance();
        }
        // Consume the attribute value
        let value = '';
        const valueTokens = [];
        let valueStartSpan = undefined;
        let valueEnd = undefined;
        // NOTE: We need to use a new variable `nextTokenType` here to hide the actual type of
        // `_peek.type` from TS. Otherwise TS will narrow the type of `_peek.type` preventing it from
        // being able to consider `ATTR_VALUE_INTERPOLATION` as an option. This is because TS is not
        // able to see that `_advance()` will actually mutate `_peek`.
        const nextTokenType = this._peek.type;
        if (nextTokenType === 16 /* TokenType.ATTR_VALUE_TEXT */) {
            valueStartSpan = this._peek.sourceSpan;
            valueEnd = this._peek.sourceSpan.end;
            while (this._peek.type === 16 /* TokenType.ATTR_VALUE_TEXT */ ||
                this._peek.type === 17 /* TokenType.ATTR_VALUE_INTERPOLATION */ ||
                this._peek.type === 9 /* TokenType.ENCODED_ENTITY */) {
                const valueToken = this._advance();
                valueTokens.push(valueToken);
                if (valueToken.type === 17 /* TokenType.ATTR_VALUE_INTERPOLATION */) {
                    // For backward compatibility we decode HTML entities that appear in interpolation
                    // expressions. This is arguably a bug, but it could be a considerable breaking change to
                    // fix it. It should be addressed in a larger project to refactor the entire parser/lexer
                    // chain after View Engine has been removed.
                    value += valueToken.parts.join('').replace(/&([^;]+);/g, decodeEntity);
                }
                else if (valueToken.type === 9 /* TokenType.ENCODED_ENTITY */) {
                    value += valueToken.parts[0];
                }
                else {
                    value += valueToken.parts.join('');
                }
                valueEnd = attrEnd = valueToken.sourceSpan.end;
            }
        }
        // Consume any quote
        if (this._peek.type === 15 /* TokenType.ATTR_QUOTE */) {
            const quoteToken = this._advance();
            attrEnd = quoteToken.sourceSpan.end;
        }
        const valueSpan = valueStartSpan && valueEnd &&
            new ParseSourceSpan(valueStartSpan.start, valueEnd, valueStartSpan.fullStart);
        return new html.Attribute(fullName, value, new ParseSourceSpan(attrName.sourceSpan.start, attrEnd, attrName.sourceSpan.fullStart), attrName.sourceSpan, valueSpan, valueTokens.length > 0 ? valueTokens : undefined, undefined);
    }
    _consumeBlockOpen(token) {
        const parameters = [];
        while (this._peek.type === 27 /* TokenType.BLOCK_PARAMETER */) {
            const paramToken = this._advance();
            parameters.push(new html.BlockParameter(paramToken.parts[0], paramToken.sourceSpan));
        }
        if (this._peek.type === 25 /* TokenType.BLOCK_OPEN_END */) {
            this._advance();
        }
        const end = this._peek.sourceSpan.fullStart;
        const span = new ParseSourceSpan(token.sourceSpan.start, end, token.sourceSpan.fullStart);
        // Create a separate `startSpan` because `span` will be modified when there is an `end` span.
        const startSpan = new ParseSourceSpan(token.sourceSpan.start, end, token.sourceSpan.fullStart);
        const block = new html.Block(token.parts[0], parameters, [], span, token.sourceSpan, startSpan);
        this._pushContainer(block, false);
    }
    _consumeBlockClose(token) {
        if (!this._popContainer(null, html.Block, token.sourceSpan)) {
            this.errors.push(TreeError.create(null, token.sourceSpan, `Unexpected closing block. The block may have been closed earlier. ` +
                `If you meant to write the } character, you should use the "&#125;" ` +
                `HTML entity instead.`));
        }
    }
    _consumeIncompleteBlock(token) {
        const parameters = [];
        while (this._peek.type === 27 /* TokenType.BLOCK_PARAMETER */) {
            const paramToken = this._advance();
            parameters.push(new html.BlockParameter(paramToken.parts[0], paramToken.sourceSpan));
        }
        const end = this._peek.sourceSpan.fullStart;
        const span = new ParseSourceSpan(token.sourceSpan.start, end, token.sourceSpan.fullStart);
        // Create a separate `startSpan` because `span` will be modified when there is an `end` span.
        const startSpan = new ParseSourceSpan(token.sourceSpan.start, end, token.sourceSpan.fullStart);
        const block = new html.Block(token.parts[0], parameters, [], span, token.sourceSpan, startSpan);
        this._pushContainer(block, false);
        // Incomplete blocks don't have children so we close them immediately and report an error.
        this._popContainer(null, html.Block, null);
        this.errors.push(TreeError.create(token.parts[0], span, `Incomplete block "${token.parts[0]}". If you meant to write the @ character, ` +
            `you should use the "&#64;" HTML entity instead.`));
    }
    _getContainer() {
        return this._containerStack.length > 0 ? this._containerStack[this._containerStack.length - 1] :
            null;
    }
    _getClosestParentElement() {
        for (let i = this._containerStack.length - 1; i > -1; i--) {
            if (this._containerStack[i] instanceof html.Element) {
                return this._containerStack[i];
            }
        }
        return null;
    }
    _addToParent(node) {
        const parent = this._getContainer();
        if (parent === null) {
            this.rootNodes.push(node);
        }
        else {
            parent.children.push(node);
        }
    }
    _getElementFullName(prefix, localName, parentElement) {
        if (prefix === '') {
            prefix = this.getTagDefinition(localName).implicitNamespacePrefix || '';
            if (prefix === '' && parentElement != null) {
                const parentTagName = splitNsName(parentElement.name)[1];
                const parentTagDefinition = this.getTagDefinition(parentTagName);
                if (!parentTagDefinition.preventNamespaceInheritance) {
                    prefix = getNsPrefix(parentElement.name);
                }
            }
        }
        return mergeNsAndName(prefix, localName);
    }
}
function lastOnStack(stack, element) {
    return stack.length > 0 && stack[stack.length - 1] === element;
}
/**
 * Decode the `entity` string, which we believe is the contents of an HTML entity.
 *
 * If the string is not actually a valid/known entity then just return the original `match` string.
 */
function decodeEntity(match, entity) {
    if (NAMED_ENTITIES[entity] !== undefined) {
        return NAMED_ENTITIES[entity] || match;
    }
    if (/^#x[a-f0-9]+$/i.test(entity)) {
        return String.fromCodePoint(parseInt(entity.slice(2), 16));
    }
    if (/^#\d+$/.test(entity)) {
        return String.fromCodePoint(parseInt(entity.slice(1), 10));
    }
    return match;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL21sX3BhcnNlci9wYXJzZXIudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxFQUFDLFVBQVUsRUFBaUIsZUFBZSxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRXpFLE9BQU8sS0FBSyxJQUFJLE1BQU0sT0FBTyxDQUFDO0FBQzlCLE9BQU8sRUFBQyxjQUFjLEVBQUMsTUFBTSxZQUFZLENBQUM7QUFDMUMsT0FBTyxFQUFDLFFBQVEsRUFBa0IsTUFBTSxTQUFTLENBQUM7QUFDbEQsT0FBTyxFQUFDLFdBQVcsRUFBRSxjQUFjLEVBQUUsV0FBVyxFQUFnQixNQUFNLFFBQVEsQ0FBQztBQVcvRSxNQUFNLE9BQU8sU0FBVSxTQUFRLFVBQVU7SUFDdkMsTUFBTSxDQUFDLE1BQU0sQ0FBQyxXQUF3QixFQUFFLElBQXFCLEVBQUUsR0FBVztRQUN4RSxPQUFPLElBQUksU0FBUyxDQUFDLFdBQVcsRUFBRSxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7SUFDL0MsQ0FBQztJQUVELFlBQW1CLFdBQXdCLEVBQUUsSUFBcUIsRUFBRSxHQUFXO1FBQzdFLEtBQUssQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLENBQUM7UUFEQSxnQkFBVyxHQUFYLFdBQVcsQ0FBYTtJQUUzQyxDQUFDO0NBQ0Y7QUFFRCxNQUFNLE9BQU8sZUFBZTtJQUMxQixZQUFtQixTQUFzQixFQUFTLE1BQW9CO1FBQW5ELGNBQVMsR0FBVCxTQUFTLENBQWE7UUFBUyxXQUFNLEdBQU4sTUFBTSxDQUFjO0lBQUcsQ0FBQztDQUMzRTtBQUVELE1BQU0sT0FBTyxNQUFNO0lBQ2pCLFlBQW1CLGdCQUFvRDtRQUFwRCxxQkFBZ0IsR0FBaEIsZ0JBQWdCLENBQW9DO0lBQUcsQ0FBQztJQUUzRSxLQUFLLENBQUMsTUFBYyxFQUFFLEdBQVcs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Q0FBQyxJQUFJLENBQUMsQ0FBQztpQkFDMUM7YUFDRjtTQUNGO1FBRUQsT0FBTyxjQUFjLENBQUMsTUFBTSxFQUFFLFNBQVMsQ0FBQyxDQUFDO0lBQzNDLENBQUM7Q0FDRjtBQUVELFNBQVMsV0FBVyxDQUFDLEtBQVksRUFBRSxPQUFZO0lBQzdDLE9BQU8sS0FBSyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksS0FBSyxDQUFDLEtBQUssQ0FBQyxNQUFNLEdBQUcsQ0FBQyxDQUFDLEtBQUssT0FBTyxDQUFDO0FBQ2pFLENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsU0FBUyxZQUFZLENBQUMsS0FBYSxFQUFFLE1BQWM7SUFDakQsSUFBSSxjQUFjLENBQUMsTUFBTSxDQUFDLEtBQUssU0FBUyxFQUFFO1FBQ3hDLE9BQU8sY0FBYyxDQUFDLE1BQU0sQ0FBQyxJQUFJLEtBQUssQ0FBQztLQUN4QztJQUNELElBQUksZ0JBQWdCLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ2pDLE9BQU8sTUFBTSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0tBQzVEO0lBQ0QsSUFBSSxRQUFRLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFO1FBQ3pCLE9BQU8sTUFBTSxDQUFDLGFBQWEsQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDO0tBQzVEO0lBQ0QsT0FBTyxLQUFLLENBQUM7QUFDZixDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7UGFyc2VFcnJvciwgUGFyc2VMb2NhdGlvbiwgUGFyc2VTb3VyY2VTcGFufSBmcm9tICcuLi9wYXJzZV91dGlsJztcblxuaW1wb3J0ICogYXMgaHRtbCBmcm9tICcuL2FzdCc7XG5pbXBvcnQge05BTUVEX0VOVElUSUVTfSBmcm9tICcuL2VudGl0aWVzJztcbmltcG9ydCB7dG9rZW5pemUsIFRva2VuaXplT3B0aW9uc30gZnJvbSAnLi9sZXhlcic7XG5pbXBvcnQge2dldE5zUHJlZml4LCBtZXJnZU5zQW5kTmFtZSwgc3BsaXROc05hbWUsIFRhZ0RlZmluaXRpb259IGZyb20gJy4vdGFncyc7XG5pbXBvcnQge0F0dHJpYnV0ZU5hbWVUb2tlbiwgQXR0cmlidXRlUXVvdGVUb2tlbiwgQmxvY2tDbG9zZVRva2VuLCBCbG9ja09wZW5TdGFydFRva2VuLCBCbG9ja1BhcmFtZXRlclRva2VuLCBDZGF0YVN0YXJ0VG9rZW4sIENvbW1lbnRTdGFydFRva2VuLCBFeHBhbnNpb25DYXNlRXhwcmVzc2lvbkVuZFRva2VuLCBFeHBhbnNpb25DYXNlRXhwcmVzc2lvblN0YXJ0VG9rZW4sIEV4cGFuc2lvbkNhc2VWYWx1ZVRva2VuLCBFeHBhbnNpb25Gb3JtU3RhcnRUb2tlbiwgSW5jb21wbGV0ZUJsb2NrT3BlblRva2VuLCBJbmNvbXBsZXRlVGFnT3BlblRva2VuLCBJbnRlcnBvbGF0ZWRBdHRyaWJ1dGVUb2tlbiwgSW50ZXJwb2xhdGVkVGV4dFRva2VuLCBUYWdDbG9zZVRva2VuLCBUYWdPcGVuU3RhcnRUb2tlbiwgVGV4dFRva2VuLCBUb2tlbiwgVG9rZW5UeXBlfSBmcm9tICcuL3Rva2Vucyc7XG5cbi8qKiBOb2RlcyB0aGF0IGNhbiBjb250YWluIG90aGVyIG5vZGVzLiAqL1xudHlwZSBOb2RlQ29udGFpbmVyID0gaHRtbC5FbGVtZW50fGh0bWwuQmxvY2s7XG5cbi8qKiBDbGFzcyB0aGF0IGNhbiBjb25zdHJ1Y3QgYSBgTm9kZUNvbnRhaW5lcmAuICovXG5pbnRlcmZhY2UgTm9kZUNvbnRhaW5lckNvbnN0cnVjdG9yIGV4dGVuZHMgRnVuY3Rpb24ge1xuICBuZXcoLi4uYXJnczogYW55W10pOiBOb2RlQ29udGFpbmVyO1xufVxuXG5leHBvcnQgY2xhc3MgVHJlZUVycm9yIGV4dGVuZHMgUGFyc2VFcnJvciB7XG4gIHN0YXRpYyBjcmVhdGUoZWxlbWVudE5hbWU6IHN0cmluZ3xudWxsLCBzcGFuOiBQYXJzZVNvdXJjZVNwYW4sIG1zZzogc3RyaW5nKTogVHJlZUVycm9yIHtcbiAgICByZXR1cm4gbmV3IFRyZWVFcnJvcihlbGVtZW50TmFtZSwgc3BhbiwgbXNnKTtcbiAgfVxuXG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBlbGVtZW50TmFtZTogc3RyaW5nfG51bGwsIHNwYW46IFBhcnNlU291cmNlU3BhbiwgbXNnOiBzdHJpbmcpIHtcbiAgICBzdXBlcihzcGFuLCBtc2cpO1xuICB9XG59XG5cbmV4cG9ydCBjbGFzcyBQYXJzZVRyZWVSZXN1bHQge1xuICBjb25zdHJ1Y3RvcihwdWJsaWMgcm9vdE5vZGVzOiBodG1sLk5vZGVbXSwgcHVibGljIGVycm9yczogUGFyc2VFcnJvcltdKSB7fVxufVxuXG5leHBvcnQgY2xhc3MgUGFyc2VyIHtcbiAgY29uc3RydWN0b3IocHVibGljIGdldFRhZ0RlZmluaXRpb246ICh0YWdOYW1lOiBzdHJpbmcpID0+IFRhZ0RlZmluaXRpb24pIHt9XG5cbiAgcGFyc2Uoc291cmNlOiBzdHJpbmcsIHVybDogc3RyaW5nLCBvcHRpb25zPzogVG9rZW5pemVPcHRpb25zKTogUGFyc2VUcmVlUmVzdWx0IHtcbiAgICBjb25zdCB0b2tlbml6ZVJlc3VsdCA9IHRva2VuaXplKHNvdXJjZSwgdXJsLCB0aGlzLmdldFRhZ0RlZmluaXRpb24sIG9wdGlvbnMpO1xuICAgIGNvbnN0IHBhcnNlciA9IG5ldyBfVHJlZUJ1aWxkZXIodG9rZW5pemVSZXN1bHQudG9rZW5zLCB0aGlzLmdldFRhZ0RlZmluaXRpb24pO1xuICAgIHBhcnNlci5idWlsZCgpO1xuICAgIHJldHVybiBuZXcgUGFyc2VUcmVlUmVzdWx0KFxuICAgICAgICBwYXJzZXIucm9vdE5vZGVzLFxuICAgICAgICAodG9rZW5pemVSZXN1bHQuZXJyb3JzIGFzIFBhcnNlRXJyb3JbXSkuY29uY2F0KHBhcnNlci5lcnJvcnMpLFxuICAgICk7XG4gIH1cbn1cblxuY2xhc3MgX1RyZWVCdWlsZGVyIHtcbiAgcHJpdmF0ZSBfaW5kZXg6IG51bWJlciA9IC0xO1xuICAvLyBgX3BlZWtgIHdpbGwgYmUgaW5pdGlhbGl6ZWQgYnkgdGhlIGNhbGwgdG8gYF9hZHZhbmNlKClgIGluIHRoZSBjb25zdHJ1Y3Rvci5cbiAgcHJpdmF0ZSBfcGVlayE6IFRva2VuO1xuICBwcml2YXRlIF9jb250YWluZXJTdGFjazogTm9kZUNvbnRhaW5lcltdID0gW107XG5cbiAgcm9vdE5vZGVzOiBodG1sLk5vZGVbXSA9IFtdO1xuICBlcnJvcnM6IFRyZWVFcnJvcltdID0gW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIHRva2VuczogVG9rZW5bXSwgcHJpdmF0ZSBnZXRUYWdEZWZpbml0aW9uOiAodGFnTmFtZTogc3RyaW5nKSA9PiBUYWdEZWZpbml0aW9uKSB7XG4gICAgdGhpcy5fYWR2YW5jZSgpO1xuICB9XG5cbiAgYnVpbGQoKTogdm9pZCB7XG4gICAgd2hpbGUgKHRoaXMuX3BlZWsudHlwZSAhPT0gVG9rZW5UeXBlLkVPRikge1xuICAgICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLlRBR19PUEVOX1NUQVJUIHx8XG4gICAgICAgICAgdGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuSU5DT01QTEVURV9UQUdfT1BFTikge1xuICAgICAgICB0aGlzLl9jb25zdW1lU3RhcnRUYWcodGhpcy5fYWR2YW5jZSgpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuVEFHX0NMT1NFKSB7XG4gICAgICAgIHRoaXMuX2NvbnN1bWVFbmRUYWcodGhpcy5fYWR2YW5jZSgpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuQ0RBVEFfU1RBUlQpIHtcbiAgICAgICAgdGhpcy5fY2xvc2VWb2lkRWxlbWVudCgpO1xuICAgICAgICB0aGlzLl9jb25zdW1lQ2RhdGEodGhpcy5fYWR2YW5jZSgpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuQ09NTUVOVF9TVEFSVCkge1xuICAgICAgICB0aGlzLl9jbG9zZVZvaWRFbGVtZW50KCk7XG4gICAgICAgIHRoaXMuX2NvbnN1bWVDb21tZW50KHRoaXMuX2FkdmFuY2UoKSk7XG4gICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgIHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLlRFWFQgfHwgdGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuUkFXX1RFWFQgfHxcbiAgICAgICAgICB0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5FU0NBUEFCTEVfUkFXX1RFWFQpIHtcbiAgICAgICAgdGhpcy5fY2xvc2VWb2lkRWxlbWVudCgpO1xuICAgICAgICB0aGlzLl9jb25zdW1lVGV4dCh0aGlzLl9hZHZhbmNlKCkpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5FWFBBTlNJT05fRk9STV9TVEFSVCkge1xuICAgICAgICB0aGlzLl9jb25zdW1lRXhwYW5zaW9uKHRoaXMuX2FkdmFuY2UoKSk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkJMT0NLX09QRU5fU1RBUlQpIHtcbiAgICAgICAgdGhpcy5fY2xvc2VWb2lkRWxlbWVudCgpO1xuICAgICAgICB0aGlzLl9jb25zdW1lQmxvY2tPcGVuKHRoaXMuX2FkdmFuY2UoKSk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkJMT0NLX0NMT1NFKSB7XG4gICAgICAgIHRoaXMuX2Nsb3NlVm9pZEVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5fY29uc3VtZUJsb2NrQ2xvc2UodGhpcy5fYWR2YW5jZSgpKTtcbiAgICAgIH0gZWxzZSBpZiAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuSU5DT01QTEVURV9CTE9DS19PUEVOKSB7XG4gICAgICAgIHRoaXMuX2Nsb3NlVm9pZEVsZW1lbnQoKTtcbiAgICAgICAgdGhpcy5fY29uc3VtZUluY29tcGxldGVCbG9jayh0aGlzLl9hZHZhbmNlKCkpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gU2tpcCBhbGwgb3RoZXIgdG9rZW5zLi4uXG4gICAgICAgIHRoaXMuX2FkdmFuY2UoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGxlZnRvdmVyQ29udGFpbmVyIG9mIHRoaXMuX2NvbnRhaW5lclN0YWNrKSB7XG4gICAgICAvLyBVbmxpa2UgSFRNTCBlbGVtZW50cywgYmxvY2tzIGFyZW4ndCBjbG9zZWQgaW1wbGljaXRseSBieSB0aGUgZW5kIG9mIHRoZSBmaWxlLlxuICAgICAgaWYgKGxlZnRvdmVyQ29udGFpbmVyIGluc3RhbmNlb2YgaHRtbC5CbG9jaykge1xuICAgICAgICB0aGlzLmVycm9ycy5wdXNoKFRyZWVFcnJvci5jcmVhdGUoXG4gICAgICAgICAgICBsZWZ0b3ZlckNvbnRhaW5lci5uYW1lLCBsZWZ0b3ZlckNvbnRhaW5lci5zb3VyY2VTcGFuLFxuICAgICAgICAgICAgYFVuY2xvc2VkIGJsb2NrIFwiJHtsZWZ0b3ZlckNvbnRhaW5lci5uYW1lfVwiYCkpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2FkdmFuY2U8VCBleHRlbmRzIFRva2VuPigpOiBUIHtcbiAgICBjb25zdCBwcmV2ID0gdGhpcy5fcGVlaztcbiAgICBpZiAodGhpcy5faW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAvLyBOb3RlOiB0aGVyZSBpcyBhbHdheXMgYW4gRU9GIHRva2VuIGF0IHRoZSBlbmRcbiAgICAgIHRoaXMuX2luZGV4Kys7XG4gICAgfVxuICAgIHRoaXMuX3BlZWsgPSB0aGlzLnRva2Vuc1t0aGlzLl9pbmRleF07XG4gICAgcmV0dXJuIHByZXYgYXMgVDtcbiAgfVxuXG4gIHByaXZhdGUgX2FkdmFuY2VJZjxUIGV4dGVuZHMgVG9rZW5UeXBlPih0eXBlOiBUKTogKFRva2VuJnt0eXBlOiBUfSl8bnVsbCB7XG4gICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gdHlwZSkge1xuICAgICAgcmV0dXJuIHRoaXMuX2FkdmFuY2U8VG9rZW4me3R5cGU6IFR9PigpO1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVDZGF0YShfc3RhcnRUb2tlbjogQ2RhdGFTdGFydFRva2VuKSB7XG4gICAgdGhpcy5fY29uc3VtZVRleHQodGhpcy5fYWR2YW5jZTxUZXh0VG9rZW4+KCkpO1xuICAgIHRoaXMuX2FkdmFuY2VJZihUb2tlblR5cGUuQ0RBVEFfRU5EKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVDb21tZW50KHRva2VuOiBDb21tZW50U3RhcnRUb2tlbikge1xuICAgIGNvbnN0IHRleHQgPSB0aGlzLl9hZHZhbmNlSWYoVG9rZW5UeXBlLlJBV19URVhUKTtcbiAgICBjb25zdCBlbmRUb2tlbiA9IHRoaXMuX2FkdmFuY2VJZihUb2tlblR5cGUuQ09NTUVOVF9FTkQpO1xuICAgIGNvbnN0IHZhbHVlID0gdGV4dCAhPSBudWxsID8gdGV4dC5wYXJ0c1swXS50cmltKCkgOiBudWxsO1xuICAgIGNvbnN0IHNvdXJjZVNwYW4gPSBlbmRUb2tlbiA9PSBudWxsID9cbiAgICAgICAgdG9rZW4uc291cmNlU3BhbiA6XG4gICAgICAgIG5ldyBQYXJzZVNvdXJjZVNwYW4oXG4gICAgICAgICAgICB0b2tlbi5zb3VyY2VTcGFuLnN0YXJ0LCBlbmRUb2tlbi5zb3VyY2VTcGFuLmVuZCwgdG9rZW4uc291cmNlU3Bhbi5mdWxsU3RhcnQpO1xuICAgIHRoaXMuX2FkZFRvUGFyZW50KG5ldyBodG1sLkNvbW1lbnQodmFsdWUsIHNvdXJjZVNwYW4pKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVFeHBhbnNpb24odG9rZW46IEV4cGFuc2lvbkZvcm1TdGFydFRva2VuKSB7XG4gICAgY29uc3Qgc3dpdGNoVmFsdWUgPSB0aGlzLl9hZHZhbmNlPFRleHRUb2tlbj4oKTtcblxuICAgIGNvbnN0IHR5cGUgPSB0aGlzLl9hZHZhbmNlPFRleHRUb2tlbj4oKTtcbiAgICBjb25zdCBjYXNlczogaHRtbC5FeHBhbnNpb25DYXNlW10gPSBbXTtcblxuICAgIC8vIHJlYWQgPVxuICAgIHdoaWxlICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5FWFBBTlNJT05fQ0FTRV9WQUxVRSkge1xuICAgICAgY29uc3QgZXhwQ2FzZSA9IHRoaXMuX3BhcnNlRXhwYW5zaW9uQ2FzZSgpO1xuICAgICAgaWYgKCFleHBDYXNlKSByZXR1cm47ICAvLyBlcnJvclxuICAgICAgY2FzZXMucHVzaChleHBDYXNlKTtcbiAgICB9XG5cbiAgICAvLyByZWFkIHRoZSBmaW5hbCB9XG4gICAgaWYgKHRoaXMuX3BlZWsudHlwZSAhPT0gVG9rZW5UeXBlLkVYUEFOU0lPTl9GT1JNX0VORCkge1xuICAgICAgdGhpcy5lcnJvcnMucHVzaChcbiAgICAgICAgICBUcmVlRXJyb3IuY3JlYXRlKG51bGwsIHRoaXMuX3BlZWsuc291cmNlU3BhbiwgYEludmFsaWQgSUNVIG1lc3NhZ2UuIE1pc3NpbmcgJ30nLmApKTtcbiAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc3Qgc291cmNlU3BhbiA9IG5ldyBQYXJzZVNvdXJjZVNwYW4oXG4gICAgICAgIHRva2VuLnNvdXJjZVNwYW4uc3RhcnQsIHRoaXMuX3BlZWsuc291cmNlU3Bhbi5lbmQsIHRva2VuLnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICB0aGlzLl9hZGRUb1BhcmVudChuZXcgaHRtbC5FeHBhbnNpb24oXG4gICAgICAgIHN3aXRjaFZhbHVlLnBhcnRzWzBdLCB0eXBlLnBhcnRzWzBdLCBjYXNlcywgc291cmNlU3Bhbiwgc3dpdGNoVmFsdWUuc291cmNlU3BhbikpO1xuXG4gICAgdGhpcy5fYWR2YW5jZSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBfcGFyc2VFeHBhbnNpb25DYXNlKCk6IGh0bWwuRXhwYW5zaW9uQ2FzZXxudWxsIHtcbiAgICBjb25zdCB2YWx1ZSA9IHRoaXMuX2FkdmFuY2U8RXhwYW5zaW9uQ2FzZVZhbHVlVG9rZW4+KCk7XG5cbiAgICAvLyByZWFkIHtcbiAgICBpZiAodGhpcy5fcGVlay50eXBlICE9PSBUb2tlblR5cGUuRVhQQU5TSU9OX0NBU0VfRVhQX1NUQVJUKSB7XG4gICAgICB0aGlzLmVycm9ycy5wdXNoKFxuICAgICAgICAgIFRyZWVFcnJvci5jcmVhdGUobnVsbCwgdGhpcy5fcGVlay5zb3VyY2VTcGFuLCBgSW52YWxpZCBJQ1UgbWVzc2FnZS4gTWlzc2luZyAneycuYCkpO1xuICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxuXG4gICAgLy8gcmVhZCB1bnRpbCB9XG4gICAgY29uc3Qgc3RhcnQgPSB0aGlzLl9hZHZhbmNlPEV4cGFuc2lvbkNhc2VFeHByZXNzaW9uU3RhcnRUb2tlbj4oKTtcblxuICAgIGNvbnN0IGV4cCA9IHRoaXMuX2NvbGxlY3RFeHBhbnNpb25FeHBUb2tlbnMoc3RhcnQpO1xuICAgIGlmICghZXhwKSByZXR1cm4gbnVsbDtcblxuICAgIGNvbnN0IGVuZCA9IHRoaXMuX2FkdmFuY2U8RXhwYW5zaW9uQ2FzZUV4cHJlc3Npb25FbmRUb2tlbj4oKTtcbiAgICBleHAucHVzaCh7dHlwZTogVG9rZW5UeXBlLkVPRiwgcGFydHM6IFtdLCBzb3VyY2VTcGFuOiBlbmQuc291cmNlU3Bhbn0pO1xuXG4gICAgLy8gcGFyc2UgZXZlcnl0aGluZyBpbiBiZXR3ZWVuIHsgYW5kIH1cbiAgICBjb25zdCBleHBhbnNpb25DYXNlUGFyc2VyID0gbmV3IF9UcmVlQnVpbGRlcihleHAsIHRoaXMuZ2V0VGFnRGVmaW5pdGlvbik7XG4gICAgZXhwYW5zaW9uQ2FzZVBhcnNlci5idWlsZCgpO1xuICAgIGlmIChleHBhbnNpb25DYXNlUGFyc2VyLmVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICB0aGlzLmVycm9ycyA9IHRoaXMuZXJyb3JzLmNvbmNhdChleHBhbnNpb25DYXNlUGFyc2VyLmVycm9ycyk7XG4gICAgICByZXR1cm4gbnVsbDtcbiAgICB9XG5cbiAgICBjb25zdCBzb3VyY2VTcGFuID1cbiAgICAgICAgbmV3IFBhcnNlU291cmNlU3Bhbih2YWx1ZS5zb3VyY2VTcGFuLnN0YXJ0LCBlbmQuc291cmNlU3Bhbi5lbmQsIHZhbHVlLnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICBjb25zdCBleHBTb3VyY2VTcGFuID1cbiAgICAgICAgbmV3IFBhcnNlU291cmNlU3BhbihzdGFydC5zb3VyY2VTcGFuLnN0YXJ0LCBlbmQuc291cmNlU3Bhbi5lbmQsIHN0YXJ0LnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICByZXR1cm4gbmV3IGh0bWwuRXhwYW5zaW9uQ2FzZShcbiAgICAgICAgdmFsdWUucGFydHNbMF0sIGV4cGFuc2lvbkNhc2VQYXJzZXIucm9vdE5vZGVzLCBzb3VyY2VTcGFuLCB2YWx1ZS5zb3VyY2VTcGFuLCBleHBTb3VyY2VTcGFuKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbGxlY3RFeHBhbnNpb25FeHBUb2tlbnMoc3RhcnQ6IFRva2VuKTogVG9rZW5bXXxudWxsIHtcbiAgICBjb25zdCBleHA6IFRva2VuW10gPSBbXTtcbiAgICBjb25zdCBleHBhbnNpb25Gb3JtU3RhY2sgPSBbVG9rZW5UeXBlLkVYUEFOU0lPTl9DQVNFX0VYUF9TVEFSVF07XG5cbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkVYUEFOU0lPTl9GT1JNX1NUQVJUIHx8XG4gICAgICAgICAgdGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuRVhQQU5TSU9OX0NBU0VfRVhQX1NUQVJUKSB7XG4gICAgICAgIGV4cGFuc2lvbkZvcm1TdGFjay5wdXNoKHRoaXMuX3BlZWsudHlwZSk7XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5FWFBBTlNJT05fQ0FTRV9FWFBfRU5EKSB7XG4gICAgICAgIGlmIChsYXN0T25TdGFjayhleHBhbnNpb25Gb3JtU3RhY2ssIFRva2VuVHlwZS5FWFBBTlNJT05fQ0FTRV9FWFBfU1RBUlQpKSB7XG4gICAgICAgICAgZXhwYW5zaW9uRm9ybVN0YWNrLnBvcCgpO1xuICAgICAgICAgIGlmIChleHBhbnNpb25Gb3JtU3RhY2subGVuZ3RoID09PSAwKSByZXR1cm4gZXhwO1xuXG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhpcy5lcnJvcnMucHVzaChcbiAgICAgICAgICAgICAgVHJlZUVycm9yLmNyZWF0ZShudWxsLCBzdGFydC5zb3VyY2VTcGFuLCBgSW52YWxpZCBJQ1UgbWVzc2FnZS4gTWlzc2luZyAnfScuYCkpO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGlmICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5FWFBBTlNJT05fRk9STV9FTkQpIHtcbiAgICAgICAgaWYgKGxhc3RPblN0YWNrKGV4cGFuc2lvbkZvcm1TdGFjaywgVG9rZW5UeXBlLkVYUEFOU0lPTl9GT1JNX1NUQVJUKSkge1xuICAgICAgICAgIGV4cGFuc2lvbkZvcm1TdGFjay5wb3AoKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aGlzLmVycm9ycy5wdXNoKFxuICAgICAgICAgICAgICBUcmVlRXJyb3IuY3JlYXRlKG51bGwsIHN0YXJ0LnNvdXJjZVNwYW4sIGBJbnZhbGlkIElDVSBtZXNzYWdlLiBNaXNzaW5nICd9Jy5gKSk7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkVPRikge1xuICAgICAgICB0aGlzLmVycm9ycy5wdXNoKFxuICAgICAgICAgICAgVHJlZUVycm9yLmNyZWF0ZShudWxsLCBzdGFydC5zb3VyY2VTcGFuLCBgSW52YWxpZCBJQ1UgbWVzc2FnZS4gTWlzc2luZyAnfScuYCkpO1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgZXhwLnB1c2godGhpcy5fYWR2YW5jZSgpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9jb25zdW1lVGV4dCh0b2tlbjogSW50ZXJwb2xhdGVkVGV4dFRva2VuKSB7XG4gICAgY29uc3QgdG9rZW5zID0gW3Rva2VuXTtcbiAgICBjb25zdCBzdGFydFNwYW4gPSB0b2tlbi5zb3VyY2VTcGFuO1xuICAgIGxldCB0ZXh0ID0gdG9rZW4ucGFydHNbMF07XG4gICAgaWYgKHRleHQubGVuZ3RoID4gMCAmJiB0ZXh0WzBdID09PSAnXFxuJykge1xuICAgICAgY29uc3QgcGFyZW50ID0gdGhpcy5fZ2V0Q29udGFpbmVyKCk7XG5cbiAgICAgIGlmIChwYXJlbnQgIT0gbnVsbCAmJiBwYXJlbnQuY2hpbGRyZW4ubGVuZ3RoID09PSAwICYmXG4gICAgICAgICAgdGhpcy5nZXRUYWdEZWZpbml0aW9uKHBhcmVudC5uYW1lKS5pZ25vcmVGaXJzdExmKSB7XG4gICAgICAgIHRleHQgPSB0ZXh0LnN1YnN0cmluZygxKTtcbiAgICAgICAgdG9rZW5zWzBdID0ge3R5cGU6IHRva2VuLnR5cGUsIHNvdXJjZVNwYW46IHRva2VuLnNvdXJjZVNwYW4sIHBhcnRzOiBbdGV4dF19IGFzIHR5cGVvZiB0b2tlbjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB3aGlsZSAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuSU5URVJQT0xBVElPTiB8fCB0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5URVhUIHx8XG4gICAgICAgICAgIHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkVOQ09ERURfRU5USVRZKSB7XG4gICAgICB0b2tlbiA9IHRoaXMuX2FkdmFuY2UoKTtcbiAgICAgIHRva2Vucy5wdXNoKHRva2VuKTtcbiAgICAgIGlmICh0b2tlbi50eXBlID09PSBUb2tlblR5cGUuSU5URVJQT0xBVElPTikge1xuICAgICAgICAvLyBGb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSB3ZSBkZWNvZGUgSFRNTCBlbnRpdGllcyB0aGF0IGFwcGVhciBpbiBpbnRlcnBvbGF0aW9uXG4gICAgICAgIC8vIGV4cHJlc3Npb25zLiBUaGlzIGlzIGFyZ3VhYmx5IGEgYnVnLCBidXQgaXQgY291bGQgYmUgYSBjb25zaWRlcmFibGUgYnJlYWtpbmcgY2hhbmdlIHRvXG4gICAgICAgIC8vIGZpeCBpdC4gSXQgc2hvdWxkIGJlIGFkZHJlc3NlZCBpbiBhIGxhcmdlciBwcm9qZWN0IHRvIHJlZmFjdG9yIHRoZSBlbnRpcmUgcGFyc2VyL2xleGVyXG4gICAgICAgIC8vIGNoYWluIGFmdGVyIFZpZXcgRW5naW5lIGhhcyBiZWVuIHJlbW92ZWQuXG4gICAgICAgIHRleHQgKz0gdG9rZW4ucGFydHMuam9pbignJykucmVwbGFjZSgvJihbXjtdKyk7L2csIGRlY29kZUVudGl0eSk7XG4gICAgICB9IGVsc2UgaWYgKHRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5FTkNPREVEX0VOVElUWSkge1xuICAgICAgICB0ZXh0ICs9IHRva2VuLnBhcnRzWzBdO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGV4dCArPSB0b2tlbi5wYXJ0cy5qb2luKCcnKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGV4dC5sZW5ndGggPiAwKSB7XG4gICAgICBjb25zdCBlbmRTcGFuID0gdG9rZW4uc291cmNlU3BhbjtcbiAgICAgIHRoaXMuX2FkZFRvUGFyZW50KG5ldyBodG1sLlRleHQoXG4gICAgICAgICAgdGV4dCxcbiAgICAgICAgICBuZXcgUGFyc2VTb3VyY2VTcGFuKHN0YXJ0U3Bhbi5zdGFydCwgZW5kU3Bhbi5lbmQsIHN0YXJ0U3Bhbi5mdWxsU3RhcnQsIHN0YXJ0U3Bhbi5kZXRhaWxzKSxcbiAgICAgICAgICB0b2tlbnMpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9jbG9zZVZvaWRFbGVtZW50KCk6IHZvaWQge1xuICAgIGNvbnN0IGVsID0gdGhpcy5fZ2V0Q29udGFpbmVyKCk7XG4gICAgaWYgKGVsIGluc3RhbmNlb2YgaHRtbC5FbGVtZW50ICYmIHRoaXMuZ2V0VGFnRGVmaW5pdGlvbihlbC5uYW1lKS5pc1ZvaWQpIHtcbiAgICAgIHRoaXMuX2NvbnRhaW5lclN0YWNrLnBvcCgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVTdGFydFRhZyhzdGFydFRhZ1Rva2VuOiBUYWdPcGVuU3RhcnRUb2tlbnxJbmNvbXBsZXRlVGFnT3BlblRva2VuKSB7XG4gICAgY29uc3QgW3ByZWZpeCwgbmFtZV0gPSBzdGFydFRhZ1Rva2VuLnBhcnRzO1xuICAgIGNvbnN0IGF0dHJzOiBodG1sLkF0dHJpYnV0ZVtdID0gW107XG4gICAgd2hpbGUgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkFUVFJfTkFNRSkge1xuICAgICAgYXR0cnMucHVzaCh0aGlzLl9jb25zdW1lQXR0cih0aGlzLl9hZHZhbmNlPEF0dHJpYnV0ZU5hbWVUb2tlbj4oKSkpO1xuICAgIH1cbiAgICBjb25zdCBmdWxsTmFtZSA9IHRoaXMuX2dldEVsZW1lbnRGdWxsTmFtZShwcmVmaXgsIG5hbWUsIHRoaXMuX2dldENsb3Nlc3RQYXJlbnRFbGVtZW50KCkpO1xuICAgIGxldCBzZWxmQ2xvc2luZyA9IGZhbHNlO1xuICAgIC8vIE5vdGU6IFRoZXJlIGNvdWxkIGhhdmUgYmVlbiBhIHRva2VuaXplciBlcnJvclxuICAgIC8vIHNvIHRoYXQgd2UgZG9uJ3QgZ2V0IGEgdG9rZW4gZm9yIHRoZSBlbmQgdGFnLi4uXG4gICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLlRBR19PUEVOX0VORF9WT0lEKSB7XG4gICAgICB0aGlzLl9hZHZhbmNlKCk7XG4gICAgICBzZWxmQ2xvc2luZyA9IHRydWU7XG4gICAgICBjb25zdCB0YWdEZWYgPSB0aGlzLmdldFRhZ0RlZmluaXRpb24oZnVsbE5hbWUpO1xuICAgICAgaWYgKCEodGFnRGVmLmNhblNlbGZDbG9zZSB8fCBnZXROc1ByZWZpeChmdWxsTmFtZSkgIT09IG51bGwgfHwgdGFnRGVmLmlzVm9pZCkpIHtcbiAgICAgICAgdGhpcy5lcnJvcnMucHVzaChUcmVlRXJyb3IuY3JlYXRlKFxuICAgICAgICAgICAgZnVsbE5hbWUsIHN0YXJ0VGFnVG9rZW4uc291cmNlU3BhbixcbiAgICAgICAgICAgIGBPbmx5IHZvaWQsIGN1c3RvbSBhbmQgZm9yZWlnbiBlbGVtZW50cyBjYW4gYmUgc2VsZiBjbG9zZWQgXCIke1xuICAgICAgICAgICAgICAgIHN0YXJ0VGFnVG9rZW4ucGFydHNbMV19XCJgKSk7XG4gICAgICB9XG4gICAgfSBlbHNlIGlmICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5UQUdfT1BFTl9FTkQpIHtcbiAgICAgIHRoaXMuX2FkdmFuY2UoKTtcbiAgICAgIHNlbGZDbG9zaW5nID0gZmFsc2U7XG4gICAgfVxuICAgIGNvbnN0IGVuZCA9IHRoaXMuX3BlZWsuc291cmNlU3Bhbi5mdWxsU3RhcnQ7XG4gICAgY29uc3Qgc3BhbiA9IG5ldyBQYXJzZVNvdXJjZVNwYW4oXG4gICAgICAgIHN0YXJ0VGFnVG9rZW4uc291cmNlU3Bhbi5zdGFydCwgZW5kLCBzdGFydFRhZ1Rva2VuLnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICAvLyBDcmVhdGUgYSBzZXBhcmF0ZSBgc3RhcnRTcGFuYCBiZWNhdXNlIGBzcGFuYCB3aWxsIGJlIG1vZGlmaWVkIHdoZW4gdGhlcmUgaXMgYW4gYGVuZGAgc3Bhbi5cbiAgICBjb25zdCBzdGFydFNwYW4gPSBuZXcgUGFyc2VTb3VyY2VTcGFuKFxuICAgICAgICBzdGFydFRhZ1Rva2VuLnNvdXJjZVNwYW4uc3RhcnQsIGVuZCwgc3RhcnRUYWdUb2tlbi5zb3VyY2VTcGFuLmZ1bGxTdGFydCk7XG4gICAgY29uc3QgZWwgPSBuZXcgaHRtbC5FbGVtZW50KGZ1bGxOYW1lLCBhdHRycywgW10sIHNwYW4sIHN0YXJ0U3BhbiwgdW5kZWZpbmVkKTtcbiAgICBjb25zdCBwYXJlbnRFbCA9IHRoaXMuX2dldENvbnRhaW5lcigpO1xuICAgIHRoaXMuX3B1c2hDb250YWluZXIoXG4gICAgICAgIGVsLFxuICAgICAgICBwYXJlbnRFbCBpbnN0YW5jZW9mIGh0bWwuRWxlbWVudCAmJlxuICAgICAgICAgICAgdGhpcy5nZXRUYWdEZWZpbml0aW9uKHBhcmVudEVsLm5hbWUpLmlzQ2xvc2VkQnlDaGlsZChlbC5uYW1lKSk7XG4gICAgaWYgKHNlbGZDbG9zaW5nKSB7XG4gICAgICAvLyBFbGVtZW50cyB0aGF0IGFyZSBzZWxmLWNsb3NlZCBoYXZlIHRoZWlyIGBlbmRTb3VyY2VTcGFuYCBzZXQgdG8gdGhlIGZ1bGwgc3BhbiwgYXMgdGhlXG4gICAgICAvLyBlbGVtZW50IHN0YXJ0IHRhZyBhbHNvIHJlcHJlc2VudHMgdGhlIGVuZCB0YWcuXG4gICAgICB0aGlzLl9wb3BDb250YWluZXIoZnVsbE5hbWUsIGh0bWwuRWxlbWVudCwgc3Bhbik7XG4gICAgfSBlbHNlIGlmIChzdGFydFRhZ1Rva2VuLnR5cGUgPT09IFRva2VuVHlwZS5JTkNPTVBMRVRFX1RBR19PUEVOKSB7XG4gICAgICAvLyBXZSBhbHJlYWR5IGtub3cgdGhlIG9wZW5pbmcgdGFnIGlzIG5vdCBjb21wbGV0ZSwgc28gaXQgaXMgdW5saWtlbHkgaXQgaGFzIGEgY29ycmVzcG9uZGluZ1xuICAgICAgLy8gY2xvc2UgdGFnLiBMZXQncyBvcHRpbWlzdGljYWxseSBwYXJzZSBpdCBhcyBhIGZ1bGwgZWxlbWVudCBhbmQgZW1pdCBhbiBlcnJvci5cbiAgICAgIHRoaXMuX3BvcENvbnRhaW5lcihmdWxsTmFtZSwgaHRtbC5FbGVtZW50LCBudWxsKTtcbiAgICAgIHRoaXMuZXJyb3JzLnB1c2goXG4gICAgICAgICAgVHJlZUVycm9yLmNyZWF0ZShmdWxsTmFtZSwgc3BhbiwgYE9wZW5pbmcgdGFnIFwiJHtmdWxsTmFtZX1cIiBub3QgdGVybWluYXRlZC5gKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfcHVzaENvbnRhaW5lcihub2RlOiBOb2RlQ29udGFpbmVyLCBpc0Nsb3NlZEJ5Q2hpbGQ6IGJvb2xlYW4pIHtcbiAgICBpZiAoaXNDbG9zZWRCeUNoaWxkKSB7XG4gICAgICB0aGlzLl9jb250YWluZXJTdGFjay5wb3AoKTtcbiAgICB9XG5cbiAgICB0aGlzLl9hZGRUb1BhcmVudChub2RlKTtcbiAgICB0aGlzLl9jb250YWluZXJTdGFjay5wdXNoKG5vZGUpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUVuZFRhZyhlbmRUYWdUb2tlbjogVGFnQ2xvc2VUb2tlbikge1xuICAgIGNvbnN0IGZ1bGxOYW1lID0gdGhpcy5fZ2V0RWxlbWVudEZ1bGxOYW1lKFxuICAgICAgICBlbmRUYWdUb2tlbi5wYXJ0c1swXSwgZW5kVGFnVG9rZW4ucGFydHNbMV0sIHRoaXMuX2dldENsb3Nlc3RQYXJlbnRFbGVtZW50KCkpO1xuXG4gICAgaWYgKHRoaXMuZ2V0VGFnRGVmaW5pdGlvbihmdWxsTmFtZSkuaXNWb2lkKSB7XG4gICAgICB0aGlzLmVycm9ycy5wdXNoKFRyZWVFcnJvci5jcmVhdGUoXG4gICAgICAgICAgZnVsbE5hbWUsIGVuZFRhZ1Rva2VuLnNvdXJjZVNwYW4sXG4gICAgICAgICAgYFZvaWQgZWxlbWVudHMgZG8gbm90IGhhdmUgZW5kIHRhZ3MgXCIke2VuZFRhZ1Rva2VuLnBhcnRzWzFdfVwiYCkpO1xuICAgIH0gZWxzZSBpZiAoIXRoaXMuX3BvcENvbnRhaW5lcihmdWxsTmFtZSwgaHRtbC5FbGVtZW50LCBlbmRUYWdUb2tlbi5zb3VyY2VTcGFuKSkge1xuICAgICAgY29uc3QgZXJyTXNnID0gYFVuZXhwZWN0ZWQgY2xvc2luZyB0YWcgXCIke1xuICAgICAgICAgIGZ1bGxOYW1lfVwiLiBJdCBtYXkgaGFwcGVuIHdoZW4gdGhlIHRhZyBoYXMgYWxyZWFkeSBiZWVuIGNsb3NlZCBieSBhbm90aGVyIHRhZy4gRm9yIG1vcmUgaW5mbyBzZWUgaHR0cHM6Ly93d3cudzMub3JnL1RSL2h0bWw1L3N5bnRheC5odG1sI2Nsb3NpbmctZWxlbWVudHMtdGhhdC1oYXZlLWltcGxpZWQtZW5kLXRhZ3NgO1xuICAgICAgdGhpcy5lcnJvcnMucHVzaChUcmVlRXJyb3IuY3JlYXRlKGZ1bGxOYW1lLCBlbmRUYWdUb2tlbi5zb3VyY2VTcGFuLCBlcnJNc2cpKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQ2xvc2VzIHRoZSBuZWFyZXN0IGVsZW1lbnQgd2l0aCB0aGUgdGFnIG5hbWUgYGZ1bGxOYW1lYCBpbiB0aGUgcGFyc2UgdHJlZS5cbiAgICogYGVuZFNvdXJjZVNwYW5gIGlzIHRoZSBzcGFuIG9mIHRoZSBjbG9zaW5nIHRhZywgb3IgbnVsbCBpZiB0aGUgZWxlbWVudCBkb2VzXG4gICAqIG5vdCBoYXZlIGEgY2xvc2luZyB0YWcgKGZvciBleGFtcGxlLCB0aGlzIGhhcHBlbnMgd2hlbiBhbiBpbmNvbXBsZXRlXG4gICAqIG9wZW5pbmcgdGFnIGlzIHJlY292ZXJlZCkuXG4gICAqL1xuICBwcml2YXRlIF9wb3BDb250YWluZXIoXG4gICAgICBleHBlY3RlZE5hbWU6IHN0cmluZ3xudWxsLCBleHBlY3RlZFR5cGU6IE5vZGVDb250YWluZXJDb25zdHJ1Y3RvcixcbiAgICAgIGVuZFNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbnxudWxsKTogYm9vbGVhbiB7XG4gICAgbGV0IHVuZXhwZWN0ZWRDbG9zZVRhZ0RldGVjdGVkID0gZmFsc2U7XG4gICAgZm9yIChsZXQgc3RhY2tJbmRleCA9IHRoaXMuX2NvbnRhaW5lclN0YWNrLmxlbmd0aCAtIDE7IHN0YWNrSW5kZXggPj0gMDsgc3RhY2tJbmRleC0tKSB7XG4gICAgICBjb25zdCBub2RlID0gdGhpcy5fY29udGFpbmVyU3RhY2tbc3RhY2tJbmRleF07XG5cbiAgICAgIGlmICgobm9kZS5uYW1lID09PSBleHBlY3RlZE5hbWUgfHwgZXhwZWN0ZWROYW1lID09PSBudWxsKSAmJiBub2RlIGluc3RhbmNlb2YgZXhwZWN0ZWRUeXBlKSB7XG4gICAgICAgIC8vIFJlY29yZCB0aGUgcGFyc2Ugc3BhbiB3aXRoIHRoZSBlbGVtZW50IHRoYXQgaXMgYmVpbmcgY2xvc2VkLiBBbnkgZWxlbWVudHMgdGhhdCBhcmVcbiAgICAgICAgLy8gcmVtb3ZlZCBmcm9tIHRoZSBlbGVtZW50IHN0YWNrIGF0IHRoaXMgcG9pbnQgYXJlIGNsb3NlZCBpbXBsaWNpdGx5LCBzbyB0aGV5IHdvbid0IGdldFxuICAgICAgICAvLyBhbiBlbmQgc291cmNlIHNwYW4gKGFzIHRoZXJlIGlzIG5vIGV4cGxpY2l0IGNsb3NpbmcgZWxlbWVudCkuXG4gICAgICAgIG5vZGUuZW5kU291cmNlU3BhbiA9IGVuZFNvdXJjZVNwYW47XG4gICAgICAgIG5vZGUuc291cmNlU3Bhbi5lbmQgPSBlbmRTb3VyY2VTcGFuICE9PSBudWxsID8gZW5kU291cmNlU3Bhbi5lbmQgOiBub2RlLnNvdXJjZVNwYW4uZW5kO1xuICAgICAgICB0aGlzLl9jb250YWluZXJTdGFjay5zcGxpY2Uoc3RhY2tJbmRleCwgdGhpcy5fY29udGFpbmVyU3RhY2subGVuZ3RoIC0gc3RhY2tJbmRleCk7XG4gICAgICAgIHJldHVybiAhdW5leHBlY3RlZENsb3NlVGFnRGV0ZWN0ZWQ7XG4gICAgICB9XG5cbiAgICAgIC8vIEJsb2NrcyBhbmQgbW9zdCBlbGVtZW50cyBhcmUgbm90IHNlbGYgY2xvc2luZy5cbiAgICAgIGlmIChub2RlIGluc3RhbmNlb2YgaHRtbC5CbG9jayB8fFxuICAgICAgICAgIG5vZGUgaW5zdGFuY2VvZiBodG1sLkVsZW1lbnQgJiYgIXRoaXMuZ2V0VGFnRGVmaW5pdGlvbihub2RlLm5hbWUpLmNsb3NlZEJ5UGFyZW50KSB7XG4gICAgICAgIC8vIE5vdGUgdGhhdCB3ZSBlbmNvdW50ZXJlZCBhbiB1bmV4cGVjdGVkIGNsb3NlIHRhZyBidXQgY29udGludWUgcHJvY2Vzc2luZyB0aGUgZWxlbWVudFxuICAgICAgICAvLyBzdGFjayBzbyB3ZSBjYW4gYXNzaWduIGFuIGBlbmRTb3VyY2VTcGFuYCBpZiB0aGVyZSBpcyBhIGNvcnJlc3BvbmRpbmcgc3RhcnQgdGFnIGZvciB0aGlzXG4gICAgICAgIC8vIGVuZCB0YWcgaW4gdGhlIHN0YWNrLlxuICAgICAgICB1bmV4cGVjdGVkQ2xvc2VUYWdEZXRlY3RlZCA9IHRydWU7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVBdHRyKGF0dHJOYW1lOiBBdHRyaWJ1dGVOYW1lVG9rZW4pOiBodG1sLkF0dHJpYnV0ZSB7XG4gICAgY29uc3QgZnVsbE5hbWUgPSBtZXJnZU5zQW5kTmFtZShhdHRyTmFtZS5wYXJ0c1swXSwgYXR0ck5hbWUucGFydHNbMV0pO1xuICAgIGxldCBhdHRyRW5kID0gYXR0ck5hbWUuc291cmNlU3Bhbi5lbmQ7XG5cbiAgICAvLyBDb25zdW1lIGFueSBxdW90ZVxuICAgIGlmICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5BVFRSX1FVT1RFKSB7XG4gICAgICB0aGlzLl9hZHZhbmNlKCk7XG4gICAgfVxuXG4gICAgLy8gQ29uc3VtZSB0aGUgYXR0cmlidXRlIHZhbHVlXG4gICAgbGV0IHZhbHVlID0gJyc7XG4gICAgY29uc3QgdmFsdWVUb2tlbnM6IEludGVycG9sYXRlZEF0dHJpYnV0ZVRva2VuW10gPSBbXTtcbiAgICBsZXQgdmFsdWVTdGFydFNwYW46IFBhcnNlU291cmNlU3Bhbnx1bmRlZmluZWQgPSB1bmRlZmluZWQ7XG4gICAgbGV0IHZhbHVlRW5kOiBQYXJzZUxvY2F0aW9ufHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAvLyBOT1RFOiBXZSBuZWVkIHRvIHVzZSBhIG5ldyB2YXJpYWJsZSBgbmV4dFRva2VuVHlwZWAgaGVyZSB0byBoaWRlIHRoZSBhY3R1YWwgdHlwZSBvZlxuICAgIC8vIGBfcGVlay50eXBlYCBmcm9tIFRTLiBPdGhlcndpc2UgVFMgd2lsbCBuYXJyb3cgdGhlIHR5cGUgb2YgYF9wZWVrLnR5cGVgIHByZXZlbnRpbmcgaXQgZnJvbVxuICAgIC8vIGJlaW5nIGFibGUgdG8gY29uc2lkZXIgYEFUVFJfVkFMVUVfSU5URVJQT0xBVElPTmAgYXMgYW4gb3B0aW9uLiBUaGlzIGlzIGJlY2F1c2UgVFMgaXMgbm90XG4gICAgLy8gYWJsZSB0byBzZWUgdGhhdCBgX2FkdmFuY2UoKWAgd2lsbCBhY3R1YWxseSBtdXRhdGUgYF9wZWVrYC5cbiAgICBjb25zdCBuZXh0VG9rZW5UeXBlID0gdGhpcy5fcGVlay50eXBlIGFzIFRva2VuVHlwZTtcbiAgICBpZiAobmV4dFRva2VuVHlwZSA9PT0gVG9rZW5UeXBlLkFUVFJfVkFMVUVfVEVYVCkge1xuICAgICAgdmFsdWVTdGFydFNwYW4gPSB0aGlzLl9wZWVrLnNvdXJjZVNwYW47XG4gICAgICB2YWx1ZUVuZCA9IHRoaXMuX3BlZWsuc291cmNlU3Bhbi5lbmQ7XG4gICAgICB3aGlsZSAodGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuQVRUUl9WQUxVRV9URVhUIHx8XG4gICAgICAgICAgICAgdGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuQVRUUl9WQUxVRV9JTlRFUlBPTEFUSU9OIHx8XG4gICAgICAgICAgICAgdGhpcy5fcGVlay50eXBlID09PSBUb2tlblR5cGUuRU5DT0RFRF9FTlRJVFkpIHtcbiAgICAgICAgY29uc3QgdmFsdWVUb2tlbiA9IHRoaXMuX2FkdmFuY2U8SW50ZXJwb2xhdGVkQXR0cmlidXRlVG9rZW4+KCk7XG4gICAgICAgIHZhbHVlVG9rZW5zLnB1c2godmFsdWVUb2tlbik7XG4gICAgICAgIGlmICh2YWx1ZVRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5BVFRSX1ZBTFVFX0lOVEVSUE9MQVRJT04pIHtcbiAgICAgICAgICAvLyBGb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSB3ZSBkZWNvZGUgSFRNTCBlbnRpdGllcyB0aGF0IGFwcGVhciBpbiBpbnRlcnBvbGF0aW9uXG4gICAgICAgICAgLy8gZXhwcmVzc2lvbnMuIFRoaXMgaXMgYXJndWFibHkgYSBidWcsIGJ1dCBpdCBjb3VsZCBiZSBhIGNvbnNpZGVyYWJsZSBicmVha2luZyBjaGFuZ2UgdG9cbiAgICAgICAgICAvLyBmaXggaXQuIEl0IHNob3VsZCBiZSBhZGRyZXNzZWQgaW4gYSBsYXJnZXIgcHJvamVjdCB0byByZWZhY3RvciB0aGUgZW50aXJlIHBhcnNlci9sZXhlclxuICAgICAgICAgIC8vIGNoYWluIGFmdGVyIFZpZXcgRW5naW5lIGhhcyBiZWVuIHJlbW92ZWQuXG4gICAgICAgICAgdmFsdWUgKz0gdmFsdWVUb2tlbi5wYXJ0cy5qb2luKCcnKS5yZXBsYWNlKC8mKFteO10rKTsvZywgZGVjb2RlRW50aXR5KTtcbiAgICAgICAgfSBlbHNlIGlmICh2YWx1ZVRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5FTkNPREVEX0VOVElUWSkge1xuICAgICAgICAgIHZhbHVlICs9IHZhbHVlVG9rZW4ucGFydHNbMF07XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdmFsdWUgKz0gdmFsdWVUb2tlbi5wYXJ0cy5qb2luKCcnKTtcbiAgICAgICAgfVxuICAgICAgICB2YWx1ZUVuZCA9IGF0dHJFbmQgPSB2YWx1ZVRva2VuLnNvdXJjZVNwYW4uZW5kO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIENvbnN1bWUgYW55IHF1b3RlXG4gICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkFUVFJfUVVPVEUpIHtcbiAgICAgIGNvbnN0IHF1b3RlVG9rZW4gPSB0aGlzLl9hZHZhbmNlPEF0dHJpYnV0ZVF1b3RlVG9rZW4+KCk7XG4gICAgICBhdHRyRW5kID0gcXVvdGVUb2tlbi5zb3VyY2VTcGFuLmVuZDtcbiAgICB9XG5cbiAgICBjb25zdCB2YWx1ZVNwYW4gPSB2YWx1ZVN0YXJ0U3BhbiAmJiB2YWx1ZUVuZCAmJlxuICAgICAgICBuZXcgUGFyc2VTb3VyY2VTcGFuKHZhbHVlU3RhcnRTcGFuLnN0YXJ0LCB2YWx1ZUVuZCwgdmFsdWVTdGFydFNwYW4uZnVsbFN0YXJ0KTtcbiAgICByZXR1cm4gbmV3IGh0bWwuQXR0cmlidXRlKFxuICAgICAgICBmdWxsTmFtZSwgdmFsdWUsXG4gICAgICAgIG5ldyBQYXJzZVNvdXJjZVNwYW4oYXR0ck5hbWUuc291cmNlU3Bhbi5zdGFydCwgYXR0ckVuZCwgYXR0ck5hbWUuc291cmNlU3Bhbi5mdWxsU3RhcnQpLFxuICAgICAgICBhdHRyTmFtZS5zb3VyY2VTcGFuLCB2YWx1ZVNwYW4sIHZhbHVlVG9rZW5zLmxlbmd0aCA+IDAgPyB2YWx1ZVRva2VucyA6IHVuZGVmaW5lZCxcbiAgICAgICAgdW5kZWZpbmVkKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVCbG9ja09wZW4odG9rZW46IEJsb2NrT3BlblN0YXJ0VG9rZW4pIHtcbiAgICBjb25zdCBwYXJhbWV0ZXJzOiBodG1sLkJsb2NrUGFyYW1ldGVyW10gPSBbXTtcblxuICAgIHdoaWxlICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5CTE9DS19QQVJBTUVURVIpIHtcbiAgICAgIGNvbnN0IHBhcmFtVG9rZW4gPSB0aGlzLl9hZHZhbmNlPEJsb2NrUGFyYW1ldGVyVG9rZW4+KCk7XG4gICAgICBwYXJhbWV0ZXJzLnB1c2gobmV3IGh0bWwuQmxvY2tQYXJhbWV0ZXIocGFyYW1Ub2tlbi5wYXJ0c1swXSwgcGFyYW1Ub2tlbi5zb3VyY2VTcGFuKSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3BlZWsudHlwZSA9PT0gVG9rZW5UeXBlLkJMT0NLX09QRU5fRU5EKSB7XG4gICAgICB0aGlzLl9hZHZhbmNlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kID0gdGhpcy5fcGVlay5zb3VyY2VTcGFuLmZ1bGxTdGFydDtcbiAgICBjb25zdCBzcGFuID0gbmV3IFBhcnNlU291cmNlU3Bhbih0b2tlbi5zb3VyY2VTcGFuLnN0YXJ0LCBlbmQsIHRva2VuLnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICAvLyBDcmVhdGUgYSBzZXBhcmF0ZSBgc3RhcnRTcGFuYCBiZWNhdXNlIGBzcGFuYCB3aWxsIGJlIG1vZGlmaWVkIHdoZW4gdGhlcmUgaXMgYW4gYGVuZGAgc3Bhbi5cbiAgICBjb25zdCBzdGFydFNwYW4gPSBuZXcgUGFyc2VTb3VyY2VTcGFuKHRva2VuLnNvdXJjZVNwYW4uc3RhcnQsIGVuZCwgdG9rZW4uc291cmNlU3Bhbi5mdWxsU3RhcnQpO1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IGh0bWwuQmxvY2sodG9rZW4ucGFydHNbMF0sIHBhcmFtZXRlcnMsIFtdLCBzcGFuLCB0b2tlbi5zb3VyY2VTcGFuLCBzdGFydFNwYW4pO1xuICAgIHRoaXMuX3B1c2hDb250YWluZXIoYmxvY2ssIGZhbHNlKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVCbG9ja0Nsb3NlKHRva2VuOiBCbG9ja0Nsb3NlVG9rZW4pIHtcbiAgICBpZiAoIXRoaXMuX3BvcENvbnRhaW5lcihudWxsLCBodG1sLkJsb2NrLCB0b2tlbi5zb3VyY2VTcGFuKSkge1xuICAgICAgdGhpcy5lcnJvcnMucHVzaChUcmVlRXJyb3IuY3JlYXRlKFxuICAgICAgICAgIG51bGwsIHRva2VuLnNvdXJjZVNwYW4sXG4gICAgICAgICAgYFVuZXhwZWN0ZWQgY2xvc2luZyBibG9jay4gVGhlIGJsb2NrIG1heSBoYXZlIGJlZW4gY2xvc2VkIGVhcmxpZXIuIGAgK1xuICAgICAgICAgICAgICBgSWYgeW91IG1lYW50IHRvIHdyaXRlIHRoZSB9IGNoYXJhY3RlciwgeW91IHNob3VsZCB1c2UgdGhlIFwiJiMxMjU7XCIgYCArXG4gICAgICAgICAgICAgIGBIVE1MIGVudGl0eSBpbnN0ZWFkLmApKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9jb25zdW1lSW5jb21wbGV0ZUJsb2NrKHRva2VuOiBJbmNvbXBsZXRlQmxvY2tPcGVuVG9rZW4pIHtcbiAgICBjb25zdCBwYXJhbWV0ZXJzOiBodG1sLkJsb2NrUGFyYW1ldGVyW10gPSBbXTtcblxuICAgIHdoaWxlICh0aGlzLl9wZWVrLnR5cGUgPT09IFRva2VuVHlwZS5CTE9DS19QQVJBTUVURVIpIHtcbiAgICAgIGNvbnN0IHBhcmFtVG9rZW4gPSB0aGlzLl9hZHZhbmNlPEJsb2NrUGFyYW1ldGVyVG9rZW4+KCk7XG4gICAgICBwYXJhbWV0ZXJzLnB1c2gobmV3IGh0bWwuQmxvY2tQYXJhbWV0ZXIocGFyYW1Ub2tlbi5wYXJ0c1swXSwgcGFyYW1Ub2tlbi5zb3VyY2VTcGFuKSk7XG4gICAgfVxuXG4gICAgY29uc3QgZW5kID0gdGhpcy5fcGVlay5zb3VyY2VTcGFuLmZ1bGxTdGFydDtcbiAgICBjb25zdCBzcGFuID0gbmV3IFBhcnNlU291cmNlU3Bhbih0b2tlbi5zb3VyY2VTcGFuLnN0YXJ0LCBlbmQsIHRva2VuLnNvdXJjZVNwYW4uZnVsbFN0YXJ0KTtcbiAgICAvLyBDcmVhdGUgYSBzZXBhcmF0ZSBgc3RhcnRTcGFuYCBiZWNhdXNlIGBzcGFuYCB3aWxsIGJlIG1vZGlmaWVkIHdoZW4gdGhlcmUgaXMgYW4gYGVuZGAgc3Bhbi5cbiAgICBjb25zdCBzdGFydFNwYW4gPSBuZXcgUGFyc2VTb3VyY2VTcGFuKHRva2VuLnNvdXJjZVNwYW4uc3RhcnQsIGVuZCwgdG9rZW4uc291cmNlU3Bhbi5mdWxsU3RhcnQpO1xuICAgIGNvbnN0IGJsb2NrID0gbmV3IGh0bWwuQmxvY2sodG9rZW4ucGFydHNbMF0sIHBhcmFtZXRlcnMsIFtdLCBzcGFuLCB0b2tlbi5zb3VyY2VTcGFuLCBzdGFydFNwYW4pO1xuICAgIHRoaXMuX3B1c2hDb250YWluZXIoYmxvY2ssIGZhbHNlKTtcblxuICAgIC8vIEluY29tcGxldGUgYmxvY2tzIGRvbid0IGhhdmUgY2hpbGRyZW4gc28gd2UgY2xvc2UgdGhlbSBpbW1lZGlhdGVseSBhbmQgcmVwb3J0IGFuIGVycm9yLlxuICAgIHRoaXMuX3BvcENvbnRhaW5lcihudWxsLCBodG1sLkJsb2NrLCBudWxsKTtcblxuICAgIHRoaXMuZXJyb3JzLnB1c2goVHJlZUVycm9yLmNyZWF0ZShcbiAgICAgICAgdG9rZW4ucGFydHNbMF0sIHNwYW4sXG4gICAgICAgIGBJbmNvbXBsZXRlIGJsb2NrIFwiJHt0b2tlbi5wYXJ0c1swXX1cIi4gSWYgeW91IG1lYW50IHRvIHdyaXRlIHRoZSBAIGNoYXJhY3RlciwgYCArXG4gICAgICAgICAgICBgeW91IHNob3VsZCB1c2UgdGhlIFwiJiM2NDtcIiBIVE1MIGVudGl0eSBpbnN0ZWFkLmApKTtcbiAgfVxuXG4gIHByaXZhdGUgX2dldENvbnRhaW5lcigpOiBOb2RlQ29udGFpbmVyfG51bGwge1xuICAgIHJldHVybiB0aGlzLl9jb250YWluZXJTdGFjay5sZW5ndGggPiAwID8gdGhpcy5fY29udGFpbmVyU3RhY2tbdGhpcy5fY29udGFpbmVyU3RhY2subGVuZ3RoIC0gMV0gOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgbnVsbDtcbiAgfVxuXG4gIHByaXZhdGUgX2dldENsb3Nlc3RQYXJlbnRFbGVtZW50KCk6IGh0bWwuRWxlbWVudHxudWxsIHtcbiAgICBmb3IgKGxldCBpID0gdGhpcy5fY29udGFpbmVyU3RhY2subGVuZ3RoIC0gMTsgaSA+IC0xOyBpLS0pIHtcbiAgICAgIGlmICh0aGlzLl9jb250YWluZXJTdGFja1tpXSBpbnN0YW5jZW9mIGh0bWwuRWxlbWVudCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fY29udGFpbmVyU3RhY2tbaV0gYXMgaHRtbC5FbGVtZW50O1xuICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgcHJpdmF0ZSBfYWRkVG9QYXJlbnQobm9kZTogaHRtbC5Ob2RlKSB7XG4gICAgY29uc3QgcGFyZW50ID0gdGhpcy5fZ2V0Q29udGFpbmVyKCk7XG5cbiAgICBpZiAocGFyZW50ID09PSBudWxsKSB7XG4gICAgICB0aGlzLnJvb3ROb2Rlcy5wdXNoKG5vZGUpO1xuICAgIH0gZWxzZSB7XG4gICAgICBwYXJlbnQuY2hpbGRyZW4ucHVzaChub2RlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9nZXRFbGVtZW50RnVsbE5hbWUocHJlZml4OiBzdHJpbmcsIGxvY2FsTmFtZTogc3RyaW5nLCBwYXJlbnRFbGVtZW50OiBodG1sLkVsZW1lbnR8bnVsbCk6XG4gICAgICBzdHJpbmcge1xuICAgIGlmIChwcmVmaXggPT09ICcnKSB7XG4gICAgICBwcmVmaXggPSB0aGlzLmdldFRhZ0RlZmluaXRpb24obG9jYWxOYW1lKS5pbXBsaWNpdE5hbWVzcGFjZVByZWZpeCB8fCAnJztcbiAgICAgIGlmIChwcmVmaXggPT09ICcnICYmIHBhcmVudEVsZW1lbnQgIT0gbnVsbCkge1xuICAgICAgICBjb25zdCBwYXJlbnRUYWdOYW1lID0gc3BsaXROc05hbWUocGFyZW50RWxlbWVudC5uYW1lKVsxXTtcbiAgICAgICAgY29uc3QgcGFyZW50VGFnRGVmaW5pdGlvbiA9IHRoaXMuZ2V0VGFnRGVmaW5pdGlvbihwYXJlbnRUYWdOYW1lKTtcbiAgICAgICAgaWYgKCFwYXJlbnRUYWdEZWZpbml0aW9uLnByZXZlbnROYW1lc3BhY2VJbmhlcml0YW5jZSkge1xuICAgICAgICAgIHByZWZpeCA9IGdldE5zUHJlZml4KHBhcmVudEVsZW1lbnQubmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gbWVyZ2VOc0FuZE5hbWUocHJlZml4LCBsb2NhbE5hbWUpO1xuICB9XG59XG5cbmZ1bmN0aW9uIGxhc3RPblN0YWNrKHN0YWNrOiBhbnlbXSwgZWxlbWVudDogYW55KTogYm9vbGVhbiB7XG4gIHJldHVybiBzdGFjay5sZW5ndGggPiAwICYmIHN0YWNrW3N0YWNrLmxlbmd0aCAtIDFdID09PSBlbGVtZW50O1xufVxuXG4vKipcbiAqIERlY29kZSB0aGUgYGVudGl0eWAgc3RyaW5nLCB3aGljaCB3ZSBiZWxpZXZlIGlzIHRoZSBjb250ZW50cyBvZiBhbiBIVE1MIGVudGl0eS5cbiAqXG4gKiBJZiB0aGUgc3RyaW5nIGlzIG5vdCBhY3R1YWxseSBhIHZhbGlkL2tub3duIGVudGl0eSB0aGVuIGp1c3QgcmV0dXJuIHRoZSBvcmlnaW5hbCBgbWF0Y2hgIHN0cmluZy5cbiAqL1xuZnVuY3Rpb24gZGVjb2RlRW50aXR5KG1hdGNoOiBzdHJpbmcsIGVudGl0eTogc3RyaW5nKTogc3RyaW5nIHtcbiAgaWYgKE5BTUVEX0VOVElUSUVTW2VudGl0eV0gIT09IHVuZGVmaW5lZCkge1xuICAgIHJldHVybiBOQU1FRF9FTlRJVElFU1tlbnRpdHldIHx8IG1hdGNoO1xuICB9XG4gIGlmICgvXiN4W2EtZjAtOV0rJC9pLnRlc3QoZW50aXR5KSkge1xuICAgIHJldHVybiBTdHJpbmcuZnJvbUNvZGVQb2ludChwYXJzZUludChlbnRpdHkuc2xpY2UoMiksIDE2KSk7XG4gIH1cbiAgaWYgKC9eI1xcZCskLy50ZXN0KGVudGl0eSkpIHtcbiAgICByZXR1cm4gU3RyaW5nLmZyb21Db2RlUG9pbnQocGFyc2VJbnQoZW50aXR5LnNsaWNlKDEpLCAxMCkpO1xuICB9XG4gIHJldHVybiBtYXRjaDtcbn1cbiJdfQ==