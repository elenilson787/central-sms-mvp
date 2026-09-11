export async function GET() {
  return Response.json({ ok: true, service: "central-sms-mvp", time: new Date().toISOString() });
}
