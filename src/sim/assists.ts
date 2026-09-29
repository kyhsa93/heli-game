export interface Assists {
  autoIdentify: boolean;
  autoCountermeasures: boolean;
}

export const DEFAULT_ASSISTS: Assists = { autoIdentify: false, autoCountermeasures: false };
