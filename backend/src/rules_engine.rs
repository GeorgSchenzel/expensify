//! Auto-categorisation. Pure — callers load rules ordered by priority.

use regex::{Regex, RegexBuilder};

use crate::models::{Rule, RuleKind};

enum Matcher {
    /// Needle is pre-lowercased when matching case-insensitively.
    Contains {
        needle: String,
        case_insensitive: bool,
    },
    Regex(Regex),
}

pub struct CompiledRule {
    category_id: String,
    matcher: Matcher,
}

/// Builds a regex exactly the way rule creation validates it.
pub fn build_regex(pattern: &str, case_insensitive: bool) -> Result<Regex, regex::Error> {
    RegexBuilder::new(pattern).case_insensitive(case_insensitive).build()
}

/// Compiles rules once per import. Expects `rules` sorted by priority (ascending).
/// Rules whose regex no longer compiles are skipped with a warning rather than
/// failing the whole import.
pub fn compile(rules: &[Rule]) -> Vec<CompiledRule> {
    rules
        .iter()
        .filter_map(|rule| {
            let matcher = match rule.kind {
                RuleKind::Contains => Matcher::Contains {
                    needle: if rule.is_case_insensitive {
                        rule.pattern.to_lowercase()
                    } else {
                        rule.pattern.clone()
                    },
                    case_insensitive: rule.is_case_insensitive,
                },
                RuleKind::Regex => match build_regex(&rule.pattern, rule.is_case_insensitive) {
                    Ok(re) => Matcher::Regex(re),
                    Err(err) => {
                        tracing::warn!(rule_id = %rule.id, %err, "skipping rule with invalid regex");
                        return None;
                    }
                },
            };
            Some(CompiledRule { category_id: rule.category_id.clone(), matcher })
        })
        .collect()
}

impl CompiledRule {
    /// `lowered` must be `description.to_lowercase()`; passed in so callers
    /// testing many rules against one description lowercase it only once.
    pub fn is_match(&self, description: &str, lowered: &str) -> bool {
        match &self.matcher {
            Matcher::Contains { needle, case_insensitive: true } => {
                lowered.contains(needle.as_str())
            }
            Matcher::Contains { needle, case_insensitive: false } => {
                description.contains(needle.as_str())
            }
            Matcher::Regex(re) => re.is_match(description),
        }
    }
}

/// Returns the category of the first matching rule.
pub fn categorize<'a>(rules: &'a [CompiledRule], description: &str) -> Option<&'a str> {
    let lowered = description.to_lowercase();
    rules
        .iter()
        .find(|rule| rule.is_match(description, &lowered))
        .map(|rule| rule.category_id.as_str())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rule(category: &str, kind: RuleKind, pattern: &str, ci: bool) -> Rule {
        Rule {
            id: format!("rule-{category}"),
            category_id: category.into(),
            kind,
            pattern: pattern.into(),
            is_case_insensitive: ci,
            priority: 0,
            created_at: String::new(),
        }
    }

    #[test]
    fn first_match_wins() {
        let rules = compile(&[
            rule("groceries", RuleKind::Contains, "billa", true),
            rule("shopping", RuleKind::Contains, "BILLA", false),
        ]);
        assert_eq!(categorize(&rules, "POS BILLA DANKT"), Some("groceries"));
    }

    #[test]
    fn case_sensitivity_is_respected() {
        let rules = compile(&[rule("a", RuleKind::Contains, "Spar", false)]);
        assert_eq!(categorize(&rules, "SPAR 2361"), None);
        assert_eq!(categorize(&rules, "Spar 2361"), Some("a"));
    }

    #[test]
    fn regex_rules() {
        let rules = compile(&[rule("tel", RuleKind::Regex, r"MAGENTA\s*(TELEKOM|INTERNET)", true)]);
        assert_eq!(categorize(&rules, "magenta   internet 10/2026"), Some("tel"));
        assert_eq!(categorize(&rules, "magenta mobile"), None);
    }

    #[test]
    fn invalid_regex_is_skipped() {
        let rules = compile(&[
            rule("bad", RuleKind::Regex, "(unclosed", true),
            rule("good", RuleKind::Contains, "x", true),
        ]);
        assert_eq!(categorize(&rules, "x"), Some("good"));
    }
}
