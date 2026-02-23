check "github_bot_required_values" {
  assert {
    condition = !var.enable_github_bot || (
      length(trimspace(var.github_webhook_secret)) > 0 &&
      length(trimspace(var.github_bot_username)) > 0
    )

    error_message = "When enable_github_bot is true, github_webhook_secret and github_bot_username must be non-empty."
  }
}

check "linear_bot_required_values" {
  assert {
    condition = !var.enable_linear_bot || (
      length(trimspace(var.linear_client_id)) > 0 &&
      length(trimspace(var.linear_client_secret)) > 0 &&
      length(trimspace(var.linear_webhook_secret)) > 0
    )

    error_message = "When enable_linear_bot is true, linear_client_id, linear_client_secret, and linear_webhook_secret must be non-empty."
  }
}
