export function GET() {
  return new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
      <rect width="64" height="64" rx="14" fill="#176b5c"/>
      <circle cx="42" cy="21" r="6" fill="#c89437"/>
      <path d="M18 45 L32 14 L46 45 Z" fill="none" stroke="#fff" stroke-width="5" stroke-linejoin="round"/>
    </svg>`,
    {
      headers: {
        "Content-Type": "image/svg+xml; charset=utf-8",
        "Cache-Control": "public, max-age=86400"
      }
    }
  );
}
