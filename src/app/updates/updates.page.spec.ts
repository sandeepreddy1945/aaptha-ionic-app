import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RouterModule } from '@angular/router';

import { UpdatesPageModule } from './updates.module';
import { UpdatesPage } from './updates.page';

describe('UpdatesPage', () => {
  let component: UpdatesPage;
  let fixture: ComponentFixture<UpdatesPage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UpdatesPageModule, RouterModule.forRoot([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UpdatesPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
