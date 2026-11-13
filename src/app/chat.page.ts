import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CareAppService } from './services/care-app.service';

type ChatMessage = { id: number; from: 'employee' | 'assistant'; text: string };

@Component({
  selector: 'app-chat',
  templateUrl: 'chat.page.html',
  styleUrls: ['chat.page.scss'],
  standalone: false,
})
export class ChatPage {
  private readonly care = inject(CareAppService);
  private readonly router = inject(Router);
  readonly state$ = this.care.state$;
  draft = '';
  readonly suggestions = [
    'How do I check my next shift?',
    'How do I report a missed visit?',
    'Who can help with a policy question?',
  ];
  messages: ChatMessage[] = [
    {
      id: 0,
      from: 'assistant',
      text: 'Hello, Asha. I can help you find the right place for shift, HR, or care questions.',
    },
  ];

  shiftContext(): string {
    const startedAt = this.care.snapshot.shiftStartedAt;
    return startedAt
      ? `Clocked in since ${new Date(startedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`
      : 'Not currently clocked in';
  }

  sendMessage(question = this.draft): void {
    const text = question.trim();
    if (!text) return;
    const now = Date.now();
    this.messages = [
      ...this.messages,
      { id: now, from: 'employee', text },
      {
        id: now + 1,
        from: 'assistant',
        text: 'The organization’s AI service is not connected in this preview, so I cannot confirm schedules or policy details. Please check Updates or contact your care coordinator.',
      },
    ];
    this.draft = '';
  }

  goBack(): void {
    void this.router.navigateByUrl('/tabs/home');
  }
}
