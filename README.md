# Pagos semanales — Panadería Avenida

Planilla de control interno para registrar los pagos semanales al personal.
Es una sola página HTML, sin servidor ni base de datos: se abre en el navegador
y funciona también desde el celular.

## Qué hace

- Semana de lunes a domingo, con flechas para moverse entre semanas.
- Ficha por empleado: sueldo semanal objetivo, lo entregado y lo que falta.
- Registro de cada entrega con fecha y medio (transferencia / efectivo).
- El objetivo semanal **se congela** al registrar el primer pago de esa semana,
  así un aumento de sueldo no reescribe el historial.
- Métricas: nómina sobre ventas, día en que se salda, entregas por empleado y
  porcentaje de semanas cerradas al día.
- Respaldo en JSON y exportación a CSV para abrir en Excel.

## Dónde se guardan los datos

En el `localStorage` **del navegador que se usa**. Eso significa:

- No hay cuenta ni login: quien abre el link ve su propia planilla vacía.
- Los datos **no se sincronizan** entre la compu y el celular, ni entre dos
  personas. Cada dispositivo lleva su propio registro.
- Si se borran los datos del navegador o se cambia de teléfono, se pierde todo.

Por eso: **descargar el respaldo seguido** (botón "Descargar respaldo") y
guardarlo en OneDrive o mandárselo por mail. Para pasarlo a otro dispositivo,
se usa "Cargar respaldo" con ese mismo archivo.

## Cómo se publica en Netlify

Opción A — conectado a GitHub (recomendado, se actualiza solo):

1. Subir este repo a GitHub.
2. En Netlify: *Add new site → Import an existing project → GitHub* y elegir el repo.
3. Build command: vacío. Publish directory: `.` (ya está en `netlify.toml`).
4. Deploy. Cada `git push` a `main` republica el sitio.

Opción B — arrastrar la carpeta:

1. Entrar a https://app.netlify.com/drop
2. Arrastrar esta carpeta. Listo, queda online.

## Cómo se edita

Todo el código está en `index.html` (estilos, HTML y JavaScript en el mismo
archivo, a propósito, para que se pueda abrir y tocar sin herramientas).

## Nota legal

Este registro es control interno y no reemplaza el recibo de sueldo. Los pagos
a cuenta deben figurar en el recibo del período y, según el art. 130 de la LCT,
los adelantos no pueden superar el 50% de la remuneración. Confirmar con el
contador cómo se documentan estas entregas.
