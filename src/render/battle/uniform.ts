export const UNIFORM = {
  coalition: { cloth: 0x5d6b3e, gear: 0x3f4a2b },
  veros: { cloth: 0x7a6a55, gear: 0x4d4234 },
} as const;

export type UniformSide = keyof typeof UNIFORM;
