import { Component, StrictMode, type ReactNode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import App from "./App"
import { StoreProvider } from "./store"

// If anything breaks mid-demo, offer a clean restart instead of a blank page.
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div style={{ display: "grid", placeItems: "center", height: "100%", padding: 24, textAlign: "center" }}>
        <div>
          <p style={{ fontWeight: 700, fontSize: 18 }}>Something in the prototype broke.</p>
          <p style={{ color: "var(--ink-2)", margin: "8px 0 16px" }}>Reset the example data and start again.</p>
          <button
            type="button"
            style={{ background: "var(--cobalt)", color: "white", border: 0, borderRadius: 999, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
            onClick={() => {
              try {
                localStorage.removeItem("plato-proto-c-v1")
              } catch {
                /* storage blocked */
              }
              location.hash = "#chat"
              location.reload()
            }}
          >
            Reset prototype
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Boundary>
      <StoreProvider>
        <App />
      </StoreProvider>
    </Boundary>
  </StrictMode>,
)
