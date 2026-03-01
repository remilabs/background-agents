# Verify the Vercel production URL matches our hardcoded pattern. If Vercel
# assigns a different domain (e.g., due to naming conflicts), NEXTAUTH_URL and
# cross-service references will silently break. Skipped when a custom domain is
# configured since the Vercel-assigned URL won't match the custom domain.
check "vercel_url_matches" {
  assert {
    condition = (
      var.web_app_custom_domain != null ||
      var.web_platform != "vercel" ||
      length(module.web_app) == 0 ||
      module.web_app[0].production_url == local.web_app_url
    )
    error_message = "Vercel assigned URL '${var.web_platform == "vercel" && length(module.web_app) > 0 ? module.web_app[0].production_url : "n/a"}' but local.web_app_url is '${local.web_app_url}'. Update locals or set a custom domain."
  }
}

check "github_bot_credentials_required" {
  assert {
    condition = (
      !var.enable_github_bot ||
      (trimspace(var.github_webhook_secret) != "" && trimspace(var.github_bot_username) != "")
    )
    error_message = "enable_github_bot is true, but github_webhook_secret and github_bot_username must be set."
  }
}

check "slack_bot_credentials_required" {
  assert {
    condition = (
      !var.enable_slack_bot ||
      (trimspace(var.slack_bot_token) != "" && trimspace(var.slack_signing_secret) != "")
    )
    error_message = "enable_slack_bot is true, but slack_bot_token and slack_signing_secret must be set."
  }
}

check "linear_bot_credentials_required" {
  assert {
    condition = (
      !var.enable_linear_bot ||
      (
        trimspace(var.linear_client_id) != "" &&
        trimspace(var.linear_client_secret) != "" &&
        trimspace(var.linear_webhook_secret) != "" &&
        trimspace(var.linear_api_key) != ""
      )
    )
    error_message = "enable_linear_bot is true, but linear_client_id, linear_client_secret, linear_webhook_secret, and linear_api_key must be set."
  }
}
