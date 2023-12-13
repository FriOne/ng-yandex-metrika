/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Assign data slots for all operations which implement `ConsumesSlotOpTrait`, and propagate the
 * assigned data slots of those operations to any expressions which reference them via
 * `UsesSlotIndexTrait`.
 *
 * This phase is also responsible for counting the number of slots used for each view (its `decls`)
 * and propagating that number into the `Template` operations which declare embedded views.
 */
export function allocateSlots(job) {
    // Map of all declarations in all views within the component which require an assigned slot index.
    // This map needs to be global (across all views within the component) since it's possible to
    // reference a slot from one view from an expression within another (e.g. local references work
    // this way).
    const slotMap = new Map();
    // Process all views in the component and assign slot indexes.
    for (const unit of job.units) {
        // Slot indices start at 0 for each view (and are not unique between views).
        let slotCount = 0;
        for (const op of unit.create) {
            // Only consider declarations which consume data slots.
            if (!ir.hasConsumesSlotTrait(op)) {
                continue;
            }
            // Assign slots to this declaration starting at the current `slotCount`.
            op.handle.slot = slotCount;
            // And track its assigned slot in the `slotMap`.
            slotMap.set(op.xref, op.handle.slot);
            // Each declaration may use more than 1 slot, so increment `slotCount` to reserve the number
            // of slots required.
            slotCount += op.numSlotsUsed;
        }
        // Record the total number of slots used on the view itself. This will later be propagated into
        // `ir.TemplateOp`s which declare those views (except for the root view).
        unit.decls = slotCount;
    }
    // After slot assignment, `slotMap` now contains slot assignments for every declaration in the
    // whole template, across all views. Next, look for expressions which implement
    // `UsesSlotIndexExprTrait` and propagate the assigned slot indexes into them.
    // Additionally, this second scan allows us to find `ir.TemplateOp`s which declare views and
    // propagate the number of slots used for each view into the operation which declares it.
    for (const unit of job.units) {
        for (const op of unit.ops()) {
            if (op.kind === ir.OpKind.Template || op.kind === ir.OpKind.RepeaterCreate) {
                // Record the number of slots used by the view this `ir.TemplateOp` declares in the
                // operation itself, so it can be emitted later.
                const childView = job.views.get(op.xref);
                op.decls = childView.decls;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic2xvdF9hbGxvY2F0aW9uLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvc2xvdF9hbGxvY2F0aW9uLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9COzs7Ozs7O0dBT0c7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUFDLEdBQTRCO0lBQ3hELGtHQUFrRztJQUNsRyw2RkFBNkY7SUFDN0YsK0ZBQStGO0lBQy9GLGFBQWE7SUFDYixNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsRUFBcUIsQ0FBQztJQUU3Qyw4REFBOEQ7SUFDOUQsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLDRFQUE0RTtRQUM1RSxJQUFJLFNBQVMsR0FBRyxDQUFDLENBQUM7UUFFbEIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLHVEQUF1RDtZQUN2RCxJQUFJLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUNoQyxTQUFTO2FBQ1Y7WUFFRCx3RUFBd0U7WUFDeEUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEdBQUcsU0FBUyxDQUFDO1lBRTNCLGdEQUFnRDtZQUNoRCxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUVyQyw0RkFBNEY7WUFDNUYscUJBQXFCO1lBQ3JCLFNBQVMsSUFBSSxFQUFFLENBQUMsWUFBWSxDQUFDO1NBQzlCO1FBRUQsK0ZBQStGO1FBQy9GLHlFQUF5RTtRQUN6RSxJQUFJLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQztLQUN4QjtJQUVELDhGQUE4RjtJQUM5RiwrRUFBK0U7SUFDL0UsOEVBQThFO0lBQzlFLDRGQUE0RjtJQUM1Rix5RkFBeUY7SUFDekYsS0FBSyxNQUFNLElBQUksSUFBSSxHQUFHLENBQUMsS0FBSyxFQUFFO1FBQzVCLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLEdBQUcsRUFBRSxFQUFFO1lBQzNCLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLFFBQVEsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFO2dCQUMxRSxtRkFBbUY7Z0JBQ25GLGdEQUFnRDtnQkFDaEQsTUFBTSxTQUFTLEdBQUcsR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBRSxDQUFDO2dCQUMxQyxFQUFFLENBQUMsS0FBSyxHQUFHLFNBQVMsQ0FBQyxLQUFLLENBQUM7YUFDNUI7U0FDRjtLQUNGO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5pbXBvcnQgdHlwZSB7Q29tcG9uZW50Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBBc3NpZ24gZGF0YSBzbG90cyBmb3IgYWxsIG9wZXJhdGlvbnMgd2hpY2ggaW1wbGVtZW50IGBDb25zdW1lc1Nsb3RPcFRyYWl0YCwgYW5kIHByb3BhZ2F0ZSB0aGVcbiAqIGFzc2lnbmVkIGRhdGEgc2xvdHMgb2YgdGhvc2Ugb3BlcmF0aW9ucyB0byBhbnkgZXhwcmVzc2lvbnMgd2hpY2ggcmVmZXJlbmNlIHRoZW0gdmlhXG4gKiBgVXNlc1Nsb3RJbmRleFRyYWl0YC5cbiAqXG4gKiBUaGlzIHBoYXNlIGlzIGFsc28gcmVzcG9uc2libGUgZm9yIGNvdW50aW5nIHRoZSBudW1iZXIgb2Ygc2xvdHMgdXNlZCBmb3IgZWFjaCB2aWV3IChpdHMgYGRlY2xzYClcbiAqIGFuZCBwcm9wYWdhdGluZyB0aGF0IG51bWJlciBpbnRvIHRoZSBgVGVtcGxhdGVgIG9wZXJhdGlvbnMgd2hpY2ggZGVjbGFyZSBlbWJlZGRlZCB2aWV3cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGFsbG9jYXRlU2xvdHMoam9iOiBDb21wb25lbnRDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICAvLyBNYXAgb2YgYWxsIGRlY2xhcmF0aW9ucyBpbiBhbGwgdmlld3Mgd2l0aGluIHRoZSBjb21wb25lbnQgd2hpY2ggcmVxdWlyZSBhbiBhc3NpZ25lZCBzbG90IGluZGV4LlxuICAvLyBUaGlzIG1hcCBuZWVkcyB0byBiZSBnbG9iYWwgKGFjcm9zcyBhbGwgdmlld3Mgd2l0aGluIHRoZSBjb21wb25lbnQpIHNpbmNlIGl0J3MgcG9zc2libGUgdG9cbiAgLy8gcmVmZXJlbmNlIGEgc2xvdCBmcm9tIG9uZSB2aWV3IGZyb20gYW4gZXhwcmVzc2lvbiB3aXRoaW4gYW5vdGhlciAoZS5nLiBsb2NhbCByZWZlcmVuY2VzIHdvcmtcbiAgLy8gdGhpcyB3YXkpLlxuICBjb25zdCBzbG90TWFwID0gbmV3IE1hcDxpci5YcmVmSWQsIG51bWJlcj4oKTtcblxuICAvLyBQcm9jZXNzIGFsbCB2aWV3cyBpbiB0aGUgY29tcG9uZW50IGFuZCBhc3NpZ24gc2xvdCBpbmRleGVzLlxuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgLy8gU2xvdCBpbmRpY2VzIHN0YXJ0IGF0IDAgZm9yIGVhY2ggdmlldyAoYW5kIGFyZSBub3QgdW5pcXVlIGJldHdlZW4gdmlld3MpLlxuICAgIGxldCBzbG90Q291bnQgPSAwO1xuXG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgLy8gT25seSBjb25zaWRlciBkZWNsYXJhdGlvbnMgd2hpY2ggY29uc3VtZSBkYXRhIHNsb3RzLlxuICAgICAgaWYgKCFpci5oYXNDb25zdW1lc1Nsb3RUcmFpdChvcCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIEFzc2lnbiBzbG90cyB0byB0aGlzIGRlY2xhcmF0aW9uIHN0YXJ0aW5nIGF0IHRoZSBjdXJyZW50IGBzbG90Q291bnRgLlxuICAgICAgb3AuaGFuZGxlLnNsb3QgPSBzbG90Q291bnQ7XG5cbiAgICAgIC8vIEFuZCB0cmFjayBpdHMgYXNzaWduZWQgc2xvdCBpbiB0aGUgYHNsb3RNYXBgLlxuICAgICAgc2xvdE1hcC5zZXQob3AueHJlZiwgb3AuaGFuZGxlLnNsb3QpO1xuXG4gICAgICAvLyBFYWNoIGRlY2xhcmF0aW9uIG1heSB1c2UgbW9yZSB0aGFuIDEgc2xvdCwgc28gaW5jcmVtZW50IGBzbG90Q291bnRgIHRvIHJlc2VydmUgdGhlIG51bWJlclxuICAgICAgLy8gb2Ygc2xvdHMgcmVxdWlyZWQuXG4gICAgICBzbG90Q291bnQgKz0gb3AubnVtU2xvdHNVc2VkO1xuICAgIH1cblxuICAgIC8vIFJlY29yZCB0aGUgdG90YWwgbnVtYmVyIG9mIHNsb3RzIHVzZWQgb24gdGhlIHZpZXcgaXRzZWxmLiBUaGlzIHdpbGwgbGF0ZXIgYmUgcHJvcGFnYXRlZCBpbnRvXG4gICAgLy8gYGlyLlRlbXBsYXRlT3BgcyB3aGljaCBkZWNsYXJlIHRob3NlIHZpZXdzIChleGNlcHQgZm9yIHRoZSByb290IHZpZXcpLlxuICAgIHVuaXQuZGVjbHMgPSBzbG90Q291bnQ7XG4gIH1cblxuICAvLyBBZnRlciBzbG90IGFzc2lnbm1lbnQsIGBzbG90TWFwYCBub3cgY29udGFpbnMgc2xvdCBhc3NpZ25tZW50cyBmb3IgZXZlcnkgZGVjbGFyYXRpb24gaW4gdGhlXG4gIC8vIHdob2xlIHRlbXBsYXRlLCBhY3Jvc3MgYWxsIHZpZXdzLiBOZXh0LCBsb29rIGZvciBleHByZXNzaW9ucyB3aGljaCBpbXBsZW1lbnRcbiAgLy8gYFVzZXNTbG90SW5kZXhFeHByVHJhaXRgIGFuZCBwcm9wYWdhdGUgdGhlIGFzc2lnbmVkIHNsb3QgaW5kZXhlcyBpbnRvIHRoZW0uXG4gIC8vIEFkZGl0aW9uYWxseSwgdGhpcyBzZWNvbmQgc2NhbiBhbGxvd3MgdXMgdG8gZmluZCBgaXIuVGVtcGxhdGVPcGBzIHdoaWNoIGRlY2xhcmUgdmlld3MgYW5kXG4gIC8vIHByb3BhZ2F0ZSB0aGUgbnVtYmVyIG9mIHNsb3RzIHVzZWQgZm9yIGVhY2ggdmlldyBpbnRvIHRoZSBvcGVyYXRpb24gd2hpY2ggZGVjbGFyZXMgaXQuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQub3BzKCkpIHtcbiAgICAgIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuVGVtcGxhdGUgfHwgb3Aua2luZCA9PT0gaXIuT3BLaW5kLlJlcGVhdGVyQ3JlYXRlKSB7XG4gICAgICAgIC8vIFJlY29yZCB0aGUgbnVtYmVyIG9mIHNsb3RzIHVzZWQgYnkgdGhlIHZpZXcgdGhpcyBgaXIuVGVtcGxhdGVPcGAgZGVjbGFyZXMgaW4gdGhlXG4gICAgICAgIC8vIG9wZXJhdGlvbiBpdHNlbGYsIHNvIGl0IGNhbiBiZSBlbWl0dGVkIGxhdGVyLlxuICAgICAgICBjb25zdCBjaGlsZFZpZXcgPSBqb2Iudmlld3MuZ2V0KG9wLnhyZWYpITtcbiAgICAgICAgb3AuZGVjbHMgPSBjaGlsZFZpZXcuZGVjbHM7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=