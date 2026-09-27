import { Zone, shortestDistanceKm } from './routes';

export const BASE_FARE_POYSHA = 3000;
export const PER_KM_POYSHA = 1500;
export const POOL_DISCOUNT_PERCENT = 0.20;
export const MAX_VEHICLE_CAPACITY = 3;

export interface FareCalculation {
  distanceKm: number;
  baseFarePoysha: number;
  distanceChargePoysha: number;
  soloFarePoysha: number;
  poolDiscountPoysha: number;
  perSeatFarePoysha: number;
  totalFarePoysha: number;
  seatCount: number;
}

export function calculateFare(
  pickupZone: Zone,
  dropoffZone: Zone,
  requestedSeats: number = 1
): FareCalculation {
  const distanceKm = shortestDistanceKm(pickupZone, dropoffZone);
  const distanceChargePoysha = distanceKm * PER_KM_POYSHA;
  const soloFarePoysha = BASE_FARE_POYSHA + distanceChargePoysha;
  const poolDiscountPoysha = Math.floor(soloFarePoysha * POOL_DISCOUNT_PERCENT);
  const perSeatFarePoysha = soloFarePoysha - poolDiscountPoysha;
  const totalFarePoysha = perSeatFarePoysha * requestedSeats;

  return {
    distanceKm,
    baseFarePoysha: BASE_FARE_POYSHA,
    distanceChargePoysha,
    soloFarePoysha,
    poolDiscountPoysha,
    perSeatFarePoysha,
    totalFarePoysha,
    seatCount: requestedSeats,
  };
}
