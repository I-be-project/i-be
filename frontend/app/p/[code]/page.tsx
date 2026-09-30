import { redirect } from "next/navigation";

export default async function PublicIndex({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  redirect(`/p/${encodeURIComponent(code)}/home`);
}
