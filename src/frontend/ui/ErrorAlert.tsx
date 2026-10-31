// A red message for a failed action. Renders nothing when there is no message.
export function ErrorAlert({ message, className = "" }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <div role="alert" className={`alert alert-error ${className}`}>
      <span>{message}</span>
    </div>
  );
}
