import { StudioApp } from "@/components/studio/StudioApp";

export default async function StudioPage({
  searchParams,
}: {
  searchParams: Promise<{ pack?: string }>;
}) {
  const { pack } = await searchParams;
  return <StudioApp editId={pack} />;
}
