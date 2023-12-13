# Angular Yandex Metrika
Модуль добавляет на страницу счетчик(и) яндекс метрики, доступны все [методы](https://yandex.ru/support/metrika/objects/method-reference.xml) API метрики.
Для методов, в которые можно передать колбэк, возвращается промис, но колбэки так же работают.

```bash
npm install ng-yandex-metrika
```

Чтобы подключить, нужно добавить скрипт в шаблон, либо подключить с помощью загрузчика модулей, и подключить в приложение.
```typescript
import { MetrikaModule } from 'ng-yandex-metrika';

@NgModule({
  imports: [
    MetrikaModule.forRoot(
      { id: 35567075, webvisor: true }, // CounterConfig | CounterConfig[]
      {
        // Можно задать ID счетчика, либо порядковый номер в массиве, необязательный параметр, по умолчанию первый
        defaultCounter,
        // Для загрузки метрики с другого источника
        alternativeUrl: 'https://cdn.jsdelivr.net/npm/yandex-metrica-watch/tag.js',
      },
    ),
  ]
})
```
```typescript
import { ApplicationConfig, importProvidersFrom } from '@angular/core';

export const appConfig: ApplicationConfig = {
  providers: [
    // ...
    importProvidersFrom(
      MetrikaModule.forRoot([
        { id: 35567075, webvisor: true },
        { id: 35567076 },
      ])
    ),
  ]
};

```

Если вам нужно, чтобы счетчик работал без javascript, нужно добавить это:
```html
<noscript><div><img src="https://mc.yandex.ru/watch/put_your_id_here" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
```

Для отправки javascript цели можно вызвать метод вручную:
```typescript
export class AppComponent {
  constructor(private metrika: Metrika) {}

  onClick() {
    this.metrika.reachGoal('a_goal_name');
  }
}
```

Или использовать директиву:
```html
<!-- eventName по умолчанию click -->
<button metrikaGoal goalName="test" eventName="mouseover">Click me</button>
<button metrikaGoal goalName="test" [counterId]="123456">Click me</button>
```

Для отправки данных о просмотре:
```typescript
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { Location } from '@angular/common';
import { filter } from 'rxjs/operators';

export class AppComponent {
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
}
```
