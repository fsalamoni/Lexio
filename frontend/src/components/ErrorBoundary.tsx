import { Component, ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props { children: ReactNode }
interface State {
  error: Error | null
  retryCount: number
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, retryCount: 0 }

  static getDerivedStateFromError(error: Error): Pick<State, 'error'> {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    console.error('[Lexio ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Algo deu errado</h2>
            <p className="text-gray-500 text-sm mb-6">
              Ocorreu um erro inesperado nesta seção. Os dados não foram perdidos.
            </p>
            <details className="mb-6 text-left bg-gray-50 rounded-lg p-3 text-xs text-gray-600 cursor-pointer">
              <summary className="font-medium cursor-pointer">Detalhes do erro</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words">
                {this.state.error.message}
              </pre>
            </details>
            <button
              onClick={() => {
                this.setState(prev => ({
                  error: null,
                  retryCount: prev.retryCount + 1,
                }))
              }}
              className="inline-flex items-center gap-2 bg-brand-600 text-white px-5 py-2.5 rounded-lg hover:bg-brand-700 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
            <button
              onClick={() => window.location.reload()}
              className="ml-2 inline-flex items-center gap-2 bg-gray-200 text-gray-700 px-5 py-2.5 rounded-lg hover:bg-gray-300 transition-colors"
            >
              Recarregar página
            </button>
          </div>
        </div>
      )
    }
    return <div key={this.state.retryCount}>{this.props.children}</div>
  }
}
