import React from "react";
import Dashboard from "./pages/Dashboard";
import { IngestionProvider } from "./context/IngestionContext";

function App() {
  return (
    <IngestionProvider>
      <Dashboard />
    </IngestionProvider>
  );
}

export default App;