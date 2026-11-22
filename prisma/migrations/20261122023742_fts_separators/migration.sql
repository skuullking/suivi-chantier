-- Full-text search: punctuation inside references ("F-2026-990", "16/11/2026", "DUP-1") is turned into spaces,
-- otherwise the default parser produces signed numbers ("-2026") that prefix queries never match.
CREATE OR REPLACE FUNCTION search_tsv(txt text, w "char") RETURNS tsvector
  LANGUAGE sql IMMUTABLE PARALLEL SAFE
  AS $$ SELECT setweight(
    to_tsvector('simple', regexp_replace(immutable_unaccent(lower(coalesce(txt, ''))), '[-_/.:;,''"()°#+]+', ' ', 'g')),
    w
  ) $$;

-- Recompute the stored vectors (BEFORE UPDATE triggers).
UPDATE "Client" SET "name" = "name";
UPDATE "Site" SET "title" = "title";
UPDATE "Document" SET "name" = "name";
