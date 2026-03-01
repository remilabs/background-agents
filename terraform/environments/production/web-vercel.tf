# =============================================================================
# Web App — Vercel (when web_platform = "vercel")
# =============================================================================

module "web_app" {
  count  = var.web_platform == "vercel" ? 1 : 0
  source = "../../modules/vercel-project"

  project_name = local.vercel_project_name
  team_id      = var.vercel_team_id
  framework    = "nextjs"

  git_repository = {
    type              = "github"
    repo              = "remilabs/rove"
    production_branch = "main"
  }

  root_directory  = "packages/web"
  install_command = "cd ../.. && npm install && npm run build -w @open-inspect/shared"
  build_command   = "next build"

  environment_variables = [
    # GitHub OAuth
    {
      key       = "GITHUB_CLIENT_ID"
      value     = var.github_client_id
      targets   = ["production", "preview"]
      sensitive = false
    },
    {
      key       = "GITHUB_CLIENT_SECRET"
      value     = var.github_client_secret
      targets   = ["production", "preview"]
      sensitive = true
    },
    # NextAuth
    {
      key       = "NEXTAUTH_URL"
      value     = local.web_app_url
      targets   = ["production"]
      sensitive = false
    },
    {
      key       = "NEXTAUTH_SECRET"
      value     = var.nextauth_secret
      targets   = ["production", "preview"]
      sensitive = true
    },
    # Control Plane
    {
      key       = "CONTROL_PLANE_URL"
      value     = local.control_plane_url
      targets   = ["production", "preview"]
      sensitive = false
    },
    {
      key       = "NEXT_PUBLIC_WS_URL"
      value     = local.ws_url
      targets   = ["production", "preview"]
      sensitive = false
    },
    # Internal
    {
      key       = "INTERNAL_CALLBACK_SECRET"
      value     = var.internal_callback_secret
      targets   = ["production", "preview"]
      sensitive = true
    },
    # Access Control
    {
      key       = "ALLOWED_USERS"
      value     = var.allowed_users
      targets   = ["production", "preview"]
      sensitive = false
    },
    {
      key       = "ALLOWED_GITHUB_TEAMS"
      value     = var.allowed_github_teams
      targets   = ["production", "preview"]
      sensitive = false
    },
    {
      key       = "ALLOWED_GITHUB_ORGS"
      value     = var.allowed_github_orgs
      targets   = ["production", "preview"]
      sensitive = false
    },
    {
      key       = "ALLOWED_EMAIL_DOMAINS"
      value     = var.allowed_email_domains
      targets   = ["production", "preview"]
      sensitive = false
    },
  ]
}
