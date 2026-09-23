# Filas nativas de comprobantes

Revisión UTC: 2026-09-23.

`table-row` mantiene el contrato v1 (`left`, `right`, `bold`, `align`). El bridge
usa `nativeTableRowLines` en vez de `tableCustom` de node-escpos, cuya medición
consideraba los caracteres latinos no ASCII como dobles y reservaba 65/35 %.

El perfil determina 32 o 48 columnas y la codificación nativa. Para las páginas
CP437/CP850/CP858 del catálogo, cada carácter codificado ocupa una celda. Se
normalizan espacios no separables y acentos compuestos. Se reserva el ancho del
importe y al menos un espacio; el nombre se envuelve por palabras. El importe
aparece una vez, a la derecha de la primera línea. Valores demasiado largos se
conservan en filas separadas. Las filas restablecen alineación izquierda, fuente
estándar y escala 1×1, y usan `printer.text()` para conservar la codificación.

La ruta bitmap de caracteres no representables conserva su implementación previa;
esta corrección cubre impresión nativa. Los perfiles personalizados multibyte
requieren validación con su modelo y su modo de caracteres.

Pruebas: bytes reales producidos por node-escpos con CP850/CP858 y 32/48 columnas,
acentos, fracciones, combos, nombres largos, continuación e importes grandes.
Pendiente: prueba física con el bridge actualizado. No cambia ninguna dependencia,
configuración persistida ni protocolo. El POS puede seguir enviando continuaciones
v1; el bridge actualizado no vuelve a aplicar el reparto fijo 65/35.