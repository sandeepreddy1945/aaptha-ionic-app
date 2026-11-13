import { Component, inject, OnDestroy, OnInit } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Router } from '@angular/router';
import {
  CareAppService,
  AppState,
  TrackingStatus,
} from '../services/care-app.service';

@Component({
  selector: 'app-tab1',
  templateUrl: 'tab1.page.html',
  styleUrls: ['tab1.page.scss'],
  standalone: false,
})
export class Tab1Page implements OnInit, OnDestroy {
  private readonly care = inject(CareAppService);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);
  readonly state$ = this.care.state$;
  consentOpen = false;
  trackingConsent = false;
  busy = false;
  now = Date.now();
  private timer?: ReturnType<typeof setInterval>;

  ngOnInit(): void {
    this.timer = setInterval(() => (this.now = Date.now()), 60_000);
    void this.care.resumeActiveShift();
  }

  ngOnDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  elapsed(startedAt: string | null): string {
    if (!startedAt) return '0h 00m';
    const minutes = Math.max(
      0,
      Math.floor((this.now - Date.parse(startedAt)) / 60_000),
    );
    return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;
  }

  unreadCount(state: AppState): number {
    return state.notifications.filter((notification) => notification.unread)
      .length;
  }

  todayLabel(): string {
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
      .format(new Date())
      .toUpperCase();
  }

  trackingLabel(status: TrackingStatus): string {
    const labels: Record<TrackingStatus, string> = {
      off: 'NOT TRACKING',
      starting: 'STARTING',
      background: 'TRACKING ACTIVE',
      foreground: 'APP OPEN ONLY',
      unavailable: 'LOCATION OFF',
    };
    return labels[status];
  }

  openClockIn(): void {
    if (this.care.snapshot.contacts.length === 0) {
      void this.showContactRequired();
      return;
    }
    this.trackingConsent = false;
    this.consentOpen = true;
  }

  async confirmClockIn(): Promise<void> {
    if (!this.trackingConsent || this.busy) return;
    this.busy = true;
    this.consentOpen = false;
    try {
      const status = await this.care.startShift(true);
      if (status === 'unavailable') {
        await this.showMessage(
          'Shift started · location unavailable',
          'Your shift is active, but location permission or native tracking is unavailable. Contact your coordinator before continuing.',
        );
      } else if (status === 'foreground') {
        await this.showMessage(
          'Shift started · preview mode',
          'Background tracking requires the installed iOS or Android app. This browser preview does not capture your location.',
        );
      }
    } catch (error) {
      await this.showMessage(
        'Could not start shift',
        error instanceof Error
          ? error.message
          : 'Please try again or contact your coordinator.',
      );
    } finally {
      this.busy = false;
    }
  }

  async confirmClockOut(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'End your shift?',
      message: 'Location tracking will stop when you clock out.',
      buttons: [
        { text: 'Keep working', role: 'cancel' },
        {
          text: 'Clock out',
          role: 'destructive',
          handler: () => void this.care.endShift(),
        },
      ],
    });
    await alert.present();
  }

  async showSOS(state: AppState): Promise<void> {
    const message = state.contacts.length
      ? 'This preview cannot notify dispatch or send an SOS automatically. Choose a contact to call; contacts are listed in priority order.'
      : 'This preview is not connected to emergency dispatch. Call your local emergency number if you need immediate help.';
    const contactButtons = state.contacts.map((contact, index) => ({
      text: `Call ${index === 0 ? 'primary' : `contact ${index + 1}`} · ${contact.name}`,
      handler: () => {
        window.location.href = `tel:${contact.phone.replace(/[^+\d]/g, '')}`;
      },
    }));
    const alert = await this.alertController.create({
      header: 'Emergency help',
      message,
      buttons: [...contactButtons, { text: 'Close', role: 'cancel' }],
    });
    await alert.present();
  }

  private async showContactRequired(): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Add an emergency contact first',
      message:
        'A primary contact is needed before you start a tracked shift. You can add up to three contacts in your profile.',
      buttons: [
        { text: 'Not now', role: 'cancel' },
        {
          text: 'Open profile',
          handler: () => void this.router.navigateByUrl('/tabs/tab3'),
        },
      ],
    });
    await alert.present();
  }

  private async showMessage(header: string, message: string): Promise<void> {
    const alert = await this.alertController.create({
      header,
      message,
      buttons: ['OK'],
    });
    await alert.present();
  }
}
