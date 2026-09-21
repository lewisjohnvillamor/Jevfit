import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title:"JevFit — Resume & Job Match Analysis", description:"Compare a resume with any job posting and get a fast, explainable competency score.", icons:{icon:"/favicon.svg",shortcut:"/favicon.svg"} };
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="en"><body>{children}</body></html>}
