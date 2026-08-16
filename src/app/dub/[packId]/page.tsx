import { DubPage } from "@/components/DubPage";

export default async function Page({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  return <DubPage packId={packId} />;
}
