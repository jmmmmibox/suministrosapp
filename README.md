# Suministros App

PWA para controlar contratos, suministros, suscripciones, gastos e ingresos por propiedad (tu casa, otro piso, "Personal"), con avisos de vencimiento/permanencia, documentos (PDF) y comparador de ofertas.

**Stack:** HTML + JS (módulos ES, sin build) · Supabase (Postgres, Auth, Storage) · Netlify.

## Puesta en marcha

1. **Base de datos:** en Supabase → *SQL Editor* → pega `schema.sql` completo y ejecuta (se puede repetir sin problema).
2. **Usuario:** abre la app y pulsa *Crear cuenta nueva* (email + contraseña). Confirma el email si Supabase lo pide.
   Después, en Supabase → *Authentication → Sign In / Providers*, **desactiva "Allow new users to sign up"** para que solo entres tú.
3. **Configuración:** `js/config.js` ya apunta a tu proyecto (URL + clave *publishable*, segura en el frontend gracias a RLS).
4. **Probar en local:** `npx serve .` (o cualquier servidor estático) y abre `http://localhost:3000`.
5. **Desplegar:** Netlify → *Add new site* → importa el repo de GitHub (sin comando de build, directorio `.`).

## Migraciones

Si ya tenías la base de datos creada, ejecuta en el SQL Editor los archivos de `migrations/` que falten, en orden. `schema.sql` ya los incluye para instalaciones nuevas.

- `001_paid_by.sql`: campo "Quién lo paga" (yo / inquilino) en contratos y gastos.

## Estructura

| Ruta | Contenido |
|---|---|
| `schema.sql` | Tablas, seguridad por fila (RLS) y bucket privado `documentos` |
| `js/calc.js` | Lógica pura: periodos, avisos, resúmenes, ahorro, CSV |
| `js/db.js` | Cliente Supabase, estado y CRUD, subida de documentos |
| `js/forms.js` · `js/views.js` · `js/ui.js` | Formularios, pantallas y componentes |
| `sw.js` · `manifest.webmanifest` | Instalable y abre sin conexión (los datos requieren red) |

## Pruebas

```
npm test                       # lógica de cálculo
npm i --no-save jsdom && node test/smoke.test.js   # recorrido de pantallas con Supabase simulado
```
