ALTER TABLE "report_exports"
  DROP CONSTRAINT "report_exports_format_check",
  ADD CONSTRAINT "report_exports_format_check"
    CHECK ("format" IN ('csv', 'xlsx', 'pdf'));
