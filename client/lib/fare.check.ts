import { previewFare, shortestDistanceKm } from './fare';

const distanceCases: Array<[string, string, number]> = [
  ['BANANI', 'MOHAKHALI', 4],
  ['MOHAKHALI', 'BANANI', 4],
  ['BANANI', 'GULSHAN_1', 2],
  ['GULSHAN_1', 'BANANI', 2],
  ['BANANI', 'FARMGATE', 7],
  ['FARMGATE', 'BANANI', 7],
  ['BANANI', 'AIRPORT', 5],
  ['AIRPORT', 'BANANI', 5],
  ['BANANI', 'UTTARA', 11],
  ['UTTARA', 'BANANI', 11],
  ['UTTARA', 'FARMGATE', 18],
  ['FARMGATE', 'UTTARA', 18],
  ['AIRPORT', 'MOHAKHALI', 9],
  ['MOHAKHALI', 'AIRPORT', 9],
  ['AIRPORT', 'FARMGATE', 12],
  ['GULSHAN_1', 'FARMGATE', 6],
  ['GULSHAN_1', 'MOHAKHALI', 3],
  ['MOHAKHALI', 'FARMGATE', 3],
];

let failures = 0;

for (const [from, to, expected] of distanceCases) {
  const actual = shortestDistanceKm(from as any, to as any);
  if (actual !== expected) {
    console.error(`FAIL ${from} -> ${to}: expected ${expected}, got ${actual}`);
    failures++;
  }
}

const fare1 = previewFare({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 1 });
if (!fare1 || fare1.perSeatPoysha !== 7200 || fare1.totalPoysha !== 7200) {
  console.error('FAIL BANANI -> MOHAKHALI 1-seat fare:', fare1);
  failures++;
}

const fare2 = previewFare({ pickupZone: 'BANANI', dropoffZone: 'GULSHAN_1', requestedSeats: 1 });
if (!fare2 || fare2.perSeatPoysha !== 4800) {
  console.error('FAIL BANANI -> GULSHAN_1 1-seat fare:', fare2);
  failures++;
}

const fare3 = previewFare({ pickupZone: 'BANANI', dropoffZone: 'MOHAKHALI', requestedSeats: 2 });
if (!fare3 || fare3.perSeatPoysha !== 7200 || fare3.totalPoysha !== 14400) {
  console.error('FAIL 2-seat total:', fare3);
  failures++;
}

if (failures > 0) {
  console.error(`${failures} check(s) failed.`);
  process.exit(1);
}

console.log('All fare preview checks passed.');
