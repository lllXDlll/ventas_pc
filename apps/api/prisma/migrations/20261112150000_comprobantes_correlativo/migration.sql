-- Números de comprobante correlativos XD-000001, XD-000002… (spec esquema-datos, design D3
-- del Sprint 4). Reemplaza el formato XD-AAAAMMDD-<id> del Sprint 3.
CREATE SEQUENCE "comprobante_numero_seq" AS BIGINT MINVALUE 1 START 1;

-- Renumeración por fecha. Primero a un valor temporal: así ningún número nuevo choca con
-- uno viejo en la restricción de unicidad.
UPDATE "comprobantes" SET "numero" = 'TMP-' || "id"::text;
UPDATE "comprobantes" AS c
   SET "numero" = 'XD-' || lpad(o.n::text, 6, '0')
  FROM (SELECT "id", row_number() OVER (ORDER BY "fecha", "id") AS n FROM "comprobantes") AS o
 WHERE c."id" = o."id";

-- La secuencia continúa en el último número usado (o empieza en 1 si no había ninguno).
SELECT setval(
  'comprobante_numero_seq',
  GREATEST((SELECT count(*) FROM "comprobantes"), 1),
  (SELECT count(*) FROM "comprobantes") > 0
);
