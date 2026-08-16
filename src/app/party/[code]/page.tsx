import { PartyRoom } from "@/components/party/PartyRoom";

export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <PartyRoom code={code.toUpperCase()} />;
}
