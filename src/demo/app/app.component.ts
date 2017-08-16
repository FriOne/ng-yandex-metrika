import { Component } from '@angular/core';

import { Metrika } from 'ng-yandex-metrika';

@Component({
  selector: 'demo-app',
  templateUrl: './app.component.html'
})
export class AppComponent {

  constructor(private metrika: Metrika) {
    setTimeout(() => this.metrika.fireEvent('test'), 2000);
  }
}
