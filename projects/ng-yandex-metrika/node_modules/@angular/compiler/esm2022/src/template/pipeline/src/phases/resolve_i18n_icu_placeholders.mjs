/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as i18n from '../../../../i18n/i18n_ast';
import * as ir from '../../ir';
/**
 * Resolves placeholders for element tags inside of an ICU.
 */
export function resolveI18nIcuPlaceholders(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.I18nContext && op.contextKind === ir.I18nContextKind.Icu) {
                for (const node of op.message.nodes) {
                    node.visit(new ResolveIcuPlaceholdersVisitor(op.postprocessingParams));
                }
            }
        }
    }
}
/**
 * Visitor for i18n AST that resolves ICU params into the given map.
 */
class ResolveIcuPlaceholdersVisitor extends i18n.RecurseVisitor {
    constructor(params) {
        super();
        this.params = params;
    }
    visitContainerPlaceholder(placeholder) {
        // Add the start and end source span for container placeholders. These need to be recorded for
        // elements inside ICUs. The slots for the nodes were recorded separately under the i18n
        // block's context as part of the `resolveI18nElementPlaceholders` phase.
        if (placeholder.startName && placeholder.startSourceSpan &&
            !this.params.has(placeholder.startName)) {
            this.params.set(placeholder.startName, [{
                    value: placeholder.startSourceSpan?.toString(),
                    subTemplateIndex: null,
                    flags: ir.I18nParamValueFlags.None
                }]);
        }
        if (placeholder.closeName && placeholder.endSourceSpan &&
            !this.params.has(placeholder.closeName)) {
            this.params.set(placeholder.closeName, [{
                    value: placeholder.endSourceSpan?.toString(),
                    subTemplateIndex: null,
                    flags: ir.I18nParamValueFlags.None
                }]);
        }
    }
    visitTagPlaceholder(placeholder) {
        super.visitTagPlaceholder(placeholder);
        this.visitContainerPlaceholder(placeholder);
    }
    visitBlockPlaceholder(placeholder) {
        super.visitBlockPlaceholder(placeholder);
        this.visitContainerPlaceholder(placeholder);
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVzb2x2ZV9pMThuX2ljdV9wbGFjZWhvbGRlcnMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9yZXNvbHZlX2kxOG5faWN1X3BsYWNlaG9sZGVycy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssSUFBSSxNQUFNLDJCQUEyQixDQUFDO0FBQ2xELE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COztHQUVHO0FBQ0gsTUFBTSxVQUFVLDBCQUEwQixDQUFDLEdBQW1CO0lBQzVELEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsV0FBVyxJQUFJLEVBQUUsQ0FBQyxXQUFXLEtBQUssRUFBRSxDQUFDLGVBQWUsQ0FBQyxHQUFHLEVBQUU7Z0JBQ2xGLEtBQUssTUFBTSxJQUFJLElBQUksRUFBRSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUU7b0JBQ25DLElBQUksQ0FBQyxLQUFLLENBQUMsSUFBSSw2QkFBNkIsQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQUMsQ0FBQyxDQUFDO2lCQUN4RTthQUNGO1NBQ0Y7S0FDRjtBQUNILENBQUM7QUFFRDs7R0FFRztBQUNILE1BQU0sNkJBQThCLFNBQVEsSUFBSSxDQUFDLGNBQWM7SUFDN0QsWUFBNkIsTUFBd0M7UUFDbkUsS0FBSyxFQUFFLENBQUM7UUFEbUIsV0FBTSxHQUFOLE1BQU0sQ0FBa0M7SUFFckUsQ0FBQztJQUVPLHlCQUF5QixDQUFDLFdBQXNEO1FBQ3RGLDhGQUE4RjtRQUM5Rix3RkFBd0Y7UUFDeEYseUVBQXlFO1FBQ3pFLElBQUksV0FBVyxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUMsZUFBZTtZQUNwRCxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQ3RCLEtBQUssRUFBRSxXQUFXLENBQUMsZUFBZSxFQUFFLFFBQVEsRUFBRTtvQkFDOUMsZ0JBQWdCLEVBQUUsSUFBSTtvQkFDdEIsS0FBSyxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJO2lCQUNuQyxDQUFDLENBQUMsQ0FBQztTQUNyQjtRQUNELElBQUksV0FBVyxDQUFDLFNBQVMsSUFBSSxXQUFXLENBQUMsYUFBYTtZQUNsRCxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLFdBQVcsQ0FBQyxTQUFTLENBQUMsRUFBRTtZQUMzQyxJQUFJLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxXQUFXLENBQUMsU0FBUyxFQUFFLENBQUM7b0JBQ3RCLEtBQUssRUFBRSxXQUFXLENBQUMsYUFBYSxFQUFFLFFBQVEsRUFBRTtvQkFDNUMsZ0JBQWdCLEVBQUUsSUFBSTtvQkFDdEIsS0FBSyxFQUFFLEVBQUUsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJO2lCQUNuQyxDQUFDLENBQUMsQ0FBQztTQUNyQjtJQUNILENBQUM7SUFFUSxtQkFBbUIsQ0FBQyxXQUFnQztRQUMzRCxLQUFLLENBQUMsbUJBQW1CLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDdkMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzlDLENBQUM7SUFFUSxxQkFBcUIsQ0FBQyxXQUFrQztRQUMvRCxLQUFLLENBQUMscUJBQXFCLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDekMsSUFBSSxDQUFDLHlCQUF5QixDQUFDLFdBQVcsQ0FBQyxDQUFDO0lBQzlDLENBQUM7Q0FDRiIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBpMThuIGZyb20gJy4uLy4uLy4uLy4uL2kxOG4vaTE4bl9hc3QnO1xuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIFJlc29sdmVzIHBsYWNlaG9sZGVycyBmb3IgZWxlbWVudCB0YWdzIGluc2lkZSBvZiBhbiBJQ1UuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXNvbHZlSTE4bkljdVBsYWNlaG9sZGVycyhqb2I6IENvbXBpbGF0aW9uSm9iKSB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkkxOG5Db250ZXh0ICYmIG9wLmNvbnRleHRLaW5kID09PSBpci5JMThuQ29udGV4dEtpbmQuSWN1KSB7XG4gICAgICAgIGZvciAoY29uc3Qgbm9kZSBvZiBvcC5tZXNzYWdlLm5vZGVzKSB7XG4gICAgICAgICAgbm9kZS52aXNpdChuZXcgUmVzb2x2ZUljdVBsYWNlaG9sZGVyc1Zpc2l0b3Iob3AucG9zdHByb2Nlc3NpbmdQYXJhbXMpKTtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG4vKipcbiAqIFZpc2l0b3IgZm9yIGkxOG4gQVNUIHRoYXQgcmVzb2x2ZXMgSUNVIHBhcmFtcyBpbnRvIHRoZSBnaXZlbiBtYXAuXG4gKi9cbmNsYXNzIFJlc29sdmVJY3VQbGFjZWhvbGRlcnNWaXNpdG9yIGV4dGVuZHMgaTE4bi5SZWN1cnNlVmlzaXRvciB7XG4gIGNvbnN0cnVjdG9yKHByaXZhdGUgcmVhZG9ubHkgcGFyYW1zOiBNYXA8c3RyaW5nLCBpci5JMThuUGFyYW1WYWx1ZVtdPikge1xuICAgIHN1cGVyKCk7XG4gIH1cblxuICBwcml2YXRlIHZpc2l0Q29udGFpbmVyUGxhY2Vob2xkZXIocGxhY2Vob2xkZXI6IGkxOG4uVGFnUGxhY2Vob2xkZXJ8aTE4bi5CbG9ja1BsYWNlaG9sZGVyKSB7XG4gICAgLy8gQWRkIHRoZSBzdGFydCBhbmQgZW5kIHNvdXJjZSBzcGFuIGZvciBjb250YWluZXIgcGxhY2Vob2xkZXJzLiBUaGVzZSBuZWVkIHRvIGJlIHJlY29yZGVkIGZvclxuICAgIC8vIGVsZW1lbnRzIGluc2lkZSBJQ1VzLiBUaGUgc2xvdHMgZm9yIHRoZSBub2RlcyB3ZXJlIHJlY29yZGVkIHNlcGFyYXRlbHkgdW5kZXIgdGhlIGkxOG5cbiAgICAvLyBibG9jaydzIGNvbnRleHQgYXMgcGFydCBvZiB0aGUgYHJlc29sdmVJMThuRWxlbWVudFBsYWNlaG9sZGVyc2AgcGhhc2UuXG4gICAgaWYgKHBsYWNlaG9sZGVyLnN0YXJ0TmFtZSAmJiBwbGFjZWhvbGRlci5zdGFydFNvdXJjZVNwYW4gJiZcbiAgICAgICAgIXRoaXMucGFyYW1zLmhhcyhwbGFjZWhvbGRlci5zdGFydE5hbWUpKSB7XG4gICAgICB0aGlzLnBhcmFtcy5zZXQocGxhY2Vob2xkZXIuc3RhcnROYW1lLCBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHBsYWNlaG9sZGVyLnN0YXJ0U291cmNlU3Bhbj8udG9TdHJpbmcoKSxcbiAgICAgICAgICAgICAgICAgICAgICAgIHN1YlRlbXBsYXRlSW5kZXg6IG51bGwsXG4gICAgICAgICAgICAgICAgICAgICAgICBmbGFnczogaXIuSTE4blBhcmFtVmFsdWVGbGFncy5Ob25lXG4gICAgICAgICAgICAgICAgICAgICAgfV0pO1xuICAgIH1cbiAgICBpZiAocGxhY2Vob2xkZXIuY2xvc2VOYW1lICYmIHBsYWNlaG9sZGVyLmVuZFNvdXJjZVNwYW4gJiZcbiAgICAgICAgIXRoaXMucGFyYW1zLmhhcyhwbGFjZWhvbGRlci5jbG9zZU5hbWUpKSB7XG4gICAgICB0aGlzLnBhcmFtcy5zZXQocGxhY2Vob2xkZXIuY2xvc2VOYW1lLCBbe1xuICAgICAgICAgICAgICAgICAgICAgICAgdmFsdWU6IHBsYWNlaG9sZGVyLmVuZFNvdXJjZVNwYW4/LnRvU3RyaW5nKCksXG4gICAgICAgICAgICAgICAgICAgICAgICBzdWJUZW1wbGF0ZUluZGV4OiBudWxsLFxuICAgICAgICAgICAgICAgICAgICAgICAgZmxhZ3M6IGlyLkkxOG5QYXJhbVZhbHVlRmxhZ3MuTm9uZVxuICAgICAgICAgICAgICAgICAgICAgIH1dKTtcbiAgICB9XG4gIH1cblxuICBvdmVycmlkZSB2aXNpdFRhZ1BsYWNlaG9sZGVyKHBsYWNlaG9sZGVyOiBpMThuLlRhZ1BsYWNlaG9sZGVyKSB7XG4gICAgc3VwZXIudmlzaXRUYWdQbGFjZWhvbGRlcihwbGFjZWhvbGRlcik7XG4gICAgdGhpcy52aXNpdENvbnRhaW5lclBsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcbiAgfVxuXG4gIG92ZXJyaWRlIHZpc2l0QmxvY2tQbGFjZWhvbGRlcihwbGFjZWhvbGRlcjogaTE4bi5CbG9ja1BsYWNlaG9sZGVyKSB7XG4gICAgc3VwZXIudmlzaXRCbG9ja1BsYWNlaG9sZGVyKHBsYWNlaG9sZGVyKTtcbiAgICB0aGlzLnZpc2l0Q29udGFpbmVyUGxhY2Vob2xkZXIocGxhY2Vob2xkZXIpO1xuICB9XG59XG4iXX0=