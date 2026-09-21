import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "jev-resume-fit",
      serverKeyConfigured: Boolean(process.env.TYPESAFE_API_KEY),
      byokAvailable: true,
      storage: "stateless",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
