export const ZONES = ['UTTARA', 'AIRPORT', 'BANANI', 'GULSHAN_1', 'MOHAKHALI', 'FARMGATE'] as const;
export type Zone = (typeof ZONES)[number];

export const ZONE_LABELS: Record<Zone, string> = {
  UTTARA: 'Uttara',
  AIRPORT: 'Airport',
  BANANI: 'Banani',
  GULSHAN_1: 'Gulshan 1',
  MOHAKHALI: 'Mohakhali',
  FARMGATE: 'Farmgate',
};
