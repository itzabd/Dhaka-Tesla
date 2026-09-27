import Link from 'next/link';

export function ErrorState({
  message,
  backHref,
  backLabel = 'Back',
}: {
  message: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="bg-red-50 text-red-700 rounded-lg p-6 max-w-lg mx-auto">
      <p>{message}</p>
      {backHref && (
        <Link href={backHref} className="inline-block mt-4 text-primary underline">
          {backLabel}
        </Link>
      )}
    </div>
  );
}
