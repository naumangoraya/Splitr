import { Component, type ReactNode } from 'react';
import { ErrorState } from '@/components/ui';

// Catches any render/runtime error in the screen tree and shows a friendly
// retry screen instead of a blank white page. Reloading remounts the app fresh.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-app items-center justify-center bg-canvas px-6">
          <ErrorState
            message="Something went wrong. Please try again."
            onRetry={() => { this.setState({ error: null }); window.location.reload(); }}
          />
        </div>
      );
    }
    return this.props.children;
  }
}
