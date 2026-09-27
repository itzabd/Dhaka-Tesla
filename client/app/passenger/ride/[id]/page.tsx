'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { apiFetch, uuid, clearToken } from '@/lib/api';
import { ZONE_LABELS, Zone } from '@/lib/zones';

interface RideResponse {
  id: string;
  pickupZone: string;
  dropoffZone: string;
  requestedSeats: number;
  status: 'WAITING' | 'MATCHED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  pricing: { perSeatPooledFarePoysha: number; totalPooledFarePoysha: number; currency: string };
  pool: null | {
    id: string;
    status: string;
    occupiedSeats: number;
    totalCapacity: number;
    driverArrivedAt: string | null;
    driver: { fullName: string; vehicleName: string };
  };
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
}

export default function RideStatusPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const rideId = params?.id;

  const [ride, setRide] = useState<RideResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    if (!rideId) return;
    try {
      const data = await apiFetch<RideResponse>(`/api/rides/${rideId}`);
      setRide(data);
    } catch (err) {
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to load ride');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [rideId]);

  async function handleCancel() {
    if (!rideId) return;
    setCancelling(true);
    setError(null);
    try {
      await apiFetch(`/api/rides/${rideId}/cancel`, {
        method: 'POST',
        idempotencyKey: uuid(),
      });
      await load();
    } catch (err) {
      if (err instanceof Error && (err.message === 'UNAUTHENTICATED' || err.message === 'TOKEN_EXPIRED')) {
        clearToken();
        router.push('/login');
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to cancel ride');
    } finally {
      setCancelling(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-surface text-ink p-8 font-sans flex items-center justify-center">
        <p className="text-ink-muted">Loading ride details…</p>
      </div>
    );
  }

  if (error && !ride) {
    return (
      <div className="min-h-screen bg-surface text-ink p-8 font-sans flex items-center justify-center">
        <div className="bg-card rounded-lg p-6 max-w-lg w-full text-center space-y-4 shadow">
          <p className="text-red-600">{error}</p>
          <Link href="/passenger/book" className="text-primary hover:underline">
            Back to Booking
          </Link>
        </div>
      </div>
    );
  }

  if (!ride) return null;

  const pickupLabel = ZONE_LABELS[ride.pickupZone as Zone] || ride.pickupZone;
  const dropoffLabel = ZONE_LABELS[ride.dropoffZone as Zone] || ride.dropoffZone;

  return (
    <div className="min-h-screen bg-surface text-ink p-8 font-sans">
      <div className="bg-card rounded-lg p-6 max-w-lg mx-auto space-y-4 shadow">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-serif">Ride Status</h1>
          <span
            className={`text-xs px-2.5 py-1 rounded font-semibold ${
              ride.status === 'WAITING'
                ? 'bg-amber-100 text-amber-800'
                : ride.status === 'MATCHED'
                ? 'bg-blue-100 text-blue-800'
                : ride.status === 'COMPLETED'
                ? 'bg-green-100 text-green-800'
                : ride.status === 'CANCELLED'
                ? 'bg-gray-200 text-gray-700'
                : 'bg-purple-100 text-purple-800'
            }`}
          >
            {ride.status}
          </span>
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <div className="border-t border-b py-3 space-y-2 text-sm">
          <p><strong>Route:</strong> {pickupLabel} → {dropoffLabel}</p>
          <p><strong>Requested Seats:</strong> {ride.requestedSeats}</p>
          <p>
            <strong>Fare:</strong> ৳{(ride.pricing.perSeatPooledFarePoysha / 100).toFixed(2)} / seat (Total: ৳{(ride.pricing.totalPooledFarePoysha / 100).toFixed(2)})
          </p>
          <p className="text-xs text-ink-muted">
            <strong>Requested at:</strong> {new Date(ride.createdAt).toLocaleString()}
          </p>
          {ride.cancelledAt && (
            <p className="text-xs text-red-600">
              <strong>Cancelled at:</strong> {new Date(ride.cancelledAt).toLocaleString()}
            </p>
          )}
        </div>

        {ride.pool && (
          <div className="bg-blue-50 border border-blue-200 text-blue-900 p-4 rounded-md space-y-2 text-sm">
            <h2 className="font-semibold text-base">Vehicle & Pool Info</h2>
            <p><strong>Driver:</strong> {ride.pool.driver.fullName}</p>
            <p><strong>Vehicle:</strong> {ride.pool.driver.vehicleName}</p>
            <p><strong>Occupied Seats:</strong> {ride.pool.occupiedSeats} / {ride.pool.totalCapacity}</p>
            {ride.pool.driverArrivedAt && (
              <p><strong>Driver Arrived:</strong> {new Date(ride.pool.driverArrivedAt).toLocaleTimeString()}</p>
            )}
          </div>
        )}

        {ride.status === 'WAITING' && (
          <button
            onClick={handleCancel}
            disabled={cancelling}
            className="w-full bg-red-600 text-white rounded px-4 py-2 hover:bg-red-700 transition disabled:opacity-50"
          >
            {cancelling ? 'Cancelling…' : 'Cancel Ride'}
          </button>
        )}

        <div className="flex justify-between items-center pt-2 text-sm">
          <Link href="/passenger/book" className="text-primary hover:underline">
            Book Another Ride
          </Link>
          <Link href="/passenger/history" className="text-primary hover:underline">
            View History
          </Link>
        </div>
      </div>
    </div>
  );
}
