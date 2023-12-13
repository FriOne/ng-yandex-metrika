import { Routes } from '@angular/router';

import { FirstComponent } from './components/first/first.component';
import { SecondComponent } from './components/second/second.component';

export const routes: Routes = [
  { path: 'first', component: FirstComponent },
  { path: 'second', component: SecondComponent },
  { path: '**', component: FirstComponent },
];
