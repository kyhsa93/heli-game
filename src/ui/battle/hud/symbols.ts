export type Owner = 'coalition' | 'veros' | 'neutral';

export const COLORS = { friend: '#4cc9f0', enemy: '#ff9f1c', neutral: '#e8eef7', text: '#e8eef7' } as const;

export function pointSymbol(owner: Owner, contested: boolean) {
  if (contested) return '⊘';
  return owner === 'coalition' ? '■' : owner === 'veros' ? '▲' : '○';
}

export function pointColor(owner: Owner, side: 'coalition' | 'veros') {
  return owner === 'neutral' ? COLORS.neutral : owner === side ? COLORS.friend : COLORS.enemy;
}

export function sideSymbol(side: string) {
  return side === 'coalition' ? '■' : side === 'veros' ? '▲' : '';
}
