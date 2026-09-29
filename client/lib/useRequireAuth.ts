'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getToken, type AuthRole } from './api';

export function useRequireAuth(role: AuthRole = 'passenger'): { isAuthorized: boolean } {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = getToken(role);
    if (!token) {
      router.push('/login');
      return;
    }
    setIsAuthorized(true);
  }, [router, role]);

  return { isAuthorized };
}
