import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { SimulationProvider } from "./store/SimulationContext";
import { NotificationProvider } from "./store/NotificationContext";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <SimulationProvider>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </SimulationProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
