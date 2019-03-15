# Angular Yandex Metrika
Модуль добавляет на страницу счетчик(и) яндекс метрики, доступны все [методы](https://yandex.ru/support/metrika/objects/method-reference.xml) API метрики.
Для методов, в которые можно передать колбэк, возвращается промис, но колбэки так же работают.

Версия 2 использует АПИ второй метрики.

```sh
    npm install ng-yandex-metrika --save
```

Чтобы подключить, нужно добавить скрипт в шаблон, либо подключить с помощью загрузчика модулей, и подключить в приложение.
```typescript
import { MetrikaModule } from 'ng-yandex-metrika';

@NgModule({
  imports: [
    MetrikaModule.forRoot(
      {id: 35567075, webvisor: true}, // CounterConfig | CounterConfig[]
      // Можно задать ид счетчика, либо порядковый номер в массиве, необязательный параметрб по умолчанию первый попавшийся.
      defaultCounter, // number | string
    ),
  ]
})
```

Если вам нужно, чтобы счетчик работал без javascript, нужно добавить это:
```html
<noscript><div><img src="https://mc.yandex.ru/watch/put_your_id_here" style="position:absolute; left:-9999px;" alt="" /></div></noscript>
```

Для отправки javascript события:
```typescript
constructor(private metrika: Metrika) {}

onClick() {
  this.metrika.fireEvent('some_event_name');
}
```

Для отправки данных о просмотре страницы:
```typescript
constructor(
  private metrika: Metrika,
  private router: Router,
  location: Location,
) {
  let prevPath = this.location.path();
  this.router
    .events
    .filter(event => (event instanceof NavigationEnd))
    .subscribe(() => {
      const newPath = this.location.path();
      this.metrika.hit(newPath, {
        referer: prevPath,
      });
      prevPath = newPath;
    });
}
```
