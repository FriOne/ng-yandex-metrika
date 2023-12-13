/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
const CONTAINER_TAG = 'ng-container';
/**
 * Replace an `Element` or `ElementStart` whose tag is `ng-container` with a specific op.
 */
export function generateNgContainerOps(job) {
    for (const unit of job.units) {
        const updatedElementXrefs = new Set();
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.ElementStart && op.tag === CONTAINER_TAG) {
                // Transmute the `ElementStart` instruction to `ContainerStart`.
                op.kind = ir.OpKind.ContainerStart;
                updatedElementXrefs.add(op.xref);
            }
            if (op.kind === ir.OpKind.ElementEnd && updatedElementXrefs.has(op.xref)) {
                // This `ElementEnd` is associated with an `ElementStart` we already transmuted.
                op.kind = ir.OpKind.ContainerEnd;
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmdfY29udGFpbmVyLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vLi4vcGFja2FnZXMvY29tcGlsZXIvc3JjL3RlbXBsYXRlL3BpcGVsaW5lL3NyYy9waGFzZXMvbmdfY29udGFpbmVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBOzs7Ozs7R0FNRztBQUVILE9BQU8sS0FBSyxFQUFFLE1BQU0sVUFBVSxDQUFDO0FBRy9CLE1BQU0sYUFBYSxHQUFHLGNBQWMsQ0FBQztBQUVyQzs7R0FFRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FBQyxHQUFtQjtJQUN4RCxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsTUFBTSxtQkFBbUIsR0FBRyxJQUFJLEdBQUcsRUFBYSxDQUFDO1FBQ2pELEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxZQUFZLElBQUksRUFBRSxDQUFDLEdBQUcsS0FBSyxhQUFhLEVBQUU7Z0JBQ2xFLGdFQUFnRTtnQkFDL0QsRUFBeUIsQ0FBQyxJQUFJLEdBQUcsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLENBQUM7Z0JBQzNELG1CQUFtQixDQUFDLEdBQUcsQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUM7YUFDbEM7WUFFRCxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxVQUFVLElBQUksbUJBQW1CLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsRUFBRTtnQkFDeEUsZ0ZBQWdGO2dCQUMvRSxFQUF5QixDQUFDLElBQUksR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDLFlBQVksQ0FBQzthQUMxRDtTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB0eXBlIHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG5jb25zdCBDT05UQUlORVJfVEFHID0gJ25nLWNvbnRhaW5lcic7XG5cbi8qKlxuICogUmVwbGFjZSBhbiBgRWxlbWVudGAgb3IgYEVsZW1lbnRTdGFydGAgd2hvc2UgdGFnIGlzIGBuZy1jb250YWluZXJgIHdpdGggYSBzcGVjaWZpYyBvcC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdlbmVyYXRlTmdDb250YWluZXJPcHMoam9iOiBDb21waWxhdGlvbkpvYik6IHZvaWQge1xuICBmb3IgKGNvbnN0IHVuaXQgb2Ygam9iLnVuaXRzKSB7XG4gICAgY29uc3QgdXBkYXRlZEVsZW1lbnRYcmVmcyA9IG5ldyBTZXQ8aXIuWHJlZklkPigpO1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5jcmVhdGUpIHtcbiAgICAgIGlmIChvcC5raW5kID09PSBpci5PcEtpbmQuRWxlbWVudFN0YXJ0ICYmIG9wLnRhZyA9PT0gQ09OVEFJTkVSX1RBRykge1xuICAgICAgICAvLyBUcmFuc211dGUgdGhlIGBFbGVtZW50U3RhcnRgIGluc3RydWN0aW9uIHRvIGBDb250YWluZXJTdGFydGAuXG4gICAgICAgIChvcCBhcyBpci5PcDxpci5DcmVhdGVPcD4pLmtpbmQgPSBpci5PcEtpbmQuQ29udGFpbmVyU3RhcnQ7XG4gICAgICAgIHVwZGF0ZWRFbGVtZW50WHJlZnMuYWRkKG9wLnhyZWYpO1xuICAgICAgfVxuXG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkVsZW1lbnRFbmQgJiYgdXBkYXRlZEVsZW1lbnRYcmVmcy5oYXMob3AueHJlZikpIHtcbiAgICAgICAgLy8gVGhpcyBgRWxlbWVudEVuZGAgaXMgYXNzb2NpYXRlZCB3aXRoIGFuIGBFbGVtZW50U3RhcnRgIHdlIGFscmVhZHkgdHJhbnNtdXRlZC5cbiAgICAgICAgKG9wIGFzIGlyLk9wPGlyLkNyZWF0ZU9wPikua2luZCA9IGlyLk9wS2luZC5Db250YWluZXJFbmQ7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=