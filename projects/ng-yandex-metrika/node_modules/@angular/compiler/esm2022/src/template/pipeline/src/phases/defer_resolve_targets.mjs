/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Some `defer` conditions can reference other elements in the template, using their local reference
 * names. However, the semantics are quite different from the normal local reference system: in
 * particular, we need to look at local reference names in enclosing views. This phase resolves
 * all such references to actual xrefs.
 */
export function resolveDeferTargetNames(job) {
    const scopes = new Map();
    function getScopeForView(view) {
        if (scopes.has(view.xref)) {
            return scopes.get(view.xref);
        }
        const scope = new Scope();
        for (const op of view.create) {
            // add everything that can be referenced.
            if (!ir.isElementOrContainerOp(op) || op.localRefs === null) {
                continue;
            }
            if (!Array.isArray(op.localRefs)) {
                throw new Error('LocalRefs were already processed, but were needed to resolve defer targets.');
            }
            for (const ref of op.localRefs) {
                if (ref.target !== '') {
                    continue;
                }
                scope.targets.set(ref.name, { xref: op.xref, slot: op.handle });
            }
        }
        scopes.set(view.xref, scope);
        return scope;
    }
    function resolveTrigger(deferOwnerView, op, placeholderView) {
        switch (op.trigger.kind) {
            case ir.DeferTriggerKind.Idle:
            case ir.DeferTriggerKind.Immediate:
            case ir.DeferTriggerKind.Timer:
                return;
            case ir.DeferTriggerKind.Hover:
            case ir.DeferTriggerKind.Interaction:
            case ir.DeferTriggerKind.Viewport:
                if (op.trigger.targetName === null) {
                    // A `null` target name indicates we should default to the first element in the
                    // placeholder block.
                    if (placeholderView === null) {
                        throw new Error('defer on trigger with no target name must have a placeholder block');
                    }
                    const placeholder = job.views.get(placeholderView);
                    if (placeholder == undefined) {
                        throw new Error('AssertionError: could not find placeholder view for defer on trigger');
                    }
                    for (const placeholderOp of placeholder.create) {
                        if (ir.hasConsumesSlotTrait(placeholderOp) &&
                            (ir.isElementOrContainerOp(placeholderOp) ||
                                placeholderOp.kind === ir.OpKind.Projection)) {
                            op.trigger.targetXref = placeholderOp.xref;
                            op.trigger.targetView = placeholderView;
                            op.trigger.targetSlotViewSteps = -1;
                            op.trigger.targetSlot = placeholderOp.handle;
                            return;
                        }
                    }
                    return;
                }
                let view = placeholderView !== null ? job.views.get(placeholderView) : deferOwnerView;
                let step = placeholderView !== null ? -1 : 0;
                while (view !== null) {
                    const scope = getScopeForView(view);
                    if (scope.targets.has(op.trigger.targetName)) {
                        const { xref, slot } = scope.targets.get(op.trigger.targetName);
                        op.trigger.targetXref = xref;
                        op.trigger.targetView = view.xref;
                        op.trigger.targetSlotViewSteps = step;
                        op.trigger.targetSlot = slot;
                        return;
                    }
                    view = view.parent !== null ? job.views.get(view.parent) : null;
                    step++;
                }
                break;
            default:
                throw new Error(`Trigger kind ${op.trigger.kind} not handled`);
        }
    }
    // Find the defer ops, and assign the data about their targets.
    for (const unit of job.units) {
        const defers = new Map();
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.Defer:
                    defers.set(op.xref, op);
                    break;
                case ir.OpKind.DeferOn:
                    const deferOp = defers.get(op.defer);
                    resolveTrigger(unit, op, deferOp.placeholderView);
                    break;
            }
        }
    }
}
class Scope {
    constructor() {
        this.targets = new Map();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmZXJfcmVzb2x2ZV90YXJnZXRzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvZGVmZXJfcmVzb2x2ZV90YXJnZXRzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COzs7OztHQUtHO0FBQ0gsTUFBTSxVQUFVLHVCQUF1QixDQUFDLEdBQTRCO0lBQ2xFLE1BQU0sTUFBTSxHQUFHLElBQUksR0FBRyxFQUFvQixDQUFDO0lBRTNDLFNBQVMsZUFBZSxDQUFDLElBQXlCO1FBQ2hELElBQUksTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLEVBQUU7WUFDekIsT0FBTyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUUsQ0FBQztTQUMvQjtRQUVELE1BQU0sS0FBSyxHQUFHLElBQUksS0FBSyxFQUFFLENBQUM7UUFDMUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLHlDQUF5QztZQUN6QyxJQUFJLENBQUMsRUFBRSxDQUFDLHNCQUFzQixDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsQ0FBQyxTQUFTLEtBQUssSUFBSSxFQUFFO2dCQUMzRCxTQUFTO2FBQ1Y7WUFDRCxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUMsU0FBUyxDQUFDLEVBQUU7Z0JBQ2hDLE1BQU0sSUFBSSxLQUFLLENBQ1gsNkVBQTZFLENBQUMsQ0FBQzthQUNwRjtZQUVELEtBQUssTUFBTSxHQUFHLElBQUksRUFBRSxDQUFDLFNBQVMsRUFBRTtnQkFDOUIsSUFBSSxHQUFHLENBQUMsTUFBTSxLQUFLLEVBQUUsRUFBRTtvQkFDckIsU0FBUztp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YyxDQUFDLElBQUksRUFBRSxFQUFFLEVBQUUsT0FBTyxDQUFDLGVBQWUsQ0FBQyxDQUFDO29CQUNsRCxNQUFNO2FBQ1Q7U0FDRjtLQUNGO0FBQ0gsQ0FBQztBQUVELE1BQU0sS0FBSztJQUFYO1FBQ0UsWUFBTyxHQUFHLElBQUksR0FBRyxFQUFrRCxDQUFDO0lBQ3RFLENBQUM7Q0FBQSIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5pbXBvcnQgdHlwZSB7Q29tcG9uZW50Q29tcGlsYXRpb25Kb2IsIFZpZXdDb21waWxhdGlvblVuaXR9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBTb21lIGBkZWZlcmAgY29uZGl0aW9ucyBjYW4gcmVmZXJlbmNlIG90aGVyIGVsZW1lbnRzIGluIHRoZSB0ZW1wbGF0ZSwgdXNpbmcgdGhlaXIgbG9jYWwgcmVmZXJlbmNlXG4gKiBuYW1lcy4gSG93ZXZlciwgdGhlIHNlbWFudGljcyBhcmUgcXVpdGUgZGlmZmVyZW50IGZyb20gdGhlIG5vcm1hbCBsb2NhbCByZWZlcmVuY2Ugc3lzdGVtOiBpblxuICogcGFydGljdWxhciwgd2UgbmVlZCB0byBsb29rIGF0IGxvY2FsIHJlZmVyZW5jZSBuYW1lcyBpbiBlbmNsb3Npbmcgdmlld3MuIFRoaXMgcGhhc2UgcmVzb2x2ZXNcbiAqIGFsbCBzdWNoIHJlZmVyZW5jZXMgdG8gYWN0dWFsIHhyZWZzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZURlZmVyVGFyZ2V0TmFtZXMoam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBjb25zdCBzY29wZXMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgU2NvcGU+KCk7XG5cbiAgZnVuY3Rpb24gZ2V0U2NvcGVGb3JWaWV3KHZpZXc6IFZpZXdDb21waWxhdGlvblVuaXQpOiBTY29wZSB7XG4gICAgaWYgKHNjb3Blcy5oYXModmlldy54cmVmKSkge1xuICAgICAgcmV0dXJuIHNjb3Blcy5nZXQodmlldy54cmVmKSE7XG4gICAgfVxuXG4gICAgY29uc3Qgc2NvcGUgPSBuZXcgU2NvcGUoKTtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHZpZXcuY3JlYXRlKSB7XG4gICAgICAvLyBhZGQgZXZlcnl0aGluZyB0aGF0IGNhbiBiZSByZWZlcmVuY2VkLlxuICAgICAgaWYgKCFpci5pc0VsZW1lbnRPckNvbnRhaW5lck9wKG9wKSB8fCBvcC5sb2NhbFJlZnMgPT09IG51bGwpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkob3AubG9jYWxSZWZzKSkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAnTG9jYWxSZWZzIHdlcmUgYWxyZWFkeSBwcm9jZXNzZWQsIGJ1dCB3ZXJlIG5lZWRlZCB0byByZXNvbHZlIGRlZmVyIHRhcmdldHMuJyk7XG4gICAgICB9XG5cbiAgICAgIGZvciAoY29uc3QgcmVmIG9mIG9wLmxvY2FsUmVmcykge1xuICAgICAgICBpZiAocmVmLnRhcmdldCAhPT0gJycpIHtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuICAgICAgICBzY29wZS50YXJnZXRzLnNldChyZWYubmFtZSwge3hyZWY6IG9wLnhyZWYsIHNsb3Q6IG9wLmhhbmRsZX0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHNjb3Blcy5zZXQodmlldy54cmVmLCBzY29wZSk7XG4gICAgcmV0dXJuIHNjb3BlO1xuICB9XG5cbiAgZnVuY3Rpb24gcmVzb2x2ZVRyaWdnZXIoXG4gICAgICBkZWZlck93bmVyVmlldzogVmlld0NvbXBpbGF0aW9uVW5pdCwgb3A6IGlyLkRlZmVyT25PcCxcbiAgICAgIHBsYWNlaG9sZGVyVmlldzogaXIuWHJlZklkfG51bGwpOiB2b2lkIHtcbiAgICBzd2l0Y2ggKG9wLnRyaWdnZXIua2luZCkge1xuICAgICAgY2FzZSBpci5EZWZlclRyaWdnZXJLaW5kLklkbGU6XG4gICAgICBjYXNlIGlyLkRlZmVyVHJpZ2dlcktpbmQuSW1tZWRpYXRlOlxuICAgICAgY2FzZSBpci5EZWZlclRyaWdnZXJLaW5kLlRpbWVyOlxuICAgICAgICByZXR1cm47XG4gICAgICBjYXNlIGlyLkRlZmVyVHJpZ2dlcktpbmQuSG92ZXI6XG4gICAgICBjYXNlIGlyLkRlZmVyVHJpZ2dlcktpbmQuSW50ZXJhY3Rpb246XG4gICAgICBjYXNlIGlyLkRlZmVyVHJpZ2dlcktpbmQuVmlld3BvcnQ6XG4gICAgICAgIGlmIChvcC50cmlnZ2VyLnRhcmdldE5hbWUgPT09IG51bGwpIHtcbiAgICAgICAgICAvLyBBIGBudWxsYCB0YXJnZXQgbmFtZSBpbmRpY2F0ZXMgd2Ugc2hvdWxkIGRlZmF1bHQgdG8gdGhlIGZpcnN0IGVsZW1lbnQgaW4gdGhlXG4gICAgICAgICAgLy8gcGxhY2Vob2xkZXIgYmxvY2suXG4gICAgICAgICAgaWYgKHBsYWNlaG9sZGVyVmlldyA9PT0gbnVsbCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdkZWZlciBvbiB0cmlnZ2VyIHdpdGggbm8gdGFyZ2V0IG5hbWUgbXVzdCBoYXZlIGEgcGxhY2Vob2xkZXIgYmxvY2snKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgY29uc3QgcGxhY2Vob2xkZXIgPSBqb2Iudmlld3MuZ2V0KHBsYWNlaG9sZGVyVmlldyk7XG4gICAgICAgICAgaWYgKHBsYWNlaG9sZGVyID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCdBc3NlcnRpb25FcnJvcjogY291bGQgbm90IGZpbmQgcGxhY2Vob2xkZXIgdmlldyBmb3IgZGVmZXIgb24gdHJpZ2dlcicpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBmb3IgKGNvbnN0IHBsYWNlaG9sZGVyT3Agb2YgcGxhY2Vob2xkZXIuY3JlYXRlKSB7XG4gICAgICAgICAgICBpZiAoaXIuaGFzQ29uc3VtZXNTbG90VHJhaXQocGxhY2Vob2xkZXJPcCkgJiZcbiAgICAgICAgICAgICAgICAoaXIuaXNFbGVtZW50T3JDb250YWluZXJPcChwbGFjZWhvbGRlck9wKSB8fFxuICAgICAgICAgICAgICAgICBwbGFjZWhvbGRlck9wLmtpbmQgPT09IGlyLk9wS2luZC5Qcm9qZWN0aW9uKSkge1xuICAgICAgICAgICAgICBvcC50cmlnZ2VyLnRhcmdldFhyZWYgPSBwbGFjZWhvbGRlck9wLnhyZWY7XG4gICAgICAgICAgICAgIG9wLnRyaWdnZXIudGFyZ2V0VmlldyA9IHBsYWNlaG9sZGVyVmlldztcbiAgICAgICAgICAgICAgb3AudHJpZ2dlci50YXJnZXRTbG90Vmlld1N0ZXBzID0gLTE7XG4gICAgICAgICAgICAgIG9wLnRyaWdnZXIudGFyZ2V0U2xvdCA9IHBsYWNlaG9sZGVyT3AuaGFuZGxlO1xuICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuICAgICAgICBsZXQgdmlldzogVmlld0NvbXBpbGF0aW9uVW5pdHxudWxsID1cbiAgICAgICAgICAgIHBsYWNlaG9sZGVyVmlldyAhPT0gbnVsbCA/IGpvYi52aWV3cy5nZXQocGxhY2Vob2xkZXJWaWV3KSEgOiBkZWZlck93bmVyVmlldztcbiAgICAgICAgbGV0IHN0ZXAgPSBwbGFjZWhvbGRlclZpZXcgIT09IG51bGwgPyAtMSA6IDA7XG5cbiAgICAgICAgd2hpbGUgKHZpZXcgIT09IG51bGwpIHtcbiAgICAgICAgICBjb25zdCBzY29wZSA9IGdldFNjb3BlRm9yVmlldyh2aWV3KTtcbiAgICAgICAgICBpZiAoc2NvcGUudGFyZ2V0cy5oYXMob3AudHJpZ2dlci50YXJnZXROYW1lKSkge1xuICAgICAgICAgICAgY29uc3Qge3hyZWYsIHNsb3R9ID0gc2NvcGUudGFyZ2V0cy5nZXQob3AudHJpZ2dlci50YXJnZXROYW1lKSE7XG5cbiAgICAgICAgICAgIG9wLnRyaWdnZXIudGFyZ2V0WHJlZiA9IHhyZWY7XG4gICAgICAgICAgICBvcC50cmlnZ2VyLnRhcmdldFZpZXcgPSB2aWV3LnhyZWY7XG4gICAgICAgICAgICBvcC50cmlnZ2VyLnRhcmdldFNsb3RWaWV3U3RlcHMgPSBzdGVwO1xuICAgICAgICAgICAgb3AudHJpZ2dlci50YXJnZXRTbG90ID0gc2xvdDtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICB2aWV3ID0gdmlldy5wYXJlbnQgIT09IG51bGwgPyBqb2Iudmlld3MuZ2V0KHZpZXcucGFyZW50KSEgOiBudWxsO1xuICAgICAgICAgIHN0ZXArKztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgVHJpZ2dlciBraW5kICR7KG9wLnRyaWdnZXIgYXMgYW55KS5raW5kfSBub3QgaGFuZGxlZGApO1xuICAgIH1cbiAgfVxuXG4gIC8vIEZpbmQgdGhlIGRlZmVyIG9wcywgYW5kIGFzc2lnbiB0aGUgZGF0YSBhYm91dCB0aGVpciB0YXJnZXRzLlxuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgY29uc3QgZGVmZXJzID0gbmV3IE1hcDxpci5YcmVmSWQsIGlyLkRlZmVyT3A+KCk7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgc3dpdGNoIChvcC5raW5kKSB7XG4gICAgICAgIGNhc2UgaXIuT3BLaW5kLkRlZmVyOlxuICAgICAgICAgIGRlZmVycy5zZXQob3AueHJlZiwgb3ApO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5EZWZlck9uOlxuICAgICAgICAgIGNvbnN0IGRlZmVyT3AgPSBkZWZlcnMuZ2V0KG9wLmRlZmVyKSE7XG4gICAgICAgICAgcmVzb2x2ZVRyaWdnZXIodW5pdCwgb3AsIGRlZmVyT3AucGxhY2Vob2xkZXJWaWV3KTtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuY2xhc3MgU2NvcGUge1xuICB0YXJnZXRzID0gbmV3IE1hcDxzdHJpbmcsIHt4cmVmOiBpci5YcmVmSWQsIHNsb3Q6IGlyLlNsb3RIYW5kbGV9PigpO1xufVxuIl19