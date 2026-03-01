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
