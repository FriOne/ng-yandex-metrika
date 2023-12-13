/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import { sanitizeIdentifier } from '../../../../parse_util';
import { hyphenate } from '../../../../render3/view/style_parser';
import * as ir from '../../ir';
import { ViewCompilationUnit } from '../compilation';
/**
 * Generate names for functions and variables across all views.
 *
 * This includes propagating those names into any `ir.ReadVariableExpr`s of those variables, so that
 * the reads can be emitted correctly.
 */
export function nameFunctionsAndVariables(job) {
    addNamesToView(job.root, job.componentName, { index: 0 }, job.compatibility === ir.CompatibilityMode.TemplateDefinitionBuilder);
}
function addNamesToView(unit, baseName, state, compatibility) {
    if (unit.fnName === null) {
        unit.fnName = sanitizeIdentifier(`${baseName}_${unit.job.fnSuffix}`);
    }
    // Keep track of the names we assign to variables in the view. We'll need to propagate these
    // into reads of those variables afterwards.
    const varNames = new Map();
    for (const op of unit.ops()) {
        switch (op.kind) {
            case ir.OpKind.Property:
            case ir.OpKind.HostProperty:
                if (op.isAnimationTrigger) {
                    op.name = '@' + op.name;
                }
                break;
            case ir.OpKind.Listener:
                if (op.handlerFnName !== null) {
                    break;
                }
                if (!op.hostListener && op.targetSlot.slot === null) {
                    throw new Error(`Expected a slot to be assigned`);
                }
                let animation = '';
                if (op.isAnimationListener) {
                    op.name = `@${op.name}.${op.animationPhase}`;
                    animation = 'animation';
                }
                if (op.hostListener) {
                    op.handlerFnName = `${baseName}_${animation}${op.name}_HostBindingHandler`;
                }
                else {
                    op.handlerFnName = `${unit.fnName}_${op.tag.replace('-', '_')}_${animation}${op.name}_${op.targetSlot.slot}_listener`;
                }
                op.handlerFnName = sanitizeIdentifier(op.handlerFnName);
                break;
            case ir.OpKind.Variable:
                varNames.set(op.xref, getVariableName(op.variable, state));
                break;
            case ir.OpKind.RepeaterCreate:
                if (!(unit instanceof ViewCompilationUnit)) {
                    throw new Error(`AssertionError: must be compiling a component`);
                }
                if (op.handle.slot === null) {
                    throw new Error(`Expected slot to be assigned`);
                }
                if (op.emptyView !== null) {
                    const emptyView = unit.job.views.get(op.emptyView);
                    // Repeater empty view function is at slot +2 (metadata is in the first slot).
                    addNamesToView(emptyView, `${baseName}_${`${op.functionNameSuffix}Empty`}_${op.handle.slot + 2}`, state, compatibility);
                }
                // Repeater primary view function is at slot +1 (metadata is in the first slot).
                addNamesToView(unit.job.views.get(op.xref), `${baseName}_${op.functionNameSuffix}_${op.handle.slot + 1}`, state, compatibility);
                break;
            case ir.OpKind.Template:
                if (!(unit instanceof ViewCompilationUnit)) {
                    throw new Error(`AssertionError: must be compiling a component`);
                }
                const childView = unit.job.views.get(op.xref);
                if (op.handle.slot === null) {
                    throw new Error(`Expected slot to be assigned`);
                }
                const suffix = op.functionNameSuffix.length === 0 ? '' : `_${op.functionNameSuffix}`;
                addNamesToView(childView, `${baseName}${suffix}_${op.handle.slot}`, state, compatibility);
                break;
            case ir.OpKind.StyleProp:
                op.name = normalizeStylePropName(op.name);
                if (compatibility) {
                    op.name = stripImportant(op.name);
                }
                break;
            case ir.OpKind.ClassProp:
                if (compatibility) {
                    op.name = stripImportant(op.name);
                }
                break;
        }
    }
    // Having named all variables declared in the view, now we can push those names into the
    // `ir.ReadVariableExpr` expressions which represent reads of those variables.
    for (const op of unit.ops()) {
        ir.visitExpressionsInOp(op, expr => {
            if (!(expr instanceof ir.ReadVariableExpr) || expr.name !== null) {
                return;
            }
            if (!varNames.has(expr.xref)) {
                throw new Error(`Variable ${expr.xref} not yet named`);
            }
            expr.name = varNames.get(expr.xref);
        });
    }
}
function getVariableName(variable, state) {
    if (variable.name === null) {
        switch (variable.kind) {
            case ir.SemanticVariableKind.Context:
                variable.name = `ctx_r${state.index++}`;
                break;
            case ir.SemanticVariableKind.Identifier:
                // TODO: Prefix increment and `_r` for compatiblity only.
                variable.name = `${variable.identifier}_r${++state.index}`;
                break;
            default:
                // TODO: Prefix increment for compatibility only.
                variable.name = `_r${++state.index}`;
                break;
        }
    }
    return variable.name;
}
/**
 * Normalizes a style prop name by hyphenating it (unless its a CSS variable).
 */
function normalizeStylePropName(name) {
    return name.startsWith('--') ? name : hyphenate(name);
}
/**
 * Strips `!important` out of the given style or class name.
 */
function stripImportant(name) {
    const importantIndex = name.indexOf('!important');
    if (importantIndex > -1) {
        return name.substring(0, importantIndex);
    }
    return name;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmFtaW5nLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvbmFtaW5nLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sRUFBQyxrQkFBa0IsRUFBQyxNQUFNLHdCQUF3QixDQUFDO0FBQzFELE9BQU8sRUFBQyxTQUFTLEVBQUMsTUFBTSx1Q0FBdUMsQ0FBQztBQUNoRSxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUMvQixPQUFPLEVBQUMsbUJBQW1CLEVBQTRDLE1BQU0sZ0JBQWdCLENBQUM7QUFFOUY7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUseUJBQXlCLENBQUMsR0FBbUI7SUFDM0QsY0FBYyxDQUNWLEdBQUcsQ0FBQyxJQUFJLEVBQUUsR0FBRyxDQUFDLGFBQWEsRUFBRSxFQUFDLEtBQUssRUFBRSxDQUFDLEVBQUMsRUFDdkMsR0FBRyxDQUFDLGFBQWEsS0FBSyxFQUFFLENBQUMsaUJBQWlCLENBQUMseUJBQXlCLENBQUMsQ0FBQztBQUM1RSxDQUFDO0FBRUQsU0FBUyxjQUFjLENBQ25CLElBQXFCLEVBQUUsUUFBZ0IsRUFBRSxLQUFzQixFQUFFLGFBQXNCO0lBQ3pGLElBQUksSUFBSSxDQUFDLE1BQU0sS0FBSyxJQUFJLEVBQUU7UUFDeEIsSUFBSSxDQUFDLE1BQU0sR0FBRyxrQkFBa0IsQ0FBQyxHQUFHLFFBQVEsSUFBSSxJQUFJLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxDQUFDLENBQUM7S0FDdEU7SUFFRCw0RkFBNEY7SUFDNUYsNENBQTRDO0lBQzVDLE1BQU0sUUFBUSxHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO0lBRTlDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFO1FBQzNCLFFBQVEsRUFBRSxD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QUFFLENBQUM7Z0JBQzNELE1BQU07WUFDUjtnQkFDRSxpREFBaUQ7Z0JBQ2pELFFBQVEsQ0FBQyxJQUFJLEdBQUcsS0FBSyxFQUFFLEtBQUssQ0FBQyxLQUFLLEVBQUUsQ0FBQztnQkFDckMsTUFBTTtTQUNUO0tBQ0Y7SUFDRCxPQUFPLFFBQVEsQ0FBQyxJQUFJLENBQUM7QUFDdkIsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxzQkFBc0IsQ0FBQyxJQUFZO0lBQzFDLE9BQU8sSUFBSSxDQUFDLFVBQVUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxTQUFTLENBQUMsSUFBSSxDQUFDLENBQUM7QUFDeEQsQ0FBQztBQUVEOztHQUVHO0FBQ0gsU0FBUyxjQUFjLENBQUMsSUFBWTtJQUNsQyxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDO0lBQ2xELElBQUksY0FBYyxHQUFHLENBQUMsQ0FBQyxFQUFFO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDLFNBQVMsQ0FBQyxDQUFDLEVBQUUsY0FBYyxDQUFDLENBQUM7S0FDMUM7SUFDRCxPQUFPLElBQUksQ0FBQztBQUNkLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0IHtzYW5pdGl6ZUlkZW50aWZpZXJ9IGZyb20gJy4uLy4uLy4uLy4uL3BhcnNlX3V0aWwnO1xuaW1wb3J0IHtoeXBoZW5hdGV9IGZyb20gJy4uLy4uLy4uLy4uL3JlbmRlcjMvdmlldy9zdHlsZV9wYXJzZXInO1xuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtWaWV3Q29tcGlsYXRpb25Vbml0LCB0eXBlIENvbXBpbGF0aW9uSm9iLCB0eXBlIENvbXBpbGF0aW9uVW5pdH0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIEdlbmVyYXRlIG5hbWVzIGZvciBmdW5jdGlvbnMgYW5kIHZhcmlhYmxlcyBhY3Jvc3MgYWxsIHZpZXdzLlxuICpcbiAqIFRoaXMgaW5jbHVkZXMgcHJvcGFnYXRpbmcgdGhvc2UgbmFtZXMgaW50byBhbnkgYGlyLlJlYWRWYXJpYWJsZUV4cHJgcyBvZiB0aG9zZSB2YXJpYWJsZXMsIHNvIHRoYXRcbiAqIHRoZSByZWFkcyBjYW4gYmUgZW1pdHRlZCBjb3JyZWN0bHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBuYW1lRnVuY3Rpb25zQW5kVmFyaWFibGVzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgYWRkTmFtZXNUb1ZpZXcoXG4gICAgICBqb2Iucm9vdCwgam9iLmNvbXBvbmVudE5hbWUsIHtpbmRleDogMH0sXG4gICAgICBqb2IuY29tcGF0aWJpbGl0eSA9PT0gaXIuQ29tcGF0aWJpbGl0eU1vZGUuVGVtcGxhdGVEZWZpbml0aW9uQnVpbGRlcik7XG59XG5cbmZ1bmN0aW9uIGFkZE5hbWVzVG9WaWV3KFxuICAgIHVuaXQ6IENvbXBpbGF0aW9uVW5pdCwgYmFzZU5hbWU6IHN0cmluZywgc3RhdGU6IHtpbmRleDogbnVtYmVyfSwgY29tcGF0aWJpbGl0eTogYm9vbGVhbik6IHZvaWQge1xuICBpZiAodW5pdC5mbk5hbWUgPT09IG51bGwpIHtcbiAgICB1bml0LmZuTmFtZSA9IHNhbml0aXplSWRlbnRpZmllcihgJHtiYXNlTmFtZX1fJHt1bml0LmpvYi5mblN1ZmZpeH1gKTtcbiAgfVxuXG4gIC8vIEtlZXAgdHJhY2sgb2YgdGhlIG5hbWVzIHdlIGFzc2lnbiB0byB2YXJpYWJsZXMgaW4gdGhlIHZpZXcuIFdlJ2xsIG5lZWQgdG8gcHJvcGFnYXRlIHRoZXNlXG4gIC8vIGludG8gcmVhZHMgb2YgdGhvc2UgdmFyaWFibGVzIGFmdGVyd2FyZHMuXG4gIGNvbnN0IHZhck5hbWVzID0gbmV3IE1hcDxpci5YcmVmSWQsIHN0cmluZz4oKTtcblxuICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQub3BzKCkpIHtcbiAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgIGNhc2UgaXIuT3BLaW5kLlByb3BlcnR5OlxuICAgICAgY2FzZSBpci5PcEtpbmQuSG9zdFByb3BlcnR5OlxuICAgICAgICBpZiAob3AuaXNBbmltYXRpb25UcmlnZ2VyKSB7XG4gICAgICAgICAgb3AubmFtZSA9ICdAJyArIG9wLm5hbWU7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5MaXN0ZW5lcjpcbiAgICAgICAgaWYgKG9wLmhhbmRsZXJGbk5hbWUgIT09IG51bGwpIHtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgICBpZiAoIW9wLmhvc3RMaXN0ZW5lciAmJiBvcC50YXJnZXRTbG90LnNsb3QgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIGEgc2xvdCB0byBiZSBhc3NpZ25lZGApO1xuICAgICAgICB9XG4gICAgICAgIGxldCBhbmltYXRpb24gPSAnJztcbiAgICAgICAgaWYgKG9wLmlzQW5pbWF0aW9uTGlzdGVuZXIpIHtcbiAgICAgICAgICBvcC5uYW1lID0gYEAke29wLm5hbWV9LiR7b3AuYW5pbWF0aW9uUGhhc2V9YDtcbiAgICAgICAgICBhbmltYXRpb24gPSAnYW5pbWF0aW9uJztcbiAgICAgICAgfVxuICAgICAgICBpZiAob3AuaG9zdExpc3RlbmVyKSB7XG4gICAgICAgICAgb3AuaGFuZGxlckZuTmFtZSA9IGAke2Jhc2VOYW1lfV8ke2FuaW1hdGlvbn0ke29wLm5hbWV9X0hvc3RCaW5kaW5nSGFuZGxlcmA7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgb3AuaGFuZGxlckZuTmFtZSA9IGAke3VuaXQuZm5OYW1lfV8ke29wLnRhZyEucmVwbGFjZSgnLScsICdfJyl9XyR7YW5pbWF0aW9ufSR7b3AubmFtZX1fJHtcbiAgICAgICAgICAgICAgb3AudGFyZ2V0U2xvdC5zbG90fV9saXN0ZW5lcmA7XG4gICAgICAgIH1cbiAgICAgICAgb3AuaGFuZGxlckZuTmFtZSA9IHNhbml0aXplSWRlbnRpZmllcihvcC5oYW5kbGVyRm5OYW1lKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5WYXJpYWJsZTpcbiAgICAgICAgdmFyTmFtZXMuc2V0KG9wLnhyZWYsIGdldFZhcmlhYmxlTmFtZShvcC52YXJpYWJsZSwgc3RhdGUpKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5SZXBlYXRlckNyZWF0ZTpcbiAgICAgICAgaWYgKCEodW5pdCBpbnN0YW5jZW9mIFZpZXdDb21waWxhdGlvblVuaXQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBc3NlcnRpb25FcnJvcjogbXVzdCBiZSBjb21waWxpbmcgYSBjb21wb25lbnRgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3AuaGFuZGxlLnNsb3QgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIHNsb3QgdG8gYmUgYXNzaWduZWRgKTtcbiAgICAgICAgfVxuICAgICAgICBpZiAob3AuZW1wdHlWaWV3ICE9PSBudWxsKSB7XG4gICAgICAgICAgY29uc3QgZW1wdHlWaWV3ID0gdW5pdC5qb2Iudmlld3MuZ2V0KG9wLmVtcHR5VmlldykhO1xuICAgICAgICAgIC8vIFJlcGVhdGVyIGVtcHR5IHZpZXcgZnVuY3Rpb24gaXMgYXQgc2xvdCArMiAobWV0YWRhdGEgaXMgaW4gdGhlIGZpcnN0IHNsb3QpLlxuICAgICAgICAgIGFkZE5hbWVzVG9WaWV3KFxuICAgICAgICAgICAgICBlbXB0eVZpZXcsIGAke2Jhc2VOYW1lfV8ke2Ake29wLmZ1bmN0aW9uTmFtZVN1ZmZpeH1FbXB0eWB9XyR7b3AuaGFuZGxlLnNsb3QgKyAyfWAsXG4gICAgICAgICAgICAgIHN0YXRlLCBjb21wYXRpYmlsaXR5KTtcbiAgICAgICAgfVxuICAgICAgICAvLyBSZXBlYXRlciBwcmltYXJ5IHZpZXcgZnVuY3Rpb24gaXMgYXQgc2xvdCArMSAobWV0YWRhdGEgaXMgaW4gdGhlIGZpcnN0IHNsb3QpLlxuICAgICAgICBhZGROYW1lc1RvVmlldyhcbiAgICAgICAgICAgIHVuaXQuam9iLnZpZXdzLmdldChvcC54cmVmKSEsXG4gICAgICAgICAgICBgJHtiYXNlTmFtZX1fJHtvcC5mdW5jdGlvbk5hbWVTdWZmaXh9XyR7b3AuaGFuZGxlLnNsb3QgKyAxfWAsIHN0YXRlLCBjb21wYXRpYmlsaXR5KTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLk9wS2luZC5UZW1wbGF0ZTpcbiAgICAgICAgaWYgKCEodW5pdCBpbnN0YW5jZW9mIFZpZXdDb21waWxhdGlvblVuaXQpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBBc3NlcnRpb25FcnJvcjogbXVzdCBiZSBjb21waWxpbmcgYSBjb21wb25lbnRgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBjaGlsZFZpZXcgPSB1bml0LmpvYi52aWV3cy5nZXQob3AueHJlZikhO1xuICAgICAgICBpZiAob3AuaGFuZGxlLnNsb3QgPT09IG51bGwpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEV4cGVjdGVkIHNsb3QgdG8gYmUgYXNzaWduZWRgKTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBzdWZmaXggPSBvcC5mdW5jdGlvbk5hbWVTdWZmaXgubGVuZ3RoID09PSAwID8gJycgOiBgXyR7b3AuZnVuY3Rpb25OYW1lU3VmZml4fWA7XG4gICAgICAgIGFkZE5hbWVzVG9WaWV3KGNoaWxkVmlldywgYCR7YmFzZU5hbWV9JHtzdWZmaXh9XyR7b3AuaGFuZGxlLnNsb3R9YCwgc3RhdGUsIGNvbXBhdGliaWxpdHkpO1xuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgaXIuT3BLaW5kLlN0eWxlUHJvcDpcbiAgICAgICAgb3AubmFtZSA9IG5vcm1hbGl6ZVN0eWxlUHJvcE5hbWUob3AubmFtZSk7XG4gICAgICAgIGlmIChjb21wYXRpYmlsaXR5KSB7XG4gICAgICAgICAgb3AubmFtZSA9IHN0cmlwSW1wb3J0YW50KG9wLm5hbWUpO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSBpci5PcEtpbmQuQ2xhc3NQcm9wOlxuICAgICAgICBpZiAoY29tcGF0aWJpbGl0eSkge1xuICAgICAgICAgIG9wLm5hbWUgPSBzdHJpcEltcG9ydGFudChvcC5uYW1lKTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyBIYXZpbmcgbmFtZWQgYWxsIHZhcmlhYmxlcyBkZWNsYXJlZCBpbiB0aGUgdmlldywgbm93IHdlIGNhbiBwdXNoIHRob3NlIG5hbWVzIGludG8gdGhlXG4gIC8vIGBpci5SZWFkVmFyaWFibGVFeHByYCBleHByZXNzaW9ucyB3aGljaCByZXByZXNlbnQgcmVhZHMgb2YgdGhvc2UgdmFyaWFibGVzLlxuICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQub3BzKCkpIHtcbiAgICBpci52aXNpdEV4cHJlc3Npb25zSW5PcChvcCwgZXhwciA9PiB7XG4gICAgICBpZiAoIShleHByIGluc3RhbmNlb2YgaXIuUmVhZFZhcmlhYmxlRXhwcikgfHwgZXhwci5uYW1lICE9PSBudWxsKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIGlmICghdmFyTmFtZXMuaGFzKGV4cHIueHJlZikpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKGBWYXJpYWJsZSAke2V4cHIueHJlZn0gbm90IHlldCBuYW1lZGApO1xuICAgICAgfVxuICAgICAgZXhwci5uYW1lID0gdmFyTmFtZXMuZ2V0KGV4cHIueHJlZikhO1xuICAgIH0pO1xuICB9XG59XG5cbmZ1bmN0aW9uIGdldFZhcmlhYmxlTmFtZSh2YXJpYWJsZTogaXIuU2VtYW50aWNWYXJpYWJsZSwgc3RhdGU6IHtpbmRleDogbnVtYmVyfSk6IHN0cmluZyB7XG4gIGlmICh2YXJpYWJsZS5uYW1lID09PSBudWxsKSB7XG4gICAgc3dpdGNoICh2YXJpYWJsZS5raW5kKSB7XG4gICAgICBjYXNlIGlyLlNlbWFudGljVmFyaWFibGVLaW5kLkNvbnRleHQ6XG4gICAgICAgIHZhcmlhYmxlLm5hbWUgPSBgY3R4X3Ike3N0YXRlLmluZGV4Kyt9YDtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlIGlyLlNlbWFudGljVmFyaWFibGVLaW5kLklkZW50aWZpZXI6XG4gICAgICAgIC8vIFRPRE86IFByZWZpeCBpbmNyZW1lbnQgYW5kIGBfcmAgZm9yIGNvbXBhdGlibGl0eSBvbmx5LlxuICAgICAgICB2YXJpYWJsZS5uYW1lID0gYCR7dmFyaWFibGUuaWRlbnRpZmllcn1fciR7KytzdGF0ZS5pbmRleH1gO1xuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIC8vIFRPRE86IFByZWZpeCBpbmNyZW1lbnQgZm9yIGNvbXBhdGliaWxpdHkgb25seS5cbiAgICAgICAgdmFyaWFibGUubmFtZSA9IGBfciR7KytzdGF0ZS5pbmRleH1gO1xuICAgICAgICBicmVhaztcbiAgICB9XG4gIH1cbiAgcmV0dXJuIHZhcmlhYmxlLm5hbWU7XG59XG5cbi8qKlxuICogTm9ybWFsaXplcyBhIHN0eWxlIHByb3AgbmFtZSBieSBoeXBoZW5hdGluZyBpdCAodW5sZXNzIGl0cyBhIENTUyB2YXJpYWJsZSkuXG4gKi9cbmZ1bmN0aW9uIG5vcm1hbGl6ZVN0eWxlUHJvcE5hbWUobmFtZTogc3RyaW5nKSB7XG4gIHJldHVybiBuYW1lLnN0YXJ0c1dpdGgoJy0tJykgPyBuYW1lIDogaHlwaGVuYXRlKG5hbWUpO1xufVxuXG4vKipcbiAqIFN0cmlwcyBgIWltcG9ydGFudGAgb3V0IG9mIHRoZSBnaXZlbiBzdHlsZSBvciBjbGFzcyBuYW1lLlxuICovXG5mdW5jdGlvbiBzdHJpcEltcG9ydGFudChuYW1lOiBzdHJpbmcpIHtcbiAgY29uc3QgaW1wb3J0YW50SW5kZXggPSBuYW1lLmluZGV4T2YoJyFpbXBvcnRhbnQnKTtcbiAgaWYgKGltcG9ydGFudEluZGV4ID4gLTEpIHtcbiAgICByZXR1cm4gbmFtZS5zdWJzdHJpbmcoMCwgaW1wb3J0YW50SW5kZXgpO1xuICB9XG4gIHJldHVybiBuYW1lO1xufVxuIl19