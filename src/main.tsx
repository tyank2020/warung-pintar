import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import { AuthGate } from "./components/AuthGate"
import { AuthProvider } from "./lib/auth"
import { WarungProvider } from "./lib/store"
import "./index.css"
import "./theme.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AuthProvider>
      <AuthGate>
        <WarungProvider>
          <App />
        </WarungProvider>
      </AuthGate>
    </AuthProvider>
  </React.StrictMode>,
)
