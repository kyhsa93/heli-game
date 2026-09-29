import strings from './strings.ko.json';

type Params = Record<string, string | number>;
type Node = string | string[] | string[][] | { [k: string]: Node };

function lookup(key: string): Node | undefined {
  let node: Node | undefined = strings as Node;
  for (const part of key.split('.')) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return undefined;
    node = (node as Record<string, Node>)[part];
  }
  return node;
}

function fill(s: string, params?: Params) {
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? String(params[k]) : m)) : s;
}

export function hasString(key: string) {
  return lookup(key) !== undefined;
}

export function t(key: string, params?: Params): string {
  const v = lookup(key);
  if (typeof v !== 'string') return key;
  return fill(v, params);
}

export function tList(key: string, params?: Params): string[] {
  const v = lookup(key);
  return Array.isArray(v) ? (v as string[]).map(s => fill(String(s), params)) : [];
}

export function tPairs(key: string): [string, string][] {
  const v = lookup(key);
  return Array.isArray(v) ? (v as string[][]).map(p => [p[0], p[1]] as [string, string]) : [];
}
