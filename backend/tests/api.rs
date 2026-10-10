//! End-to-end tests of the HTTP API against an in-memory database.

use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

async fn app() -> Router {
    let pool = fin_backend::db::connect("sqlite::memory:").await.expect("database");
    fin_backend::app(pool, None)
}

async fn call(app: &Router, method: &str, uri: &str, body: Option<Value>) -> (StatusCode, Value) {
    let mut req = Request::builder().method(method).uri(uri);
    let body = match body {
        Some(v) => {
            req = req.header(header::CONTENT_TYPE, "application/json");
            Body::from(v.to_string())
        }
        None => Body::empty(),
    };
    let res = app.clone().oneshot(req.body(body).unwrap()).await.unwrap();
    let status = res.status();
    let bytes = res.into_body().collect().await.unwrap().to_bytes();
    let value =
        if bytes.is_empty() { Value::Null } else { serde_json::from_slice(&bytes).unwrap() };
    (status, value)
}

async fn create_category(app: &Router, name: &str, color: &str) -> String {
    let (status, body) =
        call(app, "POST", "/api/categories", Some(json!({ "name": name, "colorHex": color })))
            .await;
    assert_eq!(status, StatusCode::CREATED, "{body}");
    body["id"].as_str().unwrap().to_owned()
}

fn mapping() -> Value {
    json!({
        "dateColumn": "Date",
        "descriptionColumn": "Description",
        "amountMode": "single",
        "amountColumn": "Amount",
        "currencyMode": "manual",
        "defaultCurrency": "EUR"
    })
}

fn rows() -> Value {
    json!([
        { "Date": "2026-09-03", "Description": "BILLA DANKT 1100", "Amount": "-42,10" },
        { "Date": "2026-09-28", "Description": "Salary ACME GmbH", "Amount": "2.500,00" },
        { "Date": "2026-10-02", "Description": "Spar Supermarkt", "Amount": "-12,80" },
        { "Date": "02.10.2026", "Description": "Netflix", "Amount": "-13,99" },
        { "Date": "not a date", "Description": "broken", "Amount": "-1" },
        { "Date": "2026-10-05", "Description": "broken amount", "Amount": "abc" }
    ])
}

#[tokio::test]
async fn health_and_unknown_routes() {
    let app = app().await;
    assert_eq!(call(&app, "GET", "/api/health", None).await.0, StatusCode::OK);
    let (status, body) = call(&app, "GET", "/api/nope", None).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(body["error"].is_string());
}

#[tokio::test]
async fn category_crud_and_validation() {
    let app = app().await;
    let id = create_category(&app, " Groceries ", "#10B981").await;

    let (status, list) = call(&app, "GET", "/api/categories", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(list[0]["name"], "Groceries");
    assert_eq!(list[0]["colorHex"], "#10b981");

    let dup = call(
        &app,
        "POST",
        "/api/categories",
        Some(json!({ "name": "Groceries", "colorHex": "#000000" })),
    )
    .await;
    assert_eq!(dup.0, StatusCode::CONFLICT);
    let bad =
        call(&app, "POST", "/api/categories", Some(json!({ "name": "X", "colorHex": "red" })))
            .await;
    assert_eq!(bad.0, StatusCode::BAD_REQUEST);
    let empty =
        call(&app, "POST", "/api/categories", Some(json!({ "name": "  ", "colorHex": "#000000" })))
            .await;
    assert_eq!(empty.0, StatusCode::BAD_REQUEST);
    let malformed = call(&app, "POST", "/api/categories", Some(json!({ "name": 5 }))).await;
    assert_eq!(malformed.0, StatusCode::BAD_REQUEST);
    assert!(malformed.1["error"].is_string());

    let (status, updated) = call(
        &app,
        "PUT",
        &format!("/api/categories/{id}"),
        Some(json!({ "name": "Food", "colorHex": "#3b82f6" })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(updated["name"], "Food");

    let missing = call(
        &app,
        "PUT",
        "/api/categories/nope",
        Some(json!({ "name": "A", "colorHex": "#3b82f6" })),
    )
    .await;
    assert_eq!(missing.0, StatusCode::NOT_FOUND);
    assert_eq!(
        call(&app, "DELETE", &format!("/api/categories/{id}"), None).await.0,
        StatusCode::NO_CONTENT
    );
    assert_eq!(
        call(&app, "DELETE", &format!("/api/categories/{id}"), None).await.0,
        StatusCode::NOT_FOUND
    );
}

#[tokio::test]
async fn rules_priority_and_reorder() {
    let app = app().await;
    let cat = create_category(&app, "Groceries", "#10b981").await;

    let bad_regex = call(
        &app,
        "POST",
        "/api/rules",
        Some(json!({ "pattern": "(unclosed", "type": "REGEX", "categoryId": cat, "isCaseInsensitive": true })),
    )
    .await;
    assert_eq!(bad_regex.0, StatusCode::BAD_REQUEST);

    let unknown_cat = call(
        &app,
        "POST",
        "/api/rules",
        Some(json!({ "pattern": "x", "type": "CONTAINS", "categoryId": "nope", "isCaseInsensitive": true })),
    )
    .await;
    assert_eq!(unknown_cat.0, StatusCode::BAD_REQUEST);

    let mut ids = Vec::new();
    for pattern in ["billa", "spar", "hofer"] {
        let (status, rule) = call(
            &app,
            "POST",
            "/api/rules",
            Some(json!({ "pattern": pattern, "type": "CONTAINS", "categoryId": cat, "isCaseInsensitive": true })),
        )
        .await;
        assert_eq!(status, StatusCode::CREATED);
        assert_eq!(rule["category"]["name"], "Groceries");
        ids.push(rule["id"].as_str().unwrap().to_owned());
    }
    let (_, list) = call(&app, "GET", "/api/rules", None).await;
    let priorities: Vec<i64> =
        list.as_array().unwrap().iter().map(|r| r["priority"].as_i64().unwrap()).collect();
    assert_eq!(priorities, [0, 1, 2]);

    let reversed: Vec<&String> = ids.iter().rev().collect();
    let status = call(&app, "PUT", "/api/rules/order", Some(json!({ "ids": reversed }))).await.0;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (_, list) = call(&app, "GET", "/api/rules", None).await;
    assert_eq!(list[0]["pattern"], "hofer");
    assert_eq!(list[2]["pattern"], "billa");

    let partial = call(&app, "PUT", "/api/rules/order", Some(json!({ "ids": [ids[0]] }))).await.0;
    assert_eq!(partial, StatusCode::CONFLICT);
    let duplicated =
        call(&app, "PUT", "/api/rules/order", Some(json!({ "ids": [ids[0], ids[0], ids[1]] })))
            .await
            .0;
    assert_eq!(duplicated, StatusCode::CONFLICT);

    // Deleting the category cascades to its rules.
    call(&app, "DELETE", &format!("/api/categories/{cat}"), None).await;
    let (_, list) = call(&app, "GET", "/api/rules", None).await;
    assert_eq!(list.as_array().unwrap().len(), 0);
}

#[tokio::test]
async fn import_categorizes_and_deduplicates() {
    let app = app().await;
    let groceries = create_category(&app, "Groceries", "#10b981").await;
    let streaming = create_category(&app, "Streaming", "#8b5cf6").await;
    for (pattern, kind, cat) in [
        ("billa", "CONTAINS", &groceries),
        ("^spar", "REGEX", &groceries),
        ("netflix", "CONTAINS", &streaming),
    ] {
        call(&app, "POST", "/api/rules", Some(json!({ "pattern": pattern, "type": kind, "categoryId": cat, "isCaseInsensitive": true }))).await;
    }

    let (status, result) =
        call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() })))
            .await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["inserted"], 4);
    assert_eq!(result["skipped"], 0);
    let errors = result["errors"].as_array().unwrap();
    assert_eq!(errors.len(), 2);
    assert!(errors[0].as_str().unwrap().starts_with("Row 5:"));
    assert!(errors[1].as_str().unwrap().starts_with("Row 6:"));

    // Re-importing the same file inserts nothing.
    let (_, again) =
        call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() })))
            .await;
    assert_eq!(again["inserted"], 0);
    assert_eq!(again["skipped"], 4);

    // Duplicates inside one file are skipped, not an error.
    let twice = json!([
        { "Date": "2026-08-01", "Description": "Coffee", "Amount": "-3,50" },
        { "Date": "2026-08-01", "Description": "Coffee", "Amount": "-3,50" }
    ]);
    let (_, dup) =
        call(&app, "POST", "/api/import", Some(json!({ "rows": twice, "mapping": mapping() })))
            .await;
    assert_eq!((dup["inserted"].as_i64(), dup["skipped"].as_i64()), (Some(1), Some(1)));

    let (_, txs) = call(&app, "GET", "/api/transactions?from=2026-09-01&to=2026-10-31", None).await;
    let txs = txs.as_array().unwrap();
    assert_eq!(txs.len(), 4);
    assert_eq!(txs[0]["date"], "2026-10-02"); // newest first
    let by_desc = |d: &str| txs.iter().find(|t| t["description"] == d).unwrap().clone();
    assert_eq!(by_desc("BILLA DANKT 1100")["categoryId"], groceries.as_str());
    assert_eq!(by_desc("Spar Supermarkt")["categoryId"], groceries.as_str());
    assert_eq!(by_desc("Netflix")["categoryId"], streaming.as_str());
    assert_eq!(by_desc("Salary ACME GmbH")["categoryId"], Value::Null);
    assert_eq!(by_desc("Salary ACME GmbH")["amount"], 2500.0);
    assert_eq!(by_desc("Spar Supermarkt")["amount"], -12.8);
}

#[tokio::test]
async fn import_preview_reports_what_an_import_would_do() {
    let app = app().await;
    let groceries = create_category(&app, "Groceries", "#10b981").await;
    call(&app, "POST", "/api/rules", Some(json!({ "pattern": "billa", "type": "CONTAINS", "categoryId": groceries, "isCaseInsensitive": true }))).await;
    call(
        &app,
        "POST",
        "/api/import",
        Some(json!({
            "rows": [{ "Date": "2026-09-28", "Description": "Salary ACME GmbH", "Amount": "2.500,00" }],
            "mapping": mapping()
        })),
    )
    .await;

    let mut file = rows().as_array().unwrap().clone();
    file.push(
        json!({ "Date": "2026-09-03", "Description": "BILLA DANKT 1100", "Amount": "-42,10" }),
    );
    let (status, preview) = call(
        &app,
        "POST",
        "/api/import/preview",
        Some(json!({ "rows": file, "mapping": mapping() })),
    )
    .await;
    assert_eq!(status, StatusCode::OK, "{preview}");
    let parsed = preview["rows"].as_array().unwrap();
    let statuses: Vec<&str> = parsed.iter().map(|r| r["status"].as_str().unwrap()).collect();
    assert_eq!(statuses, ["new", "existing", "new", "new", "error", "error", "repeated"]);

    assert_eq!(parsed[0]["row"], 1);
    assert_eq!(parsed[0]["amount"], -42.1);
    assert_eq!(parsed[0]["currency"], "EUR");
    assert_eq!(parsed[0]["categoryId"], groceries.as_str());
    assert_eq!(parsed[2]["categoryId"], Value::Null);
    assert_eq!(parsed[3]["date"], "2026-10-02");
    assert_eq!(parsed[4]["row"], 5);
    assert!(parsed[4]["error"].as_str().unwrap().contains("Cannot parse date"));
    assert_eq!(
        preview["totals"],
        json!([{ "currency": "EUR", "income": 0.0, "expenses": -68.89 }])
    );
    assert_eq!(
        (preview["existingFrom"].as_str(), preview["existingTo"].as_str()),
        (Some("2026-09-28"), Some("2026-09-28"))
    );

    // A preview writes nothing.
    let (_, txs) = call(&app, "GET", "/api/transactions", None).await;
    assert_eq!(txs.as_array().unwrap().len(), 1);

    let mut m = mapping();
    m["amountColumn"] = Value::Null;
    let (status, _) =
        call(&app, "POST", "/api/import/preview", Some(json!({ "rows": rows(), "mapping": m })))
            .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn import_rejects_invalid_mapping() {
    let app = app().await;
    let mut m = mapping();
    m["amountColumn"] = Value::Null;
    let (status, body) =
        call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": m }))).await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(body["error"].as_str().unwrap().contains("amount column"));
}

#[tokio::test]
async fn transaction_filters_and_category_updates() {
    let app = app().await;
    let cat = create_category(&app, "Groceries", "#10b981").await;
    call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() }))).await;

    let count = |v: &Value| v.as_array().unwrap().len();
    let (_, all) = call(&app, "GET", "/api/transactions", None).await;
    assert_eq!(count(&all), 4);
    let (_, sept) =
        call(&app, "GET", "/api/transactions?from=2026-09-01&to=2026-09-30", None).await;
    assert_eq!(count(&sept), 2);
    let (_, inclusive) =
        call(&app, "GET", "/api/transactions?from=2026-10-02&to=2026-10-02", None).await;
    assert_eq!(count(&inclusive), 2);
    let (_, amount) = call(&app, "GET", "/api/transactions?amountMin=-13&amountMax=0", None).await;
    assert_eq!(count(&amount), 1);
    let (_, search) = call(&app, "GET", "/api/transactions?search=billa", None).await;
    assert_eq!(count(&search), 1);
    let (_, wildcard) = call(&app, "GET", "/api/transactions?search=%25", None).await;
    assert_eq!(count(&wildcard), 0);
    assert_eq!(
        call(&app, "GET", "/api/transactions?from=10/01/2026", None).await.0,
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        call(&app, "GET", "/api/transactions?amountMin=abc", None).await.0,
        StatusCode::BAD_REQUEST
    );

    let ids: Vec<String> =
        all.as_array().unwrap().iter().map(|t| t["id"].as_str().unwrap().to_owned()).collect();
    let (status, tx) = call(
        &app,
        "PATCH",
        &format!("/api/transactions/{}", ids[0]),
        Some(json!({ "categoryId": cat })),
    )
    .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(tx["categoryId"], cat.as_str());

    let unknown = call(
        &app,
        "PATCH",
        &format!("/api/transactions/{}", ids[0]),
        Some(json!({ "categoryId": "nope" })),
    )
    .await;
    assert_eq!(unknown.0, StatusCode::BAD_REQUEST);
    let missing =
        call(&app, "PATCH", "/api/transactions/nope", Some(json!({ "categoryId": null }))).await;
    assert_eq!(missing.0, StatusCode::NOT_FOUND);

    let (_, bulk) = call(
        &app,
        "POST",
        "/api/transactions/bulk-category",
        Some(json!({ "ids": ids, "categoryId": cat })),
    )
    .await;
    assert_eq!(bulk["updated"], 4);
    let (_, filtered) = call(&app, "GET", &format!("/api/transactions?cat={cat}"), None).await;
    assert_eq!(count(&filtered), 4);

    // Deleting the category keeps the transactions, uncategorized.
    call(&app, "DELETE", &format!("/api/categories/{cat}"), None).await;
    let (_, after) = call(&app, "GET", "/api/transactions", None).await;
    assert_eq!(count(&after), 4);
    assert!(after.as_array().unwrap().iter().all(|t| t["categoryId"].is_null()));
}

#[tokio::test]
async fn dashboard_aggregates() {
    let app = app().await;
    let groceries = create_category(&app, "Groceries", "#10b981").await;
    let streaming = create_category(&app, "Streaming", "#8b5cf6").await;
    create_category(&app, "Unused", "#000000").await;
    call(&app, "POST", "/api/rules", Some(json!({ "pattern": "billa", "type": "CONTAINS", "categoryId": groceries, "isCaseInsensitive": true }))).await;
    call(&app, "POST", "/api/rules", Some(json!({ "pattern": "netflix", "type": "CONTAINS", "categoryId": streaming, "isCaseInsensitive": true }))).await;
    call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() }))).await;

    let (status, d) = call(&app, "GET", "/api/dashboard", None).await;
    assert_eq!(status, StatusCode::OK, "{d}");
    assert_eq!(d["totalCount"], 4);
    assert_eq!(d["totalExpenses"], 68.89); // 42.10 + 12.80 + 13.99
    assert_eq!(d["totalIncome"], 2500.0);
    assert_eq!(d["netBalance"], 2431.11);
    assert_eq!(d["groupBy"], "month");

    let names: Vec<&str> =
        d["series"].as_array().unwrap().iter().map(|s| s["name"].as_str().unwrap()).collect();
    assert_eq!(names, ["Groceries", "Streaming", "Uncategorized"]);
    assert_eq!(d["pie"][0]["name"], "Groceries");
    assert_eq!(d["pie"][0]["value"], 42.1);

    let bar = d["bar"].as_array().unwrap();
    assert_eq!(bar.len(), 2);
    assert_eq!(bar[0]["period"], "2026-09");
    assert_eq!(bar[0][&groceries], 42.1);
    assert_eq!(bar[0][&streaming], 0.0);
    assert_eq!(bar[1]["__uncategorized__"], 12.8);
    assert_eq!(d["lineByYear"].as_array().unwrap().len(), 1);

    let (_, weekly) = call(&app, "GET", "/api/dashboard?groupBy=week", None).await;
    let periods: Vec<&str> =
        weekly["bar"].as_array().unwrap().iter().map(|p| p["period"].as_str().unwrap()).collect();
    assert_eq!(periods, ["2026-08-31", "2026-09-07", "2026-09-14", "2026-09-21", "2026-09-28"]);

    let (_, only) =
        call(&app, "GET", &format!("/api/dashboard?cat={streaming}&from=2026-10-01"), None).await;
    assert_eq!(only["totalExpenses"], 13.99);
    assert_eq!(only["series"].as_array().unwrap().len(), 1);
    assert_eq!(only["totalIncome"], 0.0);

    assert_eq!(
        call(&app, "GET", "/api/dashboard?groupBy=day", None).await.0,
        StatusCode::BAD_REQUEST
    );

    let (_, empty) = call(&app, "GET", "/api/dashboard?from=2030-01-01", None).await;
    assert_eq!(empty["bar"].as_array().unwrap().len(), 0);
    assert_eq!(empty["totalExpenses"], 0.0);
}

#[tokio::test]
async fn apply_rules_to_existing_transactions() {
    let app = app().await;
    // Import first, with no rules: everything is uncategorized.
    call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() }))).await;
    let groceries = create_category(&app, "Groceries", "#10b981").await;
    let streaming = create_category(&app, "Streaming", "#8b5cf6").await;
    let manual = create_category(&app, "Manual", "#000000").await;

    // A manual assignment that a rule would otherwise change.
    let (_, txs) = call(&app, "GET", "/api/transactions?search=netflix", None).await;
    let netflix_id = txs[0]["id"].as_str().unwrap().to_owned();
    call(
        &app,
        "PATCH",
        &format!("/api/transactions/{netflix_id}"),
        Some(json!({ "categoryId": manual })),
    )
    .await;

    for (pattern, cat) in [("billa", &groceries), ("spar", &groceries), ("netflix", &streaming)] {
        call(&app, "POST", "/api/rules", Some(json!({ "pattern": pattern, "type": "CONTAINS", "categoryId": cat, "isCaseInsensitive": true }))).await;
    }

    // Default: only uncategorized transactions; the manual choice is kept.
    let (status, result) = call(&app, "POST", "/api/rules/apply", Some(json!({}))).await;
    assert_eq!(status, StatusCode::OK, "{result}");
    assert_eq!(result["updated"], 2); // BILLA + Spar
    assert_eq!(result["checked"], 3); // all but the manually assigned Netflix
    let (_, netflix) = call(&app, "GET", "/api/transactions?search=netflix", None).await;
    assert_eq!(netflix[0]["categoryId"], manual.as_str());

    // Running it again is a no-op.
    let (_, again) = call(&app, "POST", "/api/rules/apply", Some(json!({}))).await;
    assert_eq!(again["updated"], 0);

    // Opt-in: re-categorize everything; unmatched transactions keep their category.
    let (_, all) =
        call(&app, "POST", "/api/rules/apply", Some(json!({ "includeCategorized": true }))).await;
    assert_eq!(all["updated"], 1);
    let (_, netflix) = call(&app, "GET", "/api/transactions?search=netflix", None).await;
    assert_eq!(netflix[0]["categoryId"], streaming.as_str());
    let (_, salary) = call(&app, "GET", "/api/transactions?search=salary", None).await;
    assert_eq!(salary[0]["categoryId"], Value::Null);
}

#[tokio::test]
async fn rule_preview_counts_what_a_new_rule_would_do() {
    let app = app().await;
    call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() }))).await;
    let groceries = create_category(&app, "Groceries", "#10b981").await;

    let preview = |pattern: &str, kind: &str| {
        let body = json!({ "pattern": pattern, "type": kind, "isCaseInsensitive": true });
        let app = app.clone();
        async move { call(&app, "POST", "/api/rules/preview", Some(body)).await }
    };

    let (status, p) = preview("  BILLA ", "CONTAINS").await;
    assert_eq!(status, StatusCode::OK, "{p}");
    assert_eq!(p["newMatches"], 1);
    assert_eq!(p["newMatchAmount"], -42.1);
    assert_eq!(p["shadowed"], 0);
    assert_eq!(p["newMatchIds"].as_array().unwrap().len(), 1);

    let (_, p) = preview("^(billa|spar)", "REGEX").await;
    assert_eq!(p["newMatches"], 2);

    // Matching nothing is fine; invalid input is a 400 like on create.
    assert_eq!(preview("zzz", "CONTAINS").await.1["newMatches"], 0);
    assert_eq!(preview("(unclosed", "REGEX").await.0, StatusCode::BAD_REQUEST);
    assert_eq!(preview("   ", "CONTAINS").await.0, StatusCode::BAD_REQUEST);

    // An existing (not yet applied) rule matching first makes rows "shadowed".
    call(&app, "POST", "/api/rules", Some(json!({ "pattern": "billa", "type": "CONTAINS", "categoryId": groceries, "isCaseInsensitive": true }))).await;
    let (_, p) = preview("billa", "CONTAINS").await;
    assert_eq!((p["newMatches"].as_i64(), p["shadowed"].as_i64()), (Some(0), Some(1)));

    // After applying, the row is categorized and reported per category.
    call(&app, "POST", "/api/rules/apply", Some(json!({}))).await;
    let (_, p) = preview("billa", "CONTAINS").await;
    assert_eq!(p["shadowed"], 0);
    assert_eq!(p["categorizedMatches"][0]["categoryId"], groceries.as_str());
    assert_eq!(p["categorizedMatches"][0]["count"], 1);
}

#[tokio::test]
async fn uncategorized_filter_and_stats() {
    let app = app().await;
    call(&app, "POST", "/api/import", Some(json!({ "rows": rows(), "mapping": mapping() }))).await;
    let cat = create_category(&app, "Groceries", "#10b981").await;
    let (_, all) = call(&app, "GET", "/api/transactions?search=billa", None).await;
    let billa = all[0]["id"].as_str().unwrap().to_owned();
    call(&app, "PATCH", &format!("/api/transactions/{billa}"), Some(json!({ "categoryId": cat })))
        .await;

    let count = |v: &Value| v.as_array().unwrap().len();
    let (_, unc) = call(&app, "GET", "/api/transactions?uncategorized=true", None).await;
    assert_eq!(count(&unc), 3);
    let (_, both) =
        call(&app, "GET", &format!("/api/transactions?uncategorized=true&cat={cat}"), None).await;
    assert_eq!(count(&both), 4);
    let (_, only_cat) = call(&app, "GET", &format!("/api/transactions?cat={cat}"), None).await;
    assert_eq!(count(&only_cat), 1);
    assert_eq!(
        call(&app, "GET", "/api/transactions?uncategorized=maybe", None).await.0,
        StatusCode::BAD_REQUEST
    );

    let (status, stats) = call(&app, "GET", "/api/transactions/stats", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!((stats["total"].as_i64(), stats["uncategorized"].as_i64()), (Some(4), Some(3)));
}
