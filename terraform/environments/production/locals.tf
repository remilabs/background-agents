locals {
  name_suffix = var.deployment_name
  vercel_project_name = "rove"

  # URLs for cross-service configuration
  control_plane_host = "open-inspect-control-plane-${local.name_suffix}.${var.cloudflare_worker_subdomain}.workers.dev"
  control_plane_url  = "https://${local.control_plane_host}"
  ws_url             = "wss://${local.control_plane_host}"

  # Web app URL: custom domain takes precedence, otherwise auto-generated from platform
  web_app_url = var.web_app_custom_domain != null ? "https://${var.web_app_custom_domain}" : (
    var.web_platform == "cloudflare" ? (
      "https://open-inspect-web-${local.name_suffix}.${var.cloudflare_worker_subdomain}.workers.dev"
      ) : (
      "https://${local.vercel_project_name}.vercel.app"
    )
  )

  # Worker script paths (deterministic output locations)
  control_plane_script_path = "${var.project_root}/packages/control-plane/dist/index.js"
  slack_bot_script_path     = "${var.project_root}/packages/slack-bot/dist/index.js"
  linear_bot_script_path    = "${var.project_root}/packages/linear-bot/dist/index.js"
  github_bot_script_path    = "${var.project_root}/packages/github-bot/dist/index.js"
}
