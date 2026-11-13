import { Component, inject } from '@angular/core';
import {
  CareAppService,
  NotificationCategory,
  AppState,
} from '../services/care-app.service';

interface CategoryOption {
  key: NotificationCategory;
  label: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-tab2',
  templateUrl: 'tab2.page.html',
  styleUrls: ['tab2.page.scss'],
  standalone: false,
})
export class Tab2Page {
  private readonly care = inject(CareAppService);
  readonly state$ = this.care.state$;
  readonly categories: CategoryOption[] = [
    {
      key: 'schedule',
      label: 'Schedule',
      description: 'Shift and visit updates',
      icon: 'calendar-outline',
    },
    {
      key: 'policy',
      label: 'Policy',
      description: 'Care guidance and policy changes',
      icon: 'shield-checkmark-outline',
    },
    {
      key: 'payroll',
      label: 'Payroll',
      description: 'Timesheet and pay reminders',
      icon: 'cash-outline',
    },
    {
      key: 'announcement',
      label: 'Company news',
      description: 'Announcements from your organization',
      icon: 'megaphone-outline',
    },
    {
      key: 'safety',
      label: 'Safety',
      description: 'Emergency contact and safety reminders',
      icon: 'heart-outline',
    },
  ];

  unreadCount(state: AppState): number {
    return state.notifications.filter((notification) => notification.unread)
      .length;
  }

  visibleNotifications(state: AppState): AppState['notifications'] {
    return state.notifications.filter(
      (notification) => state.preferences[notification.category],
    );
  }

  categoryIcon(category: NotificationCategory): string {
    return (
      this.categories.find((option) => option.key === category)?.icon ??
      'notifications-outline'
    );
  }

  markAllAsRead(state: AppState): void {
    this.care.setNotifications(
      state.notifications.map((item) => ({ ...item, unread: false })),
    );
  }

  markAsRead(id: string, state: AppState): void {
    this.care.setNotifications(
      state.notifications.map((item) =>
        item.id === id ? { ...item, unread: false } : item,
      ),
    );
  }

  togglePreference(category: NotificationCategory): void {
    const preferences = { ...this.care.snapshot.preferences };
    preferences[category] = !preferences[category];
    this.care.setPreferences(preferences);
  }

  toggleQuietHours(): void {
    this.care.setQuietHours(!this.care.snapshot.quietHours);
  }
}
