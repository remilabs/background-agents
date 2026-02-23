const GITHUB_USER_TEAMS_URL = "https://api.github.com/user/teams?per_page=100";
const GITHUB_USER_ORG_MEMBERSHIP_URL = "https://api.github.com/user/memberships/orgs";
const MAX_GITHUB_TEAM_PAGES = 10;

interface GitHubTeamResponse {
  slug?: string;
  organization?: {
    login?: string;
  };
}

export interface GitHubTeamAccessParams {
  allowedTeams: string[];
  githubAccessToken?: string;
}

export interface GitHubOrgAccessParams {
  allowedOrgs: string[];
  githubAccessToken?: string;
}

function normalizeTeamIdentifier(team: string): string {
  return team.trim().toLowerCase();
}

function normalizeOrgIdentifier(org: string): string {
  return org.trim().toLowerCase();
}

function githubHeaders(githubAccessToken: string): HeadersInit {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${githubAccessToken}`,
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

function toTeamIdentifier(team: GitHubTeamResponse): string | null {
  const organization = team.organization?.login?.trim().toLowerCase();
  const slug = team.slug?.trim().toLowerCase();

  if (!organization || !slug) {
    return null;
  }

  return `${organization}/${slug}`;
}

export function parseNextPageUrl(linkHeader: string | null): string | null {
  if (!linkHeader) {
    return null;
  }

  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

export async function checkGitHubTeamAccess({
  allowedTeams,
  githubAccessToken,
}: GitHubTeamAccessParams): Promise<boolean> {
  if (allowedTeams.length === 0 || !githubAccessToken) {
    return false;
  }

  const normalizedAllowedTeams = new Set(allowedTeams.map(normalizeTeamIdentifier));

  let nextPageUrl: string | null = GITHUB_USER_TEAMS_URL;
  let pagesFetched = 0;

  try {
    while (nextPageUrl && pagesFetched < MAX_GITHUB_TEAM_PAGES) {
      const response = await fetch(nextPageUrl, {
        headers: githubHeaders(githubAccessToken),
      });

      if (!response.ok) {
        console.warn("Failed to fetch GitHub teams for access control", {
          status: response.status,
          statusText: response.statusText,
        });
        return false;
      }

      const teams = (await response.json()) as GitHubTeamResponse[];

      for (const team of teams) {
        const teamIdentifier = toTeamIdentifier(team);
        if (teamIdentifier && normalizedAllowedTeams.has(teamIdentifier)) {
          return true;
        }
      }

      nextPageUrl = parseNextPageUrl(response.headers.get("link"));
      pagesFetched += 1;
    }
  } catch (error) {
    console.warn("Error checking GitHub team access", error);
    return false;
  }

  if (nextPageUrl) {
    console.warn("Reached GitHub team pagination limit while checking access", {
      maxPages: MAX_GITHUB_TEAM_PAGES,
    });
  }

  return false;
}

export async function checkGitHubOrgAccess({
  allowedOrgs,
  githubAccessToken,
}: GitHubOrgAccessParams): Promise<boolean> {
  if (allowedOrgs.length === 0 || !githubAccessToken) {
    return false;
  }

  const normalizedAllowedOrgs = Array.from(
    new Set(allowedOrgs.map(normalizeOrgIdentifier).filter(Boolean))
  );

  for (const org of normalizedAllowedOrgs) {
    const membershipUrl = `${GITHUB_USER_ORG_MEMBERSHIP_URL}/${encodeURIComponent(org)}`;

    try {
      const response = await fetch(membershipUrl, {
        headers: githubHeaders(githubAccessToken),
      });

      if (response.status === 404) {
        continue;
      }

      if (!response.ok) {
        console.warn("Failed to fetch GitHub org membership for access control", {
          org,
          status: response.status,
          statusText: response.statusText,
        });
        continue;
      }

      const membership = (await response.json()) as { state?: string };
      if (membership.state === "active") {
        return true;
      }
    } catch (error) {
      console.warn("Error checking GitHub org access", {
        org,
        error,
      });
    }
  }

  return false;
}
