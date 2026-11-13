import { IonicModule } from '@ionic/angular/lazy';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { UpdatesPage } from './updates.page';
import { ExploreContainerComponentModule } from '../explore-container/explore-container.module';

import { UpdatesPageRoutingModule } from './updates-routing.module';

@NgModule({
  imports: [
    IonicModule,
    CommonModule,
    FormsModule,
    ExploreContainerComponentModule,
    UpdatesPageRoutingModule,
  ],
  declarations: [UpdatesPage],
})
export class UpdatesPageModule {}
