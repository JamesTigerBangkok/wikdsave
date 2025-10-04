import "./globals.css";
import Navbar from "./components/Navbar";

export const metadata = {
  title: "WildSave – Wildlife Rescue On-Chain Registry",
  description: "FHEVM + Sepolia Testnet Demo",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Navbar />
        <main className="max-w-7xl mx-auto px-6 pb-12">
          {children}
        </main>
      </body>
    </html>
  );
}
