import type { NextAuthOptions } from "next-auth";
import GitHubProvider from "next-auth/providers/github";
import { checkAccessAllowed, parseAllowlist } from "./access-control";
import { checkGitHubOrgAccess, checkGitHubTeamAccess } from "./github-team-access";

// Extend NextAuth types to include GitHub-specific user info
declare module "next-auth" {
  interface Session {
    user: {
      id?: string; // GitHub user ID
      login?: string; // GitHub username
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpiresAt?: number; // Unix timestamp in milliseconds
    githubUserId?: string;
    githubLogin?: string;
  }
}

export const authOptions: NextAuthOptions = {
  debug: process.env.NODE_ENV === "development" || process.env.NEXTAUTH_DEBUG === "true",
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: "read:user user:email read:org repo",
        },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile, user, account }) {
      const githubProfile = profile as { login?: string };
      console.log("[auth:signIn] attempt", {
        login: githubProfile.login,
        email: user.email,
        accountProvider: account?.provider,
        accountType: account?.type,
        hasAccessToken: !!account?.access_token,
        accessTokenPrefix: account?.access_token?.slice(0, 8),
        hasRefreshToken: !!account?.refresh_token,
        expiresAt: account?.expires_at,
        tokenType: account?.token_type,
        scope: account?.scope,
      });

      const config = {
        allowedDomains: parseAllowlist(process.env.ALLOWED_EMAIL_DOMAINS),
        allowedUsers: parseAllowlist(process.env.ALLOWED_USERS),
      };
      const allowedTeams = parseAllowlist(process.env.ALLOWED_GITHUB_TEAMS);
      const allowedOrgs = parseAllowlist(process.env.ALLOWED_GITHUB_ORGS);

      const hasUserOrDomainRestrictions =
        config.allowedDomains.length > 0 || config.allowedUsers.length > 0;
      const hasTeamRestrictions = allowedTeams.length > 0;
      const hasOrgRestrictions = allowedOrgs.length > 0;

      console.log("[auth:signIn] restrictions", {
        hasUserOrDomainRestrictions,
        hasTeamRestrictions,
        hasOrgRestrictions,
        allowedUsers: config.allowedUsers,
        allowedOrgs,
      });

      if (!hasUserOrDomainRestrictions && !hasTeamRestrictions && !hasOrgRestrictions) {
        console.log("[auth:signIn] no restrictions configured, allowing");
        return true;
      }

      if (hasUserOrDomainRestrictions) {
        const isAllowed = checkAccessAllowed(config, {
          githubUsername: githubProfile.login,
          email: user.email ?? undefined,
        });

        console.log("[auth:signIn] user/domain check", {
          githubUsername: githubProfile.login,
          isAllowed,
        });

        if (isAllowed) {
          return true;
        }
      }

      if (!hasTeamRestrictions && !hasOrgRestrictions) {
        console.log("[auth:signIn] denied: no team/org restrictions to fall back on");
        return false;
      }

      if (hasOrgRestrictions) {
        const isOrgAllowed = await checkGitHubOrgAccess({
          allowedOrgs,
          githubAccessToken: account?.access_token,
        });

        console.log("[auth:signIn] org check", {
          allowedOrgs,
          isOrgAllowed,
          hasAccessToken: !!account?.access_token,
        });

        if (isOrgAllowed) {
          return true;
        }
      }

      if (!hasTeamRestrictions) {
        console.log("[auth:signIn] denied: org check failed, no team restrictions");
        return false;
      }

      const isTeamAllowed = await checkGitHubTeamAccess({
        allowedTeams,
        githubAccessToken: account?.access_token,
      });

      console.log("[auth:signIn] team check", { allowedTeams, isTeamAllowed });

      return isTeamAllowed;
    },
    async jwt({ token, account, profile }) {
      if (account) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token as string | undefined;
        // expires_at is in seconds, convert to milliseconds (only set if provided)
        token.accessTokenExpiresAt = account.expires_at ? account.expires_at * 1000 : undefined;
      }
      if (profile) {
        // GitHub profile includes id (numeric) and login (username)
        const githubProfile = profile as { id?: number; login?: string };
        if (githubProfile.id) {
          token.githubUserId = githubProfile.id.toString();
        }
        if (githubProfile.login) {
          token.githubLogin = githubProfile.login;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.githubUserId;
        session.user.login = token.githubLogin;
      }
      return session;
    },
  },
  pages: {
    error: "/access-denied",
  },
};
