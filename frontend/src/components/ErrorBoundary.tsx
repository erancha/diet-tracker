import { Component, type ReactNode } from "react";

/**
 * Last-resort catch for render-time crashes anywhere below it: shows a Hebrew refresh
 * prompt instead of the blank page React leaves after an uncaught render error.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { crashed: boolean }> {
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (this.state.crashed) {
      return (
        <main>
          <div className="alert">משהו השתבש. רעננו את הדף ונסו שוב. <a href="/">חזרה למסך הראשי</a></div>
        </main>
      );
    }
    return this.props.children;
  }
}
