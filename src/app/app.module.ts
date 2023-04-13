import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';
import { MetrikaModule } from 'ng-yandex-metrika';

import { AppComponent } from './app.component';

@NgModule({
  declarations: [
    AppComponent,
  ],
  imports: [
    BrowserModule.withServerTransition({ appId: 'serverApp' }),
    MetrikaModule.forRoot({
      id: 45631461,
      webvisor: true,
    }),
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule {}
