import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Router } from '@angular/router';
import {
  CareAppService,
  EmployeeProfile,
  EmergencyContact,
  ThemeChoice,
} from '../services/care-app.service';
import { LocationDatabaseService } from '../services/location-database.service';

type ProfileFieldKey = 'name' | 'email' | 'phone' | 'address';
type ContactDraft = Omit<EmergencyContact, 'id'>;

const EMPTY_CONTACT: ContactDraft = {
  name: '',
  relationship: '',
  phone: '',
  email: '',
};

@Component({
  selector: 'app-profile',
  templateUrl: 'profile.page.html',
  styleUrls: ['profile.page.scss'],
  standalone: false,
})
export class ProfilePage {
  private readonly care = inject(CareAppService);
  private readonly locationDatabase = inject(LocationDatabaseService);
  private readonly alertController = inject(AlertController);
  private readonly router = inject(Router);
  readonly state$ = this.care.state$;
  readonly themeOptions: { value: ThemeChoice; label: string; icon: string }[] =
    [
      { value: 'system', label: 'System', icon: 'phone-portrait-outline' },
      { value: 'light', label: 'Light', icon: 'sunny-outline' },
      { value: 'dark', label: 'Dark', icon: 'moon-outline' },
    ];
  fieldEditorOpen = false;
  contactEditorOpen = false;
  editingField: ProfileFieldKey | null = null;
  fieldLabel = '';
  fieldDraft = '';
  editingContactId: string | null = null;
  contactDraft: ContactDraft = { ...EMPTY_CONTACT };
  busy = false;
  sharingLocationData = false;

  initials(name: string): string {
    return name
      .split(/\s+/)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }

  openFieldEditor(key: ProfileFieldKey, label: string): void {
    this.editingField = key;
    this.fieldLabel = label;
    this.fieldDraft = this.care.snapshot.profile[key];
    this.fieldEditorOpen = true;
  }

  saveProfileField(): void {
    const value = this.fieldDraft.trim();
    if (!this.editingField || !value) {
      void this.showMessage(
        'Enter a value',
        `${this.fieldLabel} cannot be empty.`,
      );
      return;
    }
    if (
      this.editingField === 'email' &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    ) {
      void this.showMessage(
        'Check the email address',
        'Enter a valid email address.',
      );
      return;
    }
    this.care.updateProfile({
      ...this.care.snapshot.profile,
      [this.editingField]: value,
    });
    this.fieldEditorOpen = false;
    this.editingField = null;
  }

  openContactEditor(contact?: EmergencyContact): void {
    if (!contact && this.care.snapshot.contacts.length >= 3) {
      void this.showMessage(
        'Contact limit reached',
        'You can add up to three emergency contacts.',
      );
      return;
    }
    this.editingContactId = contact?.id ?? null;
    this.contactDraft = contact
      ? {
          name: contact.name,
          relationship: contact.relationship,
          phone: contact.phone,
          email: contact.email,
        }
      : { ...EMPTY_CONTACT };
    this.contactEditorOpen = true;
  }

  saveContact(): void {
    const contact = {
      name: this.contactDraft.name.trim(),
      relationship: this.contactDraft.relationship.trim(),
      phone: this.contactDraft.phone.trim(),
      email: this.contactDraft.email.trim(),
    };
    if (!contact.name || !contact.relationship || !contact.phone) {
      void this.showMessage(
        'Contact details needed',
        'Add a name, relationship, and phone number.',
      );
      return;
    }
    if (contact.phone.replace(/\D/g, '').length < 7) {
      void this.showMessage(
        'Check the phone number',
        'Enter a complete phone number.',
      );
      return;
    }
    if (contact.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email)) {
      void this.showMessage(
        'Check the email address',
        'Enter a valid email address or leave it blank.',
      );
      return;
    }
    const id = this.editingContactId ?? `${Date.now()}`;
    this.care.saveContact({ ...contact, id });
    this.closeContactEditor();
  }

  closeContactEditor(): void {
    this.contactEditorOpen = false;
    this.editingContactId = null;
    this.contactDraft = { ...EMPTY_CONTACT };
  }

  moveContact(index: number, direction: -1 | 1): void {
    this.care.moveContact(index, direction);
  }

  async removeContact(contact: EmergencyContact): Promise<void> {
    const alert = await this.alertController.create({
      header: 'Remove emergency contact?',
      message: `${contact.name} will be removed from this device.`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: () => this.care.removeContact(contact.id),
        },
      ],
    });
    await alert.present();
  }

  async changePhoto(): Promise<void> {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        allowEditing: true,
        resultType: CameraResultType.Uri,
        source: CameraSource.Prompt,
      });
      if (photo.webPath) {
        this.care.updateProfile({
          ...this.care.snapshot.profile,
          photo: photo.webPath,
        });
      }
    } catch {
      await this.showMessage(
        'Photo unavailable',
        'Allow camera or photo-library access to choose a profile picture.',
      );
    }
  }

  async shareLocationData(): Promise<void> {
    if (this.sharingLocationData) return;
    if (!Capacitor.isNativePlatform()) {
      await this.showMessage(
        'Native app required',
        'Location export is available from the installed Android or iOS app.',
      );
      return;
    }

    const confirmation = await this.alertController.create({
      header: 'Share precise location data?',
      message:
        'The JSON file contains your exact coordinates and timestamps from the last 48 hours. It will be shared with the app you choose. Only share it with an authorized recipient.',
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        { text: 'Continue', role: 'confirm' },
      ],
    });
    await confirmation.present();
    const { role } = await confirmation.onDidDismiss();
    if (role !== 'confirm') return;

    await this.createAndShareLocationExport();
  }

  private async createAndShareLocationExport(): Promise<void> {
    this.sharingLocationData = true;
    const endTime = Date.now();
    const startTime = endTime - 48 * 60 * 60 * 1000;
    const fileName = `aaptha-location-history-${endTime}.json`;
    let fileCreated = false;

    try {
      await this.locationDatabase.syncNativeLocationLog(
        this.care.snapshot.shiftStartedAt,
      );
      const locations = await this.locationDatabase.getLocationsSince(startTime);
      if (locations.length === 0) {
        await this.showMessage(
          'No location data found',
          'There are no saved location records from the last 48 hours.',
        );
        return;
      }

      const canShare = await Share.canShare();
      if (!canShare.value) {
        await this.showMessage(
          'Sharing unavailable',
          'This device does not support sharing a JSON file.',
        );
        return;
      }

      const exportData = {
        formatVersion: 1,
        generatedAt: new Date(endTime).toISOString(),
        period: {
          from: new Date(startTime).toISOString(),
          to: new Date(endTime).toISOString(),
        },
        recordCount: locations.length,
        locations: locations.map((location) => ({
          shiftStartedAt: location.shift_started_at,
          latitude: location.latitude,
          longitude: location.longitude,
          accuracyMeters: location.accuracy,
          altitudeMeters: location.altitude,
          altitudeAccuracyMeters: location.altitude_accuracy,
          speedMetersPerSecond: location.speed,
          bearingDegrees: location.bearing,
          simulated: location.simulated === 1,
          capturedAt: new Date(location.captured_at).toISOString(),
        })),
      };

      const file = await Filesystem.writeFile({
        path: fileName,
        data: JSON.stringify(exportData, null, 2),
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
      fileCreated = true;
      await Share.share({
        title: 'Aaptha Care location history',
        text: `${locations.length} location records · last 48 hours`,
        files: [file.uri],
        dialogTitle: 'Share location history',
      });
    } catch {
      await this.showMessage(
        'Could not share location data',
        'The location export could not be prepared or shared. Please try again.',
      );
    } finally {
      if (fileCreated) {
        try {
          await Filesystem.deleteFile({
            path: fileName,
            directory: Directory.Cache,
          });
        } catch {
          console.warn('Could not remove the temporary location export file.');
        }
      }
      this.sharingLocationData = false;
    }
  }

  setTheme(theme: ThemeChoice): void {
    this.care.setTheme(theme);
  }

  async protectedAadhaar(): Promise<void> {
    await this.showMessage(
      'Aadhaar is protected',
      'Only a masked placeholder is shown. No Aadhaar number is stored in this preview, so there is no full value to reveal.',
    );
  }

  async notConnected(feature: string): Promise<void> {
    await this.showMessage(
      feature,
      'This feature needs an account, identity, or security service and is not connected in this preview.',
    );
  }

  openChat(): void {
    void this.router.navigateByUrl('/chat');
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
