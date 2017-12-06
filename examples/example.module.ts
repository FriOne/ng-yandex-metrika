import { BrowserModule } from '@angular/platform-browser';
import { NgModule } from '@angular/core';

import { ExampleComponent } from './example.component';
import { NgYandexMetrikaModule } from '../index';

@NgModule({
    declarations: [
        ExampleComponent
    ],
    imports: [
        BrowserModule,
        NgYandexMetrikaModule
    ],
    providers: [],
    bootstrap: [ExampleComponent]
})
export class ExampleModule { }
