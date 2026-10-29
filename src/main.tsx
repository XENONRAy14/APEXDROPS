import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { loadCatalog } from "./catalog";
import "./style.css";
class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { error: boolean }
> {
  state = { error: false };
  static getDerivedStateFromError() {
    return { error: true };
  }
  render() {
    return this.state.error ? (
      <main className="fatal">
        <h1>Un arrêt au stand imprévu.</h1>
        <p>Recharge la page pour retrouver ton garage.</p>
        <button onClick={() => location.reload()}>Recharger</button>
      </main>
    ) : (
      this.props.children
    );
  }
}
const root = createRoot(document.getElementById("root")!);
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
loadCatalog().then(
  () =>
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    ),
  () =>
    root.render(
      <main className="fatal">
        <h1>Catalogue indisponible.</h1>
        <p>Vérifie ta connexion puis recharge la page.</p>
        <button onClick={() => location.reload()}>Recharger</button>
      </main>,
    ),
);
