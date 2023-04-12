import { Component } from '@angular/core';
import { Metrika } from 'ng-yandex-metrika';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  title = 'ng-yandex-metrika-proj';

  constructor(public metrika: Metrika) {}

  onLinkClick() {
    this.metrika.reachGoal('test');
  }
}
