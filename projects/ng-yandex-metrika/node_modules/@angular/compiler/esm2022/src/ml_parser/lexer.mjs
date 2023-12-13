/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as chars from '../chars';
import { ParseError, ParseLocation, ParseSourceFile, ParseSourceSpan } from '../parse_util';
import { DEFAULT_INTERPOLATION_CONFIG } from './defaults';
import { NAMED_ENTITIES } from './entities';
import { TagContentType } from './tags';
export class TokenError extends ParseError {
    constructor(errorMsg, tokenType, span) {
        super(span, errorMsg);
        this.tokenType = tokenType;
    }
}
export class TokenizeResult {
    constructor(tokens, errors, nonNormalizedIcuExpressions) {
        this.tokens = tokens;
        this.errors = errors;
        this.nonNormalizedIcuExpressions = nonNormalizedIcuExpressions;
    }
}
export function tokenize(source, url, getTagDefinition, options = {}) {
    const tokenizer = new _Tokenizer(new ParseSourceFile(source, url), getTagDefinition, options);
    tokenizer.tokenize();
    return new TokenizeResult(mergeTextTokens(tokenizer.tokens), tokenizer.errors, tokenizer.nonNormalizedIcuExpressions);
}
const _CR_OR_CRLF_REGEXP = /\r\n?/g;
function _unexpectedCharacterErrorMsg(charCode) {
    const char = charCode === chars.$EOF ? 'EOF' : String.fromCharCode(charCode);
    return `Unexpected character "${char}"`;
}
function _unknownEntityErrorMsg(entitySrc) {
    return `Unknown entity "${entitySrc}" - use the "&#<decimal>;" or  "&#x<hex>;" syntax`;
}
function _unparsableEntityErrorMsg(type, entityStr) {
    return `Unable to parse entity "${entityStr}" - ${type} character reference entities must end with ";"`;
}
var CharacterReferenceType;
(function (CharacterReferenceType) {
    CharacterReferenceType["HEX"] = "hexadecimal";
    CharacterReferenceType["DEC"] = "decimal";
})(CharacterReferenceType || (CharacterReferenceType = {}));
class _ControlFlowError {
    constructor(error) {
        this.error = error;
    }
}
// See https://www.w3.org/TR/html51/syntax.html#writing-html-documents
class _Tokenizer {
    /**
     * @param _file The html source file being tokenized.
     * @param _getTagDefinition A function that will retrieve a tag definition for a given tag name.
     * @param options Configuration of the tokenization.
     */
    constructor(_file, _getTagDefinition, options) {
        this._getTagDefinition = _getTagDefinition;
        this._currentTokenStart = null;
        this._currentTokenType = null;
        this._expansionCaseStack = [];
        this._inInterpolation = false;
        this.tokens = [];
        this.errors = [];
        this.nonNormalizedIcuExpressions = [];
        this._tokenizeIcu = options.tokenizeExpansionForms || false;
        this._interpolationConfig = options.interpolationConfig || DEFAULT_INTERPOLATION_CONFIG;
        this._leadingTriviaCodePoints =
            options.leadingTriviaChars && options.leadingTriviaChars.map(c => c.codePointAt(0) || 0);
        const range = options.range || { endPos: _file.content.length, startPos: 0, startLine: 0, startCol: 0 };
        this._cursor = options.escapedString ? new EscapedCharacterCursor(_file, range) :
            new PlainCharacterCursor(_file, range);
        this._preserveLineEndings = options.preserveLineEndings || false;
        this._i18nNormalizeLineEndingsInICUs = options.i18nNormalizeLineEndingsInICUs || false;
        this._tokenizeBlocks = options.tokenizeBlocks ?? true;
        try {
            this._cursor.init();
        }
        catch (e) {
            this.handleError(e);
        }
    }
    _processCarriageReturns(content) {
        if (this._preserveLineEndings) {
            return content;
        }
        // https://www.w3.org/TR/html51/syntax.html#preprocessing-the-input-stream
        // In order to keep the original position in the source, we can not
        // pre-process it.
        // Instead CRs are processed right before instantiating the tokens.
        return content.replace(_CR_OR_CRLF_REGEXP, '\n');
    }
    tokenize() {
        while (this._cursor.peek() !== chars.$EOF) {
            const start = this._cursor.clone();
            try {
                if (this._attemptCharCode(chars.$LT)) {
                    if (this._attemptCharCode(chars.$BANG)) {
                        if (this._attemptCharCode(chars.$LBRACKET)) {
                            this._consumeCdata(start);
                        }
                        else if (this._attemptCharCode(chars.$MINUS)) {
                            this._consumeComment(start);
                        }
                        else {
                            this._consumeDocType(start);
                        }
                    }
                    else if (this._attemptCharCode(chars.$SLASH)) {
                        this._consumeTagClose(start);
                    }
                    else {
                        this._consumeTagOpen(start);
                    }
                }
                else if (this._tokenizeBlocks && this._attemptCharCode(chars.$AT)) {
                    this._consumeBlockStart(start);
                }
                else if (this._tokenizeBlocks && !this._inInterpolation && !this._isInExpansionCase() &&
                    !this._isInExpansionForm() && this._attemptCharCode(chars.$RBRACE)) {
                    this._consumeBlockEnd(start);
                }
                else if (!(this._tokenizeIcu && this._tokenizeExpansionForm())) {
                    // In (possibly interpolated) text the end of the text is given by `isTextEnd()`, while
                    // the premature end of an interpolation is given by the start of a new HTML element.
                    this._consumeWithInterpolation(5 /* TokenType.TEXT */, 8 /* TokenType.INTERPOLATION */, () => this._isTextEnd(), () => this._isTagStart());
                }
            }
            catch (e) {
                this.handleError(e);
            }
        }
        this._beginToken(29 /* TokenType.EOF */);
        this._endToken([]);
    }
    _getBlockName() {
        // This allows us to capture up something like `@else if`, but not `@ if`.
        let spacesInNameAllowed = false;
        const nameCursor = this._cursor.clone();
        this._attemptCharCodeUntilFn(code => {
            if (chars.isWhitespace(code)) {
                return !spacesInNameAllowed;
            }
            if (isBlockNameChar(code)) {
                spacesInNameAllowed = true;
                return false;
            }
            return true;
        });
        return this._cursor.getChars(nameCursor).trim();
    }
    _consumeBlockStart(start) {
        this._beginToken(24 /* TokenType.BLOCK_OPEN_START */, start);
        const startToken = this._endToken([this._getBlockName()]);
        if (this._cursor.peek() === chars.$LPAREN) {
            // Advance past the opening paren.
            this._cursor.advance();
            // Capture the parameters.
            this._consumeBlockParameters();
            // Allow spaces before the closing paren.
            this._attemptCharCodeUntilFn(isNotWhitespace);
            if (this._attemptCharCode(chars.$RPAREN)) {
                // Allow spaces after the paren.
                this._attemptCharCodeUntilFn(isNotWhitespace);
            }
            else {
                startToken.type = 28 /* TokenType.INCOMPLETE_BLOCK_OPEN */;
                return;
            }
        }
        if (this._attemptCharCode(chars.$LBRACE)) {
            this._beginToken(25 /* TokenType.BLOCK_OPEN_END */);
            this._endToken([]);
        }
        else {
            startToken.type = 28 /* TokenType.INCOMPLETE_BLOCK_OPEN */;
        }
    }
    _consumeBlockEnd(start) {
        this._beginToken(26 /* TokenType.BLOCK_CLOSE */, start);
        this._endToken([]);
    }
    _consumeBlockParameters() {
        // Trim the whitespace until the first parameter.
        this._attemptCharCodeUntilFn(isBlockParameterChar);
        while (this._cursor.peek() !== chars.$RPAREN && this._cursor.peek() !== chars.$EOF) {
            this._beginToken(27 /* TokenType.BLOCK_PARAMETER */);
            const start = this._cursor.clone();
            let inQuote = null;
            let openParens = 0;
            // Consume the parameter until the next semicolon or brace.
            // Note that we skip over semicolons/braces inside of strings.
            while ((this._cursor.peek() !== chars.$SEMICOLON && this._cursor.peek() !== chars.$EOF) ||
                inQuote !== null) {
                const char = this._cursor.peek();
                // Skip to the next character if it was escaped.
                if (char === chars.$BACKSLASH) {
                    this._cursor.advance();
                }
                else if (char === inQuote) {
                    inQuote = null;
                }
                else if (inQuote === null && chars.isQuote(char)) {
                    inQuote = char;
                }
                else if (char === chars.$LPAREN && inQuote === null) {
                    openParens++;
                }
                else if (char === chars.$RPAREN && inQuote === null) {
                    if (openParens === 0) {
                        break;
                    }
                    else if (openParens > 0) {
                        openParens--;
                    }
                }
                this._cursor.advance();
            }
            this._endToken([this._cursor.getChars(start)]);
            // Skip to the next parameter.
            this._attemptCharCodeUntilFn(isBlockParameterChar);
        }
    }
    /**
     * @returns whether an ICU token has been created
     * @internal
     */
    _tokenizeExpansionForm() {
        if (this.isExpansionFormStart()) {
            this._consumeExpansionFormStart();
            return true;
        }
        if (isExpansionCaseStart(this._cursor.peek()) && this._isInExpansionForm()) {
            this._consumeExpansionCaseStart();
            return true;
        }
        if (this._cursor.peek() === chars.$RBRACE) {
            if (this._isInExpansionCase()) {
                this._consumeExpansionCaseEnd();
                return true;
            }
            if (this._isInExpansionForm()) {
                this._consumeExpansionFormEnd();
                return true;
            }
        }
        return false;
    }
    _beginToken(type, start = this._cursor.clone()) {
        this._currentTokenStart = start;
        this._currentTokenType = type;
    }
    _endToken(parts, end) {
        if (this._currentTokenStart === null) {
            throw new TokenError('Programming error - attempted to end a token when there was no start to the token', this._currentTokenType, this._cursor.getSpan(end));
        }
        if (this._currentTokenType === null) {
            throw new TokenError('Programming error - attempted to end a token which has no token type', null, this._cursor.getSpan(this._currentTokenStart));
        }
        const token = {
            type: this._currentTokenType,
            parts,
            sourceSpan: (end ?? this._cursor).getSpan(this._currentTokenStart, this._leadingTriviaCodePoints),
        };
        this.tokens.push(token);
        this._currentTokenStart = null;
        this._currentTokenType = null;
        return token;
    }
    _createError(msg, span) {
        if (this._isInExpansionForm()) {
            msg += ` (Do you have an unescaped "{" in your template? Use "{{ '{' }}") to escape it.)`;
        }
        const error = new TokenError(msg, this._currentTokenType, span);
        this._currentTokenStart = null;
        this._currentTokenType = null;
        return new _ControlFlowError(error);
    }
    handleError(e) {
        if (e instanceof CursorError) {
            e = this._createError(e.msg, this._cursor.getSpan(e.cursor));
        }
        if (e instanceof _ControlFlowError) {
            this.errors.push(e.error);
        }
        else {
            throw e;
        }
    }
    _attemptCharCode(charCode) {
        if (this._cursor.peek() === charCode) {
            this._cursor.advance();
            return true;
        }
        return false;
    }
    _attemptCharCodeCaseInsensitive(charCode) {
        if (compareCharCodeCaseInsensitive(this._cursor.peek(), charCode)) {
            this._cursor.advance();
            return true;
        }
        return false;
    }
    _requireCharCode(charCode) {
        const location = this._cursor.clone();
        if (!this._attemptCharCode(charCode)) {
            throw this._createError(_unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(location));
        }
    }
    _attemptStr(chars) {
        const len = chars.length;
        if (this._cursor.charsLeft() < len) {
            return false;
        }
        const initialPosition = this._cursor.clone();
        for (let i = 0; i < len; i++) {
            if (!this._attemptCharCode(chars.charCodeAt(i))) {
                // If attempting to parse the string fails, we want to reset the parser
                // to where it was before the attempt
                this._cursor = initialPosition;
                return false;
            }
        }
        return true;
    }
    _attemptStrCaseInsensitive(chars) {
        for (let i = 0; i < chars.length; i++) {
            if (!this._attemptCharCodeCaseInsensitive(chars.charCodeAt(i))) {
                return false;
            }
        }
        return true;
    }
    _requireStr(chars) {
        const location = this._cursor.clone();
        if (!this._attemptStr(chars)) {
            throw this._createError(_unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(location));
        }
    }
    _attemptCharCodeUntilFn(predicate) {
        while (!predicate(this._cursor.peek())) {
            this._cursor.advance();
        }
    }
    _requireCharCodeUntilFn(predicate, len) {
        const start = this._cursor.clone();
        this._attemptCharCodeUntilFn(predicate);
        if (this._cursor.diff(start) < len) {
            throw this._createError(_unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(start));
        }
    }
    _attemptUntilChar(char) {
        while (this._cursor.peek() !== char) {
            this._cursor.advance();
        }
    }
    _readChar() {
        // Don't rely upon reading directly from `_input` as the actual char value
        // may have been generated from an escape sequence.
        const char = String.fromCodePoint(this._cursor.peek());
        this._cursor.advance();
        return char;
    }
    _consumeEntity(textTokenType) {
        this._beginToken(9 /* TokenType.ENCODED_ENTITY */);
        const start = this._cursor.clone();
        this._cursor.advance();
        if (this._attemptCharCode(chars.$HASH)) {
            const isHex = this._attemptCharCode(chars.$x) || this._attemptCharCode(chars.$X);
            const codeStart = this._cursor.clone();
            this._attemptCharCodeUntilFn(isDigitEntityEnd);
            if (this._cursor.peek() != chars.$SEMICOLON) {
                // Advance cursor to include the peeked character in the string provided to the error
                // message.
                this._cursor.advance();
                const entityType = isHex ? CharacterReferenceType.HEX : CharacterReferenceType.DEC;
                throw this._createError(_unparsableEntityErrorMsg(entityType, this._cursor.getChars(start)), this._cursor.getSpan());
            }
            const strNum = this._cursor.getChars(codeStart);
            this._cursor.advance();
            try {
                const charCode = parseInt(strNum, isHex ? 16 : 10);
                this._endToken([String.fromCharCode(charCode), this._cursor.getChars(start)]);
            }
            catch {
                throw this._createError(_unknownEntityErrorMsg(this._cursor.getChars(start)), this._cursor.getSpan());
            }
        }
        else {
            const nameStart = this._cursor.clone();
            this._attemptCharCodeUntilFn(isNamedEntityEnd);
            if (this._cursor.peek() != chars.$SEMICOLON) {
                // No semicolon was found so abort the encoded entity token that was in progress, and treat
                // this as a text token
                this._beginToken(textTokenType, start);
                this._cursor = nameStart;
                this._endToken(['&']);
            }
            else {
                const name = this._cursor.getChars(nameStart);
                this._cursor.advance();
                const char = NAMED_ENTITIES[name];
                if (!char) {
                    throw this._createError(_unknownEntityErrorMsg(name), this._cursor.getSpan(start));
                }
                this._endToken([char, `&${name};`]);
            }
        }
    }
    _consumeRawText(consumeEntities, endMarkerPredicate) {
        this._beginToken(consumeEntities ? 6 /* TokenType.ESCAPABLE_RAW_TEXT */ : 7 /* TokenType.RAW_TEXT */);
        const parts = [];
        while (true) {
            const tagCloseStart = this._cursor.clone();
            const foundEndMarker = endMarkerPredicate();
            this._cursor = tagCloseStart;
            if (foundEndMarker) {
                break;
            }
            if (consumeEntities && this._cursor.peek() === chars.$AMPERSAND) {
                this._endToken([this._processCarriageReturns(parts.join(''))]);
                parts.length = 0;
                this._consumeEntity(6 /* TokenType.ESCAPABLE_RAW_TEXT */);
                this._beginToken(6 /* TokenType.ESCAPABLE_RAW_TEXT */);
            }
            else {
                parts.push(this._readChar());
            }
        }
        this._endToken([this._processCarriageReturns(parts.join(''))]);
    }
    _consumeComment(start) {
        this._beginToken(10 /* TokenType.COMMENT_START */, start);
        this._requireCharCode(chars.$MINUS);
        this._endToken([]);
        this._consumeRawText(false, () => this._attemptStr('-->'));
        this._beginToken(11 /* TokenType.COMMENT_END */);
        this._requireStr('-->');
        this._endToken([]);
    }
    _consumeCdata(start) {
        this._beginToken(12 /* TokenType.CDATA_START */, start);
        this._requireStr('CDATA[');
        this._endToken([]);
        this._consumeRawText(false, () => this._attemptStr(']]>'));
        this._beginToken(13 /* TokenType.CDATA_END */);
        this._requireStr(']]>');
        this._endToken([]);
    }
    _consumeDocType(start) {
        this._beginToken(18 /* TokenType.DOC_TYPE */, start);
        const contentStart = this._cursor.clone();
        this._attemptUntilChar(chars.$GT);
        const content = this._cursor.getChars(contentStart);
        this._cursor.advance();
        this._endToken([content]);
    }
    _consumePrefixAndName() {
        const nameOrPrefixStart = this._cursor.clone();
        let prefix = '';
        while (this._cursor.peek() !== chars.$COLON && !isPrefixEnd(this._cursor.peek())) {
            this._cursor.advance();
        }
        let nameStart;
        if (this._cursor.peek() === chars.$COLON) {
            prefix = this._cursor.getChars(nameOrPrefixStart);
            this._cursor.advance();
            nameStart = this._cursor.clone();
        }
        else {
            nameStart = nameOrPrefixStart;
        }
        this._requireCharCodeUntilFn(isNameEnd, prefix === '' ? 0 : 1);
        const name = this._cursor.getChars(nameStart);
        return [prefix, name];
    }
    _consumeTagOpen(start) {
        let tagName;
        let prefix;
        let openTagToken;
        try {
            if (!chars.isAsciiLetter(this._cursor.peek())) {
                throw this._createError(_unexpectedCharacterErrorMsg(this._cursor.peek()), this._cursor.getSpan(start));
            }
            openTagToken = this._consumeTagOpenStart(start);
            prefix = openTagToken.parts[0];
            tagName = openTagToken.parts[1];
            this._attemptCharCodeUntilFn(isNotWhitespace);
            while (this._cursor.peek() !== chars.$SLASH && this._cursor.peek() !== chars.$GT &&
                this._cursor.peek() !== chars.$LT && this._cursor.peek() !== chars.$EOF) {
                this._consumeAttributeName();
                this._attemptCharCodeUntilFn(isNotWhitespace);
                if (this._attemptCharCode(chars.$EQ)) {
                    this._attemptCharCodeUntilFn(isNotWhitespace);
                    this._consumeAttributeValue();
                }
                this._attemptCharCodeUntilFn(isNotWhitespace);
            }
            this._consumeTagOpenEnd();
        }
        catch (e) {
            if (e instanceof _ControlFlowError) {
                if (openTagToken) {
                    // We errored before we could close the opening tag, so it is incomplete.
                    openTagToken.type = 4 /* TokenType.INCOMPLETE_TAG_OPEN */;
                }
                else {
                    // When the start tag is invalid, assume we want a "<" as text.
                    // Back to back text tokens are merged at the end.
                    this._beginToken(5 /* TokenType.TEXT */, start);
                    this._endToken(['<']);
                }
                return;
            }
            throw e;
        }
        const contentTokenType = this._getTagDefinition(tagName).getContentType(prefix);
        if (contentTokenType === TagContentType.RAW_TEXT) {
            this._consumeRawTextWithTagClose(prefix, tagName, false);
        }
        else if (contentTokenType === TagContentType.ESCAPABLE_RAW_TEXT) {
            this._consumeRawTextWithTagClose(prefix, tagName, true);
        }
    }
    _consumeRawTextWithTagClose(prefix, tagName, consumeEntities) {
        this._consumeRawText(consumeEntities, () => {
            if (!this._attemptCharCode(chars.$LT))
                return false;
            if (!this._attemptCharCode(chars.$SLASH))
                return false;
            this._attemptCharCodeUntilFn(isNotWhitespace);
            if (!this._attemptStrCaseInsensitive(tagName))
                return false;
            this._attemptCharCodeUntilFn(isNotWhitespace);
            return this._attemptCharCode(chars.$GT);
        });
        this._beginToken(3 /* TokenType.TAG_CLOSE */);
        this._requireCharCodeUntilFn(code => code === chars.$GT, 3);
        this._cursor.advance(); // Consume the `>`
        this._endToken([prefix, tagName]);
    }
    _consumeTagOpenStart(start) {
        this._beginToken(0 /* TokenType.TAG_OPEN_START */, start);
        const parts = this._consumePrefixAndName();
        return this._endToken(parts);
    }
    _consumeAttributeName() {
        const attrNameStart = this._cursor.peek();
        if (attrNameStart === chars.$SQ || attrNameStart === chars.$DQ) {
            throw this._createError(_unexpectedCharacterErrorMsg(attrNameStart), this._cursor.getSpan());
        }
        this._beginToken(14 /* TokenType.ATTR_NAME */);
        const prefixAndName = this._consumePrefixAndName();
        this._endToken(prefixAndName);
    }
    _consumeAttributeValue() {
        if (this._cursor.peek() === chars.$SQ || this._cursor.peek() === chars.$DQ) {
            const quoteChar = this._cursor.peek();
            this._consumeQuote(quoteChar);
            // In an attribute then end of the attribute value and the premature end to an interpolation
            // are both triggered by the `quoteChar`.
            const endPredicate = () => this._cursor.peek() === quoteChar;
            this._consumeWithInterpolation(16 /* TokenType.ATTR_VALUE_TEXT */, 17 /* TokenType.ATTR_VALUE_INTERPOLATION */, endPredicate, endPredicate);
            this._consumeQuote(quoteChar);
        }
        else {
            const endPredicate = () => isNameEnd(this._cursor.peek());
            this._consumeWithInterpolation(16 /* TokenType.ATTR_VALUE_TEXT */, 17 /* TokenType.ATTR_VALUE_INTERPOLATION */, endPredicate, endPredicate);
        }
    }
    _consumeQuote(quoteChar) {
        this._beginToken(15 /* TokenType.ATTR_QUOTE */);
        this._requireCharCode(quoteChar);
        this._endToken([String.fromCodePoint(quoteChar)]);
    }
    _consumeTagOpenEnd() {
        const tokenType = this._attemptCharCode(chars.$SLASH) ? 2 /* TokenType.TAG_OPEN_END_VOID */ : 1 /* TokenType.TAG_OPEN_END */;
        this._beginToken(tokenType);
        this._requireCharCode(chars.$GT);
        this._endToken([]);
    }
    _consumeTagClose(start) {
        this._beginToken(3 /* TokenType.TAG_CLOSE */, start);
        this._attemptCharCodeUntilFn(isNotWhitespace);
        const prefixAndName = this._consumePrefixAndName();
        this._attemptCharCodeUntilFn(isNotWhitespace);
        this._requireCharCode(chars.$GT);
        this._endToken(prefixAndName);
    }
    _consumeExpansionFormStart() {
        this._beginToken(19 /* TokenType.EXPANSION_FORM_START */);
        this._requireCharCode(chars.$LBRACE);
        this._endToken([]);
        this._expansionCaseStack.push(19 /* TokenType.EXPANSION_FORM_START */);
        this._beginToken(7 /* TokenType.RAW_TEXT */);
        const condition = this._readUntil(chars.$COMMA);
        const normalizedCondition = this._processCarriageReturns(condition);
        if (this._i18nNormalizeLineEndingsInICUs) {
            // We explicitly want to normalize line endings for this text.
            this._endToken([normalizedCondition]);
        }
        else {
            // We are not normalizing line endings.
            const conditionToken = this._endToken([condition]);
            if (normalizedCondition !== condition) {
                this.nonNormalizedIcuExpressions.push(conditionToken);
            }
        }
        this._requireCharCode(chars.$COMMA);
        this._attemptCharCodeUntilFn(isNotWhitespace);
        this._beginToken(7 /* TokenType.RAW_TEXT */);
        const type = this._readUntil(chars.$COMMA);
        this._endToken([type]);
        this._requireCharCode(chars.$COMMA);
        this._attemptCharCodeUntilFn(isNotWhitespace);
    }
    _consumeExpansionCaseStart() {
        this._beginToken(20 /* TokenType.EXPANSION_CASE_VALUE */);
        const value = this._readUntil(chars.$LBRACE).trim();
        this._endToken([value]);
        this._attemptCharCodeUntilFn(isNotWhitespace);
        this._beginToken(21 /* TokenType.EXPANSION_CASE_EXP_START */);
        this._requireCharCode(chars.$LBRACE);
        this._endToken([]);
        this._attemptCharCodeUntilFn(isNotWhitespace);
        this._expansionCaseStack.push(21 /* TokenType.EXPANSION_CASE_EXP_START */);
    }
    _consumeExpansionCaseEnd() {
        this._beginToken(22 /* TokenType.EXPANSION_CASE_EXP_END */);
        this._requireCharCode(chars.$RBRACE);
        this._endToken([]);
        this._attemptCharCodeUntilFn(isNotWhitespace);
        this._expansionCaseStack.pop();
    }
    _consumeExpansionFormEnd() {
        this._beginToken(23 /* TokenType.EXPANSION_FORM_END */);
        this._requireCharCode(chars.$RBRACE);
        this._endToken([]);
        this._expansionCaseStack.pop();
    }
    /**
     * Consume a string that may contain interpolation expressions.
     *
     * The first token consumed will be of `tokenType` and then there will be alternating
     * `interpolationTokenType` and `tokenType` tokens until the `endPredicate()` returns true.
     *
     * If an interpolation token ends prematurely it will have no end marker in its `parts` array.
     *
     * @param textTokenType the kind of tokens to interleave around interpolation tokens.
     * @param interpolationTokenType the kind of tokens that contain interpolation.
     * @param endPredicate a function that should return true when we should stop consuming.
     * @param endInterpolation a function that should return true if there is a premature end to an
     *     interpolation expression - i.e. before we get to the normal interpolation closing marker.
     */
    _consumeWithInterpolation(textTokenType, interpolationTokenType, endPredicate, endInterpolation) {
        this._beginToken(textTokenType);
        const parts = [];
        while (!endPredicate()) {
            const current = this._cursor.clone();
            if (this._interpolationConfig && this._attemptStr(this._interpolationConfig.start)) {
                this._endToken([this._processCarriageReturns(parts.join(''))], current);
                parts.length = 0;
                this._consumeInterpolation(interpolationTokenType, current, endInterpolation);
                this._beginToken(textTokenType);
            }
            else if (this._cursor.peek() === chars.$AMPERSAND) {
                this._endToken([this._processCarriageReturns(parts.join(''))]);
                parts.length = 0;
                this._consumeEntity(textTokenType);
                this._beginToken(textTokenType);
            }
            else {
                parts.push(this._readChar());
            }
        }
        // It is possible that an interpolation was started but not ended inside this text token.
        // Make sure that we reset the state of the lexer correctly.
        this._inInterpolation = false;
        this._endToken([this._processCarriageReturns(parts.join(''))]);
    }
    /**
     * Consume a block of text that has been interpreted as an Angular interpolation.
     *
     * @param interpolationTokenType the type of the interpolation token to generate.
     * @param interpolationStart a cursor that points to the start of this interpolation.
     * @param prematureEndPredicate a function that should return true if the next characters indicate
     *     an end to the interpolation before its normal closing marker.
     */
    _consumeInterpolation(interpolationTokenType, interpolationStart, prematureEndPredicate) {
        const parts = [];
        this._beginToken(interpolationTokenType, interpolationStart);
        parts.push(this._interpolationConfig.start);
        // Find the end of the interpolation, ignoring content inside quotes.
        const expressionStart = this._cursor.clone();
        let inQuote = null;
        let inComment = false;
        while (this._cursor.peek() !== chars.$EOF &&
            (prematureEndPredicate === null || !prematureEndPredicate())) {
            const current = this._cursor.clone();
            if (this._isTagStart()) {
                // We are starting what looks like an HTML element in the middle of this interpolation.
                // Reset the cursor to before the `<` character and end the interpolation token.
                // (This is actually wrong but here for backward compatibility).
                this._cursor = current;
                parts.push(this._getProcessedChars(expressionStart, current));
                this._endToken(parts);
                return;
            }
            if (inQuote === null) {
                if (this._attemptStr(this._interpolationConfig.end)) {
                    // We are not in a string, and we hit the end interpolation marker
                    parts.push(this._getProcessedChars(expressionStart, current));
                    parts.push(this._interpolationConfig.end);
                    this._endToken(parts);
                    return;
                }
                else if (this._attemptStr('//')) {
                    // Once we are in a comment we ignore any quotes
                    inComment = true;
                }
            }
            const char = this._cursor.peek();
            this._cursor.advance();
            if (char === chars.$BACKSLASH) {
                // Skip the next character because it was escaped.
                this._cursor.advance();
            }
            else if (char === inQuote) {
                // Exiting the current quoted string
                inQuote = null;
            }
            else if (!inComment && inQuote === null && chars.isQuote(char)) {
                // Entering a new quoted string
                inQuote = char;
            }
        }
        // We hit EOF without finding a closing interpolation marker
        parts.push(this._getProcessedChars(expressionStart, this._cursor));
        this._endToken(parts);
    }
    _getProcessedChars(start, end) {
        return this._processCarriageReturns(end.getChars(start));
    }
    _isTextEnd() {
        if (this._isTagStart() || this._cursor.peek() === chars.$EOF) {
            return true;
        }
        if (this._tokenizeIcu && !this._inInterpolation) {
            if (this.isExpansionFormStart()) {
                // start of an expansion form
                return true;
            }
            if (this._cursor.peek() === chars.$RBRACE && this._isInExpansionCase()) {
                // end of and expansion case
                return true;
            }
        }
        if (this._tokenizeBlocks && !this._inInterpolation && !this._isInExpansion() &&
            (this._cursor.peek() === chars.$AT || this._cursor.peek() === chars.$RBRACE)) {
            return true;
        }
        return false;
    }
    /**
     * Returns true if the current cursor is pointing to the start of a tag
     * (opening/closing/comments/cdata/etc).
     */
    _isTagStart() {
        if (this._cursor.peek() === chars.$LT) {
            // We assume that `<` followed by whitespace is not the start of an HTML element.
            const tmp = this._cursor.clone();
            tmp.advance();
            // If the next character is alphabetic, ! nor / then it is a tag start
            const code = tmp.peek();
            if ((chars.$a <= code && code <= chars.$z) || (chars.$A <= code && code <= chars.$Z) ||
                code === chars.$SLASH || code === chars.$BANG) {
                return true;
            }
        }
        return false;
    }
    _readUntil(char) {
        const start = this._cursor.clone();
        this._attemptUntilChar(char);
        return this._cursor.getChars(start);
    }
    _isInExpansion() {
        return this._isInExpansionCase() || this._isInExpansionForm();
    }
    _isInExpansionCase() {
        return this._expansionCaseStack.length > 0 &&
            this._expansionCaseStack[this._expansionCaseStack.length - 1] ===
                21 /* TokenType.EXPANSION_CASE_EXP_START */;
    }
    _isInExpansionForm() {
        return this._expansionCaseStack.length > 0 &&
            this._expansionCaseStack[this._expansionCaseStack.length - 1] ===
                19 /* TokenType.EXPANSION_FORM_START */;
    }
    isExpansionFormStart() {
        if (this._cursor.peek() !== chars.$LBRACE) {
            return false;
        }
        if (this._interpolationConfig) {
            const start = this._cursor.clone();
            const isInterpolation = this._attemptStr(this._interpolationConfig.start);
            this._cursor = start;
            return !isInterpolation;
        }
        return true;
    }
}
function isNotWhitespace(code) {
    return !chars.isWhitespace(code) || code === chars.$EOF;
}
function isNameEnd(code) {
    return chars.isWhitespace(code) || code === chars.$GT || code === chars.$LT ||
        code === chars.$SLASH || code === chars.$SQ || code === chars.$DQ || code === chars.$EQ ||
        code === chars.$EOF;
}
function isPrefixEnd(code) {
    return (code < chars.$a || chars.$z < code) && (code < chars.$A || chars.$Z < code) &&
        (code < chars.$0 || code > chars.$9);
}
function isDigitEntityEnd(code) {
    return code === chars.$SEMICOLON || code === chars.$EOF || !chars.isAsciiHexDigit(code);
}
function isNamedEntityEnd(code) {
    return code === chars.$SEMICOLON || code === chars.$EOF || !chars.isAsciiLetter(code);
}
function isExpansionCaseStart(peek) {
    return peek !== chars.$RBRACE;
}
function compareCharCodeCaseInsensitive(code1, code2) {
    return toUpperCaseCharCode(code1) === toUpperCaseCharCode(code2);
}
function toUpperCaseCharCode(code) {
    return code >= chars.$a && code <= chars.$z ? code - chars.$a + chars.$A : code;
}
function isBlockNameChar(code) {
    return chars.isAsciiLetter(code) || chars.isDigit(code) || code === chars.$_;
}
function isBlockParameterChar(code) {
    return code !== chars.$SEMICOLON && isNotWhitespace(code);
}
function mergeTextTokens(srcTokens) {
    const dstTokens = [];
    let lastDstToken = undefined;
    for (let i = 0; i < srcTokens.length; i++) {
        const token = srcTokens[i];
        if ((lastDstToken && lastDstToken.type === 5 /* TokenType.TEXT */ && token.type === 5 /* TokenType.TEXT */) ||
            (lastDstToken && lastDstToken.type === 16 /* TokenType.ATTR_VALUE_TEXT */ &&
                token.type === 16 /* TokenType.ATTR_VALUE_TEXT */)) {
            lastDstToken.parts[0] += token.parts[0];
            lastDstToken.sourceSpan.end = token.sourceSpan.end;
        }
        else {
            lastDstToken = token;
            dstTokens.push(lastDstToken);
        }
    }
    return dstTokens;
}
class PlainCharacterCursor {
    constructor(fileOrCursor, range) {
        if (fileOrCursor instanceof PlainCharacterCursor) {
            this.file = fileOrCursor.file;
            this.input = fileOrCursor.input;
            this.end = fileOrCursor.end;
            const state = fileOrCursor.state;
            // Note: avoid using `{...fileOrCursor.state}` here as that has a severe performance penalty.
            // In ES5 bundles the object spread operator is translated into the `__assign` helper, which
            // is not optimized by VMs as efficiently as a raw object literal. Since this constructor is
            // called in tight loops, this difference matters.
            this.state = {
                peek: state.peek,
                offset: state.offset,
                line: state.line,
                column: state.column,
            };
        }
        else {
            if (!range) {
                throw new Error('Programming error: the range argument must be provided with a file argument.');
            }
            this.file = fileOrCursor;
            this.input = fileOrCursor.content;
            this.end = range.endPos;
            this.state = {
                peek: -1,
                offset: range.startPos,
                line: range.startLine,
                column: range.startCol,
            };
        }
    }
    clone() {
        return new PlainCharacterCursor(this);
    }
    peek() {
        return this.state.peek;
    }
    charsLeft() {
        return this.end - this.state.offset;
    }
    diff(other) {
        return this.state.offset - other.state.offset;
    }
    advance() {
        this.advanceState(this.state);
    }
    init() {
        this.updatePeek(this.state);
    }
    getSpan(start, leadingTriviaCodePoints) {
        start = start || this;
        let fullStart = start;
        if (leadingTriviaCodePoints) {
            while (this.diff(start) > 0 && leadingTriviaCodePoints.indexOf(start.peek()) !== -1) {
                if (fullStart === start) {
                    start = start.clone();
                }
                start.advance();
            }
        }
        const startLocation = this.locationFromCursor(start);
        const endLocation = this.locationFromCursor(this);
        const fullStartLocation = fullStart !== start ? this.locationFromCursor(fullStart) : startLocation;
        return new ParseSourceSpan(startLocation, endLocation, fullStartLocation);
    }
    getChars(start) {
        return this.input.substring(start.state.offset, this.state.offset);
    }
    charAt(pos) {
        return this.input.charCodeAt(pos);
    }
    advanceState(state) {
        if (state.offset >= this.end) {
            this.state = state;
            throw new CursorError('Unexpected character "EOF"', this);
        }
        const currentChar = this.charAt(state.offset);
        if (currentChar === chars.$LF) {
            state.line++;
            state.column = 0;
        }
        else if (!chars.isNewLine(currentChar)) {
            state.column++;
        }
        state.offset++;
        this.updatePeek(state);
    }
    updatePeek(state) {
        state.peek = state.offset >= this.end ? chars.$EOF : this.charAt(state.offset);
    }
    locationFromCursor(cursor) {
        return new ParseLocation(cursor.file, cursor.state.offset, cursor.state.line, cursor.state.column);
    }
}
class EscapedCharacterCursor extends PlainCharacterCursor {
    constructor(fileOrCursor, range) {
        if (fileOrCursor instanceof EscapedCharacterCursor) {
            super(fileOrCursor);
            this.internalState = { ...fileOrCursor.internalState };
        }
        else {
            super(fileOrCursor, range);
            this.internalState = this.state;
        }
    }
    advance() {
        this.state = this.internalState;
        super.advance();
        this.processEscapeSequence();
    }
    init() {
        super.init();
        this.processEscapeSequence();
    }
    clone() {
        return new EscapedCharacterCursor(this);
    }
    getChars(start) {
        const cursor = start.clone();
        let chars = '';
        while (cursor.internalState.offset < this.internalState.offset) {
            chars += String.fromCodePoint(cursor.peek());
            cursor.advance();
        }
        return chars;
    }
    /**
     * Process the escape sequence that starts at the current position in the text.
     *
     * This method is called to ensure that `peek` has the unescaped value of escape sequences.
     */
    processEscapeSequence() {
        const peek = () => this.internalState.peek;
        if (peek() === chars.$BACKSLASH) {
            // We have hit an escape sequence so we need the internal state to become independent
            // of the external state.
            this.internalState = { ...this.state };
            // Move past the backslash
            this.advanceState(this.internalState);
            // First check for standard control char sequences
            if (peek() === chars.$n) {
                this.state.peek = chars.$LF;
            }
            else if (peek() === chars.$r) {
                this.state.peek = chars.$CR;
            }
            else if (peek() === chars.$v) {
                this.state.peek = chars.$VTAB;
            }
            else if (peek() === chars.$t) {
                this.state.peek = chars.$TAB;
            }
            else if (peek() === chars.$b) {
                this.state.peek = chars.$BSPACE;
            }
            else if (peek() === chars.$f) {
                this.state.peek = chars.$FF;
            }
            // Now consider more complex sequences
            else if (peek() === chars.$u) {
                // Unicode code-point sequence
                this.advanceState(this.internalState); // advance past the `u` char
                if (peek() === chars.$LBRACE) {
                    // Variable length Unicode, e.g. `\x{123}`
                    this.advanceState(this.internalState); // advance past the `{` char
                    // Advance past the variable number of hex digits until we hit a `}` char
                    const digitStart = this.clone();
                    let length = 0;
                    while (peek() !== chars.$RBRACE) {
                        this.advanceState(this.internalState);
                        length++;
                    }
                    this.state.peek = this.decodeHexDigits(digitStart, length);
                }
                else {
                    // Fixed length Unicode, e.g. `\u1234`
                    const digitStart = this.clone();
                    this.advanceState(this.internalState);
                    this.advanceState(this.internalState);
                    this.advanceState(this.internalState);
                    this.state.peek = this.decodeHexDigits(digitStart, 4);
                }
            }
            else if (peek() === chars.$x) {
                // Hex char code, e.g. `\x2F`
                this.advanceState(this.internalState); // advance past the `x` char
                const digitStart = this.clone();
                this.advanceState(this.internalState);
                this.state.peek = this.decodeHexDigits(digitStart, 2);
            }
            else if (chars.isOctalDigit(peek())) {
                // Octal char code, e.g. `\012`,
                let octal = '';
                let length = 0;
                let previous = this.clone();
                while (chars.isOctalDigit(peek()) && length < 3) {
                    previous = this.clone();
                    octal += String.fromCodePoint(peek());
                    this.advanceState(this.internalState);
                    length++;
                }
                this.state.peek = parseInt(octal, 8);
                // Backup one char
                this.internalState = previous.internalState;
            }
            else if (chars.isNewLine(this.internalState.peek)) {
                // Line continuation `\` followed by a new line
                this.advanceState(this.internalState); // advance over the newline
                this.state = this.internalState;
            }
            else {
                // If none of the `if` blocks were executed then we just have an escaped normal character.
                // In that case we just, effectively, skip the backslash from the character.
                this.state.peek = this.internalState.peek;
            }
        }
    }
    decodeHexDigits(start, length) {
        const hex = this.input.slice(start.internalState.offset, start.internalState.offset + length);
        const charCode = parseInt(hex, 16);
        if (!isNaN(charCode)) {
            return charCode;
        }
        else {
            start.state = start.internalState;
            throw new CursorError('Invalid hexadecimal escape sequence', start);
        }
    }
}
export class CursorError {
    constructor(msg, cursor) {
        this.msg = msg;
        this.cursor = cursor;
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGV4ZXIuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvbWxfcGFyc2VyL2xleGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxLQUFLLE1BQU0sVUFBVSxDQUFDO0FBQ2xDLE9BQU8sRUFBQyxVQUFVLEVBQUUsYUFBYSxFQUFFLGVBQWUsRUFBRSxlQUFlLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFFMUYsT0FBTyxFQUFDLDRCQUE0QixFQUFzQixNQUFNLFlBQVksQ0FBQztBQUM3RSxPQUFPLEVBQUMsY0FBYyxFQUFDLE1BQU0sWUFBWSxDQUFDO0FBQzFDLE9BQU8sRUFBQyxjQUFjLEVBQWdCLE1BQU0sUUFBUSxDQUFDO0FBR3JELE1BQU0sT0FBTyxVQUFXLFNBQVEsVUFBVTtJQUN4QyxZQUFZLFFBQWdCLEVBQVMsU0FBeUIsRUFBRSxJQUFxQjtRQUNuRixLQUFLLENBQUMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxDQUFDO1FBRGEsY0FBUyxHQUFULFNBQVMsQ0FBZ0I7SUFFOUQsQ0FBQztDQUNGO0FBRUQsTUFBTSxPQUFPLGNBQWM7SUFDekIsWUFDVyxNQUFlLEVBQVMsTUFBb0IsRUFDNUMsMkJBQW9DO1FBRHBDLFdBQU0sR0FBTixNQUFNLENBQVM7UUFBUyxXQUFNLEdBQU4sTUFBTSxDQUFjO1FBQzVDLGdDQUEyQixHQUEzQiwyQkFBMkIsQ0FBUztJQUFHLENBQUM7Q0FDcEQ7QUF5RUQsTUFBTSxVQUFVLFFBQVEsQ0FDcEIsTUFBYyxFQUFFLEdBQVcsRUFBRSxnQkFBb0QsRUFDakYsVUFBMkIsRUFBRTtJQUMvQixNQUFNLFNBQVMsR0FBRyxJQUFJLFVBQVUsQ0FBQyxJQUFJLGVBQWUsQ0FBQyxNQUFNLEVBQUUsR0FBRyxDQUFDLEVBQUUsZ0JBQWdCLEVBQUUsT0FBTyxDQUFDLENBQUM7SUFDOUYsU0FBUyxDQUFDLFFBQVEs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RSxLQUFLLENBQUMsYUFBYSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUMsQ0FBQztRQUM5RixNQUFNLFFBQVEsR0FBRyxRQUFRLENBQUMsR0FBRyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQ25DLElBQUksQ0FBQyxLQUFLLENBQUMsUUFBUSxDQUFDLEVBQUU7WUFDcEIsT0FBTyxRQUFRLENBQUM7U0FDakI7YUFBTTtZQUNMLEtBQUssQ0FBQyxLQUFLLEdBQUcsS0FBSyxDQUFDLGFBQWEsQ0FBQztZQUNsQyxNQUFNLElBQUksV0FBVyxDQUFDLHFDQUFxQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1NBQ3JFO0lBQ0gsQ0FBQztDQUNGO0FBRUQsTUFBTSxPQUFPLFdBQVc7SUFDdEIsWUFBbUIsR0FBVyxFQUFTLE1BQXVCO1FBQTNDLFFBQUcsR0FBSCxHQUFHLENBQVE7UUFBUyxXQUFNLEdBQU4sTUFBTSxDQUFpQjtJQUFHLENBQUM7Q0FDbkUiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgY2hhcnMgZnJvbSAnLi4vY2hhcnMnO1xuaW1wb3J0IHtQYXJzZUVycm9yLCBQYXJzZUxvY2F0aW9uLCBQYXJzZVNvdXJjZUZpbGUsIFBhcnNlU291cmNlU3Bhbn0gZnJvbSAnLi4vcGFyc2VfdXRpbCc7XG5cbmltcG9ydCB7REVGQVVMVF9JTlRFUlBPTEFUSU9OX0NPTkZJRywgSW50ZXJwb2xhdGlvbkNvbmZpZ30gZnJvbSAnLi9kZWZhdWx0cyc7XG5pbXBvcnQge05BTUVEX0VOVElUSUVTfSBmcm9tICcuL2VudGl0aWVzJztcbmltcG9ydCB7VGFnQ29udGVudFR5cGUsIFRhZ0RlZmluaXRpb259IGZyb20gJy4vdGFncyc7XG5pbXBvcnQge0luY29tcGxldGVUYWdPcGVuVG9rZW4sIFRhZ09wZW5TdGFydFRva2VuLCBUb2tlbiwgVG9rZW5UeXBlfSBmcm9tICcuL3Rva2Vucyc7XG5cbmV4cG9ydCBjbGFzcyBUb2tlbkVycm9yIGV4dGVuZHMgUGFyc2VFcnJvciB7XG4gIGNvbnN0cnVjdG9yKGVycm9yTXNnOiBzdHJpbmcsIHB1YmxpYyB0b2tlblR5cGU6IFRva2VuVHlwZXxudWxsLCBzcGFuOiBQYXJzZVNvdXJjZVNwYW4pIHtcbiAgICBzdXBlcihzcGFuLCBlcnJvck1zZyk7XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIFRva2VuaXplUmVzdWx0IHtcbiAgY29uc3RydWN0b3IoXG4gICAgICBwdWJsaWMgdG9rZW5zOiBUb2tlbltdLCBwdWJsaWMgZXJyb3JzOiBUb2tlbkVycm9yW10sXG4gICAgICBwdWJsaWMgbm9uTm9ybWFsaXplZEljdUV4cHJlc3Npb25zOiBUb2tlbltdKSB7fVxufVxuXG5leHBvcnQgaW50ZXJmYWNlIExleGVyUmFuZ2Uge1xuICBzdGFydFBvczogbnVtYmVyO1xuICBzdGFydExpbmU6IG51bWJlcjtcbiAgc3RhcnRDb2w6IG51bWJlcjtcbiAgZW5kUG9zOiBudW1iZXI7XG59XG5cbi8qKlxuICogT3B0aW9ucyB0aGF0IG1vZGlmeSBob3cgdGhlIHRleHQgaXMgdG9rZW5pemVkLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFRva2VuaXplT3B0aW9ucyB7XG4gIC8qKiBXaGV0aGVyIHRvIHRva2VuaXplIElDVSBtZXNzYWdlcyAoY29uc2lkZXJlZCBhcyB0ZXh0IG5vZGVzIHdoZW4gZmFsc2UpLiAqL1xuICB0b2tlbml6ZUV4cGFuc2lvbkZvcm1zPzogYm9vbGVhbjtcbiAgLyoqIEhvdyB0byB0b2tlbml6ZSBpbnRlcnBvbGF0aW9uIG1hcmtlcnMuICovXG4gIGludGVycG9sYXRpb25Db25maWc/OiBJbnRlcnBvbGF0aW9uQ29uZmlnO1xuICAvKipcbiAgICogVGhlIHN0YXJ0IGFuZCBlbmQgcG9pbnQgb2YgdGhlIHRleHQgdG8gcGFyc2Ugd2l0aGluIHRoZSBgc291cmNlYCBzdHJpbmcuXG4gICAqIFRoZSBlbnRpcmUgYHNvdXJjZWAgc3RyaW5nIGlzIHBhcnNlZCBpZiB0aGlzIGlzIG5vdCBwcm92aWRlZC5cbiAgICogKi9cbiAgcmFuZ2U/OiBMZXhlclJhbmdlO1xuICAvKipcbiAgICogSWYgdGhpcyB0ZXh0IGlzIHN0b3JlZCBpbiBhIEphdmFTY3JpcHQgc3RyaW5nLCB0aGVuIHdlIGhhdmUgdG8gZGVhbCB3aXRoIGVzY2FwZSBzZXF1ZW5jZXMuXG4gICAqXG4gICAqICoqRXhhbXBsZSAxOioqXG4gICAqXG4gICAqIGBgYFxuICAgKiBcImFiY1xcXCJkZWZcXG5naGlcIlxuICAgKiBgYGBcbiAgICpcbiAgICogLSBUaGUgYFxcXCJgIG11c3QgYmUgY29udmVydGVkIHRvIGBcImAuXG4gICAqIC0gVGhlIGBcXG5gIG11c3QgYmUgY29udmVydGVkIHRvIGEgbmV3IGxpbmUgY2hhcmFjdGVyIGluIGEgdG9rZW4sXG4gICAqICAgYnV0IGl0IHNob3VsZCBub3QgaW5jcmVtZW50IHRoZSBjdXJyZW50IGxpbmUgZm9yIHNvdXJjZSBtYXBwaW5nLlxuICAgKlxuICAgKiAqKkV4YW1wbGUgMjoqKlxuICAgKlxuICAgKiBgYGBcbiAgICogXCJhYmNcXFxuICAgKiAgZGVmXCJcbiAgICogYGBgXG4gICAqXG4gICAqIFRoZSBsaW5lIGNvbnRpbnVhdGlvbiAoYFxcYCBmb2xsb3dlZCBieSBhIG5ld2xpbmUpIHNob3VsZCBiZSByZW1vdmVkIGZyb20gYSB0b2tlblxuICAgKiBidXQgdGhlIG5ldyBsaW5lIHNob3VsZCBpbmNyZW1lbnQgdGhlIGN1cnJlbnQgbGluZSBmb3Igc291cmNlIG1hcHBpbmcuXG4gICAqL1xuICBlc2NhcGVkU3RyaW5nPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIElmIHRoaXMgdGV4dCBpcyBzdG9yZWQgaW4gYW4gZXh0ZXJuYWwgdGVtcGxhdGUgKGUuZy4gdmlhIGB0ZW1wbGF0ZVVybGApIHRoZW4gd2UgbmVlZCB0byBkZWNpZGVcbiAgICogd2hldGhlciBvciBub3QgdG8gbm9ybWFsaXplIHRoZSBsaW5lLWVuZGluZ3MgKGZyb20gYFxcclxcbmAgdG8gYFxcbmApIHdoZW4gcHJvY2Vzc2luZyBJQ1VcbiAgICogZXhwcmVzc2lvbnMuXG4gICAqXG4gICAqIElmIGB0cnVlYCB0aGVuIHdlIHdpbGwgbm9ybWFsaXplIElDVSBleHByZXNzaW9uIGxpbmUgZW5kaW5ncy5cbiAgICogVGhlIGRlZmF1bHQgaXMgYGZhbHNlYCwgYnV0IHRoaXMgd2lsbCBiZSBzd2l0Y2hlZCBpbiBhIGZ1dHVyZSBtYWpvciByZWxlYXNlLlxuICAgKi9cbiAgaTE4bk5vcm1hbGl6ZUxpbmVFbmRpbmdzSW5JQ1VzPzogYm9vbGVhbjtcbiAgLyoqXG4gICAqIEFuIGFycmF5IG9mIGNoYXJhY3RlcnMgdGhhdCBzaG91bGQgYmUgY29uc2lkZXJlZCBhcyBsZWFkaW5nIHRyaXZpYS5cbiAgICogTGVhZGluZyB0cml2aWEgYXJlIGNoYXJhY3RlcnMgdGhhdCBhcmUgbm90IGltcG9ydGFudCB0byB0aGUgZGV2ZWxvcGVyLCBhbmQgc28gc2hvdWxkIG5vdCBiZVxuICAgKiBpbmNsdWRlZCBpbiBzb3VyY2UtbWFwIHNlZ21lbnRzLiAgQSBjb21tb24gZXhhbXBsZSBpcyB3aGl0ZXNwYWNlLlxuICAgKi9cbiAgbGVhZGluZ1RyaXZpYUNoYXJzPzogc3RyaW5nW107XG4gIC8qKlxuICAgKiBJZiB0cnVlLCBkbyBub3QgY29udmVydCBDUkxGIHRvIExGLlxuICAgKi9cbiAgcHJlc2VydmVMaW5lRW5kaW5ncz86IGJvb2xlYW47XG5cbiAgLyoqXG4gICAqIFdoZXRoZXIgdG8gdG9rZW5pemUgQCBibG9jayBzeW50YXguIE90aGVyd2lzZSBjb25zaWRlcmVkIHRleHQsXG4gICAqIG9yIElDVSB0b2tlbnMgaWYgYHRva2VuaXplRXhwYW5zaW9uRm9ybXNgIGlzIGVuYWJsZWQuXG4gICAqL1xuICB0b2tlbml6ZUJsb2Nrcz86IGJvb2xlYW47XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b2tlbml6ZShcbiAgICBzb3VyY2U6IHN0cmluZywgdXJsOiBzdHJpbmcsIGdldFRhZ0RlZmluaXRpb246ICh0YWdOYW1lOiBzdHJpbmcpID0+IFRhZ0RlZmluaXRpb24sXG4gICAgb3B0aW9uczogVG9rZW5pemVPcHRpb25zID0ge30pOiBUb2tlbml6ZVJlc3VsdCB7XG4gIGNvbnN0IHRva2VuaXplciA9IG5ldyBfVG9rZW5pemVyKG5ldyBQYXJzZVNvdXJjZUZpbGUoc291cmNlLCB1cmwpLCBnZXRUYWdEZWZpbml0aW9uLCBvcHRpb25zKTtcbiAgdG9rZW5pemVyLnRva2VuaXplKCk7XG4gIHJldHVybiBuZXcgVG9rZW5pemVSZXN1bHQoXG4gICAgICBtZXJnZVRleHRUb2tlbnModG9rZW5pemVyLnRva2VucyksIHRva2VuaXplci5lcnJvcnMsIHRva2VuaXplci5ub25Ob3JtYWxpemVkSWN1RXhwcmVzc2lvbnMpO1xufVxuXG5jb25zdCBfQ1JfT1JfQ1JMRl9SRUdFWFAgPSAvXFxyXFxuPy9nO1xuXG5mdW5jdGlvbiBfdW5leHBlY3RlZENoYXJhY3RlckVycm9yTXNnKGNoYXJDb2RlOiBudW1iZXIpOiBzdHJpbmcge1xuICBjb25zdCBjaGFyID0gY2hhckNvZGUgPT09IGNoYXJzLiRFT0YgPyAnRU9GJyA6IFN0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpO1xuICByZXR1cm4gYFVuZXhwZWN0ZWQgY2hhcmFjdGVyIFwiJHtjaGFyfVwiYDtcbn1cblxuZnVuY3Rpb24gX3Vua25vd25FbnRpdHlFcnJvck1zZyhlbnRpdHlTcmM6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiBgVW5rbm93biBlbnRpdHkgXCIke2VudGl0eVNyY31cIiAtIHVzZSB0aGUgXCImIzxkZWNpbWFsPjtcIiBvciAgXCImI3g8aGV4PjtcIiBzeW50YXhgO1xufVxuXG5mdW5jdGlvbiBfdW5wYXJzYWJsZUVudGl0eUVycm9yTXNnKHR5cGU6IENoYXJhY3RlclJlZmVyZW5jZVR5cGUsIGVudGl0eVN0cjogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIGBVbmFibGUgdG8gcGFyc2UgZW50aXR5IFwiJHtlbnRpdHlTdHJ9XCIgLSAke1xuICAgICAgdHlwZX0gY2hhcmFjdGVyIHJlZmVyZW5jZSBlbnRpdGllcyBtdXN0IGVuZCB3aXRoIFwiO1wiYDtcbn1cblxuZW51bSBDaGFyYWN0ZXJSZWZlcmVuY2VUeXBlIHtcbiAgSEVYID0gJ2hleGFkZWNpbWFsJyxcbiAgREVDID0gJ2RlY2ltYWwnLFxufVxuXG5jbGFzcyBfQ29udHJvbEZsb3dFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHB1YmxpYyBlcnJvcjogVG9rZW5FcnJvcikge31cbn1cblxuLy8gU2VlIGh0dHBzOi8vd3d3LnczLm9yZy9UUi9odG1sNTEvc3ludGF4Lmh0bWwjd3JpdGluZy1odG1sLWRvY3VtZW50c1xuY2xhc3MgX1Rva2VuaXplciB7XG4gIHByaXZhdGUgX2N1cnNvcjogQ2hhcmFjdGVyQ3Vyc29yO1xuICBwcml2YXRlIF90b2tlbml6ZUljdTogYm9vbGVhbjtcbiAgcHJpdmF0ZSBfaW50ZXJwb2xhdGlvbkNvbmZpZzogSW50ZXJwb2xhdGlvbkNvbmZpZztcbiAgcHJpdmF0ZSBfbGVhZGluZ1RyaXZpYUNvZGVQb2ludHM6IG51bWJlcltdfHVuZGVmaW5lZDtcbiAgcHJpdmF0ZSBfY3VycmVudFRva2VuU3RhcnQ6IENoYXJhY3RlckN1cnNvcnxudWxsID0gbnVsbDtcbiAgcHJpdmF0ZSBfY3VycmVudFRva2VuVHlwZTogVG9rZW5UeXBlfG51bGwgPSBudWxsO1xuICBwcml2YXRlIF9leHBhbnNpb25DYXNlU3RhY2s6IFRva2VuVHlwZVtdID0gW107XG4gIHByaXZhdGUgX2luSW50ZXJwb2xhdGlvbjogYm9vbGVhbiA9IGZhbHNlO1xuICBwcml2YXRlIHJlYWRvbmx5IF9wcmVzZXJ2ZUxpbmVFbmRpbmdzOiBib29sZWFuO1xuICBwcml2YXRlIHJlYWRvbmx5IF9pMThuTm9ybWFsaXplTGluZUVuZGluZ3NJbklDVXM6IGJvb2xlYW47XG4gIHByaXZhdGUgcmVhZG9ubHkgX3Rva2VuaXplQmxvY2tzOiBib29sZWFuO1xuICB0b2tlbnM6IFRva2VuW10gPSBbXTtcbiAgZXJyb3JzOiBUb2tlbkVycm9yW10gPSBbXTtcbiAgbm9uTm9ybWFsaXplZEljdUV4cHJlc3Npb25zOiBUb2tlbltdID0gW107XG5cbiAgLyoqXG4gICAqIEBwYXJhbSBfZmlsZSBUaGUgaHRtbCBzb3VyY2UgZmlsZSBiZWluZyB0b2tlbml6ZWQuXG4gICAqIEBwYXJhbSBfZ2V0VGFnRGVmaW5pdGlvbiBBIGZ1bmN0aW9uIHRoYXQgd2lsbCByZXRyaWV2ZSBhIHRhZyBkZWZpbml0aW9uIGZvciBhIGdpdmVuIHRhZyBuYW1lLlxuICAgKiBAcGFyYW0gb3B0aW9ucyBDb25maWd1cmF0aW9uIG9mIHRoZSB0b2tlbml6YXRpb24uXG4gICAqL1xuICBjb25zdHJ1Y3RvcihcbiAgICAgIF9maWxlOiBQYXJzZVNvdXJjZUZpbGUsIHByaXZhdGUgX2dldFRhZ0RlZmluaXRpb246ICh0YWdOYW1lOiBzdHJpbmcpID0+IFRhZ0RlZmluaXRpb24sXG4gICAgICBvcHRpb25zOiBUb2tlbml6ZU9wdGlvbnMpIHtcbiAgICB0aGlzLl90b2tlbml6ZUljdSA9IG9wdGlvbnMudG9rZW5pemVFeHBhbnNpb25Gb3JtcyB8fCBmYWxzZTtcbiAgICB0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnID0gb3B0aW9ucy5pbnRlcnBvbGF0aW9uQ29uZmlnIHx8IERFRkFVTFRfSU5URVJQT0xBVElPTl9DT05GSUc7XG4gICAgdGhpcy5fbGVhZGluZ1RyaXZpYUNvZGVQb2ludHMgPVxuICAgICAgICBvcHRpb25zLmxlYWRpbmdUcml2aWFDaGFycyAmJiBvcHRpb25zLmxlYWRpbmdUcml2aWFDaGFycy5tYXAoYyA9PiBjLmNvZGVQb2ludEF0KDApIHx8IDApO1xuICAgIGNvbnN0IHJhbmdlID1cbiAgICAgICAgb3B0aW9ucy5yYW5nZSB8fCB7ZW5kUG9zOiBfZmlsZS5jb250ZW50Lmxlbmd0aCwgc3RhcnRQb3M6IDAsIHN0YXJ0TGluZTogMCwgc3RhcnRDb2w6IDB9O1xuICAgIHRoaXMuX2N1cnNvciA9IG9wdGlvbnMuZXNjYXBlZFN0cmluZyA/IG5ldyBFc2NhcGVkQ2hhcmFjdGVyQ3Vyc29yKF9maWxlLCByYW5nZSkgOlxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG5ldyBQbGFpbkNoYXJhY3RlckN1cnNvcihfZmlsZSwgcmFuZ2UpO1xuICAgIHRoaXMuX3ByZXNlcnZlTGluZUVuZGluZ3MgPSBvcHRpb25zLnByZXNlcnZlTGluZUVuZGluZ3MgfHwgZmFsc2U7XG4gICAgdGhpcy5faTE4bk5vcm1hbGl6ZUxpbmVFbmRpbmdzSW5JQ1VzID0gb3B0aW9ucy5pMThuTm9ybWFsaXplTGluZUVuZGluZ3NJbklDVXMgfHwgZmFsc2U7XG4gICAgdGhpcy5fdG9rZW5pemVCbG9ja3MgPSBvcHRpb25zLnRva2VuaXplQmxvY2tzID8/IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgIHRoaXMuX2N1cnNvci5pbml0KCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgdGhpcy5oYW5kbGVFcnJvcihlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9wcm9jZXNzQ2FycmlhZ2VSZXR1cm5zKGNvbnRlbnQ6IHN0cmluZyk6IHN0cmluZyB7XG4gICAgaWYgKHRoaXMuX3ByZXNlcnZlTGluZUVuZGluZ3MpIHtcbiAgICAgIHJldHVybiBjb250ZW50O1xuICAgIH1cbiAgICAvLyBodHRwczovL3d3dy53My5vcmcvVFIvaHRtbDUxL3N5bnRheC5odG1sI3ByZXByb2Nlc3NpbmctdGhlLWlucHV0LXN0cmVhbVxuICAgIC8vIEluIG9yZGVyIHRvIGtlZXAgdGhlIG9yaWdpbmFsIHBvc2l0aW9uIGluIHRoZSBzb3VyY2UsIHdlIGNhbiBub3RcbiAgICAvLyBwcmUtcHJvY2VzcyBpdC5cbiAgICAvLyBJbnN0ZWFkIENScyBhcmUgcHJvY2Vzc2VkIHJpZ2h0IGJlZm9yZSBpbnN0YW50aWF0aW5nIHRoZSB0b2tlbnMuXG4gICAgcmV0dXJuIGNvbnRlbnQucmVwbGFjZShfQ1JfT1JfQ1JMRl9SRUdFWFAsICdcXG4nKTtcbiAgfVxuXG4gIHRva2VuaXplKCk6IHZvaWQge1xuICAgIHdoaWxlICh0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kRU9GKSB7XG4gICAgICBjb25zdCBzdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgICAgdHJ5IHtcbiAgICAgICAgaWYgKHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kTFQpKSB7XG4gICAgICAgICAgaWYgKHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kQkFORykpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJExCUkFDS0VUKSkge1xuICAgICAgICAgICAgICB0aGlzLl9jb25zdW1lQ2RhdGEoc3RhcnQpO1xuICAgICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJE1JTlVTKSkge1xuICAgICAgICAgICAgICB0aGlzLl9jb25zdW1lQ29tbWVudChzdGFydCk7XG4gICAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgICB0aGlzLl9jb25zdW1lRG9jVHlwZShzdGFydCk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfSBlbHNlIGlmICh0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJFNMQVNIKSkge1xuICAgICAgICAgICAgdGhpcy5fY29uc3VtZVRhZ0Nsb3NlKHN0YXJ0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhpcy5fY29uc3VtZVRhZ09wZW4oc3RhcnQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmICh0aGlzLl90b2tlbml6ZUJsb2NrcyAmJiB0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJEFUKSkge1xuICAgICAgICAgIHRoaXMuX2NvbnN1bWVCbG9ja1N0YXJ0KHN0YXJ0KTtcbiAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgIHRoaXMuX3Rva2VuaXplQmxvY2tzICYmICF0aGlzLl9pbkludGVycG9sYXRpb24gJiYgIXRoaXMuX2lzSW5FeHBhbnNpb25DYXNlKCkgJiZcbiAgICAgICAgICAgICF0aGlzLl9pc0luRXhwYW5zaW9uRm9ybSgpICYmIHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kUkJSQUNFKSkge1xuICAgICAgICAgIHRoaXMuX2NvbnN1bWVCbG9ja0VuZChzdGFydCk7XG4gICAgICAgIH0gZWxzZSBpZiAoISh0aGlzLl90b2tlbml6ZUljdSAmJiB0aGlzLl90b2tlbml6ZUV4cGFuc2lvbkZvcm0oKSkpIHtcbiAgICAgICAgICAvLyBJbiAocG9zc2libHkgaW50ZXJwb2xhdGVkKSB0ZXh0IHRoZSBlbmQgb2YgdGhlIHRleHQgaXMgZ2l2ZW4gYnkgYGlzVGV4dEVuZCgpYCwgd2hpbGVcbiAgICAgICAgICAvLyB0aGUgcHJlbWF0dXJlIGVuZCBvZiBhbiBpbnRlcnBvbGF0aW9uIGlzIGdpdmVuIGJ5IHRoZSBzdGFydCBvZiBhIG5ldyBIVE1MIGVsZW1lbnQuXG4gICAgICAgICAgdGhpcy5fY29uc3VtZVdpdGhJbnRlcnBvbGF0aW9uKFxuICAgICAgICAgICAgICBUb2tlblR5cGUuVEVYVCwgVG9rZW5UeXBlLklOVEVSUE9MQVRJT04sICgpID0+IHRoaXMuX2lzVGV4dEVuZCgpLFxuICAgICAgICAgICAgICAoKSA9PiB0aGlzLl9pc1RhZ1N0YXJ0KCkpO1xuICAgICAgICB9XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRoaXMuaGFuZGxlRXJyb3IoZSk7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLkVPRik7XG4gICAgdGhpcy5fZW5kVG9rZW4oW10pO1xuICB9XG5cbiAgcHJpdmF0ZSBfZ2V0QmxvY2tOYW1lKCk6IHN0cmluZyB7XG4gICAgLy8gVGhpcyBhbGxvd3MgdXMgdG8gY2FwdHVyZSB1cCBzb21ldGhpbmcgbGlrZSBgQGVsc2UgaWZgLCBidXQgbm90IGBAIGlmYC5cbiAgICBsZXQgc3BhY2VzSW5OYW1lQWxsb3dlZCA9IGZhbHNlO1xuICAgIGNvbnN0IG5hbWVDdXJzb3IgPSB0aGlzLl9jdXJzb3IuY2xvbmUoKTtcblxuICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oY29kZSA9PiB7XG4gICAgICBpZiAoY2hhcnMuaXNXaGl0ZXNwYWNlKGNvZGUpKSB7XG4gICAgICAgIHJldHVybiAhc3BhY2VzSW5OYW1lQWxsb3dlZDtcbiAgICAgIH1cbiAgICAgIGlmIChpc0Jsb2NrTmFtZUNoYXIoY29kZSkpIHtcbiAgICAgICAgc3BhY2VzSW5OYW1lQWxsb3dlZCA9IHRydWU7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH0pO1xuICAgIHJldHVybiB0aGlzLl9jdXJzb3IuZ2V0Q2hhcnMobmFtZUN1cnNvcikudHJpbSgpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUJsb2NrU3RhcnQoc3RhcnQ6IENoYXJhY3RlckN1cnNvcikge1xuICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLkJMT0NLX09QRU5fU1RBUlQsIHN0YXJ0KTtcbiAgICBjb25zdCBzdGFydFRva2VuID0gdGhpcy5fZW5kVG9rZW4oW3RoaXMuX2dldEJsb2NrTmFtZSgpXSk7XG5cbiAgICBpZiAodGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJExQQVJFTikge1xuICAgICAgLy8gQWR2YW5jZSBwYXN0IHRoZSBvcGVuaW5nIHBhcmVuLlxuICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgIC8vIENhcHR1cmUgdGhlIHBhcmFtZXRlcnMuXG4gICAgICB0aGlzLl9jb25zdW1lQmxvY2tQYXJhbWV0ZXJzKCk7XG4gICAgICAvLyBBbGxvdyBzcGFjZXMgYmVmb3JlIHRoZSBjbG9zaW5nIHBhcmVuLlxuICAgICAgdGhpcy5fYXR0ZW1wdENoYXJDb2RlVW50aWxGbihpc05vdFdoaXRlc3BhY2UpO1xuXG4gICAgICBpZiAodGhpcy5fYXR0ZW1wdENoYXJDb2RlKGNoYXJzLiRSUEFSRU4pKSB7XG4gICAgICAgIC8vIEFsbG93IHNwYWNlcyBhZnRlciB0aGUgcGFyZW4uXG4gICAgICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNOb3RXaGl0ZXNwYWNlKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHN0YXJ0VG9rZW4udHlwZSA9IFRva2VuVHlwZS5JTkNPTVBMRVRFX0JMT0NLX09QRU47XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAodGhpcy5fYXR0ZW1wdENoYXJDb2RlKGNoYXJzLiRMQlJBQ0UpKSB7XG4gICAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5CTE9DS19PUEVOX0VORCk7XG4gICAgICB0aGlzLl9lbmRUb2tlbihbXSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHN0YXJ0VG9rZW4udHlwZSA9IFRva2VuVHlwZS5JTkNPTVBMRVRFX0JMT0NLX09QRU47XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUJsb2NrRW5kKHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5CTE9DS19DTE9TRSwgc3RhcnQpO1xuICAgIHRoaXMuX2VuZFRva2VuKFtdKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVCbG9ja1BhcmFtZXRlcnMoKSB7XG4gICAgLy8gVHJpbSB0aGUgd2hpdGVzcGFjZSB1bnRpbCB0aGUgZmlyc3QgcGFyYW1ldGVyLlxuICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNCbG9ja1BhcmFtZXRlckNoYXIpO1xuXG4gICAgd2hpbGUgKHRoaXMuX2N1cnNvci5wZWVrKCkgIT09IGNoYXJzLiRSUEFSRU4gJiYgdGhpcy5fY3Vyc29yLnBlZWsoKSAhPT0gY2hhcnMuJEVPRikge1xuICAgICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuQkxPQ0tfUEFSQU1FVEVSKTtcbiAgICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5fY3Vyc29yLmNsb25lKCk7XG4gICAgICBsZXQgaW5RdW90ZTogbnVtYmVyfG51bGwgPSBudWxsO1xuICAgICAgbGV0IG9wZW5QYXJlbnMgPSAwO1xuXG4gICAgICAvLyBDb25zdW1lIHRoZSBwYXJhbWV0ZXIgdW50aWwgdGhlIG5leHQgc2VtaWNvbG9uIG9yIGJyYWNlLlxuICAgICAgLy8gTm90ZSB0aGF0IHdlIHNraXAgb3ZlciBzZW1pY29sb25zL2JyYWNlcyBpbnNpZGUgb2Ygc3RyaW5ncy5cbiAgICAgIHdoaWxlICgodGhpcy5fY3Vyc29yLnBlZWsoKSAhPT0gY2hhcnMuJFNFTUlDT0xPTiAmJiB0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kRU9GKSB8fFxuICAgICAgICAgICAgIGluUXVvdGUgIT09IG51bGwpIHtcbiAgICAgICAgY29uc3QgY2hhciA9IHRoaXMuX2N1cnNvci5wZWVrKCk7XG5cbiAgICAgICAgLy8gU2tpcCB0byB0aGUgbmV4dCBjaGFyYWN0ZXIgaWYgaXQgd2FzIGVzY2FwZWQuXG4gICAgICAgIGlmIChjaGFyID09PSBjaGFycy4kQkFDS1NMQVNIKSB7XG4gICAgICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgICAgfSBlbHNlIGlmIChjaGFyID09PSBpblF1b3RlKSB7XG4gICAgICAgICAgaW5RdW90ZSA9IG51bGw7XG4gICAgICAgIH0gZWxzZSBpZiAoaW5RdW90ZSA9PT0gbnVsbCAmJiBjaGFycy5pc1F1b3RlKGNoYXIpKSB7XG4gICAgICAgICAgaW5RdW90ZSA9IGNoYXI7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gY2hhcnMuJExQQVJFTiAmJiBpblF1b3RlID09PSBudWxsKSB7XG4gICAgICAgICAgb3BlblBhcmVucysrO1xuICAgICAgICB9IGVsc2UgaWYgKGNoYXIgPT09IGNoYXJzLiRSUEFSRU4gJiYgaW5RdW90ZSA9PT0gbnVsbCkge1xuICAgICAgICAgIGlmIChvcGVuUGFyZW5zID09PSAwKSB7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9IGVsc2UgaWYgKG9wZW5QYXJlbnMgPiAwKSB7XG4gICAgICAgICAgICBvcGVuUGFyZW5zLS07XG4gICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgIH1cblxuICAgICAgdGhpcy5fZW5kVG9rZW4oW3RoaXMuX2N1cnNvci5nZXRDaGFycyhzdGFydCldKTtcblxuICAgICAgLy8gU2tpcCB0byB0aGUgbmV4dCBwYXJhbWV0ZXIuXG4gICAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzQmxvY2tQYXJhbWV0ZXJDaGFyKTtcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogQHJldHVybnMgd2hldGhlciBhbiBJQ1UgdG9rZW4gaGFzIGJlZW4gY3JlYXRlZFxuICAgKiBAaW50ZXJuYWxcbiAgICovXG4gIHByaXZhdGUgX3Rva2VuaXplRXhwYW5zaW9uRm9ybSgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5pc0V4cGFuc2lvbkZvcm1TdGFydCgpKSB7XG4gICAgICB0aGlzLl9jb25zdW1lRXhwYW5zaW9uRm9ybVN0YXJ0KCk7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICBpZiAoaXNFeHBhbnNpb25DYXNlU3RhcnQodGhpcy5fY3Vyc29yLnBlZWsoKSkgJiYgdGhpcy5faXNJbkV4cGFuc2lvbkZvcm0oKSkge1xuICAgICAgdGhpcy5fY29uc3VtZUV4cGFuc2lvbkNhc2VTdGFydCgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IGNoYXJzLiRSQlJBQ0UpIHtcbiAgICAgIGlmICh0aGlzLl9pc0luRXhwYW5zaW9uQ2FzZSgpKSB7XG4gICAgICAgIHRoaXMuX2NvbnN1bWVFeHBhbnNpb25DYXNlRW5kKCk7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5faXNJbkV4cGFuc2lvbkZvcm0oKSkge1xuICAgICAgICB0aGlzLl9jb25zdW1lRXhwYW5zaW9uRm9ybUVuZCgpO1xuICAgICAgICByZXR1cm4gdHJ1ZTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIF9iZWdpblRva2VuKHR5cGU6IFRva2VuVHlwZSwgc3RhcnQgPSB0aGlzLl9jdXJzb3IuY2xvbmUoKSkge1xuICAgIHRoaXMuX2N1cnJlbnRUb2tlblN0YXJ0ID0gc3RhcnQ7XG4gICAgdGhpcy5fY3VycmVudFRva2VuVHlwZSA9IHR5cGU7XG4gIH1cblxuICBwcml2YXRlIF9lbmRUb2tlbihwYXJ0czogc3RyaW5nW10sIGVuZD86IENoYXJhY3RlckN1cnNvcik6IFRva2VuIHtcbiAgICBpZiAodGhpcy5fY3VycmVudFRva2VuU3RhcnQgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBUb2tlbkVycm9yKFxuICAgICAgICAgICdQcm9ncmFtbWluZyBlcnJvciAtIGF0dGVtcHRlZCB0byBlbmQgYSB0b2tlbiB3aGVuIHRoZXJlIHdhcyBubyBzdGFydCB0byB0aGUgdG9rZW4nLFxuICAgICAgICAgIHRoaXMuX2N1cnJlbnRUb2tlblR5cGUsIHRoaXMuX2N1cnNvci5nZXRTcGFuKGVuZCkpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fY3VycmVudFRva2VuVHlwZSA9PT0gbnVsbCkge1xuICAgICAgdGhyb3cgbmV3IFRva2VuRXJyb3IoXG4gICAgICAgICAgJ1Byb2dyYW1taW5nIGVycm9yIC0gYXR0ZW1wdGVkIHRvIGVuZCBhIHRva2VuIHdoaWNoIGhhcyBubyB0b2tlbiB0eXBlJywgbnVsbCxcbiAgICAgICAgICB0aGlzLl9jdXJzb3IuZ2V0U3Bhbih0aGlzLl9jdXJyZW50VG9rZW5TdGFydCkpO1xuICAgIH1cbiAgICBjb25zdCB0b2tlbiA9IHtcbiAgICAgIHR5cGU6IHRoaXMuX2N1cnJlbnRUb2tlblR5cGUsXG4gICAgICBwYXJ0cyxcbiAgICAgIHNvdXJjZVNwYW46XG4gICAgICAgICAgKGVuZCA/PyB0aGlzLl9jdXJzb3IpLmdldFNwYW4odGhpcy5fY3VycmVudFRva2VuU3RhcnQsIHRoaXMuX2xlYWRpbmdUcml2aWFDb2RlUG9pbnRzKSxcbiAgICB9IGFzIFRva2VuO1xuICAgIHRoaXMudG9rZW5zLnB1c2godG9rZW4pO1xuICAgIHRoaXMuX2N1cnJlbnRUb2tlblN0YXJ0ID0gbnVsbDtcbiAgICB0aGlzLl9jdXJyZW50VG9rZW5UeXBlID0gbnVsbDtcbiAgICByZXR1cm4gdG9rZW47XG4gIH1cblxuICBwcml2YXRlIF9jcmVhdGVFcnJvcihtc2c6IHN0cmluZywgc3BhbjogUGFyc2VTb3VyY2VTcGFuKTogX0NvbnRyb2xGbG93RXJyb3Ige1xuICAgIGlmICh0aGlzLl9pc0luRXhwYW5zaW9uRm9ybSgpKSB7XG4gICAgICBtc2cgKz0gYCAoRG8geW91IGhhdmUgYW4gdW5lc2NhcGVkIFwie1wiIGluIHlvdXIgdGVtcGxhdGU/IFVzZSBcInt7ICd7JyB9fVwiKSB0byBlc2NhcGUgaXQuKWA7XG4gICAgfVxuICAgIGNvbnN0IGVycm9yID0gbmV3IFRva2VuRXJyb3IobXNnLCB0aGlzLl9jdXJyZW50VG9rZW5UeXBlLCBzcGFuKTtcbiAgICB0aGlzLl9jdXJyZW50VG9rZW5TdGFydCA9IG51bGw7XG4gICAgdGhpcy5fY3VycmVudFRva2VuVHlwZSA9IG51bGw7XG4gICAgcmV0dXJuIG5ldyBfQ29udHJvbEZsb3dFcnJvcihlcnJvcik7XG4gIH1cblxuICBwcml2YXRlIGhhbmRsZUVycm9yKGU6IGFueSkge1xuICAgIGlmIChlIGluc3RhbmNlb2YgQ3Vyc29yRXJyb3IpIHtcbiAgICAgIGUgPSB0aGlzLl9jcmVhdGVFcnJvcihlLm1zZywgdGhpcy5fY3Vyc29yLmdldFNwYW4oZS5jdXJzb3IpKTtcbiAgICB9XG4gICAgaWYgKGUgaW5zdGFuY2VvZiBfQ29udHJvbEZsb3dFcnJvcikge1xuICAgICAgdGhpcy5lcnJvcnMucHVzaChlLmVycm9yKTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgZTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9hdHRlbXB0Q2hhckNvZGUoY2hhckNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLl9jdXJzb3IucGVlaygpID09PSBjaGFyQ29kZSkge1xuICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIF9hdHRlbXB0Q2hhckNvZGVDYXNlSW5zZW5zaXRpdmUoY2hhckNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuICAgIGlmIChjb21wYXJlQ2hhckNvZGVDYXNlSW5zZW5zaXRpdmUodGhpcy5fY3Vyc29yLnBlZWsoKSwgY2hhckNvZGUpKSB7XG4gICAgICB0aGlzLl9jdXJzb3IuYWR2YW5jZSgpO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHByaXZhdGUgX3JlcXVpcmVDaGFyQ29kZShjaGFyQ29kZTogbnVtYmVyKSB7XG4gICAgY29uc3QgbG9jYXRpb24gPSB0aGlzLl9jdXJzb3IuY2xvbmUoKTtcbiAgICBpZiAoIXRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFyQ29kZSkpIHtcbiAgICAgIHRocm93IHRoaXMuX2NyZWF0ZUVycm9yKFxuICAgICAgICAgIF91bmV4cGVjdGVkQ2hhcmFjdGVyRXJyb3JNc2codGhpcy5fY3Vyc29yLnBlZWsoKSksIHRoaXMuX2N1cnNvci5nZXRTcGFuKGxvY2F0aW9uKSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfYXR0ZW1wdFN0cihjaGFyczogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgY29uc3QgbGVuID0gY2hhcnMubGVuZ3RoO1xuICAgIGlmICh0aGlzLl9jdXJzb3IuY2hhcnNMZWZ0KCkgPCBsZW4pIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gICAgY29uc3QgaW5pdGlhbFBvc2l0aW9uID0gdGhpcy5fY3Vyc29yLmNsb25lKCk7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgaWYgKCF0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuY2hhckNvZGVBdChpKSkpIHtcbiAgICAgICAgLy8gSWYgYXR0ZW1wdGluZyB0byBwYXJzZSB0aGUgc3RyaW5nIGZhaWxzLCB3ZSB3YW50IHRvIHJlc2V0IHRoZSBwYXJzZXJcbiAgICAgICAgLy8gdG8gd2hlcmUgaXQgd2FzIGJlZm9yZSB0aGUgYXR0ZW1wdFxuICAgICAgICB0aGlzLl9jdXJzb3IgPSBpbml0aWFsUG9zaXRpb247XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHRydWU7XG4gIH1cblxuICBwcml2YXRlIF9hdHRlbXB0U3RyQ2FzZUluc2Vuc2l0aXZlKGNoYXJzOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBmb3IgKGxldCBpID0gMDsgaSA8IGNoYXJzLmxlbmd0aDsgaSsrKSB7XG4gICAgICBpZiAoIXRoaXMuX2F0dGVtcHRDaGFyQ29kZUNhc2VJbnNlbnNpdGl2ZShjaGFycy5jaGFyQ29kZUF0KGkpKSkge1xuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG5cbiAgcHJpdmF0ZSBfcmVxdWlyZVN0cihjaGFyczogc3RyaW5nKSB7XG4gICAgY29uc3QgbG9jYXRpb24gPSB0aGlzLl9jdXJzb3IuY2xvbmUoKTtcbiAgICBpZiAoIXRoaXMuX2F0dGVtcHRTdHIoY2hhcnMpKSB7XG4gICAgICB0aHJvdyB0aGlzLl9jcmVhdGVFcnJvcihcbiAgICAgICAgICBfdW5leHBlY3RlZENoYXJhY3RlckVycm9yTXNnKHRoaXMuX2N1cnNvci5wZWVrKCkpLCB0aGlzLl9jdXJzb3IuZ2V0U3Bhbihsb2NhdGlvbikpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4ocHJlZGljYXRlOiAoY29kZTogbnVtYmVyKSA9PiBib29sZWFuKSB7XG4gICAgd2hpbGUgKCFwcmVkaWNhdGUodGhpcy5fY3Vyc29yLnBlZWsoKSkpIHtcbiAgICAgIHRoaXMuX2N1cnNvci5hZHZhbmNlKCk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfcmVxdWlyZUNoYXJDb2RlVW50aWxGbihwcmVkaWNhdGU6IChjb2RlOiBudW1iZXIpID0+IGJvb2xlYW4sIGxlbjogbnVtYmVyKSB7XG4gICAgY29uc3Qgc3RhcnQgPSB0aGlzLl9jdXJzb3IuY2xvbmUoKTtcbiAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKHByZWRpY2F0ZSk7XG4gICAgaWYgKHRoaXMuX2N1cnNvci5kaWZmKHN0YXJ0KSA8IGxlbikge1xuICAgICAgdGhyb3cgdGhpcy5fY3JlYXRlRXJyb3IoXG4gICAgICAgICAgX3VuZXhwZWN0ZWRDaGFyYWN0ZXJFcnJvck1zZyh0aGlzLl9jdXJzb3IucGVlaygpKSwgdGhpcy5fY3Vyc29yLmdldFNwYW4oc3RhcnQpKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9hdHRlbXB0VW50aWxDaGFyKGNoYXI6IG51bWJlcikge1xuICAgIHdoaWxlICh0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFyKSB7XG4gICAgICB0aGlzLl9jdXJzb3IuYWR2YW5jZSgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX3JlYWRDaGFyKCk6IHN0cmluZyB7XG4gICAgLy8gRG9uJ3QgcmVseSB1cG9uIHJlYWRpbmcgZGlyZWN0bHkgZnJvbSBgX2lucHV0YCBhcyB0aGUgYWN0dWFsIGNoYXIgdmFsdWVcbiAgICAvLyBtYXkgaGF2ZSBiZWVuIGdlbmVyYXRlZCBmcm9tIGFuIGVzY2FwZSBzZXF1ZW5jZS5cbiAgICBjb25zdCBjaGFyID0gU3RyaW5nLmZyb21Db2RlUG9pbnQodGhpcy5fY3Vyc29yLnBlZWsoKSk7XG4gICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICByZXR1cm4gY2hhcjtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVFbnRpdHkodGV4dFRva2VuVHlwZTogVG9rZW5UeXBlKTogdm9pZCB7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuRU5DT0RFRF9FTlRJVFkpO1xuICAgIGNvbnN0IHN0YXJ0ID0gdGhpcy5fY3Vyc29yLmNsb25lKCk7XG4gICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICBpZiAodGhpcy5fYXR0ZW1wdENoYXJDb2RlKGNoYXJzLiRIQVNIKSkge1xuICAgICAgY29uc3QgaXNIZXggPSB0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJHgpIHx8IHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kWCk7XG4gICAgICBjb25zdCBjb2RlU3RhcnQgPSB0aGlzLl9jdXJzb3IuY2xvbmUoKTtcbiAgICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNEaWdpdEVudGl0eUVuZCk7XG4gICAgICBpZiAodGhpcy5fY3Vyc29yLnBlZWsoKSAhPSBjaGFycy4kU0VNSUNPTE9OKSB7XG4gICAgICAgIC8vIEFkdmFuY2UgY3Vyc29yIHRvIGluY2x1ZGUgdGhlIHBlZWtlZCBjaGFyYWN0ZXIgaW4gdGhlIHN0cmluZyBwcm92aWRlZCB0byB0aGUgZXJyb3JcbiAgICAgICAgLy8gbWVzc2FnZS5cbiAgICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgICAgY29uc3QgZW50aXR5VHlwZSA9IGlzSGV4ID8gQ2hhcmFjdGVyUmVmZXJlbmNlVHlwZS5IRVggOiBDaGFyYWN0ZXJSZWZlcmVuY2VUeXBlLkRFQztcbiAgICAgICAgdGhyb3cgdGhpcy5fY3JlYXRlRXJyb3IoXG4gICAgICAgICAgICBfdW5wYXJzYWJsZUVudGl0eUVycm9yTXNnKGVudGl0eVR5cGUsIHRoaXMuX2N1cnNvci5nZXRDaGFycyhzdGFydCkpLFxuICAgICAgICAgICAgdGhpcy5fY3Vyc29yLmdldFNwYW4oKSk7XG4gICAgICB9XG4gICAgICBjb25zdCBzdHJOdW0gPSB0aGlzLl9jdXJzb3IuZ2V0Q2hhcnMoY29kZVN0YXJ0KTtcbiAgICAgIHRoaXMuX2N1cnNvci5hZHZhbmNlKCk7XG4gICAgICB0cnkge1xuICAgICAgICBjb25zdCBjaGFyQ29kZSA9IHBhcnNlSW50KHN0ck51bSwgaXNIZXggPyAxNiA6IDEwKTtcbiAgICAgICAgdGhpcy5fZW5kVG9rZW4oW1N0cmluZy5mcm9tQ2hhckNvZGUoY2hhckNvZGUpLCB0aGlzLl9jdXJzb3IuZ2V0Q2hhcnMoc3RhcnQpXSk7XG4gICAgICB9IGNhdGNoIHtcbiAgICAgICAgdGhyb3cgdGhpcy5fY3JlYXRlRXJyb3IoXG4gICAgICAgICAgICBfdW5rbm93bkVudGl0eUVycm9yTXNnKHRoaXMuX2N1cnNvci5nZXRDaGFycyhzdGFydCkpLCB0aGlzLl9jdXJzb3IuZ2V0U3BhbigpKTtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgY29uc3QgbmFtZVN0YXJ0ID0gdGhpcy5fY3Vyc29yLmNsb25lKCk7XG4gICAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTmFtZWRFbnRpdHlFbmQpO1xuICAgICAgaWYgKHRoaXMuX2N1cnNvci5wZWVrKCkgIT0gY2hhcnMuJFNFTUlDT0xPTikge1xuICAgICAgICAvLyBObyBzZW1pY29sb24gd2FzIGZvdW5kIHNvIGFib3J0IHRoZSBlbmNvZGVkIGVudGl0eSB0b2tlbiB0aGF0IHdhcyBpbiBwcm9ncmVzcywgYW5kIHRyZWF0XG4gICAgICAgIC8vIHRoaXMgYXMgYSB0ZXh0IHRva2VuXG4gICAgICAgIHRoaXMuX2JlZ2luVG9rZW4odGV4dFRva2VuVHlwZSwgc3RhcnQpO1xuICAgICAgICB0aGlzLl9jdXJzb3IgPSBuYW1lU3RhcnQ7XG4gICAgICAgIHRoaXMuX2VuZFRva2VuKFsnJiddKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSB0aGlzLl9jdXJzb3IuZ2V0Q2hhcnMobmFtZVN0YXJ0KTtcbiAgICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgICAgY29uc3QgY2hhciA9IE5BTUVEX0VOVElUSUVTW25hbWVdO1xuICAgICAgICBpZiAoIWNoYXIpIHtcbiAgICAgICAgICB0aHJvdyB0aGlzLl9jcmVhdGVFcnJvcihfdW5rbm93bkVudGl0eUVycm9yTXNnKG5hbWUpLCB0aGlzLl9jdXJzb3IuZ2V0U3BhbihzdGFydCkpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2VuZFRva2VuKFtjaGFyLCBgJiR7bmFtZX07YF0pO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVSYXdUZXh0KGNvbnN1bWVFbnRpdGllczogYm9vbGVhbiwgZW5kTWFya2VyUHJlZGljYXRlOiAoKSA9PiBib29sZWFuKTogdm9pZCB7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihjb25zdW1lRW50aXRpZXMgPyBUb2tlblR5cGUuRVNDQVBBQkxFX1JBV19URVhUIDogVG9rZW5UeXBlLlJBV19URVhUKTtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICB3aGlsZSAodHJ1ZSkge1xuICAgICAgY29uc3QgdGFnQ2xvc2VTdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgICAgY29uc3QgZm91bmRFbmRNYXJrZXIgPSBlbmRNYXJrZXJQcmVkaWNhdGUoKTtcbiAgICAgIHRoaXMuX2N1cnNvciA9IHRhZ0Nsb3NlU3RhcnQ7XG4gICAgICBpZiAoZm91bmRFbmRNYXJrZXIpIHtcbiAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgICBpZiAoY29uc3VtZUVudGl0aWVzICYmIHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IGNoYXJzLiRBTVBFUlNBTkQpIHtcbiAgICAgICAgdGhpcy5fZW5kVG9rZW4oW3RoaXMuX3Byb2Nlc3NDYXJyaWFnZVJldHVybnMocGFydHMuam9pbignJykpXSk7XG4gICAgICAgIHBhcnRzLmxlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuX2NvbnN1bWVFbnRpdHkoVG9rZW5UeXBlLkVTQ0FQQUJMRV9SQVdfVEVYVCk7XG4gICAgICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLkVTQ0FQQUJMRV9SQVdfVEVYVCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJ0cy5wdXNoKHRoaXMuX3JlYWRDaGFyKCkpO1xuICAgICAgfVxuICAgIH1cbiAgICB0aGlzLl9lbmRUb2tlbihbdGhpcy5fcHJvY2Vzc0NhcnJpYWdlUmV0dXJucyhwYXJ0cy5qb2luKCcnKSldKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVDb21tZW50KHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5DT01NRU5UX1NUQVJULCBzdGFydCk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlKGNoYXJzLiRNSU5VUyk7XG4gICAgdGhpcy5fZW5kVG9rZW4oW10pO1xuICAgIHRoaXMuX2NvbnN1bWVSYXdUZXh0KGZhbHNlLCAoKSA9PiB0aGlzLl9hdHRlbXB0U3RyKCctLT4nKSk7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuQ09NTUVOVF9FTkQpO1xuICAgIHRoaXMuX3JlcXVpcmVTdHIoJy0tPicpO1xuICAgIHRoaXMuX2VuZFRva2VuKFtdKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVDZGF0YShzdGFydDogQ2hhcmFjdGVyQ3Vyc29yKSB7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuQ0RBVEFfU1RBUlQsIHN0YXJ0KTtcbiAgICB0aGlzLl9yZXF1aXJlU3RyKCdDREFUQVsnKTtcbiAgICB0aGlzLl9lbmRUb2tlbihbXSk7XG4gICAgdGhpcy5fY29uc3VtZVJhd1RleHQoZmFsc2UsICgpID0+IHRoaXMuX2F0dGVtcHRTdHIoJ11dPicpKTtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5DREFUQV9FTkQpO1xuICAgIHRoaXMuX3JlcXVpcmVTdHIoJ11dPicpO1xuICAgIHRoaXMuX2VuZFRva2VuKFtdKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVEb2NUeXBlKHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5ET0NfVFlQRSwgc3RhcnQpO1xuICAgIGNvbnN0IGNvbnRlbnRTdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgIHRoaXMuX2F0dGVtcHRVbnRpbENoYXIoY2hhcnMuJEdUKTtcbiAgICBjb25zdCBjb250ZW50ID0gdGhpcy5fY3Vyc29yLmdldENoYXJzKGNvbnRlbnRTdGFydCk7XG4gICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICB0aGlzLl9lbmRUb2tlbihbY29udGVudF0pO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZVByZWZpeEFuZE5hbWUoKTogc3RyaW5nW10ge1xuICAgIGNvbnN0IG5hbWVPclByZWZpeFN0YXJ0ID0gdGhpcy5fY3Vyc29yLmNsb25lKCk7XG4gICAgbGV0IHByZWZpeDogc3RyaW5nID0gJyc7XG4gICAgd2hpbGUgKHRoaXMuX2N1cnNvci5wZWVrKCkgIT09IGNoYXJzLiRDT0xPTiAmJiAhaXNQcmVmaXhFbmQodGhpcy5fY3Vyc29yLnBlZWsoKSkpIHtcbiAgICAgIHRoaXMuX2N1cnNvci5hZHZhbmNlKCk7XG4gICAgfVxuICAgIGxldCBuYW1lU3RhcnQ6IENoYXJhY3RlckN1cnNvcjtcbiAgICBpZiAodGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJENPTE9OKSB7XG4gICAgICBwcmVmaXggPSB0aGlzLl9jdXJzb3IuZ2V0Q2hhcnMobmFtZU9yUHJlZml4U3RhcnQpO1xuICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgIG5hbWVTdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuYW1lU3RhcnQgPSBuYW1lT3JQcmVmaXhTdGFydDtcbiAgICB9XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlVW50aWxGbihpc05hbWVFbmQsIHByZWZpeCA9PT0gJycgPyAwIDogMSk7XG4gICAgY29uc3QgbmFtZSA9IHRoaXMuX2N1cnNvci5nZXRDaGFycyhuYW1lU3RhcnQpO1xuICAgIHJldHVybiBbcHJlZml4LCBuYW1lXTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVUYWdPcGVuKHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IpIHtcbiAgICBsZXQgdGFnTmFtZTogc3RyaW5nO1xuICAgIGxldCBwcmVmaXg6IHN0cmluZztcbiAgICBsZXQgb3BlblRhZ1Rva2VuOiBUYWdPcGVuU3RhcnRUb2tlbnxJbmNvbXBsZXRlVGFnT3BlblRva2VufHVuZGVmaW5lZDtcbiAgICB0cnkge1xuICAgICAgaWYgKCFjaGFycy5pc0FzY2lpTGV0dGVyKHRoaXMuX2N1cnNvci5wZWVrKCkpKSB7XG4gICAgICAgIHRocm93IHRoaXMuX2NyZWF0ZUVycm9yKFxuICAgICAgICAgICAgX3VuZXhwZWN0ZWRDaGFyYWN0ZXJFcnJvck1zZyh0aGlzLl9jdXJzb3IucGVlaygpKSwgdGhpcy5fY3Vyc29yLmdldFNwYW4oc3RhcnQpKTtcbiAgICAgIH1cblxuICAgICAgb3BlblRhZ1Rva2VuID0gdGhpcy5fY29uc3VtZVRhZ09wZW5TdGFydChzdGFydCk7XG4gICAgICBwcmVmaXggPSBvcGVuVGFnVG9rZW4ucGFydHNbMF07XG4gICAgICB0YWdOYW1lID0gb3BlblRhZ1Rva2VuLnBhcnRzWzFdO1xuICAgICAgdGhpcy5fYXR0ZW1wdENoYXJDb2RlVW50aWxGbihpc05vdFdoaXRlc3BhY2UpO1xuICAgICAgd2hpbGUgKHRoaXMuX2N1cnNvci5wZWVrKCkgIT09IGNoYXJzLiRTTEFTSCAmJiB0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kR1QgJiZcbiAgICAgICAgICAgICB0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kTFQgJiYgdGhpcy5fY3Vyc29yLnBlZWsoKSAhPT0gY2hhcnMuJEVPRikge1xuICAgICAgICB0aGlzLl9jb25zdW1lQXR0cmlidXRlTmFtZSgpO1xuICAgICAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTm90V2hpdGVzcGFjZSk7XG4gICAgICAgIGlmICh0aGlzLl9hdHRlbXB0Q2hhckNvZGUoY2hhcnMuJEVRKSkge1xuICAgICAgICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNOb3RXaGl0ZXNwYWNlKTtcbiAgICAgICAgICB0aGlzLl9jb25zdW1lQXR0cmlidXRlVmFsdWUoKTtcbiAgICAgICAgfVxuICAgICAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTm90V2hpdGVzcGFjZSk7XG4gICAgICB9XG4gICAgICB0aGlzLl9jb25zdW1lVGFnT3BlbkVuZCgpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmIChlIGluc3RhbmNlb2YgX0NvbnRyb2xGbG93RXJyb3IpIHtcbiAgICAgICAgaWYgKG9wZW5UYWdUb2tlbikge1xuICAgICAgICAgIC8vIFdlIGVycm9yZWQgYmVmb3JlIHdlIGNvdWxkIGNsb3NlIHRoZSBvcGVuaW5nIHRhZywgc28gaXQgaXMgaW5jb21wbGV0ZS5cbiAgICAgICAgICBvcGVuVGFnVG9rZW4udHlwZSA9IFRva2VuVHlwZS5JTkNPTVBMRVRFX1RBR19PUEVOO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIC8vIFdoZW4gdGhlIHN0YXJ0IHRhZyBpcyBpbnZhbGlkLCBhc3N1bWUgd2Ugd2FudCBhIFwiPFwiIGFzIHRleHQuXG4gICAgICAgICAgLy8gQmFjayB0byBiYWNrIHRleHQgdG9rZW5zIGFyZSBtZXJnZWQgYXQgdGhlIGVuZC5cbiAgICAgICAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5URVhULCBzdGFydCk7XG4gICAgICAgICAgdGhpcy5fZW5kVG9rZW4oWyc8J10pO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cblxuICAgICAgdGhyb3cgZTtcbiAgICB9XG5cbiAgICBjb25zdCBjb250ZW50VG9rZW5UeXBlID0gdGhpcy5fZ2V0VGFnRGVmaW5pdGlvbih0YWdOYW1lKS5nZXRDb250ZW50VHlwZShwcmVmaXgpO1xuXG4gICAgaWYgKGNvbnRlbnRUb2tlblR5cGUgPT09IFRhZ0NvbnRlbnRUeXBlLlJBV19URVhUKSB7XG4gICAgICB0aGlzLl9jb25zdW1lUmF3VGV4dFdpdGhUYWdDbG9zZShwcmVmaXgsIHRhZ05hbWUsIGZhbHNlKTtcbiAgICB9IGVsc2UgaWYgKGNvbnRlbnRUb2tlblR5cGUgPT09IFRhZ0NvbnRlbnRUeXBlLkVTQ0FQQUJMRV9SQVdfVEVYVCkge1xuICAgICAgdGhpcy5fY29uc3VtZVJhd1RleHRXaXRoVGFnQ2xvc2UocHJlZml4LCB0YWdOYW1lLCB0cnVlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIF9jb25zdW1lUmF3VGV4dFdpdGhUYWdDbG9zZShwcmVmaXg6IHN0cmluZywgdGFnTmFtZTogc3RyaW5nLCBjb25zdW1lRW50aXRpZXM6IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9jb25zdW1lUmF3VGV4dChjb25zdW1lRW50aXRpZXMsICgpID0+IHtcbiAgICAgIGlmICghdGhpcy5fYXR0ZW1wdENoYXJDb2RlKGNoYXJzLiRMVCkpIHJldHVybiBmYWxzZTtcbiAgICAgIGlmICghdGhpcy5fYXR0ZW1wdENoYXJDb2RlKGNoYXJzLiRTTEFTSCkpIHJldHVybiBmYWxzZTtcbiAgICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNOb3RXaGl0ZXNwYWNlKTtcbiAgICAgIGlmICghdGhpcy5fYXR0ZW1wdFN0ckNhc2VJbnNlbnNpdGl2ZSh0YWdOYW1lKSkgcmV0dXJuIGZhbHNlO1xuICAgICAgdGhpcy5fYXR0ZW1wdENoYXJDb2RlVW50aWxGbihpc05vdFdoaXRlc3BhY2UpO1xuICAgICAgcmV0dXJuIHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kR1QpO1xuICAgIH0pO1xuICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLlRBR19DTE9TRSk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlVW50aWxGbihjb2RlID0+IGNvZGUgPT09IGNoYXJzLiRHVCwgMyk7XG4gICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTsgIC8vIENvbnN1bWUgdGhlIGA+YFxuICAgIHRoaXMuX2VuZFRva2VuKFtwcmVmaXgsIHRhZ05hbWVdKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVUYWdPcGVuU3RhcnQoc3RhcnQ6IENoYXJhY3RlckN1cnNvcik6IFRhZ09wZW5TdGFydFRva2VuIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5UQUdfT1BFTl9TVEFSVCwgc3RhcnQpO1xuICAgIGNvbnN0IHBhcnRzID0gdGhpcy5fY29uc3VtZVByZWZpeEFuZE5hbWUoKTtcbiAgICByZXR1cm4gdGhpcy5fZW5kVG9rZW4ocGFydHMpIGFzIFRhZ09wZW5TdGFydFRva2VuO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUF0dHJpYnV0ZU5hbWUoKSB7XG4gICAgY29uc3QgYXR0ck5hbWVTdGFydCA9IHRoaXMuX2N1cnNvci5wZWVrKCk7XG4gICAgaWYgKGF0dHJOYW1lU3RhcnQgPT09IGNoYXJzLiRTUSB8fCBhdHRyTmFtZVN0YXJ0ID09PSBjaGFycy4kRFEpIHtcbiAgICAgIHRocm93IHRoaXMuX2NyZWF0ZUVycm9yKF91bmV4cGVjdGVkQ2hhcmFjdGVyRXJyb3JNc2coYXR0ck5hbWVTdGFydCksIHRoaXMuX2N1cnNvci5nZXRTcGFuKCkpO1xuICAgIH1cbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5BVFRSX05BTUUpO1xuICAgIGNvbnN0IHByZWZpeEFuZE5hbWUgPSB0aGlzLl9jb25zdW1lUHJlZml4QW5kTmFtZSgpO1xuICAgIHRoaXMuX2VuZFRva2VuKHByZWZpeEFuZE5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUF0dHJpYnV0ZVZhbHVlKCkge1xuICAgIGlmICh0aGlzLl9jdXJzb3IucGVlaygpID09PSBjaGFycy4kU1EgfHwgdGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJERRKSB7XG4gICAgICBjb25zdCBxdW90ZUNoYXIgPSB0aGlzLl9jdXJzb3IucGVlaygpO1xuICAgICAgdGhpcy5fY29uc3VtZVF1b3RlKHF1b3RlQ2hhcik7XG4gICAgICAvLyBJbiBhbiBhdHRyaWJ1dGUgdGhlbiBlbmQgb2YgdGhlIGF0dHJpYnV0ZSB2YWx1ZSBhbmQgdGhlIHByZW1hdHVyZSBlbmQgdG8gYW4gaW50ZXJwb2xhdGlvblxuICAgICAgLy8gYXJlIGJvdGggdHJpZ2dlcmVkIGJ5IHRoZSBgcXVvdGVDaGFyYC5cbiAgICAgIGNvbnN0IGVuZFByZWRpY2F0ZSA9ICgpID0+IHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IHF1b3RlQ2hhcjtcbiAgICAgIHRoaXMuX2NvbnN1bWVXaXRoSW50ZXJwb2xhdGlvbihcbiAgICAgICAgICBUb2tlblR5cGUuQVRUUl9WQUxVRV9URVhULCBUb2tlblR5cGUuQVRUUl9WQUxVRV9JTlRFUlBPTEFUSU9OLCBlbmRQcmVkaWNhdGUsXG4gICAgICAgICAgZW5kUHJlZGljYXRlKTtcbiAgICAgIHRoaXMuX2NvbnN1bWVRdW90ZShxdW90ZUNoYXIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBjb25zdCBlbmRQcmVkaWNhdGUgPSAoKSA9PiBpc05hbWVFbmQodGhpcy5fY3Vyc29yLnBlZWsoKSk7XG4gICAgICB0aGlzLl9jb25zdW1lV2l0aEludGVycG9sYXRpb24oXG4gICAgICAgICAgVG9rZW5UeXBlLkFUVFJfVkFMVUVfVEVYVCwgVG9rZW5UeXBlLkFUVFJfVkFMVUVfSU5URVJQT0xBVElPTiwgZW5kUHJlZGljYXRlLFxuICAgICAgICAgIGVuZFByZWRpY2F0ZSk7XG4gICAgfVxuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZVF1b3RlKHF1b3RlQ2hhcjogbnVtYmVyKSB7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuQVRUUl9RVU9URSk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlKHF1b3RlQ2hhcik7XG4gICAgdGhpcy5fZW5kVG9rZW4oW1N0cmluZy5mcm9tQ29kZVBvaW50KHF1b3RlQ2hhcildKTtcbiAgfVxuXG4gIHByaXZhdGUgX2NvbnN1bWVUYWdPcGVuRW5kKCkge1xuICAgIGNvbnN0IHRva2VuVHlwZSA9XG4gICAgICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZShjaGFycy4kU0xBU0gpID8gVG9rZW5UeXBlLlRBR19PUEVOX0VORF9WT0lEIDogVG9rZW5UeXBlLlRBR19PUEVOX0VORDtcbiAgICB0aGlzLl9iZWdpblRva2VuKHRva2VuVHlwZSk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlKGNoYXJzLiRHVCk7XG4gICAgdGhpcy5fZW5kVG9rZW4oW10pO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZVRhZ0Nsb3NlKHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5UQUdfQ0xPU0UsIHN0YXJ0KTtcbiAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTm90V2hpdGVzcGFjZSk7XG4gICAgY29uc3QgcHJlZml4QW5kTmFtZSA9IHRoaXMuX2NvbnN1bWVQcmVmaXhBbmROYW1lKCk7XG4gICAgdGhpcy5fYXR0ZW1wdENoYXJDb2RlVW50aWxGbihpc05vdFdoaXRlc3BhY2UpO1xuICAgIHRoaXMuX3JlcXVpcmVDaGFyQ29kZShjaGFycy4kR1QpO1xuICAgIHRoaXMuX2VuZFRva2VuKHByZWZpeEFuZE5hbWUpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUV4cGFuc2lvbkZvcm1TdGFydCgpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5FWFBBTlNJT05fRk9STV9TVEFSVCk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlKGNoYXJzLiRMQlJBQ0UpO1xuICAgIHRoaXMuX2VuZFRva2VuKFtdKTtcblxuICAgIHRoaXMuX2V4cGFuc2lvbkNhc2VTdGFjay5wdXNoKFRva2VuVHlwZS5FWFBBTlNJT05fRk9STV9TVEFSVCk7XG5cbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5SQVdfVEVYVCk7XG4gICAgY29uc3QgY29uZGl0aW9uID0gdGhpcy5fcmVhZFVudGlsKGNoYXJzLiRDT01NQSk7XG4gICAgY29uc3Qgbm9ybWFsaXplZENvbmRpdGlvbiA9IHRoaXMuX3Byb2Nlc3NDYXJyaWFnZVJldHVybnMoY29uZGl0aW9uKTtcbiAgICBpZiAodGhpcy5faTE4bk5vcm1hbGl6ZUxpbmVFbmRpbmdzSW5JQ1VzKSB7XG4gICAgICAvLyBXZSBleHBsaWNpdGx5IHdhbnQgdG8gbm9ybWFsaXplIGxpbmUgZW5kaW5ncyBmb3IgdGhpcyB0ZXh0LlxuICAgICAgdGhpcy5fZW5kVG9rZW4oW25vcm1hbGl6ZWRDb25kaXRpb25dKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gV2UgYXJlIG5vdCBub3JtYWxpemluZyBsaW5lIGVuZGluZ3MuXG4gICAgICBjb25zdCBjb25kaXRpb25Ub2tlbiA9IHRoaXMuX2VuZFRva2VuKFtjb25kaXRpb25dKTtcbiAgICAgIGlmIChub3JtYWxpemVkQ29uZGl0aW9uICE9PSBjb25kaXRpb24pIHtcbiAgICAgICAgdGhpcy5ub25Ob3JtYWxpemVkSWN1RXhwcmVzc2lvbnMucHVzaChjb25kaXRpb25Ub2tlbik7XG4gICAgICB9XG4gICAgfVxuICAgIHRoaXMuX3JlcXVpcmVDaGFyQ29kZShjaGFycy4kQ09NTUEpO1xuICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNOb3RXaGl0ZXNwYWNlKTtcblxuICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLlJBV19URVhUKTtcbiAgICBjb25zdCB0eXBlID0gdGhpcy5fcmVhZFVudGlsKGNoYXJzLiRDT01NQSk7XG4gICAgdGhpcy5fZW5kVG9rZW4oW3R5cGVdKTtcbiAgICB0aGlzLl9yZXF1aXJlQ2hhckNvZGUoY2hhcnMuJENPTU1BKTtcbiAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTm90V2hpdGVzcGFjZSk7XG4gIH1cblxuICBwcml2YXRlIF9jb25zdW1lRXhwYW5zaW9uQ2FzZVN0YXJ0KCkge1xuICAgIHRoaXMuX2JlZ2luVG9rZW4oVG9rZW5UeXBlLkVYUEFOU0lPTl9DQVNFX1ZBTFVFKTtcbiAgICBjb25zdCB2YWx1ZSA9IHRoaXMuX3JlYWRVbnRpbChjaGFycy4kTEJSQUNFKS50cmltKCk7XG4gICAgdGhpcy5fZW5kVG9rZW4oW3ZhbHVlXSk7XG4gICAgdGhpcy5fYXR0ZW1wdENoYXJDb2RlVW50aWxGbihpc05vdFdoaXRlc3BhY2UpO1xuXG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuRVhQQU5TSU9OX0NBU0VfRVhQX1NUQVJUKTtcbiAgICB0aGlzLl9yZXF1aXJlQ2hhckNvZGUoY2hhcnMuJExCUkFDRSk7XG4gICAgdGhpcy5fZW5kVG9rZW4oW10pO1xuICAgIHRoaXMuX2F0dGVtcHRDaGFyQ29kZVVudGlsRm4oaXNOb3RXaGl0ZXNwYWNlKTtcblxuICAgIHRoaXMuX2V4cGFuc2lvbkNhc2VTdGFjay5wdXNoKFRva2VuVHlwZS5FWFBBTlNJT05fQ0FTRV9FWFBfU1RBUlQpO1xuICB9XG5cbiAgcHJpdmF0ZSBfY29uc3VtZUV4cGFuc2lvbkNhc2VFbmQoKSB7XG4gICAgdGhpcy5fYmVnaW5Ub2tlbihUb2tlblR5cGUuRVhQQU5TSU9OX0NBU0VfRVhQX0VORCk7XG4gICAgdGhpcy5fcmVxdWlyZUNoYXJDb2RlKGNoYXJzLiRSQlJBQ0UpO1xuICAgIHRoaXMuX2VuZFRva2VuKFtdKTtcbiAgICB0aGlzLl9hdHRlbXB0Q2hhckNvZGVVbnRpbEZuKGlzTm90V2hpdGVzcGFjZSk7XG5cbiAgICB0aGlzLl9leHBhbnNpb25DYXNlU3RhY2sucG9wKCk7XG4gIH1cblxuICBwcml2YXRlIF9jb25zdW1lRXhwYW5zaW9uRm9ybUVuZCgpIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKFRva2VuVHlwZS5FWFBBTlNJT05fRk9STV9FTkQpO1xuICAgIHRoaXMuX3JlcXVpcmVDaGFyQ29kZShjaGFycy4kUkJSQUNFKTtcbiAgICB0aGlzLl9lbmRUb2tlbihbXSk7XG5cbiAgICB0aGlzLl9leHBhbnNpb25DYXNlU3RhY2sucG9wKCk7XG4gIH1cblxuICAvKipcbiAgICogQ29uc3VtZSBhIHN0cmluZyB0aGF0IG1heSBjb250YWluIGludGVycG9sYXRpb24gZXhwcmVzc2lvbnMuXG4gICAqXG4gICAqIFRoZSBmaXJzdCB0b2tlbiBjb25zdW1lZCB3aWxsIGJlIG9mIGB0b2tlblR5cGVgIGFuZCB0aGVuIHRoZXJlIHdpbGwgYmUgYWx0ZXJuYXRpbmdcbiAgICogYGludGVycG9sYXRpb25Ub2tlblR5cGVgIGFuZCBgdG9rZW5UeXBlYCB0b2tlbnMgdW50aWwgdGhlIGBlbmRQcmVkaWNhdGUoKWAgcmV0dXJucyB0cnVlLlxuICAgKlxuICAgKiBJZiBhbiBpbnRlcnBvbGF0aW9uIHRva2VuIGVuZHMgcHJlbWF0dXJlbHkgaXQgd2lsbCBoYXZlIG5vIGVuZCBtYXJrZXIgaW4gaXRzIGBwYXJ0c2AgYXJyYXkuXG4gICAqXG4gICAqIEBwYXJhbSB0ZXh0VG9rZW5UeXBlIHRoZSBraW5kIG9mIHRva2VucyB0byBpbnRlcmxlYXZlIGFyb3VuZCBpbnRlcnBvbGF0aW9uIHRva2Vucy5cbiAgICogQHBhcmFtIGludGVycG9sYXRpb25Ub2tlblR5cGUgdGhlIGtpbmQgb2YgdG9rZW5zIHRoYXQgY29udGFpbiBpbnRlcnBvbGF0aW9uLlxuICAgKiBAcGFyYW0gZW5kUHJlZGljYXRlIGEgZnVuY3Rpb24gdGhhdCBzaG91bGQgcmV0dXJuIHRydWUgd2hlbiB3ZSBzaG91bGQgc3RvcCBjb25zdW1pbmcuXG4gICAqIEBwYXJhbSBlbmRJbnRlcnBvbGF0aW9uIGEgZnVuY3Rpb24gdGhhdCBzaG91bGQgcmV0dXJuIHRydWUgaWYgdGhlcmUgaXMgYSBwcmVtYXR1cmUgZW5kIHRvIGFuXG4gICAqICAgICBpbnRlcnBvbGF0aW9uIGV4cHJlc3Npb24gLSBpLmUuIGJlZm9yZSB3ZSBnZXQgdG8gdGhlIG5vcm1hbCBpbnRlcnBvbGF0aW9uIGNsb3NpbmcgbWFya2VyLlxuICAgKi9cbiAgcHJpdmF0ZSBfY29uc3VtZVdpdGhJbnRlcnBvbGF0aW9uKFxuICAgICAgdGV4dFRva2VuVHlwZTogVG9rZW5UeXBlLCBpbnRlcnBvbGF0aW9uVG9rZW5UeXBlOiBUb2tlblR5cGUsIGVuZFByZWRpY2F0ZTogKCkgPT4gYm9vbGVhbixcbiAgICAgIGVuZEludGVycG9sYXRpb246ICgpID0+IGJvb2xlYW4pIHtcbiAgICB0aGlzLl9iZWdpblRva2VuKHRleHRUb2tlblR5cGUpO1xuICAgIGNvbnN0IHBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgd2hpbGUgKCFlbmRQcmVkaWNhdGUoKSkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgICAgaWYgKHRoaXMuX2ludGVycG9sYXRpb25Db25maWcgJiYgdGhpcy5fYXR0ZW1wdFN0cih0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnLnN0YXJ0KSkge1xuICAgICAgICB0aGlzLl9lbmRUb2tlbihbdGhpcy5fcHJvY2Vzc0NhcnJpYWdlUmV0dXJucyhwYXJ0cy5qb2luKCcnKSldLCBjdXJyZW50KTtcbiAgICAgICAgcGFydHMubGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy5fY29uc3VtZUludGVycG9sYXRpb24oaW50ZXJwb2xhdGlvblRva2VuVHlwZSwgY3VycmVudCwgZW5kSW50ZXJwb2xhdGlvbik7XG4gICAgICAgIHRoaXMuX2JlZ2luVG9rZW4odGV4dFRva2VuVHlwZSk7XG4gICAgICB9IGVsc2UgaWYgKHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IGNoYXJzLiRBTVBFUlNBTkQpIHtcbiAgICAgICAgdGhpcy5fZW5kVG9rZW4oW3RoaXMuX3Byb2Nlc3NDYXJyaWFnZVJldHVybnMocGFydHMuam9pbignJykpXSk7XG4gICAgICAgIHBhcnRzLmxlbmd0aCA9IDA7XG4gICAgICAgIHRoaXMuX2NvbnN1bWVFbnRpdHkodGV4dFRva2VuVHlwZSk7XG4gICAgICAgIHRoaXMuX2JlZ2luVG9rZW4odGV4dFRva2VuVHlwZSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBwYXJ0cy5wdXNoKHRoaXMuX3JlYWRDaGFyKCkpO1xuICAgICAgfVxuICAgIH1cblxuICAgIC8vIEl0IGlzIHBvc3NpYmxlIHRoYXQgYW4gaW50ZXJwb2xhdGlvbiB3YXMgc3RhcnRlZCBidXQgbm90IGVuZGVkIGluc2lkZSB0aGlzIHRleHQgdG9rZW4uXG4gICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgcmVzZXQgdGhlIHN0YXRlIG9mIHRoZSBsZXhlciBjb3JyZWN0bHkuXG4gICAgdGhpcy5faW5JbnRlcnBvbGF0aW9uID0gZmFsc2U7XG5cbiAgICB0aGlzLl9lbmRUb2tlbihbdGhpcy5fcHJvY2Vzc0NhcnJpYWdlUmV0dXJucyhwYXJ0cy5qb2luKCcnKSldKTtcbiAgfVxuXG4gIC8qKlxuICAgKiBDb25zdW1lIGEgYmxvY2sgb2YgdGV4dCB0aGF0IGhhcyBiZWVuIGludGVycHJldGVkIGFzIGFuIEFuZ3VsYXIgaW50ZXJwb2xhdGlvbi5cbiAgICpcbiAgICogQHBhcmFtIGludGVycG9sYXRpb25Ub2tlblR5cGUgdGhlIHR5cGUgb2YgdGhlIGludGVycG9sYXRpb24gdG9rZW4gdG8gZ2VuZXJhdGUuXG4gICAqIEBwYXJhbSBpbnRlcnBvbGF0aW9uU3RhcnQgYSBjdXJzb3IgdGhhdCBwb2ludHMgdG8gdGhlIHN0YXJ0IG9mIHRoaXMgaW50ZXJwb2xhdGlvbi5cbiAgICogQHBhcmFtIHByZW1hdHVyZUVuZFByZWRpY2F0ZSBhIGZ1bmN0aW9uIHRoYXQgc2hvdWxkIHJldHVybiB0cnVlIGlmIHRoZSBuZXh0IGNoYXJhY3RlcnMgaW5kaWNhdGVcbiAgICogICAgIGFuIGVuZCB0byB0aGUgaW50ZXJwb2xhdGlvbiBiZWZvcmUgaXRzIG5vcm1hbCBjbG9zaW5nIG1hcmtlci5cbiAgICovXG4gIHByaXZhdGUgX2NvbnN1bWVJbnRlcnBvbGF0aW9uKFxuICAgICAgaW50ZXJwb2xhdGlvblRva2VuVHlwZTogVG9rZW5UeXBlLCBpbnRlcnBvbGF0aW9uU3RhcnQ6IENoYXJhY3RlckN1cnNvcixcbiAgICAgIHByZW1hdHVyZUVuZFByZWRpY2F0ZTogKCgpID0+IGJvb2xlYW4pfG51bGwpOiB2b2lkIHtcbiAgICBjb25zdCBwYXJ0czogc3RyaW5nW10gPSBbXTtcbiAgICB0aGlzLl9iZWdpblRva2VuKGludGVycG9sYXRpb25Ub2tlblR5cGUsIGludGVycG9sYXRpb25TdGFydCk7XG4gICAgcGFydHMucHVzaCh0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnLnN0YXJ0KTtcblxuICAgIC8vIEZpbmQgdGhlIGVuZCBvZiB0aGUgaW50ZXJwb2xhdGlvbiwgaWdub3JpbmcgY29udGVudCBpbnNpZGUgcXVvdGVzLlxuICAgIGNvbnN0IGV4cHJlc3Npb25TdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgIGxldCBpblF1b3RlOiBudW1iZXJ8bnVsbCA9IG51bGw7XG4gICAgbGV0IGluQ29tbWVudCA9IGZhbHNlO1xuICAgIHdoaWxlICh0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kRU9GICYmXG4gICAgICAgICAgIChwcmVtYXR1cmVFbmRQcmVkaWNhdGUgPT09IG51bGwgfHwgIXByZW1hdHVyZUVuZFByZWRpY2F0ZSgpKSkge1xuICAgICAgY29uc3QgY3VycmVudCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuXG4gICAgICBpZiAodGhpcy5faXNUYWdTdGFydCgpKSB7XG4gICAgICAgIC8vIFdlIGFyZSBzdGFydGluZyB3aGF0IGxvb2tzIGxpa2UgYW4gSFRNTCBlbGVtZW50IGluIHRoZSBtaWRkbGUgb2YgdGhpcyBpbnRlcnBvbGF0aW9uLlxuICAgICAgICAvLyBSZXNldCB0aGUgY3Vyc29yIHRvIGJlZm9yZSB0aGUgYDxgIGNoYXJhY3RlciBhbmQgZW5kIHRoZSBpbnRlcnBvbGF0aW9uIHRva2VuLlxuICAgICAgICAvLyAoVGhpcyBpcyBhY3R1YWxseSB3cm9uZyBidXQgaGVyZSBmb3IgYmFja3dhcmQgY29tcGF0aWJpbGl0eSkuXG4gICAgICAgIHRoaXMuX2N1cnNvciA9IGN1cnJlbnQ7XG4gICAgICAgIHBhcnRzLnB1c2godGhpcy5fZ2V0UHJvY2Vzc2VkQ2hhcnMoZXhwcmVzc2lvblN0YXJ0LCBjdXJyZW50KSk7XG4gICAgICAgIHRoaXMuX2VuZFRva2VuKHBhcnRzKTtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoaW5RdW90ZSA9PT0gbnVsbCkge1xuICAgICAgICBpZiAodGhpcy5fYXR0ZW1wdFN0cih0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnLmVuZCkpIHtcbiAgICAgICAgICAvLyBXZSBhcmUgbm90IGluIGEgc3RyaW5nLCBhbmQgd2UgaGl0IHRoZSBlbmQgaW50ZXJwb2xhdGlvbiBtYXJrZXJcbiAgICAgICAgICBwYXJ0cy5wdXNoKHRoaXMuX2dldFByb2Nlc3NlZENoYXJzKGV4cHJlc3Npb25TdGFydCwgY3VycmVudCkpO1xuICAgICAgICAgIHBhcnRzLnB1c2godGhpcy5faW50ZXJwb2xhdGlvbkNvbmZpZy5lbmQpO1xuICAgICAgICAgIHRoaXMuX2VuZFRva2VuKHBhcnRzKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5fYXR0ZW1wdFN0cignLy8nKSkge1xuICAgICAgICAgIC8vIE9uY2Ugd2UgYXJlIGluIGEgY29tbWVudCB3ZSBpZ25vcmUgYW55IHF1b3Rlc1xuICAgICAgICAgIGluQ29tbWVudCA9IHRydWU7XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgY29uc3QgY2hhciA9IHRoaXMuX2N1cnNvci5wZWVrKCk7XG4gICAgICB0aGlzLl9jdXJzb3IuYWR2YW5jZSgpO1xuICAgICAgaWYgKGNoYXIgPT09IGNoYXJzLiRCQUNLU0xBU0gpIHtcbiAgICAgICAgLy8gU2tpcCB0aGUgbmV4dCBjaGFyYWN0ZXIgYmVjYXVzZSBpdCB3YXMgZXNjYXBlZC5cbiAgICAgICAgdGhpcy5fY3Vyc29yLmFkdmFuY2UoKTtcbiAgICAgIH0gZWxzZSBpZiAoY2hhciA9PT0gaW5RdW90ZSkge1xuICAgICAgICAvLyBFeGl0aW5nIHRoZSBjdXJyZW50IHF1b3RlZCBzdHJpbmdcbiAgICAgICAgaW5RdW90ZSA9IG51bGw7XG4gICAgICB9IGVsc2UgaWYgKCFpbkNvbW1lbnQgJiYgaW5RdW90ZSA9PT0gbnVsbCAmJiBjaGFycy5pc1F1b3RlKGNoYXIpKSB7XG4gICAgICAgIC8vIEVudGVyaW5nIGEgbmV3IHF1b3RlZCBzdHJpbmdcbiAgICAgICAgaW5RdW90ZSA9IGNoYXI7XG4gICAgICB9XG4gICAgfVxuXG4gICAgLy8gV2UgaGl0IEVPRiB3aXRob3V0IGZpbmRpbmcgYSBjbG9zaW5nIGludGVycG9sYXRpb24gbWFya2VyXG4gICAgcGFydHMucHVzaCh0aGlzLl9nZXRQcm9jZXNzZWRDaGFycyhleHByZXNzaW9uU3RhcnQsIHRoaXMuX2N1cnNvcikpO1xuICAgIHRoaXMuX2VuZFRva2VuKHBhcnRzKTtcbiAgfVxuXG4gIHByaXZhdGUgX2dldFByb2Nlc3NlZENoYXJzKHN0YXJ0OiBDaGFyYWN0ZXJDdXJzb3IsIGVuZDogQ2hhcmFjdGVyQ3Vyc29yKTogc3RyaW5nIHtcbiAgICByZXR1cm4gdGhpcy5fcHJvY2Vzc0NhcnJpYWdlUmV0dXJucyhlbmQuZ2V0Q2hhcnMoc3RhcnQpKTtcbiAgfVxuXG4gIHByaXZhdGUgX2lzVGV4dEVuZCgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5faXNUYWdTdGFydCgpIHx8IHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IGNoYXJzLiRFT0YpIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl90b2tlbml6ZUljdSAmJiAhdGhpcy5faW5JbnRlcnBvbGF0aW9uKSB7XG4gICAgICBpZiAodGhpcy5pc0V4cGFuc2lvbkZvcm1TdGFydCgpKSB7XG4gICAgICAgIC8vIHN0YXJ0IG9mIGFuIGV4cGFuc2lvbiBmb3JtXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuXG4gICAgICBpZiAodGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJFJCUkFDRSAmJiB0aGlzLl9pc0luRXhwYW5zaW9uQ2FzZSgpKSB7XG4gICAgICAgIC8vIGVuZCBvZiBhbmQgZXhwYW5zaW9uIGNhc2VcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3Rva2VuaXplQmxvY2tzICYmICF0aGlzLl9pbkludGVycG9sYXRpb24gJiYgIXRoaXMuX2lzSW5FeHBhbnNpb24oKSAmJlxuICAgICAgICAodGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJEFUIHx8IHRoaXMuX2N1cnNvci5wZWVrKCkgPT09IGNoYXJzLiRSQlJBQ0UpKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG5cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyB0cnVlIGlmIHRoZSBjdXJyZW50IGN1cnNvciBpcyBwb2ludGluZyB0byB0aGUgc3RhcnQgb2YgYSB0YWdcbiAgICogKG9wZW5pbmcvY2xvc2luZy9jb21tZW50cy9jZGF0YS9ldGMpLlxuICAgKi9cbiAgcHJpdmF0ZSBfaXNUYWdTdGFydCgpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5fY3Vyc29yLnBlZWsoKSA9PT0gY2hhcnMuJExUKSB7XG4gICAgICAvLyBXZSBhc3N1bWUgdGhhdCBgPGAgZm9sbG93ZWQgYnkgd2hpdGVzcGFjZSBpcyBub3QgdGhlIHN0YXJ0IG9mIGFuIEhUTUwgZWxlbWVudC5cbiAgICAgIGNvbnN0IHRtcCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgICAgdG1wLmFkdmFuY2UoKTtcbiAgICAgIC8vIElmIHRoZSBuZXh0IGNoYXJhY3RlciBpcyBhbHBoYWJldGljLCAhIG5vciAvIHRoZW4gaXQgaXMgYSB0YWcgc3RhcnRcbiAgICAgIGNvbnN0IGNvZGUgPSB0bXAucGVlaygpO1xuICAgICAgaWYgKChjaGFycy4kYSA8PSBjb2RlICYmIGNvZGUgPD0gY2hhcnMuJHopIHx8IChjaGFycy4kQSA8PSBjb2RlICYmIGNvZGUgPD0gY2hhcnMuJFopIHx8XG4gICAgICAgICAgY29kZSA9PT0gY2hhcnMuJFNMQVNIIHx8IGNvZGUgPT09IGNoYXJzLiRCQU5HKSB7XG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBwcml2YXRlIF9yZWFkVW50aWwoY2hhcjogbnVtYmVyKTogc3RyaW5nIHtcbiAgICBjb25zdCBzdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgIHRoaXMuX2F0dGVtcHRVbnRpbENoYXIoY2hhcik7XG4gICAgcmV0dXJuIHRoaXMuX2N1cnNvci5nZXRDaGFycyhzdGFydCk7XG4gIH1cblxuICBwcml2YXRlIF9pc0luRXhwYW5zaW9uKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9pc0luRXhwYW5zaW9uQ2FzZSgpIHx8IHRoaXMuX2lzSW5FeHBhbnNpb25Gb3JtKCk7XG4gIH1cblxuICBwcml2YXRlIF9pc0luRXhwYW5zaW9uQ2FzZSgpOiBib29sZWFuIHtcbiAgICByZXR1cm4gdGhpcy5fZXhwYW5zaW9uQ2FzZVN0YWNrLmxlbmd0aCA+IDAgJiZcbiAgICAgICAgdGhpcy5fZXhwYW5zaW9uQ2FzZVN0YWNrW3RoaXMuX2V4cGFuc2lvbkNhc2VTdGFjay5sZW5ndGggLSAxXSA9PT1cbiAgICAgICAgVG9rZW5UeXBlLkVYUEFOU0lPTl9DQVNFX0VYUF9TVEFSVDtcbiAgfVxuXG4gIHByaXZhdGUgX2lzSW5FeHBhbnNpb25Gb3JtKCk6IGJvb2xlYW4ge1xuICAgIHJldHVybiB0aGlzLl9leHBhbnNpb25DYXNlU3RhY2subGVuZ3RoID4gMCAmJlxuICAgICAgICB0aGlzLl9leHBhbnNpb25DYXNlU3RhY2tbdGhpcy5fZXhwYW5zaW9uQ2FzZVN0YWNrLmxlbmd0aCAtIDFdID09PVxuICAgICAgICBUb2tlblR5cGUuRVhQQU5TSU9OX0ZPUk1fU1RBUlQ7XG4gIH1cblxuICBwcml2YXRlIGlzRXhwYW5zaW9uRm9ybVN0YXJ0KCk6IGJvb2xlYW4ge1xuICAgIGlmICh0aGlzLl9jdXJzb3IucGVlaygpICE9PSBjaGFycy4kTEJSQUNFKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICAgIGlmICh0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnKSB7XG4gICAgICBjb25zdCBzdGFydCA9IHRoaXMuX2N1cnNvci5jbG9uZSgpO1xuICAgICAgY29uc3QgaXNJbnRlcnBvbGF0aW9uID0gdGhpcy5fYXR0ZW1wdFN0cih0aGlzLl9pbnRlcnBvbGF0aW9uQ29uZmlnLnN0YXJ0KTtcbiAgICAgIHRoaXMuX2N1cnNvciA9IHN0YXJ0O1xuICAgICAgcmV0dXJuICFpc0ludGVycG9sYXRpb247XG4gICAgfVxuICAgIHJldHVybiB0cnVlO1xuICB9XG59XG5cbmZ1bmN0aW9uIGlzTm90V2hpdGVzcGFjZShjb2RlOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuICFjaGFycy5pc1doaXRlc3BhY2UoY29kZSkgfHwgY29kZSA9PT0gY2hhcnMuJEVPRjtcbn1cblxuZnVuY3Rpb24gaXNOYW1lRW5kKGNvZGU6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gY2hhcnMuaXNXaGl0ZXNwYWNlKGNvZGUpIHx8IGNvZGUgPT09IGNoYXJzLiRHVCB8fCBjb2RlID09PSBjaGFycy4kTFQgfHxcbiAgICAgIGNvZGUgPT09IGNoYXJzLiRTTEFTSCB8fCBjb2RlID09PSBjaGFycy4kU1EgfHwgY29kZSA9PT0gY2hhcnMuJERRIHx8IGNvZGUgPT09IGNoYXJzLiRFUSB8fFxuICAgICAgY29kZSA9PT0gY2hhcnMuJEVPRjtcbn1cblxuZnVuY3Rpb24gaXNQcmVmaXhFbmQoY29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiAoY29kZSA8IGNoYXJzLiRhIHx8IGNoYXJzLiR6IDwgY29kZSkgJiYgKGNvZGUgPCBjaGFycy4kQSB8fCBjaGFycy4kWiA8IGNvZGUpICYmXG4gICAgICAoY29kZSA8IGNoYXJzLiQwIHx8IGNvZGUgPiBjaGFycy4kOSk7XG59XG5cbmZ1bmN0aW9uIGlzRGlnaXRFbnRpdHlFbmQoY29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBjb2RlID09PSBjaGFycy4kU0VNSUNPTE9OIHx8IGNvZGUgPT09IGNoYXJzLiRFT0YgfHwgIWNoYXJzLmlzQXNjaWlIZXhEaWdpdChjb2RlKTtcbn1cblxuZnVuY3Rpb24gaXNOYW1lZEVudGl0eUVuZChjb2RlOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGNvZGUgPT09IGNoYXJzLiRTRU1JQ09MT04gfHwgY29kZSA9PT0gY2hhcnMuJEVPRiB8fCAhY2hhcnMuaXNBc2NpaUxldHRlcihjb2RlKTtcbn1cblxuZnVuY3Rpb24gaXNFeHBhbnNpb25DYXNlU3RhcnQocGVlazogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBwZWVrICE9PSBjaGFycy4kUkJSQUNFO1xufVxuXG5mdW5jdGlvbiBjb21wYXJlQ2hhckNvZGVDYXNlSW5zZW5zaXRpdmUoY29kZTE6IG51bWJlciwgY29kZTI6IG51bWJlcik6IGJvb2xlYW4ge1xuICByZXR1cm4gdG9VcHBlckNhc2VDaGFyQ29kZShjb2RlMSkgPT09IHRvVXBwZXJDYXNlQ2hhckNvZGUoY29kZTIpO1xufVxuXG5mdW5jdGlvbiB0b1VwcGVyQ2FzZUNoYXJDb2RlKGNvZGU6IG51bWJlcik6IG51bWJlciB7XG4gIHJldHVybiBjb2RlID49IGNoYXJzLiRhICYmIGNvZGUgPD0gY2hhcnMuJHogPyBjb2RlIC0gY2hhcnMuJGEgKyBjaGFycy4kQSA6IGNvZGU7XG59XG5cbmZ1bmN0aW9uIGlzQmxvY2tOYW1lQ2hhcihjb2RlOiBudW1iZXIpOiBib29sZWFuIHtcbiAgcmV0dXJuIGNoYXJzLmlzQXNjaWlMZXR0ZXIoY29kZSkgfHwgY2hhcnMuaXNEaWdpdChjb2RlKSB8fCBjb2RlID09PSBjaGFycy4kXztcbn1cblxuZnVuY3Rpb24gaXNCbG9ja1BhcmFtZXRlckNoYXIoY29kZTogbnVtYmVyKTogYm9vbGVhbiB7XG4gIHJldHVybiBjb2RlICE9PSBjaGFycy4kU0VNSUNPTE9OICYmIGlzTm90V2hpdGVzcGFjZShjb2RlKTtcbn1cblxuZnVuY3Rpb24gbWVyZ2VUZXh0VG9rZW5zKHNyY1Rva2VuczogVG9rZW5bXSk6IFRva2VuW10ge1xuICBjb25zdCBkc3RUb2tlbnM6IFRva2VuW10gPSBbXTtcbiAgbGV0IGxhc3REc3RUb2tlbjogVG9rZW58dW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuICBmb3IgKGxldCBpID0gMDsgaSA8IHNyY1Rva2Vucy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IHRva2VuID0gc3JjVG9rZW5zW2ldO1xuICAgIGlmICgobGFzdERzdFRva2VuICYmIGxhc3REc3RUb2tlbi50eXBlID09PSBUb2tlblR5cGUuVEVYVCAmJiB0b2tlbi50eXBlID09PSBUb2tlblR5cGUuVEVYVCkgfHxcbiAgICAgICAgKGxhc3REc3RUb2tlbiAmJiBsYXN0RHN0VG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkFUVFJfVkFMVUVfVEVYVCAmJlxuICAgICAgICAgdG9rZW4udHlwZSA9PT0gVG9rZW5UeXBlLkFUVFJfVkFMVUVfVEVYVCkpIHtcbiAgICAgIGxhc3REc3RUb2tlbi5wYXJ0c1swXSEgKz0gdG9rZW4ucGFydHNbMF07XG4gICAgICBsYXN0RHN0VG9rZW4uc291cmNlU3Bhbi5lbmQgPSB0b2tlbi5zb3VyY2VTcGFuLmVuZDtcbiAgICB9IGVsc2Uge1xuICAgICAgbGFzdERzdFRva2VuID0gdG9rZW47XG4gICAgICBkc3RUb2tlbnMucHVzaChsYXN0RHN0VG9rZW4pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBkc3RUb2tlbnM7XG59XG5cblxuLyoqXG4gKiBUaGUgX1Rva2VuaXplciB1c2VzIG9iamVjdHMgb2YgdGhpcyB0eXBlIHRvIG1vdmUgdGhyb3VnaCB0aGUgaW5wdXQgdGV4dCxcbiAqIGV4dHJhY3RpbmcgXCJwYXJzZWQgY2hhcmFjdGVyc1wiLiBUaGVzZSBjb3VsZCBiZSBtb3JlIHRoYW4gb25lIGFjdHVhbCBjaGFyYWN0ZXJcbiAqIGlmIHRoZSB0ZXh0IGNvbnRhaW5zIGVzY2FwZSBzZXF1ZW5jZXMuXG4gKi9cbmludGVyZmFjZSBDaGFyYWN0ZXJDdXJzb3Ige1xuICAvKiogSW5pdGlhbGl6ZSB0aGUgY3Vyc29yLiAqL1xuICBpbml0KCk6IHZvaWQ7XG4gIC8qKiBUaGUgcGFyc2VkIGNoYXJhY3RlciBhdCB0aGUgY3VycmVudCBjdXJzb3IgcG9zaXRpb24uICovXG4gIHBlZWsoKTogbnVtYmVyO1xuICAvKiogQWR2YW5jZSB0aGUgY3Vyc29yIGJ5IG9uZSBwYXJzZWQgY2hhcmFjdGVyLiAqL1xuICBhZHZhbmNlKCk6IHZvaWQ7XG4gIC8qKiBHZXQgYSBzcGFuIGZyb20gdGhlIG1hcmtlZCBzdGFydCBwb2ludCB0byB0aGUgY3VycmVudCBwb2ludC4gKi9cbiAgZ2V0U3BhbihzdGFydD86IHRoaXMsIGxlYWRpbmdUcml2aWFDb2RlUG9pbnRzPzogbnVtYmVyW10pOiBQYXJzZVNvdXJjZVNwYW47XG4gIC8qKiBHZXQgdGhlIHBhcnNlZCBjaGFyYWN0ZXJzIGZyb20gdGhlIG1hcmtlZCBzdGFydCBwb2ludCB0byB0aGUgY3VycmVudCBwb2ludC4gKi9cbiAgZ2V0Q2hhcnMoc3RhcnQ6IHRoaXMpOiBzdHJpbmc7XG4gIC8qKiBUaGUgbnVtYmVyIG9mIGNoYXJhY3RlcnMgbGVmdCBiZWZvcmUgdGhlIGVuZCBvZiB0aGUgY3Vyc29yLiAqL1xuICBjaGFyc0xlZnQoKTogbnVtYmVyO1xuICAvKiogVGhlIG51bWJlciBvZiBjaGFyYWN0ZXJzIGJldHdlZW4gYHRoaXNgIGN1cnNvciBhbmQgYG90aGVyYCBjdXJzb3IuICovXG4gIGRpZmYob3RoZXI6IHRoaXMpOiBudW1iZXI7XG4gIC8qKiBNYWtlIGEgY29weSBvZiB0aGlzIGN1cnNvciAqL1xuICBjbG9uZSgpOiBDaGFyYWN0ZXJDdXJzb3I7XG59XG5cbmludGVyZmFjZSBDdXJzb3JTdGF0ZSB7XG4gIHBlZWs6IG51bWJlcjtcbiAgb2Zmc2V0OiBudW1iZXI7XG4gIGxpbmU6IG51bWJlcjtcbiAgY29sdW1uOiBudW1iZXI7XG59XG5cbmNsYXNzIFBsYWluQ2hhcmFjdGVyQ3Vyc29yIGltcGxlbWVudHMgQ2hhcmFjdGVyQ3Vyc29yIHtcbiAgcHJvdGVjdGVkIHN0YXRlOiBDdXJzb3JTdGF0ZTtcbiAgcHJvdGVjdGVkIGZpbGU6IFBhcnNlU291cmNlRmlsZTtcbiAgcHJvdGVjdGVkIGlucHV0OiBzdHJpbmc7XG4gIHByb3RlY3RlZCBlbmQ6IG51bWJlcjtcblxuICBjb25zdHJ1Y3RvcihmaWxlT3JDdXJzb3I6IFBsYWluQ2hhcmFjdGVyQ3Vyc29yKTtcbiAgY29uc3RydWN0b3IoZmlsZU9yQ3Vyc29yOiBQYXJzZVNvdXJjZUZpbGUsIHJhbmdlOiBMZXhlclJhbmdlKTtcbiAgY29uc3RydWN0b3IoZmlsZU9yQ3Vyc29yOiBQYXJzZVNvdXJjZUZpbGV8UGxhaW5DaGFyYWN0ZXJDdXJzb3IsIHJhbmdlPzogTGV4ZXJSYW5nZSkge1xuICAgIGlmIChmaWxlT3JDdXJzb3IgaW5zdGFuY2VvZiBQbGFpbkNoYXJhY3RlckN1cnNvcikge1xuICAgICAgdGhpcy5maWxlID0gZmlsZU9yQ3Vyc29yLmZpbGU7XG4gICAgICB0aGlzLmlucHV0ID0gZmlsZU9yQ3Vyc29yLmlucHV0O1xuICAgICAgdGhpcy5lbmQgPSBmaWxlT3JDdXJzb3IuZW5kO1xuXG4gICAgICBjb25zdCBzdGF0ZSA9IGZpbGVPckN1cnNvci5zdGF0ZTtcbiAgICAgIC8vIE5vdGU6IGF2b2lkIHVzaW5nIGB7Li4uZmlsZU9yQ3Vyc29yLnN0YXRlfWAgaGVyZSBhcyB0aGF0IGhhcyBhIHNldmVyZSBwZXJmb3JtYW5jZSBwZW5hbHR5LlxuICAgICAgLy8gSW4gRVM1IGJ1bmRsZXMgdGhlIG9iamVjdCBzcHJlYWQgb3BlcmF0b3IgaXMgdHJhbnNsYXRlZCBpbnRvIHRoZSBgX19hc3NpZ25gIGhlbHBlciwgd2hpY2hcbiAgICAgIC8vIGlzIG5vdCBvcHRpbWl6ZWQgYnkgVk1zIGFzIGVmZmljaWVudGx5IGFzIGEgcmF3IG9iamVjdCBsaXRlcmFsLiBTaW5jZSB0aGlzIGNvbnN0cnVjdG9yIGlzXG4gICAgICAvLyBjYWxsZWQgaW4gdGlnaHQgbG9vcHMsIHRoaXMgZGlmZmVyZW5jZSBtYXR0ZXJzLlxuICAgICAgdGhpcy5zdGF0ZSA9IHtcbiAgICAgICAgcGVlazogc3RhdGUucGVlayxcbiAgICAgICAgb2Zmc2V0OiBzdGF0ZS5vZmZzZXQsXG4gICAgICAgIGxpbmU6IHN0YXRlLmxpbmUsXG4gICAgICAgIGNvbHVtbjogc3RhdGUuY29sdW1uLFxuICAgICAgfTtcbiAgICB9IGVsc2Uge1xuICAgICAgaWYgKCFyYW5nZSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnUHJvZ3JhbW1pbmcgZXJyb3I6IHRoZSByYW5nZSBhcmd1bWVudCBtdXN0IGJlIHByb3ZpZGVkIHdpdGggYSBmaWxlIGFyZ3VtZW50LicpO1xuICAgICAgfVxuICAgICAgdGhpcy5maWxlID0gZmlsZU9yQ3Vyc29yO1xuICAgICAgdGhpcy5pbnB1dCA9IGZpbGVPckN1cnNvci5jb250ZW50O1xuICAgICAgdGhpcy5lbmQgPSByYW5nZS5lbmRQb3M7XG4gICAgICB0aGlzLnN0YXRlID0ge1xuICAgICAgICBwZWVrOiAtMSxcbiAgICAgICAgb2Zmc2V0OiByYW5nZS5zdGFydFBvcyxcbiAgICAgICAgbGluZTogcmFuZ2Uuc3RhcnRMaW5lLFxuICAgICAgICBjb2x1bW46IHJhbmdlLnN0YXJ0Q29sLFxuICAgICAgfTtcbiAgICB9XG4gIH1cblxuICBjbG9uZSgpOiBQbGFpbkNoYXJhY3RlckN1cnNvciB7XG4gICAgcmV0dXJuIG5ldyBQbGFpbkNoYXJhY3RlckN1cnNvcih0aGlzKTtcbiAgfVxuXG4gIHBlZWsoKSB7XG4gICAgcmV0dXJuIHRoaXMuc3RhdGUucGVlaztcbiAgfVxuICBjaGFyc0xlZnQoKSB7XG4gICAgcmV0dXJuIHRoaXMuZW5kIC0gdGhpcy5zdGF0ZS5vZmZzZXQ7XG4gIH1cbiAgZGlmZihvdGhlcjogdGhpcykge1xuICAgIHJldHVybiB0aGlzLnN0YXRlLm9mZnNldCAtIG90aGVyLnN0YXRlLm9mZnNldDtcbiAgfVxuXG4gIGFkdmFuY2UoKTogdm9pZCB7XG4gICAgdGhpcy5hZHZhbmNlU3RhdGUodGhpcy5zdGF0ZSk7XG4gIH1cblxuICBpbml0KCk6IHZvaWQge1xuICAgIHRoaXMudXBkYXRlUGVlayh0aGlzLnN0YXRlKTtcbiAgfVxuXG4gIGdldFNwYW4oc3RhcnQ/OiB0aGlzLCBsZWFkaW5nVHJpdmlhQ29kZVBvaW50cz86IG51bWJlcltdKTogUGFyc2VTb3VyY2VTcGFuIHtcbiAgICBzdGFydCA9IHN0YXJ0IHx8IHRoaXM7XG4gICAgbGV0IGZ1bGxTdGFydCA9IHN0YXJ0O1xuICAgIGlmIChsZWFkaW5nVHJpdmlhQ29kZVBvaW50cykge1xuICAgICAgd2hpbGUgKHRoaXMuZGlmZihzdGFydCkgPiAwICYmIGxlYWRpbmdUcml2aWFDb2RlUG9pbnRzLmluZGV4T2Yoc3RhcnQucGVlaygpKSAhPT0gLTEpIHtcbiAgICAgICAgaWYgKGZ1bGxTdGFydCA9PT0gc3RhcnQpIHtcbiAgICAgICAgICBzdGFydCA9IHN0YXJ0LmNsb25lKCkgYXMgdGhpcztcbiAgICAgICAgfVxuICAgICAgICBzdGFydC5hZHZhbmNlKCk7XG4gICAgICB9XG4gICAgfVxuICAgIGNvbnN0IHN0YXJ0TG9jYXRpb24gPSB0aGlzLmxvY2F0aW9uRnJvbUN1cnNvcihzdGFydCk7XG4gICAgY29uc3QgZW5kTG9jYXRpb24gPSB0aGlzLmxvY2F0aW9uRnJvbUN1cnNvcih0aGlzKTtcbiAgICBjb25zdCBmdWxsU3RhcnRMb2NhdGlvbiA9XG4gICAgICAgIGZ1bGxTdGFydCAhPT0gc3RhcnQgPyB0aGlzLmxvY2F0aW9uRnJvbUN1cnNvcihmdWxsU3RhcnQpIDogc3RhcnRMb2NhdGlvbjtcbiAgICByZXR1cm4gbmV3IFBhcnNlU291cmNlU3BhbihzdGFydExvY2F0aW9uLCBlbmRMb2NhdGlvbiwgZnVsbFN0YXJ0TG9jYXRpb24pO1xuICB9XG5cbiAgZ2V0Q2hhcnMoc3RhcnQ6IHRoaXMpOiBzdHJpbmcge1xuICAgIHJldHVybiB0aGlzLmlucHV0LnN1YnN0cmluZyhzdGFydC5zdGF0ZS5vZmZzZXQsIHRoaXMuc3RhdGUub2Zmc2V0KTtcbiAgfVxuXG4gIGNoYXJBdChwb3M6IG51bWJlcik6IG51bWJlciB7XG4gICAgcmV0dXJuIHRoaXMuaW5wdXQuY2hhckNvZGVBdChwb3MpO1xuICB9XG5cbiAgcHJvdGVjdGVkIGFkdmFuY2VTdGF0ZShzdGF0ZTogQ3Vyc29yU3RhdGUpIHtcbiAgICBpZiAoc3RhdGUub2Zmc2V0ID49IHRoaXMuZW5kKSB7XG4gICAgICB0aGlzLnN0YXRlID0gc3RhdGU7XG4gICAgICB0aHJvdyBuZXcgQ3Vyc29yRXJyb3IoJ1VuZXhwZWN0ZWQgY2hhcmFjdGVyIFwiRU9GXCInLCB0aGlzKTtcbiAgICB9XG4gICAgY29uc3QgY3VycmVudENoYXIgPSB0aGlzLmNoYXJBdChzdGF0ZS5vZmZzZXQpO1xuICAgIGlmIChjdXJyZW50Q2hhciA9PT0gY2hhcnMuJExGKSB7XG4gICAgICBzdGF0ZS5saW5lKys7XG4gICAgICBzdGF0ZS5jb2x1bW4gPSAwO1xuICAgIH0gZWxzZSBpZiAoIWNoYXJzLmlzTmV3TGluZShjdXJyZW50Q2hhcikpIHtcbiAgICAgIHN0YXRlLmNvbHVtbisrO1xuICAgIH1cbiAgICBzdGF0ZS5vZmZzZXQrKztcbiAgICB0aGlzLnVwZGF0ZVBlZWsoc3RhdGUpO1xuICB9XG5cbiAgcHJvdGVjdGVkIHVwZGF0ZVBlZWsoc3RhdGU6IEN1cnNvclN0YXRlKTogdm9pZCB7XG4gICAgc3RhdGUucGVlayA9IHN0YXRlLm9mZnNldCA+PSB0aGlzLmVuZCA/IGNoYXJzLiRFT0YgOiB0aGlzLmNoYXJBdChzdGF0ZS5vZmZzZXQpO1xuICB9XG5cbiAgcHJpdmF0ZSBsb2NhdGlvbkZyb21DdXJzb3IoY3Vyc29yOiB0aGlzKTogUGFyc2VMb2NhdGlvbiB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZUxvY2F0aW9uKFxuICAgICAgICBjdXJzb3IuZmlsZSwgY3Vyc29yLnN0YXRlLm9mZnNldCwgY3Vyc29yLnN0YXRlLmxpbmUsIGN1cnNvci5zdGF0ZS5jb2x1bW4pO1xuICB9XG59XG5cbmNsYXNzIEVzY2FwZWRDaGFyYWN0ZXJDdXJzb3IgZXh0ZW5kcyBQbGFpbkNoYXJhY3RlckN1cnNvciB7XG4gIHByb3RlY3RlZCBpbnRlcm5hbFN0YXRlOiBDdXJzb3JTdGF0ZTtcblxuICBjb25zdHJ1Y3RvcihmaWxlT3JDdXJzb3I6IEVzY2FwZWRDaGFyYWN0ZXJDdXJzb3IpO1xuICBjb25zdHJ1Y3RvcihmaWxlT3JDdXJzb3I6IFBhcnNlU291cmNlRmlsZSwgcmFuZ2U6IExleGVyUmFuZ2UpO1xuICBjb25zdHJ1Y3RvcihmaWxlT3JDdXJzb3I6IFBhcnNlU291cmNlRmlsZXxFc2NhcGVkQ2hhcmFjdGVyQ3Vyc29yLCByYW5nZT86IExleGVyUmFuZ2UpIHtcbiAgICBpZiAoZmlsZU9yQ3Vyc29yIGluc3RhbmNlb2YgRXNjYXBlZENoYXJhY3RlckN1cnNvcikge1xuICAgICAgc3VwZXIoZmlsZU9yQ3Vyc29yKTtcbiAgICAgIHRoaXMuaW50ZXJuYWxTdGF0ZSA9IHsuLi5maWxlT3JDdXJzb3IuaW50ZXJuYWxTdGF0ZX07XG4gICAgfSBlbHNlIHtcbiAgICAgIHN1cGVyKGZpbGVPckN1cnNvciwgcmFuZ2UhKTtcbiAgICAgIHRoaXMuaW50ZXJuYWxTdGF0ZSA9IHRoaXMuc3RhdGU7XG4gICAgfVxuICB9XG5cbiAgb3ZlcnJpZGUgYWR2YW5jZSgpOiB2b2lkIHtcbiAgICB0aGlzLnN0YXRlID0gdGhpcy5pbnRlcm5hbFN0YXRlO1xuICAgIHN1cGVyLmFkdmFuY2UoKTtcbiAgICB0aGlzLnByb2Nlc3NFc2NhcGVTZXF1ZW5jZSgpO1xuICB9XG5cbiAgb3ZlcnJpZGUgaW5pdCgpOiB2b2lkIHtcbiAgICBzdXBlci5pbml0KCk7XG4gICAgdGhpcy5wcm9jZXNzRXNjYXBlU2VxdWVuY2UoKTtcbiAgfVxuXG4gIG92ZXJyaWRlIGNsb25lKCk6IEVzY2FwZWRDaGFyYWN0ZXJDdXJzb3Ige1xuICAgIHJldHVybiBuZXcgRXNjYXBlZENoYXJhY3RlckN1cnNvcih0aGlzKTtcbiAgfVxuXG4gIG92ZXJyaWRlIGdldENoYXJzKHN0YXJ0OiB0aGlzKTogc3RyaW5nIHtcbiAgICBjb25zdCBjdXJzb3IgPSBzdGFydC5jbG9uZSgpO1xuICAgIGxldCBjaGFycyA9ICcnO1xuICAgIHdoaWxlIChjdXJzb3IuaW50ZXJuYWxTdGF0ZS5vZmZzZXQgPCB0aGlzLmludGVybmFsU3RhdGUub2Zmc2V0KSB7XG4gICAgICBjaGFycyArPSBTdHJpbmcuZnJvbUNvZGVQb2ludChjdXJzb3IucGVlaygpKTtcbiAgICAgIGN1cnNvci5hZHZhbmNlKCk7XG4gICAgfVxuICAgIHJldHVybiBjaGFycztcbiAgfVxuXG4gIC8qKlxuICAgKiBQcm9jZXNzIHRoZSBlc2NhcGUgc2VxdWVuY2UgdGhhdCBzdGFydHMgYXQgdGhlIGN1cnJlbnQgcG9zaXRpb24gaW4gdGhlIHRleHQuXG4gICAqXG4gICAqIFRoaXMgbWV0aG9kIGlzIGNhbGxlZCB0byBlbnN1cmUgdGhhdCBgcGVla2AgaGFzIHRoZSB1bmVzY2FwZWQgdmFsdWUgb2YgZXNjYXBlIHNlcXVlbmNlcy5cbiAgICovXG4gIHByb3RlY3RlZCBwcm9jZXNzRXNjYXBlU2VxdWVuY2UoKTogdm9pZCB7XG4gICAgY29uc3QgcGVlayA9ICgpID0+IHRoaXMuaW50ZXJuYWxTdGF0ZS5wZWVrO1xuXG4gICAgaWYgKHBlZWsoKSA9PT0gY2hhcnMuJEJBQ0tTTEFTSCkge1xuICAgICAgLy8gV2UgaGF2ZSBoaXQgYW4gZXNjYXBlIHNlcXVlbmNlIHNvIHdlIG5lZWQgdGhlIGludGVybmFsIHN0YXRlIHRvIGJlY29tZSBpbmRlcGVuZGVudFxuICAgICAgLy8gb2YgdGhlIGV4dGVybmFsIHN0YXRlLlxuICAgICAgdGhpcy5pbnRlcm5hbFN0YXRlID0gey4uLnRoaXMuc3RhdGV9O1xuXG4gICAgICAvLyBNb3ZlIHBhc3QgdGhlIGJhY2tzbGFzaFxuICAgICAgdGhpcy5hZHZhbmNlU3RhdGUodGhpcy5pbnRlcm5hbFN0YXRlKTtcblxuICAgICAgLy8gRmlyc3QgY2hlY2sgZm9yIHN0YW5kYXJkIGNvbnRyb2wgY2hhciBzZXF1ZW5jZXNcbiAgICAgIGlmIChwZWVrKCkgPT09IGNoYXJzLiRuKSB7XG4gICAgICAgIHRoaXMuc3RhdGUucGVlayA9IGNoYXJzLiRMRjtcbiAgICAgIH0gZWxzZSBpZiAocGVlaygpID09PSBjaGFycy4kcikge1xuICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSBjaGFycy4kQ1I7XG4gICAgICB9IGVsc2UgaWYgKHBlZWsoKSA9PT0gY2hhcnMuJHYpIHtcbiAgICAgICAgdGhpcy5zdGF0ZS5wZWVrID0gY2hhcnMuJFZUQUI7XG4gICAgICB9IGVsc2UgaWYgKHBlZWsoKSA9PT0gY2hhcnMuJHQpIHtcbiAgICAgICAgdGhpcy5zdGF0ZS5wZWVrID0gY2hhcnMuJFRBQjtcbiAgICAgIH0gZWxzZSBpZiAocGVlaygpID09PSBjaGFycy4kYikge1xuICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSBjaGFycy4kQlNQQUNFO1xuICAgICAgfSBlbHNlIGlmIChwZWVrKCkgPT09IGNoYXJzLiRmKSB7XG4gICAgICAgIHRoaXMuc3RhdGUucGVlayA9IGNoYXJzLiRGRjtcbiAgICAgIH1cblxuICAgICAgLy8gTm93IGNvbnNpZGVyIG1vcmUgY29tcGxleCBzZXF1ZW5jZXNcbiAgICAgIGVsc2UgaWYgKHBlZWsoKSA9PT0gY2hhcnMuJHUpIHtcbiAgICAgICAgLy8gVW5pY29kZSBjb2RlLXBvaW50IHNlcXVlbmNlXG4gICAgICAgIHRoaXMuYWR2YW5jZVN0YXRlKHRoaXMuaW50ZXJuYWxTdGF0ZSk7ICAvLyBhZHZhbmNlIHBhc3QgdGhlIGB1YCBjaGFyXG4gICAgICAgIGlmIChwZWVrKCkgPT09IGNoYXJzLiRMQlJBQ0UpIHtcbiAgICAgICAgICAvLyBWYXJpYWJsZSBsZW5ndGggVW5pY29kZSwgZS5nLiBgXFx4ezEyM31gXG4gICAgICAgICAgdGhpcy5hZHZhbmNlU3RhdGUodGhpcy5pbnRlcm5hbFN0YXRlKTsgIC8vIGFkdmFuY2UgcGFzdCB0aGUgYHtgIGNoYXJcbiAgICAgICAgICAvLyBBZHZhbmNlIHBhc3QgdGhlIHZhcmlhYmxlIG51bWJlciBvZiBoZXggZGlnaXRzIHVudGlsIHdlIGhpdCBhIGB9YCBjaGFyXG4gICAgICAgICAgY29uc3QgZGlnaXRTdGFydCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICBsZXQgbGVuZ3RoID0gMDtcbiAgICAgICAgICB3aGlsZSAocGVlaygpICE9PSBjaGFycy4kUkJSQUNFKSB7XG4gICAgICAgICAgICB0aGlzLmFkdmFuY2VTdGF0ZSh0aGlzLmludGVybmFsU3RhdGUpO1xuICAgICAgICAgICAgbGVuZ3RoKys7XG4gICAgICAgICAgfVxuICAgICAgICAgIHRoaXMuc3RhdGUucGVlayA9IHRoaXMuZGVjb2RlSGV4RGlnaXRzKGRpZ2l0U3RhcnQsIGxlbmd0aCk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgLy8gRml4ZWQgbGVuZ3RoIFVuaWNvZGUsIGUuZy4gYFxcdTEyMzRgXG4gICAgICAgICAgY29uc3QgZGlnaXRTdGFydCA9IHRoaXMuY2xvbmUoKTtcbiAgICAgICAgICB0aGlzLmFkdmFuY2VTdGF0ZSh0aGlzLmludGVybmFsU3RhdGUpO1xuICAgICAgICAgIHRoaXMuYWR2YW5jZVN0YXRlKHRoaXMuaW50ZXJuYWxTdGF0ZSk7XG4gICAgICAgICAgdGhpcy5hZHZhbmNlU3RhdGUodGhpcy5pbnRlcm5hbFN0YXRlKTtcbiAgICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSB0aGlzLmRlY29kZUhleERpZ2l0cyhkaWdpdFN0YXJ0LCA0KTtcbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBlbHNlIGlmIChwZWVrKCkgPT09IGNoYXJzLiR4KSB7XG4gICAgICAgIC8vIEhleCBjaGFyIGNvZGUsIGUuZy4gYFxceDJGYFxuICAgICAgICB0aGlzLmFkdmFuY2VTdGF0ZSh0aGlzLmludGVybmFsU3RhdGUpOyAgLy8gYWR2YW5jZSBwYXN0IHRoZSBgeGAgY2hhclxuICAgICAgICBjb25zdCBkaWdpdFN0YXJ0ID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICB0aGlzLmFkdmFuY2VTdGF0ZSh0aGlzLmludGVybmFsU3RhdGUpO1xuICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSB0aGlzLmRlY29kZUhleERpZ2l0cyhkaWdpdFN0YXJ0LCAyKTtcbiAgICAgIH1cblxuICAgICAgZWxzZSBpZiAoY2hhcnMuaXNPY3RhbERpZ2l0KHBlZWsoKSkpIHtcbiAgICAgICAgLy8gT2N0YWwgY2hhciBjb2RlLCBlLmcuIGBcXDAxMmAsXG4gICAgICAgIGxldCBvY3RhbCA9ICcnO1xuICAgICAgICBsZXQgbGVuZ3RoID0gMDtcbiAgICAgICAgbGV0IHByZXZpb3VzID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICB3aGlsZSAoY2hhcnMuaXNPY3RhbERpZ2l0KHBlZWsoKSkgJiYgbGVuZ3RoIDwgMykge1xuICAgICAgICAgIHByZXZpb3VzID0gdGhpcy5jbG9uZSgpO1xuICAgICAgICAgIG9jdGFsICs9IFN0cmluZy5mcm9tQ29kZVBvaW50KHBlZWsoKSk7XG4gICAgICAgICAgdGhpcy5hZHZhbmNlU3RhdGUodGhpcy5pbnRlcm5hbFN0YXRlKTtcbiAgICAgICAgICBsZW5ndGgrKztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSBwYXJzZUludChvY3RhbCwgOCk7XG4gICAgICAgIC8vIEJhY2t1cCBvbmUgY2hhclxuICAgICAgICB0aGlzLmludGVybmFsU3RhdGUgPSBwcmV2aW91cy5pbnRlcm5hbFN0YXRlO1xuICAgICAgfVxuXG4gICAgICBlbHNlIGlmIChjaGFycy5pc05ld0xpbmUodGhpcy5pbnRlcm5hbFN0YXRlLnBlZWspKSB7XG4gICAgICAgIC8vIExpbmUgY29udGludWF0aW9uIGBcXGAgZm9sbG93ZWQgYnkgYSBuZXcgbGluZVxuICAgICAgICB0aGlzLmFkdmFuY2VTdGF0ZSh0aGlzLmludGVybmFsU3RhdGUpOyAgLy8gYWR2YW5jZSBvdmVyIHRoZSBuZXdsaW5lXG4gICAgICAgIHRoaXMuc3RhdGUgPSB0aGlzLmludGVybmFsU3RhdGU7XG4gICAgICB9XG5cbiAgICAgIGVsc2Uge1xuICAgICAgICAvLyBJZiBub25lIG9mIHRoZSBgaWZgIGJsb2NrcyB3ZXJlIGV4ZWN1dGVkIHRoZW4gd2UganVzdCBoYXZlIGFuIGVzY2FwZWQgbm9ybWFsIGNoYXJhY3Rlci5cbiAgICAgICAgLy8gSW4gdGhhdCBjYXNlIHdlIGp1c3QsIGVmZmVjdGl2ZWx5LCBza2lwIHRoZSBiYWNrc2xhc2ggZnJvbSB0aGUgY2hhcmFjdGVyLlxuICAgICAgICB0aGlzLnN0YXRlLnBlZWsgPSB0aGlzLmludGVybmFsU3RhdGUucGVlaztcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBwcm90ZWN0ZWQgZGVjb2RlSGV4RGlnaXRzKHN0YXJ0OiBFc2NhcGVkQ2hhcmFjdGVyQ3Vyc29yLCBsZW5ndGg6IG51bWJlcik6IG51bWJlciB7XG4gICAgY29uc3QgaGV4ID0gdGhpcy5pbnB1dC5zbGljZShzdGFydC5pbnRlcm5hbFN0YXRlLm9mZnNldCwgc3RhcnQuaW50ZXJuYWxTdGF0ZS5vZmZzZXQgKyBsZW5ndGgpO1xuICAgIGNvbnN0IGNoYXJDb2RlID0gcGFyc2VJbnQoaGV4LCAxNik7XG4gICAgaWYgKCFpc05hTihjaGFyQ29kZSkpIHtcbiAgICAgIHJldHVybiBjaGFyQ29kZTtcbiAgICB9IGVsc2Uge1xuICAgICAgc3RhcnQuc3RhdGUgPSBzdGFydC5pbnRlcm5hbFN0YXRlO1xuICAgICAgdGhyb3cgbmV3IEN1cnNvckVycm9yKCdJbnZhbGlkIGhleGFkZWNpbWFsIGVzY2FwZSBzZXF1ZW5jZScsIHN0YXJ0KTtcbiAgICB9XG4gIH1cbn1cblxuZXhwb3J0IGNsYXNzIEN1cnNvckVycm9yIHtcbiAgY29uc3RydWN0b3IocHVibGljIG1zZzogc3RyaW5nLCBwdWJsaWMgY3Vyc29yOiBDaGFyYWN0ZXJDdXJzb3IpIHt9XG59XG4iXX0=