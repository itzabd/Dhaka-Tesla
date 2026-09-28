'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export function useRequireAuth(): { isAuthorized: boolean } {
  const router = useRouter();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = window.localStorage.getItem('token');
    if (!token) {
      router.push('/login');
      return;
    }
    setIsAuthorized(true);
  }, [router]);

  return { isAuthorized };
}
