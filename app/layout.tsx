import type {Metadata} from "next";import "./globals.css";import {ProjectProvider} from "@/components/project-provider";import {AppShell} from "@/components/app-shell";
export const metadata:Metadata={title:"StoryFrame AI",description:"Turn long stories into consistent cinematic scenes."};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><ProjectProvider><AppShell>{children}</AppShell></ProjectProvider></body></html>}
