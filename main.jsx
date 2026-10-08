import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import HostingAccess from "./components/HostingAccess";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HostingAccess><App /></HostingAccess>
  </React.StrictMode>
);
