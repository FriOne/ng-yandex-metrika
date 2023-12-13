import { Component, Inject, PLATFORM_ID } from '@angular/core';
import { Metrika, MetrikaGoalDirective } from 'ng-yandex-metrika';
import { METRIKA_ID_2 } from './constants';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { isPlatformServer, Location } from '@angular/common';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  imports: [MetrikaGoalDirective, RouterLink, RouterOutlet],
  standalone: true
})
export class AppComponent {
  title = 'Angular Yandex Metrika';

  constructor(
    private metrika: Metrika,
    private router: Router,
    location: Location,
    @Inject(PLATFORM_ID) platformId: Object,
  ) {
    if (isPlatformServer(platformId)) {
      return;
    }

    let prevPath = location.path();
    this.router
      .events
      .pipe(filter(event => (event instanceof NavigationEnd)))
      .subscribe(() => {
        const newPath = location.path();
        this.metrika.hit(newPath, {
          referer: prevPath,
          callback: () => { console.log('hit end'); }
        });
        prevPath = newPath;
      });
  }

  onLinkClick() {
    this.metrika.reachGoal('test');
  }

  async onExternalLinkClick(event: MouseEvent) {
    if (event.currentTarget instanceof HTMLAnchorElement) {
      const options = {
        callback: () => {},
        ctx: this,
        params: { title: 'test title' },
      };

      await this.metrika.extLink(event.currentTarget.href, options, METRIKA_ID_2);
      console.log('link clicked');
    }
  }
}
