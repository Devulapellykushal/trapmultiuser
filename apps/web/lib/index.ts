// Utility functions and API client placeholder
// Future exports will be defined here

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === "development"
    ? "http://localhost:8000"
    : "https://trapmultiuser.onrender.com");
