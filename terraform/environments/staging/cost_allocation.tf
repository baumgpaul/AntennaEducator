# ============================================================================
# Cost Allocation — make this app's spend visible in Cost Explorer
# ============================================================================
# The AWS account also hosts unrelated projects, so costs are attributed via
# tags (set through provider default_tags + per-module Component tags).
#
# Tag activation and cost categories are ACCOUNT-WIDE: declare them only here,
# not in other environments.
#
# Cost Explorer views after activation (data appears within ~24 h; use
# `aws ce start-cost-allocation-tag-backfill` once to backfill history):
#   - Group by Cost Category "AntennaEducator"  → CICD vs Operations
#   - Group by tag "Environment"                → staging vs cefc vs …
#   - Group by tag "Component"                  → backend, frontend, storage, cicd …

resource "aws_ce_cost_allocation_tag" "this" {
  for_each = toset(["Project", "Environment", "Component", "CostCenter"])

  tag_key = each.value
  status  = "Active"
}

resource "aws_ce_cost_category" "workload" {
  name         = "AntennaEducator"
  rule_version = "CostCategoryExpression.v1"

  # Rules are evaluated in order: first match wins.
  rule {
    value = "CICD"
    rule {
      and {
        tags {
          key           = "Project"
          values        = ["antenna-simulator"]
          match_options = ["EQUALS"]
        }
      }
      and {
        tags {
          key           = "Component"
          values        = ["cicd"]
          match_options = ["EQUALS"]
        }
      }
    }
  }

  rule {
    value = "Operations"
    rule {
      tags {
        key           = "Project"
        values        = ["antenna-simulator"]
        match_options = ["EQUALS"]
      }
    }
  }

  default_value = "Other"

  depends_on = [aws_ce_cost_allocation_tag.this]
}
