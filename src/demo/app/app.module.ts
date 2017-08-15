import { NgModule }      from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { MetrikaModule } from 'ng-yandex-metrika';

import { AppComponent }  from './app.component';

@NgModule({
  imports:      [
    BrowserModule,
    MetrikaModule.forRoot({id: '45631461'}),
  ],
  declarations: [AppComponent],
  bootstrap:    [AppComponent]
})
export class AppModule {}
