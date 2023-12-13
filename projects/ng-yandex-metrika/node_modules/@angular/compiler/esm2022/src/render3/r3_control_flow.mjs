/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as html from '../ml_parser/ast';
import { ParseError, ParseSourceSpan } from '../parse_util';
import * as t from './r3_ast';
/** Pattern for the expression in a for loop block. */
const FOR_LOOP_EXPRESSION_PATTERN = /^\s*([0-9A-Za-z_$]*)\s+of\s+([\S\s]*)/;
/** Pattern for the tracking expression in a for loop block. */
const FOR_LOOP_TRACK_PATTERN = /^track\s+([\S\s]*)/;
/** Pattern for the `as` expression in a conditional block. */
const CONDITIONAL_ALIAS_PATTERN = /^as\s+(.*)/;
/** Pattern used to identify an `else if` block. */
const ELSE_IF_PATTERN = /^else[^\S\r\n]+if/;
/** Pattern used to identify a `let` parameter. */
const FOR_LOOP_LET_PATTERN = /^let\s+([\S\s]*)/;
/** Names of variables that are allowed to be used in the `let` expression of a `for` loop. */
const ALLOWED_FOR_LOOP_LET_VARIABLES = new Set(['$index', '$first', '$last', '$even', '$odd', '$count']);
/**
 * Predicate function that determines if a block with
 * a specific name cam be connected to a `for` block.
 */
export function isConnectedForLoopBlock(name) {
    return name === 'empty';
}
/**
 * Predicate function that determines if a block with
 * a specific name cam be connected to an `if` block.
 */
export function isConnectedIfLoopBlock(name) {
    return name === 'else' || ELSE_IF_PATTERN.test(name);
}
/** Creates an `if` loop block from an HTML AST node. */
export function createIfBlock(ast, connectedBlocks, visitor, bindingParser) {
    const errors = validateIfConnectedBlocks(connectedBlocks);
    const branches = [];
    const mainBlockParams = parseConditionalBlockParameters(ast, errors, bindingParser);
    if (mainBlockParams !== null) {
        branches.push(new t.IfBlockBranch(mainBlockParams.expression, html.visitAll(visitor, ast.children, ast.children), mainBlockParams.expressionAlias, ast.sourceSpan, ast.startSourceSpan, ast.endSourceSpan, ast.nameSpan, ast.i18n));
    }
    for (const block of connectedBlocks) {
        if (ELSE_IF_PATTERN.test(block.name)) {
            const params = parseConditionalBlockParameters(block, errors, bindingParser);
            if (params !== null) {
                const children = html.visitAll(visitor, block.children, block.children);
                branches.push(new t.IfBlockBranch(params.expression, children, params.expressionAlias, block.sourceSpan, block.startSourceSpan, block.endSourceSpan, block.nameSpan, block.i18n));
            }
        }
        else if (block.name === 'else') {
            const children = html.visitAll(visitor, block.children, block.children);
            branches.push(new t.IfBlockBranch(null, children, null, block.sourceSpan, block.startSourceSpan, block.endSourceSpan, block.nameSpan, block.i18n));
        }
    }
    // The outer IfBlock should have a span that encapsulates all branches.
    const ifBlockStartSourceSpan = branches.length > 0 ? branches[0].startSourceSpan : ast.startSourceSpan;
    const ifBlockEndSourceSpan = branches.length > 0 ? branches[branches.length - 1].endSourceSpan : ast.endSourceSpan;
    let wholeSourceSpan = ast.sourceSpan;
    const lastBranch = branches[branches.length - 1];
    if (lastBranch !== undefined) {
        wholeSourceSpan = new ParseSourceSpan(ifBlockStartSourceSpan.start, lastBranch.sourceSpan.end);
    }
    return {
        node: new t.IfBlock(branches, wholeSourceSpan, ast.startSourceSpan, ifBlockEndSourceSpan, ast.nameSpan),
        errors,
    };
}
/** Creates a `for` loop block from an HTML AST node. */
export function createForLoop(ast, connectedBlocks, visitor, bindingParser) {
    const errors = [];
    const params = parseForLoopParameters(ast, errors, bindingParser);
    let node = null;
    let empty = null;
    for (const block of connectedBlocks) {
        if (block.name === 'empty') {
            if (empty !== null) {
                errors.push(new ParseError(block.sourceSpan, '@for loop can only have one @empty block'));
            }
            else if (block.parameters.length > 0) {
                errors.push(new ParseError(block.sourceSpan, '@empty block cannot have parameters'));
            }
            else {
                empty = new t.ForLoopBlockEmpty(html.visitAll(visitor, block.children, block.children), block.sourceSpan, block.startSourceSpan, block.endSourceSpan, block.nameSpan, block.i18n);
            }
        }
        else {
            errors.push(new ParseError(block.sourceSpan, `Unrecognized @for loop block "${block.name}"`));
        }
    }
    if (params !== null) {
        if (params.trackBy === null) {
            // TODO: We should not fail here, and instead try to produce some AST for the language
            // service.
            errors.push(new ParseError(ast.sourceSpan, '@for loop must have a "track" expression'));
        }
        else {
            // The `for` block has a main span that includes the `empty` branch. For only the span of the
            // main `for` body, use `mainSourceSpan`.
            const endSpan = empty?.endSourceSpan ?? ast.endSourceSpan;
            const sourceSpan = new ParseSourceSpan(ast.sourceSpan.start, endSpan?.end ?? ast.sourceSpan.end);
            node = new t.ForLoopBlock(params.itemName, params.expression, params.trackBy.expression, params.trackBy.keywordSpan, params.context, html.visitAll(visitor, ast.children, ast.children), empty, sourceSpan, ast.sourceSpan, ast.startSourceSpan, endSpan, ast.nameSpan, ast.i18n);
        }
    }
    return { node, errors };
}
/** Creates a switch block from an HTML AST node. */
export function createSwitchBlock(ast, visitor, bindingParser) {
    const errors = validateSwitchBlock(ast);
    const primaryExpression = ast.parameters.length > 0 ?
        parseBlockParameterToBinding(ast.parameters[0], bindingParser) :
        bindingParser.parseBinding('', false, ast.sourceSpan, 0);
    const cases = [];
    const unknownBlocks = [];
    let defaultCase = null;
    // Here we assume that all the blocks are valid given that we validated them above.
    for (const node of ast.children) {
        if (!(node instanceof html.Block)) {
            continue;
        }
        if ((node.name !== 'case' || node.parameters.length === 0) && node.name !== 'default') {
            unknownBlocks.push(new t.UnknownBlock(node.name, node.sourceSpan, node.nameSpan));
            continue;
        }
        const expression = node.name === 'case' ?
            parseBlockParameterToBinding(node.parameters[0], bindingParser) :
            null;
        const ast = new t.SwitchBlockCase(expression, html.visitAll(visitor, node.children, node.children), node.sourceSpan, node.startSourceSpan, node.endSourceSpan, node.nameSpan, node.i18n);
        if (expression === null) {
            defaultCase = ast;
        }
        else {
            cases.push(ast);
        }
    }
    // Ensure that the default case is last in the array.
    if (defaultCase !== null) {
        cases.push(defaultCase);
    }
    return {
        node: new t.SwitchBlock(primaryExpression, cases, unknownBlocks, ast.sourceSpan, ast.startSourceSpan, ast.endSourceSpan, ast.nameSpan),
        errors
    };
}
/** Parses the parameters of a `for` loop block. */
function parseForLoopParameters(block, errors, bindingParser) {
    if (block.parameters.length === 0) {
        errors.push(new ParseError(block.sourceSpan, '@for loop does not have an expression'));
        return null;
    }
    const [expressionParam, ...secondaryParams] = block.parameters;
    const match = stripOptionalParentheses(expressionParam, errors)?.match(FOR_LOOP_EXPRESSION_PATTERN);
    if (!match || match[2].trim().length === 0) {
        errors.push(new ParseError(expressionParam.sourceSpan, 'Cannot parse expression. @for loop expression must match the pattern "<identifier> of <expression>"'));
        return null;
    }
    const [, itemName, rawExpression] = match;
    const result = {
        itemName: new t.Variable(itemName, '$implicit', expressionParam.sourceSpan, expressionParam.sourceSpan),
        trackBy: null,
        expression: parseBlockParameterToBinding(expressionParam, bindingParser, rawExpression),
        context: {},
    };
    for (const param of secondaryParams) {
        const letMatch = param.expression.match(FOR_LOOP_LET_PATTERN);
        if (letMatch !== null) {
            parseLetParameter(param.sourceSpan, letMatch[1], param.sourceSpan, result.context, errors);
            continue;
        }
        const trackMatch = param.expression.match(FOR_LOOP_TRACK_PATTERN);
        if (trackMatch !== null) {
            if (result.trackBy !== null) {
                errors.push(new ParseError(param.sourceSpan, '@for loop can only have one "track" expression'));
            }
            else {
                const expression = parseBlockParameterToBinding(param, bindingParser, trackMatch[1]);
                const keywordSpan = new ParseSourceSpan(param.sourceSpan.start, param.sourceSpan.start.moveBy('track'.length));
                result.trackBy = { expression, keywordSpan };
            }
            continue;
        }
        errors.push(new ParseError(param.sourceSpan, `Unrecognized @for loop paramater "${param.expression}"`));
    }
    // Fill out any variables that haven't been defined explicitly.
    for (const variableName of ALLOWED_FOR_LOOP_LET_VARIABLES) {
        if (!result.context.hasOwnProperty(variableName)) {
            // Give ambiently-available context variables empty spans at the end of the start of the `for`
            // block, since they are not explicitly defined.
            const emptySpanAfterForBlockStart = new ParseSourceSpan(block.startSourceSpan.end, block.startSourceSpan.end);
            result.context[variableName] = new t.Variable(variableName, variableName, emptySpanAfterForBlockStart, emptySpanAfterForBlockStart);
        }
    }
    return result;
}
/** Parses the `let` parameter of a `for` loop block. */
function parseLetParameter(sourceSpan, expression, span, context, errors) {
    const parts = expression.split(',');
    for (const part of parts) {
        const expressionParts = part.split('=');
        const name = expressionParts.length === 2 ? expressionParts[0].trim() : '';
        const variableName = (expressionParts.length === 2 ? expressionParts[1].trim() : '');
        if (name.length === 0 || variableName.length === 0) {
            errors.push(new ParseError(sourceSpan, `Invalid @for loop "let" parameter. Parameter should match the pattern "<name> = <variable name>"`));
        }
        else if (!ALLOWED_FOR_LOOP_LET_VARIABLES.has(variableName)) {
            errors.push(new ParseError(sourceSpan, `Unknown "let" parameter variable "${variableName}". The allowed variables are: ${Array.from(ALLOWED_FOR_LOOP_LET_VARIABLES).join(', ')}`));
        }
        else if (context.hasOwnProperty(variableName)) {
            errors.push(new ParseError(sourceSpan, `Duplicate "let" parameter variable "${variableName}"`));
        }
        else {
            context[variableName] = new t.Variable(name, variableName, span, span);
        }
    }
}
/**
 * Checks that the shape of the blocks connected to an
 * `@if` block is correct. Returns an array of errors.
 */
function validateIfConnectedBlocks(connectedBlocks) {
    const errors = [];
    let hasElse = false;
    for (let i = 0; i < connectedBlocks.length; i++) {
        const block = connectedBlocks[i];
        if (block.name === 'else') {
            if (hasElse) {
                errors.push(new ParseError(block.sourceSpan, 'Conditional can only have one @else block'));
            }
            else if (connectedBlocks.length > 1 && i < connectedBlocks.length - 1) {
                errors.push(new ParseError(block.sourceSpan, '@else block must be last inside the conditional'));
            }
            else if (block.parameters.length > 0) {
                errors.push(new ParseError(block.sourceSpan, '@else block cannot have parameters'));
            }
            hasElse = true;
        }
        else if (!ELSE_IF_PATTERN.test(block.name)) {
            errors.push(new ParseError(block.sourceSpan, `Unrecognized conditional block @${block.name}`));
        }
    }
    return errors;
}
/** Checks that the shape of a `switch` block is valid. Returns an array of errors. */
function validateSwitchBlock(ast) {
    const errors = [];
    let hasDefault = false;
    if (ast.parameters.length !== 1) {
        errors.push(new ParseError(ast.sourceSpan, '@switch block must have exactly one parameter'));
        return errors;
    }
    for (const node of ast.children) {
        // Skip over comments and empty text nodes inside the switch block.
        // Empty text nodes can be used for formatting while comments don't affect the runtime.
        if (node instanceof html.Comment ||
            (node instanceof html.Text && node.value.trim().length === 0)) {
            continue;
        }
        if (!(node instanceof html.Block) || (node.name !== 'case' && node.name !== 'default')) {
            errors.push(new ParseError(node.sourceSpan, '@switch block can only contain @case and @default blocks'));
            continue;
        }
        if (node.name === 'default') {
            if (hasDefault) {
                errors.push(new ParseError(node.sourceSpan, '@switch block can only have one @default block'));
            }
            else if (node.parameters.length > 0) {
                errors.push(new ParseError(node.sourceSpan, '@default block cannot have parameters'));
            }
            hasDefault = true;
        }
        else if (node.name === 'case' && node.parameters.length !== 1) {
            errors.push(new ParseError(node.sourceSpan, '@case block must have exactly one parameter'));
        }
    }
    return errors;
}
/**
 * Parses a block parameter into a binding AST.
 * @param ast Block parameter that should be parsed.
 * @param bindingParser Parser that the expression should be parsed with.
 * @param part Specific part of the expression that should be parsed.
 */
function parseBlockParameterToBinding(ast, bindingParser, part) {
    let start;
    let end;
    if (typeof part === 'string') {
        // Note: `lastIndexOf` here should be enough to know the start index of the expression,
        // because we know that it'll be at the end of the param. Ideally we could use the `d`
        // flag when matching via regex and get the index from `match.indices`, but it's unclear
        // if we can use it yet since it's a relatively new feature. See:
        // https://github.com/tc39/proposal-regexp-match-indices
        start = Math.max(0, ast.expression.lastIndexOf(part));
        end = start + part.length;
    }
    else {
        start = 0;
        end = ast.expression.length;
    }
    return bindingParser.parseBinding(ast.expression.slice(start, end), false, ast.sourceSpan, ast.sourceSpan.start.offset + start);
}
/** Parses the parameter of a conditional block (`if` or `else if`). */
function parseConditionalBlockParameters(block, errors, bindingParser) {
    if (block.parameters.length === 0) {
        errors.push(new ParseError(block.sourceSpan, 'Conditional block does not have an expression'));
        return null;
    }
    const expression = parseBlockParameterToBinding(block.parameters[0], bindingParser);
    let expressionAlias = null;
    // Start from 1 since we processed the first parameter already.
    for (let i = 1; i < block.parameters.length; i++) {
        const param = block.parameters[i];
        const aliasMatch = param.expression.match(CONDITIONAL_ALIAS_PATTERN);
        // For now conditionals can only have an `as` parameter.
        // We may want to rework this later if we add more.
        if (aliasMatch === null) {
            errors.push(new ParseError(param.sourceSpan, `Unrecognized conditional paramater "${param.expression}"`));
        }
        else if (block.name !== 'if') {
            errors.push(new ParseError(param.sourceSpan, '"as" expression is only allowed on the primary @if block'));
        }
        else if (expressionAlias !== null) {
            errors.push(new ParseError(param.sourceSpan, 'Conditional can only have one "as" expression'));
        }
        else {
            const name = aliasMatch[1].trim();
            expressionAlias = new t.Variable(name, name, param.sourceSpan, param.sourceSpan);
        }
    }
    return { expression, expressionAlias };
}
/** Strips optional parentheses around from a control from expression parameter. */
function stripOptionalParentheses(param, errors) {
    const expression = param.expression;
    const spaceRegex = /^\s$/;
    let openParens = 0;
    let start = 0;
    let end = expression.length - 1;
    for (let i = 0; i < expression.length; i++) {
        const char = expression[i];
        if (char === '(') {
            start = i + 1;
            openParens++;
        }
        else if (spaceRegex.test(char)) {
            continue;
        }
        else {
            break;
        }
    }
    if (openParens === 0) {
        return expression;
    }
    for (let i = expression.length - 1; i > -1; i--) {
        const char = expression[i];
        if (char === ')') {
            end = i;
            openParens--;
            if (openParens === 0) {
                break;
            }
        }
        else if (spaceRegex.test(char)) {
            continue;
        }
        else {
            break;
        }
    }
    if (openParens !== 0) {
        errors.push(new ParseError(param.sourceSpan, 'Unclosed parentheses in expression'));
        return null;
    }
    return expression.slice(start, end);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicjNfY29udHJvbF9mbG93LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3JlbmRlcjMvcjNfY29udHJvbF9mbG93LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUdILE9BQU8sS0FBSyxJQUFJLE1BQU0sa0JBQWtCLENBQUM7QUFDekMsT0FBTyxFQUFDLFVBQVUsRUFBRSxlQUFlLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFHMUQsT0FBTyxLQUFLLENBQUMsTUFBTSxVQUFVLENBQUM7QUFFOUIsc0RBQXNEO0FBQ3RELE1BQU0sMkJBQTJCLEdBQUcsdUNBQXVDLENBQUM7QUFFNUUsK0RBQStEO0FBQy9ELE1BQU0sc0JBQXNCLEdBQUcsb0JBQW9CLENBQUM7QUFFcEQsOERBQThEO0FBQzlELE1BQU0seUJBQXlCLEdBQUcsWUFBWSxDQUFDO0FBRS9DLG1EQUFtRDtBQUNuRCxNQUFNLGVBQWUsR0FBRyxtQkFBbUIsQ0FBQztBQUU1QyxrREFBa0Q7QUFDbEQsTUFBTSxvQkFBb0IsR0FBRyxrQkFBa0IsQ0FBQztBQUVoRCw4RkFBOEY7QUFDOUYsTUFBTSw4QkFBOEIsR0FDaEMsSUFBSSxHQUFHLENBQThCLENBQUMsUUFBUSxFQUFFLFFBQVEsRUFBRSxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sRUFBRSxRQUFRLENBQUMsQ0FBQyxDQUFDO0FBRW5HOzs7R0FHRztBQUNILE1BQU0sVUFBVSx1QkFBdUIsQ0FBQyxJQUFZO0lBQ2xELE9BQU8sSUFBSSxLQUFLLE9BQU8sQ0FBQztBQUMxQixDQUFDO0FBRUQ7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLHNCQUFzQixDQUFDLElBQVk7SUFDakQsT0FBTyxJQUFJLEtBQUssTUFBTSxJQUFJLGVBQWUsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkQsQ0FBQztBQUVELHdEQUF3RDtBQUN4RCxNQUFNLFVB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YixJQUFJLFVBQVUsS0FBSyxDQUFDLEVBQUU7Z0JBQ3BCLE1BQU07YUFDUDtTQUNGO2FBQU0sSUFBSSxVQUFVLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxFQUFFO1lBQ2hDLFNBQVM7U0FDVjthQUFNO1lBQ0wsTUFBTTtTQUNQO0tBQ0Y7SUFFRCxJQUFJLFVBQVUsS0FBSyxDQUFDLEVBQUU7UUFDcEIsTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsVUFBVSxFQUFFLG9DQUFvQyxDQUFDLENBQUMsQ0FBQztRQUNwRixPQUFPLElBQUksQ0FBQztLQUNiO0lBRUQsT0FBTyxVQUFVLENBQUMsS0FBSyxDQUFDLEtBQUssRUFBRSxHQUFHLENBQUMsQ0FBQztBQUN0QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCB7QVNUV2l0aFNvdXJjZX0gZnJvbSAnLi4vZXhwcmVzc2lvbl9wYXJzZXIvYXN0JztcbmltcG9ydCAqIGFzIGh0bWwgZnJvbSAnLi4vbWxfcGFyc2VyL2FzdCc7XG5pbXBvcnQge1BhcnNlRXJyb3IsIFBhcnNlU291cmNlU3Bhbn0gZnJvbSAnLi4vcGFyc2VfdXRpbCc7XG5pbXBvcnQge0JpbmRpbmdQYXJzZXJ9IGZyb20gJy4uL3RlbXBsYXRlX3BhcnNlci9iaW5kaW5nX3BhcnNlcic7XG5cbmltcG9ydCAqIGFzIHQgZnJvbSAnLi9yM19hc3QnO1xuXG4vKiogUGF0dGVybiBmb3IgdGhlIGV4cHJlc3Npb24gaW4gYSBmb3IgbG9vcCBibG9jay4gKi9cbmNvbnN0IEZPUl9MT09QX0VYUFJFU1NJT05fUEFUVEVSTiA9IC9eXFxzKihbMC05QS1aYS16XyRdKilcXHMrb2ZcXHMrKFtcXFNcXHNdKikvO1xuXG4vKiogUGF0dGVybiBmb3IgdGhlIHRyYWNraW5nIGV4cHJlc3Npb24gaW4gYSBmb3IgbG9vcCBibG9jay4gKi9cbmNvbnN0IEZPUl9MT09QX1RSQUNLX1BBVFRFUk4gPSAvXnRyYWNrXFxzKyhbXFxTXFxzXSopLztcblxuLyoqIFBhdHRlcm4gZm9yIHRoZSBgYXNgIGV4cHJlc3Npb24gaW4gYSBjb25kaXRpb25hbCBibG9jay4gKi9cbmNvbnN0IENPTkRJVElPTkFMX0FMSUFTX1BBVFRFUk4gPSAvXmFzXFxzKyguKikvO1xuXG4vKiogUGF0dGVybiB1c2VkIHRvIGlkZW50aWZ5IGFuIGBlbHNlIGlmYCBibG9jay4gKi9cbmNvbnN0IEVMU0VfSUZfUEFUVEVSTiA9IC9eZWxzZVteXFxTXFxyXFxuXStpZi87XG5cbi8qKiBQYXR0ZXJuIHVzZWQgdG8gaWRlbnRpZnkgYSBgbGV0YCBwYXJhbWV0ZXIuICovXG5jb25zdCBGT1JfTE9PUF9MRVRfUEFUVEVSTiA9IC9ebGV0XFxzKyhbXFxTXFxzXSopLztcblxuLyoqIE5hbWVzIG9mIHZhcmlhYmxlcyB0aGF0IGFyZSBhbGxvd2VkIHRvIGJlIHVzZWQgaW4gdGhlIGBsZXRgIGV4cHJlc3Npb24gb2YgYSBgZm9yYCBsb29wLiAqL1xuY29uc3QgQUxMT1dFRF9GT1JfTE9PUF9MRVRfVkFSSUFCTEVTID1cbiAgICBuZXcgU2V0PGtleW9mIHQuRm9yTG9vcEJsb2NrQ29udGV4dD4oWyckaW5kZXgnLCAnJGZpcnN0JywgJyRsYXN0JywgJyRldmVuJywgJyRvZGQnLCAnJGNvdW50J10pO1xuXG4vKipcbiAqIFByZWRpY2F0ZSBmdW5jdGlvbiB0aGF0IGRldGVybWluZXMgaWYgYSBibG9jayB3aXRoXG4gKiBhIHNwZWNpZmljIG5hbWUgY2FtIGJlIGNvbm5lY3RlZCB0byBhIGBmb3JgIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDb25uZWN0ZWRGb3JMb29wQmxvY2sobmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBuYW1lID09PSAnZW1wdHknO1xufVxuXG4vKipcbiAqIFByZWRpY2F0ZSBmdW5jdGlvbiB0aGF0IGRldGVybWluZXMgaWYgYSBibG9jayB3aXRoXG4gKiBhIHNwZWNpZmljIG5hbWUgY2FtIGJlIGNvbm5lY3RlZCB0byBhbiBgaWZgIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDb25uZWN0ZWRJZkxvb3BCbG9jayhuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIG5hbWUgPT09ICdlbHNlJyB8fCBFTFNFX0lGX1BBVFRFUk4udGVzdChuYW1lKTtcbn1cblxuLyoqIENyZWF0ZXMgYW4gYGlmYCBsb29wIGJsb2NrIGZyb20gYW4gSFRNTCBBU1Qgbm9kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJZkJsb2NrKFxuICAgIGFzdDogaHRtbC5CbG9jaywgY29ubmVjdGVkQmxvY2tzOiBodG1sLkJsb2NrW10sIHZpc2l0b3I6IGh0bWwuVmlzaXRvcixcbiAgICBiaW5kaW5nUGFyc2VyOiBCaW5kaW5nUGFyc2VyKToge25vZGU6IHQuSWZCbG9ja3xudWxsLCBlcnJvcnM6IFBhcnNlRXJyb3JbXX0ge1xuICBjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IHZhbGlkYXRlSWZDb25uZWN0ZWRCbG9ja3MoY29ubmVjdGVkQmxvY2tzKTtcbiAgY29uc3QgYnJhbmNoZXM6IHQuSWZCbG9ja0JyYW5jaFtdID0gW107XG4gIGNvbnN0IG1haW5CbG9ja1BhcmFtcyA9IHBhcnNlQ29uZGl0aW9uYWxCbG9ja1BhcmFtZXRlcnMoYXN0LCBlcnJvcnMsIGJpbmRpbmdQYXJzZXIpO1xuXG4gIGlmIChtYWluQmxvY2tQYXJhbXMgIT09IG51bGwpIHtcbiAgICBicmFuY2hlcy5wdXNoKG5ldyB0LklmQmxvY2tCcmFuY2goXG4gICAgICAgIG1haW5CbG9ja1BhcmFtcy5leHByZXNzaW9uLCBodG1sLnZpc2l0QWxsKHZpc2l0b3IsIGFzdC5jaGlsZHJlbiwgYXN0LmNoaWxkcmVuKSxcbiAgICAgICAgbWFpbkJsb2NrUGFyYW1zLmV4cHJlc3Npb25BbGlhcywgYXN0LnNvdXJjZVNwYW4sIGFzdC5zdGFydFNvdXJjZVNwYW4sIGFzdC5lbmRTb3VyY2VTcGFuLFxuICAgICAgICBhc3QubmFtZVNwYW4sIGFzdC5pMThuKSk7XG4gIH1cblxuICBmb3IgKGNvbnN0IGJsb2NrIG9mIGNvbm5lY3RlZEJsb2Nrcykge1xuICAgIGlmIChFTFNFX0lGX1BBVFRFUk4udGVzdChibG9jay5uYW1lKSkge1xuICAgICAgY29uc3QgcGFyYW1zID0gcGFyc2VDb25kaXRpb25hbEJsb2NrUGFyYW1ldGVycyhibG9jaywgZXJyb3JzLCBiaW5kaW5nUGFyc2VyKTtcblxuICAgICAgaWYgKHBhcmFtcyAhPT0gbnVsbCkge1xuICAgICAgICBjb25zdCBjaGlsZHJlbiA9IGh0bWwudmlzaXRBbGwodmlzaXRvciwgYmxvY2suY2hpbGRyZW4sIGJsb2NrLmNoaWxkcmVuKTtcbiAgICAgICAgYnJhbmNoZXMucHVzaChuZXcgdC5JZkJsb2NrQnJhbmNoKFxuICAgICAgICAgICAgcGFyYW1zLmV4cHJlc3Npb24sIGNoaWxkcmVuLCBwYXJhbXMuZXhwcmVzc2lvbkFsaWFzLCBibG9jay5zb3VyY2VTcGFuLFxuICAgICAgICAgICAgYmxvY2suc3RhcnRTb3VyY2VTcGFuLCBibG9jay5lbmRTb3VyY2VTcGFuLCBibG9jay5uYW1lU3BhbiwgYmxvY2suaTE4bikpO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoYmxvY2submFtZSA9PT0gJ2Vsc2UnKSB7XG4gICAgICBjb25zdCBjaGlsZHJlbiA9IGh0bWwudmlzaXRBbGwodmlzaXRvciwgYmxvY2suY2hpbGRyZW4sIGJsb2NrLmNoaWxkcmVuKTtcbiAgICAgIGJyYW5jaGVzLnB1c2gobmV3IHQuSWZCbG9ja0JyYW5jaChcbiAgICAgICAgICBudWxsLCBjaGlsZHJlbiwgbnVsbCwgYmxvY2suc291cmNlU3BhbiwgYmxvY2suc3RhcnRTb3VyY2VTcGFuLCBibG9jay5lbmRTb3VyY2VTcGFuLFxuICAgICAgICAgIGJsb2NrLm5hbWVTcGFuLCBibG9jay5pMThuKSk7XG4gICAgfVxuICB9XG5cbiAgLy8gVGhlIG91dGVyIElmQmxvY2sgc2hvdWxkIGhhdmUgYSBzcGFuIHRoYXQgZW5jYXBzdWxhdGVzIGFsbCBicmFuY2hlcy5cbiAgY29uc3QgaWZCbG9ja1N0YXJ0U291cmNlU3BhbiA9XG4gICAgICBicmFuY2hlcy5sZW5ndGggPiAwID8gYnJhbmNoZXNbMF0uc3RhcnRTb3VyY2VTcGFuIDogYXN0LnN0YXJ0U291cmNlU3BhbjtcbiAgY29uc3QgaWZCbG9ja0VuZFNvdXJjZVNwYW4gPVxuICAgICAgYnJhbmNoZXMubGVuZ3RoID4gMCA/IGJyYW5jaGVzW2JyYW5jaGVzLmxlbmd0aCAtIDFdLmVuZFNvdXJjZVNwYW4gOiBhc3QuZW5kU291cmNlU3BhbjtcblxuICBsZXQgd2hvbGVTb3VyY2VTcGFuID0gYXN0LnNvdXJjZVNwYW47XG4gIGNvbnN0IGxhc3RCcmFuY2ggPSBicmFuY2hlc1ticmFuY2hlcy5sZW5ndGggLSAxXTtcbiAgaWYgKGxhc3RCcmFuY2ggIT09IHVuZGVmaW5lZCkge1xuICAgIHdob2xlU291cmNlU3BhbiA9IG5ldyBQYXJzZVNvdXJjZVNwYW4oaWZCbG9ja1N0YXJ0U291cmNlU3Bhbi5zdGFydCwgbGFzdEJyYW5jaC5zb3VyY2VTcGFuLmVuZCk7XG4gIH1cblxuICByZXR1cm4ge1xuICAgIG5vZGU6IG5ldyB0LklmQmxvY2soXG4gICAgICAgIGJyYW5jaGVzLCB3aG9sZVNvdXJjZVNwYW4sIGFzdC5zdGFydFNvdXJjZVNwYW4sIGlmQmxvY2tFbmRTb3VyY2VTcGFuLCBhc3QubmFtZVNwYW4pLFxuICAgIGVycm9ycyxcbiAgfTtcbn1cblxuLyoqIENyZWF0ZXMgYSBgZm9yYCBsb29wIGJsb2NrIGZyb20gYW4gSFRNTCBBU1Qgbm9kZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVGb3JMb29wKFxuICAgIGFzdDogaHRtbC5CbG9jaywgY29ubmVjdGVkQmxvY2tzOiBodG1sLkJsb2NrW10sIHZpc2l0b3I6IGh0bWwuVmlzaXRvcixcbiAgICBiaW5kaW5nUGFyc2VyOiBCaW5kaW5nUGFyc2VyKToge25vZGU6IHQuRm9yTG9vcEJsb2NrfG51bGwsIGVycm9yczogUGFyc2VFcnJvcltdfSB7XG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG4gIGNvbnN0IHBhcmFtcyA9IHBhcnNlRm9yTG9vcFBhcmFtZXRlcnMoYXN0LCBlcnJvcnMsIGJpbmRpbmdQYXJzZXIpO1xuICBsZXQgbm9kZTogdC5Gb3JMb29wQmxvY2t8bnVsbCA9IG51bGw7XG4gIGxldCBlbXB0eTogdC5Gb3JMb29wQmxvY2tFbXB0eXxudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IGJsb2NrIG9mIGNvbm5lY3RlZEJsb2Nrcykge1xuICAgIGlmIChibG9jay5uYW1lID09PSAnZW1wdHknKSB7XG4gICAgICBpZiAoZW1wdHkgIT09IG51bGwpIHtcbiAgICAgICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoYmxvY2suc291cmNlU3BhbiwgJ0Bmb3IgbG9vcCBjYW4gb25seSBoYXZlIG9uZSBAZW1wdHkgYmxvY2snKSk7XG4gICAgICB9IGVsc2UgaWYgKGJsb2NrLnBhcmFtZXRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihibG9jay5zb3VyY2VTcGFuLCAnQGVtcHR5IGJsb2NrIGNhbm5vdCBoYXZlIHBhcmFtZXRlcnMnKSk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBlbXB0eSA9IG5ldyB0LkZvckxvb3BCbG9ja0VtcHR5KFxuICAgICAgICAgICAgaHRtbC52aXNpdEFsbCh2aXNpdG9yLCBibG9jay5jaGlsZHJlbiwgYmxvY2suY2hpbGRyZW4pLCBibG9jay5zb3VyY2VTcGFuLFxuICAgICAgICAgICAgYmxvY2suc3RhcnRTb3VyY2VTcGFuLCBibG9jay5lbmRTb3VyY2VTcGFuLCBibG9jay5uYW1lU3BhbiwgYmxvY2suaTE4bik7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKGJsb2NrLnNvdXJjZVNwYW4sIGBVbnJlY29nbml6ZWQgQGZvciBsb29wIGJsb2NrIFwiJHtibG9jay5uYW1lfVwiYCkpO1xuICAgIH1cbiAgfVxuXG5cbiAgaWYgKHBhcmFtcyAhPT0gbnVsbCkge1xuICAgIGlmIChwYXJhbXMudHJhY2tCeSA9PT0gbnVsbCkge1xuICAgICAgLy8gVE9ETzogV2Ugc2hvdWxkIG5vdCBmYWlsIGhlcmUsIGFuZCBpbnN0ZWFkIHRyeSB0byBwcm9kdWNlIHNvbWUgQVNUIGZvciB0aGUgbGFuZ3VhZ2VcbiAgICAgIC8vIHNlcnZpY2UuXG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihhc3Quc291cmNlU3BhbiwgJ0Bmb3IgbG9vcCBtdXN0IGhhdmUgYSBcInRyYWNrXCIgZXhwcmVzc2lvbicpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gVGhlIGBmb3JgIGJsb2NrIGhhcyBhIG1haW4gc3BhbiB0aGF0IGluY2x1ZGVzIHRoZSBgZW1wdHlgIGJyYW5jaC4gRm9yIG9ubHkgdGhlIHNwYW4gb2YgdGhlXG4gICAgICAvLyBtYWluIGBmb3JgIGJvZHksIHVzZSBgbWFpblNvdXJjZVNwYW5gLlxuICAgICAgY29uc3QgZW5kU3BhbiA9IGVtcHR5Py5lbmRTb3VyY2VTcGFuID8/IGFzdC5lbmRTb3VyY2VTcGFuO1xuICAgICAgY29uc3Qgc291cmNlU3BhbiA9XG4gICAgICAgICAgbmV3IFBhcnNlU291cmNlU3Bhbihhc3Quc291cmNlU3Bhbi5zdGFydCwgZW5kU3Bhbj8uZW5kID8/IGFzdC5zb3VyY2VTcGFuLmVuZCk7XG4gICAgICBub2RlID0gbmV3IHQuRm9yTG9vcEJsb2NrKFxuICAgICAgICAgIHBhcmFtcy5pdGVtTmFtZSwgcGFyYW1zLmV4cHJlc3Npb24sIHBhcmFtcy50cmFja0J5LmV4cHJlc3Npb24sIHBhcmFtcy50cmFja0J5LmtleXdvcmRTcGFuLFxuICAgICAgICAgIHBhcmFtcy5jb250ZXh0LCBodG1sLnZpc2l0QWxsKHZpc2l0b3IsIGFzdC5jaGlsZHJlbiwgYXN0LmNoaWxkcmVuKSwgZW1wdHksIHNvdXJjZVNwYW4sXG4gICAgICAgICAgYXN0LnNvdXJjZVNwYW4sIGFzdC5zdGFydFNvdXJjZVNwYW4sIGVuZFNwYW4sIGFzdC5uYW1lU3BhbiwgYXN0LmkxOG4pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7bm9kZSwgZXJyb3JzfTtcbn1cblxuLyoqIENyZWF0ZXMgYSBzd2l0Y2ggYmxvY2sgZnJvbSBhbiBIVE1MIEFTVCBub2RlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVN3aXRjaEJsb2NrKFxuICAgIGFzdDogaHRtbC5CbG9jaywgdmlzaXRvcjogaHRtbC5WaXNpdG9yLFxuICAgIGJpbmRpbmdQYXJzZXI6IEJpbmRpbmdQYXJzZXIpOiB7bm9kZTogdC5Td2l0Y2hCbG9ja3xudWxsLCBlcnJvcnM6IFBhcnNlRXJyb3JbXX0ge1xuICBjb25zdCBlcnJvcnMgPSB2YWxpZGF0ZVN3aXRjaEJsb2NrKGFzdCk7XG4gIGNvbnN0IHByaW1hcnlFeHByZXNzaW9uID0gYXN0LnBhcmFtZXRlcnMubGVuZ3RoID4gMCA/XG4gICAgICBwYXJzZUJsb2NrUGFyYW1ldGVyVG9CaW5kaW5nKGFzdC5wYXJhbWV0ZXJzWzBdLCBiaW5kaW5nUGFyc2VyKSA6XG4gICAgICBiaW5kaW5nUGFyc2VyLnBhcnNlQmluZGluZygnJywgZmFsc2UsIGFzdC5zb3VyY2VTcGFuLCAwKTtcbiAgY29uc3QgY2FzZXM6IHQuU3dpdGNoQmxvY2tDYXNlW10gPSBbXTtcbiAgY29uc3QgdW5rbm93bkJsb2NrczogdC5Vbmtub3duQmxvY2tbXSA9IFtdO1xuICBsZXQgZGVmYXVsdENhc2U6IHQuU3dpdGNoQmxvY2tDYXNlfG51bGwgPSBudWxsO1xuXG4gIC8vIEhlcmUgd2UgYXNzdW1lIHRoYXQgYWxsIHRoZSBibG9ja3MgYXJlIHZhbGlkIGdpdmVuIHRoYXQgd2UgdmFsaWRhdGVkIHRoZW0gYWJvdmUuXG4gIGZvciAoY29uc3Qgbm9kZSBvZiBhc3QuY2hpbGRyZW4pIHtcbiAgICBpZiAoIShub2RlIGluc3RhbmNlb2YgaHRtbC5CbG9jaykpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICgobm9kZS5uYW1lICE9PSAnY2FzZScgfHwgbm9kZS5wYXJhbWV0ZXJzLmxlbmd0aCA9PT0gMCkgJiYgbm9kZS5uYW1lICE9PSAnZGVmYXVsdCcpIHtcbiAgICAgIHVua25vd25CbG9ja3MucHVzaChuZXcgdC5Vbmtub3duQmxvY2sobm9kZS5uYW1lLCBub2RlLnNvdXJjZVNwYW4sIG5vZGUubmFtZVNwYW4pKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cHJlc3Npb24gPSBub2RlLm5hbWUgPT09ICdjYXNlJyA/XG4gICAgICAgIHBhcnNlQmxvY2tQYXJhbWV0ZXJUb0JpbmRpbmcobm9kZS5wYXJhbWV0ZXJzWzBdLCBiaW5kaW5nUGFyc2VyKSA6XG4gICAgICAgIG51bGw7XG4gICAgY29uc3QgYXN0ID0gbmV3IHQuU3dpdGNoQmxvY2tDYXNlKFxuICAgICAgICBleHByZXNzaW9uLCBodG1sLnZpc2l0QWxsKHZpc2l0b3IsIG5vZGUuY2hpbGRyZW4sIG5vZGUuY2hpbGRyZW4pLCBub2RlLnNvdXJjZVNwYW4sXG4gICAgICAgIG5vZGUuc3RhcnRTb3VyY2VTcGFuLCBub2RlLmVuZFNvdXJjZVNwYW4sIG5vZGUubmFtZVNwYW4sIG5vZGUuaTE4bik7XG5cbiAgICBpZiAoZXhwcmVzc2lvbiA9PT0gbnVsbCkge1xuICAgICAgZGVmYXVsdENhc2UgPSBhc3Q7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNhc2VzLnB1c2goYXN0KTtcbiAgICB9XG4gIH1cblxuICAvLyBFbnN1cmUgdGhhdCB0aGUgZGVmYXVsdCBjYXNlIGlzIGxhc3QgaW4gdGhlIGFycmF5LlxuICBpZiAoZGVmYXVsdENhc2UgIT09IG51bGwpIHtcbiAgICBjYXNlcy5wdXNoKGRlZmF1bHRDYXNlKTtcbiAgfVxuXG4gIHJldHVybiB7XG4gICAgbm9kZTogbmV3IHQuU3dpdGNoQmxvY2soXG4gICAgICAgIHByaW1hcnlFeHByZXNzaW9uLCBjYXNlcywgdW5rbm93bkJsb2NrcywgYXN0LnNvdXJjZVNwYW4sIGFzdC5zdGFydFNvdXJjZVNwYW4sXG4gICAgICAgIGFzdC5lbmRTb3VyY2VTcGFuLCBhc3QubmFtZVNwYW4pLFxuICAgIGVycm9yc1xuICB9O1xufVxuXG4vKiogUGFyc2VzIHRoZSBwYXJhbWV0ZXJzIG9mIGEgYGZvcmAgbG9vcCBibG9jay4gKi9cbmZ1bmN0aW9uIHBhcnNlRm9yTG9vcFBhcmFtZXRlcnMoXG4gICAgYmxvY2s6IGh0bWwuQmxvY2ssIGVycm9yczogUGFyc2VFcnJvcltdLCBiaW5kaW5nUGFyc2VyOiBCaW5kaW5nUGFyc2VyKSB7XG4gIGlmIChibG9jay5wYXJhbWV0ZXJzLmxlbmd0aCA9PT0gMCkge1xuICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKGJsb2NrLnNvdXJjZVNwYW4sICdAZm9yIGxvb3AgZG9lcyBub3QgaGF2ZSBhbiBleHByZXNzaW9uJykpO1xuICAgIHJldHVybiBudWxsO1xuICB9XG5cbiAgY29uc3QgW2V4cHJlc3Npb25QYXJhbSwgLi4uc2Vjb25kYXJ5UGFyYW1zXSA9IGJsb2NrLnBhcmFtZXRlcnM7XG4gIGNvbnN0IG1hdGNoID1cbiAgICAgIHN0cmlwT3B0aW9uYWxQYXJlbnRoZXNlcyhleHByZXNzaW9uUGFyYW0sIGVycm9ycyk/Lm1hdGNoKEZPUl9MT09QX0VYUFJFU1NJT05fUEFUVEVSTik7XG5cbiAgaWYgKCFtYXRjaCB8fCBtYXRjaFsyXS50cmltKCkubGVuZ3RoID09PSAwKSB7XG4gICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoXG4gICAgICAgIGV4cHJlc3Npb25QYXJhbS5zb3VyY2VTcGFuLFxuICAgICAgICAnQ2Fubm90IHBhcnNlIGV4cHJlc3Npb24uIEBmb3IgbG9vcCBleHByZXNzaW9uIG11c3QgbWF0Y2ggdGhlIHBhdHRlcm4gXCI8aWRlbnRpZmllcj4gb2YgPGV4cHJlc3Npb24+XCInKSk7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cblxuICBjb25zdCBbLCBpdGVtTmFtZSwgcmF3RXhwcmVzc2lvbl0gPSBtYXRjaDtcbiAgY29uc3QgcmVzdWx0ID0ge1xuICAgIGl0ZW1OYW1lOiBuZXcgdC5WYXJpYWJsZShcbiAgICAgICAgaXRlbU5hbWUsICckaW1wbGljaXQnLCBleHByZXNzaW9uUGFyYW0uc291cmNlU3BhbiwgZXhwcmVzc2lvblBhcmFtLnNvdXJjZVNwYW4pLFxuICAgIHRyYWNrQnk6IG51bGwgYXMge2V4cHJlc3Npb246IEFTVFdpdGhTb3VyY2UsIGtleXdvcmRTcGFuOiBQYXJzZVNvdXJjZVNwYW59IHwgbnVsbCxcbiAgICBleHByZXNzaW9uOiBwYXJzZUJsb2NrUGFyYW1ldGVyVG9CaW5kaW5nKGV4cHJlc3Npb25QYXJhbSwgYmluZGluZ1BhcnNlciwgcmF3RXhwcmVzc2lvbiksXG4gICAgY29udGV4dDoge30gYXMgdC5Gb3JMb29wQmxvY2tDb250ZXh0LFxuICB9O1xuXG4gIGZvciAoY29uc3QgcGFyYW0gb2Ygc2Vjb25kYXJ5UGFyYW1zKSB7XG4gICAgY29uc3QgbGV0TWF0Y2ggPSBwYXJhbS5leHByZXNzaW9uLm1hdGNoKEZPUl9MT09QX0xFVF9QQVRURVJOKTtcblxuICAgIGlmIChsZXRNYXRjaCAhPT0gbnVsbCkge1xuICAgICAgcGFyc2VMZXRQYXJhbWV0ZXIocGFyYW0uc291cmNlU3BhbiwgbGV0TWF0Y2hbMV0sIHBhcmFtLnNvdXJjZVNwYW4sIHJlc3VsdC5jb250ZXh0LCBlcnJvcnMpO1xuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgY29uc3QgdHJhY2tNYXRjaCA9IHBhcmFtLmV4cHJlc3Npb24ubWF0Y2goRk9SX0xPT1BfVFJBQ0tfUEFUVEVSTik7XG5cbiAgICBpZiAodHJhY2tNYXRjaCAhPT0gbnVsbCkge1xuICAgICAgaWYgKHJlc3VsdC50cmFja0J5ICE9PSBudWxsKSB7XG4gICAgICAgIGVycm9ycy5wdXNoKFxuICAgICAgICAgICAgbmV3IFBhcnNlRXJyb3IocGFyYW0uc291cmNlU3BhbiwgJ0Bmb3IgbG9vcCBjYW4gb25seSBoYXZlIG9uZSBcInRyYWNrXCIgZXhwcmVzc2lvbicpKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnN0IGV4cHJlc3Npb24gPSBwYXJzZUJsb2NrUGFyYW1ldGVyVG9CaW5kaW5nKHBhcmFtLCBiaW5kaW5nUGFyc2VyLCB0cmFja01hdGNoWzFdKTtcbiAgICAgICAgY29uc3Qga2V5d29yZFNwYW4gPSBuZXcgUGFyc2VTb3VyY2VTcGFuKFxuICAgICAgICAgICAgcGFyYW0uc291cmNlU3Bhbi5zdGFydCwgcGFyYW0uc291cmNlU3Bhbi5zdGFydC5tb3ZlQnkoJ3RyYWNrJy5sZW5ndGgpKTtcbiAgICAgICAgcmVzdWx0LnRyYWNrQnkgPSB7ZXhwcmVzc2lvbiwga2V5d29yZFNwYW59O1xuICAgICAgfVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgZXJyb3JzLnB1c2goXG4gICAgICAgIG5ldyBQYXJzZUVycm9yKHBhcmFtLnNvdXJjZVNwYW4sIGBVbnJlY29nbml6ZWQgQGZvciBsb29wIHBhcmFtYXRlciBcIiR7cGFyYW0uZXhwcmVzc2lvbn1cImApKTtcbiAgfVxuXG4gIC8vIEZpbGwgb3V0IGFueSB2YXJpYWJsZXMgdGhhdCBoYXZlbid0IGJlZW4gZGVmaW5lZCBleHBsaWNpdGx5LlxuICBmb3IgKGNvbnN0IHZhcmlhYmxlTmFtZSBvZiBBTExPV0VEX0ZPUl9MT09QX0xFVF9WQVJJQUJMRVMpIHtcbiAgICBpZiAoIXJlc3VsdC5jb250ZXh0Lmhhc093blByb3BlcnR5KHZhcmlhYmxlTmFtZSkpIHtcbiAgICAgIC8vIEdpdmUgYW1iaWVudGx5LWF2YWlsYWJsZSBjb250ZXh0IHZhcmlhYmxlcyBlbXB0eSBzcGFucyBhdCB0aGUgZW5kIG9mIHRoZSBzdGFydCBvZiB0aGUgYGZvcmBcbiAgICAgIC8vIGJsb2NrLCBzaW5jZSB0aGV5IGFyZSBub3QgZXhwbGljaXRseSBkZWZpbmVkLlxuICAgICAgY29uc3QgZW1wdHlTcGFuQWZ0ZXJGb3JCbG9ja1N0YXJ0ID1cbiAgICAgICAgICBuZXcgUGFyc2VTb3VyY2VTcGFuKGJsb2NrLnN0YXJ0U291cmNlU3Bhbi5lbmQsIGJsb2NrLnN0YXJ0U291cmNlU3Bhbi5lbmQpO1xuICAgICAgcmVzdWx0LmNvbnRleHRbdmFyaWFibGVOYW1lXSA9IG5ldyB0LlZhcmlhYmxlKFxuICAgICAgICAgIHZhcmlhYmxlTmFtZSwgdmFyaWFibGVOYW1lLCBlbXB0eVNwYW5BZnRlckZvckJsb2NrU3RhcnQsIGVtcHR5U3BhbkFmdGVyRm9yQmxvY2tTdGFydCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqIFBhcnNlcyB0aGUgYGxldGAgcGFyYW1ldGVyIG9mIGEgYGZvcmAgbG9vcCBibG9jay4gKi9cbmZ1bmN0aW9uIHBhcnNlTGV0UGFyYW1ldGVyKFxuICAgIHNvdXJjZVNwYW46IFBhcnNlU291cmNlU3BhbiwgZXhwcmVzc2lvbjogc3RyaW5nLCBzcGFuOiBQYXJzZVNvdXJjZVNwYW4sXG4gICAgY29udGV4dDogdC5Gb3JMb29wQmxvY2tDb250ZXh0LCBlcnJvcnM6IFBhcnNlRXJyb3JbXSk6IHZvaWQge1xuICBjb25zdCBwYXJ0cyA9IGV4cHJlc3Npb24uc3BsaXQoJywnKTtcblxuICBmb3IgKGNvbnN0IHBhcnQgb2YgcGFydHMpIHtcbiAgICBjb25zdCBleHByZXNzaW9uUGFydHMgPSBwYXJ0LnNwbGl0KCc9Jyk7XG4gICAgY29uc3QgbmFtZSA9IGV4cHJlc3Npb25QYXJ0cy5sZW5ndGggPT09IDIgPyBleHByZXNzaW9uUGFydHNbMF0udHJpbSgpIDogJyc7XG4gICAgY29uc3QgdmFyaWFibGVOYW1lID0gKGV4cHJlc3Npb25QYXJ0cy5sZW5ndGggPT09IDIgPyBleHByZXNzaW9uUGFydHNbMV0udHJpbSgpIDogJycpIGFzXG4gICAgICAgIGtleW9mIHQuRm9yTG9vcEJsb2NrQ29udGV4dDtcblxuICAgIGlmIChuYW1lLmxlbmd0aCA9PT0gMCB8fCB2YXJpYWJsZU5hbWUubGVuZ3RoID09PSAwKSB7XG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihcbiAgICAgICAgICBzb3VyY2VTcGFuLFxuICAgICAgICAgIGBJbnZhbGlkIEBmb3IgbG9vcCBcImxldFwiIHBhcmFtZXRlci4gUGFyYW1ldGVyIHNob3VsZCBtYXRjaCB0aGUgcGF0dGVybiBcIjxuYW1lPiA9IDx2YXJpYWJsZSBuYW1lPlwiYCkpO1xuICAgIH0gZWxzZSBpZiAoIUFMTE9XRURfRk9SX0xPT1BfTEVUX1ZBUklBQkxFUy5oYXModmFyaWFibGVOYW1lKSkge1xuICAgICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoXG4gICAgICAgICAgc291cmNlU3BhbixcbiAgICAgICAgICBgVW5rbm93biBcImxldFwiIHBhcmFtZXRlciB2YXJpYWJsZSBcIiR7dmFyaWFibGVOYW1lfVwiLiBUaGUgYWxsb3dlZCB2YXJpYWJsZXMgYXJlOiAke1xuICAgICAgICAgICAgICBBcnJheS5mcm9tKEFMTE9XRURfRk9SX0xPT1BfTEVUX1ZBUklBQkxFUykuam9pbignLCAnKX1gKSk7XG4gICAgfSBlbHNlIGlmIChjb250ZXh0Lmhhc093blByb3BlcnR5KHZhcmlhYmxlTmFtZSkpIHtcbiAgICAgIGVycm9ycy5wdXNoKFxuICAgICAgICAgIG5ldyBQYXJzZUVycm9yKHNvdXJjZVNwYW4sIGBEdXBsaWNhdGUgXCJsZXRcIiBwYXJhbWV0ZXIgdmFyaWFibGUgXCIke3ZhcmlhYmxlTmFtZX1cImApKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY29udGV4dFt2YXJpYWJsZU5hbWVdID0gbmV3IHQuVmFyaWFibGUobmFtZSwgdmFyaWFibGVOYW1lLCBzcGFuLCBzcGFuKTtcbiAgICB9XG4gIH1cbn1cblxuLyoqXG4gKiBDaGVja3MgdGhhdCB0aGUgc2hhcGUgb2YgdGhlIGJsb2NrcyBjb25uZWN0ZWQgdG8gYW5cbiAqIGBAaWZgIGJsb2NrIGlzIGNvcnJlY3QuIFJldHVybnMgYW4gYXJyYXkgb2YgZXJyb3JzLlxuICovXG5mdW5jdGlvbiB2YWxpZGF0ZUlmQ29ubmVjdGVkQmxvY2tzKGNvbm5lY3RlZEJsb2NrczogaHRtbC5CbG9ja1tdKTogUGFyc2VFcnJvcltdIHtcbiAgY29uc3QgZXJyb3JzOiBQYXJzZUVycm9yW10gPSBbXTtcbiAgbGV0IGhhc0Vsc2UgPSBmYWxzZTtcblxuICBmb3IgKGxldCBpID0gMDsgaSA8IGNvbm5lY3RlZEJsb2Nrcy5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGJsb2NrID0gY29ubmVjdGVkQmxvY2tzW2ldO1xuXG4gICAgaWYgKGJsb2NrLm5hbWUgPT09ICdlbHNlJykge1xuICAgICAgaWYgKGhhc0Vsc2UpIHtcbiAgICAgICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoYmxvY2suc291cmNlU3BhbiwgJ0NvbmRpdGlvbmFsIGNhbiBvbmx5IGhhdmUgb25lIEBlbHNlIGJsb2NrJykpO1xuICAgICAgfSBlbHNlIGlmIChjb25uZWN0ZWRCbG9ja3MubGVuZ3RoID4gMSAmJiBpIDwgY29ubmVjdGVkQmxvY2tzLmxlbmd0aCAtIDEpIHtcbiAgICAgICAgZXJyb3JzLnB1c2goXG4gICAgICAgICAgICBuZXcgUGFyc2VFcnJvcihibG9jay5zb3VyY2VTcGFuLCAnQGVsc2UgYmxvY2sgbXVzdCBiZSBsYXN0IGluc2lkZSB0aGUgY29uZGl0aW9uYWwnKSk7XG4gICAgICB9IGVsc2UgaWYgKGJsb2NrLnBhcmFtZXRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihibG9jay5zb3VyY2VTcGFuLCAnQGVsc2UgYmxvY2sgY2Fubm90IGhhdmUgcGFyYW1ldGVycycpKTtcbiAgICAgIH1cbiAgICAgIGhhc0Vsc2UgPSB0cnVlO1xuICAgIH0gZWxzZSBpZiAoIUVMU0VfSUZfUEFUVEVSTi50ZXN0KGJsb2NrLm5hbWUpKSB7XG4gICAgICBlcnJvcnMucHVzaChcbiAgICAgICAgICBuZXcgUGFyc2VFcnJvcihibG9jay5zb3VyY2VTcGFuLCBgVW5yZWNvZ25pemVkIGNvbmRpdGlvbmFsIGJsb2NrIEAke2Jsb2NrLm5hbWV9YCkpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcnJvcnM7XG59XG5cbi8qKiBDaGVja3MgdGhhdCB0aGUgc2hhcGUgb2YgYSBgc3dpdGNoYCBibG9jayBpcyB2YWxpZC4gUmV0dXJucyBhbiBhcnJheSBvZiBlcnJvcnMuICovXG5mdW5jdGlvbiB2YWxpZGF0ZVN3aXRjaEJsb2NrKGFzdDogaHRtbC5CbG9jayk6IFBhcnNlRXJyb3JbXSB7XG4gIGNvbnN0IGVycm9yczogUGFyc2VFcnJvcltdID0gW107XG4gIGxldCBoYXNEZWZhdWx0ID0gZmFsc2U7XG5cbiAgaWYgKGFzdC5wYXJhbWV0ZXJzLmxlbmd0aCAhPT0gMSkge1xuICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKGFzdC5zb3VyY2VTcGFuLCAnQHN3aXRjaCBibG9jayBtdXN0IGhhdmUgZXhhY3RseSBvbmUgcGFyYW1ldGVyJykpO1xuICAgIHJldHVybiBlcnJvcnM7XG4gIH1cblxuICBmb3IgKGNvbnN0IG5vZGUgb2YgYXN0LmNoaWxkcmVuKSB7XG4gICAgLy8gU2tpcCBvdmVyIGNvbW1lbnRzIGFuZCBlbXB0eSB0ZXh0IG5vZGVzIGluc2lkZSB0aGUgc3dpdGNoIGJsb2NrLlxuICAgIC8vIEVtcHR5IHRleHQgbm9kZXMgY2FuIGJlIHVzZWQgZm9yIGZvcm1hdHRpbmcgd2hpbGUgY29tbWVudHMgZG9uJ3QgYWZmZWN0IHRoZSBydW50aW1lLlxuICAgIGlmIChub2RlIGluc3RhbmNlb2YgaHRtbC5Db21tZW50IHx8XG4gICAgICAgIChub2RlIGluc3RhbmNlb2YgaHRtbC5UZXh0ICYmIG5vZGUudmFsdWUudHJpbSgpLmxlbmd0aCA9PT0gMCkpIHtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmICghKG5vZGUgaW5zdGFuY2VvZiBodG1sLkJsb2NrKSB8fCAobm9kZS5uYW1lICE9PSAnY2FzZScgJiYgbm9kZS5uYW1lICE9PSAnZGVmYXVsdCcpKSB7XG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihcbiAgICAgICAgICBub2RlLnNvdXJjZVNwYW4sICdAc3dpdGNoIGJsb2NrIGNhbiBvbmx5IGNvbnRhaW4gQGNhc2UgYW5kIEBkZWZhdWx0IGJsb2NrcycpKTtcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIGlmIChub2RlLm5hbWUgPT09ICdkZWZhdWx0Jykge1xuICAgICAgaWYgKGhhc0RlZmF1bHQpIHtcbiAgICAgICAgZXJyb3JzLnB1c2goXG4gICAgICAgICAgICBuZXcgUGFyc2VFcnJvcihub2RlLnNvdXJjZVNwYW4sICdAc3dpdGNoIGJsb2NrIGNhbiBvbmx5IGhhdmUgb25lIEBkZWZhdWx0IGJsb2NrJykpO1xuICAgICAgfSBlbHNlIGlmIChub2RlLnBhcmFtZXRlcnMubGVuZ3RoID4gMCkge1xuICAgICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihub2RlLnNvdXJjZVNwYW4sICdAZGVmYXVsdCBibG9jayBjYW5ub3QgaGF2ZSBwYXJhbWV0ZXJzJykpO1xuICAgICAgfVxuICAgICAgaGFzRGVmYXVsdCA9IHRydWU7XG4gICAgfSBlbHNlIGlmIChub2RlLm5hbWUgPT09ICdjYXNlJyAmJiBub2RlLnBhcmFtZXRlcnMubGVuZ3RoICE9PSAxKSB7XG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihub2RlLnNvdXJjZVNwYW4sICdAY2FzZSBibG9jayBtdXN0IGhhdmUgZXhhY3RseSBvbmUgcGFyYW1ldGVyJykpO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcnJvcnM7XG59XG5cbi8qKlxuICogUGFyc2VzIGEgYmxvY2sgcGFyYW1ldGVyIGludG8gYSBiaW5kaW5nIEFTVC5cbiAqIEBwYXJhbSBhc3QgQmxvY2sgcGFyYW1ldGVyIHRoYXQgc2hvdWxkIGJlIHBhcnNlZC5cbiAqIEBwYXJhbSBiaW5kaW5nUGFyc2VyIFBhcnNlciB0aGF0IHRoZSBleHByZXNzaW9uIHNob3VsZCBiZSBwYXJzZWQgd2l0aC5cbiAqIEBwYXJhbSBwYXJ0IFNwZWNpZmljIHBhcnQgb2YgdGhlIGV4cHJlc3Npb24gdGhhdCBzaG91bGQgYmUgcGFyc2VkLlxuICovXG5mdW5jdGlvbiBwYXJzZUJsb2NrUGFyYW1ldGVyVG9CaW5kaW5nKFxuICAgIGFzdDogaHRtbC5CbG9ja1BhcmFtZXRlciwgYmluZGluZ1BhcnNlcjogQmluZGluZ1BhcnNlciwgcGFydD86IHN0cmluZyk6IEFTVFdpdGhTb3VyY2Uge1xuICBsZXQgc3RhcnQ6IG51bWJlcjtcbiAgbGV0IGVuZDogbnVtYmVyO1xuXG4gIGlmICh0eXBlb2YgcGFydCA9PT0gJ3N0cmluZycpIHtcbiAgICAvLyBOb3RlOiBgbGFzdEluZGV4T2ZgIGhlcmUgc2hvdWxkIGJlIGVub3VnaCB0byBrbm93IHRoZSBzdGFydCBpbmRleCBvZiB0aGUgZXhwcmVzc2lvbixcbiAgICAvLyBiZWNhdXNlIHdlIGtub3cgdGhhdCBpdCdsbCBiZSBhdCB0aGUgZW5kIG9mIHRoZSBwYXJhbS4gSWRlYWxseSB3ZSBjb3VsZCB1c2UgdGhlIGBkYFxuICAgIC8vIGZsYWcgd2hlbiBtYXRjaGluZyB2aWEgcmVnZXggYW5kIGdldCB0aGUgaW5kZXggZnJvbSBgbWF0Y2guaW5kaWNlc2AsIGJ1dCBpdCdzIHVuY2xlYXJcbiAgICAvLyBpZiB3ZSBjYW4gdXNlIGl0IHlldCBzaW5jZSBpdCdzIGEgcmVsYXRpdmVseSBuZXcgZmVhdHVyZS4gU2VlOlxuICAgIC8vIGh0dHBzOi8vZ2l0aHViLmNvbS90YzM5L3Byb3Bvc2FsLXJlZ2V4cC1tYXRjaC1pbmRpY2VzXG4gICAgc3RhcnQgPSBNYXRoLm1heCgwLCBhc3QuZXhwcmVzc2lvbi5sYXN0SW5kZXhPZihwYXJ0KSk7XG4gICAgZW5kID0gc3RhcnQgKyBwYXJ0Lmxlbmd0aDtcbiAgfSBlbHNlIHtcbiAgICBzdGFydCA9IDA7XG4gICAgZW5kID0gYXN0LmV4cHJlc3Npb24ubGVuZ3RoO1xuICB9XG5cbiAgcmV0dXJuIGJpbmRpbmdQYXJzZXIucGFyc2VCaW5kaW5nKFxuICAgICAgYXN0LmV4cHJlc3Npb24uc2xpY2Uoc3RhcnQsIGVuZCksIGZhbHNlLCBhc3Quc291cmNlU3BhbiwgYXN0LnNvdXJjZVNwYW4uc3RhcnQub2Zmc2V0ICsgc3RhcnQpO1xufVxuXG4vKiogUGFyc2VzIHRoZSBwYXJhbWV0ZXIgb2YgYSBjb25kaXRpb25hbCBibG9jayAoYGlmYCBvciBgZWxzZSBpZmApLiAqL1xuZnVuY3Rpb24gcGFyc2VDb25kaXRpb25hbEJsb2NrUGFyYW1ldGVycyhcbiAgICBibG9jazogaHRtbC5CbG9jaywgZXJyb3JzOiBQYXJzZUVycm9yW10sIGJpbmRpbmdQYXJzZXI6IEJpbmRpbmdQYXJzZXIpIHtcbiAgaWYgKGJsb2NrLnBhcmFtZXRlcnMubGVuZ3RoID09PSAwKSB7XG4gICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoYmxvY2suc291cmNlU3BhbiwgJ0NvbmRpdGlvbmFsIGJsb2NrIGRvZXMgbm90IGhhdmUgYW4gZXhwcmVzc2lvbicpKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIGNvbnN0IGV4cHJlc3Npb24gPSBwYXJzZUJsb2NrUGFyYW1ldGVyVG9CaW5kaW5nKGJsb2NrLnBhcmFtZXRlcnNbMF0sIGJpbmRpbmdQYXJzZXIpO1xuICBsZXQgZXhwcmVzc2lvbkFsaWFzOiB0LlZhcmlhYmxlfG51bGwgPSBudWxsO1xuXG4gIC8vIFN0YXJ0IGZyb20gMSBzaW5jZSB3ZSBwcm9jZXNzZWQgdGhlIGZpcnN0IHBhcmFtZXRlciBhbHJlYWR5LlxuICBmb3IgKGxldCBpID0gMTsgaSA8IGJsb2NrLnBhcmFtZXRlcnMubGVuZ3RoOyBpKyspIHtcbiAgICBjb25zdCBwYXJhbSA9IGJsb2NrLnBhcmFtZXRlcnNbaV07XG4gICAgY29uc3QgYWxpYXNNYXRjaCA9IHBhcmFtLmV4cHJlc3Npb24ubWF0Y2goQ09ORElUSU9OQUxfQUxJQVNfUEFUVEVSTik7XG5cbiAgICAvLyBGb3Igbm93IGNvbmRpdGlvbmFscyBjYW4gb25seSBoYXZlIGFuIGBhc2AgcGFyYW1ldGVyLlxuICAgIC8vIFdlIG1heSB3YW50IHRvIHJld29yayB0aGlzIGxhdGVyIGlmIHdlIGFkZCBtb3JlLlxuICAgIGlmIChhbGlhc01hdGNoID09PSBudWxsKSB7XG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihcbiAgICAgICAgICBwYXJhbS5zb3VyY2VTcGFuLCBgVW5yZWNvZ25pemVkIGNvbmRpdGlvbmFsIHBhcmFtYXRlciBcIiR7cGFyYW0uZXhwcmVzc2lvbn1cImApKTtcbiAgICB9IGVsc2UgaWYgKGJsb2NrLm5hbWUgIT09ICdpZicpIHtcbiAgICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKFxuICAgICAgICAgIHBhcmFtLnNvdXJjZVNwYW4sICdcImFzXCIgZXhwcmVzc2lvbiBpcyBvbmx5IGFsbG93ZWQgb24gdGhlIHByaW1hcnkgQGlmIGJsb2NrJykpO1xuICAgIH0gZWxzZSBpZiAoZXhwcmVzc2lvbkFsaWFzICE9PSBudWxsKSB7XG4gICAgICBlcnJvcnMucHVzaChcbiAgICAgICAgICBuZXcgUGFyc2VFcnJvcihwYXJhbS5zb3VyY2VTcGFuLCAnQ29uZGl0aW9uYWwgY2FuIG9ubHkgaGF2ZSBvbmUgXCJhc1wiIGV4cHJlc3Npb24nKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNvbnN0IG5hbWUgPSBhbGlhc01hdGNoWzFdLnRyaW0oKTtcbiAgICAgIGV4cHJlc3Npb25BbGlhcyA9IG5ldyB0LlZhcmlhYmxlKG5hbWUsIG5hbWUsIHBhcmFtLnNvdXJjZVNwYW4sIHBhcmFtLnNvdXJjZVNwYW4pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiB7ZXhwcmVzc2lvbiwgZXhwcmVzc2lvbkFsaWFzfTtcbn1cblxuLyoqIFN0cmlwcyBvcHRpb25hbCBwYXJlbnRoZXNlcyBhcm91bmQgZnJvbSBhIGNvbnRyb2wgZnJvbSBleHByZXNzaW9uIHBhcmFtZXRlci4gKi9cbmZ1bmN0aW9uIHN0cmlwT3B0aW9uYWxQYXJlbnRoZXNlcyhwYXJhbTogaHRtbC5CbG9ja1BhcmFtZXRlciwgZXJyb3JzOiBQYXJzZUVycm9yW10pOiBzdHJpbmd8bnVsbCB7XG4gIGNvbnN0IGV4cHJlc3Npb24gPSBwYXJhbS5leHByZXNzaW9uO1xuICBjb25zdCBzcGFjZVJlZ2V4ID0gL15cXHMkLztcbiAgbGV0IG9wZW5QYXJlbnMgPSAwO1xuICBsZXQgc3RhcnQgPSAwO1xuICBsZXQgZW5kID0gZXhwcmVzc2lvbi5sZW5ndGggLSAxO1xuXG4gIGZvciAobGV0IGkgPSAwOyBpIDwgZXhwcmVzc2lvbi5sZW5ndGg7IGkrKykge1xuICAgIGNvbnN0IGNoYXIgPSBleHByZXNzaW9uW2ldO1xuXG4gICAgaWYgKGNoYXIgPT09ICcoJykge1xuICAgICAgc3RhcnQgPSBpICsgMTtcbiAgICAgIG9wZW5QYXJlbnMrKztcbiAgICB9IGVsc2UgaWYgKHNwYWNlUmVnZXgudGVzdChjaGFyKSkge1xuICAgICAgY29udGludWU7XG4gICAgfSBlbHNlIHtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIGlmIChvcGVuUGFyZW5zID09PSAwKSB7XG4gICAgcmV0dXJuIGV4cHJlc3Npb247XG4gIH1cblxuICBmb3IgKGxldCBpID0gZXhwcmVzc2lvbi5sZW5ndGggLSAxOyBpID4gLTE7IGktLSkge1xuICAgIGNvbnN0IGNoYXIgPSBleHByZXNzaW9uW2ldO1xuXG4gICAgaWYgKGNoYXIgPT09ICcpJykge1xuICAgICAgZW5kID0gaTtcbiAgICAgIG9wZW5QYXJlbnMtLTtcbiAgICAgIGlmIChvcGVuUGFyZW5zID09PSAwKSB7XG4gICAgICAgIGJyZWFrO1xuICAgICAgfVxuICAgIH0gZWxzZSBpZiAoc3BhY2VSZWdleC50ZXN0KGNoYXIpKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9IGVsc2Uge1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgaWYgKG9wZW5QYXJlbnMgIT09IDApIHtcbiAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihwYXJhbS5zb3VyY2VTcGFuLCAnVW5jbG9zZWQgcGFyZW50aGVzZXMgaW4gZXhwcmVzc2lvbicpKTtcbiAgICByZXR1cm4gbnVsbDtcbiAgfVxuXG4gIHJldHVybiBleHByZXNzaW9uLnNsaWNlKHN0YXJ0LCBlbmQpO1xufVxuIl19