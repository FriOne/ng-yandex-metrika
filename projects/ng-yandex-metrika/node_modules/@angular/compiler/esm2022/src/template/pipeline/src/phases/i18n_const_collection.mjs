/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { mapLiteral } from '../../../../output/map_util';
import * as o from '../../../../output/output_ast';
import { sanitizeIdentifier } from '../../../../parse_util';
import { Identifiers } from '../../../../render3/r3_identifiers';
import { createGoogleGetMsgStatements } from '../../../../render3/view/i18n/get_msg_utils';
import { createLocalizeStatements } from '../../../../render3/view/i18n/localize_utils';
import { declareI18nVariable, formatI18nPlaceholderNamesInMap, getTranslationConstPrefix } from '../../../../render3/view/i18n/util';
import * as ir from '../../ir';
/** Name of the global variable that is used to determine if we use Closure translations or not */
const NG_I18N_CLOSURE_MODE = 'ngI18nClosureMode';
/**
 * Prefix for non-`goog.getMsg` i18n-related vars.
 * Note: the prefix uses lowercase characters intentionally due to a Closure behavior that
 * considers variables like `I18N_0` as constants and throws an error when their value changes.
 */
const TRANSLATION_VAR_PREFIX = 'i18n_';
/** Prefix of ICU expressions for post processing */
export const I18N_ICU_MAPPING_PREFIX = 'I18N_EXP_';
/**
 * The escape sequence used for message param values.
 */
const ESCAPE = '\uFFFD';
/**
 * Lifts i18n properties into the consts array.
 * TODO: Can we use `ConstCollectedExpr`?
 * TODO: The way the various attributes are linked together is very complex. Perhaps we could
 * simplify the process, maybe by combining the context and message ops?
 */
export function collectI18nConsts(job) {
    const fileBasedI18nSuffix = job.relativeContextFilePath.replace(/[^A-Za-z0-9]/g, '_').toUpperCase() + '_';
    // Step One: Build up various lookup maps we need to collect all the consts.
    // Context Xref -> Extracted Attribute Op
    const extractedAttributesByI18nContext = new Map();
    // Element/ElementStart Xref -> I18n Attributes config op
    const i18nAttributesByElement = new Map();
    // Element/ElementStart Xref -> All I18n Expression ops for attrs on that target
    const i18nExpressionsByElement = new Map();
    // I18n Message Xref -> I18n Message Op (TODO: use a central op map)
    const messages = new Map();
    for (const unit of job.units) {
        for (const op of unit.ops()) {
            if (op.kind === ir.OpKind.ExtractedAttribute && op.i18nContext !== null) {
                extractedAttributesByI18nContext.set(op.i18nContext, op);
            }
            else if (op.kind === ir.OpKind.I18nAttributes) {
                i18nAttributesByElement.set(op.target, op);
            }
            else if (op.kind === ir.OpKind.I18nExpression && op.usage === ir.I18nExpressionFor.I18nAttribute) {
                const expressions = i18nExpressionsByElement.get(op.target) ?? [];
                expressions.push(op);
                i18nExpressionsByElement.set(op.target, expressions);
            }
            else if (op.kind === ir.OpKind.I18nMessage) {
                messages.set(op.xref, op);
            }
        }
    }
    // Step Two: Serialize the extracted i18n messages for root i18n blocks and i18n attributes into
    // the const array.
    //
    // Also, each i18n message will have a variable expression that can refer to its
    // value. Store these expressions in the appropriate place:
    // 1. For normal i18n content, it also goes in the const array. We save the const index to use
    // later.
    // 2. For extracted attributes, it becomes the value of the extracted attribute instruction.
    // 3. For i18n bindings, it will go in a separate const array instruction below; for now, we just
    // save it.
    const i18nValuesByContext = new Map();
    const messageConstIndices = new Map();
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.I18nMessage) {
                if (op.messagePlaceholder === null) {
                    const { mainVar, statements } = collectMessage(job, fileBasedI18nSuffix, messages, op);
                    if (op.i18nBlock !== null) {
                        // This is a regular i18n message with a corresponding i18n block. Collect it into the
                        // const array.
                        const i18nConst = job.addConst(mainVar, statements);
                        messageConstIndices.set(op.i18nBlock, i18nConst);
                    }
                    else {
                        // This is an i18n attribute. Extract the initializers into the const pool.
                        job.constsInitializers.push(...statements);
                        // Save the i18n variable value for later.
                        i18nValuesByContext.set(op.i18nContext, mainVar);
                        // This i18n message may correspond to an individual extracted attribute. If so, The
                        // value of that attribute is updated to read the extracted i18n variable.
                        const attributeForMessage = extractedAttributesByI18nContext.get(op.i18nContext);
                        if (attributeForMessage !== undefined) {
                            attributeForMessage.expression = mainVar;
                        }
                    }
                }
                ir.OpList.remove(op);
            }
        }
    }
    // Step Three: Serialize I18nAttributes configurations into the const array. Each I18nAttributes
    // instruction has a config array, which contains k-v pairs describing each binding name, and the
    // i18n variable that provides the value.
    for (const unit of job.units) {
        for (const elem of unit.create) {
            if (ir.isElementOrContainerOp(elem)) {
                const i18nAttributes = i18nAttributesByElement.get(elem.xref);
                if (i18nAttributes === undefined) {
                    // This element is not associated with an i18n attributes configuration instruction.
                    continue;
                }
                let i18nExpressions = i18nExpressionsByElement.get(elem.xref);
                if (i18nExpressions === undefined) {
                    // Unused i18nAttributes should have already been removed.
                    // TODO: Should the removal of those dead instructions be merged with this phase?
                    throw new Error('AssertionError: Could not find any i18n expressions associated with an I18nAttributes instruction');
                }
                // Find expressions for all the unique property names, removing duplicates.
                const seenPropertyNames = new Set();
                i18nExpressions = i18nExpressions.filter(i18nExpr => {
                    const seen = (seenPropertyNames.has(i18nExpr.name));
                    seenPropertyNames.add(i18nExpr.name);
                    return !seen;
                });
                const i18nAttributeConfig = i18nExpressions.flatMap(i18nExpr => {
                    const i18nExprValue = i18nValuesByContext.get(i18nExpr.context);
                    if (i18nExprValue === undefined) {
                        throw new Error('AssertionError: Could not find i18n expression\'s value');
                    }
                    return [o.literal(i18nExpr.name), i18nExprValue];
                });
                i18nAttributes.i18nAttributesConfig =
                    job.addConst(new o.LiteralArrayExpr(i18nAttributeConfig));
            }
        }
    }
    // Step Four: Propagate the extracted const index into i18n ops that messages were extracted from.
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.I18nStart) {
                const msgIndex = messageConstIndices.get(op.root);
                if (msgIndex === undefined) {
                    throw new Error('AssertionError: Could not find corresponding i18n block index for an i18n message op; was an i18n message incorrectly assumed to correspond to an attribute?');
                }
                op.messageIndex = msgIndex;
            }
        }
    }
}
/**
 * Collects the given message into a set of statements that can be added to the const array.
 * This will recursively collect any sub-messages referenced from the parent message as well.
 */
function collectMessage(job, fileBasedI18nSuffix, messages, messageOp) {
    // Recursively collect any sub-messages, record each sub-message's main variable under its
    // placeholder so that we can add them to the params for the parent message. It is possible
    // that multiple sub-messages will share the same placeholder, so we need to track an array of
    // variables for each placeholder.
    const statements = [];
    const subMessagePlaceholders = new Map();
    for (const subMessageId of messageOp.subMessages) {
        const subMessage = messages.get(subMessageId);
        const { mainVar: subMessageVar, statements: subMessageStatements } = collectMessage(job, fileBasedI18nSuffix, messages, subMessage);
        statements.push(...subMessageStatements);
        const subMessages = subMessagePlaceholders.get(subMessage.messagePlaceholder) ?? [];
        subMessages.push(subMessageVar);
        subMessagePlaceholders.set(subMessage.messagePlaceholder, subMessages);
    }
    addSubMessageParams(messageOp, subMessagePlaceholders);
    // Sort the params for consistency with TemaplateDefinitionBuilder output.
    messageOp.params = new Map([...messageOp.params.entries()].sort());
    const mainVar = o.variable(job.pool.uniqueName(TRANSLATION_VAR_PREFIX));
    // Closure Compiler requires const names to start with `MSG_` but disallows any other
    // const to start with `MSG_`. We define a variable starting with `MSG_` just for the
    // `goog.getMsg` call
    const closureVar = i18nGenerateClosureVar(job.pool, messageOp.message.id, fileBasedI18nSuffix, job.i18nUseExternalIds);
    let transformFn = undefined;
    // If nescessary, add a post-processing step and resolve any placeholder params that are
    // set in post-processing.
    if (messageOp.needsPostprocessing) {
        // Sort the post-processing params for consistency with TemaplateDefinitionBuilder output.
        const postprocessingParams = Object.fromEntries([...messageOp.postprocessingParams.entries()].sort());
        const formattedPostprocessingParams = formatI18nPlaceholderNamesInMap(postprocessingParams, /* useCamelCase */ false);
        const extraTransformFnParams = [];
        if (messageOp.postprocessingParams.size > 0) {
            extraTransformFnParams.push(mapLiteral(formattedPostprocessingParams, /* quoted */ true));
        }
        transformFn = (expr) => o.importExpr(Identifiers.i18nPostprocess).callFn([expr, ...extraTransformFnParams]);
    }
    // Add the message's statements
    statements.push(...getTranslationDeclStmts(messageOp.message, mainVar, closureVar, messageOp.params, transformFn));
    return { mainVar, statements };
}
/**
 * Adds the given subMessage placeholders to the given message op.
 *
 * If a placeholder only corresponds to a single sub-message variable, we just set that variable
 * as the param value. However, if the placeholder corresponds to multiple sub-message
 * variables, we need to add a special placeholder value that is handled by the post-processing
 * step. We then add the array of variables as a post-processing param.
 */
function addSubMessageParams(messageOp, subMessagePlaceholders) {
    for (const [placeholder, subMessages] of subMessagePlaceholders) {
        if (subMessages.length === 1) {
            messageOp.params.set(placeholder, subMessages[0]);
        }
        else {
            messageOp.params.set(placeholder, o.literal(`${ESCAPE}${I18N_ICU_MAPPING_PREFIX}${placeholder}${ESCAPE}`));
            messageOp.postprocessingParams.set(placeholder, o.literalArr(subMessages));
            messageOp.needsPostprocessing = true;
        }
    }
}
/**
 * Generate statements that define a given translation message.
 *
 * ```
 * var I18N_1;
 * if (typeof ngI18nClosureMode !== undefined && ngI18nClosureMode) {
 *     var MSG_EXTERNAL_XXX = goog.getMsg(
 *          "Some message with {$interpolation}!",
 *          { "interpolation": "\uFFFD0\uFFFD" }
 *     );
 *     I18N_1 = MSG_EXTERNAL_XXX;
 * }
 * else {
 *     I18N_1 = $localize`Some message with ${'\uFFFD0\uFFFD'}!`;
 * }
 * ```
 *
 * @param message The original i18n AST message node
 * @param variable The variable that will be assigned the translation, e.g. `I18N_1`.
 * @param closureVar The variable for Closure `goog.getMsg` calls, e.g. `MSG_EXTERNAL_XXX`.
 * @param params Object mapping placeholder names to their values (e.g.
 * `{ "interpolation": "\uFFFD0\uFFFD" }`).
 * @param transformFn Optional transformation function that will be applied to the translation
 *     (e.g.
 * post-processing).
 * @returns An array of statements that defined a given translation.
 */
function getTranslationDeclStmts(message, variable, closureVar, params, transformFn) {
    const paramsObject = Object.fromEntries(params);
    const statements = [
        declareI18nVariable(variable),
        o.ifStmt(createClosureModeGuard(), createGoogleGetMsgStatements(variable, message, closureVar, paramsObject), createLocalizeStatements(variable, message, formatI18nPlaceholderNamesInMap(paramsObject, /* useCamelCase */ false))),
    ];
    if (transformFn) {
        statements.push(new o.ExpressionStatement(variable.set(transformFn(variable))));
    }
    return statements;
}
/**
 * Create the expression that will be used to guard the closure mode block
 * It is equivalent to:
 *
 * ```
 * typeof ngI18nClosureMode !== undefined && ngI18nClosureMode
 * ```
 */
function createClosureModeGuard() {
    return o.typeofExpr(o.variable(NG_I18N_CLOSURE_MODE))
        .notIdentical(o.literal('undefined', o.STRING_TYPE))
        .and(o.variable(NG_I18N_CLOSURE_MODE));
}
/**
 * Generates vars with Closure-specific names for i18n blocks (i.e. `MSG_XXX`).
 */
function i18nGenerateClosureVar(pool, messageId, fileBasedI18nSuffix, useExternalIds) {
    let name;
    const suffix = fileBasedI18nSuffix;
    if (useExternalIds) {
        const prefix = getTranslationConstPrefix(`EXTERNAL_`);
        const uniqueSuffix = pool.uniqueName(suffix);
        name = `${prefix}${sanitizeIdentifier(messageId)}$$${uniqueSuffix}`;
    }
    else {
        const prefix = getTranslationConstPrefix(suffix);
        name = pool.uniqueName(prefix);
    }
    return o.variable(name);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaTE4bl9jb25zdF9jb2xsZWN0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvaTE4bl9jb25zdF9jb2xsZWN0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUlILE9BQU8sRUFBQyxVQUFVLEVBQUMsTUFBTSw2QkFBNkIsQ0FBQztBQUN2RCxPQUFPLEtBQUssQ0FBQyxNQUFNLCtCQUErQixDQUFDO0FBQ25ELE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLHdCQUF3QixDQUFDO0FBQzFELE9BQU8sRUFBQyxXQUFXLEVBQUMsTUFBTSxvQ0FBb0MsQ0FBQztBQUMvRCxPQUFPLEVBQUMsNEJBQTRCLEVBQUMsTUFBTSw2Q0FBNkMsQ0FBQztBQUN6RixPQUFPLEVBQUMsd0JBQXdCLEVBQUMsTUFBTSw4Q0FBOEMsQ0FBQztBQUN0RixPQUFPLEVBQUMsbUJBQW1CLEVBQUUsK0JBQStCLEVBQUUseUJBQXlCLEVBQUMsTUFBTSxvQ0FBb0MsQ0FBQztBQUNuSSxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQixrR0FBa0c7QUFDbEcsTUFBTSxvQkFBb0IsR0FBRyxtQkFBbUIsQ0FBQztBQUVqRDs7OztHQUlHO0FBQ0gsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUM7QUFFdkMsb0RBQW9EO0FBQ3BELE1BQU0sQ0FBQyxNQUFNLHVCQUF1QixHQUFHLFdBQVcsQ0FBQztBQUVuRDs7R0FFRztBQUNILE1BQU0sTUFBTSxHQUFHLFFBQVEsQ0FBQztBQUV4Qjs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxpQkFBaUIsQ0FBQyxHQUE0QjtJQUM1RCxNQUFNLG1CQUFtQixHQUNyQixHQUFHLENBQUMsdUJBQXVCLENBQUMsT0FBTyxDQUFDLGVBQWUsRUFBRSxHQUFHLENBQUMs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QUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FBQyxXQUFXLENBQUMsQ0FBQztRQUN0RCxNQUFNLFlBQVksR0FBRyxJQUFJLENBQUMsVUFBVSxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQzdDLElBQUksR0FBRyxHQUFHLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxTQUFTLENBQUMsS0FBSyxZQUFZLEVBQUUsQ0FBQztLQUNyRTtTQUFNO1FBQ0wsTUFBTSxNQUFNLEdBQUcseUJBQXlCLENBQUMsTUFBTSxDQUFDLENBQUM7UUFDakQsSUFBSSxHQUFHLElBQUksQ0FBQyxVQUFVLENBQUMsTUFBTSxDQUFDLENBQUM7S0FDaEM7SUFDRCxPQUFPLENBQUMsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDMUIsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQge3R5cGUgQ29uc3RhbnRQb29sfSBmcm9tICcuLi8uLi8uLi8uLi9jb25zdGFudF9wb29sJztcbmltcG9ydCAqIGFzIGkxOG4gZnJvbSAnLi4vLi4vLi4vLi4vaTE4bi9pMThuX2FzdCc7XG5pbXBvcnQge21hcExpdGVyYWx9IGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9tYXBfdXRpbCc7XG5pbXBvcnQgKiBhcyBvIGZyb20gJy4uLy4uLy4uLy4uL291dHB1dC9vdXRwdXRfYXN0JztcbmltcG9ydCB7c2FuaXRpemVJZGVudGlmaWVyfSBmcm9tICcuLi8uLi8uLi8uLi9wYXJzZV91dGlsJztcbmltcG9ydCB7SWRlbnRpZmllcnN9IGZyb20gJy4uLy4uLy4uLy4uL3JlbmRlcjMvcjNfaWRlbnRpZmllcnMnO1xuaW1wb3J0IHtjcmVhdGVHb29nbGVHZXRNc2dTdGF0ZW1lbnRzfSBmcm9tICcuLi8uLi8uLi8uLi9yZW5kZXIzL3ZpZXcvaTE4bi9nZXRfbXNnX3V0aWxzJztcbmltcG9ydCB7Y3JlYXRlTG9jYWxpemVTdGF0ZW1lbnRzfSBmcm9tICcuLi8uLi8uLi8uLi9yZW5kZXIzL3ZpZXcvaTE4bi9sb2NhbGl6ZV91dGlscyc7XG5pbXBvcnQge2RlY2xhcmVJMThuVmFyaWFibGUsIGZvcm1hdEkxOG5QbGFjZWhvbGRlck5hbWVzSW5NYXAsIGdldFRyYW5zbGF0aW9uQ29uc3RQcmVmaXh9IGZyb20gJy4uLy4uLy4uLy4uL3JlbmRlcjMvdmlldy9pMThuL3V0aWwnO1xuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21wb25lbnRDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKiogTmFtZSBvZiB0aGUgZ2xvYmFsIHZhcmlhYmxlIHRoYXQgaXMgdXNlZCB0byBkZXRlcm1pbmUgaWYgd2UgdXNlIENsb3N1cmUgdHJhbnNsYXRpb25zIG9yIG5vdCAqL1xuY29uc3QgTkdfSTE4Tl9DTE9TVVJFX01PREUgPSAnbmdJMThuQ2xvc3VyZU1vZGUnO1xuXG4vKipcbiAqIFByZWZpeCBmb3Igbm9uLWBnb29nLmdldE1zZ2AgaTE4bi1yZWxhdGVkIHZhcnMuXG4gKiBOb3RlOiB0aGUgcHJlZml4IHVzZXMgbG93ZXJjYXNlIGNoYXJhY3RlcnMgaW50ZW50aW9uYWxseSBkdWUgdG8gYSBDbG9zdXJlIGJlaGF2aW9yIHRoYXRcbiAqIGNvbnNpZGVycyB2YXJpYWJsZXMgbGlrZSBgSTE4Tl8wYCBhcyBjb25zdGFudHMgYW5kIHRocm93cyBhbiBlcnJvciB3aGVuIHRoZWlyIHZhbHVlIGNoYW5nZXMuXG4gKi9cbmNvbnN0IFRSQU5TTEFUSU9OX1ZBUl9QUkVGSVggPSAnaTE4bl8nO1xuXG4vKiogUHJlZml4IG9mIElDVSBleHByZXNzaW9ucyBmb3IgcG9zdCBwcm9jZXNzaW5nICovXG5leHBvcnQgY29uc3QgSTE4Tl9JQ1VfTUFQUElOR19QUkVGSVggPSAnSTE4Tl9FWFBfJztcblxuLyoqXG4gKiBUaGUgZXNjYXBlIHNlcXVlbmNlIHVzZWQgZm9yIG1lc3NhZ2UgcGFyYW0gdmFsdWVzLlxuICovXG5jb25zdCBFU0NBUEUgPSAnXFx1RkZGRCc7XG5cbi8qKlxuICogTGlmdHMgaTE4biBwcm9wZXJ0aWVzIGludG8gdGhlIGNvbnN0cyBhcnJheS5cbiAqIFRPRE86IENhbiB3ZSB1c2UgYENvbnN0Q29sbGVjdGVkRXhwcmA/XG4gKiBUT0RPOiBUaGUgd2F5IHRoZSB2YXJpb3VzIGF0dHJpYnV0ZXMgYXJlIGxpbmtlZCB0b2dldGhlciBpcyB2ZXJ5IGNvbXBsZXguIFBlcmhhcHMgd2UgY291bGRcbiAqIHNpbXBsaWZ5IHRoZSBwcm9jZXNzLCBtYXliZSBieSBjb21iaW5pbmcgdGhlIGNvbnRleHQgYW5kIG1lc3NhZ2Ugb3BzP1xuICovXG5leHBvcnQgZnVuY3Rpb24gY29sbGVjdEkxOG5Db25zdHMoam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBjb25zdCBmaWxlQmFzZWRJMThuU3VmZml4ID1cbiAgICAgIGpvYi5yZWxhdGl2ZUNvbnRleHRGaWxlUGF0aC5yZXBsYWNlKC9bXkEtWmEtejAtOV0vZywgJ18nKS50b1VwcGVyQ2FzZSgpICsgJ18nO1xuICAvLyBTdGVwIE9uZTogQnVpbGQgdXAgdmFyaW91cyBsb29rdXAgbWFwcyB3ZSBuZWVkIHRvIGNvbGxlY3QgYWxsIHRoZSBjb25zdHMuXG5cbiAgLy8gQ29udGV4dCBYcmVmIC0+IEV4dHJhY3RlZCBBdHRyaWJ1dGUgT3BcbiAgY29uc3QgZXh0cmFjdGVkQXR0cmlidXRlc0J5STE4bkNvbnRleHQgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuRXh0cmFjdGVkQXR0cmlidXRlT3A+KCk7XG4gIC8vIEVsZW1lbnQvRWxlbWVudFN0YXJ0IFhyZWYgLT4gSTE4biBBdHRyaWJ1dGVzIGNvbmZpZyBvcFxuICBjb25zdCBpMThuQXR0cmlidXRlc0J5RWxlbWVudCA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5JMThuQXR0cmlidXRlc09wPigpO1xuICAvLyBFbGVtZW50L0VsZW1lbnRTdGFydCBYcmVmIC0+IEFsbCBJMThuIEV4cHJlc3Npb24gb3BzIGZvciBhdHRycyBvbiB0aGF0IHRhcmdldFxuICBjb25zdCBpMThuRXhwcmVzc2lvbnNCeUVsZW1lbnQgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuSTE4bkV4cHJlc3Npb25PcFtdPigpO1xuICAvLyBJMThuIE1lc3NhZ2UgWHJlZiAtPiBJMThuIE1lc3NhZ2UgT3AgKFRPRE86IHVzZSBhIGNlbnRyYWwgb3AgbWFwKVxuICBjb25zdCBtZXNzYWdlcyA9IG5ldyBNYXA8aXIuWHJlZklkLCBpci5JMThuTWVzc2FnZU9wPigpO1xuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQub3BzKCkpIHtcbiAgICAgIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuRXh0cmFjdGVkQXR0cmlidXRlICYmIG9wLmkxOG5Db250ZXh0ICE9PSBudWxsKSB7XG4gICAgICAgIGV4dHJhY3RlZEF0dHJpYnV0ZXNCeUkxOG5Db250ZXh0LnNldChvcC5pMThuQ29udGV4dCwgb3ApO1xuICAgICAgfSBlbHNlIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuSTE4bkF0dHJpYnV0ZXMpIHtcbiAgICAgICAgaTE4bkF0dHJpYnV0ZXNCeUVsZW1lbnQuc2V0KG9wLnRhcmdldCwgb3ApO1xuICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICBvcC5raW5kID09PSBpci5PcEtpbmQuSTE4bkV4cHJlc3Npb24gJiYgb3AudXNhZ2UgPT09IGlyLkkxOG5FeHByZXNzaW9uRm9yLkkxOG5BdHRyaWJ1dGUpIHtcbiAgICAgICAgY29uc3QgZXhwcmVzc2lvbnMgPSBpMThuRXhwcmVzc2lvbnNCeUVsZW1lbnQuZ2V0KG9wLnRhcmdldCkgPz8gW107XG4gICAgICAgIGV4cHJlc3Npb25zLnB1c2gob3ApO1xuICAgICAgICBpMThuRXhwcmVzc2lvbnNCeUVsZW1lbnQuc2V0KG9wLnRhcmdldCwgZXhwcmVzc2lvbnMpO1xuICAgICAgfSBlbHNlIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuSTE4bk1lc3NhZ2UpIHtcbiAgICAgICAgbWVzc2FnZXMuc2V0KG9wLnhyZWYsIG9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBTdGVwIFR3bzogU2VyaWFsaXplIHRoZSBleHRyYWN0ZWQgaTE4biBtZXNzYWdlcyBmb3Igcm9vdCBpMThuIGJsb2NrcyBhbmQgaTE4biBhdHRyaWJ1dGVzIGludG9cbiAgLy8gdGhlIGNvbnN0IGFycmF5LlxuICAvL1xuICAvLyBBbHNvLCBlYWNoIGkxOG4gbWVzc2FnZSB3aWxsIGhhdmUgYSB2YXJpYWJsZSBleHByZXNzaW9uIHRoYXQgY2FuIHJlZmVyIHRvIGl0c1xuICAvLyB2YWx1ZS4gU3RvcmUgdGhlc2UgZXhwcmVzc2lvbnMgaW4gdGhlIGFwcHJvcHJpYXRlIHBsYWNlOlxuICAvLyAxLiBGb3Igbm9ybWFsIGkxOG4gY29udGVudCwgaXQgYWxzbyBnb2VzIGluIHRoZSBjb25zdCBhcnJheS4gV2Ugc2F2ZSB0aGUgY29uc3QgaW5kZXggdG8gdXNlXG4gIC8vIGxhdGVyLlxuICAvLyAyLiBGb3IgZXh0cmFjdGVkIGF0dHJpYnV0ZXMsIGl0IGJlY29tZXMgdGhlIHZhbHVlIG9mIHRoZSBleHRyYWN0ZWQgYXR0cmlidXRlIGluc3RydWN0aW9uLlxuICAvLyAzLiBGb3IgaTE4biBiaW5kaW5ncywgaXQgd2lsbCBnbyBpbiBhIHNlcGFyYXRlIGNvbnN0IGFycmF5IGluc3RydWN0aW9uIGJlbG93OyBmb3Igbm93LCB3ZSBqdXN0XG4gIC8vIHNhdmUgaXQuXG5cbiAgY29uc3QgaTE4blZhbHVlc0J5Q29udGV4dCA9IG5ldyBNYXA8aXIuWHJlZklkLCBvLkV4cHJlc3Npb24+KCk7XG4gIGNvbnN0IG1lc3NhZ2VDb25zdEluZGljZXMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuQ29uc3RJbmRleD4oKTtcblxuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKG9wLmtpbmQgPT09IGlyLk9wS2luZC5JMThuTWVzc2FnZSkge1xuICAgICAgICBpZiAob3AubWVzc2FnZVBsYWNlaG9sZGVyID09PSBudWxsKSB7XG4gICAgICAgICAgY29uc3Qge21haW5WYXIsIHN0YXRlbWVudHN9ID0gY29sbGVjdE1lc3NhZ2Uoam9iLCBmaWxlQmFzZWRJMThuU3VmZml4LCBtZXNzYWdlcywgb3ApO1xuICAgICAgICAgIGlmIChvcC5pMThuQmxvY2sgIT09IG51bGwpIHtcbiAgICAgICAgICAgIC8vIFRoaXMgaXMgYSByZWd1bGFyIGkxOG4gbWVzc2FnZSB3aXRoIGEgY29ycmVzcG9uZGluZyBpMThuIGJsb2NrLiBDb2xsZWN0IGl0IGludG8gdGhlXG4gICAgICAgICAgICAvLyBjb25zdCBhcnJheS5cbiAgICAgICAgICAgIGNvbnN0IGkxOG5Db25zdCA9IGpvYi5hZGRDb25zdChtYWluVmFyLCBzdGF0ZW1lbnRzKTtcbiAgICAgICAgICAgIG1lc3NhZ2VDb25zdEluZGljZXMuc2V0KG9wLmkxOG5CbG9jaywgaTE4bkNvbnN0KTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVGhpcyBpcyBhbiBpMThuIGF0dHJpYnV0ZS4gRXh0cmFjdCB0aGUgaW5pdGlhbGl6ZXJzIGludG8gdGhlIGNvbnN0IHBvb2wuXG4gICAgICAgICAgICBqb2IuY29uc3RzSW5pdGlhbGl6ZXJzLnB1c2goLi4uc3RhdGVtZW50cyk7XG5cbiAgICAgICAgICAgIC8vIFNhdmUgdGhlIGkxOG4gdmFyaWFibGUgdmFsdWUgZm9yIGxhdGVyLlxuICAgICAgICAgICAgaTE4blZhbHVlc0J5Q29udGV4dC5zZXQob3AuaTE4bkNvbnRleHQsIG1haW5WYXIpO1xuXG4gICAgICAgICAgICAvLyBUaGlzIGkxOG4gbWVzc2FnZSBtYXkgY29ycmVzcG9uZCB0byBhbiBpbmRpdmlkdWFsIGV4dHJhY3RlZCBhdHRyaWJ1dGUuIElmIHNvLCBUaGVcbiAgICAgICAgICAgIC8vIHZhbHVlIG9mIHRoYXQgYXR0cmlidXRlIGlzIHVwZGF0ZWQgdG8gcmVhZCB0aGUgZXh0cmFjdGVkIGkxOG4gdmFyaWFibGUuXG4gICAgICAgICAgICBjb25zdCBhdHRyaWJ1dGVGb3JNZXNzYWdlID0gZXh0cmFjdGVkQXR0cmlidXRlc0J5STE4bkNvbnRleHQuZ2V0KG9wLmkxOG5Db250ZXh0KTtcbiAgICAgICAgICAgIGlmIChhdHRyaWJ1dGVGb3JNZXNzYWdlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgICAgYXR0cmlidXRlRm9yTWVzc2FnZS5leHByZXNzaW9uID0gbWFpblZhcjtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgaXIuT3BMaXN0LnJlbW92ZTxpci5DcmVhdGVPcD4ob3ApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIFN0ZXAgVGhyZWU6IFNlcmlhbGl6ZSBJMThuQXR0cmlidXRlcyBjb25maWd1cmF0aW9ucyBpbnRvIHRoZSBjb25zdCBhcnJheS4gRWFjaCBJMThuQXR0cmlidXRlc1xuICAvLyBpbnN0cnVjdGlvbiBoYXMgYSBjb25maWcgYXJyYXksIHdoaWNoIGNvbnRhaW5zIGstdiBwYWlycyBkZXNjcmliaW5nIGVhY2ggYmluZGluZyBuYW1lLCBhbmQgdGhlXG4gIC8vIGkxOG4gdmFyaWFibGUgdGhhdCBwcm92aWRlcyB0aGUgdmFsdWUuXG5cbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGZvciAoY29uc3QgZWxlbSBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKGlyLmlzRWxlbWVudE9yQ29udGFpbmVyT3AoZWxlbSkpIHtcbiAgICAgICAgY29uc3QgaTE4bkF0dHJpYnV0ZXMgPSBpMThuQXR0cmlidXRlc0J5RWxlbWVudC5nZXQoZWxlbS54cmVmKTtcbiAgICAgICAgaWYgKGkxOG5BdHRyaWJ1dGVzID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAvLyBUaGlzIGVsZW1lbnQgaXMgbm90IGFzc29jaWF0ZWQgd2l0aCBhbiBpMThuIGF0dHJpYnV0ZXMgY29uZmlndXJhdGlvbiBpbnN0cnVjdGlvbi5cbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBpMThuRXhwcmVzc2lvbnMgPSBpMThuRXhwcmVzc2lvbnNCeUVsZW1lbnQuZ2V0KGVsZW0ueHJlZik7XG4gICAgICAgIGlmIChpMThuRXhwcmVzc2lvbnMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIC8vIFVudXNlZCBpMThuQXR0cmlidXRlcyBzaG91bGQgaGF2ZSBhbHJlYWR5IGJlZW4gcmVtb3ZlZC5cbiAgICAgICAgICAvLyBUT0RPOiBTaG91bGQgdGhlIHJlbW92YWwgb2YgdGhvc2UgZGVhZCBpbnN0cnVjdGlvbnMgYmUgbWVyZ2VkIHdpdGggdGhpcyBwaGFzZT9cbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdBc3NlcnRpb25FcnJvcjogQ291bGQgbm90IGZpbmQgYW55IGkxOG4gZXhwcmVzc2lvbnMgYXNzb2NpYXRlZCB3aXRoIGFuIEkxOG5BdHRyaWJ1dGVzIGluc3RydWN0aW9uJyk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5kIGV4cHJlc3Npb25zIGZvciBhbGwgdGhlIHVuaXF1ZSBwcm9wZXJ0eSBuYW1lcywgcmVtb3ZpbmcgZHVwbGljYXRlcy5cbiAgICAgICAgY29uc3Qgc2VlblByb3BlcnR5TmFtZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcbiAgICAgICAgaTE4bkV4cHJlc3Npb25zID0gaTE4bkV4cHJlc3Npb25zLmZpbHRlcihpMThuRXhwciA9PiB7XG4gICAgICAgICAgY29uc3Qgc2VlbiA9IChzZWVuUHJvcGVydHlOYW1lcy5oYXMoaTE4bkV4cHIubmFtZSkpO1xuICAgICAgICAgIHNlZW5Qcm9wZXJ0eU5hbWVzLmFkZChpMThuRXhwci5uYW1lKTtcbiAgICAgICAgICByZXR1cm4gIXNlZW47XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IGkxOG5BdHRyaWJ1dGVDb25maWcgPSBpMThuRXhwcmVzc2lvbnMuZmxhdE1hcChpMThuRXhwciA9PiB7XG4gICAgICAgICAgY29uc3QgaTE4bkV4cHJWYWx1ZSA9IGkxOG5WYWx1ZXNCeUNvbnRleHQuZ2V0KGkxOG5FeHByLmNvbnRleHQpO1xuICAgICAgICAgIGlmIChpMThuRXhwclZhbHVlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignQXNzZXJ0aW9uRXJyb3I6IENvdWxkIG5vdCBmaW5kIGkxOG4gZXhwcmVzc2lvblxcJ3MgdmFsdWUnKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIFtvLmxpdGVyYWwoaTE4bkV4cHIubmFtZSksIGkxOG5FeHByVmFsdWVdO1xuICAgICAgICB9KTtcblxuXG4gICAgICAgIGkxOG5BdHRyaWJ1dGVzLmkxOG5BdHRyaWJ1dGVzQ29uZmlnID1cbiAgICAgICAgICAgIGpvYi5hZGRDb25zdChuZXcgby5MaXRlcmFsQXJyYXlFeHByKGkxOG5BdHRyaWJ1dGVDb25maWcpKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICAvLyBTdGVwIEZvdXI6IFByb3BhZ2F0ZSB0aGUgZXh0cmFjdGVkIGNvbnN0IGluZGV4IGludG8gaTE4biBvcHMgdGhhdCBtZXNzYWdlcyB3ZXJlIGV4dHJhY3RlZCBmcm9tLlxuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkkxOG5TdGFydCkge1xuICAgICAgICBjb25zdCBtc2dJbmRleCA9IG1lc3NhZ2VDb25zdEluZGljZXMuZ2V0KG9wLnJvb3QpO1xuICAgICAgICBpZiAobXNnSW5kZXggPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgICAgJ0Fzc2VydGlvbkVycm9yOiBDb3VsZCBub3QgZmluZCBjb3JyZXNwb25kaW5nIGkxOG4gYmxvY2sgaW5kZXggZm9yIGFuIGkxOG4gbWVzc2FnZSBvcDsgd2FzIGFuIGkxOG4gbWVzc2FnZSBpbmNvcnJlY3RseSBhc3N1bWVkIHRvIGNvcnJlc3BvbmQgdG8gYW4gYXR0cmlidXRlPycpO1xuICAgICAgICB9XG4gICAgICAgIG9wLm1lc3NhZ2VJbmRleCA9IG1zZ0luZGV4O1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIENvbGxlY3RzIHRoZSBnaXZlbiBtZXNzYWdlIGludG8gYSBzZXQgb2Ygc3RhdGVtZW50cyB0aGF0IGNhbiBiZSBhZGRlZCB0byB0aGUgY29uc3QgYXJyYXkuXG4gKiBUaGlzIHdpbGwgcmVjdXJzaXZlbHkgY29sbGVjdCBhbnkgc3ViLW1lc3NhZ2VzIHJlZmVyZW5jZWQgZnJvbSB0aGUgcGFyZW50IG1lc3NhZ2UgYXMgd2VsbC5cbiAqL1xuZnVuY3Rpb24gY29sbGVjdE1lc3NhZ2UoXG4gICAgam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYiwgZmlsZUJhc2VkSTE4blN1ZmZpeDogc3RyaW5nLFxuICAgIG1lc3NhZ2VzOiBNYXA8aXIuWHJlZklkLCBpci5JMThuTWVzc2FnZU9wPixcbiAgICBtZXNzYWdlT3A6IGlyLkkxOG5NZXNzYWdlT3ApOiB7bWFpblZhcjogby5SZWFkVmFyRXhwciwgc3RhdGVtZW50czogby5TdGF0ZW1lbnRbXX0ge1xuICAvLyBSZWN1cnNpdmVseSBjb2xsZWN0IGFueSBzdWItbWVzc2FnZXMsIHJlY29yZCBlYWNoIHN1Yi1tZXNzYWdlJ3MgbWFpbiB2YXJpYWJsZSB1bmRlciBpdHNcbiAgLy8gcGxhY2Vob2xkZXIgc28gdGhhdCB3ZSBjYW4gYWRkIHRoZW0gdG8gdGhlIHBhcmFtcyBmb3IgdGhlIHBhcmVudCBtZXNzYWdlLiBJdCBpcyBwb3NzaWJsZVxuICAvLyB0aGF0IG11bHRpcGxlIHN1Yi1tZXNzYWdlcyB3aWxsIHNoYXJlIHRoZSBzYW1lIHBsYWNlaG9sZGVyLCBzbyB3ZSBuZWVkIHRvIHRyYWNrIGFuIGFycmF5IG9mXG4gIC8vIHZhcmlhYmxlcyBmb3IgZWFjaCBwbGFjZWhvbGRlci5cbiAgY29uc3Qgc3RhdGVtZW50czogby5TdGF0ZW1lbnRbXSA9IFtdO1xuICBjb25zdCBzdWJNZXNzYWdlUGxhY2Vob2xkZXJzID0gbmV3IE1hcDxzdHJpbmcsIG8uRXhwcmVzc2lvbltdPigpO1xuICBmb3IgKGNvbnN0IHN1Yk1lc3NhZ2VJZCBvZiBtZXNzYWdlT3Auc3ViTWVzc2FnZXMpIHtcbiAgICBjb25zdCBzdWJNZXNzYWdlID0gbWVzc2FnZXMuZ2V0KHN1Yk1lc3NhZ2VJZCkhO1xuICAgIGNvbnN0IHttYWluVmFyOiBzdWJNZXNzYWdlVmFyLCBzdGF0ZW1lbnRzOiBzdWJNZXNzYWdlU3RhdGVtZW50c30gPVxuICAgICAgICBjb2xsZWN0TWVzc2FnZShqb2IsIGZpbGVCYXNlZEkxOG5TdWZmaXgsIG1lc3NhZ2VzLCBzdWJNZXNzYWdlKTtcbiAgICBzdGF0ZW1lbnRzLnB1c2goLi4uc3ViTWVzc2FnZVN0YXRlbWVudHMpO1xuICAgIGNvbnN0IHN1Yk1lc3NhZ2VzID0gc3ViTWVzc2FnZVBsYWNlaG9sZGVycy5nZXQoc3ViTWVzc2FnZS5tZXNzYWdlUGxhY2Vob2xkZXIhKSA/PyBbXTtcbiAgICBzdWJNZXNzYWdlcy5wdXNoKHN1Yk1lc3NhZ2VWYXIpO1xuICAgIHN1Yk1lc3NhZ2VQbGFjZWhvbGRlcnMuc2V0KHN1Yk1lc3NhZ2UubWVzc2FnZVBsYWNlaG9sZGVyISwgc3ViTWVzc2FnZXMpO1xuICB9XG4gIGFkZFN1Yk1lc3NhZ2VQYXJhbXMobWVzc2FnZU9wLCBzdWJNZXNzYWdlUGxhY2Vob2xkZXJzKTtcblxuICAvLyBTb3J0IHRoZSBwYXJhbXMgZm9yIGNvbnNpc3RlbmN5IHdpdGggVGVtYXBsYXRlRGVmaW5pdGlvbkJ1aWxkZXIgb3V0cHV0LlxuICBtZXNzYWdlT3AucGFyYW1zID0gbmV3IE1hcChbLi4ubWVzc2FnZU9wLnBhcmFtcy5lbnRyaWVzKCldLnNvcnQoKSk7XG5cbiAgY29uc3QgbWFpblZhciA9IG8udmFyaWFibGUoam9iLnBvb2wudW5pcXVlTmFtZShUUkFOU0xBVElPTl9WQVJfUFJFRklYKSk7XG4gIC8vIENsb3N1cmUgQ29tcGlsZXIgcmVxdWlyZXMgY29uc3QgbmFtZXMgdG8gc3RhcnQgd2l0aCBgTVNHX2AgYnV0IGRpc2FsbG93cyBhbnkgb3RoZXJcbiAgLy8gY29uc3QgdG8gc3RhcnQgd2l0aCBgTVNHX2AuIFdlIGRlZmluZSBhIHZhcmlhYmxlIHN0YXJ0aW5nIHdpdGggYE1TR19gIGp1c3QgZm9yIHRoZVxuICAvLyBgZ29vZy5nZXRNc2dgIGNhbGxcbiAgY29uc3QgY2xvc3VyZVZhciA9IGkxOG5HZW5lcmF0ZUNsb3N1cmVWYXIoXG4gICAgICBqb2IucG9vbCwgbWVzc2FnZU9wLm1lc3NhZ2UuaWQsIGZpbGVCYXNlZEkxOG5TdWZmaXgsIGpvYi5pMThuVXNlRXh0ZXJuYWxJZHMpO1xuICBsZXQgdHJhbnNmb3JtRm4gPSB1bmRlZmluZWQ7XG5cbiAgLy8gSWYgbmVzY2Vzc2FyeSwgYWRkIGEgcG9zdC1wcm9jZXNzaW5nIHN0ZXAgYW5kIHJlc29sdmUgYW55IHBsYWNlaG9sZGVyIHBhcmFtcyB0aGF0IGFyZVxuICAvLyBzZXQgaW4gcG9zdC1wcm9jZXNzaW5nLlxuICBpZiAobWVzc2FnZU9wLm5lZWRzUG9zdHByb2Nlc3NpbmcpIHtcbiAgICAvLyBTb3J0IHRoZSBwb3N0LXByb2Nlc3NpbmcgcGFyYW1zIGZvciBjb25zaXN0ZW5jeSB3aXRoIFRlbWFwbGF0ZURlZmluaXRpb25CdWlsZGVyIG91dHB1dC5cbiAgICBjb25zdCBwb3N0cHJvY2Vzc2luZ1BhcmFtcyA9XG4gICAgICAgIE9iamVjdC5mcm9tRW50cmllcyhbLi4ubWVzc2FnZU9wLnBvc3Rwcm9jZXNzaW5nUGFyYW1zLmVudHJpZXMoKV0uc29ydCgpKTtcbiAgICBjb25zdCBmb3JtYXR0ZWRQb3N0cHJvY2Vzc2luZ1BhcmFtcyA9XG4gICAgICAgIGZvcm1hdEkxOG5QbGFjZWhvbGRlck5hbWVzSW5NYXAocG9zdHByb2Nlc3NpbmdQYXJhbXMsIC8qIHVzZUNhbWVsQ2FzZSAqLyBmYWxzZSk7XG4gICAgY29uc3QgZXh0cmFUcmFuc2Zvcm1GblBhcmFtczogby5FeHByZXNzaW9uW10gPSBbXTtcbiAgICBpZiAobWVzc2FnZU9wLnBvc3Rwcm9jZXNzaW5nUGFyYW1zLnNpemUgPiAwKSB7XG4gICAgICBleHRyYVRyYW5zZm9ybUZuUGFyYW1zLnB1c2gobWFwTGl0ZXJhbChmb3JtYXR0ZWRQb3N0cHJvY2Vzc2luZ1BhcmFtcywgLyogcXVvdGVkICovIHRydWUpKTtcbiAgICB9XG4gICAgdHJhbnNmb3JtRm4gPSAoZXhwcjogby5SZWFkVmFyRXhwcikgPT5cbiAgICAgICAgby5pbXBvcnRFeHByKElkZW50aWZpZXJzLmkxOG5Qb3N0cHJvY2VzcykuY2FsbEZuKFtleHByLCAuLi5leHRyYVRyYW5zZm9ybUZuUGFyYW1zXSk7XG4gIH1cblxuICAvLyBBZGQgdGhlIG1lc3NhZ2UncyBzdGF0ZW1lbnRzXG4gIHN0YXRlbWVudHMucHVzaCguLi5nZXRUcmFuc2xhdGlvbkRlY2xTdG10cyhcbiAgICAgIG1lc3NhZ2VPcC5tZXNzYWdlLCBtYWluVmFyLCBjbG9zdXJlVmFyLCBtZXNzYWdlT3AucGFyYW1zLCB0cmFuc2Zvcm1GbikpO1xuXG4gIHJldHVybiB7bWFpblZhciwgc3RhdGVtZW50c307XG59XG5cbi8qKlxuICogQWRkcyB0aGUgZ2l2ZW4gc3ViTWVzc2FnZSBwbGFjZWhvbGRlcnMgdG8gdGhlIGdpdmVuIG1lc3NhZ2Ugb3AuXG4gKlxuICogSWYgYSBwbGFjZWhvbGRlciBvbmx5IGNvcnJlc3BvbmRzIHRvIGEgc2luZ2xlIHN1Yi1tZXNzYWdlIHZhcmlhYmxlLCB3ZSBqdXN0IHNldCB0aGF0IHZhcmlhYmxlXG4gKiBhcyB0aGUgcGFyYW0gdmFsdWUuIEhvd2V2ZXIsIGlmIHRoZSBwbGFjZWhvbGRlciBjb3JyZXNwb25kcyB0byBtdWx0aXBsZSBzdWItbWVzc2FnZVxuICogdmFyaWFibGVzLCB3ZSBuZWVkIHRvIGFkZCBhIHNwZWNpYWwgcGxhY2Vob2xkZXIgdmFsdWUgdGhhdCBpcyBoYW5kbGVkIGJ5IHRoZSBwb3N0LXByb2Nlc3NpbmdcbiAqIHN0ZXAuIFdlIHRoZW4gYWRkIHRoZSBhcnJheSBvZiB2YXJpYWJsZXMgYXMgYSBwb3N0LXByb2Nlc3NpbmcgcGFyYW0uXG4gKi9cbmZ1bmN0aW9uIGFkZFN1Yk1lc3NhZ2VQYXJhbXMoXG4gICAgbWVzc2FnZU9wOiBpci5JMThuTWVzc2FnZU9wLCBzdWJNZXNzYWdlUGxhY2Vob2xkZXJzOiBNYXA8c3RyaW5nLCBvLkV4cHJlc3Npb25bXT4pIHtcbiAgZm9yIChjb25zdCBbcGxhY2Vob2xkZXIsIHN1Yk1lc3NhZ2VzXSBvZiBzdWJNZXNzYWdlUGxhY2Vob2xkZXJzKSB7XG4gICAgaWYgKHN1Yk1lc3NhZ2VzLmxlbmd0aCA9PT0gMSkge1xuICAgICAgbWVzc2FnZU9wLnBhcmFtcy5zZXQocGxhY2Vob2xkZXIsIHN1Yk1lc3NhZ2VzWzBdKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbWVzc2FnZU9wLnBhcmFtcy5zZXQoXG4gICAgICAgICAgcGxhY2Vob2xkZXIsIG8ubGl0ZXJhbChgJHtFU0NBUEV9JHtJMThOX0lDVV9NQVBQSU5HX1BSRUZJWH0ke3BsYWNlaG9sZGVyfSR7RVNDQVBFfWApKTtcbiAgICAgIG1lc3NhZ2VPcC5wb3N0cHJvY2Vzc2luZ1BhcmFtcy5zZXQocGxhY2Vob2xkZXIsIG8ubGl0ZXJhbEFycihzdWJNZXNzYWdlcykpO1xuICAgICAgbWVzc2FnZU9wLm5lZWRzUG9zdHByb2Nlc3NpbmcgPSB0cnVlO1xuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIEdlbmVyYXRlIHN0YXRlbWVudHMgdGhhdCBkZWZpbmUgYSBnaXZlbiB0cmFuc2xhdGlvbiBtZXNzYWdlLlxuICpcbiAqIGBgYFxuICogdmFyIEkxOE5fMTtcbiAqIGlmICh0eXBlb2YgbmdJMThuQ2xvc3VyZU1vZGUgIT09IHVuZGVmaW5lZCAmJiBuZ0kxOG5DbG9zdXJlTW9kZSkge1xuICogICAgIHZhciBNU0dfRVhURVJOQUxfWFhYID0gZ29vZy5nZXRNc2coXG4gKiAgICAgICAgICBcIlNvbWUgbWVzc2FnZSB3aXRoIHskaW50ZXJwb2xhdGlvbn0hXCIsXG4gKiAgICAgICAgICB7IFwiaW50ZXJwb2xhdGlvblwiOiBcIlxcdUZGRkQwXFx1RkZGRFwiIH1cbiAqICAgICApO1xuICogICAgIEkxOE5fMSA9IE1TR19FWFRFUk5BTF9YWFg7XG4gKiB9XG4gKiBlbHNlIHtcbiAqICAgICBJMThOXzEgPSAkbG9jYWxpemVgU29tZSBtZXNzYWdlIHdpdGggJHsnXFx1RkZGRDBcXHVGRkZEJ30hYDtcbiAqIH1cbiAqIGBgYFxuICpcbiAqIEBwYXJhbSBtZXNzYWdlIFRoZSBvcmlnaW5hbCBpMThuIEFTVCBtZXNzYWdlIG5vZGVcbiAqIEBwYXJhbSB2YXJpYWJsZSBUaGUgdmFyaWFibGUgdGhhdCB3aWxsIGJlIGFzc2lnbmVkIHRoZSB0cmFuc2xhdGlvbiwgZS5nLiBgSTE4Tl8xYC5cbiAqIEBwYXJhbSBjbG9zdXJlVmFyIFRoZSB2YXJpYWJsZSBmb3IgQ2xvc3VyZSBgZ29vZy5nZXRNc2dgIGNhbGxzLCBlLmcuIGBNU0dfRVhURVJOQUxfWFhYYC5cbiAqIEBwYXJhbSBwYXJhbXMgT2JqZWN0IG1hcHBpbmcgcGxhY2Vob2xkZXIgbmFtZXMgdG8gdGhlaXIgdmFsdWVzIChlLmcuXG4gKiBgeyBcImludGVycG9sYXRpb25cIjogXCJcXHVGRkZEMFxcdUZGRkRcIiB9YCkuXG4gKiBAcGFyYW0gdHJhbnNmb3JtRm4gT3B0aW9uYWwgdHJhbnNmb3JtYXRpb24gZnVuY3Rpb24gdGhhdCB3aWxsIGJlIGFwcGxpZWQgdG8gdGhlIHRyYW5zbGF0aW9uXG4gKiAgICAgKGUuZy5cbiAqIHBvc3QtcHJvY2Vzc2luZykuXG4gKiBAcmV0dXJucyBBbiBhcnJheSBvZiBzdGF0ZW1lbnRzIHRoYXQgZGVmaW5lZCBhIGdpdmVuIHRyYW5zbGF0aW9uLlxuICovXG5mdW5jdGlvbiBnZXRUcmFuc2xhdGlvbkRlY2xTdG10cyhcbiAgICBtZXNzYWdlOiBpMThuLk1lc3NhZ2UsIHZhcmlhYmxlOiBvLlJlYWRWYXJFeHByLCBjbG9zdXJlVmFyOiBvLlJlYWRWYXJFeHByLFxuICAgIHBhcmFtczogTWFwPHN0cmluZywgby5FeHByZXNzaW9uPixcbiAgICB0cmFuc2Zvcm1Gbj86IChyYXc6IG8uUmVhZFZhckV4cHIpID0+IG8uRXhwcmVzc2lvbik6IG8uU3RhdGVtZW50W10ge1xuICBjb25zdCBwYXJhbXNPYmplY3QgPSBPYmplY3QuZnJvbUVudHJpZXMocGFyYW1zKTtcbiAgY29uc3Qgc3RhdGVtZW50czogby5TdGF0ZW1lbnRbXSA9IFtcbiAgICBkZWNsYXJlSTE4blZhcmlhYmxlKHZhcmlhYmxlKSxcbiAgICBvLmlmU3RtdChcbiAgICAgICAgY3JlYXRlQ2xvc3VyZU1vZGVHdWFyZCgpLFxuICAgICAgICBjcmVhdGVHb29nbGVHZXRNc2dTdGF0ZW1lbnRzKHZhcmlhYmxlLCBtZXNzYWdlLCBjbG9zdXJlVmFyLCBwYXJhbXNPYmplY3QpLFxuICAgICAgICBjcmVhdGVMb2NhbGl6ZVN0YXRlbWVudHMoXG4gICAgICAgICAgICB2YXJpYWJsZSwgbWVzc2FnZSxcbiAgICAgICAgICAgIGZvcm1hdEkxOG5QbGFjZWhvbGRlck5hbWVzSW5NYXAocGFyYW1zT2JqZWN0LCAvKiB1c2VDYW1lbENhc2UgKi8gZmFsc2UpKSksXG4gIF07XG5cbiAgaWYgKHRyYW5zZm9ybUZuKSB7XG4gICAgc3RhdGVtZW50cy5wdXNoKG5ldyBvLkV4cHJlc3Npb25TdGF0ZW1lbnQodmFyaWFibGUuc2V0KHRyYW5zZm9ybUZuKHZhcmlhYmxlKSkpKTtcbiAgfVxuXG4gIHJldHVybiBzdGF0ZW1lbnRzO1xufVxuXG4vKipcbiAqIENyZWF0ZSB0aGUgZXhwcmVzc2lvbiB0aGF0IHdpbGwgYmUgdXNlZCB0byBndWFyZCB0aGUgY2xvc3VyZSBtb2RlIGJsb2NrXG4gKiBJdCBpcyBlcXVpdmFsZW50IHRvOlxuICpcbiAqIGBgYFxuICogdHlwZW9mIG5nSTE4bkNsb3N1cmVNb2RlICE9PSB1bmRlZmluZWQgJiYgbmdJMThuQ2xvc3VyZU1vZGVcbiAqIGBgYFxuICovXG5mdW5jdGlvbiBjcmVhdGVDbG9zdXJlTW9kZUd1YXJkKCk6IG8uQmluYXJ5T3BlcmF0b3JFeHByIHtcbiAgcmV0dXJuIG8udHlwZW9mRXhwcihvLnZhcmlhYmxlKE5HX0kxOE5fQ0xPU1VSRV9NT0RFKSlcbiAgICAgIC5ub3RJZGVudGljYWwoby5saXRlcmFsKCd1bmRlZmluZWQnLCBvLlNUUklOR19UWVBFKSlcbiAgICAgIC5hbmQoby52YXJpYWJsZShOR19JMThOX0NMT1NVUkVfTU9ERSkpO1xufVxuXG4vKipcbiAqIEdlbmVyYXRlcyB2YXJzIHdpdGggQ2xvc3VyZS1zcGVjaWZpYyBuYW1lcyBmb3IgaTE4biBibG9ja3MgKGkuZS4gYE1TR19YWFhgKS5cbiAqL1xuZnVuY3Rpb24gaTE4bkdlbmVyYXRlQ2xvc3VyZVZhcihcbiAgICBwb29sOiBDb25zdGFudFBvb2wsIG1lc3NhZ2VJZDogc3RyaW5nLCBmaWxlQmFzZWRJMThuU3VmZml4OiBzdHJpbmcsXG4gICAgdXNlRXh0ZXJuYWxJZHM6IGJvb2xlYW4pOiBvLlJlYWRWYXJFeHByIHtcbiAgbGV0IG5hbWU6IHN0cmluZztcbiAgY29uc3Qgc3VmZml4ID0gZmlsZUJhc2VkSTE4blN1ZmZpeDtcbiAgaWYgKHVzZUV4dGVybmFsSWRzKSB7XG4gICAgY29uc3QgcHJlZml4ID0gZ2V0VHJhbnNsYXRpb25Db25zdFByZWZpeChgRVhURVJOQUxfYCk7XG4gICAgY29uc3QgdW5pcXVlU3VmZml4ID0gcG9vbC51bmlxdWVOYW1lKHN1ZmZpeCk7XG4gICAgbmFtZSA9IGAke3ByZWZpeH0ke3Nhbml0aXplSWRlbnRpZmllcihtZXNzYWdlSWQpfSQkJHt1bmlxdWVTdWZmaXh9YDtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBwcmVmaXggPSBnZXRUcmFuc2xhdGlvbkNvbnN0UHJlZml4KHN1ZmZpeCk7XG4gICAgbmFtZSA9IHBvb2wudW5pcXVlTmFtZShwcmVmaXgpO1xuICB9XG4gIHJldHVybiBvLnZhcmlhYmxlKG5hbWUpO1xufVxuIl19