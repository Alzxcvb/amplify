import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata = {
  title: "Amplify Dashboard",
  description: "Organic marketing bot activity dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </body>
    </html>
  );
}
