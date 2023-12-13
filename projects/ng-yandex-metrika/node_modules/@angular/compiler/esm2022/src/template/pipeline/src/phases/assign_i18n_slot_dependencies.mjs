/**
 * @license
 * Copyright Google LLC All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */
import * as ir from '../../ir';
/**
 * Updates i18n expression ops to target the last slot in their owning i18n block, and moves them
 * after the last update instruction that depends on that slot.
 */
export function assignI18nSlotDependencies(job) {
    const i18nLastSlotConsumers = new Map();
    let lastSlotConsumer = null;
    let currentI18nOp = null;
    for (const unit of job.units) {
        // Record the last consumed slot before each i18n end instruction.
        for (const op of unit.create) {
            if (ir.hasConsumesSlotTrait(op)) {
                lastSlotConsumer = op.xref;
            }
            switch (op.kind) {
                case ir.OpKind.I18nStart:
                    currentI18nOp = op;
                    break;
                case ir.OpKind.I18nEnd:
                    if (currentI18nOp === null) {
                        throw new Error('AssertionError: Expected an active I18n block while calculating last slot consumers');
                    }
                    if (lastSlotConsumer === null) {
                        throw new Error('AssertionError: Expected a last slot consumer while calculating last slot consumers');
                    }
                    i18nLastSlotConsumers.set(currentI18nOp.xref, lastSlotConsumer);
                    currentI18nOp = null;
                    break;
            }
        }
        // Expresions that are currently being moved.
        let opsToMove = [];
        // Previously we found the last slot-consuming create mode op in the i18n block. That op will be
        // the new target for any moved i18n expresion inside the i18n block, and that op's slot is
        // stored here.
        let moveAfterTarget = null;
        // This is the last target in the create IR that we saw during iteration. Eventally, it will be
        // equal to moveAfterTarget. But wait! We need to find the *last* such op whose target is equal
        // to `moveAfterTarget`.
        let previousTarget = null;
        for (const op of unit.update) {
            if (ir.hasDependsOnSlotContextTrait(op)) {
                // We've found an op that depends on another slot other than the one that we want to move
                // the expressions to, after previously having seen the one we want to move to.
                if (moveAfterTarget !== null && previousTarget === moveAfterTarget &&
                    op.target !== previousTarget) {
                    ir.OpList.insertBefore(opsToMove, op);
                    moveAfterTarget = null;
                    opsToMove = [];
                }
                previousTarget = op.target;
            }
            if (op.kind === ir.OpKind.I18nExpression && op.usage === ir.I18nExpressionFor.I18nText) {
                // This is an I18nExpressionOps that is used for text (not attributes).
                ir.OpList.remove(op);
                opsToMove.push(op);
                const target = i18nLastSlotConsumers.get(op.i18nOwner);
                if (target === undefined) {
                    throw new Error('AssertionError: Expected to find a last slot consumer for an I18nExpressionOp');
                }
                op.target = target;
                moveAfterTarget = op.target;
            }
        }
        if (moveAfterTarget !== null) {
            unit.update.push(opsToMove);
        }
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXNzaWduX2kxOG5fc2xvdF9kZXBlbmRlbmNpZXMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi8uLi9wYWNrYWdlcy9jb21waWxlci9zcmMvdGVtcGxhdGUvcGlwZWxpbmUvc3JjL3BoYXNlcy9hc3NpZ25faTE4bl9zbG90X2RlcGVuZGVuY2llcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7O0dBTUc7QUFFSCxPQUFPLEtBQUssRUFBRSxNQUFNLFVBQVUsQ0FBQztBQUcvQjs7O0dBR0c7QUFDSCxNQUFNLFVBQVUsMEJBQTBCLENBQUMsR0FBbUI7SUFDNUQsTUFBTSxxQkFBcUIsR0FBRyxJQUFJLEdBQUcsRUFBd0IsQ0FBQztJQUM5RCxJQUFJLGdCQUFnQixHQUFtQixJQUFJLENBQUM7SUFDNUMsSUFBSSxhQUFhLEdBQXdCLElBQUksQ0FBQztJQUU5QyxLQUFLLE1BQU0sSUFBSSxJQUFJLEdBQUcsQ0FBQyxLQUFLLEVBQUU7UUFDNUIsa0VBQWtFO1FBQ2xFLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixJQUFJLEVBQUUsQ0FBQyxvQkFBb0IsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDL0IsZ0JBQWdCLEdBQUcsRUFBRSxDQUFDLElBQUksQ0FBQzthQUM1QjtZQUVELFFBQVEsRUFBRSxDQUFDLElBQUksRUFBRTtnQkFDZixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsU0FBUztvQkFDdEIsYUFBYSxHQUFHLEVBQUUsQ0FBQztvQkFDbkIsTUFBTTtnQkFDUixLQUFLLEVBQUUsQ0FBQyxNQUFNLENBQUMsT0FBTztvQkFDcEIsSUFBSSxhQUFhLEtBQUssSUFBSSxFQUFFO3dCQUMxQixNQUFNLElBQUksS0FBSyxDQUNYLHFGQUFxRixDQUFDLENBQUM7cUJBQzVGO29CQUNELElBQUksZ0JBQWdCLEtBQUssSUFBSSxFQUFFO3dCQUM3QixNQUFNLElBQUksS0FBSyxDQUNYLHFGQUFxRixDQUFDLENBQUM7cUJBQzVGO29CQUNELHFCQUFxQixDQUFDLEdBQUcsQ0FBQyxhQUFhLENBQUMsSUFBSSxFQUFFLGdCQUFnQixDQUFDLENBQUM7b0JBQ2hFLGFBQWEsR0FBRyxJQUFJLENBQUM7b0JBQ3JCLE1BQU07YUFDVDtTQUNGO1FBRUQsNkNBQTZDO1FBQzdDLElBQUksU0FBUyxHQUEwQixFQUFFLENBQUM7UUFDMUMsZ0dBQWdHO1FBQ2hHLDJGQUEyRjtRQUMzRixlQUFlO1FBQ2YsSUFBSSxlQUFlLEdBQW1CLElBQUksQ0FBQztRQUMzQywrRkFBK0Y7UUFDL0YsK0ZBQStGO1FBQy9GLHdCQUF3QjtRQUN4QixJQUFJLGNBQWMsR0FBbUIsSUFBSSxDQUFDO1FBQzFDLEtBQUssTUFBTSxFQUFFLElBQUksSUFBSSxDQUFDLE1BQU0sRUFBRTtZQUM1QixJQUFJLEVBQUUsQ0FBQyw0QkFBNEIsQ0FBQyxFQUFFLENBQUMsRUFBRTtnQkFDdkMseUZBQXlGO2dCQUN6RiwrRUFBK0U7Z0JBQy9FLElBQUksZUFBZSxLQUFLLElBQUksSUFBSSxjQUFjLEtBQUssZUFBZTtvQkFDOUQsRUFBRSxDQUFDLE1BQU0sS0FBSyxjQUFjLEVBQUU7b0JBQ2hDLEVBQUUsQ0FBQyxNQUFNLENBQUMsWUFBWSxDQUFjLFNBQVMsRUFBRSxFQUFFLENBQUMsQ0FBQztvQkFDbkQsZUFBZSxHQUFHLElBQUksQ0FBQztvQkFDdkIsU0FBUyxHQUFHLEVBQUUsQ0FBQztpQkFDaEI7Z0JBQ0QsY0FBYyxHQUFHLEVBQUUsQ0FBQyxNQUFNLENBQUM7YUFDNUI7WUFFRCxJQUFJLEVBQUUsQ0FBQyxJQUFJLEtBQUssRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLElBQUksRUFBRSxDQUFDLEtBQUssS0FBSyxFQUFFLENBQUMsaUJBQWlCLENBQUMsUUFBUSxFQUFFO2dCQUN0Rix1RUFBdUU7Z0JBQ3ZFLEVBQUUsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFjLEVBQUUsQ0FBQyxDQUFDO2dCQUNsQyxTQUFTLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxDQUFDO2dCQUNuQixNQUFNLE1BQU0sR0FBRyxxQkFBcUIsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxDQUFDO2dCQUN2RCxJQUFJLE1BQU0sS0FBSyxTQUFTLEVBQUU7b0JBQ3hCLE1BQU0sSUFBSSxLQUFLLENBQ1gsK0VBQStFLENBQUMsQ0FBQztpQkFDdEY7Z0JBQ0QsRUFBRSxDQUFDLE1BQU0sR0FBRyxNQUFNLENBQUM7Z0JBQ25CLGVBQWUsR0FBRyxFQUFFLENBQUMsTUFBTSxDQUFDO2FBQzdCO1NBQ0Y7UUFFRCxJQUFJLGVBQWUsS0FBSyxJQUFJLEVBQUU7WUFDNUIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxJQUFJLENBQUMsU0FBUyxDQUFDLENBQUM7U0FDN0I7S0FDRjtBQUNILENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKipcbiAqIEBsaWNlbnNlXG4gKiBDb3B5cmlnaHQgR29vZ2xlIExMQyBBbGwgUmlnaHRzIFJlc2VydmVkLlxuICpcbiAqIFVzZSBvZiB0aGlzIHNvdXJjZSBjb2RlIGlzIGdvdmVybmVkIGJ5IGFuIE1JVC1zdHlsZSBsaWNlbnNlIHRoYXQgY2FuIGJlXG4gKiBmb3VuZCBpbiB0aGUgTElDRU5TRSBmaWxlIGF0IGh0dHBzOi8vYW5ndWxhci5pby9saWNlbnNlXG4gKi9cblxuaW1wb3J0ICogYXMgaXIgZnJvbSAnLi4vLi4vaXInO1xuaW1wb3J0IHtDb21waWxhdGlvbkpvYn0gZnJvbSAnLi4vY29tcGlsYXRpb24nO1xuXG4vKipcbiAqIFVwZGF0ZXMgaTE4biBleHByZXNzaW9uIG9wcyB0byB0YXJnZXQgdGhlIGxhc3Qgc2xvdCBpbiB0aGVpciBvd25pbmcgaTE4biBibG9jaywgYW5kIG1vdmVzIHRoZW1cbiAqIGFmdGVyIHRoZSBsYXN0IHVwZGF0ZSBpbnN0cnVjdGlvbiB0aGF0IGRlcGVuZHMgb24gdGhhdCBzbG90LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYXNzaWduSTE4blNsb3REZXBlbmRlbmNpZXMoam9iOiBDb21waWxhdGlvbkpvYikge1xuICBjb25zdCBpMThuTGFzdFNsb3RDb25zdW1lcnMgPSBuZXcgTWFwPGlyLlhyZWZJZCwgaXIuWHJlZklkPigpO1xuICBsZXQgbGFzdFNsb3RDb25zdW1lcjogaXIuWHJlZklkfG51bGwgPSBudWxsO1xuICBsZXQgY3VycmVudEkxOG5PcDogaXIuSTE4blN0YXJ0T3B8bnVsbCA9IG51bGw7XG5cbiAgZm9yIChjb25zdCB1bml0IG9mIGpvYi51bml0cykge1xuICAgIC8vIFJlY29yZCB0aGUgbGFzdCBjb25zdW1lZCBzbG90IGJlZm9yZSBlYWNoIGkxOG4gZW5kIGluc3RydWN0aW9uLlxuICAgIGZvciAoY29uc3Qgb3Agb2YgdW5pdC5jcmVhdGUpIHtcbiAgICAgIGlmIChpci5oYXNDb25zdW1lc1Nsb3RUcmFpdChvcCkpIHtcbiAgICAgICAgbGFzdFNsb3RDb25zdW1lciA9IG9wLnhyZWY7XG4gICAgICB9XG5cbiAgICAgIHN3aXRjaCAob3Aua2luZCkge1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5JMThuU3RhcnQ6XG4gICAgICAgICAgY3VycmVudEkxOG5PcCA9IG9wO1xuICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIGlyLk9wS2luZC5JMThuRW5kOlxuICAgICAgICAgIGlmIChjdXJyZW50STE4bk9wID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgJ0Fzc2VydGlvbkVycm9yOiBFeHBlY3RlZCBhbiBhY3RpdmUgSTE4biBibG9jayB3aGlsZSBjYWxjdWxhdGluZyBsYXN0IHNsb3QgY29uc3VtZXJzJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmIChsYXN0U2xvdENvbnN1bWVyID09PSBudWxsKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICAgJ0Fzc2VydGlvbkVycm9yOiBFeHBlY3RlZCBhIGxhc3Qgc2xvdCBjb25zdW1lciB3aGlsZSBjYWxjdWxhdGluZyBsYXN0IHNsb3QgY29uc3VtZXJzJyk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGkxOG5MYXN0U2xvdENvbnN1bWVycy5zZXQoY3VycmVudEkxOG5PcC54cmVmLCBsYXN0U2xvdENvbnN1bWVyKTtcbiAgICAgICAgICBjdXJyZW50STE4bk9wID0gbnVsbDtcbiAgICAgICAgICBicmVhaztcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBFeHByZXNpb25zIHRoYXQgYXJlIGN1cnJlbnRseSBiZWluZyBtb3ZlZC5cbiAgICBsZXQgb3BzVG9Nb3ZlOiBpci5JMThuRXhwcmVzc2lvbk9wW10gPSBbXTtcbiAgICAvLyBQcmV2aW91c2x5IHdlIGZvdW5kIHRoZSBsYXN0IHNsb3QtY29uc3VtaW5nIGNyZWF0ZSBtb2RlIG9wIGluIHRoZSBpMThuIGJsb2NrLiBUaGF0IG9wIHdpbGwgYmVcbiAgICAvLyB0aGUgbmV3IHRhcmdldCBmb3IgYW55IG1vdmVkIGkxOG4gZXhwcmVzaW9uIGluc2lkZSB0aGUgaTE4biBibG9jaywgYW5kIHRoYXQgb3AncyBzbG90IGlzXG4gICAgLy8gc3RvcmVkIGhlcmUuXG4gICAgbGV0IG1vdmVBZnRlclRhcmdldDogaXIuWHJlZklkfG51bGwgPSBudWxsO1xuICAgIC8vIFRoaXMgaXMgdGhlIGxhc3QgdGFyZ2V0IGluIHRoZSBjcmVhdGUgSVIgdGhhdCB3ZSBzYXcgZHVyaW5nIGl0ZXJhdGlvbi4gRXZlbnRhbGx5LCBpdCB3aWxsIGJlXG4gICAgLy8gZXF1YWwgdG8gbW92ZUFmdGVyVGFyZ2V0LiBCdXQgd2FpdCEgV2UgbmVlZCB0byBmaW5kIHRoZSAqbGFzdCogc3VjaCBvcCB3aG9zZSB0YXJnZXQgaXMgZXF1YWxcbiAgICAvLyB0byBgbW92ZUFmdGVyVGFyZ2V0YC5cbiAgICBsZXQgcHJldmlvdXNUYXJnZXQ6IGlyLlhyZWZJZHxudWxsID0gbnVsbDtcbiAgICBmb3IgKGNvbnN0IG9wIG9mIHVuaXQudXBkYXRlKSB7XG4gICAgICBpZiAoaXIuaGFzRGVwZW5kc09uU2xvdENvbnRleHRUcmFpdChvcCkpIHtcbiAgICAgICAgLy8gV2UndmUgZm91bmQgYW4gb3AgdGhhdCBkZXBlbmRzIG9uIGFub3RoZXIgc2xvdCBvdGhlciB0aGFuIHRoZSBvbmUgdGhhdCB3ZSB3YW50IHRvIG1vdmVcbiAgICAgICAgLy8gdGhlIGV4cHJlc3Npb25zIHRvLCBhZnRlciBwcmV2aW91c2x5IGhhdmluZyBzZWVuIHRoZSBvbmUgd2Ugd2FudCB0byBtb3ZlIHRvLlxuICAgICAgICBpZiAobW92ZUFmdGVyVGFyZ2V0ICE9PSBudWxsICYmIHByZXZpb3VzVGFyZ2V0ID09PSBtb3ZlQWZ0ZXJUYXJnZXQgJiZcbiAgICAgICAgICAgIG9wLnRhcmdldCAhPT0gcHJldmlvdXNUYXJnZXQpIHtcbiAgICAgICAgICBpci5PcExpc3QuaW5zZXJ0QmVmb3JlPGlyLlVwZGF0ZU9wPihvcHNUb01vdmUsIG9wKTtcbiAgICAgICAgICBtb3ZlQWZ0ZXJUYXJnZXQgPSBudWxsO1xuICAgICAgICAgIG9wc1RvTW92ZSA9IFtdO1xuICAgICAgICB9XG4gICAgICAgIHByZXZpb3VzVGFyZ2V0ID0gb3AudGFyZ2V0O1xuICAgICAgfVxuXG4gICAgICBpZiAob3Aua2luZCA9PT0gaXIuT3BLaW5kLkkxOG5FeHByZXNzaW9uICYmIG9wLnVzYWdlID09PSBpci5JMThuRXhwcmVzc2lvbkZvci5JMThuVGV4dCkge1xuICAgICAgICAvLyBUaGlzIGlzIGFuIEkxOG5FeHByZXNzaW9uT3BzIHRoYXQgaXMgdXNlZCBmb3IgdGV4dCAobm90IGF0dHJpYnV0ZXMpLlxuICAgICAgICBpci5PcExpc3QucmVtb3ZlPGlyLlVwZGF0ZU9wPihvcCk7XG4gICAgICAgIG9wc1RvTW92ZS5wdXNoKG9wKTtcbiAgICAgICAgY29uc3QgdGFyZ2V0ID0gaTE4bkxhc3RTbG90Q29uc3VtZXJzLmdldChvcC5pMThuT3duZXIpO1xuICAgICAgICBpZiAodGFyZ2V0ID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgICAgICdBc3NlcnRpb25FcnJvcjogRXhwZWN0ZWQgdG8gZmluZCBhIGxhc3Qgc2xvdCBjb25zdW1lciBmb3IgYW4gSTE4bkV4cHJlc3Npb25PcCcpO1xuICAgICAgICB9XG4gICAgICAgIG9wLnRhcmdldCA9IHRhcmdldDtcbiAgICAgICAgbW92ZUFmdGVyVGFyZ2V0ID0gb3AudGFyZ2V0O1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChtb3ZlQWZ0ZXJUYXJnZXQgIT09IG51bGwpIHtcbiAgICAgIHVuaXQudXBkYXRlLnB1c2gob3BzVG9Nb3ZlKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==