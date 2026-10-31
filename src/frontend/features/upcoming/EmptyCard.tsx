import { Card, CardBody, type Glow } from "../../ui/Card";

// A card for a section that is not wired up yet. It says so, and holds nothing.
export function EmptyCard({ title, empty, glow }: { title: string; empty: string; glow: Glow }) {
  return (
    <Card glow={glow}>
      <CardBody title={title} className="">
        <p className="py-6 text-center opacity-60">{empty}</p>
      </CardBody>
    </Card>
  );
}
