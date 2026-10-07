import { Component, type ReactNode } from 'react';

/** Keeps a render error in one page from blanking the whole app. */
export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidUpdate(previous: { resetKey?: string }) {
    if (previous.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-lg font-semibold text-ink">Something went wrong on this page</h1>
        <p className="mt-2 text-sm text-ink-3">{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()} className="focus-ring mt-6 inline-flex h-9 items-center rounded-md bg-ink px-4 text-sm font-medium text-white hover:bg-ink-2">
          Reload
        </button>
      </div>
    );
  }
}
