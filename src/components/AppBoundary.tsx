import { Component, type ReactNode } from 'react';

/** Catches a crash inside one app so the rest of the OS keeps running. Used by desktop windows and mobile apps. */
export class AppBoundary extends Component<{ children: ReactNode; onClose: () => void }, { error: string | null }> {
  state = { error: null as string | null };

  static getDerivedStateFromError(error: Error) {
    return { error: error.message || 'This window hit an unexpected error.' };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-error">
          <p>This window stopped.</p>
          <p>{this.state.error}</p>
          <button type="button" className="btn btn-primary" onClick={this.props.onClose}>Close window</button>
        </div>
      );
    }
    return this.props.children;
  }
}