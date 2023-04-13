import { AfterViewInit, Directive, ElementRef, Input, OnDestroy, Renderer2 } from '@angular/core';

import { Metrika } from './ng-yandex-metrika.service';

@Directive({
  selector: '[metrikaGoal]',
})
export class MetrikaGoalDirective implements AfterViewInit, OnDestroy {
  @Input() goalName: string;
  @Input() eventName = 'click';
  @Input() params: Record<string, any>;
  @Input() counterId?: number;
  @Input() callback: () => void;

  private removeEventListener: () => void;

  constructor(
    private metrika: Metrika,
    private renderer: Renderer2,
    private el: ElementRef
  ) {}

  ngAfterViewInit() {
    try {
      this.removeEventListener = this.renderer.listen(this.el.nativeElement, this.eventName, () => {
        const options = { callback: this.callback, ...this.params };

        this.metrika.reachGoal(this.goalName, options, this.counterId);
      });
    } catch (err) {
      console.error(err);
    }
  }

  ngOnDestroy() {
    if (this.removeEventListener) {
      this.removeEventListener();
    }
  }
}
