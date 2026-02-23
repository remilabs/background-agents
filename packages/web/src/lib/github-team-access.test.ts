import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  checkGitHubOrgAccess,
  checkGitHubTeamAccess,
  parseNextPageUrl,
} from "./github-team-access";

function jsonResponse(
  body: unknown,
  options?: {
    status?: number;
    headers?: HeadersInit;
  }
): Response {
  return new Response(JSON.stringify(body), {
    status: options?.status ?? 200,
    headers: {
      "content-type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
}

describe("parseNextPageUrl", () => {
  it("returns null when there is no next page", () => {
    expect(parseNextPageUrl(null)).toBeNull();
    expect(
      parseNextPageUrl(
        '<https://api.github.com/user/teams?per_page=100&page=3>; rel="last", <https://api.github.com/user/teams?per_page=100&page=1>; rel="first"'
      )
    ).toBeNull();
  });

  it("returns the next page URL", () => {
    expect(
      parseNextPageUrl(
        '<https://api.github.com/user/teams?per_page=100&page=2>; rel="next", <https://api.github.com/user/teams?per_page=100&page=4>; rel="last"'
      )
    ).toBe("https://api.github.com/user/teams?per_page=100&page=2");
  });
});

describe("checkGitHubTeamAccess", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    consoleWarnSpy.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    consoleWarnSpy.mockRestore();
  });

  it("returns false when token is missing", async () => {
    const isAllowed = await checkGitHubTeamAccess({
      allowedTeams: ["remihq/platform"],
    });

    expect(isAllowed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when a matching team is on first page", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          slug: "platform",
          organization: { login: "remihq" },
        },
      ])
    );

    const isAllowed = await checkGitHubTeamAccess({
      allowedTeams: ["remihq/platform"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/teams?per_page=100",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("checks additional pages when GitHub pagination is present", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        [
          {
            slug: "support",
            organization: { login: "remihq" },
          },
        ],
        {
          headers: {
            link: '<https://api.github.com/user/teams?per_page=100&page=2>; rel="next", <https://api.github.com/user/teams?per_page=100&page=2>; rel="last"',
          },
        }
      )
    );
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          slug: "platform",
          organization: { login: "remihq" },
        },
      ])
    );

    const isAllowed = await checkGitHubTeamAccess({
      allowedTeams: ["remihq/platform"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when no team matches", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse([
        {
          slug: "support",
          organization: { login: "remihq" },
        },
      ])
    );

    const isAllowed = await checkGitHubTeamAccess({
      allowedTeams: ["remihq/platform"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(false);
  });

  it("returns false when GitHub API request fails", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          message: "Forbidden",
        },
        { status: 403 }
      )
    );

    const isAllowed = await checkGitHubTeamAccess({
      allowedTeams: ["remihq/platform"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(false);
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});

describe("checkGitHubOrgAccess", () => {
  const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
  const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  beforeAll(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    fetchMock.mockReset();
    consoleWarnSpy.mockClear();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
    consoleWarnSpy.mockRestore();
  });

  it("returns false when token is missing", async () => {
    const isAllowed = await checkGitHubOrgAccess({
      allowedOrgs: ["remilabs"],
    });

    expect(isAllowed).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns true when user is active in an allowed org", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        state: "active",
      })
    );

    const isAllowed = await checkGitHubOrgAccess({
      allowedOrgs: ["remilabs"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.github.com/user/memberships/orgs/remilabs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer token",
        }),
      })
    );
  });

  it("tries additional orgs when first org does not match", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ message: "Not Found" }, { status: 404 }));
    fetchMock.mockResolvedValueOnce(jsonResponse({ state: "active" }));

    const isAllowed = await checkGitHubOrgAccess({
      allowedOrgs: ["remilabs", "remi"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns false when membership is not active", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        state: "pending",
      })
    );

    const isAllowed = await checkGitHubOrgAccess({
      allowedOrgs: ["remilabs"],
      githubAccessToken: "token",
    });

    expect(isAllowed).toBe(false);
  });
});
