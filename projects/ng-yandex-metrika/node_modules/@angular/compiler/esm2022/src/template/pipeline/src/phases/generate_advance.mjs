/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Generate `ir.AdvanceOp`s in between `ir.UpdateOp`s that ensure the runtime's implicit slot
 * context will be advanced correctly.
 */
export function generateAdvance(job) {
    for (const unit of job.units) {
        // First build a map of all of the declarations in the view that have assigned slots.
        const slotMap = new Map();
        for (const op of unit.create) {
            if (!ir.hasConsumesSlotTrait(op)) {
                continue;
            }
            else if (op.handle.slot === null) {
                throw new Error(`AssertionError: expected slots to have been allocated before generating advance() calls`);
            }
            slotMap.set(op.xref, op.handle.slot);
        }
        // Next, step through the update operations and generate `ir.AdvanceOp`s as required to ensure
        // the runtime's implicit slot counter will be set to the correct slot before executing each
        // update operation which depends on it.
        //
        // To do that, we track what the runtime's slot counter will be through the update operations.
        let slotContext = 0;
        for (const op of unit.update) {
            if (!ir.hasDependsOnSlotContextTrait(op)) {
                // `op` doesn't depend on the slot counter, so it can be skipped.
                continue;
            }
            else if (!slotMap.has(op.target)) {
                // We expect ops that _do_ depend on the slot counter to point at declarations that exist in
                // the `slotMap`.
                throw new Error(`AssertionError: reference to unknown slot for target ${op.target}`);
            }
            const slot = slotMap.get(op.target);
            // Does the slot counter need to be adjusted?
            if (slotContext !== slot) {
                // If so, generate an `ir.AdvanceOp` to advance the counter.
                const delta = slot - slotContext;
                if (delta < 0) {
                    throw new Error(`AssertionError: slot counter should never need to move backwards`);
                }
                ir.OpList.insertBefore(ir.createAdvanceOp(delta, op.sourceSpan), op);
                slotContext = slot;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGVfYWR2YW5jZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL2dlbmVyYXRlX2FkdmFuY2UudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHL0I7OztHQUdHO0FBQ0gsTUFBTSxVQUFVLGVBQWUsQ0FBQyxHQUFtQjtJQUNqRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIscUZBQXFGO1FBQ3JGLE1BQU0sT0FBTyxHQUFHLElBQUksR0FBRyxFQUFxQixDQUFDO1FBQzdDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixJQUFJLENBQUMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLEVBQUUsQ0FBQyxFQUFFO2dCQUNoQyxTQUFTO2FBQ1Y7aUJBQU0sSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksS0FBSyxJQUFJLEVBQUU7Z0JBQ2xDLE1BQU0sSUFBSSxLQUFLLENBQ1gseUZBQXlGLENBQUMsQ0FBQzthQUNoRztZQUVELE9BQU8sQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO1NBQ3RDO1FBRUQsOEZBQThGO1FBQzlGLDRGQUE0RjtRQUM1Rix3Q0FBd0M7UUFDeEMsRUFBRTtRQUNGLDhGQUE4RjtRQUM5RixJQUFJLFdBQVcsR0FBRyxDQUFDLENBQUM7UUFDcEIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLElBQUksQ0FBQyxFQUFFLENBQUMsNEJBQTRCLENBQUMsRUFBRSxDQUFDLEVBQUU7Z0JBQ3hDLGlFQUFpRTtnQkFDakUsU0FBUzthQUNWO2lCQUFNLElBQUksQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsRUFBRTtnQkFDbEMsNEZBQTRGO2dCQUM1RixpQkFBaUI7Z0JBQ2pCLE1BQU0sSUFBSSxLQUFLLENBQUMsd0RBQXdELEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO2FBQ3RGO1lBRUQsTUFBTSxJQUFJLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFFLENBQUM7WUFFckMsNkNBQTZDO1lBQzdDLElBQUksV0FBVyxLQUFLLElBQUksRUFBRTtnQkFDeEIsNERBQTREO2dCQUM1RCxNQUFNLEtBQUssR0FBRyxJQUFJLEdBQUcsV0FBVyxDQUFDO2dCQUNqQyxJQUFJLEtBQUssR0FBRyxDQUFDLEVBQUU7b0JBQ2IsTUFBTSxJQUFJLEtBQUssQ0FBQyxrRUFBa0UsQ0FBQyxDQUFDO2lCQUNyRjtnQkFFRCxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FDbEIsRUFBRSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUcsRUFBcUMsQ0FBQyxVQUFVLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQztnQkFDdEYsV0FBVyxHQUFHLElBQUksQ0FBQzthQUNwQjtTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIEdlbmVyYXRlIGBpci5BZHZhbmNlT3BgcyBpbiBiZXR3ZWVuIGBpci5VcGRhdGVPcGBzIHRoYXQgZW5zdXJlIHRoZSBydW50aW1lJ3MgaW1wbGljaXQgc2xvdFxuICogY29udGV4dCB3aWxsIGJlIGFkdmFuY2VkIGNvcnJlY3RseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlQWR2YW5jZShqb2I6IENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICAvLyBGaXJzdCBidWlsZCBhIG1hcCBvZiBhbGwgb2YgdGhlIGRlY2xhcmF0aW9ucyBpbiB0aGUgdmlldyB0aGF0IGhhdmUgYXNzaWduZWQgc2xvdHMuXG4gICAgY29uc3Qgc2xvdE1hcCA9IG5ldyBNYXA8aXIuWHJlZklkLCBudW1iZXI+KCk7XG4gICAgZm9yIChjb25zdCBvcCBvZiB1bml0LmNyZWF0ZSkge1xuICAgICAgaWYgKCFpci5oYXNDb25zdW1lc1Nsb3RUcmFpdChvcCkpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2UgaWYgKG9wLmhhbmRsZS5zbG90ID09PSBudWxsKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICAgIGBBc3NlcnRpb25FcnJvcjogZXhwZWN0ZWQgc2xvdHMgdG8gaGF2ZSBiZWVuIGFsbG9jYXRlZCBiZWZvcmUgZ2VuZXJhdGluZyBhZHZhbmNlKCkgY2FsbHNgKTtcbiAgICAgIH1cblxuICAgICAgc2xvdE1hcC5zZXQob3AueHJlZiwgb3AuaGFuZGxlLnNsb3QpO1xuICAgIH1cblxuICAgIC8vIE5leHQsIHN0ZXAgdGhyb3VnaCB0aGUgdXBkYXRlIG9wZXJhdGlvbnMgYW5kIGdlbmVyYXRlIGBpci5BZHZhbmNlT3BgcyBhcyByZXF1aXJlZCB0byBlbnN1cmVcbiAgICAvLyB0aGUgcnVudGltZSdzIGltcGxpY2l0IHNsb3QgY291bnRlciB3aWxsIGJlIHNldCB0byB0aGUgY29ycmVjdCBzbG90IGJlZm9yZSBleGVjdXRpbmcgZWFjaFxuICAgIC8vIHVwZGF0ZSBvcGVyYXRpb24gd2hpY2ggZGVwZW5kcyBvbiBpdC5cbiAgICAvL1xuICAgIC8vIFRvIGRvIHRoYXQsIHdlIHRyYWNrIHdoYXQgdGhlIHJ1bnRpbWUncyBzbG90IGNvdW50ZXIgd2lsbCBiZSB0aHJvdWdoIHRoZSB1cGRhdGUgb3BlcmF0aW9ucy5cbiAgICBsZXQgc2xvdENvbnRleHQgPSAwO1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC51cGRhdGUpIHtcbiAgICAgIGlmICghaXIuaGFzRGVwZW5kc09uU2xvdENvbnRleHRUcmFpdChvcCkpIHtcbiAgICAgICAgLy8gYG9wYCBkb2Vzbid0IGRlcGVuZCBvbiB0aGUgc2xvdCBjb3VudGVyLCBzbyBpdCBjYW4gYmUgc2tpcHBlZC5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9IGVsc2UgaWYgKCFzbG90TWFwLmhhcyhvcC50YXJnZXQpKSB7XG4gICAgICAgIC8vIFdlIGV4cGVjdCBvcHMgdGhhdCBfZG9fIGRlcGVuZCBvbiB0aGUgc2xvdCBjb3VudGVyIHRvIHBvaW50IGF0IGRlY2xhcmF0aW9ucyB0aGF0IGV4aXN0IGluXG4gICAgICAgIC8vIHRoZSBgc2xvdE1hcGAuXG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQXNzZXJ0aW9uRXJyb3I6IHJlZmVyZW5jZSB0byB1bmtub3duIHNsb3QgZm9yIHRhcmdldCAke29wLnRhcmdldH1gKTtcbiAgICAgIH1cblxuICAgICAgY29uc3Qgc2xvdCA9IHNsb3RNYXAuZ2V0KG9wLnRhcmdldCkhO1xuXG4gICAgICAvLyBEb2VzIHRoZSBzbG90IGNvdW50ZXIgbmVlZCB0byBiZSBhZGp1c3RlZD9cbiAgICAgIGlmIChzbG90Q29udGV4dCAhPT0gc2xvdCkge1xuICAgICAgICAvLyBJZiBzbywgZ2VuZXJhdGUgYW4gYGlyLkFkdmFuY2VPcGAgdG8gYWR2YW5jZSB0aGUgY291bnRlci5cbiAgICAgICAgY29uc3QgZGVsdGEgPSBzbG90IC0gc2xvdENvbnRleHQ7XG4gICAgICAgIGlmIChkZWx0YSA8IDApIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoYEFzc2VydGlvbkVycm9yOiBzbG90IGNvdW50ZXIgc2hvdWxkIG5ldmVyIG5lZWQgdG8gbW92ZSBiYWNrd2FyZHNgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlyLk9wTGlzdC5pbnNlcnRCZWZvcmU8aXIuVXBkYXRlT3A+KFxuICAgICAgICAgICAgaXIuY3JlYXRlQWR2YW5jZU9wKGRlbHRhLCAob3AgYXMgaXIuRGVwZW5kc09uU2xvdENvbnRleHRPcFRyYWl0KS5zb3VyY2VTcGFuKSwgb3ApO1xuICAgICAgICBzbG90Q29udGV4dCA9IHNsb3Q7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=