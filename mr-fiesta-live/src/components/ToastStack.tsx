import { CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ToastMessage } from '../types/domain'

export function ToastStack({ messages }: { messages: ToastMessage[] }) {
  return <div className="toast-stack" aria-live="polite">
    {messages.map((message) => <div key={message.id} className={`toast ${message.kind ?? 'success'}`}>
      {message.kind === 'error' ? <XCircle /> : message.kind === 'info' ? <Info /> : <CheckCircle2 />}
      <div><strong>{message.title}</strong>{message.body && <span>{message.body}</span>}</div>
    </div>)}
  </div>
}
