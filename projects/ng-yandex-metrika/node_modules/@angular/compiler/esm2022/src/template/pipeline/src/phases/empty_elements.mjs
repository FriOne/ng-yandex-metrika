/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
const REPLACEMENTS = new Map([
    [ir.OpKind.ElementEnd, [ir.OpKind.ElementStart, ir.OpKind.Element]],
    [ir.OpKind.ContainerEnd, [ir.OpKind.ContainerStart, ir.OpKind.Container]],
    [ir.OpKind.I18nEnd, [ir.OpKind.I18nStart, ir.OpKind.I18n]],
]);
/**
 * Op kinds that should not prevent merging of start/end ops.
 */
const IGNORED_OP_KINDS = new Set([ir.OpKind.Pipe]);
/**
 * Replace sequences of mergable instructions (e.g. `ElementStart` and `ElementEnd`) with a
 * consolidated instruction (e.g. `Element`).
 */
export function collapseEmptyInstructions(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            // Find end ops that may be able to be merged.
            const opReplacements = REPLACEMENTS.get(op.kind);
            if (opReplacements === undefined) {
                continue;
            }
            const [startKind, mergedKind] = opReplacements;
            // Locate the previous (non-ignored) op.
            let prevOp = op.prev;
            while (prevOp !== null && IGNORED_OP_KINDS.has(prevOp.kind)) {
                prevOp = prevOp.prev;
            }
            // If the previous op is the corresponding start op, we can megre.
            if (prevOp !== null && prevOp.kind === startKind) {
                // Transmute the start instruction to the merged version. This is safe as they're designed
                // to be identical apart from the `kind`.
                prevOp.kind = mergedKind;
                // Remove the end instruction.
                ir.OpList.remove(op);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZW1wdHlfZWxlbWVudHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9lbXB0eV9lbGVtZW50cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQixNQUFNLFlBQVksR0FBRyxJQUFJLEdBQUcsQ0FBb0M7SUFDOUQsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUM7SUFDbkUsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxDQUFDLENBQUM7SUFDekUsQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLE9BQU8sRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxFQUFFLEVBQUUsQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUM7Q0FDM0QsQ0FBQyxDQUFDO0FBRUg7O0dBRUc7QUFDSCxNQUFNLGdCQUFnQixHQUFHLElBQUksR0FBRyxDQUFDLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO0FBRW5EOzs7R0FHRztBQUNILE1BQU0sVUFBVSx5QkFBeUIsQ0FBQyxHQUFtQjtJQUMzRCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLDhDQUE4QztZQUM5QyxNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQztZQUNqRCxJQUFJLGNBQWMsS0FBSyxTQUFTLEVBQUU7Z0JBQ2hDLFNBQVM7YUFDVjtZQUNELE1BQU0sQ0FBQyxTQUFTLEVBQUUsVUFBVSxDQUFDLEdBQUcsY0FBYyxDQUFDO1lBRS9DLHdDQUF3QztZQUN4QyxJQUFJLE1BQU0sR0FBcUIsRUFBRSxDQUFDLElBQUksQ0FBQztZQUN2QyxPQUFPLE1BQU0sS0FBSyxJQUFJLElBQUksZ0JBQWdCLENBQUMsR0FBRyxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDM0QsTUFBTSxHQUFHLE1BQU0sQ0FBQyxJQUFJLENBQUM7YUFDdEI7WUFFRCxrRUFBa0U7WUFDbEUsSUFBSSxNQUFNLEtBQUssSUFBSSxJQUFJLE1BQU0sQ0FBQyxJQUFJLEtBQUssU0FBUyxFQUFFO2dCQUNoRCwwRkFBMEY7Z0JBQzFGLHlDQUF5QztnQkFDeEMsTUFBNkIsQ0FBQyxJQUFJLEdBQUcsVUFBVSxDQUFDO2dCQUVqRCw4QkFBOEI7Z0JBQzlCLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFjLEVBQUUsQ0FBQyxDQUFDO2FBQ25DO1NBQ0Y7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHR5cGUge0NvbXBpbGF0aW9uSm9ifSBmcm9tICcuLi9jb21waWxhdGlvbic7XG5cbmNvbnN0IFJFUExBQ0VNRU5UUyA9IG5ldyBNYXA8aXIuT3BLaW5kLCBbaXIuT3BLaW5kLCBpci5PcEtpbmRdPihbXG4gIFtpci5PcEtpbmQuRWxlbWVudEVuZCwgW2lyLk9wS2luZC5FbGVtZW50U3RhcnQsIGlyLk9wS2luZC5FbGVtZW50XV0sXG4gIFtpci5PcEtpbmQuQ29udGFpbmVyRW5kLCBbaXIuT3BLaW5kLkNvbnRhaW5lclN0YXJ0LCBpci5PcEtpbmQuQ29udGFpbmVyXV0sXG4gIFtpci5PcEtpbmQuSTE4bkVuZCwgW2lyLk9wS2luZC5JMThuU3RhcnQsIGlyLk9wS2luZC5JMThuXV0sXG5dKTtcblxuLyoqXG4gKiBPcCBraW5kcyB0aGF0IHNob3VsZCBub3QgcHJldmVudCBtZXJnaW5nIG9mIHN0YXJ0L2VuZCBvcHMuXG4gKi9cbmNvbnN0IElHTk9SRURfT1BfS0lORFMgPSBuZXcgU2V0KFtpci5PcEtpbmQuUGlwZV0pO1xuXG4vKipcbiAqIFJlcGxhY2Ugc2VxdWVuY2VzIG9mIG1lcmdhYmxlIGluc3RydWN0aW9ucyAoZS5nLiBgRWxlbWVudFN0YXJ0YCBhbmQgYEVsZW1lbnRFbmRgKSB3aXRoIGFcbiAqIGNvbnNvbGlkYXRlZCBpbnN0cnVjdGlvbiAoZS5nLiBgRWxlbWVudGApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29sbGFwc2VFbXB0eUluc3RydWN0aW9ucyhqb2I6IENvbXBpbGF0aW9uSm9iKTogdm9pZCB7XG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICAvLyBGaW5kIGVuZCBvcHMgdGhhdCBtYXkgYmUgYWJsZSB0byBiZSBtZXJnZWQuXG4gICAgICBjb25zdCBvcFJlcGxhY2VtZW50cyA9IFJFUExBQ0VNRU5UUy5nZXQob3Aua2luZCk7XG4gICAgICBpZiAob3BSZXBsYWNlbWVudHMgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IFtzdGFydEtpbmQsIG1lcmdlZEtpbmRdID0gb3BSZXBsYWNlbWVudHM7XG5cbiAgICAgIC8vIExvY2F0ZSB0aGUgcHJldmlvdXMgKG5vbi1pZ25vcmVkKSBvcC5cbiAgICAgIGxldCBwcmV2T3A6IGlyLkNyZWF0ZU9wfG51bGwgPSBvcC5wcmV2O1xuICAgICAgd2hpbGUgKHByZXZPcCAhPT0gbnVsbCAmJiBJR05PUkVEX09QX0tJTkRTLmhhcyhwcmV2T3Aua2luZCkpIHtcbiAgICAgICAgcHJldk9wID0gcHJldk9wLnByZXY7XG4gICAgICB9XG5cbiAgICAgIC8vIElmIHRoZSBwcmV2aW91cyBvcCBpcyB0aGUgY29ycmVzcG9uZGluZyBzdGFydCBvcCwgd2UgY2FuIG1lZ3JlLlxuICAgICAgaWYgKHByZXZPcCAhPT0gbnVsbCAmJiBwcmV2T3Aua2luZCA9PT0gc3RhcnRLaW5kKSB7XG4gICAgICAgIC8vIFRyYW5zbXV0ZSB0aGUgc3RhcnQgaW5zdHJ1Y3Rpb24gdG8gdGhlIG1lcmdlZCB2ZXJzaW9uLiBUaGlzIGlzIHNhZmUgYXMgdGhleSdyZSBkZXNpZ25lZFxuICAgICAgICAvLyB0byBiZSBpZGVudGljYWwgYXBhcnQgZnJvbSB0aGUgYGtpbmRgLlxuICAgICAgICAocHJldk9wIGFzIGlyLk9wPGlyLkNyZWF0ZU9wPikua2luZCA9IG1lcmdlZEtpbmQ7XG5cbiAgICAgICAgLy8gUmVtb3ZlIHRoZSBlbmQgaW5zdHJ1Y3Rpb24uXG4gICAgICAgIGlyLk9wTGlzdC5yZW1vdmU8aXIuQ3JlYXRlT3A+KG9wKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==