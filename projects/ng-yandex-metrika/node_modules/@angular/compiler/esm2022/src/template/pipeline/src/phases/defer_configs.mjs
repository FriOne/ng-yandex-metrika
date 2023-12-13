/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
import { literalOrArrayLiteral } from '../conversion';
/**
 * Defer instructions take a configuration array, which should be collected into the component
 * consts. This phase finds the config options, and creates the corresponding const array.
 */
export function configureDeferInstructions(job) {
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind !== ir.OpKind.Defer) {
                continue;
            }
            if (op.placeholderMinimumTime !== null) {
                op.placeholderConfig =
                    new ir.ConstCollectedExpr(literalOrArrayLiteral([op.placeholderMinimumTime]));
            }
            if (op.loadingMinimumTime !== null || op.loadingAfterTime !== null) {
                op.loadingConfig = new ir.ConstCollectedExpr(literalOrArrayLiteral([op.loadingMinimumTime, op.loadingAfterTime]));
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVmZXJfY29uZmlncy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uLy4uL3BhY2thZ2VzL2NvbXBpbGVyL3NyYy90ZW1wbGF0ZS9waXBlbGluZS9zcmMvcGhhc2VzL2RlZmVyX2NvbmZpZ3MudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7OztHQU1HO0FBRUgsT0FBTyxLQUFLLEVBQUUsTUFBTSxVQUFVLENBQUM7QUFFL0IsT0FBTyxFQUFDLHFCQUFxQixFQUFDLE1BQU0sZUFBZSxDQUFDO0FBRXBEOzs7R0FHRztBQUNILE1BQU0sVUFBVSwwQkFBMEIsQ0FBQyxHQUE0QjtJQUNyRSxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsTUFBTSxDQUFDLEtBQUssRUFBRTtnQkFDL0IsU0FBUzthQUNWO1lBRUQsSUFBSSxFQUFFLENBQUMsc0JBQXNCLEtBQUssSUFBSSxFQUFFO2dCQUN0QyxFQUFFLENBQUMsaUJBQWlCO29CQUNoQixJQUFJLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxzQkFBc0IsQ0FBQyxDQUFDLENBQUMsQ0FBQzthQUNuRjtZQUNELElBQUksRUFBRSxDQUFDLGtCQUFrQixLQUFLLElBQUksSUFBSSxFQUFFLENBQUMsZ0JBQWdCLEtBQUssSUFBSSxFQUFFO2dCQUNsRSxFQUFFLENBQUMsYUFBYSxHQUFHLElBQUksRUFBRSxDQUFDLGtCQUFrQixDQUN4QyxxQkFBcUIsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsRUFBRSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDLENBQUM7YUFDMUU7U0FDRjtLQUNGO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGxpY2Vuc2VcbiAqIENvcHlyaWdodCBHb29nbGUgTExDIEFsbCBSaWdodHMgUmVzZXJ2ZWQuXG4gKlxuICogVXNlIG9mIHRoaXMgc291cmNlIGNvZGUgaXMgZ292ZXJuZWQgYnkgYW4gTUlULXN0eWxlIGxpY2Vuc2UgdGhhdCBjYW4gYmVcbiAqIGZvdW5kIGluIHRoZSBMSUNFTlNFIGZpbGUgYXQgaHR0cHM6Ly9hbmd1bGFyLmlvL2xpY2Vuc2VcbiAqL1xuXG5pbXBvcnQgKiBhcyBpciBmcm9tICcuLi8uLi9pcic7XG5pbXBvcnQgdHlwZSB7Q29tcG9uZW50Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcbmltcG9ydCB7bGl0ZXJhbE9yQXJyYXlMaXRlcmFsfSBmcm9tICcuLi9jb252ZXJzaW9uJztcblxuLyoqXG4gKiBEZWZlciBpbnN0cnVjdGlvbnMgdGFrZSBhIGNvbmZpZ3VyYXRpb24gYXJyYXksIHdoaWNoIHNob3VsZCBiZSBjb2xsZWN0ZWQgaW50byB0aGUgY29tcG9uZW50XG4gKiBjb25zdHMuIFRoaXMgcGhhc2UgZmluZHMgdGhlIGNvbmZpZyBvcHRpb25zLCBhbmQgY3JlYXRlcyB0aGUgY29ycmVzcG9uZGluZyBjb25zdCBhcnJheS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbmZpZ3VyZURlZmVySW5zdHJ1Y3Rpb25zKGpvYjogQ29tcG9uZW50Q29tcGlsYXRpb25Kb2IpOiB2b2lkIHtcbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5jcmVhdGUpIHtcbiAgICAgIGlmIChvcC5raW5kICE9PSBpci5PcEtpbmQuRGVmZXIpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIGlmIChvcC5wbGFjZWhvbGRlck1pbmltdW1UaW1lICE9PSBudWxsKSB7XG4gICAgICAgIG9wLnBsYWNlaG9sZGVyQ29uZmlnID1cbiAgICAgICAgICAgIG5ldyBpci5Db25zdENvbGxlY3RlZEV4cHIobGl0ZXJhbE9yQXJyYXlMaXRlcmFsKFtvcC5wbGFjZWhvbGRlck1pbmltdW1UaW1lXSkpO1xuICAgICAgfVxuICAgICAgaWYgKG9wLmxvYWRpbmdNaW5pbXVtVGltZSAhPT0gbnVsbCB8fCBvcC5sb2FkaW5nQWZ0ZXJUaW1lICE9PSBudWxsKSB7XG4gICAgICAgIG9wLmxvYWRpbmdDb25maWcgPSBuZXcgaXIuQ29uc3RDb2xsZWN0ZWRFeHByKFxuICAgICAgICAgICAgbGl0ZXJhbE9yQXJyYXlMaXRlcmFsKFtvcC5sb2FkaW5nTWluaW11bVRpbWUsIG9wLmxvYWRpbmdBZnRlclRpbWVdKSk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG4iXX0=