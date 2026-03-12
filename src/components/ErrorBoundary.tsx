import React from 'react';

interface ErrorBoundaryProps {
  fallback?: React.ReactNode;
  children?: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message?: string;
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return (
          <div>
            {this.props.fallback}
            {this.state.message && (
              <div style={{ padding: 16 }}>
                <p style={{ color: '#ef4444' }}><b>Error:</b> {this.state.message}</p>
              </div>
            )}
          </div>
        );
      }
      return (
        <div style={{ padding: 24 }}>
          <h2>Something went wrong in this section.</h2>
          <p>{this.state.message || 'An unexpected error occurred.'}</p>
        </div>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
