import { Component, inject } from '@angular/core';
import { AlertController } from '@ionic/angular';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Router } from '@angular/router';
import {
  CareAppService,
  EmployeeProfile,
  EmergencyContact,
  ThemeChoice,
} from '../services/care-app.service';

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
