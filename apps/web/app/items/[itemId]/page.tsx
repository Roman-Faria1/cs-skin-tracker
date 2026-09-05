import { ItemDetailDashboard } from "../../../src/components/item-detail-dashboard";

export default async function ItemPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;

  return <ItemDetailDashboard itemId={itemId} />;
}
