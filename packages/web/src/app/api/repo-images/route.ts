import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { controlPlaneFetch } from "@/lib/control-plane";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [enabledResponse, statusResponse] = await Promise.all([
      controlPlaneFetch("/repo-images/enabled-repos"),
      controlPlaneFetch("/repo-images/status"),
    ]);

    if (!enabledResponse.ok || !statusResponse.ok) {
      console.error(
        `[repo-images] Control plane error: enabled=${enabledResponse.status}, status=${statusResponse.status}`
      );
      return NextResponse.json({ enabledRepos: [], images: [] });
    }

    const enabledData = await enabledResponse.json();
    const statusData = await statusResponse.json();

    const enabledRepos = (enabledData.repos ?? []).map(
      (r: { repoOwner: string; repoName: string }) => `${r.repoOwner}/${r.repoName}`.toLowerCase()
    );

    return NextResponse.json({
      enabledRepos,
      images: statusData.images ?? [],
    });
  } catch (err) {
    console.error("Failed to fetch repo images:", err);
    return NextResponse.json({ enabledRepos: [], images: [] });
  }
}
