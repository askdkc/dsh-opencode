import type { CommandResult } from '@deepseek-ai/dsh-commands/types'

/** Browser-local notice: only a command submitted here opens it. */
export class CommandNoticeController {
  private text: string | undefined
  private listeners = new Set<() => void>()

  getSnapshot = (): string | undefined => this.text
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  show(name: string, result: CommandResult): void {
    if (name !== 'dsh-opencode' || !result.text?.trim()) return
    this.text = result.text
    this.notify()
  }

  close = (): void => {
    this.text = undefined
    this.notify()
  }

  dispose(): void {
    this.text = undefined
    this.listeners.clear()
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }
}
