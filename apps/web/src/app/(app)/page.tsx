import { ComingSoon } from "@/components/coming-soon";

export default function TodayPage() {
  return (
    <ComingSoon title="Hoy" delivery={5}>
      Aquí verás lo que requiere atención: gastos sin soporte, lo que se deben los socios y, más adelante, cobros por vencer.
    </ComingSoon>
  );
}
