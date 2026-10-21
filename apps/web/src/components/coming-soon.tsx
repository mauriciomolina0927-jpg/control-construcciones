import { Card } from "./ui";

export function ComingSoon({ title, delivery, children }: { title: string; delivery: number; children: string }) {
  return (
    <>
      <h1 className="text-xl font-bold">{title}</h1>
      <Card>
        <p className="text-sm text-foreground/70">{children}</p>
        <p className="mt-3 text-xs text-foreground/50">Llega en la entrega {delivery}.</p>
      </Card>
    </>
  );
}
