/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as chars from '../chars';
import { Lexer, TokenType } from '../expression_parser/lexer';
import { ParseError, ParseSourceSpan } from '../parse_util';
import * as t from './r3_ast';
/** Pattern for a timing value in a trigger. */
const TIME_PATTERN = /^\d+\.?\d*(ms|s)?$/;
/** Pattern for a separator between keywords in a trigger expression. */
const SEPARATOR_PATTERN = /^\s$/;
/** Pairs of characters that form syntax that is comma-delimited. */
const COMMA_DELIMITED_SYNTAX = new Map([
    [chars.$LBRACE, chars.$RBRACE],
    [chars.$LBRACKET, chars.$RBRACKET],
    [chars.$LPAREN, chars.$RPAREN], // Function calls
]);
/** Possible types of `on` triggers. */
var OnTriggerType;
(function (OnTriggerType) {
    OnTriggerType["IDLE"] = "idle";
    OnTriggerType["TIMER"] = "timer";
    OnTriggerType["INTERACTION"] = "interaction";
    OnTriggerType["IMMEDIATE"] = "immediate";
    OnTriggerType["HOVER"] = "hover";
    OnTriggerType["VIEWPORT"] = "viewport";
})(OnTriggerType || (OnTriggerType = {}));
/** Parses a `when` deferred trigger. */
export function parseWhenTrigger({ expression, sourceSpan }, bindingParser, triggers, errors) {
    const whenIndex = expression.indexOf('when');
    const whenSourceSpan = new ParseSourceSpan(sourceSpan.start.moveBy(whenIndex), sourceSpan.start.moveBy(whenIndex + 'when'.length));
    const prefetchSpan = getPrefetchSpan(expression, sourceSpan);
    // This is here just to be safe, we shouldn't enter this function
    // in the first place if a block doesn't have the "when" keyword.
    if (whenIndex === -1) {
        errors.push(new ParseError(sourceSpan, `Could not find "when" keyword in expression`));
    }
    else {
        const start = getTriggerParametersStart(expression, whenIndex + 1);
        const parsed = bindingParser.parseBinding(expression.slice(start), false, sourceSpan, sourceSpan.start.offset + start);
        trackTrigger('when', triggers, errors, new t.BoundDeferredTrigger(parsed, sourceSpan, prefetchSpan, whenSourceSpan));
    }
}
/** Parses an `on` trigger */
export function parseOnTrigger({ expression, sourceSpan }, triggers, errors, placeholder) {
    const onIndex = expression.indexOf('on');
    const onSourceSpan = new ParseSourceSpan(sourceSpan.start.moveBy(onIndex), sourceSpan.start.moveBy(onIndex + 'on'.length));
    const prefetchSpan = getPrefetchSpan(expression, sourceSpan);
    // This is here just to be safe, we shouldn't enter this function
    // in the first place if a block doesn't have the "on" keyword.
    if (onIndex === -1) {
        errors.push(new ParseError(sourceSpan, `Could not find "on" keyword in expression`));
    }
    else {
        const start = getTriggerParametersStart(expression, onIndex + 1);
        const parser = new OnTriggerParser(expression, start, sourceSpan, triggers, errors, placeholder, prefetchSpan, onSourceSpan);
        parser.parse();
    }
}
function getPrefetchSpan(expression, sourceSpan) {
    if (!expression.startsWith('prefetch')) {
        return null;
    }
    return new ParseSourceSpan(sourceSpan.start, sourceSpan.start.moveBy('prefetch'.length));
}
class OnTriggerParser {
    constructor(expression, start, span, triggers, errors, placeholder, prefetchSpan, onSourceSpan) {
        this.expression = expression;
        this.start = start;
        this.span = span;
        this.triggers = triggers;
        this.errors = errors;
        this.placeholder = placeholder;
        this.prefetchSpan = prefetchSpan;
        this.onSourceSpan = onSourceSpan;
        this.index = 0;
        this.tokens = new Lexer().tokenize(expression.slice(start));
    }
    parse() {
        while (this.tokens.length > 0 && this.index < this.tokens.length) {
            const token = this.token();
            if (!token.isIdentifier()) {
                this.unexpectedToken(token);
                break;
            }
            // An identifier immediately followed by a comma or the end of
            // the expression cannot have parameters so we can exit early.
            if (this.isFollowedByOrLast(chars.$COMMA)) {
                this.consumeTrigger(token, []);
                this.advance();
            }
            else if (this.isFollowedByOrLast(chars.$LPAREN)) {
                this.advance(); // Advance to the opening paren.
                const prevErrors = this.errors.length;
                const parameters = this.consumeParameters();
                if (this.errors.length !== prevErrors) {
                    break;
                }
                this.consumeTrigger(token, parameters);
                this.advance(); // Advance past the closing paren.
            }
            else if (this.index < this.tokens.length - 1) {
                this.unexpectedToken(this.tokens[this.index + 1]);
            }
            this.advance();
        }
    }
    advance() {
        this.index++;
    }
    isFollowedByOrLast(char) {
        if (this.index === this.tokens.length - 1) {
            return true;
        }
        return this.tokens[this.index + 1].isCharacter(char);
    }
    token() {
        return this.tokens[Math.min(this.index, this.tokens.length - 1)];
    }
    consumeTrigger(identifier, parameters) {
        const triggerNameStartSpan = this.span.start.moveBy(this.start + identifier.index - this.tokens[0].index);
        const nameSpan = new ParseSourceSpan(triggerNameStartSpan, triggerNameStartSpan.moveBy(identifier.strValue.length));
        const endSpan = triggerNameStartSpan.moveBy(this.token().end - identifier.index);
        // Put the prefetch and on spans with the first trigger
        // This should maybe be refactored to have something like an outer OnGroup AST
        // Since triggers can be grouped with commas "on hover(x), interaction(y)"
        const isFirstTrigger = identifier.index === 0;
        const onSourceSpan = isFirstTrigger ? this.onSourceSpan : null;
        const prefetchSourceSpan = isFirstTrigger ? this.prefetchSpan : null;
        const sourceSpan = new ParseSourceSpan(isFirstTrigger ? this.span.start : triggerNameStartSpan, endSpan);
        try {
            switch (identifier.toString()) {
                case OnTriggerType.IDLE:
                    this.trackTrigger('idle', createIdleTrigger(parameters, nameSpan, sourceSpan, prefetchSourceSpan, onSourceSpan));
                    break;
                case OnTriggerType.TIMER:
                    this.trackTrigger('timer', createTimerTrigger(parameters, nameSpan, sourceSpan, this.prefetchSpan, this.onSourceSpan));
                    break;
                case OnTriggerType.INTERACTION:
                    this.trackTrigger('interaction', createInteractionTrigger(parameters, nameSpan, sourceSpan, this.prefetchSpan, this.onSourceSpan, this.placeholder));
                    break;
                case OnTriggerType.IMMEDIATE:
                    this.trackTrigger('immediate', createImmediateTrigger(parameters, nameSpan, sourceSpan, this.prefetchSpan, this.onSourceSpan));
                    break;
                case OnTriggerType.HOVER:
                    this.trackTrigger('hover', createHoverTrigger(parameters, nameSpan, sourceSpan, this.prefetchSpan, this.onSourceSpan, this.placeholder));
                    break;
                case OnTriggerType.VIEWPORT:
                    this.trackTrigger('viewport', createViewportTrigger(parameters, nameSpan, sourceSpan, this.prefetchSpan, this.onSourceSpan, this.placeholder));
                    break;
                default:
                    throw new Error(`Unrecognized trigger type "${identifier}"`);
            }
        }
        catch (e) {
            this.error(identifier, e.message);
        }
    }
    consumeParameters() {
        const parameters = [];
        if (!this.token().isCharacter(chars.$LPAREN)) {
            this.unexpectedToken(this.token());
            return parameters;
        }
        this.advance();
        const commaDelimStack = [];
        let current = '';
        while (this.index < this.tokens.length) {
            const token = this.token();
            // Stop parsing if we've hit the end character and we're outside of a comma-delimited syntax.
            // Note that we don't need to account for strings here since the lexer already parsed them
            // into string tokens.
            if (token.isCharacter(chars.$RPAREN) && commaDelimStack.length === 0) {
                if (current.length) {
                    parameters.push(current);
                }
                break;
            }
            // In the `on` microsyntax "top-level" commas (e.g. ones outside of an parameters) separate
            // the different triggers (e.g. `on idle,timer(500)`). This is problematic, because the
            // function-like syntax also implies that multiple parameters can be passed into the
            // individual trigger (e.g. `on foo(a, b)`). To avoid tripping up the parser with commas that
            // are part of other sorts of syntax (object literals, arrays), we treat anything inside
            // a comma-delimited syntax block as plain text.
            if (token.type === TokenType.Character && COMMA_DELIMITED_SYNTAX.has(token.numValue)) {
                commaDelimStack.push(COMMA_DELIMITED_SYNTAX.get(token.numValue));
            }
            if (commaDelimStack.length > 0 &&
                token.isCharacter(commaDelimStack[commaDelimStack.length - 1])) {
                commaDelimStack.pop();
            }
            // If we hit a comma outside of a comma-delimited syntax, it means
            // that we're at the top level and we're starting a new parameter.
            if (commaDelimStack.length === 0 && token.isCharacter(chars.$COMMA) && current.length > 0) {
                parameters.push(current);
                current = '';
                this.advance();
                continue;
            }
            // Otherwise treat the token as a plain text character in the current parameter.
            current += this.tokenText();
            this.advance();
        }
        if (!this.token().isCharacter(chars.$RPAREN) || commaDelimStack.length > 0) {
            this.error(this.token(), 'Unexpected end of expression');
        }
        if (this.index < this.tokens.length - 1 &&
            !this.tokens[this.index + 1].isCharacter(chars.$COMMA)) {
            this.unexpectedToken(this.tokens[this.index + 1]);
        }
        return parameters;
    }
    tokenText() {
        // Tokens have a toString already which we could use, but for string tokens it omits the quotes.
        // Eventually we could expose this information on the token directly.
        return this.expression.slice(this.start + this.token().index, this.start + this.token().end);
    }
    trackTrigger(name, trigger) {
        trackTrigger(name, this.triggers, this.errors, trigger);
    }
    error(token, message) {
        const newStart = this.span.start.moveBy(this.start + token.index);
        const newEnd = newStart.moveBy(token.end - token.index);
        this.errors.push(new ParseError(new ParseSourceSpan(newStart, newEnd), message));
    }
    unexpectedToken(token) {
        this.error(token, `Unexpected token "${token}"`);
    }
}
/** Adds a trigger to a map of triggers. */
function trackTrigger(name, allTriggers, errors, trigger) {
    if (allTriggers[name]) {
        errors.push(new ParseError(trigger.sourceSpan, `Duplicate "${name}" trigger is not allowed`));
    }
    else {
        allTriggers[name] = trigger;
    }
}
function createIdleTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
    if (parameters.length > 0) {
        throw new Error(`"${OnTriggerType.IDLE}" trigger cannot have parameters`);
    }
    return new t.IdleDeferredTrigger(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function createTimerTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
    if (parameters.length !== 1) {
        throw new Error(`"${OnTriggerType.TIMER}" trigger must have exactly one parameter`);
    }
    const delay = parseDeferredTime(parameters[0]);
    if (delay === null) {
        throw new Error(`Could not parse time value of trigger "${OnTriggerType.TIMER}"`);
    }
    return new t.TimerDeferredTrigger(delay, nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function createImmediateTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan) {
    if (parameters.length > 0) {
        throw new Error(`"${OnTriggerType.IMMEDIATE}" trigger cannot have parameters`);
    }
    return new t.ImmediateDeferredTrigger(nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function createHoverTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan, placeholder) {
    validateReferenceBasedTrigger(OnTriggerType.HOVER, parameters, placeholder);
    return new t.HoverDeferredTrigger(parameters[0] ?? null, nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function createInteractionTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan, placeholder) {
    validateReferenceBasedTrigger(OnTriggerType.INTERACTION, parameters, placeholder);
    return new t.InteractionDeferredTrigger(parameters[0] ?? null, nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function createViewportTrigger(parameters, nameSpan, sourceSpan, prefetchSpan, onSourceSpan, placeholder) {
    validateReferenceBasedTrigger(OnTriggerType.VIEWPORT, parameters, placeholder);
    return new t.ViewportDeferredTrigger(parameters[0] ?? null, nameSpan, sourceSpan, prefetchSpan, onSourceSpan);
}
function validateReferenceBasedTrigger(type, parameters, placeholder) {
    if (parameters.length > 1) {
        throw new Error(`"${type}" trigger can only have zero or one parameters`);
    }
    if (parameters.length === 0) {
        if (placeholder === null) {
            throw new Error(`"${type}" trigger with no parameters can only be placed on an @defer that has a @placeholder block`);
        }
        if (placeholder.children.length !== 1 || !(placeholder.children[0] instanceof t.Element)) {
            throw new Error(`"${type}" trigger with no parameters can only be placed on an @defer that has a ` +
                `@placeholder block with exactly one root element node`);
        }
    }
}
/** Gets the index within an expression at which the trigger parameters start. */
export function getTriggerParametersStart(value, startPosition = 0) {
    let hasFoundSeparator = false;
    for (let i = startPosition; i < value.length; i++) {
        if (SEPARATOR_PATTERN.test(value[i])) {
            hasFoundSeparator = true;
        }
        else if (hasFoundSeparator) {
            return i;
        }
    }
    return -1;
}
/**
 * Parses a time expression from a deferred trigger to
 * milliseconds. Returns null if it cannot be parsed.
 */
export function parseDeferredTime(value) {
    const match = value.match(TIME_PATTERN);
    if (!match) {
        return null;
    }
    const [time, units] = match;
    return parseFloat(time) * (units === 's' ? 1000 : 1);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicjNfZGVmZXJyZWRfdHJpZ2dlcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvcmVuZGVyMy9yM19kZWZlcnJlZF90cmlnZ2Vycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssS0FBSyxNQUFNLFVBQVUsQ0FBQztBQUNsQyxPQUFPLEVBQUMsS0FBSyxFQUFTLFNBQVMsRUFBQyxNQUFNLDRCQUE0QixDQUFDO0FBRW5FLE9BQU8sRUFBQyxVQUFVLEVBQUUsZUFBZSxFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRzFELE9BQU8sS0FBSyxDQUFDLE1BQU0sVUFBVSxDQUFDO0FBRTlCLCtDQUErQztBQUMvQyxNQUFNLFlBQVksR0FBRyxvQkFBb0IsQ0FBQztBQUUxQyx3RUFBd0U7QUFDeEUsTUFBTSxpQkFBaUIsR0FBRyxNQUFNLENBQUM7QUFFakMsb0VBQW9FO0FBQ3BFLE1BQU0sc0JBQXNCLEdBQUcsSUFBSSxHQUFHLENBQUM7SUFDckMsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUM7SUFDOUIsQ0FBQyxLQUFLLENBQUMsU0FBUyxFQUFFLEtBQUssQ0FBQyxTQUFTLENBQUM7SUFDbEMsQ0FBQyxLQUFLLENBQUMsT0FBTyxFQUFFLEtBQUssQ0FBQyxPQUFPLENBQUMsRUFBTyxpQkFBaUI7Q0FDdkQsQ0FBQyxDQUFDO0FBRUgsdUNBQXVDO0FBQ3ZDLElBQUssYUFPSjtBQVBELFdBQUssYUFBYTtJQUNoQiw4QkFBYSxDQUFBO0lBQ2IsZ0NBQWUsQ0FBQTtJQUNmLDRDQUEyQixDQUFBO0lBQzNCLHdDQUF1QixDQUFBO0lBQ3ZCLGdDQUFlLENBQUE7SUFDZixzQ0FBcUIsQ0FBQTtBQUN2QixDQUFDLEVBUEksYUFBYSxLQUFiLGFBQWEsUUFPakI7QUFFRCx3Q0FBd0M7QUFDeEMsTUFBTSxVQUFVLGdC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aHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgY2hhcnMgZnJvbSAnLi4vY2hhcnMnO1xuaW1wb3J0IHtMZXhlciwgVG9rZW4sIFRva2VuVHlwZX0gZnJvbSAnLi4vZXhwcmVzc2lvbl9wYXJzZXIvbGV4ZXInO1xuaW1wb3J0ICogYXMgaHRtbCBmcm9tICcuLi9tbF9wYXJzZXIvYXN0JztcbmltcG9ydCB7UGFyc2VFcnJvciwgUGFyc2VTb3VyY2VTcGFufSBmcm9tICcuLi9wYXJzZV91dGlsJztcbmltcG9ydCB7QmluZGluZ1BhcnNlcn0gZnJvbSAnLi4vdGVtcGxhdGVfcGFyc2VyL2JpbmRpbmdfcGFyc2VyJztcblxuaW1wb3J0ICogYXMgdCBmcm9tICcuL3IzX2FzdCc7XG5cbi8qKiBQYXR0ZXJuIGZvciBhIHRpbWluZyB2YWx1ZSBpbiBhIHRyaWdnZXIuICovXG5jb25zdCBUSU1FX1BBVFRFUk4gPSAvXlxcZCtcXC4/XFxkKihtc3xzKT8kLztcblxuLyoqIFBhdHRlcm4gZm9yIGEgc2VwYXJhdG9yIGJldHdlZW4ga2V5d29yZHMgaW4gYSB0cmlnZ2VyIGV4cHJlc3Npb24uICovXG5jb25zdCBTRVBBUkFUT1JfUEFUVEVSTiA9IC9eXFxzJC87XG5cbi8qKiBQYWlycyBvZiBjaGFyYWN0ZXJzIHRoYXQgZm9ybSBzeW50YXggdGhhdCBpcyBjb21tYS1kZWxpbWl0ZWQuICovXG5jb25zdCBDT01NQV9ERUxJTUlURURfU1lOVEFYID0gbmV3IE1hcChbXG4gIFtjaGFycy4kTEJSQUNFLCBjaGFycy4kUkJSQUNFXSwgICAgICAvLyBPYmplY3QgbGl0ZXJhbHNcbiAgW2NoYXJzLiRMQlJBQ0tFVCwgY2hhcnMuJFJCUkFDS0VUXSwgIC8vIEFycmF5IGxpdGVyYWxzXG4gIFtjaGFycy4kTFBBUkVOLCBjaGFycy4kUlBBUkVOXSwgICAgICAvLyBGdW5jdGlvbiBjYWxsc1xuXSk7XG5cbi8qKiBQb3NzaWJsZSB0eXBlcyBvZiBgb25gIHRyaWdnZXJzLiAqL1xuZW51bSBPblRyaWdnZXJUeXBlIHtcbiAgSURMRSA9ICdpZGxlJyxcbiAgVElNRVIgPSAndGltZXInLFxuICBJTlRFUkFDVElPTiA9ICdpbnRlcmFjdGlvbicsXG4gIElNTUVESUFURSA9ICdpbW1lZGlhdGUnLFxuICBIT1ZFUiA9ICdob3ZlcicsXG4gIFZJRVdQT1JUID0gJ3ZpZXdwb3J0Jyxcbn1cblxuLyoqIFBhcnNlcyBhIGB3aGVuYCBkZWZlcnJlZCB0cmlnZ2VyLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlV2hlblRyaWdnZXIoXG4gICAge2V4cHJlc3Npb24sIHNvdXJjZVNwYW59OiBodG1sLkJsb2NrUGFyYW1ldGVyLCBiaW5kaW5nUGFyc2VyOiBCaW5kaW5nUGFyc2VyLFxuICAgIHRyaWdnZXJzOiB0LkRlZmVycmVkQmxvY2tUcmlnZ2VycywgZXJyb3JzOiBQYXJzZUVycm9yW10pOiB2b2lkIHtcbiAgY29uc3Qgd2hlbkluZGV4ID0gZXhwcmVzc2lvbi5pbmRleE9mKCd3aGVuJyk7XG4gIGNvbnN0IHdoZW5Tb3VyY2VTcGFuID0gbmV3IFBhcnNlU291cmNlU3BhbihcbiAgICAgIHNvdXJjZVNwYW4uc3RhcnQubW92ZUJ5KHdoZW5JbmRleCksIHNvdXJjZVNwYW4uc3RhcnQubW92ZUJ5KHdoZW5JbmRleCArICd3aGVuJy5sZW5ndGgpKTtcbiAgY29uc3QgcHJlZmV0Y2hTcGFuID0gZ2V0UHJlZmV0Y2hTcGFuKGV4cHJlc3Npb24sIHNvdXJjZVNwYW4pO1xuXG4gIC8vIFRoaXMgaXMgaGVyZSBqdXN0IHRvIGJlIHNhZmUsIHdlIHNob3VsZG4ndCBlbnRlciB0aGlzIGZ1bmN0aW9uXG4gIC8vIGluIHRoZSBmaXJzdCBwbGFjZSBpZiBhIGJsb2NrIGRvZXNuJ3QgaGF2ZSB0aGUgXCJ3aGVuXCIga2V5d29yZC5cbiAgaWYgKHdoZW5JbmRleCA9PT0gLTEpIHtcbiAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihzb3VyY2VTcGFuLCBgQ291bGQgbm90IGZpbmQgXCJ3aGVuXCIga2V5d29yZCBpbiBleHByZXNzaW9uYCkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHN0YXJ0ID0gZ2V0VHJpZ2dlclBhcmFtZXRlcnNTdGFydChleHByZXNzaW9uLCB3aGVuSW5kZXggKyAxKTtcbiAgICBjb25zdCBwYXJzZWQgPSBiaW5kaW5nUGFyc2VyLnBhcnNlQmluZGluZyhcbiAgICAgICAgZXhwcmVzc2lvbi5zbGljZShzdGFydCksIGZhbHNlLCBzb3VyY2VTcGFuLCBzb3VyY2VTcGFuLnN0YXJ0Lm9mZnNldCArIHN0YXJ0KTtcbiAgICB0cmFja1RyaWdnZXIoXG4gICAgICAgICd3aGVuJywgdHJpZ2dlcnMsIGVycm9ycyxcbiAgICAgICAgbmV3IHQuQm91bmREZWZlcnJlZFRyaWdnZXIocGFyc2VkLCBzb3VyY2VTcGFuLCBwcmVmZXRjaFNwYW4sIHdoZW5Tb3VyY2VTcGFuKSk7XG4gIH1cbn1cblxuLyoqIFBhcnNlcyBhbiBgb25gIHRyaWdnZXIgKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZU9uVHJpZ2dlcihcbiAgICB7ZXhwcmVzc2lvbiwgc291cmNlU3Bhbn06IGh0bWwuQmxvY2tQYXJhbWV0ZXIsIHRyaWdnZXJzOiB0LkRlZmVycmVkQmxvY2tUcmlnZ2VycyxcbiAgICBlcnJvcnM6IFBhcnNlRXJyb3JbXSwgcGxhY2Vob2xkZXI6IHQuRGVmZXJyZWRCbG9ja1BsYWNlaG9sZGVyfG51bGwpOiB2b2lkIHtcbiAgY29uc3Qgb25JbmRleCA9IGV4cHJlc3Npb24uaW5kZXhPZignb24nKTtcbiAgY29uc3Qgb25Tb3VyY2VTcGFuID0gbmV3IFBhcnNlU291cmNlU3BhbihcbiAgICAgIHNvdXJjZVNwYW4uc3RhcnQubW92ZUJ5KG9uSW5kZXgpLCBzb3VyY2VTcGFuLnN0YXJ0Lm1vdmVCeShvbkluZGV4ICsgJ29uJy5sZW5ndGgpKTtcbiAgY29uc3QgcHJlZmV0Y2hTcGFuID0gZ2V0UHJlZmV0Y2hTcGFuKGV4cHJlc3Npb24sIHNvdXJjZVNwYW4pO1xuXG4gIC8vIFRoaXMgaXMgaGVyZSBqdXN0IHRvIGJlIHNhZmUsIHdlIHNob3VsZG4ndCBlbnRlciB0aGlzIGZ1bmN0aW9uXG4gIC8vIGluIHRoZSBmaXJzdCBwbGFjZSBpZiBhIGJsb2NrIGRvZXNuJ3QgaGF2ZSB0aGUgXCJvblwiIGtleXdvcmQuXG4gIGlmIChvbkluZGV4ID09PSAtMSkge1xuICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKHNvdXJjZVNwYW4sIGBDb3VsZCBub3QgZmluZCBcIm9uXCIga2V5d29yZCBpbiBleHByZXNzaW9uYCkpO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IHN0YXJ0ID0gZ2V0VHJpZ2dlclBhcmFtZXRlcnNTdGFydChleHByZXNzaW9uLCBvbkluZGV4ICsgMSk7XG4gICAgY29uc3QgcGFyc2VyID0gbmV3IE9uVHJpZ2dlclBhcnNlcihcbiAgICAgICAgZXhwcmVzc2lvbiwgc3RhcnQsIHNvdXJjZVNwYW4sIHRyaWdnZXJzLCBlcnJvcnMsIHBsYWNlaG9sZGVyLCBwcmVmZXRjaFNwYW4sIG9uU291cmNlU3Bhbik7XG4gICAgcGFyc2VyLnBhcnNlKCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gZ2V0UHJlZmV0Y2hTcGFuKGV4cHJlc3Npb246IHN0cmluZywgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuKSB7XG4gIGlmICghZXhwcmVzc2lvbi5zdGFydHNXaXRoKCdwcmVmZXRjaCcpKSB7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbiAgcmV0dXJuIG5ldyBQYXJzZVNvdXJjZVNwYW4oc291cmNlU3Bhbi5zdGFydCwgc291cmNlU3Bhbi5zdGFydC5tb3ZlQnkoJ3ByZWZldGNoJy5sZW5ndGgpKTtcbn1cblxuXG5jbGFzcyBPblRyaWdnZXJQYXJzZXIge1xuICBwcml2YXRlIGluZGV4ID0gMDtcbiAgcHJpdmF0ZSB0b2tlbnM6IFRva2VuW107XG5cbiAgY29uc3RydWN0b3IoXG4gICAgICBwcml2YXRlIGV4cHJlc3Npb246IHN0cmluZywgcHJpdmF0ZSBzdGFydDogbnVtYmVyLCBwcml2YXRlIHNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICAgIHByaXZhdGUgdHJpZ2dlcnM6IHQuRGVmZXJyZWRCbG9ja1RyaWdnZXJzLCBwcml2YXRlIGVycm9yczogUGFyc2VFcnJvcltdLFxuICAgICAgcHJpdmF0ZSBwbGFjZWhvbGRlcjogdC5EZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXJ8bnVsbCxcbiAgICAgIHByaXZhdGUgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgcHJpdmF0ZSBvblNvdXJjZVNwYW46IFBhcnNlU291cmNlU3Bhbikge1xuICAgIHRoaXMudG9rZW5zID0gbmV3IExleGVyKCkudG9rZW5pemUoZXhwcmVzc2lvbi5zbGljZShzdGFydCkpO1xuICB9XG5cbiAgcGFyc2UoKTogdm9pZCB7XG4gICAgd2hpbGUgKHRoaXMudG9rZW5zLmxlbmd0aCA+IDAgJiYgdGhpcy5pbmRleCA8IHRoaXMudG9rZW5zLmxlbmd0aCkge1xuICAgICAgY29uc3QgdG9rZW4gPSB0aGlzLnRva2VuKCk7XG5cbiAgICAgIGlmICghdG9rZW4uaXNJZGVudGlmaWVyKCkpIHtcbiAgICAgICAgdGhpcy51bmV4cGVjdGVkVG9rZW4odG9rZW4pO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgLy8gQW4gaWRlbnRpZmllciBpbW1lZGlhdGVseSBmb2xsb3dlZCBieSBhIGNvbW1hIG9yIHRoZSBlbmQgb2ZcbiAgICAgIC8vIHRoZSBleHByZXNzaW9uIGNhbm5vdCBoYXZlIHBhcmFtZXRlcnMgc28gd2UgY2FuIGV4aXQgZWFybHkuXG4gICAgICBpZiAodGhpcy5pc0ZvbGxvd2VkQnlPckxhc3QoY2hhcnMuJENPTU1BKSkge1xuICAgICAgICB0aGlzLmNvbnN1bWVUcmlnZ2VyKHRva2VuLCBbXSk7XG4gICAgICAgIHRoaXMuYWR2YW5jZSgpO1xuICAgICAgfSBlbHNlIGlmICh0aGlzLmlzRm9sbG93ZWRCeU9yTGFzdChjaGFycy4kTFBBUkVOKSkge1xuICAgICAgICB0aGlzLmFkdmFuY2UoKTsgIC8vIEFkdmFuY2UgdG8gdGhlIG9wZW5pbmcgcGFyZW4uXG4gICAgICAgIGNvbnN0IHByZXZFcnJvcnMgPSB0aGlzLmVycm9ycy5sZW5ndGg7XG4gICAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0aGlzLmNvbnN1bWVQYXJhbWV0ZXJzKCk7XG4gICAgICAgIGlmICh0aGlzLmVycm9ycy5sZW5ndGggIT09IHByZXZFcnJvcnMpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICB0aGlzLmNvbnN1bWVUcmlnZ2VyKHRva2VuLCBwYXJhbWV0ZXJzKTtcbiAgICAgICAgdGhpcy5hZHZhbmNlKCk7ICAvLyBBZHZhbmNlIHBhc3QgdGhlIGNsb3NpbmcgcGFyZW4uXG4gICAgICB9IGVsc2UgaWYgKHRoaXMuaW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKSB7XG4gICAgICAgIHRoaXMudW5leHBlY3RlZFRva2VuKHRoaXMudG9rZW5zW3RoaXMuaW5kZXggKyAxXSk7XG4gICAgICB9XG5cbiAgICAgIHRoaXMuYWR2YW5jZSgpO1xuICAgIH1cbiAgfVxuXG4gIHByaXZhdGUgYWR2YW5jZSgpIHtcbiAgICB0aGlzLmluZGV4Kys7XG4gIH1cblxuICBwcml2YXRlIGlzRm9sbG93ZWRCeU9yTGFzdChjaGFyOiBudW1iZXIpOiBib29sZWFuIHtcbiAgICBpZiAodGhpcy5pbmRleCA9PT0gdGhpcy50b2tlbnMubGVuZ3RoIC0gMSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMudG9rZW5zW3RoaXMuaW5kZXggKyAxXS5pc0NoYXJhY3RlcihjaGFyKTtcbiAgfVxuXG4gIHByaXZhdGUgdG9rZW4oKTogVG9rZW4ge1xuICAgIHJldHVybiB0aGlzLnRva2Vuc1tNYXRoLm1pbih0aGlzLmluZGV4LCB0aGlzLnRva2Vucy5sZW5ndGggLSAxKV07XG4gIH1cblxuICBwcml2YXRlIGNvbnN1bWVUcmlnZ2VyKGlkZW50aWZpZXI6IFRva2VuLCBwYXJhbWV0ZXJzOiBzdHJpbmdbXSkge1xuICAgIGNvbnN0IHRyaWdnZXJOYW1lU3RhcnRTcGFuID1cbiAgICAgICAgdGhpcy5zcGFuLnN0YXJ0Lm1vdmVCeSh0aGlzLnN0YXJ0ICsgaWRlbnRpZmllci5pbmRleCAtIHRoaXMudG9rZW5zWzBdLmluZGV4KTtcbiAgICBjb25zdCBuYW1lU3BhbiA9IG5ldyBQYXJzZVNvdXJjZVNwYW4oXG4gICAgICAgIHRyaWdnZXJOYW1lU3RhcnRTcGFuLCB0cmlnZ2VyTmFtZVN0YXJ0U3Bhbi5tb3ZlQnkoaWRlbnRpZmllci5zdHJWYWx1ZS5sZW5ndGgpKTtcbiAgICBjb25zdCBlbmRTcGFuID0gdHJpZ2dlck5hbWVTdGFydFNwYW4ubW92ZUJ5KHRoaXMudG9rZW4oKS5lbmQgLSBpZGVudGlmaWVyLmluZGV4KTtcblxuICAgIC8vIFB1dCB0aGUgcHJlZmV0Y2ggYW5kIG9uIHNwYW5zIHdpdGggdGhlIGZpcnN0IHRyaWdnZXJcbiAgICAvLyBUaGlzIHNob3VsZCBtYXliZSBiZSByZWZhY3RvcmVkIHRvIGhhdmUgc29tZXRoaW5nIGxpa2UgYW4gb3V0ZXIgT25Hcm91cCBBU1RcbiAgICAvLyBTaW5jZSB0cmlnZ2VycyBjYW4gYmUgZ3JvdXBlZCB3aXRoIGNvbW1hcyBcIm9uIGhvdmVyKHgpLCBpbnRlcmFjdGlvbih5KVwiXG4gICAgY29uc3QgaXNGaXJzdFRyaWdnZXIgPSBpZGVudGlmaWVyLmluZGV4ID09PSAwO1xuICAgIGNvbnN0IG9uU291cmNlU3BhbiA9IGlzRmlyc3RUcmlnZ2VyID8gdGhpcy5vblNvdXJjZVNwYW4gOiBudWxsO1xuICAgIGNvbnN0IHByZWZldGNoU291cmNlU3BhbiA9IGlzRmlyc3RUcmlnZ2VyID8gdGhpcy5wcmVmZXRjaFNwYW4gOiBudWxsO1xuICAgIGNvbnN0IHNvdXJjZVNwYW4gPVxuICAgICAgICBuZXcgUGFyc2VTb3VyY2VTcGFuKGlzRmlyc3RUcmlnZ2VyID8gdGhpcy5zcGFuLnN0YXJ0IDogdHJpZ2dlck5hbWVTdGFydFNwYW4sIGVuZFNwYW4pO1xuXG4gICAgdHJ5IHtcbiAgICAgIHN3aXRjaCAoaWRlbnRpZmllci50b1N0cmluZygpKSB7XG4gICAgICAgIGNhc2UgT25UcmlnZ2VyVHlwZS5JRExFOlxuICAgICAgICAgIHRoaXMudHJhY2tUcmlnZ2VyKFxuICAgICAgICAgICAgICAnaWRsZScsXG4gICAgICAgICAgICAgIGNyZWF0ZUlkbGVUcmlnZ2VyKFxuICAgICAgICAgICAgICAgICAgcGFyYW1ldGVycywgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHByZWZldGNoU291cmNlU3Bhbiwgb25Tb3VyY2VTcGFuKSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSBPblRyaWdnZXJUeXBlLlRJTUVSOlxuICAgICAgICAgIHRoaXMudHJhY2tUcmlnZ2VyKFxuICAgICAgICAgICAgICAndGltZXInLFxuICAgICAgICAgICAgICBjcmVhdGVUaW1lclRyaWdnZXIoXG4gICAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzLCBuYW1lU3Bhbiwgc291cmNlU3BhbiwgdGhpcy5wcmVmZXRjaFNwYW4sIHRoaXMub25Tb3VyY2VTcGFuKSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSBPblRyaWdnZXJUeXBlLklOVEVSQUNUSU9OOlxuICAgICAgICAgIHRoaXMudHJhY2tUcmlnZ2VyKFxuICAgICAgICAgICAgICAnaW50ZXJhY3Rpb24nLFxuICAgICAgICAgICAgICBjcmVhdGVJbnRlcmFjdGlvblRyaWdnZXIoXG4gICAgICAgICAgICAgICAgICBwYXJhbWV0ZXJzLCBuYW1lU3Bhbiwgc291cmNlU3BhbiwgdGhpcy5wcmVmZXRjaFNwYW4sIHRoaXMub25Tb3VyY2VTcGFuLFxuICAgICAgICAgICAgICAgICAgdGhpcy5wbGFjZWhvbGRlcikpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgT25UcmlnZ2VyVHlwZS5JTU1FRElBVEU6XG4gICAgICAgICAgdGhpcy50cmFja1RyaWdnZXIoXG4gICAgICAgICAgICAgICdpbW1lZGlhdGUnLFxuICAgICAgICAgICAgICBjcmVhdGVJbW1lZGlhdGVUcmlnZ2VyKFxuICAgICAgICAgICAgICAgICAgcGFyYW1ldGVycywgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHRoaXMucHJlZmV0Y2hTcGFuLCB0aGlzLm9uU291cmNlU3BhbikpO1xuICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgIGNhc2UgT25UcmlnZ2VyVHlwZS5IT1ZFUjpcbiAgICAgICAgICB0aGlzLnRyYWNrVHJpZ2dlcihcbiAgICAgICAgICAgICAgJ2hvdmVyJyxcbiAgICAgICAgICAgICAgY3JlYXRlSG92ZXJUcmlnZ2VyKFxuICAgICAgICAgICAgICAgICAgcGFyYW1ldGVycywgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHRoaXMucHJlZmV0Y2hTcGFuLCB0aGlzLm9uU291cmNlU3BhbixcbiAgICAgICAgICAgICAgICAgIHRoaXMucGxhY2Vob2xkZXIpKTtcbiAgICAgICAgICBicmVhaztcblxuICAgICAgICBjYXNlIE9uVHJpZ2dlclR5cGUuVklFV1BPUlQ6XG4gICAgICAgICAgdGhpcy50cmFja1RyaWdnZXIoXG4gICAgICAgICAgICAgICd2aWV3cG9ydCcsXG4gICAgICAgICAgICAgIGNyZWF0ZVZpZXdwb3J0VHJpZ2dlcihcbiAgICAgICAgICAgICAgICAgIHBhcmFtZXRlcnMsIG5hbWVTcGFuLCBzb3VyY2VTcGFuLCB0aGlzLnByZWZldGNoU3BhbiwgdGhpcy5vblNvdXJjZVNwYW4sXG4gICAgICAgICAgICAgICAgICB0aGlzLnBsYWNlaG9sZGVyKSk7XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgZGVmYXVsdDpcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYFVucmVjb2duaXplZCB0cmlnZ2VyIHR5cGUgXCIke2lkZW50aWZpZXJ9XCJgKTtcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICB0aGlzLmVycm9yKGlkZW50aWZpZXIsIChlIGFzIEVycm9yKS5tZXNzYWdlKTtcbiAgICB9XG4gIH1cblxuICBwcml2YXRlIGNvbnN1bWVQYXJhbWV0ZXJzKCk6IHN0cmluZ1tdIHtcbiAgICBjb25zdCBwYXJhbWV0ZXJzOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgaWYgKCF0aGlzLnRva2VuKCkuaXNDaGFyYWN0ZXIoY2hhcnMuJExQQVJFTikpIHtcbiAgICAgIHRoaXMudW5leHBlY3RlZFRva2VuKHRoaXMudG9rZW4oKSk7XG4gICAgICByZXR1cm4gcGFyYW1ldGVycztcbiAgICB9XG5cbiAgICB0aGlzLmFkdmFuY2UoKTtcblxuICAgIGNvbnN0IGNvbW1hRGVsaW1TdGFjazogbnVtYmVyW10gPSBbXTtcbiAgICBsZXQgY3VycmVudCA9ICcnO1xuXG4gICAgd2hpbGUgKHRoaXMuaW5kZXggPCB0aGlzLnRva2Vucy5sZW5ndGgpIHtcbiAgICAgIGNvbnN0IHRva2VuID0gdGhpcy50b2tlbigpO1xuXG4gICAgICAvLyBTdG9wIHBhcnNpbmcgaWYgd2UndmUgaGl0IHRoZSBlbmQgY2hhcmFjdGVyIGFuZCB3ZSdyZSBvdXRzaWRlIG9mIGEgY29tbWEtZGVsaW1pdGVkIHN5bnRheC5cbiAgICAgIC8vIE5vdGUgdGhhdCB3ZSBkb24ndCBuZWVkIHRvIGFjY291bnQgZm9yIHN0cmluZ3MgaGVyZSBzaW5jZSB0aGUgbGV4ZXIgYWxyZWFkeSBwYXJzZWQgdGhlbVxuICAgICAgLy8gaW50byBzdHJpbmcgdG9rZW5zLlxuICAgICAgaWYgKHRva2VuLmlzQ2hhcmFjdGVyKGNoYXJzLiRSUEFSRU4pICYmIGNvbW1hRGVsaW1TdGFjay5sZW5ndGggPT09IDApIHtcbiAgICAgICAgaWYgKGN1cnJlbnQubGVuZ3RoKSB7XG4gICAgICAgICAgcGFyYW1ldGVycy5wdXNoKGN1cnJlbnQpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuXG4gICAgICAvLyBJbiB0aGUgYG9uYCBtaWNyb3N5bnRheCBcInRvcC1sZXZlbFwiIGNvbW1hcyAoZS5nLiBvbmVzIG91dHNpZGUgb2YgYW4gcGFyYW1ldGVycykgc2VwYXJhdGVcbiAgICAgIC8vIHRoZSBkaWZmZXJlbnQgdHJpZ2dlcnMgKGUuZy4gYG9uIGlkbGUsdGltZXIoNTAwKWApLiBUaGlzIGlzIHByb2JsZW1hdGljLCBiZWNhdXNlIHRoZVxuICAgICAgLy8gZnVuY3Rpb24tbGlrZSBzeW50YXggYWxzbyBpbXBsaWVzIHRoYXQgbXVsdGlwbGUgcGFyYW1ldGVycyBjYW4gYmUgcGFzc2VkIGludG8gdGhlXG4gICAgICAvLyBpbmRpdmlkdWFsIHRyaWdnZXIgKGUuZy4gYG9uIGZvbyhhLCBiKWApLiBUbyBhdm9pZCB0cmlwcGluZyB1cCB0aGUgcGFyc2VyIHdpdGggY29tbWFzIHRoYXRcbiAgICAgIC8vIGFyZSBwYXJ0IG9mIG90aGVyIHNvcnRzIG9mIHN5bnRheCAob2JqZWN0IGxpdGVyYWxzLCBhcnJheXMpLCB3ZSB0cmVhdCBhbnl0aGluZyBpbnNpZGVcbiAgICAgIC8vIGEgY29tbWEtZGVsaW1pdGVkIHN5bnRheCBibG9jayBhcyBwbGFpbiB0ZXh0LlxuICAgICAgaWYgKHRva2VuLnR5cGUgPT09IFRva2VuVHlwZS5DaGFyYWN0ZXIgJiYgQ09NTUFfREVMSU1JVEVEX1NZTlRBWC5oYXModG9rZW4ubnVtVmFsdWUpKSB7XG4gICAgICAgIGNvbW1hRGVsaW1TdGFjay5wdXNoKENPTU1BX0RFTElNSVRFRF9TWU5UQVguZ2V0KHRva2VuLm51bVZhbHVlKSEpO1xuICAgICAgfVxuXG4gICAgICBpZiAoY29tbWFEZWxpbVN0YWNrLmxlbmd0aCA+IDAgJiZcbiAgICAgICAgICB0b2tlbi5pc0NoYXJhY3Rlcihjb21tYURlbGltU3RhY2tbY29tbWFEZWxpbVN0YWNrLmxlbmd0aCAtIDFdKSkge1xuICAgICAgICBjb21tYURlbGltU3RhY2sucG9wKCk7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHdlIGhpdCBhIGNvbW1hIG91dHNpZGUgb2YgYSBjb21tYS1kZWxpbWl0ZWQgc3ludGF4LCBpdCBtZWFuc1xuICAgICAgLy8gdGhhdCB3ZSdyZSBhdCB0aGUgdG9wIGxldmVsIGFuZCB3ZSdyZSBzdGFydGluZyBhIG5ldyBwYXJhbWV0ZXIuXG4gICAgICBpZiAoY29tbWFEZWxpbVN0YWNrLmxlbmd0aCA9PT0gMCAmJiB0b2tlbi5pc0NoYXJhY3RlcihjaGFycy4kQ09NTUEpICYmIGN1cnJlbnQubGVuZ3RoID4gMCkge1xuICAgICAgICBwYXJhbWV0ZXJzLnB1c2goY3VycmVudCk7XG4gICAgICAgIGN1cnJlbnQgPSAnJztcbiAgICAgICAgdGhpcy5hZHZhbmNlKCk7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBPdGhlcndpc2UgdHJlYXQgdGhlIHRva2VuIGFzIGEgcGxhaW4gdGV4dCBjaGFyYWN0ZXIgaW4gdGhlIGN1cnJlbnQgcGFyYW1ldGVyLlxuICAgICAgY3VycmVudCArPSB0aGlzLnRva2VuVGV4dCgpO1xuICAgICAgdGhpcy5hZHZhbmNlKCk7XG4gICAgfVxuXG4gICAgaWYgKCF0aGlzLnRva2VuKCkuaXNDaGFyYWN0ZXIoY2hhcnMuJFJQQVJFTikgfHwgY29tbWFEZWxpbVN0YWNrLmxlbmd0aCA+IDApIHtcbiAgICAgIHRoaXMuZXJyb3IodGhpcy50b2tlbigpLCAnVW5leHBlY3RlZCBlbmQgb2YgZXhwcmVzc2lvbicpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLmluZGV4IDwgdGhpcy50b2tlbnMubGVuZ3RoIC0gMSAmJlxuICAgICAgICAhdGhpcy50b2tlbnNbdGhpcy5pbmRleCArIDFdLmlzQ2hhcmFjdGVyKGNoYXJzLiRDT01NQSkpIHtcbiAgICAgIHRoaXMudW5leHBlY3RlZFRva2VuKHRoaXMudG9rZW5zW3RoaXMuaW5kZXggKyAxXSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHBhcmFtZXRlcnM7XG4gIH1cblxuICBwcml2YXRlIHRva2VuVGV4dCgpOiBzdHJpbmcge1xuICAgIC8vIFRva2VucyBoYXZlIGEgdG9TdHJpbmcgYWxyZWFkeSB3aGljaCB3ZSBjb3VsZCB1c2UsIGJ1dCBmb3Igc3RyaW5nIHRva2VucyBpdCBvbWl0cyB0aGUgcXVvdGVzLlxuICAgIC8vIEV2ZW50dWFsbHkgd2UgY291bGQgZXhwb3NlIHRoaXMgaW5mb3JtYXRpb24gb24gdGhlIHRva2VuIGRpcmVjdGx5LlxuICAgIHJldHVybiB0aGlzLmV4cHJlc3Npb24uc2xpY2UodGhpcy5zdGFydCArIHRoaXMudG9rZW4oKS5pbmRleCwgdGhpcy5zdGFydCArIHRoaXMudG9rZW4oKS5lbmQpO1xuICB9XG5cbiAgcHJpdmF0ZSB0cmFja1RyaWdnZXIobmFtZToga2V5b2YgdC5EZWZlcnJlZEJsb2NrVHJpZ2dlcnMsIHRyaWdnZXI6IHQuRGVmZXJyZWRUcmlnZ2VyKTogdm9pZCB7XG4gICAgdHJhY2tUcmlnZ2VyKG5hbWUsIHRoaXMudHJpZ2dlcnMsIHRoaXMuZXJyb3JzLCB0cmlnZ2VyKTtcbiAgfVxuXG4gIHByaXZhdGUgZXJyb3IodG9rZW46IFRva2VuLCBtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcbiAgICBjb25zdCBuZXdTdGFydCA9IHRoaXMuc3Bhbi5zdGFydC5tb3ZlQnkodGhpcy5zdGFydCArIHRva2VuLmluZGV4KTtcbiAgICBjb25zdCBuZXdFbmQgPSBuZXdTdGFydC5tb3ZlQnkodG9rZW4uZW5kIC0gdG9rZW4uaW5kZXgpO1xuICAgIHRoaXMuZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IobmV3IFBhcnNlU291cmNlU3BhbihuZXdTdGFydCwgbmV3RW5kKSwgbWVzc2FnZSkpO1xuICB9XG5cbiAgcHJpdmF0ZSB1bmV4cGVjdGVkVG9rZW4odG9rZW46IFRva2VuKSB7XG4gICAgdGhpcy5lcnJvcih0b2tlbiwgYFVuZXhwZWN0ZWQgdG9rZW4gXCIke3Rva2VufVwiYCk7XG4gIH1cbn1cblxuLyoqIEFkZHMgYSB0cmlnZ2VyIHRvIGEgbWFwIG9mIHRyaWdnZXJzLiAqL1xuZnVuY3Rpb24gdHJhY2tUcmlnZ2VyKFxuICAgIG5hbWU6IGtleW9mIHQuRGVmZXJyZWRCbG9ja1RyaWdnZXJzLCBhbGxUcmlnZ2VyczogdC5EZWZlcnJlZEJsb2NrVHJpZ2dlcnMsIGVycm9yczogUGFyc2VFcnJvcltdLFxuICAgIHRyaWdnZXI6IHQuRGVmZXJyZWRUcmlnZ2VyKSB7XG4gIGlmIChhbGxUcmlnZ2Vyc1tuYW1lXSkge1xuICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKHRyaWdnZXIuc291cmNlU3BhbiwgYER1cGxpY2F0ZSBcIiR7bmFtZX1cIiB0cmlnZ2VyIGlzIG5vdCBhbGxvd2VkYCkpO1xuICB9IGVsc2Uge1xuICAgIGFsbFRyaWdnZXJzW25hbWVdID0gdHJpZ2dlciBhcyBhbnk7XG4gIH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlSWRsZVRyaWdnZXIoXG4gICAgcGFyYW1ldGVyczogc3RyaW5nW10sXG4gICAgbmFtZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICBvblNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbnxudWxsLFxuICAgICk6IHQuSWRsZURlZmVycmVkVHJpZ2dlciB7XG4gIGlmIChwYXJhbWV0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFwiJHtPblRyaWdnZXJUeXBlLklETEV9XCIgdHJpZ2dlciBjYW5ub3QgaGF2ZSBwYXJhbWV0ZXJzYCk7XG4gIH1cblxuICByZXR1cm4gbmV3IHQuSWRsZURlZmVycmVkVHJpZ2dlcihuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVUaW1lclRyaWdnZXIoXG4gICAgcGFyYW1ldGVyczogc3RyaW5nW10sXG4gICAgbmFtZVNwYW46IFBhcnNlU291cmNlU3BhbixcbiAgICBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICBvblNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbnxudWxsLFxuKSB7XG4gIGlmIChwYXJhbWV0ZXJzLmxlbmd0aCAhPT0gMSkge1xuICAgIHRocm93IG5ldyBFcnJvcihgXCIke09uVHJpZ2dlclR5cGUuVElNRVJ9XCIgdHJpZ2dlciBtdXN0IGhhdmUgZXhhY3RseSBvbmUgcGFyYW1ldGVyYCk7XG4gIH1cblxuICBjb25zdCBkZWxheSA9IHBhcnNlRGVmZXJyZWRUaW1lKHBhcmFtZXRlcnNbMF0pO1xuXG4gIGlmIChkZWxheSA9PT0gbnVsbCkge1xuICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHBhcnNlIHRpbWUgdmFsdWUgb2YgdHJpZ2dlciBcIiR7T25UcmlnZ2VyVHlwZS5USU1FUn1cImApO1xuICB9XG5cbiAgcmV0dXJuIG5ldyB0LlRpbWVyRGVmZXJyZWRUcmlnZ2VyKGRlbGF5LCBuYW1lU3Bhbiwgc291cmNlU3BhbiwgcHJlZmV0Y2hTcGFuLCBvblNvdXJjZVNwYW4pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVJbW1lZGlhdGVUcmlnZ2VyKFxuICAgIHBhcmFtZXRlcnM6IHN0cmluZ1tdLFxuICAgIG5hbWVTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgc291cmNlU3BhbjogUGFyc2VTb3VyY2VTcGFuLFxuICAgIHByZWZldGNoU3BhbjogUGFyc2VTb3VyY2VTcGFufG51bGwsXG4gICAgb25Tb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICApOiB0LkltbWVkaWF0ZURlZmVycmVkVHJpZ2dlciB7XG4gIGlmIChwYXJhbWV0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFwiJHtPblRyaWdnZXJUeXBlLklNTUVESUFURX1cIiB0cmlnZ2VyIGNhbm5vdCBoYXZlIHBhcmFtZXRlcnNgKTtcbiAgfVxuXG4gIHJldHVybiBuZXcgdC5JbW1lZGlhdGVEZWZlcnJlZFRyaWdnZXIobmFtZVNwYW4sIHNvdXJjZVNwYW4sIHByZWZldGNoU3Bhbiwgb25Tb3VyY2VTcGFuKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSG92ZXJUcmlnZ2VyKFxuICAgIHBhcmFtZXRlcnM6IHN0cmluZ1tdLCBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgb25Tb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICBwbGFjZWhvbGRlcjogdC5EZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXJ8bnVsbCk6IHQuSG92ZXJEZWZlcnJlZFRyaWdnZXIge1xuICB2YWxpZGF0ZVJlZmVyZW5jZUJhc2VkVHJpZ2dlcihPblRyaWdnZXJUeXBlLkhPVkVSLCBwYXJhbWV0ZXJzLCBwbGFjZWhvbGRlcik7XG4gIHJldHVybiBuZXcgdC5Ib3ZlckRlZmVycmVkVHJpZ2dlcihcbiAgICAgIHBhcmFtZXRlcnNbMF0gPz8gbnVsbCwgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHByZWZldGNoU3Bhbiwgb25Tb3VyY2VTcGFuKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlSW50ZXJhY3Rpb25UcmlnZ2VyKFxuICAgIHBhcmFtZXRlcnM6IHN0cmluZ1tdLCBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgb25Tb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICBwbGFjZWhvbGRlcjogdC5EZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXJ8bnVsbCk6IHQuSW50ZXJhY3Rpb25EZWZlcnJlZFRyaWdnZXIge1xuICB2YWxpZGF0ZVJlZmVyZW5jZUJhc2VkVHJpZ2dlcihPblRyaWdnZXJUeXBlLklOVEVSQUNUSU9OLCBwYXJhbWV0ZXJzLCBwbGFjZWhvbGRlcik7XG4gIHJldHVybiBuZXcgdC5JbnRlcmFjdGlvbkRlZmVycmVkVHJpZ2dlcihcbiAgICAgIHBhcmFtZXRlcnNbMF0gPz8gbnVsbCwgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHByZWZldGNoU3Bhbiwgb25Tb3VyY2VTcGFuKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVmlld3BvcnRUcmlnZ2VyKFxuICAgIHBhcmFtZXRlcnM6IHN0cmluZ1tdLCBuYW1lU3BhbjogUGFyc2VTb3VyY2VTcGFuLCBzb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgcHJlZmV0Y2hTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCwgb25Tb3VyY2VTcGFuOiBQYXJzZVNvdXJjZVNwYW58bnVsbCxcbiAgICBwbGFjZWhvbGRlcjogdC5EZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXJ8bnVsbCk6IHQuVmlld3BvcnREZWZlcnJlZFRyaWdnZXIge1xuICB2YWxpZGF0ZVJlZmVyZW5jZUJhc2VkVHJpZ2dlcihPblRyaWdnZXJUeXBlLlZJRVdQT1JULCBwYXJhbWV0ZXJzLCBwbGFjZWhvbGRlcik7XG4gIHJldHVybiBuZXcgdC5WaWV3cG9ydERlZmVycmVkVHJpZ2dlcihcbiAgICAgIHBhcmFtZXRlcnNbMF0gPz8gbnVsbCwgbmFtZVNwYW4sIHNvdXJjZVNwYW4sIHByZWZldGNoU3Bhbiwgb25Tb3VyY2VTcGFuKTtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVSZWZlcmVuY2VCYXNlZFRyaWdnZXIoXG4gICAgdHlwZTogT25UcmlnZ2VyVHlwZSwgcGFyYW1ldGVyczogc3RyaW5nW10sIHBsYWNlaG9sZGVyOiB0LkRlZmVycmVkQmxvY2tQbGFjZWhvbGRlcnxudWxsKSB7XG4gIGlmIChwYXJhbWV0ZXJzLmxlbmd0aCA+IDEpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYFwiJHt0eXBlfVwiIHRyaWdnZXIgY2FuIG9ubHkgaGF2ZSB6ZXJvIG9yIG9uZSBwYXJhbWV0ZXJzYCk7XG4gIH1cblxuICBpZiAocGFyYW1ldGVycy5sZW5ndGggPT09IDApIHtcbiAgICBpZiAocGxhY2Vob2xkZXIgPT09IG51bGwpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihgXCIke1xuICAgICAgICAgIHR5cGV9XCIgdHJpZ2dlciB3aXRoIG5vIHBhcmFtZXRlcnMgY2FuIG9ubHkgYmUgcGxhY2VkIG9uIGFuIEBkZWZlciB0aGF0IGhhcyBhIEBwbGFjZWhvbGRlciBibG9ja2ApO1xuICAgIH1cblxuICAgIGlmIChwbGFjZWhvbGRlci5jaGlsZHJlbi5sZW5ndGggIT09IDEgfHwgIShwbGFjZWhvbGRlci5jaGlsZHJlblswXSBpbnN0YW5jZW9mIHQuRWxlbWVudCkpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgXCIke3R5cGV9XCIgdHJpZ2dlciB3aXRoIG5vIHBhcmFtZXRlcnMgY2FuIG9ubHkgYmUgcGxhY2VkIG9uIGFuIEBkZWZlciB0aGF0IGhhcyBhIGAgK1xuICAgICAgICAgIGBAcGxhY2Vob2xkZXIgYmxvY2sgd2l0aCBleGFjdGx5IG9uZSByb290IGVsZW1lbnQgbm9kZWApO1xuICAgIH1cbiAgfVxufVxuXG4vKiogR2V0cyB0aGUgaW5kZXggd2l0aGluIGFuIGV4cHJlc3Npb24gYXQgd2hpY2ggdGhlIHRyaWdnZXIgcGFyYW1ldGVycyBzdGFydC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRUcmlnZ2VyUGFyYW1ldGVyc1N0YXJ0KHZhbHVlOiBzdHJpbmcsIHN0YXJ0UG9zaXRpb24gPSAwKTogbnVtYmVyIHtcbiAgbGV0IGhhc0ZvdW5kU2VwYXJhdG9yID0gZmFsc2U7XG5cbiAgZm9yIChsZXQgaSA9IHN0YXJ0UG9zaXRpb247IGkgPCB2YWx1ZS5sZW5ndGg7IGkrKykge1xuICAgIGlmIChTRVBBUkFUT1JfUEFUVEVSTi50ZXN0KHZhbHVlW2ldKSkge1xuICAgICAgaGFzRm91bmRTZXBhcmF0b3IgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoaGFzRm91bmRTZXBhcmF0b3IpIHtcbiAgICAgIHJldHVybiBpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiAtMTtcbn1cblxuLyoqXG4gKiBQYXJzZXMgYSB0aW1lIGV4cHJlc3Npb24gZnJvbSBhIGRlZmVycmVkIHRyaWdnZXIgdG9cbiAqIG1pbGxpc2Vjb25kcy4gUmV0dXJucyBudWxsIGlmIGl0IGNhbm5vdCBiZSBwYXJzZWQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZURlZmVycmVkVGltZSh2YWx1ZTogc3RyaW5nKTogbnVtYmVyfG51bGwge1xuICBjb25zdCBtYXRjaCA9IHZhbHVlLm1hdGNoKFRJTUVfUEFUVEVSTik7XG5cbiAgaWYgKCFtYXRjaCkge1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgW3RpbWUsIHVuaXRzXSA9IG1hdGNoO1xuICByZXR1cm4gcGFyc2VGbG9hdCh0aW1lKSAqICh1bml0cyA9PT0gJ3MnID8gMTAwMCA6IDEpO1xufVxuIl19