import type { Metadata } from "next";
import { PublicProfileProvider } from "@/components/tabs/ProfileView";
import { BottomNav } from "@/components/nav/BottomNav";

export const metadata: Metadata = {
  title: "공유된 한마당",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function PublicLayout({ children, params }: {
  children: React.ReactNode;
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return <PublicProfileProvider key={code} code={code}>
    {children}<BottomNav basePath={`/p/${code}`} />
  </PublicProfileProvider>;
}
