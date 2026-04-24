import "./globals.css";
import { Cormorant_Garamond, Manrope } from "next/font/google";

const titleFont = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-title"
});

const bodyFont = Manrope({
  subsets: ["latin"],
  variable: "--font-body"
});

export const metadata = {
  title: "InkDrop",
  description: "A private writing sanctuary for notes, poetry, and thoughts."
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${titleFont.variable} ${bodyFont.variable}`}>{children}</body>
    </html>
  );
}
