import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { ExampleComponent } from './example.component';
import { MetrikaModule } from '../src';

@NgModule({
  declarations: [
      ExampleComponent
  ],
  imports: [
    BrowserModule,
    MetrikaModule.forRoot({
      id: 45631461,
      webvisor: true,
    }),
  ],
  providers: [],
  bootstrap: [ExampleComponent]
})
export class ExampleModule {}
