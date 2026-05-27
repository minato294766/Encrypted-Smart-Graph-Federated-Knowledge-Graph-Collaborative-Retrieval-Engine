import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const backendUrl = process.env.NEXT_PUBLIC_MIA_RAG_AUTH_URL;

  if (!backendUrl) {
    return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(`${backendUrl}/api/admin/pending-users`, {
      headers: { Authorization: authHeader },
    });

    if (!res.ok) {
      const data = await res.json() as { detail?: string };
      return NextResponse.json({ error: data.detail ?? "Failed" }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json({ error: "无法连接后端服务" }, { status: 502 });
  }
}
