# Pagos semanales — Panadería Avenida

Planilla de control interno para registrar los pagos semanales al personal.
Es una página HTML que se abre en la compu o en el celular, y una función chica
que guarda la planilla compartida para que todos los que administran el negocio
vean lo mismo.

## Qué hace

Cuatro pestañas: **Sueldos** (lo que se le debe a cada uno y el registro de
pagos), **Caja** (facturación por turno, costos y neto), **Números** (los
indicadores de las últimas doce semanas) y **Ajustes** (plantel, sincronización
y respaldo). La semana queda fija arriba y vale para todas.

La semana de la panadería va de **domingo a sábado**, y se la nombra por la
fecha de su domingo (`2026-09-13`).

- Semana de lunes a domingo, con flechas para moverse entre semanas.
- Ficha por empleado: lo que le corresponde en la semana, lo entregado y lo que
  falta.
- Dos formas de pago: **sueldo fijo por semana**, o **por día trabajado** más un
  extra por día para el cole. En el segundo caso la semana sale de los días
  trabajados, que se marcan en la ficha semana por semana: hay gente que cubre
  turnos sueltos y no tiene días fijos.
- Registro de cada entrega con fecha y medio (transferencia / efectivo).
- La tarifa **se congela** al registrar el primer pago de la semana, así un
  aumento no reescribe el historial. Los días trabajados no se congelan: son un
  hecho de esa semana y se siguen marcando. Y un aumento cargado sobre una
  semana en la que esa persona ya cobró algo empieza a valer la semana
  siguiente, en lugar de reescribir lo que ya se pagó.
- Facturación por turno: al cierre de cada turno (mañana y tarde) se carga el
  monto y el total de la semana se suma solo.
- Costos generales de la semana, cargados uno por uno con su concepto.
- Neto de la semana: facturación menos sueldos menos costos. Los sueldos entran
  por lo que corresponde pagar, no por lo entregado, así atrasarse con un pago
  no mejora el neto.
- Métricas: nómina sobre ventas, día en que se salda, entregas por empleado y
  porcentaje de semanas cerradas al día.
- Respaldo en JSON y exportación a CSV para abrir en Excel.
- **Planilla compartida**: con la clave de la panadería, todos los dispositivos
  trabajan sobre los mismos datos.

## La planilla compartida

Cada dispositivo guarda todo primero en su propio navegador y después lo sube.
Si dos personas cargan algo casi al mismo tiempo, el servidor avisa que la
planilla cambió: el dispositivo se trae lo del otro y vuelve a aplicar sus
cambios encima. Nadie le pisa la carga a nadie, y si se corta internet los
cambios quedan en cola y se suben solos cuando vuelve.

Sin conectar, la app funciona igual que antes: los datos quedan solo en ese
navegador y nadie más los ve.

### Configurar la clave (una sola vez)

La clave **no está en el código**: se configura en Netlify, así el repo puede
ser público sin abrirle la planilla a cualquiera.

1. En Netlify: *Site configuration → Environment variables → Add a variable*
2. Key: `CLAVE_PANADERIA` — Value: una frase larga, no `1234`.
3. *Deploys → Trigger deploy* para que la función tome la variable.
4. En la app, abajo de todo, escribir esa misma clave en "Planilla compartida"
   y tocar Conectar. Se hace una vez por dispositivo.

Si la clave no está configurada, la función no guarda nada y la app lo avisa.
Para cambiarla después, se edita la variable y cada uno vuelve a conectarse.

### Dónde quedan los datos

En [Netlify Blobs](https://docs.netlify.com/blobs/overview/), un único documento
JSON asociado al sitio. Entra holgado en el plan gratuito. Igual conviene bajar
el respaldo cada tanto: es la copia que no depende de internet ni de la cuenta.

## Publicar en Netlify

1. Subir este repo a GitHub.
2. En Netlify: *Add new site → Import an existing project → GitHub* y elegir el repo.
3. Build command: vacío. Publish directory: `public`. Ya está todo en `netlify.toml`.
4. Configurar `CLAVE_PANADERIA` como se explica arriba.
5. Deploy. Después, cada `git push` a `main` republica el sitio solo.

Conviene ponerle un nombre lindo al sitio en *Site configuration → Change site
name*, y desde el celular usar "Agregar a pantalla de inicio" para tenerlo como
si fuera una app.

## Estructura

    public/index.html            la app entera: estilos, HTML y JavaScript juntos
    netlify/functions/datos.mjs  guarda y entrega la planilla compartida
    prueba/sincronizacion.mjs    pruebas de la sincronización
    prueba/funcion.mjs           pruebas de la clave y la ruta del backend
    netlify.toml                 configuración del sitio

Todo el frente está en un solo archivo a propósito: se abre, se lee y se toca
sin instalar nada.

## Pruebas

    npm test

Lo primero corre el mismo JavaScript de la página en dos dispositivos simulados
contra un servidor de mentira, y verifica los casos que importan: los dos
cargando pagos a la vez, un borrado que se propaga, un corte de internet con
reconexión y la restauración de un respaldo. Lo segundo revisa la función: que
sin `CLAVE_PANADERIA` no guarde nada y que una clave que no coincide no pase.

## Nota legal

Este registro es control interno y no reemplaza el recibo de sueldo. Los pagos
a cuenta deben figurar en el recibo del período y, según el art. 130 de la LCT,
los adelantos no pueden superar el 50% de la remuneración. Confirmar con el
contador cómo se documentan estas entregas.
