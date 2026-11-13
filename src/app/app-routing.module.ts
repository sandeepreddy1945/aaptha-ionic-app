import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';
import { ChatPage } from './chat.page';

const routes: Routes = [
  { path: 'chat', component: ChatPage },
  {
    path: '',
    loadChildren: () =>
      import('./tabs/tabs.module').then((module) => module.TabsPageModule),
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules }),
  ],
  exports: [RouterModule],
})
export class AppRoutingModule {}
