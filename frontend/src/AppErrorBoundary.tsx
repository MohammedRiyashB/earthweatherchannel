import React from "react";

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Prevent an unexpected React render exception from leaving a blank page.
 * Network/API failures should continue to use their local loading/error states.
 */
export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("EARTH WEATHER UI render error", error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <main
        role="alert"
        aria-live="assertive"
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#f4f6f8",
          color: "#202b35",
          fontFamily: "Inter, Arial, sans-serif",
        }}
      >
        <section
          style={{
            width: "min(100%, 520px)",
            padding: "28px",
            border: "1px solid #e2e7ec",
            borderRadius: "22px",
            background: "#fff",
            boxShadow: "0 16px 44px rgba(15, 35, 55, .10)",
          }}
        >
          <p style={{ margin: "0 0 8px", color: "#c52b2b", fontWeight: 800, letterSpacing: ".08em" }}>
            EARTH WEATHER
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "clamp(24px, 5vw, 32px)", lineHeight: 1.15 }}>
            This page needs to be refreshed.
          </h1>
          <p style={{ margin: "0 0 22px", color: "#5d6873", lineHeight: 1.65 }}>
            An unexpected display error interrupted this page. Your weather service may still be available.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              minHeight: "46px",
              padding: "0 20px",
              border: 0,
              borderRadius: "999px",
              background: "#252422",
              color: "#fff",
              font: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reload EARTH WEATHER
          </button>
        </section>
      </main>
    );
  }
}
