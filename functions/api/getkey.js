export async function onRequest(context) {
  const key = context.env.ABLY_API_KEY;

  if (!key) {
    return new Response(
      JSON.stringify({ error: 'ABLY_API_KEY environment variable not set' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  return new Response(
    JSON.stringify({ key }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        // Prevent the key from being cached by browsers or CDN
        'Cache-Control': 'no-store, no-cache, must-revalidate',
      },
    }
  );
}
