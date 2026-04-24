import React from "react";
import Dashboard from "./pages/Dashboard";
import { IngestionProvider } from "./context/IngestionContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
  return (
    <IngestionProvider>
      <Dashboard />
      <ToastContainer position="top-right" autoClose={3000} />
    </IngestionProvider>
  );
}

export default App;