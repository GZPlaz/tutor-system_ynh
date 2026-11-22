/**
 * Last line of defence: if a page crashes while rendering, show a calm message with a way
 * forward instead of a blank screen. Resets when the address changes.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

export class ErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="page">
        <div className="empty" role="alert">
          <h3>Something went wrong on this page</h3>
          <p>Your data is safe. Reload the page to try again. If it keeps happening, tell an administrator what you were doing.</p>
          <div className="button-row">
            <button className="btn primary" onClick={() => window.location.reload()}>Reload page</button>
            <a className="btn secondary" href={import.meta.env.BASE_URL}>Go to home</a>
          </div>
        </div>
      </div>
    );
  }
}
