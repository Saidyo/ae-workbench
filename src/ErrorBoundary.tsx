import React from "react";

interface ErrorBoundaryState {
  error?: Error;
}

export class ErrorBoundary extends React.Component<React.PropsWithChildren, ErrorBoundaryState> {
  state: ErrorBoundaryState = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <main className="crash-screen">
          <section>
            <h1>页面启动失败</h1>
            <p>{this.state.error.message}</p>
            <button onClick={() => window.location.reload()}>重新加载</button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

