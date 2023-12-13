/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Create one helper context op per i18n block (including generate descending blocks).
 *
 * Also, if an ICU exists inside an i18n block that also contains other localizable content (such as
 * string), create an additional helper context op for the ICU.
 *
 * These context ops are later used for generating i18n messages. (Although we generate at least one
 * context op per nested view, we will collect them up the tree later, to generate a top-level
 * message.)
 */
export function createI18nContexts(job) {
    const rootContexts = new Map();
    let currentI18nOp = null;
    let xref;
    for (const unit of job.units) {
        for (const op of unit.create) {
            switch (op.kind) {
                case ir.OpKind.I18nStart:
                    currentI18nOp = op;
                    // Each root i18n block gets its own context, child ones refer to the context for their
                    // root block.
                    if (op.xref === op.root) {
                        xref = job.allocateXrefId();
                        unit.create.push(ir.createI18nContextOp(ir.I18nContextKind.RootI18n, xref, op.xref, op.message, null));
                        op.context = xref;
                        rootContexts.set(op.xref, xref);
                    }
                    break;
                case ir.OpKind.I18nEnd:
                    currentI18nOp = null;
                    break;
                case ir.OpKind.IcuStart:
                    // If an ICU represents a different message than its containing block, we give it its own
                    // i18n context.
                    if (currentI18nOp === null) {
                        throw Error('Unexpected ICU outside of an i18n block.');
                    }
                    if (op.message.id !== currentI18nOp.message.id) {
                        // There was an enclosing i18n block around this ICU somewhere.
                        xref = job.allocateXrefId();
                        unit.create.push(ir.createI18nContextOp(ir.I18nContextKind.Icu, xref, currentI18nOp.xref, op.message, null));
                        op.context = xref;
                    }
                    else {
                        // The i18n block was generated because of this ICU, OR it was explicit, but the ICU is
                        // the only localizable content inside of it.
                        op.context = currentI18nOp.context;
                    }
                    break;
            }
        }
    }
    // Assign contexts to child i18n blocks, now that all root i18n blocks have their context
    // assigned.
    for (const unit of job.units) {
        for (const op of unit.create) {
            if (op.kind === ir.OpKind.I18nStart && op.xref !== op.root) {
                op.context = rootContexts.get(op.root);
            }
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY3JlYXRlX2kxOG5fY29udGV4dHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9jcmVhdGVfaTE4bl9jb250ZXh0cy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQjs7Ozs7Ozs7O0dBU0c7QUFDSCxNQUFNLFVBQVUsa0JBQWtCLENBQUMsR0FBbUI7SUFDcEQsTUFBTSxZQUFZLEdBQUcsSUFBSSxHQUFHLEVBQXdCLENBQUM7SUFDckQsSUFBSSxhQUFhLEdBQXdCLElBQUksQ0FBQztJQUM5QyxJQUFJLElBQWUsQ0FBQztJQUVwQixLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsS0FBSyxNQUFNLEVBQUUsSUFBSSxJQUFJLENBQUMsTUFBTSxFQUFFO1lBQzVCLFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDdEIsYUFBYSxHQUFHLEVBQUUsQ0FBQztvQkFDbkIsdUZBQXVGO29CQUN2RixjQUFjO29CQUNkLElBQUksRUFBRSxDQUFDLElBQUksS0FBSyxFQUFFLENBQUMsSUFBSSxFQUFFO3dCQUN2QixJQUFJLEdBQUcsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO3dCQUM1QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQ25DLEVBQUUsQ0FBQyxlQUFlLENBQUMsUUFBUSxFQUFFLElBQUksRUFBRSxFQUFFLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSyxDQUFDLENBQUMsQ0FBQzt3QkFDcEUsRUFBRSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7d0JBQ2xCLFlBQVksQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLElBQUksRUFBRSxJQUFJLENBQUMsQ0FBQztxQkFDakM7b0JBQ0QsTUFBTTtnQkFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTztvQkFDcEIsYUFBYSxHQUFHLElBQUksQ0FBQztvQkFDckIsTUFBTTtnQkFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsUUFBUTtvQkFDckIseUZBQXlGO29CQUN6RixnQkFBZ0I7b0JBQ2hCLElBQUksYUFBYSxLQUFLLElBQUksRUFBRTt3QkFDMUIsTUFBTSxLQUFLLENBQUMsMENBQTBDLENBQUMsQ0FBQztxQkFDekQ7b0JBQ0QsSUFBSSxFQUFFLENBQUMsT0FBTyxDQUFDLEVBQUUsS0FBSyxhQUFhLENBQUMsT0FBTyxDQUFDLEVBQUUsRUFBRTt3QkFDOUMsK0RBQStEO3dCQUMvRCxJQUFJLEdBQUcsR0FBRyxDQUFDLGNBQWMsRUFBRSxDQUFDO3dCQUM1QixJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsbUJBQW1CLENBQ25DLEVBQUUsQ0FBQyxlQUFlLENBQUMsR0FBRyxFQUFFLElBQUksRUFBRSxhQUFhLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxPQUFPLEVBQUUsSUFBSyxDQUFDLENBQUMsQ0FBQzt3QkFDMUUsRUFBRSxDQUFDLE9BQU8sR0FBRyxJQUFJLENBQUM7cUJBQ25CO3lCQUFNO3dCQUNMLHVGQUF1Rjt3QkFDdkYsNkNBQTZDO3dCQUM3QyxFQUFFLENBQUMsT0FBTyxHQUFHLGFBQWEsQ0FBQyxPQUFPLENBQUM7cUJBQ3BDO29CQUNELE1BQU07YUFDVDtTQUNGO0tBQ0Y7SUFFRCx5RkFBeUY7SUFDekYsWUFBWTtJQUNaLEtBQUssTUFBTSxJQUFJLElBQUksR0FBRyxDQUFDLEtBQUssRUFBRTtRQUM1QixLQUFLLE1BQU0sRUFBRSxJQUFJLElBQUksQ0FBQyxNQUFNLEVBQUU7WUFDNUIsSUFBSSxFQUFFLENBQUMsSUFBSSxLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUyxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDMUQsRUFBRSxDQUFDLE9BQU8sR0FBRyxZQUFZLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUUsQ0FBQzthQUN6QztTQUNGO0tBQ0Y7QUFDSCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBAbGljZW5zZVxuICogQ29weXJpZ2h0IEdvb2dsZSBMTEMgQWxsIFJpZ2h0cyBSZXNlcnZlZC5cbiAqXG4gKiBVc2Ugb2YgdGhpcyBzb3VyY2UgY29kZSBpcyBnb3Zlcm5lZCBieSBhbiBNSVQtc3R5bGUgbGljZW5zZSB0aGF0IGNhbiBiZVxuICogZm91bmQgaW4gdGhlIExJQ0VOU0UgZmlsZSBhdCBodHRwczovL2FuZ3VsYXIuaW8vbGljZW5zZVxuICovXG5cbmltcG9ydCAqIGFzIGlyIGZyb20gJy4uLy4uL2lyJztcbmltcG9ydCB7Q29tcGlsYXRpb25Kb2J9IGZyb20gJy4uL2NvbXBpbGF0aW9uJztcblxuLyoqXG4gKiBDcmVhdGUgb25lIGhlbHBlciBjb250ZXh0IG9wIHBlciBpMThuIGJsb2NrIChpbmNsdWRpbmcgZ2VuZXJhdGUgZGVzY2VuZGluZyBibG9ja3MpLlxuICpcbiAqIEFsc28sIGlmIGFuIElDVSBleGlzdHMgaW5zaWRlIGFuIGkxOG4gYmxvY2sgdGhhdCBhbHNvIGNvbnRhaW5zIG90aGVyIGxvY2FsaXphYmxlIGNvbnRlbnQgKHN1Y2ggYXNcbiAqIHN0cmluZyksIGNyZWF0ZSBhbiBhZGRpdGlvbmFsIGhlbHBlciBjb250ZXh0IG9wIGZvciB0aGUgSUNVLlxuICpcbiAqIFRoZXNlIGNvbnRleHQgb3BzIGFyZSBsYXRlciB1c2VkIGZvciBnZW5lcmF0aW5nIGkxOG4gbWVzc2FnZXMuIChBbHRob3VnaCB3ZSBnZW5lcmF0ZSBhdCBsZWFzdCBvbmVcbiAqIGNvbnRleHQgb3AgcGVyIG5lc3RlZCB2aWV3LCB3ZSB3aWxsIGNvbGxlY3QgdGhlbSB1cCB0aGUgdHJlZSBsYXRlciwgdG8gZ2VuZXJhdGUgYSB0b3AtbGV2ZWxcbiAqIG1lc3NhZ2UuKVxuICovXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlSTE4bkNvbnRleHRzKGpvYjogQ29tcGlsYXRpb25Kb2IpIHtcbiAgY29uc3Qgcm9vdENvbnRleHRzID0gbmV3IE1hcDxpci5YcmVmSWQsIGlyLlhyZWZJZD4oKTtcbiAgbGV0IGN1cnJlbnRJMThuT3A6IGlyLkkxOG5TdGFydE9wfG51bGwgPSBudWxsO1xuICBsZXQgeHJlZjogaXIuWHJlZklkO1xuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBzd2l0Y2ggKG9wLmtpbmQpIHtcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4blN0YXJ0OlxuICAgICAgICAgIGN1cnJlbnRJMThuT3AgPSBvcDtcbiAgICAgICAgICAvLyBFYWNoIHJvb3QgaTE4biBibG9jayBnZXRzIGl0cyBvd24gY29udGV4dCwgY2hpbGQgb25lcyByZWZlciB0byB0aGUgY29udGV4dCBmb3IgdGhlaXJcbiAgICAgICAgICAvLyByb290IGJsb2NrLlxuICAgICAgICAgIGlmIChvcC54cmVmID09PSBvcC5yb290KSB7XG4gICAgICAgICAgICB4cmVmID0gam9iLmFsbG9jYXRlWHJlZklkKCk7XG4gICAgICAgICAgICB1bml0LmNyZWF0ZS5wdXNoKGlyLmNyZWF0ZUkxOG5Db250ZXh0T3AoXG4gICAgICAgICAgICAgICAgaXIuSTE4bkNvbnRleHRLaW5kLlJvb3RJMThuLCB4cmVmLCBvcC54cmVmLCBvcC5tZXNzYWdlLCBudWxsISkpO1xuICAgICAgICAgICAgb3AuY29udGV4dCA9IHhyZWY7XG4gICAgICAgICAgICByb290Q29udGV4dHMuc2V0KG9wLnhyZWYsIHhyZWYpO1xuICAgICAgICAgIH1cbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSTE4bkVuZDpcbiAgICAgICAgICBjdXJyZW50STE4bk9wID0gbnVsbDtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBpci5PcEtpbmQuSWN1U3RhcnQ6XG4gICAgICAgICAgLy8gSWYgYW4gSUNVIHJlcHJlc2VudHMgYSBkaWZmZXJlbnQgbWVzc2FnZSB0aGFuIGl0cyBjb250YWluaW5nIGJsb2NrLCB3ZSBnaXZlIGl0IGl0cyBvd25cbiAgICAgICAgICAvLyBpMThuIGNvbnRleHQuXG4gICAgICAgICAgaWYgKGN1cnJlbnRJMThuT3AgPT09IG51bGwpIHtcbiAgICAgICAgICAgIHRocm93IEVycm9yKCdVbmV4cGVjdGVkIElDVSBvdXRzaWRlIG9mIGFuIGkxOG4gYmxvY2suJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChvcC5tZXNzYWdlLmlkICE9PSBjdXJyZW50STE4bk9wLm1lc3NhZ2UuaWQpIHtcbiAgICAgICAgICAgIC8vIFRoZXJlIHdhcyBhbiBlbmNsb3NpbmcgaTE4biBibG9jayBhcm91bmQgdGhpcyBJQ1Ugc29tZXdoZXJlLlxuICAgICAgICAgICAgeHJlZiA9IGpvYi5hbGxvY2F0ZVhyZWZJZCgpO1xuICAgICAgICAgICAgdW5pdC5jcmVhdGUucHVzaChpci5jcmVhdGVJMThuQ29udGV4dE9wKFxuICAgICAgICAgICAgICAgIGlyLkkxOG5Db250ZXh0S2luZC5JY3UsIHhyZWYsIGN1cnJlbnRJMThuT3AueHJlZiwgb3AubWVzc2FnZSwgbnVsbCEpKTtcbiAgICAgICAgICAgIG9wLmNvbnRleHQgPSB4cmVmO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBUaGUgaTE4biBibG9jayB3YXMgZ2VuZXJhdGVkIGJlY2F1c2Ugb2YgdGhpcyBJQ1UsIE9SIGl0IHdhcyBleHBsaWNpdCwgYnV0IHRoZSBJQ1UgaXNcbiAgICAgICAgICAgIC8vIHRoZSBvbmx5IGxvY2FsaXphYmxlIGNvbnRlbnQgaW5zaWRlIG9mIGl0LlxuICAgICAgICAgICAgb3AuY29udGV4dCA9IGN1cnJlbnRJMThuT3AuY29udGV4dDtcbiAgICAgICAgICB9XG4gICAgICAgICAgYnJlYWs7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gQXNzaWduIGNvbnRleHRzIHRvIGNoaWxkIGkxOG4gYmxvY2tzLCBub3cgdGhhdCBhbGwgcm9vdCBpMThuIGJsb2NrcyBoYXZlIHRoZWlyIGNvbnRleHRcbiAgLy8gYXNzaWduZWQuXG4gIGZvciAoY29uc3QgdW5pdCBvZiBqb2IudW5pdHMpIHtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQuY3JlYXRlKSB7XG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkkxOG5TdGFydCAmJiBvcC54cmVmICE9PSBvcC5yb290KSB7XG4gICAgICAgIG9wLmNvbnRleHQgPSByb290Q29udGV4dHMuZ2V0KG9wLnJvb3QpITtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cbiJdfQ==