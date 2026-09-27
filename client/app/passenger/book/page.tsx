'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiFetch, uuid, clearToken, isSessionExpired } from '@/lib/api';
import { ZONES, ZONE_LABELS, Zone } from '@/lib/zones';
import { LoadingState } from '@/components/LoadingState';
import { ErrorState } from '@/components/ErrorState';

interface BookResponse {
  id: string;
  pricing: {
    distanceKm: number;
    perSeatSoloFarePoysha: number;
    perSeatPooledFarePoysha: number;
    totalPooledFarePoysha: number;
    currency: string;
  };
}

export default function BookRidePage() {
  const router = useRouter();
  const [pickupZone, setPickupZone] = useState<Zone>('BANANI');
  const [dropoffZone, setDropoffZone] = useState<Zone>('MOHAKHALI');
  const [requestedSeats, setRequestedSeats] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookedRide, setBookedRide] = useState<BookResponse | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<BookResponse>('/api/rides', {
        method: 'POST',
        idempotencyKey: uuid(),
        body: JSON.stringify({ pickupZone, dropoffZone, requestedSeats }),
      });
      setBookedRide(data);
    } catch (err) {
      if (isSessionExpired(err)) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Booking failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface text-ink p-8 font-sans">
      <div className="bg-card rounded-lg p-6 max-w-lg mx-auto space-y-4 shadow">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-serif">Book a Pool Ride</h1>
          <Link href="/passenger/history" className="text-sm text-primary hover:underline">
            Ride History
          </Link>
        </div>

        {error && <ErrorState message={error} />}

        {loading ? (
          <LoadingState label="Calculating fare…" />
        ) : bookedRide ? (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-md space-y-2">
              <h2 className="font-semibold text-lg">Ride Requested!</h2>
              <div className="text-sm space-y-1">
                <p><strong>Distance:</strong> {bookedRide.pricing.distanceKm} km</p>
                <p><strong>Solo Fare (Per Seat):</strong> ৳{(bookedRide.pricing.perSeatSoloFarePoysha / 100).toFixed(2)}</p>
                <p><strong>Pooled Fare (Per Seat):</strong> ৳{(bookedRide.pricing.perSeatPooledFarePoysha / 100).toFixed(2)}</p>
                <p><strong>Total Fare:</strong> ৳{(bookedRide.pricing.totalPooledFarePoysha / 100).toFixed(2)}</p>
              </div>
            </div>
            <Link
              href={`/passenger/ride/${bookedRide.id}`}
              className="block text-center bg-primary text-white rounded px-4 py-2 hover:opacity-90 transition"
            >
              View status
            </Link>
            <button
              onClick={() => setBookedRide(null)}
              className="w-full text-center text-sm text-ink-muted hover:underline mt-2"
            >
              Book another ride
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Pickup Zone</label>
              <select
                value={pickupZone}
                onChange={(e) => setPickupZone(e.target.value as Zone)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Dropoff Zone</label>
              <select
                value={dropoffZone}
                onChange={(e) => setDropoffZone(e.target.value as Zone)}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                {ZONES.map((z) => (
                  <option key={z} value={z}>
                    {ZONE_LABELS[z]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Requested Seats</label>
              <select
                value={requestedSeats}
                onChange={(e) => setRequestedSeats(parseInt(e.target.value, 10))}
                className="w-full border rounded px-3 py-2 bg-white"
              >
                <option value={1}>1 Seat</option>
                <option value={2}>2 Seats</option>
                <option value={3}>3 Seats</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="bg-primary text-white rounded px-4 py-2 w-full disabled:opacity-50 hover:opacity-90 transition"
            >
              Request Pool Ride
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
