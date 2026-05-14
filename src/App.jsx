import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import QADashboard from "./components/QADashboard"; // Apna naya component yahan import kar
import { IngestionProvider } from "./context/IngestionContext";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
  return (
    <IngestionProvider>
      {/* BrowserRouter tere app mein URLs enable karta hai */}
      <BrowserRouter>
        <Routes>
          {/* Default Route: Tera main upload wala Dashboard */}
          <Route path="/" element={<Dashboard />} />
          
          {/* Naya QA Route: Tera data integrity check karne wala page */}
          <Route path="/qa" element={<QADashboard />} />
        </Routes>
      </BrowserRouter>
      
      {/* ToastContainer ko routes ke bahar rakhne se woh har page pe kaam karega */}
      <ToastContainer position="top-right" autoClose={3000} />
    </IngestionProvider>
  );
}

export default App;