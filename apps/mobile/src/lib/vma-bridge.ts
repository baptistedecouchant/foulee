// Résultat d'un test VMA couru dans l'app, transmis à l'écran du plan quand on y revient.
let pending: { planId: string; meters: number } | null = null;

export function setPendingVma(planId: string, meters: number) {
  pending = { planId, meters };
}

export function takePendingVma(planId: string): number | null {
  if (!pending || pending.planId !== planId) return null;
  const m = pending.meters;
  pending = null;
  return m;
}
