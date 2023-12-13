/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * This phase generates pipe creation instructions. We do this based on the pipe bindings found in
 * the update block, in the order we see them.
 *
 * When not in compatibility mode, we can simply group all these creation instructions together, to
 * maximize chaining opportunities.
 */
export function createPipes(job) {
    for (const unit of job.units) {
        processPipeBindingsInView(unit);
    }
}
function processPipeBindingsInView(unit) {
    for (const updateOp of unit.update) {
        ir.visitExpressionsInOp(updateOp, (expr, flags) => {
            if (!ir.isIrExpression(expr)) {
                return;
            }
            if (expr.kind !== ir.ExpressionKind.PipeBinding) {
                return;
            }
            if (flags & ir.VisitorContextFlag.InChildOperation) {
                throw new Error(`AssertionError: pipe bindings should not appear in child expressions`);
            }
            if (unit.job.compatibility) {
                // TODO: We can delete this cast and check once compatibility mode is removed.
                const slotHandle = updateOp.target;
                if (slotHandle == undefined) {
                    throw new Error(`AssertionError: expected slot handle to be assigned for pipe creation`);
                }
                addPipeToCreationBlock(unit, updateOp.target, expr);
            }
            else {
                // When not in compatibility mode, we just add the pipe to the end of the create block. This
                // is not only simpler and faster, but allows more chaining opportunities for other
                // instructions.
                unit.create.push(ir.createPipeOp(expr.target, expr.targetSlot, expr.name));
            }
        });
    }
}
function addPipeToCreationBlock(unit, afterTargetXref, binding) {
    // Find the appropriate point to insert the Pipe creation operation.
    // We're looking for `afterTargetXref` (and also want to insert after any other pipe operations
    // which might be beyond it).
    for (let op = unit.create.head.next; op.kind !== ir.OpKind.ListEnd; op = op.next) {
        if (!ir.hasConsumesSlotTrait(op)) {
            continue;
        }
        if (op.xref !== afterTargetXref) {
            continue;
        }
        // We've found a tentative insertion point; however, we also want to skip past any _other_ pipe
        // operations present.
        while (op.next.kind === ir.OpKind.Pipe) {
            op = op.next;
        }
        const pipe = ir.createPipeOp(binding.target, binding.targetSlot, binding.name);
        ir.OpList.insertBefore(pipe, op.next);
        // This completes adding the pipe to the creation block.
        return;
    }
    // At this point, we've failed to add the pipe to the creation block.
    throw new Error(`AssertionError: unable to find insertion point for pipe ${binding.name}`);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGlwZV9jcmVhdGlvbi5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL3BpcGVfY3JlYXRpb24udHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFHL0I7Ozs7OztHQU1HO0FBQ0gsTUFBTSxVQUFVLFdBQVcsQ0FBQyxHQUFtQjtJQUM3QyxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIseUJBQXlCLENBQUMsSUFBSSxDQUFDLENBQUM7S0FDakM7QUFDSCxDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FBQyxJQUFxQjtJQUN0RCxLQUFLLE1BQU0sUUFBUSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7UUFDbEMsRUFBRSxDQUFDLG9CQUFvQixDQUFDLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUUsRUFBRTtZQUNoRCxJQUFJLENBQUMsRUFBRSxDQUFDLGNBQWMsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDNUIsT0FBTzthQUNSO1lBRUQsSUFBSSxJQUFJLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxjQUFjLENBQUMsV0FBVyxFQUFFO2dCQUMvQyxPQUFPO2FBQ1I7WUFFRCxJQUFJLEtBQUssR0FBRyxFQUFFLENBQUMsa0JBQWtCLENBQUMsZ0JBQWdCLEVBQUU7Z0JBQ2xELE1BQU0sSUFBSSxLQUFLLENBQUMsc0VBQXNFLENBQUMsQ0FBQzthQUN6RjtZQUVELElBQUksSUFBSSxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUU7Z0JBQzFCLDhFQUE4RTtnQkFDOUUsTUFBTSxVQUFVLEdBQUksUUFBZ0IsQ0FBQyxNQUFNLENBQUM7Z0JBQzVDLElBQUksVUFBVSxJQUFJLFNBQVMsRUFBRTtvQkFDM0IsTUFBTSxJQUFJLEtBQUssQ0FBQyx1RUFBdUUsQ0FBQyxDQUFDO2lCQUMxRjtnQkFDRCxzQkFBc0IsQ0FBQyxJQUFJLEVBQUcsUUFBZ0IsQ0FBQyxNQUFNLEVBQUUsSUFBSSxDQUFDLENBQUM7YUFDOUQ7aUJBQU07Z0JBQ0wsNEZBQTRGO2dCQUM1RixtRkFBbUY7Z0JBQ25GLGdCQUFnQjtnQkFDaEIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsTUFBTSxFQUFFLElBQUksQ0FBQyxVQUFVLEVBQUUsSUFBSSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDNUU7UUFDSCxDQUFDLENBQUMsQ0FBQztLQUNKO0FBQ0gsQ0FBQztBQUVELFNBQVMsc0JBQXNCLENBQzNCLElBQXFCLEVBQUUsZUFBMEIsRUFBRSxPQUEyQjtJQUNoRixvRUFBb0U7SUFDcEUsK0ZBQStGO0lBQy9GLDZCQUE2QjtJQUM3QixLQUFLLElBQUksRUFBRSxHQUFHLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLElBQUssRUFBRSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxFQUFFLEVBQUUsR0FBRyxFQUFFLENBQUMsSUFBSyxFQUFFO1FBQ2xGLElBQUksQ0FBQyxFQUFFLENBQUMsb0JBQW9CLENBQWMsRUFBRSxDQUFDLEVBQUU7WUFDN0MsU0FBUztTQUNWO1FBRUQsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLGVBQWUsRUFBRTtZQUMvQixTQUFTO1NBQ1Y7UUFFRCwrRkFBK0Y7UUFDL0Ysc0JBQXNCO1FBQ3RCLE9BQU8sRUFBRSxDQUFDLElBQUssQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUU7WUFDdkMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxJQUFLLENBQUM7U0FDZjtRQUVELE1BQU0sSUFBSSxHQUFHLEVBQUUsQ0FBQyxZQUFZLENBQUMsT0FBTyxDQUFDLE1BQU0sRUFBRSxPQUFPLENBQUMsVUFBVSxFQUFFLE9BQU8sQ0FBQyxJQUFJLENBQWdCLENBQUM7UUFDOUYsRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFLLENBQUMsQ0FBQztRQUV2Qyx3REFBd0Q7UUFDeEQsT0FBTztLQUNSO0lBRUQscUVBQXFFO0lBQ3JFLE1BQU0sSUFBSSxLQUFLLENBQUMsMkRBQTJELE9BQU8sQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQzdGLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHR5cGUge0NvbXBpbGF0aW9uSm9iLCBDb21waWxhdGlvblVuaXR9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBUaGlzIHBoYXNlIGdlbmVyYXRlcyBwaXBlIGNyZWF0aW9uIGluc3RydWN0aW9ucy4gV2UgZG8gdGhpcyBiYXNlZCBvbiB0aGUgcGlwZSBiaW5kaW5ncyBmb3VuZCBpblxuICogdGhlIHVwZGF0ZSBibG9jaywgaW4gdGhlIG9yZGVyIHdlIHNlZSB0aGVtLlxuICpcbiAqIFdoZW4gbm90IGluIGNvbXBhdGliaWxpdHkgbW9kZSwgd2UgY2FuIHNpbXBseSBncm91cCBhbGwgdGhlc2UgY3JlYXRpb24gaW5zdHJ1Y3Rpb25zIHRvZ2V0aGVyLCB0b1xuICogbWF4aW1pemUgY2hhaW5pbmcgb3Bwb3J0dW5pdGllcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVBpcGVzKGpvYjogQ29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIHByb2Nlc3NQaXBlQmluZGluZ3NJblZpZXcodW5pdCk7XG4gIH1cbn1cblxuZnVuY3Rpb24gcHJvY2Vzc1BpcGVCaW5kaW5nc0luVmlldyh1bml0OiBDb21waWxhdGlvblVuaXQpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1cGRhdGVPcCBvZiB1bml0LnVwZGF0ZSkge1xuICAgIGlyLnZpc2l0RXhwcmVzc2lvbnNJbk9wKHVwZGF0ZU9wLCAoZXhwciwgZmxhZ3MpID0+IHtcbiAgICAgIGlmICghaXIuaXNJckV4cHJlc3Npb24oZXhwcikpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuXG4gICAgICBpZiAoZXhwci5raW5kICE9PSBpci5FeHByZXNzaW9uS2luZC5QaXBlQmluZGluZykge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG5cbiAgICAgIGlmIChmbGFncyAmIGlyLlZpc2l0b3JDb250ZXh0RmxhZy5JbkNoaWxkT3BlcmF0aW9uKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihgQXNzZXJ0aW9uRXJyb3I6IHBpcGUgYmluZGluZ3Mgc2hvdWxkIG5vdCBhcHBlYXIgaW4gY2hpbGQgZXhwcmVzc2lvbnNgKTtcbiAgICAgIH1cblxuICAgICAgaWYgKHVuaXQuam9iLmNvbXBhdGliaWxpdHkpIHtcbiAgICAgICAgLy8gVE9ETzogV2UgY2FuIGRlbGV0ZSB0aGlzIGNhc3QgYW5kIGNoZWNrIG9uY2UgY29tcGF0aWJpbGl0eSBtb2RlIGlzIHJlbW92ZWQuXG4gICAgICAgIGNvbnN0IHNsb3RIYW5kbGUgPSAodXBkYXRlT3AgYXMgYW55KS50YXJnZXQ7XG4gICAgICAgIGlmIChzbG90SGFuZGxlID09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBFcnJvcihgQXNzZXJ0aW9uRXJyb3I6IGV4cGVjdGVkIHNsb3QgaGFuZGxlIHRvIGJlIGFzc2lnbmVkIGZvciBwaXBlIGNyZWF0aW9uYCk7XG4gICAgICAgIH1cbiAgICAgICAgYWRkUGlwZVRvQ3JlYXRpb25CbG9jayh1bml0LCAodXBkYXRlT3AgYXMgYW55KS50YXJnZXQsIGV4cHIpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgLy8gV2hlbiBub3QgaW4gY29tcGF0aWJpbGl0eSBtb2RlLCB3ZSBqdXN0IGFkZCB0aGUgcGlwZSB0byB0aGUgZW5kIG9mIHRoZSBjcmVhdGUgYmxvY2suIFRoaXNcbiAgICAgICAgLy8gaXMgbm90IG9ubHkgc2ltcGxlciBhbmQgZmFzdGVyLCBidXQgYWxsb3dzIG1vcmUgY2hhaW5pbmcgb3Bwb3J0dW5pdGllcyBmb3Igb3RoZXJcbiAgICAgICAgLy8gaW5zdHJ1Y3Rpb25zLlxuICAgICAgICB1bml0LmNyZWF0ZS5wdXNoKGlyLmNyZWF0ZVBpcGVPcChleHByLnRhcmdldCwgZXhwci50YXJnZXRTbG90LCBleHByLm5hbWUpKTtcbiAgICAgIH1cbiAgICB9KTtcbiAgfVxufVxuXG5mdW5jdGlvbiBhZGRQaXBlVG9DcmVhdGlvbkJsb2NrKFxuICAgIHVuaXQ6IENvbXBpbGF0aW9uVW5pdCwgYWZ0ZXJUYXJnZXRYcmVmOiBpci5YcmVmSWQsIGJpbmRpbmc6IGlyLlBpcGVCaW5kaW5nRXhwcik6IHZvaWQge1xuICAvLyBGaW5kIHRoZSBhcHByb3ByaWF0ZSBwb2ludCB0byBpbnNlcnQgdGhlIFBpcGUgY3JlYXRpb24gb3BlcmF0aW9uLlxuICAvLyBXZSdyZSBsb29raW5nIGZvciBgYWZ0ZXJUYXJnZXRYcmVmYCAoYW5kIGFsc28gd2FudCB0byBpbnNlcnQgYWZ0ZXIgYW55IG90aGVyIHBpcGUgb3BlcmF0aW9uc1xuICAvLyB3aGljaCBtaWdodCBiZSBiZXlvbmQgaXQpLlxuICBmb3IgKGxldCBvcCA9IHVuaXQuY3JlYXRlLmhlYWQubmV4dCE7IG9wLmtpbmQgIT09IGlyLk9wS2luZC5MaXN0RW5kOyBvcCA9IG9wLm5leHQhKSB7XG4gICAgaWYgKCFpci5oYXNDb25zdW1lc1Nsb3RUcmFpdDxpci5DcmVhdGVPcD4ob3ApKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICBpZiAob3AueHJlZiAhPT0gYWZ0ZXJUYXJnZXRYcmVmKSB7XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyBXZSd2ZSBmb3VuZCBhIHRlbnRhdGl2ZSBpbnNlcnRpb24gcG9pbnQ7IGhvd2V2ZXIsIHdlIGFsc28gd2FudCB0byBza2lwIHBhc3QgYW55IF9vdGhlcl8gcGlwZVxuICAgIC8vIG9wZXJhdGlvbnMgcHJlc2VudC5cbiAgICB3aGlsZSAob3AubmV4dCEua2luZCA9PT0gaXIuT3BLaW5kLlBpcGUpIHtcbiAgICAgIG9wID0gb3AubmV4dCE7XG4gICAgfVxuXG4gICAgY29uc3QgcGlwZSA9IGlyLmNyZWF0ZVBpcGVPcChiaW5kaW5nLnRhcmdldCwgYmluZGluZy50YXJnZXRTbG90LCBiaW5kaW5nLm5hbWUpIGFzIGlyLkNyZWF0ZU9wO1xuICAgIGlyLk9wTGlzdC5pbnNlcnRCZWZvcmUocGlwZSwgb3AubmV4dCEpO1xuXG4gICAgLy8gVGhpcyBjb21wbGV0ZXMgYWRkaW5nIHRoZSBwaXBlIHRvIHRoZSBjcmVhdGlvbiBibG9jay5cbiAgICByZXR1cm47XG4gIH1cblxuICAvLyBBdCB0aGlzIHBvaW50LCB3ZSd2ZSBmYWlsZWQgdG8gYWRkIHRoZSBwaXBlIHRvIHRoZSBjcmVhdGlvbiBibG9jay5cbiAgdGhyb3cgbmV3IEVycm9yKGBBc3NlcnRpb25FcnJvcjogdW5hYmxlIHRvIGZpbmQgaW5zZXJ0aW9uIHBvaW50IGZvciBwaXBlICR7YmluZGluZy5uYW1lfWApO1xufVxuIl19