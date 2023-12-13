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
import { getTriggerParametersStart, parseDeferredTime, parseOnTrigger, parseWhenTrigger } from './r3_deferred_triggers';
/** Pattern to identify a `prefetch when` trigger. */
const PREFETCH_WHEN_PATTERN = /^prefetch\s+when\s/;
/** Pattern to identify a `prefetch on` trigger. */
const PREFETCH_ON_PATTERN = /^prefetch\s+on\s/;
/** Pattern to identify a `minimum` parameter in a block. */
const MINIMUM_PARAMETER_PATTERN = /^minimum\s/;
/** Pattern to identify a `after` parameter in a block. */
const AFTER_PARAMETER_PATTERN = /^after\s/;
/** Pattern to identify a `when` parameter in a block. */
const WHEN_PARAMETER_PATTERN = /^when\s/;
/** Pattern to identify a `on` parameter in a block. */
const ON_PARAMETER_PATTERN = /^on\s/;
/**
 * Predicate function that determines if a block with
 * a specific name cam be connected to a `defer` block.
 */
export function isConnectedDeferLoopBlock(name) {
    return name === 'placeholder' || name === 'loading' || name === 'error';
}
/** Creates a deferred block from an HTML AST node. */
export function createDeferredBlock(ast, connectedBlocks, visitor, bindingParser) {
    const errors = [];
    const { placeholder, loading, error } = parseConnectedBlocks(connectedBlocks, errors, visitor);
    const { triggers, prefetchTriggers } = parsePrimaryTriggers(ast.parameters, bindingParser, errors, placeholder);
    // The `defer` block has a main span encompassing all of the connected branches as well.
    let lastEndSourceSpan = ast.endSourceSpan;
    let endOfLastSourceSpan = ast.sourceSpan.end;
    if (connectedBlocks.length > 0) {
        const lastConnectedBlock = connectedBlocks[connectedBlocks.length - 1];
        lastEndSourceSpan = lastConnectedBlock.endSourceSpan;
        endOfLastSourceSpan = lastConnectedBlock.sourceSpan.end;
    }
    const sourceSpanWithConnectedBlocks = new ParseSourceSpan(ast.sourceSpan.start, endOfLastSourceSpan);
    const node = new t.DeferredBlock(html.visitAll(visitor, ast.children, ast.children), triggers, prefetchTriggers, placeholder, loading, error, ast.nameSpan, sourceSpanWithConnectedBlocks, ast.sourceSpan, ast.startSourceSpan, lastEndSourceSpan, ast.i18n);
    return { node, errors };
}
function parseConnectedBlocks(connectedBlocks, errors, visitor) {
    let placeholder = null;
    let loading = null;
    let error = null;
    for (const block of connectedBlocks) {
        try {
            if (!isConnectedDeferLoopBlock(block.name)) {
                errors.push(new ParseError(block.startSourceSpan, `Unrecognized block "@${block.name}"`));
                break;
            }
            switch (block.name) {
                case 'placeholder':
                    if (placeholder !== null) {
                        errors.push(new ParseError(block.startSourceSpan, `@defer block can only have one @placeholder block`));
                    }
                    else {
                        placeholder = parsePlaceholderBlock(block, visitor);
                    }
                    break;
                case 'loading':
                    if (loading !== null) {
                        errors.push(new ParseError(block.startSourceSpan, `@defer block can only have one @loading block`));
                    }
                    else {
                        loading = parseLoadingBlock(block, visitor);
                    }
                    break;
                case 'error':
                    if (error !== null) {
                        errors.push(new ParseError(block.startSourceSpan, `@defer block can only have one @error block`));
                    }
                    else {
                        error = parseErrorBlock(block, visitor);
                    }
                    break;
            }
        }
        catch (e) {
            errors.push(new ParseError(block.startSourceSpan, e.message));
        }
    }
    return { placeholder, loading, error };
}
function parsePlaceholderBlock(ast, visitor) {
    let minimumTime = null;
    for (const param of ast.parameters) {
        if (MINIMUM_PARAMETER_PATTERN.test(param.expression)) {
            if (minimumTime != null) {
                throw new Error(`@placeholder block can only have one "minimum" parameter`);
            }
            const parsedTime = parseDeferredTime(param.expression.slice(getTriggerParametersStart(param.expression)));
            if (parsedTime === null) {
                throw new Error(`Could not parse time value of parameter "minimum"`);
            }
            minimumTime = parsedTime;
        }
        else {
            throw new Error(`Unrecognized parameter in @placeholder block: "${param.expression}"`);
        }
    }
    return new t.DeferredBlockPlaceholder(html.visitAll(visitor, ast.children, ast.children), minimumTime, ast.nameSpan, ast.sourceSpan, ast.startSourceSpan, ast.endSourceSpan, ast.i18n);
}
function parseLoadingBlock(ast, visitor) {
    let afterTime = null;
    let minimumTime = null;
    for (const param of ast.parameters) {
        if (AFTER_PARAMETER_PATTERN.test(param.expression)) {
            if (afterTime != null) {
                throw new Error(`@loading block can only have one "after" parameter`);
            }
            const parsedTime = parseDeferredTime(param.expression.slice(getTriggerParametersStart(param.expression)));
            if (parsedTime === null) {
                throw new Error(`Could not parse time value of parameter "after"`);
            }
            afterTime = parsedTime;
        }
        else if (MINIMUM_PARAMETER_PATTERN.test(param.expression)) {
            if (minimumTime != null) {
                throw new Error(`@loading block can only have one "minimum" parameter`);
            }
            const parsedTime = parseDeferredTime(param.expression.slice(getTriggerParametersStart(param.expression)));
            if (parsedTime === null) {
                throw new Error(`Could not parse time value of parameter "minimum"`);
            }
            minimumTime = parsedTime;
        }
        else {
            throw new Error(`Unrecognized parameter in @loading block: "${param.expression}"`);
        }
    }
    return new t.DeferredBlockLoading(html.visitAll(visitor, ast.children, ast.children), afterTime, minimumTime, ast.nameSpan, ast.sourceSpan, ast.startSourceSpan, ast.endSourceSpan, ast.i18n);
}
function parseErrorBlock(ast, visitor) {
    if (ast.parameters.length > 0) {
        throw new Error(`@error block cannot have parameters`);
    }
    return new t.DeferredBlockError(html.visitAll(visitor, ast.children, ast.children), ast.nameSpan, ast.sourceSpan, ast.startSourceSpan, ast.endSourceSpan, ast.i18n);
}
function parsePrimaryTriggers(params, bindingParser, errors, placeholder) {
    const triggers = {};
    const prefetchTriggers = {};
    for (const param of params) {
        // The lexer ignores the leading spaces so we can assume
        // that the expression starts with a keyword.
        if (WHEN_PARAMETER_PATTERN.test(param.expression)) {
            parseWhenTrigger(param, bindingParser, triggers, errors);
        }
        else if (ON_PARAMETER_PATTERN.test(param.expression)) {
            parseOnTrigger(param, triggers, errors, placeholder);
        }
        else if (PREFETCH_WHEN_PATTERN.test(param.expression)) {
            parseWhenTrigger(param, bindingParser, prefetchTriggers, errors);
        }
        else if (PREFETCH_ON_PATTERN.test(param.expression)) {
            parseOnTrigger(param, prefetchTriggers, errors, placeholder);
        }
        else {
            errors.push(new ParseError(param.sourceSpan, 'Unrecognized trigger'));
        }
    }
    return { triggers, prefetchTriggers };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicjNfZGVmZXJyZWRfYmxvY2tzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3JlbmRlcjMvcjNfZGVmZXJyZWRfYmxvY2tzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxJQUFJLE1BQU0sa0JBQWtCLENBQUM7QUFDekMsT0FBTyxFQUFDLFVBQVUsRUFBRSxlQUFlLEVBQUMsTUFBTSxlQUFlLENBQUM7QUFHMUQsT0FBTyxLQUFLLENBQUMsTUFBTSxVQUFVLENBQUM7QUFDOUIsT0FBTyxFQUFDLHlCQUF5QixFQUFFLGlCQUFpQixFQUFFLGNBQWMsRUFBRSxnQkFBZ0IsRUFBQyxNQUFNLHdCQUF3QixDQUFDO0FBRXRILHFEQUFxRDtBQUNyRCxNQUFNLHFCQUFxQixHQUFHLG9CQUFvQixDQUFDO0FBRW5ELG1EQUFtRDtBQUNuRCxNQUFNLG1CQUFtQixHQUFHLGtCQUFrQixDQUFDO0FBRS9DLDREQUE0RDtBQUM1RCxNQUFNLHlCQUF5QixHQUFHLFlBQVksQ0FBQztBQUUvQywwREFBMEQ7QUFDMUQsTUFBTSx1QkFBdUIsR0FBRyxVQUFVLENBQUM7QUFFM0MseURBQXlEO0FBQ3pELE1BQU0sc0JBQXNCLEdBQUcsU0FBUyxDQUFDO0FBRXpDLHVEQUF1RDtBQUN2RCxNQUFNLG9CQUFvQixHQUFHLE9BQU8sQ0FBQztBQUVyQzs7O0dBR0c7QUFDSCxNQUFNLFVBQVUseUJBQXlCLENBQUMsSUFBWTtJQUNwRCxPQUFPLElBQUksS0FBSyxhQUFhLElBQUksSUFBSSxLQUFLLFNBQVMsSUFBSSxJQUFJLEtBQUssT0FBTyxDQUFDO0FBQzFFLENBQUM7QUFFRCxzREFBc0Q7QUFDdEQsTUFBTSxVQUFVLG1CQUFtQixDQUMvQixHQUFlLEVBQUUsZUFBNkIsRUFBRSxPQUFxQixFQUNyRSxhQUE0QjtJQUM5QixNQUFNLE1BQU0sR0FBaUIsRUFB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Q29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaHRtbCBmcm9tICcuLi9tbF9wYXJzZXIvYXN0JztcbmltcG9ydCB7UGFyc2VFcnJvciwgUGFyc2VTb3VyY2VTcGFufSBmcm9tICcuLi9wYXJzZV91dGlsJztcbmltcG9ydCB7QmluZGluZ1BhcnNlcn0gZnJvbSAnLi4vdGVtcGxhdGVfcGFyc2VyL2JpbmRpbmdfcGFyc2VyJztcblxuaW1wb3J0ICogYXMgdCBmcm9tICcuL3IzX2FzdCc7XG5pbXBvcnQge2dldFRyaWdnZXJQYXJhbWV0ZXJzU3RhcnQsIHBhcnNlRGVmZXJyZWRUaW1lLCBwYXJzZU9uVHJpZ2dlciwgcGFyc2VXaGVuVHJpZ2dlcn0gZnJvbSAnLi9yM19kZWZlcnJlZF90cmlnZ2Vycyc7XG5cbi8qKiBQYXR0ZXJuIHRvIGlkZW50aWZ5IGEgYHByZWZldGNoIHdoZW5gIHRyaWdnZXIuICovXG5jb25zdCBQUkVGRVRDSF9XSEVOX1BBVFRFUk4gPSAvXnByZWZldGNoXFxzK3doZW5cXHMvO1xuXG4vKiogUGF0dGVybiB0byBpZGVudGlmeSBhIGBwcmVmZXRjaCBvbmAgdHJpZ2dlci4gKi9cbmNvbnN0IFBSRUZFVENIX09OX1BBVFRFUk4gPSAvXnByZWZldGNoXFxzK29uXFxzLztcblxuLyoqIFBhdHRlcm4gdG8gaWRlbnRpZnkgYSBgbWluaW11bWAgcGFyYW1ldGVyIGluIGEgYmxvY2suICovXG5jb25zdCBNSU5JTVVNX1BBUkFNRVRFUl9QQVRURVJOID0gL15taW5pbXVtXFxzLztcblxuLyoqIFBhdHRlcm4gdG8gaWRlbnRpZnkgYSBgYWZ0ZXJgIHBhcmFtZXRlciBpbiBhIGJsb2NrLiAqL1xuY29uc3QgQUZURVJfUEFSQU1FVEVSX1BBVFRFUk4gPSAvXmFmdGVyXFxzLztcblxuLyoqIFBhdHRlcm4gdG8gaWRlbnRpZnkgYSBgd2hlbmAgcGFyYW1ldGVyIGluIGEgYmxvY2suICovXG5jb25zdCBXSEVOX1BBUkFNRVRFUl9QQVRURVJOID0gL153aGVuXFxzLztcblxuLyoqIFBhdHRlcm4gdG8gaWRlbnRpZnkgYSBgb25gIHBhcmFtZXRlciBpbiBhIGJsb2NrLiAqL1xuY29uc3QgT05fUEFSQU1FVEVSX1BBVFRFUk4gPSAvXm9uXFxzLztcblxuLyoqXG4gKiBQcmVkaWNhdGUgZnVuY3Rpb24gdGhhdCBkZXRlcm1pbmVzIGlmIGEgYmxvY2sgd2l0aFxuICogYSBzcGVjaWZpYyBuYW1lIGNhbSBiZSBjb25uZWN0ZWQgdG8gYSBgZGVmZXJgIGJsb2NrLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNDb25uZWN0ZWREZWZlckxvb3BCbG9jayhuYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgcmV0dXJuIG5hbWUgPT09ICdwbGFjZWhvbGRlcicgfHwgbmFtZSA9PT0gJ2xvYWRpbmcnIHx8IG5hbWUgPT09ICdlcnJvcic7XG59XG5cbi8qKiBDcmVhdGVzIGEgZGVmZXJyZWQgYmxvY2sgZnJvbSBhbiBIVE1MIEFTVCBub2RlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURlZmVycmVkQmxvY2soXG4gICAgYXN0OiBodG1sLkJsb2NrLCBjb25uZWN0ZWRCbG9ja3M6IGh0bWwuQmxvY2tbXSwgdmlzaXRvcjogaHRtbC5WaXNpdG9yLFxuICAgIGJpbmRpbmdQYXJzZXI6IEJpbmRpbmdQYXJzZXIpOiB7bm9kZTogdC5EZWZlcnJlZEJsb2NrLCBlcnJvcnM6IFBhcnNlRXJyb3JbXX0ge1xuICBjb25zdCBlcnJvcnM6IFBhcnNlRXJyb3JbXSA9IFtdO1xuICBjb25zdCB7cGxhY2Vob2xkZXIsIGxvYWRpbmcsIGVycm9yfSA9IHBhcnNlQ29ubmVjdGVkQmxvY2tzKGNvbm5lY3RlZEJsb2NrcywgZXJyb3JzLCB2aXNpdG9yKTtcbiAgY29uc3Qge3RyaWdnZXJzLCBwcmVmZXRjaFRyaWdnZXJzfSA9XG4gICAgICBwYXJzZVByaW1hcnlUcmlnZ2Vycyhhc3QucGFyYW1ldGVycywgYmluZGluZ1BhcnNlciwgZXJyb3JzLCBwbGFjZWhvbGRlcik7XG5cbiAgLy8gVGhlIGBkZWZlcmAgYmxvY2sgaGFzIGEgbWFpbiBzcGFuIGVuY29tcGFzc2luZyBhbGwgb2YgdGhlIGNvbm5lY3RlZCBicmFuY2hlcyBhcyB3ZWxsLlxuICBsZXQgbGFzdEVuZFNvdXJjZVNwYW4gPSBhc3QuZW5kU291cmNlU3BhbjtcbiAgbGV0IGVuZE9mTGFzdFNvdXJjZVNwYW4gPSBhc3Quc291cmNlU3Bhbi5lbmQ7XG4gIGlmIChjb25uZWN0ZWRCbG9ja3MubGVuZ3RoID4gMCkge1xuICAgIGNvbnN0IGxhc3RDb25uZWN0ZWRCbG9jayA9IGNvbm5lY3RlZEJsb2Nrc1tjb25uZWN0ZWRCbG9ja3MubGVuZ3RoIC0gMV07XG4gICAgbGFzdEVuZFNvdXJjZVNwYW4gPSBsYXN0Q29ubmVjdGVkQmxvY2suZW5kU291cmNlU3BhbjtcbiAgICBlbmRPZkxhc3RTb3VyY2VTcGFuID0gbGFzdENvbm5lY3RlZEJsb2NrLnNvdXJjZVNwYW4uZW5kO1xuICB9XG5cbiAgY29uc3Qgc291cmNlU3BhbldpdGhDb25uZWN0ZWRCbG9ja3MgPVxuICAgICAgbmV3IFBhcnNlU291cmNlU3Bhbihhc3Quc291cmNlU3Bhbi5zdGFydCwgZW5kT2ZMYXN0U291cmNlU3Bhbik7XG5cbiAgY29uc3Qgbm9kZSA9IG5ldyB0LkRlZmVycmVkQmxvY2soXG4gICAgICBodG1sLnZpc2l0QWxsKHZpc2l0b3IsIGFzdC5jaGlsZHJlbiwgYXN0LmNoaWxkcmVuKSwgdHJpZ2dlcnMsIHByZWZldGNoVHJpZ2dlcnMsIHBsYWNlaG9sZGVyLFxuICAgICAgbG9hZGluZywgZXJyb3IsIGFzdC5uYW1lU3Bhbiwgc291cmNlU3BhbldpdGhDb25uZWN0ZWRCbG9ja3MsIGFzdC5zb3VyY2VTcGFuLFxuICAgICAgYXN0LnN0YXJ0U291cmNlU3BhbiwgbGFzdEVuZFNvdXJjZVNwYW4sIGFzdC5pMThuKTtcblxuICByZXR1cm4ge25vZGUsIGVycm9yc307XG59XG5cbmZ1bmN0aW9uIHBhcnNlQ29ubmVjdGVkQmxvY2tzKFxuICAgIGNvbm5lY3RlZEJsb2NrczogaHRtbC5CbG9ja1tdLCBlcnJvcnM6IFBhcnNlRXJyb3JbXSwgdmlzaXRvcjogaHRtbC5WaXNpdG9yKSB7XG4gIGxldCBwbGFjZWhvbGRlcjogdC5EZWZlcnJlZEJsb2NrUGxhY2Vob2xkZXJ8bnVsbCA9IG51bGw7XG4gIGxldCBsb2FkaW5nOiB0LkRlZmVycmVkQmxvY2tMb2FkaW5nfG51bGwgPSBudWxsO1xuICBsZXQgZXJyb3I6IHQuRGVmZXJyZWRCbG9ja0Vycm9yfG51bGwgPSBudWxsO1xuXG4gIGZvciAoY29uc3QgYmxvY2sgb2YgY29ubmVjdGVkQmxvY2tzKSB7XG4gICAgdHJ5IHtcbiAgICAgIGlmICghaXNDb25uZWN0ZWREZWZlckxvb3BCbG9jayhibG9jay5uYW1lKSkge1xuICAgICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihibG9jay5zdGFydFNvdXJjZVNwYW4sIGBVbnJlY29nbml6ZWQgYmxvY2sgXCJAJHtibG9jay5uYW1lfVwiYCkpO1xuICAgICAgICBicmVhaztcbiAgICAgIH1cblxuICAgICAgc3dpdGNoIChibG9jay5uYW1lKSB7XG4gICAgICAgIGNhc2UgJ3BsYWNlaG9sZGVyJzpcbiAgICAgICAgICBpZiAocGxhY2Vob2xkZXIgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKFxuICAgICAgICAgICAgICAgIGJsb2NrLnN0YXJ0U291cmNlU3BhbiwgYEBkZWZlciBibG9jayBjYW4gb25seSBoYXZlIG9uZSBAcGxhY2Vob2xkZXIgYmxvY2tgKSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyID0gcGFyc2VQbGFjZWhvbGRlckJsb2NrKGJsb2NrLCB2aXNpdG9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnbG9hZGluZyc6XG4gICAgICAgICAgaWYgKGxvYWRpbmcgIT09IG51bGwpIHtcbiAgICAgICAgICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKFxuICAgICAgICAgICAgICAgIGJsb2NrLnN0YXJ0U291cmNlU3BhbiwgYEBkZWZlciBibG9jayBjYW4gb25seSBoYXZlIG9uZSBAbG9hZGluZyBibG9ja2ApKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgbG9hZGluZyA9IHBhcnNlTG9hZGluZ0Jsb2NrKGJsb2NrLCB2aXNpdG9yKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgY2FzZSAnZXJyb3InOlxuICAgICAgICAgIGlmIChlcnJvciAhPT0gbnVsbCkge1xuICAgICAgICAgICAgZXJyb3JzLnB1c2gobmV3IFBhcnNlRXJyb3IoXG4gICAgICAgICAgICAgICAgYmxvY2suc3RhcnRTb3VyY2VTcGFuLCBgQGRlZmVyIGJsb2NrIGNhbiBvbmx5IGhhdmUgb25lIEBlcnJvciBibG9ja2ApKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXJyb3IgPSBwYXJzZUVycm9yQmxvY2soYmxvY2ssIHZpc2l0b3IpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBlcnJvcnMucHVzaChuZXcgUGFyc2VFcnJvcihibG9jay5zdGFydFNvdXJjZVNwYW4sIChlIGFzIEVycm9yKS5tZXNzYWdlKSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIHtwbGFjZWhvbGRlciwgbG9hZGluZywgZXJyb3J9O1xufVxuXG5mdW5jdGlvbiBwYXJzZVBsYWNlaG9sZGVyQmxvY2soYXN0OiBodG1sLkJsb2NrLCB2aXNpdG9yOiBodG1sLlZpc2l0b3IpOiB0LkRlZmVycmVkQmxvY2tQbGFjZWhvbGRlciB7XG4gIGxldCBtaW5pbXVtVGltZTogbnVtYmVyfG51bGwgPSBudWxsO1xuXG4gIGZvciAoY29uc3QgcGFyYW0gb2YgYXN0LnBhcmFtZXRlcnMpIHtcbiAgICBpZiAoTUlOSU1VTV9QQVJBTUVURVJfUEFUVEVSTi50ZXN0KHBhcmFtLmV4cHJlc3Npb24pKSB7XG4gICAgICBpZiAobWluaW11bVRpbWUgIT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEBwbGFjZWhvbGRlciBibG9jayBjYW4gb25seSBoYXZlIG9uZSBcIm1pbmltdW1cIiBwYXJhbWV0ZXJgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VkVGltZSA9XG4gICAgICAgICAgcGFyc2VEZWZlcnJlZFRpbWUocGFyYW0uZXhwcmVzc2lvbi5zbGljZShnZXRUcmlnZ2VyUGFyYW1ldGVyc1N0YXJ0KHBhcmFtLmV4cHJlc3Npb24pKSk7XG5cbiAgICAgIGlmIChwYXJzZWRUaW1lID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHBhcnNlIHRpbWUgdmFsdWUgb2YgcGFyYW1ldGVyIFwibWluaW11bVwiYCk7XG4gICAgICB9XG5cbiAgICAgIG1pbmltdW1UaW1lID0gcGFyc2VkVGltZTtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBVbnJlY29nbml6ZWQgcGFyYW1ldGVyIGluIEBwbGFjZWhvbGRlciBibG9jazogXCIke3BhcmFtLmV4cHJlc3Npb259XCJgKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gbmV3IHQuRGVmZXJyZWRCbG9ja1BsYWNlaG9sZGVyKFxuICAgICAgaHRtbC52aXNpdEFsbCh2aXNpdG9yLCBhc3QuY2hpbGRyZW4sIGFzdC5jaGlsZHJlbiksIG1pbmltdW1UaW1lLCBhc3QubmFtZVNwYW4sIGFzdC5zb3VyY2VTcGFuLFxuICAgICAgYXN0LnN0YXJ0U291cmNlU3BhbiwgYXN0LmVuZFNvdXJjZVNwYW4sIGFzdC5pMThuKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VMb2FkaW5nQmxvY2soYXN0OiBodG1sLkJsb2NrLCB2aXNpdG9yOiBodG1sLlZpc2l0b3IpOiB0LkRlZmVycmVkQmxvY2tMb2FkaW5nIHtcbiAgbGV0IGFmdGVyVGltZTogbnVtYmVyfG51bGwgPSBudWxsO1xuICBsZXQgbWluaW11bVRpbWU6IG51bWJlcnxudWxsID0gbnVsbDtcblxuICBmb3IgKGNvbnN0IHBhcmFtIG9mIGFzdC5wYXJhbWV0ZXJzKSB7XG4gICAgaWYgKEFGVEVSX1BBUkFNRVRFUl9QQVRURVJOLnRlc3QocGFyYW0uZXhwcmVzc2lvbikpIHtcbiAgICAgIGlmIChhZnRlclRpbWUgIT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEBsb2FkaW5nIGJsb2NrIGNhbiBvbmx5IGhhdmUgb25lIFwiYWZ0ZXJcIiBwYXJhbWV0ZXJgKTtcbiAgICAgIH1cblxuICAgICAgY29uc3QgcGFyc2VkVGltZSA9XG4gICAgICAgICAgcGFyc2VEZWZlcnJlZFRpbWUocGFyYW0uZXhwcmVzc2lvbi5zbGljZShnZXRUcmlnZ2VyUGFyYW1ldGVyc1N0YXJ0KHBhcmFtLmV4cHJlc3Npb24pKSk7XG5cbiAgICAgIGlmIChwYXJzZWRUaW1lID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQ291bGQgbm90IHBhcnNlIHRpbWUgdmFsdWUgb2YgcGFyYW1ldGVyIFwiYWZ0ZXJcImApO1xuICAgICAgfVxuXG4gICAgICBhZnRlclRpbWUgPSBwYXJzZWRUaW1lO1xuICAgIH0gZWxzZSBpZiAoTUlOSU1VTV9QQVJBTUVURVJfUEFUVEVSTi50ZXN0KHBhcmFtLmV4cHJlc3Npb24pKSB7XG4gICAgICBpZiAobWluaW11bVRpbWUgIT0gbnVsbCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEBsb2FkaW5nIGJsb2NrIGNhbiBvbmx5IGhhdmUgb25lIFwibWluaW11bVwiIHBhcmFtZXRlcmApO1xuICAgICAgfVxuXG4gICAgICBjb25zdCBwYXJzZWRUaW1lID1cbiAgICAgICAgICBwYXJzZURlZmVycmVkVGltZShwYXJhbS5leHByZXNzaW9uLnNsaWNlKGdldFRyaWdnZXJQYXJhbWV0ZXJzU3RhcnQocGFyYW0uZXhwcmVzc2lvbikpKTtcblxuICAgICAgaWYgKHBhcnNlZFRpbWUgPT09IG51bGwpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBDb3VsZCBub3QgcGFyc2UgdGltZSB2YWx1ZSBvZiBwYXJhbWV0ZXIgXCJtaW5pbXVtXCJgKTtcbiAgICAgIH1cblxuICAgICAgbWluaW11bVRpbWUgPSBwYXJzZWRUaW1lO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoYFVucmVjb2duaXplZCBwYXJhbWV0ZXIgaW4gQGxvYWRpbmcgYmxvY2s6IFwiJHtwYXJhbS5leHByZXNzaW9ufVwiYCk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIG5ldyB0LkRlZmVycmVkQmxvY2tMb2FkaW5nKFxuICAgICAgaHRtbC52aXNpdEFsbCh2aXNpdG9yLCBhc3QuY2hpbGRyZW4sIGFzdC5jaGlsZHJlbiksIGFmdGVyVGltZSwgbWluaW11bVRpbWUsIGFzdC5uYW1lU3BhbixcbiAgICAgIGFzdC5zb3VyY2VTcGFuLCBhc3Quc3RhcnRTb3VyY2VTcGFuLCBhc3QuZW5kU291cmNlU3BhbiwgYXN0LmkxOG4pO1xufVxuXG5cbmZ1bmN0aW9uIHBhcnNlRXJyb3JCbG9jayhhc3Q6IGh0bWwuQmxvY2ssIHZpc2l0b3I6IGh0bWwuVmlzaXRvcik6IHQuRGVmZXJyZWRCbG9ja0Vycm9yIHtcbiAgaWYgKGFzdC5wYXJhbWV0ZXJzLmxlbmd0aCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYEBlcnJvciBibG9jayBjYW5ub3QgaGF2ZSBwYXJhbWV0ZXJzYCk7XG4gIH1cblxuICByZXR1cm4gbmV3IHQuRGVmZXJyZWRCbG9ja0Vycm9yKFxuICAgICAgaHRtbC52aXNpdEFsbCh2aXNpdG9yLCBhc3QuY2hpbGRyZW4sIGFzdC5jaGlsZHJlbiksIGFzdC5uYW1lU3BhbiwgYXN0LnNvdXJjZVNwYW4sXG4gICAgICBhc3Quc3RhcnRTb3VyY2VTcGFuLCBhc3QuZW5kU291cmNlU3BhbiwgYXN0LmkxOG4pO1xufVxuXG5mdW5jdGlvbiBwYXJzZVByaW1hcnlUcmlnZ2VycyhcbiAgICBwYXJhbXM6IGh0bWwuQmxvY2tQYXJhbWV0ZXJbXSwgYmluZGluZ1BhcnNlcjogQmluZGluZ1BhcnNlciwgZXJyb3JzOiBQYXJzZUVycm9yW10sXG4gICAgcGxhY2Vob2xkZXI6IHQuRGVmZXJyZWRCbG9ja1BsYWNlaG9sZGVyfG51bGwpIHtcbiAgY29uc3QgdHJpZ2dlcnM6IHQuRGVmZXJyZWRCbG9ja1RyaWdnZXJzID0ge307XG4gIGNvbnN0IHByZWZldGNoVHJpZ2dlcnM6IHQuRGVmZXJyZWRCbG9ja1RyaWdnZXJzID0ge307XG5cbiAgZm9yIChjb25zdCBwYXJhbSBvZiBwYXJhbXMpIHtcbiAgICAvLyBUaGUgbGV4ZXIgaWdub3JlcyB0aGUgbGVhZGluZyBzcGFjZXMgc28gd2UgY2FuIGFzc3VtZVxuICAgIC8vIHRoYXQgdGhlIGV4cHJlc3Npb24gc3RhcnRzIHdpdGggYSBrZXl3b3JkLlxuICAgIGlmIChXSEVOX1BBUkFNRVRFUl9QQVRURVJOLnRlc3QocGFyYW0uZXhwcmVzc2lvbikpIHtcbiAgICAgIHBhcnNlV2hlblRyaWdnZXIocGFyYW0sIGJpbmRpbmdQYXJzZXIsIHRyaWdnZXJzLCBlcnJvcnMpO1xuICAgIH0gZWxzZSBpZiAoT05fUEFSQU1FVEVSX1BBVFRFUk4udGVzdChwYXJhbS5leHByZXNzaW9uKSkge1xuICAgICAgcGFyc2VPblRyaWdnZXIocGFyYW0sIHRyaWdnZXJzLCBlcnJvcnMsIHBsYWNlaG9sZGVyKTtcbiAgICB9IGVsc2UgaWYgKFBSRUZFVENIX1dIRU5fUEFUVEVSTi50ZXN0KHBhcmFtLmV4cHJlc3Npb24pKSB7XG4gICAgICBwYXJzZVdoZW5UcmlnZ2VyKHBhcmFtLCBiaW5kaW5nUGFyc2VyLCBwcmVmZXRjaFRyaWdnZXJzLCBlcnJvcnMpO1xuICAgIH0gZWxzZSBpZiAoUFJFRkVUQ0hfT05fUEFUVEVSTi50ZXN0KHBhcmFtLmV4cHJlc3Npb24pKSB7XG4gICAgICBwYXJzZU9uVHJpZ2dlcihwYXJhbSwgcHJlZmV0Y2hUcmlnZ2VycywgZXJyb3JzLCBwbGFjZWhvbGRlcik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGVycm9ycy5wdXNoKG5ldyBQYXJzZUVycm9yKHBhcmFtLnNvdXJjZVNwYW4sICdVbnJlY29nbml6ZWQgdHJpZ2dlcicpKTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4ge3RyaWdnZXJzLCBwcmVmZXRjaFRyaWdnZXJzfTtcbn1cbiJdfQ==