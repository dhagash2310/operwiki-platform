'use client';
import AppLayout from '../../components/layout/AppLayout';
import AIChat from '../../components/chat/AIChat';

export default function ChatPage() {
  return (
    <AppLayout>
      <div className="h-[calc(100vh-3.5rem)]">
        <AIChat />
      </div>
    </AppLayout>
  );
}
