import { Component, type ReactNode } from 'react'

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    if (!this.state.failed) return this.props.children

    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 text-center">
        <p className="text-ember">No se pudieron cargar tus datos.</p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="min-h-11 rounded-xl border border-line bg-raised text-ink"
        >
          Reintentar
        </button>
      </main>
    )
  }
}
