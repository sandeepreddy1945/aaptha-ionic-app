import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Geolocation } from '@capacitor/geolocation';
import { BackgroundGeolocation } from '@capgo/background-geolocation';

export type TrackingStatus =
  'off' | 'starting' | 'background' | 'foreground' | 'unavailable';
export type ThemeChoice = 'system' | 'light' | 'dark';
export type NotificationCategory =
  'schedule' | 'policy' | 'payroll' | 'announcement' | 'safety';

export interface EmployeeProfile {
  name: string;
  employeeId: string;
  email: string;
  phone: string;
  address: string;
  photo?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  relationship: string;
  phone: string;
  email: string;
}

export interface CareNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export interface AppState {
  profile: EmployeeProfile;
  contacts: EmergencyContact[];
  shiftStartedAt: string | null;
  trackingStatus: TrackingStatus;
  lastLocationAt: number | null;
  notifications: CareNotification[];
  preferences: Record<NotificationCategory, boolean>;
  quietHours: boolean;
  theme: ThemeChoice;
}

const CONSENT_VERSION = '2026-01';
const SHIFT_STORAGE_KEY = 'aaptha.active-shift-start';
const CONSENT_STORAGE_KEY = 'aaptha.location-consent';
const NOTIFICATION_STORAGE_KEY = 'aaptha.notifications';
const PREFERENCES_STORAGE_KEY = 'aaptha.notification-preferences';
const THEME_STORAGE_KEY = 'aaptha.theme';

const DEFAULT_NOTIFICATIONS: CareNotification[] = [
  {
    id: 'shift-reminder',
    category: 'schedule',
    title: 'Your visit starts soon',
    body: 'Your sample visit with Mrs. Lakshmi is scheduled for 8:00 AM today.',
    time: 'Today · 7:30 AM',
    unread: true,
  },
  {
    id: 'schedule-change',
    category: 'schedule',
    title: 'Schedule confirmed',
    body: 'Your next shift is ready to review. Check your schedule before travelling.',
    time: 'Yesterday · 4:15 PM',
    unread: true,
  },
  {
    id: 'policy-update',
    category: 'policy',
    title: 'Care policy update',
    body: 'Please review the latest guidance from your care coordinator.',
    time: 'Nov 10 · 11:00 AM',
    unread: false,
  },
  {
    id: 'payroll',
    category: 'payroll',
    title: 'Timesheet review reminder',
    body: 'Confirm your visit notes and hours before the weekly payroll review.',
    time: 'Nov 9 · 9:20 AM',
    unread: false,
  },
  {
    id: 'emergency-contact-review',
    category: 'safety',
    title: 'Review your emergency contacts',
    body: 'Add at least one trusted contact and confirm these details every 6–12 months.',
    time: 'Reminder',
    unread: true,
  },
];

function readStored<T>(key: string, fallback: T): T {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
}

function getStoredShift(): string | null {
  try {
    return localStorage.getItem(SHIFT_STORAGE_KEY);
  } catch {
    return null;
  }
}

@Injectable({ providedIn: 'root' })
export class CareAppService {
  private readonly stateSubject = new BehaviorSubject<AppState>({
    profile: {
      name: 'Asha Sharma',
      employeeId: 'AAP-1048',
      email: 'asha@example.com',
      phone: '',
      address: '',
    },
    contacts: [],
    shiftStartedAt: getStoredShift(),
    trackingStatus: 'off',
    lastLocationAt: null,
    notifications: readStored(NOTIFICATION_STORAGE_KEY, DEFAULT_NOTIFICATIONS),
    preferences: readStored(PREFERENCES_STORAGE_KEY, {
      schedule: true,
      policy: true,
      payroll: true,
      announcement: true,
      safety: true,
    }),
    quietHours: true,
    theme: this.readTheme(),
  });

  readonly state$ = this.stateSubject.asObservable();

  get snapshot(): AppState {
    return this.stateSubject.value;
  }

  constructor() {
    this.applyTheme(this.snapshot.theme);
  }

  private readTheme(): ThemeChoice {
    try {
      const theme = localStorage.getItem(THEME_STORAGE_KEY);
      return theme === 'light' || theme === 'dark' ? theme : 'system';
    } catch {
      return 'system';
    }
  }

  private update(patch: Partial<AppState>): void {
    this.stateSubject.next({ ...this.snapshot, ...patch });
  }

  private hasCurrentConsent(): boolean {
    try {
      const consent = localStorage.getItem(CONSENT_STORAGE_KEY);
      if (!consent) return false;
      return (
        (JSON.parse(consent) as { version?: string }).version ===
        CONSENT_VERSION
      );
    } catch {
      return false;
    }
  }

  private saveConsent(): void {
    try {
      localStorage.setItem(
        CONSENT_STORAGE_KEY,
        JSON.stringify({
          version: CONSENT_VERSION,
          acceptedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // The active session can still continue if browser storage is unavailable.
    }
  }

  async startShift(consentAccepted: boolean): Promise<TrackingStatus> {
    if (!consentAccepted && !this.hasCurrentConsent()) {
      throw new Error(
        'Review and accept the location-sharing notice before clocking in.',
      );
    }

    if (!this.hasCurrentConsent()) this.saveConsent();
    const startedAt = new Date().toISOString();
    try {
      localStorage.setItem(SHIFT_STORAGE_KEY, startedAt);
    } catch {
      // Keep the shift active for this session if storage is unavailable.
    }
    this.update({
      shiftStartedAt: startedAt,
      trackingStatus: 'starting',
      lastLocationAt: null,
    });
    return this.startTracking();
  }

  async resumeActiveShift(): Promise<void> {
    if (!this.snapshot.shiftStartedAt || this.snapshot.trackingStatus !== 'off')
      return;
    if (!this.hasCurrentConsent()) {
      this.update({ trackingStatus: 'unavailable' });
      return;
    }
    await this.startTracking();
  }

  private async startTracking(): Promise<TrackingStatus> {
    if (!Capacitor.isNativePlatform()) {
      this.update({ trackingStatus: 'foreground' });
      return 'foreground';
    }

    try {
      const foreground = await Geolocation.requestPermissions({
        permissions: ['location'],
      });
      if (foreground.location !== 'granted') {
        this.update({ trackingStatus: 'unavailable' });
        return 'unavailable';
      }

      const permission = await BackgroundGeolocation.requestPermissions({
        permissions: ['backgroundLocation', 'notification'],
      });
      const backgroundAllowed =
        permission.backgroundLocation === 'granted' ||
        permission.backgroundLocation === 'always';

      await BackgroundGeolocation.start(
        {
          backgroundTitle: 'Aaptha Care · Shift tracking',
          backgroundMessage:
            'Location tracking is active only during your clocked-in shift.',
          requestPermissions: false,
          stale: false,
          distanceFilter: 0,
          minIntervalMs: 2 * 60 * 1000,
          locationLog: true,
          locationLogMaxEntries: 20000,
        },
        (location, error) => {
          if (error) {
            this.update({ trackingStatus: 'unavailable' });
            return;
          }
          if (location)
            this.update({ lastLocationAt: location.time ?? Date.now() });
        },
      );

      const trackingStatus: TrackingStatus = backgroundAllowed
        ? 'background'
        : 'foreground';
      this.update({ trackingStatus });
      return trackingStatus;
    } catch {
      this.update({ trackingStatus: 'unavailable' });
      return 'unavailable';
    }
  }

  async endShift(): Promise<void> {
    try {
      if (Capacitor.isNativePlatform()) await BackgroundGeolocation.stop();
    } finally {
      try {
        localStorage.removeItem(SHIFT_STORAGE_KEY);
      } catch {
        // Clearing the in-memory shift state is still required.
      }
      this.update({
        shiftStartedAt: null,
        trackingStatus: 'off',
        lastLocationAt: null,
      });
    }
  }

  updateProfile(profile: EmployeeProfile): void {
    this.update({ profile: { ...profile } });
  }

  saveContact(contact: EmergencyContact): void {
    const current = this.snapshot.contacts;
    const exists = current.some((item) => item.id === contact.id);
    const contacts = exists
      ? current.map((item) => (item.id === contact.id ? { ...contact } : item))
      : [...current, { ...contact }];
    this.update({ contacts: contacts.slice(0, 3) });
    this.updateEmergencyContactReminder();
  }

  removeContact(id: string): void {
    this.update({
      contacts: this.snapshot.contacts.filter((contact) => contact.id !== id),
    });
    this.updateEmergencyContactReminder();
  }

  moveContact(index: number, direction: -1 | 1): void {
    const contacts = [...this.snapshot.contacts];
    const target = index + direction;
    if (target < 0 || target >= contacts.length) return;
    [contacts[index], contacts[target]] = [contacts[target], contacts[index]];
    this.update({ contacts });
  }

  private updateEmergencyContactReminder(): void {
    const notifications = this.snapshot.notifications.map((item) =>
      item.id === 'emergency-contact-review'
        ? { ...item, unread: this.snapshot.contacts.length === 0 }
        : item,
    );
    this.setNotifications(notifications);
  }

  setNotifications(notifications: CareNotification[]): void {
    this.update({ notifications });
    try {
      localStorage.setItem(
        NOTIFICATION_STORAGE_KEY,
        JSON.stringify(notifications),
      );
    } catch {
      // Notifications remain available in memory for this session.
    }
  }

  setPreferences(preferences: Record<NotificationCategory, boolean>): void {
    this.update({ preferences });
    try {
      localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify(preferences),
      );
    } catch {
      // Preferences remain available in memory for this session.
    }
  }

  setQuietHours(quietHours: boolean): void {
    this.update({ quietHours });
  }

  setTheme(theme: ThemeChoice): void {
    this.update({ theme });
    this.applyTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // The selected theme remains active for this session.
    }
  }

  private applyTheme(theme: ThemeChoice): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.classList.toggle('light', theme === 'light');
    if (theme === 'system') {
      document.documentElement.classList.remove('light');
    }
  }
}
